import { convertProductQuantity, productQuantityConversionPath, productQuantityDecimalRatio as decimalRatio, type ProductBasisRelation } from "@/lib/nutrition/product-quantity";
import type { RecipeProductNutritionClient } from "@/lib/server/recipe-product-nutrition";

export interface ProductQuantityContext {
  basis: { amount: number; unit: string };
  basis_relations: ProductBasisRelation[];
}
export interface ProductAmount { amount: number; unit: string; scale?: Array<{ numerator: number; denominator: number }> }
export { scaleProductAmount } from "@/lib/nutrition/product-quantity";
export function productVersionKey(product: string, version: string) { return `${product}:${version}`; }

function parseContext(value: unknown): ProductQuantityContext | null {
  if (!value || typeof value !== "object" || !("basis" in value) || !("basis_relations" in value)) return null;
  const basis = value.basis;
  if (!basis || typeof basis !== "object" || !("amount" in basis) || !("unit" in basis)
    || typeof basis.amount !== "number" || !Number.isFinite(basis.amount) || basis.amount <= 0
    || typeof basis.unit !== "string" || !["g", "ml", "serving", "package"].includes(basis.unit)
    || !Array.isArray(value.basis_relations)) return null;
  const relations: ProductBasisRelation[] = [];
  for (const relation of value.basis_relations) {
    if (!relation || typeof relation.from?.amount !== "number" || typeof relation.to?.amount !== "number"
      || typeof relation.from?.unit !== "string" || typeof relation.to?.unit !== "string") return null;
    relations.push(relation);
  }
  return { basis: { amount: basis.amount, unit: basis.unit }, basis_relations: relations };
}

/** Existing authenticated RPC; each context is from the exact immutable version. */
export async function readProductQuantityContexts(client: Partial<RecipeProductNutritionClient>, owner: string,
  pins: Array<{ food_product_id?: string | null; food_product_nutrition_version_id?: string | null }>) {
  const keys = new Map<string, { product: string; version: string }>();
  for (const row of pins) if (row.food_product_id && row.food_product_nutrition_version_id) {
    keys.set(productVersionKey(row.food_product_id, row.food_product_nutrition_version_id), { product: row.food_product_id, version: row.food_product_nutrition_version_id });
  }
  const contexts = new Map<string, ProductQuantityContext | null>();
  if (!keys.size || !client.rpc) return contexts;
  const ingredients = [...keys].map(([id, pin]) => ({ id, ingredient_id: null, food_product_id: pin.product, food_product_nutrition_version_id: pin.version }));
  const result = await client.rpc("read_recipe_product_nutrition_predecessors", { p_owner_uuid: owner, p_ingredients: ingredients });
  if (result.error || !Array.isArray(result.data) || result.data.length !== ingredients.length) throw new Error("RECIPE_PRODUCT_QUANTITY_READ_FAILED");
  for (const [index, row] of result.data.entries()) {
    if (!row || row.id !== ingredients[index].id) throw new Error("RECIPE_PRODUCT_QUANTITY_READ_FAILED");
    contexts.set(row.id, parseContext(row.unit_context));
  }
  return contexts;
}

export function productPurchaseSuggestion(amounts: ProductAmount[], context?: ProductQuantityContext | null) {
  if (!context || !amounts.length || amounts.length > 200) return null;
  const packageBasis = convertProductQuantity(context.basis.amount, context.basis.unit, "package", context.basis_relations);
  if (packageBasis === null) return null;
  let numerator = BigInt(0);
  let denominator = BigInt(1);
  for (const row of amounts) {
    const count = convertProductQuantity(row.amount, row.unit, "package", context.basis_relations);
    if (count === null) return null;
    const quantity = decimalRatio(row.amount);
    if (row.scale !== undefined) {
      if (!Array.isArray(row.scale) || row.scale.length > 2) return null;
      for (const factor of row.scale) {
        if (!factor || !Number.isSafeInteger(factor.numerator) || !Number.isSafeInteger(factor.denominator)
          || factor.numerator <= 0 || factor.denominator <= 0) return null;
        quantity.numerator *= BigInt(factor.numerator);
        quantity.denominator *= BigInt(factor.denominator);
      }
    }
    const unit = row.unit === "kg" ? "g" : ["l", "L", "mL"].includes(row.unit) ? "ml" : row.unit;
    if (["kg", "l", "L"].includes(row.unit)) quantity.numerator *= BigInt(1000);
    if (unit !== "package") {
      const path = productQuantityConversionPath(unit, "package", context.basis_relations);
      if (!path) return null;
      for (const relation of path) {
        const from = decimalRatio(relation.from.amount);
        const to = decimalRatio(relation.to.amount);
        quantity.numerator *= to.numerator * from.denominator;
        quantity.denominator *= to.denominator * from.numerator;
      }
    }
    numerator = numerator * quantity.denominator + quantity.numerator * denominator;
    denominator *= quantity.denominator;
    const divisor = greatestCommonDivisor(numerator, denominator);
    numerator /= divisor;
    denominator /= divisor;
    if (numerator.toString().length > 4096 || denominator.toString().length > 4096) return null;
  }
  const count = Number((numerator + denominator - BigInt(1)) / denominator);
  return Number.isSafeInteger(count) && count > 0 ? { amount: count, unit: "package" as const } : null;
}


function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  while (right) { const remainder = left % right; left = right; right = remainder; }
  return left;
}

interface PurchaseRecipePin {
  recipe_id: string;
  recipe_content_snapshot_id?: string | null;
  shopping_servings: number;
  recipe_content_snapshots?: { base_servings?: unknown; ingredients_json?: unknown } | Array<{ base_servings?: unknown; ingredients_json?: unknown }> | null;
}
/** Read-only reference quantities from the owned list's immutable pins. */
export function shoppingProductPurchaseAmounts(recipes: PurchaseRecipePin[], meals: Array<{ recipe_id: string; recipe_content_snapshot_id: string | null }>) {
  const amounts = new Map<string, ProductAmount[] | null>();
  for (const recipe of recipes) {
    const snapshot = Array.isArray(recipe.recipe_content_snapshots) ? recipe.recipe_content_snapshots[0] : recipe.recipe_content_snapshots;
    if (!recipe.recipe_content_snapshot_id || !snapshot || typeof snapshot.base_servings !== "number"
      || !Number.isSafeInteger(snapshot.base_servings) || snapshot.base_servings <= 0
      || !Number.isSafeInteger(recipe.shopping_servings) || recipe.shopping_servings <= 0
      || !Array.isArray(snapshot.ingredients_json)) return new Map<string, ProductAmount[] | null>();
    const fixedCount = meals.filter((meal) => meal.recipe_id === recipe.recipe_id && meal.recipe_content_snapshot_id === recipe.recipe_content_snapshot_id).length;
    for (const row of snapshot.ingredients_json) {
      if (!row || typeof row !== "object" || typeof row.food_product_id !== "string" || typeof row.food_product_nutrition_version_id !== "string") continue;
      const key = productVersionKey(row.food_product_id,row.food_product_nutrition_version_id);
      if (amounts.get(key) === null) continue;
      if (typeof row.amount !== "number" || !Number.isFinite(row.amount) || row.amount <= 0 || typeof row.unit !== "string"
        || row.ingredient_type !== "QUANT" || (row.scalable === false && fixedCount < 1)) { amounts.set(key,null); continue; }
      const terms = amounts.get(key) ?? [];
      if (terms.length >= 200) { amounts.set(key,null); continue; }
      terms.push({amount:row.amount,unit:row.unit,scale:[row.scalable === false
        ? {numerator:fixedCount,denominator:1} : {numerator:recipe.shopping_servings,denominator:snapshot.base_servings}]});
      amounts.set(key,terms);
    }
  }
  return amounts;
}
