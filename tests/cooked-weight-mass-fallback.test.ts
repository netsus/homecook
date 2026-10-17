import {describe,expect,it} from "vitest";
import {withIngredientMassFallback} from "@/lib/server/cooked-weight-mass-fallback";
import {predictSnapshotWeight} from "@/lib/server/cooked-weight-snapshot-prediction";
import type {CookingWeightSnapshotIngredient} from "@/lib/server/cooked-batch-weight-estimate";
const snapshotId="550e8400-e29b-41d4-a716-446655440601";
const row:CookingWeightSnapshotIngredient={id:"row",ingredient_id:"550e8400-e29b-41d4-a716-446655440602",ingredient_type:"QUANT",amount:100,unit:"g",scalable:true,preparation_state:null};
function original(rows=[row],baseServings=2,cookingServings=2){return predictSnapshotWeight({snapshotId,baseServings,cookingServings,ingredients:rows});}
describe("disclosed ingredient mass 75 percent fallback",()=>{
 it("estimates only a completely known input mass and retains its original reasons and proof",()=>{
  const before=original();const result=withIngredientMassFallback(before);
  expect(before.prediction.totalGrams).toBeNull();expect(result.prediction).toMatchObject({modelVersion:"ingredient-mass-75-v1",totalGrams:75,status:"estimated",learningEligible:false,assumptions:["ingredient_mass_seventy_five_percent"],appliedRules:[]});
  expect(result.prediction.reasons).toEqual(before.prediction.reasons);expect(result.prediction.input).toBe(before.prediction.input);expect(before.prediction.totalGrams).toBeNull();
 });
 it("applies the already-frozen serving scale exactly once and respects fixed rows",()=>{
  const result=withIngredientMassFallback(original([row,{...row,id:"fixed",amount:20,scalable:false}],2,3));
  expect(result.prediction.totalGrams).toBe(127.5);
 });
 it.each([{amount:null},{unit:"개"},{ingredient_type:"TO_TASTE" as const,amount:null,unit:null},{amount:-1}])("keeps unknown or invalid mass unavailable %j",patch=>{
  const before=original([{...row,...patch}]);expect(withIngredientMassFallback(before)).toBe(before);expect(before.prediction.totalGrams).toBeNull();
 });
 it.each([[100.3,75.23],[14.7,11.03],[101.1,75.83],[1e-7,0]])("rounds serialized decimal %s exactly like SQL numeric",(amount,expected)=>{
  const result=withIngredientMassFallback(original([{...row,amount}]));
  expect(result.prediction.totalGrams).toBe(expected||null);
 });
 it("sums decimal rows before rounding and handles the frozen scale once",()=>{
  expect(withIngredientMassFallback(original([{...row,amount:0.1},{...row,id:"other",amount:100.2}])).prediction.totalGrams).toBe(75.23);
  expect(withIngredientMassFallback(original([{...row,amount:66.86666666666667}],2,3)).prediction.totalGrams).toBe(75.23);
 });
 it("does not replace a known condition-based estimate",()=>{
  const before=original();const known={...before,prediction:{...before.prediction,status:"estimated" as const,totalGrams:69,assumptions:[]}};
  expect(withIngredientMassFallback(known)).toBe(known);
 });
 it("does not skip an unquantified seasoning or accept partial totals",()=>{
  const before=original([row,{...row,id:"salt",ingredient_type:"TO_TASTE",amount:null,unit:null}]);
  expect(withIngredientMassFallback(before).prediction.totalGrams).toBeNull();
 });
});
