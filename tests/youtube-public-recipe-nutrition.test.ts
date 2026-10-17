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
 it("keeps an unresolved v4 count missing while recovering other exact gram rows",async()=>{
  const quantity={schema_version:"quantity-v4",raw_value:"2",raw_unit:"개",numerator:"2",denominator:"1",normalized:null,display_quantity:{amount:2,unit:"개"},quality:"unavailable",reason:"PIECE_IDENTITY_REQUIRED",evidence_ids:[],source_versions:[],batch_basis:null};
  const result=await calculatePublicYoutubeRecipeNutrition({...input,ingredients:[row,{...row,id:"row-b",amount:2,unit:"개",quantity_input:quantity} as RecipeIngredient]});
  expect(result.calculation_status).toBe("partial");expect(result.values.energy_kcal).toMatchObject({status:"partial",known_amount:200,amount:null});expect(result.availability_reason).toBeNull();
 });
 it("recovers exact frozen kg input but rejects a forged normalization or estimated spoon grams",async()=>{
  const quantity={schema_version:"quantity-v4",raw_value:"1/10",raw_unit:"kg",numerator:"1",denominator:"10",normalized:{amount:100,unit:"g"},display_quantity:{amount:100,unit:"g"},quality:"direct",reason:null,evidence_ids:[],source_versions:[],batch_basis:null};
  const result=await calculatePublicYoutubeRecipeNutrition({...input,ingredients:[{...row,quantity_input:quantity} as RecipeIngredient]});expect(result.values.energy_kcal.amount).toBe(200);
  for(const patch of [{normalized:{amount:200,unit:"g"}},{quality:"estimated",raw_unit:"큰술"},{reason:"INVALID_QUANTITY"}]){
   const unknown=await calculatePublicYoutubeRecipeNutrition({...input,ingredients:[{...row,quantity_input:{...quantity,...patch}} as RecipeIngredient]});expect(unknown.values.energy_kcal.amount).toBeNull();expect(unknown.values.energy_kcal.known_amount).toBeNull();
  }
 });
 it("never uses legacy spoon conversion just because another row has a v4 pin",async()=>{
  const quantity={schema_version:"quantity-v4",raw_value:"1",raw_unit:"g",numerator:"1",denominator:"1",normalized:{amount:1,unit:"g"},display_quantity:{amount:1,unit:"g"},quality:"direct",reason:null,evidence_ids:[],source_versions:[],batch_basis:null};
  const result=await calculatePublicYoutubeRecipeNutrition({...input,ingredients:[{...row,amount:1,quantity_input:quantity} as RecipeIngredient,{...row,id:"spoon",amount:2,unit:"큰술"}]});
  expect(result.values.energy_kcal).toMatchObject({status:"partial",known_amount:2});
 });
 it("keeps products out of the generic source resolver",async()=>{
  const result=await calculatePublicYoutubeRecipeNutrition({...input,ingredients:[{...row,food_product_id:"product"}]});expect(result.availability_reason).toBe("missing");expect(evidence.load).not.toHaveBeenCalled();
 });
 it("propagates evidence infrastructure errors instead of inventing zero nutrition",async()=>{
  evidence.load.mockRejectedValue(new Error("READ_FAILED"));await expect(calculatePublicYoutubeRecipeNutrition(input)).rejects.toThrow("READ_FAILED");
 });
});
