// Inert DB239 contract candidate. Not registered in the CLI or database engine.
// A separate create-only operating review must precede binding this new PIN.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { SAVED_RECIPE_NUTRITION_REVIEW_PIN, SAVED_RECIPE_NUTRITION_FUNCTIONS_SQL } from "./saved-recipe-nutrition-maintenance.mjs";
import { SAVED_RECIPE_NUTRITION_FUNCTION_SIGNATURES } from "./saved-recipe-nutrition-catalog.mjs";

export const MASS_PROXY_FEATURE = "cooked-weight-mass-proxy";
export const MASS_PROXY_REVIEW_PIN = Object.freeze({ path: null, sha256: null });
export const MASS_PROXY_MIGRATION = Object.freeze({
  filename: "20261020210000_cooked_weight_mass_proxy.sql",
  rawSha256: "ea827e50ba5fefb4cbf992fb7ad7b32d8e123679576e3eb7e1a119ba3c203e9d",
  payloadSha256: "5f27a63f035f777036a912d2807fdee75de478ebebec9861d471be1c2bd8d7b8",
});
export const MASS_PROXY_FUNCTIONS = Object.freeze([
  "private.record_cooked_weight_evidence(uuid,uuid,bigint,bigint,text,timestamp with time zone)",
  "public.complete_snapshot_v2_cooking_session_with_weight_evidence(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,uuid,uuid[],text,numeric,text,jsonb,boolean,timestamp with time zone)",
]);
const hash = value => createHash("sha256").update(value).digest("hex");
const check = (ok, message) => { if (!ok) throw new Error(`Mass proxy239 exact candidate: ${message}`); };
const SHA = /^[a-f0-9]{64}$/u;
const keys = value => Object.keys(value ?? {}).sort().join();
const pointer = value => keys(value) === "path,sha256" && isAbsolute(value.path ?? "") && SHA.test(value.sha256 ?? "");
const sourceBytes = readFileSync(new URL("./cooked-weight-mass-proxy-source.json", import.meta.url));
check(hash(sourceBytes) === "31e7f35ceeb892559fe261d96a83ada5b6f6916304ab9b909f3b94f1130ec283", "fixed source manifest bytes differ");
const source = JSON.parse(sourceBytes);
export const massProxySourceManifest = () => structuredClone(source);
const after = [...source.before, { filename: MASS_PROXY_MIGRATION.filename, sha256: MASS_PROXY_MIGRATION.rawSha256 }];

// Preserve the established portable metadata query, including grantor/defaults,
// while selecting exactly the two functions whose bodies this SQL replaces.
const oldSignatures = SAVED_RECIPE_NUTRITION_FUNCTION_SIGNATURES.map(signature => `'${signature}'`).join(",");
const newSignatures = MASS_PROXY_FUNCTIONS.map(signature => `'${signature}'`).join(",");
check(SAVED_RECIPE_NUTRITION_FUNCTIONS_SQL.split(oldSignatures).length === 2, "existing function query anchor differs");
export const MASS_PROXY_FUNCTIONS_SQL = SAVED_RECIPE_NUTRITION_FUNCTIONS_SQL.replace(oldSignatures, newSignatures);
export function unchangedMassProxyCatalogSql(sql) {
  check(typeof sql === "string" && hash(sql) === "2e7deb2361f3311aab30aea9687af3b296780c9543b273ec71526ef9c524c399", "fixed complete catalog query required");
  const anchor = "AND n.nspname IN ('public','private','auth'))";
  check(sql.split(anchor).length === 2, "catalog anchor differs");
  const omit = MASS_PROXY_FUNCTIONS.map(signature => `to_regprocedure('${signature}')`).join(",");
  return sql.replace(anchor, `AND n.nspname IN ('public','private','auth') AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY[${omit}]::oid[]) allowed(oid) WHERE allowed.oid=p.oid))`);
}

const IMAGE_KEYS = "acl,config,definitionSha256,language,metadataSha256,metadataWithoutLanguageSha256,noCallerGrants,owner,parallel,securityDefiner,signature,sourceMd5,strict,volatility";
const image = row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "oid"));
function functionImages(rows, observed = false) {
  check(Array.isArray(rows) && rows.length === 2 && isDeepStrictEqual(rows.map(row => row?.signature), MASS_PROXY_FUNCTIONS), "exact ordered two function images required");
  for (const row of rows) check(keys(image(row)) === IMAGE_KEYS
    && ["definitionSha256", "metadataSha256", "metadataWithoutLanguageSha256"].every(key => SHA.test(row[key] ?? ""))
    && /^[a-f0-9]{32}$/u.test(row.sourceMd5 ?? "") && row.owner === "postgres" && row.language === "plpgsql"
    && Array.isArray(row.acl) && Array.isArray(row.config) && row.securityDefiner === true && row.volatility === "v"
    && typeof row.strict === "boolean" && typeof row.noCallerGrants === "boolean" && ["s", "r", "u"].includes(row.parallel)
    && (observed ? keys(row) === `${IMAGE_KEYS},oid`.split(",").sort().join() && Number.isSafeInteger(row.oid) && row.oid > 0 : !Object.hasOwn(row, "oid")), "function metadata shape differs");
}
function sameMetadata(before, next) {
  const withoutBody = row => Object.fromEntries(Object.entries(image(row)).filter(([key]) => !["definitionSha256", "sourceMd5"].includes(key)));
  check(isDeepStrictEqual(withoutBody(before), withoutBody(next)), "owner/ACL/grantor/settings/security/metadata changed");
}
const preserved = ["unchangedCatalogSha256", "normalDataSha256", "preservedRowsSha256", "attestationRowsSha256", "controlsSha256", "executionRowsSha256", "ledgerPreservedRowsSha256", "executionTableSha256"];
export function assertMassProxyReview(review) {
  check(review?.schema === "homecook.prelaunch-protected-rollout-review.v1" && review.feature === MASS_PROXY_FEATURE
    && review.from === source.from && review.to === source.to && isDeepStrictEqual(review.files, source.files), "fixed complete app source pair required");
  check(isDeepStrictEqual(review.approved, { database: true, reader: false, writerOn: false }) && review.databasePrecedesReader === true
    && review.readerPrecedesDatabase === false && review.legacyReaderCompatible === true && review.preserveExistingWriterControls === true, "DB-first compatibility with unchanged writer controls required");
  for (const key of ["isolatedEvidence", "legacyReaderEvidence", "platformInventory", "backupReadiness", "postimages"]) check(pointer(review[key]), `${key} evidence pointer required`);
  check(review.isolatedEvidenceSha256 === review.isolatedEvidence.sha256 && ["closedArtifactSha256", "closedReviewSha256", "historicalProofsSha256", "controlSha256"].every(key => SHA.test(review[key] ?? "")), "existing closed-R2 authority binding required");
  check(review.legacyReader?.ref === source.from && typeof review.legacyReader.buildId === "string" && review.legacyReader.buildId.length > 0
    && SHA.test(review.legacyReader.plistSha256 ?? ""), "current reader/build/plist binding required");
  const db = review.database, predecessor = review.predecessorMaintenance;
  check(predecessor?.schema === "homecook.saved-recipe-nutrition-maintenance.v1" && predecessor.ledgerCount === 238
    && predecessor.reviewSha256 === SAVED_RECIPE_NUTRITION_REVIEW_PIN.sha256 && pointer(predecessor.receipt)
    && predecessor.databasePlanSha256 === hash(JSON.stringify({ source: source.before, applied: source.before }))
    && SHA.test(predecessor.targetSha256 ?? ""), "original committed238 predecessor binding required");
  check(db && isDeepStrictEqual(db.before, source.before) && isDeepStrictEqual(db.after, after)
    && isDeepStrictEqual(db.migrations, [MASS_PROXY_MIGRATION]) && db.targetSha256 === predecessor.targetSha256, "exact238 prefix and single239 extension required");
  check(isAbsolute(db.configPath ?? "") && ["configSha256", "targetSha256", "beforeCatalogSha256", "immutableSha256", "stableImmutableSha256", "unchangedCatalogSha256", "normalProjectionSha256", "executionTableSha256", "functionQuerySha256", "unchangedQuerySha256"].every(key => SHA.test(db[key] ?? ""))
    && db.functionQuerySha256 === hash(MASS_PROXY_FUNCTIONS_SQL)
    && db.unchangedQuerySha256 === "930fbf947e96dd97b98e4e0b552ec17866276f71e0ed6191284ab632f8411e41"
    && db.normalProjectionSha256 === "042ebf3f976b20cc696da8da05b7eef61bc5c1da81cbe046fc5c67c63e2550ed", "fixed target/query/catalog metadata required");
  functionImages(db.functionsBefore); functionImages(db.functionsAfter);
  for (let i = 0; i < 2; i++) {
    sameMetadata(db.functionsBefore[i], db.functionsAfter[i]);
    check(db.functionsBefore[i].definitionSha256 !== db.functionsAfter[i].definitionSha256, "both reviewed function bodies must change");
  }
  check(Array.isArray(db.functionOids) && db.functionOids.length === 2 && isDeepStrictEqual(db.functionOids.map(row => row?.[0]), MASS_PROXY_FUNCTIONS)
    && db.functionOids.every(row => row.length === 2 && Number.isSafeInteger(row[1]) && row[1] > 0) && db.functionOids[0][1] !== db.functionOids[1][1], "original two function OIDs required");
  check(keys(db.scopeLink) === "aliasOid,outerOid" && Object.values(db.scopeLink).every(oid => Number.isSafeInteger(oid) && oid > 0)
    && db.scopeLink.aliasOid !== db.scopeLink.outerOid, "unchanged original scope OIDs required");
  check(db.workerBaseline?.credentialGeneration === 50 && db.workerBaseline.workerPolicyEnabled === true
    && db.workerBaseline.workerReleaseSha === "1be5eeea5dd946d8a54edf6c5fd0c3c28d1815fa"
    && db.workerBaseline.catalogFingerprint === "de001df9981d361130136e2dff184665ec5280e82a857aa4e0e6cd593848af05"
    && db.workerBaseline.schemaIdentity === "youtube-extraction-worker-schema-v2"
    && ["credentialRowSha256", "policyRowSha256", "policyStableSha256", "snapshotDigest"].every(key => SHA.test(db.workerBaseline[key] ?? "")), "same gen50 worker authority required");
  return review;
}

export function planMassProxyMigration(review, migrations) {
  assertMassProxyReview(review);
  check(Array.isArray(migrations) && isDeepStrictEqual(migrations.map(({ filename, sha256 }) => ({ filename, sha256 })), after), "complete exact239 source required");
  for (const row of migrations) check(Buffer.isBuffer(row.bytes) && hash(row.bytes) === row.sha256, "migration source bytes differ");
  const row = migrations[238];
  const sql = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(row.bytes);
  const prefix = "-- Local candidate only. No tables, grants, owner, authentication or operational data changes.\n-- Deploy with the matching web change after separate release approval.\n";
  check(sql.startsWith(prefix), "fixed SQL prefix required");
  const envelope = sql.slice(prefix.length);
  check(envelope.startsWith("begin;\n") && envelope.endsWith("\ncommit;\n"), "operator-owned outer transaction required");
  const payload = envelope.slice("begin;\n".length, -"\ncommit;\n".length);
  check(hash(payload) === MASS_PROXY_MIGRATION.payloadSha256, "fixed SQL payload differs");
  return { before: structuredClone(source.before), after: structuredClone(after), pending: [{ filename: row.filename, sha256: row.sha256, payload, actor: "postgres" }], mutationPerformed: false };
}

export function assertMassProxyObservation(review, observation, phase) {
  assertMassProxyReview(review);
  check(["before", "after"].includes(phase), "known observation phase required");
  const db = review.database;
  check(hash(JSON.stringify(observation?.target)) === db.targetSha256 && isDeepStrictEqual(observation.ledger, phase === "before" ? db.before : db.after)
    && observation.ledgerAuthority === true && observation.active === false, "target/ledger authority or idle state differs");
  for (const key of ["catalogSha256", "immutableSha256", "stableImmutableSha256", ...preserved]) check(SHA.test(observation[key] ?? ""), `${key} observation missing`);
  check((phase !== "before" || observation.catalogSha256 === db.beforeCatalogSha256)
    && ["immutableSha256", "stableImmutableSha256", "unchangedCatalogSha256", "normalProjectionSha256", "executionTableSha256"].every(key => observation[key] === db[key]), "complete unchanged catalog/metadata differs");
  functionImages(observation.functions, true);
  check(isDeepStrictEqual(observation.functions.map(image), db[phase === "before" ? "functionsBefore" : "functionsAfter"])
    && isDeepStrictEqual(observation.functions.map(row => [row.signature, row.oid]), db.functionOids)
    && isDeepStrictEqual(observation.scopeLink, db.scopeLink), "function image/OID or scope identity differs");
  check(["productWriterEnabled", "cookedWeightWriterEnabled", "quantityWriterEnabled"].every(key => observation[key] === true), "existing writer state differs");
  const worker = observation.worker;
  check(worker && Object.entries(db.workerBaseline).every(([key, value]) => isDeepStrictEqual(worker[key], value)) && worker.credentialActive === true
    && worker.queued === 0 && worker.processing === 0 && worker.permitHeld === false && worker.activeEnqueueSessions === 0, "worker authority or drained state differs");
  return observation;
}
export function assertMassProxyTransition(review, before, next) {
  assertMassProxyObservation(review, before, "before"); assertMassProxyObservation(review, next, "after");
  for (const key of preserved) check(before[key] === next[key], `${key} changed inside the transaction`);
  check(isDeepStrictEqual(before.scopeLink, next.scopeLink), "scope OID changed inside the transaction");
  return next;
}

// Pure receipt checking is not a review loader: a future operating caller must
// obtain reviewSha256 from the fixed, verified PIN, never from a CLI argument.
export function assertMassProxyAttempt(review, record, reviewSha256) {
  assertMassProxyReview(review);
  check(SHA.test(reviewSha256 ?? "") && record?.schema === "homecook.prelaunch-protected-db-attempt.v1"
    && record.feature === MASS_PROXY_FEATURE && record.reviewSha256 === reviewSha256
    && record.from === review.from && record.to === review.to && record.readerFloor === review.to
    && record.journalFile === "attempt.json" && isDeepStrictEqual(record.predecessorMaintenance, review.predecessorMaintenance), "separate239 attempt and original238 predecessor required");
  check(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(record.operationId ?? "")
    && record.applicationName === `protected-mass-proxy-${record.operationId}`, "fixed operation identity required");
  check(["applying_precommit", "commit_dispatch_guard", "rolled_back_before_commit", "unknown", "committed", "not_applied"].includes(record.status), "known attempt status required");
  check(["committed", "not_applied"].includes(record.status) ? record.targetSha256 === review.database.targetSha256
    : hash(JSON.stringify(record.target)) === review.database.targetSha256, "exact attempt target required");
  return record;
}
export function assertMassProxyDatabaseReceipt(review, record, reviewSha256) {
  assertMassProxyAttempt(review, record, reviewSha256);
  const db = review.database;
  check(record.status === "committed" && record.databasePlanSha256 === hash(JSON.stringify({ source: db.after, applied: db.after }))
    && record.readerReady === false && record.writerEnabled === false && record.legacyReaderCompatible === true
    && record.rowsPreservedInTransaction === true && record.controlsPreservedInTransaction === true
    && record.featureMetadataPreservedInTransaction === true && record.scopeAliasOidPreservedInTransaction === true, "original commit and preservation intent required");
  for (const key of ["catalogSha256", "immutableSha256", "stableImmutableSha256", ...preserved]) check(SHA.test(record[key] ?? ""), `${key} receipt missing`);
  check(["immutableSha256", "stableImmutableSha256", "unchangedCatalogSha256", "normalProjectionSha256", "executionTableSha256"].every(key => record[key] === db[key])
    && isDeepStrictEqual(record.functionOids, db.functionOids) && isDeepStrictEqual(record.scopeLink, db.scopeLink), "committed catalog/metadata/OID intent differs");
  check(keys(record.nativePostCatalog) === "catalogSha256,immutableSha256,stableImmutableSha256"
    && Object.entries(record.nativePostCatalog).every(([key, value]) => SHA.test(value ?? "") && record[key] === value), "transaction-native postimage intent required");
  check(record.backup?.fullArchiveDecoded === true && [record.backup.sha256, record.backup.rolesSha256].every(value => SHA.test(value ?? ""))
    && hash(JSON.stringify(record.backup.target)) === db.targetSha256
    && /^[0-9A-F]+-[0-9A-F]+-[0-9]+$/u.test(record.backup.snapshot ?? ""), "original exported snapshot/decoded archive/roles required");
  return record;
}
export function massProxyTerminalStatus(review, record, reviewSha256) {
  assertMassProxyAttempt(review, record, reviewSha256);
  if (record.status === "committed") { assertMassProxyDatabaseReceipt(review, record, reviewSha256); return "committed"; }
  if (record.status === "not_applied") return "not_applied";
  throw new Error("Mass proxy239 outcome unresolved; retain239 guard, no238 fallback or automatic retry");
}

// This deliberately fails before any config, private review, target or key I/O.
// It must not be replaced by a caller-supplied PIN, environment flag or CLI path.
export function assertMassProxyOperatingPin() {
  check(pointer(MASS_PROXY_REVIEW_PIN), "new operating review PIN is unbound; no config/target I/O permitted");
  return MASS_PROXY_REVIEW_PIN;
}
