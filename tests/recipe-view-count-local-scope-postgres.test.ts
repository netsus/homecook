import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// An owned, disposable native PostgreSQL cluster, with TCP disabled. No existing
// database URL, Supabase environment, or full migration replay is accepted.
let root: string;
let bin: string;
let started = false;
let originalPolicies: string;
let originalScopeDefinition: string;
let originalFenceDefinition: string;
const isolatedEnv: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME, LANG: "C", NODE_ENV: "test" };
const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260927010000_recipe_view_count_local_scope.sql"), "utf8");
const recipeId = "00000000-0000-4000-8000-000000000001";
const counterQuery = `select view_count from public.increment_recipe_view_count('${recipeId}');`;

function run(command: string, args: string[], input?: string) {
  const result = spawnSync(command, args, { input, encoding: "utf8", env: isolatedEnv });
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr}`);
  return result.stdout.trim();
}

function sqlArgs() {
  return ["-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-h", root, "-p", "55440", "-U", "postgres", "-d", "postgres"];
}

function sql(query: string) {
  return run(join(bin, "psql"), sqlArgs(), query);
}

function request(query: string, options: { role?: string; scope?: string; method?: string; path?: string; claim?: string } = {}) {
  const { role = "service_role", scope = "recipe-view", method = "POST", path = "/rpc/increment_recipe_view_count", claim = role } = options;
  return `set role ${role};
    set request.jwt.claim.role = '${claim}';
    set request.headers = '${JSON.stringify({ "x-homecook-internal-scope": scope })}';
    set request.method = '${method}'; set request.path = '${path}';
    ${query}`;
}

function concurrentSql(query: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(join(bin, "psql"), sqlArgs(), { env: isolatedEnv });
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { error += chunk; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error)));
    child.stdin.end(query);
  });
}

function existingFunction(file: string, name: string) {
  const source = readFileSync(join(process.cwd(), "supabase/migrations", file), "utf8");
  const start = source.indexOf(`create or replace function ${name}(`);
  const end = source.indexOf("$function$;", start);
  if (start < 0 || end < 0) throw new Error(`Existing function missing: ${name}`);
  return source.slice(start, end + "$function$;".length);
}

const policies = () => sql(`select jsonb_build_object(
  'rls', (select relrowsecurity from pg_class where oid='public.recipes'::regclass),
  'policies', (select jsonb_agg(to_jsonb(policy)) from pg_policies policy where schemaname='public' and tablename='recipes')
);`);

beforeAll(() => {
  bin = run("pg_config", ["--bindir"]);
  root = mkdtempSync("/tmp/homecook-recipe-view-");
  run(join(bin, "initdb"), ["-D", join(root, "data"), "-U", "postgres", "-A", "trust", "--no-locale"]);
  run(join(bin, "pg_ctl"), ["-D", join(root, "data"), "-o", `-h '' -k ${root} -p 55440`, "-l", join(root, "postgres.log"), "-w", "start"]);
  started = true;
  sql(`
    create role anon nologin; create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth; create schema private; create schema recipe_visibility_guard;
    create function auth.role() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.role',true),'') $$;
    create table public.user_account_lifecycles(owner_uuid uuid, account_generation bigint, status text);
    create table public.account_generation_capability_state(singleton boolean, state text, current_cutover_attempt_id uuid);
    create table public.account_generation_cutover_attempts(id uuid, result_json jsonb);
    insert into public.account_generation_capability_state values(true,'generation_active',null);
    create table public.recipes(id uuid primary key, title text not null, view_count integer not null default 0,
      visibility text not null, deleted_at timestamptz, created_by uuid);
    insert into public.user_account_lifecycles values
      ('00000000-0000-4000-8000-000000000010',1,'active'),
      ('00000000-0000-4000-8000-000000000011',1,'active'),
      ('00000000-0000-4000-8000-000000000011',2,'cutover_quarantined');
    insert into public.recipes values
      ('${recipeId}','공개 레시피',10,'public',null,'00000000-0000-4000-8000-000000000010'),
      ('00000000-0000-4000-8000-000000000002','비공개',20,'private',null,null),
      ('00000000-0000-4000-8000-000000000003','삭제됨',30,'public',now(),null),
      ('00000000-0000-4000-8000-000000000004','격리 계정',40,'public',null,'00000000-0000-4000-8000-000000000011'),
      ('00000000-0000-4000-8000-000000000005','공유 레시피',50,'public',null,null);
    create function private.verify_full_local_internal_scope() returns void language plpgsql security definer
      set search_path=pg_catalog,public,private,pg_temp as $$
    begin
      if current_setting('request.headers',true)::jsonb ->> 'x-homecook-internal-scope' = 'recipe-save'
        and current_setting('request.method',true)='POST'
        and current_setting('request.path',true)='/rpc/save_recipe_to_books' then return; end if;
      raise exception 'predecessor denied request' using errcode='42501';
    end $$;
    revoke all on function private.verify_full_local_internal_scope() from public,anon,authenticated,service_role;
  `);
  // Reuse the actual owner-visibility and account-generation fence definitions;
  // only their small supporting tables are fixtures.
  sql(existingFunction("20260723170000_recipe_visibility_read_hardening.sql", "recipe_visibility_guard.is_owner_publicly_visible"));
  sql(existingFunction("20260723140000_account_session_generation_foundation.sql", "public.assert_legacy_account_generation_write"));
  sql(existingFunction("20260723140000_account_session_generation_foundation.sql", "public.enforce_legacy_personal_mutation_fence"));
  sql(`
    create trigger account_generation_legacy_mutation_fence before insert or update or delete on public.recipes
      for each row execute function public.enforce_legacy_personal_mutation_fence();
    alter table public.recipes enable row level security;
    create policy existing_public_read on public.recipes for select to anon,authenticated
      using(visibility='public' and deleted_at is null and recipe_visibility_guard.is_owner_publicly_visible(created_by));
    grant usage on schema public,auth,recipe_visibility_guard to anon,authenticated,service_role;
    grant select on public.recipes to anon,authenticated;
  `);
  originalPolicies = policies();
  originalScopeDefinition = sql("select pg_get_functiondef('private.verify_full_local_internal_scope()'::regprocedure);");
  originalFenceDefinition = sql("select pg_get_functiondef('public.enforce_legacy_personal_mutation_fence()'::regprocedure);");
  sql(migration);
}, 30000);

afterAll(() => {
  if (started) run(join(bin, "pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"]);
  if (root) rmSync(root, { recursive: true, force: true });
});

describe("recipe view count scoped migration on isolated PostgreSQL", () => {
  it("preserves existing RLS, account-generation fence and predecessor scope definition", () => {
    expect(policies()).toBe(originalPolicies);
    expect(sql("select pg_get_functiondef('public.enforce_legacy_personal_mutation_fence()'::regprocedure);")).toBe(originalFenceDefinition);
    expect(sql("select pg_get_functiondef('private.verify_full_local_internal_scope_pre_recipe_view()'::regprocedure);")
      .replace("verify_full_local_internal_scope_pre_recipe_view", "verify_full_local_internal_scope")).toBe(originalScopeDefinition);
    expect(() => sql(request("select private.verify_full_local_internal_scope();", { role: "postgres", scope: "recipe-save", path: "/rpc/save_recipe_to_books" }))).not.toThrow();
    expect(() => sql(request("select private.verify_full_local_internal_scope();", { role: "postgres", scope: "recipe-save", path: "/rpc/unknown" }))).toThrow(/predecessor denied request/);
    expect(() => sql(request("select private.verify_full_local_internal_scope();", { role: "postgres" }))).not.toThrow();
    for (const overrides of [{ method: "GET" }, { path: "/rpc/unknown" }, { scope: "" }]) {
      expect(() => sql(request("select private.verify_full_local_internal_scope();", { role: "postgres", ...overrides }))).toThrow(/predecessor denied request/);
    }
    expect(sql("set role anon; select count(*) from public.recipes;")).toBe("2");
  });

  it("grants execution only to service_role and never grants direct recipe mutation", () => {
    for (const role of ["anon", "authenticated"]) {
      expect(sql(`select has_function_privilege('${role}','public.increment_recipe_view_count(uuid)','execute');`)).toBe("f");
      expect(() => sql(request(counterQuery, { role, claim: "service_role" }))).toThrow(/42501/);
    }
    expect(sql("select has_function_privilege('service_role','public.increment_recipe_view_count(uuid)','execute');")).toBe("t");
    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(sql(`select has_table_privilege('${role}','public.recipes','update');`)).toBe("f");
      expect(sql(`select has_function_privilege('${role}','private.verify_full_local_internal_scope_pre_recipe_view()','execute');`)).toBe("f");
    }
  });

  it("rejects missing or mismatched claim, scope, method and path without changing the counter", () => {
    const before = sql(`select view_count from public.recipes where id='${recipeId}';`);
    for (const overrides of [
      { claim: "authenticated" }, { claim: "" }, { scope: "" }, { scope: "recipe-save" },
      { method: "GET" }, { method: "DELETE" }, { path: "/rpc/unknown" },
      { path: "/rpc/increment_recipe_view_count/extra" },
      { scope: "recipe-save", path: "/rpc/save_recipe_to_books" },
    ]) expect(() => sql(request(counterQuery, overrides))).toThrow(/42501/);
    expect(() => sql(`set role service_role; set request.jwt.claim.role='service_role'; ${counterQuery}`)).toThrow(/42501/);
    expect(sql(`select view_count from public.recipes where id='${recipeId}';`)).toBe(before);
  });

  it("atomically increments visible recipes while the generation fence still rejects content changes", () => {
    expect(sql(request(counterQuery))).toBe("11");
    expect(sql(request(counterQuery))).toBe("12");
    expect(sql(`select view_count from public.recipes where id='${recipeId}';`)).toBe("12");
    expect(sql(request("select view_count from public.increment_recipe_view_count('00000000-0000-4000-8000-000000000005');"))).toBe("51");
    expect(() => sql(`update public.recipes set title='forbidden',view_count=view_count+1 where id='${recipeId}';`)).toThrow(/55000/);
    expect(sql(`select title||':'||view_count from public.recipes where id='${recipeId}';`)).toBe("공개 레시피:12");
  });

  it("does not count private, deleted, quarantined or missing recipes", () => {
    for (const suffix of ["2", "3", "4", "9"]) {
      const id = `00000000-0000-4000-8000-00000000000${suffix}`;
      expect(sql(request(`select count(*) from public.increment_recipe_view_count('${id}');`))).toBe("0");
    }
    expect(sql("select string_agg(view_count::text,',' order by id) from public.recipes where id in ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004');")).toBe("20,30,40");
  });

  it("retains every concurrent increment and returns the stored counts", async () => {
    const before = Number(sql(`select view_count from public.recipes where id='${recipeId}';`));
    const counts = await Promise.all(Array.from({ length: 8 }, () => concurrentSql(request(counterQuery))));
    expect(counts.map(Number).sort((a, b) => a - b)).toEqual(Array.from({ length: 8 }, (_, index) => before + index + 1));
    expect(Number(sql(`select view_count from public.recipes where id='${recipeId}';`))).toBe(before + 8);
  });

  it("can reapply without replacing the preserved predecessor or widening policies", () => {
    sql(migration);
    expect(policies()).toBe(originalPolicies);
    expect(sql("select pg_get_functiondef('private.verify_full_local_internal_scope_pre_recipe_view()'::regprocedure);")
      .replace("verify_full_local_internal_scope_pre_recipe_view", "verify_full_local_internal_scope")).toBe(originalScopeDefinition);
    expect(() => sql(request(counterQuery, { scope: "recipe-save" }))).toThrow(/42501/);
  });
});
