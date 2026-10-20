import { parseQuantityInput } from "@/lib/quantity-input";
import type { CookingModeIngredient } from "@/types/cooking";

export function executionQuantityText(row: CookingModeIngredient): string {
  if (row.amount === null) return "";
  const original = row.quantity_input;
  if (original?.raw_unit === row.unit && parseQuantityInput(original.raw_value)?.amount === row.amount) return original.raw_value;
  // Avoid turning repeating fractions into rounded decimal inputs on reopening.
  const decimal = String(row.amount);
  if (!Number.isInteger(row.amount)) {
    for (let denominator = 2; denominator <= 1000; denominator += 1) {
      const numerator = Math.round(row.amount * denominator);
      if (numerator / denominator === row.amount && (decimal.length > 10 || numerator <= 20 && denominator <= 20)) return `${numerator}/${denominator}`;
    }
  }
  return decimal;
}

