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
  it.each([true,false])("preserves .125 product quantities and exact pins in the plan (scalable=%s)",scalable=>{
    const snapshot=source.recipe_content_snapshots;
    if(!snapshot||Array.isArray(snapshot))throw new Error("Invalid fixture");
    const ingredient={ingredient_id:null,row_key:"79000000-0000-4000-8000-000000000020",source_kind:"food_product" as const,food_product_id:"79000000-0000-4000-8000-000000000021",food_product_nutrition_version_id:"79000000-0000-4000-8000-000000000022",food_product_name:"원래 제품",food_product_brand:"원래 업체",amount:scalable?0.0625:0.125,unit:"package",ingredient_type:"QUANT" as const,display_text:"원문",scalable,sort_order:0};
    const result=projectMealRecipeSnapshot({...source,recipe_content_snapshots:{...snapshot,ingredients_json:[ingredient]}},"owner",new Map([["other","다른 버전 이름"]]));
    expect(result?.ingredients[0]).toMatchObject({ingredient_id:null,row_key:ingredient.row_key,source_kind:"food_product",food_product_id:ingredient.food_product_id,food_product_nutrition_version_id:ingredient.food_product_nutrition_version_id,amount:0.125,unit:"package",display_text:"원래 업체 · 원래 제품 0.125package"});
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
