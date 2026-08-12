import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  YOUTUBE_EXTRACTION_WORKER_CREDENTIAL_SCHEMA,
  YOUTUBE_EXTRACTION_WORKER_HEALTH_SCHEMA,
  YOUTUBE_EXTRACTION_WORKER_LABEL,
  ensureAbsolutePath,
  ensureIsoTimestamp,
  ensureJtiHash,
  ensureNonEmptyString,
  ensureRegularFile,
  ensureReleaseSha,
  ensureSnapshotDigest,
  modeBits,
  readJsonFile,
  readMode,
  readYoutubeExtractionAppDescriptor,
  readYoutubeExtractionCurrentPolicy,
  readYoutubeExtractionExpectedSchema,
  readYoutubeExtractionWorkerArtifact,
  readYoutubeExtractionWorkerQueueState,
  sha256File,
  verifyYoutubeExtractionWorkerArtifact,
  writeJsonFile,
} from "./youtube-extraction-worker-artifact.mjs";

const TEMPLATE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "templates",
  "com.homecook.youtube-extraction-worker.plist.template",
);

export const DEFAULT_YOUTUBE_EXTRACTION_WORKER_SECRET_MODE = 0o600;
export const DEFAULT_YOUTUBE_EXTRACTION_WORKER_LOG_DIR_NAME = "Homecook";
const EXACT_I031_CODEX_CLI_VERSION = "0.144.0-alpha.4";

const WORKER_CONFIG_ALLOWLIST = new Set([
  "HOMECOOK_YOUTUBE_WORKER_AUDIENCE",
  "HOMECOOK_YOUTUBE_WORKER_DATA_API_URL",
  "HOMECOOK_YOUTUBE_WORKER_ISSUER",
  "HOMECOOK_YOUTUBE_WORKER_PROVIDER_SECRET_FILE",
  "HOMECOOK_YOUTUBE_WORKER_RUNTIME_ROOT",
  "HOMECOOK_YOUTUBE_WORKER_ID",
  "HOMECOOK_YOUTUBE_WORKER_POLL_INTERVAL_MS",
]);

const WORKER_FORBIDDEN_CONFIG_PATTERN =
  /(SERVICE_ROLE|SIGNING_KEY|ACCESS_TOKEN|REFRESH_TOKEN|COOKIE|HMAC|JWT\s*=)/iu;

function ensureInteger(value, label, { minimum = 0 } = {}) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}.`);
  }
  return value;
}

function buildPathEnv(nodeBin) {
  const nodeDir = dirname(ensureAbsolutePath(nodeBin, "nodeBin"));
  return [...new Set([
    nodeDir,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ])].join(":");
}

/**
 * @param {string} configPath
 */
export function validateYoutubeExtractionWorkerConfigPath(configPath) {
  const normalizedPath = ensureRegularFile(configPath, "worker config", {
    mode: DEFAULT_YOUTUBE_EXTRACTION_WORKER_SECRET_MODE,
  });
  const lines = readFileSync(normalizedPath, "utf8").split(/\r?\n/u);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) throw new Error("worker config contains an invalid entry.");
    const key = trimmed.slice(0, separator).trim();
    if (WORKER_FORBIDDEN_CONFIG_PATTERN.test(key) || !WORKER_CONFIG_ALLOWLIST.has(key)) {
      throw new Error(`worker config key is forbidden: ${key}`);
    }
  }
  return normalizedPath;
}

/**
 * @param {string} secretFile
 */
export function validateYoutubeExtractionWorkerSecretFile(secretFile) {
  return ensureRegularFile(secretFile, "worker secret file", {
    mode: DEFAULT_YOUTUBE_EXTRACTION_WORKER_SECRET_MODE,
  });
}

/**
 * @param {string} [homeDir]
 */
export function getYoutubeExtractionWorkerPaths(
  homeDir = process.env.HOME ?? "",
) {
  const normalizedHomeDir = ensureAbsolutePath(homeDir, "homeDir");
  const logDir = resolve(
    normalizedHomeDir,
    "Library",
    "Logs",
    DEFAULT_YOUTUBE_EXTRACTION_WORKER_LOG_DIR_NAME,
  );
  return {
    homeDir: normalizedHomeDir,
    logDir,
    plistPath: resolve(
      normalizedHomeDir,
      "Library",
      "LaunchAgents",
      `${YOUTUBE_EXTRACTION_WORKER_LABEL}.plist`,
    ),
    stdoutPath: resolve(logDir, "youtube-extraction-worker.out.log"),
    stderrPath: resolve(logDir, "youtube-extraction-worker.err.log"),
  };
}

/**
 * @param {{
 *   userId: number,
 *   label?: string,
 * }} options
 */
export function buildYoutubeExtractionWorkerServiceTarget({
  userId,
  label = YOUTUBE_EXTRACTION_WORKER_LABEL,
} = {}) {
  const normalizedUserId = ensureInteger(userId, "userId", { minimum: 0 });
  return `gui/${normalizedUserId}/${label}`;
}

/**
 * @param {{
 *   configPath: string,
 *   manifestPath: string,
 *   credentialPath: string,
 *   appDescriptorPath: string,
 *   currentPolicyPath: string,
 *   expectedSchemaPath: string,
 *   homeDir?: string,
 *   nodeBin?: string,
 *   rootDir?: string,
 * }} options
 */
export function renderYoutubeExtractionWorkerPlist({
  configPath,
  manifestPath,
  credentialPath,
  appDescriptorPath,
  currentPolicyPath,
  expectedSchemaPath,
  homeDir = process.env.HOME ?? "",
  nodeBin = process.execPath,
  rootDir,
} = {}) {
  const normalizedConfigPath = validateYoutubeExtractionWorkerConfigPath(
    configPath,
  );
  const normalizedManifestPath = ensureRegularFile(
    manifestPath,
    "worker manifest",
  );
  const normalizedCredentialPath = ensureRegularFile(
    credentialPath,
    "worker credential metadata",
    { mode: DEFAULT_YOUTUBE_EXTRACTION_WORKER_SECRET_MODE },
  );
  const normalizedAppDescriptorPath = ensureRegularFile(
    appDescriptorPath,
    "app descriptor",
  );
  const normalizedCurrentPolicyPath = ensureRegularFile(
    currentPolicyPath,
    "current policy",
  );
  const normalizedExpectedSchemaPath = ensureRegularFile(
    expectedSchemaPath,
    "expected schema manifest",
  );
  const normalizedHomeDir = ensureAbsolutePath(homeDir, "homeDir");
  const normalizedNodeBin = ensureAbsolutePath(nodeBin, "nodeBin");
  const artifactRoot = dirname(normalizedManifestPath);
  const normalizedRootDir = rootDir === undefined
    ? artifactRoot
    : ensureAbsolutePath(rootDir, "rootDir");
  if (normalizedRootDir !== artifactRoot) {
    throw new Error("worker artifact root mismatch");
  }
  const paths = getYoutubeExtractionWorkerPaths(normalizedHomeDir);
  const template = readFileSync(TEMPLATE_PATH, "utf8");

  return template
    .replaceAll("__LABEL__", YOUTUBE_EXTRACTION_WORKER_LABEL)
    .replaceAll("__HOME__", normalizedHomeDir)
    .replaceAll("__PATH__", buildPathEnv(normalizedNodeBin))
    .replaceAll("__NODE_BIN__", normalizedNodeBin)
    .replaceAll("__ROOT_DIR__", normalizedRootDir)
    .replaceAll(
      "__RUNNER_PATH__",
      resolve(normalizedRootDir, "scripts", "youtube-extraction-worker-runner.mjs"),
    )
    .replaceAll("__CONFIG_PATH__", normalizedConfigPath)
    .replaceAll("__MANIFEST_PATH__", normalizedManifestPath)
    .replaceAll("__CREDENTIAL_PATH__", normalizedCredentialPath)
    .replaceAll("__APP_DESCRIPTOR_PATH__", normalizedAppDescriptorPath)
    .replaceAll("__CURRENT_POLICY_PATH__", normalizedCurrentPolicyPath)
    .replaceAll("__EXPECTED_SCHEMA_PATH__", normalizedExpectedSchemaPath)
    .replaceAll("__STDOUT_LOG__", paths.stdoutPath)
    .replaceAll("__STDERR_LOG__", paths.stderrPath);
}

/**
 * @param {{
 *   serviceTarget: string,
 *   status: number,
 *   stdout?: string,
 *   stderr?: string,
 *   label?: string,
 * }} options
 */
export function parseLaunchctlPrintStatus({
  serviceTarget,
  status,
  stdout = "",
  stderr = "",
  label = YOUTUBE_EXTRACTION_WORKER_LABEL,
} = {}) {
  if (status === 113 || /could not find service/i.test(stderr)) {
    return {
      label,
      serviceTarget,
      loaded: false,
      pid: null,
      state: "unloaded",
      raw: `${stdout}${stderr}`,
    };
  }

  const stateMatch = stdout.match(/state = ([^\n]+)/u);
  const pidMatch = stdout.match(/pid = (\d+)/u);

  return {
    label,
    serviceTarget,
    loaded: status === 0,
    pid: pidMatch ? Number(pidMatch[1]) : null,
    state: stateMatch ? stateMatch[1].trim() : "unknown",
    raw: `${stdout}${stderr}`,
  };
}

function ensureDryRun(dryRun, action) {
  if (!dryRun) {
    throw new Error(`${action} is Manual Only. Rehearsal requires --dry-run.`);
  }
}

function validateI031PreflightAttestation(value) {
  if (
    !value
    || value.ready !== true
    || value.codexCliVersion !== EXACT_I031_CODEX_CLI_VERSION
    || value.chatGptLogin !== true
    || value.toolsReady !== true
  ) {
    throw new Error("exact i031 preflight attestation is required");
  }
  return value;
}

function buildLaunchctlPlan(command, args) {
  return {
    command: "/bin/launchctl",
    args,
    printable: `/bin/launchctl ${[command, ...args.slice(1)].join(" ")}`.trim(),
  };
}

/**
 * @param {{
 *   configPath: string,
 *   manifestPath: string,
 *   credentialPath: string,
 *   appDescriptorPath: string,
 *   currentPolicyPath: string,
 *   expectedSchemaPath: string,
 *   homeDir?: string,
 *   nodeBin?: string,
 *   rootDir?: string,
 *   userId?: number,
 *   dryRun?: boolean,
 *   i031Preflight?: {ready: boolean, codexCliVersion: string, chatGptLogin: boolean, toolsReady: boolean},
 * }} options
 */
export function buildYoutubeExtractionWorkerInstallPlan({
  configPath,
  manifestPath,
  credentialPath,
  appDescriptorPath,
  currentPolicyPath,
  expectedSchemaPath,
  homeDir = process.env.HOME ?? "",
  nodeBin = process.execPath,
  rootDir,
  userId = process.getuid?.() ?? 0,
  dryRun = false,
  i031Preflight,
} = {}) {
  ensureDryRun(dryRun, "install");
  const inputs = loadYoutubeExtractionWorkerRuntimeInputs({
    appDescriptorPath,
    workerArtifactPath: manifestPath,
    currentPolicyPath,
    credentialPath,
    expectedSchemaPath,
  });
  const preflight = evaluateYoutubeExtractionWorkerPreflight({
    ...inputs,
    requirePolicyEnabled: false,
  });
  if (!preflight.ready) {
    throw new Error(`worker install preflight failed: ${preflight.blockers.join(",")}`);
  }
  const runtimePreflight = validateI031PreflightAttestation(i031Preflight);
  const paths = getYoutubeExtractionWorkerPaths(homeDir);
  const plist = renderYoutubeExtractionWorkerPlist({
    configPath,
    manifestPath,
    credentialPath,
    appDescriptorPath,
    currentPolicyPath,
    expectedSchemaPath,
    homeDir,
    nodeBin,
    rootDir,
  });
  const serviceTarget = buildYoutubeExtractionWorkerServiceTarget({ userId });

  return {
    action: "install",
    dry_run: true,
    manual_only: true,
    label: YOUTUBE_EXTRACTION_WORKER_LABEL,
    plist_path: paths.plistPath,
    stdout_path: paths.stdoutPath,
    stderr_path: paths.stderrPath,
    service_target: serviceTarget,
    plist_preview: plist,
    preflight,
    i031_preflight: runtimePreflight,
    commands: [
      buildLaunchctlPlan("bootstrap", ["bootstrap", `gui/${userId}`, paths.plistPath]),
      buildLaunchctlPlan("kickstart", [
        "kickstart",
        "-k",
        serviceTarget,
      ]),
    ],
  };
}

/**
 * @param {{
 *   action: "start" | "stop" | "restart" | "status" | "uninstall",
 *   homeDir?: string,
 *   userId?: number,
 *   dryRun?: boolean,
 *   i031Preflight?: {ready: boolean, codexCliVersion: string, chatGptLogin: boolean, toolsReady: boolean},
 * }} options
 */
export function buildYoutubeExtractionWorkerLifecyclePlan({
  action,
  homeDir = process.env.HOME ?? "",
  userId = process.getuid?.() ?? 0,
  dryRun = false,
  i031Preflight,
} = {}) {
  ensureDryRun(dryRun, action);
  const paths = getYoutubeExtractionWorkerPaths(homeDir);
  const serviceTarget = buildYoutubeExtractionWorkerServiceTarget({ userId });
  const base = {
    action,
    dry_run: true,
    manual_only: true,
    label: YOUTUBE_EXTRACTION_WORKER_LABEL,
    plist_path: paths.plistPath,
    service_target: serviceTarget,
  };

  if (action === "start") {
    const runtimePreflight = validateI031PreflightAttestation(i031Preflight);
    return {
      ...base,
      i031_preflight: runtimePreflight,
      commands: [
        buildLaunchctlPlan("kickstart", ["kickstart", "-k", serviceTarget]),
      ],
    };
  }

  if (action === "stop") {
    return {
      ...base,
      commands: [
        buildLaunchctlPlan("bootout", ["bootout", serviceTarget]),
      ],
    };
  }

  if (action === "restart") {
    const runtimePreflight = validateI031PreflightAttestation(i031Preflight);
    return {
      ...base,
      i031_preflight: runtimePreflight,
      commands: [
        buildLaunchctlPlan("bootout", ["bootout", serviceTarget]),
        buildLaunchctlPlan("bootstrap", ["bootstrap", `gui/${userId}`, paths.plistPath]),
        buildLaunchctlPlan("kickstart", ["kickstart", "-k", serviceTarget]),
      ],
    };
  }

  if (action === "status") {
    return {
      ...base,
      commands: [
        buildLaunchctlPlan("print", ["print", serviceTarget]),
      ],
    };
  }

  if (action === "uninstall") {
    return {
      ...base,
      commands: [
        buildLaunchctlPlan("bootout", ["bootout", serviceTarget]),
      ],
      cleanup_paths: [paths.plistPath],
    };
  }

  throw new Error(`Unsupported lifecycle action: ${action}`);
}

/**
 * @param {{
 *   tokenFile: string,
 *   generation: number,
 *   jtiHash: string,
 *   expiresAt: string,
 *   releaseSha: string,
 *   schemaIdentity: string,
 *   allowedSnapshotDigest: string,
 * }} options
 */
export function buildYoutubeExtractionWorkerCredentialState({
  tokenFile,
  generation,
  jtiHash,
  expiresAt,
  releaseSha,
  schemaIdentity,
  allowedSnapshotDigest,
} = {}) {
  const normalizedTokenFile = validateYoutubeExtractionWorkerSecretFile(tokenFile);
  const normalizedGeneration = ensureInteger(generation, "generation", {
    minimum: 1,
  });
  const normalizedJtiHash = ensureJtiHash(jtiHash);
  const normalizedExpiresAt = ensureIsoTimestamp(expiresAt, "expiresAt");
  const normalizedReleaseSha = ensureReleaseSha(releaseSha);
  const normalizedSchemaIdentity = ensureNonEmptyString(
    schemaIdentity,
    "schemaIdentity",
  );
  const normalizedAllowedSnapshotDigest = ensureSnapshotDigest(
    allowedSnapshotDigest,
  );

  return {
    schema: YOUTUBE_EXTRACTION_WORKER_CREDENTIAL_SCHEMA,
    version: 1,
    generation: normalizedGeneration,
    jti_sha256: normalizedJtiHash,
    expires_at: normalizedExpiresAt,
    release_sha: normalizedReleaseSha,
    schema_identity: normalizedSchemaIdentity,
    allowed_snapshot_digest: normalizedAllowedSnapshotDigest,
    token_file: normalizedTokenFile,
    token_file_mode: `0${readMode(normalizedTokenFile).toString(8)}`,
    token_file_sha256: sha256File(normalizedTokenFile),
  };
}

/**
 * @param {{
 *   tokenFile: string,
 *   expectedGeneration: number,
 *   nextGeneration: number,
 *   jtiHash: string,
 *   expiresAt: string,
 *   releaseSha: string,
 *   schemaIdentity: string,
 *   allowedSnapshotDigest: string,
 * }} options
 */
export function rotateYoutubeExtractionWorkerCredential({
  tokenFile,
  expectedGeneration,
  nextGeneration,
  jtiHash,
  expiresAt,
  releaseSha,
  schemaIdentity,
  allowedSnapshotDigest,
} = {}) {
  const normalizedExpected = ensureInteger(
    expectedGeneration,
    "expectedGeneration",
    { minimum: 1 },
  );
  const normalizedNext = ensureInteger(nextGeneration, "nextGeneration", {
    minimum: 1,
  });

  if (normalizedNext !== normalizedExpected + 1) {
    throw new Error(
      "nextGeneration must be exactly expectedGeneration + 1 for rotation.",
    );
  }

  return buildYoutubeExtractionWorkerCredentialState({
    tokenFile,
    generation: normalizedNext,
    jtiHash,
    expiresAt,
    releaseSha,
    schemaIdentity,
    allowedSnapshotDigest,
  });
}

/**
 * @param {string} path
 */
export function readYoutubeExtractionWorkerCredential(path) {
  const value = readJsonFile(path, "worker credential metadata", {
    mode: DEFAULT_YOUTUBE_EXTRACTION_WORKER_SECRET_MODE,
  });
  if (value.schema !== YOUTUBE_EXTRACTION_WORKER_CREDENTIAL_SCHEMA) {
    throw new Error("worker credential metadata schema is invalid.");
  }
  validateYoutubeExtractionWorkerSecretFile(value.token_file);
  if (value.token_file_sha256 !== sha256File(value.token_file)) {
    throw new Error("worker token file digest does not match metadata.");
  }
  if (value.token_file_mode !== `0${modeBits(readMode(value.token_file)).toString(8)}`) {
    throw new Error("worker token file mode does not match metadata.");
  }
  return value;
}

/**
 * @param {{
 *   appDescriptor: ReturnType<typeof readYoutubeExtractionAppDescriptor>,
 *   workerArtifact: ReturnType<typeof readYoutubeExtractionWorkerArtifact>,
 *   currentPolicy: ReturnType<typeof readYoutubeExtractionCurrentPolicy>,
 *   credentialState: ReturnType<typeof readYoutubeExtractionWorkerCredential>,
 *   queueState?: ReturnType<typeof readYoutubeExtractionWorkerQueueState> | null,
 *   requirePolicyEnabled?: boolean,
 *   expectedSchema?: ReturnType<typeof readYoutubeExtractionExpectedSchema> | null,
 *   expectedSchemaSha256?: string | null,
 * }} options
 */
export function evaluateYoutubeExtractionWorkerPreflight({
  appDescriptor,
  workerArtifact,
  currentPolicy,
  credentialState,
  expectedSchema = null,
  expectedSchemaSha256 = null,
  queueState = null,
  requirePolicyEnabled = false,
} = {}) {
  if (!appDescriptor || !workerArtifact || !currentPolicy || !credentialState) {
    throw new Error("preflight requires appDescriptor, workerArtifact, currentPolicy, credentialState");
  }

  const blockers = [];
  const checks = {
    release_sha_match:
      appDescriptor.release_sha === workerArtifact.release_sha
      && workerArtifact.release_sha === credentialState.release_sha,
    schema_identity_match:
      appDescriptor.schema_identity === workerArtifact.schema_identity
      && workerArtifact.schema_identity === credentialState.schema_identity,
    policy_version_match:
      appDescriptor.expected_policy_version === currentPolicy.policy_version
      && currentPolicy.policy_version === workerArtifact.policy_version,
    snapshot_digest_match:
      appDescriptor.expected_policy_snapshot_digest
      === currentPolicy.policy_snapshot_digest
      && currentPolicy.policy_snapshot_digest
        === workerArtifact.allowed_snapshot_digest
      && workerArtifact.allowed_snapshot_digest
        === credentialState.allowed_snapshot_digest,
    policy_shape_match:
      currentPolicy.extractor_mode === workerArtifact.extractor_mode
      && currentPolicy.pipeline_identity === workerArtifact.pipeline_identity,
    credential_not_expired:
      Date.parse(credentialState.expires_at) > Date.now() + (30 * 60 * 1000),
    label_match:
      workerArtifact.launchd_label === YOUTUBE_EXTRACTION_WORKER_LABEL,
    token_file_0600:
      credentialState.token_file_mode === "0600",
    policy_enabled:
      currentPolicy.enabled === true,
    expected_schema_match:
      expectedSchema === null
      || expectedSchema.schema_identity === workerArtifact.schema_identity,
    artifact_digest_match:
      appDescriptor.artifact_sha256 === workerArtifact.artifact_sha256,
    expected_schema_digest_match:
      appDescriptor.expected_schema_sha256 === workerArtifact.expected_schema_sha256
      && (expectedSchemaSha256 === null
        || workerArtifact.expected_schema_sha256 === expectedSchemaSha256),
  };

  if (!checks.release_sha_match) blockers.push("release_sha_mismatch");
  if (!checks.schema_identity_match) blockers.push("schema_identity_mismatch");
  if (!checks.policy_version_match) blockers.push("policy_version_mismatch");
  if (!checks.snapshot_digest_match) blockers.push("allowed_snapshot_digest_mismatch");
  if (!checks.policy_shape_match) blockers.push("policy_shape_mismatch");
  if (!checks.credential_not_expired) blockers.push("credential_expired");
  if (!checks.label_match) blockers.push("launchd_label_mismatch");
  if (!checks.token_file_0600) blockers.push("token_file_mode_invalid");
  if (requirePolicyEnabled && !checks.policy_enabled) {
    blockers.push("policy_disabled");
  }
  if (!checks.expected_schema_match) blockers.push("expected_schema_mismatch");
  if (!checks.artifact_digest_match) blockers.push("artifact_digest_mismatch");
  if (!checks.expected_schema_digest_match) {
    blockers.push("expected_schema_digest_mismatch");
  }

  if (queueState) {
    if (
      queueState.active_release_sha !== null
      && queueState.active_release_sha !== workerArtifact.release_sha
    ) {
      blockers.push("queue_release_sha_mismatch");
    }
    if (
      queueState.active_schema_identity !== null
      && queueState.active_schema_identity !== workerArtifact.schema_identity
    ) {
      blockers.push("queue_schema_identity_mismatch");
    }
    if (
      queueState.active_policy_snapshot_digest !== null
      && queueState.active_policy_snapshot_digest
        !== workerArtifact.allowed_snapshot_digest
    ) {
      blockers.push("queue_snapshot_digest_mismatch");
    }
  }

  return {
    schema: YOUTUBE_EXTRACTION_WORKER_HEALTH_SCHEMA,
    version: 1,
    ready: blockers.length === 0,
    blockers,
    checks,
    release_sha: workerArtifact.release_sha,
    schema_identity: workerArtifact.schema_identity,
    allowed_snapshot_digest: workerArtifact.allowed_snapshot_digest,
  };
}

/**
 * @param {{
 *   queueState: ReturnType<typeof readYoutubeExtractionWorkerQueueState>,
 *   workerArtifact: ReturnType<typeof readYoutubeExtractionWorkerArtifact>,
 * }} options
 */
export function buildYoutubeExtractionWorkerDrainPlan({
  queueState,
  workerArtifact,
} = {}) {
  if (!queueState || !workerArtifact) {
    throw new Error("drain requires queueState and workerArtifact");
  }

  const blockers = [];
  if (queueState.queued_jobs > 0) blockers.push("queued_jobs_present");
  if (queueState.processing_jobs > 0) blockers.push("processing_jobs_present");
  if (queueState.permit_held) blockers.push("provider_permit_still_held");
  if (!queueState.maintenance_mode) blockers.push("maintenance_mode_disabled");
  if (
    queueState.active_policy_snapshot_digest !== null
    && queueState.active_policy_snapshot_digest
      !== workerArtifact.allowed_snapshot_digest
  ) {
    blockers.push("active_snapshot_drift");
  }

  return {
    action: "drain",
    safe_to_stop: blockers.length === 0,
    blockers,
    queue_snapshot: {
      queued_jobs: queueState.queued_jobs,
      processing_jobs: queueState.processing_jobs,
      permit_held: queueState.permit_held,
      maintenance_mode: queueState.maintenance_mode,
    },
  };
}

/**
 * @param {{
 *   currentArtifact: ReturnType<typeof readYoutubeExtractionWorkerArtifact>,
 *   previousAppDescriptor: ReturnType<typeof readYoutubeExtractionAppDescriptor>,
 *   queueState: ReturnType<typeof readYoutubeExtractionWorkerQueueState>,
 *   currentPolicy: ReturnType<typeof readYoutubeExtractionCurrentPolicy>,
 *   credentialState: ReturnType<typeof readYoutubeExtractionWorkerCredential>,
 *   dryRun?: boolean,
 * }} options
 */
export function buildYoutubeExtractionWorkerRollbackPlan({
  currentArtifact,
  previousAppDescriptor,
  queueState,
  currentPolicy,
  credentialState,
  dryRun = false,
} = {}) {
  ensureDryRun(dryRun, "rollback");
  const preflight = evaluateYoutubeExtractionWorkerPreflight({
    appDescriptor: previousAppDescriptor,
    workerArtifact: currentArtifact,
    currentPolicy,
    credentialState,
    queueState,
  });
  const drain = buildYoutubeExtractionWorkerDrainPlan({
    queueState,
    workerArtifact: currentArtifact,
  });

  return {
    action: "rollback",
    dry_run: true,
    manual_only: true,
    ready: preflight.ready && drain.safe_to_stop,
    blockers: [...preflight.blockers, ...drain.blockers],
    steps: [
      "freeze enqueue publish and keep maintenance_mode=true",
      "verify queue drain and provider permit release",
      "boot out the current launchd worker service",
      `install previous app release ${previousAppDescriptor.release_sha} without rewinding additive schema`,
      "run legacy sync endpoint success smoke before re-opening UI",
    ],
  };
}

/**
 * @param {{
 *   status?: { loaded: boolean, state: string, pid: number | null },
 *   preflight?: { ready: boolean, blockers: string[] },
 *   drain?: { safe_to_stop: boolean, blockers: string[] } | null,
 * }} options
 */
export function buildYoutubeExtractionWorkerHealth({
  status,
  preflight,
  drain,
} = {}) {
  const normalizedStatus = status ?? {
    loaded: false,
    state: "unknown",
    pid: null,
  };
  const normalizedPreflight = preflight ?? { ready: false, blockers: ["preflight_missing"] };
  const normalizedDrain = drain ?? { safe_to_stop: false, blockers: ["drain_missing"] };
  const blockers = [
    ...normalizedPreflight.blockers,
    ...normalizedDrain.blockers,
  ];

  return {
    schema: YOUTUBE_EXTRACTION_WORKER_HEALTH_SCHEMA,
    version: 1,
    ok:
      normalizedStatus.loaded
      && ["running", "waiting"].includes(normalizedStatus.state)
      && normalizedPreflight.ready,
    loaded: normalizedStatus.loaded,
    state: normalizedStatus.state,
    pid: normalizedStatus.pid,
    ready: normalizedPreflight.ready,
    safe_to_stop: normalizedDrain.safe_to_stop,
    blockers,
  };
}

/**
 * @param {{
 *   appDescriptorPath: string,
 *   workerArtifactPath: string,
 *   currentPolicyPath: string,
 *   credentialPath: string,
 *   queueStatePath?: string | null,
 * }} options
 */
export function loadYoutubeExtractionWorkerRuntimeInputs({
  appDescriptorPath,
  workerArtifactPath,
  currentPolicyPath,
  credentialPath,
  expectedSchemaPath = null,
  queueStatePath = null,
} = {}) {
  return {
    appDescriptor: readYoutubeExtractionAppDescriptor(appDescriptorPath),
    workerArtifact: expectedSchemaPath
      ? verifyYoutubeExtractionWorkerArtifact(workerArtifactPath)
      : readYoutubeExtractionWorkerArtifact(workerArtifactPath),
    currentPolicy: readYoutubeExtractionCurrentPolicy(currentPolicyPath),
    credentialState: readYoutubeExtractionWorkerCredential(credentialPath),
    expectedSchema: expectedSchemaPath
      ? readYoutubeExtractionExpectedSchema(expectedSchemaPath)
      : null,
    expectedSchemaSha256: expectedSchemaPath
      ? sha256File(expectedSchemaPath)
      : null,
    queueState:
      queueStatePath === null
        ? null
        : readYoutubeExtractionWorkerQueueState(queueStatePath),
  };
}

/**
 * @param {string} path
 * @param {ReturnType<typeof buildYoutubeExtractionWorkerCredentialState>} credentialState
 */
export function writeCredentialMetadata(path, credentialState) {
  return writeJsonFile(path, credentialState, {
    mode: DEFAULT_YOUTUBE_EXTRACTION_WORKER_SECRET_MODE,
  });
}
