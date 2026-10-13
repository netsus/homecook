import { isMealLogEntryId, isMealLogNutritionEvidence, type ParseResult } from "@/lib/server/meal-log";
import type { MealLogNutritionPreview, MealLogNutritionPreviewInput } from "@/types/meal-log-preview";
import { isQuantityInputDraft } from "@/lib/quantity-input";
import { QUANTITY_INPUT_VERSION, type QuantityInputDraft } from "@/types/quantity-input";

export function parseMealLogNutritionPreviewQuery(params: URLSearchParams, quantityV4 = false): ParseResult<MealLogNutritionPreviewInput> {
  const keys = ["source_type", "source_id", "amount", "unit"];
  const optional = quantityV4 ? ["raw_value", "raw_unit", "expected_batch_revision", "expected_product_nutrition_version_id"] : [];
  const type = params.get("source_type");
  const id = params.get("source_id");
  const raw = params.get("amount") ?? "";
  const amount = Number(raw);
  const unit = params.get("unit")?.trim() ?? "";
  if ([...params.keys()].some((key) => ![...keys, ...optional].includes(key)) || keys.some((key) => params.getAll(key).length !== 1)
    || optional.some(key => params.getAll(key).length > 1)
    || !["cooked_batch", "ingredient", "food_product"].includes(type ?? "") || !isMealLogEntryId(id)
    || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)
    || !Number.isFinite(amount) || amount <= 0 || unit.length === 0 || unit.length > 24) {
    return { ok: false, fields: [{ field: "query", reason: "invalid_source_quantity" }] };
  }
  let quantityInput: QuantityInputDraft | undefined;
  if (params.has("raw_value") || params.has("raw_unit") || params.has("expected_batch_revision") || params.has("expected_product_nutrition_version_id")) {
    quantityInput = { schema_version: QUANTITY_INPUT_VERSION, raw_value: params.get("raw_value") ?? "", raw_unit: params.get("raw_unit") ?? unit };
    if (params.has("expected_batch_revision")) quantityInput.expected_batch_revision = Number(params.get("expected_batch_revision"));
    if (params.has("expected_product_nutrition_version_id")) quantityInput.expected_product_nutrition_version_id = params.get("expected_product_nutrition_version_id")!;
    if (!isQuantityInputDraft(quantityInput, { amount, unit })
      || ("expected_batch_revision" in quantityInput && type !== "cooked_batch")
      || ("expected_product_nutrition_version_id" in quantityInput && type !== "food_product")) {
      return { ok: false, fields: [{ field: "quantity_input", reason: "invalid_raw_quantity" }] };
    }
  }
  const value: MealLogNutritionPreviewInput = { source: { type: type as MealLogNutritionPreviewInput["source"]["type"], id: id.toLowerCase() }, quantity: { amount, unit } };
  if (quantityInput) value.quantityInput = quantityInput;
  return { ok: true, value };
}

export function projectMealLogNutritionPreview(value: unknown, input: MealLogNutritionPreviewInput): MealLogNutritionPreview | null {
  if (!isMealLogNutritionEvidence(value)) return null;
  return { ...input, nutrition: value };
}
