import { hasCompleteEnergyAndMacros } from "@/lib/nutrition/recipe-nutrition-display";
import { formatEnergyKcal } from "@/lib/nutrition/energy-display";
import type {
  PlannerNutritionCoreCode,
  PlannerNutritionQuality,
  PlannerNutritionValue,
} from "@/types/planner-nutrition";

export const PLANNER_NUTRITION_LABELS: Record<
  PlannerNutritionCoreCode,
  string
> = {
  energy_kcal: "열량",
  carbohydrate_g: "탄수화물",
  protein_g: "단백질",
  fat_g: "지방",
  sodium_mg: "나트륨",
};

const PLANNER_NUTRITION_UNITS: Record<PlannerNutritionCoreCode, string> = {
  energy_kcal: "kcal",
  carbohydrate_g: "g",
  protein_g: "g",
  fat_g: "g",
  sodium_mg: "mg",
};

const WARNING_MESSAGES: Record<string, string> = {
  AI_NUTRITION_ESTIMATE_USED: "AI 추정값 포함",
  INGREDIENT_NUTRITION_MISSING: "일부 재료의 영양 정보가 아직 준비되지 않았어요.",
  NUTRITION_PROFILE_MISSING: "일부 재료의 영양 정보가 아직 준비되지 않았어요.",
  PRODUCT_NUTRITION_MISSING: "일부 완제품의 영양 정보가 아직 준비되지 않았어요.",
  RECIPE_NUTRITION_SNAPSHOT_MISSING: "일부 레시피의 영양 정보가 아직 준비되지 않았어요.",
  TO_TASTE_EXCLUDED: "기호에 따라 넣는 재료는 원본이 0인 영양소만 반영했어요.",
  UNIT_CONVERSION_MISSING: "일부 재료나 단위의 영양값을 계산하지 못했어요.",
  UNIT_DEFINITION_REQUIRED: "일부 재료의 단위 정의를 확인하지 못해 영양을 계산하지 않았어요.",
  UNIT_DEFINITION_CONFLICT: "일부 재료의 단위 근거가 서로 달라 영양을 계산하지 않았어요.",
  PIECE_IDENTITY_REQUIRED: "일부 재료의 개수·크기에 맞는 무게 근거가 없어 영양을 계산하지 않았어요.",
  DENSITY_REQUIRED: "무게와 부피를 바꿀 밀도 근거가 없어 일부 영양을 계산하지 않았어요.",
  AMBIGUOUS_EVIDENCE: "사용할 환산 근거를 하나로 정할 수 없어 일부 영양을 계산하지 않았어요.",
  UNIT_MEASUREMENT_ESTIMATE_USED: "검토된 평균 측정값으로 환산한 예상 영양이 포함돼요.",
};

function formatAmount(amount: number, wholeNumber: boolean) {
  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: wholeNumber ? 0 : 1,
  }).format(wholeNumber ? Math.round(amount) : amount);
}

export function formatPlannerNutritionValue(
  code: PlannerNutritionCoreCode,
  value: PlannerNutritionValue,
) {
  const unit = PLANNER_NUTRITION_UNITS[code];
  if (code === "energy_kcal") {
    return formatEnergyKcal(value.status === "complete" ? value.amount : value.status === "partial" ? value.known_amount : null, { partial: value.status === "partial" });
  }

  if (value.status === "complete" && value.amount !== null) {
    return `${formatAmount(value.amount, unit !== "mg")} ${unit}`;
  }

  if (value.status === "partial" && value.known_amount !== null) {
    return `${formatAmount(value.known_amount, unit !== "mg")} ${unit}`;
  }

  return "정보 준비 중";
}

export function formatPlannerNutritionEnergy(value: PlannerNutritionValue) {
  return formatPlannerNutritionValue("energy_kcal", value);
}

export function formatPlannerNutritionQuality(
  quality: PlannerNutritionQuality | null,
) {
  if (quality === "direct") {
    return "직접 계산";
  }
  if (quality === "estimated") {
    return "환산값 포함 · 예상치";
  }
  if (quality === "mixed") {
    return "직접값과 환산값 혼합 · 예상치";
  }
  return "계산 방법 정보 준비 중";
}

export function buildPlannerNutritionWarningMessages(warnings: string[], values?: Record<string, PlannerNutritionValue>) {
  if (values && hasCompleteEnergyAndMacros(values)) return [];
  return [
    ...new Set(
      warnings.map(
        (warning) =>
          WARNING_MESSAGES[warning] ?? "일부 계획 영양을 확인해 주세요.",
      ),
    ),
  ];
}


export function plannerAiEstimateNotice(
  values: Record<string, PlannerNutritionValue>,
  containsAiEstimate: boolean = false,
): string | null {
  if (!containsAiEstimate) return null;
  return !hasCompleteEnergyAndMacros(values)
    ? "AI 추정값 포함 · 일부 영양정보가 빠진 추정값"
    : "AI 추정값 포함";
}
