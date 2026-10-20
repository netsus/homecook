import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import * as candidate from "../scripts/lib/cooked-weight-mass-proxy-maintenance.mjs";
import { PROTECTED_CATALOG_SQL } from "../scripts/lib/prelaunch-database.mjs";
import {unboundMassProxyModules}from "./fixtures/mass-proxy-unbound-modules.mjs";

import {hash,sha,source,review,observation,target}from "./fixtures/cooked-weight-mass-proxy-maintenance-fixture.mjs";

test("new PIN rejects the wired operating target before config or target I/O", async () => {
  const unbound=await unboundMassProxyModules();
  try {
    assert.deepEqual(unbound.feature.MASS_PROXY_REVIEW_PIN, { path: null, sha256: null });
    assert.throws(() => unbound.feature.assertMassProxyOperatingPin(), /PIN is unbound.*no config\/target I\/O/);
    await assert.rejects(unbound.database.openProtectedPrelaunchTarget({repositoryRoot:process.cwd(),configPath:"/does-not-exist",backupDirectory:"/does-not-exist",review:review()}),/PIN is unbound/);
  } finally { unbound.cleanup(); }
});
test("fixed manifest matches all exact Git blob pairs and exact original238 SQL bytes", () => {
  assert.equal(Object.keys(source.files).length, 55); assert.equal(source.before.length, 238);
  const git = args => spawnSync("git", args);
  const changed = git(["diff", "--name-only", "-z", source.from, source.to]); assert.equal(changed.status, 0);
  assert.deepEqual(changed.stdout.toString().split("\0").filter(Boolean).sort(), Object.keys(source.files).sort());
  for (const [file, pair] of Object.entries(source.files)) {
    const actual = [source.from, source.to].map(ref => { const result = git(["show", `${ref}:${file}`]); return result.status === 0 ? hash(result.stdout) : null; });
    assert.deepEqual(actual, pair, file); assert.notEqual(pair[0], pair[1], file);
  }
  for (const row of source.before) assert.equal(hash(readFileSync(`supabase/migrations/${row.filename}`)), row.sha256, row.filename);
  const copy = candidate.massProxySourceManifest(); copy.before.length = 0; assert.equal(candidate.massProxySourceManifest().before.length, 238);
});
test("pure plan accepts the exact single239 payload and does not mutate input or perform I/O to the target", () => {
  const r = review(), original = structuredClone(r);
  const migrations = r.database.after.map(row => ({ ...row, bytes: readFileSync(`supabase/migrations/${row.filename}`) }));
  const plan = candidate.planMassProxyMigration(r, migrations);
  assert.equal(plan.pending.length, 1); assert.equal(plan.pending[0].actor, "postgres"); assert.equal(hash(plan.pending[0].payload), candidate.MASS_PROXY_MIGRATION.payloadSha256);
  assert.equal(plan.mutationPerformed, false); assert.deepEqual(r, original);
  migrations[0].bytes = Buffer.from("foreign"); assert.throws(() => candidate.planMassProxyMigration(r, migrations), /source bytes differ/);
});
test("remainder keeps the complete original query except precisely two function identities", () => {
  const sql = candidate.unchangedMassProxyCatalogSql(PROTECTED_CATALOG_SQL);
  for (const signature of candidate.MASS_PROXY_FUNCTIONS) assert(sql.includes(`to_regprocedure('${signature}')`));
  assert.equal((sql.match(/to_regprocedure\('/g) ?? []).length, 2);
  assert.throws(() => candidate.unchangedMassProxyCatalogSql(PROTECTED_CATALOG_SQL + " "), /complete catalog/);
  assert.throws(() => candidate.unchangedMassProxyCatalogSql("select 'anything'"), /complete catalog/);
});
test("before/after observed images preserve metadata, OID, scope and all transaction rows", () => {
  const r = review(); candidate.assertMassProxyReview(r); candidate.assertMassProxyTransition(r, observation(r), observation(r, true));
});
const badReviews = {
  "foreign feature": r => r.feature = "saved-recipe-nutrition-experience",
  "another live source": r => r.from = "f".repeat(40),
  "another candidate": r => r.to = "e".repeat(40),
  "extra auth source": r => r.files["lib/server/foreign-auth.ts"] = [null, sha("a")],
  "missing source": r => delete r.files[Object.keys(r.files)[0]],
  "same-hash or foreign source": r => r.files[Object.keys(r.files)[0]][1] = sha("f"),
  "writer ON": r => r.approved.writerOn = true,
  "control policy changes": r => r.preserveExistingWriterControls = false,
  "missing backup readiness": r => r.backupReadiness = null,
  "old PIN in evidence": r => r.isolatedEvidenceSha256 = sha("f"),
  "wrong predecessor generation": r => r.predecessorMaintenance.ledgerCount = 235,
  "wrong predecessor authority": r => r.predecessorMaintenance.reviewSha256 = sha("f"),
  "wrong target": r => r.predecessorMaintenance.targetSha256 = sha("f"),
  "historical ledger edit": r => r.database.before[0].sha256 = sha("f"),
  "extra SQL": r => r.database.after.push({ filename: "20261020220000_foreign.sql", sha256: sha("f") }),
  "changed239 source": r => r.database.migrations[0].rawSha256 = sha("f"),
  "changed239 payload": r => r.database.migrations[0].payloadSha256 = sha("f"),
  "different normal-data projection": r => r.database.normalProjectionSha256 = sha("f"),
  "different remainder query": r => r.database.unchangedQuerySha256 = sha("f"),
  "different function query": r => r.database.functionQuerySha256 = sha("f"),
  "owner change": r => r.database.functionsAfter[0].owner = "supabase_admin",
  "grantor change": r => r.database.functionsAfter[0].acl[0][3] = "service_role",
  "search-path change": r => r.database.functionsAfter[0].config = ["search_path=public"],
  "security-definer change": r => r.database.functionsAfter[0].securityDefiner = false,
  "language change": r => r.database.functionsAfter[0].language = "sql",
  "only one body changed": r => r.database.functionsAfter[0] = structuredClone(r.database.functionsBefore[0]),
  "recreated function identity": r => r.database.functionOids[1][1] = r.database.functionOids[0][1],
  "replaced scope alias": r => r.database.scopeLink.aliasOid = r.database.scopeLink.outerOid,
  "new worker generation": r => r.database.workerBaseline.credentialGeneration = 51,
  "worker policy disabled": r => r.database.workerBaseline.workerPolicyEnabled = false,
};
for (const [name, change] of Object.entries(badReviews)) test(`review rejects ${name}`, () => { const r = review(); change(r); assert.throws(() => candidate.assertMassProxyReview(r)); });
const badObservations = {
  "foreign target": o => o.target = { foreign: true }, "missing ledger authority": o => o.ledgerAuthority = false, "active migration": o => o.active = true,
  "another body": o => o.functions[0].definitionSha256 = sha("f"), "another OID": o => o.functions[0].oid++, "another scope OID": o => o.scopeLink.aliasOid++,
  "writer state": o => o.quantityWriterEnabled = false, "queued worker": o => o.worker.queued = 1, "pending enqueue": o => o.worker.activeEnqueueSessions = 1,
  "worker permit": o => o.worker.permitHeld = true, "expired credential": o => o.worker.credentialActive = false,
};
for (const [name, change] of Object.entries(badObservations)) test(`observation rejects ${name}`, () => { const r = review(), o = observation(r, true); change(o); assert.throws(() => candidate.assertMassProxyObservation(r, o, "after")); });
for (const key of ["unchangedCatalogSha256", "normalDataSha256", "preservedRowsSha256", "attestationRowsSha256", "controlsSha256", "executionRowsSha256", "ledgerPreservedRowsSha256", "executionTableSha256"]) {
  test(`transaction rejects changed ${key}`, () => { const r = review(), next = observation(r, true); next[key] = sha("f"); assert.throws(() => candidate.assertMassProxyTransition(r, observation(r), next)); });
}
function receipt(r) {
  const o = observation(r, true), operationId = "12345678-1234-4123-8123-123456789abc";
  return { ...o, schema: "homecook.prelaunch-protected-db-attempt.v1", feature: r.feature, reviewSha256: sha("e"), from: r.from, to: r.to, readerFloor: r.to, journalFile: "attempt.json",
    predecessorMaintenance: structuredClone(r.predecessorMaintenance), operationId, applicationName: `protected-mass-proxy-${operationId}`, status: "committed", targetSha256: r.database.targetSha256,
    databasePlanSha256: hash(JSON.stringify({ source: r.database.after, applied: r.database.after })), readerReady: false, writerEnabled: false, legacyReaderCompatible: true,
    rowsPreservedInTransaction: true, controlsPreservedInTransaction: true, featureMetadataPreservedInTransaction: true, scopeAliasOidPreservedInTransaction: true,
    functionOids: structuredClone(r.database.functionOids), nativePostCatalog: Object.fromEntries(["catalogSha256", "immutableSha256", "stableImmutableSha256"].map(key => [key, o[key]])),
    backup: { fullArchiveDecoded: true, sha256: sha("a"), rolesSha256: sha("b"), target, snapshot: "00000003-0000001B-1" } };
}
test("committed receipt binds the original238 predecessor, native intent, backup and all preserved evidence", () => {
  const r = review(); candidate.assertMassProxyDatabaseReceipt(r, receipt(r), sha("e")); assert.equal(candidate.massProxyTerminalStatus(r, receipt(r), sha("e")), "committed");
});
for (const status of ["applying_precommit", "commit_dispatch_guard", "rolled_back_before_commit", "unknown"]) {
  test(`${status} cannot fall back to238 or authorize automatic retry`, () => {
    const r = review(), attempt = { ...receipt(r), status };
    assert.throws(() => candidate.massProxyTerminalStatus(r, attempt, sha("e")), /retain239 guard, no238 fallback or automatic retry/);
  });
}
const badReceipts = {
  "foreign239 authority": x => x.reviewSha256 = sha("f"), "rebound original238 receipt": x => x.predecessorMaintenance.receipt.sha256 = sha("f"),
  "different transaction target": x => x.targetSha256 = sha("f"), "wrong operation": x => x.applicationName = "foreign",
  "writer activation": x => x.writerEnabled = true, "missing original row preservation": x => x.rowsPreservedInTransaction = false,
  "missing controls preservation": x => x.controlsPreservedInTransaction = false, "missing metadata preservation": x => x.featureMetadataPreservedInTransaction = false,
  "missing alias preservation": x => x.scopeAliasOidPreservedInTransaction = false, "missing native intent": x => delete x.nativePostCatalog,
  "runtime postimage substitution": x => x.nativePostCatalog.catalogSha256 = sha("f"), "missing OID intent": x => delete x.functionOids,
  "missing normal projection": x => delete x.normalProjectionSha256, "changed normal projection": x => x.normalProjectionSha256 = sha("f"),
  "missing roles dump": x => delete x.backup.rolesSha256, "archive not decoded": x => x.backup.fullArchiveDecoded = false,
  "wrong backup target": x => x.backup.target = { foreign: true }, "missing exported snapshot": x => delete x.backup.snapshot,
};
for (const [name, change] of Object.entries(badReceipts)) test(`receipt rejects ${name}`, () => { const r = review(), record = receipt(r); change(record); assert.throws(() => candidate.assertMassProxyDatabaseReceipt(r, record, sha("e"))); });
test("exact not-applied remains separate from unknown and does not claim a commit", () => {
  const r = review(), record = { ...receipt(r), status: "not_applied" }; assert.equal(candidate.massProxyTerminalStatus(r, record, sha("e")), "not_applied");
  assert.throws(() => candidate.assertMassProxyDatabaseReceipt(r, record, sha("e")), /original commit/);
});
