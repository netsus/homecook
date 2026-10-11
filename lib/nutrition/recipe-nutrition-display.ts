import { formatEnergyKcal } from "@/lib/nutrition/energy-display";
import type {
  RecipeNutrition,
  RecipeNutritionQuality,
  RecipeNutritionValue,
} from "@/types/recipe";

export const RECIPE_NUTRIENT_DISPLAY_ORDER = [
  "energy_kcal",
  "carbohydrate_g",
  "protein_g",
  "fat_g",
] as const;

export const OPTIONAL_RECIPE_NUTRIENT_DISPLAY_ORDER = [
  "sodium_mg",
  "sugars_g",
  "saturated_fat_g",
  "fiber_g",
] as const;

export type RecipeNutrientDisplayCode =
  | (typeof RECIPE_NUTRIENT_DISPLAY_ORDER)[number]
  | (typeof OPTIONAL_RECIPE_NUTRIENT_DISPLAY_ORDER)[number];

interface RecipeNutrientMeta {
  label: string;
  unit: "kcal" | "g" | "mg";
}

const NUTRIENT_META: Record<RecipeNutrientDisplayCode, RecipeNutrientMeta> = {
  energy_kcal: { label: "열량", unit: "kcal" },
  carbohydrate_g: { label: "탄수화물", unit: "g" },
  protein_g: { label: "단백질", unit: "g" },
  fat_g: { label: "지방", unit: "g" },
  sodium_mg: { label: "나트륨", unit: "mg" },
  sugars_g: { label: "당류", unit: "g" },
  saturated_fat_g: { label: "포화지방", unit: "g" },
  fiber_g: { label: "식이섬유", unit: "g" },
};

export interface RecipeNutrientDisplayItem {
  code: RecipeNutrientDisplayCode;
  label: string;
  perServingText: string;
  selectedTotalText: string;
}

export interface RecipeNutritionDisplay {
  hasValidBaseServings: boolean;
  nutrients: RecipeNutrientDisplayItem[];
  optionalNutrients: RecipeNutrientDisplayItem[];
  qualityText: string | null;
  aiEstimateText: string | null;
  representativeNutritionText: string | null;
  reflectedText: string | null;
}

const UNAVAILABLE_TEXT = "정보 준비 중";

// Nutrition and measurement sources share the same attribution shape. Only
// identified nutrition datasets qualify; the provider also supplies weights.
const REPRESENTATIVE_NUTRITION_DATASETS = new Set([
  "Homecook 제품 라벨 기반 서비스 대표 예시 20261010",
  "Homecook 제품 라벨 기반 서비스 대표 예시 20261010 · 정체성 보완",
  "Homecook 대표재료 영양 프로필",
  "Homecook 사용자 승인 영양 프로필",
]);

export function hasCompleteEnergyAndMacros(values: RecipeNutrition["values"]) {
  return RECIPE_NUTRIENT_DISPLAY_ORDER.every((code) => hasCompleteNutritionValue(values[code]));
}

export function buildRecipeNutritionDisplay(
  nutrition: RecipeNutrition,
  selectedServings: number,
): RecipeNutritionDisplay {
  const baseServings = nutrition.base_servings;
  const hasValidBaseServings = isPositiveFinite(baseServings);
  const hasValidSelectedServings = isPositiveFinite(selectedServings);

  return {
    hasValidBaseServings,
    nutrients: RECIPE_NUTRIENT_DISPLAY_ORDER.map((code) => buildDisplayItem(
      nutrition,
      code,
      selectedServings,
      baseServings,
      hasValidBaseServings,
      hasValidSelectedServings,
    )),
    optionalNutrients: OPTIONAL_RECIPE_NUTRIENT_DISPLAY_ORDER
      .filter((code) => hasCompleteNutritionValue(nutrition.values[code]))
      .map((code) => buildDisplayItem(
        nutrition,
        code,
        selectedServings,
        baseServings,
        hasValidBaseServings,
        hasValidSelectedServings,
      )),
    qualityText: qualityText(nutrition.calculation_quality),
    aiEstimateText: nutrition.warnings.includes("AI_NUTRITION_ESTIMATE_USED") ? "AI 추정값 포함" : null,
    representativeNutritionText: nutrition.sources.some(source =>
      source.provider === "HOMECOOK_USER_STANDARD" && REPRESENTATIVE_NUTRITION_DATASETS.has(source.dataset),
    ) ? "일부 재료는 승인된 대표 영양값으로 계산했어요. 실제 제품·종류에 따라 달라질 수 있어요." : null,
    reflectedText: reflectedText(nutrition),
  };
}

function buildDisplayItem(
  nutrition: RecipeNutrition,
  code: RecipeNutrientDisplayCode,
  selectedServings: number,
  baseServings: number | undefined,
  hasValidBaseServings: boolean,
  hasValidSelectedServings: boolean,
): RecipeNutrientDisplayItem {
      const meta = NUTRIENT_META[code];
      const value = nutrition.values[code];

      return {
        code,
        label: meta.label,
        perServingText: hasValidBaseServings
          ? formatPerServing(value, baseServings as number, meta.unit)
          : UNAVAILABLE_TEXT,
        selectedTotalText:
          hasValidBaseServings && hasValidSelectedServings
            ? formatSelectedTotal(
                value,
                nutrition.scalable_values?.[code],
                nutrition.fixed_values?.[code],
                selectedServings,
                baseServings as number,
                meta.unit,
              )
            : UNAVAILABLE_TEXT,
      };
}

function formatPerServing(
  value: RecipeNutritionValue | undefined,
  baseServings: number,
  unit: RecipeNutrientMeta["unit"],
) {
  const numericValue = value?.status === "complete"
    ? value.amount
    : value?.status === "partial"
      ? value.known_amount
      : null;

  if (!isObservedAmount(numericValue)) {
    return UNAVAILABLE_TEXT;
  }

  return formatNutrientAmount(
    numericValue / baseServings,
    unit,
    value?.status === "partial",
  );
}

function formatSelectedTotal(
  value: RecipeNutritionValue | undefined,
  scalableValue: number | undefined,
  fixedValue: number | undefined,
  selectedServings: number,
  baseServings: number,
  unit: RecipeNutrientMeta["unit"],
) {
  if (
    (value?.status !== "complete" && value?.status !== "partial") ||
    !isObservedAmount(scalableValue) ||
    !isObservedAmount(fixedValue)
  ) {
    return UNAVAILABLE_TEXT;
  }

  const selectedTotal = scalableValue * selectedServings / baseServings + fixedValue;
  if (!isObservedAmount(selectedTotal)) {
    return UNAVAILABLE_TEXT;
  }

  return formatNutrientAmount(selectedTotal, unit, value?.status === "partial");
}

function formatNutrientAmount(
  amount: number,
  unit: RecipeNutrientMeta["unit"],
  partial = false,
) {
  if (unit === "kcal") return formatEnergyKcal(amount, { partial });
  const maximumFractionDigits = unit === "g" ? 1 : 0;
  const formatted = new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits,
  }).format(amount);
  return `${formatted} ${unit}`;
}

function qualityText(quality: RecipeNutritionQuality | null) {
  if (quality === "direct") {
    return "직접 계산";
  }

  if (quality === "estimated") {
    return "환산값 포함 · 예상치";
  }

  if (quality === "mixed") {
    return "직접값과 환산값 혼합 · 예상치";
  }

  return null;
}

function reflectedText(nutrition: RecipeNutrition) {
  const reflected = nutrition.reflected_ingredient_count;
  const target = nutrition.target_ingredient_count;

  if (
    !Number.isInteger(reflected) ||
    !Number.isInteger(target) ||
    reflected === undefined ||
    target === undefined ||
    reflected < 0 ||
    target < 0 ||
    reflected > target
  ) {
    return null;
  }

  return `재료 ${target}개 중 ${reflected}개 반영`;
}

function isPositiveFinite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isObservedAmount(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function hasCompleteNutritionValue(value: RecipeNutritionValue | undefined) {
  return value?.status === "complete" && isObservedAmount(value.amount);
}
