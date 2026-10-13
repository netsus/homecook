#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  COPYFILE_EXCL,
  chmodSync,
  closeSync,
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
      'enabled', enabled,
      'snapshotDigest', private.youtube_extraction_policy_snapshot_digest(
        extractor_mode, pipeline_identity, result_affecting_options, policy_version
      )
    ) FROM private.youtube_extraction_current_policy WHERE policy_key='primary'
  )
)::text;
`;

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
  return lastJson(await adapter.query(OBSERVATION_SQL));
}

async function workerI031Preflight() {
  const environment = await readWorkerEnvironment(TARGET_CONFIG);
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
    const locked = lastJson(await session.query(OBSERVATION_SQL));
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
    const post = lastJson(await session.query(`${transition}\n${OBSERVATION_SQL}`));
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
    const before = lastJson(await session.query(OBSERVATION_SQL));
    assertV71CutoverPoststate(before, { enabled: false });
    const verificationReceipt = await createVerificationReceipt(before);
    const after = lastJson(await session.query(`
UPDATE private.youtube_extraction_current_policy
SET enabled=true, updated_at=clock_timestamp()
WHERE policy_key='primary';
${OBSERVATION_SQL}`));
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
    const before = lastJson(await session.query(OBSERVATION_SQL));
    assertV71CutoverPoststate(before, { enabled: true });
    const after = lastJson(await session.query(`
UPDATE private.youtube_extraction_current_policy
SET enabled=false, updated_at=clock_timestamp()
WHERE policy_key='primary';
${OBSERVATION_SQL}`));
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
  check(health.healthy === true, "local worker health is not healthy");
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
    const database = lastJson(await session.query(OBSERVATION_SQL));
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
    const stopped = readLaunchStatus();
    check(!stopped.loaded && stopped.state === "unloaded", "generation 46 did not stop");
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

const [command, confirmation] = process.argv.slice(2);
try {
  if (command === "--prepare" && confirmation === undefined) {
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
