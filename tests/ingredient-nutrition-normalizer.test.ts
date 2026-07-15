import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const MODULE_URL = pathToFileURL(
  `${process.cwd()}/scripts/lib/ingredient-nutrition-domain.mjs`,
).href;

async function loadDomain(): Promise<Record<string, unknown>> {
  try {
    return await import(MODULE_URL);
  } catch {
    return {};
  }
}

function requireFunction(
  module: Record<string, unknown>,
  name: string,
): (...args: never[]) => unknown {
  expect(module[name], `missing domain behavior: ${name}`).toBeTypeOf("function");
  return module[name] as (...args: never[]) => unknown;
}

describe("ingredient nutrition source item normalizer", () => {
  it("preserves basis, serving, total content, and edible portion separately and defaults safe mass to 100g", async () => {
    const domain = await loadDomain();
    const normalizeSourceItem = requireFunction(domain, "normalizeSourceItem");

    const result = normalizeSourceItem({
      external_item_key: "source-item-1",
      external_name: "두부",
      preparation_state: "raw",
      basis: { text: "100 g", amount: 100, unit: "g" },
      serving: { text: "1회 80 g", amount: 80, unit: "g" },
      total_content: { text: "총 320 g", amount: 320, unit: "g" },
      edible_portion: { text: "가식부 95%", percent: 95 },
    } as never) as Record<string, unknown>;

    expect(result).toMatchObject({
      source_basis_text: "100 g",
      source_basis_amount: 100,
      source_basis_unit: "g",
      source_serving_text: "1회 80 g",
      source_serving_amount: 80,
      source_serving_unit: "g",
      source_total_content_text: "총 320 g",
      source_total_content_amount: 320,
      source_total_content_unit: "g",
      edible_portion_text: "가식부 95%",
      edible_portion_percent: 95,
      profile: {
        basis_amount: 100,
        basis_unit: "g",
        normalization_method: "mass_100g",
      },
    });
  });

  it("keeps a 100mL-only source as volume and never invents a 100g profile", async () => {
    const domain = await loadDomain();
    const normalizeSourceItem = requireFunction(domain, "normalizeSourceItem");

    const result = normalizeSourceItem({
      external_item_key: "source-item-volume",
      external_name: "식초",
      preparation_state: "liquid",
      basis: { text: "100 mL", amount: 100, unit: "mL" },
      serving: null,
      total_content: null,
      edible_portion: null,
    } as never) as Record<string, unknown>;

    expect(result).toMatchObject({
      source_basis_amount: 100,
      source_basis_unit: "ml",
      profile: {
        basis_amount: 100,
        basis_unit: "ml",
        normalization_method: "volume_100ml",
      },
    });
    expect(JSON.stringify(result)).not.toContain("mass_100g");
  });

  it("maps canonical nutrient code and unit while separating observed zero from missing, trace, and parse error", async () => {
    const domain = await loadDomain();
    const normalizeNutrientValue = requireFunction(domain, "normalizeNutrientValue");

    expect(normalizeNutrientValue({
      source_nutrient_code: "ENERC_KCAL",
      source_unit: "kcal",
      source_token: "0",
    } as never)).toEqual({
      nutrient_code: "energy_kcal",
      canonical_unit: "kcal",
      source_nutrient_code: "ENERC_KCAL",
      source_unit: "kcal",
      source_token: "0",
      amount: 0,
      value_status: "observed",
    });

    for (const [sourceToken, expectedStatus] of [
      ["-", "missing"],
      ["", "missing"],
      [null, "missing"],
      ["trace", "trace"],
      ["not-a-number", "parse_error"],
    ] as const) {
      expect(normalizeNutrientValue({
        source_nutrient_code: "PROT",
        source_unit: "g",
        source_token: sourceToken,
      } as never)).toMatchObject({
        nutrient_code: "protein_g",
        canonical_unit: "g",
        amount: null,
        value_status: expectedStatus,
      });
    }

    expect(normalizeNutrientValue({
      source_nutrient_code: "PROT",
      source_unit: "mg",
      source_token: "8000",
    } as never)).toMatchObject({
      nutrient_code: "protein_g",
      canonical_unit: "g",
      source_unit: "mg",
      amount: null,
      value_status: "parse_error",
    });
  });
});
