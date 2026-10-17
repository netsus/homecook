import {spawnSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {predictSnapshotWeight} from "@/lib/server/cooked-weight-snapshot-prediction";
import {withIngredientMassFallback} from "@/lib/server/cooked-weight-mass-fallback";
const database=`execution_fixture_${process.pid}_${Date.now()}`;let createdDatabase=false;
const enabled=process.env.HOMECOOK_MASS_FALLBACK_ISOLATED_PG==="1",container=process.env.HOMECOOK_MASS_FALLBACK_ISOLATED_CONTAINER??"";
const owner="c1000000-0000-4000-8000-000000000001",pin="c2000000-0000-4000-8000-000000000001",session="c3000000-0000-4000-8000-000000000001",key="c4000000-0000-4000-8000-000000000001",ingredient="c5000000-0000-4000-8000-000000000001",recipe="c6000000-0000-4000-8000-000000000001";
const original=[{ingredient_id:ingredient,standard_name:"fixture food",amount:100,unit:"g",ingredient_type:"QUANT" as const,scalable:true,display_text:null}];
const changed=[{...original[0],amount:190,scalable:false}];
const args=`'${owner}',clock_timestamp(),'synthetic-fixture',1,clock_timestamp()`;
function literal(value:unknown){return `'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;}
const nutrition={base_servings:4,calculated_at:"2026-10-17T20:00:00Z",calculation_quality:"direct",calculation_status:"complete",calculation_version:"recipe-nutrition-v3",input_hash:"a".repeat(64),missing_reasons:[],warnings:[],reflected_ingredient_count:1,target_ingredient_count:1,sources:[{provider:"MFDS",dataset:"fixture",source_version:"fixture-v1",data_basis_date:null,license:"fixture",source_url:"https://example.test/food"}],fixed_values:{energy_kcal:190,carbohydrate_g:190,protein_g:190,fat_g:190,sodium_mg:190},scalable_values:{energy_kcal:0,carbohydrate_g:0,protein_g:0,fat_g:0,sodium_mg:0},nutrient_status:Object.fromEntries(["energy_kcal","carbohydrate_g","protein_g","fat_g","sodium_mg"].map(code=>[code,{amount:190,known_amount:null,status:"complete",display_mode:"total"}]))};
const prediction=withIngredientMassFallback(predictSnapshotWeight({snapshotId:pin,baseServings:2,cookingServings:4,ingredients:changed.map((row,index)=>({...row,id:String(index),preparation_state:null}))}));
const patch=[{row_index:0,amount:190,unit:"g"}];
function sql(input:string){return spawnSync("docker",["exec","-i",container,"psql","-U","postgres","-d",database,"-XqAt","-v","ON_ERROR_STOP=1"],{input,encoding:"utf8"});}
const seed=`insert into public.users values('${owner}');insert into public.recipe_content_snapshots values('${pin}',2,${literal(original)},'[]');insert into public.cooking_sessions values('${session}','${owner}','${recipe}','snapshot_v2','in_progress','${pin}',4);insert into public.nutrition_sources values('MFDS','fixture','fixture-v1',null,'fixture','https://example.test/food','approved','current',true);`;
const save=(revision=0,rows:unknown=changed,changes:unknown=patch)=>`select public.save_cooking_execution_quantities(${args},'${session}','${key}',${revision},'${pin}',${literal(rows)},${literal(nutrition)},${literal(prediction)},${literal(changes)});`;
const complete=(revision=1,measured="null")=>`select public.complete_cooking_execution(${args},'${session}','${key}','{}','${measured==="null"?"weigh_later":"set_finished_weight"}',${measured},null,null,false,${revision},clock_timestamp());`;
function run(statement:string){return sql(`begin;${seed}${statement}rollback;`);}
describe.skipIf(!enabled)("execution SQL in owned networkless minimal fixture (not full schema)",()=>{
 beforeAll(()=>{expect(container).toMatch(/^[0-9a-f]{64}$/);const result=spawnSync("docker",["inspect","--format",'{{.Id}}|{{.Name}}|{{.HostConfig.NetworkMode}}|{{index .Config.Labels "homecook.cooking-experience-session"}}',container],{encoding:"utf8"});expect(result.status).toBe(0);expect(result.stdout.trim()).toBe(`${container}|/hc-mass-fallback-20261017-1781|none|20261017`);
  const created=spawnSync("docker",["exec",container,"createdb","-U","postgres",database],{encoding:"utf8"});expect(created.status,created.stderr).toBe(0);createdDatabase=true;
  const foundation=readFileSync("supabase/migrations/20260716090000_add_recipe_nutrition_snapshots.sql","utf8");
  const ledger=readFileSync("supabase/migrations/20260809120000_cooked_batch_weight_ledger.sql","utf8");
  function extract(source:string,name:string,delimiter:string){const start=source.indexOf(name);if(start<0)throw new Error("fixture function missing");const end=source.indexOf(delimiter,start);if(end<0)throw new Error("fixture function end missing");return source.slice(start,end+delimiter.length);}
  const fixture=[readFileSync("tests/fixtures/cooking-execution-minimal.sql","utf8"),extract(foundation,"create function public.decode_recipe_nutrition_query_key", "$$;"),extract(foundation,"create function public.validate_recipe_nutrition_snapshot_payload", "$$;"),extract(ledger,"create or replace function private.claim_cooked_batch_operation", "$function$;"),extract(ledger,"create or replace function private.finish_cooked_batch_operation", "$function$;"),readFileSync("supabase/migrations/20261017220000_cooking_execution_quantities.sql","utf8")].join("\n");
  const migrated=sql(fixture);expect(migrated.status,migrated.stderr).toBe(0);
 });
 afterAll(()=>{if(createdDatabase){const result=spawnSync("docker",["exec",container,"dropdb","-U","postgres",database],{encoding:"utf8"});expect(result.status,result.stderr).toBe(0);}});
 it("saves only the execution, restores rows on read and freezes its nutrition/weight at completion",()=>{
  const result=run(`${save()}select public.read_cooking_execution_quantities(${args},'${session}')#>'{rows,0}';${complete()}select ingredients_json#>>'{0,amount}' from public.recipe_content_snapshots where id='${pin}';`);
  expect(result.status,result.stderr).toBe(0);const rows=result.stdout.trim().split('\n');expect(JSON.parse(rows[1])).toMatchObject({amount:190,scalable:false});expect(JSON.parse(rows[2])).toMatchObject({weight_g:142.5,nutrition:{values:{energy_kcal:{amount:190}}}});expect(rows[3]).toBe("100");
 });
 it("uses a measured total without rescaling frozen total nutrition",()=>{const result=run(`${save()}${complete(1,"175")}`);expect(result.status,result.stderr).toBe(0);expect(JSON.parse(result.stdout.trim().split('\n')[1])).toMatchObject({weight_g:175,nutrition:{values:{energy_kcal:{amount:190}}}});});
 it("replays the same request without an extra revision or receipt",()=>{const result=run(`${save()}${save()}select revision from private.cooking_execution_quantities;select count(*) from public.mutation_idempotency_keys;`);expect(result.status,result.stderr).toBe(0);expect(result.stdout.trim().split('\n').slice(-2)).toEqual(["1","1"]);});
 it.each(["stale_complete","legacy_bypass","completed_edit","wrong_owner","forged_identity","forged_patch"])("rejects %s atomically",kind=>{
  let statement=save();
  if(kind==="stale_complete")statement+=complete(0);
  if(kind==="legacy_bypass")statement+=`select public.complete_snapshot_v2_cooking_session(${args},'${session}','${key}','{}','estimate_from_ingredients',150,clock_timestamp());`;
  if(kind==="completed_edit")statement=`update public.cooking_sessions set status='completed';${save()}`;
  if(kind==="wrong_owner")statement=save().replace(args,`'c1000000-0000-4000-8000-000000000002',clock_timestamp(),'synthetic-fixture',1,clock_timestamp()`);
  if(kind==="forged_identity")statement=save(0,[{...changed[0],ingredient_id:recipe}]);
  if(kind==="forged_patch")statement=save(0,changed,[{row_index:0,amount:999,unit:"g"}]);
  const result=run(statement);expect(result.status).not.toBe(0);expect(result.stderr).toMatch(/CONFLICT|RESOURCE_NOT_FOUND|VALIDATION_ERROR/);
 });
 it("refuses anonymous RPC access and direct service-role table reads",()=>{
  for(const statement of [`set local role anon;select public.read_cooking_execution_quantities(${args},'${session}');`,`set local role service_role;select * from private.cooking_execution_quantities;`]){const result=run(statement);expect(result.status).not.toBe(0);expect(result.stderr).toContain("permission denied");}
 });
});
