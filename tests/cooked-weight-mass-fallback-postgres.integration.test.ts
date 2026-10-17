import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {beforeAll,describe,expect,it} from "vitest";
import {predictSnapshotWeight} from "@/lib/server/cooked-weight-snapshot-prediction";
import {withIngredientMassFallback} from "@/lib/server/cooked-weight-mass-fallback";
const container=process.env.HOMECOOK_MASS_FALLBACK_ISOLATED_CONTAINER??"";
const enabled=process.env.HOMECOOK_MASS_FALLBACK_ISOLATED_PG==="1";
if(enabled&&!/^[0-9a-f]{64}$/.test(container))throw new Error("Exact owned empty fixture container required");
const owner="c1000000-0000-4000-8000-000000000001",pin="c2000000-0000-4000-8000-000000000001",batch="c3000000-0000-4000-8000-000000000001",receipt="c4000000-0000-4000-8000-000000000001";
const original=()=>predictSnapshotWeight({snapshotId:pin,baseServings:2,cookingServings:2,ingredients:[{id:"row",ingredient_id:"c5000000-0000-4000-8000-000000000001",amount:300,unit:"g",ingredient_type:"QUANT",scalable:true,preparation_state:null}]});
function sql(input:string){return spawnSync("docker",["exec","-i",container,"psql","-U","postgres","-d","postgres","-XqAt","-v","ON_ERROR_STOP=1"],{input,encoding:"utf8"});}
function run(prediction:unknown,inputSource:string|null=null,grams=225,{actor=owner,enabledGate=true,baseServings=2,cookingServings=2}={}){
 const context=JSON.stringify({receipt_id:receipt,prediction,input_source:inputSource}).replaceAll("'","''");
 return sql(`begin;
 insert into public.recipe_content_snapshots values('${pin}',${baseServings});
 insert into public.leftover_dishes values('${batch}','${owner}','${pin}',${cookingServings},${grams});
 insert into public.mutation_idempotency_keys values('${receipt}','${owner}',1,'in_progress','snapshot_v2_complete_weight_evidence');
 update private.cooked_batch_weight_evidence_control set enabled=${enabledGate};
 do $fixture$ begin perform set_config('homecook.cooked_weight_evidence_context','${context}',true); perform private.record_cooked_weight_evidence('${batch}','${actor}',1,1,'completion',clock_timestamp()); end $fixture$;
 select jsonb_agg(jsonb_build_object('source',input_source,'model',prediction_json->'prediction'->>'modelVersion','predicted_g',prediction_json->'prediction'->'totalGrams','measured_g',measured_g,'assumptions',prediction_json->'prediction'->'assumptions') order by event_kind) from private.cooked_batch_weight_evidence;
 rollback;`);
}
describe.skipIf(!enabled)("75% model SQL evidence in an owned networkless empty fixture",()=>{
 beforeAll(()=>{
  const inspect=spawnSync("docker",["inspect","--format",'{{.Id}}|{{.Name}}|{{.HostConfig.NetworkMode}}|{{index .Config.Labels "homecook.cooking-experience-session"}}',container],{encoding:"utf8"});
  expect(inspect.status).toBe(0);expect(inspect.stdout.trim()).toBe(`${container}|/hc-mass-fallback-20261017-1781|none|20261017`);
  const migrated=sql(readFileSync("supabase/migrations/20261017210000_cooked_weight_mass_fallback.sql","utf8"));expect(migrated.status,migrated.stderr).toBe(0);
 });
 it("stores a distinct disclosed estimate and keeps a later explicit measurement separate",()=>{
  const estimate=withIngredientMassFallback(original());const result=run(estimate);expect(result.status,result.stderr).toBe(0);
  expect(JSON.parse(result.stdout.trim())).toEqual([{source:"conditional_estimate",model:"ingredient-mass-75-v1",predicted_g:225,measured_g:null,assumptions:["ingredient_mass_seventy_five_percent"]}]);
  const measured=run(estimate,"reported_measured",190);expect(measured.status,measured.stderr).toBe(0);const rows=JSON.parse(measured.stdout.trim());
  expect(rows).toHaveLength(2);expect(rows.find((r:{source:string})=>r.source==="reported_measured").measured_g).toBe(190);expect(rows.find((r:{source:string})=>r.source==="conditional_estimate").predicted_g).toBe(225);
 });
 it.each([100.3,14.7,101.1])("accepts decimal boundary %sg from the real predictor",amount=>{
  const raw=original();const row={...raw.prediction.input!.rows[0],amount,grams:amount};
  const prediction=withIngredientMassFallback({...raw,prediction:{...raw.prediction,input:{...raw.prediction.input!,rows:[row]}}});
  const result=run(prediction);expect(result.status,result.stderr).toBe(0);
  expect(JSON.parse(result.stdout.trim())[0].predicted_g).toBe(prediction.prediction.totalGrams);
 });
 it("accepts fractional serving scale and evidenced conversion without rounding twice",()=>{
  const raw=predictSnapshotWeight({snapshotId:pin,baseServings:2,cookingServings:3,ingredients:[{id:"scaled",ingredient_id:"c5000000-0000-4000-8000-000000000001",amount:66.86666666666667,unit:"g",ingredient_type:"QUANT",scalable:true,preparation_state:null}]});
  const prediction=withIngredientMassFallback(raw);
  const result=run(prediction,null,75.23,{cookingServings:3});expect(result.status,result.stderr).toBe(0);expect(JSON.parse(result.stdout.trim())[0].predicted_g).toBe(75.23);
  const converted=structuredClone(prediction);Object.assign(converted.prediction.input!.rows[0],{amount:2,unit:"tbsp",grams:100.3,gramsEvidence:{status:"confirmed",kind:"ingredient_conversion",evidenceId:"conversion-fixture",version:"reviewed-v1"}});
  const convertedResult=run(converted,null,75.23,{cookingServings:3});expect(convertedResult.status,convertedResult.stderr).toBe(0);
 });
 it("preserves unavailable v2 evidence without creating a zero weight",()=>{const result=run(original(),null,0);expect(result.status,result.stderr).toBe(0);expect(JSON.parse(result.stdout.trim())[0]).toMatchObject({source:"unavailable",model:"bounded-weight-v2",predicted_g:null});});
 it.each(["total","to_taste","proof","duplicate"])("rejects a forged fallback %s",kind=>{
  const prediction=structuredClone(withIngredientMassFallback(original()));
  if(kind==="total")Object.assign(prediction.prediction,{totalGrams:999});
  if(kind==="to_taste")Object.assign(prediction.prediction.input!.rows[0],{quantityKind:"to_taste"});
  if(kind==="proof")Object.assign(prediction.prediction.input!.rows[0],{grams:301});
  if(kind==="duplicate")(prediction.prediction.input!.rows as unknown[]).push(prediction.prediction.input!.rows[0]);
  const result=run(prediction);expect(result.status).not.toBe(0);expect(result.stderr).toContain("VALIDATION_ERROR");
 });
 it.each([{actor:"c1000000-0000-4000-8000-000000000002"},{enabledGate:false}])("retains owner receipt and evidence gate protection %j",options=>{const result=run(withIngredientMassFallback(original()),null,225,options);expect(result.status).not.toBe(0);expect(result.stderr).toContain("CONFLICT");});
});
