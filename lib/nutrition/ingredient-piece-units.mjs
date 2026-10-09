// Input units carry no quantity; only source observations may include an exact 1 prefix.
export function pieceUnitFamily(unit, observation = false) {
  if (typeof unit !== "string") return null;
  const normalized = unit.trim().toLowerCase();
  const value = observation ? normalized.replace(/^1\s*/, "") : normalized;
  if (["개", "알", "통", "piece", "pieces"].includes(value)) return "count";
  if (value === "장") return "sheet";
  if (["대", "줄기"].includes(value)) return "stalk";
  if (value === "모") return "block";
  if (["줌", "handful", "handfuls"].includes(value)) return "handful";
  if (["꼬집", "pinch", "pinches"].includes(value)) return "pinch";
  return null;
}

export function pieceSizeCode(unit, sizeCode) {
  const family = pieceUnitFamily(unit);
  if (!family) return null;
  return family === "handful" || family === "pinch" ? family : sizeCode ?? "medium";
}

export function approvedPieceObservation(piece) {
  const evidence = piece?.evidence;
  const source = evidence?.source;
  return Boolean(piece && piece.review_status === "approved" && piece.is_active === true
    && typeof piece.id === "string" && piece.id.length > 0
    && typeof piece.evidence_id === "string" && piece.evidence_id.length > 0
    && evidence?.id === piece.evidence_id && evidence.evidence_kind === "piece_weight"
    && evidence.preparation_state === piece.preparation_state && evidence.size_code === piece.size_code
    && evidence.review_status === "approved" && evidence.is_active === true
    && source?.review_status === "approved" && source.freshness_status === "current" && source.is_active === true
    && evidence.source_observed_amount === 1 && pieceUnitFamily(evidence.source_observed_unit, true)
    && Number.isFinite(piece.weight_g) && piece.weight_g > 0 && evidence.observed_weight_g === piece.weight_g);
}

export function pieceWeightMatchesIngredient(piece, ingredient) {
  const family = pieceUnitFamily(ingredient.unit);
  return Boolean(family && approvedPieceObservation(piece)
    && piece.ingredient_id === ingredient.ingredient_id
    && piece.preparation_state === ingredient.preparation_state
    && piece.size_code === pieceSizeCode(ingredient.unit, ingredient.size_code)
    && pieceUnitFamily(piece.evidence.source_observed_unit, true) === family);
}
