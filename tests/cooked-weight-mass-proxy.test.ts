import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { curryLabels, curryPrediction, curryRows, currySteps } from "./fixtures/curry-mass-proxy";
import { MASS_PROXY_POLICY_SHA256, withRecipeMassProxy } from "@/lib/server/cooked-weight-mass-proxy";
import { predictSnapshotWeight } from "@/lib/server/cooked-weight-snapshot-prediction";
import { snapshotIngredients } from "@/lib/server/cooked-batch-weight-estimate";
describe("disclosed raw mass proxy, never a curry yield factor",()=>{
 it("includes all observed curry rows with separate raw-input bounds and unmodelled loss",()=>{
  const result=curryPrediction();expect(result.prediction.totalGrams).toBe(3119.7);expect(result.prediction.modelVersion).toBe("recipe-mass-proxy-v1");
  expect(result.prediction.massProxy).toMatchObject({inputLowGrams:3059.55,inputHighGrams:3153.5,cookingLoss:"unmodelled",labelSource:"authorized_cook_mode",policySha256:MASS_PROXY_POLICY_SHA256});
  expect(result.prediction.massProxy!.rows).toHaveLength(curryRows.length);expect(result.prediction.input!.rows[7].grams).toBeNull();expect(result.prediction.learningEligible).toBe(false);
  if(process.env.HOMECOOK_EXPORT_CURRY_FIXTURE==="1")writeFileSync(".artifacts/feedback-ui/curry-model-prediction.json",JSON.stringify(result,null,2));
 });
 it("scales every row once and preserves the source snapshot",()=>{const before=JSON.stringify(curryRows);expect(curryPrediction(curryRows,curryLabels,currySteps,4).prediction.totalGrams).toBe(6239.4);expect(JSON.stringify(curryRows)).toBe(before);});
 it.each([1,4,5])("does not silently omit missing main food/water row %s",i=>{const rows=structuredClone(curryRows);rows[i].amount=null;expect(curryPrediction(rows).prediction.totalGrams).toBeNull();});
 it("rounds serialized decimals like PostgreSQL numeric",()=>{const rows=structuredClone(curryRows);rows[1].amount=10.075;const result=curryPrediction(rows);expect(result.prediction.massProxy!.rows[1].grams).toBe(10.08);expect(result.prediction.totalGrams).toBe(2729.78);});
 it("multiplies small fractional spoons as decimal before rounding",()=>{const rows=structuredClone(curryRows);rows[8].amount=.0375;const result=curryPrediction(rows);expect(result.prediction.massProxy!.rows[8]).toMatchObject({grams:.68,lowGrams:.23,highGrams:.84});});
 it("rejects unknown major units and a large seasoning assumption",()=>{const rows=structuredClone(curryRows);rows[1].unit="개";expect(curryPrediction(rows).prediction.totalGrams).toBeNull();rows[1].unit="g";rows[8].amount=100;expect(curryPrediction(rows).prediction.totalGrams).toBeNull();});
 it("requires matching owner-read row identities, not display labels from a request",()=>{const labels=structuredClone(curryLabels);labels[1].ingredient_id=labels[0].ingredient_id;expect(curryPrediction(curryRows,labels).prediction.totalGrams).toBeNull();});
 it("rejects product name based conversions",()=>{const rows=structuredClone(curryRows) as unknown as Record<string,unknown>[];Object.assign(rows[8],{food_product_id:"c6000000-0000-4000-8000-000000000001",food_product_nutrition_version_id:"c7000000-0000-4000-8000-000000000001"});const labels=rows.map((r,i)=>({...curryLabels[i],...r}));const base=predictSnapshotWeight({snapshotId:"c2000000-0000-4000-8000-000000000001",baseServings:2,cookingServings:2,ingredients:snapshotIngredients(rows)!});expect(withRecipeMassProxy(base,rows,labels,currySteps,currySteps as never).prediction.totalGrams).toBeNull();});
 it("does not repair malformed frozen proof with a household assumption",()=>{const rows=structuredClone(curryRows);Object.assign(rows[8],{quantity_input:{quality:"unavailable"}});expect(curryPrediction(rows).prediction.totalGrams).toBeNull();});
 it("does not turn missing oil into zero or infer unknown large oil",()=>{const labels=structuredClone(curryLabels);labels[0].standard_name="라드";expect(curryPrediction(curryRows,labels).prediction.totalGrams).toBeNull();});
 it("does not attach another ingredient’s small dose to oil or downgrade a missing litre quantity",()=>{const rows=structuredClone(curryRows);rows[0].unit="l";expect(curryPrediction(rows).prediction.totalGrams).toBeNull();const steps=[...currySteps];steps[0]={...steps[0],instruction:"식용유 넉넉히, 후추 약간을 넣는다."};expect(curryPrediction(curryRows,curryLabels,steps).prediction.totalGrams).toBeNull();});
 it("rejects drainage, extra water and deep frying",()=>{for(const instruction of ["국물을 버려 주세요.","물을 더 넣는다.","튀긴다.","삶은 뒤 물을 따라낸다.","체로 걸러낸다."]){const steps=[...currySteps];steps[1]={...steps[1],instruction};expect(curryPrediction(curryRows,curryLabels,steps).prediction.totalGrams).toBeNull();}});
});
