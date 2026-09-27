import { describe, expect, it } from "vitest";
import { projectMealRecipeSnapshot, type MealRecipeSnapshotRow } from "@/lib/server/meal-recipe-snapshot";

const source: MealRecipeSnapshotRow = {
  id: "meal", user_id: "owner", recipe_id: "recipe", recipe_content_snapshot_id: "snapshot", planned_servings: 4,
  recipe_content_snapshots: {
    id: "snapshot", recipe_id: "recipe", owner_user_id: "owner", title: "수정 전 두부찌개", base_servings: 2,
    ingredients_json: [{ ingredient_id: "tofu", amount: 300, unit: "g", ingredient_type: "QUANT", display_text: null, scalable: true, sort_order: 1 }],
    steps_json: [{ step_number: 1, instruction: "수정 전 순서대로 끓이세요.", ingredients_used: [], heat_level: null, duration_seconds: null, duration_text: null, cooking_methods: null }],
  },
};

describe("plan recipe snapshot", () => {
  it("uses the pinned content and scales amounts to the plan, with no live recipe input", () => {
    const result = projectMealRecipeSnapshot(source, "owner", new Map([["tofu", "두부"]]));
    expect(result).toMatchObject({ title: "수정 전 두부찌개", planned_servings: 4, ingredients: [{ amount: 600, standard_name: "두부" }], steps: [{ instruction: "수정 전 순서대로 끓이세요." }] });
  });
  it("rejects another user's plan and mismatched or missing pins", () => {
    expect(projectMealRecipeSnapshot(source, "other", new Map())).toBeNull();
    for (const changes of [{ recipe_content_snapshot_id: null }, { recipe_content_snapshot_id: "new" }, { recipe_id: "other-recipe" }, { recipe_content_snapshots: null }]) {
      expect(projectMealRecipeSnapshot({ ...source, ...changes }, "owner", new Map())).toBeNull();
    }
  });
  it("rejects private snapshots belonging to another user", () => {
    const snapshot = source.recipe_content_snapshots;
    if (!snapshot || Array.isArray(snapshot)) throw new Error("Invalid test fixture");
    expect(projectMealRecipeSnapshot({ ...source, recipe_content_snapshots: { ...snapshot, owner_user_id: "other" } }, "owner", new Map())).toBeNull();
  });
  it("keeps fixed quantities and component labels", () => {
    const snapshot = source.recipe_content_snapshots;
    if (!snapshot || Array.isArray(snapshot)) throw new Error("Invalid test fixture");
    const result = projectMealRecipeSnapshot({ ...source, recipe_content_snapshots: { ...snapshot, ingredients_json: [{ ...snapshot.ingredients_json[0], scalable: false, component_label: "고명" }] } }, "owner", new Map());
    expect(result?.ingredients[0]).toMatchObject({ amount: 300, component_label: "고명" });
  });
});
