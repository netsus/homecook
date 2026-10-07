import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const moduleUrl = pathToFileURL(`${process.cwd()}/scripts/lib/usda-nutrition-snapshot.mjs`).href;
const load = () => import(moduleUrl);

function nutrient(id: number, amount?: number | string | null, extra: Record<string, unknown> = {}) {
  return {
    id: 7000 + id,
    nutrient: { id, unitName: [1008, 2047, 2048].includes(id) ? "kcal" : id === 1093 ? "mg" : "g" },
    amount,
    dataPoints: 3,
    foodNutrientDerivation: { code: "NC", description: "Calculated" },
    ...extra,
  };
}

function foundation(foodNutrients: ReturnType<typeof nutrient>[]) {
  return { fdcId: 12345, description: "Test ingredient, raw", dataType: "Foundation", foodNutrients };
}

function srEntry(id: number, token: string, unit = "g") {
  return {
    amount: Number(token),
    source_token: token,
    source_nutrient_code: String(id),
    unit,
    source_row: {
      id: String(8000 + id), fdc_id: "12345", nutrient_id: String(id),
      amount: token, data_points: "0", derivation_id: "49", min: "1", max: "99", median: "77",
    },
  };
}

function sr(values: Record<string, ReturnType<typeof srEntry>>) {
  return { fdc_id: "12345", description: "Test SR food", data_type: "sr_legacy_food", values };
}

describe("USDA nutrition snapshots", () => {
  it("normalizes SR published tokens at scale six while preserving zeros, source rows and derivation", async () => {
    const { normalizeUsdaSrFood } = await load();
    const input = sr({
      energy_kcal: srEntry(1008, "87", "kcal"),
      protein_g: srEntry(1003, "1.2345645"),
      fat_g: srEntry(1004, "0"),
      sugars_g: srEntry(2000, "2.5"),
      sodium_mg: srEntry(1093, "12.0000009", "mg"),
    });
    const before = structuredClone(input);
    const result = normalizeUsdaSrFood(input);
    expect(result.basis).toEqual({ amount: 100, unit: "g" });
    expect(result.values.protein_g).toMatchObject({ amount: 1.234565, source_token: "1.2345645" });
    expect(result.values.fat_g).toMatchObject({ amount: 0, missing_reason: null });
    expect(result.values.sodium_mg.amount).toBe(12.000001);
    expect(result.values.sugars_g.source_nutrient_code).toBe("2000");
    expect(result.values.fiber_g).toMatchObject({ amount: null, missing_reason: "absent" });
    expect(Object.keys(result.values)).toHaveLength(8);
    expect(result.provenance.source_food).toEqual(before);
    expect(input).toEqual(before);
    result.provenance.source_food.values.protein_g.source_row.derivation_id = "changed";
    expect(input.values.protein_g.source_row.derivation_id).toBe("49");
  });

  it("uses official Foundation energy priority without calculating from macros", async () => {
    const { normalizeUsdaFoundationFood } = await load();
    const energy = [nutrient(1008, 101), nutrient(2047, 102), nutrient(2048, 103)];
    expect(normalizeUsdaFoundationFood(foundation(energy)).values.energy_kcal).toMatchObject({
      amount: 103, source_nutrient_code: "2048",
    });
    expect(normalizeUsdaFoundationFood(foundation(energy.slice(0, 2))).values.energy_kcal.amount).toBe(102);
    expect(normalizeUsdaFoundationFood(foundation(energy.slice(0, 1))).values.energy_kcal.amount).toBe(101);
    expect(normalizeUsdaFoundationFood(foundation([nutrient(1003, 20), nutrient(1004, 10)])).values.energy_kcal.amount).toBeNull();
  });

  it("prefers total-sugars ID 1063 and preserves missing authoritative values instead of legacy fallback", async () => {
    const { normalizeUsdaFoundationFood } = await load();
    const food = foundation([nutrient(2000, 99), nutrient(1063, 3.125)]);
    expect(normalizeUsdaFoundationFood(food).values.sugars_g).toMatchObject({ amount: 3.125, source_nutrient_code: "1063" });
    const missing = foundation([nutrient(2000, 99), nutrient(1063, undefined)]);
    expect(normalizeUsdaFoundationFood(missing).values.sugars_g).toMatchObject({ amount: null, source_nutrient_code: "1063" });
    expect(normalizeUsdaFoundationFood(food).provenance.nutrient_selection.sugars_g.priority_ids).toEqual(["1063", "2000"]);
  });

  it("keeps LOQ fields and less-than tokens as bounds, not observed zero or numeric amounts", async () => {
    const { normalizeUsdaFoundationFood, normalizeUsdaSrFood } = await load();
    const food = foundation([
      nutrient(1004, 0, { loq: 0.03 }),
      nutrient(1003, "<0.01"),
      nutrient(1093, "<LOQ"),
      nutrient(1005, 0),
    ]);
    const result = normalizeUsdaFoundationFood(food);
    expect(result.values.fat_g).toMatchObject({ amount: null, source_token: "0", missing_reason: "below_loq", limit_of_quantification: 0.03, source_limit_token: "0.03" });
    expect(result.values.protein_g).toMatchObject({ amount: null, source_token: "<0.01", limit_of_quantification: 0.01 });
    expect(result.values.sodium_mg).toMatchObject({ amount: null, missing_reason: "below_loq", source_token: "<LOQ" });
    expect(result.values.carbohydrate_g.amount).toBe(0);
    const entry = srEntry(1004, "0");
    Object.assign(entry.source_row, { loq: "0.1" });
    expect(normalizeUsdaSrFood(sr({ fat_g: entry })).values.fat_g).toMatchObject({ amount: null, limit_of_quantification: 0.1 });
  });

  it("does not use min, max, median or portions as an amount or change the declared 100g basis", async () => {
    const { normalizeUsdaFoundationFood } = await load();
    const missing = nutrient(1003, undefined, { min: 2, max: 10, median: 5 });
    const food = { ...foundation([missing]), foodPortions: [{ amount: 1, gramWeight: 35 }] };
    const result = normalizeUsdaFoundationFood(food);
    expect(result.values.protein_g.amount).toBeNull();
    expect(result.basis).toEqual({ amount: 100, unit: "g" });
    expect(result.provenance.source_food.foodNutrients[0]).toEqual(missing);
    expect(result.provenance.source_food.foodPortions).toEqual(food.foodPortions);
  });

  it("rejects malformed amounts, negative values, incompatible units and conflicting LOQ metadata", async () => {
    const { normalizeUsdaFoundationFood } = await load();
    for (const amount of [-1, "1g", "0x10", "Infinity", "1,2", "1e999"]) {
      expect(() => normalizeUsdaFoundationFood(foundation([nutrient(1003, amount)]))).toThrow("USDA_INVALID_NUMBER");
    }
    expect(() => normalizeUsdaFoundationFood(foundation([nutrient(1093, 1, { nutrient: { id: 1093, unitName: "g" } })]))).toThrow("USDA_UNIT_MISMATCH");
    expect(() => normalizeUsdaFoundationFood(foundation([nutrient(2048, 100, { nutrient: { id: 2048, unitName: "kJ" } })]))).toThrow("USDA_UNIT_MISMATCH");
    expect(() => normalizeUsdaFoundationFood(foundation([nutrient(1003, "<0.1", { loq: 0.2 })]))).toThrow("USDA_CONFLICTING_LOQ");
  });

  it("rejects duplicate nutrient conflicts before rounding and preserves identical duplicate provenance", async () => {
    const { normalizeUsdaFoundationFood, normalizeUsdaSrFood } = await load();
    expect(() => normalizeUsdaFoundationFood(foundation([nutrient(1003, 1.0000001), nutrient(1003, 1.0000002)]))).toThrow("USDA_DUPLICATE_NUTRIENT_CONFLICT");
    expect(() => normalizeUsdaSrFood(sr({ first: srEntry(1003, "1"), second: srEntry(1003, "2") }))).toThrow("USDA_DUPLICATE_NUTRIENT_CONFLICT");
    const value = nutrient(1003, 1.25);
    const result = normalizeUsdaFoundationFood(foundation([value, structuredClone(value)]));
    expect(result.values.protein_g.amount).toBe(1.25);
    expect(result.provenance.nutrient_selection.protein_g.selected_source_rows).toHaveLength(2);
  });

  it("uses the original SR amount and rejects changed source tokens instead of trusting processed amounts", async () => {
    const { normalizeUsdaSrFood } = await load();
    const entry = srEntry(1003, "1.2500");
    entry.amount = 999;
    expect(normalizeUsdaSrFood(sr({ protein_g: entry })).values.protein_g)
      .toMatchObject({ amount: 1.25, source_token: "1.2500" });

    entry.source_token = "2";
    expect(() => normalizeUsdaSrFood(sr({ protein_g: entry }))).toThrow("USDA_SOURCE_TOKEN_MISMATCH");
    entry.source_token = "1.25";
    expect(() => normalizeUsdaSrFood(sr({ protein_g: entry }))).toThrow("USDA_SOURCE_TOKEN_MISMATCH");

    const withoutToken = Object.fromEntries(Object.entries(entry).filter(([key]) => key !== "source_token"));
    expect(normalizeUsdaSrFood(sr({ protein_g: withoutToken as ReturnType<typeof srEntry> })).values.protein_g)
      .toMatchObject({ amount: 1.25, source_token: "1.2500" });
  });

  it("rejects null/foreign datasets and mismatched SR source identities", async () => {
    const { normalizeUsdaFoundationFood, normalizeUsdaSrFood } = await load();
    expect(() => normalizeUsdaFoundationFood(null)).toThrow("USDA_INVALID_FOUNDATION_FOOD");
    expect(() => normalizeUsdaFoundationFood({ ...foundation([]), dataType: "Branded" })).toThrow("USDA_INVALID_FOUNDATION_FOOD");
    const food = sr({ protein_g: srEntry(1003, "1") });
    food.values.protein_g.source_row.fdc_id = "999";
    expect(() => normalizeUsdaSrFood(food)).toThrow("USDA_SOURCE_ID_MISMATCH");
  });
});
