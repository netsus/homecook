import {spawnSync} from "node:child_process";
import {describe,expect,it} from "vitest";
const enabled=process.env.HOMECOOK_SAVED_CATALOG_PG==="1";
const container=process.env.HOMECOOK_WEIGHT_EVIDENCE_TEST_CONTAINER??"",tag=process.env.HOMECOOK_WEIGHT_EVIDENCE_TEST_TAG??"";
const image="public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a";
const owner="b1000000-0000-4000-8000-000000000001",other="b1000000-0000-4000-8000-000000000002",food="b8000000-0000-4000-8000-000000000001",cutover="b5000000-0000-4000-8000-000000000001";
const row="a1000000-0000-4000-8000-000000000001",sourceId="a1000000-0000-4000-8000-000000000002",epoch="2026-08-08T00:00:00Z",issued="2026-08-08T01:00:00Z";
let sequence=0;
const id=()=>`a2000000-0000-4000-8000-${String(++sequence).padStart(12,"0")}`;
const literal=(value:unknown)=>`'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`;
function sql(statement:string,ok=true,bootstrap=false){
 expect(container).toMatch(/^[a-f0-9]{64}$/u);expect(tag).toMatch(/^[a-f0-9]{32}$/u);
 const inspect=spawnSync("docker",["inspect","--format",'{{.Config.Image}}|{{.HostConfig.NetworkMode}}|{{index .Config.Labels "homecook.cooked-weight-test"}}',container],{encoding:"utf8"});
 expect(inspect.status).toBe(0);expect(inspect.stdout.trim()).toBe(`${image}|none|${tag}`);
 const r=spawnSync("docker",["exec","-i",container,"psql","-h","/tmp/pgsocket","-U","supabase_admin","-d","postgres","-XqAt","-v","ON_ERROR_STOP=1"],{input:`${bootstrap?"":"set session authorization postgres;"}${statement}`,encoding:"utf8",timeout:15000});
 if(ok)expect(r.status,r.stderr).toBe(0);return r;
}
function data(statement:string,bootstrap=false){return JSON.parse(sql(statement,true,bootstrap).stdout.trim().split("\n").at(-1)!);}
function content(known=true){return {title:"Synthetic catalog selection",base_servings:2,tags:[],ingredients:[{row_id:row,source_draft_ingredient_id:sourceId,standard_name:"입력명 유지",quantity_mode:known?"quantity":"unknown",amount:known?10:null,unit:known?"g":null,display_text:"원문량 유지",component_label:null}],steps:[]};}
function seed(input:object=content()){
 const saved=id(),extraction=id();
 const source={youtube_url:"https://www.youtube.com/watch?v=synthetic",youtube_video_id:"synthetic",thumbnail_url:null,draft_json:{ingredients:[{draft_ingredient_id:sourceId,standard_name:"입력명 유지",resolution_status:"unresolved"}],steps:[]}};
 sql(`begin;select public.set_account_generation_internal_writer_marker('${cutover}',true);insert into public.youtube_saved_recipe_results(id,owner_user_id,account_generation,extraction_session_id,source_snapshot_json,editable_content_json,editable_content_hash)values('${saved}','${owner}',1,'${extraction}',${literal(source)},${literal(input)},repeat('0',64));select public.set_account_generation_internal_writer_marker('${cutover}',false);commit;`);
 return saved;
}
function addCurrentNutrition(saved:string){
 const current=state(saved),nutrition=id();
 sql(`begin;select public.set_account_generation_internal_writer_marker('${cutover}',true);
   insert into public.recipe_nutrition_snapshots select (jsonb_populate_record(null::public.recipe_nutrition_snapshots,
     (select to_jsonb(s) from public.recipe_nutrition_snapshots s where id='b9000000-0000-4000-8000-000000000001')
     ||jsonb_build_object('id','${nutrition}','recipe_id','${current.recipe}','owner_user_id',null))).*;
   select public.set_account_generation_internal_writer_marker('${cutover}',false);commit;`);return nutrition;
}
function write(saved:string,input:object,rev=1,key=id(),who=owner,ok=true){
 const hash=(who===owner?"e":"f").repeat(64);
 const result=sql(`begin;set local request.jwt.claim.role='service_role';set local role service_role;select public.write_youtube_saved_recipe_result('${who}','${epoch}','${hash}',1,'${issued}','update','${saved}',null,${rev},${literal(input)},'${key}');commit;`,ok);
 return ok?JSON.parse(result.stdout.trim().split("\n").at(-1)!):result;
}
function selectContent(input:ReturnType<typeof content>,catalog_ingredient_id:string|null){return {...input,ingredients:input.ingredients.map(item=>({...item,catalog_ingredient_id}))};}
function state(saved:string){return data(`select jsonb_build_object('source',source_snapshot_json,'content',editable_content_json,'hash',editable_content_hash,'revision',revision,'recipe',canonical_recipe_id) from public.youtube_saved_recipe_results where id='${saved}';`);}
function validate(input:object,current:object,extra:object={}){return data(`select private.validate_youtube_saved_recipe_editable_content(${literal(input)},${literal({draft_json:{ingredients:[{draft_ingredient_id:sourceId}],steps:[]},_quantity_current_content:current,...extra})});`);}
const direct={schema_version:"quantity-v4",raw_value:"10",raw_unit:"g",numerator:"10",denominator:"1",normalized:{amount:10,unit:"g"},display_quantity:{amount:10,unit:"g"},quality:"direct",reason:null,evidence_ids:[],source_versions:[],batch_basis:null};
describe.skipIf(!enabled)("saved catalog identity on exact schema232+233–236",()=>{
 it.each([true,false])("actual owner RPC links the catalog, keeps source/quantity and exposes current snapshot (known=%s)",known=>{
  const input=content(known),saved=seed(input),before=state(saved),selected=selectContent(input,food);
  const result=write(saved,selected);expect(result.data.revision).toBe(2);expect(result.data.content).toEqual(selected);
  expect(result.data.ingredient_links[row]).toMatchObject({ingredient_id:food,resolution_status:"resolved"});
  const after=state(saved);expect(after.source).toEqual(before.source);expect(after.recipe).toBe(before.recipe);expect(after.hash).not.toBe(before.hash);
  const snapshot=data(`select to_jsonb(s) from public.build_recipe_content_snapshot_input('${before.recipe}') s;`);
  expect(snapshot.ingredients_json[0]).toMatchObject({ingredient_id:food,amount:known?10:null,unit:known?"g":null,display_text:"원문량 유지",standard_name:"입력명 유지"});
 });
 it("replays the exact original receipt after a later unlink and rejects reused keys/old CAS",()=>{
  const input=content(),saved=seed(input),selected=selectContent(input,food),key=id();
  const first=write(saved,selected,1,key);write(saved,selectContent(input,null),2);const before=state(saved);
  expect(write(saved,selected,1,key)).toEqual(first);expect(state(saved)).toEqual(before);
  expect(write(saved,{...selected,title:"different payload"},1,key,owner,false).stderr).toContain("IDEMPOTENCY_KEY_REUSED");
  expect(write(saved,selected,1,id(),owner,false).stderr).toContain("CONFLICT");expect(state(saved)).toEqual(before);
 });
 it("older client omission preserves selection; explicit null unlinks and never revives the source",()=>{
  const input=content(),saved=seed(input);write(saved,selectContent(input,food));
  expect(write(saved,{...input,title:"title only"},2).data.content.ingredients[0].catalog_ingredient_id).toBe(food);
  expect(write(saved,selectContent(input,null),3).data.ingredient_links[row]).toMatchObject({ingredient_id:null,resolution_status:"unresolved"});
 });
 it("keeps legacy eight-key rows absent and normalizes old receipts before newer choices",()=>{
  const input=content(),saved=seed(input),key=id(),first=write(saved,input,1,key);
  expect(Object.keys(first.data.content.ingredients[0])).toHaveLength(8);write(saved,selectContent(input,food),2);
  expect(write(saved,input,1,key)).toEqual(first);
 });
 it("rejects another owner and unselectable/nonexistent IDs with no mutation",()=>{
  const input=content(),saved=seed(input),before=state(saved);
  expect(write(saved,selectContent(input,food),1,id(),other,false).stderr).toContain("RESOURCE_NOT_FOUND");
  expect(write(saved,selectContent(input,id()),1,id(),owner,false).stderr).toContain("VALIDATION_ERROR");expect(state(saved)).toEqual(before);
 });
 it("preserves exact frozen SI input through a relink and returns the selected food's current context",()=>{
  const base=content(),input={...base,ingredients:[{...base.ingredients[0],quantity_input:direct,quantity_context_fingerprint:"a".repeat(64)}]},saved=seed(input);
  const result=write(saved,{...input,ingredients:[{...input.ingredients[0],catalog_ingredient_id:food}]});
  expect(result.data.content.ingredients[0].quantity_input).toEqual(direct);
  const context=data(`select private.youtube_worker_quantity_input_v4('{"_quantity_owner_action":"context"}',jsonb_build_object('ingredient_id','${food}'));`);
  expect(result.data.quantity_contexts[row]).toEqual(context);
 });
 it.each(["estimated","unavailable"])("does not reuse food-dependent frozen quantity quality=%s",quality=>{
  const base=content(),input={...base,ingredients:[{...base.ingredients[0],quantity_input:{...direct,raw_unit:"큰술",quality,reason:"DENSITY_ESTIMATED"}}]},saved=seed(input),before=state(saved);
  expect(write(saved,{...input,ingredients:[{...input.ingredients[0],catalog_ingredient_id:food}]},1,id(),owner,false).stderr).toContain("QUANTITY_INPUT_REQUIRED");expect(state(saved)).toEqual(before);
 });
 it("changing a name through an older client clears explicit identity",()=>{
  const input=content(),selected=selectContent(input,food);
  expect(validate({...input,ingredients:[{...input.ingredients[0],standard_name:"다른 식품"}]},selected).ingredients[0].catalog_ingredient_id).toBeNull();
 });
 it("cannot expose private owner/source data through the public selection marker",()=>{
  const input=content(false),saved=seed(input);write(saved,selectContent(input,food));const current=state(saved);
  const projection=data(`begin;set local request.headers='{"x-homecook-internal-scope":"recipe-future-propagation"}';set local request.method='POST';set local request.path='/rpc/read_public_youtube_saved_recipe_detail';select public.read_public_youtube_saved_recipe_detail('${current.recipe}');rollback;`);
  expect(projection.catalog_selection_present).toBe(true);expect(projection.ingredients[0].amount).toBeNull();expect(projection.ingredients[0].ingredient_id).toBe(food);
  for(const key of ["source","owner_user_id","draft_id","content"])expect(projection).not.toHaveProperty(key);
  write(saved,selectContent(input,null),2);
  const unlinked=data(`begin;set local request.headers='{"x-homecook-internal-scope":"recipe-future-propagation"}';set local request.method='POST';set local request.path='/rpc/read_public_youtube_saved_recipe_detail';select public.read_public_youtube_saved_recipe_detail('${current.recipe}');rollback;`);
  expect(unlinked.catalog_selection_present).toBe(true);expect(unlinked.ingredients[0].ingredient_id).not.toBe(food);expect(unlinked.ingredients[0].amount).toBeNull();
 });
 it("retires stale current nutrition without changing past pins, and new meals pin current catalog rows",()=>{
  const saved=seed(),current=state(saved),oldNutrition=addCurrentNutrition(saved),oldMeal=id(),newMeal=id();
  const createMeal=(meal:string)=>`insert into public.meals(id,user_id,recipe_id,plan_date,column_id,planned_servings,status)
    values('${meal}','${owner}','${current.recipe}','2026-10-19','b6000000-0000-4000-8000-000000000001',2,'registered');`;
  sql(`begin;select public.set_account_generation_internal_writer_marker('${cutover}',true);
    ${createMeal(oldMeal)} select public.set_account_generation_internal_writer_marker('${cutover}',false);commit;`);
  const oldPinned=data(`select to_jsonb(s) from public.recipe_content_snapshots s join public.meals m on m.recipe_content_snapshot_id=s.id where m.id='${oldMeal}';`);
  const oldValues=data(`select to_jsonb(n)-'is_current' from public.recipe_nutrition_snapshots n where id='${oldNutrition}';`);
  expect(oldPinned.recipe_nutrition_snapshot_id).toBe(oldNutrition);
  write(saved,selectContent(content(),food));
  expect(data(`select to_jsonb(is_current) from public.recipe_nutrition_snapshots where id='${oldNutrition}';`,true)).toBe(false);
  expect(data(`select to_jsonb(n)-'is_current' from public.recipe_nutrition_snapshots n where id='${oldNutrition}';`,true)).toEqual(oldValues);
  expect(data(`select to_jsonb(s) from public.recipe_content_snapshots s join public.meals m on m.recipe_content_snapshot_id=s.id where m.id='${oldMeal}';`)).toEqual(oldPinned);
  sql(`begin;select public.set_account_generation_internal_writer_marker('${cutover}',true);${createMeal(newMeal)}select public.set_account_generation_internal_writer_marker('${cutover}',false);commit;`);
  const newPinned=data(`select to_jsonb(s) from public.recipe_content_snapshots s join public.meals m on m.recipe_content_snapshot_id=s.id where m.id='${newMeal}';`);
  expect(newPinned.id).not.toBe(oldPinned.id);expect(newPinned.recipe_nutrition_snapshot_id).toBeNull();expect(newPinned.ingredients_json[0].ingredient_id).toBe(food);
  expect(sql("select current_setting('homecook.recipe_nutrition_writer',true);").stdout.trim()).not.toBe("on");
 });
 it("restores the prior nutrition writer marker in the same successful owner RPC transaction",()=>{
  const saved=seed(),nutrition=addCurrentNutrition(saved),input=selectContent(content(),food);
  const result=sql(`begin;set local homecook.recipe_nutrition_writer='synthetic-prior';
    set local request.jwt.claim.role='service_role';set local role service_role;
    select public.write_youtube_saved_recipe_result('${owner}','${epoch}','${"e".repeat(64)}',1,'${issued}','update','${saved}',null,1,${literal(input)},'${id()}');
    select current_setting('homecook.recipe_nutrition_writer',true);commit;`);
  expect(result.stdout.trim().split("\n").at(-1)).toBe("synthetic-prior");
  expect(data(`select to_jsonb(is_current) from public.recipe_nutrition_snapshots where id='${nutrition}';`,true)).toBe(false);
 });
 it("rolls the canonical update and current retirement back when immutable source validation fails",()=>{
  const saved=seed(),nutrition=addCurrentNutrition(saved),before=state(saved);
  const result=sql(`begin;select public.set_account_generation_internal_writer_marker('${cutover}',true);
    update public.youtube_saved_recipe_results set editable_content_json=${literal(selectContent(content(),food))},
      source_snapshot_json=source_snapshot_json||'{"forged":"must roll back"}'::jsonb where id='${saved}';commit;`,false);
  expect(result.stderr).toContain("source snapshot is immutable");expect(state(saved)).toEqual(before);
  expect(data(`select to_jsonb(is_current) from public.recipe_nutrition_snapshots where id='${nutrition}';`)).toBe(true);
 });
 it("existing immutable meal/cooking snapshot data remains byte-identical",()=>{
  const saved=seed(),current=state(saved),meal=id();
  sql(`begin;select public.set_account_generation_internal_writer_marker('${cutover}',true);
    insert into public.meals(id,user_id,recipe_id,plan_date,column_id,planned_servings,status)
    values('${meal}','${owner}','${current.recipe}','2026-10-19','b6000000-0000-4000-8000-000000000001',2,'registered');
    select public.set_account_generation_internal_writer_marker('${cutover}',false);commit;`);
  const before=data("select jsonb_agg(to_jsonb(s) order by id) from public.recipe_content_snapshots s;");
  expect(before.some((snapshot:{recipe_id:string})=>snapshot.recipe_id===current.recipe)).toBe(true);
  write(saved,selectContent(content(),food));
  expect(data("select jsonb_agg(to_jsonb(s) order by id) from public.recipe_content_snapshots s;")).toEqual(before);
 });
});
