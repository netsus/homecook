import type { MealLogNutritionEvidence } from "@/types/meal-log";

export const MEAL_LOG_MACROS = [
  { key: "carbohydrate_g", label: "탄수화물", short: "탄", factor: 4, color: "#94C9FF" },
  { key: "protein_g", label: "단백질", short: "단", factor: 4, color: "#FFA7C2" },
  { key: "fat_g", label: "지방", short: "지", factor: 9, color: "#FFD477" },
] as const;
export type MealLogMetric = "calories_kcal" | typeof MEAL_LOG_MACROS[number]["key"];
export const formatMealLogNumber = (value: number | null) => value === null || !Number.isFinite(value) ? "정보 없음" : Math.round(value).toLocaleString("ko-KR");

/** Provenance is independent of coverage and of quantity-conversion estimates. */
export function mealLogNutritionNotice(nutrition: MealLogNutritionEvidence): string | null {
  if (nutrition.contains_ai_estimate === true) {
    return nutrition.calculation_status === "complete"
      ? "AI 추정값 포함"
      : "AI 추정값 포함 · 일부 영양정보가 빠진 추정값";
  }
  return nutrition.calculation_status !== "complete" ? "확인된 정보 기준" : null;
}

/** Unknown components must never be normalized into a seemingly complete composition. */
export function mealLogMacroShares(nutrition: MealLogNutritionEvidence): number[] | null {
  if (nutrition.calculation_status !== "complete") return null;
  const values = MEAL_LOG_MACROS.map(macro => nutrition[macro.key]);
  if (values.some(value => value === null || !Number.isFinite(value) || value < 0)) return null;
  const energies = values.map((value, index) => value! * MEAL_LOG_MACROS[index].factor);
  const total = energies.reduce((sum, value) => sum + value, 0);
  return total > 0 ? energies.map(value => value / total) : null;
}

export function mealLogAxisMaximum(values: Array<number | null>): number {
  const largest = Math.max(0, ...values.filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0));
  if (!largest) return 1;
  const rawStep = largest / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 5, 10].find(candidate => candidate * magnitude >= rawStep)! * magnitude;
  return step * 4;
}

export function scaleMealLogNutrition(nutrition: MealLogNutritionEvidence, ratio: number): MealLogNutritionEvidence {
  const scale = (value: number | null) => value === null || !Number.isFinite(ratio) || ratio < 0 ? null : value * ratio;
  return { ...nutrition, calories_kcal: scale(nutrition.calories_kcal), carbohydrate_g: scale(nutrition.carbohydrate_g), protein_g: scale(nutrition.protein_g), fat_g: scale(nutrition.fat_g), sodium_mg: scale(nutrition.sodium_mg) };
}
