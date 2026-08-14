import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
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
const EXPECTED_SCHEMA_RELATIVE_PATH =
  "scripts/manifests/youtube-extraction-expected-schema.json";
export const YOUTUBE_EXTRACTION_WORKER_ENTRYPOINT_RELATIVE_PATH =
  "scripts/youtube-extraction-worker-runner.mjs";
export const YOUTUBE_EXTRACTION_WORKER_LAUNCHD_TEMPLATE_RELATIVE_PATH =
  "scripts/templates/com.homecook.youtube-extraction-worker.plist.template";
export const YOUTUBE_EXTRACTION_WORKER_REQUIRED_ARTIFACT_FILES = Object.freeze([
  "lib/server/youtube-i031-runtime/bundle/manifest.json",
  "lib/server/youtube-i031-runtime/bundle/worker.mjs",
  "scripts/lib/youtube-extraction-worker-artifact.mjs",
  "scripts/lib/youtube-extraction-worker-ops.mjs",
  "scripts/lib/youtube-extraction-worker-runtime.mjs",
  EXPECTED_SCHEMA_RELATIVE_PATH,
  YOUTUBE_EXTRACTION_WORKER_ENTRYPOINT_RELATIVE_PATH,
  YOUTUBE_EXTRACTION_WORKER_LAUNCHD_TEMPLATE_RELATIVE_PATH,
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
  return modeBits(lstatSync(path).mode);
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
 * @param {{ mode?: number, expectedUserId?: number }} [options]
 */
export function ensureRegularFile(path, label, { mode, expectedUserId } = {}) {
  const normalizedPath = ensureAbsolutePath(path, label);
  if (!existsSync(normalizedPath)) {
    throw new Error(`${label} does not exist: ${normalizedPath}`);
  }

  const stat = lstatSync(normalizedPath);
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${normalizedPath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`${label} must be a regular file: ${normalizedPath}`);
  }

  if (typeof mode === "number") {
    validateMode(normalizedPath, mode, label);
  }

  if (Number.isInteger(expectedUserId) && stat.uid !== expectedUserId) {
    throw new Error(`${label} owner must match the worker user.`);
  }

  return realpathSync(normalizedPath);
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
  assertRequiredArtifactFileInventory(
    new Set(fileManifest.map((file) => file.path)),
  );
  const expectedSchemaSha = sha256File(resolve(
    normalizedRootDir,
    EXPECTED_SCHEMA_RELATIVE_PATH,
  ));
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
    expected_schema_sha256: expectedSchemaSha,
    entrypoint_relative_path: YOUTUBE_EXTRACTION_WORKER_ENTRYPOINT_RELATIVE_PATH,
    launchd_template_relative_path:
      YOUTUBE_EXTRACTION_WORKER_LAUNCHD_TEMPLATE_RELATIVE_PATH,
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
 *   artifactSha256: string,
 *   expectedSchemaSha256: string,
 * }} options
 */
export function buildYoutubeExtractionAppDescriptor({
  releaseSha,
  schemaIdentity = YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
  expectedPolicyVersion = DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_VERSION,
  expectedPolicySnapshotDigest,
  artifactSha256,
  expectedSchemaSha256,
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
    artifact_sha256: ensureSnapshotDigest(artifactSha256, "artifactSha256"),
    expected_schema_sha256: ensureSnapshotDigest(
      expectedSchemaSha256,
      "expectedSchemaSha256",
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
 * @param {{ mode?: number, expectedUserId?: number }} [options]
 */
export function readJsonFile(path, label, { mode, expectedUserId } = {}) {
  const normalizedPath = ensureRegularFile(path, label, { mode, expectedUserId });
  const source = readFileSync(normalizedPath, "utf8");
  assertNoDuplicateJsonKeys(source, label);
  const parsed = JSON.parse(source);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed;
}

function assertNoDuplicateJsonKeys(source, label) {
  let index = 0;
  const skipWhitespace = () => {
    while (/\s/u.test(source[index] ?? "")) index += 1;
  };
  const parseString = () => {
    const start = index;
    index += 1;
    while (index < source.length) {
      if (source[index] === "\\") {
        index += 2;
        continue;
      }
      if (source[index] === '"') {
        index += 1;
        return JSON.parse(source.slice(start, index));
      }
      index += 1;
    }
    throw new Error(`${label} contains invalid JSON.`);
  };
  const parseValue = () => {
    skipWhitespace();
    if (source[index] === "{") {
      index += 1;
      skipWhitespace();
      const keys = new Set();
      if (source[index] === "}") {
        index += 1;
        return;
      }
      while (index < source.length) {
        if (source[index] !== '"') throw new Error(`${label} contains invalid JSON.`);
        const key = parseString();
        if (keys.has(key)) throw new Error(`${label} contains duplicate JSON key: ${key}`);
        keys.add(key);
        skipWhitespace();
        if (source[index] !== ":") throw new Error(`${label} contains invalid JSON.`);
        index += 1;
        parseValue();
        skipWhitespace();
        if (source[index] === "}") {
          index += 1;
          return;
        }
        if (source[index] !== ",") throw new Error(`${label} contains invalid JSON.`);
        index += 1;
        skipWhitespace();
      }
      throw new Error(`${label} contains invalid JSON.`);
    }
    if (source[index] === "[") {
      index += 1;
      skipWhitespace();
      if (source[index] === "]") {
        index += 1;
        return;
      }
      while (index < source.length) {
        parseValue();
        skipWhitespace();
        if (source[index] === "]") {
          index += 1;
          return;
        }
        if (source[index] !== ",") throw new Error(`${label} contains invalid JSON.`);
        index += 1;
      }
      throw new Error(`${label} contains invalid JSON.`);
    }
    if (source[index] === '"') {
      parseString();
      return;
    }
    const primitive = source.slice(index).match(/^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/u)?.[0];
    if (!primitive) throw new Error(`${label} contains invalid JSON.`);
    index += primitive.length;
  };
  parseValue();
  skipWhitespace();
  if (index !== source.length) throw new Error(`${label} contains invalid JSON.`);
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

function readMaterializedArtifactFileInventory(artifactRoot, manifestPath) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = resolve(directory, entry.name);
      const stat = lstatSync(target);
      if (stat.isSymbolicLink()) {
        throw new Error(`worker artifact inventory contains a symbolic link: ${target}`);
      }
      if (stat.isDirectory()) {
        visit(target);
        continue;
      }
      if (!stat.isFile()) {
        throw new Error(`worker artifact inventory contains an unsupported path: ${target}`);
      }
      if (target !== manifestPath) {
        files.push(normalizeRepoRelativePath(artifactRoot, target));
      }
    }
  };
  visit(artifactRoot);
  return files.sort();
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
  const manifestFiles = new Set();
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
    const normalizedFilePath = normalizeRepoRelativePath(artifactRoot, target);
    if (normalizedFilePath !== file.path || manifestFiles.has(file.path)) {
      throw new Error("worker artifact file inventory is invalid.");
    }
    manifestFiles.add(file.path);
    ensureRegularFile(target, `artifact file ${file.path}`);
    if (sha256File(target) !== file.sha256) {
      throw new Error(`worker artifact file drift: ${file.path}`);
    }
  }
  assertRequiredArtifactFileInventory(manifestFiles);
  assertArtifactRelativePath(
    value.entrypoint_relative_path,
    "entrypoint relative path",
    YOUTUBE_EXTRACTION_WORKER_ENTRYPOINT_RELATIVE_PATH,
    manifestFiles,
  );
  assertArtifactRelativePath(
    value.launchd_template_relative_path,
    "launchd template relative path",
    YOUTUBE_EXTRACTION_WORKER_LAUNCHD_TEMPLATE_RELATIVE_PATH,
    manifestFiles,
  );
  if (JSON.stringify([...manifestFiles].sort()) !== JSON.stringify(
    readMaterializedArtifactFileInventory(artifactRoot, normalizedPath),
  )) {
    throw new Error("worker artifact file inventory is invalid.");
  }
  const expectedSchemaEntry = value.files.find(
    (file) => file.path === EXPECTED_SCHEMA_RELATIVE_PATH,
  );
  if (
    !expectedSchemaEntry
    || value.expected_schema_sha256 !== expectedSchemaEntry.sha256
  ) {
    throw new Error("worker artifact expected schema digest is invalid.");
  }
  return value;
}

function assertRequiredArtifactFileInventory(manifestFiles) {
  for (const requiredPath of YOUTUBE_EXTRACTION_WORKER_REQUIRED_ARTIFACT_FILES) {
    if (!manifestFiles.has(requiredPath)) {
      throw new Error(`worker artifact required file is missing: ${requiredPath}`);
    }
  }
}

function assertArtifactRelativePath(value, label, expectedPath, manifestFiles) {
  if (value !== expectedPath || !manifestFiles.has(expectedPath)) {
    throw new Error(`worker artifact ${label} is invalid.`);
  }
}

export function readYoutubeExtractionExpectedSchema(path) {
  const value = readJsonFile(path, "expected schema manifest");
  const exactFingerprintComponents = [
    "tables",
    "columns",
    "constraints",
    "indexes",
    "table_owners",
    "sequence_owners",
    "schema_owners",
    "roles",
    "role_attributes",
    "owner_role_attributes",
    "memberships",
    "table_security",
    "rls_policies",
    "table_privileges",
    "sequence_privileges",
    "rpc_signatures",
    "rpc_security",
    "rpc_function_definitions",
    "internal_scope_function_definition",
  ];
  const exactFenceFunctionSignatures = [
    "private.youtube_extraction_job_fence_is_active(uuid,text,bigint)",
    "private.youtube_extraction_worker_write_fence_is_active(uuid,text,bigint,bigint)",
  ];
  const exactMemberships = [
    {
      member: "authenticator",
      role: "youtube_extraction_credential_manager",
      admin: false,
      inherit: false,
      set: true,
    },
    {
      member: "authenticator",
      role: "youtube_extraction_worker",
      admin: false,
      inherit: false,
      set: true,
    },
  ];
  const isUniqueStringArray = (input) => Array.isArray(input)
    && input.length > 0
    && input.every((entry) => typeof entry === "string" && entry.length > 0)
    && new Set(input).size === input.length;
  if (
    value.schema !== YOUTUBE_EXTRACTION_EXPECTED_SCHEMA
    || value.version !== 1
    || typeof value.schema_identity !== "string"
    || !/^[a-f0-9]{64}$/u.test(value.catalog_fingerprint ?? "")
    || value.catalog_fingerprint_algorithm
      !== "sha256:youtube-extraction-live-catalog-v1"
    || JSON.stringify(value.catalog_fingerprint_components)
      !== JSON.stringify(exactFingerprintComponents)
    || !isUniqueStringArray(value.tables)
    || !isUniqueStringArray(value.roles)
    || !isUniqueStringArray(value.rpc_signatures)
    || JSON.stringify(value.fence_function_signatures)
      !== JSON.stringify(exactFenceFunctionSignatures)
    || value.internal_scope_function_signature
      !== "private.verify_full_local_internal_scope()"
    || JSON.stringify(value.memberships) !== JSON.stringify(exactMemberships)
    || typeof value.migration_owner_membership_exception !== "string"
    || !value.initial_policy
    || typeof value.initial_policy !== "object"
    || typeof value.initial_policy.policy_key !== "string"
    || !Number.isInteger(value.initial_policy.policy_version)
    || typeof value.initial_policy.extractor_mode !== "string"
    || !/^[a-f0-9]{64}$/u.test(value.initial_policy.pipeline_identity ?? "")
    || typeof value.initial_policy.enabled !== "boolean"
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
  ensureSnapshotDigest(value.artifact_sha256, "app descriptor artifact_sha256");
  ensureSnapshotDigest(
    value.expected_schema_sha256,
    "app descriptor expected_schema_sha256",
  );
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
