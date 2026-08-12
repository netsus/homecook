import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
} from "node:path";

export const YOUTUBE_EXTRACTION_WORKER_LABEL =
  "com.homecook.youtube-extraction-worker";
export const YOUTUBE_EXTRACTION_WORKER_ARTIFACT_SCHEMA =
  "homecook.youtube-extraction-worker-artifact";
export const YOUTUBE_EXTRACTION_WORKER_APP_DESCRIPTOR_SCHEMA =
  "homecook.youtube-extraction-app-descriptor";
export const YOUTUBE_EXTRACTION_WORKER_POLICY_SCHEMA =
  "homecook.youtube-extraction-current-policy";
export const YOUTUBE_EXTRACTION_WORKER_CREDENTIAL_SCHEMA =
  "homecook.youtube-extraction-worker-credential";
export const YOUTUBE_EXTRACTION_WORKER_QUEUE_STATE_SCHEMA =
  "homecook.youtube-extraction-queue-state";
export const YOUTUBE_EXTRACTION_WORKER_HEALTH_SCHEMA =
  "homecook.youtube-extraction-worker-health";
export const YOUTUBE_EXTRACTION_EXPECTED_SCHEMA =
  "homecook.youtube-extraction-expected-schema";
export const YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY =
  "youtube-extraction-worker-schema-v1";
export const YOUTUBE_EXTRACTION_POLICY_SNAPSHOT_SCHEMA_IDENTITY =
  "youtube-extraction-policy-snapshot-v1";
export const DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_VERSION = 1;
export const DEFAULT_YOUTUBE_EXTRACTION_WORKER_EXTRACTOR_MODE =
  "i031_codex_vision";
export const DEFAULT_YOUTUBE_EXTRACTION_WORKER_PIPELINE_IDENTITY =
  "9adc7876a02c2da55a92e3a65369bf4e803c78efb9a791717201eedc242c1908";

const DEFAULT_INCLUDED_PATHS = Object.freeze([
  "lib/server/youtube-i031-runtime/bundle",
  "scripts/youtube-extraction-worker-runner.mjs",
  "scripts/lib/youtube-extraction-worker-artifact.mjs",
  "scripts/lib/youtube-extraction-worker-ops.mjs",
  "scripts/lib/youtube-extraction-worker-runtime.mjs",
  "scripts/manifests/youtube-extraction-expected-schema.json",
  "scripts/templates/com.homecook.youtube-extraction-worker.plist.template",
]);

export function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function ensureInteger(value, label, { minimum = 0 } = {}) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}.`);
  }

  return value;
}

function ensureHex(value, label, size) {
  const normalized = ensureNonEmptyString(value, label).toLowerCase();
  const pattern = new RegExp(`^[0-9a-f]{${size}}$`, "u");
  if (!pattern.test(normalized)) {
    throw new Error(`${label} must be a lowercase ${size}-hex string.`);
  }
  return normalized;
}

export function ensureReleaseSha(value, label = "releaseSha") {
  return ensureHex(value, label, 40);
}

export function ensureSnapshotDigest(value, label = "allowedSnapshotDigest") {
  return ensureHex(value, label, 64);
}

export function ensureJtiHash(value, label = "jtiHash") {
  return ensureHex(value, label, 64);
}

/**
 * @param {string} value
 * @param {string} label
 */
export function ensureAbsolutePath(value, label) {
  const input = ensureNonEmptyString(value, label);
  if (!isAbsolute(input)) {
    throw new Error(`${label} must be an absolute path.`);
  }
  return resolve(input);
}

/**
 * @param {string} value
 * @param {string} label
 */
export function ensureIsoTimestamp(value, label) {
  const normalized = ensureNonEmptyString(value, label);
  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) {
    throw new Error(`${label} must be an ISO-8601 timestamp.`);
  }
  return new Date(parsed).toISOString();
}

/**
 * @param {number} mode
 */
export function modeBits(mode) {
  return Number(mode) & 0o777;
}

/**
 * @param {string} path
 */
export function readMode(path) {
  return modeBits(statSync(path).mode);
}

/**
 * @param {string} path
 * @param {number} expectedMode
 * @param {string} label
 */
export function validateMode(path, expectedMode, label) {
  const actualMode = readMode(path);
  if (actualMode !== expectedMode) {
    throw new Error(`${label} must use mode 0${expectedMode.toString(8)}.`);
  }
}

/**
 * @param {string} path
 * @param {string} label
 * @param {{ mode?: number }} [options]
 */
export function ensureRegularFile(path, label, { mode } = {}) {
  const normalizedPath = ensureAbsolutePath(path, label);
  if (!existsSync(normalizedPath)) {
    throw new Error(`${label} does not exist: ${normalizedPath}`);
  }

  const stat = statSync(normalizedPath);
  if (!stat.isFile()) {
    throw new Error(`${label} must be a regular file: ${normalizedPath}`);
  }

  if (typeof mode === "number") {
    validateMode(normalizedPath, mode, label);
  }

  return normalizedPath;
}

/**
 * @param {string} value
 */
export function sha256Text(value) {
  return createHash("sha256").update(String(value), "utf8").digest("hex");
}

/**
 * @param {string} path
 */
export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = canonicalize(value[key]);
        return result;
      }, {});
  }

  return value;
}

/**
 * @param {unknown} value
 */
export function stableStringify(value) {
  return JSON.stringify(canonicalize(value), null, 2);
}

/**
 * @param {string} path
 * @param {unknown} value
 * @param {{ mode?: number }} [options]
 */
export function writeJsonFile(path, value, { mode = 0o600 } = {}) {
  const normalizedPath = ensureAbsolutePath(path, "outputPath");
  mkdirSync(dirname(normalizedPath), { recursive: true, mode: 0o700 });
  writeFileSync(normalizedPath, `${stableStringify(value)}\n`, {
    encoding: "utf8",
    mode,
  });
  chmodSync(normalizedPath, mode);
  return normalizedPath;
}

function normalizeRepoRelativePath(rootDir, targetPath) {
  return posix.normalize(relative(rootDir, targetPath).split("\\").join("/"));
}

function buildFileManifest(rootDir, includedPaths) {
  const seen = new Set();
  const files = [];

  const addFile = (absolutePath) => {
    const fileStat = lstatSync(absolutePath);
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
      throw new Error(`artifact path must be a regular file: ${absolutePath}`);
    }
    const normalizedPath = normalizeRepoRelativePath(rootDir, absolutePath);
    if (seen.has(normalizedPath)) return;
    seen.add(normalizedPath);
    files.push({ path: normalizedPath, sha256: sha256File(absolutePath) });
  };

  const addPath = (absolutePath) => {
    const pathStat = lstatSync(absolutePath);
    if (pathStat.isSymbolicLink()) {
      throw new Error(`artifact path must not be a symbolic link: ${absolutePath}`);
    }
    if (pathStat.isFile()) {
      addFile(absolutePath);
      return;
    }
    if (!pathStat.isDirectory()) {
      throw new Error(`artifact path is unsupported: ${absolutePath}`);
    }
    for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
      addPath(join(absolutePath, entry.name));
    }
  };

  for (const relativePath of includedPaths) {
    const normalizedRelativePath = posix.normalize(
      ensureNonEmptyString(relativePath, "includedPath").split("\\").join("/"),
    );
    const absolutePath = resolve(rootDir, normalizedRelativePath);
    if (!existsSync(absolutePath)) {
      throw new Error(`artifact path does not exist: ${normalizedRelativePath}`);
    }
    addPath(absolutePath);
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function makeArtifactReadOnly(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) {
      makeArtifactReadOnly(target);
      chmodSync(target, 0o555);
    } else {
      chmodSync(target, target.endsWith(".mjs") ? 0o555 : 0o444);
    }
  }
  chmodSync(directory, 0o555);
}

/**
 * Materializes the exact manifest bytes into a standalone, read-only directory.
 * @param {{
 *   rootDir?: string,
 *   outputDir: string,
 *   releaseSha: string,
 *   schemaIdentity?: string,
 *   allowedSnapshotDigest: string,
 *   policyVersion?: number,
 * }} options
 */
export function materializeYoutubeExtractionWorkerArtifact({
  rootDir = process.cwd(),
  outputDir,
  releaseSha,
  schemaIdentity = YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
  allowedSnapshotDigest,
  policyVersion = DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_VERSION,
} = {}) {
  const normalizedRoot = ensureAbsolutePath(rootDir, "rootDir");
  const normalizedOutput = ensureAbsolutePath(outputDir, "outputDir");
  if (existsSync(normalizedOutput)) {
    throw new Error("outputDir must not already exist");
  }
  mkdirSync(dirname(normalizedOutput), { recursive: true, mode: 0o700 });
  const stagingRoot = mkdtempSync(join(
    dirname(normalizedOutput),
    `.${basename(normalizedOutput)}.staging-`,
  ));
  try {
    const manifest = buildYoutubeExtractionWorkerArtifactManifest({
      rootDir: normalizedRoot,
      releaseSha,
      schemaIdentity,
      allowedSnapshotDigest,
      policyVersion,
    });
    for (const file of manifest.files) {
      const destination = resolve(stagingRoot, file.path);
      mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
      copyFileSync(resolve(normalizedRoot, file.path), destination);
    }
    const manifestPath = resolve(stagingRoot, "artifact.json");
    writeFileSync(manifestPath, `${stableStringify(manifest)}\n`, {
      encoding: "utf8",
      mode: 0o444,
    });
    makeArtifactReadOnly(stagingRoot);
    renameSync(stagingRoot, normalizedOutput);
    return {
      root_dir: normalizedOutput,
      manifest_path: resolve(normalizedOutput, "artifact.json"),
      entrypoint_path: resolve(normalizedOutput, manifest.entrypoint_relative_path),
      manifest,
    };
  } catch (error) {
    rmSync(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

/**
 * @param {{
 *   rootDir?: string,
 *   releaseSha: string,
 *   schemaIdentity?: string,
 *   allowedSnapshotDigest: string,
 *   policyVersion?: number,
 *   extractorMode?: string,
 *   pipelineIdentity?: string,
 *   includedPaths?: readonly string[],
 * }} options
 */
export function buildYoutubeExtractionWorkerArtifactManifest({
  rootDir = process.cwd(),
  releaseSha,
  schemaIdentity = YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
  allowedSnapshotDigest,
  policyVersion = DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_VERSION,
  extractorMode = DEFAULT_YOUTUBE_EXTRACTION_WORKER_EXTRACTOR_MODE,
  pipelineIdentity = DEFAULT_YOUTUBE_EXTRACTION_WORKER_PIPELINE_IDENTITY,
  includedPaths = DEFAULT_INCLUDED_PATHS,
} = {}) {
  const normalizedRootDir = ensureAbsolutePath(rootDir, "rootDir");
  const normalizedReleaseSha = ensureReleaseSha(releaseSha);
  const normalizedSchemaIdentity = ensureNonEmptyString(
    schemaIdentity,
    "schemaIdentity",
  );
  const normalizedAllowedSnapshotDigest = ensureSnapshotDigest(
    allowedSnapshotDigest,
  );
  const normalizedPolicyVersion = ensureInteger(policyVersion, "policyVersion", {
    minimum: 1,
  });
  const normalizedExtractorMode = ensureNonEmptyString(
    extractorMode,
    "extractorMode",
  );
  const normalizedPipelineIdentity = ensureSnapshotDigest(
    pipelineIdentity,
    "pipelineIdentity",
  );
  const fileManifest = buildFileManifest(normalizedRootDir, includedPaths);
  const baseManifest = {
    schema: YOUTUBE_EXTRACTION_WORKER_ARTIFACT_SCHEMA,
    version: 1,
    deterministic: true,
    release_sha: normalizedReleaseSha,
    schema_identity: normalizedSchemaIdentity,
    launchd_label: YOUTUBE_EXTRACTION_WORKER_LABEL,
    policy_schema_identity: YOUTUBE_EXTRACTION_POLICY_SNAPSHOT_SCHEMA_IDENTITY,
    policy_version: normalizedPolicyVersion,
    extractor_mode: normalizedExtractorMode,
    pipeline_identity: normalizedPipelineIdentity,
    allowed_snapshot_digest: normalizedAllowedSnapshotDigest,
    entrypoint_relative_path: "scripts/youtube-extraction-worker-runner.mjs",
    launchd_template_relative_path:
      "scripts/templates/com.homecook.youtube-extraction-worker.plist.template",
    files: fileManifest,
  };
  const artifactSha = sha256Text(stableStringify(baseManifest));
  return {
    ...baseManifest,
    artifact_sha256: artifactSha,
  };
}

/**
 * @param {{
 *   releaseSha: string,
 *   schemaIdentity?: string,
 *   expectedPolicyVersion?: number,
 *   expectedPolicySnapshotDigest: string,
 * }} options
 */
export function buildYoutubeExtractionAppDescriptor({
  releaseSha,
  schemaIdentity = YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
  expectedPolicyVersion = DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_VERSION,
  expectedPolicySnapshotDigest,
} = {}) {
  return {
    schema: YOUTUBE_EXTRACTION_WORKER_APP_DESCRIPTOR_SCHEMA,
    version: 1,
    release_sha: ensureReleaseSha(releaseSha),
    schema_identity: ensureNonEmptyString(schemaIdentity, "schemaIdentity"),
    expected_policy_version: ensureInteger(
      expectedPolicyVersion,
      "expectedPolicyVersion",
      { minimum: 1 },
    ),
    expected_policy_snapshot_digest: ensureSnapshotDigest(
      expectedPolicySnapshotDigest,
      "expectedPolicySnapshotDigest",
    ),
  };
}

/**
 * @param {{
 *   policyKey?: string,
 *   policyVersion?: number,
 *   policySnapshotDigest: string,
 *   extractorMode?: string,
 *   pipelineIdentity?: string,
 *   enabled?: boolean,
 * }} options
 */
export function buildYoutubeExtractionCurrentPolicy({
  policyKey = "primary",
  policyVersion = DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_VERSION,
  policySnapshotDigest,
  extractorMode = DEFAULT_YOUTUBE_EXTRACTION_WORKER_EXTRACTOR_MODE,
  pipelineIdentity = DEFAULT_YOUTUBE_EXTRACTION_WORKER_PIPELINE_IDENTITY,
  enabled = false,
} = {}) {
  if (typeof enabled !== "boolean") {
    throw new Error("enabled must be a boolean.");
  }

  return {
    schema: YOUTUBE_EXTRACTION_WORKER_POLICY_SCHEMA,
    version: 1,
    policy_key: ensureNonEmptyString(policyKey, "policyKey"),
    policy_version: ensureInteger(policyVersion, "policyVersion", {
      minimum: 1,
    }),
    policy_snapshot_digest: ensureSnapshotDigest(
      policySnapshotDigest,
      "policySnapshotDigest",
    ),
    extractor_mode: ensureNonEmptyString(extractorMode, "extractorMode"),
    pipeline_identity: ensureSnapshotDigest(
      pipelineIdentity,
      "pipelineIdentity",
    ),
    enabled,
  };
}

/**
 * @param {{
 *   queuedJobs?: number,
 *   processingJobs?: number,
 *   permitHeld?: boolean,
 *   permitGeneration?: number,
 *   maintenanceMode?: boolean,
 *   activeReleaseSha?: string | null,
 *   activeSchemaIdentity?: string | null,
 *   activePolicySnapshotDigest?: string | null,
 * }} options
 */
export function buildYoutubeExtractionWorkerQueueState({
  queuedJobs = 0,
  processingJobs = 0,
  permitHeld = false,
  permitGeneration = 0,
  maintenanceMode = false,
  activeReleaseSha = null,
  activeSchemaIdentity = null,
  activePolicySnapshotDigest = null,
} = {}) {
  if (typeof permitHeld !== "boolean") {
    throw new Error("permitHeld must be a boolean.");
  }
  if (typeof maintenanceMode !== "boolean") {
    throw new Error("maintenanceMode must be a boolean.");
  }

  return {
    schema: YOUTUBE_EXTRACTION_WORKER_QUEUE_STATE_SCHEMA,
    version: 1,
    queued_jobs: ensureInteger(queuedJobs, "queuedJobs"),
    processing_jobs: ensureInteger(processingJobs, "processingJobs"),
    permit_held: permitHeld,
    permit_generation: ensureInteger(permitGeneration, "permitGeneration"),
    maintenance_mode: maintenanceMode,
    active_release_sha:
      activeReleaseSha === null ? null : ensureReleaseSha(activeReleaseSha, "activeReleaseSha"),
    active_schema_identity:
      activeSchemaIdentity === null
        ? null
        : ensureNonEmptyString(activeSchemaIdentity, "activeSchemaIdentity"),
    active_policy_snapshot_digest:
      activePolicySnapshotDigest === null
        ? null
        : ensureSnapshotDigest(
          activePolicySnapshotDigest,
          "activePolicySnapshotDigest",
        ),
  };
}

/**
 * @param {string} path
 * @param {string} label
 * @param {{ mode?: number }} [options]
 */
export function readJsonFile(path, label, { mode } = {}) {
  const normalizedPath = ensureRegularFile(path, label, { mode });
  const parsed = JSON.parse(readFileSync(normalizedPath, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed;
}

/**
 * @param {string} path
 */
export function readYoutubeExtractionWorkerArtifact(path) {
  const value = readJsonFile(path, "worker artifact manifest");
  if (value.schema !== YOUTUBE_EXTRACTION_WORKER_ARTIFACT_SCHEMA) {
    throw new Error("worker artifact manifest schema is invalid.");
  }
  return value;
}

export function verifyYoutubeExtractionWorkerArtifact(path) {
  const normalizedPath = ensureRegularFile(path, "worker artifact manifest");
  const value = readYoutubeExtractionWorkerArtifact(normalizedPath);
  const { artifact_sha256: artifactSha, ...baseManifest } = value;
  if (artifactSha !== sha256Text(stableStringify(baseManifest))) {
    throw new Error("worker artifact manifest digest is invalid.");
  }
  if (!Array.isArray(value.files) || value.files.length === 0) {
    throw new Error("worker artifact file inventory is invalid.");
  }
  const artifactRoot = dirname(normalizedPath);
  for (const file of value.files) {
    if (
      !file
      || typeof file.path !== "string"
      || file.path.startsWith("/")
      || file.path.split("/").includes("..")
      || !/^[a-f0-9]{64}$/u.test(file.sha256 ?? "")
    ) {
      throw new Error("worker artifact file inventory is invalid.");
    }
    const target = resolve(artifactRoot, file.path);
    ensureRegularFile(target, `artifact file ${file.path}`);
    if (sha256File(target) !== file.sha256) {
      throw new Error(`worker artifact file drift: ${file.path}`);
    }
  }
  return value;
}

export function readYoutubeExtractionExpectedSchema(path) {
  const value = readJsonFile(path, "expected schema manifest");
  if (
    value.schema !== YOUTUBE_EXTRACTION_EXPECTED_SCHEMA
    || value.version !== 1
    || typeof value.schema_identity !== "string"
    || !Array.isArray(value.tables)
    || !Array.isArray(value.roles)
    || !Array.isArray(value.rpc_signatures)
  ) {
    throw new Error("expected schema manifest is invalid.");
  }
  return value;
}

/**
 * @param {string} path
 */
export function readYoutubeExtractionAppDescriptor(path) {
  const value = readJsonFile(path, "app descriptor");
  if (value.schema !== YOUTUBE_EXTRACTION_WORKER_APP_DESCRIPTOR_SCHEMA) {
    throw new Error("app descriptor schema is invalid.");
  }
  return value;
}

/**
 * @param {string} path
 */
export function readYoutubeExtractionCurrentPolicy(path) {
  const value = readJsonFile(path, "current policy");
  if (value.schema !== YOUTUBE_EXTRACTION_WORKER_POLICY_SCHEMA) {
    throw new Error("current policy schema is invalid.");
  }
  return value;
}

/**
 * @param {string} path
 */
export function readYoutubeExtractionWorkerQueueState(path) {
  const value = readJsonFile(path, "queue state");
  if (value.schema !== YOUTUBE_EXTRACTION_WORKER_QUEUE_STATE_SCHEMA) {
    throw new Error("queue state schema is invalid.");
  }
  return value;
}
