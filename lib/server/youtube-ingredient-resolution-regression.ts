import {
  buildIngredientLookupNameCandidates,
  normalizeIngredientSearchName,
  type IngredientLookupContext,
} from "@/lib/ingredient-search";

import type { YoutubeIngredientResolutionObservation } from "@/lib/server/youtube-ingredient-resolution-benchmark";

export interface YoutubeIngredientResolutionCatalogSlice {
  ingredients: Array<{ id: string; standard_name: string }>;
  synonyms: Array<{ ingredient_id: string; synonym: string }>;
}

export type YoutubeIngredientResolutionTransition =
  | "unchanged"
  | "newly_resolved"
  | "resolved_id_changed"
  | "resolved_to_needs_review"
  | "resolved_to_unresolved"
  | "needs_review_to_resolved"
  | "needs_review_candidates_changed"
  | "newly_needs_review"
  | "other_status_change";

function observation(candidateIds: Iterable<string>): YoutubeIngredientResolutionObservation {
  const ids = [...new Set(candidateIds)].sort();
  if (ids.length === 0) {
    return { status: "unresolved", candidate_ids: [], final_id: null };
  }
  if (ids.length === 1) {
    return { status: "resolved", candidate_ids: ids, final_id: ids[0] };
  }
  return { status: "needs_review", candidate_ids: ids, final_id: null };
}

/**
 * Small fixed-catalog simulator for regression evidence. It deliberately mirrors
 * production precedence: exact candidate rank first, canonical name before
 * synonym, and ambiguity is retained instead of selecting the first ID.
 */
export function resolveYoutubeIngredientAgainstCatalog(
  context: IngredientLookupContext,
  catalog: YoutubeIngredientResolutionCatalogSlice,
  options: { expandLookupCandidates: boolean },
) {
  const names = options.expandLookupCandidates
    ? buildIngredientLookupNameCandidates(context)
    : [context.name];

  for (const name of names) {
    const key = normalizeIngredientSearchName(name);
    const directIds = catalog.ingredients
      .filter((row) => normalizeIngredientSearchName(row.standard_name) === key)
      .map((row) => row.id);
    if (directIds.length > 0) {
      return observation(directIds);
    }

    const synonymIds = catalog.synonyms
      .filter((row) => normalizeIngredientSearchName(row.synonym) === key)
      .map((row) => row.ingredient_id);
    if (synonymIds.length > 0) {
      return observation(synonymIds);
    }
  }

  return observation([]);
}

export function classifyYoutubeIngredientResolutionTransition(
  before: YoutubeIngredientResolutionObservation,
  after: YoutubeIngredientResolutionObservation,
): YoutubeIngredientResolutionTransition {
  if (before.status === after.status
    && before.final_id === after.final_id
    && before.candidate_ids.join("\0") === after.candidate_ids.join("\0")) {
    return "unchanged";
  }
  if (before.status === "unresolved" && after.status === "resolved") return "newly_resolved";
  if (before.status === "resolved" && after.status === "resolved") return "resolved_id_changed";
  if (before.status === "resolved" && after.status === "needs_review") return "resolved_to_needs_review";
  if (before.status === "resolved" && after.status === "unresolved") return "resolved_to_unresolved";
  if (before.status === "needs_review" && after.status === "resolved") return "needs_review_to_resolved";
  if (before.status === "needs_review" && after.status === "needs_review") {
    return "needs_review_candidates_changed";
  }
  if (after.status === "needs_review") return "newly_needs_review";
  return "other_status_change";
}
