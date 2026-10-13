import { isDeepStrictEqual } from "node:util";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { constants, closeSync, existsSync, fstatSync, lstatSync, openSync, readSync, realpathSync, statfsSync } from "node:fs";
import * as fs from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export class DeploymentError extends Error {}

// No source/receipt is approved yet. CLI and environment cannot supply these pins.
export const CLOSED_R2_REVIEW_PIN = Object.freeze({ path: null, sha256: null });
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
 * @param {{reviewedYoutubeTrialSupport?: boolean, reviewedYoutubeResolutionSupport?: boolean, reviewedIntegratedFiles?: Set<string> | null}} [options]
 */
export function classifyPrelaunchScope(files, before, after, {
  reviewedYoutubeTrialSupport = false,
  reviewedYoutubeResolutionSupport = false,
  reviewedIntegratedFiles = null,
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
      || youtubeResolutionSupport.has(file) || reviewedIntegratedFiles?.has(file)) scope.support.push(file);
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
  /** @type {{ref: string, refOption: string, envFile?: string, dbConfig?: string, dbBaseline?: string, dbCompatible?: boolean, verifyScript?: string, testScript?: string, alreadyAppliedDb?: boolean, skipAutomatedTests?: boolean, reviewedRepairReadiness?: boolean, reviewedBetaReadiness?: boolean, reviewedFeedbackReadiness?: boolean, reviewedAiNutritionReadiness?: boolean, reviewedIngredientSearchReadiness?: boolean, reviewedPieceUnitReadiness?: boolean, reviewedYoutubeTrialReadiness?: boolean, reviewedYoutubeResolutionReadiness?: boolean, reviewedNutritionRecoveryReadiness?: boolean, reviewedIntegratedMasterReadiness?: boolean, reviewedClosedR2Maintenance?: boolean}} */
  const options = { ref: "origin/master", refOption: "--ref" };
  const names = { "--env-file": "envFile", "--db-config": "dbConfig", "--db-baseline": "dbBaseline", "--verify-script": "verifyScript", "--test-script": "testScript" };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
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
