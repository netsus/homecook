import {createHash} from "node:crypto";
import * as candidate from "../../scripts/lib/cooked-weight-mass-proxy-maintenance.mjs";
import {SAVED_RECIPE_NUTRITION_REVIEW_PIN}from "../../scripts/lib/saved-recipe-nutrition-maintenance.mjs";
import {PROTECTED_CATALOG_SQL}from "../../scripts/lib/prelaunch-database.mjs";
const hash = value => createHash("sha256").update(value).digest("hex"), sha = value => value.repeat(64);
const source = candidate.massProxySourceManifest(), target = { synthetic: true, owned: true };
const queryHash = hash(candidate.MASS_PROXY_FUNCTIONS_SQL);
function images(after = false, observed = false) {
  return candidate.MASS_PROXY_FUNCTIONS.map((signature, index) => ({ signature, owner: "postgres", acl: [["postgres", "EXECUTE", false, "postgres"]],
    config: ["search_path=pg_catalog, public, private, pg_temp"], language: "plpgsql", securityDefiner: true, volatility: "v", parallel: "u", strict: false, noCallerGrants: true,
    definitionSha256: sha(after ? "2" : "1"), sourceMd5: (after ? "d" : "c").repeat(32), metadataSha256: sha("3"), metadataWithoutLanguageSha256: sha("4"), ...(observed ? { oid: 100 + index } : {}) }));
}
function review() {
  const pointer = name => ({ path: `/tmp/synthetic239/${name}.json`, sha256: sha("a") });
  return { schema: "homecook.prelaunch-protected-rollout-review.v1", feature: candidate.MASS_PROXY_FEATURE, from: source.from, to: source.to, files: structuredClone(source.files),
    approved: { database: true, reader: false, writerOn: false }, databasePrecedesReader: true, readerPrecedesDatabase: false, legacyReaderCompatible: true, preserveExistingWriterControls: true,
    isolatedEvidence: pointer("isolated"), isolatedEvidenceSha256: sha("a"), legacyReaderEvidence: pointer("legacy"), platformInventory: pointer("inventory"), backupReadiness: pointer("readiness"), postimages: pointer("postimages"),
    closedArtifactSha256: sha("1"), closedReviewSha256: sha("2"), historicalProofsSha256: sha("3"), controlSha256: sha("4"), legacyMarkerDatabasePlanSha256:sha("5"),consentGeneration:1,
    operator:{ref:"f".repeat(40),files:candidate.massProxyOperatorImages(process.cwd())},
    legacyReader: { ref: source.from, buildId: "synthetic-no-running-web", plistSha256: sha("5") },
    predecessorMaintenance: { schema: "homecook.saved-recipe-nutrition-maintenance.v1", ledgerCount: 238, reviewSha256: SAVED_RECIPE_NUTRITION_REVIEW_PIN.sha256,
      receipt: pointer("original238"), databasePlanSha256: hash(JSON.stringify({ source: source.before, applied: source.before })), targetSha256: hash(JSON.stringify(target)) },
    database: { configPath: "/tmp/synthetic239/nonexistent.env", configSha256: sha("1"), targetSha256: hash(JSON.stringify(target)), before: structuredClone(source.before),
      after: [...structuredClone(source.before), { filename: candidate.MASS_PROXY_MIGRATION.filename, sha256: candidate.MASS_PROXY_MIGRATION.rawSha256 }], migrations: [{ ...candidate.MASS_PROXY_MIGRATION }],
      beforeCatalogSha256: sha("1"), immutableSha256: sha("2"), stableImmutableSha256: sha("3"), unchangedCatalogSha256: sha("4"), normalProjectionSha256: "042ebf3f976b20cc696da8da05b7eef61bc5c1da81cbe046fc5c67c63e2550ed", executionTableSha256: sha("6"),
      functionQuerySha256: queryHash, unchangedQuerySha256: hash(candidate.unchangedMassProxyCatalogSql(PROTECTED_CATALOG_SQL)), functionsBefore: images(), functionsAfter: images(true),
      functionOids: candidate.MASS_PROXY_FUNCTIONS.map((signature, index) => [signature, 100 + index]), scopeLink: { outerOid: 201, aliasOid: 202 },
      workerBaseline: { credentialGeneration: 50, workerPolicyEnabled: true, workerReleaseSha: "1be5eeea5dd946d8a54edf6c5fd0c3c28d1815fa", catalogFingerprint: "de001df9981d361130136e2dff184665ec5280e82a857aa4e0e6cd593848af05", schemaIdentity: "youtube-extraction-worker-schema-v2", credentialRowSha256: sha("7"), policyRowSha256: sha("8"), policyStableSha256: sha("9"), snapshotDigest: sha("a") } } };
}
function observation(r, after = false) {
  const db = r.database;
  return { target, ledger: structuredClone(after ? db.after : db.before), ledgerAuthority: true, active: false, catalogSha256: after ? sha("b") : db.beforeCatalogSha256,
    immutableSha256: db.immutableSha256, stableImmutableSha256: db.stableImmutableSha256, unchangedCatalogSha256: db.unchangedCatalogSha256, normalProjectionSha256: db.normalProjectionSha256, executionTableSha256: db.executionTableSha256,
    normalDataSha256: sha("5"), preservedRowsSha256: sha("6"), attestationRowsSha256: sha("7"), controlsSha256: sha("8"), executionRowsSha256: sha("9"), ledgerPreservedRowsSha256: sha("a"),
    functions: images(after, true), scopeLink: structuredClone(db.scopeLink), productWriterEnabled: true, cookedWeightWriterEnabled: true, quantityWriterEnabled: true,
    worker: { ...db.workerBaseline, credentialActive: true, queued: 0, processing: 0, permitHeld: false, activeEnqueueSessions: 0 } };
}

export {hash,sha,source,target,images,review,observation};
