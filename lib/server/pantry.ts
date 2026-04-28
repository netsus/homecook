import type {
  PantryBundle,
  PantryBundleIngredient,
  PantryItem,
} from "@/types/pantry";

interface IngredientJoinRow {
  standard_name?: string | null;
  category?: string | null;
}

export interface PantryItemJoinedRow {
  id: string;
  ingredient_id: string;
  created_at: string;
  ingredients: IngredientJoinRow | IngredientJoinRow[] | null;
}

export interface IngredientRow {
  id: string;
  standard_name: string;
  category: string;
}

export interface PantryIngredientRow {
  ingredient_id: string;
}

export interface PantryBundleRow {
  id: string;
  name: string;
  display_order: number;
}

export interface PantryBundleItemJoinedRow {
  bundle_id: string;
  ingredient_id: string;
  ingredients:
    | Pick<IngredientRow, "standard_name">
    | Array<Pick<IngredientRow, "standard_name">>
    | null;
}

function firstJoin<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeIngredientIds(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const ids = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);

  return [...new Set(ids)];
}

export function toPantryItem(row: PantryItemJoinedRow): PantryItem {
  const ingredient = firstJoin(row.ingredients) ?? {};

  return {
    id: row.id,
    ingredient_id: row.ingredient_id,
    standard_name: ingredient.standard_name ?? "",
    category: ingredient.category ?? "",
    created_at: row.created_at,
  };
}

export function toPantryItems(rows: PantryItemJoinedRow[] | null | undefined) {
  return (rows ?? []).map((row) => toPantryItem(row));
}

function toBundleIngredient(
  row: PantryBundleItemJoinedRow,
  pantryIngredientIds: Set<string>,
): PantryBundleIngredient {
  const ingredient = firstJoin(row.ingredients);

  return {
    ingredient_id: row.ingredient_id,
    standard_name: ingredient?.standard_name ?? "",
    is_in_pantry: pantryIngredientIds.has(row.ingredient_id),
  };
}

export function buildPantryBundles({
  bundles,
  bundleItems,
  pantryItems,
}: {
  bundles: PantryBundleRow[];
  bundleItems: PantryBundleItemJoinedRow[];
  pantryItems: PantryIngredientRow[];
}) {
  const pantryIngredientIds = new Set(pantryItems.map((item) => item.ingredient_id));
  const itemsByBundleId = new Map<string, PantryBundleIngredient[]>();

  bundleItems.forEach((item) => {
    const items = itemsByBundleId.get(item.bundle_id) ?? [];
    items.push(toBundleIngredient(item, pantryIngredientIds));
    itemsByBundleId.set(item.bundle_id, items);
  });

  return [...bundles]
    .sort((left, right) => {
      if (left.display_order !== right.display_order) {
        return left.display_order - right.display_order;
      }

      return left.id.localeCompare(right.id);
    })
    .map((bundle) => ({
      id: bundle.id,
      name: bundle.name,
      display_order: bundle.display_order,
      ingredients: (itemsByBundleId.get(bundle.id) ?? []).sort((left, right) =>
        left.standard_name.localeCompare(right.standard_name, "ko-KR"),
      ),
    } satisfies PantryBundle));
}
