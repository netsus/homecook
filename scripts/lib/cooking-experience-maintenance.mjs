import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { isAbsolute } from "node:path";

// Separate cooking authority. Publishing a real PIN is deliberately a later,
// reviewed step; neither an environment variable nor CLI option supplies it.
export const COOKING_CATALOG_MODE = "cooking-canonical-with-native-raw-remainder-v1";
export const COOKING_EXPERIENCE_FEATURE = "cooking-execution-experience";
export const COOKING_EXPERIENCE_REVIEW_PIN = Object.freeze({ path: "/Users/cwj/.homecook/operations/cooking-experience-deploy-20261019-eRvoMs/approved-cooking-experience-review.json", sha256: "13a4fbeca9d5dfb392bef017f8bb28f85479aecdd2ba60f941e1f3b57855cdaf" });
const SEALED_WORKER_CATALOG = "de001df9981d361130136e2dff184665ec5280e82a857aa4e0e6cd593848af05";
export const COOKING_EXPERIENCE_MIGRATIONS = Object.freeze([
  Object.freeze({ filename: "20261017210000_cooked_weight_mass_fallback.sql", sha256: "9709397e9031ca28a1ae6dbb934502ef9092ca7bc0d6ba96d568121672ac7f2e", prefix: "-- Extend model compatibility only; owner/state/idempotency/measurement gates stay intact.\n-- Requires schema+web release; existing evidence/observations are never rewritten.\n" }),
  Object.freeze({ filename: "20261017220000_cooking_execution_quantities.sql", sha256: "34b2947952f4eedb55234ddf330ca0029c080d7c8d887542e8880a56106cbaa6", prefix: "-- Personal execution quantities never alter the recipe or its immutable pins.\n" }),
  Object.freeze({ filename: "20261019090000_cooking_execution_reader_transaction.sql", sha256: "a24a54518783f89018645a7f9b827f97510f64e38a1ff68c2c2cd045cc213d32", prefix: "-- POST RPCs declared STABLE run in a read-only PostgREST transaction.\n-- The reader's unchanged session-authority checks acquire row locks.\n-- Keep those checks and the original migration; allow their locking transaction.\n" }),
]);
const SHA = /^[a-f0-9]{64}$/u, REF = /^[a-f0-9]{40}$/u;
const hash = value => createHash("sha256").update(value).digest("hex");
const check = (ok, message) => { if (!ok) throw new Error(`Cooking exact maintenance: ${message}`); };
const pointer = value => value && Object.keys(value).sort().join() === "path,sha256" && isAbsolute(value.path ?? "") && SHA.test(value.sha256 ?? "");
const migrationRows = rows => Array.isArray(rows) && rows.every(row => row && Object.keys(row).sort().join() === "filename,sha256"
  && /^[0-9]{14}_[A-Za-z0-9_-]+\.sql$/u.test(row.filename) && SHA.test(row.sha256))
  && new Set(rows.map(row => row.filename.slice(0, 14))).size === rows.length
  && isDeepStrictEqual(rows.map(row => row.filename), rows.map(row => row.filename).sort());

export const COOKING_FUNCTION_SIGNATURES = Object.freeze([
  "private.assert_execution_completion_revision(uuid,uuid)",
  "private.record_cooked_weight_evidence(uuid,uuid,bigint,bigint,text,timestamp with time zone)",
  "private.resolve_cooked_batch_nutrition(uuid,uuid)",
  "private.resolve_execution_batch_nutrition(uuid,uuid)",
  "private.verify_full_local_internal_scope()",
  "private.verify_scope_pre_cooking_execution_20261017()",
  "public.complete_cooking_execution(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,uuid,uuid[],text,numeric,text,jsonb,boolean,bigint,timestamp with time zone)",
  "public.complete_snapshot_v2_cooking_session(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,uuid,uuid[],text,numeric,timestamp with time zone)",
  "public.read_cooking_execution_quantities(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,timestamp with time zone)",
  "public.save_cooking_execution_quantities(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,timestamp with time zone)",
]);
const COOKING_OPERATOR_FILES = new Set([
  "scripts/lib/prelaunch-database.mjs",
  "scripts/lib/prelaunch-web-deploy.mjs",
  "scripts/deploy-prelaunch-web.mjs",
  "scripts/lib/cooking-experience-maintenance.mjs",
  "scripts/lib/cooking-maintenance-cut.mjs",
  "scripts/full-local-platform-backup.mjs",
  "scripts/lib/full-local-platform-backup.mjs",
  "scripts/run-cooking-current-schema-http.mjs",
  "scripts/lib/cooking-maintenance-local.mjs",
  "scripts/lib/cooking-platform-backup-thread.mjs",
  "scripts/lib/cooking-catalog-comparison.mjs",
  "scripts/lib/cooking-maintenance-engine-regression.mjs",
  "scripts/lib/marketing-round2-controlled-deploy.mjs",
]);
// Already committed tools between the exact installed web15 and ec3762.
// They are transported unchanged; cooking authority cannot edit their endpoint bytes.
const COOKING_PREEXISTING_OPERATOR_IMAGES = Object.freeze({
  "scripts/lib/cooking-schema-restore-comparison.mjs": [
    null,
    "d8b8c9356ab40b870d0f12219b2bf689160b797b9f79e6a0bdb18e209624dac5"
  ],
  "scripts/lib/round2-closed-marker-rotation-bridge.mjs": [
    null,
    "0cf5ed6a7800ed3ff80a4a279bedc29155f983d4975a8eb8cd3a9ac668626ebe"
  ],
  "scripts/lib/v85-registered-resume-source.mjs": [
    null,
    "04c27cdb5d9f6ad0a38a8aeee2057dd017470d67f543a02d9a971c6b6359460e"
  ],
  "scripts/lib/v85-unstarted-web-closeout-pins.json": [
    null,
    "04b3d82e97793de28363f69a5bac871f7badea0b9356c61ea50bc3d3a6284f7d"
  ],
  "scripts/lib/v85-unstarted-web-closeout.mjs": [
    null,
    "b899b8e5c3c4e230488eab43a5277bde1ebd56d485c0f4194dee8fd8d179f89e"
  ],
  "scripts/lib/v85-web-reader-repair.mjs": [
    null,
    "70f7d464b166de43b0764043b6a91156f9df8cc91d789d14b0706e7e882d7205"
  ],
  "scripts/lib/v85-worker-lifecycle.mjs": [
    null,
    "9970e3ffbacdc2f10705662ad49133fc59211a0875eb965f7da95ae9d65b3593"
  ],
  "scripts/lib/youtube-v85-approval.mjs": [
    "4bd212df4aa5bb295465a11f80a23e4396b18df712e03fe9f51e3164db68b03f",
    "67a72d7333cb6349eb6e4e19cae6faaaec0138f8c4513e38f761e411b4ffe031"
  ],
  "scripts/lib/youtube-v85-cutover.mjs": [
    "8e72082fbed7fab180dbed75a8d79f64ecd458460521e4c41dbb9dad72da7cc9",
    "84579d2ed2a47fd2a7b9b3eb74d9e3cd91d67cef12cf3b91297754d6ed9f2572"
  ],
  "scripts/lib/youtube-v85-normal-data-evidence.mjs": [
    null,
    "8e7a24958cd73669a3b7ad18a7b5f18c9277e1833a349edd12df8cf7ccc3c93e"
  ],
  "scripts/manifests/v85-registered-resume-source-20261019.json": [
    null,
    "1ad3fffa0c6b0440e86e06142c444d6a0ba2965b20c3396f62e9eb63b823d53f"
  ],
  "scripts/manifests/v85-web-reader-repair-source-20261018.json": [
    null,
    "f4d6f86e20f04a16f507512343bcc7d45a8ad3628bbe2d1f92e834d56c3f142e"
  ],
  "scripts/round2-eight-key-user-apply.py": [
    "471fe2087eaa574b424f717a5df953ad34ac38f294cb13b205876c1eeda4c943",
    "1881c19e2ca16e6d58a225bc46614d229c1046a88110d3662a3d097d38c362db"
  ],
  "scripts/run-cooking-execution-reader-http.mjs": [
    null,
    "aa670caf5bcc7da260c0dfd6548bba51461bc9a3176a138f0c5421ecc443e19b"
  ],
  "scripts/run-cooking-experience-full-schema-postgres.mjs": [
    null,
    "ff7d6d563513b9071b486173bda391e4e3c31976593872203ea5a3669b24a206"
  ],
  "scripts/run-cooking-experience-schema232-postgres.mjs": [
    null,
    "2c962eb722c89d53d7c6c7b53ab4575c01d68c6b199150fb93fd406a38cc1f44"
  ],
  "scripts/youtube-v85-controlled-cutover.mjs": [
    "27217eb99729cd1ee6e0e4fe409df72668510e30bee72c169fc99cab68511395",
    "0ea8d0d415f16c94c193e9cca345a57f990a620290d228bc0d15f49641f7f4b3"
  ],
  "scripts/youtube-v85-web-reader-repair.mjs": [
    null,
    "8e92c31384b9da5802c45575092b513565a849b980fc8944ac70b8133f8e6c75"
  ]
});
const literals = COOKING_FUNCTION_SIGNATURES.map(value => `'${value}'`).join(",");
export const COOKING_FUNCTIONS_SQL = `SELECT coalesce(jsonb_agg(jsonb_build_object('signature',s.signature,
 'definitionSha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'sourceMd5',md5(btrim(p.prosrc,chr(10))),
 'metadataSha256',encode(sha256(convert_to(jsonb_build_array(pg_get_userbyid(p.proowner),
 (SELECT jsonb_agg(jsonb_build_array(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),
 p.proconfig,p.prosecdef,p.provolatile,p.proparallel,p.proleakproof,p.proisstrict,pg_get_function_result(p.oid),pg_get_function_identity_arguments(p.oid),(SELECT lanname FROM pg_language WHERE oid=p.prolang))::text,'UTF8')),'hex')) ORDER BY s.signature COLLATE "C"),'[]'::jsonb)
 FROM unnest(ARRAY[${literals}]) s(signature) JOIN pg_proc p ON p.oid=to_regprocedure(s.signature);`;
export const COOKING_SCOPE_LINK_SQL = `SELECT jsonb_build_object('outerOid',to_regprocedure('private.verify_full_local_internal_scope()')::oid::bigint,
 'aliasOid',to_regprocedure('private.verify_scope_pre_cooking_execution_20261017()')::oid::bigint);`;
export const COOKING_EXECUTION_TABLE_SQL = `SELECT jsonb_build_object('owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'forced',c.relforcerowsecurity,
 'acl',(SELECT coalesce(jsonb_agg(jsonb_build_array(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable) ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type),'[]'::jsonb) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a),
 'columns',(SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(k.conname,pg_get_constraintdef(k.oid),k.convalidated,k.condeferrable,k.condeferred) ORDER BY k.conname) FROM pg_constraint k WHERE k.conrelid=c.oid),
 'policies',(SELECT count(*) FROM pg_policy WHERE polrelid=c.oid)) FROM pg_class c WHERE c.oid=to_regclass('private.cooking_execution_quantities');`;

export function assertCookingExperienceReview(review) {
  check(review?.schema === "homecook.prelaunch-protected-rollout-review.v1" && review.feature === COOKING_EXPERIENCE_FEATURE
    && REF.test(review.from ?? "") && REF.test(review.to ?? "") && review.from !== review.to, "fixed source pair required");
  check(isDeepStrictEqual(review.approved, { database: true, reader: false, writerOn: false })
    && review.databasePrecedesReader === true && review.legacyReaderCompatible === true && review.readerPrecedesDatabase === false,
  "DB precedes the new reader; existing reader compatibility must be explicit");
  for (const key of ["isolatedEvidence", "legacyReaderEvidence", "platformInventory", "backupReadiness", "postimages"]) check(pointer(review[key]), `${key} exact private evidence required`);
  check(review.isolatedEvidenceSha256 === review.isolatedEvidence.sha256 && SHA.test(review.closedArtifactSha256 ?? "")
    && SHA.test(review.legacyMarkerDatabasePlanSha256 ?? "") && SHA.test(review.historicalProofsSha256 ?? "") && SHA.test(review.controlSha256 ?? "") && SHA.test(review.closedReviewSha256 ?? "")
    && Number.isInteger(review.consentGeneration) && review.consentGeneration > 0, "historical OFF authority/evidence differs");
  check(review.legacyReader?.ref === review.from && typeof review.legacyReader.buildId === "string" && review.legacyReader.buildId.length > 0
    && SHA.test(review.legacyReader.plistSha256 ?? ""), "exact old reader compatibility binding required");
  check(review.predecessorMaintenance?.schema === "homecook.recipe-request-role-maintenance.v1"
    && review.predecessorMaintenance.ledgerCount === 232 && SHA.test(review.predecessorMaintenance.reviewSha256 ?? "")
    && pointer(review.predecessorMaintenance.receipt), "separate committed232 predecessor required");
  check(review.files && Object.keys(review.files).length > 0 && Object.entries(review.files).every(([file, pair]) =>
    (/^(?:app|components|lib|stores|types|hooks|tests|docs|supabase\/migrations)\//u.test(file) || COOKING_OPERATOR_FILES.has(file) || Object.hasOwn(COOKING_PREEXISTING_OPERATOR_IMAGES,file) && isDeepStrictEqual(pair,COOKING_PREEXISTING_OPERATOR_IMAGES[file]))
    && !file.split("/").some(part => ["", ".", ".."].includes(part)) && Array.isArray(pair) && pair.length === 2
    && pair.every(value => value === null || SHA.test(value)) && pair[0] !== pair[1]), "exact complete file byte pairs required");
  const db = review.database;
  check(db && migrationRows(db.before) && db.before.length === 232 && migrationRows(db.after) && db.after.length === 235
    && isDeepStrictEqual(db.after.slice(0, 232), db.before)
    && isDeepStrictEqual(db.after.slice(232), COOKING_EXPERIENCE_MIGRATIONS.map(({ filename, sha256 }) => ({ filename, sha256 })))
    && db.migrations?.length === 3, "only the original232 prefix and exact233/234/235 extension allowed");
  for (const [index, source] of COOKING_EXPERIENCE_MIGRATIONS.entries()) {
    const spec = db.migrations[index];
    check(Object.keys(spec ?? {}).sort().join() === "filename,payloadSha256,rawSha256" && spec.filename === source.filename
      && spec.rawSha256 === source.sha256 && SHA.test(spec.payloadSha256)
      && isDeepStrictEqual(review.files[`supabase/migrations/${source.filename}`], [null, source.sha256]), "exact source/payload/file binding differs");
  }
  check(Object.keys(review.files).filter(file => file.startsWith("supabase/")).length === 3, "no unrelated SQL allowed");
  check(isAbsolute(db.configPath ?? "") && ["configSha256", "targetSha256", "beforeCatalogSha256", "immutableSha256", "stableImmutableSha256", "normalProjectionSha256", "executionTableAfterSha256", "unchangedCatalogSha256"].every(key => SHA.test(db[key] ?? "")), "exact target/catalog/table metadata required");
  check(db.catalogMode===COOKING_CATALOG_MODE && db.canonicalCatalog && ["before","after"].every(phase => Object.keys(db.canonicalCatalog[phase] ?? {}).sort().join()==="catalogSha256,immutableSha256,stableImmutableSha256" && Object.values(db.canonicalCatalog[phase]).every(value=>SHA.test(value ?? ""))), "exact cooking canonical mode and both postimages required");
  check(db.catalogComparison && Object.keys(db.catalogComparison).sort().join() === "catalogQuerySha256,helperSha256,immutableQuerySha256,stableImmutableQuerySha256,unchangedQuerySha256"
    && Object.values(db.catalogComparison).every(value => SHA.test(value ?? "")), "exact catalog helper/query byte hashes required");
  for (const [phase, count] of [["Before", 4], ["After", 10]]) {
    const images = db[`cookingFunctions${phase}`];
    check(Array.isArray(images) && images.length === count && new Set(images.map(row => row.signature)).size === count
      && images.every(row => COOKING_FUNCTION_SIGNATURES.includes(row.signature) && Object.keys(row).sort().join() === "definitionSha256,metadataSha256,signature,sourceMd5"
        && SHA.test(row.definitionSha256) && SHA.test(row.metadataSha256) && /^[a-f0-9]{32}$/u.test(row.sourceMd5)), "exact ten function images required");
  }
  const outer = db.cookingFunctionsBefore.find(row => row.signature === "private.verify_full_local_internal_scope()");
  const alias = db.cookingFunctionsAfter.find(row => row.signature === "private.verify_scope_pre_cooking_execution_20261017()");
  check(outer && alias && outer.sourceMd5 === alias.sourceMd5 && outer.metadataSha256 === alias.metadataSha256,
    "original scope body/metadata must survive in its exact alias");
  check(db.workerBaseline?.credentialGeneration === 50 && db.workerBaseline.workerPolicyEnabled === true
    && db.workerBaseline.catalogFingerprint === SEALED_WORKER_CATALOG
    && REF.test(db.workerBaseline.workerReleaseSha ?? "") && db.workerBaseline.schemaIdentity === "youtube-extraction-worker-schema-v2"
    && ["catalogFingerprint", "credentialRowSha256", "policyRowSha256", "policyStableSha256", "snapshotDigest"].every(key => SHA.test(db.workerBaseline[key] ?? "")), "unchanged active gen50 authority required");
  return review;
}

export function assertCookingExperienceObservation(review, observation, phase, {requireExecutionEmpty=true} = {}) {
  assertCookingExperienceReview(review);
  check(["before", "after"].includes(phase), "unknown observation phase");
  const db = review.database, before = phase === "before";
  check(hash(JSON.stringify(observation?.target)) === db.targetSha256 && isDeepStrictEqual(observation.ledger, db[phase])
    && ["catalogSha256","immutableSha256","stableImmutableSha256"].every(key=>SHA.test(observation[key] ?? ""))
    && (!before || observation.catalogSha256===db.beforeCatalogSha256 && observation.immutableSha256===db.immutableSha256 && observation.stableImmutableSha256===db.stableImmutableSha256)
    && ["catalogSha256","immutableSha256","stableImmutableSha256"].every(key=>observation[`canonical${key[0].toUpperCase()}${key.slice(1)}`]===db.canonicalCatalog[phase][key])
    && observation.unchangedCatalogSha256 === db.unchangedCatalogSha256 && observation.normalProjectionSha256 === db.normalProjectionSha256
    && isDeepStrictEqual(observation.cookingFunctions, db[before ? "cookingFunctionsBefore" : "cookingFunctionsAfter"])
    && observation.executionTableSha256 === (before ? null : db.executionTableAfterSha256)
    && (!requireExecutionEmpty || observation.executionRowsEmpty === true) && observation.ledgerAuthority === true && observation.active === false,
  "exact current232/235 catalog/functions/table/ledger differs");
  check(["productWriterEnabled", "cookedWeightWriterEnabled", "quantityWriterEnabled"].every(key => observation[key] === true)
    && ["normalDataSha256", "preservedRowsSha256", "attestationRowsSha256", "controlsSha256"].every(key => SHA.test(observation[key] ?? "")), "existing data/control evidence required");
  const worker = observation.worker;
  check(worker && Object.entries(db.workerBaseline).every(([key, value]) => isDeepStrictEqual(worker[key], value))
    && worker.credentialActive === true && worker.queued === 0 && worker.processing === 0 && worker.permitHeld === false
    && worker.activeEnqueueSessions === 0, "gen50 catalog/policy/credential or drained state differs");
  return observation;
}

export function assertCookingExperienceTransition(before, after) {
  check(SHA.test(before.unchangedCatalogSha256 ?? "") && before.unchangedCatalogSha256 === after.unchangedCatalogSha256, "raw unchanged catalog remainder differs");
  check(Number.isInteger(before.scopeLink?.outerOid) && before.scopeLink.outerOid > 0 && before.scopeLink.aliasOid === null
    && after.scopeLink?.aliasOid === before.scopeLink.outerOid && after.scopeLink.outerOid !== before.scopeLink.outerOid,
  "scope rename must preserve the original function OID");
}

export function assertCookingExperienceDatabaseReceipt(review, receipt) {
  assertCookingExperienceReview(review);
  check(receipt?.schema === "homecook.prelaunch-protected-db-attempt.v1" && receipt.feature === COOKING_EXPERIENCE_FEATURE
    && receipt.status === "committed" && receipt.reviewSha256 === COOKING_EXPERIENCE_REVIEW_PIN.sha256
    && receipt.from === review.from && receipt.to === review.to && receipt.targetSha256 === review.database.targetSha256
    && isDeepStrictEqual(receipt.predecessorMaintenance, review.predecessorMaintenance)
    && receipt.databasePlanSha256 === hash(JSON.stringify({ source: review.database.after, applied: review.database.after }))
    && receipt.unchangedCatalogSha256 === review.database.unchangedCatalogSha256 && isDeepStrictEqual(receipt.catalogComparison,review.database.catalogComparison)
    && receipt.catalogMode===COOKING_CATALOG_MODE && isDeepStrictEqual(receipt.canonicalCatalog,review.database.canonicalCatalog.after)
    && ["catalogSha256","immutableSha256","stableImmutableSha256"].every(key=>SHA.test(receipt[key] ?? ""))
    && receipt.rowsPreservedInTransaction === true && receipt.controlsPreservedInTransaction === true && receipt.scopeAliasOidPreservedInTransaction === true
    && receipt.readerReady === false && receipt.readerFloor === review.to && receipt.legacyReaderCompatible === true
    && ["normalDataSha256", "preservedRowsSha256", "attestationRowsSha256", "controlsSha256"].every(key => SHA.test(receipt[key] ?? ""))
    && receipt.backup?.fullArchiveDecoded === true && [receipt.backup.sha256, receipt.backup.rolesSha256].every(value => SHA.test(value ?? ""))
    && hash(JSON.stringify(receipt.backup.target)) === review.database.targetSha256, "bound235 receipt with original backup/transaction proof required");
  return receipt;
}

export function cookingExperienceBinding(maintenance) {
  assertCookingExperienceDatabaseReceipt(maintenance.review, maintenance.record);
  check(pointer(maintenance.pointer) && isDeepStrictEqual(maintenance.pointer.sha256, maintenance.guardPointer?.sha256), "terminal/guard bytes differ");
  return { schema: "homecook.cooking-experience-maintenance.v1", reviewSha256: COOKING_EXPERIENCE_REVIEW_PIN.sha256,
    receipt: maintenance.pointer, ledgerCount: 235, targetSha256: maintenance.review.database.targetSha256,
    databasePlanSha256: maintenance.record.databasePlanSha256, sourceReaderRef: maintenance.review.from,
    readerFloor: maintenance.review.to, predecessorMaintenance: maintenance.review.predecessorMaintenance };
}

export const COOKING_WEB_TEST_SUCCESSOR = Object.freeze({
  from: "1802b2276b6e938e317e7e2cabd6d234547354da",
  to: "d9e6c6b2cf22c327a8cec4be87cd27000ab08b01",
  path: "tests/recipe-book-detail-screen.test.tsx",
  before: "c1d88fd4845cb7d0f2981e0f56258ea23506327cad445f2fe306fdcd2b261c2d",
  after: "6bca16ea1f4fbc84c28148fcee8564d971cb3dc9b4662f41d8b31beb9115e962",
});

export function assertCookingExperienceSourceHandoff({ maintenance, from, to, live, files, digests, reviewedSourceAncestor }) {
  cookingExperienceBinding(maintenance);
  const review = maintenance.review;
  // One direct test-only child corrects two removed desktop-navigation expectations.
  // All product/build bytes, the original DB235 authority and other pairs stay exact.
  const successor = COOKING_WEB_TEST_SUCCESSOR;
  const testOnly = review.to === successor.from && to === successor.to;
  const expected = structuredClone(review.files);
  if (testOnly) {
    check(expected[successor.path]?.[1] === successor.before, "test-only successor original bytes differ");
    expected[successor.path][1] = successor.after;
  }
  check(from === review.from && (to === review.to || testOnly) && live?.ref === from && live.buildId === review.legacyReader.buildId
    && live.plistSha256 === review.legacyReader.plistSha256 && reviewedSourceAncestor === true
    && isDeepStrictEqual([...files].sort(), Object.keys(expected).sort()) && isDeepStrictEqual(digests, expected),
  "only the exact235 successor source pair and old reader may hand off");
  return true;
}
