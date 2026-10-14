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

// C04 preparation only. Root binds exact source/evidence after the joined review.
// No CLI/environment replacement and no inheritance of C03/C01 authority.
export const QUANTITY_V4_FEATURE = "ingredient-quantity-v4";
export const QUANTITY_V4_ENVIRONMENT = "MUMEOK_QUANTITY_V4_ENABLED";
export const QUANTITY_V4_RELEASE_SHA = null;
export const QUANTITY_V4_PROTECTION = null;
export const QUANTITY_V4_CONSUMERS_REVIEW_PIN = Object.freeze({ path: null, sha256: null });
export const QUANTITY_V4_WORKER_REVIEW_PIN = Object.freeze({ path: null, sha256: null });
export const QUANTITY_V4_WRITER_REVIEW_PIN = Object.freeze({ path: null, sha256: null });
export const QUANTITY_V4_WORKER_BEFORE_PIN = Object.freeze({ path: null, sha256: null });
export const QUANTITY_V4_WORKER_AFTER_PIN = Object.freeze({ path: null, sha256: null });
export const QUANTITY_V4_WORKER_CONTROL_REVIEW_PIN = Object.freeze({ path: null, sha256: null });
export const QUANTITY_V4_WORKER_OPERATION_ROOT = null;
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

export function quantityV4StageForPhase(phase) {
  if (["database", "database-retry", "reconcile"].includes(phase)) return "consumers";
  if (["worker-database", "worker-database-retry", "worker-reconcile", "reader", "writer-on", "writer-off", "writer-on-reconcile", "writer-off-reconcile", "writer-on-retry", "writer-off-retry"].includes(phase)) return "worker";
  throw new DeploymentError("Unknown exact C04 stage");
}

export function protectedRolloutPins(review) {
  if (review?.feature === QUANTITY_V4_FEATURE) {
    if (!["consumers", "worker"].includes(review.quantityStage)) throw new DeploymentError("Unknown exact C04 stage");
    return { rollout: review.quantityStage === "consumers" ? QUANTITY_V4_CONSUMERS_REVIEW_PIN : QUANTITY_V4_WORKER_REVIEW_PIN, writer: QUANTITY_V4_WRITER_REVIEW_PIN };
  }
  if (review?.feature === COOKED_WEIGHT_FEATURE) return { rollout: COOKED_WEIGHT_ROLLOUT_REVIEW_PIN, writer: COOKED_WEIGHT_WRITER_REVIEW_PIN };
  if (review?.feature === "recipe-product-source") return { rollout: PROTECTED_ROLLOUT_REVIEW_PIN, writer: PROTECTED_WRITER_REVIEW_PIN };
  throw new DeploymentError("Unknown protected feature; no generic rollout authority");
}

export function protectedRolloutPaths(root, review) {
  const prefix = review?.feature === QUANTITY_V4_FEATURE ? `protected-quantity-v4-${review.quantityStage}` : review?.feature === COOKED_WEIGHT_FEATURE ? "protected-cooked-weight" : "protected";
  protectedRolloutPins(review);
  return { databaseGuardPath: join(root, `${prefix}-database-guard.json`), readerReceiptPath: join(root, `${prefix}-reader-ready.json`),
    operationRoot: join(root, `${prefix}-operations`), writerPrefix: `${prefix}-writer` };
}

export function protectedImmutableSha256(review, phase = "after") {
  return [COOKED_WEIGHT_FEATURE, QUANTITY_V4_FEATURE].includes(review?.feature) && phase === "after" ? review.database.afterImmutableSha256 : review.database.immutableSha256;
}

export function protectedReaderFenceSql(review) {
  protectedRolloutPins(review);
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
  closedR2Require(!selector.feature || ["recipe-product-source", COOKED_WEIGHT_FEATURE, QUANTITY_V4_FEATURE].includes(selector.feature), "No arbitrary protected feature selector");
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
  const cookedWeight = review?.feature === COOKED_WEIGHT_FEATURE;
  const quantity = review?.feature === QUANTITY_V4_FEATURE;
  const exactC03Sources = new Set(quantity ? ["scripts/lib/full-local-security-inventory.mjs", "scripts/lib/youtube-extraction-worker-runtime.mjs",
    "scripts/manifests/youtube-extraction-expected-schema.json", "scripts/deploy-prelaunch-web.mjs", "scripts/lib/prelaunch-web-deploy.mjs", "scripts/lib/prelaunch-database.mjs", "eslint.config.mjs"] : cookedWeight ? ["scripts/lib/full-local-security-inventory.mjs"]
    : ["scripts/lib/full-local-security-inventory.mjs", "lib/server/hybrid-auth/public-read-policy-runtime.mjs"]);
  closedR2Require(review?.schema === "homecook.prelaunch-protected-rollout-review.v1" && ["recipe-product-source", COOKED_WEIGHT_FEATURE, QUANTITY_V4_FEATURE].includes(review.feature)
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
 * @param {{reviewedYoutubeTrialSupport?: boolean, reviewedYoutubeResolutionSupport?: boolean, reviewedIntegratedFiles?: Set<string> | null, reviewedProtectedInventorySupport?: boolean}} [options]
 */
export function classifyPrelaunchScope(files, before, after, {
  reviewedYoutubeTrialSupport = false,
  reviewedYoutubeResolutionSupport = false,
  reviewedIntegratedFiles = null,
  reviewedProtectedInventorySupport = false,
} = {}) {
  const scope = { web: [], database: [], support: [], api: [] };
  const support = /^(?:docs\/|tests\/|ui\/|marketing\/|\.github\/|\.agents\/|\.claude\/|\.codex\/|\.opencode\/|\.workflow-v2\/)|^(?:AGENTS|CLAUDE|README)\.md$|^opencode\.json$|^scripts\/(?:(?:lib\/)?marketing-validation-[a-z-]+|ci-path-filter|deploy-prelaunch-web|install-prelaunch-deploy|install-dev-deploy|lib\/dev-deploy-launcher|lib\/prelaunch-[a-z-]+)\.mjs$/u;
  const exactSupport = new Set([
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
      || (reviewedProtectedInventorySupport && file === "scripts/lib/full-local-security-inventory.mjs")) scope.support.push(file);
    else if (web.test(file) || file === "instrumentation.ts") scope.web.push(file);
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
      || options.testScript !== "test:feedback-batch:web" || !["database", "database-retry", "worker-database", "worker-database-retry", "worker-reconcile", "reader", "reconcile", "writer-on", "writer-off", "writer-on-reconcile", "writer-off-reconcile", "writer-on-retry", "writer-off-retry"].includes(options.protectedPhase)
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

export function assertRound2InheritanceBoundaries({ previous, next, files, databaseDeployment = false }) {
  const before = previous.EnvironmentVariables ?? {}, after = next.EnvironmentVariables ?? {};
  // Existing active and closed inheritance share the same protected source/environment boundaries.
  const protectedSources = [
    /^(?:app\/(?:beta|privacy|api\/v1\/marketing|%5F_ops\/r2-preflight)\/|app\/(?:layout\.|globals\.css$)|components\/marketing\/|lib\/(?:marketing[./-]|supabase\/|server\/(?:marketing-|recording-page\.|homeflow-page\.|full-local-auth\/|hybrid-auth\/))|types\/marketing-)/u,
    /^(?:supabase\/|infra\/|scripts\/sql\/|scripts\/(?:start-production\.mjs|lib\/(?:start-production-runtime|production-data-quality|full-local-|marketing-round2)))/u,
    /^(?:middleware\.|proxy\.|next\.config\.|tsconfig\.json$|package\.json$|pnpm-lock\.yaml$|\.env(?:\.|$))/u,
  ];
  if (databaseDeployment || !Array.isArray(files) || files.some(file => protectedSources.some(pattern => pattern.test(file)))) {
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
