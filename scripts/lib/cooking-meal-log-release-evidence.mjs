import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

export const EVIDENCE_SCHEMA_VERSION =
  "cooking-meal-log-release-evidence-v1";

export const REQUIRED_ARTIFACT_FILES = [
  "db-security.json",
  "security.json",
  "performance.json",
  "query-count.json",
  "rollback.json",
];

export const FULL_DB_LANES = [
  "account-session-generation",
  "recipe-visibility-read-hardening",
  "recipe-snapshot-authority",
  "personal-recipe-customization-write-core",
  "recipe-content-snapshot-future-propagation",
  "cooked-batch-weight-ledger",
  "meal-log-core",
  "legacy-product-compat",
];

export const FULL_DB_LANE_PARTITION_SKIPS = Object.freeze({
  "account-session-generation": 0,
  "recipe-visibility-read-hardening": 0,
  "recipe-snapshot-authority": 65,
  "personal-recipe-customization-write-core": 65,
  "recipe-content-snapshot-future-propagation": 65,
  "cooked-batch-weight-ledger": 75,
  "meal-log-core": 0,
  "legacy-product-compat": 0,
});

export const ROLLBACK_INVARIANTS = [
  "current_and_previous",
  "seeded_v2_drain",
  "tombstone_fail_closed",
];

const ARTIFACT_TYPES = {
  "db-security.json": "db-security",
  "security.json": "security",
  "performance.json": "performance",
  "query-count.json": "query-count",
  "rollback.json": "rollback",
};

const SAFE_ENV_KEYS = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "TERM",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "TZ",
  "CI",
  "DOCKER_HOST",
  "XDG_RUNTIME_DIR",
  "PNPM_HOME",
  "COREPACK_HOME",
];

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const ATTEMPT_PATTERN = /^[a-z0-9][a-z0-9._-]{2,95}$/u;
const POSTGRES_URL_PATTERN = /postgres(?:ql)?:\/\/[^\s"'`<>]+/giu;
const CANONICAL_ATTEMPT_ROOT_COMPONENTS = [
  ".artifacts",
  "cooking-meal-log-cross-slice-release-qa",
  "attempts",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertAttemptId(attemptId) {
  if (
    typeof attemptId !== "string"
    || !ATTEMPT_PATTERN.test(attemptId)
    || attemptId.includes("..")
  ) {
    throw new Error("attempt id must be a safe lowercase identifier");
  }
}

function assertSha(value, label) {
  if (typeof value !== "string" || !SHA_PATTERN.test(value)) {
    throw new Error(`${label} must be an exact 40-character git SHA`);
  }
}

function assertTimestamp(value, label) {
  if (
    typeof value !== "string"
    || !Number.isFinite(Date.parse(value))
  ) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
}

function assertActualDirectory(directoryPath, label) {
  let stat;
  try {
    stat = lstatSync(directoryPath);
  } catch {
    throw new Error(`${label} must exist as an actual directory`);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be an actual directory, not a symlink`);
  }
}

function assertStrictContainment(rootPath, candidatePath, label) {
  const fromRoot = relative(rootPath, candidatePath);
  if (
    fromRoot.length === 0
    || fromRoot === ".."
    || fromRoot.startsWith(`..${sep}`)
  ) {
    throw new Error(`${label} must be strictly inside its canonical root`);
  }
}

function assertDirectoryComponents(repositoryRoot, directoryPath) {
  const normalizedRepository = resolve(repositoryRoot);
  const normalizedDirectory = resolve(directoryPath);
  const fromRepository = relative(normalizedRepository, normalizedDirectory);
  if (
    fromRepository === ".."
    || fromRepository.startsWith(`..${sep}`)
  ) {
    throw new Error("canonical evidence path must remain inside the repository");
  }

  assertActualDirectory(normalizedRepository, "repository root");
  let currentPath = normalizedRepository;
  for (const component of fromRepository.split(sep).filter(Boolean)) {
    currentPath = join(currentPath, component);
    assertActualDirectory(currentPath, "canonical evidence path component");
  }
}

function assertAttemptDirectory(attemptDir, expectedAttemptId) {
  const normalizedAttempt = resolve(attemptDir);
  assertActualDirectory(normalizedAttempt, "attempt directory");
  if (basename(normalizedAttempt) !== expectedAttemptId) {
    throw new Error("attempt directory basename must equal --attempt-id");
  }
  return normalizedAttempt;
}

function lstatIfExists(filePath) {
  try {
    return lstatSync(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function assertRealDirectoryIdentity(directoryPath, expectedRealPath, label) {
  assertActualDirectory(directoryPath, label);
  const actualRealPath = realpathSync(directoryPath);
  if (actualRealPath !== expectedRealPath) {
    throw new Error(`${label} realpath identity mismatch`);
  }
  return actualRealPath;
}

function canonicalAttemptRoot(repositoryRoot) {
  return resolve(repositoryRoot, ...CANONICAL_ATTEMPT_ROOT_COMPONENTS);
}

function createCanonicalAttemptRoot(repositoryRoot, artifactRoot) {
  const normalizedRepository = resolve(repositoryRoot);
  const normalizedRoot = resolve(artifactRoot);
  const expectedRoot = canonicalAttemptRoot(normalizedRepository);
  if (normalizedRoot !== expectedRoot) {
    throw new Error("artifact root must equal the canonical repository path");
  }

  assertActualDirectory(normalizedRepository, "repository root");
  const realRepository = realpathSync(normalizedRepository);
  if (realRepository !== normalizedRepository) {
    throw new Error("repository root must be a verified canonical path");
  }

  let currentPath = normalizedRepository;
  let currentRealPath = realRepository;
  for (const component of CANONICAL_ATTEMPT_ROOT_COMPONENTS) {
    assertRealDirectoryIdentity(
      currentPath,
      currentRealPath,
      "canonical evidence parent",
    );
    const nextPath = join(currentPath, component);
    const existing = lstatIfExists(nextPath);
    if (existing === null) {
      mkdirSync(nextPath, { mode: 0o700 });
    } else if (!existing.isDirectory() || existing.isSymbolicLink()) {
      throw new Error(
        "canonical evidence path component must be an actual directory",
      );
    }

    const nextRealPath = join(currentRealPath, component);
    assertRealDirectoryIdentity(
      nextPath,
      nextRealPath,
      "canonical evidence path component",
    );
    assertStrictContainment(
      realRepository,
      nextRealPath,
      "canonical evidence path component",
    );
    assertRealDirectoryIdentity(
      currentPath,
      currentRealPath,
      "canonical evidence parent",
    );
    currentPath = nextPath;
    currentRealPath = nextRealPath;
  }
  return {
    normalizedRoot,
    realRoot: currentRealPath,
  };
}

export function createAttemptDirectory({
  repositoryRoot,
  artifactRoot,
  attemptId,
}) {
  assertAttemptId(attemptId);
  const { normalizedRoot, realRoot } = createCanonicalAttemptRoot(
    repositoryRoot,
    artifactRoot,
  );
  const attemptDir = resolve(normalizedRoot, attemptId);
  if (
    dirname(attemptDir) !== normalizedRoot
    || basename(attemptDir) !== attemptId
  ) {
    throw new Error("attempt id must name a direct canonical attempt child");
  }
  if (lstatIfExists(attemptDir) !== null) {
    throw new Error(`attempt directory already exists: ${attemptId}`);
  }

  assertRealDirectoryIdentity(
    normalizedRoot,
    realRoot,
    "canonical attempt root",
  );
  mkdirSync(attemptDir, { mode: 0o700 });
  const normalizedAttempt = assertAttemptDirectory(attemptDir, attemptId);
  const realAttempt = realpathSync(normalizedAttempt);
  assertStrictContainment(realRoot, realAttempt, "created attempt directory");
  if (
    dirname(realAttempt) !== realRoot
    || basename(realAttempt) !== attemptId
  ) {
    throw new Error("created attempt directory identity mismatch");
  }
  assertRealDirectoryIdentity(
    normalizedRoot,
    realRoot,
    "canonical attempt root",
  );
  return attemptDir;
}

export function writeEvidenceArtifact(attemptDir, fileName, artifact) {
  if (!REQUIRED_ARTIFACT_FILES.includes(fileName)) {
    throw new Error(`unsupported evidence artifact: ${fileName}`);
  }
  const filePath = join(attemptDir, fileName);
  writeFileSync(filePath, `${JSON.stringify(artifact, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return filePath;
}

export function sanitizeRawLaneLog(value) {
  return String(value ?? "").replace(
    POSTGRES_URL_PATTERN,
    "[REDACTED_DATABASE_URL]",
  );
}

export function writeRawLaneLog({ attemptDir, label, stdout, stderr }) {
  const filePath = join(attemptDir, "raw", `${label}.log`);
  const output = `${stdout ?? ""}${stderr ?? ""}`;
  writeFileSync(filePath, sanitizeRawLaneLog(output), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  return filePath;
}

export function writeEvidenceManifest(
  attemptDir,
  { attemptId, headSha, generatedAt, profile },
) {
  assertAttemptId(attemptId);
  assertSha(headSha, "head SHA");
  assertTimestamp(generatedAt, "generatedAt");
  const artifacts = REQUIRED_ARTIFACT_FILES.map((file) => {
    const bytes = readFileSync(join(attemptDir, file));
    return {
      file,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    };
  });
  const manifest = {
    schema_version: EVIDENCE_SCHEMA_VERSION,
    artifact_type: "manifest",
    attempt_id: attemptId,
    head_sha: headSha,
    generated_at: generatedAt,
    profile,
    artifacts,
  };
  writeFileSync(
    join(attemptDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { encoding: "utf8", flag: "wx", mode: 0o600 },
  );
  return manifest;
}

export function parseVitestTextSummary(output) {
  const normalized = String(output ?? "")
    .replaceAll(/\u001b\[[0-9;]*m/gu, "");
  const summary = { passed: 0, skipped: 0, pending: 0, failed: 0 };
  for (const line of normalized.split(/\r?\n/gu)) {
    if (!/^\s*Tests\s+/u.test(line)) continue;
    for (const key of ["passed", "skipped", "failed"]) {
      const match = line.match(new RegExp(`(\\d+)\\s+${key}`, "u"));
      if (match) summary[key] += Number(match[1]);
    }
    const pendingMatch = line.match(/(\d+)\s+(?:todo|pending)/u);
    if (pendingMatch) summary.pending += Number(pendingMatch[1]);
  }
  return summary;
}

export function normalizePartitionedLaneSummary({
  expectedPartitionSkipped,
  label,
  summary,
}) {
  if (
    !Number.isInteger(expectedPartitionSkipped)
    || expectedPartitionSkipped < 0
    || summary?.skipped !== expectedPartitionSkipped
  ) {
    throw new Error(`${label}: partition skipped count mismatch`);
  }
  const normalized = {
    ...summary,
    skipped: 0,
  };
  assertRunnableSummary(normalized, label);
  return {
    ...normalized,
    partition_skipped: expectedPartitionSkipped,
  };
}

export function projectPerformanceEvidencePayload(source) {
  if (
    !source
    || typeof source !== "object"
    || Array.isArray(source)
    || source.schema_version
      !== "prepared-food-search-relevance-performance-v1"
    || !source.denominator
    || typeof source.denominator !== "object"
    || Array.isArray(source.denominator)
  ) {
    throw new Error("performance source payload shape mismatch");
  }
  const payload = {
    source_schema_version: source.schema_version,
    denominator: source.denominator.visible_public,
    labeled_query_count: source.labeled_query_count,
    recall_at_20: source.recall_at_20,
    precision_at_20: source.precision_at_20,
    db_p95_ms: source.db_p95_ms,
    route_p95_ms: source.route_p95_ms,
    external_requests: source.external_requests,
    external_writes: source.external_writes,
  };
  if (
    !Object.values(payload).every(
      (value) => typeof value === "string"
        || (typeof value === "number" && Number.isFinite(value)),
    )
  ) {
    throw new Error("performance source payload values are invalid");
  }
  return payload;
}

export function parseVitestJsonSummary(value) {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return {
    passed: Number(parsed?.numPassedTests ?? 0),
    skipped: Number(parsed?.numPendingTests ?? 0),
    pending: Number(parsed?.numTodoTests ?? 0),
    failed: Number(parsed?.numFailedTests ?? 0),
  };
}

export function assertRunnableSummary(summary, label) {
  if (!Number.isInteger(summary.passed) || summary.passed <= 0) {
    throw new Error(`${label}: passed must be greater than zero`);
  }
  for (const key of ["skipped", "pending", "failed"]) {
    if (!Number.isInteger(summary[key]) || summary[key] !== 0) {
      throw new Error(`${label}: ${key} must be zero`);
    }
  }
}

export function buildLaneEnvironment({ ambient = {}, extra = {} } = {}) {
  const environment = {};
  for (const key of SAFE_ENV_KEYS) {
    if (typeof ambient[key] === "string" && ambient[key].length > 0) {
      environment[key] = ambient[key];
    }
  }
  for (const [key, value] of Object.entries(extra)) {
    if (typeof value === "string" && value.length > 0) {
      environment[key] = value;
    }
  }
  return environment;
}

export async function measureQueryCountGrowth({ surface, execute }) {
  const measurements = {};
  for (const size of [1, 20]) {
    let queryCount = 0;
    await execute(size, () => {
      queryCount += 1;
    });
    measurements[size] = queryCount;
  }
  return {
    surface,
    list1_query_count: measurements[1],
    list20_query_count: measurements[20],
    item_level_n_plus_one: Math.max(
      0,
      measurements[20] - measurements[1],
    ),
  };
}

export function validateGitBinding({
  repositoryRoot,
  attemptDir,
  expectedAttemptId,
  expectedHeadSha,
  actualHeadSha,
  statusOutput,
}) {
  assertAttemptId(expectedAttemptId);
  assertSha(expectedHeadSha, "expected head SHA");
  if (actualHeadSha !== expectedHeadSha) {
    throw new Error("current git HEAD does not match --expected-head");
  }
  if (String(statusOutput ?? "").trim().length > 0) {
    throw new Error("final evidence validation requires a clean worktree");
  }
  const canonicalRoot = canonicalAttemptRoot(repositoryRoot);
  const normalizedAttempt = assertAttemptDirectory(
    attemptDir,
    expectedAttemptId,
  );
  assertStrictContainment(
    canonicalRoot,
    normalizedAttempt,
    "attempt directory",
  );
  if (dirname(normalizedAttempt) !== canonicalRoot) {
    throw new Error("attempt directory must be a direct canonical attempt child");
  }

  assertDirectoryComponents(repositoryRoot, canonicalRoot);
  assertDirectoryComponents(repositoryRoot, normalizedAttempt);
  const realCanonicalRoot = realpathSync(canonicalRoot);
  const realAttempt = realpathSync(normalizedAttempt);
  assertStrictContainment(
    realCanonicalRoot,
    realAttempt,
    "real attempt directory",
  );
  if (
    dirname(realAttempt) !== realCanonicalRoot
    || basename(realAttempt) !== expectedAttemptId
  ) {
    throw new Error("real attempt directory must match the canonical attempt id");
  }
}

function readJsonArtifact(attemptDir, fileName) {
  const filePath = join(attemptDir, fileName);
  if (!existsSync(filePath)) {
    throw new Error(`missing artifact: ${fileName}`);
  }
  const stat = lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`artifact must be a regular file: ${fileName}`);
  }
  const realAttempt = realpathSync(attemptDir);
  const realFile = realpathSync(filePath);
  if (dirname(realFile) !== realAttempt) {
    throw new Error(`artifact escapes attempt directory: ${fileName}`);
  }
  return {
    bytes: readFileSync(filePath),
    value: JSON.parse(readFileSync(filePath, "utf8")),
  };
}

function validateArtifactEnvelope(
  artifact,
  {
    fileName,
    expectedAttemptId,
    expectedGeneratedAt,
    expectedHeadSha,
    expectedProfile,
  },
) {
  if (artifact.schema_version !== EVIDENCE_SCHEMA_VERSION) {
    throw new Error(`${fileName}: schema_version mismatch`);
  }
  if (artifact.attempt_id !== expectedAttemptId) {
    throw new Error(`${fileName}: attempt_id mismatch`);
  }
  if (artifact.head_sha !== expectedHeadSha) {
    throw new Error(`${fileName}: head_sha mismatch`);
  }
  if (artifact.profile !== expectedProfile) {
    throw new Error(`${fileName}: profile mismatch`);
  }
  assertTimestamp(artifact.generated_at, `${fileName}.generated_at`);
  if (artifact.generated_at !== expectedGeneratedAt) {
    throw new Error(`${fileName}: generated_at must equal manifest generated_at`);
  }
  if (artifact.artifact_type !== ARTIFACT_TYPES[fileName]) {
    throw new Error(`${fileName}: artifact_type mismatch`);
  }
  assertRunnableSummary(artifact, fileName);
}

function validateDbPayload(artifact, expectedProfile) {
  if (artifact.payload?.pinned_isolated_local !== true) {
    throw new Error("db-security.json: pinned_isolated_local must be true");
  }
  if (artifact.payload?.remote_linked_cloud_access !== 0) {
    throw new Error("db-security.json: remote_linked_cloud_access must be zero");
  }
  const lanes = artifact.payload?.lanes;
  if (!Array.isArray(lanes) || lanes.length <= 0) {
    throw new Error("db-security.json: lane evidence is missing");
  }
  for (const lane of lanes) {
    const expectedPartitionSkipped =
      FULL_DB_LANE_PARTITION_SKIPS[lane.id];
    if (
      !Number.isInteger(expectedPartitionSkipped)
      || lane.partition_skipped !== expectedPartitionSkipped
    ) {
      throw new Error(
        `db lane ${lane.id ?? "unknown"}: partition skipped count mismatch`,
      );
    }
    assertRunnableSummary(lane, `db lane ${lane.id ?? "unknown"}`);
  }
  if (expectedProfile === "full") {
    const actual = lanes.map((lane) => lane.id);
    if (JSON.stringify(actual) !== JSON.stringify(FULL_DB_LANES)) {
      throw new Error("db-security.json: full DB lane inventory mismatch");
    }
  }
}

function validateSecurityPayload(artifact) {
  const payload = artifact.payload ?? {};
  if (payload.isolated_local !== true) {
    throw new Error("security.json: isolated_local must be true");
  }
  if (payload.remote_access !== 0) {
    throw new Error("security.json: remote_access must be zero");
  }
  if (
    !Array.isArray(payload.mutation_inventory)
    || payload.mutation_inventory.length <= 0
    || payload.mutation_inventory.some(
      (signature) => typeof signature !== "string" || signature.length === 0,
    )
  ) {
    throw new Error("security.json: mutation_inventory must be nonempty");
  }
  if (Number(payload.authorization_inventory_classified) <= 0) {
    throw new Error(
      "security.json: authorization_inventory_classified must be nonzero",
    );
  }
  if (Number(payload.data_api_negatives) <= 0) {
    throw new Error("security.json: data_api_negatives must be nonzero");
  }
}

function validatePerformancePayload(artifact, expectedProfile) {
  const payload = artifact.payload ?? {};
  if (expectedProfile === "proof") {
    if (payload.runner_contract_tested !== true) {
      throw new Error("performance.json: proof runner contract is missing");
    }
    return;
  }
  if (payload.denominator !== 287_041) {
    throw new Error("performance.json: denominator mismatch");
  }
  if (Number(payload.recall_at_20) < 0.9) {
    throw new Error("performance.json: Recall@20 below threshold");
  }
  if (Number(payload.precision_at_20) < 0.75) {
    throw new Error("performance.json: Precision@20 below threshold");
  }
  if (Number(payload.db_p95_ms) > 300) {
    throw new Error("performance.json: DB p95 above threshold");
  }
  if (Number(payload.route_p95_ms) > 600) {
    throw new Error("performance.json: route p95 above threshold");
  }
  if (payload.external_requests !== 0 || payload.external_writes !== 0) {
    throw new Error("performance.json: external access must be zero");
  }
}

function validateQueryCountPayload(artifact) {
  if (artifact.payload?.measurement_kind !== "actual-route-service-boundary") {
    throw new Error(
      "query-count.json: actual route/service-boundary measurement is required",
    );
  }
  const checks = artifact.payload?.checks;
  if (!Array.isArray(checks) || checks.length <= 0) {
    throw new Error("query-count.json: checks are missing");
  }
  for (const check of checks) {
    if (
      !Number.isInteger(check.list1_query_count)
      || !Number.isInteger(check.list20_query_count)
      || check.list1_query_count <= 0
      || check.list20_query_count <= 0
      || check.list20_query_count > check.list1_query_count + 1
      || check.item_level_n_plus_one !== 0
    ) {
      throw new Error(`query count ceiling failed: ${check.surface ?? "unknown"}`);
    }
  }
}

function validateRollbackPayload(artifact) {
  for (const invariant of ROLLBACK_INVARIANTS) {
    if (artifact.payload?.[invariant] !== true) {
      throw new Error(`rollback.json: ${invariant} must be true`);
    }
  }
}

export function validateEvidenceAttempt({
  attemptDir,
  expectedAttemptId,
  expectedHeadSha,
  expectedProfile,
}) {
  assertAttemptId(expectedAttemptId);
  assertSha(expectedHeadSha, "expected head SHA");
  const normalizedAttempt = assertAttemptDirectory(
    attemptDir,
    expectedAttemptId,
  );
  const manifestResult = readJsonArtifact(normalizedAttempt, "manifest.json");
  const manifest = manifestResult.value;
  if (manifest.schema_version !== EVIDENCE_SCHEMA_VERSION) {
    throw new Error("manifest.json: schema_version mismatch");
  }
  if (manifest.attempt_id !== expectedAttemptId) {
    throw new Error("manifest.json: attempt_id mismatch");
  }
  if (manifest.head_sha !== expectedHeadSha) {
    throw new Error("manifest.json: head_sha mismatch");
  }
  if (manifest.profile !== expectedProfile) {
    throw new Error("manifest.json: profile mismatch");
  }
  assertTimestamp(manifest.generated_at, "manifest.generated_at");

  const manifestEntries = new Map(
    (manifest.artifacts ?? []).map((entry) => [entry.file, entry]),
  );
  const artifacts = new Map();
  for (const fileName of REQUIRED_ARTIFACT_FILES) {
    const artifactResult = readJsonArtifact(normalizedAttempt, fileName);
    const entry = manifestEntries.get(fileName);
    if (!entry) throw new Error(`manifest missing artifact: ${fileName}`);
    if (entry.bytes !== artifactResult.bytes.byteLength) {
      throw new Error(`${fileName}: manifest byte count mismatch`);
    }
    if (entry.sha256 !== sha256(artifactResult.bytes)) {
      throw new Error(`${fileName}: manifest sha256 mismatch`);
    }
    validateArtifactEnvelope(artifactResult.value, {
      fileName,
      expectedAttemptId,
      expectedGeneratedAt: manifest.generated_at,
      expectedHeadSha,
      expectedProfile,
    });
    artifacts.set(fileName, artifactResult.value);
  }
  if (manifestEntries.size !== REQUIRED_ARTIFACT_FILES.length) {
    throw new Error("manifest artifact inventory mismatch");
  }

  validateDbPayload(artifacts.get("db-security.json"), expectedProfile);
  validateSecurityPayload(artifacts.get("security.json"));
  validatePerformancePayload(
    artifacts.get("performance.json"),
    expectedProfile,
  );
  validateQueryCountPayload(artifacts.get("query-count.json"));
  validateRollbackPayload(artifacts.get("rollback.json"));

  return {
    artifact_count: artifacts.size,
    attempt_id: expectedAttemptId,
    head_sha: expectedHeadSha,
    profile: expectedProfile,
  };
}
