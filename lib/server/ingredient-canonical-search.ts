export const INGREDIENT_ALIAS_SEARCH_COLUMNS = "ingredient_id,representative_ingredient_id,representative_standard_name,representative_category,representative_category_code";
const PAGE_SIZE = 1000;

export interface CanonicalIngredient {
  id: string;
  standard_name: string;
  category: string;
  category_code: string | null;
}
export type IngredientAliases = ReadonlyMap<string, CanonicalIngredient>;

interface AliasQuery extends PromiseLike<{ data: unknown[] | null; error: unknown }> {
  order(column: string, options: { ascending: boolean }): AliasQuery;
  range(from: number, to: number): AliasQuery;
}
interface AliasClient {
  from(table: "ingredient_catalog_aliases"): { select(columns: string): AliasQuery };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Read only the existing reviewed catalog relation; never infer identity by name. */
export async function loadIngredientAliases(client: unknown): Promise<IngredientAliases> {
  const aliases = new Map<string, CanonicalIngredient>();
  const db = client as AliasClient;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await db.from("ingredient_catalog_aliases")
      .select(INGREDIENT_ALIAS_SEARCH_COLUMNS)
      .order("ingredient_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error || !Array.isArray(data)) throw new Error("Ingredient alias catalog is unavailable");
    for (const row of data) {
      if (!isRecord(row) || !nonempty(row.ingredient_id) || !nonempty(row.representative_ingredient_id)
        || row.ingredient_id === row.representative_ingredient_id
        || !nonempty(row.representative_standard_name) || !nonempty(row.representative_category)
        || (row.representative_category_code !== null && typeof row.representative_category_code !== "string")
        || aliases.has(row.ingredient_id)) {
        throw new Error("Ingredient alias catalog is invalid");
      }
      aliases.set(row.ingredient_id, {
        id: row.representative_ingredient_id,
        standard_name: row.representative_standard_name,
        category: row.representative_category,
        category_code: row.representative_category_code,
      });
    }
    if (data.length < PAGE_SIZE) break;
  }
  if ([...aliases.values()].some(row => aliases.has(row.id))) {
    throw new Error("Ingredient alias catalog contains a chain");
  }
  return aliases;
}

export function canonicalizeIngredient<T extends { id: string; standard_name: string }>(
  row: T,
  aliases: IngredientAliases,
): T {
  const representative = aliases.get(row.id);
  return representative ? { ...row, ...representative } : row;
}

/** Discovery includes old references; callers must not rewrite those stored rows. */
export function expandIngredientIdentityIds(ids: string[], aliases: IngredientAliases): string[] {
  const roots = new Set(ids.map(id => aliases.get(id)?.id ?? id));
  const expanded = new Set([...ids, ...roots]);
  for (const [aliasId, representative] of aliases) {
    if (roots.has(representative.id)) expanded.add(aliasId);
  }
  return [...expanded];
}
