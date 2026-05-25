import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { INGREDIENT_CATEGORY_LABELS } from "@/lib/ingredient-categories";
import {
  scoreYoutubeDictionaryResolutionFixtures,
  type YoutubeDictionaryResolutionReport,
} from "@/lib/server/youtube-dictionary-resolution-scoring";
import type { YoutubeCorpusFixture } from "@/lib/server/youtube-corpus-scoring";

import corpusData from "@/tests/fixtures/youtube-corpus/corpus-v1.json";

interface QueryError {
  code?: string;
  message: string;
}

interface IngredientSeedRow {
  id: string;
  standard_name: string;
}

interface SynonymSeedRow {
  synonym: string;
  ingredients: IngredientSeedRow | IngredientSeedRow[] | null;
}

const corpus = corpusData as YoutubeCorpusFixture[];
const slice21MigrationPaths = [
  "supabase/migrations/20260522070000_21_ingredient_dictionary_synonyms.sql",
  "supabase/migrations/20260522073000_21_youtube_pork_galbi_ingredient_seed.sql",
];
const slice26MigrationPath =
  "supabase/migrations/20260525170000_26_youtube_dictionary_seed_uplift.sql";
const dictionaryReportPath = join(
  process.cwd(),
  "tests/fixtures/youtube-corpus/reports/dictionary-resolution-v1.json",
);

function extractValueBody(sql: string, marker: string) {
  const markerIndex = sql.indexOf(marker);
  if (markerIndex === -1) {
    return "";
  }

  const valuesIndex = sql.indexOf("values", markerIndex);
  const endIndex = sql.indexOf("on conflict", valuesIndex);

  return valuesIndex === -1 || endIndex === -1 ? "" : sql.slice(valuesIndex, endIndex);
}

function extractTuples(body: string) {
  return [...body.matchAll(/\('([^']+)'\s*,\s*'([^']+)'(?:\s*,\s*(null|'[^']+'))?\)/g)]
    .map((match) => [match[1], match[2]] as const);
}

function parseIngredientSeeds(paths: string[]) {
  const standardNames = new Set<string>();
  const synonymPairs: Array<{ standardName: string; synonym: string }> = [];

  for (const path of paths) {
    const sql = readFileSync(path, "utf8");

    for (const [standardName] of extractTuples(
      extractValueBody(sql, "insert into public.ingredients"),
    )) {
      standardNames.add(standardName);
    }

    for (const [standardName, synonym] of extractTuples(
      extractValueBody(sql, "insert into public.ingredient_synonyms"),
    )) {
      synonymPairs.push({ standardName, synonym: synonym.trim().toLowerCase() });
    }
  }

  const ingredientRows = [...standardNames].map((standardName, index) => ({
    id: `ingredient-${index + 1}`,
    standard_name: standardName,
  }));
  const idByName = new Map(ingredientRows.map((row) => [row.standard_name, row]));
  const synonymRows: SynonymSeedRow[] = [];

  for (const pair of synonymPairs) {
    const ingredient = idByName.get(pair.standardName);
    if (!ingredient) {
      continue;
    }

    synonymRows.push({
      synonym: pair.synonym,
      ingredients: ingredient,
    });
  }

  return {
    ingredientRows,
    synonymRows,
  };
}

function createFilteringTable<T extends object>(
  rows: T[],
  {
    error = null,
  }: {
    error?: QueryError | null;
  } = {},
) {
  const state = {
    column: "",
    values: [] as string[],
  };
  const query = {
    in: vi.fn((column: string, values: string[]) => {
      state.column = column;
      state.values = values;
      return query;
    }),
    then(
      onFulfilled?: (value: { data: T[] | null; error: QueryError | null }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      const data = error
        ? null
        : rows.filter((row) => state.values.includes(String((row as Record<string, unknown>)[state.column])));

      return Promise.resolve({ data, error }).then(onFulfilled, onRejected);
    },
  };

  return {
    select: vi.fn(() => query),
  };
}

function createDictionaryDb({
  ingredients,
  synonyms,
}: {
  ingredients: IngredientSeedRow[];
  synonyms: SynonymSeedRow[];
}) {
  const ingredientsTable = createFilteringTable(ingredients);
  const synonymsTable = createFilteringTable(synonyms);

  return {
    from: vi.fn((table: string) => {
      if (table === "ingredients") return ingredientsTable;
      if (table === "ingredient_synonyms") return synonymsTable;
      throw new Error(`unexpected table: ${table}`);
    }),
  };
}

describe("YouTube dictionary resolution scoring", () => {
  it("classifies resolved, needs_review, and unresolved expected ingredients independently from parser F1", async () => {
    const report = await scoreYoutubeDictionaryResolutionFixtures(
      [
        {
          id: "dictionary-unit",
          category: "structured",
          source: "synthetic",
          description: "재료\n간장 1스푼\n파 1대\n새재료 1개",
          expected_ingredients: [
            { name: "간장", amount: 1, unit: "스푼", type: "QUANT" },
            { name: "파", amount: 1, unit: "대", type: "QUANT" },
            { name: "새재료", amount: 1, unit: "개", type: "QUANT" },
          ],
          expected_steps: [],
          metadata: { video_category: "recipe", has_component_structure: true, multi_recipe: false },
        },
      ],
      {
        dictionaryVersion: "unit",
        corpusVersion: "unit",
        runId: "unit",
        timestamp: "2026-05-25T00:00:00.000Z",
        dbClient: createDictionaryDb({
          ingredients: [
            { id: "ingredient-1", standard_name: "간장" },
            { id: "ingredient-2", standard_name: "대파" },
          ],
          synonyms: [
            { synonym: "파", ingredients: { id: "ingredient-2", standard_name: "대파" } },
            { synonym: "파", ingredients: { id: "ingredient-3", standard_name: "쪽파" } },
          ],
        }),
      },
    );

    expect(report.per_fixture[0]).toMatchObject({
      id: "dictionary-unit",
      expected_count: 3,
      resolved_count: 1,
      needs_review_count: 1,
      unresolved_count: 1,
      resolution_rate: 0.3333,
    });
    expect(report.per_fixture[0].ingredients).toEqual([
      {
        name: "간장",
        resolution_status: "resolved",
        match_count: 1,
        standard_names: ["간장"],
      },
      {
        name: "파",
        resolution_status: "needs_review",
        match_count: 2,
        standard_names: ["대파", "쪽파"],
      },
      {
        name: "새재료",
        resolution_status: "unresolved",
        match_count: 0,
        standard_names: [],
      },
    ]);
    expect(report.aggregate.ingredient_resolution_rate).toBe(0.3333);
  });

  it("measures corpus dictionary resolution before and after the slice 26 seed migration", async () => {
    const preSeed = parseIngredientSeeds(slice21MigrationPaths);
    const postSeed = parseIngredientSeeds([...slice21MigrationPaths, slice26MigrationPath]);

    const preReport = await scoreYoutubeDictionaryResolutionFixtures(corpus, {
      dictionaryVersion: "slice21-seed",
      corpusVersion: "v1",
      runId: "dictionary-resolution-pre-seed-v1",
      timestamp: "2026-05-25T00:00:00.000Z",
      dbClient: createDictionaryDb({
        ingredients: preSeed.ingredientRows,
        synonyms: preSeed.synonymRows,
      }),
    });
    const postReport = await scoreYoutubeDictionaryResolutionFixtures(corpus, {
      dictionaryVersion: "slice26-seed",
      corpusVersion: "v1",
      runId: "dictionary-resolution-post-seed-v1",
      timestamp: "2026-05-25T00:00:00.000Z",
      dbClient: createDictionaryDb({
        ingredients: postSeed.ingredientRows,
        synonyms: postSeed.synonymRows,
      }),
    });

    if (process.env.UPDATE_YOUTUBE_DICTIONARY_RESOLUTION === "1") {
      writeFileSync(
        dictionaryReportPath,
        `${JSON.stringify({ pre_seed: preReport, post_seed: postReport }, null, 2)}\n`,
      );
    }

    expect(preReport.aggregate.ingredient_resolution_rate).toBeLessThan(0.6);
    expect(postReport.aggregate.ingredient_resolution_rate).toBeGreaterThanOrEqual(0.95);
    expect(postReport.aggregate.ingredient_resolution_rate)
      .toBeGreaterThan(preReport.aggregate.ingredient_resolution_rate);
    expect(postReport.aggregate.needs_review_count).toBe(0);
    expect(postReport.aggregate.unresolved_count).toBe(0);

    expect(existsSync(dictionaryReportPath)).toBe(true);
    const checkedInReport = JSON.parse(
      readFileSync(dictionaryReportPath, "utf8"),
    ) as {
      pre_seed: YoutubeDictionaryResolutionReport;
      post_seed: YoutubeDictionaryResolutionReport;
    };

    expect(checkedInReport).toEqual({
      pre_seed: preReport,
      post_seed: postReport,
    });
  });

  it("keeps the slice 26 seed migration DML-only, idempotent, and non-ambiguous for existing aliases", () => {
    const migration = readFileSync(slice26MigrationPath, "utf8");
    const ingredientTuples = extractTuples(
      extractValueBody(migration, "insert into public.ingredients"),
    );
    const slice26Ingredients = ingredientTuples.map(([standardName]) => standardName);
    const allowedCategories = new Set<string>(INGREDIENT_CATEGORY_LABELS);

    expect(migration).toContain("on conflict (standard_name) do nothing");
    expect(migration).toContain("on conflict (ingredient_id, synonym) do nothing");
    expect(migration).toContain("lower(trim(v.synonym))");
    expect(migration).not.toMatch(/\bcreate\s+(table|index|policy|function|type)\b/i);
    expect(migration).not.toMatch(/on conflict \(standard_name\) do update/i);
    expect(ingredientTuples.every(([, category]) => allowedCategories.has(category))).toBe(true);
    expect(slice26Ingredients).toEqual(expect.arrayContaining(["두부", "고추장", "양파"]));
    expect(slice26Ingredients).not.toEqual(expect.arrayContaining(["국간장", "오이", "올리브오일"]));
  });
});
