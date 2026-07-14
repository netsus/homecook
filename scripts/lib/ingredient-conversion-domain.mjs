export const VOLUME_PROFILES = Object.freeze([
  Object.freeze({ code: "VOLUME_G6", basis_volume_ml: 15, representative_weight_g: 6, display_qualifier: "approximate" }),
  Object.freeze({ code: "VOLUME_G10", basis_volume_ml: 15, representative_weight_g: 10, display_qualifier: "approximate" }),
  Object.freeze({ code: "VOLUME_G15", basis_volume_ml: 15, representative_weight_g: 15, display_qualifier: "approximate" }),
  Object.freeze({ code: "VOLUME_G20", basis_volume_ml: 15, representative_weight_g: 20, display_qualifier: "approximate" }),
  Object.freeze({ code: "VOLUME_G25", basis_volume_ml: 15, representative_weight_g: 25, display_qualifier: "approximate" }),
]);

export class IngredientConversionError extends Error {
  constructor(code) {
    super(code);
    this.name = "IngredientConversionError";
    this.code = code;
  }
}

const VOLUME_ML_PER_UNIT = new Map([
  ["tbsp", 15],
  ["tsp", 5],
  ["cup", 200],
  ["ml", 1],
  ["l", 1_000],
]);

export function normalizeVolumeMl(amount, unit) {
  const multiplier = VOLUME_ML_PER_UNIT.get(String(unit).trim().toLowerCase());
  if (!Number.isFinite(amount) || amount <= 0 || multiplier === undefined) {
    throw new IngredientConversionError("VOLUME_MEASUREMENT_INVALID");
  }
  return amount * multiplier;
}

function roundedDistance(value) {
  return Math.round(value * 10_000) / 10_000;
}

export function generateVolumeCandidates(evidence) {
  if (
    evidence?.source_freshness_status !== "current" ||
    evidence?.source_review_status !== "approved" ||
    evidence?.source_is_active !== true
  ) {
    return { candidates: [], reason_codes: ["SOURCE_NOT_CURRENT"] };
  }
  if (
    evidence?.evidence_review_status !== "approved" ||
    evidence?.evidence_is_active !== true
  ) {
    return { candidates: [], reason_codes: ["EVIDENCE_NOT_APPROVED"] };
  }
  if (
    !["compatible", "ambiguous"].includes(evidence?.compatibility) ||
    !Number.isFinite(evidence.normalized_g_per_15ml) ||
    evidence.normalized_g_per_15ml <= 0
  ) {
    return { candidates: [], reason_codes: ["INCOMPATIBLE_MEASUREMENT_EVIDENCE"] };
  }

  const distances = VOLUME_PROFILES.map((profile) => ({
    profile,
    rawDistance: Math.abs(
      evidence.normalized_g_per_15ml - profile.representative_weight_g,
    ),
  }));
  const nearestDistance = Math.min(...distances.map(({ rawDistance }) => rawDistance));
  if (nearestDistance > 2.5) {
    return { candidates: [], reason_codes: ["NO_PROFILE_WITHIN_DISTANCE"] };
  }

  const nearest = distances.filter(({ rawDistance }) => rawDistance === nearestDistance);
  const tied = nearest.length > 1;
  const ambiguous = evidence.compatibility === "ambiguous";
  const reasonCodes = [];
  if (tied) reasonCodes.push("TIED_CONVERSION_PROFILE");
  if (ambiguous) reasonCodes.push("AMBIGUOUS_MEASUREMENT_COMPATIBILITY");
  return {
    candidates: nearest.map(({ profile, rawDistance }) => ({
      ingredient_id: evidence.ingredient_id,
      evidence_id: evidence.evidence_id,
      preparation_state: evidence.preparation_state,
      conversion_profile_code: profile.code,
      representative_weight_g: profile.representative_weight_g,
      display_qualifier: profile.display_qualifier,
      evidence_normalized_g_per_15ml: evidence.normalized_g_per_15ml,
      distance_g_per_15ml: roundedDistance(rawDistance),
      candidate_rank: 1,
      review_status: tied || ambiguous ? "needs_review" : "pending",
      is_active: false,
    })),
    reason_codes: reasonCodes,
  };
}

export function convertPieceToGrams(request, rows) {
  if (
    typeof request?.ingredient_id !== "string" ||
    typeof request.size_code !== "string" ||
    typeof request.preparation_state !== "string" ||
    !Number.isFinite(request.piece_count) ||
    request.piece_count <= 0
  ) {
    throw new IngredientConversionError("PIECE_WEIGHT_REQUIRED");
  }
  const matches = rows.filter((row) =>
    row.ingredient_id === request.ingredient_id &&
    row.size_code === request.size_code &&
    row.preparation_state === request.preparation_state &&
    row.review_status === "approved" &&
    row.is_active === true &&
    Number.isFinite(row.weight_g) &&
    row.weight_g > 0,
  );
  if (matches.length !== 1) {
    throw new IngredientConversionError("PIECE_WEIGHT_REQUIRED");
  }
  return {
    grams: matches[0].weight_g * request.piece_count,
    source: "piece_unit_weight",
  };
}

const ASSIGNMENT_TRANSITIONS = new Map([
  ["pending", new Set(["approved", "rejected"])],
  ["needs_review", new Set(["approved", "rejected"])],
  ["approved", new Set(["revoked", "superseded"])],
]);

export function transitionAssignment(row, decision) {
  if (
    !ASSIGNMENT_TRANSITIONS.get(row?.review_status)?.has(decision?.status) ||
    typeof decision.actor !== "string" ||
    decision.actor.trim() === "" ||
    typeof decision.reason !== "string" ||
    decision.reason.trim() === "" ||
    typeof decision.reviewed_at !== "string" ||
    !Number.isFinite(Date.parse(decision.reviewed_at))
  ) {
    throw new IngredientConversionError("INVALID_REVIEW_TRANSITION");
  }
  const auditEntry = Object.freeze({
    from_status: row.review_status,
    to_status: decision.status,
    actor: decision.actor,
    reason: decision.reason,
    reviewed_at: decision.reviewed_at,
  });
  return {
    ...row,
    review_status: decision.status,
    is_active: decision.status === "approved",
    assignment_reason: decision.reason,
    reviewed_by: decision.actor,
    reviewed_at: decision.reviewed_at,
    superseded_by_id:
      decision.status === "superseded" ? decision.superseded_by_id ?? null : row.superseded_by_id,
    decision_history: Object.freeze([...(row.decision_history ?? []), auditEntry]),
  };
}

export function selectActiveAssignment(rows) {
  return rows.find((row) => row.review_status === "approved" && row.is_active === true) ?? null;
}
