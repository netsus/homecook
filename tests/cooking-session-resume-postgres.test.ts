import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
let root: string; let bin: string; let started = false;
const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: "C", NODE_ENV: "test" };
const owner = "11111111-1111-4111-8111-111111111111";
const other = "11111111-1111-4111-8111-111111111112";
const recipe = "22222222-2222-4222-8222-222222222222";
const snapshot = "33333333-3333-4333-8333-333333333333";
const meal = "44444444-4444-4444-8444-444444444444";
const meal2 = "44444444-4444-4444-8444-444444444445";
function run(command: string, args: string[], input?: string) {
  const out = spawnSync(command, args, { input, encoding: "utf8", env });
  if (out.status !== 0) throw Error(out.stderr);
  return out.stdout.trim();
}
function sql(query: string) {
  return run(join(bin,"psql"), ["-XqAt","-h",root,"-p","55449","-U","postgres","-v","ON_ERROR_STOP=1"], query);
}
function start(mode: "planner" | "standalone", options: { meals?: string[]; servings?: number; user?: string; enabled?: boolean; revision?: number } = {}) {
  const meals = options.meals ?? [meal];
  return JSON.parse(sql(`set homecook.snapshot_v2_creation='${options.enabled === false ? "off" : "on"}';
    select public.start_snapshot_v2_cooking_session('${options.user ?? owner}',now(),'${"a".repeat(64)}',1,now(),'${randomUUID()}','${mode}',
    ${mode === "planner" ? `array[${meals.map(id => `'${id}'::uuid`).join(",")}],'${JSON.stringify(Object.fromEntries(meals.map(id => [id,1])))}',null,null,null` : `null,null,'${recipe}',${options.revision ?? 1},${options.servings ?? 2}`});`)).data;
}
function seed() {
  sql(`truncate cooking_session_meal_claims,cooking_session_meals,cooking_sessions,mutation_idempotency_keys,meals,recipe_content_snapshots,recipes;
    insert into recipes(id,created_by,visibility,deleted_at,revision) values('${recipe}','${owner}','public',null,1);
    insert into recipe_content_snapshots(id,recipe_id,owner_user_id,title,created_at) values('${snapshot}','${recipe}',null,'테스트 레시피',now());
    insert into meals(id,user_id,recipe_id,recipe_content_snapshot_id,status,revision,planned_servings) values('${meal}','${owner}','${recipe}','${snapshot}','shopping_done',1,2),('${meal2}','${owner}','${recipe}','${snapshot}','shopping_done',1,2);`);
}
beforeAll(() => {
  bin=run("pg_config",["--bindir"]);root=mkdtempSync("/tmp/hc-cook-resume-");
  run(join(bin,"initdb"),["-D",join(root,"data"),"-U","postgres","-A","trust","--no-locale"]);
  run(join(bin,"pg_ctl"),["-D",join(root,"data"),"-o",`-h '' -k ${root} -p 55449`,"-l",join(root,"log"),"-w","start"]);started=true;
  sql(`create schema extensions; create extension pgcrypto with schema extensions; create schema recipe_visibility_guard;
    create table recipes(id uuid primary key,created_by uuid,visibility text,deleted_at timestamptz,revision bigint,source_type text default 'manual',origin_recipe_id uuid);
    create table recipe_content_snapshots(id uuid primary key,recipe_id uuid,owner_user_id uuid,title text,created_at timestamptz,base_servings integer default 2,ingredients_json jsonb default '[]',steps_json jsonb default '[]');
    create table ingredients(id uuid,name text);
    create table pantry_items(id uuid,user_id uuid,ingredient_id uuid,food_product_id uuid,food_product_nutrition_version_id uuid);
    create table food_products(id uuid,name text,brand text);
    create table user_account_lifecycles(owner_uuid uuid,account_generation bigint,status text);
    create table meals(id uuid primary key,user_id uuid,recipe_id uuid,recipe_content_snapshot_id uuid,status text,revision bigint,planned_servings integer,created_at timestamptz default now());
    create table cooking_sessions(id uuid primary key,user_id uuid,status text,contract_version text,session_kind text,recipe_id uuid,recipe_content_snapshot_id uuid,cooking_servings integer,base_recipe_revision bigint,created_at timestamptz);
    create table cooking_session_meals(session_id uuid,meal_id uuid,recipe_id uuid,cooking_servings integer,meal_revision_snapshot bigint,unique(session_id,meal_id));
    create table cooking_session_meal_claims(meal_id uuid primary key,session_id uuid,owner_user_id uuid,claimed_at timestamptz);
    create table mutation_idempotency_keys(id uuid primary key default gen_random_uuid(),owner_uuid uuid,account_generation bigint,operation_scope text,key_hash text,payload_hash text,state text,attempt_token uuid,lease_expires_at timestamptz,created_at timestamptz,updated_at timestamptz,durable_result jsonb,result_reference uuid,terminal_result text,unique(owner_uuid,account_generation,operation_scope,key_hash));
    create function public.assert_recipe_future_session_authority(uuid,timestamptz,text,integer,timestamptz) returns jsonb language plpgsql as $$begin perform pg_advisory_xact_lock(hashtextextended($1::text,0)); return '{"account_generation":1,"cutover_attempt_id":"${snapshot}"}'; end$$;
    create function public.lock_personal_recipe_ids(uuid[]) returns void language sql as $$select pg_advisory_xact_lock(hashtextextended($1[1]::text,0))$$;
    create function recipe_visibility_guard.is_owner_publicly_visible(uuid) returns boolean language sql as $$select true$$;
    create function public.set_account_generation_internal_writer_marker(uuid,boolean) returns void language sql as $$select$$;`);
  const source = readFileSync("supabase/migrations/20260803101000_recipe_content_snapshot_future_propagation.sql","utf8");
  const pos=source.indexOf("create or replace function public.start_snapshot_v2_cooking_session(");
  sql(source.slice(pos,source.indexOf("$function$;",pos)+"$function$;".length));
  const readPos=source.indexOf("create or replace function public.read_snapshot_v2_cook_mode(");
  sql(source.slice(readPos,source.indexOf("$function$;",readPos)+"$function$;".length));
  sql(readFileSync("supabase/migrations/20260927120650_cooking_session_resume.sql","utf8"));
  sql(readFileSync("supabase/migrations/20260927120651_cooking_deleted_owner_plan_pin.sql","utf8"));
},20_000);
afterAll(() => {if(started)run(join(bin,"pg_ctl"),["-D",join(root,"data"),"-m","immediate","-w","stop"]);if(root)rmSync(root,{recursive:true,force:true});});
describe("source-scoped cooking session resume in isolated PostgreSQL", () => {
  it("resumes the exact planner session instead of rejecting its meal claim", () => {
    seed(); const first=start("planner");
    expect(start("planner").session_id).toBe(first.session_id);
    expect(sql("select count(*) from cooking_sessions")).toBe("1");
    expect(sql("select count(*) from cooking_session_meal_claims")).toBe("1");
  });
  it("does not reuse a subset of another planner session or another owner", () => {
    seed(); start("planner",{meals:[meal,meal2]});
    expect(() => start("planner")).toThrow("MEAL_COOKING_ALREADY_STARTED");
    expect(() => start("planner",{user:other})).toThrow("RECIPE_IMPACT_STALE");
  });
  it("resumes exact standalone content/servings but keeps different source settings separate", () => {
    seed(); const first=start("standalone");
    expect(start("standalone").session_id).toBe(first.session_id);
    expect(start("standalone",{servings:3}).session_id).not.toBe(first.session_id);
    expect(start("standalone",{user:other}).session_id).not.toBe(first.session_id);
  });
  it("starts a fresh standalone attempt after completion while a shopping_done planner session exists", () => {
    seed(); const planner=start("planner"); const first=start("standalone");
    expect(first.session_id).not.toBe(planner.session_id);
    sql(`update cooking_sessions set status='completed' where id='${first.session_id}'`);
    expect(start("standalone").session_id).not.toBe(first.session_id);
    expect(sql(`select status from meals where id='${meal}'`)).toBe("shopping_done");
    expect(start("planner").session_id).toBe(planner.session_id);
  });
  it("does not reuse cancelled attempts or a newer content pin", () => {
    seed(); const first=start("standalone");
    sql(`update cooking_sessions set status='cancelled' where id='${first.session_id}'`);
    const next=start("standalone"); expect(next.session_id).not.toBe(first.session_id);
    sql(`insert into recipe_content_snapshots(id,recipe_id,owner_user_id,title,created_at) values('${other}','${recipe}',null,'새 내용',now()+interval '1 second')`);
    expect(start("standalone").session_id).not.toBe(next.session_id);
  });
  it("retains source revision protection and allows only existing work when creation is disabled", () => {
    seed(); const first=start("standalone");
    expect(start("standalone",{enabled:false}).session_id).toBe(first.session_id);
    expect(() => start("standalone",{enabled:false,servings:3})).toThrow("SNAPSHOT_V2_CREATION_DISABLED");
    expect(() => start("standalone",{revision:2})).toThrow("RECIPE_REVISION_CONFLICT");
  });
});

function readSession(id: string, user=owner) {
  return JSON.parse(sql(`select public.read_snapshot_v2_cook_mode('${user}',now(),'${"a".repeat(64)}',1,now(),'${id}');`)).data;
}
function deleteSource(visibility="private") {
  sql(`update recipes set visibility='${visibility}',deleted_at=now();
    update recipe_content_snapshots set owner_user_id=${visibility === "private" ? `'${owner}'` : "null"};`);
}
describe("deleted source stays usable only through an existing owner's plan", () => {
  it.each(["private","public"])("starts, resumes and reads a pre-deletion %s owner plan", visibility => {
    seed(); deleteSource(visibility);
    const first=start("planner");
    expect(start("planner").session_id).toBe(first.session_id);
    expect(readSession(first.session_id).recipe.id).toBe(recipe);
    expect(() => start("standalone")).toThrow("RESOURCE_NOT_FOUND");
    expect(() => readSession(first.session_id,other)).toThrow("RESOURCE_NOT_FOUND");
  });
  it("rejects a plan or pin created after deletion, a foreign pin, and mismatched recipe pins", () => {
    for (const update of [
      `update meals set created_at=now()+interval '1 day'`,
      `update recipe_content_snapshots set created_at=now()+interval '1 day'`,
      `update recipe_content_snapshots set owner_user_id='${other}'`,
      `update recipe_content_snapshots set recipe_id='${other}'`,
    ]) {
      seed(); deleteSource(); sql(update);
      expect(() => start("planner")).toThrow("RESOURCE_NOT_FOUND");
    }
  });
  it("does not admit another author's deleted public recipe or an imported/forked public source", () => {
    for (const update of [
      `update recipes set created_by='${other}'`,
      `update recipes set source_type='youtube'`,
      `update recipes set origin_recipe_id='${other}'`,
    ]) {
      seed(); const active=start("planner"); deleteSource("public"); sql(update);
      expect(() => start("planner")).toThrow("RESOURCE_NOT_FOUND");
      expect(() => readSession(active.session_id)).toThrow("RESOURCE_NOT_FOUND");
    }
  });
  it("checks exact historical meal pins again when reopening a deleted recipe session", () => {
    seed(); const active=start("planner"); deleteSource();
    expect(readSession(active.session_id).session_id).toBe(active.session_id);
    sql(`update meals set recipe_content_snapshot_id='${other}' where id='${meal}'`);
    expect(() => readSession(active.session_id)).toThrow("RESOURCE_NOT_FOUND");
  });
});
