import {
  closeSync,
  constants as FS_CONSTANTS,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { TextDecoder } from "node:util";

import { canonicalizeJcs, parseCanonicalJcs, sha256Jcs } from "./rfc8785-jcs.mjs";
import { validateRunEvidence } from "./local-mac-production-rehearsal-runner.mjs";

export const RUN_RECEIPT_SCHEMA = "homecook.local-mac-production-rehearsal-run-receipt.v1";
export const REPEATABILITY_RECEIPT_SCHEMA = "homecook.local-mac-production-rehearsal-repeatability-receipt.v1";

const CANONICALIZATION = "RFC8785-JCS+SHA256";
const REPOSITORY = "netsus/homecook";
const SOURCE_REF = "refs/heads/master";
const HEX_40 = /^[0-9a-f]{40}$/u;
const HEX_64 = /^[0-9a-f]{64}$/u;
const IMAGE_DIGEST = /^sha256:[0-9a-f]{64}$/u;
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SAFE_TOOL_MODES = new Set([0o400, 0o444, 0o500, 0o555, 0o600, 0o644, 0o700, 0o755]);

const TOOL_KEYS = ["version", "realpath", "device", "inode", "mode", "ctime", "size", "sha256"];
const TOOLCHAIN_KEYS = ["node", "pnpm", "supabase_cli", "git", "docker_client", "docker_daemon", "candidate_builder", "rehearsal_runner"];
const RUNTIME_KEYS = [
  "kind", "pid", "process_group_id", "container_ids", "reported_release_sha",
  "reported_release_tree", "reported_build_id", "reported_sealed_bundle_digest",
  "reported_migration_head",
];
const RUN_UNSIGNED_KEYS = [
  "schema", "canonicalization", "repository", "source_ref", "release_sha", "release_tree",
  "ci_head_sha", "ci_check_summary_digest", "build_id", "sealed_bundle_digest",
  "bundle_manifest_digest", "run_id", "issued_at", "completed_at", "toolchain", "images",
  "migration", "fixtures", "isolation", "runtime", "canaries", "network", "cleanup",
  "production_guard", "environment_snapshot", "threat_controls", "issuer_task_id",
];
const REPEAT_UNSIGNED_KEYS = [
  "schema", "canonicalization", "repository", "source_ref", "release_sha", "release_tree",
  "build_id", "sealed_bundle_digest", "member_receipt_digests", "member_run_ids",
  "member_resource_identity_digests", "toolchain_digest", "image_set_digest",
  "migration_ledger_digest", "canary_set_digest", "cleanup_evidence_digests",
  "production_guard_digests", "completed_at", "valid_until", "status", "issuer_task_id",
];

function fail(message) {
  throw new Error(`Rehearsal receipt rejected: ${message}`);
}

function assertObject(value, label, exactKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value);
  const missing = exactKeys.filter((key) => !Object.hasOwn(value, key));
  const unknown = actual.filter((key) => !exactKeys.includes(key));
  if (missing.length > 0) fail(`${label} missing required key ${missing[0]}`);
  if (unknown.length > 0) fail(`${label} contains unknown key ${unknown[0]}`);
  return value;
}

function assertString(value, label, pattern = null) {
  if (typeof value !== "string" || value.length === 0) fail(`${label} must be a nonempty string`);
  if (pattern && !pattern.test(value)) fail(`${label} has an invalid format`);
  return value;
}

function assertInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(`${label} must be an integer >= ${minimum}`);
  return value;
}

function assertIdentityInteger(value, label) {
  if ((Number.isSafeInteger(value) && value >= 0) || /^(?:0|[1-9]\d*)$/u.test(value ?? "")) return value;
  fail(`${label} must be an exact nonnegative integer or decimal string`);
}

function assertTimestamp(value, label) {
  assertString(value, label, RFC3339_UTC);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    fail(`${label} must be an exact UTC millisecond RFC3339 calendar instant`);
  }
  return value;
}

function timestampMilliseconds(value, label) {
  assertTimestamp(value, label);
  return Date.parse(value);
}

function assertSortedUniqueStrings(value, label, { length = null, pattern = null } = {}) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  if (length !== null && value.length !== length) fail(`${label} must contain exactly ${length} entries`);
  for (const entry of value) assertString(entry, `${label} entry`, pattern);
  if (new Set(value).size !== value.length) fail(`${label} entries must be unique`);
  if (value.some((entry, index) => index > 0 && value[index - 1] > entry)) {
    fail(`${label} must be bytewise ascending`);
  }
  return value;
}

function validateToolIdentity(value, label) {
  const tool = assertObject(value, label, TOOL_KEYS);
  assertString(tool.version, `${label}.version`);
  assertString(tool.realpath, `${label}.realpath`);
  if (!isAbsolute(tool.realpath)) fail(`${label}.realpath must be absolute`);
  assertIdentityInteger(tool.device, `${label}.device`);
  assertIdentityInteger(tool.inode, `${label}.inode`);
  assertInteger(tool.mode, `${label}.mode`);
  if (!SAFE_TOOL_MODES.has(tool.mode) || (tool.mode & 0o022) !== 0) fail(`${label}.mode is unsafe or outside the closed allowlist`);
  assertTimestamp(tool.ctime, `${label}.ctime`);
  assertIdentityInteger(tool.size, `${label}.size`);
  assertString(tool.sha256, `${label}.sha256`, HEX_64);
}

function validateRuntimeIdentity(value, label, receipt) {
  const runtime = assertObject(value, label, RUNTIME_KEYS);
  if (runtime.kind === "container") {
    if (runtime.pid !== null || runtime.process_group_id !== null) fail(`${label} container PID fields must be null`);
    assertSortedUniqueStrings(runtime.container_ids, `${label}.container_ids`);
    if (runtime.container_ids.length === 0) fail(`${label}.container_ids must be nonempty`);
  } else if (runtime.kind === "process") {
    assertInteger(runtime.pid, `${label}.pid`, 1);
    if (runtime.process_group_id !== null) fail(`${label}.process_group_id must be null for the foreground supervisor`);
    if (!Array.isArray(runtime.container_ids) || runtime.container_ids.length !== 0) fail(`${label}.container_ids must be empty for a process`);
  } else {
    fail(`${label}.kind must be container or process`);
  }
  if (runtime.reported_release_sha !== receipt.release_sha) fail(`${label} release identity mismatch`);
  if (runtime.reported_release_tree !== receipt.release_tree) fail(`${label} tree identity mismatch`);
  if (runtime.reported_build_id !== receipt.build_id) fail(`${label} build identity mismatch`);
  if (runtime.reported_sealed_bundle_digest !== receipt.sealed_bundle_digest) fail(`${label} bundle identity mismatch`);
  if (runtime.reported_migration_head !== receipt.migration.migration_head) fail(`${label} migration identity mismatch`);
}

function validateRunUnsigned(value) {
  const receipt = assertObject(value, "run receipt", RUN_UNSIGNED_KEYS);
  if (receipt.schema !== RUN_RECEIPT_SCHEMA) fail("run receipt schema mismatch");
  if (receipt.canonicalization !== CANONICALIZATION) fail("canonicalization mismatch");
  if (receipt.repository !== REPOSITORY) fail("repository mismatch");
  if (receipt.source_ref !== SOURCE_REF) fail("source_ref mismatch");
  assertString(receipt.release_sha, "release_sha", HEX_40);
  assertString(receipt.release_tree, "release_tree", HEX_40);
  if (receipt.ci_head_sha !== receipt.release_sha) fail("ci_head_sha must equal release_sha");
  for (const key of ["ci_check_summary_digest", "sealed_bundle_digest", "bundle_manifest_digest"]) {
    assertString(receipt[key], key, HEX_64);
  }
  assertString(receipt.build_id, "build_id");
  assertString(receipt.run_id, "run_id", UUID_V4);
  assertTimestamp(receipt.issued_at, "issued_at");
  assertTimestamp(receipt.completed_at, "completed_at");
  if (timestampMilliseconds(receipt.issued_at, "issued_at") > timestampMilliseconds(receipt.completed_at, "completed_at")) fail("issued_at must not follow completed_at");

  const toolchain = assertObject(receipt.toolchain, "toolchain", TOOLCHAIN_KEYS);
  for (const key of TOOLCHAIN_KEYS) validateToolIdentity(toolchain[key], `toolchain.${key}`);

  if (!Array.isArray(receipt.images) || receipt.images.length === 0) fail("images must be nonempty");
  const imageDigests = [];
  for (const [index, value] of receipt.images.entries()) {
    const image = assertObject(value, `images[${index}]`, ["digest", "platform", "local_cache_provenance_digest"]);
    assertString(image.digest, `images[${index}].digest`, IMAGE_DIGEST);
    assertString(image.platform, `images[${index}].platform`);
    assertString(image.local_cache_provenance_digest, `images[${index}].local_cache_provenance_digest`, HEX_64);
    imageDigests.push(image.digest);
  }
  assertSortedUniqueStrings(imageDigests, "image digests");

  const migration = assertObject(receipt.migration, "migration", ["ordered_migration_files_digest", "applied_global_ledger_digest", "migration_head", "catalog_head", "schema_identity_digest"]);
  for (const key of ["ordered_migration_files_digest", "applied_global_ledger_digest", "schema_identity_digest"]) assertString(migration[key], `migration.${key}`, HEX_64);
  assertString(migration.migration_head, "migration.migration_head");
  if (migration.catalog_head !== migration.migration_head) fail("migration global ledger and catalog head must align");

  const fixtures = assertObject(receipt.fixtures, "fixtures", ["fixture_set_id", "fixture_set_digest", "production_derived_row_count"]);
  assertString(fixtures.fixture_set_id, "fixtures.fixture_set_id");
  assertString(fixtures.fixture_set_digest, "fixtures.fixture_set_digest", HEX_64);
  if (fixtures.production_derived_row_count !== 0) fail("fixtures production-derived row count must be 0");

  const isolation = assertObject(receipt.isolation, "isolation", ["resource_identity_digest", "root_identity_digest", "docker_project_id", "network_ids", "container_ids", "volume_ids", "db_identity", "ports", "collision_preflight_digest"]);
  for (const key of ["resource_identity_digest", "root_identity_digest", "collision_preflight_digest"]) assertString(isolation[key], `isolation.${key}`, HEX_64);
  for (const key of ["docker_project_id", "db_identity"]) assertString(isolation[key], `isolation.${key}`);
  for (const key of ["network_ids", "container_ids", "volume_ids"]) assertSortedUniqueStrings(isolation[key], `isolation.${key}`);
  if (!Array.isArray(isolation.ports) || isolation.ports.length === 0) fail("isolation.ports must be nonempty");
  isolation.ports.forEach((port) => assertInteger(port, "isolation port", 1));
  if (isolation.ports.some((port) => port > 65_535)) fail("isolation ports must be <= 65535");
  if (new Set(isolation.ports).size !== isolation.ports.length || isolation.ports.some((port, index) => index > 0 && isolation.ports[index - 1] > port)) fail("isolation ports must be unique ascending values");

  const runtime = assertObject(receipt.runtime, "runtime", ["app", "full_local", "worker", "foreground_supervisor"]);
  for (const key of ["app", "full_local", "worker", "foreground_supervisor"]) validateRuntimeIdentity(runtime[key], `runtime.${key}`, receipt);

  if (!Array.isArray(receipt.canaries) || receipt.canaries.length === 0) fail("canaries must be nonempty");
  const canaryIds = [];
  for (const [index, value] of receipt.canaries.entries()) {
    const canary = assertObject(value, `canaries[${index}]`, ["canary_id", "started_at", "completed_at", "exit_code", "normalized_result_digest"]);
    canaryIds.push(assertString(canary.canary_id, `canaries[${index}].canary_id`));
    assertTimestamp(canary.started_at, `canaries[${index}].started_at`);
    assertTimestamp(canary.completed_at, `canaries[${index}].completed_at`);
    if (timestampMilliseconds(canary.started_at, `canaries[${index}].started_at`) > timestampMilliseconds(canary.completed_at, `canaries[${index}].completed_at`)) fail("canary time range is invalid");
    if (canary.exit_code !== 0) fail("canary exit_code must be 0");
    assertString(canary.normalized_result_digest, `canaries[${index}].normalized_result_digest`, HEX_64);
  }
  assertSortedUniqueStrings(canaryIds, "canary IDs");

  const network = assertObject(receipt.network, "network", ["default_deny_policy_digest", "allowed_endpoints", "denied_attempt_count", "unexpected_successful_egress_count"]);
  assertString(network.default_deny_policy_digest, "network.default_deny_policy_digest", HEX_64);
  assertSortedUniqueStrings(network.allowed_endpoints, "network.allowed_endpoints");
  assertInteger(network.denied_attempt_count, "network.denied_attempt_count");
  if (network.unexpected_successful_egress_count !== 0) fail("unexpected successful egress count must be 0");

  const cleanup = assertObject(receipt.cleanup, "cleanup", ["completed", "owned_resource_ids", "removed_resource_ids", "residue_resource_ids", "cleanup_errors"]);
  if (cleanup.completed !== true) fail("cleanup must be completed");
  assertSortedUniqueStrings(cleanup.owned_resource_ids, "cleanup.owned_resource_ids");
  assertSortedUniqueStrings(cleanup.removed_resource_ids, "cleanup.removed_resource_ids");
  if (JSON.stringify(cleanup.owned_resource_ids) !== JSON.stringify(cleanup.removed_resource_ids)) fail("cleanup owned and removed resources must match exactly");
  if (!Array.isArray(cleanup.residue_resource_ids) || cleanup.residue_resource_ids.length !== 0) fail("cleanup residue must be empty");
  if (!Array.isArray(cleanup.cleanup_errors) || cleanup.cleanup_errors.length !== 0) fail("cleanup errors must be empty");
  const runtimeContainerIds = ["app", "full_local", "worker"]
    .flatMap((component) => receipt.runtime[component].container_ids)
    .sort(compareCodeUnits);
  if (new Set(runtimeContainerIds).size !== runtimeContainerIds.length
    || comparable(runtimeContainerIds) !== comparable(isolation.container_ids)) {
    fail("runtime container IDs must equal isolation.container_ids exactly");
  }
  const typedResourceIds = [
    ...isolation.container_ids,
    ...isolation.network_ids,
    ...isolation.volume_ids,
  ].sort(compareCodeUnits);
  if (new Set(typedResourceIds).size !== typedResourceIds.length) {
    fail("typed isolation resource IDs must be globally unique");
  }
  if (comparable(typedResourceIds) !== comparable(cleanup.owned_resource_ids)
    || comparable(typedResourceIds) !== comparable(cleanup.removed_resource_ids)) {
    fail("typed isolation resources must equal cleanup owned/removed IDs exactly");
  }

  const guard = assertObject(receipt.production_guard, "production_guard", ["surface_allowlist_version", "production_snapshot_pre_digest", "production_snapshot_post_digest", "equal", "mutation_attempt_count", "production_db_connection_count", "production_db_write_count"]);
  assertString(guard.surface_allowlist_version, "production_guard.surface_allowlist_version");
  for (const key of ["production_snapshot_pre_digest", "production_snapshot_post_digest"]) assertString(guard[key], `production_guard.${key}`, HEX_64);
  if (guard.equal !== true || guard.production_snapshot_pre_digest !== guard.production_snapshot_post_digest) fail("production guard snapshots must be equal");
  for (const key of ["mutation_attempt_count", "production_db_connection_count", "production_db_write_count"]) if (guard[key] !== 0) fail(`production guard ${key} must be 0`);

  const environment = assertObject(receipt.environment_snapshot, "environment_snapshot", ["source_allowlist_id", "opaque_source_identity_digest", "override_policy_digest", "exposed_value_count"]);
  assertString(environment.source_allowlist_id, "environment_snapshot.source_allowlist_id");
  assertString(environment.opaque_source_identity_digest, "environment_snapshot.opaque_source_identity_digest", HEX_64);
  assertString(environment.override_policy_digest, "environment_snapshot.override_policy_digest", HEX_64);
  if (environment.exposed_value_count !== 0) fail("environment exposed value count must be 0");

  const threats = assertObject(receipt.threat_controls, "threat_controls", ["symlink_toctou", "namespace_collision", "digest_substitution", "stale_receipt", "cleanup_ownership"]);
  for (const key of Object.keys(threats)) if (threats[key] !== "pass") fail(`threat control ${key} must pass`);
  assertString(receipt.issuer_task_id, "issuer_task_id");
  return receipt;
}

export function validateRunReceipt(value, { now = new Date() } = {}) {
  const receipt = assertObject(value, "run receipt", [...RUN_UNSIGNED_KEYS, "receipt_digest"]);
  const { receipt_digest: digest, ...unsigned } = receipt;
  validateRunUnsigned(unsigned);
  assertString(digest, "receipt_digest", HEX_64);
  if (sha256Jcs(unsigned) !== digest) fail("run receipt digest mismatch");
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail("run receipt validation requires a valid current instant");
  if (timestampMilliseconds(receipt.completed_at, "completed_at") > now.getTime()) fail("completed_at must not be in the future relative to now");
  return receipt;
}

export function buildRunReceipt(input, { now = new Date() } = {}) {
  validateRunUnsigned(input);
  const receipt = Object.freeze({ ...input, receipt_digest: sha256Jcs(input) });
  return validateRunReceipt(receipt, { now });
}

/**
 * @param {{candidateManifest: any, runEvidence: any, issuerTaskId: string, now?: Date}} options
 */
export function buildRunReceiptFromEvidenceAuthority({
  candidateManifest,
  runEvidence,
  issuerTaskId,
  now = new Date(),
} = {}) {
  validateRunEvidence(runEvidence);
  if (!candidateManifest || typeof candidateManifest !== "object" || Array.isArray(candidateManifest)) {
    fail("validated candidate manifest authority is required");
  }
  if (candidateManifest.repository !== REPOSITORY || candidateManifest.source_ref !== SOURCE_REF) {
    fail("candidate repository or source_ref authority mismatch");
  }
  for (const field of [
    "release_sha", "release_tree", "build_id",
    "sealed_bundle_digest", "bundle_manifest_digest", "candidate_identity_digest",
  ]) {
    if (candidateManifest[field] !== runEvidence[field]) {
      fail(`candidate and run evidence differ at ${field}`);
    }
  }
  if (!candidateManifest.toolchain || !candidateManifest.environment_snapshot) {
    fail("candidate toolchain and environment authority are required");
  }
  if (candidateManifest.migration?.ordered_migration_files_digest !== runEvidence.migration.ordered_migration_files_digest
    || candidateManifest.migration?.migration_head !== runEvidence.migration.migration_head) {
    fail("candidate and run evidence migration authority differs");
  }

  const runtime = Object.fromEntries(
    ["app", "full_local", "worker"].map((component) => {
      const evidence = runEvidence.runtime[component];
      return [component, {
        kind: evidence.kind,
        pid: evidence.pid,
        process_group_id: evidence.process_group_id,
        container_ids: [...evidence.container_ids].sort(compareCodeUnits),
        reported_release_sha: evidence.release_sha,
        reported_release_tree: evidence.release_tree,
        reported_build_id: evidence.build_id,
        reported_sealed_bundle_digest: evidence.sealed_bundle_digest,
        reported_migration_head: evidence.migration_head,
      }];
    }),
  );
  const supervisor = runEvidence.runtime.foreground_supervisor;
  runtime.foreground_supervisor = {
    kind: "process",
    pid: supervisor.pid,
    process_group_id: supervisor.process_group_id,
    container_ids: [],
    reported_release_sha: runEvidence.release_sha,
    reported_release_tree: runEvidence.release_tree,
    reported_build_id: runEvidence.build_id,
    reported_sealed_bundle_digest: runEvidence.sealed_bundle_digest,
    reported_migration_head: runEvidence.migration.migration_head,
  };

  return buildRunReceipt({
    schema: RUN_RECEIPT_SCHEMA,
    canonicalization: CANONICALIZATION,
    repository: REPOSITORY,
    source_ref: SOURCE_REF,
    release_sha: runEvidence.release_sha,
    release_tree: runEvidence.release_tree,
    ci_head_sha: runEvidence.release_sha,
    ci_check_summary_digest: candidateManifest.ci_check_summary_digest,
    build_id: runEvidence.build_id,
    sealed_bundle_digest: runEvidence.sealed_bundle_digest,
    bundle_manifest_digest: runEvidence.bundle_manifest_digest,
    run_id: runEvidence.run_id,
    issued_at: runEvidence.issued_at,
    completed_at: runEvidence.completed_at,
    toolchain: {
      node: candidateManifest.toolchain.node,
      pnpm: candidateManifest.toolchain.pnpm,
      supabase_cli: candidateManifest.toolchain.supabase_cli,
      git: candidateManifest.toolchain.git,
      docker_client: candidateManifest.toolchain.docker_client,
      docker_daemon: candidateManifest.toolchain.docker_daemon,
      candidate_builder: candidateManifest.toolchain.candidate_builder,
      rehearsal_runner: runEvidence.rehearsal_runner,
    },
    images: candidateManifest.images.map(({ digest, platform, local_cache_provenance_digest }) => ({
      digest,
      platform,
      local_cache_provenance_digest,
    })).sort((left, right) => compareCodeUnits(left.digest, right.digest)),
    migration: {
      ordered_migration_files_digest: runEvidence.migration.ordered_migration_files_digest,
      applied_global_ledger_digest: runEvidence.migration.applied_global_ledger_digest,
      migration_head: runEvidence.migration.migration_head,
      catalog_head: runEvidence.migration.catalog_head,
      schema_identity_digest: runEvidence.migration.schema_identity_digest,
    },
    fixtures: runEvidence.fixtures,
    isolation: {
      resource_identity_digest: runEvidence.isolation.resource_identity_digest,
      root_identity_digest: runEvidence.isolation.root_identity_digest,
      docker_project_id: runEvidence.isolation.docker_project_id,
      network_ids: runEvidence.isolation.network_ids,
      container_ids: runEvidence.isolation.container_ids,
      volume_ids: runEvidence.isolation.volume_ids,
      db_identity: runEvidence.isolation.db_identity.identity_digest,
      ports: Object.values(runEvidence.isolation.ports).sort((left, right) => left - right),
      collision_preflight_digest: runEvidence.isolation.collision_preflight_digest,
    },
    runtime,
    canaries: runEvidence.canaries,
    network: runEvidence.network,
    cleanup: {
      completed: runEvidence.cleanup.completed,
      owned_resource_ids: runEvidence.cleanup.owned_resource_ids,
      removed_resource_ids: runEvidence.cleanup.removed_resource_ids,
      residue_resource_ids: runEvidence.cleanup.residue_resource_ids,
      cleanup_errors: runEvidence.cleanup.cleanup_errors,
    },
    production_guard: {
      surface_allowlist_version: runEvidence.production_guard.surface_allowlist_version,
      production_snapshot_pre_digest: runEvidence.production_guard.production_snapshot_pre_digest,
      production_snapshot_post_digest: runEvidence.production_guard.production_snapshot_post_digest,
      equal: runEvidence.production_guard.equal,
      mutation_attempt_count: runEvidence.production_guard.mutation_attempt_count,
      production_db_connection_count: runEvidence.production_guard.production_db_connection_count,
      production_db_write_count: runEvidence.production_guard.production_db_write_count,
    },
    environment_snapshot: {
      source_allowlist_id: candidateManifest.environment_snapshot.source_allowlist_id,
      opaque_source_identity_digest: candidateManifest.environment_snapshot.opaque_source_identity_digest,
      override_policy_digest: candidateManifest.environment_snapshot.opaque_override_digest,
      exposed_value_count: candidateManifest.environment_snapshot.exposed_value_count,
    },
    threat_controls: {
      symlink_toctou: runEvidence.threat_controls.symlink_toctou,
      namespace_collision: runEvidence.threat_controls.namespace_collision,
      digest_substitution: runEvidence.threat_controls.digest_substitution,
      stale_receipt: "pass",
      cleanup_ownership: runEvidence.threat_controls.cleanup_ownership,
    },
    issuer_task_id: assertString(issuerTaskId, "issuer_task_id"),
  }, { now });
}

export function parseAndValidateRunReceipt(source, options) {
  let parsed;
  try {
    parsed = parseCanonicalJcs(source);
  } catch (error) {
    if (/duplicate/iu.test(error instanceof Error ? error.message : "")) throw error;
    throw new Error("Rehearsal receipt rejected: input is not canonical RFC8785 JCS.");
  }
  return validateRunReceipt(parsed, options);
}

function normalizedCanarySet(receipt) {
  return receipt.canaries.map(({ canary_id, exit_code, normalized_result_digest }) => ({ canary_id, exit_code, normalized_result_digest }));
}

function memberProjection(receipt) {
  return {
    receipt,
    digest: receipt.receipt_digest,
    runId: receipt.run_id,
    resourceDigest: receipt.isolation.resource_identity_digest,
    toolchainDigest: sha256Jcs(receipt.toolchain),
    imageSetDigest: sha256Jcs(receipt.images),
    migrationDigest: receipt.migration.applied_global_ledger_digest,
    canarySetDigest: sha256Jcs(normalizedCanarySet(receipt)),
    cleanupDigest: sha256Jcs(receipt.cleanup),
    productionGuardDigest: sha256Jcs(receipt.production_guard),
  };
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateMemberPair(memberReceipts, { now = null, requireFresh = false } = {}) {
  if (!Array.isArray(memberReceipts) || memberReceipts.length !== 2) fail("exactly two member receipts are required");
  const members = memberReceipts.map((receipt) => validateRunReceipt(receipt, { now: now ?? new Date() })).map(memberProjection).sort((left, right) => compareCodeUnits(left.digest, right.digest));
  if (members[0].digest === members[1].digest) fail("member receipt digests must be distinct");
  if (members[0].runId === members[1].runId) fail("member run IDs must be distinct");
  if (members[0].resourceDigest === members[1].resourceDigest) fail("member resource identities must be distinct");
  for (const [field, label] of [
    ["root_identity_digest", "root identities"],
    ["docker_project_id", "Docker projects"],
    ["db_identity", "database identities"],
  ]) {
    if (members[0].receipt.isolation[field] === members[1].receipt.isolation[field]) {
      fail(`member ${label} must be distinct`);
    }
  }
  const leftResourceIds = new Set([
    ...members[0].receipt.isolation.network_ids,
    ...members[0].receipt.isolation.container_ids,
    ...members[0].receipt.isolation.volume_ids,
  ]);
  const rightResourceIds = [
    ...members[1].receipt.isolation.network_ids,
    ...members[1].receipt.isolation.container_ids,
    ...members[1].receipt.isolation.volume_ids,
  ];
  if (rightResourceIds.some((entry) => leftResourceIds.has(entry))) {
    fail("member full resource ID sets must not overlap across resource kinds");
  }
  for (const [field, label] of [
    ["network_ids", "network IDs"],
    ["container_ids", "container IDs"],
    ["volume_ids", "volume IDs"],
    ["ports", "ports"],
  ]) {
    const left = new Set(members[0].receipt.isolation[field]);
    if (members[1].receipt.isolation[field].some((entry) => left.has(entry))) {
      fail(`member ${label} must not overlap`);
    }
  }
  for (const key of ["repository", "source_ref", "release_sha", "release_tree", "build_id", "sealed_bundle_digest", "bundle_manifest_digest"]) if (members[0].receipt[key] !== members[1].receipt[key]) fail(`member ${key} values must match`);
  for (const [key, label] of [["toolchainDigest", "toolchain"], ["imageSetDigest", "image"], ["migrationDigest", "migration"], ["canarySetDigest", "canary"]]) if (members[0][key] !== members[1][key]) fail(`member ${label} evidence must match`);
  const completionTimes = members.map((member) => timestampMilliseconds(member.receipt.completed_at, "member completed_at"));
  if (Math.max(...completionTimes) - Math.min(...completionTimes) > 24 * 60 * 60 * 1000) {
    fail("member completion interval must be <= 24 hours");
  }
  if (requireFresh) {
    const nowMilliseconds = now instanceof Date ? now.getTime() : Number.NaN;
    if (!Number.isFinite(nowMilliseconds)) fail("member freshness validation requires a valid current instant");
    for (const completion of completionTimes) {
      if (nowMilliseconds >= completion + 24 * 60 * 60 * 1000) fail("member receipt is stale or expired");
    }
  }
  return members;
}

function addHours(timestamp, hours) {
  return new Date(Date.parse(timestamp) + hours * 60 * 60 * 1000).toISOString();
}

export function buildRepeatabilityReceipt({ memberReceipts, issuerTaskId, now = new Date() }) {
  const members = validateMemberPair(memberReceipts, { now, requireFresh: true });
  const memberCompletedAt = members.map((member) => member.receipt.completed_at).sort();
  const completedAt = memberCompletedAt.at(-1);
  const unsigned = {
    schema: REPEATABILITY_RECEIPT_SCHEMA,
    canonicalization: CANONICALIZATION,
    repository: REPOSITORY,
    source_ref: SOURCE_REF,
    release_sha: members[0].receipt.release_sha,
    release_tree: members[0].receipt.release_tree,
    build_id: members[0].receipt.build_id,
    sealed_bundle_digest: members[0].receipt.sealed_bundle_digest,
    member_receipt_digests: members.map((member) => member.digest),
    member_run_ids: members.map((member) => member.runId),
    member_resource_identity_digests: members.map((member) => member.resourceDigest),
    toolchain_digest: members[0].toolchainDigest,
    image_set_digest: members[0].imageSetDigest,
    migration_ledger_digest: members[0].migrationDigest,
    canary_set_digest: members[0].canarySetDigest,
    cleanup_evidence_digests: members.map((member) => member.cleanupDigest),
    production_guard_digests: members.map((member) => member.productionGuardDigest),
    completed_at: completedAt,
    valid_until: addHours(memberCompletedAt[0], 24),
    status: "repeatable",
    issuer_task_id: assertString(issuerTaskId, "issuer_task_id"),
  };
  return Object.freeze({ ...unsigned, repeatability_receipt_digest: sha256Jcs(unsigned) });
}

function comparable(value) {
  return sha256Jcs(value);
}

export function validateRepeatabilityReceipt(value, { memberReceipts, now = new Date() } = {}) {
  const receipt = assertObject(value, "repeatability receipt", [...REPEAT_UNSIGNED_KEYS, "repeatability_receipt_digest"]);
  const { repeatability_receipt_digest: digest, ...unsigned } = receipt;
  if (sha256Jcs(unsigned) !== digest) fail("repeatability receipt digest mismatch");
  validateMemberPair(memberReceipts, { now, requireFresh: true });
  const expected = buildRepeatabilityReceipt({ memberReceipts, issuerTaskId: receipt.issuer_task_id, now });
  for (const key of REPEAT_UNSIGNED_KEYS) if (comparable(receipt[key]) !== comparable(expected[key])) fail(`member alignment or ${key} mismatch`);
  const validUntil = timestampMilliseconds(receipt.valid_until, "valid_until");
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) fail("repeatability validation requires a valid current instant");
  if (now.getTime() >= validUntil) fail("repeatability receipt is expired at valid_until");
  return receipt;
}

export function parseAndValidateRepeatabilityReceipt(source, options) {
  let parsed;
  try {
    parsed = parseCanonicalJcs(source);
  } catch (error) {
    if (/duplicate/iu.test(error instanceof Error ? error.message : "")) throw error;
    throw new Error("Rehearsal receipt rejected: input is not canonical RFC8785 JCS.");
  }
  return validateRepeatabilityReceipt(parsed, options);
}

/** @param {{memberSources: Array<string | Buffer>, repeatabilitySource: string | Buffer, now?: Date}} options */
export function verifyRehearsalReceiptBundleAuthority({
  memberSources,
  repeatabilitySource,
  now = new Date(),
} = {}) {
  if (!Array.isArray(memberSources) || memberSources.length !== 2) {
    fail("production authority requires exactly two canonical member receipt sources");
  }
  const memberReceipts = memberSources.map((source) => parseAndValidateRunReceipt(source, { now }));
  const repeatability = parseAndValidateRepeatabilityReceipt(repeatabilitySource, {
    memberReceipts,
    now,
  });
  return Object.freeze({
    rehearsal_receipt_schema: repeatability.schema,
    release_sha: repeatability.release_sha,
    release_tree: repeatability.release_tree,
    build_id: repeatability.build_id,
    sealed_bundle_digest: repeatability.sealed_bundle_digest,
    repeatability_receipt_digest: repeatability.repeatability_receipt_digest,
    rehearsal_receipt_valid_until: repeatability.valid_until,
  });
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.uid === right.uid
    && (left.mode & 0o7777n) === (right.mode & 0o7777n) && left.size === right.size
    && left.ctimeNs === right.ctimeNs && left.mtimeNs === right.mtimeNs;
}

function sameDirectoryIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.uid === right.uid
    && left.gid === right.gid && (left.mode & 0o7777n) === (right.mode & 0o7777n);
}

function assertPrivateArtifactRoot(path, { repoRoot, expectedUid }) {
  if (!isAbsolute(path) || resolve(path) !== path) throw new Error("Artifact root must be an absolute canonical lexical path.");
  const before = lstatSync(path, { bigint: true });
  if (!before.isDirectory() || before.isSymbolicLink()) throw new Error("Artifact root must be a canonical directory.");
  if ((before.mode & 0o777n) !== 0o700n) throw new Error("Artifact root must use exact private mode 0700.");
  if (before.uid !== BigInt(expectedUid)) throw new Error("Artifact root owner does not match the current owner.");
  if (realpathSync(path) !== path) throw new Error("Artifact root path must be canonical.");
  const canonicalRepo = realpathSync(resolve(repoRoot));
  const repoRelative = relative(canonicalRepo, path);
  if (repoRelative === "" || (!repoRelative.startsWith("..") && !isAbsolute(repoRelative))) {
    throw new Error("Artifact root must remain outside the repository boundary.");
  }
  return before;
}

/**
 * @param {{receipt: any, receiptRoot: string, repoRoot: string, expectedUid?: number, memberReceipts?: any[], now?: Date}} options
 */
export function writeCanonicalReceiptCreateOnly({
  receipt,
  receiptRoot,
  repoRoot,
  expectedUid = process.getuid?.(),
  memberReceipts,
  now = new Date(),
} = {}) {
  if (!Number.isSafeInteger(expectedUid) || expectedUid < 0) throw new Error("Artifact owner identity is unavailable.");
  let normalized;
  let basename;
  if (receipt?.schema === RUN_RECEIPT_SCHEMA) {
    normalized = validateRunReceipt(receipt, { now });
    if (!/^[A-Za-z0-9._-]+$/u.test(normalized.run_id)) fail("run_id cannot form a canonical receipt filename");
    basename = `${normalized.run_id}.run-receipt.json`;
  } else if (receipt?.schema === REPEATABILITY_RECEIPT_SCHEMA) {
    normalized = validateRepeatabilityReceipt(receipt, { memberReceipts, now });
    basename = `${receipt.repeatability_receipt_digest}.repeatability-receipt.json`;
  } else {
    fail("receipt schema is not recognized for create-only issuance");
  }
  const rootBefore = assertPrivateArtifactRoot(receiptRoot, { repoRoot, expectedUid });
  const rootFd = openSync(receiptRoot, FS_CONSTANTS.O_RDONLY | FS_CONSTANTS.O_DIRECTORY | (FS_CONSTANTS.O_NOFOLLOW ?? 0));
  let descriptor;
  const destination = resolve(receiptRoot, basename);
  try {
    if (!sameDirectoryIdentity(rootBefore, fstatSync(rootFd, { bigint: true }))) throw new Error("Artifact root identity changed before create-only issuance.");
    try {
      descriptor = openSync(
        destination,
        FS_CONSTANTS.O_WRONLY | FS_CONSTANTS.O_CREAT | FS_CONSTANTS.O_EXCL | (FS_CONSTANTS.O_NOFOLLOW ?? 0),
        0o600,
      );
    } catch (error) {
      if (error && typeof error === "object" && error.code === "EEXIST") {
        throw new Error("Duplicate receipt ID already exists; create-only issuance rejected.");
      }
      throw error;
    }
    fchmodSync(descriptor, 0o600);
    const bytes = Buffer.from(canonicalizeForReceipt(normalized), "utf8");
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    const opened = fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || opened.uid !== BigInt(expectedUid) || opened.nlink !== 1n
      || (opened.mode & 0o777n) !== 0o600n || opened.size !== BigInt(bytes.length)) {
      throw new Error("Create-only receipt file identity or private mode is invalid.");
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    closeSync(rootFd);
  }
  const rootAfter = lstatSync(receiptRoot, { bigint: true });
  if (!sameDirectoryIdentity(rootBefore, rootAfter)) throw new Error("Artifact root identity changed during create-only issuance.");
  return destination;
}

function canonicalizeForReceipt(value) {
  if (value.schema !== RUN_RECEIPT_SCHEMA && value.schema !== REPEATABILITY_RECEIPT_SCHEMA) {
    fail("receipt schema is not recognized");
  }
  return canonicalizeJcs(value);
}

/**
 * @param {string} path
 * @param {{repoRoot: string, expectedUid?: number, afterOpen?: null | (() => void)}} options
 */
export function readPrivateCanonicalJsonFile(path, {
  repoRoot,
  expectedUid = process.getuid?.(),
  afterOpen = null,
}) {
  if (!isAbsolute(path)) throw new Error("Artifact path must be absolute.");
  const parent = dirname(path);
  const parentStats = lstatSync(parent, { bigint: true });
  if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) throw new Error("Artifact parent must be a canonical directory.");
  if ((parentStats.mode & 0o777n) !== 0o700n) throw new Error("Artifact parent must use exact private mode 0700.");
  if (parentStats.uid !== BigInt(expectedUid)) throw new Error("Artifact parent owner does not match the current owner.");
  if (realpathSync(parent) !== parent) throw new Error("Artifact parent path must be canonical.");

  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()) throw new Error("Artifact must be a regular non-symlink file.");
  if ((before.mode & 0o777n) !== 0o600n) throw new Error("Artifact must use exact private mode 0600.");
  if (before.uid !== BigInt(expectedUid)) throw new Error("Artifact owner does not match the current owner.");
  if (before.nlink !== 1n) throw new Error("Artifact hard-link aliases are forbidden.");
  const canonicalPath = realpathSync(path);
  if (canonicalPath !== path) throw new Error("Artifact path must be canonical and non-symlinked.");
  const canonicalRepo = realpathSync(resolve(repoRoot));
  const repoRelative = relative(canonicalRepo, canonicalPath);
  if (repoRelative === "" || (!repoRelative.startsWith("..") && !isAbsolute(repoRelative))) throw new Error("Artifact must remain outside the repository boundary.");

  const parentDescriptor = openSync(parent, FS_CONSTANTS.O_RDONLY | FS_CONSTANTS.O_DIRECTORY | (FS_CONSTANTS.O_NOFOLLOW ?? 0));
  if (!sameIdentity(parentStats, fstatSync(parentDescriptor, { bigint: true }))) {
    closeSync(parentDescriptor);
    throw new Error("Artifact parent identity changed before read.");
  }
  let descriptor;
  try {
    descriptor = openSync(path, FS_CONSTANTS.O_RDONLY | (FS_CONSTANTS.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor, { bigint: true });
    if (!sameIdentity(before, opened)) throw new Error("Artifact identity changed before read.");
    afterOpen?.();
    if (opened.size > 4n * 1024n * 1024n) throw new Error("Artifact exceeds the maximum receipt size.");
    const bytes = readFileSync(descriptor);
    let source;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("Artifact contains invalid UTF-8 bytes.");
    }
    if (!Buffer.from(source, "utf8").equals(bytes)) throw new Error("Artifact UTF-8 bytes do not round-trip exactly.");
    const openedAfter = fstatSync(descriptor, { bigint: true });
    const after = lstatSync(path, { bigint: true });
    const parentAfter = lstatSync(parent, { bigint: true });
    const parentOpenedAfter = fstatSync(parentDescriptor, { bigint: true });
    if (!sameIdentity(opened, openedAfter) || !sameIdentity(opened, after)) throw new Error("Artifact identity changed during read.");
    if (!sameIdentity(parentStats, parentOpenedAfter) || !sameIdentity(parentStats, parentAfter)) {
      throw new Error("Artifact parent identity or private mode changed during read.");
    }
    return source;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    closeSync(parentDescriptor);
  }
}

export function readCanonicalReceiptFile(path, options) {
  const source = readPrivateCanonicalJsonFile(path, options);
  try {
    const parsed = parseCanonicalJcs(source);
    if (parsed.schema === RUN_RECEIPT_SCHEMA) return validateRunReceipt(parsed, options);
    if (parsed.schema === REPEATABILITY_RECEIPT_SCHEMA) return validateRepeatabilityReceipt(parsed, options);
    fail("receipt schema is not recognized");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/duplicate/iu.test(message)) throw new Error("Receipt verification failed: duplicate JSON key rejected.");
    throw new Error("Receipt verification failed: canonical receipt is invalid.");
  }
}
