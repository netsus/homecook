import { describe, expect, it, vi } from "vitest";
import { productPurchaseSuggestion, readProductQuantityContexts, scaleProductAmount, shoppingProductPurchaseAmounts } from "@/lib/server/recipe-product-quantity";
const context = { basis: { amount: 100, unit: "g" }, basis_relations: [{ from: { amount: 1, unit: "package" }, to: { amount: 100, unit: "g" } }] };
describe("fixed product quantity for shopping", () => {
  it("combines only this version's compatible required amounts and keeps purchase rounding separate", () => {
    const input = [{ amount: 50, unit: "g" }, { amount: 0.5, unit: "package" }];
    const required = [{ amount: 150, unit: "g" }];
    expect(productPurchaseSuggestion(required, context)).toEqual({ amount: 2, unit: "package" });
    expect(required).toEqual([{ amount: 150, unit: "g" }]);
    expect(input).toEqual([{ amount: 50, unit: "g" }, { amount: 0.5, unit: "package" }]);
  });
  it("preserves unknown specification entries and never borrows density or another version", () => {
    const unknown = [{ amount: 1, unit: "봉" }, { amount: 2, unit: "봉" }, { amount: 50, unit: "ml" }];
    expect(productPurchaseSuggestion(unknown, context)).toBeNull();
    expect(productPurchaseSuggestion([{ amount: 150, unit: "g" }], null)).toBeNull();
  });
  it.each([91, 93, 99, 33.3])("never buys a fourth package at an exact three-package boundary (%sg)", (grams) => {
    const exact = grams === 33.3 ? 99.9 : grams * 3;
    const label = { ...context, basis_relations: [{ from: { amount: 1, unit: "package" }, to: { amount: grams, unit: "g" } }] };
    expect(productPurchaseSuggestion([{ amount: exact, unit: "g" }], label)?.amount).toBe(3);
    expect(productPurchaseSuggestion([{ amount: exact + 0.01, unit: "g" }], label)?.amount).toBe(4);
  });
  it("keeps decimal scale, sums and genuine small excess separate without epsilon rounding", () => {
    const label = (grams: number) => ({ ...context, basis_relations: [{ from: { amount: 1, unit: "package" }, to: { amount: grams, unit: "g" } }] });
    expect(scaleProductAmount(0.1, 3, 1)).toBe(0.3);
    expect(productPurchaseSuggestion([{ amount: scaleProductAmount(0.1, 3, 1)!, unit: "g" }], label(0.3))?.amount).toBe(1);
    expect(productPurchaseSuggestion([{ amount: 0.3000001, unit: "g" }], label(0.3))?.amount).toBe(2);
    expect(productPurchaseSuggestion([{ amount: 0.07, unit: "g" }], label(0.01))?.amount).toBe(7);
    expect(productPurchaseSuggestion([{ amount: 0.0700001, unit: "g" }], label(0.01))?.amount).toBe(8);
    expect(productPurchaseSuggestion([{ amount: 0.1, unit: "g" }, { amount: 0.2, unit: "g" }], label(0.1))?.amount).toBe(3);
    expect(productPurchaseSuggestion([{ amount: 2, unit: "serving" }], { ...context, basis_relations: [
      { from: { amount: 1, unit: "package" }, to: { amount: 120, unit: "g" } },
      { from: { amount: 1, unit: "serving" }, to: { amount: 60, unit: "g" } },
    ] })?.amount).toBe(1);
  });
  it("derives purchase counts from original pinned serving ratios, including nonterminating decimals", () => {
    const label={...context,basis_relations:[{from:{amount:1,unit:"package"},to:{amount:0.03,unit:"g"}}]};
    const raw=Array.from({length:9},()=>({amount:0.01,unit:"g",scale:[{numerator:1,denominator:3}]}));
    expect(productPurchaseSuggestion(raw,label)).toEqual({amount:1,unit:"package"});
    expect(productPurchaseSuggestion(raw.map(row=>({...row,amount:0.010000001})),label)).toEqual({amount:2,unit:"package"});
    const ingredients=[{ingredient_id:null,food_product_id:"product",food_product_nutrition_version_id:"version",amount:0.01,unit:"g",ingredient_type:"QUANT",scalable:true}];
    const recipes=[{recipe_id:"recipe",recipe_content_snapshot_id:"snapshot",shopping_servings:9,recipe_content_snapshots:{base_servings:3,ingredients_json:ingredients}}];
    expect(productPurchaseSuggestion(shoppingProductPurchaseAmounts(recipes,[]).get("product:version")??[],label)).toEqual({amount:1,unit:"package"});
    expect(shoppingProductPurchaseAmounts([{...recipes[0],recipe_content_snapshots:null}],[]).size).toBe(0);
    const fixed={...ingredients[0],amount:0.01,scalable:false};
    const separate=[{...recipes[0],recipe_content_snapshots:{base_servings:3,ingredients_json:[fixed]}},
      {...recipes[0],recipe_content_snapshot_id:"snapshot-2",recipe_content_snapshots:{base_servings:3,ingredients_json:[{...fixed,food_product_nutrition_version_id:"version-2",amount:0.07}]}}];
    const meals=[{recipe_id:"recipe",recipe_content_snapshot_id:"snapshot"},{recipe_id:"recipe",recipe_content_snapshot_id:"snapshot"},{recipe_id:"recipe",recipe_content_snapshot_id:"snapshot-2"}];
    const separateAmounts=shoppingProductPurchaseAmounts(separate,meals);
    expect(separateAmounts.get("product:version")).toEqual([{amount:0.01,unit:"g",scale:[{numerator:2,denominator:1}]}]);
    expect(separateAmounts.get("product:version-2")).toEqual([{amount:0.07,unit:"g",scale:[{numerator:1,denominator:1}]}]);
    expect(productPurchaseSuggestion(separateAmounts.get("product:version")??[],label)?.amount).toBe(1);
    expect(productPurchaseSuggestion(separateAmounts.get("product:version-2")??[],label)?.amount).toBe(3);
    for(const scale of [[{numerator:0,denominator:1}],[{numerator:1,denominator:0}],[{numerator:-1,denominator:3}],[{numerator:1.5,denominator:3}],[{numerator:Number.MAX_SAFE_INTEGER+1,denominator:3}]]) expect(productPurchaseSuggestion([{amount:0.01,unit:"g",scale}],label)).toBeNull();
    expect(productPurchaseSuggestion(Array(201).fill(raw[0]),label)).toBeNull();
    expect(productPurchaseSuggestion([{amount:1e-3,unit:"g",scale:[{numerator:30,denominator:1}]}],label)).toEqual({amount:1,unit:"package"});
    expect(productPurchaseSuggestion([{amount:Infinity,unit:"g"}],label)).toBeNull();
  });
  it("requests the exact product/version pair without a representative ID", async () => {
    const client = { rpc: vi.fn(async () => ({ data: [{ id: "product:version", unit_context: context }], error: null })) };
    const result = await readProductQuantityContexts(client, "owner", [{ food_product_id: "product", food_product_nutrition_version_id: "version" }]);
    expect(result.get("product:version")).toEqual(context);
    expect(client.rpc).toHaveBeenCalledWith("read_recipe_product_nutrition_predecessors", { p_owner_uuid: "owner", p_ingredients: [{ id: "product:version", ingredient_id: null, food_product_id: "product", food_product_nutrition_version_id: "version" }] });
  });
});
