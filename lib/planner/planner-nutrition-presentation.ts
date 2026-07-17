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
  INGREDIENT_NUTRITION_MISSING: "일부 재료의 영양 정보가 아직 준비되지 않았어요.",
  NUTRITION_PROFILE_MISSING: "일부 재료의 영양 정보가 아직 준비되지 않았어요.",
  PRODUCT_NUTRITION_MISSING: "일부 완제품의 영양 정보가 아직 준비되지 않았어요.",
  RECIPE_NUTRITION_SNAPSHOT_MISSING: "일부 레시피의 영양 정보가 아직 준비되지 않았어요.",
  TO_TASTE_EXCLUDED: "기호에 따라 넣는 재료는 계산에서 제외했어요.",
  UNIT_CONVERSION_MISSING: "일부 재료나 단위의 영양값을 계산하지 못했어요.",
};

function formatAmount(amount: number) {
  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: 1,
  }).format(amount);
}

export function formatPlannerNutritionValue(
  code: PlannerNutritionCoreCode,
  value: PlannerNutritionValue,
) {
  const unit = PLANNER_NUTRITION_UNITS[code];

  if (value.status === "complete" && value.amount !== null) {
    return `${formatAmount(value.amount)} ${unit}`;
  }

  if (value.status === "partial" && value.known_amount !== null) {
    return `최소 ${formatAmount(value.known_amount)} ${unit}`;
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

export function buildPlannerNutritionWarningMessages(warnings: string[]) {
  return [
    ...new Set(
      warnings.map(
        (warning) =>
          WARNING_MESSAGES[warning] ?? "일부 계획 영양을 확인해 주세요.",
      ),
    ),
  ];
}
