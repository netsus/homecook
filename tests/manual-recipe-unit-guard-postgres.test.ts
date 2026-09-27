import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// This owned /tmp native PostgreSQL cluster has no TCP listener and accepts no
// database URL. It runs the actual manual writer with minimal supporting tables.
let root: string; let bin: string; let started = false;
const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: "C", NODE_ENV: "test" };
const owner = "11000000-0000-4000-8000-000000000001";
const ingredientId = "12000000-0000-4000-8000-000000000001";
const at = "2026-09-27T00:00:00Z";
const migration = readFileSync("supabase/migrations/20260927120200_personal_recipe_unit_choices.sql", "utf8");
const manualGuard = migration.slice(migration.indexOf("do $manual_unit_choices$"), migration.indexOf("commit;"));
function run(command: string, args: string[], input?: string) {
  const result = spawnSync(command, args, { input, encoding: "utf8", env });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
function sql(query: string) {
  return run(join(bin, "psql"), ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-h", root, "-p", "55452", "-U", "postgres"], query);
}
function create(unit: string, role = "service_role") {
  const ingredients = JSON.stringify([{ ingredient_id: ingredientId, amount: 1, unit, ingredient_type: "QUANT", scalable: true, sort_order: 1 }]);
  return sql(`set role ${role}; select public.create_manual_recipe_with_managed_image('${owner}','${at}','${"a".repeat(64)}',1,null,null,'단위 검사',1,null,'{}','user_reviewed','${ingredients}','[]');`);
}
beforeAll(() => {
  bin = run("pg_config", ["--bindir"]); root = mkdtempSync("/tmp/hc-manual-unit-");
  run(join(bin, "initdb"), ["-D", join(root, "data"), "-U", "postgres", "-A", "trust", "--no-locale"]);
  run(join(bin, "pg_ctl"), ["-D", join(root, "data"), "-o", `-h '' -k ${root} -p 55452`, "-l", join(root, "log"), "-w", "start"]); started = true;
  sql(`create role anon; create role authenticated; create role service_role;
    create schema extensions; create schema private;
    create type public.recipe_ingredient_type as enum ('QUANT','TO_TASTE');
    create table public.account_generation_capability_state(singleton boolean, state text);
    insert into public.account_generation_capability_state values(true,'generation_active');
    create table public.user_account_lifecycles(owner_uuid uuid, account_generation bigint, status text, auth_identity_created_at_snapshot timestamptz);
    insert into public.user_account_lifecycles values('${owner}',1,'active','${at}');
    create table public.user_session_generation_bindings(owner_uuid uuid,session_key_hash text,hmac_key_version integer,expected_account_generation bigint,auth_identity_created_at_snapshot timestamptz,revoked_at timestamptz);
    insert into public.user_session_generation_bindings values('${owner}','${"a".repeat(64)}',1,1,'${at}',null);
    create table public.recipes(id uuid primary key default gen_random_uuid(),title text,base_servings integer,source_type text,created_by uuid,thumbnail_url text,tags text[],visibility text);
    create table public.recipe_ingredients(recipe_id uuid,ingredient_id uuid,amount numeric,unit text,ingredient_type public.recipe_ingredient_type,display_text text,scalable boolean,sort_order integer);
    create table public.recipe_steps(recipe_id uuid,step_number integer,instruction text,cooking_method_id uuid,ingredients_used jsonb,heat_level text,duration_seconds integer,duration_text text);
    create function public.build_recipe_tag_payload(text[],text) returns jsonb language sql as $$ select '[]'::jsonb $$;
    create function public.set_recipe_tags(uuid,jsonb,uuid,text) returns void language sql as $$ select $$;
    grant usage on schema public to anon,authenticated,service_role;
  `);
  sql(readFileSync("supabase/migrations/20260724190000_recipe_manual_create_image_attach.sql", "utf8"));
  sql(manualGuard);
}, 20_000);
afterAll(() => {
  if (started) run(join(bin, "pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"]);
  if (root) rmSync(root, { recursive: true, force: true });
});

describe("manual creation unit guard on isolated PostgreSQL", () => {
  it("rejects arbitrary and source-only legacy units before inserting any rows", () => {
    for (const unit of ["임의단위", "줌", ""]) expect(() => create(unit)).toThrow(/VALIDATION_ERROR/);
    expect(sql("select count(*) from recipes;")).toBe("0");
    expect(sql("select count(*) from recipe_ingredients;")).toBe("0");
  });
  it("accepts supported mass, volume, piece and spoon units without converting amounts", () => {
    for (const unit of ["g", "ml", "개", "큰술"]) expect(JSON.parse(create(unit)).id).toBeTruthy();
    expect(sql("select string_agg(unit,',' order by unit) from recipe_ingredients where amount=1;")).toContain("큰술");
    expect(sql("select count(*) from recipe_ingredients where amount=1;")).toBe("4");
  });
  it("preserves role and revoked-session guards and remains safe to reapply", () => {
    for (const role of ["anon", "authenticated"]) expect(() => create("g", role)).toThrow(/permission denied/);
    sql(manualGuard);
    sql("update user_session_generation_bindings set revoked_at=now();");
    expect(() => create("g")).toThrow(/ACCOUNT_SESSION_STALE/);
    expect(sql("select count(*) from recipes;")).toBe("4");
    expect(migration).toContain("and original.unit = item ->> 'unit'");
  });
});
