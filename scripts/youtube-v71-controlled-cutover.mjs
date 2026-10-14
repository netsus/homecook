#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  cpSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createRecordingDockerAdapter } from "./lib/marketing-round2-controlled-deploy.mjs";
import {
  buildYoutubeExtractionWorkerPolicySnapshotDigest,
  ensureRegularFile,
  readJsonFile,
  sha256File,
  stableStringify,
  verifyYoutubeExtractionWorkerArtifact,
} from "./lib/youtube-extraction-worker-artifact.mjs";
import {
  issueYoutubeExtractionCredentialManager,
  issueYoutubeExtractionWorkerCredential,
} from "./lib/youtube-extraction-worker-local-credential.mjs";
import {
  assertYoutubeResolutionLauncherPreserved,
  preserveYoutubeResolutionLauncherEnvironment,
  verifyYoutubeResolutionWorkerCaller,
} from "./lib/prelaunch-youtube-resolution-worker-install.mjs";
import {
  buildYoutubeExtractionWorkerCredentialState,
  buildYoutubeExtractionWorkerInstallPlan,
  parseLaunchctlPrintStatus,
  validateYoutubeExtractionWorkerSecretFile,
  validateYoutubeExtractionWorkerSecretRoot,
} from "./lib/youtube-extraction-worker-ops.mjs";
import {
  createRestrictedPostgrestRpcClient,
  readWorkerEnvironment,
  readWorkerProviderEnvironment,
  sanitizeYoutubeExtractionChildEnvironment,
  verifyStandaloneYoutubeI031Preflight,
} from "./lib/youtube-extraction-worker-runtime.mjs";
import {
  YOUTUBE_V71_APP_DESCRIPTOR_FILE_SHA256,
  YOUTUBE_V71_ARTIFACT_MANIFEST_FILE_SHA256,
  YOUTUBE_V71_CREDENTIAL_GENERATION_AFTER,
  YOUTUBE_V71_CREDENTIAL_TTL_SECONDS,
  YOUTUBE_V71_EXPECTED_SCHEMA_SHA256,
  YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
  YOUTUBE_V71_RELEASE_SHA,
  YOUTUBE_V71_SCHEMA_IDENTITY,
} from "./lib/youtube-v71-worker-preparation.mjs";
import {
  YOUTUBE_V71_CUTOVER_CONFIRMATION,
  assertV71CutoverPoststate,
  assertV71CutoverPrestate,
  assertV71ManagerClaims,
  assertV71OperationalPoststate,
  assertV71WorkerCredential,
  buildV71DatabaseTransitionSql,
  decodeJwtClaims,
} from "./lib/youtube-v71-controlled-cutover.mjs";
import { openDedicatedAdminSession } from "./youtube-resolution-controlled-db.mjs";
import * as c04Authority from "./lib/prelaunch-web-deploy.mjs";
import * as c04Database from "./lib/prelaunch-database.mjs";
import {
  YOUTUBE_C04_ARTIFACT_SHA256, YOUTUBE_C04_CUTOVER_REVIEW_PIN, YOUTUBE_C04_OPERATION_ROOT, YOUTUBE_C04_RELEASE_SHA,
  assertC04QuantityCheckpointOrigin, assertC04QuantityControlReview, assertC04QuantityJournal, assertC04QuantityWorkerCredential,
  buildC04QuantityCredentialTransitionSql, createC04QuantityWorkerCutover, parseC04QuantityCutoverArguments,
} from "./lib/youtube-v71-controlled-cutover.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = realpathSync(resolve(HERE, ".."));
const HOME = homedir();
const UID = process.getuid();
const LABEL = "com.homecook.youtube-extraction-worker";
const SERVICE = `gui/${UID}/${LABEL}`;
const SECRET_ROOT = join(HOME, ".homecook/youtube-extraction");
const OPERATION_ROOT = join(HOME, ".homecook/operations/youtube-v71-20261013");
const BACKUP_ROOT = join(OPERATION_ROOT, "cutover-backup");
const BACKUP_PRESTATE_PATH = join(BACKUP_ROOT, "prestate.json");
const BACKUP_PLIST_PATH = join(BACKUP_ROOT, "generation-46.plist");
const PREPARE_PATH = join(OPERATION_ROOT, "cutover-prepare.json");
const JOURNAL_PATH = join(OPERATION_ROOT, "cutover-journal.json");
const VERIFICATION_RECEIPT_PATH = join(
  OPERATION_ROOT,
  "cutover-verification-receipt.json",
);
const RECEIPT_PATH = join(OPERATION_ROOT, "cutover-receipt.json");
const INVOCATION_LOCK = join(OPERATION_ROOT, "cutover-invocation.lock");
const DATABASE_CONFIG = join(HOME, ".homecook/config/full-local-production.env");
const JWT_KEYS = join(HOME, ".homecook/secrets/full-local-supabase/jwt_keys");
const SOURCE_ARTIFACT_ROOT = join(ROOT, ".artifacts/youtube-v71-worker-8e515a6482a1");
const SOURCE_DESCRIPTOR = join(ROOT, ".artifacts/youtube-v71-app-descriptor-8e515a6482a1.json");
const SOURCE_POLICY = join(ROOT, ".artifacts/youtube-v71-candidate-policy-final-8e515a6482a1.json");
const TARGET_ARTIFACT_ROOT = join(
  HOME,
  ".homecook/youtube-extraction-releases/8e515a6482a1-youtube-integrated-20261013",
);
const TARGET_MANIFEST = join(TARGET_ARTIFACT_ROOT, "artifact.json");
const TARGET_SCHEMA = join(
  TARGET_ARTIFACT_ROOT,
  "scripts/manifests/youtube-extraction-expected-schema.json",
);
const TARGET_DESCRIPTOR = join(SECRET_ROOT, "app-descriptor-8e515a6482a1-v71.json");
const TARGET_POLICY = join(SECRET_ROOT, "current-policy-8e515a6482a1-v71.json");
const SOURCE_CONFIG = join(SECRET_ROOT, "worker-v46-youtube-resolution-20261010.env");
const TARGET_CONFIG = join(SECRET_ROOT, "worker-v47-youtube-integrated-20261013.env");
const TARGET_TOKEN = join(SECRET_ROOT, "worker-v47-youtube-integrated-20261013.jwt");
const TARGET_CREDENTIAL = join(
  SECRET_ROOT,
  "worker-credential-v47-youtube-integrated-20261013.json",
);
const MANAGER_TOKEN = join(SECRET_ROOT, "manager-v47-youtube-integrated-20261013.jwt");
const PLIST = join(HOME, `Library/LaunchAgents/${LABEL}.plist`);
const NODE_BIN = join(HOME, ".nvm/versions/node/v22.19.0/bin/node");
const { COPYFILE_EXCL } = constants;

function check(condition, message) {
  if (!condition) throw new Error(`v71 controlled cutover: ${message}`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function lastLine(value) {
  return String(value ?? "").split("\n").map((line) => line.trim()).filter(Boolean).at(-1) ?? "";
}

function lastJson(value) {
  return JSON.parse(lastLine(value));
}

function privateDirectory(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
  const stat = lstatSync(path);
  check(stat.isDirectory() && !stat.isSymbolicLink() && stat.uid === UID, `private directory ${path}`);
  check((stat.mode & 0o777) === 0o700, `private directory mode ${path}`);
  return path;
}

function writePrivateCreateOnly(path, contents) {
  let created = false;
  try {
    writeFileSync(path, contents, { flag: "wx", mode: 0o600 });
    created = true;
    chmodSync(path, 0o600);
    fsyncPath(path);
    fsyncPath(dirname(path));
  } catch (error) {
    if (created) {
      rmSync(path, { force: true });
      fsyncPath(dirname(path));
    }
    throw error;
  }
}

function fsyncPath(path) {
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function durablePrivateJson(path, value, { replace = false } = {}) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  if (!replace) {
    const staging = `${path}.create-${randomUUID()}`;
    try {
      writePrivateCreateOnly(staging, body);
      linkSync(staging, path);
      fsyncPath(dirname(path));
    } finally {
      rmSync(staging, { force: true });
      fsyncPath(dirname(path));
    }
    return;
  }
  const staging = `${path}.staging-${randomUUID()}`;
  try {
    writePrivateCreateOnly(staging, body);
    renameSync(staging, path);
    chmodSync(path, 0o600);
    fsyncPath(path);
    fsyncPath(dirname(path));
  } finally {
    rmSync(staging, { force: true });
  }
}

async function withInvocationLock(callback) {
  return withDirectoryInvocationLock(OPERATION_ROOT, INVOCATION_LOCK, callback);
}

async function withDirectoryInvocationLock(OPERATION_ROOT, INVOCATION_LOCK, callback) {
  privateDirectory(OPERATION_ROOT);
  const nonce = randomUUID();
  const processStart = spawnSync(
    "/bin/ps",
    ["-p", String(process.pid), "-o", "lstart="],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  ).stdout.trim();
  check(processStart.length > 0, "cannot identify invocation process start");
  const lock = {
    schema: "homecook.youtube-v71-cutover-invocation-lock.v1",
    pid: process.pid,
    processStart,
    nonce,
    createdAt: new Date().toISOString(),
  };
  if (existsSync(INVOCATION_LOCK)) {
    const existing = readJsonFile(INVOCATION_LOCK, "v71 invocation lock", { mode: 0o600 });
    check(
      existing?.schema === lock.schema
      && Number.isSafeInteger(existing.pid)
      && typeof existing.processStart === "string"
      && typeof existing.nonce === "string",
      "existing invocation lock is malformed",
    );
    const observed = spawnSync(
      "/bin/ps",
      ["-p", String(existing.pid), "-o", "lstart="],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const stillRunning = observed.status === 0
      && observed.stdout.trim() === existing.processStart;
    check(!stillRunning, "another controlled cutover invocation is active");
    rmSync(INVOCATION_LOCK, { force: true });
    fsyncPath(OPERATION_ROOT);
  }
  writePrivateCreateOnly(INVOCATION_LOCK, `${JSON.stringify(lock)}\n`);
  try {
    return await callback();
  } finally {
    try {
      const current = readJsonFile(INVOCATION_LOCK, "v71 invocation lock", { mode: 0o600 });
      if (current.nonce === nonce) {
        rmSync(INVOCATION_LOCK, { force: true });
        fsyncPath(OPERATION_ROOT);
      }
    } catch {
      // Preserve a changed or unreadable lock for explicit operator inspection.
    }
  }
}

function copyPrivateExact(source, target, expectedSha) {
  if (!existsSync(target)) {
    copyFileSync(source, target, COPYFILE_EXCL);
    chmodSync(target, 0o600);
    fsyncPath(target);
    fsyncPath(dirname(target));
  }
  check(sha256File(target) === expectedSha, `copied file digest ${target}`);
  check((lstatSync(target).mode & 0o777) === 0o600, `copied file mode ${target}`);
}

function parsePlist(bytes) {
  return JSON.parse(execFileSync(
    "/usr/bin/plutil",
    ["-convert", "json", "-o", "-", "--", "-"],
    { input: bytes, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ));
}

function readLaunchStatus() {
  const result = spawnSync("/bin/launchctl", ["print", SERVICE], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return parseLaunchctlPrintStatus({
    serviceTarget: SERVICE,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  });
}

function runLaunchctl(args, { allowUnloaded = false } = {}) {
  const result = spawnSync("/bin/launchctl", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    if (allowUnloaded && (result.status === 113 || /could not find service/iu.test(result.stderr ?? ""))) {
      return result;
    }
    throw new Error(`launchctl ${args[0]} failed; output withheld`);
  }
  return result;
}

async function stableWorker() {
  let priorPid = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const status = readLaunchStatus();
    if (status.loaded && status.state === "running" && Number.isInteger(status.pid)) {
      if (status.pid === priorPid) return { pid: status.pid, observations: 2 };
      priorPid = status.pid;
    } else {
      priorPid = null;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("worker did not reach two stable running observations");
}

async function stoppedWorker() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const status = readLaunchStatus();
    if (!status.loaded && status.state === "unloaded") return status;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("generation 46 did not reach unloaded state");
}

const OBSERVATION_SQL = `
SELECT jsonb_build_object(
  'ledgerCount', (SELECT count(*) FROM homecook_deploy.migrations),
  'queued', (SELECT count(*) FROM public.youtube_extraction_jobs WHERE status='queued'),
  'processing', (SELECT count(*) FROM public.youtube_extraction_jobs WHERE status='processing'),
  'permitHeld', EXISTS(
    SELECT 1 FROM public.youtube_extractor_permits
    WHERE permit_key='primary' AND owner_id IS NOT NULL AND expires_at>clock_timestamp()
  ),
  'activeEnqueueSessions', (
    SELECT count(*) FROM pg_stat_activity
    WHERE pid<>pg_backend_pid() AND state<>'idle' AND query ~ 'enqueue_youtube_extraction_job'
  ),
  'credential', (
    SELECT jsonb_build_object(
      'generation', current_generation,
      'jtiHash', current_jti_hash,
      'expiresAt', expires_at,
      'releaseSha', release_sha,
      'schemaIdentity', schema_identity,
      'snapshotDigest', allowed_snapshot_digest
    ) FROM private.youtube_extraction_worker_credentials WHERE credential_name='primary'
  ),
  'policy', (
    SELECT jsonb_build_object(
      'version', policy_version,
      'extractorMode', extractor_mode,
      'pipelineIdentity', pipeline_identity,
      'resultAffectingOptions', result_affecting_options,
      'fingerprintKeyVersion', fingerprint_key_version,
      'previousFingerprintKeyVersion', previous_fingerprint_key_version,
      'previousFingerprintValidUntil', previous_fingerprint_valid_until,
      'enabled', enabled
    ) FROM private.youtube_extraction_current_policy WHERE policy_key='primary'
  )
)::text;
`;

function normalizeDatabaseObservation(observation) {
  const policy = observation?.policy;
  check(policy && typeof policy === "object", "database policy observation");
  return {
    ...observation,
    policy: {
      ...policy,
      snapshotDigest: buildYoutubeExtractionWorkerPolicySnapshotDigest({
        extractorMode: policy.extractorMode,
        pipelineIdentity: policy.pipelineIdentity,
        policyVersion: policy.version,
        resultAffectingOptions: policy.resultAffectingOptions,
      }),
    },
  };
}

async function adapterAndTarget() {
  privateDirectory(OPERATION_ROOT);
  privateDirectory(BACKUP_ROOT);
  const adapter = await createRecordingDockerAdapter({
    configPath: DATABASE_CONFIG,
    backupDirectory: BACKUP_ROOT,
  });
  const target = await adapter.inspect();
  check(target.database?.systemIdentifier === "7669475895419854882", "database system identifier");
  check(target.database?.major === 17, "PostgreSQL major");
  return { adapter, target };
}

async function observeDatabase(adapter) {
  return normalizeDatabaseObservation(lastJson(await adapter.query(OBSERVATION_SQL)));
}

async function workerI031Preflight(configPath = TARGET_CONFIG) {
  const environment = await readWorkerEnvironment(configPath);
  const providerSecretPath = validateYoutubeExtractionWorkerSecretFile(
    environment.HOMECOOK_YOUTUBE_WORKER_PROVIDER_SECRET_FILE,
    { secretRoot: SECRET_ROOT },
  );
  const provider = await readWorkerProviderEnvironment(providerSecretPath);
  const result = await verifyStandaloneYoutubeI031Preflight({
    workerEnv: sanitizeYoutubeExtractionChildEnvironment(
      { ...process.env, ...provider },
      { HOME },
    ),
    expectedUserId: UID,
  });
  return {
    ready: true,
    codexCliVersion: result.codexCliVersion,
    chatGptLogin: true,
    toolsReady: true,
  };
}

async function rpcClientForToken(token) {
  const environment = await readWorkerEnvironment(TARGET_CONFIG);
  const keyPath = validateYoutubeExtractionWorkerSecretFile(
    environment.HOMECOOK_YOUTUBE_WORKER_DATA_API_KEY_FILE,
    { secretRoot: SECRET_ROOT },
  );
  const apiKey = readFileSync(keyPath, "utf8").trim();
  return createRestrictedPostgrestRpcClient({
    dataApiUrl: environment.HOMECOOK_YOUTUBE_WORKER_DATA_API_URL,
    apiKey,
    token,
  });
}

async function authenticatedPreRequest(token) {
  const client = await rpcClientForToken(token);
  const result = await client.rpc("check_youtube_extraction_worker_pre_request");
  check(result.error === null, "authenticated pre-request denied");
  return true;
}

async function verifyWorkerCaller(token) {
  const environment = await readWorkerEnvironment(TARGET_CONFIG);
  return verifyYoutubeResolutionWorkerCaller({
    environment,
    token,
    secretRoot: SECRET_ROOT,
  });
}

function ensureMaterializedCandidate() {
  validateYoutubeExtractionWorkerSecretRoot(SECRET_ROOT);
  const source = verifyYoutubeExtractionWorkerArtifact(join(SOURCE_ARTIFACT_ROOT, "artifact.json"));
  check(source.release_sha === YOUTUBE_V71_RELEASE_SHA, "source artifact release");
  check(sha256File(join(SOURCE_ARTIFACT_ROOT, "artifact.json"))
    === YOUTUBE_V71_ARTIFACT_MANIFEST_FILE_SHA256, "source artifact manifest");
  if (!existsSync(TARGET_ARTIFACT_ROOT)) {
    mkdirSync(dirname(TARGET_ARTIFACT_ROOT), { recursive: true, mode: 0o700 });
    cpSync(SOURCE_ARTIFACT_ROOT, TARGET_ARTIFACT_ROOT, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
  }
  const target = verifyYoutubeExtractionWorkerArtifact(TARGET_MANIFEST);
  check(target.artifact_sha256 === source.artifact_sha256, "target artifact identity");
  check(sha256File(TARGET_MANIFEST) === YOUTUBE_V71_ARTIFACT_MANIFEST_FILE_SHA256,
    "target artifact manifest");
  check(sha256File(TARGET_SCHEMA) === YOUTUBE_V71_EXPECTED_SCHEMA_SHA256,
    "target expected schema");
  copyPrivateExact(SOURCE_DESCRIPTOR, TARGET_DESCRIPTOR, YOUTUBE_V71_APP_DESCRIPTOR_FILE_SHA256);
  copyPrivateExact(SOURCE_POLICY, TARGET_POLICY, sha256File(SOURCE_POLICY));
  copyPrivateExact(SOURCE_CONFIG, TARGET_CONFIG, sha256File(SOURCE_CONFIG));
  return target;
}

async function prepare() {
  check(!existsSync(PREPARE_PATH), "prepare receipt already exists");
  const status = spawnSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" });
  check(status.status === 0 && status.stdout.trim() === "", "repository is not clean");
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", YOUTUBE_V71_RELEASE_SHA, "origin/master"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  check(ancestor.status === 0, "v71 release is not an ancestor of origin/master");
  const artifact = ensureMaterializedCandidate();
  const { adapter, target } = await adapterAndTarget();
  const database = await observeDatabase(adapter);
  assertV71CutoverPrestate(database);
  const launchd = readLaunchStatus();
  check(launchd.loaded && launchd.state === "running" && Number.isInteger(launchd.pid),
    "generation 46 launchd is not running");
  const plistBytes = readFileSync(PLIST);
  const previous = parsePlist(plistBytes);
  check(previous.ProgramArguments.includes(
    join(SECRET_ROOT, "worker-credential-v46-youtube-resolution-20261010.json"),
  ), "generation 46 credential is not active");
  const oldMetadata = readJsonFile(
    join(SECRET_ROOT, "worker-credential-v46-youtube-resolution-20261010.json"),
    "generation 46 credential",
    { mode: 0o600 },
  );
  const oldToken = readFileSync(oldMetadata.token_file, "utf8").trim();
  await authenticatedPreRequest(oldToken);
  const i031 = await workerI031Preflight();
  const receipt = {
    schema: "homecook.youtube-v71-controlled-cutover-preparation.v1",
    status: "prepared-no-operational-mutation",
    preparedAt: new Date().toISOString(),
    approval: {
      workerCredentialGeneration: 47,
      workerCredentialTtlSeconds: YOUTUBE_V71_CREDENTIAL_TTL_SECONDS,
      managerCredentialMaximumTtlSeconds: 300,
      policyRegistration: true,
      stopGeneration46: true,
      launchV71: true,
      issueGeneration48: false,
      expandPrivileges: false,
      extractionCallBudget: 0,
    },
    source: {
      head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
      originMaster: execFileSync("git", ["rev-parse", "origin/master"], { cwd: ROOT, encoding: "utf8" }).trim(),
      releaseSha: YOUTUBE_V71_RELEASE_SHA,
    },
    candidate: {
      artifactIdentity: artifact.artifact_sha256,
      artifactManifestSha256: sha256File(TARGET_MANIFEST),
      descriptorSha256: sha256File(TARGET_DESCRIPTOR),
      policySha256: sha256File(TARGET_POLICY),
      expectedSchemaSha256: sha256File(TARGET_SCHEMA),
      policySnapshotDigest: YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
    },
    paths: {
      artifactRoot: TARGET_ARTIFACT_ROOT,
      manifest: TARGET_MANIFEST,
      descriptor: TARGET_DESCRIPTOR,
      policy: TARGET_POLICY,
      config: TARGET_CONFIG,
      workerToken: TARGET_TOKEN,
      workerCredential: TARGET_CREDENTIAL,
      managerToken: MANAGER_TOKEN,
      plist: PLIST,
    },
    databaseTarget: {
      postgresContainerId: target.postgresContainerId,
      systemIdentifier: target.database.systemIdentifier,
      major: target.database.major,
    },
    database,
    predecessor: {
      launchd: { loaded: launchd.loaded, state: launchd.state, pid: launchd.pid },
      plistSha256: sha256(plistBytes),
      authenticatedPreRequest: true,
    },
    i031,
    operationalMutationAuthorized: false,
  };
  durablePrivateJson(PREPARE_PATH, receipt);
  return receipt;
}

function validatePreparation({ allowReplacedPlist = false } = {}) {
  const preparation = readJsonFile(PREPARE_PATH, "v71 cutover preparation", { mode: 0o600 });
  check(preparation.schema === "homecook.youtube-v71-controlled-cutover-preparation.v1",
    "prepare schema");
  check(preparation.approval?.workerCredentialGeneration === 47, "prepare generation");
  check(preparation.approval?.issueGeneration48 === false, "prepare generation 48 fence");
  check(preparation.approval?.extractionCallBudget === 0, "prepare extraction budget");
  check(preparation.candidate?.artifactManifestSha256 === sha256File(TARGET_MANIFEST),
    "prepared artifact changed");
  check(preparation.candidate?.descriptorSha256 === sha256File(TARGET_DESCRIPTOR),
    "prepared descriptor changed");
  check(preparation.candidate?.policySha256 === sha256File(TARGET_POLICY),
    "prepared policy changed");
  if (!allowReplacedPlist) {
    check(preparation.predecessor?.plistSha256 === sha256(readFileSync(PLIST)),
      "predecessor plist changed");
  }
  return preparation;
}

function issueCredentials() {
  check(!existsSync(TARGET_TOKEN) && !existsSync(TARGET_CREDENTIAL) && !existsSync(MANAGER_TOKEN),
    "credential output already exists");
  check(realpathSync(JWT_KEYS) === JWT_KEYS, "JWT signing key path contains a symlink");
  const jwtKeysPath = ensureRegularFile(JWT_KEYS, "local JWT signing keys", {
    mode: 0o600,
    expectedUserId: UID,
  });
  check(!jwtKeysPath.startsWith(`${ROOT}/`), "JWT signing keys are inside the repository");
  check(!jwtKeysPath.startsWith(`${SECRET_ROOT}/`), "JWT signing keys are inside worker secrets");
  const jwtKeys = JSON.parse(readFileSync(jwtKeysPath, "utf8"));
  const worker = issueYoutubeExtractionWorkerCredential({
    jwtKeys,
    generation: YOUTUBE_V71_CREDENTIAL_GENERATION_AFTER,
    releaseSha: YOUTUBE_V71_RELEASE_SHA,
    schemaIdentity: YOUTUBE_V71_SCHEMA_IDENTITY,
    allowedSnapshotDigest: YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
    ttlSeconds: YOUTUBE_V71_CREDENTIAL_TTL_SECONDS,
  });
  const manager = issueYoutubeExtractionCredentialManager({
    jwtKeys,
    ttlSeconds: 300,
  });
  const createdPaths = [];
  try {
    writePrivateCreateOnly(TARGET_TOKEN, `${worker.token}\n`);
    createdPaths.push(TARGET_TOKEN);
    const metadata = buildYoutubeExtractionWorkerCredentialState({
      tokenFile: TARGET_TOKEN,
      generation: worker.metadata.generation,
      jtiHash: worker.jtiHash,
      expiresAt: worker.metadata.expires_at,
      releaseSha: worker.metadata.release_sha,
      schemaIdentity: worker.metadata.schema_identity,
      allowedSnapshotDigest: worker.metadata.allowed_snapshot_digest,
      secretRoot: SECRET_ROOT,
    });
    writePrivateCreateOnly(TARGET_CREDENTIAL, `${stableStringify(metadata)}\n`);
    validateYoutubeExtractionWorkerSecretFile(TARGET_CREDENTIAL, {
      secretRoot: SECRET_ROOT,
    });
    createdPaths.push(TARGET_CREDENTIAL);
    writePrivateCreateOnly(MANAGER_TOKEN, `${manager.token}\n`);
    createdPaths.push(MANAGER_TOKEN);
    assertV71WorkerCredential({ claims: decodeJwtClaims(worker.token), metadata });
    assertV71ManagerClaims(decodeJwtClaims(manager.token));
    return { workerToken: worker.token, managerToken: manager.token, metadata };
  } catch (error) {
    for (const path of createdPaths.reverse()) rmSync(path, { force: true });
    throw error;
  }
}

function cleanupAbortedPrecommitArtifacts(database) {
  check(database?.credential?.generation === 46, "precommit cleanup requires generation 46");
  check(!existsSync(VERIFICATION_RECEIPT_PATH) && !existsSync(RECEIPT_PATH),
    "precommit cleanup refuses completed evidence");
  for (const path of [
    TARGET_TOKEN,
    TARGET_CREDENTIAL,
    MANAGER_TOKEN,
    JOURNAL_PATH,
    BACKUP_PRESTATE_PATH,
    BACKUP_PLIST_PATH,
  ]) {
    rmSync(path, { force: true });
  }
  fsyncPath(OPERATION_ROOT);
  fsyncPath(BACKUP_ROOT);
}

function buildInstallPlan(preparation, metadata) {
  const previousBytes = readFileSync(PLIST);
  check(sha256(previousBytes) === preparation.predecessor.plistSha256, "predecessor plist drift");
  return { previousBytes, metadata };
}

async function renderInstallPlan(previousBytes, i031) {
  const raw = buildYoutubeExtractionWorkerInstallPlan({
    configPath: TARGET_CONFIG,
    manifestPath: TARGET_MANIFEST,
    credentialPath: TARGET_CREDENTIAL,
    appDescriptorPath: TARGET_DESCRIPTOR,
    currentPolicyPath: TARGET_POLICY,
    expectedSchemaPath: TARGET_SCHEMA,
    secretRoot: SECRET_ROOT,
    homeDir: HOME,
    nodeBin: NODE_BIN,
    rootDir: TARGET_ARTIFACT_ROOT,
    userId: UID,
    dryRun: true,
    i031Preflight: i031,
  });
  const previous = parsePlist(previousBytes);
  const preview = preserveYoutubeResolutionLauncherEnvironment(previous, raw.plist_preview);
  assertYoutubeResolutionLauncherPreserved(previous, parsePlist(Buffer.from(preview)));
  return { ...raw, plist_preview: preview };
}

async function transitionDatabase(target, managerClaims, metadata, preparation, adapter) {
  const session = openDedicatedAdminSession(
    target.postgresContainerId,
    `youtube-resolution-v71-${randomUUID().slice(0, 8)}`,
  );
  let commitDispatched = false;
  try {
    await session.query(`BEGIN ISOLATION LEVEL SERIALIZABLE;
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(86120317);
LOCK TABLE private.youtube_extraction_current_policy IN ACCESS EXCLUSIVE MODE;
LOCK TABLE private.youtube_extraction_worker_credentials IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.youtube_extraction_jobs IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.youtube_extractor_permits IN ACCESS EXCLUSIVE MODE;`);
    const locked = normalizeDatabaseObservation(lastJson(await session.query(OBSERVATION_SQL)));
    assertV71CutoverPrestate(locked);
    check(readLaunchStatus().loaded === false, "generation 46 reloaded during DB transition");
    privateDirectory(BACKUP_ROOT);
    const backup = {
      schema: "homecook.youtube-v71-cutover-backup.v1",
      createdAt: new Date().toISOString(),
      database: locked,
      plistSha256: preparation.predecessor.plistSha256,
      preparationSha256: sha256(readFileSync(PREPARE_PATH)),
    };
    durablePrivateJson(BACKUP_PRESTATE_PATH, backup);
    copyFileSync(PLIST, BACKUP_PLIST_PATH, COPYFILE_EXCL);
    chmodSync(BACKUP_PLIST_PATH, 0o600);
    fsyncPath(BACKUP_PLIST_PATH);
    fsyncPath(BACKUP_ROOT);
    const transition = buildV71DatabaseTransitionSql({ managerClaims, credentialMetadata: metadata });
    const post = normalizeDatabaseObservation(lastJson(
      await session.query(`${transition}\n${OBSERVATION_SQL}`),
    ));
    assertV71CutoverPoststate(post, { enabled: false });
    durablePrivateJson(JOURNAL_PATH, {
      schema: "homecook.youtube-v71-controlled-cutover-journal.v1",
      state: "commit-intent",
      prepared: { path: PREPARE_PATH, sha256: backup.preparationSha256 },
      backup: { path: BACKUP_ROOT, plistSha256: backup.plistSha256 },
      post,
      generation48Issued: false,
      extractionCalls: 0,
    });
    commitDispatched = true;
    await session.query("COMMIT;");
    await session.close();
    const readback = await observeDatabase(adapter);
    assertV71CutoverPoststate(readback, { enabled: false });
    durablePrivateJson(JOURNAL_PATH, {
      schema: "homecook.youtube-v71-controlled-cutover-journal.v1",
      state: "generation-47-committed-policy-disabled",
      prepared: { path: PREPARE_PATH, sha256: backup.preparationSha256 },
      backup: { path: BACKUP_ROOT, plistSha256: backup.plistSha256 },
      post: readback,
      generation48Issued: false,
      extractionCalls: 0,
    }, { replace: true });
    return readback;
  } catch (error) {
    session.stop();
    const readback = await observeDatabase(adapter).catch(() => null);
    if (readback?.credential?.generation === 47) {
      durablePrivateJson(JOURNAL_PATH, {
        schema: "homecook.youtube-v71-controlled-cutover-journal.v1",
        state: "generation-47-committed-install-repair-required",
        originalError: error instanceof Error ? error.message : "database transition failed",
        post: readback,
        generation48Issued: false,
      }, { replace: existsSync(JOURNAL_PATH) });
      throw error;
    }
    if (commitDispatched) {
      throw new Error("database commit outcome unknown; generation readback did not confirm 47");
    }
    throw error;
  }
}

async function enablePolicyAfterDurableVerification(target, adapter, createVerificationReceipt) {
  const session = openDedicatedAdminSession(
    target.postgresContainerId,
    `youtube-resolution-v71-enable-${randomUUID().slice(0, 8)}`,
  );
  let policyCommitted = false;
  try {
    await session.query(`SELECT pg_advisory_lock(86120317);
BEGIN ISOLATION LEVEL SERIALIZABLE;
SET LOCAL statement_timeout='30s';
LOCK TABLE private.youtube_extraction_current_policy IN ACCESS EXCLUSIVE MODE;
LOCK TABLE private.youtube_extraction_worker_credentials IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.youtube_extraction_jobs IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.youtube_extractor_permits IN ACCESS EXCLUSIVE MODE;`);
    const before = normalizeDatabaseObservation(lastJson(await session.query(OBSERVATION_SQL)));
    assertV71CutoverPoststate(before, { enabled: false });
    const verificationReceipt = await createVerificationReceipt(before);
    const after = normalizeDatabaseObservation(lastJson(await session.query(`
UPDATE private.youtube_extraction_current_policy
SET enabled=true, updated_at=clock_timestamp()
WHERE policy_key='primary';
${OBSERVATION_SQL}`)));
    assertV71CutoverPoststate(after, { enabled: true });
    await session.query("COMMIT;");
    policyCommitted = true;
    await session.close();
    const readback = await observeDatabase(adapter);
    assertV71OperationalPoststate(readback);
    return { verificationReceipt, finalDatabase: readback };
  } catch (error) {
    session.stop();
    if (policyCommitted) {
      throw new Error(
        `${error instanceof Error ? error.message : "activation readback failed"}; `
        + "durable verification receipt retained for activation reconciliation",
      );
    }
    throw error;
  }
}

async function disablePolicyForRepair(target, adapter) {
  const session = openDedicatedAdminSession(
    target.postgresContainerId,
    `youtube-resolution-v71-disable-${randomUUID().slice(0, 8)}`,
  );
  let commitDispatched = false;
  try {
    await session.query(`SELECT pg_advisory_lock(86120317);
BEGIN ISOLATION LEVEL SERIALIZABLE;
SET LOCAL statement_timeout='30s';
LOCK TABLE private.youtube_extraction_current_policy IN ACCESS EXCLUSIVE MODE;
LOCK TABLE private.youtube_extraction_worker_credentials IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.youtube_extraction_jobs IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.youtube_extractor_permits IN ACCESS EXCLUSIVE MODE;`);
    const before = normalizeDatabaseObservation(lastJson(await session.query(OBSERVATION_SQL)));
    assertV71CutoverPoststate(before, { enabled: true });
    const after = normalizeDatabaseObservation(lastJson(await session.query(`
UPDATE private.youtube_extraction_current_policy
SET enabled=false, updated_at=clock_timestamp()
WHERE policy_key='primary';
${OBSERVATION_SQL}`)));
    assertV71CutoverPoststate(after, { enabled: false });
    commitDispatched = true;
    await session.query("COMMIT;");
    await session.close();
    const readback = await observeDatabase(adapter);
    assertV71CutoverPoststate(readback, { enabled: false });
    return readback;
  } catch (error) {
    session.stop();
    if (commitDispatched) {
      const readback = await observeDatabase(adapter).catch(() => null);
      if (readback?.policy?.enabled === false) {
        assertV71CutoverPoststate(readback, { enabled: false });
        return readback;
      }
      throw new Error(
        `${error instanceof Error ? error.message : "repair disable readback failed"}; `
        + "policy disable outcome is not confirmed",
      );
    }
    throw error;
  }
}

function installPlist(plan) {
  const staging = `${PLIST}.v71-${randomUUID()}`;
  try {
    writePrivateCreateOnly(staging, plan.plist_preview);
    renameSync(staging, PLIST);
    chmodSync(PLIST, 0o600);
    fsyncPath(PLIST);
    fsyncPath(dirname(PLIST));
  } finally {
    rmSync(staging, { force: true });
  }
  runLaunchctl(["bootstrap", `gui/${UID}`, PLIST]);
  runLaunchctl(["kickstart", "-k", SERVICE]);
}

function localHealth() {
  const result = spawnSync(NODE_BIN, [
    join(TARGET_ARTIFACT_ROOT, "scripts/youtube-extraction-worker-runner.mjs"),
    "health",
    "--config", TARGET_CONFIG,
    "--manifest", TARGET_MANIFEST,
    "--credential", TARGET_CREDENTIAL,
    "--secret-root", SECRET_ROOT,
    "--app-descriptor", TARGET_DESCRIPTOR,
    "--policy", TARGET_POLICY,
    "--expected-schema", TARGET_SCHEMA,
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  check(result.status === 0, "local worker health failed");
  const health = JSON.parse(result.stdout);
  check(health.ok === true && health.ready === true, "local worker health is not ready");
  return health;
}

function createVerificationReceipt({ credentials, running, caller, health, disabledDatabase }) {
  const receipt = {
    schema: "homecook.youtube-v71-controlled-cutover-verification-receipt.v1",
    status: "generation-47-v71-verified-policy-disabled",
    verifiedAt: new Date().toISOString(),
    releaseSha: YOUTUBE_V71_RELEASE_SHA,
    credentialGeneration: 47,
    credentialExpiresAt: credentials.metadata.expires_at,
    managerCredentialRemoved: !existsSync(MANAGER_TOKEN),
    generation48Issued: false,
    policySnapshotDigest: YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
    policyEnabled: false,
    activationAuthorized: true,
    worker: {
      pid: running.pid,
      stableObservations: running.observations,
      authenticatedPreRequest: caller.authenticatedStatus === 200,
      emptyClaimDenied: caller.emptyClaimDenied === true,
      localHealth: health,
      plistSha256: sha256(readFileSync(PLIST)),
    },
    database: disabledDatabase,
    verificationBudget: {
      extractionCalls: 0,
      modelCalls: 0,
      allowedChecks: ["auth", "health"],
    },
  };
  let receiptCreated = false;
  try {
    durablePrivateJson(VERIFICATION_RECEIPT_PATH, receipt);
    receiptCreated = true;
    durablePrivateJson(JOURNAL_PATH, {
      schema: "homecook.youtube-v71-controlled-cutover-journal.v1",
      state: "activation-intent-durable-policy-disabled",
      verificationReceipt: {
        path: VERIFICATION_RECEIPT_PATH,
        sha256: sha256(readFileSync(VERIFICATION_RECEIPT_PATH)),
      },
      generation48Issued: false,
      extractionCalls: 0,
    }, { replace: true });
  } catch (error) {
    if (receiptCreated) {
      rmSync(VERIFICATION_RECEIPT_PATH, { force: true });
      fsyncPath(dirname(VERIFICATION_RECEIPT_PATH));
    }
    throw error;
  }
  return receipt;
}

function createActivationReceipt({ verificationReceipt, finalRunning, finalDatabase }) {
  const receipt = {
    schema: "homecook.youtube-v71-controlled-cutover-receipt.v1",
    status: "generation-47-v71-running-active-verified",
    completedAt: new Date().toISOString(),
    releaseSha: YOUTUBE_V71_RELEASE_SHA,
    credentialGeneration: 47,
    policySnapshotDigest: YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST,
    policyEnabled: true,
    verificationReceipt: {
      path: VERIFICATION_RECEIPT_PATH,
      sha256: sha256(readFileSync(VERIFICATION_RECEIPT_PATH)),
      verifiedAt: verificationReceipt.verifiedAt,
    },
    worker: {
      pid: finalRunning.pid,
      stableObservations: finalRunning.observations,
      plistSha256: sha256(readFileSync(PLIST)),
    },
    database: finalDatabase,
    verificationBudget: verificationReceipt.verificationBudget,
  };
  let receiptCreated = false;
  try {
    durablePrivateJson(RECEIPT_PATH, receipt);
    receiptCreated = true;
    durablePrivateJson(JOURNAL_PATH, {
      schema: "homecook.youtube-v71-controlled-cutover-journal.v1",
      state: "completed",
      receipt: { path: RECEIPT_PATH, sha256: sha256(readFileSync(RECEIPT_PATH)) },
      verificationReceipt: receipt.verificationReceipt,
      generation48Issued: false,
      extractionCalls: 0,
    }, { replace: true });
  } catch (error) {
    if (receiptCreated) {
      rmSync(RECEIPT_PATH, { force: true });
      fsyncPath(dirname(RECEIPT_PATH));
    }
    throw error;
  }
  return receipt;
}

function reconcileActivationReceipt(verificationReceipt) {
  const receipt = readJsonFile(
    RECEIPT_PATH,
    "v71 activation receipt",
    { mode: 0o600 },
  );
  const verificationProof = verificationReceiptProof();
  check(
    receipt.schema === "homecook.youtube-v71-controlled-cutover-receipt.v1"
    && receipt.status === "generation-47-v71-running-active-verified"
    && receipt.releaseSha === YOUTUBE_V71_RELEASE_SHA
    && receipt.credentialGeneration === 47
    && receipt.policySnapshotDigest === YOUTUBE_V71_POLICY_SNAPSHOT_DIGEST
    && receipt.policyEnabled === true
    && receipt.verificationReceipt?.path === verificationProof?.path
    && receipt.verificationReceipt?.sha256 === verificationProof?.sha256
    && receipt.verificationReceipt?.verifiedAt === verificationReceipt.verifiedAt
    && receipt.worker?.plistSha256 === sha256(readFileSync(PLIST))
    && receipt.verificationBudget?.extractionCalls === 0
    && receipt.verificationBudget?.modelCalls === 0,
    "activation receipt is not exact",
  );
  assertV71OperationalPoststate(receipt.database);
  durablePrivateJson(JOURNAL_PATH, {
    schema: "homecook.youtube-v71-controlled-cutover-journal.v1",
    state: "completed",
    receipt: { path: RECEIPT_PATH, sha256: sha256(readFileSync(RECEIPT_PATH)) },
    verificationReceipt: receipt.verificationReceipt,
    generation48Issued: false,
    extractionCalls: 0,
  }, { replace: true });
  return receipt;
}

function verificationReceiptProof() {
  return existsSync(VERIFICATION_RECEIPT_PATH)
    ? {
        path: VERIFICATION_RECEIPT_PATH,
        sha256: sha256(readFileSync(VERIFICATION_RECEIPT_PATH)),
      }
    : null;
}

function readVerificationReceipt(expectedProof) {
  const proof = verificationReceiptProof();
  check(
    proof
    && expectedProof?.path === proof.path
    && expectedProof?.sha256 === proof.sha256,
    "verification receipt proof mismatch",
  );
  const receipt = readJsonFile(
    VERIFICATION_RECEIPT_PATH,
    "v71 verification receipt",
    { mode: 0o600 },
  );
  check(
    receipt.schema === "homecook.youtube-v71-controlled-cutover-verification-receipt.v1"
    && receipt.status === "generation-47-v71-verified-policy-disabled"
    && receipt.releaseSha === YOUTUBE_V71_RELEASE_SHA
    && receipt.credentialGeneration === 47
    && receipt.policyEnabled === false
    && receipt.activationAuthorized === true
    && receipt.verificationBudget?.extractionCalls === 0
    && receipt.verificationBudget?.modelCalls === 0,
    "verification receipt is not exact",
  );
  return receipt;
}

async function resetDisabledCutoverReceipts(target) {
  const session = openDedicatedAdminSession(
    target.postgresContainerId,
    `youtube-resolution-v71-receipt-reset-${randomUUID().slice(0, 8)}`,
  );
  try {
    await session.query(`SELECT pg_advisory_lock(86120317);
BEGIN ISOLATION LEVEL SERIALIZABLE;
SET LOCAL statement_timeout='30s';
LOCK TABLE private.youtube_extraction_current_policy IN ACCESS EXCLUSIVE MODE;
LOCK TABLE private.youtube_extraction_worker_credentials IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.youtube_extraction_jobs IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.youtube_extractor_permits IN ACCESS EXCLUSIVE MODE;`);
    const database = normalizeDatabaseObservation(lastJson(await session.query(OBSERVATION_SQL)));
    assertV71CutoverPoststate(database, { enabled: false });
    for (const path of [RECEIPT_PATH, VERIFICATION_RECEIPT_PATH]) {
      rmSync(path, { force: true });
    }
    fsyncPath(OPERATION_ROOT);
    await session.query("COMMIT;");
    await session.close();
    return database;
  } catch (error) {
    session.stop();
    throw error;
  }
}

async function verifyActiveWorker(verificationReceipt, workerToken, adapter) {
  check(
    sha256(readFileSync(PLIST)) === verificationReceipt.worker?.plistSha256,
    "active launcher differs from the durable verification receipt",
  );
  const running = await stableWorker();
  await verifyWorkerCaller(workerToken);
  localHealth();
  const database = await observeDatabase(adapter);
  assertV71OperationalPoststate(database);
  return { running, database };
}

async function execute(confirmation) {
  check(confirmation === YOUTUBE_V71_CUTOVER_CONFIRMATION, "exact confirmation required");
  check(!existsSync(RECEIPT_PATH), "cutover receipt already exists");
  check(!existsSync(VERIFICATION_RECEIPT_PATH), "verification receipt already exists; use resume");
  const preparation = validatePreparation();
  const { adapter, target } = await adapterAndTarget();
  const before = await observeDatabase(adapter);
  assertV71CutoverPrestate(before);
  cleanupAbortedPrecommitArtifacts(before);
  const credentials = issueCredentials();
  let registered = false;
  try {
    await authenticatedPreRequest(credentials.managerToken);
    const i031 = await workerI031Preflight();
    const installInputs = buildInstallPlan(preparation, credentials.metadata);
    const plan = await renderInstallPlan(installInputs.previousBytes, i031);
    const immediate = await observeDatabase(adapter);
    assertV71CutoverPrestate(immediate);
    runLaunchctl(["bootout", SERVICE]);
    await stoppedWorker();
    await transitionDatabase(
      target,
      decodeJwtClaims(credentials.managerToken),
      credentials.metadata,
      preparation,
      adapter,
    );
    registered = true;
    rmSync(MANAGER_TOKEN, { force: true });
    installPlist(plan);
    await stableWorker();
    const caller = await verifyWorkerCaller(credentials.workerToken);
    const health = localHealth();
    const disabled = await observeDatabase(adapter);
    assertV71CutoverPoststate(disabled, { enabled: false });
    const activation = await enablePolicyAfterDurableVerification(
      target,
      adapter,
      async (lockedDisabledDatabase) => {
        const lockedRunning = await stableWorker();
        return createVerificationReceipt({
          credentials,
          running: lockedRunning,
          caller,
          health,
          disabledDatabase: lockedDisabledDatabase,
        });
      },
    );
    const finalRunning = await stableWorker();
    return createActivationReceipt({
      verificationReceipt: activation.verificationReceipt,
      finalRunning,
      finalDatabase: activation.finalDatabase,
    });
  } catch (error) {
    rmSync(MANAGER_TOKEN, { force: true });
    const readback = await observeDatabase(adapter).catch(() => null);
    if (!registered && readback?.credential?.generation === 46) {
      cleanupAbortedPrecommitArtifacts(readback);
      const status = readLaunchStatus();
      if (!status.loaded) {
        runLaunchctl(["bootstrap", `gui/${UID}`, PLIST]);
        runLaunchctl(["kickstart", "-k", SERVICE]);
      }
    } else {
      const activationPending = readback?.credential?.generation === 47
        && readback?.policy?.enabled === true;
      durablePrivateJson(JOURNAL_PATH, {
        schema: "homecook.youtube-v71-controlled-cutover-journal.v1",
        state: activationPending
          ? "generation-47-active-receipt-reconcile-required"
          : "generation-47-kept-v71-repair-required",
        error: error instanceof Error ? error.message : "cutover failed",
        database: readback,
        verificationReceipt: verificationReceiptProof(),
        managerCredentialRemoved: !existsSync(MANAGER_TOKEN),
        generation48Issued: false,
      }, { replace: existsSync(JOURNAL_PATH) });
    }
    throw error;
  }
}

async function resume(confirmation) {
  check(confirmation === YOUTUBE_V71_CUTOVER_CONFIRMATION, "exact confirmation required");
  check(existsSync(JOURNAL_PATH), "cutover journal is missing");
  const journal = readJsonFile(JOURNAL_PATH, "v71 cutover journal", { mode: 0o600 });
  check([
    "commit-intent",
    "generation-47-committed-policy-disabled",
    "generation-47-committed-install-repair-required",
    "generation-47-kept-v71-repair-required",
    "activation-intent-durable-policy-disabled",
    "generation-47-active-receipt-reconcile-required",
  ].includes(journal.state), "journal does not authorize generation-47 repair");
  validatePreparation({ allowReplacedPlist: true });
  ensureMaterializedCandidate();
  check(existsSync(TARGET_TOKEN) && existsSync(TARGET_CREDENTIAL),
    "generation-47 credential files are missing");
  const workerToken = readFileSync(TARGET_TOKEN, "utf8").trim();
  const metadata = readJsonFile(TARGET_CREDENTIAL, "generation 47 credential", { mode: 0o600 });
  assertV71WorkerCredential({ claims: decodeJwtClaims(workerToken), metadata });
  const credentials = { workerToken, metadata };
  const { adapter, target } = await adapterAndTarget();
  let database = await observeDatabase(adapter);
  let verificationReceipt = null;
  if (database.policy?.enabled === true) {
    assertV71OperationalPoststate(database);
    check(existsSync(VERIFICATION_RECEIPT_PATH),
      "active policy requires a durable verification receipt");
    verificationReceipt = readVerificationReceipt(journal.verificationReceipt);
  } else {
    database = await resetDisabledCutoverReceipts(target);
  }
  rmSync(MANAGER_TOKEN, { force: true });
  fsyncPath(SECRET_ROOT);
  try {
    if (database.policy?.enabled === true) {
      let active = null;
      try {
        active = await verifyActiveWorker(verificationReceipt, workerToken, adapter);
      } catch (activeWorkerError) {
        database = await disablePolicyForRepair(target, adapter);
        database = await resetDisabledCutoverReceipts(target);
        verificationReceipt = null;
        durablePrivateJson(JOURNAL_PATH, {
          schema: "homecook.youtube-v71-controlled-cutover-journal.v1",
          state: "generation-47-kept-v71-repair-required",
          originalError: activeWorkerError instanceof Error
            ? activeWorkerError.message
            : "active worker verification failed",
          database,
          verificationReceipt: verificationReceiptProof(),
          managerCredentialRemoved: true,
          generation48Issued: false,
          extractionCalls: 0,
        }, { replace: true });
      }
      if (active) {
        return existsSync(RECEIPT_PATH)
          ? reconcileActivationReceipt(verificationReceipt)
          : createActivationReceipt({
              verificationReceipt,
              finalRunning: active.running,
              finalDatabase: active.database,
            });
      }
    }

    const previousBytes = readFileSync(BACKUP_PLIST_PATH);
    const preparation = readJsonFile(PREPARE_PATH, "v71 cutover preparation", { mode: 0o600 });
    check(sha256(previousBytes) === preparation.predecessor.plistSha256,
      "generation-46 launcher backup changed");
    const i031 = await workerI031Preflight();
    const plan = await renderInstallPlan(previousBytes, i031);
    const status = readLaunchStatus();
    if (status.loaded) runLaunchctl(["bootout", SERVICE]);
    installPlist(plan);
    await stableWorker();
    const caller = await verifyWorkerCaller(workerToken);
    const health = localHealth();
    const current = await observeDatabase(adapter);
    assertV71CutoverPoststate(current, { enabled: false });
    const activation = await enablePolicyAfterDurableVerification(
      target,
      adapter,
      async (lockedDisabledDatabase) => {
        const lockedRunning = await stableWorker();
        return verificationReceipt
          ? verificationReceipt
          : createVerificationReceipt({
              credentials,
              running: lockedRunning,
              caller,
              health,
              disabledDatabase: lockedDisabledDatabase,
            });
      },
    );
    const finalRunning = await stableWorker();
    return createActivationReceipt({
      verificationReceipt: activation.verificationReceipt,
      finalRunning,
      finalDatabase: activation.finalDatabase,
    });
  } catch (error) {
    const failedDatabase = await observeDatabase(adapter).catch(() => null);
    durablePrivateJson(JOURNAL_PATH, {
      schema: "homecook.youtube-v71-controlled-cutover-journal.v1",
      state: failedDatabase?.policy?.enabled === true
        ? "generation-47-active-receipt-reconcile-required"
        : "generation-47-kept-v71-repair-required",
      error: error instanceof Error ? error.message : "repair failed",
      database: failedDatabase,
      verificationReceipt: verificationReceiptProof(),
      managerCredentialRemoved: !existsSync(MANAGER_TOKEN),
      generation48Issued: false,
    }, { replace: true });
    throw error;
  }
}

const C04_POLICY_STABLE_SQL = "SELECT encode(sha256(convert_to((to_jsonb(t)-'enabled'-'updated_at')::text,'UTF8')),'hex') FROM private.youtube_extraction_current_policy t WHERE policy_key='primary';";

function c04Paths(review) {
  const prefix = review.releaseSha.slice(0, 12), suffix = `${prefix}-${review.operationId.slice(0, 8)}`;
  const operationDirectory = join(review.operationRoot, review.operationId);
  const artifactRoot = join(HOME, `.homecook/youtube-extraction-releases/${prefix}-c04-quantity-v4`);
  return { operationDirectory, artifactRoot, sourceArtifact: join(ROOT, `.artifacts/youtube-c04-worker-${prefix}`),
    sourceDescriptor: join(ROOT, `.artifacts/youtube-c04-app-descriptor-${prefix}.json`),
    manifest: join(artifactRoot, "artifact.json"), schema: join(artifactRoot, "scripts/manifests/youtube-extraction-expected-schema.json"),
    descriptor: join(SECRET_ROOT, `app-descriptor-${suffix}-c04.json`), policy: join(SECRET_ROOT, `current-policy-${suffix}-c04.json`),
    config: join(SECRET_ROOT, `worker-v48-${suffix}-c04.env`), token: join(SECRET_ROOT, `worker-v48-${suffix}-c04.jwt`),
    credential: join(SECRET_ROOT, `worker-credential-v48-${suffix}-c04.json`), manager: join(SECRET_ROOT, `manager-v48-${suffix}-c04.jwt`),
    oldConfig: join(SECRET_ROOT, "worker-v47-youtube-integrated-20261013.env"),
    oldCredential: join(SECRET_ROOT, "worker-credential-v47-youtube-integrated-20261013.json"),
    oldArtifact: join(HOME, ".homecook/youtube-extraction-releases/8e515a6482a1-youtube-integrated-20261013/artifact.json"),
    preparation: join(operationDirectory, "cutover-prepare.json"), journal: join(operationDirectory, "cutover-journal.json"),
    pre: join(operationDirectory, "pre-worker-checkpoint.json"), post: join(operationDirectory, "post-worker-terminal.json"),
    preOrigin: join(operationDirectory, "pre-worker-origin.json"), postOrigin: join(operationDirectory, "post-worker-origin.json"),
    repairPauses: join(operationDirectory, "repair-pauses"),
    activationVerification: join(operationDirectory, "activation-verification.json"), activationReceipt: join(operationDirectory, "activation-receipt.json"),
    backup: join(operationDirectory, "generation-47.plist"), invocation: join(operationDirectory, "cutover-invocation.lock") };
}

function loadC04Review() {
  // Missing authority is denied before private directory/config/service I/O.
  check(typeof YOUTUBE_C04_RELEASE_SHA === "string" && typeof YOUTUBE_C04_ARTIFACT_SHA256 === "string"
    && typeof YOUTUBE_C04_OPERATION_ROOT === "string" && typeof YOUTUBE_C04_CUTOVER_REVIEW_PIN.path === "string"
    && /^[a-f0-9]{64}$/u.test(YOUTUBE_C04_CUTOVER_REVIEW_PIN.sha256 ?? ""), "unbound C04 profile");
  check(typeof c04Authority.loadQuantityV4DatabaseReceipt === "function"
    && typeof c04Authority.acquirePrelaunchDeployLock === "function"
    && typeof c04Authority.loadQuantityV4ReaderWriterReceipts === "function"
    && typeof c04Database.observeQuantityV4WorkerBoundary === "function", "C04 DB authority helpers are not integrated");
  const bytes = c04Authority.readClosedR2PrivateBytes(YOUTUBE_C04_CUTOVER_REVIEW_PIN.path, ROOT, 524288);
  check(sha256(bytes) === YOUTUBE_C04_CUTOVER_REVIEW_PIN.sha256, "C04 original review bytes differ");
  const bindings = { releaseSha: YOUTUBE_C04_RELEASE_SHA, artifactSha256: YOUTUBE_C04_ARTIFACT_SHA256, operationRoot: YOUTUBE_C04_OPERATION_ROOT };
  return { review: assertC04QuantityControlReview(JSON.parse(bytes), bindings), bindings, reviewSha256: sha256(bytes) };
}

async function createC04Adapters(review, reviewSha256) {
  const paths = c04Paths(review), directory = paths.operationDirectory;
  const readPrivate = path => c04Authority.readClosedR2PrivateBytes(path, ROOT, 524288);
  const baseJournal = { schema: "homecook.youtube-c04-controlled-cutover-journal.v1", reviewSha256,
    operationId: review.operationId, operationDirectory: directory, releaseSha: review.releaseSha, targetSha256: review.targetSha256 };
  const readJournal = () => assertC04QuantityJournal(review, JSON.parse(readPrivate(paths.journal)), reviewSha256);
  const journal = async (state, fields = {}) => {
    const previous = existsSync(paths.journal) ? readJournal() : baseJournal;
    durablePrivateJson(paths.journal, { ...previous, ...fields, state }, { replace: existsSync(paths.journal) });
  };
  async function candidate() {
    validateYoutubeExtractionWorkerSecretRoot(SECRET_ROOT);
    const source = verifyYoutubeExtractionWorkerArtifact(join(paths.sourceArtifact, "artifact.json"));
    check(source.release_sha === review.releaseSha && source.artifact_sha256 === review.artifactSha256
      && source.expected_schema_sha256 === review.expectedSchemaSha256 && source.pipeline_identity === "85fbf4877e6f2894841bfd160f2d9a63894eb709fd63e897483efe71fd4016cd"
      && source.allowed_snapshot_digest === review.snapshotDigest && source.policy_version === 3, "C04 sealed source differs");
    check(sha256File(paths.sourceDescriptor) === review.descriptorSha256, "C04 descriptor bytes differ");
    if (!existsSync(paths.artifactRoot)) cpSync(paths.sourceArtifact, paths.artifactRoot, { recursive: true, errorOnExist: true, force: false });
    const target = verifyYoutubeExtractionWorkerArtifact(paths.manifest);
    check(target.artifact_sha256 === review.artifactSha256 && sha256File(paths.schema) === review.expectedSchemaSha256, "C04 target artifact/schema differs");
    const schema = JSON.parse(readFileSync(paths.schema, "utf8"));
    check(schema.catalog_fingerprint === review.catalogAfter, "C04 sealed catalog differs");
    if (existsSync(paths.descriptor)) check(sha256(readPrivate(paths.descriptor)) === review.descriptorSha256, "C04 existing descriptor differs");
    copyPrivateExact(paths.sourceDescriptor, paths.descriptor, review.descriptorSha256);
    const oldConfigBytes = readPrivate(paths.oldConfig);
    if (existsSync(paths.config)) check(sha256(readPrivate(paths.config)) === sha256(oldConfigBytes), "C04 existing config differs");
    copyPrivateExact(paths.oldConfig, paths.config, sha256(oldConfigBytes));
    const { buildYoutubeExtractionCurrentPolicy } = await import("./lib/youtube-extraction-worker-artifact.mjs");
    const policy = buildYoutubeExtractionCurrentPolicy({ policySnapshotDigest: review.snapshotDigest,
      policyVersion: 3, pipelineIdentity: target.pipeline_identity, extractorMode: target.extractor_mode, enabled: true });
    const policyBytes = `${stableStringify(policy)}\n`;
    if (!existsSync(paths.policy)) writePrivateCreateOnly(paths.policy, policyBytes);
    check(readPrivate(paths.policy).toString() === policyBytes, "C04 policy file changed");
  }
  function predecessorService() {
    const manifest = verifyYoutubeExtractionWorkerArtifact(paths.oldArtifact);
    check(manifest.release_sha === YOUTUBE_V71_RELEASE_SHA
      && sha256File(paths.oldArtifact) === YOUTUBE_V71_ARTIFACT_MANIFEST_FILE_SHA256, "actual predecessor artifact differs");
    const metadata = JSON.parse(readPrivate(paths.oldCredential));
    const token = readFileSync(validateYoutubeExtractionWorkerSecretFile(metadata.token_file, { secretRoot: SECRET_ROOT }), "utf8").trim();
    const claims = decodeJwtClaims(token);
    // Safe OFF does not require an unexpired old token; its identity still must be exact.
    check(claims.generation === 47 && claims.release_sha === YOUTUBE_V71_RELEASE_SHA && claims.jti_hash === metadata.jti_sha256
      && metadata.schema_identity === review.schemaIdentity && metadata.allowed_snapshot_digest === review.snapshotDigest
      && metadata.token_file_sha256 === sha256File(metadata.token_file), "old47 credential identity differs");
    const bytes = readFileSync(PLIST), plist = parsePlist(bytes);
    check(plist.Label === LABEL && plist.ProgramArguments.includes(paths.oldCredential), "old47 launcher differs");
    return { ...readLaunchStatus(), plistSha256: sha256(bytes), metadataSha256: sha256(readPrivate(paths.oldCredential)), jtiHash: claims.jti_hash };
  }
  async function preflight(stage, quantityWriterState = "off") {
    const result = await c04Database.observeQuantityV4WorkerBoundary({ repositoryRoot: ROOT, stage, quantityWriterState });
    const { authority, observation, adapter } = result;
    check(authority.review.to === review.releaseSha && authority.review.database.targetSha256 === review.targetSha256, "foreign DB authority");
    const consumers = stage === "consumers" ? authority : c04Authority.loadQuantityV4DatabaseReceipt(ROOT, "consumers");
    check(consumers.record.status === "committed" && consumers.record.to === review.releaseSha
      && (stage === "worker" || consumers.record.normalDataSha256 === observation.normalDataSha256),
      "T1 data/source receipt differs");
    return { authority, adapter, stage, quantityWriterState, target: observation.target, consumersReceiptSha256: consumers.pointer.sha256,
      databaseReceiptSha256: stage === "worker" ? authority.pointer.sha256 : null };
  }
  async function observation(context, query) {
    const appName = `youtube-resolution-c04-${review.operationId.slice(0, 8)}`;
    const boundary = await context.adapter.observe(query, appName);
    const model = normalizeDatabaseObservation(lastJson(query ? await query(OBSERVATION_SQL) : await context.adapter.query(OBSERVATION_SQL)));
    const worker = boundary.worker;
    const policyStableSha256 = lastLine(query ? await query(C04_POLICY_STABLE_SQL) : await context.adapter.query(C04_POLICY_STABLE_SQL));
    check(/^[a-f0-9]{64}$/u.test(policyStableSha256), "full stable policy hash required");
    return { ...worker, ...model, policyStableSha256, targetSha256: sha256(JSON.stringify(boundary.target)), ledgerCount: boundary.ledger.length,
      normalDataSha256: boundary.normalDataSha256, quantityPolicyEnabled: boundary.writerEnabled,
      productWriterEnabled: boundary.productWriterEnabled, weightWriterEnabled: boundary.cookedWeightWriterEnabled,
      workerPolicyEnabled: worker.workerPolicyEnabled, credentialGeneration: worker.credentialGeneration,
      workerReleaseSha: worker.workerReleaseSha, schemaIdentity: worker.schemaIdentity, snapshotDigest: worker.snapshotDigest,
      jtiHash: model.credential.jtiHash };
  }
  async function transaction(context, callback) {
    const session = openDedicatedAdminSession(context.target.postgresContainerId, `youtube-resolution-c04-${randomUUID().slice(0, 8)}`);
    try {
      await session.query(`BEGIN ISOLATION LEVEL SERIALIZABLE; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SET LOCAL idle_in_transaction_session_timeout='30s';
SELECT pg_advisory_xact_lock(86120317);
SELECT singleton FROM private.recipe_product_only_write_control WHERE singleton FOR SHARE;
SELECT singleton FROM private.cooked_batch_weight_evidence_control WHERE singleton FOR SHARE;
SELECT singleton FROM private.quantity_input_v4_policy WHERE singleton FOR SHARE;
LOCK TABLE private.youtube_extraction_current_policy IN ACCESS EXCLUSIVE MODE;
LOCK TABLE private.youtube_extraction_worker_credentials IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.youtube_extraction_jobs IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.youtube_extractor_permits IN ACCESS EXCLUSIVE MODE;`);
      const tx = { observe: () => observation(context, sql => session.query(sql)),
        closePolicy: () => session.query("UPDATE private.youtube_extraction_current_policy SET enabled=false,updated_at=clock_timestamp() WHERE policy_key='primary' AND enabled IS TRUE;"),
        enablePolicy: () => session.query("UPDATE private.youtube_extraction_current_policy SET enabled=true,updated_at=clock_timestamp() WHERE policy_key='primary' AND enabled IS FALSE;"),
        rotate: (manager, credentials) => session.query(buildC04QuantityCredentialTransitionSql({ managerClaims: decodeJwtClaims(manager.token), credentialMetadata: credentials.metadata, review })) };
      await callback(tx);
      await session.query("COMMIT;"); await session.close();
    } finally { session.stop(); }
  }
  function existingCredentials(origin = null) {
    const metadataBytes = readPrivate(paths.credential), metadata = JSON.parse(metadataBytes);
    const token = readFileSync(validateYoutubeExtractionWorkerSecretFile(paths.token, { secretRoot: SECRET_ROOT }), "utf8").trim();
    assertC04QuantityWorkerCredential({ claims: decodeJwtClaims(token), metadata }, review);
    check(metadata.token_file === paths.token && metadata.token_file_sha256 === sha256File(paths.token), "C04 token bytes/origin differ");
    if (origin) check(origin.credentials?.metadataPath === paths.credential && origin.credentials.metadataSha256 === sha256(metadataBytes), "C04 journal credential proof differs");
    return { workerToken: token, metadata, metadataSha256: sha256(metadataBytes) };
  }
  function keys() {
    check(realpathSync(JWT_KEYS) === JWT_KEYS && !JWT_KEYS.startsWith(`${ROOT}/`) && !JWT_KEYS.startsWith(`${SECRET_ROOT}/`), "C04 key origin differs");
    return JSON.parse(readFileSync(ensureRegularFile(JWT_KEYS, "local signing key", { mode: 0o600, expectedUserId: UID }), "utf8"));
  }
  async function issueCredentials() {
    check(!existsSync(paths.token) && !existsSync(paths.credential), "C04 output exists; original resume required");
    await journal("credential-issue-intent", {});
    const worker = issueYoutubeExtractionWorkerCredential({ jwtKeys: keys(), generation: 48, releaseSha: review.releaseSha,
      schemaIdentity: review.schemaIdentity, allowedSnapshotDigest: review.snapshotDigest, ttlSeconds: YOUTUBE_V71_CREDENTIAL_TTL_SECONDS });
    let tokenCreated = false, metadataCreated = false;
    try {
      writePrivateCreateOnly(paths.token, `${worker.token}\n`); tokenCreated = true;
      const metadata = buildYoutubeExtractionWorkerCredentialState({ tokenFile: paths.token, generation: 48, jtiHash: worker.jtiHash,
        expiresAt: worker.metadata.expires_at, releaseSha: review.releaseSha, schemaIdentity: review.schemaIdentity,
        allowedSnapshotDigest: review.snapshotDigest, secretRoot: SECRET_ROOT });
      writePrivateCreateOnly(paths.credential, `${stableStringify(metadata)}\n`); metadataCreated = true;
      const credentials = existingCredentials();
      await journal("credential-issued", { credentials: { metadataPath: paths.credential, metadataSha256: credentials.metadataSha256 } });
      return credentials;
    } catch (error) {
      // Issuer has not registered anything in DB. Remove only bytes created by this invocation.
      if (metadataCreated) rmSync(paths.credential);
      if (tokenCreated) rmSync(paths.token);
      fsyncPath(SECRET_ROOT); throw error;
    }
  }
  async function issueManager() {
    if (existsSync(paths.manager)) {
      const previous = readJournal();
      const bytes = readPrivate(paths.manager);
      check(previous.manager?.path === paths.manager && previous.manager.sha256 === sha256(bytes), "foreign manager output; no removal authorized");
      rmSync(paths.manager); fsyncPath(SECRET_ROOT);
    }
    const manager = issueYoutubeExtractionCredentialManager({ jwtKeys: keys(), ttlSeconds: 300 });
    const managerBytes = `${manager.token}\n`;
    let created = false;
    try {
      writePrivateCreateOnly(paths.manager, managerBytes); created = true;
      const proof = { path: paths.manager, sha256: sha256(readPrivate(paths.manager)) };
      await journal(readJournal().state, { manager: proof }); return { ...manager, proof };
    } catch (error) {
      if (created && sha256(readPrivate(paths.manager)) === sha256(managerBytes)) { rmSync(paths.manager); fsyncPath(SECRET_ROOT); }
      throw error;
    }
  }
  async function authenticateManager(manager) {
    assertV71ManagerClaims(decodeJwtClaims(manager.token));
    const environment = await readWorkerEnvironment(paths.config);
    const apiKeyPath = validateYoutubeExtractionWorkerSecretFile(environment.HOMECOOK_YOUTUBE_WORKER_DATA_API_KEY_FILE, { secretRoot: SECRET_ROOT });
    const client = createRestrictedPostgrestRpcClient({ dataApiUrl: environment.HOMECOOK_YOUTUBE_WORKER_DATA_API_URL,
      apiKey: readFileSync(apiKeyPath, "utf8").trim(), token: manager.token });
    check((await client.rpc("check_youtube_extraction_worker_pre_request")).error === null, "C04 manager authenticated pre-request denied");
  }
  async function publishCheckpoint(phase, record, { repair = false, policyStableSha256 } = {}) {
    let file = phase === "before" ? paths.pre : paths.post;
    let originFile = phase === "before" ? paths.preOrigin : paths.postOrigin;
    const bytes = `${JSON.stringify(record, null, 2)}\n`;
    check(/^[a-f0-9]{64}$/u.test(policyStableSha256 ?? ""), "checkpoint full stable policy hash required");
    const existingJournal = readJournal();
    if (phase === "after" && repair && existingJournal.postWorkerTerminal?.sha256 === sha256(bytes)) {
      const existing = readCheckpoint("after", existingJournal);
      check(existingJournal.policyStableSha256 === policyStableSha256, "current post stable policy differs");
      await journal("verified-policy-disabled", {}); return existing;
    }
    if (existsSync(file) && sha256(readPrivate(file)) !== sha256(bytes)) {
      check(phase === "after" && repair && review.postReceiptSha256 === null, "immutable checkpoint differs; explicit OFF resume authority required");
      const parent = privateDirectory(join(directory, "verifications"));
      const verificationDirectory = privateDirectory(join(parent, randomUUID()));
      file = join(verificationDirectory, "post-worker-terminal.json");
      originFile = join(verificationDirectory, "post-worker-origin.json");
    }
    const pointer = { path: file, sha256: sha256(bytes) };
    const optional = phase === "before" ? review.preReceiptSha256 : review.postReceiptSha256;
    check(optional === null || optional === pointer.sha256, "review-pinned checkpoint bytes differ");
    if (!existsSync(file)) durablePrivateJson(file, record);
    check(sha256(readPrivate(file)) === pointer.sha256, "C04 immutable checkpoint bytes differ");
    const state = phase === "before" ? "quiesced" : "verified-policy-disabled";
    const previous = readJournal();
    if (previous.policyStableSha256) check(previous.policyStableSha256 === policyStableSha256, "checkpoint stable policy changed");
    const pauseBasis = phase === "after" && previous.repairPause ? readRepairPause(previous) : null;
    const origin = { ...previous,
      ...(phase === "after" && previous.postWorkerTerminal ? {
        previousPostWorkerTerminal: pauseBasis?.previousPostWorkerTerminal ?? previous.postWorkerTerminal,
        previousPostWorkerOrigin: pauseBasis?.previousPostWorkerOrigin ?? previous.postWorkerOrigin,
        activationVerification: pauseBasis?.activationVerification ?? previous.activationVerification,
        activationReceipt: pauseBasis ? pauseBasis.activationReceipt : previous.activationReceipt ?? null,
        activationReconciliation: pauseBasis ? pauseBasis.activationReconciliation : previous.activationReconciliation ?? null,
      } : {}), state, policyStableSha256, workerDatabaseReceiptSha256: record.workerDatabaseReceiptSha256,
      [phase === "before" ? "preWorkerCheckpoint" : "postWorkerTerminal"]: pointer };
    if (!existsSync(originFile)) durablePrivateJson(originFile, origin);
    const savedOrigin = JSON.parse(readPrivate(originFile));
    assertC04QuantityCheckpointOrigin(review, record, savedOrigin, { phase, reviewSha256, receiptSha256: pointer.sha256 });
    await journal(state, { policyStableSha256, workerDatabaseReceiptSha256: record.workerDatabaseReceiptSha256,
      [phase === "before" ? "preWorkerCheckpoint" : "postWorkerTerminal"]: pointer,
      [phase === "before" ? "preWorkerOrigin" : "postWorkerOrigin"]: { path: originFile, sha256: sha256(readPrivate(originFile)) } });
    return record;
  }
  function readCheckpoint(phase, current) {
    const before = phase === "before", originPointer = before ? current.preWorkerOrigin : current.postWorkerOrigin;
    const receiptPointer = before ? current.preWorkerCheckpoint : current.postWorkerTerminal;
    check(originPointer?.path === (before ? paths.preOrigin : paths.postOrigin)
      || (!before && review.postReceiptSha256 === null && originPointer?.path === join(dirname(receiptPointer?.path ?? ""), "post-worker-origin.json")), "foreign checkpoint origin path");
    const originBytes = readPrivate(originPointer.path);
    check(sha256(originBytes) === originPointer.sha256, "immutable journal origin changed");
    const origin = JSON.parse(originBytes);
    check(/^[a-f0-9]{64}$/u.test(origin.policyStableSha256 ?? "") && origin.policyStableSha256 === current.policyStableSha256, "immutable full stable policy origin differs");
    const originReceipt = before ? origin.preWorkerCheckpoint : origin.postWorkerTerminal;
    check(originReceipt?.path === receiptPointer?.path && originReceipt?.sha256 === receiptPointer?.sha256, "current pointer not bound to original publication");
    const bytes = readPrivate(originReceipt.path);
    return assertC04QuantityCheckpointOrigin(review, JSON.parse(bytes), origin, { phase, reviewSha256, receiptSha256: sha256(bytes) });
  }
  async function installAndVerify(credentials, pre, { resume }) {
    const i031 = await workerI031Preflight(paths.config);
    const raw = buildYoutubeExtractionWorkerInstallPlan({ configPath: paths.config, manifestPath: paths.manifest,
      credentialPath: paths.credential, appDescriptorPath: paths.descriptor, currentPolicyPath: paths.policy,
      expectedSchemaPath: paths.schema, secretRoot: SECRET_ROOT, homeDir: HOME, nodeBin: NODE_BIN,
      rootDir: paths.artifactRoot, userId: UID, dryRun: true, i031Preflight: i031 });
    const original = readPrivate(paths.backup);
    check(sha256(original) === pre.plistSha256, "C04 predecessor backup differs");
    const preview = preserveYoutubeResolutionLauncherEnvironment(parsePlist(original), raw.plist_preview);
    const targetSha = sha256(preview), liveSha = sha256(readFileSync(PLIST));
    check(liveSha === pre.plistSha256 || (resume && liveSha === targetSha), "foreign plist; no replacement authorized");
    const launch = readLaunchStatus();
    if (liveSha === targetSha && launch.loaded && launch.state === "running") {
      // Healthy48 resume verifies in place, with no stop/reinstall.
    } else {
      check(!launch.loaded || (resume && liveSha === targetSha), "foreign loaded service; no stop authorized");
      if (launch.loaded) { runLaunchctl(["bootout", SERVICE]); await stoppedWorker(); }
      check(sha256(readFileSync(PLIST)) === liveSha, "plist changed immediately before replacement");
      installPlist({ plist_preview: preview });
    }
    return verifyInstalled(credentials, { plistSha256: targetSha });
  }
  async function verifyInstalled(credentials, post) {
    check(sha256(readFileSync(PLIST)) === post.plistSha256, "C04 installed plist differs");
    const running = await stableWorker();
    const environment = await readWorkerEnvironment(paths.config);
    const caller = await verifyYoutubeResolutionWorkerCaller({ environment, token: credentials.workerToken, secretRoot: SECRET_ROOT });
    const result = spawnSync(NODE_BIN, [join(paths.artifactRoot, "scripts/youtube-extraction-worker-runner.mjs"), "health",
      "--config", paths.config, "--manifest", paths.manifest, "--credential", paths.credential, "--secret-root", SECRET_ROOT,
      "--app-descriptor", paths.descriptor, "--policy", paths.policy, "--expected-schema", paths.schema], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    check(result.status === 0, "C04 local health failed; output withheld");
    const final = readLaunchStatus();
    check(final.loaded && final.state === "running" && final.pid === running.pid && sha256(readFileSync(PLIST)) === post.plistSha256, "C04 service changed during actual health");
    return { ...caller, health: JSON.parse(result.stdout), stableObservations: running.observations,
      service: { ...final, plistSha256: post.plistSha256 } };
  }
  function readerWriterAuthority(context) {
    const authority = c04Authority.loadQuantityV4ReaderWriterReceipts(ROOT);
    check(authority.database.pointer.sha256 === context.databaseReceiptSha256
      && authority.reader.record.releaseSha === review.releaseSha && authority.writer.record.to === review.releaseSha, "foreign reader/writer authority");
    return { readerReceiptSha256: authority.reader.pointer.sha256, writerReceiptSha256: authority.writer.pointer.sha256 };
  }
  function activationOrigin(current) {
    const pointer = current.activationVerification;
    const nested = typeof pointer?.path === "string" && pointer.path.startsWith(`${directory}/activation-verifications/`)
      && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\/verification\.json$/u.test(pointer.path.slice(`${directory}/activation-verifications/`.length));
    check(pointer?.path === paths.activationVerification || nested, "foreign activation proof path");
    const bytes = readPrivate(pointer.path);
    check(pointer.sha256 === sha256(bytes), "activation proof changed");
    const record = JSON.parse(bytes);
    check(record.schema === "homecook.youtube-c04-activation-verification.v1" && record.reviewSha256 === reviewSha256
      && record.operationId === review.operationId && record.releaseSha === review.releaseSha && record.targetSha256 === review.targetSha256
      && record.zeroActualAI === true && record.observation.credentialGeneration === 48
      && record.post.workerDatabaseReceiptSha256 === current.workerDatabaseReceiptSha256, "foreign activation proof binding");
    return record;
  }
  async function reconcileActivation(current, observation, post) {
    const origin = activationOrigin(current);
    if (current.activationReconciliation) {
      const pointer = current.activationReconciliation;
      check(typeof pointer.path === "string" && pointer.path.startsWith(`${directory}/activation-reconciliations/`)
        && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\/receipt\.json$/u.test(pointer.path.slice(`${directory}/activation-reconciliations/`.length)), "foreign reconciliation path");
      const bytes = readPrivate(pointer.path); check(sha256(bytes) === pointer.sha256, "reconciliation changed");
      const saved = JSON.parse(bytes);
      check(saved.schema === "homecook.youtube-c04-activation-reconciliation.v1" && saved.reviewSha256 === reviewSha256
        && saved.operationId === review.operationId && saved.releaseSha === review.releaseSha && saved.targetSha256 === review.targetSha256
        && saved.workerDatabaseReceiptSha256 === post.workerDatabaseReceiptSha256 && ["committed", "not_applied"].includes(saved.status)
        && saved.activationVerification.sha256 === current.activationVerification.sha256
        && saved.beforeObservation.policyRowSha256 === origin.observation.policyRowSha256
        && saved.beforeObservation.policyStableSha256 === origin.observation.policyStableSha256
        && saved.expectedAfter.policyStableSha256 === origin.observation.policyStableSha256
        && saved.expectedAfter.workerPolicyEnabled === true && saved.expectedAfter.credentialGeneration === 48
        && saved.expectedAfter.workerReleaseSha === review.releaseSha && saved.expectedAfter.targetSha256 === review.targetSha256
        && saved.observation.credentialGeneration === 48 && saved.observation.workerReleaseSha === review.releaseSha
        && saved.observation.credentialRowSha256 === origin.observation.credentialRowSha256
        && saved.observation.policyStableSha256 === origin.observation.policyStableSha256
        && saved.observation.policyStableSha256 === observation.policyStableSha256, "foreign reconciliation authority");
      return pointer;
    }
    check(observation.credentialGeneration === 48 && observation.workerReleaseSha === review.releaseSha
      && observation.targetSha256 === review.targetSha256 && observation.ledgerCount === 227 && observation.catalogFingerprint === review.catalogAfter
      && observation.credentialRowSha256 === origin.observation.credentialRowSha256
      && observation.policyStableSha256 === origin.observation.policyStableSha256
      && stableStringify(observation.policy) === stableStringify({ ...origin.observation.policy, enabled: observation.workerPolicyEnabled }), "reconciliation identity/semantic differs");
    const status = observation.workerPolicyEnabled ? "committed" : "not_applied";
    check(status === "committed" || observation.policyRowSha256 === origin.observation.policyRowSha256, "unknown OFF whole row; no positive reconciliation");
    const record = { ...baseJournal, schema: "homecook.youtube-c04-activation-reconciliation.v1", status,
      workerDatabaseReceiptSha256: post.workerDatabaseReceiptSha256, activationVerification: current.activationVerification,
      previousPostWorkerTerminal: current.postWorkerTerminal, previousPostWorkerOrigin: current.postWorkerOrigin,
      beforeObservation: origin.observation,
      expectedAfter: { workerPolicyEnabled: true, policyStableSha256: origin.observation.policyStableSha256,
        credentialRowSha256: origin.observation.credentialRowSha256, credentialGeneration: 48, workerReleaseSha: review.releaseSha,
        targetSha256: review.targetSha256, ledgerCount: 227, catalogFingerprint: review.catalogAfter },
      observation, zeroActualAI: true };
    const parent = privateDirectory(join(directory, "activation-reconciliations"));
    const file = join(privateDirectory(join(parent, randomUUID())), "receipt.json");
    durablePrivateJson(file, record);
    const pointer = { path: file, sha256: sha256(readPrivate(file)) };
    await journal(current.state, { activationReconciliation: pointer }); return pointer;
  }
  async function publishRepairPause(value) {
    const parent = privateDirectory(paths.repairPauses), file = join(parent, `${randomUUID()}.json`);
    const current = readJournal();
    const record = { ...baseJournal, schema: "homecook.youtube-c04-repair-pause.v1", ...value,
      workerDatabaseReceiptSha256: current.workerDatabaseReceiptSha256, activationVerification: current.activationVerification,
      activationReceipt: current.activationReceipt ?? null, activationReconciliation: current.activationReconciliation ?? null, previousPostWorkerTerminal: current.postWorkerTerminal,
      previousPostWorkerOrigin: current.postWorkerOrigin, zeroActualAI: true };
    durablePrivateJson(file, record);
    await journal(value.status === "quiesced" ? "repair-quiesced" : "repair-drain-pending", { repairPause: { path: file, sha256: sha256(readPrivate(file)) } });
    return record;
  }
  function readRepairPause(current) {
    const pointer = current.repairPause;
    check(typeof pointer?.path === "string" && pointer.path.startsWith(`${paths.repairPauses}/`)
      && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.json$/u.test(pointer.path.slice(`${paths.repairPauses}/`.length)), "foreign repair pause path");
    const bytes = readPrivate(pointer.path); check(sha256(bytes) === pointer.sha256, "repair pause changed");
    const record = JSON.parse(bytes);
    check(record.schema === "homecook.youtube-c04-repair-pause.v1" && record.reviewSha256 === reviewSha256
      && record.operationId === review.operationId && record.releaseSha === review.releaseSha && record.targetSha256 === review.targetSha256
      && record.status === "quiesced" && record.observation.quantityPolicyEnabled === false && record.observation.workerPolicyEnabled === false
      && record.observation.credentialGeneration === 48 && record.observation.workerReleaseSha === review.releaseSha
      && record.workerDatabaseReceiptSha256 === current.workerDatabaseReceiptSha256
      && record.observation.policyStableSha256 === current.policyStableSha256
      && record.beforeObservation.policyStableSha256 === current.policyStableSha256
      && !record.service.loaded && record.zeroActualAI === true, "repair pause origin differs");
    return record;
  }
  async function publishActivationVerification(value) {
    const record = { ...baseJournal, schema: "homecook.youtube-c04-activation-verification.v1", workerDatabaseReceiptSha256: value.post.workerDatabaseReceiptSha256, ...value, zeroActualAI: true };
    const bytes = `${JSON.stringify(record, null, 2)}\n`;
    let file = paths.activationVerification;
    if (existsSync(file) && sha256(readPrivate(file)) !== sha256(bytes)) {
      const parent = privateDirectory(join(directory, "activation-verifications"));
      file = join(privateDirectory(join(parent, randomUUID())), "verification.json");
    }
    if (!existsSync(file)) durablePrivateJson(file, record);
    const pointer = { path: file, sha256: sha256(readPrivate(file)) };
    await journal("activation-verified-policy-disabled", { activationVerification: pointer, activationReceipt: null, activationReconciliation: null, installationRepairBasis: null });
    return pointer;
  }
  async function publishActivationReceipt(context, proof, authority) {
    const verificationBytes = readPrivate(proof.path);
    check(sha256(verificationBytes) === proof.sha256, "activation verification changed");
    const verification = JSON.parse(verificationBytes);
    const health = await verifyInstalled(existingCredentials(readJournal()), verification.post);
    const database = await observation(context), service = readLaunchStatus();
    check(database.workerPolicyEnabled === true && database.quantityPolicyEnabled === true
      && database.productWriterEnabled === true && database.weightWriterEnabled === true
      && database.credentialGeneration === 48 && database.workerReleaseSha === review.releaseSha
      && database.targetSha256 === review.targetSha256 && database.ledgerCount === 227 && database.catalogFingerprint === review.catalogAfter
      && database.policyStableSha256 === verification.observation.policyStableSha256
      && stableStringify(database.policy) === stableStringify({ ...verification.observation.policy, enabled: true }) && database.credentialRowSha256 === verification.observation.credentialRowSha256
      && service.loaded && service.state === "running" && service.pid === health.service.pid
      && sha256(readFileSync(PLIST)) === verification.service.plistSha256, "activation committed readback differs");
    const record = { ...baseJournal, schema: "homecook.youtube-c04-activation-receipt.v1", status: "committed",
      workerDatabaseReceiptSha256: context.databaseReceiptSha256, activationVerification: proof, ...authority,
      beforeObservation: verification.observation, observation: database, database, service: { ...service, plistSha256: sha256(readFileSync(PLIST)) }, zeroActualAI: true };
    let file = paths.activationReceipt;
    if (existsSync(file) && JSON.parse(readPrivate(file)).activationVerification?.sha256 !== proof.sha256) {
      const parent = privateDirectory(join(directory, "activation-receipts"));
      file = join(privateDirectory(join(parent, randomUUID())), "receipt.json");
    }
    if (!existsSync(file)) durablePrivateJson(file, record);
    const saved = JSON.parse(readPrivate(file));
    check(saved.reviewSha256 === reviewSha256 && saved.activationVerification?.sha256 === proof.sha256, "activation receipt already differs");
    await journal("activation-committed", { activationReceipt: { path: file, sha256: sha256(readPrivate(file)) } });
    return saved;
  }
  return { verifyCandidate: candidate, preflight, observe: context => observation(context), transaction, predecessorService,
    publishPreparation: value => {
      if (existsSync(paths.preparation)) { const saved = JSON.parse(readPrivate(paths.preparation)); assertC04QuantityJournal(review, saved, reviewSha256); check(saved.state === "prepared", "prepare origin differs"); return saved; }
      const record = { ...baseJournal, state: "prepared", ...value }; durablePrivateJson(paths.preparation, record); return record; },
    verifyPreparation: () => { const record = JSON.parse(readPrivate(paths.preparation)); assertC04QuantityJournal(review, record, reviewSha256); check(record.state === "prepared", "C04 prepare origin differs"); },
    journal, readJournal, readJournalIfPresent: () => existsSync(paths.journal) ? readJournal() : null, publishCheckpoint,
    stopPredecessor: async old => { check(sha256(readFileSync(PLIST)) === old.plistSha256, "old plist changed before stop");
      if (!existsSync(paths.backup)) writePrivateCreateOnly(paths.backup, readFileSync(PLIST));
      if (readLaunchStatus().loaded) runLaunchctl(["bootout", SERVICE]); await stoppedWorker(); },
    readCheckpoint,
    assertStoppedPredecessor: async pre => { const old = predecessorService(); check(!old.loaded && old.plistSha256 === pre.plistSha256
      && old.metadataSha256 === pre.credentialMetadataSha256, "locked predecessor is not stopped/exact"); },
    issueCredentials, existingCredentials, issueManager, authenticateManager,
    removeManager: async manager => { if (existsSync(paths.manager)) {
      check(manager.proof?.sha256 === sha256(readPrivate(paths.manager)), "foreign manager bytes; no cleanup authorized");
      rmSync(paths.manager); fsyncPath(SECRET_ROOT); } },
    credentialProof: credentials => ({ metadataPath: paths.credential, metadataSha256: credentials.metadataSha256 }),
    installAndVerify, verifyInstalled, readerWriterAuthority, publishActivationVerification, publishActivationReceipt,
    activationOrigin, reconcileActivation, publishRepairPause, readRepairPause,
    stopInstalled: async service => { check(sha256(readFileSync(PLIST)) === service.plistSha256, "repair plist changed before stop");
      const current = readLaunchStatus(); check(!current.loaded || current.pid === service.pid, "repair service changed before stop");
      if (current.loaded) runLaunchctl(["bootout", SERVICE]); await stoppedWorker(); },
    finalizeActivation: async (context, current, credentials, post, authority) => {
      const proof = activationOrigin(current);
      check(proof.authority.readerReceiptSha256 === authority.readerReceiptSha256 && proof.authority.writerReceiptSha256 === authority.writerReceiptSha256,
        "activation reader/writer authority changed");
      await verifyInstalled(credentials, post); return publishActivationReceipt(context, current.activationVerification, authority);
    },
    assertStableInstalled: async service => { const running = await stableWorker(); check(running.pid === service.pid && sha256(readFileSync(PLIST)) === service.plistSha256, "locked service PID/plist changed"); },
    verifyActivationReceipt: async (context, current, credentials, post, authority) => {
      const pointer = current.activationReceipt;
      const nested = typeof pointer?.path === "string" && pointer.path.startsWith(`${directory}/activation-receipts/`)
        && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\/receipt\.json$/u.test(pointer.path.slice(`${directory}/activation-receipts/`.length));
      check((pointer?.path === paths.activationReceipt || nested) && pointer.sha256 === sha256(readPrivate(pointer.path)), "foreign activation receipt");
      const record = JSON.parse(readPrivate(pointer.path));
      check(record.reviewSha256 === reviewSha256 && record.workerDatabaseReceiptSha256 === context.databaseReceiptSha256
        && record.readerReceiptSha256 === authority.readerReceiptSha256 && record.writerReceiptSha256 === authority.writerReceiptSha256, "activation authority changed");
      const health = await verifyInstalled(credentials, post), database = await observation(context);
      const original = activationOrigin(current);
      check(database.workerPolicyEnabled === true && database.quantityPolicyEnabled === true
        && database.credentialRowSha256 === original.observation.credentialRowSha256
        && database.policyRowSha256 === record.database.policyRowSha256
        && database.policyStableSha256 === original.observation.policyStableSha256
        && stableStringify(database.policy) === stableStringify({ ...original.observation.policy, enabled: true })
        && health.service.plistSha256 === post.plistSha256, "activation current policy/credential differs");
      return record;
    },
    currentService: () => ({ ...readLaunchStatus(), plistSha256: sha256(readFileSync(PLIST)) }) };
}

async function runC04QuantityCutover(argv) {
  const args = parseC04QuantityCutoverArguments(argv);
  const { review, bindings, reviewSha256 } = loadC04Review(), paths = c04Paths(review);
  check(!paths.operationDirectory.startsWith(`${ROOT}/`) && paths.operationDirectory !== ROOT, "C04 operation directory must be outside source");
  for (let part = paths.operationDirectory; ; part = dirname(part)) {
    if (existsSync(part)) check(!lstatSync(part).isSymbolicLink() && !existsSync(join(part, ".git")), "C04 linked/repository operation ancestor rejected");
    if (part === dirname(part)) break;
  }
  const globalLock = await c04Authority.acquirePrelaunchDeployLock();
  try {
    return await withDirectoryInvocationLock(paths.operationDirectory, paths.invocation, async () => {
      const adapters = await createC04Adapters(review, reviewSha256);
      const engine = createC04QuantityWorkerCutover({ review, bindings, reviewSha256, adapters });
      if (args.command === "--prepare") return engine.prepare();
      if (args.command === "--quiesce") return engine.quiesce();
      if (args.command === "--resume") return engine.resume();
      if (args.command === "--activate") return engine.activate();
      if (args.command === "--pause-for-repair") return engine.pauseForRepair();
      return engine.execute();
    });
  } finally { globalLock.release(); }
}

const [command, confirmation] = process.argv.slice(2);
try {
  if (command === "--profile") {
    process.stdout.write(`${JSON.stringify(await runC04QuantityCutover(process.argv.slice(2)), null, 2)}\n`);
  } else if (command === "--prepare" && confirmation === undefined) {
    process.stdout.write(`${JSON.stringify(await withInvocationLock(prepare), null, 2)}\n`);
  } else if (command === "--execute") {
    process.stdout.write(`${JSON.stringify(await withInvocationLock(
      () => execute(confirmation),
    ), null, 2)}\n`);
  } else if (command === "--resume") {
    process.stdout.write(`${JSON.stringify(await withInvocationLock(
      () => resume(confirmation),
    ), null, 2)}\n`);
  } else {
    throw new Error(
      `usage: youtube-v71-controlled-cutover.mjs --prepare | --execute|--resume ${YOUTUBE_V71_CUTOVER_CONFIRMATION}`,
    );
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
