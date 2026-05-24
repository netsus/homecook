import {
  adaptCandidateToFlatDraft,
  parseYoutubeRecipeDescription,
  selectPrimaryRecipeCandidate,
  type FlatDraftIngredient,
} from "@/lib/server/youtube-description-parser";

export type YoutubeCorpusCategory =
  | "structured"
  | "semi-structured"
  | "weak"
  | "noise"
  | "multi-recipe";

export type YoutubeCorpusSource = "real-description" | "synthetic";

export type YoutubeExpectedIngredientType = "QUANT" | "TO_TASTE";

export interface YoutubeExpectedIngredient {
  name: string;
  amount: number | null;
  unit: string | null;
  type: YoutubeExpectedIngredientType;
}

export interface YoutubeExpectedStep {
  step_number: number;
  instruction_pattern: string;
}

export interface YoutubeCorpusFixture {
  id: string;
  category: YoutubeCorpusCategory;
  source: YoutubeCorpusSource;
  channel_hint?: string;
  description: string;
  expected_ingredients: YoutubeExpectedIngredient[];
  expected_steps: YoutubeExpectedStep[];
  metadata: {
    video_category: "recipe" | "not-recipe";
    has_component_structure: boolean;
    multi_recipe: boolean;
    notes?: string;
  };
}

export interface YoutubeParserOutput {
  ingredients: Array<Pick<FlatDraftIngredient, "name" | "amount" | "unit">>;
  steps: string[];
}

export interface YoutubeScore {
  precision: number;
  recall: number;
  f1: number;
}

export interface YoutubeCorpusFixtureResult {
  id: string;
  category: YoutubeCorpusCategory;
  ingredients: YoutubeScore;
  steps: YoutubeScore;
  overall_f1: number;
  errors: string[];
}

export interface YoutubeCorpusReport {
  run_id: string;
  timestamp: string;
  parser_version: string;
  corpus_version: string;
  per_fixture: YoutubeCorpusFixtureResult[];
  aggregate: {
    corpus_avg_f1: number;
    category_avg: Record<YoutubeCorpusCategory, number>;
    category_counts: Record<YoutubeCorpusCategory, number>;
    warnings: string[];
  };
  wild_sample_aggregate: null | {
    corpus_avg_f1: number;
    category_avg: Partial<Record<YoutubeCorpusCategory, number>>;
  };
}

export interface YoutubeCorpusValidationResult {
  errors: string[];
  warnings: string[];
}

const CATEGORIES: YoutubeCorpusCategory[] = [
  "structured",
  "semi-structured",
  "weak",
  "noise",
  "multi-recipe",
];

const SOURCE_VALUES = new Set<YoutubeCorpusSource>(["real-description", "synthetic"]);

const SANITIZATION_PATTERNS = [
  /https?:\/\//i,
  /\bwww\./i,
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\b010[-\s]?\d{4}[-\s]?\d{4}\b/,
];

function roundScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(4));
}

function normalizeIngredientName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function isSameAmount(expected: number | null, actual: number | null) {
  if (expected === null && actual === null) return true;
  if (expected === null || actual === null) return false;

  return Math.abs(expected - actual) < 0.001;
}

function f1From(precision: number, recall: number) {
  if (precision === 0 || recall === 0) return 0;

  return (2 * precision * recall) / (precision + recall);
}

function scoreFromCredit({
  credit,
  expectedCount,
  actualCount,
}: {
  credit: number;
  expectedCount: number;
  actualCount: number;
}): YoutubeScore {
  if (expectedCount === 0 && actualCount === 0) {
    return { precision: 1, recall: 1, f1: 1 };
  }

  if (expectedCount === 0 || actualCount === 0) {
    return { precision: 0, recall: 0, f1: 0 };
  }

  const precision = credit / actualCount;
  const recall = credit / expectedCount;

  return {
    precision: roundScore(precision),
    recall: roundScore(recall),
    f1: roundScore(f1From(precision, recall)),
  };
}

export function scoreIngredientMatches(
  expectedIngredients: YoutubeExpectedIngredient[],
  actualIngredients: YoutubeParserOutput["ingredients"],
): YoutubeScore {
  const remaining = actualIngredients.map((ingredient, index) => ({
    index,
    name: normalizeIngredientName(ingredient.name),
    amount: ingredient.amount,
    unit: ingredient.unit,
  }));
  let credit = 0;

  for (const expected of expectedIngredients) {
    const expectedName = normalizeIngredientName(expected.name);
    const actualIndex = remaining.findIndex((ingredient) => ingredient.name === expectedName);

    if (actualIndex === -1) {
      continue;
    }

    const [actual] = remaining.splice(actualIndex, 1);
    const unitMatches = (expected.unit ?? null) === (actual.unit ?? null);
    const amountMatches = isSameAmount(expected.amount, actual.amount ?? null);

    credit += unitMatches && amountMatches ? 1 : 0.5;
  }

  return scoreFromCredit({
    credit,
    expectedCount: expectedIngredients.length,
    actualCount: actualIngredients.length,
  });
}

export function scoreStepMatches(
  expectedSteps: YoutubeExpectedStep[],
  actualSteps: string[],
): YoutubeScore {
  const remaining = actualSteps.map((instruction, index) => ({ instruction, index }));
  let credit = 0;

  for (const expected of expectedSteps) {
    const pattern = new RegExp(expected.instruction_pattern, "i");
    const actualIndex = remaining.findIndex((step) => pattern.test(step.instruction));

    if (actualIndex === -1) {
      continue;
    }

    const [actual] = remaining.splice(actualIndex, 1);
    credit += actual.index === expected.step_number - 1 ? 1 : 0.7;
  }

  return scoreFromCredit({
    credit,
    expectedCount: expectedSteps.length,
    actualCount: actualSteps.length,
  });
}

export function parseFixtureWithYoutubeParserV2(fixture: YoutubeCorpusFixture): YoutubeParserOutput {
  const document = parseYoutubeRecipeDescription({
    title: fixture.id,
    description: fixture.description,
  });
  const draft = adaptCandidateToFlatDraft(selectPrimaryRecipeCandidate(document));

  return {
    ingredients: draft.ingredients.map((ingredient) => ({
      name: ingredient.name,
      amount: ingredient.amount,
      unit: ingredient.unit,
    })),
    steps: draft.steps,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateFixtureShape(fixture: unknown, index: number) {
  const errors: string[] = [];

  if (!isRecord(fixture)) {
    return [`fixture[${index}] must be an object`];
  }

  if (typeof fixture.id !== "string" || fixture.id.trim().length === 0) {
    errors.push(`fixture[${index}].id is required`);
  }

  if (!CATEGORIES.includes(fixture.category as YoutubeCorpusCategory)) {
    errors.push(`fixture[${index}].category is invalid`);
  }

  if (!SOURCE_VALUES.has(fixture.source as YoutubeCorpusSource)) {
    errors.push(`fixture[${index}].source is invalid`);
  }

  if (typeof fixture.description !== "string" || fixture.description.trim().length === 0) {
    errors.push(`fixture[${index}].description is required`);
  }

  if (!Array.isArray(fixture.expected_ingredients)) {
    errors.push(`fixture[${index}].expected_ingredients must be an array`);
  }

  if (!Array.isArray(fixture.expected_steps)) {
    errors.push(`fixture[${index}].expected_steps must be an array`);
  }

  if (!isRecord(fixture.metadata)) {
    errors.push(`fixture[${index}].metadata is required`);
  }

  return errors;
}

export function validateYoutubeCorpusFixtures(fixtures: unknown[]): YoutubeCorpusValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();
  const categoryCounts = Object.fromEntries(CATEGORIES.map((category) => [category, 0])) as Record<
    YoutubeCorpusCategory,
    number
  >;
  let realDescriptionCount = 0;

  fixtures.forEach((fixture, index) => {
    errors.push(...validateFixtureShape(fixture, index));

    if (!isRecord(fixture)) return;

    if (typeof fixture.id === "string") {
      if (ids.has(fixture.id)) {
        errors.push(`fixture id is duplicated: ${fixture.id}`);
      }
      ids.add(fixture.id);
    }

    if (CATEGORIES.includes(fixture.category as YoutubeCorpusCategory)) {
      categoryCounts[fixture.category as YoutubeCorpusCategory] += 1;
    }

    if (fixture.source === "real-description") {
      realDescriptionCount += 1;
    }

    if (typeof fixture.description === "string") {
      for (const pattern of SANITIZATION_PATTERNS) {
        if (pattern.test(fixture.description)) {
          errors.push(`${fixture.id ?? `fixture[${index}]`} contains unsanitized personal/link data`);
          break;
        }
      }
    }
  });

  if (fixtures.length < 36) {
    warnings.push(`fixture count is below 36: ${fixtures.length}`);
  }

  for (const category of CATEGORIES) {
    if (categoryCounts[category] < 3) {
      warnings.push(`${category} fixture count is below 3: ${categoryCounts[category]}`);
    }
  }

  if (realDescriptionCount < 24) {
    warnings.push(`real-description fixture count is below 24: ${realDescriptionCount}`);
  }

  return { errors, warnings };
}

function average(values: number[]) {
  if (values.length === 0) return 0;

  return roundScore(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function scoreYoutubeCorpusFixtures(
  fixtures: YoutubeCorpusFixture[],
  options: {
    parserVersion: string;
    corpusVersion: string;
    runId: string;
    timestamp: string;
    parser: (fixture: YoutubeCorpusFixture) => YoutubeParserOutput;
  },
): YoutubeCorpusReport {
  const validation = validateYoutubeCorpusFixtures(fixtures);
  const perFixture = fixtures.map((fixture): YoutubeCorpusFixtureResult => {
    try {
      const parserOutput = options.parser(fixture);
      const ingredients = scoreIngredientMatches(fixture.expected_ingredients, parserOutput.ingredients);
      const steps = scoreStepMatches(fixture.expected_steps, parserOutput.steps);

      return {
        id: fixture.id,
        category: fixture.category,
        ingredients,
        steps,
        overall_f1: average([ingredients.f1, steps.f1]),
        errors: [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        id: fixture.id,
        category: fixture.category,
        ingredients: { precision: 0, recall: 0, f1: 0 },
        steps: { precision: 0, recall: 0, f1: 0 },
        overall_f1: 0,
        errors: [message],
      };
    }
  });
  const categoryAvg = Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      average(perFixture.filter((fixture) => fixture.category === category).map((fixture) => fixture.overall_f1)),
    ]),
  ) as Record<YoutubeCorpusCategory, number>;
  const categoryCounts = Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      perFixture.filter((fixture) => fixture.category === category).length,
    ]),
  ) as Record<YoutubeCorpusCategory, number>;

  return {
    run_id: options.runId,
    timestamp: options.timestamp,
    parser_version: options.parserVersion,
    corpus_version: options.corpusVersion,
    per_fixture: perFixture,
    aggregate: {
      corpus_avg_f1: average(perFixture.map((fixture) => fixture.overall_f1)),
      category_avg: categoryAvg,
      category_counts: categoryCounts,
      warnings: validation.warnings,
    },
    wild_sample_aggregate: null,
  };
}
