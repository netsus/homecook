export const QUANTITY_INPUT_VERSION = "quantity-v4" as const;
export const QUANTITY_CONTRACT_HEADER = "X-Homecook-Quantity-Contract";

/** Only user-entered text; conversion evidence is always resolved by the server. */
export interface QuantityInputDraft {
  schema_version: typeof QUANTITY_INPUT_VERSION;
  raw_value: string;
  raw_unit: string;
  expected_batch_revision?: number;
  expected_product_nutrition_version_id?: string;
}

export interface QuantityInputSnapshot {
  schema_version: typeof QUANTITY_INPUT_VERSION;
  raw_value: string;
  raw_unit: string;
  numerator: string;
  denominator: string;
  normalized: { amount: number; unit: "g" | "ml" } | null;
  display_quantity?: { amount: number; unit: string };
  quality: "direct" | "estimated" | "unavailable";
  reason: string | null;
  evidence_ids: string[];
  source_versions: string[];
  batch_basis: {
    batch_id: string;
    revision: number;
    cooking_servings: number;
    finished_weight_g: number;
    weight_source: string | null;
  } | null;
}

export interface IngredientQuantityOptions {
  policy_version: "ingredient-units-v4";
  profile_id: string;
  preparation_state: string | null;
  default_unit: string;
  recommendation_reason?: string | null;
  choices: Array<{
    unit: string;
    normalized: QuantityInputSnapshot["normalized"];
    quality: QuantityInputSnapshot["quality"];
    reason: string | null;
  }>;
}
