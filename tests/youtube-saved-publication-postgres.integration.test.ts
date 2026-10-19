import {spawnSync} from "node:child_process";
import {beforeAll,describe,expect,it} from "vitest";
import type {QuantityInputSnapshot} from "@/types/quantity-input";
import type {YoutubeSavedRecipeEditableContent} from "@/types/youtube-saved-recipe";
import {publishSavedYoutubeRecipeNutrition} from "@/lib/server/youtube-saved-recipe-nutrition";
const enabled=process.env.HOMECOOK_SAVED_CATALOG_PG==="1";
const container=process.env.HOMECOOK_WEIGHT_EVIDENCE_TEST_CONTAINER??"",tag=process.env.HOMECOOK_WEIGHT_EVIDENCE_TEST_TAG??"";
const image="public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a";
const owner="b1000000-0000-4000-8000-000000000001",other="b1000000-0000-4000-8000-000000000002",food="c8000000-0000-4000-8000-000000000001",cutover="b5000000-0000-4000-8000-000000000001";
const row="c1000000-0000-4000-8000-000000000001",sourceId="c1000000-0000-4000-8000-000000000002",epoch="2026-08-08T00:00:00Z",issued="2026-08-08T01:00:00Z";
let sequence=0;
const id=()=>`c2000000-0000-4000-8000-${String(++sequence).padStart(12,"0")}`;
const literal=(value:unknown)=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
function sql(statement:string,ok=true,bootstrap=false){
 expect(container).toMatch(/^[a-f0-9]{64}$/u);expect(tag).toMatch(/^[a-f0-9]{32}$/u);
 const inspect=spawnSync("docker",["inspect","--format",'{{.Config.Image}}|{{.HostConfig.NetworkMode}}|{{index .Config.Labels "homecook.cooked-weight-test"}}',container],{encoding:"utf8"});
 expect(inspect.status).toBe(0);expect(inspect.stdout.trim()).toBe(`${image}|none|${tag}`);
 const r=spawnSync("docker",["exec","-i",container,"psql","-h","/tmp/pgsocket","-U","supabase_admin","-d","postgres","-XqAt","-v","ON_ERROR_STOP=1"],{input:`${bootstrap?"":"set session authorization postgres;"}${statement}`,encoding:"utf8",timeout:15000});
 if(ok)expect(r.status,r.stderr).toBe(0);return r;
}
function data(statement:string,bootstrap=false){return JSON.parse(sql(statement,true,bootstrap).stdout.trim().split("\n").at(-1)!);}
function content(known=true):YoutubeSavedRecipeEditableContent{return {title:"Synthetic catalog selection",base_servings:2,tags:[],ingredients:[{row_id:row,source_draft_ingredient_id:sourceId,standard_name:"입력명 유지",quantity_mode:known?"quantity":"unknown",amount:known?10:null,unit:known?"g":null,display_text:"원문량 유지",component_label:null}],steps:[]};}
function seed(input:object=content()){
 const saved=id(),extraction=id();
 const source={youtube_url:"https://www.youtube.com/watch?v=synthetic",youtube_video_id:"synthetic",thumbnail_url:null,draft_json:{ingredients:[{draft_ingredient_id:sourceId,standard_name:"입력명 유지",resolution_status:"unresolved"}],steps:[]}};
 sql(`begin;select public.set_account_generation_internal_writer_marker('${cutover}',true);insert into public.youtube_saved_recipe_results(id,owner_user_id,account_generation,extraction_session_id,source_snapshot_json,editable_content_json,editable_content_hash)values('${saved}','${owner}',1,'${extraction}',${literal(source)},${literal(input)},repeat('0',64));select public.set_account_generation_internal_writer_marker('${cutover}',false);commit;`);
 return saved;
}
function write(saved:string,input:object,rev=1,key=id(),who=owner,ok=true){
 const hash=(who===owner?"e":"f").repeat(64);
 const result=sql(`begin;set local request.jwt.claim.role='service_role';set local role service_role;select public.write_youtube_saved_recipe_result('${who}','${epoch}','${hash}',1,'${issued}','update','${saved}',null,${rev},${literal(input)},'${key}');commit;`,ok);
 return ok?JSON.parse(result.stdout.trim().split("\n").at(-1)!):result;
}
function state(saved:string){return data(`select jsonb_build_object('source',source_snapshot_json,'content',editable_content_json,'hash',editable_content_hash,'revision',revision,'recipe',canonical_recipe_id) from public.youtube_saved_recipe_results where id='${saved}';`);}
const authority={ownerUuid:owner,authIdentityCreatedAt:epoch,sessionKeyHash:"e".repeat(64),hmacKeyVersion:1,sessionIssuedAt:issued};
const sourceItem="c8000000-0000-4000-8000-000000000002",profile="c8000000-0000-4000-8000-000000000003",link="c8000000-0000-4000-8000-000000000004";
const direct={schema_version:"quantity-v4",raw_value:"10",raw_unit:"g",numerator:"10",denominator:"1",normalized:{amount:10,unit:"g"},display_quantity:{amount:10,unit:"g"},quality:"direct",reason:null,evidence_ids:[],source_versions:[],batch_basis:null} satisfies QuantityInputSnapshot;
function rolePrefix(role="service_role",who=owner){return `set local request.jwt.claim.role='${role}';set local request.jwt.claim.sub='${who}';set local request.jwt.claims='{"role":"${role}","sub":"${who}"}';set local role ${role};`;}
function rpc(name:string,args:Record<string,unknown>,role="service_role",who=owner){
 const values=Object.entries(args).map(([key,value])=>{expect(key).toMatch(/^p_[a-z_]+$/u);return `${key}=>${value===null?"null":typeof value==="number"?value:typeof value==="object"?literal(value):`'${String(value).replaceAll("'","''")}'`}`;}).join(",");
 expect(name).toMatch(/^[a-z_]+$/u);
 const r=sql(`begin;${rolePrefix(role,who)}set local request.headers='{"x-homecook-internal-scope":"recipe-future-propagation"}';set local request.method='POST';set local request.path='/rpc/${name}';select public.${name}(${values});commit;`,false);
 return r.status===0?{data:JSON.parse(r.stdout.trim().split("\n").at(-1)!),error:null}:{data:null,error:{message:r.stderr}};
}
function evidenceClient(trace:string[]){
 return {from(table:string){trace.push("from:"+table);expect(["ingredient_nutrition_profiles","ingredient_conversion_assignments","piece_unit_weights"]).toContain(table);
   const q={select:()=>q,in:()=>q,eq:()=>q,order:()=>q,range:async()=>({data:table!=="ingredient_nutrition_profiles"?data(`select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.${table} t;`):data(`select coalesce(jsonb_agg(to_jsonb(l)||jsonb_build_object('nutrition_profiles',to_jsonb(p)||jsonb_build_object(
     'nutrition_values',(select jsonb_agg(to_jsonb(v)) from public.nutrition_values v where v.profile_id=p.id),
     'nutrition_source_items',to_jsonb(i)||jsonb_build_object('nutrition_sources',to_jsonb(s))))),'[]')
     from public.ingredient_nutrition_profiles l join public.nutrition_profiles p on p.id=l.nutrition_profile_id
     join public.nutrition_source_items i on i.id=p.source_item_id join public.nutrition_sources s on s.id=i.source_id;`),error:null})};return q;},rpc:(name:string,args:Record<string,unknown>)=>{const result=rpc(name,args);trace.push("rpc:"+name+":"+JSON.stringify(result.error));return Promise.resolve(result);}};
}
function publisher(receipt:unknown,options:{beforeWrite?:(args:Record<string,unknown>)=>void;who?:string}={}){
 let writeArgs:Record<string,unknown>|null=null;let resultError:unknown=null;const trace:string[]=[];
 const run=publishSavedYoutubeRecipeNutrition({receipt,authority:{...authority,ownerUuid:options.who??owner},internalClient:evidenceClient(trace),ownerClient:{
   readRecipe:async recipeId=>{trace.push("recipe-read");return {data:data(`select to_jsonb(r) from public.recipes r where id='${recipeId}';`),error:null};},
   writeSnapshot:async args=>{writeArgs=args;options.beforeWrite?.(args);const result=rpc("write_owned_youtube_recipe_nutrition_snapshot",{...args,p_user_id:options.who??owner},"authenticated",options.who??owner);resultError=result.error;return result;},
 }});
 return {run,trace,get args(){return writeArgs;},get error(){return resultError;}};
}
function currentNutrition(recipeId:string){return data(`select coalesce(jsonb_agg(to_jsonb(n)),'[]') from public.recipe_nutrition_snapshots n where recipe_id='${recipeId}' and is_current;`,true);}
function selected(known=true,withQuantity=false):YoutubeSavedRecipeEditableContent{const input=content(known);return {...input,ingredients:input.ingredients.map(row=>withQuantity?{...row,catalog_ingredient_id:food,quantity_input:direct,quantity_context_fingerprint:"a".repeat(64)}:{...row,catalog_ingredient_id:food})};}
function ownerSave(known=true,withQuantity=false){
 const original=content(known),originalQuantity={...original,ingredients:original.ingredients.map(row=>({...row,quantity_input:direct,quantity_context_fingerprint:"a".repeat(64)}))};
 const saved=seed(withQuantity?originalQuantity:original);return {saved,input:selected(known,withQuantity),receipt:write(saved,selected(known,withQuantity)).data};
}
const authoritySql=`'${owner}','${epoch}','${"e".repeat(64)}',1,'${issued}'`;
function scoped(statement:string,name:string){return data(`begin;${rolePrefix()}set local homecook.snapshot_v2_creation='on';set local request.headers='{"x-homecook-internal-scope":"snapshot-v2-session"}';set local request.method='POST';set local request.path='/rpc/${name}';${statement}commit;`);}
function start(receipt:{recipe_id:string;revision:number},meal:string|null=null){
 const revisions=meal?data(`select jsonb_build_object(id,revision) from public.meals where id='${meal}';`):{};
 return scoped(`select public.start_snapshot_v2_cooking_session(${authoritySql},'${id()}','${meal?"planner":"standalone"}',${meal?`array['${meal}']::uuid[]`:"'{}'::uuid[]"},${literal(revisions)},${meal?"null":`'${receipt.recipe_id}'`},${meal?"null":receipt.revision},${meal?"null":2});`,"start_snapshot_v2_cooking_session").data.session_id;
}
function complete(session:string){return scoped(`select public.complete_cooking_execution(${authoritySql},'${session}','${id()}','{}','set_finished_weight',200,null,null,false,0);`,"complete_cooking_execution");}
function meal(receipt:{recipe_id:string}){const meal=id();sql(`begin;select public.set_account_generation_internal_writer_marker('${cutover}',true);insert into public.meals(id,user_id,recipe_id,plan_date,column_id,planned_servings,status) values('${meal}','${owner}','${receipt.recipe_id}','2026-10-19','b6000000-0000-4000-8000-000000000001',2,'registered');select public.set_account_generation_internal_writer_marker('${cutover}',false);commit;`);return meal;}
function mealPin(meal:string){return data(`select to_jsonb(s) from public.recipe_content_snapshots s join public.meals m on m.recipe_content_snapshot_id=s.id where m.id='${meal}';`);}
describe.skipIf(!enabled)("canonical saved nutrition publication on exact 232+233–237",()=>{
 beforeAll(()=>{
  sql(`begin;select public.set_account_generation_internal_writer_marker('${cutover}',true);insert into public.ingredients(id,standard_name,category,default_unit)values('${food}','Synthetic publication food','채소','g');select public.set_account_generation_internal_writer_marker('${cutover}',false);commit;`);
  sql(`insert into public.nutrient_definitions(code,label,unit,display_order,is_core)values
    ('energy_kcal','열량','kcal',1,true),('carbohydrate_g','탄수화물','g',2,true),('protein_g','단백질','g',3,true),('fat_g','지방','g',4,true),('sodium_mg','나트륨','mg',5,true);`);
  sql(`insert into public.nutrition_source_items(id,source_id,external_item_key,external_name,preparation_state,source_basis_amount,source_basis_unit,edible_portion_percent,stable_fingerprint,review_status,decision_reason,reviewed_by,reviewed_at)
    select '${sourceItem}',id,'synthetic-publication','Synthetic publication food','raw-edible',100,'g',100,repeat('c',64),'approved','synthetic only','${owner}',now() from public.nutrition_sources where provider_code='FIXTURE';
    insert into public.nutrition_profiles(id,source_item_id,profile_kind,normalization_method,basis_amount,basis_unit,review_status,decision_reason,reviewed_by,reviewed_at,is_active)
      values('${profile}','${sourceItem}','ingredient_source','mass_100g',100,'g','approved','synthetic only','${owner}',now(),true);
    insert into public.ingredient_nutrition_profiles(id,ingredient_id,nutrition_profile_id,preparation_state,match_method,is_primary,review_status,decision_reason,reviewed_by,reviewed_at,version,is_active)
      values('${link}','${food}','${profile}','raw-edible','manual',true,'approved','synthetic only','${owner}',now(),1,true);
    insert into public.nutrition_values(profile_id,nutrient_code,amount,value_status,source_nutrient_code) values
      ('${profile}','energy_kcal',200,'observed','fixture-energy'),('${profile}','carbohydrate_g',30,'observed','fixture-carb'),('${profile}','protein_g',5,'observed','fixture-protein'),('${profile}','fat_g',7,'observed','fixture-fat'),('${profile}','sodium_mg',null,'missing','fixture-sodium');`);
 });
 it("owner receipt hash binds the saved content; publisher reuses the actual authenticated writer",async()=>{
  const {receipt}=ownerSave();expect(receipt.canonical_content_hash).toMatch(/^[a-f0-9]{64}$/u);
  const p=publisher(receipt),result=await p.run;
  expect(result,JSON.stringify({args:p.args,error:p.error,trace:p.trace})).toEqual({status:"ready"});
  const current=currentNutrition(receipt.recipe_id);expect(current).toHaveLength(1);expect(current[0].nutrient_status_json.energy_kcal.amount).toBe(20);expect(current[0].nutrient_status_json.sodium_mg.amount).toBeNull();
  expect(current[0].input_hash).toBe(receipt.canonical_content_hash);
 });
 it.each([false,true])("unknown quantity remains unavailable / exact frozen SI publishes without reinterpretation (%s)",async explicit=>{
  const {receipt}=ownerSave(explicit,explicit),p=publisher(receipt);expect(await p.run,JSON.stringify(p.error)).toEqual({status:"ready"});
  const n=currentNutrition(receipt.recipe_id)[0];expect(n.nutrient_status_json.energy_kcal.amount).toBe(explicit?20:null);expect(n.calculation_version).toBe(explicit?"recipe-nutrition-v4":"recipe-nutrition-v3");
 });
 it("replays the original save receipt and publication without duplicate snapshots",async()=>{
  const original=content(),saved=seed(original),input=selected(),key=id(),first=write(saved,input,1,key).data;
  expect(await publisher(first).run).toEqual({status:"ready"});const before=currentNutrition(first.recipe_id);
  expect(write(saved,input,1,key).data).toEqual(first);expect(await publisher(first).run).toEqual({status:"ready"});expect(currentNutrition(first.recipe_id)).toEqual(before);
 });
 it("never publishes a newer revision while retrying an old durable receipt",async()=>{
  const {saved,receipt}=ownerSave();write(saved,{...selected(),title:"new owner edit"},2);const p=publisher(receipt);
  expect(await p.run).toEqual({status:"stale"});expect(p.args).toBeNull();expect(currentNutrition(receipt.recipe_id)).toEqual([]);
 });
 it("CAS rejects an owner edit racing after preparation, leaving stale current retired",async()=>{
  const {saved,receipt}=ownerSave();const p=publisher(receipt,{beforeWrite:()=>{write(saved,{...selected(),title:"competing revision"},2);}});
  expect(await p.run).toEqual({status:"stale"});expect(currentNutrition(receipt.recipe_id)).toEqual([]);
 });
 it("input hash/recipe revision/row amount and evidence guard tampering cannot publish",async()=>{
  for(const kind of ["content_hash","revision","amount"]){const {receipt}=ownerSave();const p=publisher(receipt,{beforeWrite:args=>{
    const guard=JSON.parse(JSON.stringify(args.p_input_guard));if(kind==="amount")guard.recipe_ingredients[0].amount=999;else guard.canonical_saved_recipe[kind]=kind==="revision"?999:"b".repeat(64);args.p_input_guard=guard;
  }});expect(await p.run).toEqual({status:"stale"});expect(currentNutrition(receipt.recipe_id)).toEqual([]);}
 },15000);
 it("another owner cannot reuse an owner's receipt or writer",async()=>{
  const {receipt}=ownerSave(),p=publisher(receipt,{who:other});expect(await p.run).not.toEqual({status:"ready"});expect(p.args).toBeNull();expect(currentNutrition(receipt.recipe_id)).toEqual([]);
 });
 it("empty steps remain empty and no fabricated step is needed to publish",async()=>{
  const {saved,receipt}=ownerSave();expect(await publisher(receipt).run).toEqual({status:"ready"});expect(state(saved).content.steps).toEqual([]);
 });
 it("mixed exact/unknown amounts publish partial values and keep unknown sodium missing",async()=>{
  const input=selected();input.ingredients.push({...input.ingredients[0],row_id:id(),source_draft_ingredient_id:null,amount:null,quantity_mode:"unknown",unit:null});
  const saved=seed(input),receipt=write(saved,input).data;
  expect(await publisher(receipt).run).toEqual({status:"ready"});
  const n=currentNutrition(receipt.recipe_id)[0];expect(n.calculation_status).toBe("partial");expect(n.nutrient_status_json.energy_kcal).toMatchObject({amount:null,known_amount:20,status:"partial"});expect(n.nutrient_status_json.sodium_mg.amount).toBeNull();
 });
 it("explicit unlink publishes current unavailable values rather than resurrecting prior nutrition",async()=>{
  const {saved,receipt}=ownerSave();expect(await publisher(receipt).run).toEqual({status:"ready"});const old=currentNutrition(receipt.recipe_id)[0];
  const input=selected();input.ingredients[0].catalog_ingredient_id=null;
  const next=write(saved,input,2).data;expect(await publisher(next).run).toEqual({status:"ready"});const current=currentNutrition(next.recipe_id)[0];expect(current.id).not.toBe(old.id);expect(current.calculation_status).toBe("unavailable");expect(current.nutrient_status_json.energy_kcal.amount).toBeNull();
 });
 it("new meals and standalone completion use published current values while past pins remain immutable",async()=>{
  const {saved,receipt}=ownerSave();expect(await publisher(receipt).run).toEqual({status:"ready"});const oldMeal=meal(receipt),oldPin=mealPin(oldMeal);
  const oldNutrition=data(`select to_jsonb(n)-'is_current' from public.recipe_nutrition_snapshots n where id='${oldPin.recipe_nutrition_snapshot_id}';`);
  const input=selected();input.ingredients[0].amount=20;const next=write(saved,input,2).data;expect(await publisher(next).run).toEqual({status:"ready"});
  const newMeal=meal(next),newPin=mealPin(newMeal);expect(newPin.recipe_nutrition_snapshot_id).not.toBe(oldPin.recipe_nutrition_snapshot_id);
  const standalone=start(next);expect(complete(standalone).success).toBe(true);
  expect(data(`select private.resolve_cooked_batch_nutrition('${standalone}','${owner}');`)).toMatchObject({values:{energy_kcal:{amount:40},sodium_mg:{amount:null}}});
  sql(`begin;select public.set_account_generation_internal_writer_marker('${cutover}',true);update public.meals set status='shopping_done' where id='${newMeal}';select public.set_account_generation_internal_writer_marker('${cutover}',false);commit;`);
  const planned=start(next,newMeal);expect(complete(planned).success).toBe(true);
  expect(data(`select private.resolve_cooked_batch_nutrition('${planned}','${owner}');`)).toMatchObject({values:{energy_kcal:{amount:40}}});
  expect(data(`select to_jsonb(status) from public.meals where id='${newMeal}';`)).toBe("cook_done");
  expect(mealPin(oldMeal)).toEqual(oldPin);expect(data(`select to_jsonb(n)-'is_current' from public.recipe_nutrition_snapshots n where id='${oldPin.recipe_nutrition_snapshot_id}';`,true)).toEqual(oldNutrition);
  expect(data(`select to_jsonb(status) from public.meals where id='${oldMeal}';`)).toBe("registered");
 },30000);
 it("returning to an earlier exact content hash must not start standalone cooking on the intervening content",async()=>{
  const {saved,receipt}=ownerSave();expect(await publisher(receipt).run).toEqual({status:"ready"});
  const changed=selected();changed.ingredients[0].amount=20;const second=write(saved,changed,2).data;expect(await publisher(second).run).toEqual({status:"ready"});
  const third=write(saved,selected(),3).data;expect(third.canonical_content_hash).toBe(receipt.canonical_content_hash);expect(await publisher(third).run).toEqual({status:"ready"});
  const session=start(third);expect(complete(session).success).toBe(true);
  expect(data(`select private.resolve_cooked_batch_nutrition('${session}','${owner}');`)).toMatchObject({values:{energy_kcal:{amount:20}}});
 },30000);
 it("payload content hash and independently derived source cannot be forged",async()=>{
  for(const kind of ["hash","source"]){const {receipt}=ownerSave();const p=publisher(receipt,{beforeWrite:args=>{
   const payload=JSON.parse(JSON.stringify(args.p_snapshot));if(kind==="hash")payload.input_hash="d".repeat(64);else payload.sources[0].source_version="forged";args.p_snapshot=payload;
  }});expect(await p.run).not.toEqual({status:"ready"});expect(currentNutrition(receipt.recipe_id)).toEqual([]);}
 },15000);
 it("publication failure never starts canonical cooking from a stale content pin",async()=>{
  const {saved,receipt}=ownerSave();expect(await publisher(receipt).run).toEqual({status:"ready"});
  const input=selected();input.ingredients[0].amount=20;const next=write(saved,input,2).data;
  const result=sql(`begin;${rolePrefix()}set local homecook.snapshot_v2_creation='on';set local request.headers='{"x-homecook-internal-scope":"snapshot-v2-session"}';set local request.method='POST';set local request.path='/rpc/start_snapshot_v2_cooking_session';select public.start_snapshot_v2_cooking_session(${authoritySql},'${id()}','standalone','{}','{}','${next.recipe_id}',${next.revision},2);commit;`,false);
  expect(result.status).not.toBe(0);expect(result.stderr).toContain("RESOURCE_NOT_FOUND");expect(currentNutrition(next.recipe_id)).toEqual([]);
 });
 it("physical recipe standalone start still uses its existing pinned content",()=>{
  const session=start({recipe_id:"b2000000-0000-4000-8000-000000000001",revision:1});
  expect(data(`select to_jsonb(recipe_content_snapshot_id) from public.cooking_sessions where id='${session}';`)).toBe("b3000000-0000-4000-8000-000000000001");
 });
 it("canonical recipes without explicit selection keep their existing matching null-nutrition pin",()=>{
  const saved=seed(),current=state(saved),receipt={recipe_id:current.recipe,revision:1},m=meal(receipt),pin=mealPin(m);
  const session=start(receipt);expect(data(`select to_jsonb(recipe_content_snapshot_id) from public.cooking_sessions where id='${session}';`)).toBe(pin.id);expect(pin.recipe_nutrition_snapshot_id).toBeNull();
 });
 it.each(["title","steps"])("%s-only edits retire the old current pin before a pending publication and preserve past meals",async field=>{
  const {saved,receipt}=ownerSave();expect(await publisher(receipt).run).toEqual({status:"ready"});const oldMeal=meal(receipt),oldPin=mealPin(oldMeal);
  const oldNutrition=data(`select to_jsonb(n)-'is_current' from public.recipe_nutrition_snapshots n where id='${oldPin.recipe_nutrition_snapshot_id}';`);
  const input=selected();if(field==="title")input.title="Synthetic title B";else input.steps=[{row_id:id(),source_step_index:null,instruction:"Synthetic step B",component_label:null,duration_text:null}];
  const next=write(saved,input,2).data;expect(next.canonical_content_hash).not.toBe(receipt.canonical_content_hash);expect(currentNutrition(next.recipe_id)).toEqual([]);
  const pending=publisher(next,{beforeWrite:args=>{const payload=JSON.parse(JSON.stringify(args.p_snapshot));payload.sources[0].source_version="synthetic unavailable publication";args.p_snapshot=payload;}});
  expect(await pending.run).toEqual({status:"pending"});expect(currentNutrition(next.recipe_id)).toEqual([]);
  const waitingMeal=meal(next),waitingPin=mealPin(waitingMeal);expect(waitingPin.content_hash).toBe(next.canonical_content_hash);expect(waitingPin.recipe_nutrition_snapshot_id).toBeNull();
  expect(waitingPin.title).toBe(input.title);expect(waitingPin.steps_json).toHaveLength(input.steps.length);expect(mealPin(oldMeal)).toEqual(oldPin);
  expect(data(`select to_jsonb(n)-'is_current' from public.recipe_nutrition_snapshots n where id='${oldPin.recipe_nutrition_snapshot_id}';`,true)).toEqual(oldNutrition);
  expect(await publisher(next).run).toEqual({status:"ready"});const readyMeal=meal(next),readyPin=mealPin(readyMeal);
  expect(readyPin.content_hash).toBe(next.canonical_content_hash);expect(readyPin.recipe_nutrition_snapshot_id).toBe(currentNutrition(next.recipe_id)[0].id);expect(readyPin.recipe_nutrition_snapshot_id).not.toBe(oldPin.recipe_nutrition_snapshot_id);
  expect(mealPin(waitingMeal)).toEqual(waitingPin);expect(mealPin(oldMeal)).toEqual(oldPin);
 },30000);
 it("source/profile evidence drift after preparation fails closed without changing immutable nutrient values",async()=>{
  const {receipt}=ownerSave();const p=publisher(receipt,{beforeWrite:()=>sql(`update public.ingredient_nutrition_profiles set review_status='revoked',is_active=false where id='${link}';`)});
  expect(await p.run).toEqual({status:"stale"});expect(currentNutrition(receipt.recipe_id)).toEqual([]);
 });
});
