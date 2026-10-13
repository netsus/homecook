#!/usr/bin/env node
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import { classifyPrelaunchScope, assertRollbackTarget, assertDatabaseRollbackCompatible, currentDatabaseState, parsePrelaunchArgs, parsePrelaunchOptions, prelaunchVerificationScripts, prelaunchVerificationEnvironment, runPrelaunchVerification, prepareDatabaseDeployment, shouldRequireDatabaseRecovery, prelaunchSourceAncestry, restartLaunchAgent, createCancellation, prelaunchBuildEnvironment, DeploymentError, deployTransaction, productionEnvironment, retargetPlist, retargetRound2Release, inheritRound2Readiness, fetchPrelaunchLanding, prelaunchChangedFiles } from "./lib/prelaunch-web-deploy.mjs";

import { reviewedRepairReadiness } from "./lib/prelaunch-repair-readiness.mjs";
import { reviewedBetaReadiness } from "./lib/prelaunch-beta-readiness.mjs";
import { loadFeedbackReview, reviewedFeedbackReadiness, verifyFeedbackAppliedDatabase } from "./lib/prelaunch-feedback-readiness.mjs";
import { loadAiNutritionReview, reviewedAiNutritionReadiness, verifyAiNutritionAppliedDatabase } from "./lib/prelaunch-ai-nutrition-readiness.mjs";
import { loadNutritionRecoveryReview, reviewedNutritionRecoveryReadiness, verifyNutritionRecoveryAppliedDatabase, nutritionRecoveryDatabaseState } from "./lib/prelaunch-nutrition-recovery-readiness.mjs";
import { loadPieceUnitReview, reviewedPieceUnitReadiness, verifyPieceUnitAppliedDatabase, pieceUnitAppliedDatabaseState, PIECE_UNIT_RECOVERY_MESSAGE } from "./lib/prelaunch-piece-unit-readiness.mjs";
import { loadIngredientSearchReview, reviewedIngredientSearchReadiness, verifyIngredientSearchAppliedDatabase } from "./lib/prelaunch-ingredient-search-readiness.mjs";
import { assertYoutubeTrialSource, loadYoutubeTrialReview, reviewedYoutubeTrialReadiness, verifyYoutubeTrialAppliedDatabase, verifyYoutubeTrialSourceBackfill } from "./lib/prelaunch-youtube-trial-readiness.mjs";
import { loadYoutubeResolutionReview, reviewedYoutubeResolutionReadiness, verifyYoutubeResolutionAppliedDatabase, youtubeResolutionAppliedDatabaseState, youtubeResolutionDatabaseStateFromReview, YOUTUBE_RESOLUTION_RELEASE_SHA, YOUTUBE_RESOLUTION_ROLLBACK_REASON } from "./lib/prelaunch-youtube-resolution-readiness.mjs";
import {
  assertIntegratedMasterDatabaseGuard,
  assertIntegratedMasterDescriptor,
  assertIntegratedMasterWebFirstState,
  integratedMasterAppliedDatabaseState,
  parseIntegratedMasterDescriptor,
  reviewedIntegratedMasterReadiness,
  verifyIntegratedMasterDatabase,
  YOUTUBE_INTEGRATED_DB_GUARD_SCHEMA,
  YOUTUBE_INTEGRATED_RELEASE_DESCRIPTOR,
  YOUTUBE_INTEGRATED_ROLLBACK_REASON,
  YOUTUBE_INTEGRATED_WEB_FIRST_SCHEMA,
} from "./lib/prelaunch-integrated-master-readiness.mjs";

import { applyEnvironmentPatch, readEnvironmentPatch } from "./lib/prelaunch-environment.mjs";
import { createPrelaunchDatabase } from "./lib/prelaunch-database.mjs";
import { durableJson } from "./lib/marketing-round2-controlled-deploy.mjs";
import {
  CLOSED_R2_REVIEW_PIN, acquireClosedR2ControlLease, assertClosedR2CompensationTarget, assertClosedR2ContinuationOptions, assertClosedR2Database, assertClosedR2Environment,
  assertClosedR2LiveMarker, assertClosedR2LiveUnchanged, assertClosedR2MaintenanceFence, assertClosedR2PredecessorState, assertClosedR2Retry, assertClosedR2Rollback, assertRound2InheritanceBoundaries,
  assertClosedR2Source, closedR2RollbackPlist, loadClosedR2Review, verifyClosedR2Collector, readClosedR2PrivateBytes, verifyClosedR2Control, verifyClosedR2HistoricalProofs,
} from "./lib/prelaunch-web-deploy.mjs";

const repository = realpathSync(resolve(process.env.HOMECOOK_DEPLOY_REPOSITORY || resolve(dirname(fileURLToPath(import.meta.url)), "..")));
const root = join(homedir(), ".homecook/prelaunch-web");
const plistPath = join(homedir(), "Library/LaunchAgents/com.homecook.production.plist");
const statePath = join(root, "state.json");
const recoveryPath = join(root, "recovery.json");
const databaseStatePath = join(root, "database-state.json");
const integratedDatabaseGuardPath = join(root, "youtube-integrated-database-guard.json");
const integratedDatabaseOperationRoot = join(homedir(), ".homecook/operations/youtube-integrated-20261013");
const domain = `gui/${process.getuid()}`;
const service = `${domain}/com.homecook.production`;
let logFd;
const cancellation = createCancellation();
const say = (message) => process.stdout.write(`${message}\n`);

function command(bin, args, options = {}) {
  const { trimOutput = true, ...spawnOptions } = options;
  const result = spawnSync(bin, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, ...spawnOptions });
  if (result.status !== 0) throw new DeploymentError(`명령 실패: ${bin === "git" ? "git" : "로컬 배포 도구"}. 비공개 로그를 확인하세요.`);
  const output = result.stdout ?? "";
  return trimOutput ? output.trim() : output;
}
const git = (args, cwd = repository) => command("git", ["-C", cwd, ...args]);
const parsePlist = (bytes) => JSON.parse(command("/usr/bin/plutil", ["-convert", "json", "-o", "-", "--", "-"], { input: bytes }));
const plistBytes = (value) => command("/usr/bin/plutil", ["-convert", "xml1", "-o", "-", "--", "-"], { input: JSON.stringify(value) });
function atomicWrite(path, bytes) {
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, bytes, { mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, path);
}
function durableUnlink(path) {
  unlinkSync(path);
  const parent = openSync(dirname(path), "r");
  try { fsyncSync(parent); } finally { closeSync(parent); }
}
function loadIntegratedDatabaseGuard(expectedReleaseSha, migrationSha256, required = false) {
  if (!existsSync(integratedDatabaseGuardPath)) {
    if (required) throw new DeploymentError("DB219 rollback guard가 없어 적용 상태를 기록할 수 없습니다.");
    return null;
  }
  try {
    const guard = JSON.parse(readFileSync(integratedDatabaseGuardPath, "utf8"));
    if (guard.schema !== YOUTUBE_INTEGRATED_DB_GUARD_SCHEMA) throw new Error();
    const journal = JSON.parse(readFileSync(join(guard.operationDirectory, guard.journalFile), "utf8"));
    return assertIntegratedMasterDatabaseGuard({ guard, journal,
      releaseSha: expectedReleaseSha, migrationSha256, operationRoot: integratedDatabaseOperationRoot });
  } catch (error) {
    if (error instanceof DeploymentError) throw error;
    throw new DeploymentError(`${YOUTUBE_INTEGRATED_ROLLBACK_REASON} rollback guard 검증에 실패했습니다.`);
  }
}
function current() {
  const bytes = readFileSync(plistPath);
  const plist = parsePlist(bytes);
  retargetPlist(plist, plist.WorkingDirectory);
  const cwd = plist.WorkingDirectory;
  return { bytes, plist, cwd, ref: git(["rev-parse", "HEAD"], cwd), buildId: readFileSync(join(cwd, ".next/BUILD_ID"), "utf8").trim() };
}
function assertClean(cwd) {
  if (git(["status", "--porcelain", "--untracked-files=no"], cwd)) {
    throw new DeploymentError("현재 웹 checkout에 수정한 추적 파일이 있어 배포를 중단합니다.");
  }
}
function plan(ref, live, option = "--ref", verifyScript, skipAutomatedTests = false, testScript,
  youtubeTrialReview = null, youtubeResolutionReview = null, integratedMaster = false) {
  assertClean(live.cwd);
  const target = git(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]);
  git(["merge-base", "--is-ancestor", ...prelaunchSourceAncestry(option, ref, live.ref, target)]);
  const files = prelaunchChangedFiles((args) => command("git", ["-C", repository, ...args], { trimOutput: false }), live.ref, target);
  if (youtubeTrialReview) {
    const digests = Object.fromEntries(Object.keys(youtubeTrialReview.files).map(file => [file, [live.ref, target].map(sha =>
      git(["ls-tree", sha, "--", file]).length ? hash(execFileSync("git", ["-C", repository, "show", `${sha}:${file}`],
        { maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] })) : null)]));
    assertYoutubeTrialSource({ review: youtubeTrialReview, liveSha: live.ref, releaseSha: target,
      files, actualFiles: files, digests });
  }
  let integratedReview = null;
  if (integratedMaster) {
    const descriptor = parseIntegratedMasterDescriptor(git(["show", `${target}:${YOUTUBE_INTEGRATED_RELEASE_DESCRIPTOR}`]));
    const readAt = (sha, file) => {
      const resolved = sha === "target" ? target : sha;
      if (!git(["ls-tree", resolved, "--", file])) return null;
      return execFileSync("git", ["-C", repository, "show", `${resolved}:${file}`],
        { maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    };
    integratedReview = assertIntegratedMasterDescriptor({ descriptor, liveSha: live.ref, changedFiles: files,
      readAt, isAncestor: (source) => spawnSync("git", ["-C", repository, "merge-base", "--is-ancestor", source, target]).status === 0 });
  }
  const manifest = (sha) => JSON.parse(git(["show", `${sha}:package.json`]));
  const scope = classifyPrelaunchScope(files, manifest(live.ref), manifest(target),
    { reviewedYoutubeTrialSupport: Boolean(youtubeTrialReview), reviewedYoutubeResolutionSupport: Boolean(youtubeResolutionReview),
      reviewedIntegratedFiles: integratedReview?.reviewedFiles });
  const verificationScripts = prelaunchVerificationScripts(scope, manifest(target), verifyScript, skipAutomatedTests, testScript);
  return { from: live.ref, target, files, scope, verificationScripts, integratedReview };
}
function ownChild(child) {
  const stopped = new Promise((resolvePromise) => {
    child.once("error", () => resolvePromise(null));
    child.once("exit", resolvePromise);
  });
  let stopping;
  const stop = () => stopping ??= (async () => {
    if (child.pid) {
      try { process.kill(-child.pid, "SIGTERM"); } catch { /* Already exited. */ }
      await Promise.race([stopped, delay(5000)]);
      try { process.kill(-child.pid, "SIGKILL"); } catch { /* All owned processes exited. */ }
    }
    await stopped;
  })();
  return { stopped, stop, forget: cancellation.track(stop) };
}
async function logged(bin, args, options) {
  cancellation.check();
  const owned = ownChild(spawn(bin, args, { ...options, detached: true, stdio: ["ignore", logFd, logFd] }));
  try {
    const code = await owned.stopped;
    cancellation.check();
    if (code !== 0) throw new DeploymentError("배포 하위 명령 실패");
  } finally { await owned.stop(); owned.forget(); }
}

async function stageRound2Readiness(plist, release, live, selection, databaseDeployment, options, databasePlan, closedContext) {
  if (options.reviewedClosedR2Maintenance || closedContext) {
    const review = loadClosedR2Review(repository);
    const patch = readEnvironmentPatch(options.envFile, repository);
    if (options.reviewedClosedR2Maintenance) {
      validateClosedR2Candidate(review, live, selection, patch, options, closedContext);
      assertClosedR2Environment({ review, previous: live.plist, next: plist, patch,
        envPatchSha256: hash(readClosedR2PrivateBytes(options.envFile, repository)) });
    } else {
      assertClosedR2ContinuationOptions(options);
      assertRound2InheritanceBoundaries({ previous: live.plist, next: plist, files: selection.files, databaseDeployment });
      if (!isDeepStrictEqual(plist, retargetPlist(live.plist, plist.WorkingDirectory))) throw new DeploymentError("닫힘 승계는 기존 환경과 실행 설정을 유지해야 합니다.");
    }
    assertClosedR2Database(review, databasePlan);
    verifyClosedR2Control(review, repository);
    return plist; // No active readiness copy, new release binding or provider proof.
  }
  const configured = [live.plist, plist].some(value => {
    const env = value.EnvironmentVariables;
    return env?.MUMEOK_ROUND2_ENABLED === "true" || env?.MUMEOK_ROUND2_RELEASE_SHA || env?.MUMEOK_ROUND2_READINESS_PATH || env?.MUMEOK_ROUND2_REPOSITORY_ROOT;
  });
  if (!configured) {
    if (options.reviewedNutritionRecoveryReadiness || options.reviewedFeedbackReadiness || options.reviewedAiNutritionReadiness || options.reviewedIngredientSearchReadiness || options.reviewedPieceUnitReadiness || options.reviewedYoutubeTrialReadiness || options.reviewedYoutubeResolutionReadiness || options.reviewedIntegratedMasterReadiness) throw new DeploymentError("검토한 한정 배포에는 원본 R2 실행 설정이 필요합니다.");
    return plist;
  }
  const source = live.plist.EnvironmentVariables?.MUMEOK_ROUND2_READINESS_PATH;
  if (!source) {
    throw new DeploymentError("R2 readiness 원본이 없는 실행 설정은 승계할 수 없습니다.");
  }
  const original = JSON.parse(readFileSync(source, "utf8"));
  const input = { readiness: original, previous: live.plist, next: plist, liveSha: live.ref, releaseSha: selection.target, files: selection.files, databaseDeployment };
  let readiness;
  if (options.reviewedNutritionRecoveryReadiness) {
    const reviewed = await reviewedNutritionRecoveryReadiness({ ...input, databasePlan, repositoryRoot: plist.WorkingDirectory, configPath: options.dbConfig });
    readiness = reviewed.readiness;
    atomicWrite(join(release, "round2-source-review.json"), JSON.stringify(reviewed.review));
  } else if (options.reviewedPieceUnitReadiness) {
    const reviewed = await reviewedPieceUnitReadiness({ ...input, databasePlan, repositoryRoot: plist.WorkingDirectory, configPath: options.dbConfig });
    readiness = reviewed.readiness;
    atomicWrite(join(release, "round2-piece-unit-source-review.json"), JSON.stringify(reviewed.review, null, 2));
  } else if (options.reviewedIngredientSearchReadiness) {
    const reviewed = await reviewedIngredientSearchReadiness({ ...input, databasePlan, repositoryRoot: plist.WorkingDirectory, configPath: options.dbConfig });
    readiness = reviewed.readiness;
    atomicWrite(join(release, "round2-ingredient-search-source-review.json"), JSON.stringify(reviewed.review, null, 2));
  } else if (options.reviewedYoutubeTrialReadiness) {
    const reviewed = await reviewedYoutubeTrialReadiness({ ...input, databasePlan, repositoryRoot: plist.WorkingDirectory, configPath: options.dbConfig });
    readiness = reviewed.readiness;
    atomicWrite(join(release, "round2-youtube-trial-source-review.json"), JSON.stringify(reviewed.review, null, 2));
  } else if (options.reviewedYoutubeResolutionReadiness) {
    const reviewed = await reviewedYoutubeResolutionReadiness({ ...input, databasePlan, repositoryRoot: plist.WorkingDirectory, configPath: options.dbConfig });
    readiness = reviewed.readiness;
    atomicWrite(join(release, "round2-youtube-resolution-source-review.json"), JSON.stringify(reviewed.review, null, 2));
  } else if (options.reviewedIntegratedMasterReadiness) {
    const reviewed = reviewedIntegratedMasterReadiness({ ...input, review: selection.integratedReview });
    readiness = reviewed.readiness;
    atomicWrite(join(release, "round2-youtube-integrated-master-review.json"), JSON.stringify(reviewed.review.descriptor, null, 2));
  } else if (options.reviewedAiNutritionReadiness) {
    const reviewed = await reviewedAiNutritionReadiness({ ...input, databasePlan, repositoryRoot: plist.WorkingDirectory, configPath: options.dbConfig });
    readiness = reviewed.readiness;
    atomicWrite(join(release, "round2-ai-nutrition-source-review.json"), JSON.stringify(reviewed.review, null, 2));
  } else if (options.reviewedFeedbackReadiness) {
    const reviewed = await reviewedFeedbackReadiness({ ...input, databasePlan, repositoryRoot: plist.WorkingDirectory, configPath: options.dbConfig });
    readiness = reviewed.readiness;
    atomicWrite(join(release, "round2-feedback-source-review.json"), JSON.stringify(reviewed.review, null, 2));
  } else if (options.reviewedBetaReadiness) {
    const reviewed = await reviewedBetaReadiness({ ...input, databasePlan, repositoryRoot: plist.WorkingDirectory, configPath: options.dbConfig });
    readiness = reviewed.readiness;
    atomicWrite(join(release, "round2-beta-source-review.json"), JSON.stringify(reviewed.review, null, 2));
  } else if (options.reviewedRepairReadiness) {
    const reviewed = await reviewedRepairReadiness({ ...input, databasePlan, repositoryRoot: plist.WorkingDirectory, configPath: options.dbConfig });
    readiness = reviewed.readiness;
    atomicWrite(join(release, "round2-source-review.json"), JSON.stringify(reviewed.review, null, 2));
  } else readiness = inheritRound2Readiness(input);
  const staged = join(release, "round2-readiness.json");
  writeFileSync(staged, JSON.stringify(readiness, null, 2), { mode: 0o600 });
  chmodSync(staged, 0o600);
  const directory = statSync(dirname(staged));
  if (!directory.isDirectory() || (directory.mode & 0o777) !== 0o700) {
    throw new DeploymentError("R2 readiness 사본은 비공개 release 디렉터리에 있어야 합니다.");
  }
  return retargetRound2Release(plist, staged, selection.target);
}
function copyEnvironment(source, checkout) {
  for (const relative of [".env.production.local", ".env.local", ".env.production", ".env", "infra/full-local-supabase/.env.production.local"]) {
    const from = join(source, relative);
    if (!existsSync(from)) continue;
    const to = join(checkout, relative);
    mkdirSync(dirname(to), { recursive: true, mode: 0o700 });
    writeFileSync(to, readFileSync(from), { mode: 0o600 });
    chmodSync(to, 0o600);
  }
}
async function freePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolvePromise); });
  const port = server.address().port;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  return port;
}
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const closedR2ArtifactName = "round2-closed-maintenance.json";
function validateClosedR2Candidate(review, live, selection, patch, options, closedContext) {
  const digests = Object.fromEntries(Object.keys(review.files).map(file => [file, [live.ref, selection.target].map(sha =>
    git(["ls-tree", sha, "--", file]).length ? hash(execFileSync("git", ["-C", repository, "show", `${sha}:${file}`],
      { maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] })) : null)]));
  let predecessorBytes = live.bytes;
  if (closedContext) {
    predecessorBytes = readClosedR2PrivateBytes(closedContext.state.backup, repository);
    assertClosedR2Retry({ state: closedContext.state, live: { ...live, plistHash: hash(live.bytes) }, review, originalBytes: predecessorBytes });
  }
  assertClosedR2Source({ review, liveSha: live.ref, releaseSha: selection.target, files: selection.files, digests, predecessorPlistSha256: hash(predecessorBytes), predecessorBuildId: live.buildId });
  if (options.testScript !== review.testScript || selection.scope.database.length || !options.alreadyAppliedDb) {
    throw new DeploymentError("닫힌 R2 유지 배포의 검토한 test/source 범위가 다릅니다.");
  }
  assertClosedR2Environment({ review, previous: live.plist, next: closedR2RollbackPlist(live.plist), patch,
    envPatchSha256: hash(readClosedR2PrivateBytes(options.envFile, repository)) });
}
function requireClosedR2Mode(options, live = current(), rollback = false) {
  const records = [];
  for (const path of [recoveryPath, statePath]) {
    if (!existsSync(path)) continue;
    const state = JSON.parse(readFileSync(path, "utf8"));
    assertClosedR2MaintenanceFence(state, options);
    records.push({ state, recovering: path === recoveryPath });
  }
  const path = join(dirname(live.cwd), closedR2ArtifactName);
  if (!existsSync(path)) {
    if (!rollback && records.some(({ state }) => Object.hasOwn(state, "closedR2"))) throw new DeploymentError("닫힌 R2 state의 실제 릴리스 marker가 없습니다.");
    return null;
  }
  const bytes = readClosedR2PrivateBytes(path, repository);
  const recorded = records.find(({ state }) => state.closedR2?.artifactSha256 === hash(bytes));
  if (!recorded) throw new DeploymentError("실제 닫힌 R2 릴리스 marker에 맞는 state/recovery가 없습니다.");
  assertClosedR2MaintenanceFence(recorded.state, options);
  const review = loadClosedR2Review(repository);
  const marker = JSON.parse(bytes);
  assertClosedR2LiveMarker({ ...recorded, marker, markerSha256: hash(bytes), live: { ...live, plistHash: hash(live.bytes) }, review, reviewSha256: CLOSED_R2_REVIEW_PIN.sha256 });
  if (!isDeepStrictEqual(marker.historicalProofs, verifyClosedR2HistoricalProofs(review, repository))) throw new DeploymentError("닫힌 R2 marker의 원 proof 기록이 다릅니다.");
  if (!rollback && !options.reviewedClosedR2Maintenance) {
    assertClosedR2ContinuationOptions(options);
    git(["merge-base", "--is-ancestor", review.to, live.ref]); // Continuation starts from the reviewed F01 lineage, never a bootstrap predecessor.
  }
  return { ...recorded, marker, markerPath: path, review };
}
async function verifyClosedR2Web(port) {
  await verifyClosedR2Collector(port);
  for (const path of ["/", "/login", "/privacy"]) {
    const page = await fetch(`http://127.0.0.1:${port}${path}`, { redirect: "error", signal: AbortSignal.timeout(2500) });
    if (!page.ok) throw new DeploymentError("닫힌 R2 웹의 공개 핵심 화면을 확인하지 못했습니다.");
  }
  const recording = await fetch(`http://127.0.0.1:${port}/beta/r2/recording`, { redirect: "error", signal: AbortSignal.timeout(2500) });
  if (recording.status !== 404) throw new DeploymentError("닫힌 recording 화면이 404가 아닙니다.");
  const homeflow = await fetch(`http://127.0.0.1:${port}/beta/r2/homeflow`, { redirect: "error", signal: AbortSignal.timeout(2500) });
  if (!homeflow.ok || !(await homeflow.text()).includes("미리 둘러보기 · 입력은 저장되지 않아요")) throw new DeploymentError("homeflow의 저장 없는 공개 화면을 확인하지 못했습니다.");
}
function verifyClosedR2State(state, review) {
  const path = join(dirname(state.checkout), closedR2ArtifactName);
  const bytes = readClosedR2PrivateBytes(path, repository);
  const recorded = { ...state.closedR2 };
  delete recorded.rolledBack;
  delete recorded.artifactSha256;
  if (hash(bytes) !== state.closedR2.artifactSha256 || !isDeepStrictEqual(JSON.parse(bytes), recorded)
    || recorded.reviewSha256 !== CLOSED_R2_REVIEW_PIN.sha256 || recorded.pauseReceiptSha256 !== review.pause.sha256) {
    throw new DeploymentError("닫힌 R2 복구 artifact 결속이 바뀌었습니다.");
  }
  return bytes;
}
async function preserveClosedR2PredecessorMarker(state, review) {
  if (state.closedR2.previousStateSha256) {
    previousClosedR2State(state, review);
    const path = join(dirname(state.previousCwd), closedR2ArtifactName);
    if (hash(readClosedR2PrivateBytes(path, repository)) !== state.closedR2.previousArtifactSha256) throw new DeploymentError("직전 닫힘 릴리스 marker가 바뀌었습니다.");
    return;
  }
  const bytes = verifyClosedR2State(state, review);
  const path = join(dirname(state.previousCwd), closedR2ArtifactName);
  if (!existsSync(path)) await durableJson(path, JSON.parse(bytes), true);
  if (!readClosedR2PrivateBytes(path, repository).equals(bytes)) throw new DeploymentError("이전 릴리스의 닫힌 R2 marker가 다릅니다.");
}
function previousClosedR2State(state, review) {
  const bytes = readClosedR2PrivateBytes(join(dirname(state.checkout), "previous-closed-state.json"), repository, 524288);
  const path = join(dirname(state.previousCwd), closedR2ArtifactName);
  const markerBytes = readClosedR2PrivateBytes(path, repository);
  const plistBytes = readClosedR2PrivateBytes(state.closedR2.kind === "f01-retry" ? join(dirname(state.checkout), "closed-rollback.plist") : state.backup, repository);
  return assertClosedR2PredecessorState({ state, previousBytes: bytes, markerBytes, plist: parsePlist(plistBytes), plistSha256: hash(plistBytes),
    review, reviewSha256: CLOSED_R2_REVIEW_PIN.sha256 });
}
function closedR2RestoredState(state, review) {
  return state.closedR2.previousStateSha256 ? previousClosedR2State(state, review) : { ...state, closedR2: { ...state.closedR2, rolledBack: true } };
}
async function smoke(port, cwd, buildId, recovering = false) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u.test(buildId)) throw new DeploymentError("잘못된 Next.js 빌드 ID");
  const manifestPath = `/_next/static/${buildId}/_buildManifest.js`;
  const expected = hash(readFileSync(join(cwd, ".next/static", buildId, "_buildManifest.js")));
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (!recovering) cancellation.check();
    try {
      const origin = `http://127.0.0.1:${port}`;
      const get = (path) => fetch(`${origin}${path}`, { redirect: "error", signal: AbortSignal.timeout(2500) });
      const page = await fetchPrelaunchLanding(origin);
      if (!page.ok) throw new Error();
      const html = await page.text();
      const manifest = await get(manifestPath);
      if (!manifest.ok || hash(Buffer.from(await manifest.arrayBuffer())) !== expected) throw new Error();
      const asset = html.match(/(?:src|href)="(\/_next\/static\/[^"?]+\.(?:js|css))(?:\?[^" ]*)?"/u)?.[1];
      if (!asset || !(await get(asset)).ok) throw new Error();
      if (!recovering) cancellation.check();
      return;
    } catch { await delay(500); }
  }
  throw new DeploymentError("웹 GET 확인 실패 (/beta·빌드 ID·정적 파일)");
}
async function preview(plist, checkout, buildId, closedR2 = false) {
  const port = await freePort();
  cancellation.check();
  const child = spawn(plist.ProgramArguments[0], [join(checkout, "scripts/start-production.mjs"), "-H", "127.0.0.1", "-p", String(port)], {
    cwd: checkout, env: productionEnvironment(plist), detached: true, stdio: ["ignore", logFd, logFd],
  });
  const owned = ownChild(child);
  try { await smoke(port, checkout, buildId); if (closedR2) await verifyClosedR2Web(port); } finally { await owned.stop(); owned.forget(); }

}
async function switchWeb(bytes) {
  await restartLaunchAgent({
    isLoaded: async () => spawnSync("/bin/launchctl", ["print", service], { stdio: "ignore" }).status === 0,
    bootout: async () => { command("/bin/launchctl", ["bootout", service], { stdio: ["ignore", logFd, logFd] }); },
    writePlist: async () => { atomicWrite(plistPath, bytes); },
    bootstrap: async () => spawnSync("/bin/launchctl", ["bootstrap", domain, plistPath], { stdio: ["ignore", logFd, logFd] }).status,
    wait: delay,
  });
}
async function verifyAppliedDatabase(options, checkout) {
  if (options.reviewedNutritionRecoveryReadiness) return verifyNutritionRecoveryAppliedDatabase({ repositoryRoot: checkout, configPath: options.dbConfig, releaseSha: options.ref });
  if (options.reviewedPieceUnitReadiness) {
    return verifyPieceUnitAppliedDatabase({ repositoryRoot: checkout, configPath: options.dbConfig, releaseSha: options.ref });
  }
  if (options.reviewedIngredientSearchReadiness) {
    return verifyIngredientSearchAppliedDatabase({ repositoryRoot: checkout, configPath: options.dbConfig, releaseSha: options.ref });
  }
  if (options.reviewedYoutubeTrialReadiness) {
    return verifyYoutubeTrialAppliedDatabase({ repositoryRoot: checkout, configPath: options.dbConfig, releaseSha: options.ref });
  }
  if (options.reviewedYoutubeResolutionReadiness) {
    return verifyYoutubeResolutionAppliedDatabase({ repositoryRoot: checkout, configPath: options.dbConfig, releaseSha: options.ref });
  }
  if (options.reviewedAiNutritionReadiness) {
    return verifyAiNutritionAppliedDatabase({ repositoryRoot: checkout, configPath: options.dbConfig, releaseSha: options.ref });
  }
  if (options.reviewedFeedbackReadiness) {
    return verifyFeedbackAppliedDatabase({ repositoryRoot: checkout, configPath: options.dbConfig, releaseSha: options.ref });
  }
  const database = createPrelaunchDatabase({ repositoryRoot: checkout, configPath: options.dbConfig, checkCancelled: () => cancellation.check() });
  try {
    const verified = await database.verify();
    if (verified.baselineRequired || verified.pending.length) throw new DeploymentError("이미 적용된 DB만 허용합니다. SQL은 실행하지 않았습니다.");
    return verified;
  } finally { await database.close(); }
}

async function deploy(options) {
  const live = current();
  const closedContext = requireClosedR2Mode(options, live);
  const closedReview = options.reviewedClosedR2Maintenance ? loadClosedR2Review(repository) : closedContext?.review;
  const nutritionRecoveryReview = options.reviewedNutritionRecoveryReadiness ? await loadNutritionRecoveryReview() : null;
  if (options.reviewedPieceUnitReadiness) await loadPieceUnitReview();
  if (options.reviewedIngredientSearchReadiness) await loadIngredientSearchReview();
  const youtubeTrialReview = options.reviewedYoutubeTrialReadiness ? await loadYoutubeTrialReview() : null;
  if (youtubeTrialReview) await verifyYoutubeTrialSourceBackfill({ review: youtubeTrialReview, repositoryRoot: repository });
  const youtubeResolutionReview = options.reviewedYoutubeResolutionReadiness ? await loadYoutubeResolutionReview() : null;
  if (options.reviewedAiNutritionReadiness) await loadAiNutritionReview();
  if (options.reviewedFeedbackReadiness) await loadFeedbackReview();
  if (existsSync(recoveryPath)) throw new DeploymentError("이전 배포 복구가 남아 있습니다. status와 rollback을 먼저 실행하세요.");
  const selection = plan(options.ref, live, options.refOption, options.verifyScript, options.skipAutomatedTests, options.testScript, youtubeTrialReview, youtubeResolutionReview, options.reviewedIntegratedMasterReadiness);
  const patch = readEnvironmentPatch(options.envFile, repository);
  if (options.reviewedClosedR2Maintenance) {
    validateClosedR2Candidate(closedReview, live, selection, patch, options, closedContext);
    verifyClosedR2Control(closedReview, repository);
  }
  if (closedReview && selection.scope.database.length) throw new DeploymentError("닫힘 유지/승계에 SQL source 변경은 허용하지 않습니다.");
  const needsDatabase = selection.scope.database.length > 0 || Boolean(options.dbConfig);
  if (needsDatabase && !options.dbConfig) throw new DeploymentError("DB 변경이 포함되어 있습니다. --db-config <비공개 full-local 설정 파일>을 지정하세요. 웹은 변경하지 않았습니다.");
  if (needsDatabase && !options.alreadyAppliedDb && !options.dbCompatible
    && !options.reviewedIntegratedMasterReadiness) {
    throw new DeploymentError("DB 변경은 이전 웹과의 호환성 확인 후 --db-compatible을 지정해야 합니다. 호환되지 않는 변경은 별도 배포 절차를 사용하세요.");
  }
  const release = mkdtempSync(join(root, "releases/", `${selection.target.slice(0, 12)}-`));
  const checkout = join(release, "checkout");
  const backup = join(release, "previous.plist");
  const closedRollbackPath = join(release, "closed-rollback.plist");
  const originalBackupBytes = options.reviewedClosedR2Maintenance && closedContext ? readClosedR2PrivateBytes(closedContext.state.backup, repository) : live.bytes;
  const closedRollbackBytes = closedReview ? closedContext ? live.bytes : plistBytes(closedR2RollbackPlist(live.plist)) : null;
  let closedLease;
  let buildId;
  let state;
  let nextPlist;
  let nextBytes;
  let nutritionRecoveryDatabase;
  let pieceUnitDatabase;
  let youtubeResolutionDatabase;
  say(`웹 준비: ${selection.from.slice(0, 12)} → ${selection.target.slice(0, 12)}`);
  try { await deployTransaction({
    prepare: async () => {
      await logged("git", ["-C", repository, "worktree", "add", "--detach", checkout, selection.target], {});
      copyEnvironment(live.cwd, checkout);
      nextPlist = retargetPlist(applyEnvironmentPatch(checkout, live.plist, patch), checkout);
      const readinessPlist = nextPlist;
      const databasePlan = options.reviewedIntegratedMasterReadiness
        ? await verifyIntegratedMasterDatabase({ repositoryRoot: checkout, configPath: options.dbConfig,
          backupDirectory: root, releaseSha: selection.target,
          descriptor: selection.integratedReview.descriptor, phase: "predecessor" })
        : options.alreadyAppliedDb ? await verifyAppliedDatabase(options, checkout) : null;
      nextPlist = await stageRound2Readiness(nextPlist, release, live, selection,
        needsDatabase && !options.alreadyAppliedDb && !options.reviewedIntegratedMasterReadiness,
        options, databasePlan, closedContext);
      nextBytes = plistBytes(nextPlist);
      if (nutritionRecoveryReview) {
        const priorDatabase = existsSync(databaseStatePath) ? JSON.parse(readFileSync(databaseStatePath, "utf8")) : null;
        nutritionRecoveryDatabase = nutritionRecoveryDatabaseState(priorDatabase, databasePlan, nutritionRecoveryReview);
      }
      if (options.reviewedPieceUnitReadiness) {
        pieceUnitDatabase = pieceUnitAppliedDatabaseState(databasePlan);
        atomicWrite(backup, live.bytes);
        state = { backup, previousCwd: live.cwd, previousBuildId: live.buildId, previousPlistHash: hash(live.bytes), checkout, ref: selection.target, buildId: null, targetPlistHash: hash(nextBytes), databaseVerification: databasePlan, database: pieceUnitDatabase };
        atomicWrite(databaseStatePath, JSON.stringify(pieceUnitDatabase));
        // A failed build must allow a forward retry. Do not create recovery.json
        // until the complete new web is ready to activate. Existing rollback
        // records still need the separately applied incompatible DB boundary.
        if (existsSync(statePath)) {
          const previousState = JSON.parse(readFileSync(statePath, "utf8"));
          atomicWrite(statePath, JSON.stringify({ ...previousState, database: pieceUnitDatabase }));
        }
      }
      if (options.reviewedYoutubeResolutionReadiness) {
        youtubeResolutionDatabase = youtubeResolutionAppliedDatabaseState(databasePlan, youtubeResolutionReview);
        atomicWrite(backup, live.bytes);
        state = { backup, previousCwd: live.cwd, previousBuildId: live.buildId, previousPlistHash: hash(live.bytes), checkout, ref: selection.target, buildId: null, targetPlistHash: hash(nextBytes), databaseVerification: databasePlan, database: youtubeResolutionDatabase };
        atomicWrite(databaseStatePath, JSON.stringify(youtubeResolutionDatabase));
        if (existsSync(statePath)) {
          const previousState = JSON.parse(readFileSync(statePath, "utf8"));
          atomicWrite(statePath, JSON.stringify({ ...previousState, database: youtubeResolutionDatabase }));
        }
      }
      const buildOptions = { cwd: checkout, env: prelaunchBuildEnvironment(nextPlist, basename(release)) };
      if (options.skipAutomatedTests) say("사용자 요청: 자동 테스트 생략 (빌드·실제 웹 GET 확인은 수행)");
      say("의존성 설치 및 웹 빌드 중 (비공개 로그에 기록)");
      await logged("pnpm", ["install", "--frozen-lockfile", "--prod=false", "--ignore-scripts"], buildOptions);
      await runPrelaunchVerification({ scripts: selection.verificationScripts, run: async (script) => {
        say(`웹 교체 전 검증: ${script}`);
        await logged("pnpm", ["run", script], { ...buildOptions, env: prelaunchVerificationEnvironment(script, buildOptions.env) });
      } });
      // Load the same external full-local app secrets as production before Next's build.
      // Execute Next directly: package prebuild/postbuild hooks are not deployment steps.
      const buildScript = `import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { prepareStartProductionRuntimeEnv } from './scripts/lib/start-production-runtime.mjs';
const env = prepareStartProductionRuntimeEnv({ repositoryRoot: process.cwd() });
const require = createRequire(import.meta.url);
const result = spawnSync(process.execPath, [require.resolve('next/dist/bin/next'), 'build'], { env, stdio: 'inherit' });
process.exit(result.status ?? 1);`;
      await logged(live.plist.ProgramArguments[0], ["--input-type=module", "-e", buildScript], buildOptions);
      buildId = readFileSync(join(checkout, ".next/BUILD_ID"), "utf8").trim();
      if (buildId !== buildOptions.env.HOMECOOK_RELEASE_BUILD_ID) throw new DeploymentError("새 웹의 고유 빌드 ID가 일치하지 않습니다.");
      atomicWrite(backup, originalBackupBytes);
      if (closedReview) atomicWrite(closedRollbackPath, closedRollbackBytes);
      const reviewedDatabase = nutritionRecoveryDatabase ?? pieceUnitDatabase ?? youtubeResolutionDatabase;
      state = { backup, previousCwd: live.cwd, previousBuildId: live.buildId, previousPlistHash: hash(originalBackupBytes), checkout, ref: selection.target, buildId, targetPlistHash: hash(nextBytes), environmentKeys: Object.keys(patch).sort(), automatedTests: options.skipAutomatedTests ? "skipped_by_explicit_request" : "default", primaryTestScript: options.testScript ?? null, verificationScripts: selection.verificationScripts, databaseVerification: databasePlan,
        ...(options.reviewedIntegratedMasterReadiness ? { integratedMasterWebFirst: {
          schema: YOUTUBE_INTEGRATED_WEB_FIRST_SCHEMA,
          releaseSha: selection.target,
          buildId,
          databasePhase: "predecessor",
          migrationSha256: selection.integratedReview.descriptor.database.migration.sha256,
        } } : {}),
        ...(reviewedDatabase ? { database: reviewedDatabase } : {}) };
      if (closedReview) {
        let previousStateSha256;
        if (closedContext) {
          const previousStatePath = join(release, "previous-closed-state.json");
          await durableJson(previousStatePath, closedContext.state, true);
          previousStateSha256 = hash(readClosedR2PrivateBytes(previousStatePath, repository, 524288));
        }
        const closedR2 = { schema: "homecook.prelaunch-closed-r2-state.v1", activationAuthorized: false,
          kind: options.reviewedClosedR2Maintenance ? closedContext ? "f01-retry" : "f01" : "continuation",
          from: live.ref, to: selection.target, buildId, reviewSha256: CLOSED_R2_REVIEW_PIN.sha256,
          checkout, previousCwd: live.cwd, previousBuildId: live.buildId, previousPlistSha256: hash(originalBackupBytes), targetPlistSha256: hash(nextBytes),
          ...(closedContext ? { previousStateSha256, previousArtifactSha256: closedContext.state.closedR2.artifactSha256 } : {}),
          pauseReceiptSha256: closedReview.pause.sha256, controlSha256: closedReview.controlSha256,
          databasePlanSha256: closedReview.databasePlanSha256,
          historicalReadinessSha256: closedReview.historicalReadiness.sha256, historicalProofs: verifyClosedR2HistoricalProofs(closedReview, repository),
          consentGeneration: closedReview.consentGeneration, rollbackPlistSha256: hash(closedRollbackBytes) };
        const artifactPath = join(release, closedR2ArtifactName);
        await durableJson(artifactPath, closedR2, true);
        state.closedR2 = { ...closedR2, artifactSha256: hash(readClosedR2PrivateBytes(artifactPath, repository)) };
      }
      if (needsDatabase && !options.alreadyAppliedDb && !options.reviewedIntegratedMasterReadiness) {
        say("DB 변경 검사 및 격리된 데이터베이스 검증 중");
        const database = await prepareDatabaseDeployment({
          required: true, compatibilityConfirmed: options.dbCompatible,
          open: () => createPrelaunchDatabase({ repositoryRoot: checkout, configPath: options.dbConfig, baselinePath: options.dbBaseline, backupRoot: join(release, "db-backup"), logFd, checkCancelled: () => cancellation.check() }),
          gate: async () => { await logged("pnpm", ["verify:local-supabase-runtime:isolated"], buildOptions); cancellation.check(); },
          onApplied: async (database) => {
            state.database = database;
            atomicWrite(databaseStatePath, JSON.stringify(database));
            if (shouldRequireDatabaseRecovery(database)) atomicWrite(recoveryPath, JSON.stringify(state));
          },
        });
        state.database = database;
        atomicWrite(recoveryPath, JSON.stringify(state));
      }
      say("별도 로컬 포트에서 새 웹 확인 중");
      await preview(nextPlist, checkout, buildId, Boolean(closedReview));
      cancellation.check();
      if (options.alreadyAppliedDb) {
        const finalPlan = await verifyAppliedDatabase(options, checkout);
        if (JSON.stringify(finalPlan) !== JSON.stringify(databasePlan)) throw new DeploymentError("준비 중 DB 이력이 바뀌었습니다.");
        if (closedReview) assertClosedR2Database(closedReview, finalPlan);
      }
      if (options.reviewedIntegratedMasterReadiness) {
        const finalPlan = await verifyIntegratedMasterDatabase({ repositoryRoot: checkout,
          configPath: options.dbConfig, backupDirectory: root, releaseSha: selection.target,
          descriptor: selection.integratedReview.descriptor, phase: "predecessor" });
        if (JSON.stringify(finalPlan) !== JSON.stringify(databasePlan)) {
          throw new DeploymentError("웹 준비 중 통합 DB 선행 상태가 바뀌었습니다.");
        }
      }
      if (options.reviewedYoutubeTrialReadiness || options.reviewedYoutubeResolutionReadiness || options.reviewedIntegratedMasterReadiness) await stageRound2Readiness(readinessPlist, release, live, selection, false, options, databasePlan);
      else if (options.reviewedNutritionRecoveryReadiness || options.reviewedRepairReadiness || options.reviewedBetaReadiness || options.reviewedFeedbackReadiness || options.reviewedAiNutritionReadiness || options.reviewedIngredientSearchReadiness || options.reviewedPieceUnitReadiness) await stageRound2Readiness(readinessPlist, release, live, selection, false, options, databasePlan);
      assertClean(live.cwd);
      if (!readFileSync(plistPath).equals(live.bytes)) throw new DeploymentError("준비 중 웹 설정이 바뀌었습니다.");
      if (closedReview) {
        const actualLive = current();
        assertClosedR2LiveUnchanged(live, actualLive);
        requireClosedR2Mode(options, actualLive);
        if (options.reviewedClosedR2Maintenance) validateClosedR2Candidate(closedReview, live, selection, patch, options, closedContext);
        else await stageRound2Readiness(nextPlist, release, live, selection, false, options, databasePlan, closedContext);
        closedLease = await acquireClosedR2ControlLease(closedReview, repository);
        closedLease.verify();
      }
      atomicWrite(recoveryPath, JSON.stringify(state));
    },
    restoreProhibitedReason: options.reviewedPieceUnitReadiness ? PIECE_UNIT_RECOVERY_MESSAGE
      : options.reviewedYoutubeResolutionReadiness ? YOUTUBE_RESOLUTION_ROLLBACK_REASON : undefined,
    activate: async () => { if (closedLease) { closedLease.verify(); assertClosedR2LiveUnchanged(live, current()); } say("웹 프로세스 교체 중"); await switchWeb(nextBytes); },
    verify: async () => { await smoke(3100, checkout, buildId); if (closedLease) { await verifyClosedR2Web(3100); closedLease.verify(); } },
    restore: async () => {
      if (closedLease) {
        closedLease.verify();
        assertClosedR2CompensationTarget({ actual: current(), before: live,
          target: { ref: state.ref, cwd: state.checkout, buildId: state.buildId, plistSha256: state.targetPlistHash }, closedPreviousPlistSha256: hash(closedRollbackBytes) });
        await preserveClosedR2PredecessorMarker(state, closedReview);
      }
      await switchWeb(closedRollbackBytes ?? live.bytes);
    },
    verifyRestored: async () => {
      await smoke(3100, live.cwd, live.buildId, true);
      if (closedLease) { await verifyClosedR2Web(3100); closedLease.verify(); atomicWrite(statePath, JSON.stringify(closedR2RestoredState(state, closedReview))); }
      unlinkSync(recoveryPath);
    },
  });
  atomicWrite(statePath, JSON.stringify(state));
  if (options.reviewedNutritionRecoveryReadiness || options.reviewedPieceUnitReadiness || options.reviewedYoutubeResolutionReadiness) atomicWrite(databaseStatePath, JSON.stringify(state.database));
  unlinkSync(recoveryPath);
  say(`웹 배포 완료: ${selection.target}\n빌드 ID: ${buildId}`);
  if (state.database) say("DB 변경 기록과 백업은 비공개 배포 폴더에 보관했습니다. 웹 rollback은 DB를 되돌리지 않습니다.");
  } finally { if (closedLease) await closedLease.release(); }
}
async function rollback() {
  const recovering = existsSync(recoveryPath);
  const record = recovering ? recoveryPath : statePath;
  if (!existsSync(record)) throw new DeploymentError("저장된 이전 웹 배포가 없습니다.");
  const state = JSON.parse(readFileSync(record, "utf8"));
  if (existsSync(integratedDatabaseGuardPath)) {
    let descriptor;
    try {
      descriptor = parseIntegratedMasterDescriptor(
        readFileSync(join(state.checkout, YOUTUBE_INTEGRATED_RELEASE_DESCRIPTOR)),
      );
      loadIntegratedDatabaseGuard(state.ref, descriptor.database.migration.sha256, true);
    } catch (error) {
      if (error instanceof DeploymentError && error.message === YOUTUBE_INTEGRATED_ROLLBACK_REASON) throw error;
      throw new DeploymentError(`${YOUTUBE_INTEGRATED_ROLLBACK_REASON} guard 또는 journal 검증이 필요합니다.`);
    }
    throw new DeploymentError(YOUTUBE_INTEGRATED_ROLLBACK_REASON);
  }
  const recordedDatabase = existsSync(databaseStatePath) ? JSON.parse(readFileSync(databaseStatePath, "utf8")) : null;
  const database = assertDatabaseRollbackCompatible(state.database, recordedDatabase);
  const live = current();
  requireClosedR2Mode({ reviewedClosedR2Maintenance: true }, live, true);
  const closedReview = state.closedR2 ? loadClosedR2Review(repository) : null;
  const original = closedReview ? readClosedR2PrivateBytes(state.backup, repository) : null;
  const previous = closedReview ? readClosedR2PrivateBytes(join(dirname(state.checkout), "closed-rollback.plist"), repository) : readFileSync(state.backup);
  const plist = parsePlist(previous);
  if (closedReview) {
    if (state.closedR2.rolledBack) throw new DeploymentError("닫힌 predecessor로 이미 복구한 기록입니다.");
    verifyClosedR2State(state, closedReview);
    const predecessor = parsePlist(original);
    assertClean(predecessor.WorkingDirectory);
    if (git(["rev-parse", "HEAD"], predecessor.WorkingDirectory) !== state.closedR2.from
      || readFileSync(join(predecessor.WorkingDirectory, ".next/BUILD_ID"), "utf8").trim() !== state.previousBuildId) {
      throw new DeploymentError("복구 predecessor source/build가 바뀌었습니다.");
    }
    assertClosedR2Rollback({ state, live: { ...live, plistHash: hash(live.bytes) }, originalBytes: original, rollbackBytes: previous,
      originalPlist: parsePlist(original), rollbackPlist: plist, review: closedReview, recovering });
    if (state.closedR2.previousStateSha256) previousClosedR2State(state, closedReview);
  } else assertRollbackTarget({ ...live, plistHash: hash(live.bytes) }, state, recovering);
  retargetPlist(plist, plist.WorkingDirectory);
  let closedLease;
  try { await deployTransaction({
    prepare: async () => {
      await preview(plist, plist.WorkingDirectory, state.previousBuildId, Boolean(closedReview));
      cancellation.check();
      if (!readFileSync(plistPath).equals(live.bytes)) throw new DeploymentError("확인 중 웹 설정이 바뀌었습니다.");
      if (closedReview) {
        const actualLive = current();
        assertClosedR2LiveUnchanged(live, actualLive);
        requireClosedR2Mode({ reviewedClosedR2Maintenance: true }, actualLive, true);
        closedLease = await acquireClosedR2ControlLease(closedReview, repository);
      }
    },
    activate: async () => {
      if (closedLease) { closedLease.verify(); assertClosedR2LiveUnchanged(live, current()); await preserveClosedR2PredecessorMarker(state, closedReview); }
      await switchWeb(previous);
    },
    verify: async () => { await smoke(3100, plist.WorkingDirectory, state.previousBuildId); if (closedLease) { await verifyClosedR2Web(3100); closedLease.verify(); } },
    restore: async () => {
      if (closedLease) {
        closedLease.verify();
        assertClosedR2CompensationTarget({ actual: current(), before: live,
          target: { ref: state.closedR2.from, cwd: state.previousCwd, buildId: state.previousBuildId, plistSha256: hash(previous) },
          closedPreviousPlistSha256: hash(plistBytes(closedR2RollbackPlist(live.plist))) });
        if (live.ref === state.closedR2.from) await preserveClosedR2PredecessorMarker(state, closedReview);
      }
      await switchWeb(closedReview ? plistBytes(closedR2RollbackPlist(live.plist)) : live.bytes);
    },
    verifyRestored: async () => {
      await smoke(3100, live.cwd, live.buildId, true);
      if (closedLease) {
        await verifyClosedR2Web(3100); closedLease.verify();
        if (live.ref === state.closedR2.from) atomicWrite(statePath, JSON.stringify(closedR2RestoredState(state, closedReview)));
      }
    },
  });
  if (closedReview) atomicWrite(statePath, JSON.stringify(closedR2RestoredState(state, closedReview)));
  if (record !== statePath || !closedReview) unlinkSync(record);
  // A recovery may supersede an older successful record; do not offer it as current rollback.
  if (recovering && existsSync(statePath) && !closedReview) unlinkSync(statePath);
  say(`이전 웹 복구 완료: ${git(["rev-parse", "HEAD"], plist.WorkingDirectory)}`);
  if (database) say("DB 구조와 데이터는 유지했습니다. 웹만 이전 버전으로 복구했습니다.");
  } finally { if (closedLease) await closedLease.release(); }
}
async function recordYoutubeResolutionDatabase(options) {
  if (existsSync(recoveryPath)) throw new DeploymentError("복구가 진행 중일 때 DB 상태 메타데이터를 갱신할 수 없습니다.");
  const live = current();
  if (live.ref !== YOUTUBE_RESOLUTION_RELEASE_SHA) throw new DeploymentError("현재 웹이 검토한 YouTube 재료 연결 release가 아닙니다.");
  const review = await loadYoutubeResolutionReview();
  const databasePlan = await verifyYoutubeResolutionAppliedDatabase({ repositoryRoot: live.cwd,
    configPath: options.dbConfig, releaseSha: live.ref });
  const database = currentDatabaseState({ currentRef: live.ref, reviewedReleaseSha: YOUTUBE_RESOLUTION_RELEASE_SHA,
    reviewedDatabase: youtubeResolutionAppliedDatabaseState(databasePlan, review),
    recordedDatabase: existsSync(databaseStatePath) ? JSON.parse(readFileSync(databaseStatePath, "utf8")) : null });
  atomicWrite(databaseStatePath, JSON.stringify(database));
  if (existsSync(statePath)) {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    atomicWrite(statePath, JSON.stringify({ ...state, database }));
  }
  say(JSON.stringify({ recorded: true, database }, null, 2));
}

async function recordIntegratedMasterDatabase(options) {
  if (existsSync(recoveryPath)) {
    throw new DeploymentError("복구가 진행 중일 때 통합 DB 상태를 기록할 수 없습니다.");
  }
  const live = current();
  const descriptor = parseIntegratedMasterDescriptor(
    readFileSync(join(live.cwd, YOUTUBE_INTEGRATED_RELEASE_DESCRIPTOR)),
  );
  const databasePlan = await verifyIntegratedMasterDatabase({ repositoryRoot: live.cwd,
    configPath: options.dbConfig, backupDirectory: root, releaseSha: live.ref,
    descriptor, phase: "applied" });
  const database = integratedMasterAppliedDatabaseState(databasePlan, descriptor, live.ref);
  if (!existsSync(statePath)) {
    throw new DeploymentError("통합 웹 선배포 상태가 없어 DB219 상태를 연결할 수 없습니다.");
  }
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  assertIntegratedMasterWebFirstState({ state, live, releaseSha: live.ref, descriptor });
  loadIntegratedDatabaseGuard(live.ref, descriptor.database.migration.sha256, true);
  await durableJson(databaseStatePath, database);
  await durableJson(statePath, { ...state, databaseVerification: databasePlan, database });
  durableUnlink(integratedDatabaseGuardPath);
  say(JSON.stringify({ recorded: true, database }, null, 2));
}
async function main() {
  const { action, args } = parsePrelaunchArgs(process.argv.slice(2));
  if (action === "help" || action === "--help") {
    say("--reviewed-r2-closed-maintenance: exact F01·중지 receipt·두 false flag·closed rollback 검토 경로. 고정된 검토 핀과 정확히 일치해야 실행할 수 있습니다.");
    say("추가 옵션: --reviewed-integrated-master-readiness (검토한 운영 f970→origin/master 전체 파일·DB218 선행 상태·R2 승계 웹 선배포), --reviewed-nutrition-recovery-readiness (검토한 영양 복구·215→216 DB·기존 worker와 R2 보존), --skip-automated-tests (명시적 테스트 생략), --already-applied-db (checksum 이력만 대조), --reviewed-repair-readiness (20260918 복구본의 한정된 R2 재검증), --reviewed-beta-readiness (20260922 베타 후보의 한정된 R2 재검증), --reviewed-feedback-readiness (검토한 exact 피드백 후보·고정 DB 이력·R2 경계 재검증), --reviewed-ai-nutrition-readiness (검토한 AI 후보·204→207개 DB 이력·비활성 worker·R2 경계 재검증), --reviewed-ingredient-search-readiness (검토한 재료 검색 후보·211→212개 DB 이력·익명/worker 권한 보존), --reviewed-piece-unit-readiness (검토한 개수 단위 후보·212→213개 DB 이력·기존 권한·과거 영양 보존), --reviewed-youtube-resolution-readiness (검토한 YouTube 재료 연결 후보·213→215 DB·동일 v63 runtime)\n출시 전 웹/API/환경/추가형 DB 빠른 배포\nplan | deploy [--ref <커밋, 기본 origin/master>] [--env-file <비공개 dotenv>] [--db-config <비공개 full-local 설정>] [--db-baseline <비공개 JSON>] [--db-compatible] [--test-script <package.json test 명령>] [--verify-script <추가 검증 명령>]\nstatus | record-youtube-resolution-database --db-config <비공개 full-local 설정> | record-integrated-master-database --db-config <비공개 full-local 설정> | rollback\nplan은 변경 파일과 환경 키 이름만 표시합니다. deploy는 설치·빌드·확인 후 웹을 교체합니다.\nrecord-youtube-resolution-database와 record-integrated-master-database는 해당 DB 상태를 읽기 전용으로 검증하고 로컬 배포 상태 메타데이터만 갱신합니다.\n환경 파일은 Git 저장소 밖 0600 권한이어야 합니다. 키 값은 명령 인수에 넣지 마세요.\nAPI 변경은 기본 test:product를 실행하며 --test-script로 관련 test 명령을 선택하고 --verify-script로 추가 검증을 지정할 수 있습니다.\nDB 변경은 격리 검증·백업·트랜잭션으로 반영하며, 웹 rollback으로 DB를 되돌리지 않습니다. 통합 배포는 새 웹을 먼저 올린 뒤 DB219를 별도 통제 경로로 적용하고 상태를 기록합니다.\n검토한 긴급 수정은 --ref 대신 --reviewed-ref <현재 웹 후속 커밋 40자리 SHA>를 사용합니다.");
    return;
  }
  if (process.platform !== "darwin") throw new DeploymentError("macOS 웹 서버에서 실행해야 합니다.");
  if (!["plan", "deploy", "status", "record-youtube-resolution-database", "record-integrated-master-database", "rollback"].includes(action)
    || (["status", "rollback"].includes(action) && args.length)
    || (["record-youtube-resolution-database", "record-integrated-master-database"].includes(action)
      && (args.length !== 2 || args[0] !== "--db-config"))) throw new DeploymentError("잘못된 명령입니다. --help를 확인하세요.");
  const options = parsePrelaunchOptions(args);
  if (options.reviewedClosedR2Maintenance) loadClosedR2Review(repository); // Fail before live/env access while the pin is empty.
  if (git(["rev-parse", "--show-toplevel"]) !== repository || !/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)netsus\/homecook(?:\.git)?$/u.test(git(["remote", "get-url", "origin"]))) throw new DeploymentError("배포 저장소는 netsus/homecook Git 저장소여야 합니다.");
  if (action === "status") {
    const { cwd, ref, buildId } = current();
    const loaded = spawnSync("/bin/launchctl", ["print", service], { stdio: "ignore" }).status === 0;
    const record = existsSync(recoveryPath) ? recoveryPath : statePath;
    const recordedDatabase = existsSync(databaseStatePath) ? JSON.parse(readFileSync(databaseStatePath, "utf8")) : existsSync(record) ? JSON.parse(readFileSync(record, "utf8")).database ?? null : null;
    const reviewedDatabase = ref === YOUTUBE_RESOLUTION_RELEASE_SHA
      ? youtubeResolutionDatabaseStateFromReview(await loadYoutubeResolutionReview()) : null;
    const database = currentDatabaseState({ currentRef: ref, reviewedReleaseSha: YOUTUBE_RESOLUTION_RELEASE_SHA, reviewedDatabase, recordedDatabase });
    const closedState = existsSync(record) ? JSON.parse(readFileSync(record, "utf8")).closedR2 : null;
    say(JSON.stringify({ cwd, ref, buildId, loaded, database, rollbackAvailable: (existsSync(statePath) || existsSync(recoveryPath)) && !existsSync(integratedDatabaseGuardPath) && !closedState?.rolledBack,
      closedR2Maintenance: Boolean(closedState), recoveryPending: existsSync(recoveryPath), integratedDatabaseGuardPresent: existsSync(integratedDatabaseGuardPath) }, null, 2));
    return;
  }
  if (action === "plan") {
    const live = current(), closedContext = requireClosedR2Mode(options, live);
    if (options.reviewedNutritionRecoveryReadiness) await loadNutritionRecoveryReview();
    const youtubeTrialReview = options.reviewedYoutubeTrialReadiness ? await loadYoutubeTrialReview() : null;
    if (youtubeTrialReview) await verifyYoutubeTrialSourceBackfill({ review: youtubeTrialReview, repositoryRoot: repository });
    const youtubeResolutionReview = options.reviewedYoutubeResolutionReadiness ? await loadYoutubeResolutionReview() : null;
    const selection = plan(options.ref, live, options.refOption, options.verifyScript, options.skipAutomatedTests, options.testScript, youtubeTrialReview, youtubeResolutionReview, options.reviewedIntegratedMasterReadiness);
    const environmentKeys = Object.keys(readEnvironmentPatch(options.envFile, repository)).sort();
    if (options.reviewedClosedR2Maintenance) {
      const review = loadClosedR2Review(repository), patch = readEnvironmentPatch(options.envFile, repository);
      validateClosedR2Candidate(review, live, selection, patch, options, closedContext);
      verifyClosedR2Control(review, repository);
    } else if (closedContext) {
      assertRound2InheritanceBoundaries({ previous: live.plist, next: live.plist, files: selection.files, databaseDeployment: selection.scope.database.length > 0 });
      verifyClosedR2Control(closedContext.review, repository);
    }
    say(JSON.stringify({ ...selection, environmentKeys, database: { required: selection.scope.database.length > 0 || Boolean(options.dbConfig), configProvided: Boolean(options.dbConfig), readOnly: Boolean(options.alreadyAppliedDb || options.reviewedIntegratedMasterReadiness), requiresCompatibilityConfirmation: (selection.scope.database.length > 0 || Boolean(options.dbConfig)) && !options.dbCompatible && !options.alreadyAppliedDb && !options.reviewedIntegratedMasterReadiness, note: options.reviewedIntegratedMasterReadiness ? "DB218 선행 상태를 읽기 전용으로 고정하고 웹만 먼저 배포합니다." : "DB 이력·현재 스키마·추가형 변경 여부는 배포 시 대상 커밋에서 검사합니다." } }, null, 2));
    return;
  }
  mkdirSync(join(root, "releases"), { recursive: true, mode: 0o700 });
  chmodSync(root, 0o700);
  const lock = join(root, "deploy.lock");
  try { mkdirSync(lock, { mode: 0o700 }); } catch { throw new DeploymentError("배포 잠금이 있습니다. 다른 배포 종료 여부를 확인하세요."); }
  const onSignal = () => { void cancellation.request(); };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  try {
    const logPath = join(root, `${action}-${Date.now()}.log`);
    logFd = openSync(logPath, "wx", 0o600);
    say(`비공개 로그: ${logPath}`);
    if (action === "deploy") { await logged("git", ["-C", repository, "fetch", "origin", "master"], {}); await deploy(options); }
    else if (action === "record-youtube-resolution-database") await recordYoutubeResolutionDatabase(options);
    else if (action === "record-integrated-master-database") await recordIntegratedMasterDatabase(options);
    else await rollback();
  } finally {
    await cancellation.drain();
    if (logFd !== undefined) closeSync(logFd);
    rmdirSync(lock);
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
}
main().catch((error) => {
  process.stderr.write(`${error instanceof DeploymentError ? error.message : "배포 도구 실패. 비공개 로그와 웹 상태를 확인하세요."}\n`);
  process.exitCode = 1;
});
