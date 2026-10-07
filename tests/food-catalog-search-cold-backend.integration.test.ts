import { spawnSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const project = process.env.HOMECOOK_ISOLATED_RUNTIME_PROJECT_ID;
const db = `supabase_db_${project}`;
const signature = "public.search_food_catalog_ranked(uuid,text,text[],text,integer,jsonb,text,integer)";
const owner = "8c000000-0000-4000-8000-000000000001";
const sql = readFileSync("supabase/migrations/20260922040000_food_catalog_search_candidates.sql", "utf8")
  .replace(/^begin;\s*/u, "").replace(/commit;\s*$/u, "");
let restName: string | undefined;
let privateDir: string | undefined;
let originalPassword: string | null | undefined;
let origin = "";
let token = "";

function psql(query: string, role = "supabase_admin") {
  const result = spawnSync("docker", ["exec", "-i", db, "psql", "-X", "-U", role,
    "-d", "postgres", "-Atq", "-v", "ON_ERROR_STOP=1"], {
    input: query, encoding: "utf8", timeout: 30_000,
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

async function rpc(name: string, body: Record<string, unknown>) {
  const response = await fetch(`${origin}/rpc/${name}`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, before: response.headers.get("x-hcg-pg-trgm-before"),
    backend: response.headers.get("x-hcg-backend"), data: await response.json() };
}

// Runs after the candidate fixture suite and only on its runner-owned hcg DB.
// The isolated pre-request records coldness; it never warms pg_trgm or changes
// the real search RPC's owner/grants. No production credentials are read.
describe.skipIf(!project).sequential("search on fresh non-superuser PostgreSQL and HTTP backends", () => {
  beforeAll(() => {
    expect(project).toMatch(/^hcg_\d+_[a-f0-9]{6}$/u);
    const result = spawnSync("docker", ["inspect", db], { encoding: "utf8" });
    expect(result.status).toBe(0);
    const [state] = JSON.parse(result.stdout);
    expect(state.Name).toBe(`/${db}`);
    expect(state.Config.Labels["com.docker.compose.project"]).toBe(project);
  });

  afterAll(() => {
    if (restName) {
      const inspected = spawnSync("docker", ["inspect", restName], { encoding: "utf8" });
      if (inspected.status === 0) {
        const [state] = JSON.parse(inspected.stdout);
        expect(state.Config.Labels["homecook.test.project"]).toBe(project);
        spawnSync("docker", ["rm", "--force", restName], { encoding: "utf8" });
      }
    }
    if (originalPassword !== undefined) psql(`alter role authenticator password ${originalPassword === null ? "null" : `'${originalPassword.replaceAll("'", "''")}'`};`);
    if (privateDir) rmSync(privateDir, { recursive: true, force: true });
  });

  it("registers USERSET before cold DDL without granting privileges or making postgres superuser", () => {
    const definition = JSON.parse(psql(`select to_json(pg_get_functiondef('${signature}'::regprocedure));`)) as string;
    const withoutSetting = definition.replace(/^ SET "?pg_trgm\.word_similarity_threshold"? TO '0\.3'\n/mu, "");
    const result = JSON.parse(psql(`begin;
      ${withoutSetting};
      do $cold$
      begin
        if (select rolsuper from pg_roles where rolname=current_user) then raise exception 'test actor is superuser'; end if;
        if exists(select 1 from pg_settings where name like 'pg_trgm.%') then raise exception 'DDL backend already warm'; end if;
        begin
          alter function ${signature} set pg_trgm.word_similarity_threshold='0.3';
          raise exception 'unregistered DDL unexpectedly accepted';
        exception when insufficient_privilege then null;
        end;
      end $cold$;
      ${sql}
      select jsonb_build_object('role',current_user,'superuser',(select rolsuper from pg_roles where rolname=current_user),
        'context',(select context from pg_settings where name='pg_trgm.word_similarity_threshold'),
        'setting_present',(select 'pg_trgm.word_similarity_threshold=0.3'=any(proconfig) from pg_proc where oid='${signature}'::regprocedure));
      rollback;`, "postgres"));
    expect(result).toEqual({ role: "postgres", superuser: false, context: "user", setting_present: true });
  });

  it("serves the first real search RPC on a cold HTTP backend and restores normal/error caller settings", async () => {
    const [database] = JSON.parse(spawnSync("docker", ["inspect", db], { encoding: "utf8" }).stdout);
    const networks = Object.keys(database.NetworkSettings.Networks);
    expect(networks).toHaveLength(1);
    psql(`
      create function public.hcg_search_cold_context() returns void language plpgsql as $probe$
      begin
        perform set_config('response.headers',jsonb_build_array(
          jsonb_build_object('X-HCG-Pg-Trgm-Before',(select count(*)::text from pg_settings where name like 'pg_trgm.%')),
          jsonb_build_object('X-HCG-Backend',pg_backend_pid()::text))::text,true);
      end $probe$;
      create function public.hcg_search_threshold_probe(p_fail boolean default false) returns jsonb language plpgsql stable as $probe$
      declare result jsonb; failure text;
      begin
        perform set_config('pg_trgm.word_similarity_threshold','0.95',true);
        begin
          result:=public.search_food_catalog_ranked('${owner}','곰곰 치즈',array['food_product'],null,null,null,repeat('a',64),case when p_fail then 0 else 20 end);
        exception when others then failure:=sqlerrm;
        end;
        return jsonb_build_object('threshold',current_setting('pg_trgm.word_similarity_threshold'),
          'failure',failure,'items',jsonb_array_length(result->'items'));
      end $probe$;
      revoke all on function public.hcg_search_cold_context(),public.hcg_search_threshold_probe(boolean) from public;
      grant execute on function public.hcg_search_cold_context(),public.hcg_search_threshold_probe(boolean) to service_role;
    `);
    originalPassword = JSON.parse(psql("select to_json(rolpassword) from pg_authid where rolname='authenticator';"));
    const password = randomBytes(24).toString("hex"), secret = randomBytes(32).toString("hex");
    psql(`alter role authenticator password '${password}';`);
    privateDir = mkdtempSync(join(tmpdir(), "hcg-search-cold-"));
    const envPath = join(privateDir, "postgrest.env");
    writeFileSync(envPath, [
      `PGRST_DB_URI=postgresql://authenticator:${password}@${db}:5432/postgres`,
      "PGRST_DB_ANON_ROLE=anon", "PGRST_DB_SCHEMAS=public", `PGRST_JWT_SECRET=${secret}`,
      "PGRST_DB_POOL=1", "PGRST_DB_CONFIG=false", "PGRST_DB_PRE_REQUEST=public.hcg_search_cold_context",
      "PGRST_SERVER_HOST=0.0.0.0", "PGRST_SERVER_PORT=3000",
    ].join("\n"), { mode: 0o600 });
    const header = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url");
    const payload = Buffer.from(JSON.stringify({ role: "service_role", exp: Math.floor(Date.now()/1000)+600 })).toString("base64url");
    token = `${header}.${payload}.${createHmac("sha256",secret).update(`${header}.${payload}`).digest("base64url")}`;
    restName = `hcg-search-cold-${project}`;
    const started = spawnSync("docker", ["run", "--platform", "linux/arm64", "--detach", "--name", restName,
      "--label", `homecook.test.project=${project}`, "--network", networks[0], "--publish", "127.0.0.1::3000",
      "--env-file", envPath, "postgrest/postgrest@sha256:844785450d6b046ee97f1c67ea37e3ff6b4ed7ee3570b1b91c03f66f032c4805"],
    { encoding: "utf8", timeout: 30_000 });
    expect(started.status, started.stderr).toBe(0);
    const [rest] = JSON.parse(spawnSync("docker", ["inspect", restName], { encoding: "utf8" }).stdout);
    expect(rest.Config.Labels["homecook.test.project"]).toBe(project);
    origin = `http://127.0.0.1:${rest.NetworkSettings.Ports["3000/tcp"][0].HostPort}`;
    let ready = false;
    for (let i=0;i<40;i+=1) {
      try { await fetch(origin,{signal:AbortSignal.timeout(500)}); ready=true; break; }
      catch { await new Promise(resolve=>setTimeout(resolve,250)); }
    }
    expect(ready).toBe(true);
    const first = await rpc("search_food_catalog_ranked", { p_actor_id: owner, p_query: "곰곰 치즈",
      p_types: ["food_product"], p_source: null, p_cursor_version: null, p_cursor: null,
      p_query_fingerprint: "a".repeat(64), p_limit: 20 });
    expect(first.before).toBe("0");
    expect(first.status, JSON.stringify(first.data)).toBe(200);
    expect(first.data.items).toHaveLength(2);
    const normal = await rpc("hcg_search_threshold_probe", { p_fail: false });
    expect(normal.backend).toBe(first.backend);
    expect(normal.status).toBe(200);
    expect(normal.data).toEqual({ threshold: "0.95", failure: null, items: 2 });
    const failed = await rpc("hcg_search_threshold_probe", { p_fail: true });
    expect(failed.backend).toBe(first.backend);
    expect(failed.status).toBe(200);
    expect(failed.data).toEqual({ threshold: "0.95", failure: "INVALID_SEARCH_FILTER", items: null });
  }, 45_000);
});
