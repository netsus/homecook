import { describe, expect, it } from "vitest";

type NutrientCode =
  | "energy_kcal"
  | "carbohydrate_g"
  | "protein_g"
  | "fat_g"
  | "sodium_mg"
  | "sugars_g";

type NutrientValue = {
  amount: number | null;
  value_status: "observed" | "missing" | "trace" | "parse_error";
};

type CalculatorIngredient = {
  id: string;
  ingredient_id: string;
  amount: number | null;
  unit: string | null;
  ingredient_type: "QUANT" | "TO_TASTE";
  scalable: boolean;
  preparation_state: string;
  size_code?: string | null;
  edible_state?: string | null;
  nutrition?: {
    link: {
      id: string;
      review_status: string;
      is_active: boolean;
      is_primary: boolean;
      preparation_state: string;
    };
    profile: {
      id: string;
      basis_amount: number;
      basis_unit: "g" | "ml";
      review_status: string;
      is_active: boolean;
      values: Partial<Record<NutrientCode, NutrientValue>>;
    };
    source: {
      id: string;
      review_status: string;
      freshness_status: string;
      is_active: boolean;
      provider: string;
      dataset: string;
      source_version: string;
      data_basis_date: string | null;
      license: string;
      source_url: string;
    };
  };
  conversion_assignment?: {
    id: string;
    ingredient_id: string;
    preparation_state: string;
    review_status: string;
    is_active: boolean;
    profile: {
      code: string;
      basis_volume_ml: number;
      representative_weight_g: number;
      is_active: boolean;
    };
  } | null;
  piece_weight?: {
    id: string;
    ingredient_id: string;
    size_code: string;
    preparation_state: string;
    edible_state: string;
    weight_g: number;
    review_status: string;
    is_active: boolean;
  } | null;
};

type CalculatorInput = {
  recipe_id: string;
  recipe_version: number;
  base_servings: number;
  calculation_version?: string;
  rounding_policy_version?: string;
  ingredients: CalculatorIngredient[];
};

const CORE_VALUES: Record<NutrientCode, NutrientValue> = {
  energy_kcal: { amount: 100, value_status: "observed" },
  carbohydrate_g: { amount: 20, value_status: "observed" },
  protein_g: { amount: 10, value_status: "observed" },
  fat_g: { amount: 5, value_status: "observed" },
  sodium_mg: { amount: 50, value_status: "observed" },
  sugars_g: { amount: 0, value_status: "observed" },
};

function directIngredient(
  overrides: Partial<CalculatorIngredient> = {},
  values: Partial<Record<NutrientCode, NutrientValue>> = CORE_VALUES,
): CalculatorIngredient {
  const id = overrides.id ?? "recipe-ingredient-a";
  const ingredientId = overrides.ingredient_id ?? "ingredient-a";
  const preparationState = overrides.preparation_state ?? "raw-edible";

  return {
    id,
    ingredient_id: ingredientId,
    amount: 100,
    unit: "g",
    ingredient_type: "QUANT",
    scalable: true,
    preparation_state: preparationState,
    size_code: null,
    edible_state: "edible",
    nutrition: {
      link: {
        id: `link-${id}`,
        review_status: "approved",
        is_active: true,
        is_primary: true,
        preparation_state: preparationState,
      },
      profile: {
        id: `profile-${id}`,
        basis_amount: 100,
        basis_unit: "g",
        review_status: "approved",
        is_active: true,
        values,
      },
      source: {
        id: `source-${id}`,
        review_status: "approved",
        freshness_status: "current",
        is_active: true,
        provider: "MFDS",
        dataset: "test-dataset",
        source_version: "2026-07-15",
        data_basis_date: null,
        license: "test-license",
        source_url: "https://example.test/source",
      },
    },
    conversion_assignment: null,
    piece_weight: null,
    ...overrides,
  };
}

function recipeInput(ingredients: CalculatorIngredient[]): CalculatorInput {
  return {
    recipe_id: "recipe-1",
    recipe_version: 3,
    base_servings: 2,
    calculation_version: "recipe-nutrition-v1",
    rounding_policy_version: "display-v1",
    ingredients,
  };
}

async function calculatorModule() {
  try {
    return await import("@/lib/nutrition/recipe-nutrition-calculator");
  } catch {
    return {} as Record<string, unknown>;
  }
}

function requireFunction<T extends (...args: never[]) => unknown>(
  module: Record<string, unknown>,
  name: string,
) {
  expect(module[name], `missing calculator behavior: ${name}`).toBeTypeOf("function");
  return module[name] as T;
}

describe("recipe nutrition calculator", () => {
  it("uses direct g/kg mass and matching 100mL volume before representative conversion", async () => {
    const calculator = await calculatorModule();
    const calculate = requireFunction<(input: CalculatorInput) => Record<string, any>>(
      calculator,
      "calculateRecipeNutrition",
    );
    const volume = directIngredient({ id: "volume", amount: 250, unit: "ml" });
    volume.nutrition!.profile.basis_unit = "ml";
    volume.conversion_assignment = {
      id: "must-not-win",
      ingredient_id: volume.ingredient_id,
      preparation_state: volume.preparation_state,
      review_status: "approved",
      is_active: true,
      profile: {
        code: "VOLUME_G25",
        basis_volume_ml: 15,
        representative_weight_g: 25,
        is_active: true,
      },
    };

    const result = calculate(recipeInput([
      directIngredient({ id: "grams", amount: 50, unit: "g" }),
      directIngredient({ id: "kilograms", amount: 0.1, unit: "kg" }),
      volume,
    ]));

    expect(result).toMatchObject({
      calculation_status: "complete",
      calculation_quality: "direct",
      reflected_ingredient_count: 3,
      target_ingredient_count: 3,
      values: {
        energy_kcal: { amount: 400, known_amount: null, status: "complete", display_mode: "total" },
      },
      scalable_values: { energy_kcal: 400 },
      fixed_values: { energy_kcal: 0 },
    });
  });

  it.each([
    ["VOLUME_G6", 6],
    ["VOLUME_G10", 10],
    ["VOLUME_G15", 15],
    ["VOLUME_G20", 20],
    ["VOLUME_G25", 25],
  ])("uses only approved %s representative volume and marks quality estimated", async (code, grams) => {
    const calculator = await calculatorModule();
    const calculate = requireFunction<(input: CalculatorInput) => Record<string, any>>(
      calculator,
      "calculateRecipeNutrition",
    );
    const ingredient = directIngredient({ amount: 1, unit: "tbsp" });
    ingredient.conversion_assignment = {
      id: `assignment-${code}`,
      ingredient_id: ingredient.ingredient_id,
      preparation_state: ingredient.preparation_state,
      review_status: "approved",
      is_active: true,
      profile: {
        code,
        basis_volume_ml: 15,
        representative_weight_g: grams,
        is_active: true,
      },
    };

    const result = calculate(recipeInput([ingredient]));

    expect(result.values.energy_kcal.amount).toBeCloseTo(grams);
    expect(result.calculation_quality).toBe("estimated");
    expect(result.warnings).toContain("REPRESENTATIVE_VOLUME_CONVERSION_USED");
  });

  it("uses an exact active approved piece weight and treats TO_TASTE or mismatches as missing, never zero", async () => {
    const calculator = await calculatorModule();
    const calculate = requireFunction<(input: CalculatorInput) => Record<string, any>>(
      calculator,
      "calculateRecipeNutrition",
    );
    const piece = directIngredient({
      id: "piece",
      amount: 0.5,
      unit: "개",
      size_code: "medium",
      preparation_state: "peeled",
      edible_state: "edible",
    });
    piece.piece_weight = {
      id: "piece-weight",
      ingredient_id: piece.ingredient_id,
      size_code: "medium",
      preparation_state: "peeled",
      edible_state: "edible",
      weight_g: 80,
      review_status: "approved",
      is_active: true,
    };
    const toTaste = directIngredient({
      id: "salt-to-taste",
      amount: null,
      unit: null,
      ingredient_type: "TO_TASTE",
      scalable: false,
    });

    const partial = calculate(recipeInput([piece, toTaste]));
    expect(partial.values.energy_kcal).toEqual({
      amount: null,
      known_amount: 40,
      status: "partial",
      display_mode: "minimum",
    });
    expect(partial.missing_reasons).toContain("TO_TASTE_EXCLUDED:salt-to-taste");

    piece.piece_weight.size_code = "large";
    const unavailable = calculate(recipeInput([piece]));
    expect(unavailable.values.energy_kcal).toMatchObject({
      amount: null,
      known_amount: null,
      status: "unavailable",
    });
    expect(unavailable.scalable_values).not.toHaveProperty("energy_kcal");
  });

  it("keeps observed zero distinct from missing and omits absent optional nutrients", async () => {
    const calculator = await calculatorModule();
    const calculate = requireFunction<(input: CalculatorInput) => Record<string, any>>(
      calculator,
      "calculateRecipeNutrition",
    );
    const values = {
      ...CORE_VALUES,
      sugars_g: { amount: 0, value_status: "observed" as const },
      sodium_mg: { amount: null, value_status: "trace" as const },
    };
    const result = calculate(recipeInput([directIngredient({}, values)]));

    expect(result.values.sugars_g).toEqual({
      amount: 0,
      known_amount: null,
      status: "complete",
      display_mode: "total",
    });
    expect(result.values.sodium_mg.amount).toBeNull();
    expect(result.values.sodium_mg.status).toBe("unavailable");

    const noOptional = calculate(recipeInput([directIngredient({}, {
      ...CORE_VALUES,
      sugars_g: undefined,
    })]));
    expect(noOptional.values).not.toHaveProperty("sugars_g");
  });

  it("derives complete, partial, unavailable and direct, estimated, mixed independently", async () => {
    const calculator = await calculatorModule();
    const calculate = requireFunction<(input: CalculatorInput) => Record<string, any>>(
      calculator,
      "calculateRecipeNutrition",
    );
    const missing = directIngredient({ id: "missing", nutrition: undefined });
    const estimated = directIngredient({ id: "estimated", amount: 1, unit: "tsp" });
    estimated.conversion_assignment = {
      id: "assignment-estimated",
      ingredient_id: estimated.ingredient_id,
      preparation_state: estimated.preparation_state,
      review_status: "approved",
      is_active: true,
      profile: {
        code: "VOLUME_G15",
        basis_volume_ml: 15,
        representative_weight_g: 15,
        is_active: true,
      },
    };

    const partialMixed = calculate(recipeInput([directIngredient({ id: "direct" }), estimated, missing]));
    expect(partialMixed).toMatchObject({
      calculation_status: "partial",
      calculation_quality: "mixed",
      reflected_ingredient_count: 2,
      target_ingredient_count: 3,
    });

    const unavailable = calculate(recipeInput([missing]));
    expect(unavailable.calculation_status).toBe("unavailable");
    expect(unavailable.calculation_quality).toBeNull();
  });

  it("keeps fixed contributions fixed when scaling selected servings", async () => {
    const calculator = await calculatorModule();
    const calculate = requireFunction<(input: CalculatorInput) => Record<string, any>>(
      calculator,
      "calculateRecipeNutrition",
    );
    const scale = requireFunction<(
      result: Record<string, any>,
      selectedServings: number,
    ) => Record<string, any>>(calculator, "scaleNutritionForServings");
    const result = calculate(recipeInput([
      directIngredient({ id: "scalable", scalable: true, amount: 100 }),
      directIngredient({ id: "fixed", scalable: false, amount: 50 }),
    ]));

    expect(result.scalable_values.energy_kcal).toBe(100);
    expect(result.fixed_values.energy_kcal).toBe(50);
    expect(scale(result, 4).values.energy_kcal.amount).toBe(250);
    expect(() => scale(result, 0)).toThrowError(
      expect.objectContaining({ code: "INVALID_SELECTED_SERVINGS" }),
    );
  });

  it("produces the same canonical hash and warning order regardless of ingredient input order", async () => {
    const calculator = await calculatorModule();
    const calculate = requireFunction<(input: CalculatorInput) => Record<string, any>>(
      calculator,
      "calculateRecipeNutrition",
    );
    const hash = requireFunction<(input: CalculatorInput) => string>(
      calculator,
      "hashRecipeNutritionInput",
    );
    const a = directIngredient({ id: "a", nutrition: undefined, unit: "unknown" });
    const b = directIngredient({ id: "b", ingredient_type: "TO_TASTE", amount: null, unit: null });

    expect(hash(recipeInput([a, b]))).toBe(hash(recipeInput([b, a])));
    expect(calculate(recipeInput([a, b])).warnings).toEqual(
      calculate(recipeInput([b, a])).warnings,
    );
    expect(hash({ ...recipeInput([a, b]), calculation_version: "recipe-nutrition-v2" }))
      .not.toBe(hash(recipeInput([a, b])));
  });

  it("fails closed for inactive, unapproved, revoked, superseded, stale or drifted predecessor rows", async () => {
    const calculator = await calculatorModule();
    const calculate = requireFunction<(input: CalculatorInput) => Record<string, any>>(
      calculator,
      "calculateRecipeNutrition",
    );

    for (const mutate of [
      (row: CalculatorIngredient) => { row.nutrition!.source.is_active = false; },
      (row: CalculatorIngredient) => { row.nutrition!.source.review_status = "superseded"; },
      (row: CalculatorIngredient) => { row.nutrition!.source.freshness_status = "stale"; },
      (row: CalculatorIngredient) => { row.nutrition!.profile.review_status = "revoked"; },
      (row: CalculatorIngredient) => { row.nutrition!.link.review_status = "revoked"; },
      (row: CalculatorIngredient) => { row.nutrition!.link.is_primary = false; },
    ]) {
      const ingredient = directIngredient();
      mutate(ingredient);
      const result = calculate(recipeInput([ingredient]));
      expect(result.calculation_status).toBe("unavailable");
      expect(result.values.energy_kcal.amount).toBeNull();
    }
  });
});
