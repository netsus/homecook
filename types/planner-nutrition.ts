export const PLANNER_NUTRITION_CORE_CODES = [
  "energy_kcal",
  "carbohydrate_g",
  "protein_g",
  "fat_g",
  "sodium_mg",
] as const;

export type PlannerNutritionCoreCode = (typeof PLANNER_NUTRITION_CORE_CODES)[number];
export type PlannerNutritionStatus = "complete" | "partial" | "unavailable";
export type PlannerNutritionQuality = "direct" | "estimated" | "mixed";

export interface PlannerNutritionValue {
  amount: number | null;
  known_amount: number | null;
  status: PlannerNutritionStatus;
  display_mode: "total" | "minimum" | null;
}

export interface PlannerNutritionSource {
  provider: string;
  dataset: string | null;
  source_version: string | null;
  data_basis_date: string | null;
  license: string | null;
  source_url: string | null;
}

export interface PlannerNutritionAggregate {
  basis: { amount: 1; unit: "range" };
  values: Record<PlannerNutritionCoreCode, PlannerNutritionValue>;
  calculation_status: PlannerNutritionStatus;
  calculation_quality: PlannerNutritionQuality | null;
  incomplete_entry_count: number;
  warnings: string[];
  sources: PlannerNutritionSource[];
}

export interface PlannerNutritionColumnSummary {
  column_id: string;
  nutrition: PlannerNutritionAggregate;
}

export interface PlannerNutritionDaySummary {
  plan_date: string;
  nutrition: PlannerNutritionAggregate;
  columns: PlannerNutritionColumnSummary[];
}

export interface PlannerNutritionData {
  range: {
    start_date: string;
    end_date: string;
  };
  summary: {
    nutrition: PlannerNutritionAggregate;
    recipe_entry_count: number;
    product_entry_count: number;
  };
  days: PlannerNutritionDaySummary[];
}
