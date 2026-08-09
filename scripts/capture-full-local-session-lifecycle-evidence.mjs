#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { buildFullLocalProductCatalogCtesSql } from "./lib/full-local-product-catalog.mjs";
import { buildFullLocalAuthorizationContractCtesSql } from "./full-local-production-runtime.mjs";

export const EXPECTED_LIVE_ROOT = "/Users/cwj/01_vibe_coding/homecook-full-local-restore";
export const REFRESH_LIFECYCLE_JSON_SCRIPT =
  "verify:full-local-session-refresh-lifecycle:json";
export const ALLOWED_PHASES = Object.freeze([
  "baseline",
  "milestone-a-t65",
  "milestone-a-24h",
  "milestone-b-7d",
]);

const EVIDENCE_DIRECTORY =
  "docs/workpacks/full-local-supabase-production/evidence/2026-08-08-session-lifecycle";
const REQUIRED_SERVICES = Object.freeze([
  "postgres",
  "auth",
  "postgrest",
  "postgrest-probe",
  "storage",
  "api-gateway",
  "auth-proxy",
]);
const REQUIRED_VOLUMES = Object.freeze([
  "homecook-full-local-postgres",
  "homecook-full-local-storage",
]);
const SERVICES_WITHOUT_HEALTHCHECK = new Set(["postgrest"]);
const PINNED_GOTRUE_IMAGE_DIGEST =
  "sha256:385184459f57569c54c25209f51f3b2be99ddd7c4ce9e3555b5d3eea8447b7cf";
const CANARY_RESULT_KEYS = Object.freeze([
  "planner_read",
  "planner_write",
  "pantry_read",
  "youtube_extract",
]);
const CANARY_SAFETY_CHECK_KEYS = Object.freeze([
  "binding_expiry_monotonic",
  "logout_new_token_read",
  "logout_new_token_write",
  "logout_old_token_read",
  "logout_old_token_write",
  "planner_write_cleanup",
  "phase_time_boundary",
  "stale_counts_since_deploy",
]);
const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const MIGRATION_PATTERN = /^\d{14}_[a-z0-9_]+\.sql$/u;
const KNOWN_MIGRATION_HEADS = new Set([
  "20260801151000_full_local_request_authority.sql",
  "20260802130000_recipe_image_public_shared_legacy_owner_compatibility.sql",
  "20260802140000_full_local_authenticated_nbf_compatibility.sql",
  "20260802150000_full_local_authenticated_mutation_authority.sql",
  "20260802151000_full_local_recipe_book_projection_scope.sql",
  "20260803020000_full_local_production_data_quality_scope.sql",
  "20260803090000_full_local_session_issue_time_precision.sql",
  "20260803093000_full_local_read_only_request_authority.sql",
  "20260809100000_full_local_session_refresh_authority.sql",
  "20260809110000_full_local_request_transaction_and_youtube_scope.sql",
]);
const SAFE_BRANCH_PATTERN = /^[A-Za-z0-9._/-]+$/u;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]+)?\b/u;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu;
const SECRET_ASSIGNMENT_PATTERN = /(?:oauth[_-]?code|access[_-]?token|refresh[_-]?token|authorization|cookie|client[_-]?secret)\s*[:=]/iu;

const EXACT_KEYS = Object.freeze({
  root: ["schema_version", "phase", "captured_at", "source", "runtime", "session_policy", "incident", "verification"],
  source: ["canonical_base_sha", "implementation_sha", "live_head_sha", "live_branch", "live_dirty", "live_dirty_diff_sha256"],
  runtime: ["app_origin", "auth_origin", "full_local_status", "mac_production_status", "launch_agent_status", "gotrue_image_digest", "migration_head", "migration_head_source"],
  session_policy: ["jwt_exp_seconds", "inactivity_timeout", "timebox", "single_per_user", "refresh_rotation_enabled", "refresh_reuse_interval_seconds"],
  incident: ["binding_created_at", "binding_expires_at", "first_stale_at", "affected_route_classes"],
  verification: ["production_domain_contract_gate", "refresh_lifecycle_gate", "authority_static_contracts", "postgres_integration", "docker_refresh_smoke", "security_function_gate", "gotrue_policy_gate", "recent_auth_security_gate", "t65_canary", "canary_results", "account_session_stale_count", "stale_token_mutation_count"],
  canary_results: CANARY_RESULT_KEYS,
  cloudflare_monitoring: [
    "schema",
    "version",
    "status",
    "incident_count",
    "critical_count",
    "warning_count",
    "diagnostic_count",
  ],
});

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: options.encoding,
    env: options.env ?? process.env,
    input: options.input,
    maxBuffer: 16 * 1024 * 1024,
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
  if (result.error) {
    throw result.error;
  }
  if (!options.allowFailure && result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString("utf8").trim()
      : String(result.stderr ?? "").trim();
    throw new Error(`${command} exited ${result.status}${stderr ? `: ${stderr}` : ""}`);
  }
  return result;
}

export function runEvidenceCommand(command, args, options = {}) {
  return run(command, args, options);
}

function stdoutText(result) {
  return Buffer.isBuffer(result.stdout)
    ? result.stdout.toString("utf8")
    : String(result.stdout ?? "");
}

function sha256(buffers) {
  const hash = createHash("sha256");
  for (const buffer of buffers) {
    hash.update(buffer);
  }
  return `sha256:${hash.digest("hex")}`;
}

function splitNull(buffer) {
  const parts = [];
  let start = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] === 0) {
      parts.push(buffer.subarray(start, index));
      start = index + 1;
    }
  }
  if (start < buffer.length) {
    parts.push(buffer.subarray(start));
  }
  return parts.filter((part) => part.length > 0);
}

function isInsideRoot(rootDir, candidatePath) {
  const relativePath = path.relative(rootDir, candidatePath);
  return relativePath === ""
    || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function untrackedPathsFromStatus(statusBuffer) {
  return splitNull(statusBuffer)
    .filter((record) => record.length > 2 && record[0] === 63 && record[1] === 32)
    .map((record) => record.subarray(2))
    .sort(Buffer.compare);
}

export function validateLiveRoot(
  liveRoot,
  { expectedLiveRoot = EXPECTED_LIVE_ROOT } = {},
) {
  if (typeof liveRoot !== "string" || !path.isAbsolute(liveRoot)) {
    throw new Error("--live-root must be an absolute path.");
  }
  if (
    typeof expectedLiveRoot !== "string"
    || !path.isAbsolute(expectedLiveRoot)
  ) {
    throw new Error("The expected live root must be an absolute path.");
  }
  if (!existsSync(liveRoot) || !lstatSync(liveRoot).isDirectory()) {
    throw new Error("--live-root must be an existing directory.");
  }
  if (
    !existsSync(expectedLiveRoot)
    || !lstatSync(expectedLiveRoot).isDirectory()
  ) {
    throw new Error("The expected live root must be an existing directory.");
  }
  const expectedRealPath = realpathSync(expectedLiveRoot);
  const actualRealPath = realpathSync(liveRoot);
  if (actualRealPath !== expectedRealPath) {
    throw new Error(`--live-root must resolve to the exact live root: ${expectedLiveRoot}`);
  }
  return actualRealPath;
}

export function validateEvidenceOutputPath(phase, outputPath, implementationRoot) {
  if (!ALLOWED_PHASES.includes(phase)) {
    throw new Error(`Unsupported evidence phase: ${phase}`);
  }
  if (typeof outputPath !== "string" || outputPath.length === 0) {
    throw new Error("--output is required.");
  }
  const canonicalImplementationRoot = realpathSync(implementationRoot);
  const expectedPath = path.join(
    canonicalImplementationRoot,
    EVIDENCE_DIRECTORY,
    `${phase}.json`,
  );
  const actualPath = path.resolve(canonicalImplementationRoot, outputPath);
  if (actualPath !== expectedPath || !isInsideRoot(canonicalImplementationRoot, actualPath)) {
    throw new Error(`--output must be the exact evidence output for ${phase}: ${expectedPath}`);
  }
  return actualPath;
}

export function computeLiveDirtyDiffSha256(liveRoot) {
  const canonicalRoot = realpathSync(liveRoot);
  const diff = run(
    "git",
    ["-C", canonicalRoot, "diff", "--binary", "--no-ext-diff", "HEAD", "--", "."],
  ).stdout;
  const status = run(
    "git",
    ["-C", canonicalRoot, "status", "--porcelain=v2", "-z", "--untracked-files=all"],
  ).stdout;
  const chunks = [Buffer.from("git-diff\0"), diff, Buffer.from("\0git-status\0"), status];

  for (const relativePathBuffer of untrackedPathsFromStatus(status)) {
    const relativePath = relativePathBuffer.toString("utf8");
    if (relativePath.includes("\uFFFD") || path.isAbsolute(relativePath)) {
      throw new Error("Git returned an unsafe untracked path.");
    }
    const absolutePath = path.resolve(canonicalRoot, relativePath);
    if (!isInsideRoot(canonicalRoot, absolutePath)) {
      throw new Error("Git returned an untracked path outside the live root.");
    }
    const stats = lstatSync(absolutePath);
    if (stats.isFile()) {
      chunks.push(Buffer.from("\0regular\0"), createHash("sha256").update(readFileSync(absolutePath)).digest());
    } else if (stats.isSymbolicLink()) {
      chunks.push(Buffer.from("\0symlink\0"));
    } else if (stats.isDirectory()) {
      chunks.push(Buffer.from("\0directory\0"));
    } else {
      chunks.push(Buffer.from("\0special\0"));
    }
  }

  return sha256(chunks);
}

export function normalizeRuntimeStatus({
  containers,
  expectedVolumesPresent,
  fullLocalLaunchAgent,
  macProductionLaunchAgent,
}) {
  const services = new Map(containers.map((container) => [container.service, container]));
  const containersPass = REQUIRED_SERVICES.every((service) => {
    const container = services.get(service);
    if (!container?.running) {
      return false;
    }
    return container.health === "healthy"
      || (container.health === null && SERVICES_WITHOUT_HEALTHCHECK.has(service));
  });

  return {
    fullLocalStatus: containersPass && expectedVolumesPresent ? "PASS" : "BLOCKED",
    launchAgentStatus: fullLocalLaunchAgent === "running"
      ? "PASS"
      : fullLocalLaunchAgent === "not-found"
        ? "NOT_CONFIGURED"
        : "BLOCKED",
    macProductionStatus: macProductionLaunchAgent === "running" ? "PASS" : "BLOCKED",
  };
}

function exactObjectKeys(value, expected, location, errors) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${location} must be an object.`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  for (const key of actual.filter((key) => !wanted.includes(key))) {
    errors.push(`unexpected key ${location}.${key}`);
  }
  for (const key of wanted.filter((key) => !actual.includes(key))) {
    errors.push(`missing key ${location}.${key}`);
  }
  return true;
}

function collectStringValues(value, location = "evidence", values = []) {
  if (typeof value === "string") {
    values.push([location, value]);
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => collectStringValues(entry, `${location}[${index}]`, values));
  } else if (value !== null && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => collectStringValues(entry, `${location}.${key}`, values));
  }
  return values;
}

function isUtcIsoTimestamp(value) {
  return typeof value === "string"
    && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString() === value;
}

export function validateSessionLifecycleEvidence(evidence) {
  const errors = [];
  const rootKeys = evidence !== null
    && typeof evidence === "object"
    && !Array.isArray(evidence)
    && Object.hasOwn(evidence, "cloudflare_monitoring")
    ? [...EXACT_KEYS.root, "cloudflare_monitoring"]
    : EXACT_KEYS.root;
  if (!exactObjectKeys(evidence, rootKeys, "evidence", errors)) {
    return errors;
  }
  exactObjectKeys(evidence.source, EXACT_KEYS.source, "source", errors);
  exactObjectKeys(evidence.runtime, EXACT_KEYS.runtime, "runtime", errors);
  exactObjectKeys(evidence.session_policy, EXACT_KEYS.session_policy, "session_policy", errors);
  exactObjectKeys(evidence.incident, EXACT_KEYS.incident, "incident", errors);
  exactObjectKeys(evidence.verification, EXACT_KEYS.verification, "verification", errors);
  exactObjectKeys(
    evidence.verification?.canary_results,
    EXACT_KEYS.canary_results,
    "verification.canary_results",
    errors,
  );
  if (Object.hasOwn(evidence, "cloudflare_monitoring")) {
    exactObjectKeys(
      evidence.cloudflare_monitoring,
      EXACT_KEYS.cloudflare_monitoring,
      "cloudflare_monitoring",
      errors,
    );
    const monitoring = evidence.cloudflare_monitoring;
    if (monitoring?.schema !== "homecook.cloudflare-monitoring-summary") {
      errors.push("cloudflare_monitoring.schema is invalid.");
    }
    if (monitoring?.version !== 1) errors.push("cloudflare_monitoring.version must equal 1.");
    if (!["healthy", "warning", "critical", "unknown"].includes(monitoring?.status)) {
      errors.push("cloudflare_monitoring.status is invalid.");
    }
    for (const key of [
      "incident_count",
      "critical_count",
      "warning_count",
      "diagnostic_count",
    ]) {
      if (!Number.isSafeInteger(monitoring?.[key]) || monitoring[key] < 0) {
        errors.push(`cloudflare_monitoring.${key} must be a non-negative integer.`);
      }
    }
    if (
      Number.isSafeInteger(monitoring?.incident_count)
      && Number.isSafeInteger(monitoring?.critical_count)
      && Number.isSafeInteger(monitoring?.warning_count)
      && Number.isSafeInteger(monitoring?.diagnostic_count)
      && monitoring.incident_count !== monitoring.critical_count
        + monitoring.warning_count
        + monitoring.diagnostic_count
    ) {
      errors.push("cloudflare_monitoring.incident_count must equal severity counts.");
    }
  }

  if (evidence.schema_version !== 1) errors.push("schema_version must equal 1.");
  if (!ALLOWED_PHASES.includes(evidence.phase)) errors.push("phase is invalid.");
  if (!isUtcIsoTimestamp(evidence.captured_at)) errors.push("captured_at must be UTC ISO-8601.");
  for (const [key, value] of [
    ["canonical_base_sha", evidence.source?.canonical_base_sha],
    ["implementation_sha", evidence.source?.implementation_sha],
    ["live_head_sha", evidence.source?.live_head_sha],
  ]) {
    if (typeof value !== "string" || !SHA_PATTERN.test(value)) errors.push(`${key} must be a 40-char SHA.`);
  }
  if (typeof evidence.source?.live_branch !== "string" || !SAFE_BRANCH_PATTERN.test(evidence.source.live_branch)) {
    errors.push("live_branch contains sensitive or unsafe characters.");
  }
  if (typeof evidence.source?.live_dirty !== "boolean") errors.push("live_dirty must be boolean.");
  if (!DIGEST_PATTERN.test(evidence.source?.live_dirty_diff_sha256 ?? "")) {
    errors.push("live_dirty_diff_sha256 must be a SHA-256 digest.");
  }
  if (!DIGEST_PATTERN.test(evidence.runtime?.gotrue_image_digest ?? "")) {
    errors.push("gotrue_image_digest must be a SHA-256 digest.");
  }
  if (!MIGRATION_PATTERN.test(evidence.runtime?.migration_head ?? "")) {
    errors.push("migration_head must be a migration filename.");
  }
  if (!KNOWN_MIGRATION_HEADS.has(evidence.runtime?.migration_head)) {
    errors.push("migration_head must be an approved database catalog marker.");
  }
  if (evidence.runtime?.migration_head_source !== "database_catalog_marker") {
    errors.push("migration_head_source must equal database_catalog_marker.");
  }
  if (evidence.runtime?.app_origin !== "https://app.mumeok.kr") errors.push("app_origin is invalid.");
  if (evidence.runtime?.auth_origin !== "https://auth.mumeok.kr") errors.push("auth_origin is invalid.");

  const passBlocked = new Set(["PASS", "BLOCKED"]);
  if (!passBlocked.has(evidence.runtime?.full_local_status)) errors.push("full_local_status is invalid.");
  if (!passBlocked.has(evidence.runtime?.mac_production_status)) errors.push("mac_production_status is invalid.");
  if (!new Set(["PASS", "BLOCKED", "NOT_CONFIGURED"]).has(evidence.runtime?.launch_agent_status)) {
    errors.push("launch_agent_status is invalid.");
  }
  if (evidence.session_policy?.jwt_exp_seconds !== 3600) errors.push("jwt_exp_seconds must equal 3600.");
  if (![null, "720h"].includes(evidence.session_policy?.inactivity_timeout)) errors.push("inactivity_timeout is invalid.");
  if (![null, "2160h"].includes(evidence.session_policy?.timebox)) errors.push("timebox is invalid.");
  if (evidence.session_policy?.single_per_user !== false) errors.push("single_per_user must be false.");
  if (evidence.session_policy?.refresh_rotation_enabled !== true) errors.push("refresh_rotation_enabled must be true.");
  if (evidence.session_policy?.refresh_reuse_interval_seconds !== 10) errors.push("refresh_reuse_interval_seconds must equal 10.");

  for (const key of ["binding_created_at", "binding_expires_at", "first_stale_at"]) {
    const value = evidence.incident?.[key];
    if (value !== null && !isUtcIsoTimestamp(value)) errors.push(`${key} must be null or UTC ISO-8601.`);
  }
  const exactRoutes = ["planner-read", "planner-write", "pantry-read", "youtube-extract"];
  if (JSON.stringify(evidence.incident?.affected_route_classes) !== JSON.stringify(exactRoutes)) {
    errors.push("affected_route_classes must equal the incident route classes.");
  }
  const gateValues = new Set(["PASS", "FAIL", "NOT_RUN"]);
  for (const key of [
    "production_domain_contract_gate",
    "refresh_lifecycle_gate",
    "authority_static_contracts",
    "postgres_integration",
    "docker_refresh_smoke",
    "security_function_gate",
    "gotrue_policy_gate",
    "recent_auth_security_gate",
    "t65_canary",
  ]) {
    if (!gateValues.has(evidence.verification?.[key])) errors.push(`${key} is invalid.`);
  }
  for (const key of CANARY_RESULT_KEYS) {
    if (!gateValues.has(evidence.verification?.canary_results?.[key])) {
      errors.push(`canary_results.${key} is invalid.`);
    }
  }
  for (const key of ["account_session_stale_count", "stale_token_mutation_count"]) {
    if (!Number.isSafeInteger(evidence.verification?.[key]) || evidence.verification[key] < 0) {
      errors.push(`${key} must be a non-negative integer.`);
    }
  }

  for (const [location, value] of collectStringValues(evidence)) {
    if (JWT_PATTERN.test(value) || EMAIL_PATTERN.test(value) || UUID_PATTERN.test(value) || SECRET_ASSIGNMENT_PATTERN.test(value)) {
      errors.push(`${location} contains a sensitive value.`);
    }
  }
  return errors;
}

export function buildSessionLifecycleEvidence({
  capturedAt,
  canonicalBaseSha,
  fullLocalStatus,
  gotrueImageDigest,
  implementationSha,
  launchAgentStatus,
  liveBranch,
  liveDirty,
  liveDirtyDiffSha256,
  liveHeadSha,
  macProductionStatus,
  migrationHead,
  migrationHeadSource,
  phase,
  productionDomainContractGate,
  cloudflareMonitoring = null,
  observation = {},
  verification = {},
}) {
  const policyEnabled = phase === "milestone-b-7d";
  return {
    schema_version: 1,
    phase,
    captured_at: capturedAt,
    source: {
      canonical_base_sha: canonicalBaseSha,
      implementation_sha: implementationSha,
      live_head_sha: liveHeadSha,
      live_branch: liveBranch,
      live_dirty: liveDirty,
      live_dirty_diff_sha256: liveDirtyDiffSha256,
    },
    runtime: {
      app_origin: "https://app.mumeok.kr",
      auth_origin: "https://auth.mumeok.kr",
      full_local_status: fullLocalStatus,
      mac_production_status: macProductionStatus,
      launch_agent_status: launchAgentStatus,
      gotrue_image_digest: gotrueImageDigest,
      migration_head: migrationHead,
      migration_head_source: migrationHeadSource,
    },
    session_policy: {
      jwt_exp_seconds: 3600,
      inactivity_timeout: policyEnabled ? "720h" : null,
      timebox: policyEnabled ? "2160h" : null,
      single_per_user: false,
      refresh_rotation_enabled: true,
      refresh_reuse_interval_seconds: 10,
    },
    incident: {
      binding_created_at: observation.bindingCreatedAt ?? null,
      binding_expires_at: observation.bindingExpiresAt ?? null,
      first_stale_at: observation.firstStaleAt ?? null,
      affected_route_classes: ["planner-read", "planner-write", "pantry-read", "youtube-extract"],
    },
    verification: {
      production_domain_contract_gate: productionDomainContractGate,
      refresh_lifecycle_gate: "NOT_RUN",
      authority_static_contracts: "NOT_RUN",
      postgres_integration: "NOT_RUN",
      docker_refresh_smoke: "NOT_RUN",
      security_function_gate: "NOT_RUN",
      gotrue_policy_gate: "NOT_RUN",
      recent_auth_security_gate: "NOT_RUN",
      t65_canary: observation.t65Canary ?? "NOT_RUN",
      canary_results: observation.canaryResults ?? {
        planner_read: "NOT_RUN",
        planner_write: "NOT_RUN",
        pantry_read: "NOT_RUN",
        youtube_extract: "NOT_RUN",
      },
      account_session_stale_count: observation.accountSessionStaleCount ?? 0,
      stale_token_mutation_count: observation.staleTokenMutationCount ?? 0,
      ...verification,
    },
    ...(cloudflareMonitoring === null ? {} : {
      cloudflare_monitoring: cloudflareMonitoring,
    }),
  };
}

export function assertEvidencePhaseReady(evidence) {
  const requiredByPhase = {
    baseline: ["production_domain_contract_gate"],
    "milestone-a-t65": [
      "production_domain_contract_gate",
      "refresh_lifecycle_gate",
      "authority_static_contracts",
      "postgres_integration",
      "docker_refresh_smoke",
      "security_function_gate",
      "t65_canary",
    ],
    "milestone-a-24h": [
      "production_domain_contract_gate",
      "refresh_lifecycle_gate",
      "authority_static_contracts",
      "postgres_integration",
      "docker_refresh_smoke",
      "security_function_gate",
      "t65_canary",
    ],
    "milestone-b-7d": [
      "production_domain_contract_gate",
      "refresh_lifecycle_gate",
      "authority_static_contracts",
      "postgres_integration",
      "docker_refresh_smoke",
      "security_function_gate",
      "gotrue_policy_gate",
      "recent_auth_security_gate",
      "t65_canary",
    ],
  };
  for (const key of requiredByPhase[evidence.phase] ?? []) {
    if (evidence.verification?.[key] !== "PASS") {
      throw new Error(`${key} must be PASS before ${evidence.phase} evidence can be written.`);
    }
  }
}

function runPnpmGate(implementationRoot, scriptName) {
  return run("pnpm", [scriptName], {
    allowFailure: true,
    cwd: implementationRoot,
  }).status === 0 ? "PASS" : "FAIL";
}

function parseLastJsonLine(stdout, label) {
  const lines = stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const candidate = lines.at(-1);
  if (!candidate) throw new Error(`${label} did not emit a JSON result.`);
  try {
    return JSON.parse(candidate);
  } catch {
    throw new Error(`${label} final stdout line must be compact JSON.`);
  }
}

function assertExactResultKeys(result, keys, label) {
  const errors = [];
  if (!exactObjectKeys(result, keys, label, errors) || errors.length > 0) {
    throw new Error(`${label} shape is invalid: ${errors.join("; ")}`);
  }
}

export function parseRefreshLifecycleGateJson(stdout) {
  const result = parseLastJsonLine(stdout, "refresh lifecycle gate");
  const keys = [
    "status",
    "refresh_lifecycle_gate",
    "authority_static_contracts",
    "postgres_integration",
    "docker_refresh_smoke",
  ];
  assertExactResultKeys(result, keys, "refresh lifecycle gate");
  for (const key of keys) {
    if (result[key] !== "PASS") throw new Error(`refresh lifecycle gate ${key} must be PASS.`);
  }
  return {
    refresh_lifecycle_gate: result.refresh_lifecycle_gate,
    authority_static_contracts: result.authority_static_contracts,
    postgres_integration: result.postgres_integration,
    docker_refresh_smoke: result.docker_refresh_smoke,
  };
}

export function parseGoTruePolicyGateJson(stdout) {
  const result = parseLastJsonLine(stdout, "GoTrue policy gate");
  const keys = [
    "status",
    "image_digest",
    "rendered_env",
    "auth_health",
    "refresh_rotation",
    "refresh_reuse_interval_seconds",
    "inactivity_rejection",
    "timebox_rejection",
    "multi_device",
  ];
  assertExactResultKeys(result, keys, "GoTrue policy gate");
  if (result.image_digest !== PINNED_GOTRUE_IMAGE_DIGEST) {
    throw new Error(`GoTrue policy gate image_digest must equal ${PINNED_GOTRUE_IMAGE_DIGEST}.`);
  }
  for (const key of keys.filter((key) => !["image_digest", "refresh_reuse_interval_seconds"].includes(key))) {
    if (result[key] !== "PASS") throw new Error(`GoTrue policy gate ${key} must be PASS.`);
  }
  if (result.refresh_reuse_interval_seconds !== 10) {
    throw new Error("GoTrue policy gate refresh_reuse_interval_seconds must equal 10.");
  }
  return "PASS";
}

export function parseCanaryObservationJson(stdout, { implementationSha, phase }) {
  const result = parseLastJsonLine(stdout, "production canary observation");
  assertExactResultKeys(result, [
    "status",
    "phase",
    "implementation_sha",
    "incident",
    "canary_results",
    "safety_checks",
    "account_session_stale_count",
    "stale_token_mutation_count",
  ], "production canary observation");
  assertExactResultKeys(result.incident, [
    "binding_created_at",
    "binding_expires_at",
    "first_stale_at",
  ], "production canary observation incident");
  assertExactResultKeys(
    result.canary_results,
    CANARY_RESULT_KEYS,
    "production canary observation results",
  );
  assertExactResultKeys(
    result.safety_checks,
    CANARY_SAFETY_CHECK_KEYS,
    "production canary observation safety checks",
  );
  if (result.status !== "PASS") throw new Error("production canary observation status must be PASS.");
  if (result.phase !== phase) throw new Error("production canary observation phase mismatch.");
  if (result.implementation_sha !== implementationSha || !SHA_PATTERN.test(result.implementation_sha)) {
    throw new Error("production canary observation implementation_sha mismatch.");
  }
  for (const key of CANARY_RESULT_KEYS) {
    if (result.canary_results[key] !== "PASS") {
      throw new Error(`production canary observation ${key} must be PASS.`);
    }
  }
  for (const key of [
    "binding_expiry_monotonic",
    "planner_write_cleanup",
    "phase_time_boundary",
    "stale_counts_since_deploy",
  ]) {
    if (result.safety_checks[key] !== "PASS") {
      throw new Error(`production canary observation ${key} must be PASS.`);
    }
  }
  for (const key of CANARY_SAFETY_CHECK_KEYS.filter((key) => key.startsWith("logout_"))) {
    if (result.safety_checks[key] !== "BLOCKED") {
      throw new Error(`production canary observation ${key} must be BLOCKED.`);
    }
  }
  for (const [key, value] of Object.entries(result.incident)) {
    if (value !== null && !isUtcIsoTimestamp(value)) {
      throw new Error(`production canary observation incident.${key} must be null or UTC ISO-8601.`);
    }
  }
  for (const key of ["account_session_stale_count", "stale_token_mutation_count"]) {
    if (!Number.isSafeInteger(result[key]) || result[key] !== 0) {
      throw new Error(`production canary observation ${key} must equal 0.`);
    }
  }
  return {
    accountSessionStaleCount: result.account_session_stale_count,
    bindingCreatedAt: result.incident.binding_created_at,
    bindingExpiresAt: result.incident.binding_expires_at,
    canaryResults: result.canary_results,
    firstStaleAt: result.incident.first_stale_at,
    staleTokenMutationCount: result.stale_token_mutation_count,
    ...(phase === "milestone-a-t65" ? { t65Canary: "PASS" } : {}),
  };
}

export function loadPriorT65Evidence({ implementationRoot, implementationSha }) {
  try {
    if (!SHA_PATTERN.test(implementationSha ?? "")) {
      throw new Error("invalid implementation SHA");
    }
    const canonicalRoot = realpathSync(implementationRoot);
    if (canonicalRoot !== implementationRoot) {
      throw new Error("implementation root must be canonical");
    }
    const evidencePath = validateEvidenceOutputPath(
      "milestone-a-t65",
      path.join(EVIDENCE_DIRECTORY, "milestone-a-t65.json"),
      canonicalRoot,
    );
    let currentPath = canonicalRoot;
    const relativeParent = path.relative(canonicalRoot, path.dirname(evidencePath));
    for (const segment of relativeParent.split(path.sep).filter(Boolean)) {
      currentPath = path.join(currentPath, segment);
      const stats = lstatSync(currentPath);
      if (!stats.isDirectory() || stats.isSymbolicLink() || realpathSync(currentPath) !== currentPath) {
        throw new Error("evidence parent is not trusted");
      }
    }
    const stats = lstatSync(evidencePath);
    if (!stats.isFile()
      || stats.isSymbolicLink()
      || (stats.mode & 0o777) !== 0o600
      || stats.size <= 0
      || stats.size > 256 * 1024
      || realpathSync(evidencePath) !== evidencePath) {
      throw new Error("evidence file is not trusted");
    }
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    if (validateSessionLifecycleEvidence(evidence).length > 0
      || evidence.phase !== "milestone-a-t65"
      || evidence.source?.implementation_sha !== implementationSha
      || evidence.verification?.t65_canary !== "PASS") {
      throw new Error("evidence contract mismatch");
    }
    assertEvidencePhaseReady(evidence);
    for (const key of CANARY_RESULT_KEYS) {
      if (evidence.verification.canary_results?.[key] !== "PASS") {
        throw new Error("prior canary result is not PASS");
      }
    }
    return "PASS";
  } catch {
    throw new Error("prior T+65 evidence is missing or invalid.");
  }
}

function runPnpmJsonGate(implementationRoot, scriptName, parser, extraArgs = []) {
  const result = run("pnpm", [scriptName, "--", "--json", ...extraArgs], {
    allowFailure: true,
    cwd: implementationRoot,
  });
  if (result.status !== 0) throw new Error(`${scriptName} failed.`);
  return parser(stdoutText(result));
}

function collectVerification({ implementationRoot, implementationSha, phase }) {
  const verification = {};
  const productionDomainContractGate = runPnpmGate(
    implementationRoot,
    "verify:production-domain-contract",
  );
  if (phase === "baseline") {
    return { productionDomainContractGate, verification };
  }

  let observation = {};
  try {
    Object.assign(verification, runPnpmJsonGate(
      implementationRoot,
      REFRESH_LIFECYCLE_JSON_SCRIPT,
      parseRefreshLifecycleGateJson,
    ));
  } catch {
    Object.assign(verification, {
      refresh_lifecycle_gate: "FAIL",
      authority_static_contracts: "FAIL",
      postgres_integration: "FAIL",
      docker_refresh_smoke: "FAIL",
    });
  }
  const securityGate = runPnpmGate(implementationRoot, "verify:security-functions");
  verification.security_function_gate = securityGate;
  try {
    observation = runPnpmJsonGate(
      implementationRoot,
      "verify:full-local-session-production-canary",
      (stdout) => parseCanaryObservationJson(stdout, { implementationSha, phase }),
      ["--phase", phase],
    );
    if (phase !== "milestone-a-t65") {
      observation.t65Canary = loadPriorT65Evidence({
        implementationRoot,
        implementationSha,
      });
    }
  } catch {
    verification.t65_canary = "FAIL";
  }

  if (phase === "milestone-b-7d") {
    const runtimeGate = runPnpmGate(implementationRoot, "full-local-production:validate");
    try {
      verification.gotrue_policy_gate = runtimeGate === "PASS"
        ? runPnpmJsonGate(
          implementationRoot,
          "verify:full-local-gotrue-session-policy",
          parseGoTruePolicyGateJson,
        )
        : "FAIL";
    } catch {
      verification.gotrue_policy_gate = "FAIL";
    }
    verification.recent_auth_security_gate = securityGate;
  }
  return { observation, productionDomainContractGate, verification };
}

function ensureTrustedOutputDirectory(implementationRoot, outputPath) {
  const canonicalRoot = realpathSync(implementationRoot);
  const parentPath = path.dirname(outputPath);
  const relativeParent = path.relative(canonicalRoot, parentPath);
  if (relativeParent.startsWith("..") || path.isAbsolute(relativeParent)) {
    throw new Error("Evidence output parent escapes the implementation root.");
  }

  let currentPath = canonicalRoot;
  for (const segment of relativeParent.split(path.sep).filter(Boolean)) {
    currentPath = path.join(currentPath, segment);
    if (!existsSync(currentPath)) {
      mkdirSync(currentPath, { mode: 0o700 });
      continue;
    }
    const stats = lstatSync(currentPath);
    if (stats.isSymbolicLink()) {
      throw new Error(`Evidence output ancestor must not be a symbolic link: ${currentPath}`);
    }
    if (!stats.isDirectory()) {
      throw new Error(`Evidence output ancestor must be a directory: ${currentPath}`);
    }
    if (realpathSync(currentPath) !== currentPath) {
      throw new Error(`Evidence output ancestor must keep its canonical path: ${currentPath}`);
    }
  }
  return parentPath;
}

export function writeSessionLifecycleEvidence({ evidence, implementationRoot, outputPath }) {
  const validatedOutputPath = validateEvidenceOutputPath(
    evidence?.phase,
    outputPath,
    implementationRoot,
  );
  const errors = validateSessionLifecycleEvidence(evidence);
  if (errors.length > 0) {
    throw new Error(`Evidence validation failed: ${errors.join("; ")}`);
  }
  assertEvidencePhaseReady(evidence);
  const outputDirectory = ensureTrustedOutputDirectory(implementationRoot, validatedOutputPath);
  if (existsSync(validatedOutputPath)) {
    throw new Error(`Evidence output already exists: ${validatedOutputPath}`);
  }

  const temporaryPath = path.join(outputDirectory, `.${path.basename(validatedOutputPath)}.${randomUUID()}.tmp`);
  let fileDescriptor;
  try {
    fileDescriptor = openSync(
      temporaryPath,
      fsConstants.O_WRONLY
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | (fsConstants.O_NOFOLLOW ?? 0),
      0o600,
    );
    writeFileSync(fileDescriptor, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    fsyncSync(fileDescriptor);
    closeSync(fileDescriptor);
    fileDescriptor = undefined;

    ensureTrustedOutputDirectory(implementationRoot, validatedOutputPath);
    linkSync(temporaryPath, validatedOutputPath);
    chmodSync(validatedOutputPath, 0o600);
  } finally {
    if (fileDescriptor !== undefined) {
      closeSync(fileDescriptor);
    }
    if (existsSync(temporaryPath)) {
      unlinkSync(temporaryPath);
    }
  }
}

function parseContainer(id) {
  const format = [
    "{{json .State.Running}}",
    "{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}",
    "{{json .Image}}",
    "{{json (index .Config.Labels \"com.docker.compose.service\")}}",
  ].join("|");
  const fields = stdoutText(run("docker", ["inspect", "--format", format, id])).trim().split("|");
  if (fields.length !== 4) throw new Error("Unexpected docker inspect output.");
  return {
    id,
    running: JSON.parse(fields[0]),
    health: JSON.parse(fields[1]),
    imageDigest: JSON.parse(fields[2]),
    service: JSON.parse(fields[3]),
  };
}

function collectContainers() {
  const ids = stdoutText(run("docker", [
    "ps",
    "--filter",
    "label=com.docker.compose.project=homecook-full-local-isolated",
    "--format",
    "{{.ID}}",
  ])).split(/\r?\n/u).map((value) => value.trim()).filter(Boolean);
  return ids.map(parseContainer);
}

function collectLaunchAgent(label) {
  const result = run("launchctl", ["print", `gui/${process.getuid()}/${label}`], { allowFailure: true });
  if (result.status === 0) {
    return {
      output: stdoutText(result),
      status: /\bstate\s*=\s*running\b/u.test(stdoutText(result)) ? "running" : "failed",
    };
  }
  const output = `${stdoutText(result)} ${Buffer.isBuffer(result.stderr) ? result.stderr.toString("utf8") : result.stderr ?? ""}`;
  return {
    output: "",
    status: /could not find service|service not found/u.test(output) ? "not-found" : "failed",
  };
}

export function validateLaunchAgentProvenance({
  implementationRoot,
  launchctlOutput,
  phase,
}) {
  if (phase === "baseline") return;
  if (!ALLOWED_PHASES.includes(phase)) {
    throw new Error("LaunchAgent provenance phase is invalid.");
  }
  const canonicalRoot = realpathSync(implementationRoot);
  const lines = String(launchctlOutput ?? "").split(/\r?\n/u).map((line) => line.trim());
  const workingDirectory = lines
    .find((line) => line.startsWith("working directory = "))
    ?.slice("working directory = ".length);
  const expectedProgram = path.join(
    canonicalRoot,
    "scripts",
    "start-local-mac-production.mjs",
  );
  if (workingDirectory !== canonicalRoot || !lines.includes(expectedProgram)) {
    throw new Error("Production LaunchAgent must target the exact implementation checkout.");
  }
}

export function parseMigrationHeadSqlOutput(stdout) {
  const lines = stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (lines.length !== 1) {
    throw new Error("Migration query must return a single safe migration filename.");
  }
  let parsed;
  try {
    parsed = JSON.parse(lines[0]);
  } catch {
    throw new Error("Migration query must return a single safe migration filename.");
  }
  const errors = [];
  if (!exactObjectKeys(parsed, ["migration_head", "source"], "migration query", errors)
    || errors.length > 0
    || !MIGRATION_PATTERN.test(parsed.migration_head ?? "")
    || !KNOWN_MIGRATION_HEADS.has(parsed.migration_head)) {
    throw new Error("Migration query must return a single safe migration filename.");
  }
  if (parsed.source !== "database_catalog_marker") {
    throw new Error("Migration query source must equal database_catalog_marker.");
  }
  return {
    migrationHead: parsed.migration_head,
    migrationHeadSource: parsed.source,
  };
}

export function buildMigrationHeadSql() {
  return [
    "begin transaction read only;",
    "set local statement_timeout = '5s';",
    "with",
    buildFullLocalProductCatalogCtesSql(),
    `, ${buildFullLocalAuthorizationContractCtesSql()}`,
    ", catalog_gate as (",
    "  select",
    "    bool_and(relation_checks.present)",
    "      and bool_and(column_checks.present)",
    "      and bool_and(function_checks.present) as catalog_ready",
    "  from relation_checks, column_checks, function_checks",
    "),",
    "authorization_gate as (",
    "  select bool_and(present) as authorization_ready",
    "  from authorization_checks",
    "),",
    "catalog_marker as (",
    "  select case",
    "    when (select authorization_ready from authorization_gate)",
    "      then '20260809110000_full_local_request_transaction_and_youtube_scope.sql'",
    "    when to_regprocedure('public.assert_and_renew_full_local_session_authority_v2(text,uuid,timestamp with time zone,uuid,text,integer,bigint,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone)') is not null",
    "      and position('last_token_issued_at' in pg_get_functiondef(to_regprocedure('public.assert_and_renew_full_local_session_authority_v2(text,uuid,timestamp with time zone,uuid,text,integer,bigint,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone)'))) > 0",
    "      then '20260809100000_full_local_session_refresh_authority.sql'",
    "    when to_regprocedure('private.verify_full_local_authenticated_authority()') is not null",
    "      and position('v_read_only_request := v_method in (''GET'', ''HEAD'')' in pg_get_functiondef(to_regprocedure('private.verify_full_local_authenticated_authority()'))) > 0",
    "      then '20260803093000_full_local_read_only_request_authority.sql'",
    "    when to_regprocedure('public.record_full_local_session_authority(text,uuid,timestamp with time zone,text,integer,bigint,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone)') is not null",
    "      and position('p_session_issued_at < date_trunc(''second'', p_identity_created_at)' in pg_get_functiondef(to_regprocedure('public.record_full_local_session_authority(text,uuid,timestamp with time zone,text,integer,bigint,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone)'))) > 0",
    "      then '20260803090000_full_local_session_issue_time_precision.sql'",
    "    when to_regprocedure('private.verify_full_local_internal_scope_without_production_scan()') is not null",
    "      then '20260803020000_full_local_production_data_quality_scope.sql'",
    "    when to_regprocedure('private.verify_full_local_internal_scope_without_recipe_book_projection()') is not null",
    "      then '20260802151000_full_local_recipe_book_projection_scope.sql'",
    "    when to_regprocedure('public.enforce_legacy_personal_mutation_fence()') is not null",
    "      then '20260802150000_full_local_authenticated_mutation_authority.sql'",
    "    when to_regprocedure('private.verify_full_local_authenticated_authority()') is not null",
    "      and position('v_request_nbf := coalesce(' in pg_get_functiondef(to_regprocedure('private.verify_full_local_authenticated_authority()'))) > 0",
    "      then '20260802140000_full_local_authenticated_nbf_compatibility.sql'",
    "    when to_regprocedure('public.prepare_recipe_image_legacy_visibility_migration(uuid,uuid,uuid,bigint,uuid[])') is not null",
    "      and position('v_positive.expected_visibility = ''public_shared''' in pg_get_functiondef(to_regprocedure('public.prepare_recipe_image_legacy_visibility_migration(uuid,uuid,uuid,bigint,uuid[])'))) > 0",
    "      then '20260802130000_recipe_image_public_shared_legacy_owner_compatibility.sql'",
    "    when to_regprocedure('private.verify_hybrid_request_authority()') is not null",
    "      then '20260801151000_full_local_request_authority.sql'",
    "    else null",
    "  end as migration_head",
    "  from catalog_gate",
    "  where catalog_ready",
    ")",
    "select json_build_object(",
    "  'migration_head', migration_head,",
    "  'source', 'database_catalog_marker'",
    ")::text",
    "from catalog_marker",
    "where migration_head is not null",
    "  and exists (select 1 from catalog_gate where catalog_ready);",
    "rollback;",
    "",
  ].join("\n");
}

function collectMigrationHead(postgresContainerId) {
  const sql = buildMigrationHeadSql();
  const result = run("docker", [
    "exec",
    "-i",
    postgresContainerId,
    "psql",
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "supabase_admin",
    "-d",
    "postgres",
  ], {
    allowFailure: true,
    input: sql,
  });
  if (result.status !== 0) {
    throw new Error("Read-only migration head query failed.");
  }
  return parseMigrationHeadSqlOutput(stdoutText(result));
}

function verifyPublicOrigins() {
  const app = run("curl", ["-sS", "-I", "--max-time", "10", "https://app.mumeok.kr"], { allowFailure: true });
  const auth = run("curl", ["-sS", "-I", "--max-time", "10", "https://auth.mumeok.kr/auth/v1/health"], { allowFailure: true });
  const appHeaders = stdoutText(app);
  const authHeaders = stdoutText(auth);
  return app.status === 0
    && /^HTTP\/\S+ 200\b/mu.test(appHeaders)
    && appHeaders.includes("auth.mumeok.kr")
    && auth.status === 0
    && /^HTTP\/\S+ 401\b/mu.test(authHeaders);
}

function parseCliArgs(argv) {
  const [phase, ...rest] = argv;
  let liveRoot;
  let output;
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === "--live-root" && index + 1 < rest.length) {
      liveRoot = rest[index + 1];
      index += 1;
    } else if (rest[index] === "--output" && index + 1 < rest.length) {
      output = rest[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${rest[index]}`);
    }
  }
  if (!phase || !liveRoot || !output) {
    throw new Error("Usage: capture-full-local-session-lifecycle-evidence.mjs <phase> --live-root <absolute-path> --output <path>");
  }
  return { liveRoot, output, phase };
}

export function captureSessionLifecycleEvidence({ implementationRoot, liveRoot, output, phase }) {
  const canonicalLiveRoot = validateLiveRoot(liveRoot);
  const outputPath = validateEvidenceOutputPath(phase, output, implementationRoot);
  const containers = collectContainers();
  const authContainers = containers.filter((container) => container.service === "auth");
  const postgresContainers = containers.filter((container) => container.service === "postgres");
  if (authContainers.length !== 1 || !DIGEST_PATTERN.test(authContainers[0].imageDigest ?? "")) {
    throw new Error("Auth container image digest is missing or invalid.");
  }
  if (postgresContainers.length !== 1) {
    throw new Error("Expected exactly one production PostgreSQL container.");
  }
  const [authContainer] = authContainers;
  const [postgresContainer] = postgresContainers;
  const volumes = run("docker", ["volume", "inspect", ...REQUIRED_VOLUMES], { allowFailure: true });
  const fullLocalLaunchAgent = collectLaunchAgent("com.homecook.full-local.production");
  const macProductionLaunchAgent = collectLaunchAgent("com.homecook.production");
  validateLaunchAgentProvenance({
    implementationRoot,
    launchctlOutput: macProductionLaunchAgent.output,
    phase,
  });
  const statuses = normalizeRuntimeStatus({
    containers,
    expectedVolumesPresent: volumes.status === 0,
    fullLocalLaunchAgent: fullLocalLaunchAgent.status,
    macProductionLaunchAgent: macProductionLaunchAgent.status,
  });
  if (!verifyPublicOrigins()) {
    throw new Error("Public app/Auth origin verification failed.");
  }

  const canonicalBaseSha = stdoutText(run(
    "git",
    ["merge-base", "HEAD", "origin/master"],
    { cwd: implementationRoot },
  )).trim();
  const implementationSha = stdoutText(run("git", ["rev-parse", "HEAD"], { cwd: implementationRoot })).trim();
  const liveHeadSha = stdoutText(run("git", ["-C", canonicalLiveRoot, "rev-parse", "HEAD"])).trim();
  const liveBranch = stdoutText(run("git", ["-C", canonicalLiveRoot, "branch", "--show-current"])).trim();
  const liveStatus = run("git", ["-C", canonicalLiveRoot, "status", "--porcelain=v2", "-z", "--untracked-files=all"]).stdout;
  const { observation, productionDomainContractGate, verification } = collectVerification({
    implementationRoot,
    implementationSha,
    phase,
  });

  const migration = collectMigrationHead(postgresContainer.id);
  const evidence = buildSessionLifecycleEvidence({
    capturedAt: new Date().toISOString(),
    canonicalBaseSha,
    fullLocalStatus: statuses.fullLocalStatus,
    gotrueImageDigest: authContainer.imageDigest,
    implementationSha,
    launchAgentStatus: statuses.launchAgentStatus,
    liveBranch,
    liveDirty: liveStatus.length > 0,
    liveDirtyDiffSha256: computeLiveDirtyDiffSha256(canonicalLiveRoot),
    liveHeadSha,
    macProductionStatus: statuses.macProductionStatus,
    migrationHead: migration.migrationHead,
    migrationHeadSource: migration.migrationHeadSource,
    phase,
    productionDomainContractGate,
    observation,
    verification,
  });
  const errors = validateSessionLifecycleEvidence(evidence);
  if (errors.length > 0) {
    throw new Error(`Evidence validation failed: ${errors.join("; ")}`);
  }
  if (phase === "baseline" && !evidence.source.live_dirty) {
    throw new Error("The incident baseline must preserve the known dirty live checkout provenance.");
  }
  assertEvidencePhaseReady(evidence);

  writeSessionLifecycleEvidence({ evidence, implementationRoot, outputPath });
  return evidence;
}

function main() {
  try {
    const { liveRoot, output, phase } = parseCliArgs(process.argv.slice(2));
    const implementationRoot = realpathSync(process.cwd());
    const evidence = captureSessionLifecycleEvidence({ implementationRoot, liveRoot, output, phase });
    process.stdout.write(`session-lifecycle-evidence: PASS (${evidence.phase})\n`);
  } catch {
    process.stderr.write("session-lifecycle-evidence: FAIL (redacted)\n");
    process.exitCode = 1;
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(currentFile)) {
  main();
}
