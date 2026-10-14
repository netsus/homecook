import { isQuantityInputSnapshot, parseQuantityInput } from "@/lib/quantity-input";
import { convertIngredientInputAmount } from "@/lib/planner/food-quantity-input";
import type { IngredientQuantityOptions, QuantityInputDraft, QuantityInputSnapshot } from "@/types/quantity-input";

/** Preserve source fractions when they describe the current displayed unit. */
export function savedQuantityText(amount: number | null, unit: string | null, input?: QuantityInputDraft | QuantityInputSnapshot | null): string {
  if (input && input.raw_unit === unit && parseQuantityInput(input.raw_value)) return input.raw_value;
  return amount === null ? "" : String(amount);
}

export function savedQuantitySnapshot(input: unknown, amount: number | null, unit: string | null): QuantityInputSnapshot | null {
  return amount !== null && unit !== null && isQuantityInputSnapshot(input, { amount, unit }) ? input : null;
}

/** Reuse reviewed choices; a failed conversion leaves the current row intact. */
export function switchSavedQuantityUnit(amount: number | null, unit: string | null, target: string, options?: IngredientQuantityOptions | null): number | null {
  if (amount === null || unit === null) return null;
  const converted = convertIngredientInputAmount(amount, unit, target, options ?? undefined);
  return converted !== null && Number.isFinite(converted) && converted > 0 ? converted : null;
}
