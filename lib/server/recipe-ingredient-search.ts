import { canonicalizeIngredient, expandIngredientIdentityIds, loadIngredientAliases } from "@/lib/server/ingredient-canonical-search";
import { ingredientSearchPattern, normalizeIngredientSearchName } from "@/lib/ingredient-search";

const PAGE_SIZE = 1000;
const ID_BATCH_SIZE = 100;
const INGREDIENT_COLUMNS = "id,standard_name,category,category_code";
const SYNONYM_COLUMNS = `ingredient_id,synonym,ingredients!inner(${INGREDIENT_COLUMNS})`;
// Discovery groups only: never merge ingredient IDs or nutrition profiles.
const PORK_CUT_NAMES = [
  "삼겹살", "오겹살", "목살", "항정살", "가브리살",
  "돼지앞다리살", "돼지뒷다리살", "돼지갈비", "돼지등심", "돼지안심",
];

interface Ingredient { id: string; standard_name: string; category: string; category_code?: string | null }
interface Synonym { ingredient_id: string; ingredients: Ingredient | Ingredient[] | null }
interface Match { recipe_id: string; ingredient_id: string }
interface Query<T> extends PromiseLike<{ data: T[] | null; error: unknown }> {
  in(column: string, values: string[]): Query<T>;
  like(column: string, value: string): Query<T>;
  order(column: string, options: { ascending: boolean }): Query<T>;
  range(from: number, to: number): Query<T>;
}
export interface RecipeIngredientSearchClient {
  from(table: "ingredients"): { select(columns: string): Query<Ingredient> };
  from(table: "ingredient_synonyms"): { select(columns: string): Query<Synonym> };
  from(table: "recipe_ingredients"): { select(columns: string): Query<Match> };
}

async function readPages<T>(build: () => Query<T>) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await build().range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data) throw new Error("Ingredient discovery lookup returned no data");
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

export function createRecipeIngredientSearch(
  catalog: RecipeIngredientSearchClient,
  recipes: RecipeIngredientSearchClient,
) {
  let aliasPromise: ReturnType<typeof loadIngredientAliases> | undefined;
  const readAliases = () => aliasPromise ??= loadIngredientAliases(catalog);
  const names = new Map<string, Promise<string[]>>();
  const matches = new Map<string, Promise<Match[]>>();

  function idsForName(name: string) {
    const key = normalizeIngredientSearchName(name);
    if (!key) return Promise.resolve([] as string[]);
    const pork = key === "돼지고기" || key === "돼지";
    const searchKey = pork ? "돼지고기" : key;
    if (!names.has(searchKey)) names.set(searchKey, (async () => {
      const pattern = ingredientSearchPattern(searchKey);
      const [direct, synonyms, cuts, aliases] = await Promise.all([
        readPages(() => catalog.from("ingredients").select(INGREDIENT_COLUMNS)
          .like("search_name", pattern).order("standard_name", { ascending: true }).order("id", { ascending: true })),
        readPages(() => catalog.from("ingredient_synonyms").select(SYNONYM_COLUMNS)
          .like("search_name", pattern).order("ingredient_id", { ascending: true }).order("id", { ascending: true })),
        pork ? readPages(() => catalog.from("ingredients").select(INGREDIENT_COLUMNS)
          .in("search_name", PORK_CUT_NAMES).order("standard_name", { ascending: true }).order("id", { ascending: true })) : [],
        readAliases(),
      ]);
      const candidates = [...direct, ...cuts, ...synonyms.flatMap((row) =>
        Array.isArray(row.ingredients) ? row.ingredients : row.ingredients ? [row.ingredients] : [])];
      return expandIngredientIdentityIds(candidates.filter((row) => {
        const canonical = canonicalizeIngredient(row, aliases);
        return !pork || canonical.category === "육류" || canonical.category_code === "pork_beef_lamb";
      }).map((row) => row.id), aliases);
    })());
    return names.get(searchKey)!;
  }

  function rowsForIds(ids: string[]) {
    const unique = [...new Set(ids)].sort();
    const key = unique.join(",");
    if (!matches.has(key)) matches.set(key, (async () => {
      const rows: Match[] = [];
      for (let i = 0; i < unique.length; i += ID_BATCH_SIZE) {
        rows.push(...await readPages(() => recipes.from("recipe_ingredients")
          .select("recipe_id,ingredient_id").in("ingredient_id", unique.slice(i, i + ID_BATCH_SIZE))
          .order("id", { ascending: true })));
      }
      return rows;
    })());
    return matches.get(key)!;
  }

  return {
    async search(query: string) {
      return [...new Set((await rowsForIds(await idsForName(query))).map((row) => row.recipe_id))];
    },
    async filter(selectedIds: string[]) {
      if (!selectedIds.length) return null;
      const selected: Ingredient[] = [];
      for (let i = 0; i < selectedIds.length; i += ID_BATCH_SIZE) {
        selected.push(...await readPages(() => catalog.from("ingredients").select(INGREDIENT_COLUMNS)
          .in("id", selectedIds.slice(i, i + ID_BATCH_SIZE))
          .order("standard_name", { ascending: true }).order("id", { ascending: true })));
      }
      const aliases = await readAliases();
      const groups = await Promise.all(selectedIds.map(async (id) => {
        const ingredient = selected.find((row) => row.id === id);
        return new Set(expandIngredientIdentityIds([id, ...(ingredient ? await idsForName(ingredient.standard_name) : [])], aliases));
      }));
      const rows = await rowsForIds(groups.flatMap((group) => [...group]));
      const byRecipe = new Map<string, Set<string>>();
      for (const row of rows) {
        const matched = byRecipe.get(row.recipe_id) ?? new Set<string>();
        matched.add(row.ingredient_id);
        byRecipe.set(row.recipe_id, matched);
      }
      // OR within each ingredient family; AND between the user's selections.
      return [...byRecipe].filter(([, ids]) => groups.every((group) => [...ids].some((id) => group.has(id))))
        .map(([id]) => id);
    },
  };
}
