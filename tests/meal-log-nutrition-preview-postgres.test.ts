import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Owned native cluster, Unix socket only. No existing database is accessed.
// Authority and ledger assertion are boundary doubles; canonical nutrition
// profile/product resolvers and the entire new migration run as real SQL.
let root:string,bin:string,started=false;
const owner="11111111-1111-4111-8111-111111111111", other="11111111-1111-4111-8111-111111111112";
const source="22222222-2222-4222-8222-222222222222";
function run(name:string,args:string[],input?:string){try{return execFileSync(name,args,{input,encoding:"utf8",stdio:["pipe","pipe","pipe"]}).trim();}catch(error){throw Error(String((error as {stderr:unknown}).stderr));}}
function sql(body:string){return run(join(bin,"psql"),["-XqAt","-h",root,"-p","55469","-U","postgres","-v","ON_ERROR_STOP=1"],body);}
function call(type="ingredient",amount="50",unit="g",user=owner,hash="verified") {return `select preview_meal_log_nutrition('${user}',now(),'${hash}',1,now(),'${type}','${source}',${amount},'${unit}');`;}
function preview(type="ingredient",amount="50",unit="g"){return JSON.parse(sql(call(type,amount,unit)));}
function canonical(name:string){const text=readFileSync("supabase/migrations/20260810120000_meal_log_core.sql","utf8");const start=text.indexOf(`create or replace function private.${name}(`);if(start<0)throw Error(name);return text.slice(start,text.indexOf("$function$;",start)+11);}
beforeAll(()=>{
 bin=run("pg_config",["--bindir"]);root=mkdtempSync("/tmp/hc-meal-preview-");
 run(join(bin,"initdb"),["-D",join(root,"data"),"-U","postgres","-A","trust","--no-locale"]);
 run(join(bin,"pg_ctl"),["-D",join(root,"data"),"-o",`-h '' -k ${root} -p 55469`,"-l",join(root,"log"),"-w","start"]);started=true;
 sql(`create schema private;create role anon;create role authenticated;create role service_role;
 create function private.verify_full_local_internal_scope() returns void language plpgsql as $$begin raise exception 'scope denied';end$$;
 create function public.assert_recipe_future_session_authority(uuid,timestamptz,text,integer,timestamptz) returns jsonb language plpgsql as $$begin if $3<>'verified' then raise exception 'ACCOUNT_SESSION_STALE';end if;return '{"account_generation":1}';end$$;
 create function private.assert_cooked_batch_cached_projection(uuid,uuid) returns void language sql as $$select$$;
 create function private.resolve_cooked_batch_nutrition(uuid,uuid) returns jsonb language sql as $$select '{"calculation_status":"partial","values":{"energy_kcal":1000,"protein_g":80}}'::jsonb$$;
 create table public.leftover_dishes(id uuid,user_id uuid,weight_status text,batch_status text,finished_weight_g numeric,remaining_weight_g numeric);
 create table public.nutrition_profiles(id uuid,is_active boolean,review_status text,basis_unit text,normalization_method text,basis_amount numeric);
 create table public.nutrition_values(profile_id uuid,nutrient_code text,value_status text,amount numeric);
 create table public.food_products(id uuid,deleted_at timestamptz,moderation_status text,visibility text,owner_user_id uuid,current_nutrition_version_id uuid);
 create table public.food_product_nutrition_versions(id uuid,product_id uuid,nutrition_profile_id uuid,basis_relations_json jsonb);
 create table public.ingredient_nutrition_profiles(id uuid,ingredient_id uuid,is_primary boolean,is_active boolean,review_status text,nutrition_profile_id uuid,preparation_state text);
 create table public.ingredient_conversion_assignments(ingredient_id uuid,preparation_state text,is_active boolean,review_status text,evidence_id uuid);
 create table public.measurement_source_evidence(id uuid,evidence_kind text,is_active boolean,review_status text,source_id uuid,normalized_g_per_15ml numeric,size_code text,preparation_state text,source_observed_unit text);
 create table public.nutrition_sources(id uuid,is_active boolean,review_status text,freshness_status text);
 create table public.piece_unit_weights(id uuid,ingredient_id uuid,preparation_state text,is_active boolean,review_status text,evidence_id uuid,size_code text,weight_g numeric);
 ${canonical("compact_meal_log_nutrition")}
 ${canonical("resolve_meal_log_profile_nutrition")}
 ${canonical("resolve_meal_log_product_nutrition")}
 insert into leftover_dishes values('${source}','${owner}','known','available',500,300);
 insert into nutrition_profiles values('${source}',true,'approved','g','mass_100g',100);
 insert into nutrition_values values('${source}','energy_kcal','observed',200),('${source}','protein_g','observed',20),('${source}','fat_g','missing',null);
 insert into ingredient_nutrition_profiles values('${source}','${source}',true,true,'approved','${source}','raw');
 insert into food_products values('${source}',null,'visible','private','${owner}','${source}');
 insert into food_product_nutrition_versions values('${source}','${source}','${source}','[{"from":{"amount":1,"unit":"serving"},"to":{"amount":200,"unit":"g"}}]');
 insert into nutrition_sources values('${source}',true,'approved','current');
 insert into measurement_source_evidence values('${source}','volume_weight',true,'approved','${source}',12,null,'raw','tbsp');
 insert into ingredient_conversion_assignments values('${source}','raw',true,'approved','${source}');`);
 sql(readFileSync("supabase/migrations/20261006120000_meal_log_nutrition_preview.sql","utf8"));
},30000);
afterAll(()=>{if(started)run(join(bin,"pg_ctl"),["-D",join(root,"data"),"-m","immediate","-w","stop"]);if(root)rmSync(root,{recursive:true,force:true});});
describe("read-only preview SQL",()=>{
 it("scales observed evidence and preserves missing fields",()=>{
   expect(preview()).toMatchObject({calculation_status:"partial",calories_kcal:100,protein_g:10,fat_g:null});
   expect(preview("ingredient","0.05","kg").calories_kcal).toBe(100);
   expect(preview("food_product","1","serving").calories_kcal).toBe(400);
 });
 it("matches approved density and rejects unsupported units or missing evidence",()=>{
   expect(preview("ingredient","2","tbsp").calories_kcal).toBe(48);
   expect(()=>preview("ingredient","1","개")).toThrow("UNIT_CONVERSION_MISSING");
   expect(()=>preview("ingredient","1","ml")).toThrow("UNIT_CONVERSION_MISSING");
   sql(`update nutrition_sources set freshness_status='stale'`);
   expect(()=>preview("ingredient","1","tbsp")).toThrow("UNIT_CONVERSION_MISSING");
   sql(`update nutrition_sources set freshness_status='current'`);
 });
 it("enforces private product and batch ownership plus session authority",()=>{
   expect(()=>sql(call("food_product","50","g",other))).toThrow("RESOURCE_NOT_FOUND");
   expect(()=>sql(call("cooked_batch","50","g",other))).toThrow("RESOURCE_NOT_FOUND");
   expect(()=>sql(call("ingredient","50","g",owner,"stale"))).toThrow("ACCOUNT_SESSION_STALE");
 });
 it("scales cooked weight without consuming it and rejects excessive or depleted quantities",()=>{
   expect(preview("cooked_batch","100")).toMatchObject({calories_kcal:200,protein_g:16,fat_g:null});
   expect(sql("select remaining_weight_g from leftover_dishes")).toBe("300");
   expect(()=>preview("cooked_batch","301")).toThrow("CONFLICT");
   sql("update leftover_dishes set batch_status='depleted'");
   expect(()=>preview("cooked_batch","1")).toThrow("CONFLICT");
   sql("update leftover_dishes set batch_status='available'");
 });
 it("fails closed for invalid numeric and inactive profiles",()=>{
   for(const value of ["0","-1","'NaN'::numeric","'Infinity'::numeric"])expect(()=>preview("ingredient",value)).toThrow("VALIDATION_ERROR");
   sql("update nutrition_profiles set is_active=false");expect(()=>preview()).toThrow("RESOURCE_NOT_FOUND");
   sql("update nutrition_profiles set is_active=true");
 });
 it("grants only service role and adds only exact internal RPC path",()=>{
   expect(sql("select has_function_privilege('anon','public.preview_meal_log_nutrition(uuid,timestamptz,text,integer,timestamptz,text,uuid,numeric,text)','EXECUTE')")).toBe("f");
   expect(sql("select has_function_privilege('authenticated','public.preview_meal_log_nutrition(uuid,timestamptz,text,integer,timestamptz,text,uuid,numeric,text)','EXECUTE')")).toBe("f");
   const scope=`set request.headers='{"x-homecook-internal-scope":"snapshot-v2-session"}';set request.method='POST';`;
   expect(()=>sql(`${scope}set request.path='/rpc/preview_meal_log_nutrition';select private.verify_full_local_internal_scope();`)).not.toThrow();
   expect(()=>sql(`${scope}set request.path='/rpc/unknown';select private.verify_full_local_internal_scope();`)).toThrow("scope denied");
 });
});
