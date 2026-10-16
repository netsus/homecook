import { assertV74SourceHandoff } from "./prelaunch-youtube-v74-cutover.mjs";
import { isDeepStrictEqual } from "node:util";
import { request as httpRequest } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { constants, closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, rmdirSync, statfsSync } from "node:fs";
import * as fs from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";

export class DeploymentError extends Error {}

function prelaunchStateRoot() { return join(homedir(), ".homecook/prelaunch-web"); }

// The existing CLI's exact mkdir/rmdir lock, shared with the worker CLI. No path/stale-lock override.
export function acquirePrelaunchDeployLock() {
  const lock = join(prelaunchStateRoot(), "deploy.lock");
  try { mkdirSync(lock, { mode: 0o700 }); } catch { throw new DeploymentError("배포 잠금이 있습니다. 다른 배포 종료 여부를 확인하세요."); }
  const owned = lstatSync(lock);
  let released = false;
  return { release() {
    if (released) return;
    const current = lstatSync(lock);
    if (!current.isDirectory() || current.isSymbolicLink() || current.ino !== owned.ino || current.dev !== owned.dev || current.uid !== process.getuid()) {
      throw new DeploymentError("배포 잠금 소유자가 달라 자동 삭제하지 않습니다.");
    }
    rmdirSync(lock);
    released = true;
  } };
}

// Unbound until the exact reader-first/one-function229 evidence is reviewed. No runtime override.
export const NUTRITION_VALIDATOR_FEATURE = "recipe-nutrition-v4-validator";
export const NUTRITION_VALIDATOR_MIGRATION = "20261014225000_recipe_nutrition_quantity_v4_warning_contract.sql";
export const NUTRITION_VALIDATOR_MIGRATION_SHA256 = "a03d44504bc0c318bbcc399c9ef563d2cdcd7adc79ebdb0314846b981fd89bdd";
export const NUTRITION_VALIDATOR_ROLLOUT_REVIEW_PIN = Object.freeze({ path: "/Users/cwj/.homecook/operations/mumeok-beta-nutrition-validator-20261015-uq1hcgt6/approved-nutrition-validator-review.json", sha256: "7260854b2b072543379cebc8e75c3159c81c4f043da1feeaafe6e445bc2e325a" });

// Exact reviewed A+B successor. Unbound until the integrated source/native proof is sealed.
export const RECIPE_SAVE_RECOVERY_FEATURE = "recipe-save-recovery";
export const RECIPE_SAVE_RECOVERY_RELEASE_SHA = "0ae67d66c5ab330cf3f7ef7aff3a7ba40e99b1d7";
export const RECIPE_SAVE_RECOVERY_ROLLOUT_REVIEW_PIN = Object.freeze({ path: "/Users/cwj/.homecook/operations/mumeok-beta-recipe-snapshot-20261015-lry0fhvq/approved-recipe-save-review-v2.json", sha256: "f183afd8e429668f6c77b11302cf00ba044c38438c5f409296a02b21c8e17358" });
export const RECIPE_SAVE_RECOVERY_MIGRATIONS = Object.freeze([
  Object.freeze({ filename: "20261014225200_recipe_snapshot_reason_identity.sql", sha256: "b6050c12e60594267908b89ff02cff0c0344a52ccb79dc9a88d21e3c57e8fe66" }),
  Object.freeze({ filename: "20261014225300_recipe_future_patch_http_replay.sql", sha256: "aed773e0d27e6b6dd4af8e65fb933d73c89927faef1d1d36804eec8476fed9c7" }),
]);
export const RECIPE_SAVE_RECOVERY_POSTIMAGES_SHA256 = "4e908266cca5637fa8ebc1a6eeea8605bdebd7b26dc4a6a4bcfb0cd068aa6874";
export const RECIPE_SAVE_RECOVERY_READER_SOURCES = Object.freeze({"lib/nutrition/recipe-nutrition-calculator.ts":"b058e50dab114e367999aabca32917fd1959fcb0b70f49a5c8daaa04da67d004","lib/server/recipe-nutrition-snapshot.ts":"6914d7451816e5e6098a91e78bafa76b0a417b7a338eac372c87d8297011d484","lib/server/planner-nutrition-summary.ts":"7f07dbafa1f8774b057bd61e0be12be7dd4bdfe39321e26a5067eef761703a85","lib/server/recipe-snapshot-entrypoint.ts":"67cb3e8742bda4a46e6179a50a188db4ff0fd1f654882eacadb919cf5514ef5a"});
export const RECIPE_SAVE_RECOVERY_FUNCTIONS_BEFORE = Object.freeze(["private.recipe_quantity_mode_metadata_v4(uuid)", "private.verify_full_local_internal_scope()", "public.validate_recipe_nutrition_snapshot_payload(jsonb)", "public.write_personal_recipe_core(uuid,timestamp with time zone,text,integer,timestamp with time zone,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamp with time zone)", "public.write_recipe_future_plan_change(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,bigint,jsonb,jsonb,jsonb,text,text,uuid,uuid,timestamp with time zone)", "public.write_recipe_nutrition_snapshot(uuid,jsonb,timestamp with time zone,jsonb)"]);
export const RECIPE_SAVE_RECOVERY_FUNCTIONS_AFTER = Object.freeze(["private.map_recipe_nutrition_reasons_v5(uuid,jsonb,jsonb,jsonb)", "private.recipe_future_http_request_fingerprint(uuid,jsonb,text)", "private.recipe_quantity_mode_metadata_v4(uuid)", "private.verify_full_local_internal_scope()", "private.verify_scope_pre_recipe_future_http_replay_20261014()", "public.read_recipe_future_patch_result(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,jsonb,text,uuid)", "public.validate_recipe_nutrition_snapshot_payload(jsonb)", "public.write_personal_recipe_core(uuid,timestamp with time zone,text,integer,timestamp with time zone,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamp with time zone)", "public.write_recipe_future_plan_change(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,bigint,jsonb,jsonb,jsonb,text,text,uuid,uuid,timestamp with time zone)", "public.write_recipe_future_plan_change_recoverable(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,jsonb,text,uuid,jsonb,jsonb,timestamp with time zone)", "public.write_recipe_nutrition_snapshot(uuid,jsonb,timestamp with time zone,jsonb)"]);
export const RECIPE_SAVE_RECOVERY_RUNTIME_POSTIMAGES = Object.freeze({"lib/server/recipe-content-snapshot-future-propagation.ts":"dd784654738f444a46fd4c0a459891d00ec115ec5f816bdd23d6e2cba798cb98","app/api/v1/recipes/[id]/route.ts":"ea6e2906a801ae0705a1065c115ba87ac60485b357bf97faff10d5e55b104262","scripts/generate-nutrition-review-html.mjs":"9da3905afa0353c511934abd57169d4667f7a70e1cae2ed9bba18c2b841fba7b"});
export const RECIPE_SAVE_RECOVERY_RUNTIME_PATHS = Object.freeze([
  "lib/server/recipe-content-snapshot-future-propagation.ts", "app/api/v1/recipes/[id]/route.ts", "scripts/generate-nutrition-review-html.mjs",
]);

// Two declared source contracts of this reviewed feature, not a general JavaScript analyser.
export function recipeSaveRecoveryRuntimeContract(file, bytes) {
  const text=bytes.toString("utf8");
  return file === "lib/server/recipe-content-snapshot-future-propagation.ts" && /\brecipe-nutrition-v5\b/u.test(text)
    || file === "app/api/v1/recipes/[id]/route.ts" && /\b(?:read_recipe_future_patch_result|write_recipe_future_plan_change_recoverable)\b/u.test(text)
    || Object.hasOwn(RECIPE_SAVE_RECOVERY_RUNTIME_POSTIMAGES,file) && closedR2Hash(bytes) === RECIPE_SAVE_RECOVERY_RUNTIME_POSTIMAGES[file];
}

// Separate metadata-only successor; no operational authority until root binds both constants.
export const RECIPE_REQUEST_ROLE_FEATURE = "recipe-future-request-role";
export const RECIPE_REQUEST_ROLE_RELEASE_SHA = "5a3926e5a188d48a0642317805ef5bca38958a30";
export const RECIPE_REQUEST_ROLE_ROLLOUT_REVIEW_PIN = Object.freeze({ path: "/Users/cwj/.homecook/operations/mumeok-beta-recipe-snapshot-20261015-lry0fhvq/role-forward-repair/approved-recipe-role-review.json", sha256: "2532d389a187907d649fc5a9cffae4cb8a8c9e38fdad80c1a74d010a41be6f0e" });
export const RECIPE_REQUEST_ROLE_MIGRATION = Object.freeze({ filename: "20261015100000_recipe_future_request_role.sql", sha256: "2322ccf737382e9738aa2c3d5cb50531c769c1a7902e2f621c8d378f9ce1505e" });
export const RECIPE_REQUEST_ROLE_POSTIMAGE_SHA256 = "8cb39f32a50a85a713798049459500ce3eecf1ff33171e55b742a9ff9fd0bde2";

// Human-approved F01 source and pause receipt. CLI and environment cannot override these pins.
export const CLOSED_R2_REVIEW_PIN = Object.freeze({
  path: "/Users/cwj/.homecook/operations/mumeok-beta-f01-closed-20261014-ifzuefgy/proposed-review.json",
  sha256: "cefb74c46ef6b1d23b2e449aa3255d854da6ecd74c35c8701095df964b9d2c29",
});
// Human-approved C03 DB/reader and conditional writer authority. No CLI/env overrides.
export const PROTECTED_ROLLOUT_REVIEW_PIN = Object.freeze({ path: "/Users/cwj/.homecook/operations/mumeok-beta-c03-20261014-MeZKNX/approved-rollout-review.json", sha256: "0112e9ba64f6765a24fe64a891bd96fe2fb6edc19a314d398d0b5a7fbbdb2b6f" });
export const PROTECTED_WRITER_REVIEW_PIN = Object.freeze({ path: "/Users/cwj/.homecook/operations/mumeok-beta-c03-20261014-MeZKNX/approved-writer-review.json", sha256: "87d989c6ca9c50da8cb93ec0c0da4af95d1f30941a9ed2255d67e3ccdea663c4" });
// Exact C01 bindings under the user's standing v9 authorization; retain separate C03 authority.
export const COOKED_WEIGHT_ROLLOUT_REVIEW_PIN = Object.freeze({ path: "/Users/cwj/.homecook/operations/mumeok-beta-c01-20261014-HhhiQC/approved-cooked-weight-rollout-review.json", sha256: "3d6f179bcdb964835f25e2c03376d560cd9d6b4de6e8b522b1007e4350f1f7f4" });
export const COOKED_WEIGHT_WRITER_REVIEW_PIN = Object.freeze({ path: "/Users/cwj/.homecook/operations/mumeok-beta-c01-20261014-HhhiQC/approved-cooked-weight-writer-review.json", sha256: "48f34663f05d475c4c67780eeabadee209a70fd1dd384942b95863a32b92879b" });
export const COOKED_WEIGHT_FEATURE = "cooked-weight-evidence";
export const COOKED_WEIGHT_MIGRATION = "20261013233000_cooked_batch_weight_evidence.sql";
export const COOKED_WEIGHT_ENVIRONMENT = "HOMECOOK_COOKED_WEIGHT_EVIDENCE";

// C04 consumers and worker source bound under the standing v9 authorization after review.
// Worker DB and conditional writer authority bind the actual T1 receipt; later runtime evidence is still required.
// No CLI/environment replacement and no inheritance of C03/C01 authority.
export const QUANTITY_V4_FEATURE = "ingredient-quantity-v4";
export const QUANTITY_V4_ENVIRONMENT = "MUMEOK_QUANTITY_V4_ENABLED";
export const QUANTITY_V4_RELEASE_SHA = "6b610eb012da42b5d151b058531815dc12a8ca45";
export const QUANTITY_V4_PROTECTION = Object.freeze({"normalProjectionSha256":"ece6c7ccaf15312ae2b21cd34f8d1334eb80534a34af8e69970c9f3b23371ff3","postimageRegistrySha256":"365d277cdc0a62c3aee5973d51dfff363d76298946fa6e65c6be24de95d8daab"});
export const QUANTITY_V4_CONSUMERS_REVIEW_PIN = Object.freeze({"path":"/Users/cwj/.homecook/operations/mumeok-beta-c04-20261014-Ej3Zvr/approved-quantity-consumers-review.json","sha256":"7fe3e367c3b305b5ab6f79c98aa18701745fcf45eefd93e7b0cd75ef4414a1c9"});
export const QUANTITY_V4_WORKER_REVIEW_PIN = Object.freeze({"path":"/Users/cwj/.homecook/operations/mumeok-beta-c04-20261014-Ej3Zvr/approved-quantity-worker-review.json","sha256":"7efc832daa0b72dc2a555b7c8f1e0a5dc807c054c598f6a91309f3399109fe5f"});
export const QUANTITY_V4_WRITER_REVIEW_PIN = Object.freeze({"path":"/Users/cwj/.homecook/operations/mumeok-beta-c04-20261014-Ej3Zvr/approved-quantity-writer-review.json","sha256":"4615dc8a3b8d07bcfbe52b42dc5aee96e9b9b1625a3c540a282392fd7c394f49"});
export const QUANTITY_V4_WORKER_BEFORE_PIN = Object.freeze({ path: null, sha256: null });
export const QUANTITY_V4_WORKER_AFTER_PIN = Object.freeze({ path: null, sha256: null });
export const QUANTITY_V4_WORKER_CONTROL_REVIEW_PIN = Object.freeze({"path":"/Users/cwj/.homecook/operations/mumeok-beta-c04-20261014-Ej3Zvr/approved-worker-control-review.json","sha256":"63ba82001909c381a7cf1a61c32ec2209aca157c42607371ed46a74c331839b6"});
export const QUANTITY_V4_WORKER_OPERATION_ROOT = "/Users/cwj/.homecook/operations/mumeok-beta-c04-20261014-Ej3Zvr/worker-control";
export const QUANTITY_V4_MIGRATIONS = Object.freeze([
  Object.freeze({ filename: "20261014010000_ingredient_quantity_policy_v4.sql", sha256: "c66ee907de4130b2fe3b86bcdbe48b15021f228485e52fbe1aca5acfee5e7bfd", actor: "postgres", prefix: "-- Additive v4 preparation only. No v3 function, record, or exposed RPC changes.\n" }),
  Object.freeze({ filename: "20261014200000_quantity_input_v4_consumers.sql", sha256: "9ec96a2a7bbf7192801b1f6dd43304ed8ba78ab73f934eac4c2c300e3ca85573", actor: "postgres", prefix: "-- Inactive preparation. No historical rows, review evidence or runtime grants\n-- are populated. Activation and reviewed metadata are separate operations.\n" }),
  Object.freeze({ filename: "20261014210000_product_quantity_input_v4.sql", sha256: "e33a2110afd4a71a6042ce6d4d416f2bf189e107f4528e5b5ae2e440e180ad88", actor: "postgres", prefix: "" }),
  Object.freeze({ filename: "20261014213000_product_quantity_edit_capability.sql", sha256: "acb0ec83aeabc91320a61b406c2a23dda258033592defbb09bd7f1bb8667399b", actor: "postgres", prefix: "-- C04 editor reads the current private policy under the existing entry authority.\n-- Saved quantity_input remains readable after OFF and does not activate editing.\n-- No new function, RPC, grants, tables, backfill or writer changes.\n" }),
  Object.freeze({ filename: "20261014220000_recipe_quantity_input_v4.sql", sha256: "9b15696aa8f33cb6a9c707d1355a90efb07bd929df3943519e58b1d6d6cc2367", actor: "postgres", prefix: "" }),
  Object.freeze({ filename: "20261014223000_youtube_quantity_input_bridge.sql", sha256: "f586b27f2f5da5063a7eaa70278c7f00edab762aa27248b91a224411f436c750", actor: "supabase_admin", prefix: "-- Inactive worker bridge. No source rows, past snapshots, runtime policy or\n-- public RPC permissions are changed. The existing quantity policy is the\n-- sole write authority; old worker outputs have no transport key.\n-- DDL actor: the historical YouTube migration administrator (supabase_admin),\n-- which may lease the restricted function owners. This is a separate worker\n-- rollout, not part of the postgres-only C03/C01 deployment pipeline.\n" }),
]);
export const QUANTITY_V4_WORKER_CATALOG_BEFORE = "81362d758b5138a95b6cbe1d8d7c1f064653b467907a42a7335c00d97dc59ba9";
export const QUANTITY_V4_WORKER_CATALOG_AFTER = "de001df9981d361130136e2dff184665ec5280e82a857aa4e0e6cd593848af05";
export const QUANTITY_V4_WORKER_SCHEMA_IDENTITY = "youtube-extraction-worker-schema-v2";

// Separate, still-unbound personal attestation successor. Historical C04 authority is never retargeted.
export const COOKED_WEIGHT_ATTESTATION_FEATURE = "cooked-weight-user-attestation";
export const COOKED_WEIGHT_ATTESTATION_MIGRATION = "20261014224500_cooked_weight_user_attestation.sql";
export const COOKED_WEIGHT_ATTESTATION_MIGRATION_SHA256 = "d334ebe8824db1d4e94f865bc0bbd692c46cdde2f6c2077e4cac9d9f8db8d146";
export const COOKED_WEIGHT_ATTESTATION_ROLLOUT_REVIEW_PIN = Object.freeze({ path: "/Users/cwj/.homecook/operations/mumeok-beta-personal-weight-20261015-secrwkhy/approved-rollout-review-v2.json", sha256: "2f4f2cca5d4ef64e5278088c5137943a02e76ba77fa7a9c82d6f1c5ee57fbac7" });
export const COOKED_WEIGHT_ATTESTATION_WRITER_REVIEW_PIN = Object.freeze({ path: "/Users/cwj/.homecook/operations/mumeok-beta-personal-weight-20261015-secrwkhy/approved-writer-review-v2.json", sha256: "f1c9bad6c635ce15f6102c7636c1d844cd2004249a0f29881f6c387efe3b84a8" });

export function quantityV4StageForPhase(phase) {
  if (["database", "database-retry", "reconcile"].includes(phase)) return "consumers";
  if (["worker-database", "worker-database-retry", "worker-reconcile", "reader", "writer-on", "writer-off", "writer-on-reconcile", "writer-off-reconcile", "writer-on-retry", "writer-off-retry"].includes(phase)) return "worker";
  throw new DeploymentError("Unknown exact C04 stage");
}

export function protectedRolloutPins(review) {
  if (review?.feature === RECIPE_REQUEST_ROLE_FEATURE) return { rollout: RECIPE_REQUEST_ROLE_ROLLOUT_REVIEW_PIN, writer: { path: null, sha256: null } };
  if (review?.feature === RECIPE_SAVE_RECOVERY_FEATURE) return { rollout: RECIPE_SAVE_RECOVERY_ROLLOUT_REVIEW_PIN, writer: { path: null, sha256: null } };
  if (review?.feature === NUTRITION_VALIDATOR_FEATURE) return { rollout: NUTRITION_VALIDATOR_ROLLOUT_REVIEW_PIN, writer: { path: null, sha256: null } };
  if (review?.feature === COOKED_WEIGHT_ATTESTATION_FEATURE) return { rollout: COOKED_WEIGHT_ATTESTATION_ROLLOUT_REVIEW_PIN, writer: COOKED_WEIGHT_ATTESTATION_WRITER_REVIEW_PIN };
  if (review?.feature === QUANTITY_V4_FEATURE) {
    if (!["consumers", "worker"].includes(review.quantityStage)) throw new DeploymentError("Unknown exact C04 stage");
    return { rollout: review.quantityStage === "consumers" ? QUANTITY_V4_CONSUMERS_REVIEW_PIN : QUANTITY_V4_WORKER_REVIEW_PIN, writer: QUANTITY_V4_WRITER_REVIEW_PIN };
  }
  if (review?.feature === COOKED_WEIGHT_FEATURE) return { rollout: COOKED_WEIGHT_ROLLOUT_REVIEW_PIN, writer: COOKED_WEIGHT_WRITER_REVIEW_PIN };
  if (review?.feature === "recipe-product-source") return { rollout: PROTECTED_ROLLOUT_REVIEW_PIN, writer: PROTECTED_WRITER_REVIEW_PIN };
  throw new DeploymentError("Unknown protected feature; no generic rollout authority");
}

export function protectedRolloutPaths(root, review) {
  const prefix = review?.feature === RECIPE_REQUEST_ROLE_FEATURE ? "protected-recipe-request-role" : review?.feature === RECIPE_SAVE_RECOVERY_FEATURE ? "protected-recipe-save-recovery" : review?.feature === NUTRITION_VALIDATOR_FEATURE ? "protected-nutrition-validator" : review?.feature === COOKED_WEIGHT_ATTESTATION_FEATURE ? "protected-cooked-weight-attestation" : review?.feature === QUANTITY_V4_FEATURE ? `protected-quantity-v4-${review.quantityStage}` : review?.feature === COOKED_WEIGHT_FEATURE ? "protected-cooked-weight" : "protected";
  protectedRolloutPins(review);
  return { databaseGuardPath: join(root, `${prefix}-database-guard.json`), readerReceiptPath: join(root, `${prefix}-reader-ready.json`),
    operationRoot: join(root, `${prefix}-operations`), writerPrefix: `${prefix}-writer` };
}

export function protectedImmutableSha256(review, phase = "after") {
  return [COOKED_WEIGHT_FEATURE, QUANTITY_V4_FEATURE, COOKED_WEIGHT_ATTESTATION_FEATURE, RECIPE_SAVE_RECOVERY_FEATURE, RECIPE_REQUEST_ROLE_FEATURE].includes(review?.feature) && phase === "after" ? review.database.afterImmutableSha256 : review.database.immutableSha256;
}

export function protectedReaderFenceSql(review) {
  protectedRolloutPins(review);
  if (review.feature === COOKED_WEIGHT_ATTESTATION_FEATURE) return {
    begin: "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='120s'; SELECT singleton FROM private.recipe_product_only_write_control WHERE singleton FOR SHARE; SELECT singleton FROM private.cooked_batch_weight_evidence_control WHERE singleton FOR SHARE; SELECT singleton FROM private.quantity_input_v4_policy WHERE singleton FOR SHARE; LOCK TABLE private.cooked_weight_user_attestation_control IN SHARE MODE;",
    check: "SELECT (SELECT count(*)=1 AND bool_and(singleton) AND NOT bool_or(enabled) FROM private.cooked_weight_user_attestation_control) AND (SELECT count(*)=1 AND bool_and(singleton) AND bool_or(enabled) FROM private.recipe_product_only_write_control) AND (SELECT count(*)=1 AND bool_and(singleton) AND bool_or(enabled) FROM private.cooked_batch_weight_evidence_control);",
  };
  if (review.feature === QUANTITY_V4_FEATURE) return {
    begin: "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='120s'; SELECT singleton FROM private.recipe_product_only_write_control WHERE singleton FOR SHARE; SELECT singleton FROM private.cooked_batch_weight_evidence_control WHERE singleton FOR SHARE; LOCK TABLE private.quantity_input_v4_policy IN SHARE MODE;",
    check: "SELECT (SELECT count(*)=1 AND bool_and(singleton) AND NOT bool_or(enabled) FROM private.quantity_input_v4_policy) AND (SELECT count(*)=1 AND bool_and(singleton) AND bool_or(enabled) FROM private.recipe_product_only_write_control) AND (SELECT count(*)=1 AND bool_and(singleton) AND bool_or(enabled) FROM private.cooked_batch_weight_evidence_control);",
  };
  if (review.feature === COOKED_WEIGHT_FEATURE) return {
    begin: "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='120s'; SELECT singleton FROM private.recipe_product_only_write_control WHERE singleton FOR SHARE; LOCK TABLE private.cooked_batch_weight_evidence_control IN SHARE MODE;",
    check: "SELECT (SELECT count(*)=1 AND bool_and(singleton) AND NOT bool_or(enabled) FROM private.cooked_batch_weight_evidence_control) AND (SELECT count(*)=1 AND bool_and(singleton) AND bool_or(enabled) FROM private.recipe_product_only_write_control);",
  };
  return {
    begin: "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='120s'; LOCK TABLE private.recipe_product_only_write_control IN SHARE MODE;",
    check: "SELECT count(*)=1 AND bool_and(singleton) AND NOT bool_or(enabled) FROM private.recipe_product_only_write_control;",
  };
}

export function protectedReaderPlist(review, before, checkout) {
  protectedRolloutPins(review);
  const next = retargetPlist(before, checkout);
  if (review.feature === COOKED_WEIGHT_FEATURE) next.EnvironmentVariables = { ...before.EnvironmentVariables, [COOKED_WEIGHT_ENVIRONMENT]: "1" };
  if (review.feature === QUANTITY_V4_FEATURE) next.EnvironmentVariables = { ...before.EnvironmentVariables, [QUANTITY_V4_ENVIRONMENT]: "true" };
  return next;
}
const closedR2Hash = bytes => createHash("sha256").update(bytes).digest("hex");
const closedR2Require = (value, message) => { if (!value) throw new DeploymentError(`닫힌 R2 유지 배포: ${message}`); };
const CLOSED_R2_SHA = /^[a-f0-9]{64}$/u;
const CLOSED_R2_REF = /^[a-f0-9]{40}$/u;
const CLOSED_R2_FLAGS = ["MUMEOK_ROUND2_ENABLED", "MUMEOK_ROUND2_LEADS_ENABLED"];
const CLOSED_R2_BINDINGS = ["MUMEOK_ROUND2_RELEASE_SHA", "MUMEOK_ROUND2_REPOSITORY_ROOT", "MUMEOK_ROUND2_READINESS_PATH"];
const CLOSED_R2_FILES = new Set([
  "app/page.tsx", "components/home/home-screen.tsx", "tests/home-screen.test.tsx",
  "app/privacy/page.tsx", "tests/launch-readiness-legal-seo.test.tsx", "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
  "docs/요구사항기준선-v1.7.36.md", "docs/화면정의서-v1.5.40.md",
  "docs/engineering/gabia-direct-domain-20261012.md", "docs/engineering/mumeok-beta-f01-privacy-reconciliation-20261013.md",
  "docs/engineering/mumeok-beta-v9-progress-20261013.md", "docs/유저flow맵-v1.3.38.md",
]);

function closedR2PrivateDirectory(directory, repositoryRoot) {
  closedR2Require(isAbsolute(directory) && resolve(directory) === directory, "비공개 정규 경로가 필요합니다.");
  const root = realpathSync(repositoryRoot);
  const rel = relative(root, directory);
  closedR2Require(rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel), "저장소 밖 경로가 필요합니다.");
  for (let part = directory; ; part = dirname(part)) {
    closedR2Require(!lstatSync(part).isSymbolicLink() && !existsSync(join(part, ".git")), "링크/저장소 경로는 허용하지 않습니다.");
    if (part === dirname(part)) break;
  }
  const info = lstatSync(directory);
  closedR2Require(info.isDirectory() && info.uid === process.getuid() && (info.mode & 0o777) === 0o700, "비공개 폴더 소유권/권한이 다릅니다.");
  const localTypes = process.platform === "darwin" ? [17, 26] : process.platform === "linux" ? [0xef53, 0x01021994, 0x58465342, 0x9123683e, 0x794c7630, 0x2fc12fc1] : [];
  closedR2Require(localTypes.includes(statfsSync(directory).type >>> 0), "기존 R2와 같은 로컬 파일시스템이 필요합니다.");
  return info;
}

export function readClosedR2PrivateBytes(path, repositoryRoot, maximum = 65536) {
  closedR2Require(Number.isSafeInteger(maximum) && maximum > 0 && maximum <= 524288, "파일 크기 제한이 올바르지 않습니다.");
  closedR2Require(isAbsolute(path) && resolve(path) === path, "비공개 정규 파일 경로가 필요합니다.");
  closedR2PrivateDirectory(dirname(path), repositoryRoot);
  const before = lstatSync(path);
  closedR2Require(before.isFile() && !before.isSymbolicLink() && before.nlink === 1
    && before.uid === process.getuid() && (before.mode & 0o777) === 0o600 && before.size <= maximum, "비공개 파일 소유권/권한/크기가 다릅니다.");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd);
    closedR2Require(opened.ino === before.ino && opened.dev === before.dev, "파일 결속이 바뀌었습니다.");
    const buffer = Buffer.alloc(maximum + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const length = readSync(fd, buffer, offset, buffer.length - offset, null);
      if (!length) break;
      offset += length;
    }
    closedR2Require(offset <= maximum, "파일 크기 제한을 넘었습니다.");
    return buffer.subarray(0, offset);
  } finally { closeSync(fd); }
}

export function loadClosedR2Review(repositoryRoot) {
  closedR2Require(isAbsolute(CLOSED_R2_REVIEW_PIN.path ?? "") && CLOSED_R2_SHA.test(CLOSED_R2_REVIEW_PIN.sha256 ?? ""), "검토 핀이 비어 있어 실행할 수 없습니다.");
  const bytes = readClosedR2PrivateBytes(CLOSED_R2_REVIEW_PIN.path, repositoryRoot);
  closedR2Require(closedR2Hash(bytes) === CLOSED_R2_REVIEW_PIN.sha256, "검토 파일이 바뀌었습니다.");
  return assertClosedR2Review(JSON.parse(bytes));
}

function readProtectedRolloutPin(repositoryRoot, pin) {
  closedR2Require(isAbsolute(pin.path ?? "") && CLOSED_R2_SHA.test(pin.sha256 ?? ""),
    "보호 전환 승인 핀이 비어 있어 실행할 수 없습니다.");
  const bytes = readClosedR2PrivateBytes(pin.path, repositoryRoot, 524288);
  closedR2Require(closedR2Hash(bytes) === pin.sha256, "보호 전환 승인 자료 bytes가 바뀌었습니다.");
  return assertProtectedRolloutReview(JSON.parse(bytes));
}

export function loadProtectedRolloutReview(repositoryRoot, selector = {}) {
  if (selector.feature === RECIPE_REQUEST_ROLE_FEATURE
    || selector.reviewSha256 && selector.reviewSha256 === RECIPE_REQUEST_ROLE_ROLLOUT_REVIEW_PIN.sha256
    || CLOSED_R2_REF.test(RECIPE_REQUEST_ROLE_RELEASE_SHA ?? "") && selector.ref === RECIPE_REQUEST_ROLE_RELEASE_SHA && selector.phase?.startsWith("nutrition-")) {
    const review = readProtectedRolloutPin(repositoryRoot, RECIPE_REQUEST_ROLE_ROLLOUT_REVIEW_PIN);
    closedR2Require(!selector.ref || selector.ref === review.to, "Recipe request-role exact source differs");
    return review;
  }
  if (selector.feature === RECIPE_SAVE_RECOVERY_FEATURE
    || selector.reviewSha256 && selector.reviewSha256 === RECIPE_SAVE_RECOVERY_ROLLOUT_REVIEW_PIN.sha256
    || CLOSED_R2_REF.test(RECIPE_SAVE_RECOVERY_RELEASE_SHA ?? "") && selector.ref === RECIPE_SAVE_RECOVERY_RELEASE_SHA && selector.phase?.startsWith("nutrition-")) {
    const review = readProtectedRolloutPin(repositoryRoot, RECIPE_SAVE_RECOVERY_ROLLOUT_REVIEW_PIN);
    assertRecipeSaveRecoveryReview(review);
    closedR2Require(!selector.ref || selector.ref === review.to, "Recipe-save exact source differs");
    return review;
  }
  if (selector.feature === NUTRITION_VALIDATOR_FEATURE || selector.phase?.startsWith("nutrition-")
    || selector.reviewSha256 && selector.reviewSha256 === NUTRITION_VALIDATOR_ROLLOUT_REVIEW_PIN.sha256) {
    const review = readProtectedRolloutPin(repositoryRoot, NUTRITION_VALIDATOR_ROLLOUT_REVIEW_PIN);
    assertNutritionValidatorReview(review);
    closedR2Require(!selector.ref || selector.ref === review.to, "Nutrition maintenance exact source differs");
    return review;
  }
  closedR2Require(!selector.feature || ["recipe-product-source", COOKED_WEIGHT_FEATURE, QUANTITY_V4_FEATURE, COOKED_WEIGHT_ATTESTATION_FEATURE].includes(selector.feature), "No arbitrary protected feature selector");
  if (selector.feature === COOKED_WEIGHT_ATTESTATION_FEATURE || selector.phase?.startsWith("attestation-")
    || (selector.reviewSha256 && selector.reviewSha256 === COOKED_WEIGHT_ATTESTATION_ROLLOUT_REVIEW_PIN.sha256)) {
    const review = readProtectedRolloutPin(repositoryRoot, COOKED_WEIGHT_ATTESTATION_ROLLOUT_REVIEW_PIN);
    closedR2Require(review.feature === COOKED_WEIGHT_ATTESTATION_FEATURE && (!selector.ref || selector.ref === review.to), "Personal attestation exact source authority differs");
    return review;
  }
  if (selector.feature === QUANTITY_V4_FEATURE || selector.phase?.startsWith("worker-")
    || (QUANTITY_V4_RELEASE_SHA && selector.ref === QUANTITY_V4_RELEASE_SHA)
    || (selector.reviewSha256 && [QUANTITY_V4_CONSUMERS_REVIEW_PIN.sha256, QUANTITY_V4_WORKER_REVIEW_PIN.sha256].includes(selector.reviewSha256))) {
    const stage = selector.reviewSha256 === QUANTITY_V4_WORKER_REVIEW_PIN.sha256 ? "worker" : quantityV4StageForPhase(selector.phase ?? "database");
    const pins = protectedRolloutPins({ feature: QUANTITY_V4_FEATURE, quantityStage: stage });
    closedR2Require(CLOSED_R2_REF.test(QUANTITY_V4_RELEASE_SHA ?? "") && isAbsolute(pins.rollout.path ?? "") && CLOSED_R2_SHA.test(pins.rollout.sha256 ?? "")
      && CLOSED_R2_SHA.test(QUANTITY_V4_PROTECTION?.normalProjectionSha256 ?? "") && CLOSED_R2_SHA.test(QUANTITY_V4_PROTECTION?.postimageRegistrySha256 ?? ""), "C04 source/stage/protection PIN is unbound; no private I/O permitted");
    if (stage === "worker") closedR2Require(isAbsolute(QUANTITY_V4_WORKER_CONTROL_REVIEW_PIN.path ?? "")
      && CLOSED_R2_SHA.test(QUANTITY_V4_WORKER_CONTROL_REVIEW_PIN.sha256 ?? "") && isAbsolute(QUANTITY_V4_WORKER_OPERATION_ROOT ?? ""), "C04 original worker authority is unbound; no private I/O permitted");
    const review = readProtectedRolloutPin(repositoryRoot, pins.rollout);
    closedR2Require(review.feature === QUANTITY_V4_FEATURE && review.quantityStage === stage && review.to === QUANTITY_V4_RELEASE_SHA
      && (!selector.ref || selector.ref === review.to) && (!selector.reviewSha256 || selector.reviewSha256 === pins.rollout.sha256), "C04 exact source/stage authority differs");
    return review;
  }
  if (selector.feature === COOKED_WEIGHT_FEATURE || (selector.reviewSha256 && selector.reviewSha256 === COOKED_WEIGHT_ROLLOUT_REVIEW_PIN.sha256)) {
    const review = readProtectedRolloutPin(repositoryRoot, COOKED_WEIGHT_ROLLOUT_REVIEW_PIN);
    closedR2Require(review.feature === COOKED_WEIGHT_FEATURE, "C01 pin cannot use another feature's authority");
    return review;
  }
  if (selector.reviewSha256) closedR2Require(selector.reviewSha256 === PROTECTED_ROLLOUT_REVIEW_PIN.sha256, "Unknown protected marker authority");
  const review = readProtectedRolloutPin(repositoryRoot, PROTECTED_ROLLOUT_REVIEW_PIN);
  closedR2Require(review.feature === "recipe-product-source", "C03 pin cannot be retargeted");
  if (selector.ref && selector.ref !== review.to) {
    const weight = readProtectedRolloutPin(repositoryRoot, COOKED_WEIGHT_ROLLOUT_REVIEW_PIN);
    closedR2Require(weight.to === selector.ref, "Protected control selection requires its exact approved reader reference");
    return weight;
  }
  return review;
}

export function loadProtectedWriterReview(repositoryRoot, rollout) {
  const pins = protectedRolloutPins(rollout);
  closedR2Require(isAbsolute(pins.writer.path ?? "") && CLOSED_R2_SHA.test(pins.writer.sha256 ?? ""),
    "신형 쓰기 ON/OFF의 별도 승인 핀이 비어 있어 실행할 수 없습니다.");
  const bytes = readClosedR2PrivateBytes(pins.writer.path, repositoryRoot, 65536);
  closedR2Require(closedR2Hash(bytes) === pins.writer.sha256, "신형 쓰기 승인 자료 bytes가 바뀌었습니다.");
  return assertProtectedWriterReview(JSON.parse(bytes), rollout, pins.rollout.sha256);
}

export function assertProtectedWriterReview(approval, rollout, rolloutReviewSha256) {
  assertProtectedRolloutReview(rollout);
  const quantity = rollout.feature === QUANTITY_V4_FEATURE;
  closedR2Require(approval?.schema === "homecook.prelaunch-protected-writer-review.v1"
    && Object.keys(approval).sort().join() === (quantity ? "databasePlanSha256,readerFlowsSha256,readerReceiptSha256,releaseSha,rolloutReviewSha256,safeOff,schema,workerReceiptSha256,writerOn" : "databasePlanSha256,readerFlowsSha256,readerReceiptSha256,releaseSha,rolloutReviewSha256,safeOff,schema,writerOn")
    && CLOSED_R2_SHA.test(rolloutReviewSha256 ?? "") && approval.rolloutReviewSha256 === rolloutReviewSha256
    && approval.releaseSha === rollout.to && approval.writerOn === true && approval.safeOff === true
    && approval.databasePlanSha256 === closedR2Hash(JSON.stringify({ source: rollout.database?.after, applied: rollout.database?.after }))
    && approval.readerFlowsSha256 === rollout.readerFlowsSha256
    && (approval.readerReceiptSha256 === null || CLOSED_R2_SHA.test(approval.readerReceiptSha256 ?? "")), "ON과 안전 OFF는 최종 source/DB/reader 조건의 별도 정확한 승인이 필요합니다.");
  if (quantity) closedR2Require(rollout.quantityStage === "worker" && CLOSED_R2_SHA.test(QUANTITY_V4_WORKER_CONTROL_REVIEW_PIN.sha256 ?? "")
    && rollout.workerAuthority.controlReviewSha256 === QUANTITY_V4_WORKER_CONTROL_REVIEW_PIN.sha256
    && (approval.workerReceiptSha256 === null || CLOSED_R2_SHA.test(approval.workerReceiptSha256)), "C04 ON/OFF approval requires root-bound original worker authority");
  return approval;
}

export function assertProtectedRolloutReview(review) {
  if (review?.feature === RECIPE_REQUEST_ROLE_FEATURE) return assertRecipeRequestRoleReview(review);
  if (review?.feature === RECIPE_SAVE_RECOVERY_FEATURE) return assertRecipeSaveRecoveryReview(review);
  if (review?.feature === NUTRITION_VALIDATOR_FEATURE) return assertNutritionValidatorReview(review);
  const cookedWeight = review?.feature === COOKED_WEIGHT_FEATURE;
  const quantity = review?.feature === QUANTITY_V4_FEATURE;
  const attestation = review?.feature === COOKED_WEIGHT_ATTESTATION_FEATURE;
  const exactC03Sources = new Set(attestation ? ["scripts/lib/full-local-security-inventory.mjs", "scripts/lib/full-local-restore-cutover.mjs", "scripts/deploy-prelaunch-web.mjs", "scripts/lib/prelaunch-web-deploy.mjs", "scripts/lib/prelaunch-database.mjs"] : quantity ? ["scripts/lib/full-local-security-inventory.mjs", "scripts/lib/youtube-extraction-worker-runtime.mjs",
    "scripts/manifests/youtube-extraction-expected-schema.json", "scripts/deploy-prelaunch-web.mjs", "scripts/lib/prelaunch-web-deploy.mjs", "scripts/lib/prelaunch-database.mjs", "eslint.config.mjs"] : cookedWeight ? ["scripts/lib/full-local-security-inventory.mjs"]
    : ["scripts/lib/full-local-security-inventory.mjs", "lib/server/hybrid-auth/public-read-policy-runtime.mjs"]);
  closedR2Require(review?.schema === "homecook.prelaunch-protected-rollout-review.v1" && ["recipe-product-source", COOKED_WEIGHT_FEATURE, QUANTITY_V4_FEATURE, COOKED_WEIGHT_ATTESTATION_FEATURE].includes(review.feature)
    && CLOSED_R2_REF.test(review.from ?? "") && CLOSED_R2_REF.test(review.to ?? "") && review.from !== review.to,
    "보호 전환의 정확한 source pair가 필요합니다.");
  closedR2Require(review.files && Object.keys(review.files).length > 0 && Object.entries(review.files).every(([path, pair]) =>
    (/^(?:app|components|lib|stores|types|hooks|tests|docs|supabase\/migrations)\//u.test(path) || exactC03Sources.has(path))
    && !path.split("/").some(part => ["", ".", ".."].includes(part))
    && Array.isArray(pair) && pair.length === 2 && pair.every(value => value === null || CLOSED_R2_SHA.test(value))
    && pair[0] !== pair[1]), "보호 전환은 전체 변경 파일의 exact before/after bytes만 허용합니다.");
  for (const path of exactC03Sources) {
    closedR2Require(!Object.hasOwn(review.files, path) || review.files[path].every(value => CLOSED_R2_SHA.test(value)), "C03 두 source 파일은 모두 정확한 기존 before/after byte SHA가 필요합니다.");
  }
  closedR2Require(!Object.keys(review.files).some(path => !exactC03Sources.has(path) && /^(?:app\/(?:beta|privacy|api\/v1\/marketing|%5F_ops\/r2-preflight)\/|components\/marketing\/|lib\/(?:marketing[./-]|server\/(?:marketing-|recording-page\.|homeflow-page\.|full-local-auth\/|hybrid-auth\/))|types\/marketing-)/u.test(path)),
    "C03 승인은 기존 R2/인증 runtime 보호 예외를 열지 않습니다.");
  closedR2Require(typeof review.predecessorBuildId === "string" && review.predecessorBuildId.length > 0
    && CLOSED_R2_SHA.test(review.predecessorPlistSha256 ?? "") && CLOSED_R2_SHA.test(review.closedArtifactSha256 ?? "")
    && review.closedReviewSha256 === CLOSED_R2_REVIEW_PIN.sha256 && CLOSED_R2_SHA.test(review.controlSha256 ?? "")
    && review.consentGeneration === 1 && CLOSED_R2_SHA.test(review.historicalProofsSha256 ?? ""), "보호 전환의 기존 닫힘 출처가 필요합니다.");
  closedR2Require(review.testScript === "test:feedback-batch:web" && review.approved?.database === true
    && review.approved.reader === (quantity ? review.quantityStage === "worker" : true)
    && review.approved.writerOn === false, "현재 초안은 DB/reader 승인만 다루며 writer ON 승인을 추정하지 않습니다.");
  closedR2Require(CLOSED_R2_SHA.test(review.isolatedEvidenceSha256 ?? "") && CLOSED_R2_SHA.test(review.readerFlowsSha256 ?? "") && review.allNewShapesOff === true
    && review.legacyReaderCompatible === true, "신형 marker/rowref 전체의 OFF·구 reader 호환 격리 증거가 필요합니다.");
  for (const key of ["isolatedEvidence", "readerFlows", "platformInventory", "backupReadiness"]) {
    closedR2Require(isAbsolute(review[key]?.path ?? "") && CLOSED_R2_SHA.test(review[key]?.sha256 ?? ""), "보호 전환의 비공개 증거 파일 pin이 필요합니다.");
  }
  closedR2Require(review.isolatedEvidence.sha256 === review.isolatedEvidenceSha256 && review.readerFlows.sha256 === review.readerFlowsSha256
    && isAbsolute(review.database?.configPath ?? "") && CLOSED_R2_SHA.test(review.database?.configSha256 ?? ""), "설정 bytes와 격리/reader 증거가 다릅니다.");
  if (cookedWeight) {
    const previous = review.predecessorProtected, database = review.database;
    closedR2Require(previous?.reviewSha256 === PROTECTED_ROLLOUT_REVIEW_PIN.sha256 && previous.writerApprovalSha256 === PROTECTED_WRITER_REVIEW_PIN.sha256
      && previous.writerEnabled === true && CLOSED_R2_REF.test(previous.readerFloor ?? "") && previous.readerFloor !== review.to
      && ["databaseReceipt", "readerReceipt", "writerReceipt"].every(key => isAbsolute(previous[key]?.path ?? "") && CLOSED_R2_SHA.test(previous[key]?.sha256 ?? "")),
      "C01 requires the unchanged C03 DB/ON/reader floor authority, not a retargeted C03 approval");
    closedR2Require(Array.isArray(database.before) && database.before.length === 220 && database.after?.length === 221
      && database.migrations?.length === 1 && database.migrations[0].filename === COOKED_WEIGHT_MIGRATION
      && CLOSED_R2_SHA.test(database.afterImmutableSha256 ?? "") && CLOSED_R2_SHA.test(database.stableImmutableSha256 ?? "")
      && CLOSED_R2_SHA.test(database.scopeTransition?.beforeOuterSha256 ?? "") && CLOSED_R2_SHA.test(database.scopeTransition?.afterOuterSha256 ?? "")
      && database.scopeTransition.afterOuterSha256 !== database.scopeTransition.beforeOuterSha256
      && database.scopeTransition.afterAliasSha256 === database.scopeTransition.beforeOuterSha256,
      "C01 requires exact220/221, whole before/after immutable and the unchanged remainder plus preserved scope alias");
    const environment = review.readerEnvironment;
    closedR2Require(environment && Object.keys(environment).join() === COOKED_WEIGHT_ENVIRONMENT
      && Array.isArray(environment[COOKED_WEIGHT_ENVIRONMENT]) && environment[COOKED_WEIGHT_ENVIRONMENT].length === 2
      && [null, "0", "1"].includes(environment[COOKED_WEIGHT_ENVIRONMENT][0]) && environment[COOKED_WEIGHT_ENVIRONMENT][1] === "1",
      "Only the exact C01 server gate can be added at the verified reader stage");
  }
  if (quantity) assertQuantityV4Review(review);
  if (attestation) assertCookedWeightAttestationReview(review);
  return review;
}

function assertQuantityV4Review(review) {
  const database = review.database, previous = review.predecessorProtected;
  const consumers = review.quantityStage === "consumers", beforeCount = consumers ? 221 : 226, afterCount = consumers ? 226 : 227;
  const source = database?.source;
  closedR2Require(["consumers", "worker"].includes(review.quantityStage) && Array.isArray(source) && source.length === 227
    && database.before?.length === beforeCount && database.after?.length === afterCount
    && isDeepStrictEqual(database.before, source.slice(0, beforeCount)) && isDeepStrictEqual(database.after, source.slice(0, afterCount))
    && isDeepStrictEqual(source.slice(221), QUANTITY_V4_MIGRATIONS.map(({ filename, sha256 }) => ({ filename, sha256 })))
    && source[220].filename === COOKED_WEIGHT_MIGRATION && source[220].sha256 === "60b9f4008768fc0846eb0b3a104fac3ef0650975535371adf876b95dcb711aa0"
    && isDeepStrictEqual(database.migrations?.map(row => [row.filename, row.rawSha256]), QUANTITY_V4_MIGRATIONS.slice(consumers ? 0 : 5, consumers ? 5 : 6).map(row => [row.filename, row.sha256])),
    "C04 requires exact227 source and fixed221/226/227 stage projections");
  closedR2Require(previous?.reviewSha256 === COOKED_WEIGHT_ROLLOUT_REVIEW_PIN.sha256 && previous.writerApprovalSha256 === COOKED_WEIGHT_WRITER_REVIEW_PIN.sha256
    && previous.writerEnabled === true && previous.productWriterEnabled === true && CLOSED_R2_REF.test(previous.readerFloor ?? "")
    && ["databaseReceipt", "readerReceipt", "writerReceipt"].every(key => isAbsolute(previous[key]?.path ?? "") && CLOSED_R2_SHA.test(previous[key]?.sha256 ?? "")),
    "C04 requires completed committed C01 DB/reader/floor and actual writer ON; preserve C03 ON");
  closedR2Require(CLOSED_R2_SHA.test(database.afterImmutableSha256 ?? "") && CLOSED_R2_SHA.test(database.normalProjectionSha256 ?? "")
    && CLOSED_R2_SHA.test(database.beforeColumnsSha256 ?? "") && CLOSED_R2_SHA.test(database.afterColumnsSha256 ?? "")
    && CLOSED_R2_SHA.test(database.postimageRegistrySha256 ?? "") && ["beforeScope", "afterScope"].every(key => database[key]
      && Object.keys(database[key]).sort().join() === "aliasSha256,outerSha256" && Object.values(database[key]).every(value => CLOSED_R2_SHA.test(value)))
    && database.beforeScope.aliasSha256 === database.afterScope.aliasSha256
    && database.workerCatalogBefore === QUANTITY_V4_WORKER_CATALOG_BEFORE
    && database.workerCatalogAfter === (consumers ? QUANTITY_V4_WORKER_CATALOG_BEFORE : QUANTITY_V4_WORKER_CATALOG_AFTER),
    "C04 exact whole immutable/data protection/scope/worker catalogs required");
  closedR2Require(database.workerBaseline && Object.keys(database.workerBaseline).sort().join() === "credentialGeneration,credentialRowSha256,policyRowSha256,schemaIdentity,snapshotDigest,workerPolicyEnabled,workerReleaseSha"
    && Number.isSafeInteger(database.workerBaseline.credentialGeneration) && database.workerBaseline.credentialGeneration > 0
    && CLOSED_R2_REF.test(database.workerBaseline.workerReleaseSha ?? "") && typeof database.workerBaseline.workerPolicyEnabled === "boolean"
    && database.workerBaseline.schemaIdentity === QUANTITY_V4_WORKER_SCHEMA_IDENTITY
    && CLOSED_R2_SHA.test(database.workerBaseline.snapshotDigest ?? "")
    && ["credentialRowSha256", "policyRowSha256"].every(key => CLOSED_R2_SHA.test(database.workerBaseline[key] ?? "") || (!consumers && database.workerBaseline[key] === null)), "C04 actual worker prestate metadata binding required");
  closedR2Require(review.readerEnvironment && Object.keys(review.readerEnvironment).join() === QUANTITY_V4_ENVIRONMENT
    && isDeepStrictEqual(review.readerEnvironment[QUANTITY_V4_ENVIRONMENT], [null, "true"]), "C04 reader adds only its exact quantity gate");
  if (!consumers) closedR2Require(isAbsolute(review.consumersReceipt?.path ?? "") && CLOSED_R2_SHA.test(review.consumersReceipt?.sha256 ?? "")
    && review.workerAuthority && Object.keys(review.workerAuthority).sort().join() === "controlReviewSha256,operationId"
    && CLOSED_R2_SHA.test(review.workerAuthority.controlReviewSha256 ?? "")
    && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(review.workerAuthority.operationId ?? ""), "C04 worker requires terminal226 and its original controlled operation authority");
}

export function assertNutritionValidatorReview(review) {
  const db = review?.database, image = value => value && Object.keys(value).sort().join() === "definitionSha256,metadataSha256,sourceMd5"
    && CLOSED_R2_SHA.test(value.definitionSha256) && CLOSED_R2_SHA.test(value.metadataSha256) && /^[a-f0-9]{32}$/u.test(value.sourceMd5);
  closedR2Require(review?.schema === "homecook.prelaunch-protected-rollout-review.v1" && review.feature === NUTRITION_VALIDATOR_FEATURE
    && CLOSED_R2_SHA.test(NUTRITION_VALIDATOR_MIGRATION_SHA256 ?? "")
    && CLOSED_R2_REF.test(review.from ?? "") && CLOSED_R2_REF.test(review.to ?? "") && review.from !== review.to
    && review.sourceReaderRef === review.from && review.migrationSourceRef === review.to && CLOSED_R2_SHA.test(review.readerValidatorSha256 ?? "")
    && review.readerPrecedesDatabase === true && isDeepStrictEqual(review.approved, { database: true, reader: false, writerOn: false })
    && review.testScript === "test:feedback-batch:web" && isDeepStrictEqual(review.readerEnvironment, {}), "Nutrition validator exact reader-first authority is unbound or differs");
  closedR2Require(typeof review.predecessorBuildId === "string" && review.predecessorBuildId.length > 0
    && ["predecessorPlistSha256", "closedArtifactSha256", "controlSha256", "historicalProofsSha256", "isolatedEvidenceSha256", "readerFlowsSha256"].every(key => CLOSED_R2_SHA.test(review[key] ?? ""))
    && review.closedReviewSha256 === CLOSED_R2_REVIEW_PIN.sha256 && review.consentGeneration === 1
    && ["isolatedEvidence", "readerFlows", "platformInventory", "backupReadiness"].every(key => isAbsolute(review[key]?.path ?? "") && CLOSED_R2_SHA.test(review[key]?.sha256 ?? ""))
    && review.isolatedEvidence.sha256 === review.isolatedEvidenceSha256 && review.readerFlows.sha256 === review.readerFlowsSha256,
    "Nutrition validator reader/closed history/evidence binding differs");
  const migrationPath = `supabase/migrations/${NUTRITION_VALIDATOR_MIGRATION}`;
  closedR2Require(review.files && isDeepStrictEqual(review.files[migrationPath], [null, NUTRITION_VALIDATOR_MIGRATION_SHA256])
    && Object.entries(review.files).every(([file, pair]) => (file === migrationPath || /^(?:tests|docs)\//u.test(file))
      && !file.split("/").some(part => ["", ".", ".."].includes(part)) && Array.isArray(pair) && pair.length === 2
      && pair.every(value => value === null || CLOSED_R2_SHA.test(value)) && pair[0] !== pair[1]), "Nutrition maintenance cannot change the already-installed reader or another SQL");
  closedR2Require(db?.before?.length === 228 && db.after?.length === 229 && isDeepStrictEqual(db.after.slice(0, 228), db.before)
    && db.before[227].filename === COOKED_WEIGHT_ATTESTATION_MIGRATION && db.before[227].sha256 === COOKED_WEIGHT_ATTESTATION_MIGRATION_SHA256
    && db.after[228].filename === NUTRITION_VALIDATOR_MIGRATION && db.after[228].sha256 === NUTRITION_VALIDATOR_MIGRATION_SHA256
    && db.migrations?.length === 1 && db.migrations[0].filename === NUTRITION_VALIDATOR_MIGRATION
    && db.migrations[0].rawSha256 === NUTRITION_VALIDATOR_MIGRATION_SHA256 && CLOSED_R2_SHA.test(db.migrations[0].payloadSha256 ?? "")
    && isAbsolute(db.configPath ?? "") && CLOSED_R2_SHA.test(db.configSha256 ?? "")
    && ["targetSha256", "beforeCatalogSha256", "afterCatalogSha256", "immutableSha256", "stableImmutableSha256", "normalProjectionSha256", "postimageRegistrySha256", "attestationPostimageRegistrySha256", "beforeColumnsSha256"].every(key => CLOSED_R2_SHA.test(db[key] ?? ""))
    && db.normalProjectionSha256 === QUANTITY_V4_PROTECTION?.normalProjectionSha256
    && db.postimageRegistrySha256 === QUANTITY_V4_PROTECTION?.postimageRegistrySha256
    && db.afterImmutableSha256 === db.immutableSha256 && db.afterColumnsSha256 === db.beforeColumnsSha256
    && isDeepStrictEqual(db.beforeScope, db.afterScope) && Object.values(db.beforeScope ?? {}).length === 2
    && Object.values(db.beforeScope).every(value => CLOSED_R2_SHA.test(value))
    && db.attestationScope?.beforeOuterSha256 === db.attestationScope?.afterOuterSha256
    && db.attestationScope.afterOuterSha256 === db.afterScope.outerSha256 && CLOSED_R2_SHA.test(db.attestationScope.afterAliasSha256 ?? "")
    && db.workerCatalogBefore === QUANTITY_V4_WORKER_CATALOG_AFTER && db.workerCatalogAfter === QUANTITY_V4_WORKER_CATALOG_AFTER
    && db.functionSignature === "public.validate_recipe_nutrition_snapshot_payload(jsonb)" && image(db.functionBefore) && image(db.functionAfter)
    && db.functionBefore.metadataSha256 === db.functionAfter.metadataSha256
    && db.functionBefore.definitionSha256 !== db.functionAfter.definitionSha256 && db.functionBefore.sourceMd5 !== db.functionAfter.sourceMd5,
    "Nutrition validator exact228/229/function/catalog/unchanged authority image differs");
  closedR2Require(review.predecessorAttestation?.reviewSha256 === COOKED_WEIGHT_ATTESTATION_ROLLOUT_REVIEW_PIN.sha256
    && CLOSED_R2_REF.test(review.predecessorAttestation.readerFloor ?? "")
    && ["databaseReceipt", "readerReceipt", "writerReceipt"].every(key => isAbsolute(review.predecessorAttestation[key]?.path ?? "") && CLOSED_R2_SHA.test(review.predecessorAttestation[key]?.sha256 ?? ""))
    && db.workerBaseline?.credentialGeneration === 48 && db.workerBaseline.workerReleaseSha === QUANTITY_V4_RELEASE_SHA
    && db.workerBaseline.schemaIdentity === QUANTITY_V4_WORKER_SCHEMA_IDENTITY && db.workerBaseline.workerPolicyEnabled === true
    && ["credentialRowSha256", "policyRowSha256", "policyStableSha256", "snapshotDigest"].every(key => CLOSED_R2_SHA.test(db.workerBaseline[key] ?? "")),
    "Nutrition validator preserves personal/C04 current48 authority");
  return review;
}

export function assertNutritionValidatorReader(review, live) {
  assertNutritionValidatorReview(review);
  closedR2Require(live?.ref === review.sourceReaderRef && live.buildId === review.predecessorBuildId
    && live.plistSha256 === review.predecessorPlistSha256 && live.validatorSha256 === review.readerValidatorSha256 && live.healthy === true,
    "Nutrition SQL requires the exact healthy228-compatible reader before dispatch and COMMIT");
  return live;
}

export function assertNutritionValidatorDatabaseReceipt(review, record) {
  assertNutritionValidatorReview(review);
  closedR2Require(record?.schema === "homecook.prelaunch-protected-db-attempt.v1" && record.feature === NUTRITION_VALIDATOR_FEATURE
    && record.status === "committed" && record.reviewSha256 === NUTRITION_VALIDATOR_ROLLOUT_REVIEW_PIN.sha256
    && record.from === review.from && record.to === review.to && record.sourceReaderRef === review.sourceReaderRef
    && record.readerFloor === review.sourceReaderRef && record.targetSha256 === review.database.targetSha256
    && record.databasePlanSha256 === closedR2Hash(JSON.stringify({ source: review.database.after, applied: review.database.after }))
    && record.catalogSha256 === review.database.afterCatalogSha256 && record.immutableSha256 === review.database.immutableSha256
    && record.rowsPreservedInTransaction === true && record.controlsPreservedInTransaction === true
    && record.productWriterEnabled === true && record.cookedWeightWriterEnabled === true && record.quantityWriterEnabled === true
    && record.attestationWriterEnabled === true && record.workerPolicyEnabled === true && record.backwardCompatible === false
    && ["normalDataSha256", "preservedRowsSha256", "attestationRowsSha256"].every(key => CLOSED_R2_SHA.test(record[key] ?? ""))
    && record.backup?.fullArchiveDecoded === true && CLOSED_R2_SHA.test(record.backup.sha256 ?? "") && CLOSED_R2_SHA.test(record.backup.rolesSha256 ?? "")
    && closedR2Hash(JSON.stringify(record.backup.target)) === review.database.targetSha256
    && isDeepStrictEqual(record.predecessorAttestation, review.predecessorAttestation), "Nutrition validator immutable229 terminal differs");
  return record;
}

export function nutritionValidatorMaintenanceBinding(maintenance) {
  if (!maintenance) return null;
  if (maintenance.review?.feature === RECIPE_REQUEST_ROLE_FEATURE) return recipeRequestRoleBinding(maintenance);
  if (maintenance.review?.feature === RECIPE_SAVE_RECOVERY_FEATURE) return recipeSaveRecoveryBinding(maintenance);
  assertNutritionValidatorDatabaseReceipt(maintenance.review, maintenance.record);
  closedR2Require(maintenance.pointer?.sha256 === maintenance.guardPointer?.sha256 && isAbsolute(maintenance.pointer?.path ?? "")
    && CLOSED_R2_SHA.test(maintenance.pointer.sha256), "Nutrition terminal bytes binding differs");
  return { schema: "homecook.recipe-nutrition-validator-maintenance.v1", reviewSha256: NUTRITION_VALIDATOR_ROLLOUT_REVIEW_PIN.sha256,
    receipt: maintenance.pointer, predecessorDatabaseReceiptSha256: maintenance.review.predecessorAttestation.databaseReceipt.sha256,
    targetSha256: maintenance.review.database.targetSha256, ledgerCount: 229, migrationSha256: NUTRITION_VALIDATOR_MIGRATION_SHA256,
    sourceReaderRef: maintenance.review.sourceReaderRef, databasePlanSha256: maintenance.record.databasePlanSha256 };
}

export function readNutritionValidatorAttempt(repositoryRoot) {
  const paths = protectedRolloutPaths(prelaunchStateRoot(), { feature: NUTRITION_VALIDATOR_FEATURE });
  if (!existsSync(paths.databaseGuardPath)) return null;
  const review = loadProtectedRolloutReview(repositoryRoot, { feature: NUTRITION_VALIDATOR_FEATURE });
  const bytes = readClosedR2PrivateBytes(paths.databaseGuardPath, repositoryRoot, 524288), record = JSON.parse(bytes);
  closedR2Require(record?.schema === "homecook.prelaunch-protected-db-attempt.v1" && record.feature === NUTRITION_VALIDATOR_FEATURE
    && record.reviewSha256 === NUTRITION_VALIDATOR_ROLLOUT_REVIEW_PIN.sha256 && record.from === review.from && record.to === review.to
    && record.journalFile === "attempt.json" && record.sourceReaderRef === review.sourceReaderRef
    && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(record.operationId ?? "")
    && record.operationDirectory === join(paths.operationRoot, record.operationId)
    && ["applying_precommit", "commit_dispatch_guard", "unknown", "rolled_back_before_commit", "committed", "not_applied"].includes(record.status),
    "Nutrition maintenance unresolved/foreign guard cannot fall back to228");
  closedR2Require(["committed", "not_applied"].includes(record.status) ? record.targetSha256 === review.database.targetSha256
    : closedR2Hash(JSON.stringify(record.target)) === review.database.targetSha256, "Nutrition attempt target differs");
  return { review, record, bytes, paths };
}

export function nutritionValidatorPhaseStatus(attempt, readerCompatible = false) {
  const { review, record } = attempt;
  assertNutritionValidatorReview(review);
  const committed = record.status === "committed", unapplied = record.status === "not_applied";
  if (committed) assertNutritionValidatorDatabaseReceipt(review, record);
  return { feature: NUTRITION_VALIDATOR_FEATURE, phase: record.status,
    databasePlanSha256: committed ? record.databasePlanSha256 : unapplied ? closedR2Hash(JSON.stringify({ source: review.database.before, applied: review.database.before })) : null,
    appliedLedgerCount: committed ? 229 : unapplied ? 228 : null, readerFloor: committed ? review.sourceReaderRef : null,
    readerPending: committed && !readerCompatible, normalDeploymentAllowed: (committed || unapplied) && readerCompatible,
    backwardCompatible: false, recordedWriterEnabled: committed ? true : null };
}

export function assertProtectedWriterDatabaseBoundary(attempt, maintenance) {
  closedR2Require(isDeepStrictEqual(attempt?.databaseMaintenance ?? null, nutritionValidatorMaintenanceBinding(maintenance)),
    "Writer intent cannot reconcile or retry across the228/229 boundary");
  return attempt;
}

export function assertNutritionValidatorWriterAttempts(records, maintenance = null) {
  for (const { record, reviewSha256, approvalSha256 } of records) {
    closedR2Require(record?.schema === "homecook.prelaunch-protected-writer-attempt.v1"
      && record.reviewSha256 === reviewSha256 && record.approvalSha256 === approvalSha256
      && ["committed", "not_applied", "closed_after_unknown"].includes(record.status),
      "Nutrition maintenance cannot cross an unresolved protected writer intent");
    closedR2Require(!record.databaseMaintenance || isDeepStrictEqual(record.databaseMaintenance, maintenance),
      "Protected writer belongs to a different database maintenance boundary");
  }
  return records;
}

export function verifyNutritionValidatorWriterAdmission(repositoryRoot, maintenanceBinding = null) {
  const records = [];
  for (const selector of [{}, { feature: COOKED_WEIGHT_FEATURE }, { feature: QUANTITY_V4_FEATURE, phase: "worker-database" }, { feature: COOKED_WEIGHT_ATTESTATION_FEATURE }]) {
    const review = loadProtectedRolloutReview(repositoryRoot, selector), pins = protectedRolloutPins(review);
    const paths = protectedRolloutPaths(prelaunchStateRoot(), review);
    for (const action of ["writer-on", "writer-off"]) {
      const path = join(prelaunchStateRoot(), `${paths.writerPrefix}-${pins.writer.sha256}-${action}.json`);
      if (existsSync(path)) records.push({ record: JSON.parse(readClosedR2PrivateBytes(path, repositoryRoot, 524288)), reviewSha256: pins.rollout.sha256, approvalSha256: pins.writer.sha256 });
    }
  }
  return assertNutritionValidatorWriterAttempts(records, maintenanceBinding);
}

export function verifyNutritionValidatorPredecessor(review, repositoryRoot) {
  assertNutritionValidatorReview(review);
  const predecessor = loadCookedWeightAttestationSuccessor(repositoryRoot), previous = review.predecessorAttestation;
  closedR2Require(predecessor && predecessor.pointer.path === previous.databaseReceipt.path && predecessor.pointer.sha256 === previous.databaseReceipt.sha256
    && predecessor.review.to === previous.readerFloor && isDeepStrictEqual(predecessor.review.database.after, review.database.before)
    && predecessor.review.database.afterCatalogSha256 === review.database.beforeCatalogSha256
    && predecessor.review.database.afterImmutableSha256 === review.database.immutableSha256
    && isDeepStrictEqual(predecessor.review.database.afterScope, review.database.beforeScope)
    && predecessor.review.database.attestationScope.afterOuterSha256 === review.database.attestationScope.beforeOuterSha256
    && predecessor.review.database.attestationScope.afterAliasSha256 === review.database.attestationScope.afterAliasSha256,
    "Nutrition maintenance exact personal228 predecessor differs");
  const paths = protectedRolloutPaths(prelaunchStateRoot(), predecessor.review), pins = protectedRolloutPins(predecessor.review);
  closedR2Require(previous.readerReceipt.path === paths.readerReceiptPath
    && previous.writerReceipt.path === join(prelaunchStateRoot(), `${paths.writerPrefix}-${pins.writer.sha256}-writer-on.json`), "Nutrition maintenance original reader/writer locator differs");
  const readerBytes = readClosedR2PrivateBytes(previous.readerReceipt.path, repositoryRoot, 524288);
  const writerBytes = readClosedR2PrivateBytes(previous.writerReceipt.path, repositoryRoot, 524288);
  const reader = JSON.parse(readerBytes), writer = JSON.parse(writerBytes);
  closedR2Require(closedR2Hash(readerBytes) === previous.readerReceipt.sha256 && closedR2Hash(writerBytes) === previous.writerReceipt.sha256
    && reader.schema === "homecook.prelaunch-protected-reader.v1" && reader.reviewSha256 === pins.rollout.sha256
    && reader.readerFloor === predecessor.review.to && reader.backwardCompatible === false && reader.databasePlanSha256 === predecessor.record.databasePlanSha256
    && writer.status === "committed" && writer.writerEnabled === true && writer.reviewSha256 === pins.rollout.sha256
    && writer.approvalSha256 === pins.writer.sha256 && writer.readerReceiptSha256 === previous.readerReceipt.sha256,
    "Nutrition maintenance original committed personal reader/writer bytes differ");
  return predecessor;
}

export function assertNutritionValidatorSourceHandoff({ maintenance, from, to, live, files, digests, reviewedSourceAncestor = /** @type {boolean | undefined} */ (undefined) }) {
  if (maintenance?.review.feature === RECIPE_REQUEST_ROLE_FEATURE) return assertRecipeRequestRoleSourceHandoff({ maintenance, from, to, live, files, digests, reviewedSourceAncestor });
  if (maintenance?.review.feature === RECIPE_SAVE_RECOVERY_FEATURE) return assertRecipeSaveRecoverySourceHandoff({ maintenance, from, to, live, files, digests });
  nutritionValidatorMaintenanceBinding(maintenance);
  const review = maintenance.review;
  closedR2Require(from === review.sourceReaderRef && to === review.migrationSourceRef
    && live?.ref === from && live.buildId === review.predecessorBuildId && live.plistSha256 === review.predecessorPlistSha256
    && isDeepStrictEqual([...files].sort(), Object.keys(review.files).sort()) && isDeepStrictEqual(digests, review.files),
    "Only the committed exact228-reader to full229-source handoff may carry its already-applied SQL");
  return true;
}

export function assertNutritionValidatorReaderCompensation(maintenance, before, targetRef) {
  if ([RECIPE_SAVE_RECOVERY_FEATURE, RECIPE_REQUEST_ROLE_FEATURE].includes(maintenance?.review.feature)) throw new DeploymentError("Recipe-save runtime handoff requires forward repair; no automatic reader compensation after new writes");
  nutritionValidatorMaintenanceBinding(maintenance);
  const review = maintenance.review;
  closedR2Require(targetRef === review.migrationSourceRef && before.ref === review.sourceReaderRef
    && before.buildId === review.predecessorBuildId && before.plistSha256 === review.predecessorPlistSha256
    && before.validatorSha256 === review.readerValidatorSha256,
    "Full229 handoff may compensate only to its exact compatible readerA, never the pre-fix reader");
  return before;
}

export function assertNutritionValidatorMarker(maintenance, marker, sourceReaderMarker = false) {
  if (maintenance?.review.feature === RECIPE_REQUEST_ROLE_FEATURE) return assertRecipeRequestRoleMarker(maintenance, marker, sourceReaderMarker);
  if (maintenance?.review.feature === RECIPE_SAVE_RECOVERY_FEATURE) return assertRecipeSaveRecoveryMarker(maintenance, marker, sourceReaderMarker);
  const binding = nutritionValidatorMaintenanceBinding(maintenance);
  closedR2Require(marker && (isDeepStrictEqual(marker.databaseMaintenance, binding)
    || sourceReaderMarker && marker.databaseMaintenance === undefined), "Current229 marker is missing or has foreign maintenance authority");
  closedR2Require(marker.databasePlanSha256 === maintenance.predecessor.record.databasePlanSha256,
    "Historical228 marker plan must not be retargeted to229");
  return marker;
}

export function loadNutritionValidatorMaintenance(repositoryRoot) {
  const attempt = readNutritionValidatorAttempt(repositoryRoot);
  if (!attempt) return null;
  const { review, record, bytes, paths } = attempt;
  closedR2Require(["committed", "not_applied"].includes(record.status), "Nutrition maintenance outcome unresolved; retain229 fence");
  const pointer = { path: join(record.operationDirectory, "receipt.json"), sha256: closedR2Hash(bytes) };
  closedR2Require(readClosedR2PrivateBytes(pointer.path, repositoryRoot, 524288).equals(bytes), "Nutrition terminal and guard bytes differ");
  if (record.status === "not_applied") return null;
  assertNutritionValidatorDatabaseReceipt(review, record);
  const predecessor = verifyNutritionValidatorPredecessor(review, repositoryRoot);
  return { review, record, pointer, guardPointer: { path: paths.databaseGuardPath, sha256: pointer.sha256 }, predecessor };
}

export function assertCookedWeightAttestationReview(review) {
  const database = review.database, previous = review.predecessorQuantity;
  closedR2Require(CLOSED_R2_SHA.test(COOKED_WEIGHT_ATTESTATION_MIGRATION_SHA256 ?? "")
    && database?.before?.length === 227 && database.after?.length === 228
    && isDeepStrictEqual(database.after.slice(0, 227), database.before)
    && isDeepStrictEqual(database.before.slice(221), QUANTITY_V4_MIGRATIONS.map(({ filename, sha256 }) => ({ filename, sha256 })))
    && database.before[220].filename === COOKED_WEIGHT_MIGRATION
    && database.before[220].sha256 === "60b9f4008768fc0846eb0b3a104fac3ef0650975535371adf876b95dcb711aa0"
    && database.after[227].filename === COOKED_WEIGHT_ATTESTATION_MIGRATION
    && database.after[227].sha256 === COOKED_WEIGHT_ATTESTATION_MIGRATION_SHA256
    && database.migrations?.length === 1 && database.migrations[0].filename === COOKED_WEIGHT_ATTESTATION_MIGRATION
    && database.migrations[0].rawSha256 === COOKED_WEIGHT_ATTESTATION_MIGRATION_SHA256,
    "Personal attestation requires its fixed227 to228 source; the unbound draft cannot execute");
  closedR2Require(previous?.reviewSha256 === QUANTITY_V4_WORKER_REVIEW_PIN.sha256
    && previous.writerApprovalSha256 === QUANTITY_V4_WRITER_REVIEW_PIN.sha256
    && previous.readerFloor === QUANTITY_V4_RELEASE_SHA
    && ["databaseReceipt", "readerReceipt", "writerReceipt", "activationEvidence"].every(key =>
      isAbsolute(previous[key]?.path ?? "") && CLOSED_R2_SHA.test(previous[key]?.sha256 ?? "")),
    "Personal attestation retains the original C04 DB2/reader/writer/activation authority");
  closedR2Require(["afterImmutableSha256", "normalProjectionSha256", "postimageRegistrySha256", "attestationPostimageRegistrySha256", "beforeColumnsSha256", "afterColumnsSha256"].every(key => CLOSED_R2_SHA.test(database[key] ?? ""))
    && database.normalProjectionSha256 === QUANTITY_V4_PROTECTION?.normalProjectionSha256
    && database.postimageRegistrySha256 === QUANTITY_V4_PROTECTION?.postimageRegistrySha256
    && database.beforeColumnsSha256 === database.afterColumnsSha256
    && database.beforeScope?.aliasSha256 === database.afterScope?.aliasSha256
    && database.attestationScope?.beforeOuterSha256 === database.beforeScope?.outerSha256
    && database.attestationScope?.afterOuterSha256 === database.afterScope?.outerSha256
    && database.attestationScope?.afterAliasSha256 === database.beforeScope?.outerSha256
    && database.attestationScope.afterOuterSha256 !== database.attestationScope.beforeOuterSha256
    && database.beforeScope && Object.keys(database.beforeScope).sort().join() === "aliasSha256,outerSha256"
    && Object.values(database.beforeScope).every(value => CLOSED_R2_SHA.test(value))
    && database.workerCatalogBefore === QUANTITY_V4_WORKER_CATALOG_AFTER && database.workerCatalogAfter === QUANTITY_V4_WORKER_CATALOG_AFTER
    && database.workerBaseline?.credentialGeneration === 48 && database.workerBaseline.workerReleaseSha === QUANTITY_V4_RELEASE_SHA
    && database.workerBaseline.schemaIdentity === QUANTITY_V4_WORKER_SCHEMA_IDENTITY
    && database.workerBaseline.workerPolicyEnabled === true
    && ["credentialRowSha256", "policyRowSha256", "policyStableSha256", "snapshotDigest"].every(key => CLOSED_R2_SHA.test(database.workerBaseline[key] ?? ""))
    && isDeepStrictEqual(review.readerEnvironment, {}), "Personal attestation cannot change C04 columns/scope/worker or add environment authority");
  return review;
}

export function assertCookedWeightAttestationPredecessor(review, evidence) {
  const original = evidence.authority.database.review;
  assertQuantityV4ActiveWorkerContinuation(original, evidence);
  const previous = review.predecessorQuantity;
  closedR2Require(original.feature === QUANTITY_V4_FEATURE && original.quantityStage === "worker"
    && evidence.authority.database.pointer.sha256 === previous.databaseReceipt.sha256
    && evidence.authority.reader.pointer.sha256 === previous.readerReceipt.sha256
    && evidence.authority.writer.pointer.sha256 === previous.writerReceipt.sha256
    && isDeepStrictEqual(original.database.after, review.database.before)
    && original.database.targetSha256 === review.database.targetSha256
    && original.database.afterCatalogSha256 === review.database.beforeCatalogSha256
    && original.database.afterImmutableSha256 === review.database.immutableSha256
    && isDeepStrictEqual(original.database.afterScope, review.database.beforeScope), "Personal attestation predecessor227 image differs");
  return evidence;
}

function readAttestationPredecessor(review, repositoryRoot) {
  const original = loadProtectedRolloutReview(repositoryRoot, { feature: QUANTITY_V4_FEATURE, phase: "worker-database" });
  const pointer = review.predecessorQuantity.activationEvidence;
  const bytes = readClosedR2PrivateBytes(pointer.path, repositoryRoot, 524288);
  closedR2Require(closedR2Hash(bytes) === pointer.sha256, "Personal attestation predecessor bytes differ");
  const evidence = JSON.parse(bytes);
  closedR2Require(isDeepStrictEqual(evidence.authority.database.review, original), "Personal attestation cannot substitute original C04 review");
  for (const entry of [evidence.pre, evidence.post, evidence.verification, evidence.activation,
    evidence.authority.database, evidence.authority.reader, evidence.authority.writer]) {
    const raw = readClosedR2PrivateBytes(entry.pointer.path, repositoryRoot, 524288);
    closedR2Require(closedR2Hash(raw) === entry.pointer.sha256 && isDeepStrictEqual(JSON.parse(raw), entry.record), "Personal attestation original receipt bytes differ");
  }
  const controlBytes = readClosedR2PrivateBytes(QUANTITY_V4_WORKER_CONTROL_REVIEW_PIN.path, repositoryRoot, 524288);
  closedR2Require(closedR2Hash(controlBytes) === QUANTITY_V4_WORKER_CONTROL_REVIEW_PIN.sha256, "Personal attestation original worker control bytes differ");
  const control = JSON.parse(controlBytes), directory = join(QUANTITY_V4_WORKER_OPERATION_ROOT, original.workerAuthority.operationId);
  for (const [phase, entry] of [["before", evidence.pre], ["after", evidence.post]]) {
    const raw = readClosedR2PrivateBytes(entry.origin.pointer.path, repositoryRoot, 524288);
    closedR2Require(closedR2Hash(raw) === entry.origin.pointer.sha256 && isDeepStrictEqual(JSON.parse(raw), entry.origin.record), "Personal attestation immutable worker origin bytes differ");
    assertQuantityV4WorkerAuthority(original, control, entry.origin.record, entry.record, phase, directory);
  }
  return assertCookedWeightAttestationPredecessor(review, evidence);
}

export function assertCookedWeightAttestationDatabaseReceipt(review, record) {
  closedR2Require(record?.schema === "homecook.prelaunch-protected-db-attempt.v1" && record.feature === COOKED_WEIGHT_ATTESTATION_FEATURE
    && record.status === "committed" && record.reviewSha256 === COOKED_WEIGHT_ATTESTATION_ROLLOUT_REVIEW_PIN.sha256
    && record.from === review.from && record.to === review.to && record.targetSha256 === review.database.targetSha256
    && record.databasePlanSha256 === closedR2Hash(JSON.stringify({ source: review.database.after, applied: review.database.after }))
    && record.catalogSha256 === review.database.afterCatalogSha256 && record.immutableSha256 === review.database.afterImmutableSha256
    && record.writerEnabled === false && record.readerReady === false && record.backwardCompatible === false
    && record.productWriterEnabled === true && record.cookedWeightWriterEnabled === true && record.quantityWriterEnabled === true
    && record.attestationRowsEmpty === true && record.rowsPreservedInTransaction === true
    && CLOSED_R2_SHA.test(record.normalDataSha256 ?? "") && CLOSED_R2_SHA.test(record.preservedRowsSha256 ?? "")
    && record.backup?.fullArchiveDecoded === true && CLOSED_R2_SHA.test(record.backup.sha256 ?? "") && CLOSED_R2_SHA.test(record.backup.rolesSha256 ?? "")
    && closedR2Hash(JSON.stringify(record.backup.target)) === review.database.targetSha256
    && isDeepStrictEqual(record.predecessorQuantity, review.predecessorQuantity), "Personal attestation terminal228 authority differs");
  return record;
}

export function loadCookedWeightAttestationSuccessor(repositoryRoot) {
  const guardPath = protectedRolloutPaths(prelaunchStateRoot(), { feature: COOKED_WEIGHT_ATTESTATION_FEATURE }).databaseGuardPath;
  if (!existsSync(guardPath)) return null;
  const review = loadProtectedRolloutReview(repositoryRoot, { feature: COOKED_WEIGHT_ATTESTATION_FEATURE });
  const guardBytes = readClosedR2PrivateBytes(guardPath, repositoryRoot, 524288), record = JSON.parse(guardBytes);
  const paths = protectedRolloutPaths(prelaunchStateRoot(), review);
  closedR2Require(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(record.operationId ?? "")
    && record.operationDirectory === join(paths.operationRoot, record.operationId), "Personal attestation fixed operation locator differs");
  const pointer = { path: join(record.operationDirectory, "receipt.json"), sha256: closedR2Hash(guardBytes) };
  const bytes = readClosedR2PrivateBytes(pointer.path, repositoryRoot, 524288);
  closedR2Require(bytes.equals(guardBytes), "Personal attestation immutable terminal and guard differ");
  assertCookedWeightAttestationDatabaseReceipt(review, record);
  const predecessor = readAttestationPredecessor(review, repositoryRoot);
  return { review, record, pointer, guardPointer: { path: guardPath, sha256: pointer.sha256 }, predecessor };
}

export function cookedWeightAttestationSuccessorBinding(successor) {
  if (!successor) return null;
  assertCookedWeightAttestationDatabaseReceipt(successor.review, successor.record);
  closedR2Require(successor.pointer.sha256 === successor.guardPointer.sha256, "Personal attestation terminal raw bytes binding differs");
  return { schema: "homecook.cooked-weight-attestation-successor.v1", reviewSha256: COOKED_WEIGHT_ATTESTATION_ROLLOUT_REVIEW_PIN.sha256,
    receipt: successor.pointer, predecessorDatabaseReceiptSha256: successor.review.predecessorQuantity.databaseReceipt.sha256,
    targetSha256: successor.review.database.targetSha256, ledgerCount: 228, migrationSha256: COOKED_WEIGHT_ATTESTATION_MIGRATION_SHA256 };
}

export function loadCookedWeightAttestationQuantityOff(repositoryRoot, successor) {
  const original = successor.predecessor.authority.database.review;
  const prefix = protectedRolloutPaths(prelaunchStateRoot(), original).writerPrefix;
  const path = join(prelaunchStateRoot(), `${prefix}-${QUANTITY_V4_WRITER_REVIEW_PIN.sha256}-writer-off.json`);
  if (!existsSync(path)) return null;
  const record = JSON.parse(readClosedR2PrivateBytes(path, repositoryRoot, 524288));
  closedR2Require(record.schema === "homecook.prelaunch-protected-writer-attempt.v1" && record.status === "committed" && record.feature === QUANTITY_V4_FEATURE
    && record.action === "writer-off" && record.writerEnabled === false && record.reviewSha256 === successor.review.predecessorQuantity.reviewSha256
    && record.approvalSha256 === successor.review.predecessorQuantity.writerApprovalSha256
    && record.readerReceiptSha256 === successor.review.predecessorQuantity.readerReceipt.sha256
    && record.readerFloor === original.to && record.from === original.from && record.to === original.to
    && closedR2Hash(JSON.stringify(record.target)) === successor.review.database.targetSha256
    && record.baselineReviewSha256 === COOKED_WEIGHT_ATTESTATION_ROLLOUT_REVIEW_PIN.sha256
    && record.baselineDatabasePlanSha256 === closedR2Hash(JSON.stringify({ source: successor.review.database.after, applied: successor.review.database.after }))
    && isDeepStrictEqual(record.databaseSuccessor, cookedWeightAttestationSuccessorBinding(successor)), "Personal successor quantity OFF receipt differs");
  const maintenance = loadCurrentDatabaseMaintenance(repositoryRoot);
  closedR2Require(isDeepStrictEqual(record.databaseMaintenance ?? null, nutritionValidatorMaintenanceBinding(maintenance)),
    "Quantity OFF receipt belongs to a different current database boundary");
  return record;
}

export function assertCookedWeightAttestationWorkerTransition(successor, before, after, enabled, quantityOffReceipt = null, maintenance = null) {
  const baseline = successor.review.database.workerBaseline, binding = cookedWeightAttestationSuccessorBinding(successor);
  const maintenanceBinding = nutritionValidatorMaintenanceBinding(maintenance);
  for (const observation of [before, after]) closedR2Require(observation?.ledgerCount === (maintenanceBinding ? maintenanceBinding.ledgerCount : 228)
    && isDeepStrictEqual(observation.databaseMaintenance ?? null, maintenanceBinding)
    && isDeepStrictEqual(observation.databaseSuccessor, binding) && observation.targetSha256 === successor.review.database.targetSha256
    && observation.catalogFingerprint === QUANTITY_V4_WORKER_CATALOG_AFTER && observation.credentialGeneration === 48
    && observation.workerReleaseSha === QUANTITY_V4_RELEASE_SHA && observation.credentialRowSha256 === baseline.credentialRowSha256
    && observation.schemaIdentity === baseline.schemaIdentity && observation.snapshotDigest === baseline.snapshotDigest
    && observation.policyStableSha256 === baseline.policyStableSha256 && observation.productWriterEnabled === true
    && observation.weightWriterEnabled === true && CLOSED_R2_SHA.test(observation.policyRowSha256 ?? ""), "Personal successor controlled worker observation differs");
  const off = quantityOffReceipt;
  const knownQuantityOff = enabled && after.quantityPolicyEnabled === false && off?.schema === "homecook.prelaunch-protected-writer-attempt.v1"
    && off.status === "committed" && off.action === "writer-off" && off.writerEnabled === false && off.feature === QUANTITY_V4_FEATURE
    && off.reviewSha256 === successor.review.predecessorQuantity.reviewSha256 && off.approvalSha256 === successor.review.predecessorQuantity.writerApprovalSha256
    && off.readerReceiptSha256 === successor.review.predecessorQuantity.readerReceipt.sha256
    && off.baselineReviewSha256 === COOKED_WEIGHT_ATTESTATION_ROLLOUT_REVIEW_PIN.sha256
    && isDeepStrictEqual(off.databaseSuccessor, binding) && isDeepStrictEqual(off.databaseMaintenance ?? null, maintenanceBinding);
  closedR2Require(before.quantityPolicyEnabled === enabled && (after.quantityPolicyEnabled === enabled || knownQuantityOff), "Personal successor unreceipted quantity transition denied");
  if (enabled) for (const observation of [before, after]) closedR2Require(observation.queued === 0 && observation.processing === 0
    && observation.permitHeld === false && observation.activeEnqueueSessions === 0, "Personal successor positive activation is not quiescent");
  closedR2Require(before.workerPolicyEnabled === !enabled && after.workerPolicyEnabled === enabled
    && isDeepStrictEqual(after.policy, { ...before.policy, enabled }), "Personal successor changes only worker enabled/timestamp");
  return after;
}

// Current policy is authorized by the fixed controlled journal and immutable receipts, never by a new PID or a row observed later.
export function loadCookedWeightAttestationWorkerContinuation(successor, repositoryRoot, recipeSaveAdmission = /** @type {{ review: ReturnType<typeof assertRecipeSaveRecoveryReview> | ReturnType<typeof assertRecipeRequestRoleReview>, operationId?: string } | undefined} */ (undefined)) {
  const historical = successor.predecessor, original = historical.authority.database.review;
  const directory = join(QUANTITY_V4_WORKER_OPERATION_ROOT, original.workerAuthority.operationId);
  const current = JSON.parse(readClosedR2PrivateBytes(join(directory, "cutover-journal.json"), repositoryRoot, 524288));
  const binding = cookedWeightAttestationSuccessorBinding(successor);
  const maintenance = recipeSaveAdmission
    ? recipeSaveAdmission.review.feature === RECIPE_REQUEST_ROLE_FEATURE ? recipeRequestRoleAdmissionMaintenance(repositoryRoot, recipeSaveAdmission) : recipeSaveRecoveryAdmissionMaintenance(repositoryRoot, recipeSaveAdmission)
    : loadCurrentDatabaseMaintenance(repositoryRoot);
  const maintenanceBinding = nutritionValidatorMaintenanceBinding(maintenance);
  const checkedMaintenance = record => {
    const value = record.databaseMaintenance ?? null;
    closedR2Require(!value || maintenanceBinding && matchesDatabaseMaintenanceBinding(value,maintenanceBinding), "Worker receipt has foreign current229/231/232 authority");
    return value;
  };
  const header = record => closedR2Require(record.reviewSha256 === original.workerAuthority.controlReviewSha256
    && record.operationId === original.workerAuthority.operationId && record.operationDirectory === directory
    && record.releaseSha === original.to && record.targetSha256 === original.database.targetSha256
    && record.workerDatabaseReceiptSha256 === historical.authority.database.pointer.sha256, "Personal successor current worker operation differs");
  header(current);
  closedR2Require(current.schema === "homecook.youtube-c04-controlled-cutover-journal.v1", "Personal successor current journal schema differs");
  const read = (pointer, kind) => { const value = readQuantityV4PolicyRepairFile(pointer, kind, directory, repositoryRoot); header(value.record); return value; };
  const publication = /^verifications\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\/post-worker-terminal\.json$/u;
  function readPublication(postPointer, originPointer) {
    closedR2Require([postPointer, originPointer].every(pointer => pointer && Object.keys(pointer).sort().join() === "path,sha256"
      && CLOSED_R2_SHA.test(pointer.sha256 ?? "") && isAbsolute(pointer.path ?? "") && resolve(pointer.path) === pointer.path), "Personal successor publication pointer differs");
    closedR2Require(postPointer && (isDeepStrictEqual(postPointer, historical.post.pointer)
      || publication.test(relative(directory, postPointer.path))) && originPointer?.path === join(dirname(postPointer.path), "post-worker-origin.json"),
      "Personal successor current worker publication locator differs");
    const postBytes = readClosedR2PrivateBytes(postPointer.path, repositoryRoot, 524288), originBytes = readClosedR2PrivateBytes(originPointer.path, repositoryRoot, 524288);
    closedR2Require(closedR2Hash(postBytes) === postPointer.sha256 && closedR2Hash(originBytes) === originPointer.sha256, "Personal successor current worker publication bytes differ");
    const post = JSON.parse(postBytes), origin = JSON.parse(originBytes);
    if (post.schema === "homecook.prelaunch-quantity-worker-after.v1") closedR2Require(isDeepStrictEqual(post, historical.post.record)
      && isDeepStrictEqual(originPointer, historical.post.origin.pointer), "Personal successor historical worker checkpoint differs");
    else {
      const postMaintenance = checkedMaintenance(post);
      closedR2Require(isDeepStrictEqual(origin.databaseMaintenance ?? null, postMaintenance), "Worker publication maintenance origin differs");
      closedR2Require(post.schema === "homecook.prelaunch-quantity-worker-after-successor.v1"
        && Object.keys(post).sort().join() === [...Object.keys(historical.post.record), "databaseSuccessor", "predecessorRecord", ...(postMaintenance ? ["databaseMaintenance"] : [])].sort().join()
        && post.ledgerCount === (postMaintenance ? postMaintenance.ledgerCount : 228) && isDeepStrictEqual(post.databaseSuccessor, binding)
        && isDeepStrictEqual(post.predecessorRecord, historical.post.record)
        && isDeepStrictEqual(origin.databaseSuccessor, binding)
        && isDeepStrictEqual(origin.successorPredecessorCheckpoint, historical.post.pointer)
        && isDeepStrictEqual(origin.successorPredecessorOrigin, historical.post.origin.pointer), "Personal successor current checkpoint source differs");
      for (const key of ["feature", "releaseSha", "targetSha256", "consumersReceiptSha256", "credentialGeneration", "workerReleaseSha", "schemaIdentity", "snapshotDigest",
        "credentialRowSha256", "artifactSha256", "descriptorSha256", "credentialMetadataSha256", "plistSha256", "workerDatabaseReceiptSha256", "workerOperationId", "workerReviewSha256", "zeroActualAI"])
        closedR2Require(isDeepStrictEqual(post[key], historical.post.record[key]), "Personal successor current checkpoint identity differs");
      closedR2Require(post.quantityPolicyEnabled === false && post.workerPolicyEnabled === false && post.productWriterEnabled === true
        && post.weightWriterEnabled === true && post.queued === 0 && post.processing === 0 && !post.permitHeld && post.activeEnqueueSessions === 0
        && post.status === "committed" && post.catalogFingerprint === QUANTITY_V4_WORKER_CATALOG_AFTER
        && post.serviceState === "running" && Number.isSafeInteger(post.pid) && post.pid > 0
        && ["normalDataSha256", "policyRowSha256"].every(key => CLOSED_R2_SHA.test(post[key] ?? "")), "Personal successor current checkpoint positive state differs");
    }
    header(origin);
    closedR2Require(origin.schema === "homecook.youtube-c04-controlled-cutover-journal.v1" && origin.state === "verified-policy-disabled", "Personal successor immutable publication state differs");
    closedR2Require(isDeepStrictEqual(origin.postWorkerTerminal, postPointer)
      && origin.policyStableSha256 === successor.review.database.workerBaseline.policyStableSha256, "Personal successor immutable worker origin differs");
    return { record: post, pointer: postPointer, origin: { record: origin, pointer: originPointer } };
  }
  const publicationEvidence = readPublication(current.postWorkerTerminal, current.postWorkerOrigin);
  const { record: post, origin: { record: origin } } = publicationEvidence;
  const committed = (pointer, expectedPost = post, reconciliation = false) => {
    const applied = read(pointer, reconciliation ? "reconciliation" : "activation");
    closedR2Require(applied.record.status === "committed", "Personal successor worker activation is unresolved");
    if (!reconciliation && applied.record.schema === "homecook.youtube-c04-activation-receipt.v1") {
      closedR2Require(isDeepStrictEqual(applied.pointer, historical.activation.pointer)
        && isDeepStrictEqual(applied.record, historical.activation.record), "Personal successor cannot adopt another historical activation");
      return applied;
    }
    closedR2Require(applied.record.schema === (reconciliation ? "homecook.youtube-c04-activation-reconciliation-successor.v1" : "homecook.youtube-c04-activation-receipt-successor.v1")
      && isDeepStrictEqual(applied.record.databaseSuccessor, binding), "Personal successor activation binding differs");
    const appliedMaintenance = checkedMaintenance(applied.record);
    closedR2Require(isDeepStrictEqual(applied.record.observation?.databaseMaintenance ?? null, appliedMaintenance)
      && applied.record.observation?.ledgerCount === (appliedMaintenance ? appliedMaintenance.ledgerCount : 228), "Worker activation current database differs");
    const verification = read(applied.record.activationVerification, "verification");
    closedR2Require(isDeepStrictEqual(verification.record.post, expectedPost), "Personal successor activation checkpoint differs");
    closedR2Require(isDeepStrictEqual(applied.record.beforeObservation, verification.record.observation)
      && (reconciliation || isDeepStrictEqual(applied.record.database, applied.record.observation))
      && (reconciliation ? verification.record.authority?.readerReceiptSha256 === historical.authority.reader.pointer.sha256
        && verification.record.authority?.writerReceiptSha256 === historical.authority.writer.pointer.sha256
        : applied.record.readerReceiptSha256 === historical.authority.reader.pointer.sha256
        && applied.record.writerReceiptSha256 === historical.authority.writer.pointer.sha256)
      && applied.record.zeroActualAI === true, "Personal successor activation publication differs");
    if (appliedMaintenance && !isDeepStrictEqual(verification.record.databaseMaintenance ?? null,appliedMaintenance)) {
      closedR2Require(!reconciliation && applied.record.predecessorActivationReceipt, "Historical228 unknown intent cannot reconcile as229");
      const predecessor = read(applied.record.predecessorActivationReceipt, "activation");
      closedR2Require((["homecook.recipe-save-recovery-maintenance.v1", "homecook.recipe-request-role-maintenance.v1"].includes(appliedMaintenance.schema)
        ? isDeepStrictEqual(predecessor.record.databaseMaintenance,appliedMaintenance.predecessorMaintenance)
        : !predecessor.record.databaseMaintenance) && predecessor.record.status === "committed"
        && predecessor.record.activationVerification?.sha256 === verification.pointer.sha256, "Current229 readback needs original committed228 receipt");
      committed(predecessor.pointer, expectedPost); // Only fixed231→229→228 committed anchors; each branch strictly decreases the historical schema.
      closedR2Require(applied.record.observation.workerPolicyEnabled === true
        && applied.record.observation.policyRowSha256 === predecessor.record.observation.policyRowSha256
        && applied.record.observation.policyStableSha256 === predecessor.record.observation.policyStableSha256
        && applied.record.observation.credentialRowSha256 === predecessor.record.observation.credentialRowSha256,
        "Current229 readback changed historical policy/credential");
    } else if (!reconciliation && verification.record.schema === "homecook.youtube-c04-activation-verification.v1") {
      closedR2Require(isDeepStrictEqual(verification.pointer, historical.verification.pointer)
        && isDeepStrictEqual(applied.record.predecessorActivationReceipt, historical.activation.pointer)
        && applied.record.observation.policyRowSha256 === historical.activation.record.observation.policyRowSha256,
        "Personal successor historical activation readback differs");
    } else {
      closedR2Require(verification.record.schema === "homecook.youtube-c04-activation-verification-successor.v1"
        && isDeepStrictEqual(verification.record.databaseSuccessor, binding)
        && isDeepStrictEqual(verification.record.databaseMaintenance ?? null, appliedMaintenance), "Personal successor activation intent differs");
      assertCookedWeightAttestationWorkerTransition(successor, verification.record.observation, applied.record.observation, true,
        reconciliation && applied.record.observation.quantityPolicyEnabled === false ? loadCookedWeightAttestationQuantityOff(repositoryRoot, successor) : null,
        maintenanceForWorkerBinding(maintenance,appliedMaintenance));
      if (reconciliation) closedR2Require(isDeepStrictEqual(applied.record.expectedAfter, {
        workerPolicyEnabled: true, policyStableSha256: verification.record.observation.policyStableSha256,
        credentialRowSha256: verification.record.observation.credentialRowSha256, credentialGeneration: 48, workerReleaseSha: original.to,
        targetSha256: original.database.targetSha256, ledgerCount: appliedMaintenance ? appliedMaintenance.ledgerCount : 228, catalogFingerprint: QUANTITY_V4_WORKER_CATALOG_AFTER, databaseSuccessor: binding,
        ...(appliedMaintenance ? { databaseMaintenance: appliedMaintenance } : {}) })
        && CLOSED_R2_SHA.test(verification.record.observation.normalDataSha256 ?? "")
        && verification.record.observation.normalDataSha256 === applied.record.observation.normalDataSha256,
        "Personal successor committed reconciliation lacks exact same228 intent/normal preservation");
    }
    return applied;
  };
  if (current.state === "activation-committed") {
    const activation = committed(current.activationReceipt);
    closedR2Require(isDeepStrictEqual(current.activationVerification, activation.record.activationVerification), "Personal successor current activation pointer differs");
    return { historical, current, post: publicationEvidence, activation, observation: activation.record.observation };
  }
  closedR2Require(["repair-quiesced", "repair-drain-pending", "verified-policy-disabled"].includes(current.state), "Personal successor pending/unknown worker state denied");
  const pause = read(current.repairPause, "pause"), paused = pause.record;
  closedR2Require(paused.schema === "homecook.youtube-c04-repair-pause-successor.v1"
    && ["quiesced", "drain_pending"].includes(paused.status) && isDeepStrictEqual(paused.databaseSuccessor, binding)
    && paused.zeroActualAI === true && Boolean(paused.activationReceipt) !== Boolean(paused.activationReconciliation), "Personal successor repair origin differs");
  // Exactly one immutable predecessor, never a recursive history search.
  const previous = readPublication(paused.previousPostWorkerTerminal, paused.previousPostWorkerOrigin);
  closedR2Require(isDeepStrictEqual(paused.post, previous.record), "Personal successor repair predecessor bytes differ");
  const activation = committed(paused.activationReceipt ?? paused.activationReconciliation, paused.post, !paused.activationReceipt);
  closedR2Require(paused.beforeObservation.policyRowSha256 === activation.record.observation.policyRowSha256
    && isDeepStrictEqual(paused.activationVerification, activation.record.activationVerification), "Personal successor repair is not the committed activation successor");
  const pauseMaintenance = checkedMaintenance(paused);
  assertCookedWeightAttestationWorkerTransition(successor, paused.beforeObservation, paused.observation, false, null, maintenanceForWorkerBinding(maintenance,pauseMaintenance));
  if (current.state === "verified-policy-disabled" && post.schema === "homecook.prelaunch-quantity-worker-after-successor.v1") closedR2Require(
    post.policyRowSha256 === paused.observation.policyRowSha256 && isDeepStrictEqual(origin.repairPause, pause.pointer)
    && isDeepStrictEqual(origin.previousPostWorkerTerminal, previous.pointer) && isDeepStrictEqual(origin.previousPostWorkerOrigin, previous.origin.pointer)
    && isDeepStrictEqual(origin.activationVerification, paused.activationVerification)
    && isDeepStrictEqual(origin.activationReceipt, paused.activationReceipt) && isDeepStrictEqual(origin.activationReconciliation, paused.activationReconciliation), "Personal successor latest OFF publication differs");
  return { historical, current, post: publicationEvidence, activation, pause, observation: paused.observation };
}

export function assertQuantityV4Predecessor(review, c01, records) {
  const previous = review.predecessorProtected, { databaseReceipt: db, readerReceipt: reader, writerReceipt: writer } = records;
  closedR2Require(review.feature === QUANTITY_V4_FEATURE && c01.feature === COOKED_WEIGHT_FEATURE
    && db?.schema === "homecook.prelaunch-protected-db-attempt.v1" && db.status === "committed" && db.feature === COOKED_WEIGHT_FEATURE
    && db.reviewSha256 === previous.reviewSha256 && db.from === c01.from && db.to === c01.to
    && db.targetSha256 === review.database.targetSha256 && db.databasePlanSha256 === closedR2Hash(JSON.stringify({ source: c01.database.after, applied: c01.database.after }))
    && db.catalogSha256 === c01.database.afterCatalogSha256 && db.immutableSha256 === c01.database.afterImmutableSha256
    && db.stableImmutableSha256 === c01.database.stableImmutableSha256
    && isDeepStrictEqual(c01.database.after, review.database.source.slice(0, 221)) && db.productWriterEnabled === true
    && isDeepStrictEqual(db.predecessorProtected, c01.predecessorProtected)
    && reader?.schema === "homecook.prelaunch-protected-reader.v1" && reader.reviewSha256 === previous.reviewSha256
    && reader.releaseSha === c01.to && reader.readerFloor === c01.to && previous.readerFloor === c01.to
    && reader.databasePlanSha256 === db.databasePlanSha256 && reader.verifiedFlowsSha256 === c01.readerFlowsSha256
    && writer?.schema === "homecook.prelaunch-protected-writer-attempt.v1" && writer.status === "committed" && writer.action === "writer-on" && writer.writerEnabled === true
    && writer.reviewSha256 === previous.reviewSha256 && writer.approvalSha256 === previous.writerApprovalSha256
    && writer.from === c01.from && writer.to === c01.to
    && writer.readerFloor === reader.readerFloor && writer.readerReceiptSha256 === previous.readerReceipt.sha256
    && closedR2Hash(JSON.stringify(writer.target)) === review.database.targetSha256,
    "C04 cannot precede the actual committed C01 ON/reader authority");
  return records;
}

export function assertQuantityV4ConsumersReceipt(review, receipt) {
  closedR2Require(receipt?.schema === "homecook.prelaunch-protected-db-attempt.v1" && receipt.status === "committed" && receipt.feature === QUANTITY_V4_FEATURE
    && receipt.quantityStage === "consumers" && receipt.reviewSha256 === QUANTITY_V4_CONSUMERS_REVIEW_PIN.sha256
    && receipt.from === review.from && receipt.to === review.to && receipt.targetSha256 === review.database.targetSha256
    && receipt.databasePlanSha256 === closedR2Hash(JSON.stringify({ source: review.database.source.slice(0, 226), applied: review.database.source.slice(0, 226) }))
    && receipt.writerEnabled === false && receipt.productWriterEnabled === true && receipt.cookedWeightWriterEnabled === true && receipt.readerReady === false
    && receipt.metadataNull === true && CLOSED_R2_SHA.test(receipt.normalDataSha256 ?? "")
    && isDeepStrictEqual(receipt.predecessorProtected, review.predecessorProtected)
    && receipt.catalogSha256 === review.database.beforeCatalogSha256 && receipt.immutableSha256 === review.database.immutableSha256,
    "C04 terminal226 checkpoint is foreign, mixed or unresolved");
  return receipt;
}

export function assertQuantityV4DatabaseReceipt(review, record) {
  closedR2Require(record?.schema === "homecook.prelaunch-protected-db-attempt.v1" && record.status === "committed"
    && record.feature === QUANTITY_V4_FEATURE && record.quantityStage === review.quantityStage
    && record.reviewSha256 === protectedRolloutPins(review).rollout.sha256 && record.from === review.from && record.to === review.to
    && record.targetSha256 === review.database.targetSha256 && record.databasePlanSha256 === closedR2Hash(JSON.stringify({ source: review.database.after, applied: review.database.after }))
    && record.catalogSha256 === review.database.afterCatalogSha256 && record.immutableSha256 === protectedImmutableSha256(review)
    && record.writerEnabled === false && record.readerReady === false && record.backwardCompatible === false
    && record.productWriterEnabled === true && record.cookedWeightWriterEnabled === true && record.metadataNull === true
    && CLOSED_R2_SHA.test(record.normalDataSha256 ?? "") && CLOSED_R2_SHA.test(record.preservedRowsSha256 ?? "") && record.rowsPreservedInTransaction === true
    && record.backup?.fullArchiveDecoded === true && CLOSED_R2_SHA.test(record.backup.sha256 ?? "") && CLOSED_R2_SHA.test(record.backup.rolesSha256 ?? "")
    && closedR2Hash(JSON.stringify(record.backup.target)) === review.database.targetSha256
    && record.normalProjectionSha256 === review.database.normalProjectionSha256 && record.postimageRegistrySha256 === review.database.postimageRegistrySha256
    && isDeepStrictEqual(record.predecessorProtected, review.predecessorProtected)
    && (review.quantityStage === "consumers" || record.consumersReceiptSha256 === review.consumersReceipt.sha256),
    "C04 code-bound DB terminal authority/source/stage/OFF/data differs");
  return record;
}

export function loadQuantityV4DatabaseReceipt(repositoryRoot, stage = "consumers") {
  closedR2Require(["consumers", "worker"].includes(stage), "Unknown exact C04 database stage");
  const review = loadProtectedRolloutReview(repositoryRoot, { feature: QUANTITY_V4_FEATURE, phase: stage === "consumers" ? "database" : "worker-database" });
  const paths = protectedRolloutPaths(prelaunchStateRoot(), review);
  const guardBytes = readClosedR2PrivateBytes(paths.databaseGuardPath, repositoryRoot, 524288), record = JSON.parse(guardBytes);
  closedR2Require(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(record.operationId ?? "")
    && record.operationDirectory === join(paths.operationRoot, record.operationId) && record.journalFile === "attempt.json", "C04 fixed DB operation locator differs");
  const receiptPath = join(record.operationDirectory, "receipt.json"), bytes = readClosedR2PrivateBytes(receiptPath, repositoryRoot, 524288);
  closedR2Require(bytes.equals(guardBytes), "C04 DB global guard and immutable receipt bytes differ");
  assertQuantityV4DatabaseReceipt(review, record);
  if (stage === "worker") {
    const consumers = loadQuantityV4DatabaseReceipt(repositoryRoot, "consumers");
    closedR2Require(consumers.pointer.path === review.consumersReceipt.path && consumers.pointer.sha256 === review.consumersReceipt.sha256,
      "C04 DB227 must retain the exact code-bound terminal226 bytes");
    assertQuantityV4ConsumersReceipt(review, consumers.record);
  }
  return { review, record, pointer: { path: receiptPath, sha256: closedR2Hash(bytes) }, guardPointer: { path: paths.databaseGuardPath, sha256: closedR2Hash(guardBytes) } };
}

export function loadQuantityV4ReaderWriterReceipts(repositoryRoot) {
  const database = loadQuantityV4DatabaseReceipt(repositoryRoot, "worker"), review = database.review, paths = protectedRolloutPaths(prelaunchStateRoot(), review);
  const readerBytes = readClosedR2PrivateBytes(paths.readerReceiptPath, repositoryRoot, 524288), reader = JSON.parse(readerBytes);
  const readerWorker = loadQuantityV4WorkerCheckpointEvidence(review, repositoryRoot, "after", true, reader.workerReceipt);
  closedR2Require(reader.schema === "homecook.prelaunch-protected-reader.v1" && reader.feature === QUANTITY_V4_FEATURE && reader.quantityStage === "worker"
    && reader.reviewSha256 === protectedRolloutPins(review).rollout.sha256 && reader.releaseSha === review.to && reader.readerFloor === review.to
    && reader.databasePlanSha256 === database.record.databasePlanSha256 && reader.verifiedFlowsSha256 === review.readerFlowsSha256
    && reader.backwardCompatible === false && typeof reader.buildId === "string" && reader.buildId.length > 0 && CLOSED_R2_SHA.test(reader.plistSha256 ?? "")
    && reader.consumersReceiptSha256 === review.consumersReceipt.sha256 && reader.workerReceiptSha256 === readerWorker.pointer.sha256
    && readerWorker.record.workerDatabaseReceiptSha256 === database.pointer.sha256 && isDeepStrictEqual(reader.predecessorProtected, review.predecessorProtected),
    "C04 activation requires the original final227 reader/worker/floor authority");
  const approval = loadProtectedWriterReview(repositoryRoot, review), approvalSha256 = protectedRolloutPins(review).writer.sha256;
  const writerPath = join(prelaunchStateRoot(), `${paths.writerPrefix}-${approvalSha256}-writer-on.json`);
  const writerBytes = readClosedR2PrivateBytes(writerPath, repositoryRoot, 524288), writer = JSON.parse(writerBytes);
  closedR2Require(writer.schema === "homecook.prelaunch-protected-writer-attempt.v1" && writer.status === "committed" && writer.action === "writer-on" && writer.writerEnabled === true
    && writer.backwardCompatible === false && (approval.readerReceiptSha256 === null || approval.readerReceiptSha256 === closedR2Hash(readerBytes))
    && writer.reviewSha256 === protectedRolloutPins(review).rollout.sha256 && writer.approvalSha256 === approvalSha256 && writer.from === review.from && writer.to === review.to
    && writer.readerFloor === review.to && writer.readerReceiptSha256 === closedR2Hash(readerBytes) && closedR2Hash(JSON.stringify(writer.target)) === review.database.targetSha256
    && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(writer.operationId ?? "")
    && writer.operationDirectory === join(paths.operationRoot, writer.operationId), "C04 activation requires the exact original quantity writer ON receipt");
  const terminal = readClosedR2PrivateBytes(join(writer.operationDirectory, "receipt.json"), repositoryRoot, 524288);
  closedR2Require(terminal.equals(writerBytes), "C04 writer global guard and immutable ON receipt differ");
  const writerWorker = loadQuantityV4WorkerCheckpointEvidence(review, repositoryRoot, "after", true, writer.workerReceipt);
  assertQuantityV4ReaderWriterWorkerEvidence(review, reader, writer, database.pointer.sha256, readerWorker, writerWorker);
  const offPath = join(prelaunchStateRoot(), `${paths.writerPrefix}-${approvalSha256}-writer-off.json`);
  if (existsSync(offPath)) closedR2Require(JSON.parse(readClosedR2PrivateBytes(offPath, repositoryRoot, 524288)).status === "not_applied", "C04 safe OFF/unknown must not authorize worker activation");
  return { database, reader: { record: reader, pointer: { path: paths.readerReceiptPath, sha256: closedR2Hash(readerBytes) } },
    writer: { record: writer, pointer: { path: writerPath, sha256: closedR2Hash(writerBytes) } }, approval, readerWorker, writerWorker };
}

export function assertQuantityV4ReaderWriterWorkerEvidence(review, reader, writer, databaseReceiptSha256, readerWorker, writerWorker) {
  closedR2Require(isDeepStrictEqual(reader.workerReceipt, readerWorker.pointer) && reader.workerReceiptSha256 === readerWorker.pointer.sha256
    && isDeepStrictEqual(writer.workerReceipt, writerWorker.pointer) && writer.workerReceiptSha256 === writerWorker.pointer.sha256
    && readerWorker.record.workerDatabaseReceiptSha256 === databaseReceiptSha256 && writerWorker.record.workerDatabaseReceiptSha256 === databaseReceiptSha256,
    "C04 reader P1 and quantity ON P2 publication/DB2 bytes differ");
  return assertQuantityV4WorkerPublicationPair(review, readerWorker.record, writerWorker.record,
    writerWorker.policyRepair ? { ...writerWorker.policyRepair, earlierOrigin: readerWorker.origin.record } : undefined);
}

// Ordinary UI continuation consumes completed activation; it cannot publish or repair it.
export function assertQuantityV4ActiveWorkerContinuation(review, evidence) {
  const { current, post, verification, activation, authority } = evidence;
  const before = verification.record.observation, after = activation.record.observation;
  closedR2Require(review.feature === QUANTITY_V4_FEATURE && review.quantityStage === "worker"
    && current.state === "activation-committed" && activation.record.status === "committed",
    "C04 UI continuation requires a committed worker activation");
  assertQuantityV4WorkerCheckpoint(review, post.record, "after");
  for (const record of [current, verification.record, activation.record]) {
    closedR2Require(record.reviewSha256 === review.workerAuthority.controlReviewSha256
      && record.operationId === review.workerAuthority.operationId && record.operationDirectory === post.origin.record.operationDirectory
      && record.releaseSha === review.to && record.targetSha256 === review.database.targetSha256
      && record.workerDatabaseReceiptSha256 === authority.database.pointer.sha256,
      "C04 activation source/target/operation/DB2 differs");
  }
  closedR2Require(current.schema === "homecook.youtube-c04-controlled-cutover-journal.v1"
    && verification.record.schema === "homecook.youtube-c04-activation-verification.v1"
    && activation.record.schema === "homecook.youtube-c04-activation-receipt.v1"
    && isDeepStrictEqual(current.postWorkerTerminal, post.pointer) && isDeepStrictEqual(current.postWorkerOrigin, post.origin.pointer)
    && isDeepStrictEqual(current.activationVerification, verification.pointer) && isDeepStrictEqual(current.activationReceipt, activation.pointer)
    && isDeepStrictEqual(activation.record.activationVerification, verification.pointer)
    && isDeepStrictEqual(verification.record.post, post.record)
    && isDeepStrictEqual(activation.record.beforeObservation, before) && isDeepStrictEqual(activation.record.database, after)
    && isDeepStrictEqual(verification.record.authority, { readerReceiptSha256: authority.reader.pointer.sha256, writerReceiptSha256: authority.writer.pointer.sha256 })
    && activation.record.readerReceiptSha256 === authority.reader.pointer.sha256 && activation.record.writerReceiptSha256 === authority.writer.pointer.sha256
    && verification.record.zeroActualAI === true && activation.record.zeroActualAI === true,
    "C04 activation immutable publication/reader/writer chain differs");
  for (const observation of [before, after]) {
    closedR2Require(observation.targetSha256 === review.database.targetSha256 && observation.ledgerCount === 227
      && observation.catalogFingerprint === QUANTITY_V4_WORKER_CATALOG_AFTER
      && observation.credentialGeneration === 48 && observation.workerReleaseSha === review.to
      && observation.schemaIdentity === post.record.schemaIdentity && observation.snapshotDigest === post.record.snapshotDigest
      && observation.credentialRowSha256 === post.record.credentialRowSha256
      && observation.policyStableSha256 === post.origin.record.policyStableSha256
      && observation.quantityPolicyEnabled === true && observation.productWriterEnabled === true && observation.weightWriterEnabled === true
      && observation.queued === 0 && observation.processing === 0 && observation.permitHeld === false && observation.activeEnqueueSessions === 0,
      "C04 activation identity/stable policy/ON/zero state differs");
  }
  closedR2Require(before.workerPolicyEnabled === false && before.policy?.enabled === false && before.policyRowSha256 === post.record.policyRowSha256
    && after.workerPolicyEnabled === true && CLOSED_R2_SHA.test(after.policyRowSha256 ?? "")
    && isDeepStrictEqual(after.policy, { ...before.policy, enabled: true }), "C04 activation changed the reviewed policy");
  for (const service of [verification.record.service, activation.record.service]) {
    closedR2Require(service?.loaded === true && service.state === "running" && Number.isSafeInteger(service.pid) && service.pid > 0
      && service.plistSha256 === post.record.plistSha256, "C04 activation historical service identity differs");
  }
  return after;
}

export function loadQuantityV4ActiveWorkerContinuation(repositoryRoot, review) {
  closedR2Require(review.feature === QUANTITY_V4_FEATURE && review.quantityStage === "worker"
    && review.to === QUANTITY_V4_RELEASE_SHA && CLOSED_R2_SHA.test(QUANTITY_V4_WORKER_CONTROL_REVIEW_PIN.sha256 ?? "")
    && isAbsolute(QUANTITY_V4_WORKER_CONTROL_REVIEW_PIN.path ?? "")
    && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(review.workerAuthority.operationId ?? "")
    && review.workerAuthority.controlReviewSha256 === QUANTITY_V4_WORKER_CONTROL_REVIEW_PIN.sha256
    && isAbsolute(QUANTITY_V4_WORKER_OPERATION_ROOT ?? ""), "C04 active continuation authority is unbound");
  const directory = join(QUANTITY_V4_WORKER_OPERATION_ROOT, review.workerAuthority.operationId);
  const current = JSON.parse(readClosedR2PrivateBytes(join(directory, "cutover-journal.json"), repositoryRoot, 524288));
  if (current.state === "verified-policy-disabled") return null; // The existing strict OFF path remains unchanged.
  closedR2Require(current.state === "activation-committed", "C04 UI continuation denies pending/unknown/not-applied activation");
  const authority = loadQuantityV4ReaderWriterReceipts(repositoryRoot);
  closedR2Require(isDeepStrictEqual(authority.database.review, review), "C04 active continuation DB authority differs");
  const post = loadQuantityV4WorkerCheckpointEvidence(review, repositoryRoot, "after", true);
  const pre = loadQuantityV4WorkerCheckpointEvidence(review, repositoryRoot, "before");
  assertQuantityV4WorkerPublicationPair(review, authority.writerWorker.record, post.record,
    post.policyRepair ? { ...post.policyRepair, earlierOrigin: authority.writerWorker.origin.record } : undefined);
  const verification = readQuantityV4PolicyRepairFile(current.activationVerification, "verification", directory, repositoryRoot);
  const activation = readQuantityV4PolicyRepairFile(current.activationReceipt, "activation", directory, repositoryRoot);
  const evidence = { current, pre, post, verification, activation, authority };
  assertQuantityV4ActiveWorkerContinuation(review, evidence);
  return evidence;
}

export function assertQuantityV4WorkerCheckpoint(review, record, phase) {
  const keys = "activeEnqueueSessions,artifactSha256,catalogFingerprint,consumersReceiptSha256,credentialGeneration,credentialMetadataSha256,credentialRowSha256,descriptorSha256,feature,ledgerCount,normalDataSha256,permitHeld,pid,plistSha256,policyRowSha256,processing,productWriterEnabled,quantityPolicyEnabled,queued,releaseSha,schema,schemaIdentity,serviceState,snapshotDigest,status,targetSha256,weightWriterEnabled,workerDatabaseReceiptSha256,workerOperationId,workerPolicyEnabled,workerReleaseSha,workerReviewSha256,zeroActualAI";
  closedR2Require(["before", "after"].includes(phase) && record && Object.keys(record).sort().join() === keys
    && record.schema === `homecook.prelaunch-quantity-worker-${phase}.v1` && record.status === "committed" && record.feature === QUANTITY_V4_FEATURE
    && record.releaseSha === review.to && record.targetSha256 === review.database.targetSha256
    && record.consumersReceiptSha256 === review.consumersReceipt?.sha256 && record.ledgerCount === (phase === "before" ? 226 : 227)
    && record.workerReviewSha256 === review.workerAuthority?.controlReviewSha256 && record.workerOperationId === review.workerAuthority?.operationId
    && (phase === "before" ? record.workerDatabaseReceiptSha256 === null : CLOSED_R2_SHA.test(record.workerDatabaseReceiptSha256 ?? ""))
    && record.catalogFingerprint === (phase === "before" ? QUANTITY_V4_WORKER_CATALOG_BEFORE : QUANTITY_V4_WORKER_CATALOG_AFTER)
    && record.quantityPolicyEnabled === false && record.productWriterEnabled === true && record.weightWriterEnabled === true && record.workerPolicyEnabled === false
    && record.queued === 0 && record.processing === 0 && record.permitHeld === false && record.activeEnqueueSessions === 0 && record.zeroActualAI === true
    && Number.isSafeInteger(record.credentialGeneration) && record.credentialGeneration > 0 && CLOSED_R2_REF.test(record.workerReleaseSha ?? "")
    && record.schemaIdentity === QUANTITY_V4_WORKER_SCHEMA_IDENTITY
    && ["snapshotDigest", "artifactSha256", "descriptorSha256", "credentialMetadataSha256", "credentialRowSha256", "policyRowSha256", "plistSha256", "normalDataSha256"].every(key => CLOSED_R2_SHA.test(record[key] ?? ""))
    && record.serviceState === (phase === "before" ? "stopped" : "running")
    && (phase === "before" ? record.pid === null : Number.isSafeInteger(record.pid) && record.pid > 0),
    "C04 worker checkpoint fields/state/zero budget/source differ");
  if (phase === "after") closedR2Require(record.workerReleaseSha === review.to
    && record.credentialGeneration === review.database.workerBaseline.credentialGeneration + 1, "C04 terminal worker must use the exact final source and next bound generation");
  else for (const key of ["credentialGeneration", "credentialRowSha256", "policyRowSha256", "schemaIdentity", "snapshotDigest", "workerPolicyEnabled", "workerReleaseSha"]) {
    const conditionalRow = ["credentialRowSha256", "policyRowSha256"].includes(key) && review.database.workerBaseline[key] === null;
    closedR2Require(conditionalRow || record[key] === review.database.workerBaseline[key], "C04 pre-worker receipt must match the exact reviewed prestate");
  }
  return record;
}

export function loadQuantityV4WorkerCheckpointEvidence(review, repositoryRoot, phase, allowHistorical = false,
  publicationPointer = /** @type {{path:string,sha256:string} | undefined} */ (undefined)) {
  closedR2Require(["before", "after"].includes(phase), "Unknown C04 worker checkpoint phase");
  const pin = phase === "before" ? QUANTITY_V4_WORKER_BEFORE_PIN : QUANTITY_V4_WORKER_AFTER_PIN;
  const original = QUANTITY_V4_WORKER_CONTROL_REVIEW_PIN;
  closedR2Require(isAbsolute(original.path ?? "") && CLOSED_R2_SHA.test(original.sha256 ?? "")
    && isAbsolute(QUANTITY_V4_WORKER_OPERATION_ROOT ?? "") && original.sha256 === review.workerAuthority?.controlReviewSha256,
    "C04 original worker authority is unbound; no private I/O permitted");
  const controlBytes = readClosedR2PrivateBytes(original.path, repositoryRoot, 524288);
  closedR2Require(closedR2Hash(controlBytes) === original.sha256, "C04 original worker control review bytes differ");
  const control = JSON.parse(controlBytes), operationDirectory = join(QUANTITY_V4_WORKER_OPERATION_ROOT, review.workerAuthority.operationId);
  const current = JSON.parse(readClosedR2PrivateBytes(join(operationDirectory, "cutover-journal.json"), repositoryRoot, 524288));
  closedR2Require(current.schema === "homecook.youtube-c04-controlled-cutover-journal.v1"
    && current.reviewSha256 === original.sha256 && current.operationId === review.workerAuthority.operationId
    && current.operationDirectory === operationDirectory && current.releaseSha === review.to && current.targetSha256 === review.database.targetSha256,
    "C04 current worker journal authority differs");
  if (phase === "after" && !allowHistorical) closedR2Require(current.state === "verified-policy-disabled", "C04 current worker transition remains unknown or not OFF verified");
  closedR2Require(!publicationPointer || (phase === "after" && allowHistorical && Object.keys(publicationPointer).sort().join() === "path,sha256"
    && CLOSED_R2_SHA.test(publicationPointer.sha256)), "C04 historical pointer requires exact publication authority");
  function readPublication(receiptPointer) {
    const initialPath = join(operationDirectory, phase === "before" ? "pre-worker-checkpoint.json" : "post-worker-terminal.json");
    const receiptPath = receiptPointer?.path;
    const relativePath = typeof receiptPath === "string" ? relative(operationDirectory, receiptPath) : "";
    const repaired = phase === "after" && /^verifications\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\/post-worker-terminal\.json$/u.test(relativePath);
    closedR2Require(receiptPath === initialPath || (repaired && isAbsolute(receiptPath) && resolve(receiptPath) === receiptPath), "C04 immutable receipt locator is not the fixed initial or UUID repair path");
    const originPath = join(dirname(receiptPath), phase === "before" ? "pre-worker-origin.json" : "post-worker-origin.json");
    const originBytes = readClosedR2PrivateBytes(originPath, repositoryRoot, 524288), journal = JSON.parse(originBytes);
    const bytes = readClosedR2PrivateBytes(receiptPath, repositoryRoot, 524288), record = assertQuantityV4WorkerCheckpoint(review, JSON.parse(bytes), phase);
    const pointer = phase === "before" ? journal.preWorkerCheckpoint : journal.postWorkerTerminal;
    closedR2Require(Object.keys(receiptPointer).sort().join() === "path,sha256" && pointer?.path === receiptPath
      && pointer.sha256 === closedR2Hash(bytes) && isDeepStrictEqual(pointer, receiptPointer)
      && (pin.path === null ? pin.sha256 === null : pin.path === receiptPath && pin.sha256 === pointer.sha256), "C04 checkpoint immutable bytes/journal/optional root hash differ");
    return { record: assertQuantityV4WorkerAuthority(review, control, journal, record, phase, operationDirectory), pointer,
      origin: { record: journal, pointer: { path: originPath, sha256: closedR2Hash(originBytes) } } };
  }
  const evidence = readPublication(publicationPointer ?? (phase === "before" ? current.preWorkerCheckpoint : current.postWorkerTerminal));
  if (!publicationPointer) closedR2Require(isDeepStrictEqual(phase === "before" ? current.preWorkerOrigin : current.postWorkerOrigin, evidence.origin.pointer),
    "C04 immutable publication origin bytes differ");
  // Load exactly one predecessor. Its own repair history is never recursively followed.
  if (phase === "after" && evidence.origin.record.repairPause) {
    const origin = evidence.origin.record, previous = readPublication(origin.previousPostWorkerTerminal);
    closedR2Require(isDeepStrictEqual(previous.origin.pointer, origin.previousPostWorkerOrigin), "C04 previous immutable origin bytes differ");
    const verification = readQuantityV4PolicyRepairFile(origin.activationVerification, "verification", operationDirectory, repositoryRoot);
    const pause = readQuantityV4PolicyRepairFile(origin.repairPause, "pause", operationDirectory, repositoryRoot);
    const activation = origin.activationReceipt === null ? null : readQuantityV4PolicyRepairFile(origin.activationReceipt, "activation", operationDirectory, repositoryRoot);
    const reconciliation = origin.activationReconciliation === null ? null : readQuantityV4PolicyRepairFile(origin.activationReconciliation, "reconciliation", operationDirectory, repositoryRoot);
    Object.assign(evidence, { policyRepair: { previous, verification, pause, activation, reconciliation, laterOrigin: origin } });
    assertQuantityV4PolicyRepairChain(review, previous.record, evidence.record, { ...evidence.policyRepair, earlierOrigin: previous.origin.record });
  }
  return evidence;
}

function readQuantityV4PolicyRepairFile(pointer, kind, operationDirectory, repositoryRoot) {
  const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}";
  const names = { verification: [`activation-verification.json`, `activation-verifications/${uuid}/verification\\.json`],
    activation: [`activation-receipt.json`, `activation-receipts/${uuid}/receipt\\.json`],
    pause: [null, `repair-pauses/${uuid}\\.json`], reconciliation: [null, `activation-reconciliations/${uuid}/receipt\\.json`] };
  const [initial, repeated] = names[kind];
  closedR2Require(pointer && Object.keys(pointer).sort().join() === "path,sha256" && CLOSED_R2_SHA.test(pointer.sha256 ?? "")
    && isAbsolute(pointer.path ?? "") && resolve(pointer.path) === pointer.path
    && ((initial !== null && pointer.path === join(operationDirectory, initial)) || new RegExp(`^${repeated}$`, "u").test(relative(operationDirectory, pointer.path))),
    "C04 policy repair pointer is not the fixed initial or UUID publication path");
  const bytes = readClosedR2PrivateBytes(pointer.path, repositoryRoot, 524288);
  closedR2Require(closedR2Hash(bytes) === pointer.sha256, "C04 policy repair immutable bytes differ");
  return { record: JSON.parse(bytes), pointer };
}

export function assertQuantityV4WorkerPublicationPair(review, earlier, later, policyRepair = /** @type {Record<string, any> | undefined} */ (undefined)) {
  assertQuantityV4WorkerCheckpoint(review, earlier, "after"); assertQuantityV4WorkerCheckpoint(review, later, "after");
  for (const key of ["workerReviewSha256", "workerOperationId", "releaseSha", "targetSha256", "consumersReceiptSha256", "workerDatabaseReceiptSha256",
    "artifactSha256", "descriptorSha256", "plistSha256", "credentialGeneration", "workerReleaseSha", "schemaIdentity", "snapshotDigest", "credentialRowSha256", "credentialMetadataSha256"]) {
    closedR2Require(earlier[key] === later[key], "C04 worker publication identity differs; no PID/data retargeting permitted");
  }
  if (earlier.policyRowSha256 !== later.policyRowSha256) assertQuantityV4PolicyRepairChain(review, earlier, later, policyRepair);
  return later;
}

// No general policy exception: the full row may differ only along the two reviewed transitions.
export function assertQuantityV4PolicyRepairChain(review, earlier, later, evidence) {
  closedR2Require(evidence?.previous && evidence.verification && evidence.pause && evidence.earlierOrigin && evidence.laterOrigin,
    "C04 differing policy rows require the exact immutable activation/pause chain");
  const { previous, verification, pause, activation, reconciliation, earlierOrigin, laterOrigin } = evidence;
  assertQuantityV4WorkerPublicationPair(review, earlier, previous.record);
  closedR2Require(previous.record.policyRowSha256 === earlier.policyRowSha256 && CLOSED_R2_SHA.test(earlierOrigin.policyStableSha256 ?? "")
    && [previous.origin.record, laterOrigin].every(origin => origin.policyStableSha256 === earlierOrigin.policyStableSha256), "C04 bounded previous publication policy differs");
  const stable = earlierOrigin.policyStableSha256, verified = verification.record, paused = pause.record;
  const applied = activation?.record ?? reconciliation?.record;
  closedR2Require(verified.schema === "homecook.youtube-c04-activation-verification.v1"
    && paused.schema === "homecook.youtube-c04-repair-pause.v1" && paused.status === "quiesced"
    && isDeepStrictEqual(verified.post, previous.record) && isDeepStrictEqual(paused.post, previous.record)
    && isDeepStrictEqual(laterOrigin.previousPostWorkerTerminal, previous.pointer) && isDeepStrictEqual(laterOrigin.previousPostWorkerOrigin, previous.origin.pointer)
    && isDeepStrictEqual(paused.previousPostWorkerTerminal, previous.pointer) && isDeepStrictEqual(paused.previousPostWorkerOrigin, previous.origin.pointer)
    && isDeepStrictEqual(laterOrigin.repairPause, pause.pointer)
    && [paused, laterOrigin].every(value => isDeepStrictEqual(value.activationVerification, verification.pointer)
      && isDeepStrictEqual(value.activationReceipt, activation?.pointer ?? null) && isDeepStrictEqual(value.activationReconciliation, reconciliation?.pointer ?? null)),
    "C04 immutable repair publication links/schema/status differ");
  closedR2Require(applied?.status === "committed" && isDeepStrictEqual(applied.activationVerification, verification.pointer)
    && isDeepStrictEqual(applied.beforeObservation, verified.observation)
    && CLOSED_R2_SHA.test(verified.authority?.readerReceiptSha256 ?? "") && CLOSED_R2_SHA.test(verified.authority?.writerReceiptSha256 ?? ""),
    "C04 activation lacks its exact durable OFF verification");
  if (activation) closedR2Require(reconciliation === null && applied.schema === "homecook.youtube-c04-activation-receipt.v1"
    && isDeepStrictEqual(applied.database, applied.observation)
    && applied.readerReceiptSha256 === verified.authority.readerReceiptSha256 && applied.writerReceiptSha256 === verified.authority.writerReceiptSha256,
    "C04 committed activation receipt differs from its verification");
  else closedR2Require(applied.schema === "homecook.youtube-c04-activation-reconciliation.v1"
    && isDeepStrictEqual(applied.previousPostWorkerTerminal, previous.pointer) && isDeepStrictEqual(applied.previousPostWorkerOrigin, previous.origin.pointer)
    && isDeepStrictEqual(applied.expectedAfter, { workerPolicyEnabled: true, policyStableSha256: stable,
      credentialRowSha256: later.credentialRowSha256, credentialGeneration: 48, workerReleaseSha: review.to,
      targetSha256: review.database.targetSha256, ledgerCount: 227, catalogFingerprint: QUANTITY_V4_WORKER_CATALOG_AFTER }),
    "C04 null activation receipt requires exact committed reconciliation; unknown/not-applied denied");
  const beforeActivation = applied.beforeObservation, afterActivation = applied.observation;
  const beforePause = paused.beforeObservation, afterPause = paused.observation;
  for (const receipt of [verified, applied, paused, laterOrigin, previous.origin.record, earlierOrigin]) closedR2Require(
    receipt.reviewSha256 === review.workerAuthority.controlReviewSha256 && receipt.operationId === review.workerAuthority.operationId
    && receipt.operationDirectory === previous.origin.record.operationDirectory && receipt.releaseSha === review.to && receipt.targetSha256 === review.database.targetSha256
    && receipt.workerDatabaseReceiptSha256 === later.workerDatabaseReceiptSha256,
    "C04 policy repair chain is foreign to the original review/source/target/DB2");
  closedR2Require([verified, applied, paused].every(receipt => receipt.zeroActualAI === true), "C04 repair chain zero-AI evidence differs");
  for (const observed of [beforeActivation, afterActivation, beforePause, afterPause]) closedR2Require(
    observed?.policyStableSha256 === stable && CLOSED_R2_SHA.test(observed.policyRowSha256 ?? "")
    && observed.targetSha256 === later.targetSha256 && observed.ledgerCount === 227 && observed.catalogFingerprint === later.catalogFingerprint
    && observed.credentialGeneration === 48 && observed.credentialRowSha256 === later.credentialRowSha256
    && observed.workerReleaseSha === review.to && observed.schemaIdentity === later.schemaIdentity && observed.snapshotDigest === later.snapshotDigest
    && observed.productWriterEnabled === true && observed.weightWriterEnabled === true,
    "C04 policy repair observation identity/stable policy differs");
  closedR2Require(beforeActivation.policyRowSha256 === earlier.policyRowSha256 && afterActivation.policyRowSha256 === beforePause.policyRowSha256
    && afterPause.policyRowSha256 === later.policyRowSha256
    && beforeActivation.workerPolicyEnabled === false && afterActivation.workerPolicyEnabled === true
    && beforePause.workerPolicyEnabled === true && afterPause.workerPolicyEnabled === false
    && beforeActivation.quantityPolicyEnabled === true && (activation ? afterActivation.quantityPolicyEnabled === true : typeof afterActivation.quantityPolicyEnabled === "boolean")
    && beforePause.quantityPolicyEnabled === false && afterPause.quantityPolicyEnabled === false
    && afterPause.queued === 0 && afterPause.processing === 0 && afterPause.permitHeld === false && afterPause.activeEnqueueSessions === 0,
    "C04 exact OFF-to-ON-to-OFF policy/control/quiescence row chain differs");
  for (const service of [verified.service, activation?.record.service].filter(Boolean)) closedR2Require(service.loaded === true
    && service.state === "running" && Number.isSafeInteger(service.pid) && service.pid > 0 && service.plistSha256 === later.plistSha256,
    "C04 activation service evidence differs");
  closedR2Require(paused.service?.loaded === false && paused.service.plistSha256 === later.plistSha256,
    "C04 repair pause did not preserve the exact stopped launcher");
  return later;
}

export function assertQuantityV4WorkerProcess(checkpoint, observed) {
  closedR2Require(observed.plistSha256 === checkpoint.plistSha256
    && observed.serviceState === checkpoint.serviceState
    && (checkpoint.serviceState === "stopped" ? observed.pid === null : observed.pid === checkpoint.pid),
    "C04 actual worker plist/state/PID differs from its current publication");
  return observed;
}

export function loadQuantityV4WorkerCheckpoint(review, repositoryRoot, phase, allowHistorical = false) {
  return loadQuantityV4WorkerCheckpointEvidence(review, repositoryRoot, phase, allowHistorical).record;
}

export function assertQuantityV4WorkerAuthority(review, control, journal, record, phase, operationDirectory) {
  assertQuantityV4WorkerCheckpoint(review, record, phase);
  const authority = review.workerAuthority;
  closedR2Require(isAbsolute(QUANTITY_V4_WORKER_OPERATION_ROOT ?? "") && authority.controlReviewSha256 === QUANTITY_V4_WORKER_CONTROL_REVIEW_PIN.sha256
    && operationDirectory === join(QUANTITY_V4_WORKER_OPERATION_ROOT, authority.operationId)
    && control?.schema === "homecook.youtube-c04-controlled-cutover-review.v1" && control.releaseSha === review.to
    && control.targetSha256 === review.database.targetSha256 && control.operationId === authority.operationId
    && control.operationRoot === QUANTITY_V4_WORKER_OPERATION_ROOT
    && control.generationBefore === review.database.workerBaseline.credentialGeneration && control.generationAfter === control.generationBefore + 1
    && control.ledgerBefore === 226 && control.ledgerAfter === 227 && control.catalogBefore === QUANTITY_V4_WORKER_CATALOG_BEFORE && control.catalogAfter === QUANTITY_V4_WORKER_CATALOG_AFTER
    && control.migrationSha256 === QUANTITY_V4_MIGRATIONS[5].sha256 && control.schemaIdentity === QUANTITY_V4_WORKER_SCHEMA_IDENTITY
    && control.artifactSha256 === record.artifactSha256 && control.descriptorSha256 === record.descriptorSha256 && CLOSED_R2_SHA.test(control.expectedSchemaSha256 ?? "")
    && control.snapshotDigest === record.snapshotDigest && control.snapshotDigest === review.database.workerBaseline.snapshotDigest
    && (control.preReceiptSha256 === null || CLOSED_R2_SHA.test(control.preReceiptSha256 ?? ""))
    && (control.postReceiptSha256 === null || CLOSED_R2_SHA.test(control.postReceiptSha256 ?? "")), "C04 original worker source/target/CAS/artifact/schema review differs");
  const pointer = phase === "before" ? journal.preWorkerCheckpoint : journal.postWorkerTerminal;
  const optionalHash = phase === "before" ? control.preReceiptSha256 : control.postReceiptSha256;
  closedR2Require(journal?.schema === "homecook.youtube-c04-controlled-cutover-journal.v1"
    && journal.reviewSha256 === authority.controlReviewSha256 && journal.operationId === authority.operationId && journal.operationDirectory === operationDirectory
    && journal.releaseSha === review.to && journal.targetSha256 === review.database.targetSha256
    && CLOSED_R2_SHA.test(journal.policyStableSha256 ?? "")
    && journal.state === (phase === "before" ? "quiesced" : "verified-policy-disabled")
    && (pointer?.path === join(operationDirectory, phase === "before" ? "pre-worker-checkpoint.json" : "post-worker-terminal.json")
      || (phase === "after" && typeof pointer?.path === "string" && /^verifications\/[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\/post-worker-terminal\.json$/u.test(relative(operationDirectory,pointer.path))
        && isAbsolute(pointer.path) && resolve(pointer.path) === pointer.path))
    && CLOSED_R2_SHA.test(pointer.sha256 ?? "") && (optionalHash === null || optionalHash === pointer.sha256)
    && (phase === "before" ? journal.workerDatabaseReceiptSha256 === null : journal.workerDatabaseReceiptSha256 === record.workerDatabaseReceiptSha256),
    "C04 checkpoint requires its original committed controlled journal; foreign/mixed/unknown state denied");
  return record;
}

export function verifyProtectedRolloutEvidence(review, repositoryRoot) {
  assertProtectedRolloutReview(review);
  const result = {};
  for (const key of ["isolatedEvidence", "readerFlows", "platformInventory", "backupReadiness"]) {
    const bytes = readClosedR2PrivateBytes(review[key].path, repositoryRoot, 524288);
    closedR2Require(closedR2Hash(bytes) === review[key].sha256, "보호 전환 증거 bytes가 바뀌었습니다.");
    result[key] = JSON.parse(bytes);
  }
  if (review.feature === RECIPE_REQUEST_ROLE_FEATURE) {
    result.predecessorRecipeSave = verifyRecipeRequestRolePredecessor(review, repositoryRoot);
    const isolated = result.isolatedEvidence, flows = result.readerFlows;
    closedR2Require(isolated.schema === "homecook.prelaunch-recipe-request-role-isolated.v1" && isolated.passed === true
      && isolated.sourceReaderRef === review.sourceReaderRef && isolated.migrationSourceRef === review.to
      && isolated.onlyOuterFunctionChanged === true && isolated.allReceiptColumnsPreserved === true
      && isolated.nonemptyRowsPreserved === true && isolated.controlsPreserved === true && isolated.jsonClaimsOnlyAccepted === true
      && isolated.unauthorizedClaimsDenied === true && isolated.beforeCatalogSha256 === review.database.beforeCatalogSha256
      && isolated.afterCatalogSha256 === review.database.afterCatalogSha256 && isDeepStrictEqual(isolated.migrations, review.database.migrations)
      && flows.schema === "homecook.prelaunch-protected-reader-flows.v1" && flows.releaseSha === review.sourceReaderRef
      && flows.passed === true && flows.snapshotV5Compatible === true && flows.testScript === review.testScript,
      "Recipe request-role requires exact delta/data/JSON-claims boundary evidence");
    return result;
  }
  if (review.feature === RECIPE_SAVE_RECOVERY_FEATURE) {
    result.predecessorNutrition = verifyRecipeSaveRecoveryPredecessor(review, repositoryRoot);
    const isolated = result.isolatedEvidence, flows = result.readerFlows;
    closedR2Require(isolated.schema === "homecook.prelaunch-recipe-save-recovery-isolated.v1" && isolated.passed === true
      && isolated.sourceReaderRef === review.sourceReaderRef && isolated.migrationSourceRef === review.to
      && isolated.exactFunctionAndReceiptColumnDelta === true && isolated.existingReceiptColumnsPreserved === true
      && isolated.newReceiptColumnInitiallyNull === true && isolated.nonemptyFactsPreserved === true && isolated.quantityMetadataPreserved === true
      && isolated.controlsPreserved === true && isolated.workerCatalogSha256 === QUANTITY_V4_WORKER_CATALOG_AFTER
      && isolated.beforeCatalogSha256 === review.database.beforeCatalogSha256 && isolated.afterCatalogSha256 === review.database.afterCatalogSha256
      && isDeepStrictEqual(isolated.migrations, review.database.migrations)
      && flows.schema === "homecook.prelaunch-protected-reader-flows.v1" && flows.releaseSha === review.sourceReaderRef
      && flows.passed === true && flows.snapshotV5Compatible === true && flows.testScript === review.testScript,
      "Recipe-save requires integrated exact delta/nonempty rows/old reader evidence");
    return result;
  }
  if (review.feature === NUTRITION_VALIDATOR_FEATURE) {
    result.predecessorAttestation = verifyNutritionValidatorPredecessor(review, repositoryRoot);
    const isolated = result.isolatedEvidence, flows = result.readerFlows;
    closedR2Require(isolated.schema === "homecook.prelaunch-nutrition-validator-isolated.v1" && isolated.passed === true
      && isolated.sourceReaderRef === review.sourceReaderRef && isolated.migrationSourceRef === review.migrationSourceRef
      && isolated.functionOnlyDelta === true && isolated.rowsPreserved === true && isolated.controlsPreserved === true && isolated.nonemptyFactsPreserved === true
      && isolated.beforeCatalogSha256 === review.database.beforeCatalogSha256 && isolated.afterCatalogSha256 === review.database.afterCatalogSha256
      && isolated.immutableSha256 === review.database.immutableSha256 && isolated.workerCatalogSha256 === QUANTITY_V4_WORKER_CATALOG_AFTER
      && isDeepStrictEqual(isolated.functionBefore, review.database.functionBefore) && isDeepStrictEqual(isolated.functionAfter, review.database.functionAfter)
      && isDeepStrictEqual(isolated.migrations, review.database.migrations), "Nutrition isolated evidence requires exact one-function/data/control/worker preservation");
    closedR2Require(flows.schema === "homecook.prelaunch-protected-reader-flows.v1" && flows.releaseSha === review.sourceReaderRef
      && flows.passed === true && flows.testScript === review.testScript && flows.legacyPayloadCompatible === true
      && flows.quantityWarningPayloadCompatible === true, "Nutrition reader must accept old and new payloads before SQL enablement");
    return result;
  }
  if (review.feature === COOKED_WEIGHT_ATTESTATION_FEATURE) {
    result.predecessorQuantity = readAttestationPredecessor(review, repositoryRoot);
  }
  const isolated = result.isolatedEvidence;
  closedR2Require(isolated.schema === "homecook.prelaunch-protected-isolated-evidence.v1" && isolated.from === review.from && isolated.to === review.to
    && isolated.passed === true && isolated.allNewShapesOff === true && isolated.legacyReaderCompatible === true
    && isolated.beforeCatalogSha256 === review.database.beforeCatalogSha256 && isolated.afterCatalogSha256 === review.database.afterCatalogSha256
    && isolated.immutableSha256 === review.database.immutableSha256 && isDeepStrictEqual(isolated.migrations, review.database.migrations), "격리 증거는 승인한 source/SQL/전후 catalog/전체 OFF를 증명해야 합니다.");
  closedR2Require(result.readerFlows.schema === "homecook.prelaunch-protected-reader-flows.v1" && result.readerFlows.releaseSha === review.to
    && result.readerFlows.passed === true && result.readerFlows.testScript === review.testScript, "reader 흐름 증거는 정확한 후보 source에 묶여야 합니다.");
  if (review.feature === COOKED_WEIGHT_FEATURE) {
    closedR2Require(isolated.feature === COOKED_WEIGHT_FEATURE && isolated.productWriterEnabled === true
      && isolated.afterImmutableSha256 === review.database.afterImmutableSha256 && isolated.stableImmutableSha256 === review.database.stableImmutableSha256
      && isDeepStrictEqual(isolated.scopeTransition, review.database.scopeTransition), "C01 isolated proof must preserve C03 ON and the exact scope transition");
    result.predecessorProtected = verifyCookedWeightPredecessor(review, repositoryRoot);
  }
  if (review.feature === QUANTITY_V4_FEATURE) {
    closedR2Require(isolated.feature === QUANTITY_V4_FEATURE && isolated.quantityStage === review.quantityStage
      && isolated.productWriterEnabled === true && isolated.cookedWeightWriterEnabled === true
      && isolated.afterImmutableSha256 === review.database.afterImmutableSha256
      && isolated.normalProjectionSha256 === review.database.normalProjectionSha256
      && isolated.postimageRegistrySha256 === review.database.postimageRegistrySha256
      && isDeepStrictEqual(isolated.source, review.database.source), "C04 isolated source/data/postimage/controls proof differs");
    const c01 = loadProtectedRolloutReview(repositoryRoot, { feature: COOKED_WEIGHT_FEATURE });
    loadProtectedWriterReview(repositoryRoot, c01);
    verifyCookedWeightPredecessor(c01, repositoryRoot);
    const previous = {};
    for (const key of ["databaseReceipt", "readerReceipt", "writerReceipt"]) {
      const pointer = review.predecessorProtected[key], bytes = readClosedR2PrivateBytes(pointer.path, repositoryRoot, 524288);
      closedR2Require(closedR2Hash(bytes) === pointer.sha256, "C04 original C01 receipt bytes differ");
      previous[key] = JSON.parse(bytes);
    }
    result.predecessorProtected = assertQuantityV4Predecessor(review, c01, previous);
    if (review.quantityStage === "worker") {
      const bytes = readClosedR2PrivateBytes(review.consumersReceipt.path, repositoryRoot, 524288);
      closedR2Require(closedR2Hash(bytes) === review.consumersReceipt.sha256, "C04 terminal226 bytes differ");
      result.consumersReceipt = assertQuantityV4ConsumersReceipt(review, JSON.parse(bytes));
    }
  }
  if (review.feature === COOKED_WEIGHT_ATTESTATION_FEATURE) closedR2Require(isolated.feature === COOKED_WEIGHT_ATTESTATION_FEATURE
    && isolated.productWriterEnabled === true && isolated.cookedWeightWriterEnabled === true && isolated.quantityWriterEnabled === true
    && isolated.attestationRowsEmpty === true && isolated.afterImmutableSha256 === review.database.afterImmutableSha256
    && isDeepStrictEqual(isolated.attestationScope, review.database.attestationScope)
    && isolated.normalProjectionSha256 === review.database.normalProjectionSha256
    && isolated.postimageRegistrySha256 === review.database.postimageRegistrySha256
    && result.readerFlows.emptyFactsPredecessorCompatible === true, "Personal attestation exact source/alias/empty facts reader proof differs");
  return result;
}

export function verifyCookedWeightPredecessor(review, repositoryRoot) {
  closedR2Require(review.feature === COOKED_WEIGHT_FEATURE, "C01 predecessor validation only");
  const previous = review.predecessorProtected, c03 = loadProtectedRolloutReview(repositoryRoot), writer = loadProtectedWriterReview(repositoryRoot, c03);
  const result = {};
  for (const key of ["databaseReceipt", "readerReceipt", "writerReceipt"]) {
    const bytes = readClosedR2PrivateBytes(previous[key].path, repositoryRoot, 524288);
    closedR2Require(closedR2Hash(bytes) === previous[key].sha256, "Original C03 receipt bytes differ");
    result[key] = JSON.parse(bytes);
  }
  const db = result.databaseReceipt, reader = result.readerReceipt, on = result.writerReceipt;
  closedR2Require(db.schema === "homecook.prelaunch-protected-db-attempt.v1" && db.status === "committed" && db.reviewSha256 === PROTECTED_ROLLOUT_REVIEW_PIN.sha256
    && db.from === c03.from && db.to === c03.to && db.databasePlanSha256 === closedR2Hash(JSON.stringify({ source: review.database.before, applied: review.database.before }))
    && isDeepStrictEqual(c03.database.after, review.database.before) && db.targetSha256 === review.database.targetSha256
    && db.catalogSha256 === review.database.beforeCatalogSha256 && db.immutableSha256 === review.database.immutableSha256
    && reader.schema === "homecook.prelaunch-protected-reader.v1" && reader.reviewSha256 === PROTECTED_ROLLOUT_REVIEW_PIN.sha256
    && reader.releaseSha === c03.to && reader.readerFloor === c03.to && reader.readerFloor === previous.readerFloor
    && reader.databasePlanSha256 === db.databasePlanSha256 && reader.verifiedFlowsSha256 === c03.readerFlowsSha256
    && on.schema === "homecook.prelaunch-protected-writer-attempt.v1" && on.status === "committed" && on.action === "writer-on" && on.writerEnabled === true
    && on.reviewSha256 === PROTECTED_ROLLOUT_REVIEW_PIN.sha256 && on.approvalSha256 === PROTECTED_WRITER_REVIEW_PIN.sha256
    && on.readerFloor === previous.readerFloor && on.readerReceiptSha256 === previous.readerReceipt.sha256
    && closedR2Hash(JSON.stringify(on.target)) === review.database.targetSha256 && writer.databasePlanSha256 === db.databasePlanSha256,
    "C01 must retain the original committed C03 DB/reader/ON authority");
  return result;
}

export function assertCookedWeightProductOff(receipt, review, reviewSha256) {
  closedR2Require(review.feature === COOKED_WEIGHT_FEATURE && CLOSED_R2_SHA.test(reviewSha256 ?? "")
    && receipt?.schema === "homecook.prelaunch-protected-writer-attempt.v1" && receipt.status === "committed"
    && receipt.action === "writer-off" && receipt.writerEnabled === false
    && receipt.reviewSha256 === PROTECTED_ROLLOUT_REVIEW_PIN.sha256 && receipt.approvalSha256 === PROTECTED_WRITER_REVIEW_PIN.sha256
    && receipt.readerFloor === review.predecessorProtected.readerFloor && closedR2Hash(JSON.stringify(receipt.target)) === review.database.targetSha256
    && receipt.baselineReviewSha256 === reviewSha256
    && receipt.baselineDatabasePlanSha256 === closedR2Hash(JSON.stringify({ source: review.database.after, applied: review.database.after })),
    "C03 OFF after C01 requires original OFF authority and the exact current C01 baseline");
  return receipt;
}

export function assertCookedWeightFirstReader(review, productOffReceipt, reviewSha256) {
  if (review.feature !== COOKED_WEIGHT_FEATURE || !productOffReceipt) return;
  assertCookedWeightProductOff(productOffReceipt, review, reviewSha256);
  throw new DeploymentError("C03 safe OFF is preserved. C01's first-reader proof assumes C03 ON; keep C01 OFF and the prior reader/floor until exact OFF-reader evidence is reviewed. Never automatically reopen C03.");
}

export function assertProtectedRolloutSource({ review, live, releaseSha, files, digests, closedArtifactSha256 }) {
  assertProtectedRolloutReview(review);
  closedR2Require(live.ref === review.from && releaseSha === review.to && live.buildId === review.predecessorBuildId
    && closedR2Hash(live.bytes) === review.predecessorPlistSha256 && closedArtifactSha256 === review.closedArtifactSha256,
    "보호 전환의 현재 source/build/plist/marker가 다릅니다.");
  closedR2Require(isDeepStrictEqual([...files].sort(), Object.keys(review.files).sort()) && isDeepStrictEqual(digests, review.files),
    "보호 전환의 전체 source diff bytes가 다릅니다.");
}

export function assertProtectedRolloutEnvironment({ review, before, after, currentControlSha256, currentProofsSha256, currentGeneration, readerActivation = false }) {
  assertProtectedRolloutReview(review);
  const expected = retargetPlist(before, after.WorkingDirectory);
  if (review.feature === COOKED_WEIGHT_FEATURE) {
    const actualGate = before.EnvironmentVariables[COOKED_WEIGHT_ENVIRONMENT] ?? null;
    if (readerActivation) {
      closedR2Require(actualGate === review.readerEnvironment[COOKED_WEIGHT_ENVIRONMENT][0], "C01 prior server gate differs");
      expected.EnvironmentVariables = { ...expected.EnvironmentVariables, [COOKED_WEIGHT_ENVIRONMENT]: "1" };
    } else closedR2Require([review.readerEnvironment[COOKED_WEIGHT_ENVIRONMENT][0], "1"].includes(actualGate), "C01 boundary cannot adopt an unreviewed gate");
  }
  if ([COOKED_WEIGHT_ATTESTATION_FEATURE, NUTRITION_VALIDATOR_FEATURE, RECIPE_SAVE_RECOVERY_FEATURE, RECIPE_REQUEST_ROLE_FEATURE].includes(review.feature)) closedR2Require(before.EnvironmentVariables[COOKED_WEIGHT_ENVIRONMENT] === "1"
    && before.EnvironmentVariables[QUANTITY_V4_ENVIRONMENT] === "true", "Personal attestation preserves C01/C04 reader gates without new environment");
  if (review.feature === QUANTITY_V4_FEATURE) {
    const actualGate = before.EnvironmentVariables[QUANTITY_V4_ENVIRONMENT] ?? null;
    closedR2Require(before.EnvironmentVariables[COOKED_WEIGHT_ENVIRONMENT] === "1", "C04 preserves the completed C01 reader gate");
    if (readerActivation) {
      closedR2Require(actualGate === review.readerEnvironment[QUANTITY_V4_ENVIRONMENT][0], "C04 prior server gate differs");
      expected.EnvironmentVariables = { ...expected.EnvironmentVariables, [QUANTITY_V4_ENVIRONMENT]: "true" };
    } else closedR2Require([null, "true"].includes(actualGate), "C04 boundary cannot adopt an unreviewed gate");
  }
  closedR2Require(isDeepStrictEqual(after, expected)
    && CLOSED_R2_FLAGS.every(key => before.EnvironmentVariables[key] === "false" && after.EnvironmentVariables[key] === "false")
    && currentControlSha256 === review.controlSha256 && currentProofsSha256 === review.historicalProofsSha256
    && currentGeneration === review.consentGeneration, "보호 전환은 R2 false/control/gen/원 proof와 모든 환경을 보존해야 합니다.");
}

export function protectedRolloutReaderReceipt({ review, reviewSha256, databaseReceipt, databaseReceiptSha256 = /** @type {string | undefined} */ (undefined), live, verifiedFlowsSha256,
  workerCheckpoint = /** @type {Record<string, unknown> | undefined} */ (undefined), workerReceiptSha256 = /** @type {string | undefined} */ (undefined),
  workerReceipt = /** @type {{path:string,sha256:string} | undefined} */ (undefined) }) {
  assertProtectedRolloutReview(review);
  closedR2Require(CLOSED_R2_SHA.test(reviewSha256 ?? "") && databaseReceipt?.status === "committed"
    && databaseReceipt.reviewSha256 === reviewSha256 && databaseReceipt.from === review.from && databaseReceipt.to === review.to
    && databaseReceipt.writerEnabled === false && databaseReceipt.backwardCompatible === false
    && databaseReceipt.databasePlanSha256 === closedR2Hash(JSON.stringify({ source: review.database?.after, applied: review.database?.after }))
    && databaseReceipt.catalogSha256 === review.database?.afterCatalogSha256 && databaseReceipt.targetSha256 === review.database?.targetSha256
    && live.ref === review.to && typeof live.buildId === "string" && live.buildId.length > 0
    && CLOSED_R2_SHA.test(verifiedFlowsSha256 ?? "") && verifiedFlowsSha256 === review.readerFlowsSha256,
    "승인된 DB receipt·실제 reader source/build·신구 흐름 검증이 필요합니다.");
  const result = { schema: "homecook.prelaunch-protected-reader.v1", reviewSha256, databasePlanSha256: databaseReceipt.databasePlanSha256,
    releaseSha: live.ref, buildId: live.buildId, plistSha256: closedR2Hash(live.bytes), verifiedFlowsSha256,
    readerFloor: live.ref, backwardCompatible: false };
  if (review.feature === COOKED_WEIGHT_FEATURE) {
    closedR2Require(databaseReceipt.feature === COOKED_WEIGHT_FEATURE && databaseReceipt.productWriterEnabled === true
      && databaseReceipt.immutableSha256 === protectedImmutableSha256(review) && databaseReceipt.stableImmutableSha256 === review.database.stableImmutableSha256
      && isDeepStrictEqual(databaseReceipt.predecessorProtected, review.predecessorProtected), "C01 DB receipt must retain the C03 predecessor");
    Object.assign(result, { feature: COOKED_WEIGHT_FEATURE, predecessorProtected: review.predecessorProtected });
  }
  if (review.feature === COOKED_WEIGHT_ATTESTATION_FEATURE) {
    assertCookedWeightAttestationDatabaseReceipt(review, databaseReceipt);
    Object.assign(result, { feature: COOKED_WEIGHT_ATTESTATION_FEATURE, predecessorQuantity: review.predecessorQuantity, emptyFactsPredecessorCompatible: true });
  }
  if (review.feature === QUANTITY_V4_FEATURE) {
    assertQuantityV4WorkerCheckpoint(review, workerCheckpoint, "after");
    closedR2Require(review.quantityStage === "worker" && databaseReceipt.feature === QUANTITY_V4_FEATURE && databaseReceipt.quantityStage === "worker"
      && databaseReceipt.productWriterEnabled === true && databaseReceipt.cookedWeightWriterEnabled === true
      && databaseReceipt.consumersReceiptSha256 === review.consumersReceipt.sha256
      && isDeepStrictEqual(databaseReceipt.predecessorProtected, review.predecessorProtected)
      && CLOSED_R2_SHA.test(databaseReceiptSha256 ?? "") && workerCheckpoint.workerDatabaseReceiptSha256 === databaseReceiptSha256
      && CLOSED_R2_SHA.test(workerReceiptSha256 ?? "") && workerReceipt?.sha256 === workerReceiptSha256 && isAbsolute(workerReceipt.path), "C04 reader requires terminal227 and its exact226/C01/worker predecessors");
    Object.assign(result, { feature: QUANTITY_V4_FEATURE, quantityStage: "worker", predecessorProtected: review.predecessorProtected,
      consumersReceiptSha256: review.consumersReceipt.sha256, workerReceiptSha256, workerReceipt });
  }
  return result;
}

export function assertProtectedReaderRollback({ receipt, targetSha, isDescendant }) {
  closedR2Require(receipt?.schema === "homecook.prelaunch-protected-reader.v1" && receipt.backwardCompatible === false
    && CLOSED_R2_REF.test(receipt.readerFloor ?? "") && CLOSED_R2_REF.test(targetSha ?? "")
    && (targetSha === receipt.readerFloor || isDescendant === true), "신형 marker/rowref reader floor보다 이전 웹으로 복구할 수 없습니다.");
}

export function assertProtectedReaderCompensation({ floorPublished, offLocked, actual, before, target, closedPreviousPlistSha256 }) {
  closedR2Require(floorPublished === false && offLocked === true, "구 reader 보상은 ready/floor 게시 전의 실제 OFF 잠금에서만 가능합니다.");
  assertClosedR2CompensationTarget({ actual, before, target, closedPreviousPlistSha256 });
}

export function protectedRolloutStatus({ review, reviewSha256, guard, reader, writer, readerCompatible = false }) {
  assertProtectedRolloutReview(review);
  closedR2Require(guard?.schema === "homecook.prelaunch-protected-db-attempt.v1" && guard.reviewSha256 === reviewSha256
    && guard.from === review.from && guard.to === review.to && ["applying_precommit", "commit_dispatch_guard", "unknown", "rolled_back_before_commit", "committed", "not_applied"].includes(guard.status),
    "보호 DB phase/승인 출처가 다릅니다.");
  const committed = guard.status === "committed", unapplied = guard.status === "not_applied";
  const ready = committed && reader?.schema === "homecook.prelaunch-protected-reader.v1" && reader.reviewSha256 === reviewSha256
    && reader.readerFloor === review.to && reader.databasePlanSha256 === guard.databasePlanSha256
    && (review.feature !== QUANTITY_V4_FEATURE || review.quantityStage === "worker");
  if (committed) closedR2Require(guard.databasePlanSha256 === closedR2Hash(JSON.stringify({ source: review.database.after, applied: review.database.after })), "보호 DB 현재 baseline이 다릅니다.");
  return { phase: guard.status, databasePlanSha256: committed ? guard.databasePlanSha256 : unapplied ? closedR2Hash(JSON.stringify({ source: review.database.before, applied: review.database.before })) : null,
    appliedLedgerCount: committed ? review.database.after.length : unapplied ? review.database.before.length : null,
    readerPending: committed && !(ready && readerCompatible), readerFloor: ready ? review.to : null,
    recordedWriterEnabled: ready && writer ? ["committed", "closed_after_unknown"].includes(writer.status) ? writer.writerEnabled : null : committed ? false : null,
    normalDeploymentAllowed: (unapplied && (review.feature !== QUANTITY_V4_FEATURE || review.quantityStage === "consumers"))
      || (ready && readerCompatible && (!writer || ["committed", "not_applied", "closed_after_unknown"].includes(writer.status))), backwardCompatible: false };
}

export function assertProtectedClosedR2Marker({ state, marker, markerSha256, live, closedReview, rollout, reviewSha256, databaseReceipt, databaseReceiptSha256, readerReceipt, readerReceiptSha256 }) {
  assertProtectedRolloutReview(rollout);
  const { rolledBack, artifactSha256, ...recorded } = state.closedR2 ?? {};
  const authority = marker?.protectedRollout;
  if (rollout.feature === COOKED_WEIGHT_FEATURE) closedR2Require(isDeepStrictEqual(authority?.predecessorProtected, rollout.predecessorProtected)
    && isDeepStrictEqual(databaseReceipt.predecessorProtected, rollout.predecessorProtected)
    && isDeepStrictEqual(readerReceipt.predecessorProtected, rollout.predecessorProtected), "C01 marker cannot delete or retarget C03 authority");
  if (rollout.feature === COOKED_WEIGHT_ATTESTATION_FEATURE) closedR2Require(isDeepStrictEqual(authority?.predecessorQuantity, rollout.predecessorQuantity)
    && isDeepStrictEqual(databaseReceipt.predecessorQuantity, rollout.predecessorQuantity)
    && isDeepStrictEqual(readerReceipt.predecessorQuantity, rollout.predecessorQuantity), "Personal attestation marker retains original C04 authority");
  if (rollout.feature === QUANTITY_V4_FEATURE) closedR2Require(rollout.quantityStage === "worker"
    && isDeepStrictEqual(authority?.predecessorProtected, rollout.predecessorProtected)
    && isDeepStrictEqual(databaseReceipt.predecessorProtected, rollout.predecessorProtected)
    && isDeepStrictEqual(readerReceipt.predecessorProtected, rollout.predecessorProtected)
    && readerReceipt.consumersReceiptSha256 === rollout.consumersReceipt.sha256
    && databaseReceipt.consumersReceiptSha256 === rollout.consumersReceipt.sha256, "C04 marker retains exact C01 and terminal226 authority");
  closedR2Require(marker?.schema === "homecook.prelaunch-closed-r2-state.v1" && marker.activationAuthorized === false
    && ["protected-reader", "continuation"].includes(marker.kind) && rolledBack !== true && artifactSha256 === markerSha256
    && isDeepStrictEqual(marker, recorded) && authority?.reviewSha256 === reviewSha256
    && authority.databaseReceiptSha256 === databaseReceiptSha256 && authority.readerReceiptSha256 === readerReceiptSha256
    && databaseReceipt.status === "committed" && databaseReceipt.reviewSha256 === reviewSha256
    && databaseReceipt.from === rollout.from && databaseReceipt.to === rollout.to && databaseReceipt.targetSha256 === rollout.database.targetSha256
    && databaseReceipt.catalogSha256 === rollout.database.afterCatalogSha256 && databaseReceipt.immutableSha256 === protectedImmutableSha256(rollout)
    && databaseReceipt.writerEnabled === false && databaseReceipt.backwardCompatible === false
    && databaseReceipt.databasePlanSha256 === marker.databasePlanSha256
    && readerReceipt.reviewSha256 === reviewSha256 && readerReceipt.readerFloor === rollout.to && readerReceipt.backwardCompatible === false
    && readerReceipt.schema === "homecook.prelaunch-protected-reader.v1" && readerReceipt.releaseSha === rollout.to
    && readerReceipt.verifiedFlowsSha256 === rollout.readerFlowsSha256 && readerReceipt.databasePlanSha256 === marker.databasePlanSha256
    && CLOSED_R2_SHA.test(marker.previousArtifactSha256 ?? "") && CLOSED_R2_SHA.test(marker.previousStateSha256 ?? "")
    && state.previousCwd === marker.previousCwd && state.previousBuildId === marker.previousBuildId && state.previousPlistHash === marker.previousPlistSha256
    && (marker.kind === "continuation" || (marker.from === rollout.from && marker.to === rollout.to
      && marker.previousBuildId === rollout.predecessorBuildId && marker.previousPlistSha256 === rollout.predecessorPlistSha256
      && readerReceipt.buildId === marker.buildId && readerReceipt.plistSha256 === marker.targetPlistSha256)),
    "보호 DB/reader receipt와 실제 닫힘 marker/state 결속이 다릅니다.");
  closedR2Require(marker.reviewSha256 === CLOSED_R2_REVIEW_PIN.sha256 && marker.pauseReceiptSha256 === closedReview.pause.sha256
    && marker.controlSha256 === closedReview.controlSha256 && marker.consentGeneration === closedReview.consentGeneration
    && marker.historicalReadinessSha256 === closedReview.historicalReadiness.sha256
    && marker.databasePlanSha256 === closedR2Hash(JSON.stringify({ source: rollout.database.after, applied: rollout.database.after }))
    && state.ref === marker.to && state.checkout === marker.checkout && state.buildId === marker.buildId
    && state.targetPlistHash === marker.targetPlistSha256 && live.ref === marker.to && live.cwd === marker.checkout
    && live.buildId === marker.buildId && live.plistHash === marker.targetPlistSha256
    && CLOSED_R2_FLAGS.every(key => live.plist.EnvironmentVariables[key] === "false"), "보호 승계는 원 R2 history와 정확한 실제 웹을 보존해야 합니다.");
}

export function assertClosedR2Review(review) {
  closedR2Require(review?.schema === "homecook.prelaunch-closed-r2-review.v1" && CLOSED_R2_REF.test(review.from ?? "")
    && CLOSED_R2_REF.test(review.to ?? "") && review.from !== review.to && CLOSED_R2_SHA.test(review.predecessorPlistSha256 ?? "")
    && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(review.predecessorBuildId ?? ""), "정확한 검토 source pair/build가 필요합니다.");
  const productFiles = ["app/privacy/page.tsx", "app/page.tsx", "components/home/home-screen.tsx"];
  closedR2Require(review.files && !Array.isArray(review.files) && productFiles.every(path => Object.hasOwn(review.files, path))
    && Object.keys(review.files).every(path => CLOSED_R2_FILES.has(path)), "F01 검토 파일만 허용합니다.");
  for (const pair of Object.values(review.files)) {
    closedR2Require(Array.isArray(pair) && pair.length === 2 && pair.some(value => value !== null)
      && pair.every(value => value === null || CLOSED_R2_SHA.test(value)), "전체 파일 byte 핀이 필요합니다.");
  }
  closedR2Require(productFiles.every(path => review.files[path].every(value => CLOSED_R2_SHA.test(value))), "개인정보/홈 파일 삭제·신규 대체는 허용하지 않습니다.");
  closedR2Require(/^test(?::[a-z0-9:_-]+)?$/u.test(review.testScript ?? ""), "검토한 기존 test 명령이 필요합니다.");
  closedR2Require(review.pause && isAbsolute(review.pause.path ?? "") && CLOSED_R2_SHA.test(review.pause.sha256 ?? "")
    && isAbsolute(review.controlPath ?? "") && CLOSED_R2_SHA.test(review.controlSha256 ?? "")
    && review.consentGeneration === 1 && CLOSED_R2_SHA.test(review.envPatchSha256 ?? ""), "승인된 중지/control/env 핀이 필요합니다.");
  closedR2Require(review.historicalReadiness && isAbsolute(review.historicalReadiness.path ?? "")
    && CLOSED_R2_SHA.test(review.historicalReadiness.sha256 ?? "") && CLOSED_R2_SHA.test(review.databasePlanSha256 ?? ""), "원 readiness/DB 이력 보존 핀이 필요합니다.");
  return review;
}

export function assertClosedR2Source({ review, liveSha, releaseSha, files, digests, predecessorPlistSha256, predecessorBuildId }) {
  assertClosedR2Review(review);
  closedR2Require(liveSha === review.from && releaseSha === review.to && predecessorPlistSha256 === review.predecessorPlistSha256 && predecessorBuildId === review.predecessorBuildId,
    "검토 이후 실제 웹/source가 바뀌었습니다.");
  closedR2Require(isDeepStrictEqual([...files].sort(), Object.keys(review.files).sort()) && isDeepStrictEqual(digests, review.files), "검토한 전체 파일과 byte가 다릅니다.");
}

export function assertClosedR2MaintenanceFence(state, options) {
  if (!Object.hasOwn(state, "closedR2")) return;
  closedR2Require(state.closedR2?.schema === "homecook.prelaunch-closed-r2-state.v1" && state.closedR2.activationAuthorized === false
    && (options.reviewedClosedR2Maintenance === true || (options.refOption === "--reviewed-ref" && CLOSED_R2_REF.test(options.ref ?? ""))),
    "닫힘 기록은 일반/활성 readiness 승계로 바꿀 수 없습니다.");
}

export function assertClosedR2ContinuationOptions(options) {
  closedR2Require(options.refOption === "--reviewed-ref" && CLOSED_R2_REF.test(options.ref ?? "") && options.alreadyAppliedDb === true && options.dbConfig
    && !options.envFile && !options.dbBaseline && !options.dbCompatible && !options.skipAutomatedTests
    && !Object.entries(options).some(([key, value]) => key.startsWith("reviewed") && value),
    "닫힘 승계는 기존 reviewed-ref와 읽기 전용 DB 검증만 허용합니다.");
}

export function assertClosedR2Database(review, plan) {
  closedR2Require(plan?.baselineRequired === false && Array.isArray(plan.pending) && plan.pending.length === 0
    && Array.isArray(plan.source) && isDeepStrictEqual(plan.source, plan.applied)
    && closedR2Hash(JSON.stringify({ source: plan.source, applied: plan.applied })) === review.databasePlanSha256,
    "검토한 DB source/applied 이력이 다릅니다. SQL은 실행하지 않았습니다.");
}

export function assertClosedR2LiveUnchanged(before, after) {
  closedR2Require(before.ref === after.ref && before.cwd === after.cwd && before.buildId === after.buildId && before.bytes.equals(after.bytes),
    "준비 중 실제 웹 source/build/plist가 바뀌었습니다.");
}

export function assertClosedR2CompensationTarget({ actual, before, target, closedPreviousPlistSha256 }) {
  const digest = closedR2Hash(actual.bytes);
  const matches = (identity, hashes) => actual.ref === identity.ref && actual.cwd === identity.cwd && actual.buildId === identity.buildId && hashes.includes(digest);
  closedR2Require(matches(target, [target.plistSha256]) || matches(before, [closedR2Hash(before.bytes), closedPreviousPlistSha256]),
    "다른 실제 웹을 실패 보상으로 덮을 수 없습니다.");
}

export function assertClosedR2LiveMarker({ state, marker, markerSha256, live, review, reviewSha256, recovering = false }) {
  closedR2Require(state?.closedR2 && marker?.schema === "homecook.prelaunch-closed-r2-state.v1" && marker.activationAuthorized === false,
    "실제 릴리스 marker의 닫힘 상태가 없거나 바뀌었습니다.");
  const { rolledBack, artifactSha256, ...recorded } = state.closedR2;
  closedR2Require(artifactSha256 === markerSha256 && isDeepStrictEqual(marker, recorded)
    && marker.reviewSha256 === reviewSha256 && CLOSED_R2_REF.test(marker.from) && CLOSED_R2_REF.test(marker.to)
    && ((["f01", "f01-retry"].includes(marker.kind) && marker.from === review.from && marker.to === review.to)
      || (marker.kind === "continuation" && CLOSED_R2_SHA.test(marker.previousArtifactSha256 ?? "") && CLOSED_R2_SHA.test(marker.previousStateSha256 ?? "")))
    && (marker.kind === "f01" || (CLOSED_R2_SHA.test(marker.previousArtifactSha256 ?? "") && CLOSED_R2_SHA.test(marker.previousStateSha256 ?? "")))
    && marker.pauseReceiptSha256 === review.pause.sha256 && marker.controlSha256 === review.controlSha256
    && marker.consentGeneration === review.consentGeneration && marker.historicalReadinessSha256 === review.historicalReadiness.sha256
    && marker.databasePlanSha256 === review.databasePlanSha256,
    "실제 릴리스 marker와 검토/state 결속이 다릅니다.");
  closedR2Require(state.ref === marker.to && state.checkout === marker.checkout && state.buildId === marker.buildId
    && state.targetPlistHash === marker.targetPlistSha256 && state.previousCwd === marker.previousCwd
    && state.previousBuildId === marker.previousBuildId && state.previousPlistHash === marker.previousPlistSha256
    && (marker.kind === "continuation" || (marker.previousPlistSha256 === review.predecessorPlistSha256 && marker.previousBuildId === review.predecessorBuildId)),
    "실제 릴리스 marker의 source/build/plist 기록이 다릅니다.");
  const predecessor = (rolledBack === true || recovering) && live.ref === marker.from && live.cwd === marker.previousCwd
    && live.buildId === marker.previousBuildId && (live.plistHash === marker.rollbackPlistSha256
      || (recovering && live.plistHash === marker.previousPlistSha256));
  closedR2Require(predecessor || (rolledBack !== true && live.ref === marker.to && live.cwd === marker.checkout
    && live.buildId === marker.buildId && live.plistHash === marker.targetPlistSha256), "실제 웹은 marker의 검토 릴리스가 아닙니다.");
  // An interrupted pre-swap recovery may still run the original predecessor. Only rollback can reach this case.
  if (!(recovering && predecessor && live.plistHash === marker.previousPlistSha256)) {
    closedR2Require(CLOSED_R2_FLAGS.every(key => live.plist.EnvironmentVariables[key] === "false"), "실제 웹 R2 flag가 닫혀 있지 않습니다.");
  }
}

export function assertClosedR2Retry({ state, live, review, originalBytes }) {
  closedR2Require(state?.closedR2?.rolledBack === true && ["f01", "f01-retry"].includes(state.closedR2.kind)
    && state.closedR2.from === review.from && state.closedR2.to === review.to && live.ref === review.from
    && live.cwd === state.previousCwd && live.buildId === review.predecessorBuildId
    && live.plistHash === state.closedR2.rollbackPlistSha256 && state.previousPlistHash === review.predecessorPlistSha256
    && closedR2Hash(originalBytes) === review.predecessorPlistSha256
    && CLOSED_R2_FLAGS.every(key => live.plist.EnvironmentVariables[key] === "false"), "동일 F01의 검토한 닫힘 predecessor에서만 재시도할 수 있습니다.");
}

export function assertClosedR2PredecessorState({ state, previousBytes, markerBytes, plist, plistSha256, review, reviewSha256 }) {
  closedR2Require(closedR2Hash(previousBytes) === state.closedR2.previousStateSha256
    && closedR2Hash(markerBytes) === state.closedR2.previousArtifactSha256, "직전 닫힘 state/marker bytes가 바뀌었습니다.");
  const previous = JSON.parse(previousBytes);
  assertClosedR2LiveMarker({ state: previous, marker: JSON.parse(markerBytes), markerSha256: closedR2Hash(markerBytes),
    live: { ref: state.closedR2.from, cwd: state.previousCwd, buildId: state.previousBuildId, plistHash: plistSha256, plist }, review, reviewSha256 });
  return previous;
}

export function closedR2RollbackPlist(plist) {
  retargetPlist(plist, plist.WorkingDirectory);
  return { ...plist, EnvironmentVariables: { ...plist.EnvironmentVariables, MUMEOK_ROUND2_ENABLED: "false", MUMEOK_ROUND2_LEADS_ENABLED: "false" } };
}

export function assertClosedR2Environment({ review, previous, next, patch, envPatchSha256 }) {
  closedR2Require(envPatchSha256 === review.envPatchSha256 && isDeepStrictEqual(Object.keys(patch).sort(), [...CLOSED_R2_FLAGS].sort())
    && CLOSED_R2_FLAGS.every(key => patch[key] === "false"), "두 기존 R2 flag의 명시 false patch만 허용합니다.");
  const before = previous.EnvironmentVariables ?? {}, after = next.EnvironmentVariables ?? {};
  closedR2Require(isDeepStrictEqual(next, retargetPlist(closedR2RollbackPlist(previous), next.WorkingDirectory)), "R2 닫힘 외 실행 설정/환경이 바뀌었습니다.");
  closedR2Require(after.MUMEOK_ROUND2_CONTROL_PATH === review.controlPath && [undefined, "production"].includes(before.MUMEOK_ROUND2_PROFILE)
    && [undefined, "false"].includes(before.MUMEOK_ROUND2_LOCAL_PREVIEW) && before.NODE_ENV === "production", "기존 production control을 유지해야 합니다.");
  closedR2Require(CLOSED_R2_BINDINGS.every(key => typeof before[key] === "string" && before[key] && after[key] === before[key])
    && before.MUMEOK_ROUND2_READINESS_PATH === review.historicalReadiness.path, "원 활성화 결속은 retarget할 수 없습니다.");
}

export function verifyClosedR2HistoricalProofs(review, repositoryRoot) {
  const bytes = readClosedR2PrivateBytes(review.historicalReadiness.path, repositoryRoot);
  closedR2Require(closedR2Hash(bytes) === review.historicalReadiness.sha256, "원 readiness bytes가 바뀌었습니다.");
  const history = JSON.parse(bytes);
  const proofNames = ["turnstile_live", "db_migration", "db_authority", "privacy_consent", "retention_runbook", "operator_approval"];
  const proxyNames = ["direct_access_denial", "header_overwrite", "launch_binding"];
  closedR2Require(history.proofs && isDeepStrictEqual(Object.keys(history.proofs).sort(), [...proofNames].sort()) && history.proxy, "원 proof 집합이 다릅니다.");
  const hashes = {};
  for (const name of [...proofNames, ...proxyNames]) {
    const proof = proofNames.includes(name) ? history.proofs[name] : history.proxy[name];
    closedR2Require(proof && isAbsolute(proof.path ?? "") && CLOSED_R2_SHA.test(proof.sha256 ?? "")
      && closedR2Hash(readClosedR2PrivateBytes(proof.path, repositoryRoot)) === proof.sha256, "원 proof bytes가 바뀌었습니다.");
    hashes[name] = proof.sha256;
  }
  return hashes; // Historical byte preservation only; never provider/IP activation authority.
}

export function verifyClosedR2Control(review, repositoryRoot) {
  const receiptBytes = readClosedR2PrivateBytes(review.pause.path, repositoryRoot);
  closedR2Require(closedR2Hash(receiptBytes) === review.pause.sha256, "승인 중지 receipt가 바뀌었습니다.");
  const receipt = JSON.parse(receiptBytes);
  const expected = { version: 1, collection_enabled: false, lead_enabled: false, consent_generation: review.consentGeneration };
  closedR2Require(receipt.approvedAction === "pause collection and leads only; no automatic reactivation" && receipt.target === review.controlPath
    && isDeepStrictEqual(receipt.after, expected) && receipt.afterSha256 === review.controlSha256
    && receipt.databaseWrites === 0 && receipt.serviceRestarts === 0 && receipt.credentialChanges === 0 && receipt.consentGenerationChanged === false, "승인 중지 범위와 다릅니다.");
  const controlBytes = readClosedR2PrivateBytes(review.controlPath, repositoryRoot);
  closedR2Require(closedR2Hash(controlBytes) === review.controlSha256 && isDeepStrictEqual(JSON.parse(controlBytes), expected), "수집/신청/control generation이 바뀌었습니다.");
  verifyClosedR2HistoricalProofs(review, repositoryRoot);
  return expected;
}

// Same lock directory/owner format as createRound2FileStorage; no separate mutex or stale takeover.
export async function acquireClosedR2ControlLease(review, repositoryRoot) {
  verifyClosedR2Control(review, repositoryRoot);
  const path = `${review.controlPath}.lock`;
  closedR2PrivateDirectory(dirname(path), repositoryRoot);
  await fs.mkdir(path, { mode: 0o700 });
  const identity = lstatSync(path);
  const token = randomBytes(32).toString("hex");
  const ownerPath = join(path, "owner");
  await fs.writeFile(ownerPath, token, { mode: 0o600, flag: "wx" });
  let released = false;
  const assertOwner = () => {
    closedR2Require(!released, "해제한 lease는 사용할 수 없습니다.");
    const current = closedR2PrivateDirectory(path, repositoryRoot);
    closedR2Require(current.ino === identity.ino && current.dev === identity.dev, "control lease 결속이 바뀌었습니다.");
    const owner = readClosedR2PrivateBytes(ownerPath, repositoryRoot, 64);
    closedR2Require(owner.length === token.length && timingSafeEqual(owner, Buffer.from(token)), "다른 control lease를 해제할 수 없습니다.");
  };
  return {
    verify() { assertOwner(); return verifyClosedR2Control(review, repositoryRoot); },
    async release() { assertOwner(); await fs.unlink(ownerPath); await fs.rmdir(path); released = true; },
  };
}

export function assertClosedR2Rollback({ state, live, originalBytes, rollbackBytes, originalPlist, rollbackPlist, review, recovering }) {
  closedR2Require(state.closedR2?.schema === "homecook.prelaunch-closed-r2-state.v1" && state.closedR2.activationAuthorized === false
    && state.ref === state.closedR2.to && (["f01", "f01-retry"].includes(state.closedR2.kind)
      ? state.ref === review.to && state.closedR2.from === review.from : state.closedR2.kind === "continuation") && state.closedR2.controlSha256 === review.controlSha256
    && state.closedR2.consentGeneration === review.consentGeneration, "닫힘 복구 상태가 검토와 다릅니다.");
  closedR2Require((state.closedR2.kind === "continuation" || state.previousPlistHash === review.predecessorPlistSha256)
    && closedR2Hash(originalBytes) === state.previousPlistHash && closedR2Hash(rollbackBytes) === state.closedR2.rollbackPlistSha256
    && isDeepStrictEqual(rollbackPlist, closedR2RollbackPlist(originalPlist)), "복구 plist는 원본과 두 false flag만 달라야 합니다.");
  closedR2Require(state.previousCwd === originalPlist.WorkingDirectory && (state.closedR2.kind === "continuation" || state.previousBuildId === review.predecessorBuildId), "복구 cwd/build가 검토한 predecessor와 다릅니다.");
  if (state.closedR2.kind === "continuation") closedR2Require(CLOSED_R2_FLAGS.every(key => originalPlist.EnvironmentVariables[key] === "false"), "직전 승계 웹도 false flag여야 합니다.");
  const previous = recovering && live.ref === state.closedR2.from && live.cwd === state.previousCwd && live.buildId === state.previousBuildId
    && [state.previousPlistHash, state.closedR2.rollbackPlistSha256].includes(live.plistHash);
  closedR2Require(previous || (live.ref === state.ref && live.cwd === state.checkout && live.buildId === state.buildId && live.plistHash === state.targetPlistHash), "다른 배포의 복구 상태는 사용할 수 없습니다.");
  const expectedLive = previous && live.plistHash === state.previousPlistHash ? originalPlist : retargetPlist(closedR2RollbackPlist(originalPlist), live.cwd);
  closedR2Require(isDeepStrictEqual(live.plist, expectedLive), "실제 웹 plist가 검토한 닫힘 대상과 다릅니다.");
  closedR2Require(rollbackPlist.EnvironmentVariables.MUMEOK_ROUND2_CONTROL_PATH === review.controlPath, "복구 control 경로가 다릅니다.");
}

export async function verifyClosedR2Collector(port) {
  closedR2Require(Number.isInteger(port) && port > 0 && port <= 65535, "로컬 검사 포트가 올바르지 않습니다.");
  // Node fetch replaces Host with the loopback authority; keep the real endpoint's strict origin boundary.
  await new Promise((resolve, reject) => {
    const request = httpRequest({ hostname: "127.0.0.1", port, path: "/api/v1/marketing/round2", method: "POST",
      signal: AbortSignal.timeout(2500), headers: { host: "app.mumeok.kr", origin: "https://app.mumeok.kr", "content-type": "application/json" } }, async response => {
      try {
        let body = "";
        for await (const chunk of response) {
          body += chunk.toString("utf8");
          if (Buffer.byteLength(body) > 8192) throw new DeploymentError("R2 검사 응답이 너무 큽니다.");
        }
        if (response.statusCode !== 503 || JSON.parse(body).error?.code !== "ROUND2_DISABLED") throw new DeploymentError("R2 닫힘 응답을 확인하지 못했습니다.");
        resolve();
      } catch (error) { reject(error); }
    });
    request.on("error", reject);
    request.end("{}");
  });
}

export function fetchPrelaunchLanding(origin) {
  return fetch(`${origin}/beta?ad_variant=a`, { redirect: "error", signal: AbortSignal.timeout(2500) });
}

export function prelaunchChangedFiles(git, from, to) {
  return git(["diff", "--name-only", "--no-renames", "-z", from, to]).split("\0").filter(Boolean);
}

/**
 * @param {string[]} files
 * @param {any} before
 * @param {any} after
 * @param {{reviewedYoutubeTrialSupport?: boolean, reviewedYoutubeResolutionSupport?: boolean, reviewedIntegratedFiles?: Set<string> | null, reviewedProtectedInventorySupport?: boolean, reviewedQuantityWorkerSupport?: boolean, reviewedRecipeSaveSupport?: boolean, eslintConfigDigests?: (string | null)[] | null}} [options]
 */
export function classifyPrelaunchScope(files, before, after, {
  reviewedYoutubeTrialSupport = false,
  reviewedYoutubeResolutionSupport = false,
  reviewedIntegratedFiles = null,
  reviewedProtectedInventorySupport = false,
  reviewedQuantityWorkerSupport = false,
  reviewedRecipeSaveSupport = false,
  eslintConfigDigests = null,
} = {}) {
  const scope = { web: [], database: [], support: [], api: [] };
  // Only the reviewed pnpm plugin-resolution change, not arbitrary lint config edits.
  const reviewedEslintResolution = isDeepStrictEqual(eslintConfigDigests, [
    "516f348fb17cd091ba8bb033aea2de9230672cf910d02171833419058930f43d",
    "632dfa7702050ae3c0b21a3b578922eed714a883954ee97864410c9152a9c32a",
  ]);
  const support = /^(?:docs\/|tests\/|ui\/|marketing\/|\.github\/|\.agents\/|\.claude\/|\.codex\/|\.opencode\/|\.workflow-v2\/)|^(?:AGENTS|CLAUDE|README)\.md$|^opencode\.json$|^scripts\/(?:(?:lib\/)?marketing-validation-[a-z-]+|ci-path-filter|deploy-prelaunch-web|install-prelaunch-deploy|install-dev-deploy|lib\/dev-deploy-launcher|lib\/prelaunch-[a-z-]+)\.mjs$/u;
  const exactSupport = new Set([
    // Bound operator-only v74 receipts/CLI and isolated verifier; never runtime hooks.
    "scripts/lib/prelaunch-youtube-v74-cutover.mjs",
    "scripts/lib/youtube-v74-cutover-preparation.mjs",
    "scripts/youtube-v74-controlled-cutover.mjs",
    "scripts/verify-youtube-v74-cutover-native.mjs",
    // Reviewed offline nutrition tools and contract checks; never executed as runtime hooks.
    "scripts/render-ingredient-nutrition-rambutan-20261008.mjs",
    "scripts/render-ingredient-nutrition-representatives-20261008.mjs",
    "scripts/sql/ingredient-nutrition-rambutan-20261008.sql",
    "scripts/sql/ingredient-nutrition-representatives-20261008.sql",
    "scripts/lib/nutrition-gap-candidates.mjs",
    "scripts/lib/public-nutrition-pipeline.mjs",
    "scripts/validate-security-function-authorization.mjs",
    "scripts/lib/mext-nutrition-snapshot.mjs",
    "scripts/lib/usda-nutrition-snapshot.mjs",
    "scripts/render-ingredient-catalog-cleanup-20261006.mjs",
    "scripts/render-ingredient-catalog-organization-20261007.mjs",
    "scripts/render-ingredient-curation-20261006-followup.mjs",
    "scripts/render-ingredient-curation-20261006.mjs",
    "scripts/render-ingredient-definition-finalization-20261007.mjs",
    "scripts/render-ingredient-definition-resolution-20261007.mjs",
    "scripts/render-ingredient-nutrition-expansion-20261007.mjs",
    "scripts/run-action-notifications-full-schema-rehearsal.py",
    "scripts/run-future-meal-key-full-schema-rehearsal.py",
    "scripts/run-meal-log-preview-full-schema-rehearsal.py",
    "scripts/sql/ingredient-catalog-cleanup-20261006.sql",
    "scripts/sql/ingredient-catalog-organization-20261007.sql",
    "scripts/sql/ingredient-curation-20261006-followup.sql",
    "scripts/sql/ingredient-curation-20261006.sql",
    "scripts/sql/ingredient-definition-finalization-20261007.sql",
    "scripts/sql/ingredient-definition-resolution-20261007.sql",
    "scripts/sql/ingredient-nutrition-expansion-20261007.sql",

    "design-qa.md",
    "scripts/generate-mumeok-icon-edges.mjs",
    "scripts/lib/validate-workflow-v2.mjs",
    "scripts/lib/ingredient-conversion-domain.mjs",
    "scripts/reconcile-recipe-nutrition-v2-data.mjs",
    "scripts/run-recipe-nutrition-postgres-integration.mjs",
    "scripts/run-feedback-batch-tests.mjs",
    "scripts/sql/reconcile-recipe-nutrition-v2-data-20260915.sql",
    "scripts/validate-account-session-generation-inventory.mjs",
    "scripts/youtube-real-app-route-smoke.mjs",
  ]);
  const web = /^(?:app|components|lib|stores|types|hooks|public)\/|^scripts\/lib\/recipe-nutrition-predecessor\.mjs$|^(?:middleware\.[cm]?[jt]s|next\.config\.[cm]?[jt]s|tsconfig\.json|postcss\.config\.[cm]?js|package\.json|pnpm-lock\.yaml|\.env\.example)$/u;
  const denied = [];
  const youtubeTrialSupport = reviewedYoutubeTrialSupport ? new Set([
    "scripts/lib/youtube-extraction-worker-artifact.mjs",
    "scripts/manifests/youtube-extraction-expected-schema.json",
  ]) : new Set();
  const youtubeResolutionSupport = reviewedYoutubeResolutionSupport ? new Set([
    "scripts/analyze-youtube-ingredient-resolution-regression.mjs",
    "scripts/manifests/youtube-extraction-expected-schema.json",
    "scripts/verify-youtube-extraction-current-catalog.mjs",
  ]) : new Set();
  for (const file of files) {
    if (/^supabase\/migrations\/\d+_[^/]+\.sql$/u.test(file)) scope.database.push(file);
    else if (support.test(file) || exactSupport.has(file) || youtubeTrialSupport.has(file)
      || youtubeResolutionSupport.has(file) || reviewedIntegratedFiles?.has(file)
      || (reviewedQuantityWorkerSupport && ["scripts/lib/youtube-extraction-worker-runtime.mjs", "scripts/manifests/youtube-extraction-expected-schema.json"].includes(file))
      || (reviewedProtectedInventorySupport && file === "scripts/lib/full-local-security-inventory.mjs")
      || (reviewedRecipeSaveSupport && file === "scripts/generate-nutrition-review-html.mjs")) scope.support.push(file);
    else if (web.test(file) || file === "instrumentation.ts"
      || (file === "eslint.config.mjs" && reviewedEslintResolution)) scope.web.push(file);
    else denied.push(file);
  }
  if (denied.length) throw new DeploymentError(`빠른 웹/DB 배포에서 허용하지 않는 서버 구성 변경: ${denied.join(", ")}`);
  const dependencyKeys = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies", "pnpm", "overrides", "resolutions", "packageManager"];
  if ((dependencyKeys.some((key) => !isDeepStrictEqual(before[key], after[key])) || files.includes("pnpm-lock.yaml"))
    && (!files.includes("package.json") || !files.includes("pnpm-lock.yaml"))) {
    throw new DeploymentError("의존성 변경은 package.json과 pnpm-lock.yaml을 함께 변경해야 합니다.");
  }
  if (after.scripts?.build !== "next build" || (after.scripts?.start !== undefined && after.scripts.start !== "node scripts/start-production.mjs")) {
    throw new DeploymentError("빠른 배포는 기본 Next.js build/start 실행 계약을 유지해야 합니다.");
  }
  scope.api = scope.web.filter((file) => file === "instrumentation.ts" || /^app\/api\/|^lib\/(?:server|api|auth|supabase)(?:\/|[.-])|^scripts\/lib\/recipe-nutrition-predecessor\.mjs$|^middleware\.|\/route\.[cm]?[jt]sx?$/u.test(file));
  return scope;
}

// Kept for callers of the original landing deployment helper.
export function assertFrontendScope(files, before, after) {
  return classifyPrelaunchScope(files, before, after);
}

export function parsePrelaunchOptions(args) {
  /** @type {{ref: string, refOption: string, envFile?: string, dbConfig?: string, dbBaseline?: string, dbCompatible?: boolean, verifyScript?: string, testScript?: string, alreadyAppliedDb?: boolean, skipAutomatedTests?: boolean, reviewedRepairReadiness?: boolean, reviewedBetaReadiness?: boolean, reviewedFeedbackReadiness?: boolean, reviewedAiNutritionReadiness?: boolean, reviewedIngredientSearchReadiness?: boolean, reviewedPieceUnitReadiness?: boolean, reviewedYoutubeTrialReadiness?: boolean, reviewedYoutubeResolutionReadiness?: boolean, reviewedNutritionRecoveryReadiness?: boolean, reviewedIntegratedMasterReadiness?: boolean, reviewedClosedR2Maintenance?: boolean, reviewedProtectedRollout?: boolean, protectedPhase?: string}} */
  const options = { ref: "origin/master", refOption: "--ref" };
  const names = { "--env-file": "envFile", "--db-config": "dbConfig", "--db-baseline": "dbBaseline", "--verify-script": "verifyScript", "--test-script": "testScript", "--protected-phase": "protectedPhase" };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (key === "--reviewed-protected-rollout") {
      if (options.reviewedProtectedRollout) throw new DeploymentError("중복된 배포 옵션입니다.");
      options.reviewedProtectedRollout = true;
      index -= 1;
      continue;
    }
    if (key === "--reviewed-r2-closed-maintenance") {
      if (options.reviewedClosedR2Maintenance) throw new DeploymentError("중복된 배포 옵션입니다.");
      options.reviewedClosedR2Maintenance = true;
      index -= 1;
      continue;
    }
    const flag = { "--db-compatible": "dbCompatible", "--already-applied-db": "alreadyAppliedDb", "--skip-automated-tests": "skipAutomatedTests", "--reviewed-repair-readiness": "reviewedRepairReadiness", "--reviewed-beta-readiness": "reviewedBetaReadiness", "--reviewed-feedback-readiness": "reviewedFeedbackReadiness", "--reviewed-ai-nutrition-readiness": "reviewedAiNutritionReadiness", "--reviewed-ingredient-search-readiness": "reviewedIngredientSearchReadiness", "--reviewed-piece-unit-readiness": "reviewedPieceUnitReadiness", "--reviewed-youtube-trial-readiness": "reviewedYoutubeTrialReadiness", "--reviewed-youtube-resolution-readiness": "reviewedYoutubeResolutionReadiness", "--reviewed-nutrition-recovery-readiness": "reviewedNutritionRecoveryReadiness", "--reviewed-integrated-master-readiness": "reviewedIntegratedMasterReadiness" }[key];
    if (flag) {
      if (options[flag]) throw new DeploymentError("중복된 배포 옵션입니다.");
      options[flag] = true;
      index -= 1;
      continue;
    }
    const isRef = ["--ref", "--reviewed-ref"].includes(key);
    const identity = isRef ? "ref" : names[key];
    const value = args[index + 1];
    if (!identity || seen.has(identity) || !value || value.startsWith("--")) throw new DeploymentError("잘못되거나 중복된 배포 옵션입니다. --help를 확인하세요.");
    seen.add(identity);
    options[identity] = value;
    if (isRef) options.refOption = key;
  }
  if (options.reviewedNutritionRecoveryReadiness && !options.alreadyAppliedDb) throw new DeploymentError("검토한 영양 복구 배포에는 --already-applied-db가 필요합니다.");
  if (options.reviewedNutritionRecoveryReadiness && (options.refOption !== "--reviewed-ref" || !/^[a-f0-9]{40}$/u.test(options.ref))) throw new DeploymentError("검토한 영양 복구 배포에는 --reviewed-ref의 정확한 SHA가 필요합니다.");
  if (options.reviewedNutritionRecoveryReadiness && !options.dbConfig) throw new DeploymentError("검토한 영양 복구 배포에는 --db-config가 필요합니다.");
  if (options.alreadyAppliedDb && options.dbBaseline) throw new DeploymentError("이미 적용된 DB 확인에는 baseline을 새로 만들 수 없습니다.");
  if (options.reviewedRepairReadiness && !options.alreadyAppliedDb) throw new DeploymentError("검토한 복구 배포에는 --already-applied-db가 필요합니다.");
  if (options.reviewedBetaReadiness && !options.alreadyAppliedDb) throw new DeploymentError("검토한 베타 배포에는 --already-applied-db가 필요합니다.");
  if (options.reviewedPieceUnitReadiness && !options.alreadyAppliedDb) throw new DeploymentError("검토한 개수 단위 배포에는 --already-applied-db가 필요합니다.");
  if (options.reviewedPieceUnitReadiness && (options.refOption !== "--reviewed-ref" || !/^[a-f0-9]{40}$/u.test(options.ref))) throw new DeploymentError("검토한 개수 단위 배포에는 --reviewed-ref의 정확한 SHA가 필요합니다.");
  if (options.reviewedIngredientSearchReadiness && !options.alreadyAppliedDb) throw new DeploymentError("검토한 재료 검색 배포에는 --already-applied-db가 필요합니다.");
  if (options.reviewedIngredientSearchReadiness && (options.refOption !== "--reviewed-ref" || !/^[a-f0-9]{40}$/u.test(options.ref))) throw new DeploymentError("검토한 재료 검색 배포에는 --reviewed-ref의 정확한 SHA가 필요합니다.");
  if (options.reviewedAiNutritionReadiness && !options.alreadyAppliedDb) throw new DeploymentError("검토한 AI 영양 배포에는 --already-applied-db가 필요합니다.");
  if (options.reviewedAiNutritionReadiness && (options.refOption !== "--reviewed-ref" || !/^[a-f0-9]{40}$/u.test(options.ref))) throw new DeploymentError("검토한 AI 영양 배포에는 --reviewed-ref의 정확한 SHA가 필요합니다.");
  if (options.reviewedFeedbackReadiness && !options.alreadyAppliedDb) throw new DeploymentError("검토한 피드백 배포에는 --already-applied-db가 필요합니다.");
  if (options.reviewedYoutubeTrialReadiness && !options.alreadyAppliedDb) throw new DeploymentError("검토한 YouTube 시험 배포에는 --already-applied-db가 필요합니다.");
  if (options.reviewedYoutubeTrialReadiness && (options.refOption !== "--reviewed-ref" || !/^[a-f0-9]{40}$/u.test(options.ref))) throw new DeploymentError("검토한 YouTube 시험 배포에는 --reviewed-ref의 정확한 SHA가 필요합니다.");
  if (options.reviewedYoutubeResolutionReadiness && !options.alreadyAppliedDb) throw new DeploymentError("검토한 YouTube 재료 연결 배포에는 --already-applied-db가 필요합니다.");
  if (options.reviewedYoutubeResolutionReadiness && (options.refOption !== "--reviewed-ref" || !/^[a-f0-9]{40}$/u.test(options.ref))) throw new DeploymentError("검토한 YouTube 재료 연결 배포에는 --reviewed-ref의 정확한 SHA가 필요합니다.");
  if (options.reviewedIntegratedMasterReadiness && (options.alreadyAppliedDb || !options.dbConfig
    || options.refOption !== "--ref" || options.ref !== "origin/master")) {
    throw new DeploymentError("검토한 통합 master 웹 선배포에는 origin/master와 --db-config가 필요하며 --already-applied-db는 사용할 수 없습니다.");
  }
  if ([options.reviewedNutritionRecoveryReadiness, options.reviewedBetaReadiness, options.reviewedRepairReadiness, options.reviewedFeedbackReadiness, options.reviewedAiNutritionReadiness, options.reviewedYoutubeTrialReadiness, options.reviewedYoutubeResolutionReadiness, options.reviewedIngredientSearchReadiness, options.reviewedPieceUnitReadiness, options.reviewedIntegratedMasterReadiness].filter(Boolean).length > 1) throw new DeploymentError("서로 다른 한정 배포 검증을 함께 지정할 수 없습니다.");
  if (options.reviewedFeedbackReadiness && (options.refOption !== "--reviewed-ref" || !/^[a-f0-9]{40}$/u.test(options.ref))) throw new DeploymentError("검토한 피드백 배포에는 --reviewed-ref의 정확한 SHA가 필요합니다.");
  if (options.skipAutomatedTests && (options.testScript || options.verifyScript)) throw new DeploymentError("테스트 생략과 검증 스크립트는 함께 지정할 수 없습니다.");
  if (options.testScript && !/^test(?::[a-z0-9:_-]+)?$/u.test(options.testScript)) throw new DeploymentError("--test-script에는 package.json의 test 명령 이름이 필요합니다.");
  if ((options.dbBaseline || options.dbCompatible || options.alreadyAppliedDb) && !options.dbConfig) throw new DeploymentError("DB 추가 옵션에는 --db-config가 함께 필요합니다.");
  if (options.reviewedClosedR2Maintenance) {
    if (options.refOption !== "--reviewed-ref" || !CLOSED_R2_REF.test(options.ref) || !options.envFile || !options.testScript) {
      throw new DeploymentError("닫힌 R2 유지 배포에는 정확한 --reviewed-ref, --env-file, --test-script가 필요합니다.");
    }
    if (!options.dbConfig || options.alreadyAppliedDb !== true || options.dbBaseline || options.dbCompatible || options.skipAutomatedTests || options.verifyScript
      || Object.entries(options).some(([key, value]) => key.startsWith("reviewed") && key !== "reviewedClosedR2Maintenance" && value)) {
      throw new DeploymentError("닫힌 R2 유지 배포에는 읽기 전용 DB pair만 허용하며 다른 reviewed/검증 생략 옵션을 사용할 수 없습니다.");
    }
  }
  if (options.reviewedProtectedRollout) {
    if (options.refOption !== "--reviewed-ref" || !CLOSED_R2_REF.test(options.ref) || !options.dbConfig
      || options.testScript !== "test:feedback-batch:web" || !["database", "database-retry", "worker-database", "worker-database-retry", "worker-reconcile", "reader", "reconcile", "writer-on", "writer-off", "writer-on-reconcile", "writer-off-reconcile", "writer-on-retry", "writer-off-retry", "nutrition-database", "nutrition-database-retry", "nutrition-reconcile", "attestation-database", "attestation-database-retry", "attestation-reconcile", "attestation-reader", "attestation-writer-on", "attestation-writer-off", "attestation-writer-on-reconcile", "attestation-writer-off-reconcile", "attestation-writer-on-retry", "attestation-writer-off-retry"].includes(options.protectedPhase)
      || options.envFile || options.dbBaseline || options.dbCompatible || options.alreadyAppliedDb || options.skipAutomatedTests || options.verifyScript
      || Object.entries(options).some(([key, value]) => key.startsWith("reviewed") && key !== "reviewedProtectedRollout" && value)) {
      throw new DeploymentError("보호 전환에는 정확한 reviewed-ref/DB/기존 test/phase만 허용합니다. 환경·기존 reviewed·자동 DB 옵션은 사용할 수 없습니다.");
    }
  } else if (options.protectedPhase) throw new DeploymentError("보호 전환 phase는 전용 승인 경로에서만 사용할 수 있습니다.");
  return options;
}

export function prelaunchVerificationScripts(scope, manifest, verifyScript, skipAutomatedTests = false, testScript) {
  if (skipAutomatedTests && (verifyScript || testScript)) throw new DeploymentError("테스트 생략과 검증 스크립트는 함께 지정할 수 없습니다.");
  if (testScript && !/^test(?::[a-z0-9:_-]+)?$/u.test(testScript)) throw new DeploymentError("기본 검증에는 test 명령 이름이 필요합니다.");
  const primary = testScript ?? (scope.api.length && !skipAutomatedTests ? "test:product" : undefined);
  const scripts = [...new Set([...(primary ? [primary] : []), ...(verifyScript ? [verifyScript] : [])])];
  for (const script of scripts) {
    if (!/^(?:test(?::[a-z0-9:_-]+)?|verify:[a-z0-9:_-]+|marketing:(?:preview|production):[a-z0-9:_-]+)$/u.test(script)
      || typeof manifest.scripts?.[script] !== "string" || !manifest.scripts[script].trim()) throw new DeploymentError(`대상 package.json에 유효한 검증 명령이 필요합니다: ${script}`);
  }
  return scripts;
}

export function prelaunchVerificationEnvironment(script, environment) {
  if (script !== "test" && !script.startsWith("test:")) return { ...environment };
  const execution = Object.fromEntries(["HOME", "PATH", "TMPDIR", "LANG", "LC_ALL", "USER", "LOGNAME", "SHELL", "CI"]
    .filter((key) => environment[key] !== undefined).map((key) => [key, environment[key]]));
  return { ...execution, NODE_ENV: "test" };
}

/** @param {{scripts: string[], run: (script: string) => Promise<void>}} options */
export async function runPrelaunchVerification({ scripts, run }) {
  for (const script of scripts) await run(script);
}

export function shouldRequireDatabaseRecovery(record) {
  return !(record.changed === false && record.outcome === "rolled_back");
}

export function currentDatabaseState({ currentRef, reviewedReleaseSha, reviewedDatabase, recordedDatabase }) {
  if (currentRef !== reviewedReleaseSha) return recordedDatabase ?? null;
  if (reviewedDatabase?.releaseSha !== currentRef || reviewedDatabase.backwardCompatible !== false
    || !Number.isInteger(reviewedDatabase.ledgerCount)) {
    throw new DeploymentError("현재 검토 배포의 DB 상태 증명이 일치하지 않습니다.");
  }
  if ((recordedDatabase?.releaseSha && recordedDatabase.releaseSha !== currentRef)
    || (Number.isInteger(recordedDatabase?.ledgerCount) && recordedDatabase.ledgerCount > reviewedDatabase.ledgerCount)) {
    throw new DeploymentError("기록된 DB 상태가 현재 검토 배포보다 새로워 자동으로 덮어쓸 수 없습니다.");
  }
  return reviewedDatabase;
}

export function assertDatabaseRollbackCompatible(stateDatabase, recordedDatabase) {
  for (const database of [stateDatabase, recordedDatabase]) {
    if (database && database.backwardCompatible !== true) {
      throw new DeploymentError(database.reason || "이 DB 변경의 이전 웹 호환성이 확인되지 않아 자동 rollback할 수 없습니다.");
    }
  }
  return recordedDatabase ?? stateDatabase ?? null;
}

/** @param {{required: boolean, open: () => unknown, gate?: () => Promise<void>, compatibilityConfirmed?: boolean, onApplied?: (record: Record<string, unknown>) => Promise<void>}} options */
export async function prepareDatabaseDeployment({ required, open, gate, compatibilityConfirmed, onApplied = async () => {} }) {
  if (!required) return null;
  if (compatibilityConfirmed !== true) throw new DeploymentError("DB 변경은 --db-compatible 호환성 확인이 필요합니다.");
  if (typeof gate !== "function") throw new DeploymentError("DB 배포에는 격리 검증 단계가 필요합니다.");
  const database = await open();
  try {
    const plan = await database.plan();
    if (plan.baselineRequired) throw new DeploymentError("최초 DB 배포에는 실제 반영 이력을 확인한 --db-baseline <비공개 JSON>이 필요합니다.");
    if (plan.migrationMode !== "additive") throw new DeploymentError("이전 웹과 호환되지 않는 DB 변경은 별도 배포 절차가 필요합니다.");
    await gate();
    let applied;
    try { applied = await database.apply(); } catch (error) {
      if (error.databaseState) await onApplied({ ...error.databaseState, backwardCompatible: ["committed", "rolled_back"].includes(error.databaseState.outcome) });
      throw error;
    }
    const record = { ...applied, backwardCompatible: true };
    await onApplied(record);
    await database.verify();
    return record;
  } finally { await database.close(); }
}

export function retargetPlist(plist, checkout) {
  const args = plist.ProgramArguments;
  if (plist.Label !== "com.homecook.production" || !Array.isArray(args)
    || args.length !== 6 || args[1] !== join(plist.WorkingDirectory, "scripts/start-production.mjs")
    || !["-H", "--hostname"].includes(args[2]) || args[3] !== "127.0.0.1"
    || !["-p", "--port"].includes(args[4]) || args[5] !== "3100") {
    throw new DeploymentError("기존 웹 설정은 com.homecook.production / 127.0.0.1:3100이어야 합니다.");
  }
  return {
    ...plist,
    WorkingDirectory: checkout,
    ProgramArguments: [args[0], join(checkout, "scripts/start-production.mjs"), ...args.slice(2)],
  };
}

export function retargetRound2Release(plist, readinessPath, releaseSha) {
  const environment = plist.EnvironmentVariables;
  const hasRound2Release = Boolean(environment?.MUMEOK_ROUND2_RELEASE_SHA || environment?.MUMEOK_ROUND2_READINESS_PATH);
  if (!hasRound2Release) return plist;
  if (!environment?.MUMEOK_ROUND2_RELEASE_SHA || !environment?.MUMEOK_ROUND2_READINESS_PATH || !environment?.MUMEOK_ROUND2_REPOSITORY_ROOT) {
    throw new DeploymentError("R2 운영 repository/release/readiness 환경값은 함께 있어야 합니다.");
  }
  if (!/^[a-f0-9]{40}$/u.test(releaseSha) || typeof readinessPath !== "string" || !readinessPath.startsWith("/") || typeof plist.WorkingDirectory !== "string" || !plist.WorkingDirectory.startsWith("/")) {
    throw new DeploymentError("R2 운영 repository/release/readiness 대상이 올바르지 않습니다.");
  }
  return {
    ...plist,
    EnvironmentVariables: {
      ...environment,
      MUMEOK_ROUND2_REPOSITORY_ROOT: plist.WorkingDirectory,
      MUMEOK_ROUND2_RELEASE_SHA: releaseSha,
      MUMEOK_ROUND2_READINESS_PATH: readinessPath,
    },
  };
}

export function inheritRound2Readiness({ readiness, previous, next, liveSha, releaseSha, files, databaseDeployment = false }) {
  const before = previous.EnvironmentVariables ?? {};
  if (!readiness || typeof readiness !== "object" || Array.isArray(readiness) || readiness.version !== 1
    || readiness.profile !== "production" || readiness.origin !== "https://app.mumeok.kr" || readiness.hostname !== "app.mumeok.kr"
    || typeof readiness.verified_at !== "string" || !Number.isFinite(Date.parse(readiness.verified_at))
    || !/^[a-f0-9]{40}$/u.test(liveSha) || !/^[a-f0-9]{40}$/u.test(releaseSha)
    || readiness.release_sha !== liveSha || before.MUMEOK_ROUND2_RELEASE_SHA !== liveSha
    || before.MUMEOK_ROUND2_REPOSITORY_ROOT !== previous.WorkingDirectory
    || !before.MUMEOK_ROUND2_READINESS_PATH?.startsWith("/")) {
    throw new DeploymentError("R2 readiness가 현재 실행 중인 checkout과 release SHA에 연결되어 있지 않습니다.");
  }
  assertRound2InheritanceBoundaries({ previous, next, files, databaseDeployment });
  // Only the new checkout binding changes; original proof files, hashes and verification times survive unchanged.
  return { ...readiness, release_sha: releaseSha };
}

/** @param {{previous: any, next: any, files: string[], databaseDeployment?: boolean, quantityPublicReadDigests?: (string | null)[] | null}} input */
export function assertRound2InheritanceBoundaries({ previous, next, files, databaseDeployment = false, quantityPublicReadDigests = null, nutritionMaintenanceHandoff = undefined, reviewedV74Source = null }) {
  const before = previous.EnvironmentVariables ?? {}, after = next.EnvironmentVariables ?? {};
  // Only the reviewed guest quantity projection, with R2 still closed on both sides.
  const reviewedQuantityPublicRead = CLOSED_R2_FLAGS.every(key => before[key] === "false" && after[key] === "false")
    && isDeepStrictEqual(quantityPublicReadDigests, [
      "d7399684db1e10d0bc86847dad3e2d6a361d61f7c1589446b37b9eb0dc089639",
      "e0d54ee86c56eeae6df11cd7ddf7346e744c72323d098599dc62425c006ac37e",
    ]);
  // Existing active and closed inheritance share the same protected source/environment boundaries.
  const reviewedNutrition = nutritionMaintenanceHandoff ? assertNutritionValidatorSourceHandoff(nutritionMaintenanceHandoff) : false;
  const reviewedV74Support = reviewedV74Source ? assertV74SourceHandoff(reviewedV74Source) : null;
  const protectedSources = [
    /^(?:app\/(?:beta|privacy|api\/v1\/marketing|%5F_ops\/r2-preflight)\/|app\/(?:layout\.|globals\.css$)|components\/marketing\/|lib\/(?:marketing[./-]|supabase\/|server\/(?:marketing-|recording-page\.|homeflow-page\.|full-local-auth\/|hybrid-auth\/))|types\/marketing-)/u,
    /^(?:supabase\/|infra\/|scripts\/sql\/|scripts\/(?:start-production\.mjs|lib\/(?:start-production-runtime|production-data-quality|full-local-|marketing-round2)))/u,
    /^(?:middleware\.|proxy\.|next\.config\.|tsconfig\.json$|package\.json$|pnpm-lock\.yaml$|\.env(?:\.|$))/u,
  ];
  if (databaseDeployment && !reviewedNutrition || !Array.isArray(files) || files.some(file => protectedSources.some(pattern => pattern.test(file))
    && !(reviewedV74Support?.has(file))
    && !(reviewedQuantityPublicRead && file === "lib/server/hybrid-auth/public-read-policy-runtime.mjs")
    && !(reviewedNutrition && (file === `supabase/migrations/${NUTRITION_VALIDATOR_MIGRATION}` || nutritionMaintenanceHandoff.maintenance.review.feature === RECIPE_SAVE_RECOVERY_FEATURE
      && RECIPE_SAVE_RECOVERY_MIGRATIONS.some(row => file === `supabase/migrations/${row.filename}`)
      || nutritionMaintenanceHandoff.maintenance.review.feature === RECIPE_REQUEST_ROLE_FEATURE && file === `supabase/migrations/${RECIPE_REQUEST_ROLE_MIGRATION.filename}`)))) {
    throw new DeploymentError("R2 보호 코드·SQL·동의·라우팅 변경은 기존 readiness를 승계할 수 없습니다.");
  }
  const protectedEnvironment = /^(?:(?:NEXT_PUBLIC_)?(?:MUMEOK_|MARKETING_|SUPABASE_|TURNSTILE_)|(?:DATA|LOCAL)_SUPABASE_|HOMECOOK_(?:AUTH|DATA|FULL_LOCAL|SESSION)|NEXT_PUBLIC_SITE_URL$|NODE_ENV$)/u;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  if ([...keys].some(key => protectedEnvironment.test(key) && before[key] !== after[key])
    || !isDeepStrictEqual({ ...retargetPlist(previous, next.WorkingDirectory), EnvironmentVariables: undefined }, { ...next, EnvironmentVariables: undefined })) {
    throw new DeploymentError("R2 키·대상·실행 설정 변경은 기존 readiness를 승계할 수 없습니다.");
  }
}

// Preparation includes build + isolated GET checks. No service mutation may happen there.
export async function deployTransaction({ prepare, activate, verify, restore, verifyRestored, restoreProhibitedReason = "" }) {
  try { await prepare(); } catch (error) {
    const detail = error instanceof DeploymentError ? ` ${error.message}` : " 비공개 배포 로그를 확인하세요.";
    throw new DeploymentError(`준비 실패: 실행 중인 웹은 변경하지 않았습니다.${detail}`);
  }
  try {
    await activate();
    await verify();
  } catch {
    if (restoreProhibitedReason) throw new DeploymentError(`웹 교체 실패: ${restoreProhibitedReason}`);
    try {
      await restore();
      await verifyRestored();
    } catch {
      throw new DeploymentError("웹 교체 실패, 자동 복구도 실패했습니다. 저장된 이전 plist로 rollback을 실행하세요.");
    }
    throw new DeploymentError("웹 교체 실패, 이전 웹 복구 완료. 비공개 배포 로그를 확인하세요.");
  }
}

export function productionEnvironment(plist, source = process.env) {
  const operatingSystem = Object.fromEntries(["HOME", "PATH", "TMPDIR", "LANG", "LC_ALL", "USER", "LOGNAME", "SHELL"]
    .filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
  const env = { ...operatingSystem, ...plist.EnvironmentVariables };
  return { ...env, PATH: `${dirname(plist.ProgramArguments[0])}:${env.PATH ?? "/usr/bin:/bin"}` };
}

export function assertRollbackTarget(live, state, recovering) {
  const matchesTarget = live.cwd === state.checkout && live.buildId === state.buildId && live.plistHash === state.targetPlistHash;
  const matchesPrevious = recovering && live.cwd === state.previousCwd && live.buildId === state.previousBuildId && live.plistHash === state.previousPlistHash;
  if (!matchesTarget && !matchesPrevious) throw new DeploymentError("기록 이후 다른 웹 배포가 감지되어 rollback을 중단합니다.");
}

export function createCancellation() {
  let cancelled = false;
  let draining;
  const stops = new Set();
  return {
    check() { if (cancelled) throw new DeploymentError("배포 취소 요청을 처리했습니다."); },
    track(stop) { stops.add(stop); return () => stops.delete(stop); },
    request() {
      cancelled = true;
      draining ??= Promise.allSettled([...stops].map((stop) => stop()));
      return draining;
    },
    drain: () => draining ?? Promise.resolve(),
  };
}
export function prelaunchBuildEnvironment(plist, releaseName) {
  return { ...productionEnvironment(plist), CI: "true", HOMECOOK_RELEASE_BUILD_ID: `prelaunch-${releaseName}` };
}

export function parsePrelaunchArgs(argv) {
  const [action = "help", ...args] = argv;
  return { action, args: args[0] === "--" ? args.slice(1) : args };
}

export async function restartLaunchAgent({ isLoaded, bootout, writePlist, bootstrap, wait }) {
  if (await isLoaded()) await bootout();
  for (let attempt = 0; await isLoaded(); attempt += 1) {
    if (attempt === 20) throw new DeploymentError("이전 웹 등록의 종료를 기다리다 시간이 초과했습니다.");
    await wait(500);
  }
  await writePlist();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = await bootstrap();
    if (code === 0) return;
    if (code !== 5) throw new DeploymentError("웹 등록에 실패했습니다. 비공개 배포 로그를 확인하세요.");
    if (attempt < 19) await wait(500);
  }
  throw new DeploymentError("웹 등록 재시도 시간이 초과했습니다. 비공개 배포 로그를 확인하세요.");
}

export function prelaunchSourceAncestry(option, ref, liveRef, target) {
  if (option === "--ref") return [target, "origin/master"];
  if (option !== "--reviewed-ref" || !/^[a-f0-9]{40}$/u.test(ref) || ref !== target) {
    throw new DeploymentError("검토한 출시 전 수정은 --reviewed-ref에 정확한 40자리 커밋 SHA를 지정해야 합니다.");
  }
  return [liveRef, target];
}


export function assertRecipeSaveRecoveryReview(review) {
  const db = review?.database, sha = value => CLOSED_R2_SHA.test(value ?? "");
  const pointer = value => value && Object.keys(value).sort().join() === "path,sha256" && isAbsolute(value.path ?? "") && sha(value.sha256);
  const images = (rows, expected) => Array.isArray(rows) && rows.length === expected.length && isDeepStrictEqual(rows.map(row=>row.signature).sort(),[...expected].sort())
    && rows.every(row => Object.keys(row).sort().join() === "definitionSha256,metadataSha256,signature,sourceMd5"
      && typeof row.signature === "string" && /^(?:public|private)\.[a-z0-9_]+\([^;]*\)$/u.test(row.signature)
      && sha(row.definitionSha256) && sha(row.metadataSha256) && /^[a-f0-9]{32}$/u.test(row.sourceMd5));
  closedR2Require(review?.schema === "homecook.prelaunch-protected-rollout-review.v1" && review.feature === RECIPE_SAVE_RECOVERY_FEATURE
    && CLOSED_R2_REF.test(RECIPE_SAVE_RECOVERY_RELEASE_SHA ?? "") && review.to === RECIPE_SAVE_RECOVERY_RELEASE_SHA
    && CLOSED_R2_REF.test(review.from ?? "") && review.from !== review.to && review.sourceReaderRef === review.from && review.migrationSourceRef === review.to
    && review.readerPrecedesDatabase === true && isDeepStrictEqual(review.approved, {database:true,reader:false,writerOn:false})
    && review.testScript === "test:feedback-batch:web" && isDeepStrictEqual(review.readerEnvironment, {}), "Recipe-save recovery exact source authority is unbound or differs");
  closedR2Require(typeof review.predecessorBuildId === "string" && review.predecessorBuildId.length > 0
    && ["predecessorPlistSha256","closedArtifactSha256","controlSha256","historicalProofsSha256","isolatedEvidenceSha256","readerFlowsSha256"].every(key => sha(review[key]))
    && review.closedReviewSha256 === CLOSED_R2_REVIEW_PIN.sha256 && review.consentGeneration === 1
    && ["isolatedEvidence","readerFlows","platformInventory","backupReadiness"].every(key => pointer(review[key]))
    && review.isolatedEvidence.sha256 === review.isolatedEvidenceSha256 && review.readerFlows.sha256 === review.readerFlowsSha256
    && isDeepStrictEqual(review.readerSources,RECIPE_SAVE_RECOVERY_READER_SOURCES), "Recipe-save reader/closed history/evidence differs");
  const paths = RECIPE_SAVE_RECOVERY_MIGRATIONS.map(row => `supabase/migrations/${row.filename}`);
  closedR2Require(review.files && paths.every((path,index) => isDeepStrictEqual(review.files[path],[null,RECIPE_SAVE_RECOVERY_MIGRATIONS[index].sha256]))
    && RECIPE_SAVE_RECOVERY_RUNTIME_PATHS.every(path => Array.isArray(review.files[path]) && review.files[path].every(sha) && review.files[path][1]===RECIPE_SAVE_RECOVERY_RUNTIME_POSTIMAGES[path])
    && Object.entries(review.files).every(([path,pair]) => (paths.includes(path) || RECIPE_SAVE_RECOVERY_RUNTIME_PATHS.includes(path) || /^(?:tests|docs)\//u.test(path))
      && !path.split("/").some(part => ["",".",".."].includes(part)) && Array.isArray(pair) && pair.length === 2
      && pair.every(value => value === null || sha(value)) && pair[0] !== pair[1]), "Recipe-save source cannot include another runtime or SQL");
  closedR2Require(db?.before?.length === 229 && db.after?.length === 231 && isDeepStrictEqual(db.after.slice(0,229),db.before)
    && db.before[228].filename === NUTRITION_VALIDATOR_MIGRATION && db.before[228].sha256 === NUTRITION_VALIDATOR_MIGRATION_SHA256
    && db.migrations?.length === 2 && RECIPE_SAVE_RECOVERY_MIGRATIONS.every((row,index) => db.after[229+index]?.filename === row.filename
      && db.after[229+index].sha256 === row.sha256 && db.migrations[index]?.filename === row.filename && db.migrations[index].rawSha256 === row.sha256
      && sha(db.migrations[index].payloadSha256) && Object.keys(db.migrations[index]).sort().join() === "filename,payloadSha256,rawSha256")
    && isAbsolute(db.configPath ?? "") && ["configSha256","targetSha256","beforeCatalogSha256","afterCatalogSha256","immutableSha256","afterImmutableSha256","stableImmutableSha256",
      "normalProjectionSha256","postimageRegistrySha256","attestationPostimageRegistrySha256","beforeColumnsSha256","afterColumnsSha256","receiptColumnsBeforeSha256","receiptColumnsAfterSha256"].every(key=>sha(db[key]))
    && db.postimageRegistrySha256 === QUANTITY_V4_PROTECTION.postimageRegistrySha256
    && db.recipePostimageRegistrySha256 === RECIPE_SAVE_RECOVERY_POSTIMAGES_SHA256
    && db.beforeColumnsSha256 === db.afterColumnsSha256 && images(db.recipeFunctionsBefore,RECIPE_SAVE_RECOVERY_FUNCTIONS_BEFORE) && images(db.recipeFunctionsAfter,RECIPE_SAVE_RECOVERY_FUNCTIONS_AFTER)
    && [db.beforeScope,db.afterScope].every(scope=>scope && Object.keys(scope).sort().join()==="aliasSha256,outerSha256" && Object.values(scope).every(sha))
    && db.attestationScope?.beforeOuterSha256 === db.beforeScope.outerSha256 && db.attestationScope?.afterOuterSha256 === db.afterScope.outerSha256
    && sha(db.attestationScope.afterAliasSha256) && db.recipeScope?.beforeOuterSha256 === db.beforeScope.outerSha256
    && db.recipeScope.afterOuterSha256 === db.afterScope.outerSha256 && db.recipeScope.afterAliasSha256 === db.beforeScope.outerSha256
    && db.workerCatalogBefore === QUANTITY_V4_WORKER_CATALOG_AFTER && db.workerCatalogAfter === QUANTITY_V4_WORKER_CATALOG_AFTER
    && [db.functionBefore,db.functionAfter].every(image=>image && Object.keys(image).sort().join()==="definitionSha256,metadataSha256,sourceMd5"
      && sha(image.definitionSha256) && sha(image.metadataSha256) && /^[a-f0-9]{32}$/u.test(image.sourceMd5))
    && ["Before","After"].every(phase=>{const row=db[`recipeFunctions${phase}`].find(item=>item.signature==="public.validate_recipe_nutrition_snapshot_payload(jsonb)");
      return isDeepStrictEqual(db[`function${phase}`],{definitionSha256:row.definitionSha256,metadataSha256:row.metadataSha256,sourceMd5:row.sourceMd5});}),
    "Recipe-save exact229/231 two-source/function/receipt/catalog images differ");
  closedR2Require(review.predecessorNutrition?.reviewSha256 === NUTRITION_VALIDATOR_ROLLOUT_REVIEW_PIN.sha256
    && pointer(review.predecessorNutrition.databaseReceipt) && CLOSED_R2_REF.test(review.predecessorNutrition.readerFloor ?? "")
    && db.workerBaseline?.credentialGeneration === 48 && db.workerBaseline.workerReleaseSha === QUANTITY_V4_RELEASE_SHA
    && db.workerBaseline.schemaIdentity === QUANTITY_V4_WORKER_SCHEMA_IDENTITY && db.workerBaseline.workerPolicyEnabled === true
    && ["credentialRowSha256","policyRowSha256","policyStableSha256","snapshotDigest"].every(key=>sha(db.workerBaseline[key])),
    "Recipe-save original229/current48 authority differs");
  return review;
}
export function assertRecipeSaveRecoveryReader(review, live) {
  assertRecipeSaveRecoveryReview(review);
  closedR2Require(live?.ref === review.sourceReaderRef && live.buildId === review.predecessorBuildId && live.plistSha256 === review.predecessorPlistSha256
    && live.healthy === true && isDeepStrictEqual(live.readerSources,review.readerSources), "Recipe-save requires the exact healthy existing229 reader before SQL and COMMIT");
  return live;
}
export function assertRecipeSaveRecoveryDatabaseReceipt(review, record) {
  assertRecipeSaveRecoveryReview(review);
  closedR2Require(record?.schema === "homecook.prelaunch-protected-db-attempt.v1" && record.feature === RECIPE_SAVE_RECOVERY_FEATURE && record.status === "committed"
    && record.reviewSha256 === RECIPE_SAVE_RECOVERY_ROLLOUT_REVIEW_PIN.sha256 && record.from === review.from && record.to === review.to
    && record.sourceReaderRef === review.sourceReaderRef && record.readerFloor === review.sourceReaderRef && record.targetSha256 === review.database.targetSha256
    && isDeepStrictEqual(record.predecessorNutrition,review.predecessorNutrition)
    && record.databasePlanSha256 === closedR2Hash(JSON.stringify({source:review.database.after,applied:review.database.after}))
    && record.catalogSha256 === review.database.afterCatalogSha256 && record.immutableSha256 === review.database.afterImmutableSha256
    && record.rowsPreservedInTransaction === true && record.controlsPreservedInTransaction === true && record.receiptColumnInitiallyNull === true && record.recipeSaveRecoveryWritesEnabled === true
    && ["productWriterEnabled","cookedWeightWriterEnabled","quantityWriterEnabled","attestationWriterEnabled","workerPolicyEnabled","readerReady","writerEnabled"].every(key=>record[key]===true)
    && record.backwardCompatible === false && ["normalDataSha256","preservedRowsSha256","attestationRowsSha256","controlsSha256"].every(key=>CLOSED_R2_SHA.test(record[key]??""))
    && record.backup?.fullArchiveDecoded === true && [record.backup.sha256,record.backup.rolesSha256].every(value=>CLOSED_R2_SHA.test(value??""))
    && closedR2Hash(JSON.stringify(record.backup.target)) === review.database.targetSha256, "Recipe-save immutable231 terminal differs");
  return record;
}
export function recipeSaveRecoveryBinding(maintenance) {
  assertRecipeSaveRecoveryDatabaseReceipt(maintenance.review,maintenance.record);
  closedR2Require(maintenance.pointer?.sha256 === maintenance.guardPointer?.sha256 && isAbsolute(maintenance.pointer?.path??"")
    && CLOSED_R2_SHA.test(maintenance.pointer.sha256??""), "Recipe-save terminal bytes binding differs");
  return {schema:"homecook.recipe-save-recovery-maintenance.v1",reviewSha256:RECIPE_SAVE_RECOVERY_ROLLOUT_REVIEW_PIN.sha256,receipt:maintenance.pointer,
    predecessorDatabaseReceiptSha256:maintenance.review.predecessorNutrition.databaseReceipt.sha256,targetSha256:maintenance.review.database.targetSha256,
    ledgerCount:231,migrationSha256:closedR2Hash(JSON.stringify(RECIPE_SAVE_RECOVERY_MIGRATIONS)),sourceReaderRef:maintenance.review.sourceReaderRef,
    databasePlanSha256:maintenance.record.databasePlanSha256,predecessorMaintenance:nutritionValidatorMaintenanceBinding(maintenance.nutritionPredecessor)};
}
export function readRecipeSaveRecoveryAttempt(repositoryRoot) {
  const paths=protectedRolloutPaths(prelaunchStateRoot(),{feature:RECIPE_SAVE_RECOVERY_FEATURE});
  if (!existsSync(paths.databaseGuardPath)) return null;
  const review=loadProtectedRolloutReview(repositoryRoot,{feature:RECIPE_SAVE_RECOVERY_FEATURE});
  const bytes=readClosedR2PrivateBytes(paths.databaseGuardPath,repositoryRoot,524288),record=JSON.parse(bytes);
  closedR2Require(record.schema === "homecook.prelaunch-protected-db-attempt.v1" && record.feature === RECIPE_SAVE_RECOVERY_FEATURE
    && record.reviewSha256 === RECIPE_SAVE_RECOVERY_ROLLOUT_REVIEW_PIN.sha256 && record.from === review.from && record.to === review.to
    && record.journalFile === "attempt.json" && record.sourceReaderRef === review.sourceReaderRef && isDeepStrictEqual(record.predecessorNutrition,review.predecessorNutrition)
    && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(record.operationId??"") && record.operationDirectory===join(paths.operationRoot,record.operationId)
    && ["applying_precommit","commit_dispatch_guard","unknown","rolled_back_before_commit","committed","not_applied"].includes(record.status),
    "Recipe-save unresolved/foreign guard cannot fall back to229");
  closedR2Require(["committed","not_applied"].includes(record.status) ? record.targetSha256===review.database.targetSha256
    : closedR2Hash(JSON.stringify(record.target))===review.database.targetSha256,"Recipe-save target differs");
  return {review,record,bytes,paths};
}
export function verifyRecipeSaveRecoveryPredecessor(review,repositoryRoot) {
  assertRecipeSaveRecoveryReview(review);
  const previous=loadNutritionValidatorMaintenance(repositoryRoot),expected=review.predecessorNutrition;
  closedR2Require(previous && isDeepStrictEqual(previous.pointer,expected.databaseReceipt)
    && previous.review.sourceReaderRef === expected.readerFloor && previous.review.database.targetSha256 === review.database.targetSha256
    && isDeepStrictEqual(previous.review.database.after,review.database.before) && previous.review.database.afterCatalogSha256 === review.database.beforeCatalogSha256
    && previous.review.database.afterImmutableSha256 === review.database.immutableSha256 && isDeepStrictEqual(previous.review.database.afterScope,review.database.beforeScope),
    "Recipe-save exact committed229 predecessor differs");
  return previous;
}
function recipeSaveRecoveryAdmissionMaintenance(repositoryRoot, { review, operationId }) {
  const pinned = loadProtectedRolloutReview(repositoryRoot, { feature: RECIPE_SAVE_RECOVERY_FEATURE });
  closedR2Require(isDeepStrictEqual(pinned, review), "Recipe-save admission review differs from its fixed PIN");
  const previous = verifyRecipeSaveRecoveryPredecessor(review, repositoryRoot);
  const attempt = readRecipeSaveRecoveryAttempt(repositoryRoot);
  if (attempt && ["applying_precommit", "commit_dispatch_guard"].includes(attempt.record.status)) {
    // Only the still-running owner's boundary hook may inspect its immutable229 predecessor.
    // Ordinary current-state reads continue to reject this pending231 guard.
    closedR2Require(attempt.record.operationId === operationId && attempt.record.commitDispatched !== true
      && attempt.record.readerFloor === review.sourceReaderRef
      && readClosedR2PrivateBytes(join(attempt.record.operationDirectory, "attempt.json"), repositoryRoot, 524288).equals(attempt.bytes),
      "Recipe-save admission requires the exact same-operation precommit guard");
    return previous;
  }
  closedR2Require(isDeepStrictEqual(loadCurrentDatabaseMaintenance(repositoryRoot), previous),
    "Recipe-save admission requires the exact current229 terminal");
  return previous;
}
export function verifyRecipeSaveRecoveryWorkerAdmission(review, repositoryRoot, operationId = /** @type {string | undefined} */ (undefined)) {
  const previous = verifyRecipeSaveRecoveryPredecessor(review, repositoryRoot);
  const continuation = loadCookedWeightAttestationWorkerContinuation(previous.predecessor, repositoryRoot, { review, operationId });
  const observed = continuation.observation;
  closedR2Require(continuation.current.state === "activation-committed" && observed.workerPolicyEnabled === true
    && observed.quantityPolicyEnabled === true && observed.ledgerCount === 229
    && observed.targetSha256 === review.database.targetSha256
    && Object.entries(review.database.workerBaseline).every(([key, value]) => isDeepStrictEqual(observed[key], value))
    && isDeepStrictEqual(observed.databaseMaintenance, nutritionValidatorMaintenanceBinding(previous)),
    "Recipe-save admission requires committed current229 worker activation");
  return continuation;
}
export function loadRecipeSaveRecoveryMaintenance(repositoryRoot) {
  const attempt=readRecipeSaveRecoveryAttempt(repositoryRoot);
  if (!attempt) return null;
  const {review,record,bytes,paths}=attempt;
  closedR2Require(["committed","not_applied"].includes(record.status),"Recipe-save outcome unresolved; retain231 fence");
  const pointer={path:join(record.operationDirectory,"receipt.json"),sha256:closedR2Hash(bytes)};
  closedR2Require(readClosedR2PrivateBytes(pointer.path,repositoryRoot,524288).equals(bytes),"Recipe-save terminal/guard bytes differ");
  if (record.status === "not_applied") return null;
  assertRecipeSaveRecoveryDatabaseReceipt(review,record);
  const nutritionPredecessor=verifyRecipeSaveRecoveryPredecessor(review,repositoryRoot);
  return {review,record,pointer,guardPointer:{path:paths.databaseGuardPath,sha256:pointer.sha256},nutritionPredecessor,predecessor:nutritionPredecessor.predecessor};
}
export function loadCurrentDatabaseMaintenance(repositoryRoot) {
  // A present unresolved231 guard throws; it must never fall back to a successful229 history.
  return loadRecipeRequestRoleMaintenance(repositoryRoot) ?? loadRecipeSaveRecoveryMaintenance(repositoryRoot) ?? loadNutritionValidatorMaintenance(repositoryRoot);
}
export function recipeSaveRecoveryPhaseStatus(attempt,readerCompatible=false) {
  const {review,record}=attempt;assertRecipeSaveRecoveryReview(review);
  const committed=record.status==="committed",unapplied=record.status==="not_applied";
  if (committed) assertRecipeSaveRecoveryDatabaseReceipt(review,record);
  return {feature:RECIPE_SAVE_RECOVERY_FEATURE,phase:record.status,databasePlanSha256:committed?record.databasePlanSha256:unapplied?closedR2Hash(JSON.stringify({source:review.database.before,applied:review.database.before})):null,
    appliedLedgerCount:committed?231:unapplied?229:null,readerFloor:committed?review.sourceReaderRef:null,readerPending:committed&&!readerCompatible,
    normalDeploymentAllowed:(committed||unapplied)&&readerCompatible,backwardCompatible:false,recordedWriterEnabled:committed?true:null};
}
export function assertRecipeSaveRecoverySourceHandoff({maintenance,from,to,live,files,digests}) {
  recipeSaveRecoveryBinding(maintenance);const review=maintenance.review;
  closedR2Require(from===review.sourceReaderRef && to===review.to && live?.ref===from && live.buildId===review.predecessorBuildId
    && live.plistSha256===review.predecessorPlistSha256 && isDeepStrictEqual([...files].sort(),Object.keys(review.files).sort())
    && isDeepStrictEqual(digests,review.files),"Only exact committed231 source handoff may publish new v5 emission/PATCH runtime");
  return true;
}
export function assertRecipeSaveRecoveryMarker(maintenance,marker,sourceReaderMarker=false) {
  const binding=recipeSaveRecoveryBinding(maintenance),old=nutritionValidatorMaintenanceBinding(maintenance.nutritionPredecessor);
  closedR2Require(marker && isDeepStrictEqual(marker.databaseMaintenance,sourceReaderMarker?old:binding)
    && marker.databasePlanSha256===maintenance.predecessor.record.databasePlanSha256,"Recipe-save keeps original228 marker/history and binds231 separately");
  return marker;
}

// Exact metadata-only232 authority. Original231 review/terminal remains an immutable predecessor.
export function assertRecipeRequestRoleReview(review) {
  const db=review?.database, sha=value=>CLOSED_R2_SHA.test(value??"");
  const pointer=value=>value && Object.keys(value).sort().join()==="path,sha256" && isAbsolute(value.path??"") && sha(value.sha256);
  closedR2Require(review?.schema==="homecook.prelaunch-protected-rollout-review.v1" && review.feature===RECIPE_REQUEST_ROLE_FEATURE
    && CLOSED_R2_REF.test(RECIPE_REQUEST_ROLE_RELEASE_SHA??"") && review.to===RECIPE_REQUEST_ROLE_RELEASE_SHA
    && review.from===RECIPE_SAVE_RECOVERY_RELEASE_SHA && review.sourceReaderRef===review.from && review.migrationSourceRef===review.to && review.to!==review.from
    && review.readerPrecedesDatabase===true && isDeepStrictEqual(review.approved,{database:true,reader:false,writerOn:false})
    && review.testScript==="test:feedback-batch:web" && isDeepStrictEqual(review.readerEnvironment,{}), "Recipe request-role authority is unbound or differs");
  closedR2Require(typeof review.predecessorBuildId==="string" && review.predecessorBuildId.length>0
    && ["predecessorPlistSha256","closedArtifactSha256","controlSha256","historicalProofsSha256","isolatedEvidenceSha256","readerFlowsSha256"].every(key=>sha(review[key]))
    && review.closedReviewSha256===CLOSED_R2_REVIEW_PIN.sha256 && review.consentGeneration===1
    && ["isolatedEvidence","readerFlows","platformInventory","backupReadiness"].every(key=>pointer(review[key]))
    && review.isolatedEvidence.sha256===review.isolatedEvidenceSha256 && review.readerFlows.sha256===review.readerFlowsSha256
    && isDeepStrictEqual(review.readerSources,RECIPE_SAVE_RECOVERY_READER_SOURCES), "Recipe request-role reader/evidence differs");
  const file=`supabase/migrations/${RECIPE_REQUEST_ROLE_MIGRATION.filename}`;
  closedR2Require(isDeepStrictEqual(review.files?.[file],[null,RECIPE_REQUEST_ROLE_MIGRATION.sha256])
    && Object.entries(review.files).every(([path,pair])=>(path===file || /^(?:tests|docs)\//u.test(path))
      && !path.split("/").some(part=>["",".",".."].includes(part)) && Array.isArray(pair) && pair.length===2
      && pair.every(value=>value===null||sha(value)) && pair[0]!==pair[1]), "Recipe request-role cannot carry another SQL or runtime");
  closedR2Require(db?.before?.length===231 && db.after?.length===232 && isDeepStrictEqual(db.after.slice(0,231),db.before)
    && RECIPE_SAVE_RECOVERY_MIGRATIONS.every((row,index)=>isDeepStrictEqual(db.before[229+index],row))
    && isDeepStrictEqual(db.after[231],RECIPE_REQUEST_ROLE_MIGRATION) && db.migrations?.length===1
    && db.migrations[0].filename===RECIPE_REQUEST_ROLE_MIGRATION.filename && db.migrations[0].rawSha256===RECIPE_REQUEST_ROLE_MIGRATION.sha256
    && Object.keys(db.migrations[0]).sort().join()==="filename,payloadSha256,rawSha256" && sha(db.migrations[0].payloadSha256)
    && isAbsolute(db.configPath??"") && ["configSha256","targetSha256","beforeCatalogSha256","afterCatalogSha256","immutableSha256","afterImmutableSha256","stableImmutableSha256",
      "normalProjectionSha256","postimageRegistrySha256","attestationPostimageRegistrySha256","beforeColumnsSha256","afterColumnsSha256","receiptColumnsBeforeSha256","receiptColumnsAfterSha256"].every(key=>sha(db[key]))
    && db.postimageRegistrySha256===QUANTITY_V4_PROTECTION.postimageRegistrySha256 && db.recipePostimageRegistrySha256===RECIPE_SAVE_RECOVERY_POSTIMAGES_SHA256
    && db.requestRolePostimageRegistrySha256===RECIPE_REQUEST_ROLE_POSTIMAGE_SHA256 && db.beforeColumnsSha256===db.afterColumnsSha256
    && db.receiptColumnsBeforeSha256===db.receiptColumnsAfterSha256, "Recipe request-role exact231/232 ledger/receipt metadata differs");
  const images=rows=>Array.isArray(rows) && rows.length===11 && isDeepStrictEqual(rows.map(row=>row.signature).sort(),[...RECIPE_SAVE_RECOVERY_FUNCTIONS_AFTER].sort())
    && rows.every(row=>Object.keys(row).sort().join()==="definitionSha256,metadataSha256,signature,sourceMd5" && sha(row.definitionSha256) && sha(row.metadataSha256) && /^[a-f0-9]{32}$/u.test(row.sourceMd5));
  closedR2Require(images(db.recipeFunctionsBefore) && images(db.recipeFunctionsAfter), "Recipe request-role exact11 function metadata required");
  const outer="private.verify_full_local_internal_scope()";
  for (const before of db.recipeFunctionsBefore) {
    const after=db.recipeFunctionsAfter.find(row=>row.signature===before.signature);
    closedR2Require(before.signature===outer
      ? before.definitionSha256==="59cd9173efa0be26485d26e8c94ff49b816459c6f915b8bf41ade64838526ee4" && before.sourceMd5==="cdba05648213ef145555dfc02fd234c8"
        && after.definitionSha256==="3b5f09838ffee6b4a2844bc3eebe86cd6eb75601b8ab7fc4703feb8ddeae1320" && after.sourceMd5==="e6eb35af2e77538b72d655b16f408967" && before.metadataSha256===after.metadataSha256
      : isDeepStrictEqual(before,after), "Recipe request-role may replace only the fixed outer body");
  }
  const validator=db.recipeFunctionsBefore.find(row=>row.signature==="public.validate_recipe_nutrition_snapshot_payload(jsonb)");
  closedR2Require(isDeepStrictEqual(db.functionBefore,db.functionAfter) && isDeepStrictEqual(db.functionAfter,
    {definitionSha256:validator.definitionSha256,metadataSha256:validator.metadataSha256,sourceMd5:validator.sourceMd5})
    && [db.beforeScope,db.afterScope].every(scope=>scope && Object.keys(scope).sort().join()==="aliasSha256,outerSha256" && Object.values(scope).every(sha))
    && db.beforeScope.aliasSha256===db.afterScope.aliasSha256
    && ["attestationScope","recipeScope"].every(key=>db[key]?.beforeOuterSha256===db.beforeScope.outerSha256 && db[key].afterOuterSha256===db.afterScope.outerSha256 && sha(db[key].afterAliasSha256))
    && db.workerCatalogBefore===QUANTITY_V4_WORKER_CATALOG_AFTER && db.workerCatalogAfter===QUANTITY_V4_WORKER_CATALOG_AFTER
    && db.workerBaseline?.credentialGeneration===48 && db.workerBaseline.workerReleaseSha===QUANTITY_V4_RELEASE_SHA
    && db.workerBaseline.schemaIdentity===QUANTITY_V4_WORKER_SCHEMA_IDENTITY && db.workerBaseline.workerPolicyEnabled===true
    && ["credentialRowSha256","policyRowSha256","policyStableSha256","snapshotDigest"].every(key=>sha(db.workerBaseline[key]))
    && review.predecessorRecipeSave?.reviewSha256===RECIPE_SAVE_RECOVERY_ROLLOUT_REVIEW_PIN.sha256
    && pointer(review.predecessorRecipeSave.databaseReceipt) && CLOSED_R2_REF.test(review.predecessorRecipeSave.readerFloor??""), "Recipe request-role unchanged source/scope/worker/predecessor differs");
  return review;
}
export function assertRecipeRequestRoleReader(review,live) {
  assertRecipeRequestRoleReview(review);
  closedR2Require(live?.ref===review.sourceReaderRef && live.buildId===review.predecessorBuildId && live.plistSha256===review.predecessorPlistSha256
    && live.healthy===true && isDeepStrictEqual(live.readerSources,review.readerSources), "Recipe request-role requires exact healthy existing231 reader");
  return live;
}
export function assertRecipeRequestRoleDatabaseReceipt(review,record) {
  assertRecipeRequestRoleReview(review);
  closedR2Require(record?.schema==="homecook.prelaunch-protected-db-attempt.v1" && record.feature===RECIPE_REQUEST_ROLE_FEATURE && record.status==="committed"
    && record.reviewSha256===RECIPE_REQUEST_ROLE_ROLLOUT_REVIEW_PIN.sha256 && record.from===review.from && record.to===review.to
    && record.sourceReaderRef===review.sourceReaderRef && record.readerFloor===review.sourceReaderRef && record.targetSha256===review.database.targetSha256
    && isDeepStrictEqual(record.predecessorRecipeSave,review.predecessorRecipeSave)
    && record.databasePlanSha256===closedR2Hash(JSON.stringify({source:review.database.after,applied:review.database.after}))
    && record.catalogSha256===review.database.afterCatalogSha256 && record.immutableSha256===review.database.afterImmutableSha256
    && record.requestRoleCorrected===true && record.rowsPreservedInTransaction===true && record.controlsPreservedInTransaction===true
    && ["productWriterEnabled","cookedWeightWriterEnabled","quantityWriterEnabled","attestationWriterEnabled","workerPolicyEnabled","readerReady","writerEnabled"].every(key=>record[key]===true)
    && record.backwardCompatible===false && ["normalDataSha256","preservedRowsSha256","attestationRowsSha256","controlsSha256"].every(key=>CLOSED_R2_SHA.test(record[key]??""))
    && record.backup?.fullArchiveDecoded===true && [record.backup.sha256,record.backup.rolesSha256].every(value=>CLOSED_R2_SHA.test(value??""))
    && closedR2Hash(JSON.stringify(record.backup.target))===review.database.targetSha256, "Recipe request-role immutable232 terminal differs");
  return record;
}
export function recipeRequestRoleBinding(maintenance) {
  assertRecipeRequestRoleDatabaseReceipt(maintenance.review,maintenance.record);
  closedR2Require(maintenance.pointer?.sha256===maintenance.guardPointer?.sha256 && isAbsolute(maintenance.pointer?.path??"") && CLOSED_R2_SHA.test(maintenance.pointer.sha256??""), "Recipe request-role terminal bytes differ");
  return {schema:"homecook.recipe-request-role-maintenance.v1",reviewSha256:RECIPE_REQUEST_ROLE_ROLLOUT_REVIEW_PIN.sha256,receipt:maintenance.pointer,
    predecessorDatabaseReceiptSha256:maintenance.review.predecessorRecipeSave.databaseReceipt.sha256,targetSha256:maintenance.review.database.targetSha256,
    ledgerCount:232,migrationSha256:RECIPE_REQUEST_ROLE_MIGRATION.sha256,sourceReaderRef:maintenance.review.sourceReaderRef,
    databasePlanSha256:maintenance.record.databasePlanSha256,predecessorMaintenance:recipeSaveRecoveryBinding(maintenance.recipeSavePredecessor)};
}
export function readRecipeRequestRoleAttempt(repositoryRoot) {
  const paths=protectedRolloutPaths(prelaunchStateRoot(),{feature:RECIPE_REQUEST_ROLE_FEATURE});
  if (!existsSync(paths.databaseGuardPath)) return null;
  const review=loadProtectedRolloutReview(repositoryRoot,{feature:RECIPE_REQUEST_ROLE_FEATURE});
  const bytes=readClosedR2PrivateBytes(paths.databaseGuardPath,repositoryRoot,524288),record=JSON.parse(bytes);
  closedR2Require(record.schema==="homecook.prelaunch-protected-db-attempt.v1" && record.feature===RECIPE_REQUEST_ROLE_FEATURE
    && record.reviewSha256===RECIPE_REQUEST_ROLE_ROLLOUT_REVIEW_PIN.sha256 && record.from===review.from && record.to===review.to
    && record.journalFile==="attempt.json" && record.sourceReaderRef===review.sourceReaderRef && isDeepStrictEqual(record.predecessorRecipeSave,review.predecessorRecipeSave)
    && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(record.operationId??"") && record.operationDirectory===join(paths.operationRoot,record.operationId)
    && ["applying_precommit","commit_dispatch_guard","unknown","rolled_back_before_commit","committed","not_applied"].includes(record.status), "Recipe request-role unresolved/foreign guard cannot fall back to231");
  closedR2Require(["committed","not_applied"].includes(record.status)?record.targetSha256===review.database.targetSha256:closedR2Hash(JSON.stringify(record.target))===review.database.targetSha256,"Recipe request-role target differs");
  return {review,record,bytes,paths};
}
export function verifyRecipeRequestRolePredecessor(review,repositoryRoot) {
  assertRecipeRequestRoleReview(review);
  const previous=loadRecipeSaveRecoveryMaintenance(repositoryRoot),expected=review.predecessorRecipeSave,db=review.database;
  closedR2Require(previous && isDeepStrictEqual(previous.pointer,expected.databaseReceipt) && previous.review.sourceReaderRef===expected.readerFloor
    && previous.review.to===review.sourceReaderRef && previous.review.database.targetSha256===db.targetSha256
    && isDeepStrictEqual(previous.review.database.after,db.before) && previous.review.database.afterCatalogSha256===db.beforeCatalogSha256
    && previous.review.database.afterImmutableSha256===db.immutableSha256 && previous.review.database.stableImmutableSha256===db.stableImmutableSha256
    && isDeepStrictEqual(previous.review.database.afterScope,db.beforeScope) && isDeepStrictEqual(previous.review.database.recipeFunctionsAfter,db.recipeFunctionsBefore)
    && previous.review.database.receiptColumnsAfterSha256===db.receiptColumnsBeforeSha256
    && previous.review.database.afterColumnsSha256===db.beforeColumnsSha256 && previous.review.database.attestationPostimageRegistrySha256===db.attestationPostimageRegistrySha256
    && previous.review.database.attestationScope.afterAliasSha256===db.attestationScope.afterAliasSha256
    && previous.review.database.recipeScope.afterAliasSha256===db.recipeScope.afterAliasSha256
    && isDeepStrictEqual(previous.review.database.functionAfter,db.functionBefore), "Recipe request-role exact committed231 predecessor differs");
  return previous;
}
function recipeRequestRoleAdmissionMaintenance(repositoryRoot,{review,operationId}) {
  const pinned=loadProtectedRolloutReview(repositoryRoot,{feature:RECIPE_REQUEST_ROLE_FEATURE});
  closedR2Require(isDeepStrictEqual(pinned,review),"Recipe request-role admission differs from fixed PIN");
  const previous=verifyRecipeRequestRolePredecessor(review,repositoryRoot),attempt=readRecipeRequestRoleAttempt(repositoryRoot);
  if (attempt && ["applying_precommit","commit_dispatch_guard"].includes(attempt.record.status)) {
    closedR2Require(attempt.record.operationId===operationId && attempt.record.commitDispatched!==true && attempt.record.readerFloor===review.sourceReaderRef
      && readClosedR2PrivateBytes(join(attempt.record.operationDirectory,"attempt.json"),repositoryRoot,524288).equals(attempt.bytes), "Recipe request-role admission requires exact same-operation precommit guard");
    return previous;
  }
  closedR2Require(isDeepStrictEqual(loadCurrentDatabaseMaintenance(repositoryRoot),previous),"Recipe request-role admission requires exact current231 terminal");
  return previous;
}
export function verifyRecipeRequestRoleWorkerAdmission(review,repositoryRoot,operationId=/** @type {string | undefined} */(undefined)) {
  const previous=verifyRecipeRequestRolePredecessor(review,repositoryRoot);
  const continuation=loadCookedWeightAttestationWorkerContinuation(previous.predecessor,repositoryRoot,{review,operationId}),observed=continuation.observation;
  closedR2Require(continuation.current.state==="activation-committed" && observed.workerPolicyEnabled===true && observed.quantityPolicyEnabled===true
    && observed.ledgerCount===231 && observed.targetSha256===review.database.targetSha256
    && Object.entries(review.database.workerBaseline).every(([key,value])=>isDeepStrictEqual(observed[key],value))
    && isDeepStrictEqual(observed.databaseMaintenance,recipeSaveRecoveryBinding(previous)), "Recipe request-role admission requires exact committed current231 worker");
  return continuation;
}
export function loadRecipeRequestRoleMaintenance(repositoryRoot) {
  const attempt=readRecipeRequestRoleAttempt(repositoryRoot);if (!attempt) return null;
  const {review,record,bytes,paths}=attempt;
  closedR2Require(["committed","not_applied"].includes(record.status),"Recipe request-role outcome unresolved; retain232 fence");
  const pointer={path:join(record.operationDirectory,"receipt.json"),sha256:closedR2Hash(bytes)};
  closedR2Require(readClosedR2PrivateBytes(pointer.path,repositoryRoot,524288).equals(bytes),"Recipe request-role terminal/guard bytes differ");
  if (record.status==="not_applied") return null;
  assertRecipeRequestRoleDatabaseReceipt(review,record);
  const recipeSavePredecessor=verifyRecipeRequestRolePredecessor(review,repositoryRoot);
  return {review,record,pointer,guardPointer:{path:paths.databaseGuardPath,sha256:pointer.sha256},recipeSavePredecessor,
    nutritionPredecessor:recipeSavePredecessor.nutritionPredecessor,predecessor:recipeSavePredecessor.predecessor};
}
export function recipeRequestRolePhaseStatus(attempt,readerCompatible=false) {
  const {review,record}=attempt;assertRecipeRequestRoleReview(review);
  const committed=record.status==="committed",unapplied=record.status==="not_applied";
  if (committed) assertRecipeRequestRoleDatabaseReceipt(review,record);
  return {feature:RECIPE_REQUEST_ROLE_FEATURE,phase:record.status,databasePlanSha256:committed?record.databasePlanSha256:unapplied?closedR2Hash(JSON.stringify({source:review.database.before,applied:review.database.before})):null,
    appliedLedgerCount:committed?232:unapplied?231:null,readerFloor:committed?review.sourceReaderRef:null,readerPending:committed&&!readerCompatible,
    normalDeploymentAllowed:(committed||unapplied)&&readerCompatible,backwardCompatible:false,recordedWriterEnabled:committed?true:null};
}
export function assertRecipeRequestRoleSourceHandoff({maintenance,from,to,live,files,digests,reviewedSourceAncestor}) {
  recipeRequestRoleBinding(maintenance);const file=`supabase/migrations/${RECIPE_REQUEST_ROLE_MIGRATION.filename}`;
  closedR2Require(CLOSED_R2_REF.test(from??"") && CLOSED_R2_REF.test(to??"") && live?.ref===from && reviewedSourceAncestor===true
    && Array.isArray(files) && files.includes(file) && Object.keys(digests??{}).sort().join() === [...files].sort().join()
    && isDeepStrictEqual(digests[file],[null,RECIPE_REQUEST_ROLE_MIGRATION.sha256])
    && files.filter(path=>path.startsWith("supabase/")).every(path=>path===file), "Only the committed exact232 digest and reviewed source ancestry may carry already-applied SQL");
  return true;
}
export function assertRecipeRequestRoleMarker(maintenance,marker,sourceReaderMarker=false) {
  const binding=recipeRequestRoleBinding(maintenance),previous=recipeSaveRecoveryBinding(maintenance.recipeSavePredecessor);
  closedR2Require(marker && isDeepStrictEqual(marker.databaseMaintenance,sourceReaderMarker?previous:binding)
    && marker.databasePlanSha256===maintenance.predecessor.record.databasePlanSha256,"Recipe request-role preserves original231 marker and exact232 maintenance separately");
  return marker;
}

// These are the three fixed committed maintenance anchors, not arbitrary historical state.
export function matchesDatabaseMaintenanceBinding(value,current) {
  if (isDeepStrictEqual(value,current)) return true;
  if (current?.schema === "homecook.recipe-request-role-maintenance.v1" && current.predecessorMaintenance?.schema === "homecook.recipe-save-recovery-maintenance.v1") {
    if (isDeepStrictEqual(value,current.predecessorMaintenance)) return true;
    return current.predecessorMaintenance.predecessorMaintenance?.schema === "homecook.recipe-nutrition-validator-maintenance.v1"
      && isDeepStrictEqual(value,current.predecessorMaintenance.predecessorMaintenance);
  }
  return current?.schema === "homecook.recipe-save-recovery-maintenance.v1"
    && current.predecessorMaintenance?.schema === "homecook.recipe-nutrition-validator-maintenance.v1" && isDeepStrictEqual(value,current.predecessorMaintenance);
}
function maintenanceForWorkerBinding(maintenance,binding) {
  if (!binding) return null;
  for (const candidate of [maintenance,maintenance?.recipeSavePredecessor,maintenance?.nutritionPredecessor]) {
    if (candidate && isDeepStrictEqual(nutritionValidatorMaintenanceBinding(candidate),binding)) return candidate;
  }
  throw new DeploymentError("Worker transition has no exact committed maintenance anchor");
}
