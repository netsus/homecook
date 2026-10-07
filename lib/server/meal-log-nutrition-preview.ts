import { isMealLogEntryId, isMealLogNutritionEvidence, type ParseResult } from "@/lib/server/meal-log";
import type { MealLogNutritionPreview, MealLogNutritionPreviewInput } from "@/types/meal-log-preview";

export function parseMealLogNutritionPreviewQuery(params: URLSearchParams): ParseResult<MealLogNutritionPreviewInput> {
  const keys = ["source_type", "source_id", "amount", "unit"];
  const type = params.get("source_type");
  const id = params.get("source_id");
  const raw = params.get("amount") ?? "";
  const amount = Number(raw);
  const unit = params.get("unit")?.trim() ?? "";
  if ([...params.keys()].some((key) => !keys.includes(key)) || keys.some((key) => params.getAll(key).length !== 1)
    || !["cooked_batch", "ingredient", "food_product"].includes(type ?? "") || !isMealLogEntryId(id)
    || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)
    || !Number.isFinite(amount) || amount <= 0 || unit.length === 0 || unit.length > 24) {
    return { ok: false, fields: [{ field: "query", reason: "invalid_source_quantity" }] };
  }
  return { ok: true, value: { source: { type: type as MealLogNutritionPreviewInput["source"]["type"], id: id.toLowerCase() }, quantity: { amount, unit } } };
}

export function projectMealLogNutritionPreview(value: unknown, input: MealLogNutritionPreviewInput): MealLogNutritionPreview | null {
  if (!isMealLogNutritionEvidence(value)) return null;
  return { ...input, nutrition: value };
}
