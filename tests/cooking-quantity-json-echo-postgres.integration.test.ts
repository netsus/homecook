import {spawnSync} from "node:child_process";
import {beforeAll,describe,expect,it} from "vitest";
import {predictSnapshotWeight} from "@/lib/server/cooked-weight-snapshot-prediction";
import {withIngredientMassFallback} from "@/lib/server/cooked-weight-mass-fallback";
const enabled=process.env.HOMECOOK_COOKING_ECHO_PG==="1";
const container=process.env.HOMECOOK_WEIGHT_EVIDENCE_TEST_CONTAINER??"",tag=process.env.HOMECOOK_WEIGHT_EVIDENCE_TEST_TAG??"";
const image="public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a";
const owner="b1000000-0000-4000-8000-000000000001",other="b1000000-0000-4000-8000-000000000002",recipe="b2000000-0000-4000-8000-000000000001",pin="b3000000-0000-4000-8000-000000000002",ingredient="b8000000-0000-4000-8000-000000000001",cutover="b5000000-0000-4000-8000-000000000001",epoch="2026-08-08T00:00:00Z",issued="2026-08-08T01:00:00Z",hash="e".repeat(64);
const args=`'${owner}','${epoch}','${hash}',1,'${issued}'`;
const id=(n:number)=>`d4000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
function literal(value:unknown){return `'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;}
function sql(statement:string,succeeds=true,bootstrap=false){
 const inspect=spawnSync("docker",["inspect","--format",'{{.Config.Image}}|{{.HostConfig.NetworkMode}}|{{index .Config.Labels "homecook.cooked-weight-test"}}',container],{encoding:"utf8"});
 expect(inspect.status).toBe(0);expect(inspect.stdout.trim()).toBe(`${image}|none|${tag}`);
 const result=spawnSync("docker",["exec","-i",container,"psql","-h","/tmp/pgsocket","-U","supabase_admin","-d","postgres","-XqAt","-v","ON_ERROR_STOP=1","-c",`${bootstrap?"":"set session authorization postgres;"}${statement}`],{encoding:"utf8"});
 if(succeeds)expect(result.status,result.stderr).toBe(0);return result;
}
const original=[{ingredient_id:ingredient,amount:300,unit:"g",scalable:true,ingredient_type:"QUANT" as const,food_product_id:null}];
const changed=[{...original[0],amount:190,scalable:false,display_text:null}];
const prediction=(rows=changed)=>withIngredientMassFallback(predictSnapshotWeight({snapshotId:pin,baseServings:2,cookingServings:4,ingredients:rows.map((row,index)=>({...row,id:String(index),preparation_state:null}))}));
const codes=["energy_kcal","carbohydrate_g","protein_g","fat_g","sodium_mg"];
function nutrition(known=true){return {base_servings:4,calculated_at:"2026-10-17T20:00:00Z",calculation_quality:known?"direct":null,calculation_status:known?"complete":"unavailable",calculation_version:"recipe-nutrition-v3",input_hash:"a".repeat(64),missing_reasons:known?[]:[`INVALID_QUANTITY:${ingredient}`],warnings:known?[]:["INVALID_QUANTITY"],reflected_ingredient_count:known?1:0,target_ingredient_count:1,sources:known?[{provider:"FIXTURE",dataset:"Synthetic cooking test",source_version:"fixture-v1",data_basis_date:null,license:"Synthetic",source_url:"https://example.invalid/food"}]:[],fixed_values:known?Object.fromEntries(codes.map(code=>[code,190])):{},scalable_values:known?Object.fromEntries(codes.map(code=>[code,0])):{},nutrient_status:Object.fromEntries(codes.map(code=>[code,{amount:known?190:null,known_amount:null,status:known?"complete":"unavailable",display_mode:known?"total":null}]))};}
const save=(batch:string,key:string,revision=0,rows:unknown=changed,payload:unknown=nutrition(),pred:unknown=prediction(),patch:unknown=[{row_index:0,amount:190,unit:"g"}])=>`select public.save_cooking_execution_quantities(${args},'${batch}','${key}',${revision},'${pin}',${literal(rows)},${literal(payload)},${literal(pred)},${literal(patch)});`;
function service(statement:string,succeeds=true){return sql(`begin;set local request.jwt.claim.role='service_role';set local role service_role;${statement}commit;`,succeeds);}
function data(result:ReturnType<typeof sql>){return JSON.parse(result.stdout.trim().split("\n").at(-1)!);}

const frozenRowsSql=`[
 {"row_key":"first","ingredient_id":"${ingredient}","amount":300,"unit":"g","scalable":true,"ingredient_type":"QUANT","food_product_id":null},
 {"row_key":"fraction","ingredient_id":"${ingredient}","amount":0.14285714285714285,"unit":"kg","scalable":true,"ingredient_type":"QUANT","food_product_id":null,
 "display_text":"synthetic 1/7kg","quantity_input":{"schema_version":"quantity-v4","raw_value":"1/7","numerator":"1","denominator":"7","raw_unit":"kg","reason":null,"quality":"direct",
 "normalized":{"amount":142.85714285714285000,"unit":"g"},"display_quantity":{"amount":0.14285714285714285,"unit":"kg"},"evidence_ids":["synthetic-evidence"],"source_versions":["fixture-v1"],"context_sha256":"${"a".repeat(64)}","batch_basis":null}}
]`;
function session(n:number){
 const batch=id(900+n);
 sql(`select public.set_account_generation_internal_writer_marker('${cutover}',true);insert into public.cooking_sessions(id,user_id,status,contract_version,session_kind,recipe_id,recipe_content_snapshot_id,cooking_servings,base_recipe_revision)values('${batch}','${owner}','in_progress','snapshot_v2','standalone','${recipe}','${pin}',4,1);select public.set_account_generation_internal_writer_marker('${cutover}',false);`);
 return batch;
}
function rows(){return data(sql(`select ingredients_json from public.recipe_content_snapshots where id='${pin}';`));}
function edited(source=rows(),amount:number|null=190){
 const proposed=structuredClone(source);
 proposed[0]={...proposed[0],amount,unit:"g",ingredient_type:"QUANT",scalable:false,display_text:null};delete proposed[0].quantity_input;
 return proposed;
}
function stored(batch:string){return sql(`select rows_json::text from private.cooking_execution_quantities where session_id='${batch}';`).stdout.trim();}
function stableState(batch:string){return sql(`select jsonb_build_object('execution',(select to_jsonb(e)from private.cooking_execution_quantities e where session_id='${batch}'),'receipts',(select jsonb_agg(to_jsonb(r)order by id)from public.mutation_idempotency_keys r where owner_uuid='${owner}'),'pin',(select ingredients_json::text from public.recipe_content_snapshots where id='${pin}'));`).stdout;}
describe.skipIf(!enabled)("cooking frozen JSON transport echo on actual PostgreSQL",()=>{
 beforeAll(()=>{
  // The runner first executes the unchanged26-case authority suite. These are
  // synthetic additional pins, never data copied from the operating database.
  sql(`select public.set_account_generation_internal_writer_marker('${cutover}',true);insert into public.recipe_content_snapshots(id,owner_user_id,recipe_id,title,base_servings,ingredients_json,steps_json,content_hash,schema_version) values('${pin}','${owner}','${recipe}','synthetic fraction fixture',2,'${frozenRowsSql}'::jsonb,'[]',repeat('9',64),1);select public.set_account_generation_internal_writer_marker('${cutover}',false);`);
 });
 it("accepts a JS roundtrip while storing the exact untouched1/7kg proof",()=>{
  const batch=session(1),echo=edited();
  expect(sql(`select (${literal(echo)}->1->'quantity_input') is distinct from (ingredients_json->1->'quantity_input') from public.recipe_content_snapshots where id='${pin}';`).stdout.trim()).toBe("t");
  expect(data(service(save(batch,id(1901),0,echo)))).toMatchObject({success:true,data:{revision:1}});
  expect(sql(`select (e.rows_json->1)=(p.ingredients_json->1) and (e.rows_json->1->'quantity_input'->'normalized'->>'amount')='142.85714285714285000' from private.cooking_execution_quantities e join public.recipe_content_snapshots p on p.id=e.recipe_content_snapshot_id where e.session_id='${batch}';`).stdout.trim()).toBe("t");
  expect(data(service(`select public.read_cooking_execution_quantities(${args},'${batch}');`))).toMatchObject({revision:1,rows:[{amount:190,scalable:false},{quantity_input:{raw_value:"1/7"}}]});
 });
 it("preserves exact proof across a second edit and idempotent replay",()=>{
  const batch=session(2);service(save(batch,id(1902),0,edited()));
  const next=edited(data(sql(`select rows_json from private.cooking_execution_quantities where session_id='${batch}';`)),210);
  const request=save(batch,id(1903),1,next,nutrition(),prediction(),[{row_index:0,amount:210,unit:"g"}]);
  const result=data(service(request)),before=stableState(batch);expect(result).toMatchObject({success:true,data:{revision:2}});
  expect(data(service(request))).toEqual(result);expect(stableState(batch)).toBe(before);
  expect(stored(batch)).toContain("142.85714285714285000");
 });
 it.each(["identity","evidence","text","add_key","delete_key","array_order","number","number_string","flag"])("rejects %s tampering without row or receipt changes",kind=>{
  const n=["identity","evidence","text","add_key","delete_key","array_order","number","number_string","flag"].indexOf(kind),batch=session(10+n),echo=edited(),before=stableState(batch);
  if(kind==="identity")echo[1].ingredient_id=recipe;
  if(kind==="evidence")echo[1].quantity_input.evidence_ids[0]="forged";
  if(kind==="text")echo[1].quantity_input.raw_value="2/14";
  if(kind==="add_key")echo[1].quantity_input.extra=null;
  if(kind==="delete_key")delete echo[1].quantity_input.batch_basis;
  if(kind==="array_order")echo.reverse();
  if(kind==="number")echo[1].quantity_input.normalized.amount=142.8571428571429;
  if(kind==="number_string")echo[1].quantity_input.normalized.amount="142.85714285714286";
  if(kind==="flag")echo[1].scalable=false;
  const result=service(save(batch,id(1920+n),0,echo),false);expect(result.status).not.toBe(0);expect(result.stderr).toContain("VALIDATION_ERROR");expect(stableState(batch)).toBe(before);
 });
 it("allows only same-float echoes and retains the original decimal",()=>{
  const batch=session(30),echo=edited();
  // Both decimals map to the same IEEE754 value. This is a transport echo,
  // never authority to replace the more precise original database number.
  const statement=save(batch,id(1930),0,echo).replace('142.85714285714286','142.857142857142855');
  expect(data(service(statement))).toMatchObject({success:true});expect(stored(batch)).toContain("142.85714285714285000");
 });
 it.each(["owner","revision","state","nutrition","prediction","changes"])("keeps %s validation and atomic rollback",kind=>{
  const n=["owner","revision","state","nutrition","prediction","changes"].indexOf(kind),batch=session(40+n);
  if(kind==="state")sql(`select public.set_account_generation_internal_writer_marker('${cutover}',true);update public.cooking_sessions set status='cancelled'where id='${batch}';select public.set_account_generation_internal_writer_marker('${cutover}',false);`);
  const before=stableState(batch);let statement=save(batch,id(1940+n),0,edited());
  if(kind==="owner")statement=statement.replace(args,`'${other}','${epoch}','${"f".repeat(64)}',1,'${issued}'`);
  if(kind==="revision")statement=save(batch,id(1940+n),1,edited());
  if(kind==="nutrition")statement=save(batch,id(1940+n),0,edited(),{...nutrition(),base_servings:2});
  if(kind==="prediction")statement=save(batch,id(1940+n),0,edited(),nutrition(),{...prediction(),recipeSnapshotId:recipe});
  if(kind==="changes")statement=save(batch,id(1940+n),0,edited(),nutrition(),prediction(),[{row_index:0,amount:210,unit:"g"}]);
  const result=service(statement,false);expect(result.status).not.toBe(0);expect(result.stderr).toMatch(/CONFLICT|RESOURCE_NOT_FOUND|VALIDATION_ERROR/);expect(stableState(batch)).toBe(before);
 });
 it.each(["anon","authenticated","service_role"])("denies direct helper invocation by %s",role=>{
  const result=sql(`begin;set local role ${role};select private.cooking_quantity_json_echo('1.2'::jsonb);rollback;`,false);expect(result.status).not.toBe(0);expect(result.stderr).toContain("permission denied");
 });
 it.each(["1e1000","1e-1000"])("rejects an unrepresentable numeric %s",number=>{
  const result=sql(`select private.cooking_quantity_json_echo('${number}'::jsonb);`,false);expect(result.status).not.toBe(0);expect(result.stderr).toMatch(/out of range|underflow/);
 });
 it.each([0,-15])("keeps different-float rejection with caller extra_float_digits=%s",digits=>{
  const batch=session(digits===0?70:71),echo=edited(),before=stableState(batch);
  echo[1].quantity_input.normalized.amount=142.8571428571429;
  const result=service(`set local extra_float_digits=${digits};${save(batch,id(digits===0?1970:1971),0,echo)}`,false);
  expect(result.status).not.toBe(0);expect(result.stderr).toContain("VALIDATION_ERROR");expect(stableState(batch)).toBe(before);
  expect(data(service(`set local extra_float_digits=${digits};${save(batch,id(digits===0?1972:1973),0,edited())}`))).toMatchObject({success:true});
  expect(stored(batch)).toContain("142.85714285714285000");
 });
});
