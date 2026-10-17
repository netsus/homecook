import {spawn,spawnSync} from "node:child_process";
import {beforeAll,describe,expect,it} from "vitest";
import {predictSnapshotWeight} from "@/lib/server/cooked-weight-snapshot-prediction";
import {withIngredientMassFallback} from "@/lib/server/cooked-weight-mass-fallback";
const enabled=process.env.HOMECOOK_COOKING_SCHEMA232_PG==="1";
const container=process.env.HOMECOOK_WEIGHT_EVIDENCE_TEST_CONTAINER??"",tag=process.env.HOMECOOK_WEIGHT_EVIDENCE_TEST_TAG??"";
const image="public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a";
const owner="b1000000-0000-4000-8000-000000000001",other="b1000000-0000-4000-8000-000000000002",recipe="b2000000-0000-4000-8000-000000000001",pin="b3000000-0000-4000-8000-000000000001",ingredient="b8000000-0000-4000-8000-000000000001",nutritionPin="b9000000-0000-4000-8000-000000000001",column="b6000000-0000-4000-8000-000000000001",cutover="b5000000-0000-4000-8000-000000000001",epoch="2026-08-08T00:00:00Z",issued="2026-08-08T01:00:00Z",hash="e".repeat(64);
const args=`'${owner}','${epoch}','${hash}',1,'${issued}'`;
const id=(n:number)=>`d4000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
function literal(value:unknown){return `'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;}
function sql(statement:string,succeeds=true,bootstrap=false){
 const inspect=spawnSync("docker",["inspect","--format",'{{.Config.Image}}|{{.HostConfig.NetworkMode}}|{{index .Config.Labels "homecook.cooked-weight-test"}}',container],{encoding:"utf8"});
 expect(inspect.status).toBe(0);expect(inspect.stdout.trim()).toBe(`${image}|none|${tag}`);
 const result=spawnSync("docker",["exec","-i",container,"psql","-h","/tmp/pgsocket","-U","supabase_admin","-d","postgres","-XqAt","-v","ON_ERROR_STOP=1","-c",`${bootstrap?"":"set session authorization postgres;"}${statement}`],{encoding:"utf8"});
 if(succeeds)expect(result.status,result.stderr).toBe(0);return result;
}
function session(n:number){sql(`select public.set_account_generation_internal_writer_marker('${cutover}',true);insert into public.cooking_sessions(id,user_id,status,contract_version,session_kind,recipe_id,recipe_content_snapshot_id,cooking_servings,base_recipe_revision)values('${id(n)}','${owner}','in_progress','snapshot_v2','standalone','${recipe}','${pin}',4,1);select public.set_account_generation_internal_writer_marker('${cutover}',false);`);return id(n);}
const original=[{ingredient_id:ingredient,amount:300,unit:"g",scalable:true,ingredient_type:"QUANT" as const,food_product_id:null}];
const changed=[{...original[0],amount:190,scalable:false,display_text:null}];
const prediction=(rows=changed)=>withIngredientMassFallback(predictSnapshotWeight({snapshotId:pin,baseServings:2,cookingServings:4,ingredients:rows.map((row,index)=>({...row,id:String(index),preparation_state:null}))}));
const codes=["energy_kcal","carbohydrate_g","protein_g","fat_g","sodium_mg"];
function nutrition(known=true){return {base_servings:4,calculated_at:"2026-10-17T20:00:00Z",calculation_quality:known?"direct":null,calculation_status:known?"complete":"unavailable",calculation_version:"recipe-nutrition-v3",input_hash:"a".repeat(64),missing_reasons:known?[]:[`INVALID_QUANTITY:${ingredient}`],warnings:known?[]:["INVALID_QUANTITY"],reflected_ingredient_count:known?1:0,target_ingredient_count:1,sources:known?[{provider:"FIXTURE",dataset:"Synthetic cooking test",source_version:"fixture-v1",data_basis_date:null,license:"Synthetic",source_url:"https://example.invalid/food"}]:[],fixed_values:known?Object.fromEntries(codes.map(code=>[code,190])):{},scalable_values:known?Object.fromEntries(codes.map(code=>[code,0])):{},nutrient_status:Object.fromEntries(codes.map(code=>[code,{amount:known?190:null,known_amount:null,status:known?"complete":"unavailable",display_mode:known?"total":null}]))};}
const save=(batch:string,key:string,revision=0,rows:unknown=changed,payload:unknown=nutrition(),pred:unknown=prediction(),patch:unknown=[{row_index:0,amount:190,unit:"g"}])=>`select public.save_cooking_execution_quantities(${args},'${batch}','${key}',${revision},'${pin}',${literal(rows)},${literal(payload)},${literal(pred)},${literal(patch)});`;
const complete=(batch:string,key:string,revision=1,weight:number|null=null,writes=true)=>`select public.complete_cooking_execution(${args},'${batch}','${key}','{}','${weight===null?"weigh_later":"set_finished_weight"}',${weight===null?"null":weight},${weight===null?"null":"'reported_measured'"},null,${writes},${revision},clock_timestamp());`;
function state(batch:string){return sql(`select jsonb_build_object('session',(select to_jsonb(s)from public.cooking_sessions s where id='${batch}'),'execution',(select to_jsonb(e)from private.cooking_execution_quantities e where session_id='${batch}'),'batch',(select to_jsonb(b)from public.leftover_dishes b where id='${batch}'),'receipts',(select jsonb_agg(to_jsonb(r)order by id)from public.mutation_idempotency_keys r where owner_uuid='${owner}'),'evidence',(select jsonb_agg(to_jsonb(e)order by id)from private.cooked_batch_weight_evidence e where batch_id='${batch}'),'recipe',(select to_jsonb(r)from public.recipes r where id='${recipe}'),'snapshot',(select to_jsonb(s)from public.recipe_content_snapshots s where id='${pin}'));`).stdout;}
function service(statement:string,succeeds=true){return sql(`begin;set local request.jwt.claim.role='service_role';set local role service_role;${statement}commit;`,succeeds);}
function data(result:ReturnType<typeof sql>){return JSON.parse(result.stdout.trim().split("\n").at(-1)!);}
let connectionSequence=0;
function connection(){
 const name=`cooking-schema232-${++connectionSequence}`;
 const child=spawn("docker",["exec","-i","-e",`PGAPPNAME=${name}`,container,"psql","-h","/tmp/pgsocket","-U","postgres","-d","postgres","-XqAt","-v","ON_ERROR_STOP=1"]);
 let buffer="",errors="",pending:{marker:string;resolve:(value:string)=>void;reject:(error:Error)=>void}|null=null,ended=false;
 child.stderr.on("data",value=>{errors+=String(value);});
 child.stdout.on("data",value=>{buffer+=String(value);if(pending&&buffer.includes(`${pending.marker}\n`)){const point=buffer.indexOf(`${pending.marker}\n`),task=pending;pending=null;task.resolve(buffer.slice(0,point).trim());buffer=buffer.slice(point+task.marker.length+1);}});
 const closed=new Promise<void>(resolve=>child.on("close",()=>{ended=true;pending?.reject(new Error(errors||"connection ended"));resolve();}));
 return {name,query(statement:string){expect(ended).toBe(false);expect(pending).toBeNull();const marker=`done_${connectionSequence}_${Date.now()}`;let timer:ReturnType<typeof setTimeout>;return new Promise<string>((resolve,reject)=>{timer=setTimeout(()=>{child.kill();reject(new Error("owned SQL timeout"));},15000);pending={marker,resolve,reject};child.stdin.write(`${statement}\nselect '${marker}';\n`);}).finally(()=>clearTimeout(timer));},async close(){if(!ended)child.stdin.end();await closed;}};
}
async function waitBlocked(name:string){for(let attempt=0;attempt<25;attempt++){if(sql(`select exists(select 1 from pg_stat_activity where application_name='${name}' and wait_event_type='Lock');`).stdout.trim()==="t")return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error("Expected lock wait");}
describe.skipIf(!enabled)("cooking execution on hash-pinned schema228 plus exact229–232",()=>{
 beforeAll(()=>{
  expect(container).toMatch(/^[0-9a-f]{64}$/);expect(tag).toMatch(/^[0-9a-f]{32}$/);
  sql(`insert into private.recipe_product_only_write_control(singleton,enabled)values(true,true);insert into private.cooked_batch_weight_evidence_control(singleton,enabled)values(true,true);insert into private.quantity_input_v4_policy(singleton,enabled)values(true,true);insert into private.cooked_weight_user_attestation_control(singleton,enabled)values(true,false);`,true,true);
    sql(`set session_replication_role=replica;
      insert into private.full_local_auth_control(singleton,authority,local_issuer,cutover_epoch,hmac_key_version,flows_open,local_activated_at)
      values(true,'local','https://auth.mumeok.kr/auth/v1',2,1,true,'${epoch}');
      insert into private.ingredient_ai_nutrition_settings(singleton,enabled) values(true,false);
      insert into public.account_generation_cutover_attempts(id,state,capability_revision,result_json) values('${cutover}','promoted',2,'{}');
      insert into public.account_generation_capability_state(singleton,state,revision,current_cutover_attempt_id,activated_at) values(true,'generation_active',2,'${cutover}','${epoch}');
      set session_replication_role=origin;
      select public.set_account_generation_internal_writer_marker('${cutover}',true);
      insert into auth.users(id,created_at,email) values('${owner}','${epoch}','weight-owner@example.invalid'),('${other}','${epoch}','weight-other@example.invalid');
      insert into public.users(id,nickname,social_provider,social_id) values('${owner}','weight-a','google','weight-a'),('${other}','weight-b','google','weight-b') on conflict(id) do nothing;
      insert into public.user_account_generation_watermarks(owner_uuid,last_account_generation) values('${owner}',1),('${other}',1);
      insert into public.user_account_lifecycles(owner_uuid,account_generation,auth_identity_created_at_snapshot,origin,status,activated_at)
      values('${owner}',1,'${epoch}','runtime','active',now()),('${other}',1,'${epoch}','runtime','active',now());
      insert into public.user_session_generation_bindings(session_key_hash,hmac_key_version,owner_uuid,expected_account_generation,auth_identity_created_at_snapshot,binding_state,auth_authority,local_issuer,local_verified_at,auth_cutover_epoch,session_issued_at,binding_expires_at)
      values('${hash}',1,'${owner}',1,'${epoch}','active','local','https://auth.mumeok.kr/auth/v1','${issued}',2,'${issued}','2099-01-01'),
        ('${"f".repeat(64)}',1,'${other}',1,'${epoch}','active','local','https://auth.mumeok.kr/auth/v1','${issued}',2,'${issued}','2099-01-01');
      insert into public.ingredients(id,standard_name,category,default_unit) values('${ingredient}','fixture food','채소','g');
      insert into public.recipes(id,title,base_servings,created_by,source_type,visibility,revision,updated_at) values('${recipe}','fixture dish',2,'${owner}','manual','private',1,now());
      insert into public.recipe_nutrition_snapshots(id,recipe_id,base_servings,input_hash,calculation_version,scalable_values_json,fixed_values_json,nutrient_status_json,
        calculation_status,calculation_quality,reflected_ingredient_count,target_ingredient_count,missing_reasons,warnings_json,sources_json,is_current,calculated_at)
      values('${nutritionPin}','${recipe}',2,repeat('e',64),'fixture-pinned-v1','{"energy_kcal":1000,"carbohydrate_g":100,"protein_g":50,"fat_g":20,"sodium_mg":1000}',
        '{"energy_kcal":0,"carbohydrate_g":0,"protein_g":0,"fat_g":0,"sodium_mg":0}',
        '{"energy_kcal":{"amount":1000,"known_amount":null,"status":"complete","display_mode":"total"},"carbohydrate_g":{"amount":100,"known_amount":null,"status":"complete","display_mode":"total"},"protein_g":{"amount":50,"known_amount":null,"status":"complete","display_mode":"total"},"fat_g":{"amount":20,"known_amount":null,"status":"complete","display_mode":"total"},"sodium_mg":{"amount":1000,"known_amount":null,"status":"complete","display_mode":"total"}}',
        'complete','direct',1,1,'{}','[]','[]',true,now());
      insert into public.recipe_content_snapshots(id,owner_user_id,recipe_id,title,base_servings,ingredients_json,steps_json,content_hash,schema_version,recipe_nutrition_snapshot_id)
      values('${pin}','${owner}','${recipe}','fixture dish',2,'[{"ingredient_id":"${ingredient}","amount":300,"unit":"g","scalable":true,"ingredient_type":"QUANT","food_product_id":null}]','[]',repeat('e',64),1,'${nutritionPin}');
      insert into public.meal_plan_columns(id,user_id,name,sort_order) values('${column}','${owner}','fixture meal',0);
      select public.set_account_generation_internal_writer_marker('${cutover}',false);`, true, true);
  sql(`insert into public.nutrition_sources(provider_code,dataset_name,source_kind,source_version,fetched_at,freshness_checked_at,freshness_status,source_url,license_name,manifest_sha256,review_status,decision_reason,reviewed_by,reviewed_at,is_active)values('FIXTURE','Synthetic cooking test','nutrition_dataset','fixture-v1',now(),now(),'current','https://example.invalid/food','Synthetic',repeat('a',64),'approved','synthetic test only','${owner}',now(),true);`);
 });
 it("saves current cooking quantities only and restores them on a new read",()=>{
  const batch=session(1);const before=data(sql(`select jsonb_build_object('recipe',(select to_jsonb(r)from public.recipes r where id='${recipe}'),'pin',(select to_jsonb(s)from public.recipe_content_snapshots s where id='${pin}'));`));
  expect(data(service(save(batch,id(101))))).toMatchObject({success:true,data:{revision:1}});
  expect(data(service(`select public.read_cooking_execution_quantities(${args},'${batch}');`))).toMatchObject({revision:1,cooking_servings:4,rows:[{amount:190,scalable:false}],original_rows:[{amount:300,scalable:true}]});
  const after=data(sql(`select jsonb_build_object('recipe',(select to_jsonb(r)from public.recipes r where id='${recipe}'),'pin',(select to_jsonb(s)from public.recipe_content_snapshots s where id='${pin}'));`));expect(after).toEqual(before);
 });
 it("completes with disclosed142.5g estimate and frozen190kcal without double serving scale",()=>{
  const batch=session(2);service(save(batch,id(102)));expect(data(service(complete(batch,id(202))))).toMatchObject({success:true});
  expect(data(sql(`select jsonb_build_object('grams',finished_weight_g,'status',weight_status)from public.leftover_dishes where id='${batch}';`))).toEqual({grams:142.5,status:"known"});
  expect(data(sql(`select private.resolve_cooked_batch_nutrition('${batch}','${owner}');`))).toMatchObject({basis:{amount:4,unit:"serving"},values:{energy_kcal:{amount:190}}});
  expect(data(sql(`select private.project_cooked_weight_evidence('${batch}','${owner}');`))).toMatchObject({source:"conditional_estimate",predicted_g:142.5});
 });
 it("keeps an explicit175g measurement separate from the142.5g estimate",()=>{
  const batch=session(3);service(save(batch,id(103)));service(complete(batch,id(203),1,175));
  const rows=data(sql(`select jsonb_agg(jsonb_build_object('source',input_source,'measured',measured_g,'estimate',prediction_json#>'{prediction,totalGrams}')order by event_kind)from private.cooked_batch_weight_evidence where batch_id='${batch}';`));
  expect(rows).toEqual(expect.arrayContaining([expect.objectContaining({source:"conditional_estimate",estimate:142.5}),expect.objectContaining({source:"reported_measured",measured:175})]));
  expect(data(sql(`select private.resolve_cooked_batch_nutrition('${batch}','${owner}');`))).toMatchObject({values:{energy_kcal:{amount:190}}});
 });
 it("preserves unknown quantity, nutrition and weight as missing",()=>{
  const batch=session(4),rows=[{...changed[0],amount:null}];
  const pred=withIngredientMassFallback(predictSnapshotWeight({snapshotId:pin,baseServings:2,cookingServings:4,ingredients:rows.map((row,index)=>({...row,id:String(index),preparation_state:null}))}));
  service(save(batch,id(104),0,rows,nutrition(false),pred,[{row_index:0,amount:null,unit:"g"}]));service(complete(batch,id(204)));
  expect(data(sql(`select jsonb_build_object('grams',finished_weight_g,'status',weight_status)from public.leftover_dishes where id='${batch}';`))).toEqual({grams:null,status:"missing"});
  expect(data(sql(`select private.resolve_cooked_batch_nutrition('${batch}','${owner}');`))).toMatchObject({calculation_status:"unavailable",values:{energy_kcal:{amount:null,status:"unavailable"}}});
 });
 it("replays save and completion keys without duplicate revision or history",()=>{
  const batch=session(5),saved=data(service(save(batch,id(105))));const firstState=state(batch);
  expect(data(service(save(batch,id(105))))).toEqual(saved);expect(state(batch)).toBe(firstState);
  const done=data(service(complete(batch,id(205))));const lastState=state(batch);
  expect(data(service(complete(batch,id(205))))).toEqual(done);expect(state(batch)).toBe(lastState);
 });
 it.each(["stale_revision","foreign_owner","forged_identity","forged_amount"])("rejects %s without any row/receipt changes",kind=>{
  const n=10+["stale_revision","foreign_owner","forged_identity","forged_amount"].indexOf(kind),batch=session(n),before=state(batch);
  let statement=save(batch,id(100+n));
  if(kind==="stale_revision")statement=save(batch,id(100+n),1);
  if(kind==="foreign_owner")statement=statement.replace(args,`'${other}','${epoch}','${"f".repeat(64)}',1,'${issued}'`);
  if(kind==="forged_identity")statement=save(batch,id(100+n),0,[{...changed[0],ingredient_id:recipe}]);
  if(kind==="forged_amount")statement=save(batch,id(100+n),0,changed,nutrition(),prediction(),[{row_index:0,amount:999,unit:"g"}]);
  const result=service(statement,false);expect(result.status).not.toBe(0);expect(result.stderr).toMatch(/CONFLICT|RESOURCE_NOT_FOUND|VALIDATION_ERROR/);expect(state(batch)).toBe(before);
 });
 it.each(["completed","cancelled"])("rejects editing a %s session",status=>{
  const batch=session(status==="completed"?20:21);sql(`select public.set_account_generation_internal_writer_marker('${cutover}',true);update public.cooking_sessions set status='${status}',completed_at=case when '${status}'='completed' then clock_timestamp() else null end where id='${batch}';select public.set_account_generation_internal_writer_marker('${cutover}',false);`);
  const before=state(batch);const result=service(save(batch,id(status==="completed"?120:121)),false);expect(result.status).not.toBe(0);expect(result.stderr).toContain("CONFLICT");expect(state(batch)).toBe(before);
 });
 it("rejects stale completion and an older client bypass after execution edits",()=>{
  const batch=session(22);service(save(batch,id(122)));const before=state(batch);
  const stale=service(complete(batch,id(222),0),false);expect(stale.status).not.toBe(0);expect(stale.stderr).toContain("CONFLICT");
  const legacy=service(`select public.complete_snapshot_v2_cooking_session(${args},'${batch}','${id(322)}','{}','estimate_from_ingredients',450,clock_timestamp());`,false);expect(legacy.status).not.toBe(0);expect(legacy.stderr).toContain("CONFLICT");expect(state(batch)).toBe(before);
 });
 it("preserves edited nutrition and estimate through the original evidence-OFF fallback",()=>{
  const batch=session(23);service(save(batch,id(123)));sql("update private.cooked_batch_weight_evidence_control set enabled=false;");
  try{service(complete(batch,id(223),1,null,false));expect(data(sql(`select jsonb_build_object('grams',finished_weight_g)from public.leftover_dishes where id='${batch}';`))).toEqual({grams:142.5});expect(data(sql(`select private.resolve_cooked_batch_nutrition('${batch}','${owner}');`))).toMatchObject({values:{energy_kcal:{amount:190}}});}
  finally{sql("update private.cooked_batch_weight_evidence_control set enabled=true;");}
 });
 it("uses frozen execution total for preview and persisted meal nutrition",()=>{
  const batch=session(24);service(save(batch,id(124)));service(complete(batch,id(224)));
  const preview=data(service(`select public.preview_meal_log_nutrition(${args},'cooked_batch','${batch}',100,'g');`));expect(preview.calories_kcal).toBeCloseTo(133.33,1);
  const payload={source:{type:"cooked_batch",id:batch},quantity:{amount:100,unit:"g"},consumed_local_date:"2026-10-17",timezone_name_snapshot:"Asia/Seoul",consumed_at:null,meal_plan_column_id:column};
  service(`select public.mutate_meal_log_entry(${args},'create','${id(424)}','${id(524)}',null,${literal(payload)},clock_timestamp());`);
  const persisted=data(sql(`select nutrition_evidence_json from public.meal_log_entries where id='${id(424)}';`));expect(persisted.calories_kcal).toBeCloseTo(133.33,1);
 });
 it("refuses direct table reads and anonymous RPC calls",()=>{
  for(const statement of [`set local role service_role;select * from private.cooking_execution_quantities;`,`set local role authenticated;select * from private.cooking_execution_quantities;`,`set local role anon;select public.read_cooking_execution_quantities(${args},'${id(1)}');`]){const result=sql(`begin;${statement}rollback;`,false);expect(result.status).not.toBe(0);expect(result.stderr).toContain("permission denied");}
 });
 it("admits only the three exact POST scope paths and preserves the original chain",()=>{
  const dispatcher=(statement:string,succeeds=true)=>sql(`begin;set local request.jwt.claim.role='service_role';${statement}commit;`,succeeds);
  for(const name of ["read_cooking_execution_quantities","save_cooking_execution_quantities","complete_cooking_execution"]){
   const verify=`set local request.headers='{"x-homecook-internal-scope":"snapshot-v2-session"}';set local request.path='/rpc/${name}';set local request.method='POST';select private.verify_full_local_internal_scope();`;
   expect(dispatcher(verify).status).toBe(0);
   expect(dispatcher(verify.replace("'POST'","'GET'"),false).status).not.toBe(0);
   expect(dispatcher(verify.replace("snapshot-v2-session","recipe-future-propagation"),false).status).not.toBe(0);
  }
 });

 it.each(["revoked","deleting","replaced_generation"])("keeps authority protection for %s",kind=>{
  const n=30+["revoked","deleting","replaced_generation"].indexOf(kind),batch=session(n),before=state(batch);
  const mutation=kind==="revoked"?`update public.user_session_generation_bindings set binding_state='revoked',revoked_at=clock_timestamp()where session_key_hash='${hash}';`:kind==="deleting"?`update public.user_account_lifecycles set status='deleting'where owner_uuid='${owner}'and account_generation=1;`:`update public.user_account_lifecycles set status='complete'where owner_uuid='${owner}'and account_generation=1;insert into public.user_account_lifecycles(owner_uuid,account_generation,auth_identity_created_at_snapshot,origin,status,activated_at)values('${owner}',2,'${epoch}','runtime','active',clock_timestamp());`;
  const result=sql(`begin;set local session_replication_role=replica;${mutation}set local session_replication_role=origin;set session authorization postgres;set local request.jwt.claim.role='service_role';set local role service_role;${save(batch,id(100+n))}rollback;`,false,true);
  expect(result.status).not.toBe(0);expect(result.stderr).toMatch(/ACCOUNT_SESSION_STALE|ACCOUNT_DELETING|ACCOUNT_GENERATION_STALE/);expect(state(batch)).toBe(before);
 });
 it("refuses execution writes in a read-only transaction without partial receipts",()=>{
  const batch=session(33),before=state(batch);const result=sql(`begin read only;set local request.jwt.claim.role='service_role';set local role service_role;${save(batch,id(133))}commit;`,false);expect(result.status).not.toBe(0);expect(result.stderr).toContain("read-only");expect(state(batch)).toBe(before);
 });
 it.each(["edit_first","complete_first"])("serializes %s against the same real session lock",async kind=>{
  const batch=session(kind==="edit_first"?40:41);if(kind==="complete_first")service(save(batch,id(141)));
  const hold=connection(),first=connection(),second=connection();
  try{
   await hold.query(`begin;select id from public.cooking_sessions where id='${batch}'for update;`);
   const a=first.query(`begin;set local request.jwt.claim.role='service_role';set local role service_role;${kind==="edit_first"?save(batch,id(140)):complete(batch,id(241))}commit;`);
   await waitBlocked(first.name);
   const b=second.query(`begin;set local request.jwt.claim.role='service_role';set local role service_role;${kind==="edit_first"?complete(batch,id(240),0):save(batch,id(341),1)}commit;`);
   const rejected=expect(b).rejects.toThrow("CONFLICT");
   await waitBlocked(second.name);await hold.query("commit;");await a;await rejected;
   const stored=data(sql(`select jsonb_build_object('revision',e.revision,'status',s.status)from public.cooking_sessions s join private.cooking_execution_quantities e on e.session_id=s.id where s.id='${batch}';`));
   expect(stored).toEqual({revision:1,status:kind==="edit_first"?"in_progress":"completed"});
  }finally{await Promise.all([hold.close(),first.close(),second.close()]);}
 },25000);

 it("executes successful RPCs with the actual service_role caller",()=>{expect(data(service("select to_jsonb(current_user);"))).toBe("service_role");});
 it("keeps converted0.19kg as the same fixed190g execution without a second serving factor",()=>{
  const batch=session(50),rows=[{...changed[0],amount:0.19,unit:"kg"}];service(save(batch,id(150),0,rows,nutrition(),prediction(rows),[{row_index:0,amount:0.19,unit:"kg"}]));service(complete(batch,id(250)));
  expect(data(sql(`select jsonb_build_object('grams',finished_weight_g)from public.leftover_dishes where id='${batch}';`))).toEqual({grams:142.5});
  expect(data(service(`select public.read_cooking_execution_quantities(${args},'${batch}');`))).toMatchObject({rows:[{amount:0.19,unit:"kg",scalable:false}]});
 });
 it("freezes a missing sodium nutrient without turning it into zero",()=>{
  const batch=session(51),base=nutrition(),withoutSodium=(values:Record<string,number>)=>Object.fromEntries(Object.entries(values).filter(([key])=>key!=="sodium_mg"));
  const partial={...base,calculation_status:"partial",fixed_values:withoutSodium(base.fixed_values),scalable_values:withoutSodium(base.scalable_values),nutrient_status:{...base.nutrient_status,sodium_mg:{amount:null,known_amount:null,status:"unavailable",display_mode:null}},missing_reasons:[`NUTRIENT_VALUE_MISSING:${ingredient}:sodium_mg`],warnings:[]};
  service(save(batch,id(151),0,changed,partial));service(complete(batch,id(251)));
  expect(data(sql(`select private.resolve_cooked_batch_nutrition('${batch}','${owner}');`))).toMatchObject({calculation_status:"partial",values:{energy_kcal:{amount:190},sodium_mg:{amount:null,status:"unavailable"}}});
 });

});
