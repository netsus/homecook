import {beforeEach,describe,expect,it,vi} from "vitest";
import {applyExecutionQuantityChanges,calculateExecutionQuantities,executionWeightSummary,parseExecutionQuantityChanges} from "@/lib/server/cooking-execution-quantities";
const hydration=vi.hoisted(()=>({hydrate:vi.fn()}));
vi.mock("@/scripts/lib/recipe-nutrition-predecessor.mjs",()=>({loadRecipeNutritionPredecessors:async()=>new Map(),hydrateRecipeNutritionIngredients:(rows:unknown[])=>hydration.hydrate(rows)}));
const pin="c2000000-0000-4000-8000-000000000001",ingredient="c5000000-0000-4000-8000-000000000001";
const source={id:"source",provider:"MFDS",dataset:"test",source_version:"reviewed-test-v1",data_basis_date:null,license:"test",source_url:"https://example.test/food",review_status:"approved",freshness_status:"current",is_active:true};
const values=Object.fromEntries(["energy_kcal","carbohydrate_g","protein_g","fat_g","sodium_mg"].map(code=>[code,{amount:100,value_status:"observed"}]));
const rows=[{ingredient_id:ingredient,amount:100,unit:"g",ingredient_type:"QUANT",scalable:true,standard_name:"food",display_text:null}];
beforeEach(()=>{hydration.hydrate.mockImplementation((rows:Record<string,unknown>[])=>rows.map(row=>({...row,preparation_state:"raw",nutrition:{link:{id:"link",review_status:"approved",is_active:true,is_primary:true,preparation_state:"raw"},profile:{id:"profile",basis_amount:100,basis_unit:"g",review_status:"approved",is_active:true,values},source}})));});
function calculate(input=rows,originalRows=rows){return calculateExecutionQuantities({client:{from:()=>null,rpc:vi.fn()},ownerId:"owner",recipeId:"recipe",snapshotId:pin,baseServings:2,cookingServings:4,rows:input,originalRows,steps:[],cookingSteps:[]});}
describe("owner cooking execution quantity calculation",()=>{
 it("accepts a bounded strict quantity-only patch",()=>{
  expect(parseExecutionQuantityChanges({expected_revision:0,changes:[{row_index:0,amount:190,unit:"g"}]})).not.toBeNull();
  for(const changes of [[{row_index:0,amount:0,unit:"g"}],[{row_index:0,amount:NaN,unit:"g"}],[{row_index:200,amount:1,unit:"g"}],[{row_index:0,amount:1,unit:"g",ingredient_id:"other"}]])expect(parseExecutionQuantityChanges({expected_revision:0,changes})).toBeNull();
 });
 it("retains original identity/raw source, fixes edited current amounts and applies serving scale once",async()=>{
  const original=structuredClone(rows);const baseline=await calculate();expect(baseline.nutrition.values.energy_kcal.amount).toBe(200);expect(baseline.prediction.prediction.totalGrams).toBe(150);
  const edited=applyExecutionQuantityChanges(rows,[{row_index:0,amount:190,unit:"g"}]);
  const result=await calculate(edited as typeof rows);expect(result.nutrition.values.energy_kcal.amount).toBe(190);expect(result.prediction.prediction.totalGrams).toBe(142.5);
  expect(result.prediction.prediction.input?.rows[0].quantityOrigin).toBe("reported_actual");expect(rows).toEqual(original);expect(edited[0].ingredient_id).toBe(ingredient);expect(edited[0].scalable).toBe(false);
 });
 it("handles kg and unknown quantities without inventing complete nutrition or total mass",async()=>{
  const kg=await calculate(applyExecutionQuantityChanges(rows,[{row_index:0,amount:.19,unit:"kg"}]) as typeof rows);expect(kg.nutrition.values.energy_kcal.amount).toBe(190);expect(kg.prediction.prediction.totalGrams).toBe(142.5);
  const unknown=await calculate(applyExecutionQuantityChanges(rows,[{row_index:0,amount:null,unit:"g"}]) as typeof rows);expect(unknown.nutrition.values.energy_kcal.amount).toBeNull();expect(unknown.prediction.prediction.totalGrams).toBeNull();
 });
 it("removes stale quantity metadata only from edited rows and rejects absent indexes",()=>{
  const original=[{...rows[0],quantity_input:{original:"untouched"}},{...rows[0]}];const edited=applyExecutionQuantityChanges(original,[{row_index:1,amount:50,unit:"g"}]);expect(edited[0].quantity_input).toEqual({original:"untouched"});expect(edited[1]).not.toHaveProperty("quantity_input");expect(()=>applyExecutionQuantityChanges(rows,[{row_index:3,amount:1,unit:"g"}])).toThrow();
 });
 it("freezes total nutrition as a serving basis and exposes only the approved public weight summary",async()=>{
  const result=await calculate(applyExecutionQuantityChanges(rows,[{row_index:0,amount:190,unit:"g"}]) as typeof rows);
  expect(result.nutritionSnapshot.base_servings).toBe(4);expect(result.nutritionSnapshot.fixed_values.energy_kcal).toBe(190);expect(result.nutritionSnapshot.scalable_values.energy_kcal).toBe(0);
  expect(executionWeightSummary({revision:1,snapshot_id:pin,base_servings:2,cooking_servings:4,original_rows:rows,rows,steps:[],nutrition_snapshot:result.nutritionSnapshot,prediction:{...result.prediction}})).toMatchObject({source:"conditional_estimate",predicted_g:142.5,model_version:"ingredient-mass-75-v1"});
 });
});
