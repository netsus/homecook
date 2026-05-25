import { findIngredientIds } from "@/lib/server/youtube-import";
import {
  validateYoutubeCorpusFixtures,
  type YoutubeCorpusCategory,
  type YoutubeCorpusFixture,
} from "@/lib/server/youtube-corpus-scoring";
import type { YoutubeIngredientResolutionStatus } from "@/types/recipe";

type DictionaryDbClient = Parameters<typeof findIngredientIds>[0];

export interface YoutubeDictionaryResolutionIngredientResult {
  name: string;
  resolution_status: YoutubeIngredientResolutionStatus;
  match_count: number;
  standard_names: string[];
}

export interface YoutubeDictionaryResolutionFixtureResult {
  id: string;
  category: YoutubeCorpusCategory;
  expected_count: number;
  resolved_count: number;
  needs_review_count: number;
  unresolved_count: number;
  resolution_rate: number;
  ingredients: YoutubeDictionaryResolutionIngredientResult[];
  errors: string[];
}

export interface YoutubeDictionaryResolutionReport {
  run_id: string;
  timestamp: string;
  dictionary_version: string;
  corpus_version: string;
  per_fixture: YoutubeDictionaryResolutionFixtureResult[];
  aggregate: {
    corpus_avg_resolution_rate: number;
    ingredient_resolution_rate: number;
    category_avg: Record<YoutubeCorpusCategory, number>;
    category_counts: Record<YoutubeCorpusCategory, number>;
    expected_count: number;
    resolved_count: number;
    needs_review_count: number;
    unresolved_count: number;
    warnings: string[];
  };
}

const CATEGORIES: YoutubeCorpusCategory[] = [
  "structured",
  "semi-structured",
  "weak",
  "noise",
  "multi-recipe",
];

function roundScore(value: number) {
  if (!Number.isFinite(value)) return 0;

  return Number(value.toFixed(4));
}

function average(values: number[]) {
  if (values.length === 0) return 0;

  return roundScore(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function resolutionStatusFromMatchCount(matchCount: number): YoutubeIngredientResolutionStatus {
  if (matchCount === 1) return "resolved";
  if (matchCount > 1) return "needs_review";

  return "unresolved";
}

function scoreFixture(
  fixture: YoutubeCorpusFixture,
  matchesByName: Awaited<ReturnType<typeof findIngredientIds>>["matchesByName"],
): YoutubeDictionaryResolutionFixtureResult {
  const ingredients = fixture.expected_ingredients.map((expected) => {
    const matches = matchesByName.get(expected.name) ?? new Map();
    const standardNames = [...matches.values()]
      .map((match) => match.standardName)
      .sort((left, right) => left.localeCompare(right, "ko"));

    return {
      name: expected.name,
      resolution_status: resolutionStatusFromMatchCount(matches.size),
      match_count: matches.size,
      standard_names: standardNames,
    };
  });
  const resolvedCount = ingredients.filter((ingredient) => ingredient.resolution_status === "resolved").length;
  const needsReviewCount = ingredients.filter((ingredient) => ingredient.resolution_status === "needs_review").length;
  const unresolvedCount = ingredients.filter((ingredient) => ingredient.resolution_status === "unresolved").length;
  const expectedCount = ingredients.length;

  return {
    id: fixture.id,
    category: fixture.category,
    expected_count: expectedCount,
    resolved_count: resolvedCount,
    needs_review_count: needsReviewCount,
    unresolved_count: unresolvedCount,
    resolution_rate: expectedCount === 0 ? 1 : roundScore(resolvedCount / expectedCount),
    ingredients,
    errors: [],
  };
}

export async function scoreYoutubeDictionaryResolutionFixtures(
  fixtures: YoutubeCorpusFixture[],
  options: {
    dictionaryVersion: string;
    corpusVersion: string;
    runId: string;
    timestamp: string;
    dbClient: DictionaryDbClient;
  },
): Promise<YoutubeDictionaryResolutionReport> {
  const validation = validateYoutubeCorpusFixtures(fixtures);
  const expectedNames = fixtures.flatMap((fixture) =>
    fixture.expected_ingredients.map((ingredient) => ingredient.name),
  );
  const lookup = await findIngredientIds(options.dbClient, expectedNames);
  const lookupErrorMessage = lookup.error?.message;
  const perFixture = fixtures.map((fixture) => {
    const result = scoreFixture(fixture, lookup.matchesByName);

    return lookupErrorMessage
      ? {
          ...result,
          resolved_count: 0,
          needs_review_count: 0,
          unresolved_count: result.expected_count,
          resolution_rate: result.expected_count === 0 ? 1 : 0,
          ingredients: result.ingredients.map((ingredient) => ({
            ...ingredient,
            resolution_status: "unresolved" as const,
            match_count: 0,
            standard_names: [],
          })),
          errors: [lookupErrorMessage],
        }
      : result;
  });
  const categoryAvg = Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      average(
        perFixture
          .filter((fixture) => fixture.category === category)
          .map((fixture) => fixture.resolution_rate),
      ),
    ]),
  ) as Record<YoutubeCorpusCategory, number>;
  const categoryCounts = Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      perFixture.filter((fixture) => fixture.category === category).length,
    ]),
  ) as Record<YoutubeCorpusCategory, number>;
  const expectedCount = perFixture.reduce((sum, fixture) => sum + fixture.expected_count, 0);
  const resolvedCount = perFixture.reduce((sum, fixture) => sum + fixture.resolved_count, 0);
  const needsReviewCount = perFixture.reduce((sum, fixture) => sum + fixture.needs_review_count, 0);
  const unresolvedCount = perFixture.reduce((sum, fixture) => sum + fixture.unresolved_count, 0);

  return {
    run_id: options.runId,
    timestamp: options.timestamp,
    dictionary_version: options.dictionaryVersion,
    corpus_version: options.corpusVersion,
    per_fixture: perFixture,
    aggregate: {
      corpus_avg_resolution_rate: average(perFixture.map((fixture) => fixture.resolution_rate)),
      ingredient_resolution_rate: expectedCount === 0 ? 1 : roundScore(resolvedCount / expectedCount),
      category_avg: categoryAvg,
      category_counts: categoryCounts,
      expected_count: expectedCount,
      resolved_count: resolvedCount,
      needs_review_count: needsReviewCount,
      unresolved_count: unresolvedCount,
      warnings: validation.warnings,
    },
  };
}
