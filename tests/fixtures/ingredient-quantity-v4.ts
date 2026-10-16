import type { IngredientDensityEvidence, IngredientPieceEvidence, IngredientQuantityInput, IngredientVolumeDefinition } from "@/lib/nutrition/ingredient-quantity";

export const unitSource = { id: "source", provider: "fixture", dataset: "synthetic", source_version: "1",
  data_basis_date: null, license: "test", source_url: "https://example.test/unit", review_status: "approved",
  freshness_status: "current", is_active: true };
export const density: IngredientDensityEvidence = { id: "density", kind: "density", ingredient_id: "fixture",
  preparation_state: "raw", edible_portion_basis: "edible", quality: "measured", grams_per_ml: 1.03,
  review_status: "approved", is_active: true, source: unitSource };
export const piece: IngredientPieceEvidence = { id: "piece", kind: "piece", ingredient_id: "fixture",
  preparation_state: "raw", edible_portion_basis: "edible", quality: "average", physical_unit: "알", size_code: "medium",
  weight_g: 3, observed_amount: 1, observed_unit: "알", observed_weight_g: 3,
  review_status: "approved", is_active: true, source: unitSource };
export function volumeDefinition(raw_unit: string, volume_ml: number): IngredientVolumeDefinition {
  return { id: "definition", kind: "volume_definition", raw_unit, volume_ml,
    review_status: "approved", is_active: true, source: unitSource };
}
export function quantity(unit: string, amount = 1): IngredientQuantityInput {
  return { ingredient_id: "fixture", preparation_state: "raw", size_code: "medium", amount, unit,
    unit_context: { edible_portion_basis: "edible", source_id: "source", densities: [density], pieces: [piece] } };
}

export const quantityCases = [
  { name: "g/kg exact", input: quantity("kg", 0.5), target: "g", amount: 500 },
  { name: "mL/L exact", input: quantity("L", 0.2), target: "ml", amount: 200 },
  { name: "own density", input: quantity("mL", 200), target: "g", amount: 206 },
  { name: "inverse density", input: quantity("g", 206), target: "ml", amount: 200 },
  { name: "app tablespoon", input: quantity("계량큰술", 2), target: "ml", amount: 30 },
  { name: "app teaspoon", input: quantity("계량작은술", 0.5), target: "ml", amount: 2.5 },
  { name: "app explicit 200mL cup", input: quantity("계량컵(200mL)"), target: "ml", amount: 200 },
  { name: "matching physical clove", input: quantity("알", 0.5), target: "g", amount: 1.5, quality: "estimated" },
  { name: "whole bulb cannot borrow clove", input: quantity("통"), target: "g", reason: "PIECE_IDENTITY_REQUIRED" },
  { name: "piece alias cannot borrow clove", input: quantity("개"), target: "g", reason: "PIECE_IDENTITY_REQUIRED" },
  { name: "raw cup has no global default", input: quantity("cup"), target: "ml", reason: "UNIT_DEFINITION_REQUIRED" },
  { name: "raw spoon has no global default", input: quantity("스푼"), target: "g", reason: "PIECE_IDENTITY_REQUIRED" },
  { name: "raw T not silently 15", input: quantity("T"), target: "ml", reason: "UNIT_DEFINITION_REQUIRED" },
  { name: "raw t not silently 5", input: quantity("t"), target: "ml", reason: "UNIT_DEFINITION_REQUIRED" },
  { name: "blank whitespace unit", input: quantity(" "), target: "g", reason: "INVALID_QUANTITY" },
  { name: "Unicode whitespace unit", input: quantity("\u00a0\t"), target: "ml", reason: "INVALID_QUANTITY" },
  { name: "zero", input: quantity("g", 0), target: "g", reason: "INVALID_QUANTITY" },
  { name: "negative", input: quantity("g", -1), target: "g", reason: "INVALID_QUANTITY" },
  { name: "overflow is not a usable amount", input: quantity("kg", 1e308), target: "g", reason: "INVALID_QUANTITY" },
] satisfies Array<{ name: string; input: IngredientQuantityInput; target: "g" | "ml";
  amount?: number; quality?: "direct" | "estimated"; reason?: string }>;
