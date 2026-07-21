const SOURCE_RANK = new Map([
  ["NIFS_KFIND", 1],
  ["MFDS", 1],
  ["RDA_10_4", 2],
  ["MFDS_KFIND", 3],
  ["K_FIND", 3],
]);

export class NutritionMatchingError extends Error {
  constructor(code) {
    super(code);
    this.name = "NutritionMatchingError";
    this.code = code;
  }
}

function isSemanticallyCompatible(ingredient, candidate) {
  const names = new Set(
    (ingredient.normalized_names ?? []).map((name) => String(name).trim().toLowerCase()),
  );
  return (
    names.has(String(candidate.normalized_name ?? "").trim().toLowerCase()) &&
    candidate.preparation_state === ingredient.preparation_state &&
    candidate.edible_portion === ingredient.edible_portion &&
    candidate.basis_dimension === ingredient.basis_dimension
  );
}

export function rankNutritionCandidates(ingredient, candidates) {
  const sourceEligible = candidates.filter((candidate) =>
    candidate.freshness_status === "current" &&
    candidate.source_review_status === "approved" &&
    candidate.source_is_active === true,
  );
  const compatible = sourceEligible
    .filter((candidate) => isSemanticallyCompatible(ingredient, candidate))
    .filter((candidate) => SOURCE_RANK.has(candidate.provider_code))
    .map((candidate) => ({
      ...candidate,
      candidate_rank: SOURCE_RANK.get(candidate.provider_code),
      review_status: "pending",
      is_active: false,
    }))
    .sort((left, right) =>
      left.candidate_rank - right.candidate_rank ||
      String(left.id).localeCompare(String(right.id)),
    );

  const bestRank = compatible[0]?.candidate_rank;
  const best = compatible.filter((candidate) => candidate.candidate_rank === bestRank);
  const ambiguous = best.length > 1;
  const reasonCodes = [];
  if (sourceEligible.length !== candidates.length) reasonCodes.push("SOURCE_NOT_CURRENT");
  if (ambiguous) reasonCodes.push("AMBIGUOUS_NUTRITION_MATCH");
  return {
    candidates: compatible.map((candidate) =>
      ambiguous && candidate.candidate_rank === bestRank
        ? { ...candidate, review_status: "needs_review" }
        : candidate,
    ),
    reason_codes: reasonCodes,
  };
}

const ALLOWED_TRANSITIONS = new Map([
  ["pending", new Set(["approved", "rejected"])],
  ["needs_review", new Set(["approved", "rejected"])],
  ["approved", new Set(["revoked", "superseded"])],
]);

export function transitionReviewDecision(row, decision) {
  if (
    !ALLOWED_TRANSITIONS.get(row?.review_status)?.has(decision?.status) ||
    typeof decision.actor !== "string" ||
    decision.actor.trim() === "" ||
    typeof decision.reason !== "string" ||
    decision.reason.trim() === "" ||
    typeof decision.reviewed_at !== "string" ||
    !Number.isFinite(Date.parse(decision.reviewed_at))
  ) {
    throw new NutritionMatchingError("INVALID_REVIEW_TRANSITION");
  }

  const auditEntry = Object.freeze({
    from_status: row.review_status,
    to_status: decision.status,
    actor: decision.actor,
    reason: decision.reason,
    reviewed_at: decision.reviewed_at,
  });
  const approved = decision.status === "approved";
  return {
    ...row,
    review_status: decision.status,
    is_active: approved,
    is_primary: approved,
    decision_reason: decision.reason,
    reviewed_by: decision.actor,
    reviewed_at: decision.reviewed_at,
    superseded_by_id:
      decision.status === "superseded" ? decision.superseded_by_id ?? null : row.superseded_by_id,
    decision_history: Object.freeze([...(row.decision_history ?? []), auditEntry]),
  };
}

export function selectActiveNutritionProfile(rows) {
  return rows.find((row) =>
    row.review_status === "approved" && row.is_active === true && row.is_primary === true,
  ) ?? null;
}
