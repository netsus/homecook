import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync as readPublicGitBlob } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import * as web from "../scripts/lib/prelaunch-web-deploy.mjs";
import * as saved from "../scripts/lib/saved-recipe-nutrition-maintenance.mjs";
import * as cooking from "../scripts/lib/cooking-experience-maintenance.mjs";
import * as successor from "../scripts/lib/prelaunch-db-app-successor.mjs";
import { hash, ref, route, operator, operatorPair, successorInput, successorWithPin } from "./fixtures/db238-app-successor-fixture.mjs";
const unboundSuccessor = await successorWithPin({ path: null, sha256: null });

const source = readFileSync(new URL("../scripts/deploy-prelaunch-web.mjs", import.meta.url), "utf8");
function slice(start, end) {
  const first = source.indexOf(start), last = source.indexOf(end, first);
  assert(first >= 0 && last > first, `Actual CLI boundary moved: ${start}`);
  return source.slice(first, last);
}

/** Runs the real CLI plan/helper/prebuild bodies. Only external observations are synthetic. */
function harness(input = successorInput(), { unbound = false, fileMode = "100644", operatorBlobs = null } = {}) {
  const bytes = Buffer.from("synthetic current plist");
  input.live.plistSha256 = hash(bytes); input.review.live = { ...input.live };
  const blobs = {};
  for (const file of input.files) {
    blobs[`${input.from}:${file}`] = Buffer.from(`// original ${file}`);
    blobs[`${input.to}:${file}`] = Buffer.from(`// changed ${file}\nread_recipe_future_patch_result`);
    if (file === operator && operatorBlobs) {
      blobs[`${input.from}:${file}`] = operatorBlobs[0]; blobs[`${input.to}:${file}`] = operatorBlobs[1];
    }
    input.digests[file] = [input.from, input.to].map(sha => hash(blobs[`${sha}:${file}`]));
    input.review.files[file] = [...input.digests[file]];
  }
  const live = { ...input.live, bytes, cwd: "/synthetic-db238/current", plist: {
    Label: "com.homecook.production", WorkingDirectory: "/synthetic-db238/current",
    ProgramArguments: ["/synthetic-db238/node", "/synthetic-db238/current/scripts/start-production.mjs", "-H", "127.0.0.1", "-p", "3100"],
    EnvironmentVariables: { MUMEOK_ROUND2_ENABLED: "false", MUMEOK_ROUND2_LEADS_ENABLED: "false" },
  } };
  let verified = 0, approvalReads = 0;
  const unexpected = () => { throw Error("UNEXPECTED_EXTERNAL_IO"); };
  const context = {
    ...web, ...saved, ...cooking,
    repository: "/synthetic-db238/repository", root: "/synthetic-db238/root", join,
    assertClean: () => {}, prelaunchChangedFiles: () => input.files,
    fingerprintSourceHandoff: () => null, v85SourceHandoff: () => null,
    command: unexpected, verifiedV74Source: unexpected,
    V74_WEB_PREDECESSOR: ref("1"), V74_RELEASE: ref("2"),
    git: args => {
      if (args[0] === "rev-parse") return input.to;
      if (args[0] === "merge-base") { assert(input.liveAncestor); return ""; }
      if (args[0] === "ls-tree") return `${fileMode} blob ${"a".repeat(40)}\t${args.at(-1)}`;
      if (args[0] === "show" && args[1].endsWith(":package.json")) return JSON.stringify({ scripts: { build: "next build", "test:product": "synthetic-not-run" } });
      throw Error(`Unexpected git operation: ${args[0]}`);
    },
    execFileSync: (_bin, args) => {
      const blob = blobs[args.at(-1)]; assert(blob, "Unexpected blob read"); return blob;
    },
    spawnSync: (_bin, args) => ({ status: args.at(-2) === input.maintenance.review.to
      ? input.readerFloorAncestor ? 0 : 1 : input.liveAncestor ? 0 : 1 }),
    hash, loadCurrentDatabaseMaintenance: () => input.maintenance,
    readDbAppSuccessorReview: read => {
      approvalReads++;
      if (unbound) return unboundSuccessor.readDbAppSuccessorReview(read);
      return input.review;
    },
    readClosedR2PrivateBytes: unexpected,
    assertDbAppSuccessor: value => { verified++; return successor.assertDbAppSuccessor(value); },
  };
  const code = slice("function plan(", "\nfunction ownChild(")
    + slice("function nutritionSourceHandoff(", "\nasync function stageRound2Readiness");
  const real = new Function(...Object.keys(context), `${code};return {plan,nutritionSourceHandoff};`)(...Object.values(context));
  const runPlan = () => real.plan(input.to, live, "--reviewed-ref", undefined, false, undefined, null, null, false, null, input.options);
  const beforeRelease = slice("async function deploy(options) {", "  const release = mkdtempSync");
  const deployContext = { ...context, ...real, current: () => live,
    requireClosedR2Mode: options => { web.assertClosedR2ContinuationOptions(options); return { review: { synthetic: true } }; },
    recoveryPath: "/synthetic-db238/no-recovery", existsSync: () => false,
    readEnvironmentPatch: () => ({}),
  };
  const prebuild = new Function(...Object.keys(deployContext), `${beforeRelease}return {readOnlyDatabase,selection};}\nreturn deploy;`)(...Object.values(deployContext));
  const databasePlan = { baselineRequired: false, pending: [], source: [], applied: [] };
  const stageContext = { ...context, ...real, isDeepStrictEqual,
    loadClosedR2Review: () => ({ databasePlanSha256: hash(JSON.stringify({ source: [], applied: [] })) }),
    readEnvironmentPatch: () => ({}), quantityPublicReadDigests: () => null,
    verifyClosedR2Control: () => {},
  };
  const stage = new Function(...Object.keys(stageContext), `${slice("async function stageRound2Readiness(", "\nfunction copyEnvironment(")};return stageRound2Readiness;`)(...Object.values(stageContext));
  return { input, live, blobs, runPlan, sourceHandoff: (forScope = false) => real.nutritionSourceHandoff(live, { target: input.to, files: input.files }, input.options, forScope),
    prebuild: () => prebuild(input.options), stage: () => stage(live.plist, "/synthetic-release", live,
      { target: input.to, files: input.files }, false, input.options, databasePlan, { marker: {} }),
    observations: () => ({ verified, approvalReads }) };
}

test("actual CLI plan and deploy prebuild accept exact238 app-only without DB handoff", async () => {
  const f = harness();
  assert.deepEqual(f.runPlan().scope.database, []);
  assert.equal(f.sourceHandoff(), undefined);
  assert.equal(f.sourceHandoff(true).appSuccessorSupport.size, 0);
  const result = await f.prebuild(); assert.equal(result.readOnlyDatabase, true);
  assert.equal(result.selection.target, f.input.to);
  assert(f.observations().verified >= 4);
  web.assertRound2InheritanceBoundaries({ previous: f.live.plist, next: f.live.plist, files: f.input.files,
    databaseDeployment: false, nutritionMaintenanceHandoff: f.sourceHandoff() });
});

test("actual CLI reaches the unbound approval rejection, never private I/O", () => {
  const f = harness(undefined, { unbound: true });
  assert.throws(f.runPlan, /DB_APP_SUCCESSOR_PIN_UNBOUND/u);
  assert.equal(f.observations().approvalReads, 1); assert.equal(f.observations().verified, 0);
});

test("actual plan transports only the historical exact operator singleton", () => {
  const input = successorInput(); input.files.push(operator);
  const before = readPublicGitBlob("git", ["show", `d09ab4bcdd519e2921165ff33779821096172373:${operator}`]);
  const after = readFileSync(new URL(`../${operator}`, import.meta.url));
  assert.deepEqual([hash(before), hash(after)], operatorPair);
  const f = harness(input, { operatorBlobs: [before, after] });
  assert.deepEqual([...f.sourceHandoff(true).appSuccessorSupport], [operator]);
  assert(f.runPlan().scope.support.includes(operator));
  assert.deepEqual(f.runPlan().scope.database, []);
});

test("actual stage revalidates options and the exact app approval", async () => {
  const f = harness(); await f.stage(); assert.equal(f.observations().verified, 1);
  f.input.review.to = ref("e");
  await assert.rejects(f.stage(), /DB_APP_SUCCESSOR_SOURCE/u);
  assert.equal(f.observations().verified, 2);
});

const expectedCliMutationErrors = {
  "live build mismatch": /^DB_APP_SUCCESSOR_SOURCE$/u,
  "receipt unknown": /^Saved nutrition exact maintenance: bound238 receipt\/backup\/original transaction evidence required$/u,
  "guard mismatch": /^Saved nutrition exact maintenance: terminal\/guard binding differs$/u,
  "reader floor ancestor mismatch": /^DB_APP_SUCCESSOR_ANCESTRY$/u,
  "different approval candidate": /^DB_APP_SUCCESSOR_SOURCE$/u,
  "missing approval blob": /^DB_APP_SUCCESSOR_FILES$/u,
  "changed candidate bytes": /^DB_APP_SUCCESSOR_FILES$/u,
  "environment patch": /^DB_APP_SUCCESSOR_OPTIONS$/u,
  "DB baseline": /^DB_APP_SUCCESSOR_OPTIONS$/u,
};

for (const [name, mutate] of [
  ["live build mismatch", f => { f.live.buildId = "foreign"; }],
  ["receipt unknown", f => { f.input.maintenance.record.status = "unknown"; }],
  ["guard mismatch", f => { f.input.maintenance.guardPointer.sha256 = "f".repeat(64); }],
  ["reader floor ancestor mismatch", f => { f.input.readerFloorAncestor = false; }],
  ["different approval candidate", f => { f.input.review.to = ref("e"); }],
  ["missing approval blob", f => { delete f.input.review.files[route]; }],
  ["changed candidate bytes", f => { f.blobs[`${f.input.to}:${route}`] = Buffer.from("tampered read_recipe_future_patch_result"); }],
  ["environment patch", f => { f.input.options.envFile = "/synthetic-db238/unread"; }],
  ["DB baseline", f => { f.input.options.dbBaseline = "/synthetic-db238/unread-baseline"; }],
]) test(`actual CLI rejects ${name} at the real verification boundary`, () => {
  const f = harness(); mutate(f);
  assert.throws(f.runPlan, error => error instanceof Error && !(error instanceof TypeError)
    && !(error instanceof ReferenceError) && expectedCliMutationErrors[name].test(error.message));
  assert.equal(f.observations().verified, 1);
});

test("actual CLI rejects executable blob modes before the verifier", () => {
  const f = harness(undefined, { fileMode: "100755" });
  assert.throws(f.runPlan, /DB_APP_SUCCESSOR_FILE_MODE/u); assert.equal(f.observations().verified, 0);
});

for (const path of ["supabase/migrations/20261020000000_foreign.sql", ".env.example", "lib/server/hybrid-auth/runtime.ts", "scripts/lib/youtube-extraction-worker-runtime.mjs"])
  test(`actual CLI denies SQL/protected scope: ${path}`, () => {
    const input = successorInput(); input.files.push(path); const f = harness(input);
    const expected = path.startsWith("supabase/")
      ? /^Exact nutrition\/recipe-save source is not already committed under its separate authority$/u
      : /^DB_APP_SUCCESSOR_SCOPE$/u;
    assert.throws(f.runPlan, error => error instanceof Error && !(error instanceof TypeError)
      && !(error instanceof ReferenceError) && expected.test(error.message));
    if (!path.startsWith("supabase/")) assert.equal(f.observations().verified, 1);
  });
