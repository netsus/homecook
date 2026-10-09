export type YoutubeIngredientResolutionBenchmarkStatus =
  | "resolved"
  | "needs_review"
  | "unresolved";

export interface YoutubeIngredientResolutionObservation {
  status: YoutubeIngredientResolutionBenchmarkStatus;
  candidate_ids: string[];
  final_id: string | null;
}

export interface YoutubeIngredientResolutionReviewCase {
  extracted_name: string;
  frozen_strict_name_match: boolean;
  reviewed_semantically_equivalent: boolean;
  expected_status: YoutubeIngredientResolutionBenchmarkStatus;
  acceptable_candidate_ids: string[];
  acceptable_final_ids: string[];
}

interface BenchmarkMetric {
  numerator: number;
  denominator: number;
  rate: number | null;
}

function metric(numerator: number, denominator: number): BenchmarkMetric {
  return {
    numerator,
    denominator,
    rate: denominator === 0 ? null : numerator / denominator,
  };
}

function intersects(left: readonly string[], right: readonly string[]) {
  const accepted = new Set(right);
  return left.some((value) => accepted.has(value));
}

export function scoreYoutubeIngredientResolutionBenchmark(
  cases: readonly YoutubeIngredientResolutionReviewCase[],
  observations: ReadonlyMap<string, YoutubeIngredientResolutionObservation>,
) {
  const rows = cases.map((reviewCase) => ({
    reviewCase,
    observation: observations.get(reviewCase.extracted_name) ?? {
      status: "unresolved" as const,
      candidate_ids: [],
      final_id: null,
    },
  }));
  const candidateRows = rows.filter(({ reviewCase }) => reviewCase.acceptable_candidate_ids.length > 0);
  const finalRows = rows.filter(({ reviewCase }) => reviewCase.acceptable_final_ids.length > 0);
  const linkedRows = rows.filter(({ observation }) => observation.final_id !== null);

  const expectedOutcomeCount = rows.filter(({ reviewCase, observation }) => {
    if (reviewCase.expected_status === "resolved") {
      return observation.status === "resolved"
        && observation.final_id !== null
        && reviewCase.acceptable_final_ids.includes(observation.final_id);
    }
    if (reviewCase.expected_status === "needs_review") {
      return observation.status === "needs_review" && observation.final_id === null;
    }
    return observation.status === "unresolved" && observation.final_id === null;
  }).length;

  return {
    strict_name_matches: metric(
      rows.filter(({ reviewCase }) => reviewCase.frozen_strict_name_match).length,
      rows.length,
    ),
    reviewed_semantic_equivalence: metric(
      rows.filter(({ reviewCase }) => reviewCase.reviewed_semantically_equivalent).length,
      rows.length,
    ),
    candidate_semantic_recall: metric(
      candidateRows.filter(({ reviewCase, observation }) =>
        intersects(observation.candidate_ids, reviewCase.acceptable_candidate_ids)).length,
      candidateRows.length,
    ),
    resolved: metric(
      rows.filter(({ observation }) => observation.status === "resolved" && observation.final_id !== null).length,
      rows.length,
    ),
    correct_final_ids: metric(
      finalRows.filter(({ reviewCase, observation }) =>
        observation.final_id !== null && reviewCase.acceptable_final_ids.includes(observation.final_id)).length,
      finalRows.length,
    ),
    false_links_overall: metric(
      rows.filter(({ reviewCase, observation }) =>
        observation.final_id !== null && !reviewCase.acceptable_final_ids.includes(observation.final_id)).length,
      rows.length,
    ),
    false_links_among_linked: metric(
      linkedRows.filter(({ reviewCase, observation }) =>
        observation.final_id !== null && !reviewCase.acceptable_final_ids.includes(observation.final_id)).length,
      linkedRows.length,
    ),
    expected_outcomes: metric(expectedOutcomeCount, rows.length),
  };
}
