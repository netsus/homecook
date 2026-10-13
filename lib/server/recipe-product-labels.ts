interface ProductIngredientRow {
  id?: string;
  ingredient_id?: string | null;
  food_product_id?: string | null;
  food_product_nutrition_version_id?: string | null;
  food_product_name?: string | null;
  food_product_brand?: string | null;
}
interface PublicRecipeProductClient {
  rpc(name: "read_public_recipe_product_sources", args: { p_recipe_id: string }): PromiseLike<{
    data: unknown; error: unknown;
  }>;
}

export async function readPublicRecipeProductLabels<T extends ProductIngredientRow>(
  client: PublicRecipeProductClient, recipeId: string, rows: T[],
): Promise<T[]> {
  const result = await client.rpc("read_public_recipe_product_sources", { p_recipe_id: recipeId });
  if (result.error || !Array.isArray(result.data)) throw new Error("RECIPE_PRODUCT_LABEL_READ_FAILED");
  const byRow = new Map<string, { food_product_id: string; food_product_nutrition_version_id: string; food_product_name: string; food_product_brand: string | null }>();
  for (const item of result.data) {
    if (!item || typeof item.row_key !== "string" || typeof item.food_product_id !== "string"
      || typeof item.food_product_nutrition_version_id !== "string"
      || typeof item.food_product_name !== "string" || (item.food_product_brand !== null && typeof item.food_product_brand !== "string")) {
      throw new Error("RECIPE_PRODUCT_LABEL_READ_FAILED");
    }
    byRow.set(item.row_key, item);
  }
  return rows.map((row) => {
    const label = row.id ? byRow.get(row.id) : null;
    if (!label) {
      if (row.food_product_id || row.ingredient_id === null) throw new Error("RECIPE_PRODUCT_LABEL_READ_FAILED");
      return row;
    }
    if ((row.food_product_id && label.food_product_id !== row.food_product_id)
      || (row.food_product_nutrition_version_id && label.food_product_nutrition_version_id !== row.food_product_nutrition_version_id)) {
      throw new Error("RECIPE_PRODUCT_LABEL_READ_FAILED");
    }
    return { ...row, source_kind: "food_product", row_key: row.id, food_product_id: label.food_product_id, food_product_nutrition_version_id: label.food_product_nutrition_version_id, food_product_name: label.food_product_name, food_product_brand: label.food_product_brand };
  });
}
interface ProductLabelClient {
  from(table: "food_products"): {
    select(columns: string): {
      in(column: "id", values: string[]): PromiseLike<{
        data: Array<{ id: string; name: string; brand: string | null }> | null;
        error: unknown;
      }>;
    };
  };
}

export function recipeProductLabel(row: ProductIngredientRow) {
  return row.food_product_id && row.food_product_name
    ? [row.food_product_brand, row.food_product_name].filter(Boolean).join(" · ")
    : null;
}

// Use only the authenticated request client: the product's RLS still controls
// names. Generic ingredients do not add a query, and invisible products do not
// disclose their names through a service-role lookup.
export async function readRecipeProductLabels<T extends ProductIngredientRow>(
  requestClient: unknown,
  rows: T[],
): Promise<T[]> {
  const ids = [...new Set(rows.flatMap((row) => row.food_product_id ? [row.food_product_id] : []))];
  if (ids.length === 0) return rows;
  const result = await (requestClient as ProductLabelClient).from("food_products")
    .select("id, name, brand").in("id", ids);
  if (result.error || !result.data) throw new Error("RECIPE_PRODUCT_LABEL_READ_FAILED");
  const byId = new Map(result.data.map((row) => [row.id, row]));
  if (ids.some((id) => !byId.has(id))) throw new Error("RECIPE_PRODUCT_LABEL_READ_FAILED");
  return rows.map((row) => {
    const product = row.food_product_id ? byId.get(row.food_product_id) : null;
    return product ? { ...row, food_product_name: product.name, food_product_brand: product.brand } : row;
  });
}
