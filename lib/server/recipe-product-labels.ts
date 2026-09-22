interface ProductIngredientRow {
  food_product_id?: string | null;
  food_product_name?: string | null;
  food_product_brand?: string | null;
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
  return rows.map((row) => {
    const product = row.food_product_id ? byId.get(row.food_product_id) : null;
    return product ? { ...row, food_product_name: product.name, food_product_brand: product.brand } : row;
  });
}
