export const FOOD_PRODUCT_BASIS_UNITS = ["serving", "package", "g", "ml"] as const;
export type FoodProductBasisUnit = (typeof FOOD_PRODUCT_BASIS_UNITS)[number];

export const FOOD_PRODUCT_CORE_NUTRIENTS = [
  "energy_kcal",
  "carbohydrate_g",
  "protein_g",
  "fat_g",
  "sodium_mg",
] as const;

export const FOOD_PRODUCT_OPTIONAL_NUTRIENTS = [
  "sugars_g",
  "saturated_fat_g",
  "fiber_g",
] as const;

export type FoodProductNutrientCode =
  | (typeof FOOD_PRODUCT_CORE_NUTRIENTS)[number]
  | (typeof FOOD_PRODUCT_OPTIONAL_NUTRIENTS)[number];

export interface FoodProductNutritionInput {
  basis: {
    amount: number;
    unit: FoodProductBasisUnit;
  };
  values: Partial<Record<FoodProductNutrientCode, number | null>> & {
    energy_kcal: number;
  };
}

export interface FoodProductCreateInput {
  name: string;
  brand: string | null;
  nutrition: FoodProductNutritionInput;
}

export interface FoodProductPatchInput {
  name?: string;
  brand?: string | null;
  nutrition?: FoodProductNutritionInput;
}

export interface FoodProductNutrientValue {
  amount: number | null;
  known_amount: number | null;
  status: "complete" | "partial" | "unavailable";
  display_mode: "total" | "minimum" | null;
}

export interface FoodProductSourceAttribution {
  provider: string;
  dataset: string | null;
  source_version: string | null;
  data_basis_date: string | null;
  license: string | null;
  source_url: string | null;
}

export interface FoodProductData {
  id: string;
  name: string;
  brand: string | null;
  visibility: "public" | "private";
  source_type: "public_dataset" | "manual";
  editable: boolean;
  nutrition_version_id: string;
  basis_relations: Array<{
    from: { amount: number; unit: FoodProductBasisUnit };
    to: { amount: number; unit: FoodProductBasisUnit };
  }>;
  nutrition: {
    basis: { amount: number; unit: FoodProductBasisUnit };
    values: Record<string, FoodProductNutrientValue>;
    calculation_status: "complete" | "partial" | "unavailable";
    calculation_quality: "direct" | "estimated" | "mixed" | null;
    warnings: string[];
    sources: FoodProductSourceAttribution[];
  };
}

export interface FoodProductListData {
  items: FoodProductData[];
  next_cursor: string | null;
  has_next: boolean;
}
