// Exact DB240 successor. A separate create-only operating review must precede
// binding this new PIN; historical DB239 and closed-R2 authority is unchanged.
import { currentGen51Baseline } from "./worker-gen51-renewal-authority.mjs";
import { assertGen51CompatOperator } from "./worker-gen51-compat-source.mjs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { MASS_PROXY_REVIEW_PIN, MASS_PROXY_FUNCTIONS, MASS_PROXY_FUNCTIONS_SQL, canonicalMassProxyOperatorText } from "./cooked-weight-mass-proxy-maintenance.mjs";

export const FROZEN_QUANTITY_FEATURE = "saved-frozen-quantity";
export const FROZEN_QUANTITY_REVIEW_PIN = Object.freeze({"path":"/Users/cwj/Documents/Codex/2026-10-20/task/db240-review-private-LdQoql/approved-saved-frozen-quantity-review-v4.json","sha256":"7ab0512b512ce3ef897e62af09e90d1972bf0c111fbb0c9432bab5347ee434bd"});
export const FROZEN_QUANTITY_MIGRATION = Object.freeze({
  filename: "20261022120000_youtube_saved_nutrition_frozen_quantity.sql",
  rawSha256: "7e57ea065e0b688d9c9329a040249b58eb9c0bb177c9cae39b9b1bcc31c526f3",
  payloadSha256: "6794125ac5cf0c1071fd6734bd34062a1c9c636150f78448c44af82f45904dd2",
});
export const FROZEN_QUANTITY_FUNCTIONS = Object.freeze([
  "public.build_recipe_nutrition_input_guard(uuid)",
  "public.validate_recipe_nutrition_snapshot_payload(jsonb)",
  "public.write_recipe_nutrition_snapshot(uuid,jsonb,timestamp with time zone,jsonb)",
]);
const hash = value => createHash("sha256").update(value).digest("hex");
const check = (ok, message) => { if (!ok) throw new Error(`Frozen quantity240 exact candidate: ${message}`); };
const SHA = /^[a-f0-9]{64}$/u;
const keys = value => Object.keys(value ?? {}).sort().join();
const pointer = value => keys(value) === "path,sha256" && isAbsolute(value.path ?? "") && SHA.test(value.sha256 ?? "");
const sourceBytes = readFileSync(new URL("./saved-frozen-quantity-source.json", import.meta.url));
check(hash(sourceBytes) === "707de935ba0066bc3de590d14f6f5eb9a7dc3ac46d9ac9df6a1afd48315bd111", "fixed source manifest bytes differ");
const source = JSON.parse(sourceBytes);
export const frozenQuantitySourceManifest = () => structuredClone(source);
const after = [...source.before, { filename: FROZEN_QUANTITY_MIGRATION.filename, sha256: FROZEN_QUANTITY_MIGRATION.rawSha256 }];
const operatorFiles = ["scripts/deploy-prelaunch-web.mjs", "scripts/lib/prelaunch-web-deploy.mjs", "scripts/lib/prelaunch-database.mjs", "scripts/lib/saved-frozen-quantity-maintenance.mjs", "scripts/lib/saved-frozen-quantity-source.json"];
export function canonicalFrozenQuantityOperatorText(text) {
  const declaration=/^export const FROZEN_QUANTITY_REVIEW_PIN = Object\.freeze\((\{[^\n]*\})\);$/gmu;
  const matches=[...text.matchAll(declaration)];
  check(matches.length===1,"operator PIN declaration differs");
  const literal=matches[0][1];
  if(literal!=="{ path: null, sha256: null }") {
    let value;try{value=JSON.parse(literal);}catch{check(false,"operator PIN must use a static JSON literal");}
    check(pointer(value),"operator PIN must contain only static path/SHA strings");
  }
  return text.replace(declaration,"export const FROZEN_QUANTITY_REVIEW_PIN = Object.freeze({ path: null, sha256: null });");
}
export function frozenQuantityOperatorImages(repositoryRoot) {
  return Object.fromEntries(operatorFiles.map(file => {
    let bytes = readFileSync(join(repositoryRoot, file));
    if (file.endsWith("/saved-frozen-quantity-maintenance.mjs")) {
      bytes = Buffer.from(canonicalFrozenQuantityOperatorText(bytes.toString("utf8")));
    }
    return [file, hash(bytes)];
  }));
}
export function assertFrozenQuantityOperatorSource(review, repositoryRoot) {
  check(realpathSync(repositoryRoot)===realpathSync(fileURLToPath(new URL("../../",import.meta.url))),"executed operator root differs from selected repository");
  if (!isDeepStrictEqual(frozenQuantityOperatorImages(repositoryRoot), review.operator.files))
    assertGen51CompatOperator(review, repositoryRoot, canonicalFrozenQuantityOperatorText);
}

// A DB240 successor may read its committed DB239 predecessor without executing
// or re-authorizing the old operator. DB239 mutation paths keep their original
// current-operator assertion and therefore cannot run from these new bytes.
export function assertFrozenQuantityHistoricalMassProxyOperator(review, repositoryRoot) {
  check(realpathSync(repositoryRoot)===realpathSync(fileURLToPath(new URL("../../",import.meta.url))),"historical operator repository differs");
  check(/^[a-f0-9]{40}$/u.test(review?.operator?.ref ?? "") && review.operator.ref === "a7c8333db67caffdef6fad9199be538110d10a91", "exact committed239 operator ref required");
  const files=Object.keys(review.operator.files).sort();
  check(isDeepStrictEqual(files,["scripts/deploy-prelaunch-web.mjs","scripts/lib/cooked-weight-mass-proxy-maintenance.mjs","scripts/lib/cooked-weight-mass-proxy-source.json","scripts/lib/prelaunch-database.mjs","scripts/lib/prelaunch-web-deploy.mjs"].sort()),"historical operator file set differs");
  for(const file of files){
    const bytes=execFileSync("git",["-C",repositoryRoot,"show",`${review.operator.ref}:${file}`],{maxBuffer:4*1024*1024,stdio:["ignore","pipe","ignore"]});
    const canonical=file==="scripts/lib/cooked-weight-mass-proxy-maintenance.mjs"?Buffer.from(canonicalMassProxyOperatorText(bytes.toString("utf8"))):bytes;
    check(hash(canonical)===review.operator.files[file],"historical DB239 operator blob differs");
  }
  return true;
}

// Preserve the established portable metadata query, including grantor/defaults,
// while selecting exactly the one function whose body this SQL replaces.
const oldSignatures = MASS_PROXY_FUNCTIONS.map(signature => `'${signature}'`).join(",");
const newSignatures = FROZEN_QUANTITY_FUNCTIONS.map(signature => `'${signature}'`).join(",");
check(MASS_PROXY_FUNCTIONS_SQL.split(oldSignatures).length === 2, "existing function query anchor differs");
export const FROZEN_QUANTITY_FUNCTIONS_SQL = MASS_PROXY_FUNCTIONS_SQL.replace(oldSignatures, newSignatures);
export function unchangedFrozenQuantityCatalogSql(sql) {
  check(typeof sql === "string" && hash(sql) === "2e7deb2361f3311aab30aea9687af3b296780c9543b273ec71526ef9c524c399", "fixed complete catalog query required");
  const anchor = "AND n.nspname IN ('public','private','auth'))";
  check(sql.split(anchor).length === 2, "catalog anchor differs");
  const omit = FROZEN_QUANTITY_FUNCTIONS.map(signature => `to_regprocedure('${signature}')`).join(",");
  return sql.replace(anchor, `AND n.nspname IN ('public','private','auth') AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY[${omit}]::oid[]) allowed(oid) WHERE allowed.oid=p.oid))`);
}

const IMAGE_KEYS = "acl,config,definitionSha256,language,metadataSha256,metadataWithoutLanguageSha256,noCallerGrants,owner,parallel,securityDefiner,signature,sourceMd5,strict,volatility";
const image = row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "oid"));
function functionImages(rows, observed = false) {
  check(Array.isArray(rows) && rows.length === 3 && isDeepStrictEqual(rows.map(row => row?.signature), FROZEN_QUANTITY_FUNCTIONS), "exact ordered function images required");
  for (const row of rows) check(keys(image(row)) === IMAGE_KEYS
    && ["definitionSha256", "metadataSha256", "metadataWithoutLanguageSha256"].every(key => SHA.test(row[key] ?? ""))
    && /^[a-f0-9]{32}$/u.test(row.sourceMd5 ?? "") && row.owner === "postgres" && row.language === "plpgsql"
    && Array.isArray(row.acl) && Array.isArray(row.config)
    && row.securityDefiner === (row.signature !== FROZEN_QUANTITY_FUNCTIONS[1])
    && row.volatility === (row.signature === FROZEN_QUANTITY_FUNCTIONS[0] ? "s" : "v")
    && typeof row.strict === "boolean" && typeof row.noCallerGrants === "boolean" && ["s", "r", "u"].includes(row.parallel)
    && (observed ? keys(row) === `${IMAGE_KEYS},oid`.split(",").sort().join() && Number.isSafeInteger(row.oid) && row.oid > 0 : !Object.hasOwn(row, "oid")), "function metadata shape differs");
}
function sameMetadata(before, next) {
  const withoutBody = row => Object.fromEntries(Object.entries(image(row)).filter(([key]) => !["definitionSha256", "sourceMd5"].includes(key)));
  check(isDeepStrictEqual(withoutBody(before), withoutBody(next)), "owner/ACL/grantor/settings/security/metadata changed");
}
const preserved = ["unchangedCatalogSha256", "normalDataSha256", "preservedRowsSha256", "attestationRowsSha256", "controlsSha256", "executionRowsSha256", "ledgerPreservedRowsSha256", "executionTableSha256"];
export function assertFrozenQuantityReview(review) {
  check(review?.schema === "homecook.prelaunch-protected-rollout-review.v1" && review.feature === FROZEN_QUANTITY_FEATURE
    && review.from === source.from && review.to === source.to && isDeepStrictEqual(review.files, source.files), "fixed complete app source pair required");
  check(/^[a-f0-9]{40}$/u.test(review.operator?.ref ?? "") && isDeepStrictEqual(Object.keys(review.operator?.files ?? {}).sort(), [...operatorFiles].sort())
    && Object.values(review.operator.files).every(value => SHA.test(value ?? "")), "exact separate operator source required");
  check(isDeepStrictEqual(review.approved, { database: true, reader: false, writerOn: false }) && review.databasePrecedesReader === true
    && review.readerPrecedesDatabase === false && review.legacyReaderCompatible === true && review.preserveExistingWriterControls === true, "DB-first compatibility with unchanged writer controls required");
  for (const key of ["isolatedEvidence", "legacyReaderEvidence", "platformInventory", "backupReadiness", "postimages"]) check(pointer(review[key]), `${key} evidence pointer required`);
  check(review.isolatedEvidenceSha256 === review.isolatedEvidence.sha256 && ["closedArtifactSha256", "closedReviewSha256", "historicalProofsSha256", "controlSha256", "legacyMarkerDatabasePlanSha256"].every(key => SHA.test(review[key] ?? ""))
    && Number.isSafeInteger(review.consentGeneration) && review.consentGeneration>0, "existing closed-R2 authority binding required");
  check(review.legacyReader?.ref === source.from && typeof review.legacyReader.buildId === "string" && review.legacyReader.buildId.length > 0
    && SHA.test(review.legacyReader.plistSha256 ?? ""), "current reader/build/plist binding required");
  const db = review.database, predecessor = review.predecessorMaintenance;
  check(predecessor?.schema === "homecook.cooked-weight-mass-proxy-maintenance.v1" && predecessor.ledgerCount === 239
    && predecessor.reviewSha256 === MASS_PROXY_REVIEW_PIN.sha256 && pointer(predecessor.receipt)
    && predecessor.databasePlanSha256 === hash(JSON.stringify({ source: source.before, applied: source.before }))
    && SHA.test(predecessor.targetSha256 ?? ""), "original committed239 predecessor binding required");
  check(db && isDeepStrictEqual(db.before, source.before) && isDeepStrictEqual(db.after, after)
    && isDeepStrictEqual(db.migrations, [FROZEN_QUANTITY_MIGRATION]) && db.targetSha256 === predecessor.targetSha256, "exact239 prefix and single240 extension required");
  check(isAbsolute(db.configPath ?? "") && ["configSha256", "targetSha256", "beforeCatalogSha256", "immutableSha256", "stableImmutableSha256", "unchangedCatalogSha256", "normalProjectionSha256", "executionTableSha256", "functionQuerySha256", "unchangedQuerySha256"].every(key => SHA.test(db[key] ?? ""))
    && db.functionQuerySha256 === hash(FROZEN_QUANTITY_FUNCTIONS_SQL)
    && db.unchangedQuerySha256 === "8c94a45a22cd59d92be8992a682ab61eb69b7c758c33435151418afbc288ed49"
    && db.normalProjectionSha256 === "042ebf3f976b20cc696da8da05b7eef61bc5c1da81cbe046fc5c67c63e2550ed", "fixed target/query/catalog metadata required");
  functionImages(db.functionsBefore); functionImages(db.functionsAfter);
  for (let i = 0; i < 3; i++) {
    sameMetadata(db.functionsBefore[i], db.functionsAfter[i]);
    check(db.functionsBefore[i].definitionSha256 !== db.functionsAfter[i].definitionSha256, "reviewed function body must change");
  }
  check(Array.isArray(db.functionOids) && db.functionOids.length === 3 && isDeepStrictEqual(db.functionOids.map(row => row?.[0]), FROZEN_QUANTITY_FUNCTIONS)
    && db.functionOids.every(row => row.length === 2 && Number.isSafeInteger(row[1]) && row[1] > 0), "original function OID required");
  check(keys(db.scopeLink) === "aliasOid,outerOid" && Object.values(db.scopeLink).every(oid => Number.isSafeInteger(oid) && oid > 0)
    && db.scopeLink.aliasOid !== db.scopeLink.outerOid, "unchanged original scope OIDs required");
  check(db.workerBaseline?.credentialGeneration === 50 && db.workerBaseline.workerPolicyEnabled === true
    && db.workerBaseline.workerReleaseSha === "1be5eeea5dd946d8a54edf6c5fd0c3c28d1815fa"
    && db.workerBaseline.catalogFingerprint === "de001df9981d361130136e2dff184665ec5280e82a857aa4e0e6cd593848af05"
    && db.workerBaseline.schemaIdentity === "youtube-extraction-worker-schema-v2"
    && ["credentialRowSha256", "policyRowSha256", "policyStableSha256", "snapshotDigest"].every(key => SHA.test(db.workerBaseline[key] ?? "")), "same gen50 worker authority required");
  return review;
}

export function planFrozenQuantityMigration(review, migrations) {
  assertFrozenQuantityReview(review);
  check(Array.isArray(migrations) && isDeepStrictEqual(migrations.map(({ filename, sha256 }) => ({ filename, sha256 })), after), "complete exact240 source required");
  for (const row of migrations) check(Buffer.isBuffer(row.bytes) && hash(row.bytes) === row.sha256, "migration source bytes differ");
  const row = migrations[239];
  const sql = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(row.bytes);
  const envelope = sql;
  check(envelope.startsWith("begin;\n") && envelope.endsWith("\ncommit;\n"), "operator-owned outer transaction required");
  const payload = envelope.slice("begin;\n".length, -"\ncommit;\n".length);
  check(hash(payload) === FROZEN_QUANTITY_MIGRATION.payloadSha256, "fixed SQL payload differs");
  return { before: structuredClone(source.before), after: structuredClone(after), pending: [{ filename: row.filename, sha256: row.sha256, payload, actor: "postgres" }], mutationPerformed: false };
}

export function assertFrozenQuantityObservation(review, observation, phase, renewal = null) {
  assertFrozenQuantityReview(review);
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
  check(!renewal || phase === "after", "renewal cannot rewrite historical before evidence");
  const baseline = renewal ? currentGen51Baseline(renewal, db.workerBaseline) : db.workerBaseline;
  check(worker && Object.entries(baseline).every(([key, value]) => isDeepStrictEqual(worker[key], value)) && worker.credentialActive === true
    && worker.queued === 0 && worker.processing === 0 && worker.permitHeld === false && worker.activeEnqueueSessions === 0, "worker authority or drained state differs");
  return observation;
}
export function assertFrozenQuantityTransition(review, before, next) {
  assertFrozenQuantityObservation(review, before, "before"); assertFrozenQuantityObservation(review, next, "after");
  for (const key of preserved) check(before[key] === next[key], `${key} changed inside the transaction`);
  check(isDeepStrictEqual(before.scopeLink, next.scopeLink), "scope OID changed inside the transaction");
  return next;
}

// Pure receipt checking is not a review loader: a future operating caller must
// obtain reviewSha256 from the fixed, verified PIN, never from a CLI argument.
export function assertFrozenQuantityAttempt(review, record, reviewSha256) {
  assertFrozenQuantityReview(review);
  check(SHA.test(reviewSha256 ?? "") && record?.schema === "homecook.prelaunch-protected-db-attempt.v1"
    && record.feature === FROZEN_QUANTITY_FEATURE && record.reviewSha256 === reviewSha256
    && record.from === review.from && record.to === review.to && record.readerFloor === review.to
    && record.journalFile === "attempt.json" && isDeepStrictEqual(record.predecessorMaintenance, review.predecessorMaintenance), "separate240 attempt and original239 predecessor required");
  check(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(record.operationId ?? "")
    && record.applicationName === `protected-saved-frozen-quantity-${record.operationId}`, "fixed operation identity required");
  check(["applying_precommit", "commit_dispatch_guard", "rolled_back_before_commit", "unknown", "committed", "not_applied"].includes(record.status), "known attempt status required");
  check(["committed", "not_applied"].includes(record.status) ? record.targetSha256 === review.database.targetSha256
    : hash(JSON.stringify(record.target)) === review.database.targetSha256, "exact attempt target required");
  return record;
}
export function assertFrozenQuantityDatabaseReceipt(review, record, reviewSha256) {
  assertFrozenQuantityAttempt(review, record, reviewSha256);
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
export function frozenQuantityTerminalStatus(review, record, reviewSha256) {
  assertFrozenQuantityAttempt(review, record, reviewSha256);
  if (record.status === "committed") { assertFrozenQuantityDatabaseReceipt(review, record, reviewSha256); return "committed"; }
  if (record.status === "not_applied") return "not_applied";
  throw new Error("Frozen quantity240 outcome unresolved; retain240 guard, no239 fallback or automatic retry");
}

// This deliberately fails before any config, private review, target or key I/O.
// It must not be replaced by a caller-supplied PIN, environment flag or CLI path.
export function assertFrozenQuantityOperatingPin() {
  check(pointer(FROZEN_QUANTITY_REVIEW_PIN), "new operating review PIN is unbound; no config/target I/O permitted");
  return FROZEN_QUANTITY_REVIEW_PIN;
}
export function frozenQuantityBinding(maintenance) {
  assertFrozenQuantityOperatingPin();
  assertFrozenQuantityDatabaseReceipt(maintenance.review, maintenance.record, FROZEN_QUANTITY_REVIEW_PIN.sha256);
  check(pointer(maintenance.pointer) && pointer(maintenance.guardPointer) && maintenance.pointer.sha256 === maintenance.guardPointer.sha256, "terminal/guard bytes differ");
  return { schema: "homecook.saved-frozen-quantity-maintenance.v1", reviewSha256: FROZEN_QUANTITY_REVIEW_PIN.sha256,
    receipt: maintenance.pointer, ledgerCount: 240, targetSha256: maintenance.review.database.targetSha256,
    databasePlanSha256: maintenance.record.databasePlanSha256, sourceReaderRef: maintenance.review.from,
    readerFloor: maintenance.review.to, predecessorMaintenance: maintenance.review.predecessorMaintenance };
}
export function assertFrozenQuantitySourceHandoff({ maintenance, from, to, live, files, digests, reviewedSourceAncestor }) {
  frozenQuantityBinding(maintenance);
  const review = maintenance.review;
  check(from === review.from && to === review.to && live?.ref === from && live.buildId === review.legacyReader.buildId
    && live.plistSha256 === review.legacyReader.plistSha256 && reviewedSourceAncestor === true
    && isDeepStrictEqual([...files].sort(), Object.keys(review.files).sort()) && isDeepStrictEqual(digests, review.files), "exact committed240 app handoff required");
  return true;
}
export function frozenQuantityPhaseStatus(attempt, readerCompatible = false, legacyReaderCurrent = false) {
  const { review, record } = attempt;
  assertFrozenQuantityReview(review);
  const committed = record.status === "committed", unapplied = record.status === "not_applied";
  if (committed) assertFrozenQuantityDatabaseReceipt(review, record, FROZEN_QUANTITY_REVIEW_PIN.sha256);
  return { feature: FROZEN_QUANTITY_FEATURE, phase: record.status, appliedLedgerCount: committed ? 240 : unapplied ? 239 : null,
    databasePlanSha256: committed ? record.databasePlanSha256 : unapplied ? hash(JSON.stringify({ source: review.database.before, applied: review.database.before })) : null,
    databaseReady: committed, readerPending: committed && !readerCompatible,
    normalDeploymentAllowed: (committed || unapplied) && (readerCompatible || legacyReaderCurrent && review.legacyReaderCompatible),
    recoveryPending: !committed && !unapplied, rollbackAvailable: false, backwardCompatible: committed, readerFloor: committed ? review.to : null };
}
