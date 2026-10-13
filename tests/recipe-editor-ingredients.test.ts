import { describe, expect, it } from "vitest";
import { changeRecipeIngredient, toRecipeEditIngredient } from "@/lib/recipe-editor-ingredients";
import { formatScaledIngredient } from "@/lib/recipe";
import type { RecipeEditDraft } from "@/types/recipe";

const ingredient = (id: string) => toRecipeEditIngredient({ ingredient_id: id, standard_name: id, amount: 100, unit: "g", ingredient_type: "QUANT", display_text: id, scalable: true, sort_order: 1 });
const fixture = (): RecipeEditDraft => ({ title: "버섯볶음", description: null, base_servings: 1,
  ingredients: [ingredient("old"), ingredient("onion")],
  steps: [{ step_number: 1, instruction: "버섯을 볶아요", cooking_method_id: "fry", cooking_method_ids: ["fry"],
    ingredients_used: [{ ingredient_id: "old", amount: 20, unit: "g", cut_size: null }], component_label: null, heat_level: null, duration_seconds: null, duration_text: null }],
});
describe("personal recipe ingredient correction", () => {
  it("replaces a mistaken ingredient and updates structured cooking references without rewriting instructions", () => {
    const draft = fixture();
    draft.ingredients[0].amount = 200;
    draft.ingredients[0].unit = "kg";
    draft.ingredients[0].scalable = false;
    const next = changeRecipeIngredient(draft, 0, ingredient("mushroom"));
    expect(next.ingredients[0].ingredient_id).toBe("mushroom");
    expect(next.ingredients[0]).toMatchObject({ amount: 200, unit: "kg", scalable: false });
    expect(formatScaledIngredient({ ...next.ingredients[0], id: "row", sort_order: 1, standard_name: "양송이버섯" }, 1, 4))
      .toBe("양송이버섯 200kg");
    expect(next.steps[0].ingredients_used).toEqual([{ ingredient_id: "mushroom", row_key: draft.ingredients[0].row_key, amount: 20, unit: "g", cut_size: null }]);
    expect(next.steps[0].instruction).toBe("버섯을 볶아요");
    expect(draft.ingredients[0].ingredient_id).toBe("old");
  });
  it("requires a new amount and clears stale step quantities when a product changes the unit", () => {
    const replacement = { ...ingredient("yogurt"), food_product_id: "product", food_product_nutrition_version_id: "v1", unit: "serving" };
    const draft = fixture();
    const next = changeRecipeIngredient(draft, 0, replacement);
    expect(next.ingredients[0]).toMatchObject({ amount: null, unit: "serving", ingredient_type: "QUANT" });
    expect(next.steps[0].ingredients_used).toEqual([{ ingredient_id: "yogurt", row_key: draft.ingredients[0].row_key, amount: null, unit: null, cut_size: null }]);
  });
  it("keeps raw quantity and legacy identity when reselecting the same pinned product with a different label basis unit", () => {
    const draft=fixture();
    const previous={...draft.ingredients[0],food_product_id:"product",food_product_nutrition_version_id:"v1",amount:0.125,unit:"package",scalable:false};
    draft.ingredients[0]=previous;
    draft.steps[0].ingredients_used=[{row_key:previous.row_key,ingredient_id:"old",amount:0.125,unit:"package",cut_size:null}];
    const replacement={...ingredient("unused-representative"),ingredient_id:null,food_product_id:"product",food_product_nutrition_version_id:"v1",unit:"g",amount:null};
    const next=changeRecipeIngredient(draft,0,replacement);
    expect(next.ingredients[0]).toEqual({...replacement,ingredient_id:previous.ingredient_id,display_text:previous.display_text,source_kind:"food_product",row_key:previous.row_key,component_label:previous.component_label,amount:previous.amount,unit:previous.unit,ingredient_type:previous.ingredient_type,scalable:previous.scalable});
    expect(next.steps).toEqual(draft.steps);
    expect(draft.ingredients[0]).toEqual(previous);
  });
  it("preserves to-taste wording, component, scale policy and step text on exact-pair confirmation", () => {
    const draft=fixture();
    const previous={...draft.ingredients[0],food_product_id:"product",food_product_nutrition_version_id:"v1",amount:null,unit:"개",ingredient_type:"TO_TASTE" as const,display_text:"적당량 / 한꼬집",scalable:false,component_label:"소스"};
    draft.ingredients[0]=previous;
    draft.steps[0]={...draft.steps[0],component_label:"소스",instruction:"소스에 한꼬집 그대로 넣어요",ingredients_used:[{row_key:previous.row_key,ingredient_id:"old",amount:null,unit:null,cut_size:null}]};
    const replacement={...ingredient("new-link"),ingredient_id:null,food_product_id:"product",food_product_nutrition_version_id:"v1",unit:"g"};
    const next=changeRecipeIngredient(draft,0,replacement);
    expect(next.ingredients[0]).toEqual({...previous,source_kind:"food_product"});
    expect(next.steps).toEqual(draft.steps);
    expect(draft.ingredients[0]).toEqual(previous);
  });
  it("removes references to deleted ingredients so later saves do not fail", () => {
    const next = changeRecipeIngredient(fixture(), 0, null);
    expect(next.ingredients.map((item) => item.ingredient_id)).toEqual(["onion"]);
    expect(next.steps[0].ingredients_used).toEqual([]);
  });
  it("rejects duplicate canonical ingredient replacement", () => {
    const draft = fixture(); expect(changeRecipeIngredient(draft, 0, ingredient("onion"))).toBe(draft);
  });
  it.each([false, true])("keeps references in other components and unlabelled steps intact (remove: %s)", (remove) => {
    const draft = fixture();
    draft.ingredients = [{ ...ingredient("old"), component_label: "푸딩" }, { ...ingredient("old"), component_label: "콩포트" }];
    draft.steps = ["푸딩", "콩포트", null].map((component_label, index) => ({ ...draft.steps[0], step_number: index + 1, component_label }));
    const next = changeRecipeIngredient(draft, 0, remove ? null : ingredient("new"));
    expect(next.steps[0].ingredients_used.map((item) => item.ingredient_id)).toEqual(remove ? [] : ["new"]);
    expect(next.steps[1]).toEqual(draft.steps[1]);
    expect(next.steps[2]).toEqual(draft.steps[2]);
    expect(next.ingredients.at(-1)).toEqual(draft.ingredients[1]);
  });

  it("preserves the chosen product and exact nutrition version", () => {
    expect(toRecipeEditIngredient({ ingredient_id: "soy", standard_name: "간장", amount: 10, unit: "g", ingredient_type: "QUANT", display_text: null, scalable: true, sort_order: 1, food_product_id: "product", food_product_nutrition_version_id: "version" })).toMatchObject({ ingredient_id: "soy", food_product_id: "product", food_product_nutrition_version_id: "version" });
  });
});
