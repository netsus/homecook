#!/usr/bin/env node
// Restores an existing, hash-pinned schema-only native fixture. No live DB input.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildRecipeProductSourceFunctionInventorySql, assertRecipeProductSourceFunctionInventoryResult } from "./lib/full-local-security-inventory.mjs";
import { readPinnedLocalDockerTarget } from "./lib/local-supabase-isolated-runtime.mjs";

const image = "public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a";
const hash = value => createHash("sha256").update(value).digest("hex");
const tag = randomBytes(16).toString("hex");
const env = Object.fromEntries(["PATH", "LANG", "LC_ALL", "TMPDIR"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
const run = (file, args, input) => spawnSync(file, args, { env, input, encoding: "utf8", timeout: 60_000, maxBuffer: 12 * 1024 * 1024 });
const required = (args, input) => { const r = run("docker", args, input); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
let container;
const report = { schema: "homecook.cooking-experience.schema232-regression.v1", runId: tag, status: "RUNNING", network: "none", productionConnections: 0, applicationDataRestored: false, migrations: [], tests: [] };
const reportPath = "/tmp/homecook-cooking-schema232-report.json";
writeFileSync(reportPath, JSON.stringify(report, null, 2));
const catalogSql = `select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'schema',n.nspname,'oid',p.oid,'owner',pg_get_userbyid(p.proowner),
 'body',md5(btrim(p.prosrc,chr(10))),'definition',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'security',p.prosecdef,'volatility',p.provolatile,'configuration',p.proconfig,
 'acl',coalesce((select string_agg((case when a.grantee=0 then 'public' else r.rolname end)||':'||a.privilege_type||':'||a.is_grantable::text,',' order by a.grantee,a.privilege_type) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a left join pg_roles r on r.oid=a.grantee where a.grantee<>p.proowner),'')) order by n.nspname,p.proname,p.oid)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private') and p.prokind='f' and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e');`;
try {
  assert.equal(process.argv.length, 2, "No target or connection arguments accepted");
  const archive = readFileSync("/tmp/mumeok-weight-attestation-native-228-schema-only.dump");
  const roles = readFileSync("/var/folders/3z/y96spzj121b8vg6xflzxfyww0000gn/T/mumeok-attestation-schema-only-9ow1xrnm/current-roles.sql", "utf8");
  assert.equal(hash(archive), "b92a1bc300f66f533c95fc3d05f09aa31e7d88a076cb62d56c4516c592e31ca0");
  assert.equal(hash(roles), "a37b43865c14194ab8aae8758c7f596679cc50e93f425d0af52767f54b9145d3");
  assert.doesNotMatch(roles, /\bPASSWORD\s+[^;]+/iu);
  report.archiveSha256 = hash(archive);
  env.DOCKER_HOST = readPinnedLocalDockerTarget().docker_host;
  const expectedImage = required(["image", "inspect", "--format", "{{.Id}}", image]);
  container = required(["run", "--detach", "--pull=never", "--network", "none", "--user", "postgres", "--name", `hc-cooking232-${tag}`, "--label", `homecook.cooked-weight-test=${tag}`, "--entrypoint", "/bin/sh", image, "-c", "exec sleep infinity"]);
  report.ownedContainerId = container;
  assert.match(container, /^[a-f0-9]{64}$/u);
  const own = () => assert.equal(required(["inspect", "--format", '{{.Image}}|{{.HostConfig.NetworkMode}}|{{len .Mounts}}|{{len .HostConfig.PortBindings}}|{{index .Config.Labels "homecook.cooked-weight-test"}}', container]), `${expectedImage}|none|0|0|${tag}`);
  own();
  const exec = (args, input) => { own(); return required(["exec", "-i", container, ...args], input); };
  exec(["mkdir", "-m", "700", "-p", "/tmp/pgsocket"]);
  exec(["initdb", "-D", "/tmp/cooking-pg", "-U", "supabase_admin", "--auth-local=trust", "--auth-host=reject", "--locale-provider=icu", "--icu-locale=en-US", "--locale=en_US.UTF-8"]);
  exec(["pg_ctl", "-D", "/tmp/cooking-pg", "-o", "-h '' -k /tmp/pgsocket -c timezone=UTC -c shared_preload_libraries=pg_stat_statements,supabase_vault", "-l", "/tmp/cooking-pg.log", "-w", "start"]);
  const sql = (input, user = "postgres", database = "postgres") => exec(["psql", "-h", "/tmp/pgsocket", "-U", user, "-d", database, "-XqAt", "-v", "ON_ERROR_STOP=1"], input);
  const toc = exec(["pg_restore", "--list"], archive);
  assert.doesNotMatch(toc, /\b(?:TABLE DATA|SEQUENCE SET|BLOB DATA)\b/u);
  sql(roles.replace(/^CREATE ROLE supabase_admin;\n/mu, ""), "supabase_admin");
  exec(["pg_restore", "-h", "/tmp/pgsocket", "-U", "supabase_admin", "-d", "postgres", "--schema-only", "--clean", "--if-exists", "--exit-on-error"], archive);
  const counts = JSON.parse(sql(`create temp table counts(n bigint);do $$ declare t record;n bigint;begin for t in select ns.nspname,c.relname from pg_class c join pg_namespace ns on ns.oid=c.relnamespace where c.relkind in('r','p') and ns.nspname not like 'pg_%' and ns.nspname<>'information_schema' and not exists(select 1 from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e') loop execute format('select count(*) from %I.%I',t.nspname,t.relname) into n;insert into counts values(n);end loop;end$$;select jsonb_build_object('tables',count(*),'rows',sum(n)) from counts;`, "supabase_admin"));
  assert.equal(counts.tables, 153); assert.equal(counts.rows, 0); report.beforeSeed = counts;
  const files = readdirSync("supabase/migrations").filter(name => name.endsWith(".sql")).sort();
  const later = files.slice(228, 232);
  assert.deepEqual(later, ["20261014225000_recipe_nutrition_quantity_v4_warning_contract.sql", "20261014225200_recipe_snapshot_reason_identity.sql", "20261014225300_recipe_future_patch_http_replay.sql", "20261015100000_recipe_future_request_role.sql"]);
  const legacyHashes = ["a03d44504bc0c318bbcc399c9ef563d2cdcd7adc79ebdb0314846b981fd89bdd", "b6050c12e60594267908b89ff02cff0c0344a52ccb79dc9a88d21e3c57e8fe66", "aed773e0d27e6b6dd4af8e65fb933d73c89927faef1d1d36804eec8476fed9c7", "2322ccf737382e9738aa2c3d5cb50531c769c1a7902e2f621c8d378f9ce1505e"];
  for (const [index, filename] of later.entries()) { const bytes = readFileSync(path.join("supabase/migrations", filename)); assert.equal(hash(bytes), legacyHashes[index]); sql(bytes.toString()); report.migrations.push({ filename, sha256: hash(bytes) }); }
  const flags = { includeCookedWeightEvidenceFunctions: true, includeQuantityInputV4Functions: true, includeCookedWeightAttestationFunctions: true, includeRecipeSaveRecoveryFunctions: true, includeRecipeRequestRoleFunctions: true };
  report.pre232SourceInventory = assertRecipeProductSourceFunctionInventoryResult(JSON.parse(sql(buildRecipeProductSourceFunctionInventorySql(flags))), flags);
  const before = JSON.parse(sql(catalogSql));
  writeFileSync("/tmp/homecook-cooking232-functions-before.json", JSON.stringify(before, null, 2));
  // Execute the real new bodies in a transaction which fails after DDL. The
  // files themselves and their committed migration identities are not edited.
  const newFiles = files.slice(232);
  assert.deepEqual(newFiles, ["20261017210000_cooked_weight_mass_fallback.sql", "20261017220000_cooking_execution_quantities.sql"]);
  const payloads = newFiles.map(filename => {
    const bytes = readFileSync(path.join("supabase/migrations", filename), "utf8");
    assert.equal((bytes.match(/^begin;$/gmu) ?? []).length, 1);
    assert.equal((bytes.match(/^commit;$/gmu) ?? []).length, 1);
    return bytes.replace(/^begin;$/mu, "").replace(/^commit;$/mu, "");
  });
  for (const count of [1, 2]) {
    own();
    const failed = run("docker", ["exec", "-i", container, "psql", "-h", "/tmp/pgsocket", "-U", "postgres", "-d", "postgres", "-XqAt", "-v", "ON_ERROR_STOP=1"], `begin;${payloads.slice(0, count).join("\n")}select 1/0;commit;`);
    assert.notEqual(failed.status, 0); assert.match(failed.stderr, /division by zero/u);
    assert.deepEqual(JSON.parse(sql(catalogSql)), before);
    assert.equal(sql("select to_regclass('private.cooking_execution_quantities') is null;"), "t");
  }
  report.actualDdlRollback = { after233: true, after234: true, fullFunctionCatalogUnchanged: true };
  // This tests a disconnect after COMMIT and readback without redispatch.
  // COMMIT itself is acknowledged; this is not a lost-COMMIT-ACK simulation.
  exec(["createdb", "-h", "/tmp/pgsocket", "-U", "supabase_admin", "-T", "postgres", "cooking_ack_fixture"]);
  own();
  const ack = run("docker", ["exec", "-i", container, "psql", "-h", "/tmp/pgsocket", "-U", "postgres", "-d", "cooking_ack_fixture", "-XqAt", "-v", "ON_ERROR_STOP=1"], `begin;${payloads.join("\n")}commit;select pg_terminate_backend(pg_backend_pid());`);
  assert.notEqual(ack.status, 0);
  assert.match(ack.stderr, /terminating connection|server closed the connection/u);
  const recovered = JSON.parse(sql(catalogSql, "postgres", "cooking_ack_fixture"));
  assert.equal(recovered.length, before.length + 6);
  assert.equal(sql("select to_regclass('private.cooking_execution_quantities') is not null;", "postgres", "cooking_ack_fixture"), "t");
  assert.deepEqual(JSON.parse(sql(catalogSql)), before);
  report.postCommitDisconnectReadback = { committedCopyDetected: true, migrationRedispatched: false, source232Unchanged: true, lostCommitAckSimulated: false };
  exec(["dropdb", "-h", "/tmp/pgsocket", "-U", "supabase_admin", "cooking_ack_fixture"]);
  for (const filename of files.slice(232)) { const bytes = readFileSync(path.join("supabase/migrations", filename)); sql(bytes.toString()); report.migrations.push({ filename, sha256: hash(bytes) }); }
  const after = JSON.parse(sql(catalogSql));
  const old = new Map(before.map(row => [row.signature, row]));
  const changed = after.filter(row => old.has(row.signature) && JSON.stringify(row) !== JSON.stringify(old.get(row.signature)));
  const added = after.filter(row => !old.has(row.signature));
  assert.equal(after.length, before.length + 6);
  assert.deepEqual(changed.map(row => row.name).sort(), ["complete_snapshot_v2_cooking_session", "record_cooked_weight_evidence", "resolve_cooked_batch_nutrition", "verify_full_local_internal_scope"].sort());
  assert.deepEqual(added.map(row => row.name).sort(), ["read_cooking_execution_quantities", "save_cooking_execution_quantities", "complete_cooking_execution", "assert_execution_completion_revision", "resolve_execution_batch_nutrition", "verify_scope_pre_cooking_execution_20261017"].sort());
  for (const row of changed) { const prior = old.get(row.signature); for (const key of ["owner", "security", "volatility", "configuration", "acl"]) assert.deepEqual(row[key], prior[key], `${row.signature} metadata ${key}`); if (row.name !== "verify_full_local_internal_scope") assert.equal(row.oid, prior.oid); }
  for (const row of added) { assert.equal(row.owner, "postgres"); assert.equal(row.security, true); assert.equal(row.acl, row.schema === "public" ? "service_role:EXECUTE:false" : ""); }
  const priorScope = before.find(row => row.name === "verify_full_local_internal_scope");
  const scopeAlias = added.find(row => row.name === "verify_scope_pre_cooking_execution_20261017");
  for (const key of ["oid", "body", "owner", "security", "volatility", "configuration", "acl"]) assert.deepEqual(scopeAlias[key], priorScope[key]);
  report.functionDelta = { unchanged: before.length - changed.length, changed, added };
  const withoutOids = rows => rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "oid")));
  assert.deepEqual(withoutOids(recovered), withoutOids(after));
  writeFileSync("/tmp/homecook-cooking232-functions-after.json", JSON.stringify(after, null, 2));
  const testEnv = { ...env, HOMECOOK_COOKING_SCHEMA232_PG: "1", HOMECOOK_COOKED_WEIGHT_EVIDENCE_ISOLATED_PG: "1", HOMECOOK_WEIGHT_EVIDENCE_TEST_CONTAINER: container, HOMECOOK_WEIGHT_EVIDENCE_TEST_TAG: tag };
  const test = file => { const result = spawnSync(process.execPath, [path.resolve("node_modules/vitest/vitest.mjs"), "run", file], { env: testEnv, encoding: "utf8", timeout: 180_000, maxBuffer: 8 * 1024 * 1024 }); process.stdout.write(result.stdout ?? ""); process.stderr.write(result.stderr ?? ""); assert.equal(result.status, 0, `${file} failed`); report.tests.push(file); };
  test("tests/cooking-experience-schema232-postgres.integration.test.ts");
  assert.equal(sql("select count(*) from private.cooked_weight_user_attestations;", "supabase_admin"), "0");
  assert.equal(sql("select enabled from private.cooked_weight_user_attestation_control where singleton;", "supabase_admin"), "f");
  report.personalAttestationCollectionPreservedOff = true;
  report.status = "PASS";
} catch (error) { report.status = "FAIL"; report.error = String(error.message).slice(0, 2500); throw error; }
finally {
  try {
    if (container) { assert.equal(required(["inspect", "--format", '{{.HostConfig.NetworkMode}}|{{index .Config.Labels "homecook.cooked-weight-test"}}', container]), `none|${tag}`); required(["rm", "-f", container]); assert.notEqual(run("docker", ["inspect", container]).status, 0); report.cleanupCompleted = true; }
  } catch (error) { report.status = "FAIL"; report.cleanupCompleted = false; report.cleanupError = String(error.message).slice(0, 1000); throw error; }
  finally { writeFileSync(reportPath, JSON.stringify(report, null, 2)); }
}
process.stdout.write(`${JSON.stringify(report)}\n`);
