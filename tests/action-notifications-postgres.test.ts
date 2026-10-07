import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
let root: string;
let bin: string;
let started = false;
const owner = "11111111-1111-4111-8111-111111111111";
const other = "11111111-1111-4111-8111-111111111112";
const recipe = "22222222-2222-4222-8222-222222222222";
const source = "33333333-3333-4333-8333-333333333333";
function run(name: string, args: string[], input?: string) {
  try { return execFileSync(name, args, { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] }).trim(); }
  catch (error) { throw Error(String((error as { stderr: unknown }).stderr)); }
}
function sql(body: string) {
  return run(join(bin, "psql"), ["-XqAt", "-h", root, "-p", "55457", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], body);
}
function args(user = owner) { return `'${user}',now(),'verified-${user}',1,now()`; }
function list(user = owner, view = "unseen", limit = 50) { return JSON.parse(sql(`select list_action_notifications(${args(user)},'${view}',${limit});`)); }
beforeAll(() => {
  bin = run("pg_config", ["--bindir"]);
  root = mkdtempSync("/tmp/hc-notifications-");
  run(join(bin, "initdb"), ["-D", join(root, "data"), "-U", "postgres", "-A", "trust", "--no-locale"]);
  run(join(bin, "pg_ctl"), ["-D", join(root, "data"), "-o", `-h '' -k ${root} -p 55457`, "-l", join(root, "log"), "-w", "start"]);
  started = true;
  sql(`create schema private; create role anon; create role authenticated; create role service_role;
    create table users(id uuid primary key);
    create table user_account_lifecycles(owner_uuid uuid,account_generation bigint,status text);
    create table recipes(id uuid primary key,title text);
    create table recipe_content_snapshots(id uuid primary key,title text);
    create table recipe_ingredients(recipe_id uuid,ingredient_id uuid);
    create table ingredients(id uuid,standard_name text);
    create table food_products(id uuid,name text);
    create table pantry_items(id uuid,user_id uuid,ingredient_id uuid,food_product_id uuid);
    create table meals(id uuid,user_id uuid,recipe_id uuid,recipe_content_snapshot_id uuid,planned_servings int,plan_date date);
    create table product_planner_entries(id uuid,user_id uuid,product_name_snapshot text,plan_date date);
    create table shopping_lists(id uuid,user_id uuid,title text,is_completed boolean);
    create table leftover_dishes(id uuid,user_id uuid,recipe_id uuid,recipe_content_snapshot_id uuid,cooking_servings int,status text,depleted_reason text);
    create table meal_log_entries(id uuid,owner_user_id uuid,account_generation bigint,display_name_snapshot text,consumed_local_date date,deleted_at timestamptz);
    create function private.verify_full_local_internal_scope() returns void language plpgsql as $$begin raise exception 'scope denied'; end$$;
    create function public.assert_recipe_future_session_authority(p_owner uuid,p_identity timestamptz,p_hash text,p_version integer,p_issued timestamptz) returns jsonb language plpgsql as $$declare v_gen bigint; begin
      if p_hash<>'verified-'||p_owner::text then raise exception 'ACCOUNT_SESSION_STALE'; end if;
      select account_generation into v_gen from user_account_lifecycles where owner_uuid=p_owner and status='active';
      if v_gen is null then raise exception 'ACCOUNT_GENERATION_STALE'; end if;
      return jsonb_build_object('account_generation',v_gen); end$$;
    create function public.complete_snapshot_v2_cooking_session(p_owner_uuid uuid,p_identity timestamptz,p_hash text,p_version integer,p_issued timestamptz,p_session_id uuid,p_key uuid,p_consumed_pantry_item_ids uuid[],p_action text,p_weight numeric,p_now timestamptz) returns jsonb language plpgsql as $$
    declare v_requested int:=cardinality(p_consumed_pantry_item_ids); v_authority jsonb:='{"account_generation":1}';
    begin
      delete from public.pantry_items where user_id = p_owner_uuid and id = any(coalesce(p_consumed_pantry_item_ids, '{}'::uuid[]));
      if p_action='fail' then raise exception 'CONFLICT'; end if;
      return '{}'; end$$;
    create function private.complete_legacy_cooking_core(p_mode text,p_owner_uuid uuid,p_identity timestamptz,p_hash text,p_version integer,p_issued timestamptz,p_session uuid,p_recipe uuid,p_servings integer,p_consumed uuid[],p_key uuid,p_now timestamptz) returns jsonb language plpgsql as $$
    declare v_consumed uuid[]:=p_consumed; v_recipe_id uuid:=p_recipe; v_pantry_removed integer := 0; v_leftover_dish_id uuid:=p_session; v_authority jsonb:='{"account_generation":1}';
    begin
    delete from public.pantry_items as pantry
    where pantry.user_id = p_owner_uuid
      and pantry.ingredient_id = any(v_consumed)
      and pantry.ingredient_id in (
        select recipe_ingredient.ingredient_id
        from public.recipe_ingredients as recipe_ingredient
        where recipe_ingredient.recipe_id = v_recipe_id
      );
    get diagnostics v_pantry_removed = row_count;
    return jsonb_build_object('removed',v_pantry_removed); end$$;
    insert into users values('${owner}'),('${other}');
    insert into user_account_lifecycles values('${owner}',1,'active'),('${other}',1,'active');
    insert into recipes values('${recipe}','김치찌개');`);
  sql(readFileSync("supabase/migrations/20260928020000_action_notifications.sql", "utf8"));
}, 20_000);
afterAll(() => {
  if (started) run(join(bin, "pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"]);
  if (root) rmSync(root, { recursive: true, force: true });
});
describe("durable action notifications in isolated PostgreSQL", () => {
  it("records committed source actions exactly once and does not record a rolled back action", () => {
    sql(`insert into meals values('${source}','${owner}','${recipe}',null,2,current_date);
      insert into shopping_lists values('${source}','${owner}','장보기',false);
      update shopping_lists set is_completed=true; update shopping_lists set is_completed=true;
      insert into leftover_dishes values('${source}','${owner}','${recipe}',null,2,'leftover',null);
      insert into meal_log_entries values('${source}','${owner}',1,'김치찌개',current_date,null);
      update leftover_dishes set status='eaten',depleted_reason='consumed';
      begin; insert into meals values(gen_random_uuid(),'${owner}','${recipe}',null,1,current_date); rollback;`);
    expect(list().items).toHaveLength(6);
    expect(list().items.find((item: { event_type: string }) => item.event_type === "cooking_completed").message).toBe("김치찌개 2인분을 완성했어요");
    expect(list(other).items).toEqual([]);
  });
  it("captures only actual owner pantry names and rolls them back when completion fails", () => {
    sql(`insert into ingredients values('${recipe}','김치'); insert into pantry_items values('${source}','${owner}','${recipe}',null);`);
    const completion = (action: string) => `select complete_snapshot_v2_cooking_session(${args()},'${source}','${source}',array['${source}'::uuid],'${action}',null,now());`;
    expect(() => sql(completion("fail"))).toThrow("CONFLICT");
    expect(sql("select count(*) from pantry_items")).toBe("1");
    expect(list().items.filter((item: { event_type: string }) => item.event_type === "pantry_deducted")).toHaveLength(0);
    sql(completion("ok"));
    expect(list().items.find((item: { event_type: string }) => item.event_type === "pantry_deducted").message).toBe("김치");
  });
  it("records only actually removed legacy pantry rows and includes product plans", () => {
    const legacySource = "33333333-3333-4333-8333-333333333334";
    sql(`insert into recipe_ingredients values('${recipe}','${recipe}');
      insert into pantry_items values('${legacySource}','${owner}','${recipe}',null),('${other}','${other}','${recipe}',null);
      insert into product_planner_entries values('${legacySource}','${owner}','요거트',current_date);
      select private.complete_legacy_cooking_core('standalone',${args()},'${legacySource}','${recipe}',2,array['${recipe}'::uuid],'${legacySource}',now());`);
    expect(sql(`select count(*) from pantry_items where user_id='${other}'`)).toBe("1");
    expect(list().items.filter((item: { event_type: string }) => item.event_type === "pantry_deducted")).toHaveLength(2);
    expect(list().items.find((item: { message: string }) => item.message === "요거트").event_type).toBe("meal_planned");
  });
  it("uses stable cursor ordering, bounded pages, and owner-scoped idempotent seen writes", () => {
    const all = list().items;
    const first = list(owner, "unseen", 2).items;
    expect(first).toHaveLength(3);
    const boundary = first[1];
    const next = JSON.parse(sql(`select list_action_notifications(${args()},'unseen',50,'${boundary.created_at}','${boundary.id}');`)).items;
    expect([...first.slice(0, 2), ...next].map(item => item.id)).toEqual(all.map((item: { id: string }) => item.id));
    expect(() => list(owner, "unseen", 100)).toThrow("VALIDATION_ERROR");
    expect(JSON.parse(sql(`select mark_action_notifications_seen(${args(other)},array['${all[0].id}'::uuid]);`)).seen_ids).toEqual([]);
    sql(`select mark_action_notifications_seen(${args()},array['${all[0].id}'::uuid]); select mark_action_notifications_seen(${args()},array['${all[0].id}'::uuid]);`);
    expect(list(owner, "archive").items).toHaveLength(1);
    expect(list().unread_count).toBe(all.length - 1);
  });
  it("denies external table/writer access and stale identity; scopes only the exact two RPC paths", () => {
    expect(() => sql("set role authenticated; select * from action_notifications")).toThrow("permission denied");
    expect(() => sql("set role service_role; insert into action_notifications(id) values(gen_random_uuid())")).toThrow("permission denied");
    expect(sql("select has_function_privilege('service_role','private.write_action_notification(uuid,text,uuid,text,text,text,bigint)','EXECUTE')")).toBe("f");
    expect(() => sql(`select list_action_notifications('${owner}',now(),'bad',1,now());`)).toThrow("ACCOUNT_SESSION_STALE");
    sql(`set request.headers='{"x-homecook-internal-scope":"action-notifications"}'; set request.method='POST'; set request.path='/rpc/list_action_notifications'; select private.verify_full_local_internal_scope();`);
    expect(() => sql(`set request.headers='{"x-homecook-internal-scope":"action-notifications"}'; set request.method='POST'; set request.path='/action_notifications'; select private.verify_full_local_internal_scope();`)).toThrow("scope denied");
  });
  it("clears withdrawal history and isolates the next account generation", () => {
    sql(`update user_account_lifecycles set status='deleting' where owner_uuid='${owner}';`);
    expect(sql(`select count(*) from action_notifications where owner_user_id='${owner}'`)).toBe("0");
    expect(() => list()).toThrow("ACCOUNT_GENERATION_STALE");
    sql(`update user_account_lifecycles set status='active',account_generation=2 where owner_uuid='${owner}';
      insert into meal_log_entries values(gen_random_uuid(),'${owner}',1,'옛 기록',current_date,null);
      insert into meals values(gen_random_uuid(),'${owner}','${recipe}',null,3,current_date);`);
    expect(list().items).toHaveLength(1);
  });
});
