import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.HOMECOOK_RECIPE_REQUEST_ROLE_NATIVE === "1";
const image = "public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a";
const label = "homecook.recipe-request-role-native";
const id = randomUUID();
const output = enabled ? mkdtempSync("/tmp/recipe-request-role-native-") : "";
const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, NODE_ENV: "test", DOCKER_HOST: "unix:///var/run/docker.sock" };
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
const paths = ["read_recipe_future_patch_result", "write_recipe_future_plan_change_recoverable"];
const correction = "supabase/migrations/20261015100000_recipe_future_request_role.sql";
let cid = "";
const evidence: Record<string, unknown> = { id, image, label, pid: process.pid, output, source: "schema-only-228 plus unchanged229/230/231", productionAccess: false };
const scopeMetadata = `select jsonb_build_object('definitionSha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
  'sourceHash',md5(btrim(p.prosrc,chr(10))),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'configuration',p.proconfig,
  'securityDefiner',p.prosecdef,'volatility',p.provolatile,'arguments',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid))
  from pg_proc p where oid='private.verify_full_local_internal_scope()'::regprocedure;`;
const untouchedMetadata = `select md5(jsonb_build_array(
  (select jsonb_agg(to_jsonb(p) order by p.oid) from pg_proc p where p.oid<>'private.verify_full_local_internal_scope()'::regprocedure),
  (select jsonb_agg(to_jsonb(c) order by c.oid) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth')),
  (select jsonb_agg(to_jsonb(a) order by a.attrelid,a.attnum) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','auth')),
  (select jsonb_agg(to_jsonb(k) order by k.oid) from pg_constraint k),
  (select jsonb_agg(to_jsonb(p) order by p.oid) from pg_policy p),
  (select jsonb_agg(to_jsonb(n) order by n.oid) from pg_namespace n where n.nspname in ('public','private','auth')),
  (select jsonb_agg(to_jsonb(r) order by r.oid) from pg_roles r))::text);`;

function command(args: string[], input?: string | Buffer) {
  const result = spawnSync("docker", args, { env, input, encoding: "utf8", timeout: 120000, maxBuffer: 40 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(result.stderr || `docker exit ${result.status}`);
  return result.stdout.trim();
}
function own() {
  expect(cid).toMatch(/^[a-f0-9]{64}$/);
  const state = JSON.parse(command(["inspect", cid]))[0];
  expect(state.Config.Labels[label]).toBe(id);
  expect(state.Config.Image).toBe(image);
  expect(state.HostConfig.NetworkMode).toBe("none");
  expect(state.HostConfig.PortBindings).toEqual({});
  expect(state.Mounts).toEqual([]);
}
function sql(statement: string) {
  own();
  return command(["exec", "-i", cid, "psql", "-h", "/tmp/pgsocket", "-U", "supabase_admin", "-d", "postgres", "-XAtq", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"], statement);
}
function request(path: string, claims: Record<string, string>, role: string, legacy?: string, scope = "recipe-future-propagation", method = "POST") {
  return JSON.parse(sql(`begin;${legacy === undefined ? "" : `set local request.jwt.claim.role=${literal(legacy)};`}
    set local request.jwt.claims=${literal(JSON.stringify(claims))};
    set local request.headers=${literal(JSON.stringify({ "x-homecook-internal-scope": scope }))};
    set local request.method=${literal(method)};set local request.path=${literal(`/rpc/${path}`)};
    set local role ${role};select jsonb_build_object('jwtRole',auth.role(),'databaseRole',current_setting('role',true),
      'legacyClaimRole',current_setting('request.jwt.claim.role',true));
    select public.verify_full_local_postgrest_request_authority();rollback;`).split("\n")[0]);
}

describe.skipIf(!enabled)("recipe future PostgREST request role on an owned empty DB231", () => {
  beforeAll(async () => {
    const archive = readFileSync("/tmp/mumeok-weight-attestation-native-228-schema-only.dump");
    const roles = readFileSync("/var/folders/3z/y96spzj121b8vg6xflzxfyww0000gn/T/mumeok-attestation-schema-only-9ow1xrnm/current-roles.sql", "utf8");
    expect(hash(archive)).toBe("b92a1bc300f66f533c95fc3d05f09aa31e7d88a076cb62d56c4516c592e31ca0");
    expect(hash(roles)).toBe("a37b43865c14194ab8aae8758c7f596679cc50e93f425d0af52767f54b9145d3");
    expect(roles).not.toMatch(/\bPASSWORD\s+[^;]+/i);
    cid = command(["run", "--platform", "linux/arm64", "--pull=never", "--detach", "--network", "none", "--user", "postgres", "--label", `${label}=${id}`,
      "--name", `recipe-request-role-${id}`, "--entrypoint", "bash", image, "-lc",
      "mkdir -p /tmp/pgsocket /tmp/role-pg; initdb -D /tmp/role-pg -U supabase_admin --locale-provider=icu --icu-locale=en-US --locale=en_US.UTF-8 --auth-local=trust --auth-host=reject >/tmp/init.log; exec postgres -D /tmp/role-pg -c listen_addresses= -c unix_socket_directories=/tmp/pgsocket -c timezone=UTC -c shared_preload_libraries=pg_stat_statements,supabase_vault"]);
    evidence.cid = cid;
    for (let attempt = 0; ; attempt++) {
      try { sql("select 1;"); break; } catch (error) { if (attempt === 30) throw error; await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    sql(roles.replace(/^CREATE ROLE supabase_admin;\n/m, ""));
    own();
    command(["exec", "-i", cid, "pg_restore", "-h", "/tmp/pgsocket", "-U", "supabase_admin", "-d", "postgres", "--schema-only", "--clean", "--if-exists", "--exit-on-error"], archive);
    const migrations = [
      ["20261014225000_recipe_nutrition_quantity_v4_warning_contract.sql", "a03d44504bc0c318bbcc399c9ef563d2cdcd7adc79ebdb0314846b981fd89bdd"],
      ["20261014225200_recipe_snapshot_reason_identity.sql", "b6050c12e60594267908b89ff02cff0c0344a52ccb79dc9a88d21e3c57e8fe66"],
      ["20261014225300_recipe_future_patch_http_replay.sql", "aed773e0d27e6b6dd4af8e65fb933d73c89927faef1d1d36804eec8476fed9c7"],
    ];
    for (const [name, sha256] of migrations) {
      const bytes = readFileSync(`supabase/migrations/${name}`);
      expect(hash(bytes)).toBe(sha256);
      sql("set session authorization postgres;" + bytes.toString());
    }
    evidence.emptyTables = JSON.parse(sql(`create temporary table row_counts(n bigint);do $count$ declare t record;n bigint;begin
      for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p')
        and n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg_%'
        and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e') loop
        execute format('select count(*) from %I.%I',t.nspname,t.relname) into n;insert into row_counts values(n);end loop;end $count$;
      select jsonb_build_object('tables',count(*),'rows',sum(n)) from row_counts;`));
    expect(evidence.emptyTables).toEqual({ tables: 153, rows: 0 });
    evidence.untouchedBefore = sql(untouchedMetadata);
    evidence.outer231 = JSON.parse(sql(scopeMetadata));
    expect(evidence.outer231).toEqual({ definitionSha256: "59cd9173efa0be26485d26e8c94ff49b816459c6f915b8bf41ade64838526ee4",
      sourceHash: "cdba05648213ef145555dfc02fd234c8", owner: "postgres", acl: ["postgres=X/postgres"], configuration: ["search_path=pg_catalog, public, private, pg_temp"],
      securityDefiner: true, volatility: "v", arguments: "", result: "void" });
  }, 120000);

  afterAll(() => {
    if (cid) {
      own(); command(["rm", "-f", "-v", cid]);
      expect(() => command(["inspect", cid])).toThrow(/No such object/);
      evidence.resourcesRemoved = true;
    }
    if (enabled) { writeFileSync(join(output, "report.json"), JSON.stringify(evidence, null, 2) + "\n"); process.stdout.write(`OWNED_ROLE_NATIVE_REPORT=${join(output, "report.json")}\n`); }
  });

  it("reproduces current231 legacy-absent failure through the real pre-request dispatcher", () => {
    const failures = [];
    for (const path of paths) {
      let message = "";
      try { request(path, { role: "service_role" }, "service_role"); } catch (error) { message = error instanceof Error ? error.message : String(error); }
      expect(message).toMatch(/55000: ACCOUNT_SESSION_STALE/);
      failures.push({ path, message });
      expect(() => request(path, { role: "service_role" }, "service_role", "service_role")).not.toThrow();
    }
    evidence.redErrors = failures;
    evidence.reproduced231 = true;
  });

  it("admits the same JSON-claims-only service request after the correction", () => {
    const bytes = readFileSync(correction, "utf8");
    sql("set session authorization postgres;" + bytes);
    evidence.correctionSha256 = hash(bytes);
    for (const path of paths) expect(request(path, { role: "service_role" }, "service_role")).toEqual({
      jwtRole: "service_role", databaseRole: "service_role", legacyClaimRole: null,
    });
    evidence.outer232 = JSON.parse(sql(scopeMetadata));
    expect(evidence.outer232).toMatchObject({ owner: "postgres", acl: ["postgres=X/postgres"],
      configuration: ["search_path=pg_catalog, public, private, pg_temp"], securityDefiner: true, volatility: "v", arguments: "", result: "void" });
  });

  it("keeps anonymous, authenticated, missing and contradictory JWT claims denied", () => {
    for (const path of paths) {
      for (const role of ["anon", "authenticated"]) expect(() => request(path, { role }, role)).toThrow();
      expect(() => request(path, {}, "service_role")).toThrow();
      expect(() => request(path, { role: "authenticated" }, "service_role")).toThrow();
      expect(() => request(path, { role: "service_role" }, "service_role", "authenticated")).toThrow(/ACCOUNT_SESSION_STALE/);
    }
  });

  it("keeps exact scope, method and path fences and existing preview admission", () => {
    expect(() => request(paths[0], { role: "service_role" }, "service_role", "", "")).toThrow(/ACCOUNT_SESSION_STALE/);
    expect(() => request(paths[0], { role: "service_role" }, "service_role", "", "recipe-save")).toThrow(/ACCOUNT_SESSION_STALE/);
    expect(() => request(paths[0], { role: "service_role" }, "service_role", "", "recipe-future-propagation", "GET")).toThrow(/ACCOUNT_SESSION_STALE/);
    expect(() => request("read_recipe_future_patch_result_extra", { role: "service_role" }, "service_role")).toThrow(/ACCOUNT_SESSION_STALE/);
    expect(() => request("preview_recipe_future_plan_impact", { role: "service_role" }, "service_role")).not.toThrow();
    evidence.untouchedAfter = sql(untouchedMetadata);
    expect(evidence.untouchedAfter).toBe(evidence.untouchedBefore);
    expect(() => sql("set session authorization postgres;" + readFileSync(correction, "utf8"))).toThrow(/RECIPE_FUTURE_REQUEST_ROLE_PREIMAGE_MISMATCH/);
  });
});
