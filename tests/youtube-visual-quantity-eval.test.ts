import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

type FixtureIngredient = {
  name: string;
  amount: number | null;
  unit: string | null;
  quantity_source?: string;
  quantity_review_required?: boolean;
  evidence_refs?: Array<{
    source_method?: string;
    source_provider?: string;
    snippet?: string;
  }>;
};

type FixtureCase = {
  case_id: string;
  baseline: FixtureIngredient[];
  enriched: FixtureIngredient[];
  candidate_child?: FixtureIngredient[];
};

type VisualQuantityFixture = {
  schema_version: string;
  cases: FixtureCase[];
  provider_failure_fallback: {
    baseline: FixtureIngredient[];
    after_failure: FixtureIngredient[];
  };
};

function hasQuantity(ingredient: FixtureIngredient) {
  return ingredient.amount !== null && ingredient.unit !== null;
}

function coverageRatio(ingredients: FixtureIngredient[]) {
  return ingredients.filter(hasQuantity).length / ingredients.length;
}

function readFixture() {
  return JSON.parse(
    readFileSync("tests/fixtures/youtube-visual-quantity/visual-quantity-v1.json", "utf8"),
  ) as VisualQuantityFixture;
}

describe("YouTube visual quantity eval fixture", () => {
  it("improves triggered fixture amount coverage by at least 0.25", () => {
    const fixture = readFixture();
    const baselineIngredients = fixture.cases.flatMap((item) => item.baseline);
    const enrichedIngredients = fixture.cases.flatMap((item) => item.enriched);

    expect(coverageRatio(enrichedIngredients) - coverageRatio(baselineIngredients)).toBeGreaterThanOrEqual(0.25);
  });

  it("keeps false explicit quantity count at zero", () => {
    const fixture = readFixture();
    const explicitSources = new Set(["visual_explicit", "unit_normalized", "ingredient_default"]);
    const falseExplicitCount = fixture.cases
      .flatMap((item) => item.enriched)
      .filter((ingredient) => explicitSources.has(ingredient.quantity_source ?? ""))
      .filter((ingredient) =>
        !ingredient.evidence_refs?.some((ref) =>
          ref.source_method === "visual"
          && typeof ref.source_provider === "string"
          && typeof ref.snippet === "string"
          && ref.snippet.trim().length > 0,
        ),
      ).length;

    expect(falseExplicitCount).toBe(0);
  });

  it("requires human review for inferred quantities and preserves candidate child quantity fields", () => {
    const fixture = readFixture();
    const inferred = fixture.cases
      .flatMap((item) => item.enriched)
      .filter((ingredient) => ingredient.quantity_source === "recipe_inferred");

    expect(inferred.length).toBeGreaterThan(0);
    expect(inferred.every((ingredient) => ingredient.quantity_review_required === true)).toBe(true);

    const multiCandidate = fixture.cases.find((item) => item.case_id === "multi-candidate");
    expect(multiCandidate?.candidate_child).toEqual(multiCandidate?.enriched.map((ingredient) => ({
      name: ingredient.name,
      amount: ingredient.amount,
      unit: ingredient.unit,
      quantity_source: ingredient.quantity_source,
      quantity_review_required: ingredient.quantity_review_required,
    })));
  });

  it("falls back to public-text baseline when the visual provider fails", () => {
    const fixture = readFixture();

    expect(fixture.provider_failure_fallback.after_failure).toEqual(fixture.provider_failure_fallback.baseline);
  });
});
