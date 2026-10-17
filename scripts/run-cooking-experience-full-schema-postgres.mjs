#!/usr/bin/env node
// Fresh application schema only. Never accepts a connection or existing container.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readPinnedLocalDockerTarget } from "./lib/local-supabase-isolated-runtime.mjs";

const image = "public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a";
const tag = randomBytes(16).toString("hex");
const env = Object.fromEntries(["PATH", "LANG", "LC_ALL", "TMPDIR"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
const run = (file, args, input) => spawnSync(file, args, { env, input, encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
const required = (file, args, input) => { const r = run(file, args, input); assert.equal(r.status, 0, `${file}: ${r.stderr}`); return r.stdout.trim(); };
let container;
const results = { runId: tag, status: "RUNNING", migrations: [], tests: [], network: "none", productionConnections: 0 };
const reportPath = "/tmp/homecook-cooking-full-schema-report.json";
writeFileSync(reportPath, JSON.stringify(results, null, 2));
try {
  assert.equal(process.argv.length, 2, "No connection arguments accepted");
  env.DOCKER_HOST = readPinnedLocalDockerTarget().docker_host;
  const expectedImage = required("docker", ["image", "inspect", "--format", "{{.Id}}", image]);
  container = required("docker", ["run", "--detach", "--pull=never", "--network", "none", "--user", "postgres", "--name", `hc-cooking-full-${tag}`, "--label", `homecook.cooked-weight-test=${tag}`, "--entrypoint", "/bin/sh", image, "-c", "exec sleep infinity"]);
  assert.match(container, /^[a-f0-9]{64}$/u);
  const ownership = required("docker", ["inspect", "--format", '{{.Image}}|{{.HostConfig.NetworkMode}}|{{len .Mounts}}|{{len .HostConfig.PortBindings}}|{{index .Config.Labels "homecook.cooked-weight-test"}}', container]);
  assert.equal(ownership, `${expectedImage}|none|0|0|${tag}`);
  const exec = (args, input) => required("docker", ["exec", "-i", container, ...args], input);
  exec(["mkdir", "-m", "700", "-p", "/tmp/pgsocket"]);
  exec(["initdb", "-D", "/tmp/cooking-pg", "-U", "postgres", "--auth-local=trust", "--auth-host=reject", "--no-locale", "--encoding=UTF8"]);
  exec(["pg_ctl", "-D", "/tmp/cooking-pg", "-o", "-h '' -k /tmp/pgsocket", "-l", "/tmp/cooking-pg.log", "-w", "start"]);
  const sql = input => exec(["psql", "-h", "/tmp/pgsocket", "-U", "postgres", "-d", "postgres", "-XqAt", "--single-transaction", "-v", "ON_ERROR_STOP=1"], input);
  // Only platform Auth/Storage interfaces are synthetic. Every public/private
  // application object and function comes from the entire migration sequence.
  const bootstrap = readFileSync("scripts/run-recipe-snapshot-authority-postgres-integration.mjs", "utf8").split("const BOOTSTRAP_SQL = String.raw`")[1].split("create type public.recipe_ingredient_type")[0]
    .replace(/create or replace function public\.gen_random_uuid\(\)[\s\S]*?\$function\$;/u, "")
    .replace("create role supabase_admin nologin bypassrls;", "create role supabase_admin login superuser;");
  sql(bootstrap);
  for (const filename of readdirSync("supabase/migrations").filter(name => name.endsWith(".sql")).sort()) {
    process.stdout.write(`MIGRATION ${filename}\n`);
    try {
      if (filename === "20261009130000_ingredient_piece_unit_evidence.sql") {
        // Reuse the existing reviewed historical fixture, including its exact
        // source/owner/ACL/config and before/after definition hash assertions.
        // The applied migration and its baseline fence remain byte-identical.
        const catalogGate = readFileSync("scripts/verify-youtube-extraction-current-catalog.mjs", "utf8");
        const fixture = catalogGate.split("const pieceUnitFreshReplayPredecessorFixture = `")[1]?.split("`;")[0];
        assert.ok(fixture?.includes("PIECE_UNIT_FRESH_REPLAY_PREDECESSOR_DRIFT") && fixture.includes("PIECE_UNIT_FRESH_REPLAY_PREDECESSOR_RESTORE_FAILED"));
        sql(fixture);
        results.historicalPredecessorFixture = { source: "scripts/verify-youtube-extraction-current-catalog.mjs", sha256: createHash("sha256").update(fixture).digest("hex"), baselineFenceUnchanged: true };
      }
      sql(readFileSync(path.join("supabase/migrations", filename), "utf8"));
    } catch (error) {
      results.failedMigration = filename;
      writeFileSync("/tmp/homecook-cooking-full-schema-before-failure.sql", exec(["pg_dump", "-h", "/tmp/pgsocket", "-U", "postgres", "-d", "postgres", "--schema-only", "--no-owner", "--no-privileges"]));
      throw error;
    }
    results.migrations.push(filename);
  }
  const testEnv = { ...env, HOMECOOK_COOKED_WEIGHT_EVIDENCE_ISOLATED_PG: "1", HOMECOOK_WEIGHT_EVIDENCE_TEST_CONTAINER: container, HOMECOOK_WEIGHT_EVIDENCE_TEST_TAG: tag };
  const test = spawnSync(process.execPath, [path.resolve("node_modules/vitest/vitest.mjs"), "run", "tests/cooked-weight-evidence-postgres.integration.test.ts"], { env: testEnv, encoding: "utf8", timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
  process.stdout.write(test.stdout ?? ""); process.stderr.write(test.stderr ?? "");
  assert.equal(test.status, 0, "Full application schema regression failed");
  results.tests.push("cooked-weight-evidence-postgres.integration.test.ts");
  results.status = "PASS";
} catch (error) { results.status = "FAIL"; results.error = String(error.message).slice(0, 2500); throw error;
} finally {
  try { if (container) {
    const current = required("docker", ["inspect", "--format", '{{.Id}}|{{.HostConfig.NetworkMode}}|{{index .Config.Labels "homecook.cooked-weight-test"}}', container]);
    assert.equal(current, `${container}|none|${tag}`);
    required("docker", ["rm", "-f", container]);
    assert.notEqual(run("docker", ["inspect", container]).status, 0);
    results.cleanupCompleted = true;
  } } catch (error) { results.status = "FAIL"; results.cleanupCompleted = false; results.cleanupError = String(error.message).slice(0, 1000); throw error; }
  finally { writeFileSync(reportPath, JSON.stringify(results, null, 2)); }
}
process.stdout.write(`${JSON.stringify(results)}\n`);
