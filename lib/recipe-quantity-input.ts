import { formatProductUnit } from "@/lib/planner/product-planner-entry-presentation";
import { convertProductQuantity } from "@/lib/nutrition/product-quantity";
import { convertIngredientInputAmount } from "@/lib/planner/food-quantity-input";
import { isQuantityInputSnapshot, parseQuantityInput } from "@/lib/quantity-input";
import type { FoodProductData } from "@/types/food-product";
import { FOOD_PRODUCT_BASIS_UNITS } from "@/types/food-product";
import type { RecipeIngredientQuantityContext, RecipeQuantityInputDraft, RecipeQuantityInputSnapshot } from "@/types/recipe";
import { QUANTITY_INPUT_VERSION, type IngredientQuantityOptions } from "@/types/quantity-input";

interface RecipeQuantityRow {
  amount: number | null;
  unit: string | null;
  quantity_input?: RecipeQuantityInputDraft | null;
  food_product_id?: string | null;
  food_product_nutrition_version_id?: string | null;
}

/** Read the saved recipe proof only; never resolve it against current evidence. */
export function readRecipeQuantityInputSnapshot(
  value: unknown,
  row: Pick<RecipeQuantityRow, "amount" | "unit" | "food_product_id" | "food_product_nutrition_version_id">,
): RecipeQuantityInputSnapshot | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "object" || Array.isArray(value) || !("context_sha256" in value)
    || typeof value.context_sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(value.context_sha256)) {
    throw new Error("INVALID_RECIPE_QUANTITY_SNAPSHOT");
  }
  const { context_sha256, ...snapshot } = value;
  if (!isQuantityInputSnapshot(snapshot, typeof row.amount === "number" && row.unit
    ? { amount: row.amount, unit: row.unit } : undefined)
    || snapshot.batch_basis !== null
    || row.food_product_id && (snapshot.source_versions.length !== 1 || snapshot.source_versions[0] !== row.food_product_nutrition_version_id)) {
    throw new Error("INVALID_RECIPE_QUANTITY_SNAPSHOT");
  }
  return { ...snapshot, context_sha256 };
}

function inputFor(row: RecipeQuantityRow, text: string, contextSha256?: string): RecipeQuantityInputDraft {
  const input: RecipeQuantityInputDraft = {
    schema_version: QUANTITY_INPUT_VERSION,
    raw_value: text,
    raw_unit: row.unit ?? "g",
  };
  if (contextSha256) input.expected_context_sha256 = contextSha256;
  if (row.food_product_id && row.food_product_nutrition_version_id) {
    input.expected_product_nutrition_version_id = row.food_product_nutrition_version_id;
  }
  return input;
}

/** Display quantity and original text can have different units after conversion. */
export function recipeQuantityText(row: RecipeQuantityRow): string {
  if (row.quantity_input?.raw_unit === row.unit) return row.quantity_input.raw_value;
  return row.amount === null ? "" : String(row.amount);
}

export function updateRecipeQuantityText<T extends RecipeQuantityRow>(row: T, text: string, contextSha256?: string): T {
  return { ...row, amount: parseQuantityInput(text)?.amount ?? null, quantity_input: inputFor(row, text, contextSha256) };
}

export function recipeQuantityUnits(row: RecipeQuantityRow, context?: RecipeIngredientQuantityContext): string[] {
  let units: string[] = [];
  if (row.food_product_id && context?.product?.id === row.food_product_id
    && context.product.nutrition_version_id === row.food_product_nutrition_version_id) {
    const product = context.product;
    units = FOOD_PRODUCT_BASIS_UNITS.filter(unit => convertProductQuantity(1, unit, product.basis_unit, product.basis_relations) !== null);
    if (units.includes("g")) units.push("kg");
    if (units.includes("ml")) units.push("L");
  } else if (!row.food_product_id && context?.options) {
    units = context.options.choices.map(choice => choice.unit);
  } else if (!row.food_product_id && context?.raw_default_unit) {
    // Direct mass/volume families remain usable without a nutrition profile.
    // Conversion between the families still needs evidence in the resolver.
    units = ["g", "kg", "mL", "L"];
  }
  if (row.unit && !units.includes(row.unit)) units.unshift(row.unit);
  return units;
}

/** Only existing resolvers decide conversion; this helper preserves editor state. */
export function changeRecipeQuantityUnit<T extends RecipeQuantityRow>(
  row: T,
  unit: string,
  context: {
    ingredientOptions?: IngredientQuantityOptions;
    product?: Pick<FoodProductData, "id" | "nutrition_version_id" | "basis_relations">;
    recordInput?: boolean;
    contextSha256?: string;
  },
): { ok: true; ingredient: T } | { ok: false; message: string } {
  if (row.unit === unit) return { ok: true, ingredient: row };
  if (row.quantity_input?.expected_context_sha256 && context.contextSha256
    && row.quantity_input.expected_context_sha256 !== context.contextSha256) {
    return { ok: false, message: "입력 근거가 달라졌어요. 기존 분량과 단위를 유지했으니 원입력을 다시 확인해 주세요." };
  }
  if (row.amount === null && !row.quantity_input?.raw_value) {
    const ingredient = { ...row, unit };
    delete ingredient.quantity_input;
    return { ok: true, ingredient };
  }
  const product = context.product;
  const amount = row.amount !== null && row.unit
    ? row.food_product_id
      ? product?.id === row.food_product_id && product.nutrition_version_id === row.food_product_nutrition_version_id
        ? convertProductQuantity(row.amount, row.unit, unit, product.basis_relations) : null
      : convertIngredientInputAmount(row.amount, row.unit, unit, context.ingredientOptions)
    : null;
  if (amount === null) {
    return { ok: false, message: "단위 전환 근거를 확인하지 못해 기존 분량과 단위를 유지했어요." };
  }
  const ingredient = { ...row, amount, unit };
  if (context.recordInput !== false || row.quantity_input !== undefined) {
    ingredient.quantity_input = row.quantity_input ?? inputFor(row, String(row.amount), context.contextSha256);
  }
  return { ok: true, ingredient };
}

/** Draft storage may retain blank/invalid text; it never retains computed evidence. */
export function isRecipeQuantityInputState(value: unknown, version?: string | null): value is RecipeQuantityInputDraft | null {
  if (value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.some(key => !["schema_version", "raw_value", "raw_unit", "expected_product_nutrition_version_id", "expected_context_sha256"].includes(key))
    || !("schema_version" in value) || value.schema_version !== "quantity-v4"
    || !("raw_value" in value) || typeof value.raw_value !== "string" || value.raw_value.length > 64
    || !("raw_unit" in value) || typeof value.raw_unit !== "string" || !value.raw_unit || value.raw_unit.length > 24) return false;
  if ("expected_context_sha256" in value && (typeof value.expected_context_sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(value.expected_context_sha256))) return false;
  return version ? "expected_product_nutrition_version_id" in value && value.expected_product_nutrition_version_id === version
    : !("expected_product_nutrition_version_id" in value);
}

export function recipeQuantityContextNeedsConfirmation(row: RecipeQuantityRow, context?: RecipeIngredientQuantityContext) {
  return Boolean(row.quantity_input && (!context?.ready
    || row.quantity_input.expected_context_sha256 !== context.context_sha256));
}

export function recipeRawQuantityLabel(input: { raw_value: string; raw_unit: string }) {
  const unit = input.raw_unit;
  return `${input.raw_value}${unit === "g" || unit === "ml" || unit === "serving" || unit === "package" ? formatProductUnit(unit) : unit}`;
}
