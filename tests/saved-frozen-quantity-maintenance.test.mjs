import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import * as frozen from "../scripts/lib/saved-frozen-quantity-maintenance.mjs";
import { MASS_PROXY_REVIEW_PIN } from "../scripts/lib/cooked-weight-mass-proxy-maintenance.mjs";
import { PROTECTED_CATALOG_SQL } from "../scripts/lib/prelaunch-database.mjs";
import { review as massReview, target } from "./fixtures/cooked-weight-mass-proxy-maintenance-fixture.mjs";

const sha = value => value.repeat(64);
const hash = value => createHash("sha256").update(value).digest("hex");
const source = frozen.frozenQuantitySourceManifest();
const pointer = name => ({ path: `/tmp/synthetic240/${name}.json`, sha256: sha("a") });
const image = (signature, index, changed = false, observed = false) => ({
  signature, owner: "postgres", acl: [["postgres", "EXECUTE", false, "postgres"]],
  config: ["search_path=pg_catalog, public, private, pg_temp"], language: "plpgsql",
  securityDefiner: index !== 1, volatility: index === 0 ? "s" : "v", parallel: "u",
  strict: false, noCallerGrants: index === 0, definitionSha256: sha(changed ? "2" : "1"),
  sourceMd5: (changed ? "d" : "c").repeat(32), metadataSha256: sha("3"),
  metadataWithoutLanguageSha256: sha("4"), ...(observed ? { oid: 100 + index } : {}),
});
const images = (changed = false, observed = false) => frozen.FROZEN_QUANTITY_FUNCTIONS.map((signature, index) => image(signature, index, changed, observed));
function review() {
  const previous = massReview();
  return {
    ...previous, feature: frozen.FROZEN_QUANTITY_FEATURE, from: source.from, to: source.to,
    files: structuredClone(source.files), operator: { ref: "f".repeat(40), files: frozen.frozenQuantityOperatorImages(process.cwd()) },
    isolatedEvidence: pointer("isolated"), isolatedEvidenceSha256: sha("a"),
    legacyReaderEvidence: pointer("legacy"), platformInventory: pointer("inventory"),
    backupReadiness: pointer("readiness"), postimages: pointer("postimages"),
    legacyReader: { ref: source.from, buildId: "synthetic-reader", plistSha256: sha("5") },
    predecessorMaintenance: {
      schema: "homecook.cooked-weight-mass-proxy-maintenance.v1", ledgerCount: 239,
      reviewSha256: MASS_PROXY_REVIEW_PIN.sha256, receipt: pointer("original239"),
      databasePlanSha256: hash(JSON.stringify({ source: source.before, applied: source.before })),
      targetSha256: hash(JSON.stringify(target)),
    },
    database: {
      ...previous.database, before: structuredClone(source.before),
      after: [...structuredClone(source.before), { filename: frozen.FROZEN_QUANTITY_MIGRATION.filename, sha256: frozen.FROZEN_QUANTITY_MIGRATION.rawSha256 }],
      migrations: [{ ...frozen.FROZEN_QUANTITY_MIGRATION }],
      functionQuerySha256: hash(frozen.FROZEN_QUANTITY_FUNCTIONS_SQL),
      unchangedQuerySha256: hash(frozen.unchangedFrozenQuantityCatalogSql(PROTECTED_CATALOG_SQL)),
      functionsBefore: images(), functionsAfter: images(true),
      functionOids: frozen.FROZEN_QUANTITY_FUNCTIONS.map((signature, index) => [signature, 100 + index]),
    },
  };
}
function observation(r, changed = false) {
  const db = r.database;
  return {
    target, ledger: structuredClone(changed ? db.after : db.before), ledgerAuthority: true,
    active: false, catalogSha256: changed ? sha("b") : db.beforeCatalogSha256,
    immutableSha256: db.immutableSha256, stableImmutableSha256: db.stableImmutableSha256,
    unchangedCatalogSha256: db.unchangedCatalogSha256, normalProjectionSha256: db.normalProjectionSha256,
    executionTableSha256: db.executionTableSha256, normalDataSha256: sha("5"),
    preservedRowsSha256: sha("6"), attestationRowsSha256: sha("7"), controlsSha256: sha("8"),
    executionRowsSha256: sha("9"), ledgerPreservedRowsSha256: sha("a"),
    functions: images(changed, true), scopeLink: structuredClone(db.scopeLink),
    productWriterEnabled: true, cookedWeightWriterEnabled: true, quantityWriterEnabled: true,
    worker: { ...db.workerBaseline, credentialActive: true, queued: 0, processing: 0, permitHeld: false, activeEnqueueSessions: 0 },
  };
}
function receipt(r) {
  const observed = observation(r, true);
  const operationId = "12345678-1234-4123-8123-123456789abc";
  return {
    ...observed, schema: "homecook.prelaunch-protected-db-attempt.v1", feature: r.feature,
    reviewSha256: sha("e"), from: r.from, to: r.to, readerFloor: r.to,
    journalFile: "attempt.json", predecessorMaintenance: structuredClone(r.predecessorMaintenance),
    operationId, applicationName: `protected-saved-frozen-quantity-${operationId}`,
    status: "committed", targetSha256: r.database.targetSha256,
    databasePlanSha256: hash(JSON.stringify({ source: r.database.after, applied: r.database.after })),
    readerReady: false, writerEnabled: false, legacyReaderCompatible: true,
    rowsPreservedInTransaction: true, controlsPreservedInTransaction: true,
    featureMetadataPreservedInTransaction: true, scopeAliasOidPreservedInTransaction: true,
    functionOids: structuredClone(r.database.functionOids),
    nativePostCatalog: Object.fromEntries(["catalogSha256", "immutableSha256", "stableImmutableSha256"].map(key => [key, observed[key]])),
    backup: { fullArchiveDecoded: true, sha256: sha("a"), rolesSha256: sha("b"), target, snapshot: "00000003-0000001B-1" },
  };
}

test("exact app source and DB239 prefix bind only one DB240 SQL payload", () => {
  const changed = spawnSync("git", ["diff", "--name-only", "-z", source.from, source.to]);
  assert.equal(changed.status, 0);
  assert.deepEqual(changed.stdout.toString().split("\0").filter(Boolean).sort(), Object.keys(source.files).sort());
  for (const [file, pair] of Object.entries(source.files)) {
    assert.deepEqual([source.from, source.to].map(ref => {
      const result = spawnSync("git", ["show", `${ref}:${file}`]);
      return result.status === 0 ? hash(result.stdout) : null;
    }), pair, file);
  }
  const r = review();
  const migrations = r.database.after.map(row => ({ ...row, bytes: readFileSync(`supabase/migrations/${row.filename}`) }));
  const plan = frozen.planFrozenQuantityMigration(r, migrations);
  assert.equal(plan.pending.length, 1);
  assert.equal(hash(plan.pending[0].payload), frozen.FROZEN_QUANTITY_MIGRATION.payloadSha256);
  assert.equal(plan.mutationPerformed, false);
});

test("three changed functions preserve metadata, OIDs, rows, writer controls and worker state", () => {
  const r = review();
  frozen.assertFrozenQuantityTransition(r, observation(r), observation(r, true));
  const altered = observation(r, true);
  altered.functions[1].oid++;
  assert.throws(() => frozen.assertFrozenQuantityTransition(r, observation(r), altered));
  const queued = observation(r);
  queued.worker.queued = 1;
  assert.throws(() => frozen.assertFrozenQuantityObservation(r, queued, "before"));
});

test("committed receipt binds DB239 predecessor; unknown commit cannot fall back or retry", () => {
  const r = review();
  frozen.assertFrozenQuantityDatabaseReceipt(r, receipt(r), sha("e"));
  assert.equal(frozen.frozenQuantityTerminalStatus(r, receipt(r), sha("e")), "committed");
  const unknown = { ...receipt(r), status: "unknown" };
  assert.throws(() => frozen.frozenQuantityTerminalStatus(r, unknown, sha("e")), /retain240 guard, no239 fallback/);
  const forged = receipt(r);
  forged.predecessorMaintenance.receipt.sha256 = sha("f");
  assert.throws(() => frozen.assertFrozenQuantityDatabaseReceipt(r, forged, sha("e")));
});

test("unbound operating PIN blocks config or target access", () => {
  assert.deepEqual(frozen.FROZEN_QUANTITY_REVIEW_PIN, { path: null, sha256: null });
  assert.throws(() => frozen.assertFrozenQuantityOperatingPin(), /PIN is unbound.*no config\/target I\/O/);
});
