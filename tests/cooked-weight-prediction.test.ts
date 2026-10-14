import { describe, expect, it } from "vitest";

import {
  predictCookedWeight,
  USDA_2014_BEEF_CRUMBLES_RULE,
  type CookedWeightFact,
  type CookedWeightInput,
  type CookedWeightRow,
  type CookedWeightSegment,
  type CookedWeightYieldRule,
} from "@/lib/server/cooked-weight-prediction";

function confirmed<T extends string | number>(value: T): CookedWeightFact<T> {
  return { value, status: "confirmed", evidenceRef: "fixture-confirmed-context" };
}

function row(rowKey: string, grams: number, patch: Partial<CookedWeightRow> = {}): CookedWeightRow {
  return {
    rowKey, sourceKind: "ingredient", sourceId: `ingredient-${rowKey}`, sourceVersion: "source-v1",
    amount: grams, unit: "g", quantityKind: "quantitative", quantityOrigin: "planned", grams,
    gramsEvidence: { kind: "direct_mass", status: "confirmed", evidenceId: null, version: null, quality: "exact" },
    preparationState: confirmed("raw"), role: confirmed("food"), foodIdentity: confirmed("fixture-food"),
    ...patch,
  };
}

function segment(rowKeys: string[], patch: Partial<CookedWeightSegment> = {}): CookedWeightSegment {
  return {
    id: "segment-1", rowKeys, method: confirmed("no_heat"), boundary: confirmed("entire_edible"),
    drainage: confirmed("none"), addedMedia: confirmed("none"),
    protocol: { value: null, status: "unknown", evidenceRef: null },
    transformation: { kind: "closed_mix" }, ...patch,
  };
}

function input(rows: CookedWeightRow[], segments = [segment(rows.map(item => item.rowKey))]): CookedWeightInput {
  return { recipeSnapshotId: "snapshot-v1", cookingServings: 3, rows, segments };
}

function usdaInput(): CookedWeightInput {
  const rule = USDA_2014_BEEF_CRUMBLES_RULE;
  return input([row("beef", 100, { foodIdentity: confirmed(rule.foodIdentity) })], [segment(["beef"], {
    method: confirmed(rule.method), boundary: confirmed(rule.boundary), drainage: confirmed(rule.drainage),
    addedMedia: confirmed(rule.addedMedia), protocol: confirmed(rule.protocol),
    transformation: { kind: "yield", ruleId: rule.id },
  })]);
}

// This is a test-supplied scalar, not an enabled Bognár rule or a licence claim.
const riceFixtureRule: CookedWeightYieldRule = {
  id: "fixture-rice-absorption", version: "fixture-v1", availability: "test_fixture", factor: 2.98,
  foodIdentity: "fixture-dry-rice", inputState: "dry_raw", method: "boiling", boundary: "drained_edible",
  drainage: "drained", addedMedia: "water", protocol: "fixture-rice-absorption",
  sourceUrl: "fixture:explicit-test-coefficient", sourceChecksum: null, rights: "test_fixture",
};

function riceInput(water = 300): CookedWeightInput {
  return input([
    row("rice", 100, { preparationState: confirmed("dry_raw"), foodIdentity: confirmed(riceFixtureRule.foodIdentity) }),
    row("water", water, { role: confirmed("cooking_water") }),
  ], [segment(["rice", "water"], {
    method: confirmed("boiling"), boundary: confirmed("drained_edible"), drainage: confirmed("drained"),
    addedMedia: confirmed("water"), protocol: confirmed(riceFixtureRule.protocol),
    transformation: { kind: "yield", ruleId: riceFixtureRule.id },
  })]);
}

function expectUnavailable(value: ReturnType<typeof predictCookedWeight>, code: string) {
  expect(value.totalGrams).toBeNull();
  expect(value.status).toBe("unavailable");
  expect(value.reasons.some(reason => reason.code === code)).toBe(true);
}

describe("bounded cooked weight prediction", () => {
  it("allows unknown food/media roles only in a grounded inferred MIX and keeps assumptions frozen", () => {
    const inferred = <T extends string | number>(value: T): CookedWeightFact<T> => ({ value, status: "inferred", evidenceRef: "fixture-inferred-context" });
    const unknown = { value: null, status: "unknown", evidenceRef: null } as const;
    const mix = segment(["a"], { method: inferred("no_heat"), boundary: inferred("entire_edible"), drainage: inferred("none"),
      protocol: inferred("snapshot-mix-only-v1"), addedMedia: unknown, transformation: { kind: "inferred_closed_mix" } });
    const result = predictCookedWeight(input([row("a", 200, { role: unknown, preparationState: unknown, foodIdentity: unknown })], [mix]));
    expect(result.totalGrams).toBe(200);
    expect(result.assumptions).toHaveLength(3);
    expect(Object.isFrozen(result.assumptions)).toBe(true);
    expectUnavailable(predictCookedWeight(input([row("a", 200, { role: unknown })])), "row_role_unconfirmed");
    expect(predictCookedWeight(input([row("a", 200)], [{ ...mix, method: unknown }])).totalGrams).toBeNull();
    expect(predictCookedWeight(input([row("a", 200, { grams: null })], [mix])).totalGrams).toBeNull();
    expect(result.learningEligible).toBe(false);
  });

  it("uses a confirmed closed edible boundary without a loss coefficient", () => {
    const result = predictCookedWeight(input([row("a", 150), row("b", 50)]));
    expect(result.totalGrams).toBe(200);
    expect(result.status).toBe("estimated");
    expect(result.scope).toBe("candidate");
    expect(result.learningEligible).toBe(false);
    expect(result.appliedRules).toEqual([]);
  });

  it("preserves internal precision and does not scale already prepared batch quantities again", () => {
    const source = input([row("a", 0.123456), row("b", 0.654321)]);
    const result = predictCookedWeight(source);
    expect(result.totalGrams).toBeCloseTo(0.777777, 12);
    expect(result.input?.cookingServings).toBe(3);
    expect(result.input?.rows[0].amount).toBe(0.123456);
  });

  it("converts no new units and validates direct kg evidence against the supplied grams", () => {
    expect(predictCookedWeight(input([row("a", 500, { amount: 0.5, unit: "kg" })])).totalGrams).toBe(500);
    expectUnavailable(predictCookedWeight(input([row("a", 500, { amount: 0.5, unit: "mL" })])), "invalid_grams_evidence");
  });

  it("keeps internal soup redistribution inside the same whole-food mass boundary", () => {
    const makeSoup = (vegetable: number, water: number) => input([
      row("meat", 100), row("vegetable", vegetable), row("water", water, { role: confirmed("cooking_water") }),
    ], [segment(["meat", "vegetable", "water"], {
      method: confirmed("soup"), drainage: confirmed("retained"), addedMedia: confirmed("water"),
      transformation: { kind: "known_external_loss", grams: confirmed(0), coverage: confirmed("all_external_outflow") },
    })]);
    expect(predictCookedWeight(makeSoup(200, 1000)).totalGrams).toBe(1300);
    expect(predictCookedWeight(makeSoup(120, 1080)).totalGrams).toBe(1300);
  });

  it("subtracts a complete confirmed external loss once", () => {
    const source = input([row("food", 300), row("water", 1000, { role: confirmed("cooking_water") })], [segment(["food", "water"], {
      method: confirmed("soup"), drainage: confirmed("retained"), addedMedia: confirmed("water"),
      transformation: { kind: "known_external_loss", grams: confirmed(100), coverage: confirmed("all_external_outflow") },
    })]);
    expect(predictCookedWeight(source).totalGrams).toBe(1200);
  });

  it("requires known added media and can retain explicitly accounted water and oil in a closed mix", () => {
    const source = input([row("a", 100)]);
    expectUnavailable(predictCookedWeight({ ...source, segments: [segment(["a"], { addedMedia: { value: null, status: "unknown", evidenceRef: null } })] }), "boundary_unconfirmed");
    const rows = [row("a", 100), row("water", 50, { role: confirmed("cooking_water") }), row("oil", 20, { role: confirmed("cooking_oil") })];
    expect(predictCookedWeight(input(rows, [segment(["a", "water", "oil"], { addedMedia: confirmed("water_and_oil") })])).totalGrams).toBe(170);
    expectUnavailable(predictCookedWeight(input(rows)), "boundary_condition_mismatch");
  });

  it.each(["unknown", "inferred"] as const)("does not treat %s outflow as zero", status => {
    const source = input([row("food", 300)], [segment(["food"], {
      method: confirmed("soup"),
      transformation: { kind: "known_external_loss", grams: { ...confirmed(0), status }, coverage: confirmed("all_external_outflow") },
    })]);
    expectUnavailable(predictCookedWeight(source), "external_loss_unconfirmed");
  });

  it("requires complete outflow coverage rather than only one measured loss", () => {
    const source = input([row("a", 100)], [segment(["a"], {
      transformation: { kind: "known_external_loss", grams: confirmed(10), coverage: { value: null, status: "unknown", evidenceRef: null } },
    })]);
    expectUnavailable(predictCookedWeight(source), "external_loss_unconfirmed");
  });

  it("applies the independently reviewed USDA 2014 row only to the matched drained protocol", () => {
    const result = predictCookedWeight(usdaInput());
    expect(result.totalGrams).toBe(69);
    expect(result.scope).toBe("candidate");
    expect(result.appliedRules[0]).toMatchObject({ id: USDA_2014_BEEF_CRUMBLES_RULE.id, factor: 0.69, rights: "CC0-1.0" });
    expect(result).not.toHaveProperty("nutrition");
  });

  it.each([
    { method: confirmed("soup") }, { boundary: confirmed("entire_edible") },
    { drainage: confirmed("retained") }, { protocol: confirmed("generic-pan-cooking") },
    { addedMedia: confirmed("water") },
  ] satisfies Partial<CookedWeightSegment>[])("rejects a different USDA cooking condition", patch => {
    const source = usdaInput();
    expectUnavailable(predictCookedWeight({ ...source, segments: [{ ...source.segments[0], ...patch }] }), "rule_condition_mismatch");
  });

  it.each(["cooked", "dry_raw"] as const)("does not apply the raw USDA coefficient to %s food", state => {
    const source = usdaInput();
    expectUnavailable(predictCookedWeight({ ...source, rows: [{ ...source.rows[0], preparationState: confirmed(state) }] }), "rule_condition_mismatch");
  });

  it("does not infer food identity or cooking conditions from weak evidence", () => {
    const source = usdaInput();
    expectUnavailable(predictCookedWeight({ ...source, rows: [{ ...source.rows[0], foodIdentity: { ...confirmed(USDA_2014_BEEF_CRUMBLES_RULE.foodIdentity), status: "inferred" } }] }), "rule_condition_unconfirmed");
    expectUnavailable(predictCookedWeight({ ...source, segments: [{ ...source.segments[0], drainage: { value: null, status: "unknown", evidenceRef: null } }] }), "rule_condition_unconfirmed");
  });

  it("does not treat an empty confirmed protocol as usable evidence", () => {
    const source = usdaInput();
    expectUnavailable(predictCookedWeight({ ...source, segments: [{ ...source.segments[0], protocol: confirmed("") }] }), "rule_condition_unconfirmed");
  });

  it("does not silently drop media that is excluded by a no-added-media protocol", () => {
    const source = usdaInput();
    expectUnavailable(predictCookedWeight({ ...source, rows: [...source.rows, row("water", 50, { role: confirmed("cooking_water") })], segments: [{ ...source.segments[0], rowKeys: ["beef", "water"] }] }), "rule_condition_mismatch");
  });

  it("calculates an explicitly test-only absorbed-water scalar without adding the same water again", () => {
    const result = predictCookedWeight(riceInput(), [riceFixtureRule]);
    expect(result.totalGrams).toBe(298);
    expect(result.scope).toBe("test_fixture");
    expect(result.learningEligible).toBe(false);
    expect(result.appliedRules[0].availability).toBe("test_fixture");
  });

  it("keeps inactive and unregistered rice rules unavailable", () => {
    expectUnavailable(predictCookedWeight(riceInput(), [{ ...riceFixtureRule, availability: "inactive", rights: "not_confirmed" }]), "rule_inactive");
    expectUnavailable(predictCookedWeight(riceInput()), "rule_not_found");
  });

  it("rejects an absorption result that exceeds all known input mass", () => {
    expectUnavailable(predictCookedWeight(riceInput(100), [riceFixtureRule]), "mass_exceeds_input");
  });

  it("does not cook already cooked rice through the dry-state fixture again", () => {
    const source = riceInput();
    expectUnavailable(predictCookedWeight({ ...source, rows: [{ ...source.rows[0], preparationState: confirmed("cooked") }, source.rows[1]] }, [riceFixtureRule]), "rule_condition_mismatch");
  });

  it("cannot return a partial sum for unknown water, oil, or an unconverted quantitative row", () => {
    for (const role of ["cooking_water", "cooking_oil", "food"] as const) {
      const missing = row("missing", 1, { grams: null, gramsEvidence: null, role: confirmed(role) });
      expectUnavailable(predictCookedWeight(input([row("known", 100), missing])), "quantity_conversion_missing");
    }
  });

  it("retains a product's original mL without using a partial total or a borrowed density", () => {
    const product = row("product", 1, { sourceKind: "food_product", sourceVersion: "product-v1", amount: 30, unit: "mL", grams: null, gramsEvidence: null });
    const result = predictCookedWeight(input([row("known", 100), product]));
    expectUnavailable(result, "quantity_conversion_missing");
    expect(result.input?.rows[1]).toMatchObject({ amount: 30, unit: "mL", sourceVersion: "product-v1", grams: null });
  });

  it("does not make to-taste or unknown-origin quantities zero", () => {
    expectUnavailable(predictCookedWeight(input([row("known", 100), row("salt", 1, { amount: null, quantityKind: "to_taste", grams: null, gramsEvidence: null })])), "unquantified_ingredient");
    expectUnavailable(predictCookedWeight(input([row("a", 100, { quantityOrigin: "unknown" })])), "quantity_origin_unknown");
  });

  it("requires confirmed roles and gram evidence", () => {
    expectUnavailable(predictCookedWeight(input([row("a", 100, { role: { value: "food", status: "inferred", evidenceRef: "weak-text" } })])), "row_role_unconfirmed");
    expectUnavailable(predictCookedWeight(input([row("a", 100, { gramsEvidence: { kind: "direct_mass", status: "inferred", evidenceId: null, version: null, quality: "exact" } })])), "invalid_grams_evidence");
  });

  it("uses only a product's pinned version for a product conversion", () => {
    const product = row("product", 60, { sourceKind: "food_product", sourceVersion: "product-v1", amount: 0.5, unit: "package", gramsEvidence: { kind: "product_relation", status: "confirmed", evidenceId: "relation-1", version: "product-v1", quality: "exact" } });
    expect(predictCookedWeight(input([product])).totalGrams).toBe(60);
    expectUnavailable(predictCookedWeight(input([{ ...product, gramsEvidence: { ...product.gramsEvidence!, version: "other-product-v2" } }])), "invalid_grams_evidence");
    expectUnavailable(predictCookedWeight(input([{ ...product, gramsEvidence: { kind: "ingredient_conversion", status: "confirmed", evidenceId: "generic-density", version: "generic-v1", quality: "estimated" } }])), "invalid_grams_evidence");
  });

  it("rejects the same row or cooking interval being counted twice", () => {
    const source = input([row("a", 100)]);
    expectUnavailable(predictCookedWeight({ ...source, segments: [source.segments[0], { ...source.segments[0], id: "second" }] }), "overlapping_boundary");
    expectUnavailable(predictCookedWeight({ ...source, rows: [...source.rows, source.rows[0]] }), "duplicate_row");
    expectUnavailable(predictCookedWeight(input([row("a", 100), row("b", 50)], [segment(["a"]), segment(["b"])])), "duplicate_segment");
  });

  it("sums independent boundaries but refuses missing or unknown row references", () => {
    const source = input([row("a", 100), row("b", 50)], [segment(["a"]), segment(["b"], { id: "second" })]);
    expect(predictCookedWeight(source).totalGrams).toBe(150);
    expectUnavailable(predictCookedWeight({ ...source, segments: [source.segments[0]] }), "uncovered_row");
    expectUnavailable(predictCookedWeight({ ...source, segments: [segment(["not-in-snapshot"])] }), "unknown_row_reference");
  });

  it("rejects empty extra boundaries and combining a yield with another loss or addition", () => {
    const source = usdaInput();
    expectUnavailable(predictCookedWeight({ ...source, segments: [...source.segments, segment([], { id: "empty" })] }), "invalid_segment");
    const combined = { kind: "yield" as const, ruleId: USDA_2014_BEEF_CRUMBLES_RULE.id, addedWaterGrams: 50 };
    expectUnavailable(predictCookedWeight({ ...source, segments: [{ ...source.segments[0], transformation: combined }] }), "conflicting_transformations");
  });

  it("never falls back to 0.75 for absent or inferred cooking features", () => {
    const source = input([row("a", 100)], [segment(["a"], { method: { value: "no_heat", status: "inferred", evidenceRef: "free-text" } })]);
    expectUnavailable(predictCookedWeight(source), "boundary_unconfirmed");
    expectUnavailable(predictCookedWeight({ ...source, segments: [] }), "missing_segments");
  });

  it.each([0, -1, NaN, Infinity])("rejects invalid quantitative input %s", amount => {
    expectUnavailable(predictCookedWeight(input([row("a", amount)])), "invalid_quantity");
  });

  it("rejects invalid loss, overflow, and unbounded inputs", () => {
    const source = input([row("a", 100)]);
    expectUnavailable(predictCookedWeight({ ...source, segments: [segment(["a"], { transformation: { kind: "known_external_loss", grams: confirmed(101), coverage: confirmed("all_external_outflow") } })] }), "invalid_external_loss");
    expectUnavailable(predictCookedWeight(input([row("a", Number.MAX_VALUE), row("b", Number.MAX_VALUE)])), "invalid_total");
    expectUnavailable(predictCookedWeight(input(Array.from({ length: 201 }, (_, i) => row(String(i), 1)))), "input_limit_exceeded");
  });

  it("rejects ambiguous or non-positive yield definitions", () => {
    expectUnavailable(predictCookedWeight(riceInput(), [riceFixtureRule, riceFixtureRule]), "ambiguous_rule");
    expectUnavailable(predictCookedWeight(riceInput(), [{ ...riceFixtureRule, factor: 0 }]), "invalid_rule");
  });

  it("returns a frozen detached metadata snapshot and leaves caller input untouched", () => {
    const mutableRow = { ...row("a", 100) };
    const source = input([mutableRow]);
    const before = JSON.stringify(source);
    const result = predictCookedWeight(source);
    expect(JSON.stringify(source)).toBe(before);
    mutableRow.sourceVersion = "changed-later";
    expect(result.input?.rows[0].sourceVersion).toBe("source-v1");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.input?.rows[0].role)).toBe(true);
    expect(Object.isFrozen(result.input?.segments[0].rowKeys)).toBe(true);
    expect(result).toEqual(predictCookedWeight({ ...source, rows: [row("a", 100)] }));
  });

  it("copies only declared features instead of retaining free text or extra mutable payloads", () => {
    const extra = { ...row("a", 100), privateText: "not a prediction feature", nested: { mutable: true } };
    const result = predictCookedWeight(input([extra]));
    expect(result.input?.rows[0]).not.toHaveProperty("privateText");
    expect(result.input?.rows[0]).not.toHaveProperty("nested");
  });
});
