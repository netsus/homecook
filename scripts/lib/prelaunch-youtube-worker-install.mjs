/** Operator-only worker install for one reviewed prelaunch YouTube trial. */
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { homedir } from "node:os";
import { isDeepStrictEqual } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { buildYoutubeExtractionWorkerInstallPlan, loadYoutubeExtractionWorkerRuntimeInputs, parseLaunchctlPrintStatus } from "./youtube-extraction-worker-ops.mjs";
import { getLocalMacProductionReleasePaths } from "./local-mac-production-release.mjs";
import { createRecordingDockerAdapter, privatePath } from "./marketing-round2-controlled-deploy.mjs";
import { attestCurrentYoutubeTrialWorker, assertYoutubeTrialReview, deriveYoutubeTrialPolicySnapshot,
  verifyYoutubeTrialSourceBackfill, YOUTUBE_TRIAL_LIVE_SHA } from "./prelaunch-youtube-trial-readiness.mjs";
import { loadFullLocalBackupReadiness } from "../full-local-production-runtime.mjs";

export const PRELAUNCH_YOUTUBE_WORKER_INSTALL_PIN = Object.freeze({ path: "/Users/cwj/.homecook/operations/youtube-trial-20261009-m_t4r_cs/worker-install-review.json", sha256: "642a01b3d259d611691af0f435517f1450f53016e20cd92b9bc1e1a7cda33001" });
export const PRELAUNCH_YOUTUBE_WORKER_CONFIRMATION = "LOCAL_PRELAUNCH_YOUTUBE_TRIAL_WORKER_INSTALL";
const SHA = /^[a-f0-9]{64}$/u; const REF = /^[a-f0-9]{40}$/u;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const check = (value, message) => { if (!value) throw new Error(`Reviewed prelaunch worker install: ${message}`); };
const stable = (value) => JSON.stringify(value, Object.keys(value).sort());
export const INSTALL_POLICY_SQL = "SELECT jsonb_build_object('enabled',p.enabled,'policy_version',p.policy_version,'extractor_mode',p.extractor_mode,'pipeline_identity',p.pipeline_identity,'result_affecting_options',p.result_affecting_options) FROM private.youtube_extraction_current_policy p WHERE p.policy_key='primary';";
export const INSTALL_QUEUE_SQL = "SELECT jsonb_build_object('queued',count(*) filter(where status='queued'),'processing',count(*) filter(where status='processing')) FROM public.youtube_extraction_jobs;";
export const INSTALL_PERMIT_SQL = "SELECT jsonb_build_object('owner_id',owner_id,'permit_generation',permit_generation,'expires_at',expires_at) FROM public.youtube_extractor_permits WHERE permit_key='primary';";
export const INSTALL_CREDENTIAL_SQL = "SELECT jsonb_build_object('credential_name',credential_name,'current_generation',current_generation,'current_jti_hash',current_jti_hash,'expires_at',expires_at,'release_sha',release_sha,'schema_identity',schema_identity,'allowed_snapshot_digest',allowed_snapshot_digest) FROM private.youtube_extraction_worker_credentials WHERE credential_name='primary';";

export function prelaunchYoutubeWorkerInstallAuthority(manifest) {
  return { webReleaseSha: manifest.webReleaseSha, artifactSha256: manifest.artifactSha256,
    manifestFileSha256: manifest.manifestFileSha256, descriptorSha256: manifest.descriptorSha256,
    policySha256: manifest.policySha256, expectedSchemaSha256: manifest.expectedSchemaSha256,
    pipelineIdentity: manifest.review.pipelineIdentity, policySnapshotDigest: manifest.review.queuePolicySnapshotDigest,
    credentialGeneration: manifest.credentialGeneration, oldPlistSha256: manifest.oldPlistSha256,
    oldLoaded: manifest.oldLoaded, oldState: manifest.oldState, dbApplyReceiptSha256: manifest.dbApplyReceiptSha256,
    backupProofSha256: manifest.backupProofSha256, workerConfigPath: manifest.paths.configPath,
    databaseConfigPath: manifest.paths.databaseConfigPath, sourceRepositoryRoot: manifest.paths.sourceRepositoryRoot };
}

export async function verifyPrelaunchYoutubeInstallerConfigRouting(manifest, operations) {
  check(manifest.paths.configPath !== manifest.paths.databaseConfigPath,
    "worker and database config paths must be distinct");
  return { worker: await operations.worker(manifest.paths.configPath),
    database: await operations.database(manifest.paths.databaseConfigPath),
    backup: await operations.backup(manifest.paths.databaseConfigPath) };
}

export function assertPrelaunchYoutubeWorkerInstallPin(pin) {
  check(isAbsolute(pin?.path ?? "") && SHA.test(pin?.sha256 ?? ""), "private review pin is not configured; execution prohibited");
}

export function assertPrelaunchYoutubeWorkerInstallManifest(manifest) {
  check(manifest?.schema === "homecook.prelaunch-youtube-worker-install.v1" && manifest.approved === true,
    "invalid private install manifest");
  check(REF.test(manifest.webReleaseSha ?? "") && SHA.test(manifest.artifactSha256 ?? "")
    && SHA.test(manifest.manifestFileSha256 ?? "") && SHA.test(manifest.descriptorSha256 ?? "") && SHA.test(manifest.policySha256 ?? "")
    && SHA.test(manifest.expectedSchemaSha256 ?? "") && Number.isInteger(manifest.credentialGeneration)
    && manifest.credentialGeneration >= 1, "incomplete reviewed worker identity");
  check(manifest.review && assertYoutubeTrialReview(manifest.review, { requireWorkerRolloutProof: false }),
    "invalid reviewed web identity");
  check(manifest.review.to === manifest.webReleaseSha
    && manifest.review.installedWorkerArtifactSha256 === manifest.artifactSha256
    && manifest.review.workerDescriptorSha256 === manifest.descriptorSha256
    && manifest.review.queuePolicySha256 === manifest.policySha256
    && manifest.review.expectedSchemaSha256 === manifest.expectedSchemaSha256
    && manifest.review.credentialGeneration === manifest.credentialGeneration, "web and worker review identities differ");
  const requiredPaths = ["configPath", "databaseConfigPath", "manifestPath", "credentialPath", "appDescriptorPath", "currentPolicyPath",
    "expectedSchemaPath", "queueStatePath", "secretRoot", "rootDir", "journalDirectory", "rootApprovalRecordPath",
    "dbApplyReceiptPath", "backupProofPath", "sourceRepositoryRoot"];
  check(isDeepStrictEqual(Object.keys(manifest.paths ?? {}).sort(), requiredPaths.sort())
    && Object.values(manifest.paths).every(isAbsolute), "install paths must be the exact reviewed absolute set");
  check(SHA.test(manifest.rootApprovalRecordSha256 ?? "") && SHA.test(manifest.dbApplyReceiptSha256 ?? "")
    && SHA.test(manifest.backupProofSha256 ?? "") && SHA.test(manifest.oldPlistSha256 ?? "")
    && typeof manifest.oldLoaded === "boolean" && typeof manifest.oldState === "string",
  "approval, DB, backup and predecessor plist pins required");
  check(manifest.oldWeb?.releaseSha === YOUTUBE_TRIAL_LIVE_SHA && isAbsolute(manifest.oldWeb?.plistPath ?? "")
    && isAbsolute(manifest.oldWeb?.workingDirectory ?? "") && typeof manifest.oldWeb.buildId === "string"
    && SHA.test(manifest.oldWeb.plistSha256 ?? ""), "fixed predecessor web fence required");
  check(manifest.i031Preflight?.ready === true && manifest.i031Preflight.codexCliVersion === "0.154.0-alpha.6.2"
    && manifest.i031Preflight.chatGptLogin === true && manifest.i031Preflight.toolsReady === true,
  "exact user-approved i031 preflight record required");
  const authority = prelaunchYoutubeWorkerInstallAuthority(manifest);
  check(manifest.installAuthoritySha256 === hash(Buffer.from(stable(authority))), "install authority digest mismatch");
  return manifest;
}

export function assertPrelaunchYoutubeLiveAuthority(manifest, observed, now = Date.now()) {
  const review = manifest.review; const policy = observed.policy; const credential = observed.credential;
  check(policy.enabled === true && policy.policy_version === review.queuePolicyVersion
    && policy.pipeline_identity === review.pipelineIdentity
    && policy.policy_snapshot_digest === review.queuePolicySnapshotDigest, "live DB policy drift");
  check(observed.queue.queued === 0 && observed.queue.processing === 0 && observed.permit.owner_id === null,
    "live queue or permit is not drained");
  check(credential.current_generation === manifest.credentialGeneration && credential.release_sha === manifest.webReleaseSha
    && credential.schema_identity === observed.inputs.workerArtifact.schema_identity
    && credential.allowed_snapshot_digest === review.queuePolicySnapshotDigest
    && credential.current_jti_hash === observed.inputs.credentialState.jti_sha256
    && Date.parse(credential.expires_at) > now + 30 * 60 * 1000, "live DB credential drift");
  check(observed.web.releaseSha === YOUTUBE_TRIAL_LIVE_SHA && observed.web.plistSha256 === manifest.oldWeb.plistSha256
    && observed.web.buildId === manifest.oldWeb.buildId && observed.web.workingDirectory === manifest.oldWeb.workingDirectory,
  "running predecessor web fence drift");
  return true;
}

export function assertPrelaunchYoutubeWorkerRestored(manifest, previousStatus, restoredPlistSha256, restoredStatus) {
  check(restoredPlistSha256 === manifest.oldPlistSha256, "restored predecessor plist hash mismatch");
  check(restoredStatus.loaded === previousStatus.loaded, "restored predecessor runtime loaded state mismatch");
  if (previousStatus.loaded && previousStatus.state === "running") {
    check(restoredStatus.state === "running", "restored predecessor did not return to running state");
  }
  return previousStatus.loaded && previousStatus.state !== "running"
    ? "failed-restored-to-preexisting-unhealthy" : "failed-restored-plist";
}

function dotenv(file) {
  return Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/u).filter((line) => line && !line.trimStart().startsWith("#"))
    .map((line) => { const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/gu, "")]; }));
}

async function observeLiveAuthority(manifest, inputs, databaseConfigPath) {
  const adapter = await createRecordingDockerAdapter({ configPath: databaseConfigPath,
    backupDirectory: manifest.paths.journalDirectory });
  const target = await adapter.inspect();
  const [rawPolicy, queue, permit, credential] = await Promise.all([INSTALL_POLICY_SQL, INSTALL_QUEUE_SQL, INSTALL_PERMIT_SQL,
    INSTALL_CREDENTIAL_SQL].map(async (sql) => JSON.parse(await adapter.query(sql))));
  const policy = deriveYoutubeTrialPolicySnapshot(rawPolicy);
  const plistBytes = readFileSync(manifest.oldWeb.plistPath);
  const oldPlist = JSON.parse(execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", "--", "-"],
    { input: plistBytes, encoding: "utf8" }));
  const workingDirectory = oldPlist.WorkingDirectory;
  const releaseSha = execFileSync("git", ["-C", workingDirectory, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const buildId = readFileSync(join(workingDirectory, ".next", "BUILD_ID"), "utf8").trim();
  return { target, policy, queue, permit, credential, inputs,
    web: { releaseSha, buildId, workingDirectory, plistSha256: hash(plistBytes) } };
}

async function readPinned(path, expected, label) {
  await privatePath(path); const bytes = readFileSync(path); check(hash(bytes) === expected, `${label} changed`); return bytes;
}

export async function loadPrelaunchYoutubeWorkerInstallManifest() {
  assertPrelaunchYoutubeWorkerInstallPin(PRELAUNCH_YOUTUBE_WORKER_INSTALL_PIN);
  const bytes = await readPinned(PRELAUNCH_YOUTUBE_WORKER_INSTALL_PIN.path, PRELAUNCH_YOUTUBE_WORKER_INSTALL_PIN.sha256, "install manifest");
  return assertPrelaunchYoutubeWorkerInstallManifest(JSON.parse(bytes));
}

export async function preparePrelaunchYoutubeWorkerInstall(manifest) {
  assertPrelaunchYoutubeWorkerInstallManifest(manifest);
  const [approvalBytes, dbBytes, backupBytes] = await Promise.all([
    readPinned(manifest.paths.rootApprovalRecordPath, manifest.rootApprovalRecordSha256, "root approval record"),
    readPinned(manifest.paths.dbApplyReceiptPath, manifest.dbApplyReceiptSha256, "DB apply receipt"),
    readPinned(manifest.paths.backupProofPath, manifest.backupProofSha256, "backup proof"),
    privatePath(manifest.paths.journalDirectory, true),
  ]);
  const approval = JSON.parse(approvalBytes); const database = JSON.parse(dbBytes); const backup = JSON.parse(backupBytes);
  await verifyYoutubeTrialSourceBackfill({ review: manifest.review, repositoryRoot: manifest.paths.sourceRepositoryRoot });
  check(approval.schema === "homecook.prelaunch-youtube-worker-root-approval.v1" && approval.approved === true
    && approval.releaseSha === manifest.webReleaseSha
    && approval.installAuthoritySha256 === manifest.installAuthoritySha256, "root approval record is not exact");
  check(database.schema === "homecook.prelaunch-youtube-trial-db-apply-receipt.v1" && database.status === "applied-verified"
    && database.releaseSha === manifest.webReleaseSha && database.migrationCount === 210, "DB 210 receipt is not exact");
  check(backup.schema === "homecook.prelaunch-youtube-trial-backup-proof.v1" && backup.status === "verified"
    && backup.authenticatedFresh === true && backup.offMac === true && backup.isolatedRestore === true
    && backup.escrow === true, "fresh backup/restore/escrow proof is incomplete");
  await privatePath(manifest.paths.configPath); await privatePath(manifest.paths.databaseConfigPath);
  check(manifest.paths.configPath !== manifest.paths.databaseConfigPath, "worker and database config paths must be distinct");
  const inputs = loadYoutubeExtractionWorkerRuntimeInputs({ appDescriptorPath: manifest.paths.appDescriptorPath,
    workerArtifactPath: manifest.paths.manifestPath, currentPolicyPath: manifest.paths.currentPolicyPath,
    credentialPath: manifest.paths.credentialPath, expectedSchemaPath: manifest.paths.expectedSchemaPath,
    queueStatePath: manifest.paths.queueStatePath, secretRoot: manifest.paths.secretRoot });
  const routed = await verifyPrelaunchYoutubeInstallerConfigRouting(manifest, {
    worker: async (configPath) => buildYoutubeExtractionWorkerInstallPlan({ configPath,
      manifestPath: manifest.paths.manifestPath, credentialPath: manifest.paths.credentialPath,
      appDescriptorPath: manifest.paths.appDescriptorPath, currentPolicyPath: manifest.paths.currentPolicyPath,
      expectedSchemaPath: manifest.paths.expectedSchemaPath, secretRoot: manifest.paths.secretRoot,
      homeDir: homedir(), rootDir: manifest.paths.rootDir, userId: process.getuid(), dryRun: true,
      i031Preflight: manifest.i031Preflight }),
    database: (configPath) => observeLiveAuthority(manifest, inputs, configPath),
    backup: (configPath) => loadFullLocalBackupReadiness({ config: dotenv(configPath) }, database.target),
  });
  const plan = routed.worker; const observed = routed.database; const backupReadiness = routed.backup;
  check(backupReadiness && backupReadiness.status !== "NOT_READY", "authenticated full-local backup readiness failed");
  check(inputs.workerArtifact.artifact_sha256 === manifest.artifactSha256
    && hash(readFileSync(manifest.paths.manifestPath)) === manifest.manifestFileSha256
    && hash(readFileSync(manifest.paths.appDescriptorPath)) === manifest.descriptorSha256
    && hash(readFileSync(manifest.paths.currentPolicyPath)) === manifest.policySha256
    && hash(readFileSync(manifest.paths.expectedSchemaPath)) === manifest.expectedSchemaSha256
    && inputs.credentialState.generation === manifest.credentialGeneration,
  "current reviewed worker input files changed");
  check(isDeepStrictEqual(observed.target, database.target), "live DB target differs from applied receipt");
  assertPrelaunchYoutubeLiveAuthority(manifest, observed);
  const old = readFileSync(plan.plist_path); check(hash(old) === manifest.oldPlistSha256, "installed predecessor plist changed");
  return { manifest, plan, old, observed, backupReadiness };
}

function launchctl(args) {
  return execFileSync("/bin/launchctl", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

export async function awaitPrelaunchYoutubeWorkerRunning({ readStatus, wait = (ms) => delay(ms), attempts = 64 }) {
  let consecutive = 0; let latest = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    latest = await readStatus();
    if (latest.loaded && latest.state === "running" && Number.isInteger(latest.pid) && latest.pid > 0) consecutive += 1;
    else {
      consecutive = 0;
      if (!latest.loaded || ["exited", "unloaded"].includes(latest.state)) throw new Error(`worker process failed during startup: ${latest.state}`);
    }
    if (consecutive >= 2) return latest;
    await wait(250);
  }
  throw new Error(`worker did not reach stable running state: ${latest?.state ?? "unknown"}`);
}

export async function executePrelaunchYoutubeWorkerInstall(prepared, confirmation, adapters = {}) {
  check(confirmation === PRELAUNCH_YOUTUBE_WORKER_CONFIRMATION, "exact execution confirmation required");
  const { manifest, plan, old } = prepared; const canonical = getLocalMacProductionReleasePaths(homedir());
  check(!existsSync(canonical.lockPath), "canonical production promotion lock is active");
  const lockRoot = join(homedir(), ".homecook", "prelaunch-youtube-worker"); mkdirSync(lockRoot, { recursive: true, mode: 0o700 });
  const lockPath = join(lockRoot, "install.lock"); const lockFd = openSync(lockPath, "wx", 0o600); closeSync(lockFd);
  const journalPath = join(manifest.paths.journalDirectory, `install-${Date.now()}-${randomUUID()}.json`);
  const backupPath = `${journalPath}.previous.plist`; let previousStatus = { loaded: false, state: "unloaded" };
  const run = adapters.launchctl ?? launchctl; const reprepare = adapters.prepare ?? preparePrelaunchYoutubeWorkerInstall;
  let mutationStarted = false;
  try {
    const preparedAgain = await reprepare(manifest);
    check(preparedAgain.plan.plist_preview === plan.plist_preview, "install plan changed before mutation");
    const raw = (() => { try { return run(["print", plan.service_target]); } catch { return ""; } })();
    previousStatus = raw.length ? parseLaunchctlPrintStatus({ serviceTarget: plan.service_target, status: 0, stdout: raw })
      : { loaded: false, state: "unloaded" };
    check(previousStatus.loaded === manifest.oldLoaded && previousStatus.state === manifest.oldState,
      "predecessor launchd state changed");
    mkdirSync(manifest.paths.journalDirectory, { recursive: true, mode: 0o700 });
    writeFileSync(backupPath, old, { flag: "wx", mode: 0o600 });
    mutationStarted = true;
    try { run(["bootout", plan.service_target]); } catch { if (previousStatus.loaded) throw new Error("failed to stop reviewed predecessor worker"); }
    const staging = `${plan.plist_path}.prelaunch-${randomUUID()}`;
    writeFileSync(staging, plan.plist_preview, { flag: "wx", mode: 0o600 }); chmodSync(staging, 0o600); renameSync(staging, plan.plist_path);
    run(["bootstrap", `gui/${process.getuid()}`, plan.plist_path]); run(["kickstart", "-k", plan.service_target]);
    await awaitPrelaunchYoutubeWorkerRunning({ wait: adapters.wait,
      readStatus: async () => parseLaunchctlPrintStatus({ serviceTarget: plan.service_target, status: 0,
        stdout: run(["print", plan.service_target]) }) });
    const attestation = attestCurrentYoutubeTrialWorker(manifest.review);
    const result = { schema: "homecook.prelaunch-youtube-worker-install-result.v1", status: "installed-verified",
      releaseSha: manifest.webReleaseSha, changed: true, plistSha256: hash(readFileSync(plan.plist_path)), attestation,
      dbPolicyRollbackPerformed: false };
    writeFileSync(journalPath, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 }); return result;
  } catch (error) {
    if (!mutationStarted) throw error;
    let restoreError = null; let restoreOutcome = null;
    try {
    try { run(["bootout", plan.service_target]); } catch { /* best effort before exact restore */ }
    const restore = `${plan.plist_path}.restore-${randomUUID()}`;
    writeFileSync(restore, old, { flag: "wx", mode: 0o600 }); chmodSync(restore, 0o600); renameSync(restore, plan.plist_path);
    if (previousStatus.loaded) {
      run(["bootstrap", `gui/${process.getuid()}`, plan.plist_path]);
      if (previousStatus.state === "running") run(["kickstart", "-k", plan.service_target]);
    }
    const restoredRaw = (() => { try { return run(["print", plan.service_target]); } catch { return ""; } })();
    const restored = restoredRaw ? parseLaunchctlPrintStatus({ serviceTarget: plan.service_target, status: 0, stdout: restoredRaw })
      : { loaded: false, state: "unloaded" };
    restoreOutcome = assertPrelaunchYoutubeWorkerRestored(manifest, previousStatus,
      hash(readFileSync(plan.plist_path)), restored);
    } catch (failure) { restoreError = failure instanceof Error ? failure.message : "restore failed"; }
    const failure = { schema: "homecook.prelaunch-youtube-worker-install-result.v1",
      status: restoreError ? "failed-requires-manual-recovery" : restoreOutcome,
      originalError: error instanceof Error ? error.message : "install failed", restoreError,
      dbPolicyRollbackPerformed: false };
    try { writeFileSync(journalPath, `${JSON.stringify(failure, null, 2)}\n`, { flag: "wx", mode: 0o600 }); }
    catch (journalError) { throw new Error(`${failure.originalError}; restore=${restoreError ?? "ok"}; journal=${journalError.message}`); }
    if (restoreError) throw new Error(`${failure.originalError}; restore=${restoreError}`);
    throw error;
  } finally { rmSync(lockPath, { force: true }); }
}
