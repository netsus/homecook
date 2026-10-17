import {beforeEach,describe,expect,it,vi} from "vitest";
import {calculatePublicYoutubeRecipeNutrition} from "@/lib/server/youtube-public-recipe-nutrition";
import type {RecipeIngredient} from "@/types/recipe";
const evidence=vi.hoisted(()=>({load:vi.fn(),hydrate:vi.fn()}));
vi.mock("@/scripts/lib/recipe-nutrition-predecessor.mjs",()=>({loadRecipeNutritionPredecessors:evidence.load,hydrateRecipeNutritionIngredients:evidence.hydrate}));
const row:RecipeIngredient={id:"row-a",ingredient_id:"ingredient-a",standard_name:"재료",amount:100,unit:"g",ingredient_type:"QUANT",scalable:true,sort_order:1,display_text:null,component_label:null};
const input={client:{from:vi.fn()},recipeId:"recipe-a",revision:2,baseServings:2,ingredients:[row]};
const source={id:"source",review_status:"approved",freshness_status:"current",is_active:true,provider:"RDA",dataset:"fixture",source_version:"v1",data_basis_date:"2026-10-17",license:"CC0-1.0",source_url:"https://example.test/nutrition"};
beforeEach(()=>{vi.clearAllMocks();evidence.load.mockResolvedValue(new Map());evidence.hydrate.mockImplementation(rows=>rows.map((r:RecipeIngredient)=>({...r,preparation_state:"raw-edible",nutrition:{link:{id:"link",review_status:"approved",is_active:true,is_primary:true,preparation_state:"raw-edible"},profile:{id:"profile",basis_amount:100,basis_unit:"g",review_status:"approved",is_active:true,values:{energy_kcal:{amount:200,value_status:"observed"},carbohydrate_g:{amount:30,value_status:"observed"},protein_g:{amount:5,value_status:"observed"},fat_g:{amount:7,value_status:"observed"},sodium_mg:{amount:null,value_status:"missing"}}},source}})));});
describe("authorized public canonical recipe nutrition",()=>{
 it("calculates from existing approved evidence even when a persisted recipe snapshot was never created",async()=>{
  const result=await calculatePublicYoutubeRecipeNutrition(input);
  expect(result.values.energy_kcal).toMatchObject({amount:200,status:"complete"});
  expect(result.values.sodium_mg).toMatchObject({amount:null,status:"unavailable"});
  expect(result.sources[0]).toMatchObject({provider:"RDA",source_url:source.source_url,data_basis_date:"2026-10-17"});
  expect(evidence.load).toHaveBeenCalledWith(input.client,["ingredient-a"]);
  expect(input.client.from).not.toHaveBeenCalled();expect(result).not.toHaveProperty("input_hash");expect(result).not.toHaveProperty("snapshot_id");
 });
 it("keeps missing quantities partial and distinguishes them from missing source evidence",async()=>{
  const result=await calculatePublicYoutubeRecipeNutrition({...input,ingredients:[row,{...row,id:"row-b",amount:null,unit:null}]});
  expect(result.calculation_status).toBe("partial");expect(result.values.energy_kcal).toMatchObject({amount:null,known_amount:200,status:"partial"});
  expect(result.warnings).toContain("INVALID_QUANTITY");
  evidence.hydrate.mockImplementation(rows=>rows);const missing=await calculatePublicYoutubeRecipeNutrition(input);
  expect(missing.values.energy_kcal).toMatchObject({amount:null,known_amount:null,status:"unavailable"});expect(missing.warnings).toContain("NUTRITION_PROFILE_MISSING");
 });
 it("does not reinterpret frozen v4 quantity or product identities through legacy conversions",async()=>{
  for(const extra of [{quantity_input:{}},{food_product_id:"product"}]){
   const result=await calculatePublicYoutubeRecipeNutrition({...input,ingredients:[{...row,...extra} as RecipeIngredient]});
   expect(result.availability_reason).toBe("missing");
  }
  expect(evidence.load).not.toHaveBeenCalled();
 });
 it("propagates evidence infrastructure errors instead of inventing zero nutrition",async()=>{
  evidence.load.mockRejectedValue(new Error("READ_FAILED"));await expect(calculatePublicYoutubeRecipeNutrition(input)).rejects.toThrow("READ_FAILED");
 });
});
