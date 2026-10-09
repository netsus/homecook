import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  buildIngredientLookupNameCandidates,
  buildIngredientLookupResultKey,
  normalizeIngredientSearchName,
} from "@/lib/ingredient-search";
import {
  scoreYoutubeIngredientResolutionBenchmark,
  type YoutubeIngredientResolutionObservation,
  type YoutubeIngredientResolutionReviewCase,
} from "@/lib/server/youtube-ingredient-resolution-benchmark";
import { buildExtractedIngredient, findIngredientIds } from "@/lib/server/youtube-import";

interface CatalogFixture {
  catalog_snapshot: {
    source: string;
    source_sha256: string;
    ingredients: Array<{ id: string; standard_name: string }>;
    synonyms: Array<{ ingredient_id: string; synonym: string }>;
  };
  semantic_cases: Array<YoutubeIngredientResolutionReviewCase & {
    extracted_name: string;
    golden_name: string;
    golden_aliases: string[];
    source_evidence: { original_name: string; unit: string | null; raw_text: string; snippet: string };
    adjudication: { reviewers: string[]; catalog_basis: string; reason: string };
    lookup_context?: { unit: string | null; raw_text: string | null };
    before: YoutubeIngredientResolutionObservation;
  }>;
  ambiguity_controls: Array<{
    name: string;
    expected_status: "needs_review";
    expected_candidate_ids: string[];
  }>;
  unresolved_controls: string[];
}

const fixture = JSON.parse(readFileSync(join(
  process.cwd(),
  "tests/fixtures/youtube-ingredient-resolution/reviewed-v1.json",
), "utf8")) as CatalogFixture;

function createFilteringTable<T extends object>(rows: T[]) {
  const state = { column: "", values: [] as string[] };
  const query = {
    order: vi.fn(() => query),
    range: vi.fn(() => query),
    in: vi.fn((column: string, values: string[]) => {
      state.column = column;
      state.values = values;
      return query;
    }),
    then(onFulfilled?: (value: { data: T[]; error: null }) => unknown) {
      return Promise.resolve({
        data: rows.filter((row) => !state.column
          || state.values.includes(String((row as Record<string, unknown>)[state.column]))),
        error: null,
      }).then(onFulfilled);
    },
  };
  return { select: vi.fn(() => query) };
}

function createFixedCatalogDb() {
  const ingredientById = new Map(fixture.catalog_snapshot.ingredients.map((row) => [row.id, row]));
  const ingredients = fixture.catalog_snapshot.ingredients.map((row) => ({
    ...row,
    search_name: normalizeIngredientSearchName(row.standard_name),
  }));
  const synonyms = fixture.catalog_snapshot.synonyms.map((row) => ({
    synonym: row.synonym,
    search_name: normalizeIngredientSearchName(row.synonym),
    ingredients: ingredientById.get(row.ingredient_id) ?? null,
  }));
  return {
    from: vi.fn((table: string) => {
      if (table === "ingredient_catalog_aliases") return createFilteringTable([]);
      if (table === "ingredients") return createFilteringTable(ingredients);
      if (table === "ingredient_synonyms") return createFilteringTable(synonyms);
      throw new Error(`unexpected table: ${table}`);
    }),
  };
}

function observation(
  name: string,
  matchesByName: Awaited<ReturnType<typeof findIngredientIds>>["matchesByName"],
): YoutubeIngredientResolutionObservation {
  const candidates = [...(matchesByName.get(name)?.keys() ?? [])].sort();
  return {
    status: candidates.length === 0 ? "unresolved" : candidates.length === 1 ? "resolved" : "needs_review",
    candidate_ids: candidates,
    final_id: candidates.length === 1 ? candidates[0] : null,
  };
}

describe("reviewed YouTube ingredient DB resolution benchmark", () => {
  it("pins the reviewed catalog snapshot and derives strict mismatches from copied frozen rows", () => {
    const catalogBytes = readFileSync(join(process.cwd(), fixture.catalog_snapshot.source));
    expect(createHash("sha256").update(catalogBytes).digest("hex"))
      .toBe(fixture.catalog_snapshot.source_sha256);
    const catalog = JSON.parse(catalogBytes.toString("utf8")) as {
      entries: Array<{ ingredient_id: string }>;
    };
    const reviewedIds = new Set(catalog.entries.map((entry) => entry.ingredient_id));
    for (const ingredient of fixture.catalog_snapshot.ingredients.slice(0, 6)) {
      expect(reviewedIds.has(ingredient.id), ingredient.standard_name).toBe(true);
    }

    for (const reviewCase of fixture.semantic_cases) {
      const acceptedKeys = [reviewCase.golden_name, ...reviewCase.golden_aliases]
        .map(normalizeIngredientSearchName);
      const derivedStrictMatch = acceptedKeys.includes(
        normalizeIngredientSearchName(reviewCase.extracted_name),
      );
      expect(reviewCase.frozen_strict_name_match).toBe(derivedStrictMatch);
      expect(reviewCase.source_evidence.original_name.length).toBeGreaterThan(0);
      expect(reviewCase.source_evidence.snippet.length).toBeGreaterThan(0);
      expect(reviewCase.adjudication.reviewers.length).toBeGreaterThanOrEqual(2);
      expect(reviewCase.adjudication.catalog_basis).toContain(
        reviewCase.acceptable_candidate_ids[0],
      );
      expect(reviewCase.adjudication.reason.length).toBeGreaterThan(0);
    }
  });

  it("generates only a bounded size-wrapper fallback and never rewrites identity-bearing names", () => {
    expect(buildIngredientLookupNameCandidates("큰 사이즈 두부")).toEqual(["큰 사이즈 두부", "두부"]);
    expect(buildIngredientLookupNameCandidates("작은 사이즈 두부")).toEqual(["작은 사이즈 두부", "두부"]);
    expect(buildIngredientLookupNameCandidates({
      name: "스파게티",
      unit: "g",
      rawText: "Spaghetti 250g",
    })).toEqual(["스파게티", "스파게티면"]);
    for (const name of [
      "큰술", "큰느타리버섯", "곰곰 두부", "부침용 두부", "삶은 닭가슴살",
      "맛술(미림)", "말린 바질 잎", "엑스트라버진 올리브 오일",
    ]) expect(buildIngredientLookupNameCandidates(name)).toEqual([name]);
    expect(buildIngredientLookupNameCandidates({
      name: "스파게티",
      unit: "인분",
      rawText: "Spaghetti",
    })).toEqual(["스파게티"]);
    for (const rawText of [
      "Spaghetti sauce 250g",
      "Cooked Spaghetti 250g",
      "Barilla Spaghetti 250g",
      "Spaghetti squash 250g",
      "Spaghetti 250kg",
      "Spaghetti and sauce 250g",
    ]) {
      expect(buildIngredientLookupNameCandidates({
        name: "스파게티",
        unit: "g",
        rawText,
      }), rawText).toEqual(["스파게티"]);
    }
  });

  it("improves correct final linking from 2/5 to 5/5 while preserving frozen strict mismatches", async () => {
    const names = fixture.semantic_cases.map((row) => row.extracted_name);
    const lookupInputs = fixture.semantic_cases.map((row) => ({
      name: row.extracted_name,
      unit: row.lookup_context?.unit,
      rawText: row.lookup_context?.raw_text,
    }));
    const lookup = await findIngredientIds(createFixedCatalogDb(), lookupInputs);
    expect(lookup.error).toBeNull();
    const after = new Map(names.map((name, index) => [
      name,
      observation(buildIngredientLookupResultKey(lookupInputs[index]), lookup.matchesByName),
    ]));
    const before = new Map(fixture.semantic_cases.map((row) => [row.extracted_name, row.before]));
    const beforeReport = scoreYoutubeIngredientResolutionBenchmark(fixture.semantic_cases, before);
    const afterReport = scoreYoutubeIngredientResolutionBenchmark(fixture.semantic_cases, after);

    expect(beforeReport).toMatchObject({
      strict_name_matches: { numerator: 0, denominator: 5, rate: 0 },
      reviewed_semantic_equivalence: { numerator: 5, denominator: 5, rate: 1 },
      resolved: { numerator: 2, denominator: 5, rate: 0.4 },
      correct_final_ids: { numerator: 2, denominator: 5, rate: 0.4 },
      false_links_overall: { numerator: 0, denominator: 5, rate: 0 },
      false_links_among_linked: { numerator: 0, denominator: 2, rate: 0 },
    });
    expect(afterReport).toMatchObject({
      strict_name_matches: { numerator: 0, denominator: 5, rate: 0 },
      reviewed_semantic_equivalence: { numerator: 5, denominator: 5, rate: 1 },
      candidate_semantic_recall: { numerator: 5, denominator: 5, rate: 1 },
      resolved: { numerator: 5, denominator: 5, rate: 1 },
      correct_final_ids: { numerator: 5, denominator: 5, rate: 1 },
      false_links_overall: { numerator: 0, denominator: 5, rate: 0 },
      false_links_among_linked: { numerator: 0, denominator: 5, rate: 0 },
      expected_outcomes: { numerator: 5, denominator: 5, rate: 1 },
    });
    expect(after.get("스파게티")).toEqual({
      status: "resolved",
      candidate_ids: ["3b93c08e-fb48-4eae-8595-f5e5789c52ab"],
      final_id: "3b93c08e-fb48-4eae-8595-f5e5789c52ab",
    });
  });

  it("keeps ambiguity and non-equivalent identity modifiers unresolved", async () => {
    const names = [
      ...fixture.ambiguity_controls.map((row) => row.name),
      ...fixture.unresolved_controls,
      "스파게티",
    ];
    const lookup = await findIngredientIds(createFixedCatalogDb(), names);
    expect(lookup.error).toBeNull();

    for (const control of fixture.ambiguity_controls) {
      expect(observation(control.name, lookup.matchesByName)).toEqual({
        status: control.expected_status,
        candidate_ids: [...control.expected_candidate_ids].sort(),
        final_id: null,
      });
    }
    for (const name of fixture.unresolved_controls) {
      expect(observation(name, lookup.matchesByName)).toEqual({
        status: "unresolved", candidate_ids: [], final_id: null,
      });
    }
  });

  it("resolves same-name occurrences independently without leaking context", async () => {
    const strong = { name: "스파게티", unit: "g", rawText: "Spaghetti 250g" };
    const weak = { name: "스파게티", unit: null, rawText: "오늘은 스파게티를 만들어요" };
    const lookup = await findIngredientIds(createFixedCatalogDb(), [strong, weak]);
    expect(observation(buildIngredientLookupResultKey(strong), lookup.matchesByName)).toEqual({
      status: "resolved",
      candidate_ids: ["3b93c08e-fb48-4eae-8595-f5e5789c52ab"],
      final_id: "3b93c08e-fb48-4eae-8595-f5e5789c52ab",
    });
    expect(observation(buildIngredientLookupResultKey(weak), lookup.matchesByName)).toEqual({
      status: "unresolved",
      candidate_ids: [],
      final_id: null,
    });
  });

  it("keeps extracted size and quantity text after lookup-only fallback", async () => {
    const name = "큰 사이즈 두부";
    const lookup = await findIngredientIds(createFixedCatalogDb(), [name]);
    const ingredient = buildExtractedIngredient({
      matchesByName: lookup.matchesByName,
      name,
      amount: 1,
      unit: "모",
      ingredientType: "QUANT",
      displayText: "큰 사이즈 두부 1모(550g)",
      sortOrder: 1,
      scalable: true,
      confidence: 0.9,
      rawText: "큰 사이즈 두부 1모(550g)",
    });
    expect(ingredient).toMatchObject({
      ingredient_id: "550e8400-e29b-41d4-a716-446655440017",
      standard_name: "두부",
      amount: 1,
      unit: "모",
      display_text: "큰 사이즈 두부 1모(550g)",
      raw_text: "큰 사이즈 두부 1모(550g)",
      resolution_status: "resolved",
    });
  });
});
