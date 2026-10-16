import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Existing offline quantity context only; no CLI, PIN module, URL, key or service is opened.
const contextPath = process.env.HOMECOOK_YOUTUBE_QUANTITY_ISOLATED_CONTEXT;
const image = "public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a";
const tables = ["private.youtube_extraction_current_policy", "private.youtube_extraction_worker_credentials",
  "public.youtube_extraction_jobs", "public.youtube_extractor_permits"];
const env = { PATH: process.env.PATH, NODE_ENV: "test" as const, DOCKER_HOST: "unix:///var/run/docker.sock" };
const events: Array<Record<string, string | number | boolean>> = [];
let container = "", tag = "", claims = "", snapshot = "", originalRows = "", originalAuthority = "";
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const lockSql = (mode: "ACCESS EXCLUSIVE" | "SHARE ROW EXCLUSIVE") => tables.map(table => `LOCK TABLE ${table} IN ${mode} MODE;`).join("\n");

function assertOwned() {
  const result = spawnSync("docker", ["inspect", container], { env, encoding: "utf8", timeout: 10000 });
  expect(result.status, result.stderr).toBe(0);
  const [current] = JSON.parse(result.stdout);
  expect(current.Config.Labels["homecook.quantity-v4-test"]).toBe(tag);
  expect(current.Config.Labels["homecook.c04-activation-lock-test"]?.replaceAll("-", "")).toBe(tag);
  expect(current.Config.Image).toBe(image);
  expect(current.HostConfig.NetworkMode).toBe("none");
  expect(current.Mounts).toEqual([]);
  expect(current.HostConfig.PortBindings ?? {}).toEqual({});
}
function command(role: "supabase_admin" | "authenticator", applicationName: string) {
  assertOwned();
  return ["exec", "-i", "-e", `PGAPPNAME=${applicationName}`, container, "psql", "-h", "/tmp/pgsocket", "-U", role,
    "-d", "postgres", "-XqAt", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"];
}
function sql(statement: string, role: "supabase_admin" | "authenticator" = "supabase_admin") {
  return spawnSync("docker", command(role, `c04-lock-probe-${randomUUID()}`), { env, input: statement, encoding: "utf8", timeout: 15000 });
}
function value(statement: string) {
  const result = sql(statement); expect(result.status, result.stderr).toBe(0); return result.stdout.trim();
}
function session(role: "supabase_admin" | "authenticator" = "supabase_admin") {
  const child = spawn("docker", command(role, `c04-lock-session-${randomUUID()}`), { env, stdio: ["pipe", "pipe", "pipe"] });
  let output = "", errors = "", pending: { marker: string; resolve: (value: string) => void; reject: (error: Error) => void } | undefined;
  const closed = new Promise<number | null>(resolve => {
    child.once("error", error => { pending?.reject(error); resolve(null); });
    child.once("close", code => { pending?.reject(new Error(errors || "Owned SQL session closed")); resolve(code); });
  });
  child.stderr.on("data", bytes => { errors += bytes.toString(); });
  child.stdout.on("data", bytes => {
    output += bytes.toString();
    if (pending && output.includes(`${pending.marker}\n`)) {
      const current = pending, end = output.indexOf(`${current.marker}\n`);
      const result = output.slice(0, end).trim(); output = output.slice(end + current.marker.length + 1); pending = undefined; current.resolve(result);
    }
  });
  return {
    async query(statement: string) {
      assertOwned(); if (pending) throw new Error("Concurrent query on one session is prohibited");
      const marker = `c04_${randomUUID().replaceAll("-", "")}`;
      let timer: ReturnType<typeof setTimeout>;
      try {
        return await new Promise<string>((resolve, reject) => {
          pending = { marker, resolve, reject };
          timer = setTimeout(() => { child.kill(); reject(new Error("Owned session transport timeout")); }, 15000);
          child.stdin.write(`${statement}\nSELECT '${marker}';\n`);
        });
      } finally { clearTimeout(timer!); }
    },
    async close() { child.stdin.end(); const code = await closed; expect(code, errors).toBe(0); },
    stop() { child.kill(); },
  };
}
const rowSql = `SELECT encode(sha256(convert_to(jsonb_build_array(${tables.map(table =>
  `(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM ${table} t)`).join(",")})::text,'UTF8')),'hex');`;
const authoritySql = `SELECT encode(sha256(convert_to(jsonb_build_array(
 (SELECT jsonb_agg(jsonb_build_array(n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),pg_get_functiondef(p.oid),pg_get_userbyid(p.proowner),p.proacl,p.proconfig) ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f' AND (n.nspname='private' OR p.proname LIKE '%youtube%')),
 (SELECT jsonb_agg(jsonb_build_array(c.oid::regclass::text,pg_get_userbyid(c.relowner),c.relacl,c.relrowsecurity,c.relforcerowsecurity) ORDER BY c.oid) FROM pg_class c WHERE c.oid IN (${tables.map(table => `${literal(table)}::regclass`).join(",")})),
 (SELECT jsonb_agg(to_jsonb(r) ORDER BY rolname) FROM pg_roles r),
 (SELECT jsonb_agg(to_jsonb(m) ORDER BY roleid,member,grantor) FROM pg_auth_members m)
 )::text,'UTF8')),'hex');`;
const claimSql = () => `BEGIN; SET LOCAL ROLE youtube_extraction_worker; SET LOCAL request.jwt.claims=${literal(claims)};
 SET LOCAL request.method='POST'; SET LOCAL request.path='/rpc/claim_youtube_extraction_job';
 SELECT public.verify_full_local_postgrest_request_authority();
 SELECT public.claim_youtube_extraction_job('owned-activation-empty-poll',${literal(snapshot)},300)::text; COMMIT;`;
const mutations = ["enabled=enabled", "current_generation=current_generation", "status=status", "permit_generation=permit_generation"];

async function holding(mode: "ACCESS EXCLUSIVE" | "SHARE ROW EXCLUSIVE") {
  const current = session();
  try {
    await current.query(`BEGIN ISOLATION LEVEL SERIALIZABLE; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
      SET LOCAL idle_in_transaction_session_timeout='30s'; SELECT pg_advisory_xact_lock(86120317);
      SELECT singleton FROM private.recipe_product_only_write_control WHERE singleton FOR SHARE;
      SELECT singleton FROM private.cooked_batch_weight_evidence_control WHERE singleton FOR SHARE;
      SELECT singleton FROM private.quantity_input_v4_policy WHERE singleton FOR SHARE;
      ${lockSql(mode)}`);
    const pid = Number(await current.query("SELECT pg_backend_pid();"));
    expect(JSON.parse(value(`SELECT json_agg(json_build_array(n.nspname||'.'||c.relname,l.mode) ORDER BY n.nspname,c.relname)
      FROM pg_locks l JOIN pg_class c ON c.oid=l.relation JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE l.pid=${pid} AND l.relation IN (${tables.map(table => `${literal(table)}::regclass`).join(",")}) AND l.granted;`)))
      .toEqual([...tables].sort().map(table => [table, mode === "ACCESS EXCLUSIVE" ? "AccessExclusiveLock" : "ShareRowExclusiveLock"]));
    return current;
  } catch (error) {
    try { await current.query("ROLLBACK;"); await current.close(); } catch { current.stop(); }
    throw error;
  }
}

describe.skipIf(!contextPath)("C04 activation table locks on owned full-schema PostgreSQL", () => {
  beforeAll(() => {
    const context = JSON.parse(readFileSync(contextPath!, "utf8"));
    expect(context.container_id).toMatch(/^[a-f0-9]{64}$/u); expect(context.tag).toMatch(/^[a-f0-9]{32}$/u);
    container = context.container_id; tag = context.tag; assertOwned();
    expect(value("SELECT count(*) FROM homecook_deploy.migrations;")).toBe("227");
    expect(value("SELECT count(*) FROM public.youtube_extraction_jobs;")).toBe("0");
    expect(value("SELECT count(*) FROM public.youtube_extractor_permits WHERE owner_id IS NOT NULL;")).toBe("0");
    const credential = JSON.parse(value(`SELECT json_build_object('generation',current_generation,'jti_hash',current_jti_hash,
      'release_sha',release_sha,'schema_identity',schema_identity,'allowed_snapshot_digest',allowed_snapshot_digest,
      'exp',floor(extract(epoch FROM expires_at))) FROM private.youtube_extraction_worker_credentials WHERE credential_name='primary';`));
    expect(credential.generation).toBe(48); expect(credential.jti_hash).toBe("a".repeat(64)); expect(credential.release_sha).toBe("1".repeat(40));
    snapshot = credential.allowed_snapshot_digest;
    claims = JSON.stringify({ role: "youtube_extraction_worker", scope: "youtube-extraction-worker", iss: "https://worker.mumeok.kr",
      aud: "youtube-extraction", ...credential });
    const inherited = sql("SELECT current_user||':'||current_setting('statement_timeout')||':'||current_setting('lock_timeout');", "authenticator");
    expect(inherited.status, inherited.stderr).toBe(0); expect(inherited.stdout.trim()).toBe("authenticator:8s:8s");
    const baseline = sql(claimSql(), "authenticator"); expect(baseline.status, baseline.stderr).toBe(0);
    expect(JSON.parse(baseline.stdout.trim())).toEqual({ status: "empty", applied: false });
    originalRows = value(rowSql); originalAuthority = value(authoritySql);
  });
  afterAll(() => {
    if (!originalRows) return;
    expect(value(rowSql)).toBe(originalRows); expect(value(authoritySql)).toBe(originalAuthority);
    writeFileSync(join(dirname(contextPath!), "activation-lock-events.json"), JSON.stringify(events, null, 2), { mode: 0o600 });
  });

  it("reproduces the old ACCESS EXCLUSIVE empty-poll cancellation under inherited authenticator 8s", async () => {
    const lock = await holding("ACCESS EXCLUSIVE"), started = performance.now();
    try {
      const result = sql(claimSql(), "authenticator");
      expect(result.status).not.toBe(0); expect(result.stderr).toContain("57014"); expect(result.stderr).toContain("statement timeout");
      const elapsedMs = performance.now() - started; expect(elapsedMs).toBeGreaterThanOrEqual(7900); expect(elapsedMs).toBeLessThan(12000);
      events.push({ case: "old-exclusive", elapsedMs, sqlstate: "57014" });
    } finally { await lock.query("ROLLBACK;"); await lock.close(); }
    expect(value(rowSql)).toBe(originalRows);
  }, 20000);

  it("keeps the same real worker session returning empty for longer than 8s under SHARE ROW EXCLUSIVE", async () => {
    const lock = await holding("SHARE ROW EXCLUSIVE"), worker = session("authenticator"), started = performance.now();
    try {
      const pid = await worker.query("SELECT pg_backend_pid();");
      for (let n = 0; n < 4; n++) {
        const poll = performance.now(), result = await worker.query(claimSql());
        expect(JSON.parse(result)).toEqual({ status: "empty", applied: false });
        expect(performance.now() - poll).toBeLessThan(8000);
        if (n !== 3) await delay(3000);
      }
      expect(await worker.query("SELECT pg_backend_pid();")).toBe(pid);
      const elapsedMs = performance.now() - started; expect(elapsedMs).toBeGreaterThan(8000);
      events.push({ case: "activation-shared-exclusive", elapsedMs, realEmptyClaims: 4, sameWorkerSession: true });
      await lock.query("COMMIT;"); expect(value(rowSql)).toBe(originalRows);
    } finally { await Promise.all([worker.close(), lock.close()]); }
  }, 20000);

  it.each(tables)("blocks permitted DML on %s with 55P03, then permits the zero-row write after commit", async table => {
    const index = tables.indexOf(table), mutation = `UPDATE ${table} SET ${mutations[index]} WHERE false;`;
    expect(value(`SELECT has_table_privilege('supabase_admin',${literal(table)},'UPDATE');`)).toBe("t");
    const lock = await holding("SHARE ROW EXCLUSIVE");
    try {
      const blocked = sql(`BEGIN; SET LOCAL lock_timeout='200ms'; SET LOCAL statement_timeout='8s'; ${mutation} COMMIT;`);
      expect(blocked.status).not.toBe(0); expect(blocked.stderr).toContain("55P03"); expect(blocked.stderr).not.toContain("42501");
      await lock.query("COMMIT;");
      const allowed = sql(`BEGIN; ${mutation} COMMIT;`); expect(allowed.status, allowed.stderr).toBe(0);
      expect(value(rowSql)).toBe(originalRows); events.push({ case: "concurrent-dml", table, sqlstate: "55P03", postCommitAllowed: true });
    } finally { await lock.close(); }
  });

  it("fails within the original 5s lock budget behind ROW EXCLUSIVE and rolls back earlier acquired locks", async () => {
    const other = session();
    try {
      await other.query("BEGIN; LOCK TABLE public.youtube_extractor_permits IN ROW EXCLUSIVE MODE;");
      const started = performance.now();
      const contender = sql(`BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
        \\set ON_ERROR_STOP off
        ${lockSql("SHARE ROW EXCLUSIVE")}
        ROLLBACK;
        \\set ON_ERROR_STOP on
        SELECT 'ROLLED_BACK';`);
      expect(contender.status, contender.stderr).toBe(0); expect(contender.stderr).toContain("55P03");
      expect(contender.stdout.trim()).toBe("ROLLED_BACK");
      const elapsedMs = performance.now() - started; expect(elapsedMs).toBeGreaterThanOrEqual(4900); expect(elapsedMs).toBeLessThan(8000);
      const probe = session();
      try {
        await probe.query(`BEGIN; SET LOCAL lock_timeout='200ms'; ${tables.slice(0, -1)
          .map(table => `LOCK TABLE ${table} IN SHARE ROW EXCLUSIVE MODE;`).join("\n")} ROLLBACK;`);
      }
      finally { await probe.close(); }
      expect(value(rowSql)).toBe(originalRows); events.push({ case: "acquire-contention", elapsedMs, sqlstate: "55P03", rollback: true });
    } finally { await other.query("ROLLBACK;"); await other.close(); }
  }, 12000);
});
