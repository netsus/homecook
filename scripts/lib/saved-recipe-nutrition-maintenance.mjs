import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { isAbsolute } from "node:path";
import { COOKING_EXPERIENCE_REVIEW_PIN, COOKING_EXPERIENCE_MIGRATIONS } from "./cooking-experience-maintenance.mjs";
import { SAVED_RECIPE_NUTRITION_FUNCTION_SIGNATURES } from "./saved-recipe-nutrition-catalog.mjs";

export const SAVED_RECIPE_NUTRITION_FEATURE = "saved-recipe-nutrition-experience";
export const SAVED_RECIPE_NUTRITION_REVIEW_PIN = Object.freeze({ path: "/Users/cwj/.homecook/operations/saved-nutrition-deploy-20261019-eNPbXN/approved-saved-nutrition-review.json", sha256: "f1dd80889e76799ba8997314747c4e2475c4dd9052501b7bfb4c27ff2dacd381" });
export const SAVED_RECIPE_NUTRITION_CATALOG_MODE = "saved-recipe-nutrition-canonical-with-native-raw-remainder-v1";
// SQL source bytes stay fixed independently of the create-only operating review.
export const SAVED_RECIPE_NUTRITION_MIGRATIONS = Object.freeze([
  Object.freeze({ filename: "20261019120000_youtube_saved_catalog_selection.sql", sha256: "b7df06e51c2cb9ea95eb03154cf4b80e0268c949c4d104be4f72d464d2e88ac6", prefix: "" }),
  Object.freeze({ filename: "20261019130000_youtube_saved_nutrition_publication.sql", sha256: "fc9f65b1d592ae60062fbc7a3eaa40da8b8fa6a3d17d6b9f676e053e6ad7e60e", prefix: "" }),
  Object.freeze({ filename: "20261019140000_cooking_quantity_json_echo.sql", sha256: "d75f523bae2b443ad5bc17e1ab39ddc68976c2a8b8edb9e60de7722e4f313f29", prefix: "-- Compare the JSON number echo at the JavaScript transport boundary. Always\n-- retain the locked database row, including its exact frozen quantity proof.\n" }),
]);

const SHA = /^[a-f0-9]{64}$/u, REF = /^[a-f0-9]{40}$/u;
const CURRENT_READER = "196c498f4e1ecc326d6bd7b6c22e4f0b2cb56ed6";
const WORKER_RELEASE = "1be5eeea5dd946d8a54edf6c5fd0c3c28d1815fa";
const WORKER_CATALOG = "de001df9981d361130136e2dff184665ec5280e82a857aa4e0e6cd593848af05";
const HELPER = "private.cooking_quantity_json_echo(jsonb)";
const GUARD = "public.build_recipe_nutrition_input_guard(uuid)";
const hash = value => createHash("sha256").update(value).digest("hex");
const check = (ok, message) => { if (!ok) throw new Error(`Saved nutrition exact maintenance: ${message}`); };
const keys = value => Object.keys(value ?? {}).sort().join();
const pointer = value => keys(value) === "path,sha256" && isAbsolute(value.path ?? "") && SHA.test(value.sha256 ?? "");
const migrationRows = rows => Array.isArray(rows) && rows.every(row => keys(row) === "filename,sha256"
  && /^[0-9]{14}_[A-Za-z0-9_-]+\.sql$/u.test(row.filename) && SHA.test(row.sha256))
  && new Set(rows.map(row => row.filename.slice(0, 14))).size === rows.length
  && isDeepStrictEqual(rows.map(row => row.filename), rows.map(row => row.filename).sort());
const OPERATOR_FILES = new Set([
  "scripts/lib/saved-recipe-nutrition-maintenance.mjs", "scripts/lib/saved-recipe-nutrition-catalog.mjs",
  "scripts/lib/prelaunch-database.mjs", "scripts/lib/prelaunch-web-deploy.mjs", "scripts/deploy-prelaunch-web.mjs",
  "scripts/run-saved-recipe-catalog-postgres.mjs", "scripts/run-cooking-quantity-echo-postgres.mjs",
  "scripts/run-saved-recipe-nutrition-maintenance-postgres.mjs", "scripts/lib/saved-recipe-nutrition-native-regression.mjs",
]);
// Existing reviewed235 tools are transported only at these exact endpoints.
// This successor cannot rewrite their historical approval or shared adapter.
const PREEXISTING_OPERATOR_IMAGES=Object.freeze({
  "scripts/lib/cooking-experience-maintenance.mjs": [
    "0dfc300b7cf979a56d9b64ce375f0f1fc9bbd98c5ed55ee45e47cfd9ffad71d8",
    "d2fd099d5cfc745b615e700ac6e3c71c35929e286baea7648dff9772fa20f69b"
  ],
  "scripts/lib/marketing-round2-controlled-deploy.mjs": [
    "3c07175b06796b30e298e9a1065def957c0289ab80dfeb1ecb4f08399da8fd08",
    "6d7fccb5c658e50acb531285301d95c727f24a613fd09a309b9ef7cd10f6c9fa"
  ]
});
const IMAGE_KEYS = "acl,config,definitionSha256,language,metadataSha256,metadataWithoutLanguageSha256,noCallerGrants,owner,parallel,securityDefiner,signature,sourceMd5,strict,volatility";
const image = row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "oid"));
const images = rows => rows.map(image);

// OIDs are observed separately from portable reviewed images. Catalog type,
// support and transform OIDs are represented by their exact SQL identities;
// defaults use PostgreSQL's deparser instead of its OID-bearing parse tree.
const literals = SAVED_RECIPE_NUTRITION_FUNCTION_SIGNATURES.map(signature => `'${signature}'`).join(",");
export const SAVED_RECIPE_NUTRITION_FUNCTIONS_SQL = `WITH functions AS (
 SELECT s.signature,p.*,l.lanname AS language,pg_get_userbyid(p.proowner) AS owner,
   (SELECT coalesce(jsonb_agg(jsonb_build_array(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable,pg_get_userbyid(a.grantor))
     ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable,pg_get_userbyid(a.grantor)),'[]'::jsonb)
    FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) AS acl,
   NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner) AS no_caller_grants,
   jsonb_build_object('owner',pg_get_userbyid(p.proowner),'rawAclIsNull',p.proacl IS NULL,'config',p.proconfig,
     'attributes',to_jsonb(p)-ARRAY['oid','pronamespace','proowner','prolang','prosrc','proacl','proconfig',
       'prorettype','proargtypes','proallargtypes','provariadic','prosupport','protrftypes','proargdefaults','prosqlbody'],
     'returnType',format_type(p.prorettype,NULL),'result',pg_get_function_result(p.oid),
     'identityArguments',pg_get_function_identity_arguments(p.oid),'arguments',pg_get_function_arguments(p.oid),
     'argumentTypes',(SELECT coalesce(jsonb_agg(format_type(t.type_oid,NULL) ORDER BY t.position),'[]'::jsonb)
       FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY t(type_oid,position)),
     'allArgumentTypes',CASE WHEN p.proallargtypes IS NULL THEN NULL ELSE
       (SELECT coalesce(jsonb_agg(format_type(t.type_oid,NULL) ORDER BY t.position),'[]'::jsonb) FROM unnest(p.proallargtypes) WITH ORDINALITY t(type_oid,position)) END,
     'variadicType',CASE WHEN p.provariadic=0 THEN NULL ELSE format_type(p.provariadic,NULL) END,
     'supportFunction',CASE WHEN p.prosupport=0 THEN NULL ELSE (SELECT jsonb_build_object('schema',n.nspname,'name',support.proname,
       'identityArguments',pg_get_function_identity_arguments(support.oid)) FROM pg_proc support JOIN pg_namespace n ON n.oid=support.pronamespace WHERE support.oid=p.prosupport) END,
     'transformTypes',CASE WHEN p.protrftypes IS NULL THEN NULL ELSE
       (SELECT coalesce(jsonb_agg(format_type(t.type_oid,NULL) ORDER BY t.position),'[]'::jsonb) FROM unnest(p.protrftypes) WITH ORDINALITY t(type_oid,position)) END,
     'hasSqlBody',p.prosqlbody IS NOT NULL) AS attributes
 FROM unnest(ARRAY[${literals}]) s(signature) JOIN pg_proc p ON p.oid=to_regprocedure(s.signature) JOIN pg_language l ON l.oid=p.prolang
), metadata AS (SELECT functions.*,attributes||jsonb_build_object('acl',acl) AS without_language FROM functions)
SELECT coalesce(jsonb_agg(jsonb_build_object('signature',signature,'oid',oid::bigint,
 'definitionSha256',encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex'),'sourceMd5',md5(btrim(prosrc,chr(10))),
 'metadataSha256',encode(sha256(convert_to((without_language||jsonb_build_object('language',language))::text,'UTF8')),'hex'),
 'metadataWithoutLanguageSha256',encode(sha256(convert_to(without_language::text,'UTF8')),'hex'),
 'owner',owner,'acl',acl,'language',language,'config',proconfig,'securityDefiner',prosecdef,'volatility',provolatile,
 'parallel',proparallel,'strict',proisstrict,'noCallerGrants',no_caller_grants) ORDER BY signature COLLATE "C"),'[]'::jsonb) FROM metadata;`;

function assertFunctionImages(rows, after, observed = false) {
  const expected = SAVED_RECIPE_NUTRITION_FUNCTION_SIGNATURES.filter(signature => after || signature !== HELPER);
  check(Array.isArray(rows) && rows.length === expected.length
    && isDeepStrictEqual(rows.map(row => row.signature), expected), "exact ordered nine/ten function identities required");
  for (const row of rows) {
    check(keys(image(row)) === IMAGE_KEYS && ["definitionSha256", "metadataSha256", "metadataWithoutLanguageSha256"].every(key => SHA.test(row[key] ?? ""))
      && /^[a-f0-9]{32}$/u.test(row.sourceMd5 ?? "") && typeof row.owner === "string" && Array.isArray(row.acl)
      && (row.config === null || Array.isArray(row.config)) && typeof row.language === "string"
      && typeof row.securityDefiner === "boolean" && typeof row.strict === "boolean" && typeof row.noCallerGrants === "boolean"
      && ["i", "s", "v"].includes(row.volatility) && ["s", "r", "u"].includes(row.parallel)
      && (observed ? keys(row) === `${IMAGE_KEYS},oid`.split(",").sort().join() && Number.isSafeInteger(row.oid) && row.oid > 0 : !Object.hasOwn(row, "oid")), "function image/metadata shape differs");
  }
  if (after) {
    const helper = rows.find(row => row.signature === HELPER);
    check(helper.owner === "postgres" && helper.language === "plpgsql" && helper.noCallerGrants === true
      && helper.securityDefiner === false && helper.strict === true && helper.volatility === "i" && helper.parallel === "s"
      && isDeepStrictEqual(helper.config, ["search_path=pg_catalog", "extra_float_digits=3"]), "private exact numeric echo helper authority differs");
  }
}

function assertMetadataTransition(before, after) {
  for (const original of before) {
    const next = after.find(row => row.signature === original.signature);
    check(next, "existing function missing");
    if (original.signature === GUARD) {
      check(original.language === "sql" && next.language === "plpgsql"
        && original.metadataWithoutLanguageSha256 === next.metadataWithoutLanguageSha256, "only the public guard SQL-to-plpgsql language change is allowed");
    } else check(original.metadataSha256 === next.metadataSha256 && original.language === next.language, "existing function metadata changed");
  }
}

export function assertSavedRecipeNutritionReview(review) {
  check(review?.schema === "homecook.prelaunch-protected-rollout-review.v1" && review.feature === SAVED_RECIPE_NUTRITION_FEATURE
    && review.from === CURRENT_READER && REF.test(review.to ?? "") && review.from !== review.to, "fixed current196-to-candidate pair required");
  check(isDeepStrictEqual(review.approved, { database: true, reader: false, writerOn: false })
    && review.databasePrecedesReader === true && review.legacyReaderCompatible === true && review.readerPrecedesDatabase === false, "DB-first legacy-reader compatibility required");
  for (const key of ["isolatedEvidence", "legacyReaderEvidence", "platformInventory", "backupReadiness", "postimages"]) check(pointer(review[key]), `${key} private evidence required`);
  check(review.isolatedEvidenceSha256 === review.isolatedEvidence.sha256 && ["closedArtifactSha256", "legacyMarkerDatabasePlanSha256", "historicalProofsSha256", "controlSha256", "closedReviewSha256"].every(key => SHA.test(review[key] ?? ""))
    && Number.isSafeInteger(review.consentGeneration) && review.consentGeneration > 0, "historical OFF authority differs");
  check(review.legacyReader?.ref === review.from && typeof review.legacyReader.buildId === "string" && review.legacyReader.buildId.length > 0
    && SHA.test(review.legacyReader.plistSha256 ?? ""), "exact current reader binding required");
  const predecessor = review.predecessorMaintenance;
  check(predecessor?.schema === "homecook.cooking-experience-maintenance.v1" && predecessor.ledgerCount === 235
    && predecessor.reviewSha256 === COOKING_EXPERIENCE_REVIEW_PIN.sha256 && pointer(predecessor.receipt)
    && SHA.test(predecessor.databasePlanSha256 ?? "") && SHA.test(predecessor.targetSha256 ?? ""), "separate committed235 predecessor required");
  check(review.files && Object.keys(review.files).length > 0 && Object.entries(review.files).every(([file, pair]) =>
    (/^(?:app|components|lib|types|tests|docs|supabase\/migrations)\//u.test(file) || OPERATOR_FILES.has(file) || Object.hasOwn(PREEXISTING_OPERATOR_IMAGES,file)&&isDeepStrictEqual(pair,PREEXISTING_OPERATOR_IMAGES[file]))
    && !file.split("/").some(part => ["", ".", ".."].includes(part)) && Array.isArray(pair) && pair.length === 2
    && pair.every(value => value === null || SHA.test(value)) && pair[0] !== pair[1]), "exact complete permitted file pairs required");
  const db = review.database;
  check(db && migrationRows(db.before) && db.before.length === 235 && migrationRows(db.after) && db.after.length === 238
    && isDeepStrictEqual(db.after.slice(0, 235), db.before)
    && isDeepStrictEqual(db.before.slice(232), COOKING_EXPERIENCE_MIGRATIONS.map(({ filename, sha256 }) => ({ filename, sha256 })))
    && db.migrations?.length === 3, "original235 prefix and exact236/237/238 extension required");
  for (const [index, source] of SAVED_RECIPE_NUTRITION_MIGRATIONS.entries()) {
    check(SHA.test(source.sha256 ?? ""), "final SQL source is not bound");
    const spec = db.migrations[index];
    check(keys(spec) === "filename,payloadSha256,rawSha256" && spec.filename === source.filename && spec.rawSha256 === source.sha256
      && SHA.test(spec.payloadSha256) && isDeepStrictEqual(db.after[235 + index], { filename: source.filename, sha256: source.sha256 })
      && isDeepStrictEqual(review.files[`supabase/migrations/${source.filename}`], [null, source.sha256]), "exact migration source/payload/file bytes differ");
  }
  check(Object.keys(review.files).filter(file => file.startsWith("supabase/")).length === 3, "unrelated SQL is prohibited");
  check(isAbsolute(db.configPath ?? "") && ["configSha256", "targetSha256", "beforeCatalogSha256", "immutableSha256", "stableImmutableSha256", "normalProjectionSha256", "executionTableAfterSha256", "unchangedCatalogSha256"].every(key => SHA.test(db[key] ?? ""))
    && predecessor.targetSha256 === db.targetSha256, "fixed target/catalog/table metadata required");
  check(db.catalogMode === SAVED_RECIPE_NUTRITION_CATALOG_MODE && ["before", "after"].every(phase => keys(db.canonicalCatalog?.[phase]) === "catalogSha256,immutableSha256,stableImmutableSha256"
    && Object.values(db.canonicalCatalog[phase]).every(value => SHA.test(value ?? ""))), "exact canonical before/after images required");
  check(keys(db.catalogComparison) === "canonicalCatalogQuerySha256,canonicalImmutableQuerySha256,canonicalStableImmutableQuerySha256,catalogQuerySha256,helperSha256,immutableQuerySha256,stableImmutableQuerySha256,unchangedQuerySha256"
    && Object.values(db.catalogComparison).every(value => SHA.test(value ?? "")), "fixed catalog query/helper bindings required");
  assertFunctionImages(db.savedRecipeNutritionFunctionsBefore, false);
  assertFunctionImages(db.savedRecipeNutritionFunctionsAfter, true);
  assertMetadataTransition(db.savedRecipeNutritionFunctionsBefore, db.savedRecipeNutritionFunctionsAfter);
  check(db.workerBaseline?.credentialGeneration === 50 && db.workerBaseline.workerPolicyEnabled === true
    && db.workerBaseline.workerReleaseSha === WORKER_RELEASE && db.workerBaseline.catalogFingerprint === WORKER_CATALOG
    && db.workerBaseline.schemaIdentity === "youtube-extraction-worker-schema-v2"
    && ["credentialRowSha256", "policyRowSha256", "policyStableSha256", "snapshotDigest"].every(key => SHA.test(db.workerBaseline[key] ?? "")), "same active gen50 authority required");
  return review;
}

export function assertSavedRecipeNutritionObservation(review, observation, phase) {
  assertSavedRecipeNutritionReview(review);
  check(["before", "after"].includes(phase), "unknown observation phase");
  const db = review.database, before = phase === "before";
  check(hash(JSON.stringify(observation?.target)) === db.targetSha256 && isDeepStrictEqual(observation.ledger, db[phase])
    && ["catalogSha256", "immutableSha256", "stableImmutableSha256"].every(key => SHA.test(observation[key] ?? ""))
    && (!before || observation.catalogSha256 === db.beforeCatalogSha256 && observation.immutableSha256 === db.immutableSha256 && observation.stableImmutableSha256 === db.stableImmutableSha256)
    && ["catalogSha256", "immutableSha256", "stableImmutableSha256"].every(key => observation[`canonical${key[0].toUpperCase()}${key.slice(1)}`] === db.canonicalCatalog[phase][key])
    && observation.unchangedCatalogSha256 === db.unchangedCatalogSha256 && observation.normalProjectionSha256 === db.normalProjectionSha256
    && observation.executionTableSha256 === db.executionTableAfterSha256 && observation.ledgerAuthority === true && observation.active === false, "current235/238 catalog/ledger/table differs");
  assertFunctionImages(observation.savedRecipeNutritionFunctions, !before, true);
  check(isDeepStrictEqual(images(observation.savedRecipeNutritionFunctions), db[before ? "savedRecipeNutritionFunctionsBefore" : "savedRecipeNutritionFunctionsAfter"]), "reviewed function images differ");
  check(["productWriterEnabled", "cookedWeightWriterEnabled", "quantityWriterEnabled"].every(key => observation[key] === true)
    && ["normalDataSha256", "preservedRowsSha256", "attestationRowsSha256", "controlsSha256", "executionRowsSha256", "ledgerPreservedRowsSha256"].every(key => SHA.test(observation[key] ?? "")), "existing facts/control transaction evidence required");
  check(Number.isSafeInteger(observation.scopeLink?.outerOid) && observation.scopeLink.outerOid > 0
    && Number.isSafeInteger(observation.scopeLink.aliasOid) && observation.scopeLink.aliasOid > 0
    && observation.scopeLink.outerOid !== observation.scopeLink.aliasOid, "original cooking scope pair missing");
  const worker = observation.worker;
  check(worker && Object.entries(db.workerBaseline).every(([key, value]) => isDeepStrictEqual(worker[key], value))
    && worker.credentialActive === true && worker.queued === 0 && worker.processing === 0 && worker.permitHeld === false
    && worker.activeEnqueueSessions === 0, "gen50 policy/credential/history or drained state differs");
  return observation;
}

export function assertSavedRecipeNutritionTransition(before, after) {
  assertFunctionImages(before.savedRecipeNutritionFunctions, false, true);
  assertFunctionImages(after.savedRecipeNutritionFunctions, true, true);
  assertMetadataTransition(before.savedRecipeNutritionFunctions, after.savedRecipeNutritionFunctions);
  for (const row of before.savedRecipeNutritionFunctions) check(after.savedRecipeNutritionFunctions.find(next => next.signature === row.signature)?.oid === row.oid, "existing function OID changed");
  for (const key of ["unchangedCatalogSha256", "normalDataSha256", "preservedRowsSha256", "attestationRowsSha256", "controlsSha256", "executionRowsSha256", "ledgerPreservedRowsSha256", "executionTableSha256"]) {
    check(SHA.test(before[key] ?? "") && before[key] === after[key], `${key} changed in the DDL transaction`);
  }
  check(isDeepStrictEqual(before.scopeLink, after.scopeLink), "scope wrapper/alias OID changed");
}

export function assertSavedRecipeNutritionDatabaseReceipt(review, receipt) {
  assertSavedRecipeNutritionReview(review);
  check(SHA.test(SAVED_RECIPE_NUTRITION_REVIEW_PIN.sha256 ?? "") && isAbsolute(SAVED_RECIPE_NUTRITION_REVIEW_PIN.path ?? ""), "review PIN is unbound");
  check(receipt?.schema === "homecook.prelaunch-protected-db-attempt.v1" && receipt.feature === SAVED_RECIPE_NUTRITION_FEATURE
    && receipt.status === "committed" && receipt.reviewSha256 === SAVED_RECIPE_NUTRITION_REVIEW_PIN.sha256
    && receipt.from === review.from && receipt.to === review.to && receipt.targetSha256 === review.database.targetSha256
    && isDeepStrictEqual(receipt.predecessorMaintenance, review.predecessorMaintenance)
    && receipt.databasePlanSha256 === hash(JSON.stringify({ source: review.database.after, applied: review.database.after }))
    && receipt.unchangedCatalogSha256 === review.database.unchangedCatalogSha256 && isDeepStrictEqual(receipt.catalogComparison, review.database.catalogComparison)
    && receipt.catalogMode === SAVED_RECIPE_NUTRITION_CATALOG_MODE && isDeepStrictEqual(receipt.canonicalCatalog, review.database.canonicalCatalog.after)
    && ["catalogSha256", "immutableSha256", "stableImmutableSha256"].every(key => SHA.test(receipt[key] ?? ""))
    && receipt.rowsPreservedInTransaction === true && receipt.controlsPreservedInTransaction === true
    && receipt.featureMetadataPreservedInTransaction === true && receipt.scopeAliasOidPreservedInTransaction === true
    && receipt.readerReady === false && receipt.writerEnabled === false && receipt.readerFloor === review.to && receipt.legacyReaderCompatible === true
    && ["normalDataSha256", "preservedRowsSha256", "attestationRowsSha256", "controlsSha256", "executionRowsSha256", "ledgerPreservedRowsSha256"].every(key => SHA.test(receipt[key] ?? ""))
    && receipt.backup?.fullArchiveDecoded === true && [receipt.backup.sha256, receipt.backup.rolesSha256].every(value => SHA.test(value ?? ""))
    && hash(JSON.stringify(receipt.backup.target)) === review.database.targetSha256, "bound238 receipt/backup/original transaction evidence required");
  // Native postimages must be those captured before COMMIT, never fixture raw hashes.
  check(keys(receipt.savedRecipeNutritionPostCatalog) === "catalogSha256,immutableSha256,stableImmutableSha256"
    && Object.entries(receipt.savedRecipeNutritionPostCatalog).every(([key, value]) => SHA.test(value ?? "") && receipt[key] === value), "native transaction postimage intent differs");
  assertCommittedIdentityShape({functionOids:receipt.savedRecipeNutritionFunctionOids,scopeLink:receipt.savedRecipeNutritionScopeLink});
  return receipt;
}

function assertCommittedIdentityShape({functionOids,scopeLink}) {
  check(Array.isArray(functionOids) && functionOids.length===10
    && isDeepStrictEqual(functionOids.map(row=>row?.[0]),SAVED_RECIPE_NUTRITION_FUNCTION_SIGNATURES)
    && functionOids.every(row=>Array.isArray(row)&&row.length===2&&Number.isSafeInteger(row[1])&&row[1]>0)
    && new Set(functionOids.map(row=>row[1])).size===10, "original committed function OID intent missing");
  check(keys(scopeLink)==="aliasOid,outerOid"&&Number.isSafeInteger(scopeLink.outerOid)&&scopeLink.outerOid>0
    && Number.isSafeInteger(scopeLink.aliasOid)&&scopeLink.aliasOid>0&&scopeLink.outerOid!==scopeLink.aliasOid,"original committed scope OID intent missing");
}

export function assertSavedRecipeNutritionCommittedIdentity(intent,observation) {
  assertCommittedIdentityShape(intent);
  check(isDeepStrictEqual(intent.functionOids,observation.savedRecipeNutritionFunctions.map(row=>[row.signature,row.oid]))
    && isDeepStrictEqual(intent.scopeLink,observation.scopeLink),"committed function/scope OID identity differs from original intent");
  return observation;
}

export function savedRecipeNutritionBinding(maintenance) {
  assertSavedRecipeNutritionDatabaseReceipt(maintenance.review, maintenance.record);
  check(pointer(maintenance.pointer) && pointer(maintenance.guardPointer) && maintenance.pointer.sha256 === maintenance.guardPointer.sha256, "terminal/guard binding differs");
  return { schema: "homecook.saved-recipe-nutrition-maintenance.v1", reviewSha256: SAVED_RECIPE_NUTRITION_REVIEW_PIN.sha256,
    receipt: maintenance.pointer, ledgerCount: 238, targetSha256: maintenance.review.database.targetSha256,
    databasePlanSha256: maintenance.record.databasePlanSha256, sourceReaderRef: maintenance.review.from,
    readerFloor: maintenance.review.to, predecessorMaintenance: maintenance.review.predecessorMaintenance };
}

export function assertSavedRecipeNutritionSourceHandoff({ maintenance, from, to, live, files, digests, reviewedSourceAncestor }) {
  savedRecipeNutritionBinding(maintenance);
  const review = maintenance.review;
  check(from === review.from && to === review.to && live?.ref === from && live.buildId === review.legacyReader.buildId
    && live.plistSha256 === review.legacyReader.plistSha256 && reviewedSourceAncestor === true
    && Array.isArray(files) && isDeepStrictEqual([...files].sort(), Object.keys(review.files).sort()) && isDeepStrictEqual(digests, review.files), "only the exact238 complete source pair may hand off");
  return true;
}
