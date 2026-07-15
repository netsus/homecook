import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const MODULE = pathToFileURL(join(
  process.cwd(),
  "scripts/lib/foodsafety-pilot-contract.mjs",
)).href;

describe("FoodSafety-30 pinned contract", () => {
  it("extracts only the 30 recipes and 130 ingredient names from their seed sections", async () => {
    const { parseFoodsafetyPinnedSeed } = await import(MODULE);
    const seed = readFileSync(join(
      process.cwd(),
      "supabase/migrations/20260626104000_seed_foodsafety_pilot_recipes.sql",
    ), "utf8");

    const contract = parseFoodsafetyPinnedSeed(seed);
    expect(contract.recipe_ids).toHaveLength(30);
    expect(contract.ingredient_names).toHaveLength(130);
    expect(new Set(contract.recipe_ids).size).toBe(30);
    expect(new Set(contract.ingredient_names).size).toBe(130);
  });

  it("builds the expected closure from exact recipe ids instead of stale seed names", async () => {
    const { buildFoodsafetyScopeSql } = await import(MODULE);
    const contract = {
      recipe_ids: Array.from({ length: 30 }, (_, index) =>
        `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`),
      ingredient_names: Array.from({ length: 130 }, (_, index) => `ingredient-${index}`),
    };

    const sql = buildFoodsafetyScopeSql(contract);
    expect(sql.actual).toContain("pilot_30_quality_corrected");
    expect(sql.actual).toContain("pilot_30_quality_corrected_replacement");
    expect(sql.actual).not.toContain("pilot_30_user_reviewed");
    expect(sql.expected).toContain("public.recipe_ingredients");
    expect(sql.expected).not.toContain("public.ingredient_synonyms");
    expect(sql.expected).not.toContain("public.ingredients canonical");
    expect(sql.expected).not.toContain("ingredient-0");
  });
});
