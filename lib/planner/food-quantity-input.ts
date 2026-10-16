import type { IngredientQuantityOptions } from "@/types/quantity-input";

const MASS: Record<string, number> = { g: 1, kg: 1_000 };
const VOLUME: Record<string, number> = { ml: 1, mL: 1, l: 1_000, L: 1_000,
  "계량큰술": 15, "계량작은술": 5, "계량컵(200mL)": 200 };

/** A raw volume can be valid even when nutrition needs an unavailable density. */
export function convertIngredientInputAmount(
  amount: number,
  unit: string,
  targetUnit: string,
  options?: IngredientQuantityOptions,
): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (unit === targetUnit) return amount;
  for (const family of [MASS, VOLUME]) {
    if (family[unit] && family[targetUnit]) return amount * family[unit] / family[targetUnit];
  }
  const from = options?.choices.find(choice => choice.unit === unit)?.normalized;
  const to = options?.choices.find(choice => choice.unit === targetUnit)?.normalized;
  if (!from || !to || from.unit !== to.unit || from.amount <= 0 || to.amount <= 0) return null;
  const converted = amount * from.amount / to.amount;
  return Number.isFinite(converted) && converted > 0 ? converted : null;
}

export function ingredientInputUnits(options?: IngredientQuantityOptions): string[] {
  return options ? options.choices.map(choice => choice.unit) : ["g", "kg"];
}

export function ingredientInputDefaultUnit(options?: IngredientQuantityOptions): string {
  return options?.default_unit ?? "g";
}
