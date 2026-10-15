#!/usr/bin/env node
import {
  RECIPE_SAVE_RECOVERY_FEATURE, RECIPE_SAVE_RECOVERY_MIGRATIONS, RECIPE_SAVE_RECOVERY_RUNTIME_POSTIMAGES, recipeSaveRecoveryRuntimeContract, loadCurrentDatabaseMaintenance, readRecipeSaveRecoveryAttempt, recipeSaveRecoveryPhaseStatus, assertRecipeSaveRecoveryReader, verifyRecipeSaveRecoveryPredecessor, verifyRecipeSaveRecoveryWorkerAdmission,
  NUTRITION_VALIDATOR_FEATURE, NUTRITION_VALIDATOR_MIGRATION, loadNutritionValidatorMaintenance, nutritionValidatorMaintenanceBinding,
  readNutritionValidatorAttempt, nutritionValidatorPhaseStatus, assertNutritionValidatorReader,
  assertNutritionValidatorMarker, verifyNutritionValidatorWriterAdmission, verifyNutritionValidatorPredecessor, assertProtectedWriterDatabaseBoundary, assertNutritionValidatorReaderCompensation, assertNutritionValidatorSourceHandoff,
} from "./lib/prelaunch-web-deploy.mjs";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
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
import { verifyYoutubeExtractionWorkerArtifact } from "./lib/youtube-extraction-worker-artifact.mjs";
import { readYoutubeExtractionWorkerCredential, parseLaunchctlPrintStatus } from "./lib/youtube-extraction-worker-ops.mjs";
import { readWorkerEnvironment } from "./lib/youtube-extraction-worker-runtime.mjs";
import { verifyYoutubeResolutionWorkerCaller, assertYoutubeResolutionLauncherPreserved } from "./lib/prelaunch-youtube-resolution-worker-install.mjs";
import { createPrelaunchDatabase, createProtectedPrelaunchAdapter, createProtectedPrelaunchDatabase, createProtectedPrelaunchJournal, createProtectedPrelaunchWriter,
  openProtectedPrelaunchTarget, planProtectedPrelaunchMigrations, assertProtectedPrelaunchObservation } from "./lib/prelaunch-database.mjs";
import { QUANTITY_V4_WORKER_STATE_SQL } from "./lib/prelaunch-database.mjs";
import { createRecordingDockerAdapter, durableJson } from "./lib/marketing-round2-controlled-deploy.mjs";
import {
  CLOSED_R2_REVIEW_PIN, acquireClosedR2ControlLease, assertClosedR2CompensationTarget, assertClosedR2ContinuationOptions, assertClosedR2Database, assertClosedR2Environment,
  assertClosedR2LiveMarker, assertClosedR2LiveUnchanged, assertClosedR2MaintenanceFence, assertClosedR2PredecessorState, assertClosedR2Retry, assertClosedR2Rollback, assertRound2InheritanceBoundaries,
  assertClosedR2Source, closedR2RollbackPlist, loadClosedR2Review, loadProtectedRolloutReview, loadProtectedWriterReview, verifyClosedR2Collector, readClosedR2PrivateBytes, verifyClosedR2Control, verifyClosedR2HistoricalProofs,
  PROTECTED_WRITER_REVIEW_PIN, COOKED_WEIGHT_FEATURE,
  protectedRolloutPins, protectedRolloutPaths, protectedImmutableSha256, protectedReaderFenceSql, protectedReaderPlist, verifyCookedWeightPredecessor, assertCookedWeightProductOff, assertCookedWeightFirstReader, assertProtectedClosedR2Marker, assertProtectedReaderRollback, assertProtectedReaderCompensation,
  assertProtectedRolloutSource, assertProtectedRolloutEnvironment, protectedRolloutReaderReceipt, protectedRolloutStatus, verifyProtectedRolloutEvidence,
  QUANTITY_V4_FEATURE, loadQuantityV4WorkerCheckpoint, loadQuantityV4WorkerCheckpointEvidence, assertQuantityV4ConsumersReceipt,
  loadQuantityV4DatabaseReceipt, acquirePrelaunchDeployLock,
  assertQuantityV4WorkerProcess,
  loadQuantityV4ActiveWorkerContinuation,
  COOKED_WEIGHT_ATTESTATION_FEATURE, loadCookedWeightAttestationSuccessor,
  loadCookedWeightAttestationWorkerContinuation, loadCookedWeightAttestationQuantityOff,
} from "./lib/prelaunch-web-deploy.mjs";

const repository = realpathSync(resolve(process.env.HOMECOOK_DEPLOY_REPOSITORY || resolve(dirname(fileURLToPath(import.meta.url)), "..")));
const root = join(homedir(), ".homecook/prelaunch-web");
const plistPath = join(homedir(), "Library/LaunchAgents/com.homecook.production.plist");
const statePath = join(root, "state.json");
const recoveryPath = join(root, "recovery.json");
const databaseStatePath = join(root, "database-state.json");
const integratedDatabaseGuardPath = join(root, "youtube-integrated-database-guard.json");
const protectedDatabaseGuardPath = join(root, "protected-database-guard.json");
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
  youtubeTrialReview = null, youtubeResolutionReview = null, integratedMaster = false, protectedCandidate = null) {
  assertClean(live.cwd);
  const target = git(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]);
  git(["merge-base", "--is-ancestor", ...prelaunchSourceAncestry(option, ref, live.ref, target)]);
  const files = prelaunchChangedFiles((args) => command("git", ["-C", repository, ...args], { trimOutput: false }), live.ref, target);
  if (protectedCandidate) validateProtectedCandidate(protectedCandidate.review, live, { target, files }, protectedCandidate.context);
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
  const eslintConfigDigests = files.includes("eslint.config.mjs") ? [live.ref, target].map(sha =>
    git(["ls-tree", sha, "--", "eslint.config.mjs"]).length
      ? hash(execFileSync("git", ["-C", repository, "show", `${sha}:eslint.config.mjs`],
        { maxBuffer: 65536, stdio: ["ignore", "pipe", "pipe"] })) : null) : null;
  const recipeSaveHandoff = !protectedCandidate && (RECIPE_SAVE_RECOVERY_MIGRATIONS.some(row=>files.includes(`supabase/migrations/${row.filename}`))
    || files.some(file=>Object.hasOwn(RECIPE_SAVE_RECOVERY_RUNTIME_POSTIMAGES,file)))
    ? nutritionSourceHandoff(live,{target,files}) : null;
  if (recipeSaveHandoff) assertNutritionValidatorSourceHandoff(recipeSaveHandoff);
  const scope = classifyPrelaunchScope(files, manifest(live.ref), manifest(target),
    { reviewedYoutubeTrialSupport: Boolean(youtubeTrialReview), reviewedYoutubeResolutionSupport: Boolean(youtubeResolutionReview),
      reviewedIntegratedFiles: integratedReview?.reviewedFiles,
      // validateProtectedCandidate above already checked the complete exact byte pairs.
      reviewedQuantityWorkerSupport: protectedCandidate?.review.feature === QUANTITY_V4_FEATURE,
      reviewedProtectedInventorySupport: Boolean(protectedCandidate), reviewedRecipeSaveSupport: protectedCandidate?.review.feature === RECIPE_SAVE_RECOVERY_FEATURE || Boolean(recipeSaveHandoff), eslintConfigDigests });
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

function quantityPublicReadDigests(live, selection, closedContext) {
  const file = "lib/server/hybrid-auth/public-read-policy-runtime.mjs";
  if (closedContext?.rollout?.feature !== QUANTITY_V4_FEATURE || closedContext.rollout.quantityStage !== "worker"
    || !selection.files.includes(file)) return null;
  // Read Git blob bytes, not the working tree or trimmed command output.
  return [live.ref, selection.target].map(ref => git(["ls-tree", ref, "--", file]).length
    ? hash(execFileSync("git", ["-C", repository, "show", `${ref}:${file}`],
      { maxBuffer: 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] })) : null);
}

function nutritionSourceHandoff(live, selection) {
  const recipeSql = RECIPE_SAVE_RECOVERY_MIGRATIONS.some(row => selection.files.includes(`supabase/migrations/${row.filename}`));
  const recipeRuntime = selection.files.some(file => Object.hasOwn(RECIPE_SAVE_RECOVERY_RUNTIME_POSTIMAGES,file)
    && recipeSaveRecoveryRuntimeContract(file,execFileSync("git",["-C",repository,"show",`${selection.target}:${file}`],{maxBuffer:32*1024*1024,stdio:["ignore","pipe","pipe"]})));
  if (!selection.files.includes(`supabase/migrations/${NUTRITION_VALIDATOR_MIGRATION}`) && !recipeSql && !recipeRuntime) return undefined;
  const maintenance = loadCurrentDatabaseMaintenance(repository);
  if (!maintenance || (recipeSql || recipeRuntime) && maintenance.review.feature !== RECIPE_SAVE_RECOVERY_FEATURE) throw new DeploymentError("Exact nutrition/recipe-save source is not already committed under its separate authority");
  if (recipeRuntime && !recipeSql && !selection.files.some(file=>file.startsWith("supabase/")) && maintenance.review.feature === RECIPE_SAVE_RECOVERY_FEATURE
    && spawnSync("git",["-C",repository,"merge-base","--is-ancestor",maintenance.review.to,live.ref],{stdio:"ignore"}).status===0) return undefined;
  const digests = Object.fromEntries(selection.files.map(file => [file, [live.ref, selection.target].map(sha =>
    git(["ls-tree", sha, "--", file]).length ? hash(execFileSync("git", ["-C", repository, "show", `${sha}:${file}`],
      { maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] })) : null)]));
  return { maintenance, from: live.ref, to: selection.target, live: { ref: live.ref, buildId: live.buildId, plistSha256: hash(live.bytes) }, files: selection.files, digests };
}
async function stageRound2Readiness(plist, release, live, selection, databaseDeployment, options, databasePlan, closedContext) {
  if (options.reviewedClosedR2Maintenance || closedContext) {
    const review = loadClosedR2Review(repository);
    const patch = readEnvironmentPatch(options.envFile, repository);
    if (options.reviewedProtectedRollout) {
      const rollout = loadProtectedRolloutReview(repository, { feature: options.protectedFeature, ref: options.ref, phase: options.protectedPhase });
      validateProtectedCandidate(rollout, live, selection, closedContext);
      assertProtectedRolloutEnvironment({ review: rollout, before: live.plist, after: plist,
        currentControlSha256: review.controlSha256, currentProofsSha256: hash(JSON.stringify(verifyClosedR2HistoricalProofs(review, repository))), currentGeneration: review.consentGeneration,
        readerActivation: options.protectedPhase === "reader" });
      await verifyProtectedBaseline(rollout, databasePlan, options);
    } else if (options.reviewedClosedR2Maintenance) {
      validateClosedR2Candidate(review, live, selection, patch, options, closedContext);
      assertClosedR2Environment({ review, previous: live.plist, next: plist, patch,
        envPatchSha256: hash(readClosedR2PrivateBytes(options.envFile, repository)) });
    } else {
      assertClosedR2ContinuationOptions(options);
      assertRound2InheritanceBoundaries({ previous: live.plist, next: plist, files: selection.files, databaseDeployment,
        quantityPublicReadDigests: quantityPublicReadDigests(live, selection, closedContext), nutritionMaintenanceHandoff: nutritionSourceHandoff(live, selection) });
      if (!isDeepStrictEqual(plist, retargetPlist(live.plist, plist.WorkingDirectory))) throw new DeploymentError("닫힘 승계는 기존 환경과 실행 설정을 유지해야 합니다.");
    }
    if (!options.reviewedProtectedRollout) {
      if (closedContext?.marker.protectedRollout) await verifyProtectedBaseline(closedContext.rollout, databasePlan, options);
      else assertClosedR2Database(review, databasePlan);
    }
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
function protectedMigrationsAt(review) {
  const source = review.feature === QUANTITY_V4_FEATURE ? review.database.source : review.database.after;
  const actual = git(["ls-tree", "-r", "--name-only", review.to, "--", "supabase/migrations"]).split("\n").filter(file => file.endsWith(".sql")).sort();
  if (!isDeepStrictEqual(actual, source.map(row => `supabase/migrations/${row.filename}`).sort())) throw new DeploymentError("보호 전환의 전체 candidate migration 목록이 승인과 다릅니다.");
  return source.map(row => {
    const bytes = execFileSync("git", ["-C", repository, "show", `${review.to}:supabase/migrations/${row.filename}`], { maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
    return { filename: row.filename, sha256: hash(bytes), bytes };
  });
}
function recordedProtectedPhase(review, live) {
  const paths = protectedRolloutPaths(root, review), pins = protectedRolloutPins(review);
  if (!existsSync(paths.databaseGuardPath)) return null;
  const guard = JSON.parse(readClosedR2PrivateBytes(paths.databaseGuardPath, repository, 524288));
  if (guard.operationDirectory !== join(paths.operationRoot, guard.operationId)) throw new DeploymentError("보호 DB phase 작업 경로가 다릅니다.");
  if (guard.status === "committed") loadProtectedDatabaseReceipt(review);
  const reader = existsSync(paths.readerReceiptPath) ? JSON.parse(readClosedR2PrivateBytes(paths.readerReceiptPath, repository, 524288)) : null;
  let writer = null;
  if (pins.writer.sha256) for (const action of ["writer-on", "writer-off"]) {
    const path = join(root, `${paths.writerPrefix}-${pins.writer.sha256}-${action}.json`);
    if (existsSync(path) && (!writer || ["committed", "not_applied", "closed_after_unknown"].includes(writer.status))) writer = JSON.parse(readClosedR2PrivateBytes(path, repository, 524288));
  }
  return protectedRolloutStatus({ review, reviewSha256: pins.rollout.sha256, guard, reader, writer,
    readerCompatible: spawnSync("git", ["-C", repository, "merge-base", "--is-ancestor", review.to, live.ref]).status === 0 });
}
function currentProtectedPhase(live = current()) {
  const recipeSave = readRecipeSaveRecoveryAttempt(repository);
  if (recipeSave) {
    if (recipeSave.record.status === "committed") loadCurrentDatabaseMaintenance(repository);
    return recipeSaveRecoveryPhaseStatus(recipeSave,spawnSync("git",["-C",repository,"merge-base","--is-ancestor",recipeSave.review.sourceReaderRef,live.ref]).status===0);
  }
  const maintenance = readNutritionValidatorAttempt(repository);
  if (maintenance) {
    if (maintenance.record.status === "committed") loadCurrentDatabaseMaintenance(repository);
    return nutritionValidatorPhaseStatus(maintenance,
      spawnSync("git", ["-C", repository, "merge-base", "--is-ancestor", maintenance.review.sourceReaderRef, live.ref]).status === 0);
  }
  if (!existsSync(protectedDatabaseGuardPath)) return null;
  const product = recordedProtectedPhase(loadProtectedRolloutReview(repository), live);
  if (!existsSync(join(root, "protected-cooked-weight-database-guard.json"))) return product;
  const review = loadProtectedRolloutReview(repository, { feature: COOKED_WEIGHT_FEATURE });
  const weight = recordedProtectedPhase(review, live);
  if (existsSync(join(root, "protected-cooked-weight-attestation-database-guard.json"))) {
    const personal = loadProtectedRolloutReview(repository, { feature: COOKED_WEIGHT_ATTESTATION_FEATURE });
    return { ...recordedProtectedPhase(personal, live), feature: COOKED_WEIGHT_ATTESTATION_FEATURE, predecessorReaderFloor: personal.predecessorQuantity.readerFloor };
  }
  if (existsSync(join(root, "protected-quantity-v4-consumers-database-guard.json"))) {
    const consumers = loadProtectedRolloutReview(repository, { feature: QUANTITY_V4_FEATURE, phase: "database" });
    const workerGuard = join(root, "protected-quantity-v4-worker-database-guard.json");
    const quantity = existsSync(workerGuard) ? loadProtectedRolloutReview(repository, { feature: QUANTITY_V4_FEATURE, phase: "worker-database" }) : consumers;
    const phase = recordedProtectedPhase(quantity, live);
    return { ...phase, feature: QUANTITY_V4_FEATURE, quantityStage: quantity.quantityStage, predecessorReaderFloor: quantity.predecessorProtected.readerFloor,
      normalDeploymentAllowed: phase.normalDeploymentAllowed && weight.normalDeploymentAllowed && product.normalDeploymentAllowed };
  }
  if (weight.phase === "not_applied") return { ...product, cookedWeightAttempt: "not_applied" };
  return { ...weight, feature: COOKED_WEIGHT_FEATURE, predecessorReaderFloor: review.predecessorProtected.readerFloor,
    recordedProductWriterEnabled: product.recordedWriterEnabled,
    normalDeploymentAllowed: weight.normalDeploymentAllowed && product.normalDeploymentAllowed };
}

function verifyQuantityV4WorkerBoundary(review, phase) {
  const evidence = loadQuantityV4WorkerCheckpointEvidence(review, repository, phase), checkpoint = evidence.record;
  if (phase === "after" && checkpoint.workerDatabaseReceiptSha256 !== loadProtectedDatabaseReceipt(review).pointer.sha256) throw new DeploymentError("C04 terminal worker must bind the exact DB227 terminal bytes");
  const workerPlistPath = join(homedir(), "Library/LaunchAgents/com.homecook.youtube-extraction-worker.plist");
  const info = lstatSync(workerPlistPath);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o600
    || hash(readFileSync(workerPlistPath)) !== checkpoint.plistSha256) throw new DeploymentError("C04 actual worker plist differs from checkpoint");
  const observed = spawnSync("/bin/launchctl", ["print", `${domain}/com.homecook.youtube-extraction-worker`], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  if (phase === "before") {
    if (observed.status !== 113 || !observed.stderr?.includes("Could not find service")) throw new DeploymentError("C04 worker is not verifiably stopped");
  } else if (observed.status !== 0 || !/state = running/u.test(observed.stdout ?? "")
    || Number(/pid = (\d+)/u.exec(observed.stdout ?? "")?.[1]) !== checkpoint.pid) throw new DeploymentError("C04 actual running worker PID differs from terminal receipt");
  assertQuantityV4WorkerProcess(checkpoint, { plistSha256: hash(readFileSync(workerPlistPath)), serviceState: phase === "before" ? "stopped" : "running",
    pid: phase === "before" ? null : Number(/pid = (\d+)/u.exec(observed.stdout ?? "")?.[1]) });
  return checkpoint;
}

// LaunchAgents is a shared macOS install directory, unlike private proof/secret directories.
function readQuantityV4InstalledWorkerPlist() {
  const path = join(homedir(), "Library/LaunchAgents/com.homecook.youtube-extraction-worker.plist"), parent = dirname(path);
  const parentBefore = lstatSync(parent), maximum = 65536;
  const validParent = info => info.isDirectory() && !info.isSymbolicLink() && info.uid === process.getuid()
    && (info.mode & 0o022) === 0 && realpathSync(parent) === parent;
  const validFile = info => info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && info.uid === process.getuid()
    && (info.mode & 0o777) === 0o600 && info.size <= maximum;
  if (!validParent(parentBefore)) throw new DeploymentError("C04 canonical installed plist parent ownership/path/permissions differ");
  const before = lstatSync(path);
  if (!validFile(before) || realpathSync(path) !== path) throw new DeploymentError("C04 canonical installed plist ownership/path/permissions differ");
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd);
    if (!validFile(opened) || opened.ino !== before.ino || opened.dev !== before.dev) throw new DeploymentError("C04 installed plist binding changed");
    const buffer = Buffer.alloc(maximum + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const length = readSync(fd, buffer, offset, buffer.length - offset, null);
      if (!length) break;
      offset += length;
    }
    const after = fstatSync(fd), named = lstatSync(path), parentAfter = lstatSync(parent);
    if (offset > maximum || !validFile(after) || !validFile(named) || !validParent(parentAfter)
      || named.ino !== opened.ino || named.dev !== opened.dev || after.size !== opened.size
      || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs
      || named.size !== after.size || named.mtimeMs !== after.mtimeMs || named.ctimeMs !== after.ctimeMs
      || parentAfter.ino !== parentBefore.ino || parentAfter.dev !== parentBefore.dev || realpathSync(path) !== path) {
      throw new DeploymentError("C04 installed plist changed during read");
    }
    return buffer.subarray(0, offset);
  } finally { closeSync(fd); }
}

async function verifyQuantityV4ActiveWorkerService(review, evidence) {
  const checkpoint = evidence.post.record;
  const home = homedir(), secretRoot = join(home, ".homecook/youtube-extraction");
  const prefix = review.to.slice(0, 12), suffix = `${prefix}-${review.workerAuthority.operationId.slice(0, 8)}`;
  const artifactRoot = join(home, `.homecook/youtube-extraction-releases/${prefix}-c04-quantity-v4`);
  const manifest = join(artifactRoot, "artifact.json"), descriptor = join(secretRoot, `app-descriptor-${suffix}-c04.json`);
  const credential = join(secretRoot, `worker-credential-v48-${suffix}-c04.json`), config = join(secretRoot, `worker-v48-${suffix}-c04.env`);
  const runner = join(artifactRoot, "scripts/youtube-extraction-worker-runner.mjs");
  const flags = ["--config", config, "--manifest", manifest, "--credential", credential, "--secret-root", secretRoot,
    "--app-descriptor", descriptor, "--policy", join(secretRoot, `current-policy-${suffix}-c04.json`),
    "--expected-schema", join(artifactRoot, "scripts/manifests/youtube-extraction-expected-schema.json")];
  const path = join(home, "Library/LaunchAgents/com.homecook.youtube-extraction-worker.plist");
  const plistBytes = readQuantityV4InstalledWorkerPlist(), plist = parsePlist(plistBytes);
  const node = join(home, ".nvm/versions/node/v22.19.0/bin/node"), args = plist.ProgramArguments;
  const nodeIndex = Array.isArray(args) ? args.indexOf(node) : -1;
  if (hash(plistBytes) !== checkpoint.plistSha256 || plist.Label !== "com.homecook.youtube-extraction-worker"
    || plist.WorkingDirectory !== artifactRoot || !Array.isArray(args) || args[0] !== "/usr/bin/env" || args[1] !== "-i"
    || args[2] !== `HOME=${home}` || nodeIndex < 4 || !args.slice(2, nodeIndex).every(value => /^[A-Z_][A-Z0-9_]*=/u.test(value))
    || !isDeepStrictEqual(args.slice(nodeIndex + 1), [runner, "run", ...flags])) {
    throw new DeploymentError("C04 active worker exact installed launcher differs");
  }
  const previousBytes = readClosedR2PrivateBytes(join(evidence.post.origin.record.operationDirectory, "generation-47.plist"), repository);
  if (hash(previousBytes) !== evidence.pre.record.plistSha256) throw new DeploymentError("C04 approved predecessor launcher bytes differ");
  assertYoutubeResolutionLauncherPreserved(parsePlist(previousBytes), plist);
  const artifactInfo = lstatSync(manifest);
  if (!artifactInfo.isFile() || artifactInfo.isSymbolicLink() || artifactInfo.nlink !== 1 || artifactInfo.uid !== process.getuid()
    || (artifactInfo.mode & 0o022)
    || hash(readClosedR2PrivateBytes(descriptor, repository)) !== checkpoint.descriptorSha256
    || hash(readClosedR2PrivateBytes(credential, repository)) !== checkpoint.credentialMetadataSha256) {
    throw new DeploymentError("C04 active worker artifact/descriptor/credential bytes differ");
  }
  if (verifyYoutubeExtractionWorkerArtifact(manifest).artifact_sha256 !== checkpoint.artifactSha256) throw new DeploymentError("C04 active worker logical artifact identity differs");
  const metadata = readYoutubeExtractionWorkerCredential(credential, { secretRoot });
  if (metadata.generation !== 48 || metadata.release_sha !== review.to || metadata.schema_identity !== checkpoint.schemaIdentity
    || metadata.allowed_snapshot_digest !== checkpoint.snapshotDigest || Date.parse(metadata.expires_at) <= Date.now() + 30 * 60 * 1000) {
    throw new DeploymentError("C04 active worker current credential identity/expiry differs");
  }
  const status = () => {
    const result = spawnSync("/bin/launchctl", ["print", `${domain}/com.homecook.youtube-extraction-worker`], { encoding: "utf8", maxBuffer: 1024 * 1024 });
    if (result.status !== 0) throw new DeploymentError("C04 active worker is not loaded");
    const raw = result.stdout;
    if (typeof raw !== "string") throw new DeploymentError("C04 active worker loaded identity missing");
    const lines = raw.replace(/\n+$/u, "").split("\n");
    if (lines[0] !== `${domain}/com.homecook.youtube-extraction-worker = {` || lines.at(-1) !== "}") throw new DeploymentError("C04 active worker loaded output is incomplete");
    let depth = 0;
    const rootLines = [], rootPositions = new Set();
    for (const [index, line] of lines.entries()) {
      if (depth === 1) { rootLines.push(line); rootPositions.add(index); }
      if (/ = \{$/u.test(line)) depth++;
      if (/^\t*\}$/u.test(line)) depth--;
      if (depth < 0 || (depth === 0 && index !== lines.length - 1)) throw new DeploymentError("C04 active worker loaded output is ambiguous");
    }
    if (depth !== 0) throw new DeploymentError("C04 active worker loaded output is truncated");
    const field = name => {
      const prefix = `\t${name} = `, values = rootLines.filter(line => line.startsWith(prefix));
      if (values.length !== 1) throw new DeploymentError("C04 active worker loaded field missing/duplicate");
      return values[0].slice(prefix.length);
    };
    const argumentBlocks = lines.flatMap((line, index) => rootPositions.has(index) && line === "\targuments = {" ? [index] : []);
    if (argumentBlocks.length !== 1) throw new DeploymentError("C04 active worker loaded arguments missing/duplicate");
    const argumentEnd = lines.indexOf("\t}", argumentBlocks[0] + 1), argumentLines = lines.slice(argumentBlocks[0] + 1, argumentEnd);
    if (argumentEnd < 0 || argumentLines.some(line => !line.startsWith("\t\t"))) throw new DeploymentError("C04 active worker loaded arguments are incomplete");
    if (field("path") !== path || field("type") !== "LaunchAgent" || field("program") !== plist.ProgramArguments[0]
      || field("working directory") !== plist.WorkingDirectory || field("state") !== "running"
      || !isDeepStrictEqual(argumentLines.map(line => line.slice(2)), plist.ProgramArguments)) {
      throw new DeploymentError("C04 active worker loaded command/environment differs from the approved plist");
    }
    // The existing general parser is unchanged; only validated root fields are passed to it.
    const running = parseLaunchctlPrintStatus({ serviceTarget: `${domain}/com.homecook.youtube-extraction-worker`, ...result, stdout: rootLines.join("\n") });
    if (!running.loaded || running.state !== "running" || !Number.isSafeInteger(running.pid) || running.pid <= 0 || field("pid") !== String(running.pid)) throw new DeploymentError("C04 active worker is not running");
    return running;
  };
  const first = status(); await delay(250); const second = status();
  if (first.pid !== second.pid) throw new DeploymentError("C04 active worker PID is not stable");
  const environment = await readWorkerEnvironment(config);
  const token = readClosedR2PrivateBytes(metadata.token_file, repository).toString("utf8").trim();
  const caller = await verifyYoutubeResolutionWorkerCaller({ environment, token, secretRoot });
  const healthResult = spawnSync(node, [runner, "health", ...flags], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000, maxBuffer: 1024 * 1024, env: { HOME: home, PATH: `${dirname(node)}:/usr/bin:/bin` } });
  if (healthResult.status !== 0) throw new DeploymentError("C04 active worker local health failed; output withheld");
  const health = JSON.parse(healthResult.stdout);
  if (!health.ok || !health.ready || caller.authenticatedStatus !== 200 || caller.emptyClaimDenied !== true
    || status().pid !== second.pid || hash(readQuantityV4InstalledWorkerPlist()) !== checkpoint.plistSha256) {
    throw new DeploymentError("C04 active worker health/auth/plist/PID changed");
  }
  return { pid: second.pid, stableObservations: 2 }; // Current PID is separate from the immutable activation/P1 PIDs.
}

function verifyProtectedBoundary(review, captured) {
  const actual = current();
  assertClosedR2LiveUnchanged(captured, actual);
  const closed = loadClosedR2Review(repository);
  verifyClosedR2Control(closed, repository);
  const proofs = verifyClosedR2HistoricalProofs(closed, repository);
  assertProtectedRolloutEnvironment({ review, before: captured.plist, after: actual.plist,
    currentControlSha256: closed.controlSha256, currentProofsSha256: hash(JSON.stringify(proofs)), currentGeneration: closed.consentGeneration });
}
function validateProtectedCandidate(review, live, selection, context) {
  if (!context || selection.target !== review.to) throw new DeploymentError("보호 전환은 실제 닫힘 predecessor에서만 시작합니다.");
  const digests = Object.fromEntries(Object.keys(review.files).map(file => [file, [review.from, review.to].map(sha =>
    git(["ls-tree", sha, "--", file]).length ? hash(execFileSync("git", ["-C", repository, "show", `${sha}:${file}`], { maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] })) : null)]));
  if (review.feature === RECIPE_SAVE_RECOVERY_FEATURE) {
    git(["merge-base", "--is-ancestor", review.predecessorNutrition.readerFloor, live.ref]);
    git(["merge-base", "--is-ancestor", live.ref, selection.target]);
  }
  if (review.feature === COOKED_WEIGHT_ATTESTATION_FEATURE) {
    git(["merge-base", "--is-ancestor", review.predecessorQuantity.readerFloor, live.ref]);
    git(["merge-base", "--is-ancestor", live.ref, selection.target]);
  }
  if ([COOKED_WEIGHT_FEATURE, QUANTITY_V4_FEATURE].includes(review.feature)) {
    git(["merge-base", "--is-ancestor", review.predecessorProtected.readerFloor, live.ref]);
    git(["merge-base", "--is-ancestor", live.ref, selection.target]);
  }
  assertProtectedRolloutSource({ review, live, releaseSha: selection.target, files: selection.files, digests, closedArtifactSha256: context.state.closedR2.artifactSha256 });
  const sqlPaths = Object.keys(review.files).filter(file => file.startsWith("supabase/"));
  const expected = review.database.migrations.map(row => `supabase/migrations/${row.filename}`);
  const allExpected = review.feature === QUANTITY_V4_FEATURE ? review.database.source.slice(221).map(row => `supabase/migrations/${row.filename}`) : expected;
  if (!isDeepStrictEqual(sqlPaths.sort(), allExpected.sort()) || sqlPaths.some(file => review.files[file][0] !== null)) {
    throw new DeploymentError("보호 전환은 승인된 새 migration만 추가할 수 있습니다.");
  }
  planProtectedPrelaunchMigrations(review, protectedMigrationsAt(review));
  verifyProtectedRolloutEvidence(review, repository);
  verifyProtectedBoundary(review, live);
}
function loadProtectedDatabaseReceipt(review) {
  if (review.feature === COOKED_WEIGHT_ATTESTATION_FEATURE) {
    const successor = loadCookedWeightAttestationSuccessor(repository);
    if (!successor || !isDeepStrictEqual(successor.review, review)) throw new DeploymentError("Personal attestation committed successor is required");
    return successor;
  }
  if (review.feature === QUANTITY_V4_FEATURE) return loadQuantityV4DatabaseReceipt(repository, review.quantityStage);
  const { databaseGuardPath: protectedDatabaseGuardPath, operationRoot: protectedOperationRoot } = protectedRolloutPaths(root, review);
  const guardBytes = readClosedR2PrivateBytes(protectedDatabaseGuardPath, repository, 524288);
  const record = JSON.parse(guardBytes);
  if (record.schema !== "homecook.prelaunch-protected-db-attempt.v1" || record.status !== "committed"
    || record.reviewSha256 !== protectedRolloutPins(review).rollout.sha256 || record.from !== review.from || record.to !== review.to
    || record.operationDirectory !== join(protectedOperationRoot, record.operationId)
    || record.databasePlanSha256 !== hash(JSON.stringify({ source: review.database.after, applied: review.database.after }))
    || record.targetSha256 !== review.database.targetSha256 || record.catalogSha256 !== review.database.afterCatalogSha256
    || record.immutableSha256 !== protectedImmutableSha256(review) || record.writerEnabled !== false || record.backwardCompatible !== false) {
    throw new DeploymentError("승인된 보호 DB commit receipt가 필요합니다.");
  }
  if (review.feature === COOKED_WEIGHT_FEATURE && (record.feature !== COOKED_WEIGHT_FEATURE || record.productWriterEnabled !== true
    || record.stableImmutableSha256 !== review.database.stableImmutableSha256 || !isDeepStrictEqual(record.predecessorProtected, review.predecessorProtected))) {
    throw new DeploymentError("C01 DB receipt must retain the original C03 authority unchanged");
  }
  if (review.feature === QUANTITY_V4_FEATURE) {
    if (record.feature !== QUANTITY_V4_FEATURE || record.quantityStage !== review.quantityStage || record.productWriterEnabled !== true || record.cookedWeightWriterEnabled !== true
      || record.normalProjectionSha256 !== review.database.normalProjectionSha256 || record.postimageRegistrySha256 !== review.database.postimageRegistrySha256
      || !isDeepStrictEqual(record.predecessorProtected, review.predecessorProtected)) throw new DeploymentError("C04 exact stage/protection/C01 receipt differs");
    if (review.quantityStage === "worker") {
      const bytes = readClosedR2PrivateBytes(review.consumersReceipt.path, repository, 524288);
      if (record.consumersReceiptSha256 !== review.consumersReceipt.sha256 || hash(bytes) !== review.consumersReceipt.sha256) throw new DeploymentError("C04 terminal226 receipt bytes differ");
      assertQuantityV4ConsumersReceipt(review, JSON.parse(bytes));
    }
  }
  const path = join(record.operationDirectory, "receipt.json"), bytes = readClosedR2PrivateBytes(path, repository, 524288);
  if (!bytes.equals(guardBytes)) throw new DeploymentError("보호 DB guard와 immutable receipt가 다릅니다.");
  return { record, pointer: { path, sha256: hash(bytes) } };
}
function protectedMarkerAuthority(marker, review) {
  const authority = marker.protectedRollout;
  if (!authority || authority.reviewSha256 !== protectedRolloutPins(review).rollout.sha256) throw new DeploymentError("보호 승계의 승인 출처가 다릅니다.");
  const database = loadProtectedDatabaseReceipt(review);
  const readerBytes = readClosedR2PrivateBytes(authority.readerReceipt.path, repository, 524288);
  if (!isDeepStrictEqual(authority.databaseReceipt, database.pointer) || authority.databaseReceiptSha256 !== database.pointer.sha256
    || authority.readerReceipt.sha256 !== hash(readerBytes) || authority.readerReceiptSha256 !== hash(readerBytes)) throw new DeploymentError("보호 승계 receipt bytes가 다릅니다.");
  return { databaseReceipt: database.record, databaseReceiptSha256: database.pointer.sha256, readerReceipt: JSON.parse(readerBytes), readerReceiptSha256: hash(readerBytes) };
}
function cookedWeightProductOffReceipt(review) {
  if (review.feature !== COOKED_WEIGHT_FEATURE) return null;
  const path = join(root, `protected-writer-${PROTECTED_WRITER_REVIEW_PIN.sha256}-writer-off.json`);
  if (!existsSync(path)) return null;
  const record = JSON.parse(readClosedR2PrivateBytes(path, repository, 524288));
  if (!["committed", "not_applied", "closed_after_unknown"].includes(record.status)) throw new DeploymentError("C03 safe OFF is unresolved; keep both feature guards");
  if (record.status !== "committed") return null;
  return assertCookedWeightProductOff(record, review, protectedRolloutPins(review).rollout.sha256);
}
async function verifyProtectedBaseline(review, plan, options) {
  const { readerReceiptPath: protectedReaderReceiptPath, writerPrefix } = protectedRolloutPaths(root, review);
  const successor = loadCookedWeightAttestationSuccessor(repository);
  const databaseMaintenance = loadCurrentDatabaseMaintenance(repository);
  const currentReview = databaseMaintenance?.review ?? (successor && [QUANTITY_V4_FEATURE, COOKED_WEIGHT_ATTESTATION_FEATURE].includes(review.feature) ? successor.review : review);
  if (plan.baselineRequired || plan.pending.length || !isDeepStrictEqual(plan.source, currentReview.database.after) || !isDeepStrictEqual(plan.applied, currentReview.database.after)) {
    throw new DeploymentError("현재 승인된 보호 DB source/applied 이력이 다릅니다.");
  }
  loadProtectedDatabaseReceipt(review);
  if (options.reviewedProtectedRollout && (options.dbConfig !== review.database.configPath
    || hash(readClosedR2PrivateBytes(options.dbConfig, repository, 65536)) !== review.database.configSha256)) throw new DeploymentError("보호 reader의 승인된 config bytes가 다릅니다.");
  const base = await createRecordingDockerAdapter({ configPath: options.dbConfig, backupDirectory: root });
  const observed = await createProtectedPrelaunchAdapter(base, currentReview.feature, currentReview, databaseMaintenance).observe(undefined, "protected-baseline-readback");
  const workerContinuation = successor ? loadCookedWeightAttestationWorkerContinuation(successor, repository) : null;
  const quantityOffReceipt = successor ? loadCookedWeightAttestationQuantityOff(repository, successor) : null;
  if (workerContinuation) {
    await verifyQuantityV4ActiveWorkerService(workerContinuation.historical.authority.database.review, workerContinuation.historical);
    observed.worker = JSON.parse((await base.query(QUANTITY_V4_WORKER_STATE_SQL)).trim());
  }
  const productOffReceipt = cookedWeightProductOffReceipt(review);
  if (options.reviewedProtectedRollout && options.protectedPhase === "reader") assertCookedWeightFirstReader(review, productOffReceipt, protectedRolloutPins(review).rollout.sha256);
  const activeWorkerContinuation = !successor && !options.reviewedProtectedRollout && review.feature === QUANTITY_V4_FEATURE
    ? loadQuantityV4ActiveWorkerContinuation(repository, review) : null;
  if (activeWorkerContinuation) {
    if (!observed.writerEnabled) throw new DeploymentError("C04 active continuation requires the original quantity writer ON");
    await verifyQuantityV4ActiveWorkerService(review, activeWorkerContinuation);
    observed.worker = JSON.parse((await base.query(QUANTITY_V4_WORKER_STATE_SQL)).trim());
  }
  assertProtectedPrelaunchObservation(review, { ...observed, writerEnabled: false }, "after", {
    productOffReceipt, reviewSha256: protectedRolloutPins(review).rollout.sha256,
    activeWorkerContinuation, attestationSuccessor: review.feature === QUANTITY_V4_FEATURE ? successor : undefined, databaseMaintenance,
    approvedWorkerPolicy: workerContinuation?.observation, quantityOffReceipt,
    workerCheckpoint: !successor && !activeWorkerContinuation && review.feature === QUANTITY_V4_FEATURE ? verifyQuantityV4WorkerBoundary(review, "after") : undefined });
  if (review.feature === COOKED_WEIGHT_FEATURE) verifyCookedWeightPredecessor(review, repository);
  if (protectedRolloutPins(review).writer.sha256) {
    for (const action of ["writer-on", "writer-off"]) {
      const path = join(root, `${writerPrefix}-${protectedRolloutPins(review).writer.sha256}-${action}.json`);
      if (existsSync(path)) {
        const attempt = JSON.parse(readClosedR2PrivateBytes(path, repository, 524288));
        if (!["committed", "not_applied", "closed_after_unknown"].includes(attempt.status)) throw new DeploymentError("신형 쓰기 전환 결과가 미확정입니다. 읽기 전용 reconcile이 필요합니다.");
        if (databaseMaintenance && action === "writer-off" && attempt.status === "committed") assertProtectedWriterDatabaseBoundary(attempt, databaseMaintenance);
      }
    }
  }
  if (observed.writerEnabled) {
    const approval = loadProtectedWriterReview(repository, review);
    const path = join(root, `${writerPrefix}-${protectedRolloutPins(review).writer.sha256}-writer-on.json`);
    const writer = JSON.parse(readClosedR2PrivateBytes(path, repository, 524288));
    const offPath = join(root, `${writerPrefix}-${protectedRolloutPins(review).writer.sha256}-writer-off.json`);
    if (existsSync(offPath) && JSON.parse(readClosedR2PrivateBytes(offPath, repository, 524288)).status === "committed") throw new DeploymentError("safe OFF 이후 승인 없는 재활성화를 거부합니다.");
    if (writer.status !== "committed" || writer.approvalSha256 !== protectedRolloutPins(review).writer.sha256 || writer.readerFloor !== review.to
      || (approval.readerReceiptSha256 !== null && writer.readerReceiptSha256 !== approval.readerReceiptSha256)
      || writer.readerReceiptSha256 !== hash(readClosedR2PrivateBytes(protectedReaderReceiptPath, repository, 524288)) || writer.writerEnabled !== true) throw new DeploymentError("신형 쓰기 ON의 승인/commit/floor가 없습니다.");
  }
}
async function runProtectedDatabasePhase(options, action, review) {
  const { databaseGuardPath: protectedDatabaseGuardPath, operationRoot: protectedOperationRoot } = protectedRolloutPaths(root, review);
  const live = current(), context = requireClosedR2Mode(options, live);
  const maintenance = [NUTRITION_VALIDATOR_FEATURE,RECIPE_SAVE_RECOVERY_FEATURE].includes(review.feature);
  const reconcile = ["reconcile", "worker-reconcile"].includes(options.protectedPhase);
  let operationId, operationDirectory, previousNotAppliedSha256;
  const verifyReader = async () => {
    if (!maintenance) return;
    const actual = current();
    await smoke(3100, actual.cwd, actual.buildId);
    if (review.feature === RECIPE_SAVE_RECOVERY_FEATURE) {
      const readerSources=Object.fromEntries(Object.keys(review.readerSources).map(file=>[file,hash(readFileSync(join(actual.cwd,file)))]));
      assertRecipeSaveRecoveryReader(review,{ref:actual.ref,buildId:actual.buildId,plistSha256:hash(actual.bytes),readerSources,healthy:true});
      const previous = verifyRecipeSaveRecoveryPredecessor(review,repository);
      verifyNutritionValidatorWriterAdmission(repository,nutritionValidatorMaintenanceBinding(previous));
      // Reconcile only observes the existing intent; it must remain usable for unknown DB outcomes.
      if (!reconcile) verifyRecipeSaveRecoveryWorkerAdmission(review, repository, operationId);
    } else assertNutritionValidatorReader(review, { ref: actual.ref, buildId: actual.buildId, plistSha256: hash(actual.bytes),
      validatorSha256: hash(readFileSync(join(actual.cwd, "lib/server/recipe-nutrition-snapshot.ts"))), healthy: true });
    if (review.feature === NUTRITION_VALIDATOR_FEATURE) verifyNutritionValidatorPredecessor(review, repository);
    if (review.feature === NUTRITION_VALIDATOR_FEATURE) verifyNutritionValidatorWriterAdmission(repository);
  };
  if (maintenance) await verifyReader();
  const retry = ["database-retry", "worker-database-retry"].includes(options.protectedPhase);
  const workerCheckpoint = review.feature === QUANTITY_V4_FEATURE && review.quantityStage === "worker" ? verifyQuantityV4WorkerBoundary(review, "before") : undefined;
  plan(options.ref, live, options.refOption, undefined, false, options.testScript, null, null, false, { review, context });
  if (action === "plan") {
    const adapter = await openProtectedPrelaunchTarget({ repositoryRoot: repository, configPath: options.dbConfig, backupDirectory: root, review });
    const observed = await adapter.observe(undefined, "protected-plan");
    assertProtectedPrelaunchObservation(review, observed, reconcile ? "after" : "before", { workerCheckpoint });
    say(JSON.stringify({ ready: true, mutationPerformed: false, phase: options.protectedPhase, from: review.from, to: review.to,
      pending: review.database.migrations.map(row => row.filename), targetSha256: review.database.targetSha256 }, null, 2)); return;
  }
  if (reconcile) {
    const attempt = JSON.parse(readClosedR2PrivateBytes(protectedDatabaseGuardPath, repository, 524288));
    operationId = attempt.operationId; operationDirectory = join(protectedOperationRoot, operationId);
    if (attempt.operationDirectory !== operationDirectory) throw new DeploymentError("보호 DB 복구 경로가 다릅니다.");
  } else {
    if (retry) {
      const bytes = readClosedR2PrivateBytes(protectedDatabaseGuardPath, repository, 524288), previous = JSON.parse(bytes);
      if (previous.status !== "not_applied" || previous.reviewSha256 !== protectedRolloutPins(review).rollout.sha256
        || previous.from !== review.from || previous.to !== review.to || previous.targetSha256 !== review.database.targetSha256) throw new DeploymentError("정확한 not-applied reconcile 뒤의 명시 재시도만 허용합니다.");
      previousNotAppliedSha256 = hash(bytes);
    }
    operationId = randomUUID(); operationDirectory = join(protectedOperationRoot, operationId);
    mkdirSync(protectedOperationRoot, { recursive: true, mode: 0o700 }); mkdirSync(operationDirectory, { mode: 0o700 }); mkdirSync(join(operationDirectory, "backup"), { mode: 0o700 });
  }
  const engine = await createProtectedPrelaunchDatabase({ repositoryRoot: repository, configPath: options.dbConfig, operationDirectory, operationId,
    guardPath: protectedDatabaseGuardPath, review, reviewSha256: protectedRolloutPins(review).rollout.sha256,
    readMigrations: async () => protectedMigrationsAt(review), previousNotAppliedSha256, workerCheckpoint,
    assertBoundary: async () => { lease.verify(); verifyProtectedBoundary(review, live);
      if (maintenance) await verifyReader();
      if (workerCheckpoint) verifyQuantityV4WorkerBoundary(review, "before"); }, checkCancelled: () => cancellation.check() });
  const lease = await acquireClosedR2ControlLease(loadClosedR2Review(repository), repository);
  let receipt;
  try { receipt = reconcile ? await engine.reconcile() : await engine.apply(); }
  finally { await lease.release(); }
  if (receipt.status === "committed") await durableJson(databaseStatePath, { changed: true, outcome: "committed", backwardCompatible: false,
    protectedRollout: { reviewSha256: protectedRolloutPins(review).rollout.sha256, receiptSha256: hash(readClosedR2PrivateBytes(join(operationDirectory, "receipt.json"), repository, 524288)) } });
  say(JSON.stringify({ status: receipt.status, phase: options.protectedPhase, readerReady: maintenance ? receipt.status === "committed" ? receipt.readerReady : null : false, writerEnabled: maintenance ? receipt.status === "committed" ? receipt.writerEnabled : null : false, automaticRetryAllowed: false }, null, 2));
}
async function runProtectedWriterPhase(options, action, review) {
  const quantityOff = review.feature === QUANTITY_V4_FEATURE && options.protectedPhase.startsWith("writer-off");
  const successor = loadCookedWeightAttestationSuccessor(repository);
  const databaseMaintenance = loadCurrentDatabaseMaintenance(repository);
  const quantityCloseOnAttestation = quantityOff && Boolean(successor);
  const workerContinuation = successor ? loadCookedWeightAttestationWorkerContinuation(successor, repository) : null;
  const quantityOffReceipt = successor ? loadCookedWeightAttestationQuantityOff(repository, successor) : null;
  const workerCheckpoint = quantityCloseOnAttestation ? successor.predecessor.post.record : review.feature === QUANTITY_V4_FEATURE
    ? quantityOff ? loadQuantityV4WorkerCheckpoint(review, repository, "after", true) : verifyQuantityV4WorkerBoundary(review, "after") : undefined;
  const workerEvidence = quantityCloseOnAttestation ? successor.predecessor.post : review.feature === QUANTITY_V4_FEATURE ? loadQuantityV4WorkerCheckpointEvidence(review, repository, "after", quantityOff) : null;
  if (workerEvidence && !isDeepStrictEqual(workerEvidence.record, workerCheckpoint)) throw new DeploymentError("C04 worker publication changed during fresh validation");
  if (workerCheckpoint && workerCheckpoint.workerDatabaseReceiptSha256 !== loadProtectedDatabaseReceipt(review).pointer.sha256) throw new DeploymentError("C04 writer worker/DB227 terminal bytes differ");
  const { readerReceiptPath: protectedReaderReceiptPath, operationRoot: protectedOperationRoot, writerPrefix } = protectedRolloutPaths(root, review);
  const approval = loadProtectedWriterReview(repository, review);
  const live = current(), context = requireClosedR2Mode(options, live);
  let baselineReview = quantityCloseOnAttestation ? successor.review : context?.rollout?.feature === COOKED_WEIGHT_FEATURE ? context.rollout : review;
  if (review.feature === "recipe-product-source" && existsSync(join(root, "protected-cooked-weight-database-guard.json"))) {
    const successor = loadProtectedRolloutReview(repository, { feature: COOKED_WEIGHT_FEATURE });
    loadProtectedDatabaseReceipt(successor); // A committed C01 baseline is required even while its reader is pending.
    baselineReview = successor;
  }
  const productCloseOnWeightBaseline = review.feature === "recipe-product-source" && baselineReview.feature === COOKED_WEIGHT_FEATURE;
  if (productCloseOnWeightBaseline && !options.protectedPhase.startsWith("writer-off")) throw new DeploymentError("C03 on C01 successor supports only its original safe OFF, never renewed ON");
  if (productCloseOnWeightBaseline) {
    verifyCookedWeightPredecessor(baselineReview, repository);
    loadProtectedDatabaseReceipt(baselineReview);
    verifyProtectedRolloutEvidence(baselineReview, repository);
  }
  const readerBytes = readClosedR2PrivateBytes(protectedReaderReceiptPath, repository, 524288), reader = JSON.parse(readerBytes);
  const readerWorkerEvidence = review.feature === QUANTITY_V4_FEATURE
    ? loadQuantityV4WorkerCheckpointEvidence(review, repository, "after", true, reader.workerReceipt) : null;
  const writerAction = options.protectedPhase.includes("off") ? "writer-off" : "writer-on";
  const exactReader = live.ref === review.to && reader.releaseSha === live.ref && reader.buildId === live.buildId && reader.plistSha256 === hash(live.bytes);
  const safeOffReader = writerAction === "writer-off" && reader.readerFloor === review.to
    && spawnSync("git", ["-C", repository, "merge-base", "--is-ancestor", review.to, live.ref]).status === 0;
  if (!context?.marker.protectedRollout || !(exactReader || safeOffReader) || reader.verifiedFlowsSha256 !== approval.readerFlowsSha256
    || hash(readerBytes) !== (productCloseOnWeightBaseline ? baselineReview.predecessorProtected.readerReceipt.sha256 : (quantityCloseOnAttestation ? successor.review.predecessorQuantity.readerReceipt.sha256 : context.marker.protectedRollout.readerReceiptSha256))
    || (approval.readerReceiptSha256 !== null && hash(readerBytes) !== approval.readerReceiptSha256)) {
    throw new DeploymentError("신형 쓰기는 승인된 실제 reader ready/source/build/plist/floor에서만 전환합니다.");
  }
  verifyProtectedRolloutEvidence(review, repository);
  verifyProtectedBoundary(review, live);
  if (options.protectedPhase.endsWith("-reconcile") || options.protectedPhase.endsWith("-retry")) {
    const pendingPath = join(root, `${writerPrefix}-${protectedRolloutPins(review).writer.sha256}-${writerAction}.json`);
    const pending = JSON.parse(readClosedR2PrivateBytes(pendingPath, repository, 524288));
    if (databaseMaintenance || pending.databaseMaintenance) assertProtectedWriterDatabaseBoundary(pending, databaseMaintenance);
  }
  // Emergency closing remains possible after normal UI descendants or a newer backup.
  // It cannot change target/catalog/authority or lower the reader floor. Migration/ON retain the full platform verifier.
  const adapter = writerAction === "writer-off"
    ? createProtectedPrelaunchAdapter(await createRecordingDockerAdapter({ configPath: options.dbConfig, backupDirectory: root }), baselineReview.feature, baselineReview, databaseMaintenance)
    : await openProtectedPrelaunchTarget({ repositoryRoot: repository, configPath: options.dbConfig, backupDirectory: root, review: databaseMaintenance?.review ?? review });
  if (action === "plan") {
    const observed = await adapter.observe(undefined, "protected-writer-plan");
    if (review.feature === COOKED_WEIGHT_ATTESTATION_FEATURE && writerAction === "writer-on"
      && !options.protectedPhase.endsWith("-reconcile") && observed.quantityWriterEnabled !== true) throw new DeploymentError("Personal attestation fresh writer ON requires quantity ON");
    assertProtectedPrelaunchObservation(quantityCloseOnAttestation ? review : baselineReview, { ...observed, writerEnabled: quantityCloseOnAttestation ? observed.quantityWriterEnabled : false,
      ...(productCloseOnWeightBaseline ? { productWriterEnabled: true } : {}) }, "after", {
      productOffReceipt: productCloseOnWeightBaseline ? null : cookedWeightProductOffReceipt(review), reviewSha256: protectedRolloutPins(baselineReview).rollout.sha256,
      workerCheckpoint, safeQuantityOff: quantityOff, safeAttestationOff: review.feature === COOKED_WEIGHT_ATTESTATION_FEATURE && writerAction === "writer-off",
      attestationSuccessor: quantityCloseOnAttestation ? successor : undefined, approvedWorkerPolicy: workerContinuation?.observation, quantityOffReceipt, databaseMaintenance });
    say(JSON.stringify({ ready: true, mutationPerformed: false, phase: options.protectedPhase, readerFloor: reader.readerFloor, feature: review.feature, writerEnabled: productCloseOnWeightBaseline ? observed.productWriterEnabled : observed.writerEnabled }, null, 2)); return;
  }
  const guardPath = join(root, `${writerPrefix}-${protectedRolloutPins(review).writer.sha256}-${writerAction}.json`);
  let operationId, operationDirectory, previousNotAppliedSha256;
  if (options.protectedPhase.endsWith("-reconcile")) {
    const attempt = JSON.parse(readClosedR2PrivateBytes(guardPath, repository, 524288));
    operationId = attempt.operationId; operationDirectory = join(protectedOperationRoot, operationId);
    if (attempt.operationDirectory !== operationDirectory) throw new DeploymentError("신형 쓰기 복구 작업 경로가 다릅니다.");
  } else {
    if (options.protectedPhase.endsWith("-retry")) {
      const bytes = readClosedR2PrivateBytes(guardPath, repository, 524288), previous = JSON.parse(bytes);
      if (previous.status !== "not_applied" || previous.action !== writerAction || previous.approvalSha256 !== protectedRolloutPins(review).writer.sha256
        || previous.readerReceiptSha256 !== hash(readerBytes)) throw new DeploymentError("같은 승인/control/reader의 not-applied 뒤에만 명시 재시도할 수 있습니다.");
      const offPath = join(root, `${writerPrefix}-${protectedRolloutPins(review).writer.sha256}-writer-off.json`);
      if (writerAction === "writer-on" && existsSync(offPath) && JSON.parse(readClosedR2PrivateBytes(offPath, repository, 524288)).status === "committed") {
        throw new DeploymentError("safe OFF를 새 ON 재시도로 되돌릴 수 없습니다.");
      }
      previousNotAppliedSha256 = hash(bytes);
    }
    operationId = randomUUID(); operationDirectory = join(protectedOperationRoot, operationId);
    mkdirSync(protectedOperationRoot, { recursive: true, mode: 0o700 }); mkdirSync(operationDirectory, { mode: 0o700 });
  }
  const journal = createProtectedPrelaunchJournal({ repositoryRoot: repository, operationDirectory, operationId, guardPath, previousNotAppliedSha256 });
  const lease = await acquireClosedR2ControlLease(loadClosedR2Review(repository), repository);
  let receipt;
  try {
    const engine = createProtectedPrelaunchWriter({ review, reviewSha256: protectedRolloutPins(review).rollout.sha256, approval,
      approvalSha256: protectedRolloutPins(review).writer.sha256, readerReceipt: reader, readerReceiptSha256: hash(readerBytes), operationId,
      action: writerAction, adapter, journal, baselineReview, baselineReviewSha256: protectedRolloutPins(baselineReview).rollout.sha256,
      productOffReceipt: productCloseOnWeightBaseline ? null : cookedWeightProductOffReceipt(review), workerCheckpoint,
      attestationSuccessor: quantityCloseOnAttestation ? successor : undefined, approvedWorkerPolicy: workerContinuation?.observation, quantityOffReceipt, databaseMaintenance,
      readerWorkerCheckpoint: readerWorkerEvidence?.record, workerReceipt: workerEvidence?.pointer,
      workerPolicyRepair: workerEvidence?.policyRepair ? { ...workerEvidence.policyRepair, earlierOrigin: readerWorkerEvidence.origin.record } : undefined,
      assertBoundary: async () => { lease.verify(); verifyProtectedBoundary(review, live);
        if (workerCheckpoint && !quantityOff) verifyQuantityV4WorkerBoundary(review, "after"); } });
    let safeOffReceipt;
    if (options.protectedPhase === "writer-on-reconcile") {
      const offPath = join(root, `${writerPrefix}-${protectedRolloutPins(review).writer.sha256}-writer-off.json`);
      if (existsSync(offPath)) safeOffReceipt = JSON.parse(readClosedR2PrivateBytes(offPath, repository, 524288));
    }
    receipt = options.protectedPhase.endsWith("-reconcile") ? await engine.reconcile({ safeOffReceipt }) : await engine.apply();
  }
  finally { await lease.release(); }
  say(JSON.stringify({ status: receipt.status, writerEnabled: receipt.writerEnabled, readerFloor: receipt.readerFloor, automaticReactivation: false }, null, 2));
}
async function completeProtectedReaderRecovery(options, review) {
  const { readerReceiptPath: protectedReaderReceiptPath } = protectedRolloutPaths(root, review);
  const state = JSON.parse(readClosedR2PrivateBytes(recoveryPath, repository, 524288)), live = current();
  if (state.ref !== review.to || live.ref !== review.to || !state.closedR2?.protectedRollout) throw new DeploymentError("같은 보호 reader의 forward 복구 기록이 필요합니다.");
  requireClosedR2Mode(options, live);
  assertClosedR2LiveUnchanged({ ref: state.ref, cwd: state.checkout, buildId: state.buildId,
    bytes: readFileSync(plistPath) }, live);
  if (hash(live.bytes) !== state.targetPlistHash) throw new DeploymentError("보호 reader 복구 plist가 다릅니다.");
  await verifyProtectedBaseline(review, state.databaseVerification, options);
  const base = await createRecordingDockerAdapter({ configPath: options.dbConfig, backupDirectory: root });
  const observed = await createProtectedPrelaunchAdapter(base, review.feature, review).observe(undefined, "protected-reader-recovery");
  const personalSuccessor = review.feature === COOKED_WEIGHT_ATTESTATION_FEATURE ? loadCookedWeightAttestationSuccessor(repository) : null;
  const personalWorker = personalSuccessor ? loadCookedWeightAttestationWorkerContinuation(personalSuccessor, repository) : null;
  if (personalSuccessor && observed.attestationRowsEmpty !== true) throw new DeploymentError("Personal facts prevent predecessor reader recovery");
  assertProtectedPrelaunchObservation(review, observed, "after", {
    approvedWorkerPolicy: personalWorker?.observation,
    workerCheckpoint: review.feature === QUANTITY_V4_FEATURE ? verifyQuantityV4WorkerBoundary(review, "after") : undefined }); // OFF required throughout first-reader recovery.
  const closed = loadClosedR2Review(repository), lease = await acquireClosedR2ControlLease(closed, repository);
  try {
    await smoke(3100, state.checkout, state.buildId); await verifyClosedR2Web(3100); lease.verify();
    assertClosedR2LiveUnchanged(live, current());
    const pointer = state.closedR2.protectedRollout.readerReceipt, bytes = readClosedR2PrivateBytes(pointer.path, repository, 524288);
    if (hash(bytes) !== pointer.sha256) throw new DeploymentError("보호 reader candidate receipt가 바뀌었습니다.");
    await durableJson(protectedReaderReceiptPath, JSON.parse(bytes));
    await durableJson(statePath, state); durableUnlink(recoveryPath);
    say(JSON.stringify({ status: "reader_ready", readerFloor: review.to, serviceChanges: 0, databaseWrites: 0 }));
  } finally { await lease.release(); }
}
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
  const maintenanceAttempt = readRecipeSaveRecoveryAttempt(repository) ?? readNutritionValidatorAttempt(repository);
  if (maintenanceAttempt && !["committed", "not_applied"].includes(maintenanceAttempt.record.status)
    && !([NUTRITION_VALIDATOR_FEATURE,RECIPE_SAVE_RECOVERY_FEATURE].includes(options.protectedFeature) && options.protectedPhase === "reconcile")) {
    throw new DeploymentError("Nutrition229 outcome unresolved; historical228 cannot authorize another deployment or writer");
  }
  const protectedPhase = currentProtectedPhase(live);
  if (protectedPhase && !options.reviewedProtectedRollout && !protectedPhase.normalDeploymentAllowed) {
    throw new DeploymentError("보호 DB 전환이 미확정이거나 새 reader가 준비되지 않았습니다. 기존 DB219 승계를 사용할 수 없습니다.");
  }
  let fenceOptions = options;
  if (options.reviewedProtectedRollout) { loadProtectedRolloutReview(repository, { feature: options.protectedFeature, ref: options.ref, phase: options.protectedPhase }); fenceOptions = { reviewedClosedR2Maintenance: true }; }
  const records = [];
  for (const path of [recoveryPath, statePath]) {
    if (!existsSync(path)) continue;
    const state = JSON.parse(readFileSync(path, "utf8"));
    assertClosedR2MaintenanceFence(state, fenceOptions);
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
  assertClosedR2MaintenanceFence(recorded.state, fenceOptions);
  const review = loadClosedR2Review(repository);
  const marker = JSON.parse(bytes);
  let rollout;
  if (marker.protectedRollout) {
    rollout = loadProtectedRolloutReview(repository, { reviewSha256: marker.protectedRollout.reviewSha256 });
    assertProtectedClosedR2Marker({ ...recorded, marker, markerSha256: hash(bytes), live: { ...live, plistHash: hash(live.bytes) },
      closedReview: review, rollout, reviewSha256: protectedRolloutPins(rollout).rollout.sha256, ...protectedMarkerAuthority(marker, rollout) });
    git(["merge-base", "--is-ancestor", rollout.to, live.ref]);
    const maintenance = maintenanceAttempt?.review.feature === RECIPE_SAVE_RECOVERY_FEATURE && maintenanceAttempt.record.status !== "committed"
      ? loadNutritionValidatorMaintenance(repository) : maintenanceAttempt?.record.status === "committed" ? loadCurrentDatabaseMaintenance(repository) : null;
    if (maintenance) {
      git(["merge-base", "--is-ancestor", maintenance.review.sourceReaderRef, live.ref]);
      assertNutritionValidatorMarker(maintenance, marker,
        live.ref === maintenance.review.sourceReaderRef && hash(bytes) === maintenance.review.closedArtifactSha256);
    }
    if (!options.reviewedProtectedRollout && !rollback) {
      const protectedReaderReceiptPath = protectedRolloutPaths(root, rollout).readerReceiptPath;
      const reader = JSON.parse(readClosedR2PrivateBytes(protectedReaderReceiptPath, repository, 524288));
      if (hash(readClosedR2PrivateBytes(protectedReaderReceiptPath, repository, 524288)) !== marker.protectedRollout.readerReceiptSha256
        || reader.readerFloor !== rollout.to) throw new DeploymentError("실제 보호 reader가 아직 ready로 기록되지 않았습니다.");
    }
  } else assertClosedR2LiveMarker({ ...recorded, marker, markerSha256: hash(bytes), live: { ...live, plistHash: hash(live.bytes) }, review, reviewSha256: CLOSED_R2_REVIEW_PIN.sha256 });
  if (!isDeepStrictEqual(marker.historicalProofs, verifyClosedR2HistoricalProofs(review, repository))) throw new DeploymentError("닫힌 R2 marker의 원 proof 기록이 다릅니다.");
  if (!rollback && !options.reviewedClosedR2Maintenance && !options.reviewedProtectedRollout) {
    assertClosedR2ContinuationOptions(options);
    git(["merge-base", "--is-ancestor", review.to, live.ref]); // Continuation starts from the reviewed F01 lineage, never a bootstrap predecessor.
  }
  return { ...recorded, marker, markerPath: path, review, rollout };
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
  const previous = JSON.parse(bytes), marker = JSON.parse(markerBytes);
  if (marker.protectedRollout) {
    if (hash(bytes) !== state.closedR2.previousStateSha256 || hash(markerBytes) !== state.closedR2.previousArtifactSha256
      || previous.ref !== state.closedR2.from || previous.checkout !== state.previousCwd || previous.buildId !== state.previousBuildId
      || previous.targetPlistHash !== hash(plistBytes)) throw new DeploymentError("직전 보호 reader state/marker/plist가 다릅니다.");
    const rollout = loadProtectedRolloutReview(repository, { reviewSha256: marker.protectedRollout.reviewSha256 });
    assertProtectedClosedR2Marker({ state: previous, marker, markerSha256: hash(markerBytes), live: { ref: previous.ref, cwd: previous.checkout, buildId: previous.buildId,
      plistHash: hash(plistBytes), plist: parsePlist(plistBytes) }, closedReview: review, rollout, reviewSha256: protectedRolloutPins(rollout).rollout.sha256, ...protectedMarkerAuthority(marker, rollout) });
    return previous;
  }
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
  const protectedReader = options.reviewedProtectedRollout === true && options.protectedPhase === "reader";
  const rollout = protectedReader ? loadProtectedRolloutReview(repository, { feature: options.protectedFeature, ref: options.ref, phase: options.protectedPhase }) : closedContext?.rollout;
  const protectedReaderReceiptPath = rollout ? protectedRolloutPaths(root, rollout).readerReceiptPath : join(root, "protected-reader-ready.json");
  const readOnlyDatabase = options.alreadyAppliedDb || protectedReader;
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
  const selection = plan(options.ref, live, options.refOption, options.verifyScript, options.skipAutomatedTests, options.testScript, youtubeTrialReview, youtubeResolutionReview, options.reviewedIntegratedMasterReadiness,
    protectedReader ? { review: rollout, context: closedContext } : null);
  const patch = readEnvironmentPatch(options.envFile, repository);
  if (options.reviewedClosedR2Maintenance) {
    validateClosedR2Candidate(closedReview, live, selection, patch, options, closedContext);
    verifyClosedR2Control(closedReview, repository);
  }
  if (closedReview && selection.scope.database.length && !protectedReader) {
    const handoff = options.alreadyAppliedDb === true ? nutritionSourceHandoff(live, selection) : null;
    if (!handoff) throw new DeploymentError("닫힘 유지/승계에 SQL source 변경은 허용하지 않습니다.");
    assertNutritionValidatorSourceHandoff(handoff);
  }
  const needsDatabase = selection.scope.database.length > 0 || Boolean(options.dbConfig);
  if (needsDatabase && !options.dbConfig) throw new DeploymentError("DB 변경이 포함되어 있습니다. --db-config <비공개 full-local 설정 파일>을 지정하세요. 웹은 변경하지 않았습니다.");
  if (needsDatabase && !readOnlyDatabase && !options.dbCompatible
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
  let readerFence;
  let readerReceipt;
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
      nextPlist = protectedReader ? protectedReaderPlist(rollout, live.plist, checkout)
        : retargetPlist(applyEnvironmentPatch(checkout, live.plist, patch), checkout);
      const readinessPlist = nextPlist;
      const databasePlan = options.reviewedIntegratedMasterReadiness
        ? await verifyIntegratedMasterDatabase({ repositoryRoot: checkout, configPath: options.dbConfig,
          backupDirectory: root, releaseSha: selection.target,
          descriptor: selection.integratedReview.descriptor, phase: "predecessor" })
        : readOnlyDatabase ? await verifyAppliedDatabase(options, checkout) : null;
      nextPlist = await stageRound2Readiness(nextPlist, release, live, selection,
        needsDatabase && !readOnlyDatabase && !options.reviewedIntegratedMasterReadiness,
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
      const reviewedDatabase = nutritionRecoveryDatabase ?? pieceUnitDatabase ?? youtubeResolutionDatabase
        ?? (rollout ? { changed: true, outcome: "committed", backwardCompatible: false, protectedRollout: { reviewSha256: protectedRolloutPins(rollout).rollout.sha256 } } : undefined);
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
          kind: protectedReader ? "protected-reader" : options.reviewedClosedR2Maintenance ? closedContext ? "f01-retry" : "f01" : "continuation",
          from: live.ref, to: selection.target, buildId, reviewSha256: CLOSED_R2_REVIEW_PIN.sha256,
          checkout, previousCwd: live.cwd, previousBuildId: live.buildId, previousPlistSha256: hash(originalBackupBytes), targetPlistSha256: hash(nextBytes),
          ...(closedContext ? { previousStateSha256, previousArtifactSha256: closedContext.state.closedR2.artifactSha256 } : {}),
          pauseReceiptSha256: closedReview.pause.sha256, controlSha256: closedReview.controlSha256,
          databasePlanSha256: rollout ? hash(JSON.stringify({ source: rollout.database.after, applied: rollout.database.after })) : closedReview.databasePlanSha256,
          ...(loadCurrentDatabaseMaintenance(repository) ? { databaseMaintenance: nutritionValidatorMaintenanceBinding(loadCurrentDatabaseMaintenance(repository)) } : {}),
          historicalReadinessSha256: closedReview.historicalReadiness.sha256, historicalProofs: verifyClosedR2HistoricalProofs(closedReview, repository),
          consentGeneration: closedReview.consentGeneration, rollbackPlistSha256: hash(closedRollbackBytes) };
        if (protectedReader) {
          const database = loadProtectedDatabaseReceipt(rollout);
          const workerEvidence = rollout.feature === QUANTITY_V4_FEATURE ? loadQuantityV4WorkerCheckpointEvidence(rollout, repository, "after") : null;
          readerReceipt = protectedRolloutReaderReceipt({ review: rollout, reviewSha256: protectedRolloutPins(rollout).rollout.sha256,
            databaseReceipt: database.record, live: { ref: selection.target, buildId, bytes: Buffer.from(nextBytes) }, verifiedFlowsSha256: rollout.readerFlowsSha256,
            databaseReceiptSha256: database.pointer.sha256, workerReceiptSha256: workerEvidence?.pointer.sha256, workerReceipt: workerEvidence?.pointer,
            workerCheckpoint: rollout.feature === QUANTITY_V4_FEATURE ? verifyQuantityV4WorkerBoundary(rollout, "after") : undefined });
          const path = join(release, "protected-reader-ready.json");
          await durableJson(path, readerReceipt, true);
          const readerPointer = { path, sha256: hash(readClosedR2PrivateBytes(path, repository, 524288)) };
          closedR2.protectedRollout = { reviewSha256: protectedRolloutPins(rollout).rollout.sha256, databaseReceipt: database.pointer,
            databaseReceiptSha256: database.pointer.sha256, readerReceipt: readerPointer, readerReceiptSha256: readerPointer.sha256 };
          if (rollout.feature === COOKED_WEIGHT_ATTESTATION_FEATURE) closedR2.protectedRollout.predecessorQuantity = rollout.predecessorQuantity;
          if (rollout.feature === COOKED_WEIGHT_FEATURE) closedR2.protectedRollout.predecessorProtected = rollout.predecessorProtected;
          if (rollout.feature === QUANTITY_V4_FEATURE) Object.assign(closedR2.protectedRollout, { predecessorProtected: rollout.predecessorProtected,
            consumersReceiptSha256: rollout.consumersReceipt.sha256, workerReceiptSha256: workerEvidence.pointer.sha256 });
        } else if (closedContext?.marker.protectedRollout) closedR2.protectedRollout = closedContext.marker.protectedRollout;
        const artifactPath = join(release, closedR2ArtifactName);
        await durableJson(artifactPath, closedR2, true);
        state.closedR2 = { ...closedR2, artifactSha256: hash(readClosedR2PrivateBytes(artifactPath, repository)) };
      }
      if (needsDatabase && !readOnlyDatabase && !options.reviewedIntegratedMasterReadiness) {
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
      if (readOnlyDatabase) {
        const finalPlan = await verifyAppliedDatabase(options, checkout);
        if (JSON.stringify(finalPlan) !== JSON.stringify(databasePlan)) throw new DeploymentError("준비 중 DB 이력이 바뀌었습니다.");
        if (closedReview) {
          if (rollout) await verifyProtectedBaseline(rollout, finalPlan, options);
          else assertClosedR2Database(closedReview, finalPlan);
        }
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
        if (protectedReader) {
          const base = await createRecordingDockerAdapter({ configPath: options.dbConfig, backupDirectory: root });
          if (hash(JSON.stringify(await base.inspect())) !== rollout.database.targetSha256) {
            throw new DeploymentError("reader 잠금 대상이 승인된 운영 DB와 다릅니다.");
          }
          readerFence = base.session(`protected-reader-${randomUUID()}`);
          await readerFence.query(protectedReaderFenceSql(rollout).begin);
          if ((await readerFence.query(protectedReaderFenceSql(rollout).check)).trim() !== "t") {
            throw new DeploymentError("구 predecessor 보상은 모든 신형 쓰기 OFF가 잠긴 동안만 허용합니다.");
          }
          if (rollout.feature === QUANTITY_V4_FEATURE) assertProtectedPrelaunchObservation(rollout,
            await createProtectedPrelaunchAdapter(base, rollout.feature, rollout).observe(sql => readerFence.query(sql), "protected-c04-reader"), "after",
            { workerCheckpoint: verifyQuantityV4WorkerBoundary(rollout, "after") });
        }
      }
      atomicWrite(recoveryPath, JSON.stringify(state));
    },
    restoreProhibitedReason: options.reviewedPieceUnitReadiness ? PIECE_UNIT_RECOVERY_MESSAGE
      : options.reviewedYoutubeResolutionReadiness ? YOUTUBE_RESOLUTION_ROLLBACK_REASON : undefined,
    activate: async () => {
      if (closedLease) { closedLease.verify(); assertClosedR2LiveUnchanged(live, current()); }
      if (readerFence && (await readerFence.query(protectedReaderFenceSql(rollout).check)).trim() !== "t") throw new DeploymentError("새 reader 활성화 직전 OFF fence가 바뀌었습니다.");
      if (protectedReader && rollout.feature === COOKED_WEIGHT_ATTESTATION_FEATURE
        && (await readerFence.query("SELECT NOT EXISTS(SELECT 1 FROM private.cooked_weight_user_attestations);")).trim() !== "t") throw new DeploymentError("Personal attestation first reader requires empty facts under the OFF fence");
      say("웹 프로세스 교체 중"); await switchWeb(nextBytes);
    },
    verify: async () => {
      await smoke(3100, checkout, buildId);
      if (closedLease) { await verifyClosedR2Web(3100); closedLease.verify(); }
      if (protectedReader) {
        assertClosedR2LiveUnchanged({ ref: state.ref, cwd: checkout, buildId, bytes: Buffer.from(nextBytes) }, current());
        await verifyProtectedBaseline(rollout, state.databaseVerification, options);
        await durableJson(protectedReaderReceiptPath, readerReceipt); // Ready only after the actual exact reader is healthy.
      }
    },
    restore: async () => {
      if (protectedReader) {
        const floorPublished = existsSync(protectedReaderReceiptPath) && hash(readClosedR2PrivateBytes(protectedReaderReceiptPath, repository, 524288)) === state.closedR2.protectedRollout.readerReceiptSha256;
        if (rollout.feature === COOKED_WEIGHT_ATTESTATION_FEATURE && (await readerFence.query("SELECT NOT EXISTS(SELECT 1 FROM private.cooked_weight_user_attestations);")).trim() !== "t") throw new DeploymentError("Personal facts prevent old-reader compensation");
        const offLocked = Boolean(readerFence) && (await readerFence.query(protectedReaderFenceSql(rollout).check)).trim() === "t";
        assertProtectedReaderCompensation({ floorPublished, offLocked, actual: current(), before: live,
          target: { ref: state.ref, cwd: state.checkout, buildId: state.buildId, plistSha256: state.targetPlistHash }, closedPreviousPlistSha256: hash(closedRollbackBytes) });
      }
      if (closedLease) {
        closedLease.verify();
        assertClosedR2CompensationTarget({ actual: current(), before: live,
          target: { ref: state.ref, cwd: state.checkout, buildId: state.buildId, plistSha256: state.targetPlistHash }, closedPreviousPlistSha256: hash(closedRollbackBytes) });
        await preserveClosedR2PredecessorMarker(state, closedReview);
        if (rollout && !protectedReader) {
          const maintenance = loadCurrentDatabaseMaintenance(repository);
          if (maintenance && state.ref === maintenance.review.migrationSourceRef && live.ref === maintenance.review.sourceReaderRef) {
            assertNutritionValidatorReaderCompensation(maintenance, { ref: live.ref, buildId: live.buildId, plistSha256: hash(live.bytes),
              validatorSha256: hash(readFileSync(join(live.cwd, "lib/server/recipe-nutrition-snapshot.ts"))) }, state.ref);
            // Use B's already-applied229 source for DB verification. A has228 files but the same verified reader runtime.
            const currentPlan = await verifyAppliedDatabase(options, state.checkout);
            await verifyProtectedBaseline(rollout, currentPlan, options);
          }
          const receipt = JSON.parse(readClosedR2PrivateBytes(protectedReaderReceiptPath, repository, 524288));
          if (maintenance) git(["merge-base", "--is-ancestor", maintenance.review.sourceReaderRef, state.closedR2.from]);
          assertProtectedReaderRollback({ receipt, targetSha: state.closedR2.from, isDescendant: spawnSync("git", ["-C", repository, "merge-base", "--is-ancestor", receipt.readerFloor, state.closedR2.from]).status === 0 });
        }
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
  } finally {
    if (readerFence) { try { await readerFence.query("ROLLBACK;"); await readerFence.close(); } catch { readerFence.stop(); } }
    if (closedLease) await closedLease.release();
  }
}
async function rollback() {
  const recovering = existsSync(recoveryPath);
  const record = recovering ? recoveryPath : statePath;
  if (!existsSync(record)) throw new DeploymentError("저장된 이전 웹 배포가 없습니다.");
  const state = JSON.parse(readFileSync(record, "utf8"));
  if (existsSync(protectedDatabaseGuardPath)) {
    const guard = JSON.parse(readClosedR2PrivateBytes(protectedDatabaseGuardPath, repository, 524288));
    if (guard.status !== "not_applied") throw new DeploymentError("보호 DB 전환 guard/reader floor가 있어 수동 구 웹 rollback을 거부합니다. DB를 자동 복구하지 않습니다.");
  }
  const weightGuard = join(root, "protected-cooked-weight-database-guard.json");
  if (existsSync(weightGuard) && JSON.parse(readClosedR2PrivateBytes(weightGuard, repository, 524288)).status !== "not_applied") throw new DeploymentError("C01 DB/reader floor prevents old-reader rollback; no automatic DB restore");
  for (const stage of ["consumers", "worker"]) {
    const quantityGuard = join(root, `protected-quantity-v4-${stage}-database-guard.json`);
    if (existsSync(quantityGuard) && JSON.parse(readClosedR2PrivateBytes(quantityGuard, repository, 524288)).status !== "not_applied") throw new DeploymentError("C04 staged DB/reader floor prevents old-reader rollback; no automatic DB restore");
  }
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
    say("--reviewed-protected-rollout --protected-phase database|database-retry|reader|reconcile|writer-on|writer-off|writer-on-reconcile|writer-off-reconcile|writer-on-retry|writer-off-retry: 정확한 보호 DB/reader 승인과 별도 ON/OFF 승인 경로. 코드에 고정된 승인 자료와 정확히 일치해야 실행할 수 있습니다.");
    say("레시피 수정 저장·재시도 exact229→231: 같은 nutrition-* phase와 별도 코드 고정 ref/review가 필요합니다. 미결속 PIN에서는 거절하며 두 SQL commit 뒤에만 exact full-source를 반영합니다.");
    say("영양 validator exact228→229: --protected-phase nutrition-database|nutrition-database-retry|nutrition-reconcile. 원228 권위와 별도 PIN이 필요하며 sourceReaderRef를 먼저 실제 반영해야 합니다.");
    say("개인 실측 exact227→228: --protected-phase attestation-database|attestation-reconcile|attestation-reader|attestation-writer-on|attestation-writer-off 및 고정 retry/reconcile 단계. 별도 개인 successor/writer PIN이 필요하며 원 C04 권위는 유지합니다.");
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
  let protectedReview;
  if (options.reviewedProtectedRollout) {
    protectedReview = loadProtectedRolloutReview(repository, { feature: options.protectedFeature, ref: options.ref, phase: options.protectedPhase }); // Deny before live/env/private-state access. No CLI or env pin override.
    options.protectedFeature = protectedReview.feature;
    if (options.protectedPhase.startsWith("nutrition-")) options.protectedPhase = options.protectedPhase.slice("nutrition-".length);
    if (options.protectedPhase.startsWith("attestation-")) options.protectedPhase = options.protectedPhase.slice("attestation-".length);
    if (options.protectedPhase.startsWith("writer-")) loadProtectedWriterReview(repository, protectedReview);
  }
  if (options.reviewedClosedR2Maintenance) loadClosedR2Review(repository); // Fail before live/env access while the pin is empty.
  if (git(["rev-parse", "--show-toplevel"]) !== repository || !/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)netsus\/homecook(?:\.git)?$/u.test(git(["remote", "get-url", "origin"]))) throw new DeploymentError("배포 저장소는 netsus/homecook Git 저장소여야 합니다.");
  if (action === "status") {
    const live = current(), { cwd, ref, buildId } = live;
    const loaded = spawnSync("/bin/launchctl", ["print", service], { stdio: "ignore" }).status === 0;
    const record = existsSync(recoveryPath) ? recoveryPath : statePath;
    const recordedDatabase = existsSync(databaseStatePath) ? JSON.parse(readFileSync(databaseStatePath, "utf8")) : existsSync(record) ? JSON.parse(readFileSync(record, "utf8")).database ?? null : null;
    const reviewedDatabase = ref === YOUTUBE_RESOLUTION_RELEASE_SHA
      ? youtubeResolutionDatabaseStateFromReview(await loadYoutubeResolutionReview()) : null;
    const protectedPhase = currentProtectedPhase(live);
    const database = protectedPhase ? { ...protectedPhase, outcome: protectedPhase.phase === "committed" ? "committed" : protectedPhase.phase === "not_applied" ? "not_applied" : "unknown" }
      : currentDatabaseState({ currentRef: ref, reviewedReleaseSha: YOUTUBE_RESOLUTION_RELEASE_SHA, reviewedDatabase, recordedDatabase });
    const closedState = existsSync(record) ? JSON.parse(readFileSync(record, "utf8")).closedR2 : null;
    say(JSON.stringify({ cwd, ref, buildId, loaded, database, rollbackAvailable: (existsSync(statePath) || existsSync(recoveryPath)) && !existsSync(integratedDatabaseGuardPath) && !protectedPhase && !closedState?.rolledBack,
      closedR2Maintenance: Boolean(closedState), recoveryPending: existsSync(recoveryPath), integratedDatabaseGuardPresent: existsSync(integratedDatabaseGuardPath) }, null, 2));
    return;
  }
  if (action === "plan") {
    if (protectedReview && options.protectedPhase !== "reader") {
      if (options.protectedPhase.startsWith("writer-")) await runProtectedWriterPhase(options, action, protectedReview);
      else await runProtectedDatabasePhase(options, action, protectedReview);
      return;
    }
    const live = current(), closedContext = requireClosedR2Mode(options, live);
    if (options.reviewedNutritionRecoveryReadiness) await loadNutritionRecoveryReview();
    const youtubeTrialReview = options.reviewedYoutubeTrialReadiness ? await loadYoutubeTrialReview() : null;
    if (youtubeTrialReview) await verifyYoutubeTrialSourceBackfill({ review: youtubeTrialReview, repositoryRoot: repository });
    const youtubeResolutionReview = options.reviewedYoutubeResolutionReadiness ? await loadYoutubeResolutionReview() : null;
    const selection = plan(options.ref, live, options.refOption, options.verifyScript, options.skipAutomatedTests, options.testScript, youtubeTrialReview, youtubeResolutionReview, options.reviewedIntegratedMasterReadiness,
      protectedReview ? { review: protectedReview, context: closedContext } : null);
    const environmentKeys = Object.keys(readEnvironmentPatch(options.envFile, repository)).sort();
    if (protectedReview) {
      loadProtectedDatabaseReceipt(protectedReview);
    } else if (options.reviewedClosedR2Maintenance) {
      const review = loadClosedR2Review(repository), patch = readEnvironmentPatch(options.envFile, repository);
      validateClosedR2Candidate(review, live, selection, patch, options, closedContext);
      verifyClosedR2Control(review, repository);
    } else if (closedContext) {
      assertRound2InheritanceBoundaries({ previous: live.plist, next: live.plist, files: selection.files, databaseDeployment: selection.scope.database.length > 0,
        quantityPublicReadDigests: quantityPublicReadDigests(live, selection, closedContext), nutritionMaintenanceHandoff: nutritionSourceHandoff(live, selection) });
      verifyClosedR2Control(closedContext.review, repository);
    }
    say(JSON.stringify({ ...selection, environmentKeys, database: { required: selection.scope.database.length > 0 || Boolean(options.dbConfig), configProvided: Boolean(options.dbConfig), readOnly: Boolean(options.alreadyAppliedDb || options.reviewedIntegratedMasterReadiness), requiresCompatibilityConfirmation: (selection.scope.database.length > 0 || Boolean(options.dbConfig)) && !options.dbCompatible && !options.alreadyAppliedDb && !options.reviewedIntegratedMasterReadiness, note: options.reviewedIntegratedMasterReadiness ? "DB218 선행 상태를 읽기 전용으로 고정하고 웹만 먼저 배포합니다." : "DB 이력·현재 스키마·추가형 변경 여부는 배포 시 대상 커밋에서 검사합니다." } }, null, 2));
    return;
  }
  mkdirSync(join(root, "releases"), { recursive: true, mode: 0o700 });
  chmodSync(root, 0o700);
  const lock = acquirePrelaunchDeployLock();
  const onSignal = () => { void cancellation.request(); };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  try {
    const logPath = join(root, `${action}-${Date.now()}.log`);
    logFd = openSync(logPath, "wx", 0o600);
    say(`비공개 로그: ${logPath}`);
    if (action === "deploy") {
      await logged("git", ["-C", repository, "fetch", "origin", "master"], {});
      if (protectedReview && options.protectedPhase !== "reader") {
        if (options.protectedPhase.startsWith("writer-")) await runProtectedWriterPhase(options, action, protectedReview);
        else await runProtectedDatabasePhase(options, action, protectedReview);
      } else if (protectedReview && existsSync(recoveryPath)) await completeProtectedReaderRecovery(options, protectedReview);
      else await deploy(options);
    }
    else if (action === "record-youtube-resolution-database") await recordYoutubeResolutionDatabase(options);
    else if (action === "record-integrated-master-database") await recordIntegratedMasterDatabase(options);
    else await rollback();
  } finally {
    await cancellation.drain();
    if (logFd !== undefined) closeSync(logFd);
    lock.release();
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }
}
main().catch((error) => {
  process.stderr.write(`${error instanceof DeploymentError ? error.message : "배포 도구 실패. 비공개 로그와 웹 상태를 확인하세요."}\n`);
  process.exitCode = 1;
});
