import {
  scoreIngredientMatches,
  scoreStepMatches,
  validateYoutubeCorpusFixtures,
  type YoutubeCorpusCategory,
  type YoutubeCorpusFixture,
  type YoutubeParserOutput,
  type YoutubeScore,
} from "@/lib/server/youtube-corpus-scoring";
import type {
  YoutubeDictionaryResolutionFixtureResult,
  YoutubeDictionaryResolutionReport,
} from "@/lib/server/youtube-dictionary-resolution-scoring";

export interface YoutubeImportReadinessFixtureResult {
  id: string;
  category: YoutubeCorpusCategory;
  ingredient_f1: number;
  step_f1: number;
  resolution_rate: number;
  step_completeness_rate: number;
  blocking_issue: boolean;
  import_readiness_score: number;
  ingredients: YoutubeScore;
  steps: YoutubeScore;
  parsed_ingredient_count: number;
  parsed_step_count: number;
  errors: string[];
}

export interface YoutubeImportReadinessReport {
  run_id: string;
  timestamp: string;
  parser_version: string;
  corpus_version: string;
  dictionary_version: string;
  formula: {
    ingredient_f1: number;
    step_f1: number;
    resolution_rate: number;
    step_completeness_rate: number;
    blocking_issue_reduction: number;
  };
  per_fixture: YoutubeImportReadinessFixtureResult[];
  aggregate: {
    import_readiness_score: number;
    ingredient_f1: number;
    step_f1: number;
    resolution_rate: number;
    step_completeness_rate: number;
    blocking_issue_rate: number;
    corpus_fixture_count: number;
    real_description_fixture_count: number;
    category_counts: Record<YoutubeCorpusCategory, number>;
    llm_fallback_used: false;
    external_api_used: false;
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

const READINESS_WEIGHTS = {
  ingredient_f1: 0.35,
  step_f1: 0.25,
  resolution_rate: 0.2,
  step_completeness_rate: 0.1,
  blocking_issue_reduction: 0.1,
} as const;

function roundScore(value: number) {
  if (!Number.isFinite(value)) return 0;

  return Number(value.toFixed(4));
}

function average(values: number[]) {
  if (values.length === 0) return 0;

  return roundScore(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function scoreReadiness({
  ingredientF1,
  stepF1,
  resolutionRate,
  stepCompletenessRate,
  blockingIssue,
}: {
  ingredientF1: number;
  stepF1: number;
  resolutionRate: number;
  stepCompletenessRate: number;
  blockingIssue: boolean;
}) {
  return roundScore(
    (READINESS_WEIGHTS.ingredient_f1 * ingredientF1)
      + (READINESS_WEIGHTS.step_f1 * stepF1)
      + (READINESS_WEIGHTS.resolution_rate * resolutionRate)
      + (READINESS_WEIGHTS.step_completeness_rate * stepCompletenessRate)
      + (READINESS_WEIGHTS.blocking_issue_reduction * (blockingIssue ? 0 : 1)),
  );
}

function stepCompletenessRate(fixture: YoutubeCorpusFixture, parserOutput: YoutubeParserOutput) {
  if (fixture.expected_steps.length === 0) {
    return parserOutput.steps.length === 0 ? 1 : 0;
  }

  const usableStepCount = parserOutput.steps.filter((step) => step.trim().length > 0).length;
  return roundScore(Math.min(usableStepCount / fixture.expected_steps.length, 1));
}

function hasBlockingIssue({
  fixture,
  parserOutput,
  dictionaryFixture,
}: {
  fixture: YoutubeCorpusFixture;
  parserOutput: YoutubeParserOutput;
  dictionaryFixture: YoutubeDictionaryResolutionFixtureResult | undefined;
}) {
  const isRecipe = fixture.metadata.video_category === "recipe";

  if (!isRecipe) {
    return parserOutput.ingredients.length > 0 || parserOutput.steps.length > 0;
  }

  if (fixture.expected_ingredients.length > 0 && parserOutput.ingredients.length === 0) {
    return true;
  }

  if (fixture.expected_steps.length > 0 && parserOutput.steps.length === 0) {
    return true;
  }

  return Boolean(
    dictionaryFixture
      && (dictionaryFixture.needs_review_count > 0 || dictionaryFixture.unresolved_count > 0),
  );
}

export function scoreYoutubeImportReadinessFixtures(
  fixtures: YoutubeCorpusFixture[],
  options: {
    parserVersion: string;
    corpusVersion: string;
    runId: string;
    timestamp: string;
    parser: (fixture: YoutubeCorpusFixture) => YoutubeParserOutput;
    dictionaryReport: YoutubeDictionaryResolutionReport;
  },
): YoutubeImportReadinessReport {
  const validation = validateYoutubeCorpusFixtures(fixtures);
  const dictionaryById = new Map(
    options.dictionaryReport.per_fixture.map((fixture) => [fixture.id, fixture]),
  );
  const perFixture = fixtures.map((fixture): YoutubeImportReadinessFixtureResult => {
    try {
      const parserOutput = options.parser(fixture);
      const ingredients = scoreIngredientMatches(fixture.expected_ingredients, parserOutput.ingredients);
      const steps = scoreStepMatches(fixture.expected_steps, parserOutput.steps);
      const dictionaryFixture = dictionaryById.get(fixture.id);
      const errors = dictionaryFixture ? [] : [`dictionary report is missing fixture: ${fixture.id}`];
      const resolutionRate = dictionaryFixture?.resolution_rate ?? 0;
      const completenessRate = stepCompletenessRate(fixture, parserOutput);
      const blockingIssue = errors.length > 0
        || hasBlockingIssue({ fixture, parserOutput, dictionaryFixture });

      return {
        id: fixture.id,
        category: fixture.category,
        ingredient_f1: ingredients.f1,
        step_f1: steps.f1,
        resolution_rate: resolutionRate,
        step_completeness_rate: completenessRate,
        blocking_issue: blockingIssue,
        import_readiness_score: scoreReadiness({
          ingredientF1: ingredients.f1,
          stepF1: steps.f1,
          resolutionRate,
          stepCompletenessRate: completenessRate,
          blockingIssue,
        }),
        ingredients,
        steps,
        parsed_ingredient_count: parserOutput.ingredients.length,
        parsed_step_count: parserOutput.steps.length,
        errors,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        id: fixture.id,
        category: fixture.category,
        ingredient_f1: 0,
        step_f1: 0,
        resolution_rate: 0,
        step_completeness_rate: 0,
        blocking_issue: true,
        import_readiness_score: 0,
        ingredients: { precision: 0, recall: 0, f1: 0 },
        steps: { precision: 0, recall: 0, f1: 0 },
        parsed_ingredient_count: 0,
        parsed_step_count: 0,
        errors: [message],
      };
    }
  });
  const categoryCounts = Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      perFixture.filter((fixture) => fixture.category === category).length,
    ]),
  ) as Record<YoutubeCorpusCategory, number>;
  const blockingIssueRate = roundScore(
    perFixture.filter((fixture) => fixture.blocking_issue).length / Math.max(perFixture.length, 1),
  );

  return {
    run_id: options.runId,
    timestamp: options.timestamp,
    parser_version: options.parserVersion,
    corpus_version: options.corpusVersion,
    dictionary_version: options.dictionaryReport.dictionary_version,
    formula: { ...READINESS_WEIGHTS },
    per_fixture: perFixture,
    aggregate: {
      import_readiness_score: average(
        perFixture.map((fixture) => fixture.import_readiness_score),
      ),
      ingredient_f1: average(perFixture.map((fixture) => fixture.ingredient_f1)),
      step_f1: average(perFixture.map((fixture) => fixture.step_f1)),
      resolution_rate: average(perFixture.map((fixture) => fixture.resolution_rate)),
      step_completeness_rate: average(
        perFixture.map((fixture) => fixture.step_completeness_rate),
      ),
      blocking_issue_rate: blockingIssueRate,
      corpus_fixture_count: fixtures.length,
      real_description_fixture_count: fixtures.filter((fixture) => fixture.source === "real-description").length,
      category_counts: categoryCounts,
      llm_fallback_used: false,
      external_api_used: false,
      warnings: validation.warnings,
    },
  };
}
