import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  realpathSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

import { afterEach, describe, expect, it, vi } from "vitest";

import { canonicalizeJcs, sha256Jcs } from "../scripts/lib/rfc8785-jcs.mjs";
import * as receiptAuthority from "../scripts/lib/local-mac-production-rehearsal-receipts.mjs";
import * as productionRelease from "../scripts/lib/local-mac-production-promotion-authority.mjs";
import { buildRunNamespace } from "../scripts/lib/local-mac-production-rehearsal-runner.mjs";
import {
  buildRepeatabilityReceipt,
  buildRunReceipt,
  parseAndValidateRepeatabilityReceipt,
  parseAndValidateRunReceipt,
  readCanonicalReceiptFile,
  readPrivateCanonicalJsonFile,
  validateRunReceipt,
} from "../scripts/lib/local-mac-production-rehearsal-receipts.mjs";

const temporaryDirectories: string[] = [];
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const RELEASE_SHA = "1".repeat(40);
const RELEASE_TREE = "2".repeat(40);
const NOW = new Date("2026-08-29T10:30:00.000Z");
const RUN_IDS = {
  1: "11111111-1111-4111-8111-111111111111",
  2: "22222222-2222-4222-8222-222222222222",
} as const;

function buildTestRunReceipt(input: Record<string, unknown>) {
  return buildRunReceipt(input, { now: NOW });
}

function tempDirectory(prefix: string) {
  const path = mkdtempSync(join(tmpdir(), prefix));
  const canonicalPath = realpathSync(path);
  temporaryDirectories.push(canonicalPath);
  chmodSync(path, 0o700);
  return canonicalPath;
}

function toolIdentity(name: string) {
  return {
    version: `${name}-1.0.0`,
    realpath: `/opt/homecook/tools/${name}`,
    device: 1,
    inode: name.length + 10,
    mode: 0o755,
    ctime: "2026-08-29T08:00:00.000Z",
    size: 4096,
    sha256: SHA_A,
  };
}

function runtimeIdentity(component: string, index = 1) {
  return {
    kind: component === "supervisor" ? "process" : "container",
    pid: component === "supervisor" ? component.length + 100 : null,
    process_group_id: null,
    container_ids: component === "supervisor" ? [] : [`${component}-container-${index}`],
    reported_release_sha: RELEASE_SHA,
    reported_release_tree: RELEASE_TREE,
    reported_build_id: "build-001",
    reported_sealed_bundle_digest: SHA_B,
    reported_migration_head: "20260829000100_release",
  };
}

function runInput(index: 1 | 2, overrides: Record<string, unknown> = {}) {
  const issuedHour = String(index + 7).padStart(2, "0");
  const completedHour = String(index + 8).padStart(2, "0");
  const runId = RUN_IDS[index];
  const compact = runId.replaceAll("-", "").slice(0, 16);
  const dbIdentity = { name: `hc_r2_${compact}`, user: `hc_r2_user_${compact}` };
  const appId = `app-container-${index}`;
  const workerId = `worker-container-${index}`;
  const sentinelId = `egress-sentinel-container-${index}`;
  const fullLocalIds = FULL_LOCAL_SERVICES.map((service) => `full-local-${service}-container-${index}`).sort();
  const containerIds = [appId, ...fullLocalIds, workerId, sentinelId].sort();
  const containerRoles = [
    { container_id: appId, role: "runtime", component: "app", service: null },
    ...FULL_LOCAL_SERVICES.map((service) => ({ container_id: `full-local-${service}-container-${index}`, role: "runtime", component: "full_local", service })),
    { container_id: workerId, role: "runtime", component: "worker", service: null },
    { container_id: sentinelId, role: "auxiliary", component: "egress_sentinel", service: null },
  ].sort((left, right) => left.container_id.localeCompare(right.container_id));
  return {
    schema: "homecook.local-mac-production-rehearsal-run-receipt.v1",
    canonicalization: "RFC8785-JCS+SHA256",
    repository: "netsus/homecook",
    source_ref: "refs/heads/master",
    release_sha: RELEASE_SHA,
    release_tree: RELEASE_TREE,
    ci_head_sha: RELEASE_SHA,
    ci_check_summary_digest: SHA_A,
    build_id: "build-001",
    sealed_bundle_digest: SHA_B,
    bundle_manifest_digest: SHA_C,
    run_id: runId,
    issued_at: `2026-08-29T${issuedHour}:00:00.000Z`,
    completed_at: `2026-08-29T${completedHour}:00:00.000Z`,
    toolchain: {
      node: toolIdentity("node"),
      pnpm: toolIdentity("pnpm"),
      supabase_cli: toolIdentity("supabase"),
      git: toolIdentity("git"),
      docker_client: toolIdentity("docker-client"),
      docker_daemon: toolIdentity("docker-daemon"),
      candidate_builder: toolIdentity("candidate-builder"),
      rehearsal_runner: toolIdentity("rehearsal-runner"),
    },
    images: [{
      digest: `sha256:${SHA_A}`,
      platform: "linux/arm64",
      local_cache_provenance_digest: SHA_C,
    }],
    migration: {
      ordered_migration_files_digest: SHA_A,
      applied_global_ledger_digest: SHA_B,
      migration_head: "20260829000100_release",
      catalog_head: "20260829000100_release",
      schema_identity_digest: SHA_C,
    },
    fixtures: {
      fixture_set_id: "synthetic-release-v1",
      fixture_set_digest: SHA_A,
      production_derived_row_count: 0,
    },
    isolation: {
      resource_identity_digest: index === 1 ? SHA_A : SHA_C,
      root_identity_digest: index === 1 ? SHA_C : SHA_A,
      docker_project_id: `homecook-rehearsal-${runId}`,
      network_ids: [`network-${index}`],
      container_ids: containerIds,
      container_roles: containerRoles,
      volume_ids: [`volume-${index}`],
      db_identity: { ...dbIdentity, identity_digest: sha256Jcs(dbIdentity) },
      ports: [46_000 + index, 47_000 + index, 48_000 + index, 49_000 + index],
      collision_preflight_digest: SHA_B,
    },
    runtime: {
      app: { ...runtimeIdentity("app", index), container_ids: [appId] },
      full_local: { ...runtimeIdentity("full_local", index), container_ids: fullLocalIds },
      worker: { ...runtimeIdentity("worker", index), container_ids: [workerId] },
      foreground_supervisor: runtimeIdentity("supervisor", index),
    },
    canaries: [{
      canary_id: "identity",
      started_at: `2026-08-29T${issuedHour}:10:00.000Z`,
      completed_at: `2026-08-29T${issuedHour}:11:00.000Z`,
      exit_code: 0,
      normalized_result_digest: SHA_A,
    }],
    network: {
      default_deny_policy_digest: SHA_A,
      allowed_endpoints: ["loopback:app", "unix:docker"],
      denied_attempt_count: 1,
      unexpected_successful_egress_count: 0,
    },
    cleanup: {
      completed: true,
      owned_resource_ids: [...containerIds, `network-${index}`, `volume-${index}`].sort(),
      removed_resource_ids: [...containerIds, `network-${index}`, `volume-${index}`].sort(),
      residue_resource_ids: [],
      cleanup_errors: [],
    },
    production_guard: {
      surface_allowlist_version: "production-surface-v1",
      production_snapshot_pre_digest: SHA_A,
      production_snapshot_post_digest: SHA_A,
      equal: true,
      mutation_attempt_count: 0,
      production_db_connection_count: 0,
      production_db_write_count: 0,
    },
    environment_snapshot: {
      source_allowlist_id: "release-env-v1",
      opaque_source_identity_digest: SHA_A,
      override_policy_digest: SHA_B,
      exposed_value_count: 0,
    },
    threat_controls: {
      symlink_toctou: "pass",
      namespace_collision: "pass",
      digest_substitution: "pass",
      stale_receipt: "pass",
      cleanup_ownership: "pass",
    },
    issuer_task_id: "019ff-rehearsal-author",
    ...overrides,
  };
}

function strictNamespaceRunInput(index: 1 | 2, overrides: Record<string, unknown> = {}) {
  const base = runInput(index);
  const runId = RUN_IDS[index];
  const compact = runId.replaceAll("-", "").slice(0, 16);
  const dbIdentity = {
    name: `hc_r2_${compact}`,
    user: `hc_r2_user_${compact}`,
  };
  return {
    ...base,
    run_id: runId,
    isolation: {
      ...base.isolation,
      docker_project_id: `homecook-rehearsal-${runId}`,
      db_identity: { ...dbIdentity, identity_digest: sha256Jcs(dbIdentity) },
      ports: [46_000 + index, 47_000 + index, 48_000 + index, 49_000 + index],
    },
    ...overrides,
  };
}

const FULL_LOCAL_SERVICES = ["api-gateway", "auth", "auth-proxy", "postgres", "postgrest", "postgrest-probe", "storage"] as const;

function actualRunnerShapedInput(index: 1 | 2, overrides: Record<string, unknown> = {}) {
  const base = runInput(index);
  const appId = `app-container-${index}`;
  const workerId = `worker-container-${index}`;
  const sentinelId = `egress-sentinel-container-${index}`;
  const fullLocalIds = FULL_LOCAL_SERVICES.map((service) => `full-local-${service}-container-${index}`).sort();
  const containerRoles = [
    { container_id: appId, role: "runtime", component: "app", service: null },
    ...FULL_LOCAL_SERVICES.map((service) => ({ container_id: `full-local-${service}-container-${index}`, role: "runtime", component: "full_local", service })),
    { container_id: workerId, role: "runtime", component: "worker", service: null },
    { container_id: sentinelId, role: "auxiliary", component: "egress_sentinel", service: null },
  ].sort((left, right) => left.container_id.localeCompare(right.container_id));
  const containerIds = [appId, ...fullLocalIds, workerId, sentinelId].sort();
  const cleanupIds = [...containerIds, ...base.isolation.network_ids, ...base.isolation.volume_ids].sort();
  return {
    ...base,
    isolation: {
      ...base.isolation,
      container_ids: containerIds,
      container_roles: containerRoles,
    },
    runtime: {
      ...base.runtime,
      app: { ...base.runtime.app, container_ids: [appId] },
      full_local: { ...base.runtime.full_local, container_ids: fullLocalIds },
      worker: { ...base.runtime.worker, container_ids: [workerId] },
    },
    cleanup: {
      ...base.cleanup,
      owned_resource_ids: cleanupIds,
      removed_resource_ids: cleanupIds,
    },
    ...overrides,
  };
}

function redigestRepeatability(receipt: Record<string, unknown>) {
  const unsigned = { ...receipt };
  delete unsigned.repeatability_receipt_digest;
  return {
    ...unsigned,
    repeatability_receipt_digest: sha256Jcs(unsigned),
  };
}

function redigestRun(receipt: Record<string, unknown>) {
  const unsigned = { ...receipt };
  delete unsigned.receipt_digest;
  return { ...unsigned, receipt_digest: sha256Jcs(unsigned) };
}

function candidateAuthority() {
  const base = runInput(1);
  const orderedMigrationFilesDigest = sha256Jcs([{
    path: `supabase/migrations/${base.migration.migration_head}.sql`,
    sha256: SHA_A,
  }]);
  return {
    repository: base.repository,
    source_ref: base.source_ref,
    release_sha: base.release_sha,
    release_tree: base.release_tree,
    ci_check_summary_digest: base.ci_check_summary_digest,
    build_id: base.build_id,
    sealed_bundle_digest: base.sealed_bundle_digest,
    bundle_manifest_digest: base.bundle_manifest_digest,
    candidate_identity_digest: SHA_C,
    toolchain: {
      ...base.toolchain,
      gh: toolIdentity("gh"),
      launchctl: toolIdentity("launchctl"),
      lsof: toolIdentity("lsof"),
      audit_log: toolIdentity("audit-log"),
      sandbox_exec: toolIdentity("sandbox-exec"),
    },
    images: base.images.map((image, index) => ({
      service: `service-${index}`,
      reference: `example.invalid/service-${index}@${image.digest}`,
      image_id: image.digest,
      ...image,
    })),
    migration: {
      ordered_migration_files: ["supabase/migrations/20260829000100_release.sql"],
      ordered_migration_files_digest: orderedMigrationFilesDigest,
      migration_head: base.migration.migration_head,
    },
    environment_snapshot: {
      source_allowlist_id: base.environment_snapshot.source_allowlist_id,
      opaque_source_identity_digest: base.environment_snapshot.opaque_source_identity_digest,
      opaque_override_digest: base.environment_snapshot.override_policy_digest,
      exposed_value_count: 0,
    },
  };
}

function runEvidenceAuthority(index: 1 | 2) {
  const base = runInput(index);
  const namespace = buildRunNamespace({
    runId: RUN_IDS[index],
    ports: { app: 46_000 + index, auth: 47_000 + index, postgres: 48_000 + index, storage: 49_000 + index },
  });
  const globalLedgerEntries = [{ sequence: 1, migration_id: base.migration.migration_head, migration_sha256: SHA_A }];
  const allContainerIds = base.isolation.container_ids;
  const orderedMigrationFilesDigest = sha256Jcs([{
    path: `supabase/migrations/${base.migration.migration_head}.sql`,
    sha256: SHA_A,
  }]);
  const ownedResourceIds = [
    ...allContainerIds,
    ...base.isolation.network_ids,
    ...base.isolation.volume_ids,
  ].sort();
  const resourceIdentityDigest = sha256Jcs({
    project: base.isolation.docker_project_id,
    container_names: namespace.container_names,
    network_names: namespace.network_names,
    volume_names: namespace.volume_names,
    owned_resource_ids: ownedResourceIds,
  });
  const productionMeasurement = {
    schema: "homecook.release-rehearsal-production-isolation-telemetry.v1",
    production_db_connection_count: 0,
    production_db_write_count: 0,
    mutation_attempt_count: 0,
    forbidden_mount_count: 0,
    forbidden_environment_count: 0,
    observed_container_count: allContainerIds.length,
    container_policy_digest: SHA_A,
    command_policy_digest: SHA_B,
    network_policy_digest: SHA_C,
    external_attempt_count: 1,
    successful_egress_count: 0,
    docker_endpoint_identity_digest: SHA_A,
    docker_daemon_identity_digest: SHA_B,
  };
  const independentObserver = {
    schema: "homecook.r2-production-observer.v1",
    source_identity_digest: SHA_A,
    started_at: base.issued_at,
    completed_at: base.completed_at,
    pre_snapshot_digest: SHA_A,
    post_snapshot_digest: SHA_A,
    process_binding_digest: SHA_B,
    docker_daemon_identity_digest: SHA_B,
    observation_digest: SHA_A,
    available: true,
    truncated: false,
    production_db_connection_count: 0,
    production_db_write_count: 0,
    production_credential_access_count: 0,
    production_socket_access_count: 0,
    provider_remote_access_count: 0,
    production_mutation_count: 0,
    unrelated_noise_count: 0,
    registered_subjects: base.isolation.container_roles.filter((entry) => entry.role === "runtime").map((entry, subjectIndex) => ({
      container_id: entry.container_id,
      host_pid: subjectIndex + 1,
      host_pgid: subjectIndex + 1,
      component: entry.component,
      started_at: base.issued_at,
      image_digest: SHA_A,
      config_digest: SHA_B,
      executable_identity_digest: SHA_C,
    })),
  };
  const runtime = (component: "app" | "full_local" | "worker") => ({
    component,
    kind: "container",
    pid: null,
    process_group_id: null,
    container_ids: base.runtime[component].container_ids,
    release_sha: base.release_sha,
    release_tree: base.release_tree,
    build_id: base.build_id,
    sealed_bundle_digest: base.sealed_bundle_digest,
    migration_head: base.migration.migration_head,
    ready: true,
    exit_code: null,
  });
  const unsigned = {
    schema: "homecook.local-mac-production-rehearsal-run-evidence.v1",
    canonicalization: "RFC8785-JCS+SHA256",
    status: "passed",
    trusted_receipt: false,
    candidate_identity_digest: SHA_C,
    release_sha: base.release_sha,
    release_tree: base.release_tree,
    build_id: base.build_id,
    sealed_bundle_digest: base.sealed_bundle_digest,
    bundle_manifest_digest: base.bundle_manifest_digest,
    run_id: RUN_IDS[index],
    issued_at: base.issued_at,
    completed_at: base.completed_at,
    rehearsal_runner: base.toolchain.rehearsal_runner,
    isolation: {
      resource_identity_digest: resourceIdentityDigest,
      root_identity_digest: base.isolation.root_identity_digest,
      execution_root_identity_digest: SHA_B,
      docker_project_id: base.isolation.docker_project_id,
      network_names: namespace.network_names,
      container_names: namespace.container_names,
      volume_names: namespace.volume_names,
      network_ids: base.isolation.network_ids,
      container_ids: allContainerIds,
      container_roles: base.isolation.container_roles,
      volume_ids: base.isolation.volume_ids,
      db_identity: base.isolation.db_identity,
      ports: namespace.ports,
      collision_preflight_digest: base.isolation.collision_preflight_digest,
    },
    migration: {
      ...base.migration,
      ordered_migration_files_digest: orderedMigrationFilesDigest,
      applied_global_ledger_digest: sha256Jcs(globalLedgerEntries),
      global_ledger_entries: globalLedgerEntries,
      ordered_global_ledger: [base.migration.migration_head],
    },
    fixtures: base.fixtures,
    runtime: {
      app: runtime("app"),
      full_local: runtime("full_local"),
      worker: {
        ...runtime("worker"),
        worker_rehearsal_rpc_config_digest: SHA_A,
        worker_rehearsal_rpc_config_identity_digest: SHA_B,
      },
      foreground_supervisor: {
        component: "foreground_supervisor",
        pid: 40000 + index,
        process_group_id: null,
        child_process_groups_enforced: true,
        launchd_used: false,
        child_identity_digest: SHA_A,
        timeout_policy_digest: SHA_B,
      },
    },
    canaries: [
      "app-production-route",
      "cross-component-identity",
      "external-network-deny",
      "full-local-api-gateway-route",
      "full-local-auth-route",
      "full-local-postgrest-fixture",
      "full-local-storage-route",
      "worker-synthetic-job",
    ].map((canary_id, canaryIndex) => ({
      canary_id,
      started_at: base.issued_at,
      completed_at: base.completed_at,
      exit_code: 0,
      normalized_result_digest: String(canaryIndex + 1).repeat(64).slice(0, 64),
    })),
    network: base.network,
    cleanup: {
      ...base.cleanup,
      owned_resource_ids: ownedResourceIds,
      removed_resource_ids: ownedResourceIds,
      secret_bearing_persistent_file_count: 0,
    },
    worker_rehearsal_rpc_authority: {
      config_digest: SHA_A,
      config_file_identity_digest: SHA_B,
      token_reference_digest: SHA_C,
      lifecycle_version: "v1",
      fixture_identity_digest: SHA_A,
    },
    production_guard: {
      ...base.production_guard,
      measurement: productionMeasurement,
      measurement_digest: sha256Jcs(productionMeasurement),
      independent_observer: independentObserver,
    },
    threat_controls: {
      symlink_toctou: "pass",
      namespace_collision: "pass",
      digest_substitution: "pass",
      stale_candidate: "pass",
      cleanup_ownership: "pass",
    },
  };
  return { ...unsigned, evidence_digest: sha256Jcs(unsigned) };
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

describe("rehearsal run receipt", () => {
  it("accepts actual runner-shaped runtime containers plus one closed auxiliary sentinel ledger", () => {
    expect(() => buildTestRunReceipt(actualRunnerShapedInput(1))).not.toThrow();
  });

  it("rejects missing, extra, substituted, or cross-role auxiliary container authority", () => {
    const valid = actualRunnerShapedInput(1);
    const roles = valid.isolation.container_roles;
    const sentinel = roles.find((entry) => entry.component === "egress_sentinel")!;
    const app = roles.find((entry) => entry.component === "app")!;
    const attacks = [
      { isolation: { ...valid.isolation, container_roles: roles.filter((entry) => entry !== sentinel) } },
      { isolation: { ...valid.isolation, container_roles: [...roles, { container_id: "extra-container", role: "auxiliary", component: "egress_sentinel", service: null }].sort((left, right) => left.container_id.localeCompare(right.container_id)) } },
      { isolation: { ...valid.isolation, container_roles: roles.map((entry) => entry === sentinel ? { ...entry, container_id: app.container_id } : entry) } },
      { isolation: { ...valid.isolation, container_roles: roles.map((entry) => entry === app ? { ...entry, role: "auxiliary", component: "egress_sentinel" } : entry) } },
      { cleanup: { ...valid.cleanup, removed_resource_ids: valid.cleanup.removed_resource_ids.filter((entry) => entry !== sentinel.container_id) } },
    ];
    for (const attack of attacks) {
      expect(() => buildTestRunReceipt({ ...valid, ...attack }))
        .toThrow(/container|role|runtime|auxiliary|sentinel|cleanup|resource/iu);
    }
  });

  it("accepts only exact component kinds, UUID-derived namespaces, and safe unique high ports", () => {
    expect(() => buildTestRunReceipt(strictNamespaceRunInput(1))).not.toThrow();
    const valid = strictNamespaceRunInput(1);
    const attacks = [
      { runtime: { ...valid.runtime, app: { ...valid.runtime.app, kind: "process", pid: 42, container_ids: [] } } },
      { runtime: { ...valid.runtime, full_local: { ...valid.runtime.full_local, container_ids: [] } } },
      { isolation: { ...valid.isolation, docker_project_id: "p" } },
      { isolation: { ...valid.isolation, db_identity: { ...valid.isolation.db_identity, name: "db" } } },
      { isolation: { ...valid.isolation, db_identity: { ...valid.isolation.db_identity, user: "user" } } },
      { isolation: { ...valid.isolation, ports: [3000, 47_001, 48_001, 49_001] } },
      { isolation: { ...valid.isolation, ports: [46_001, 47_001, 54_321, 49_001] } },
      { isolation: { ...valid.isolation, ports: [46_001, 46_001, 48_001, 49_001] } },
    ];
    for (const attack of attacks) {
      expect(() => buildTestRunReceipt({ ...valid, ...attack }))
        .toThrow(/runtime|component|container|namespace|project|database|identity|port|reserved|unique/iu);
    }
  });

  it("rejects cross-member namespace substitution even when run and receipt digests are recomputed", () => {
    const first = buildTestRunReceipt(strictNamespaceRunInput(1));
    const secondInput = strictNamespaceRunInput(2);
    expect(() => {
      const substituted = buildTestRunReceipt({
        ...secondInput,
        isolation: {
          ...secondInput.isolation,
          docker_project_id: first.isolation.docker_project_id,
          db_identity: first.isolation.db_identity,
        },
      });
      return buildRepeatabilityReceipt({ memberReceipts: [first, substituted], issuerTaskId: "task", now: NOW });
    })
      .toThrow(/namespace|project|database|run.?id|derived/iu);
  });

  it("rejects non-UUID runs and any runtime, isolation, or cleanup resource substitution", () => {
    expect(() => buildTestRunReceipt(runInput(1))).not.toThrow();
    expect(() => buildTestRunReceipt(runInput(1, {
      run_id: "not-a-random-run-id",
    }))).toThrow(/run.?id|UUID|random/iu);
    expect(() => buildTestRunReceipt(runInput(1, {
      runtime: {
        ...runInput(1).runtime,
        worker: { ...runInput(1).runtime.worker, container_ids: ["substituted-container"] },
      },
    }))).toThrow(/runtime|container|isolation/iu);
    expect(() => buildTestRunReceipt(runInput(1, {
      cleanup: {
        ...runInput(1).cleanup,
        owned_resource_ids: [...runInput(1).cleanup.owned_resource_ids, "extra-resource"].sort(),
        removed_resource_ids: [...runInput(1).cleanup.removed_resource_ids, "extra-resource"].sort(),
      },
    }))).toThrow(/typed|cleanup|resource/iu);
    expect(() => buildTestRunReceipt(runInput(1, {
      isolation: {
        ...runInput(1).isolation,
        network_ids: [runInput(1).isolation.volume_ids[0]],
      },
    }))).toThrow(/typed|unique|resource/iu);
    expect(() => buildTestRunReceipt(runInput(1, {
      isolation: {
        ...runInput(1).isolation,
        container_ids: [...runInput(1).isolation.container_ids].reverse(),
      },
    }))).toThrow(/ascending|order|container/iu);
  });

  it("derives the trusted run receipt only from cross-bound candidate and passed run evidence", () => {
    expect(typeof receiptAuthority.buildRunReceiptFromEvidenceAuthority).toBe("function");
    const receipt = receiptAuthority.buildRunReceiptFromEvidenceAuthority({
      candidateManifest: candidateAuthority(),
      runEvidence: runEvidenceAuthority(1),
      issuerTaskId: "019ff-rehearsal-author",
      now: NOW,
    });

    expect(receipt).toMatchObject({
      schema: "homecook.local-mac-production-rehearsal-run-receipt.v1",
      run_id: RUN_IDS[1],
      receipt_digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
    expect(receipt.toolchain.rehearsal_runner).toEqual(runInput(1).toolchain.rehearsal_runner);
    expect(receipt.isolation).toMatchObject({
      network_ids: ["network-1"],
      container_ids: runInput(1).isolation.container_ids,
      container_roles: runInput(1).isolation.container_roles,
      volume_ids: ["volume-1"],
    });
  });

  it("writes one canonical private receipt per run ID and rejects duplicate issuance", () => {
    expect(typeof receiptAuthority.writeCanonicalReceiptCreateOnly).toBe("function");
    const receiptRoot = tempDirectory("homecook-trusted-receipts-");
    const repoRoot = tempDirectory("homecook-receipt-repo-");
    const receipt = buildTestRunReceipt(runInput(1));
    const first = receiptAuthority.writeCanonicalReceiptCreateOnly({
      receipt,
      receiptRoot,
      repoRoot,
      expectedUid: process.getuid!(),
    });

    expect(first).toBe(join(receiptRoot, `${receipt.run_id}.run-receipt.json`));
    expect(readCanonicalReceiptFile(first, { repoRoot, expectedUid: process.getuid!(), now: NOW }))
      .toEqual(receipt);
    expect(() => receiptAuthority.writeCanonicalReceiptCreateOnly({
      receipt,
      receiptRoot,
      repoRoot,
      expectedUid: process.getuid!(),
    })).toThrow(/duplicate|exists|create-only|run.?id/iu);
  });

  it("builds and parses an exact canonical self-digested receipt", () => {
    const receipt = buildTestRunReceipt(runInput(1));
    const parsed = parseAndValidateRunReceipt(canonicalizeJcs(receipt), { now: NOW });

    expect(parsed).toEqual(receipt);
    expect(receipt.receipt_digest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("rejects missing, unknown, duplicate, noncanonical, and altered digest input", () => {
    const receipt = buildTestRunReceipt(runInput(1));
    const canonical = canonicalizeJcs(receipt);
    const missing = { ...receipt } as Record<string, unknown>;
    delete missing.repository;
    const unknown = { ...receipt, secret: "must-not-appear" };
    const altered = { ...receipt, issuer_task_id: "altered-task" };
    const duplicate = canonical.replace(
      "{",
      `{"schema":"${receipt.schema}",`,
    );

    expect(() => parseAndValidateRunReceipt(canonicalizeJcs(missing))).toThrow(/missing|required|repository/iu);
    expect(() => parseAndValidateRunReceipt(canonicalizeJcs(unknown))).toThrow(/unknown|secret/iu);
    expect(() => parseAndValidateRunReceipt(duplicate)).toThrow(/duplicate/iu);
    expect(() => parseAndValidateRunReceipt(`${canonical}\n`)).toThrow(/canonical/iu);
    expect(() => parseAndValidateRunReceipt(canonicalizeJcs(altered))).toThrow(/digest/iu);
  });

  it("fails closed on unsafe cleanup, production mutation, secret exposure, and identity drift", () => {
    const cases = [
      runInput(1, { cleanup: { ...runInput(1).cleanup, residue_resource_ids: ["leftover"] } }),
      runInput(1, { production_guard: { ...runInput(1).production_guard, mutation_attempt_count: 1 } }),
      runInput(1, { environment_snapshot: { ...runInput(1).environment_snapshot, exposed_value_count: 1 } }),
      runInput(1, { ci_head_sha: "f".repeat(40) }),
      runInput(1, { runtime: { ...runInput(1).runtime, worker: { ...runtimeIdentity("worker"), reported_build_id: "wrong" } } }),
    ];

    for (const input of cases) {
      expect(() => buildTestRunReceipt(input)).toThrow(/cleanup|residue|mutation|exposed|identity|release|build/iu);
    }
  });

  it("preserves wide tool device and inode identities as exact decimal strings", () => {
    const base = runInput(1);
    const input = {
      ...base,
      toolchain: {
        ...base.toolchain,
        node: {
          ...base.toolchain.node,
          device: "16777229",
          inode: "1152921500311885470",
        },
      },
    };

    expect(buildTestRunReceipt(input).toolchain.node.inode).toBe("1152921500311885470");
  });
});

describe("repeatability receipt", () => {
  it("aligns two distinct members by digest and enforces exact 24-hour expiry", () => {
    const members = [buildTestRunReceipt(runInput(2)), buildTestRunReceipt(runInput(1))];
    const receipt = buildRepeatabilityReceipt({
      memberReceipts: members,
      issuerTaskId: "019ff-rehearsal-author",
      now: NOW,
    });
    const parsed = parseAndValidateRepeatabilityReceipt(canonicalizeJcs(receipt), {
      memberReceipts: members,
      now: NOW,
    });

    expect(parsed.member_receipt_digests).toEqual([...parsed.member_receipt_digests].sort());
    expect(parsed.valid_until).toBe("2026-08-30T09:00:00.000Z");
    expect(parsed.status).toBe("repeatable");
  });

  it("projects one closed production authority from canonical member and repeatability sources", () => {
    expect(typeof receiptAuthority.verifyRehearsalReceiptBundleAuthority).toBe("function");
    const members = [buildTestRunReceipt(runInput(1)), buildTestRunReceipt(runInput(2))];
    const repeatability = buildRepeatabilityReceipt({ memberReceipts: members, issuerTaskId: "task", now: NOW });

    expect(receiptAuthority.verifyRehearsalReceiptBundleAuthority({
      memberSources: members.map((member) => canonicalizeJcs(member)),
      repeatabilitySource: canonicalizeJcs(repeatability),
      now: NOW,
    })).toEqual({
      rehearsal_receipt_schema: repeatability.schema,
      release_sha: repeatability.release_sha,
      release_tree: repeatability.release_tree,
      build_id: repeatability.build_id,
      sealed_bundle_digest: repeatability.sealed_bundle_digest,
      repeatability_receipt_digest: repeatability.repeatability_receipt_digest,
      rehearsal_receipt_valid_until: repeatability.valid_until,
    });
  });

  it("rejects expired, extended, misaligned, and self-corrupted repeatability receipts", () => {
    const members = [buildTestRunReceipt(runInput(1)), buildTestRunReceipt(runInput(2))];
    const valid = buildRepeatabilityReceipt({ memberReceipts: members, issuerTaskId: "task", now: NOW });
    const expiredNow = new Date("2026-08-30T09:00:00.000Z");
    const extended = redigestRepeatability({
      ...valid,
      valid_until: "2026-08-30T09:00:00.001Z",
    });
    const misaligned = redigestRepeatability({
      ...valid,
      member_run_ids: [...valid.member_run_ids].reverse(),
    });

    expect(() => parseAndValidateRepeatabilityReceipt(canonicalizeJcs(valid), { memberReceipts: members, now: expiredNow })).toThrow(/expired|valid_until/iu);
    expect(() => parseAndValidateRepeatabilityReceipt(canonicalizeJcs(extended), { memberReceipts: members, now: NOW })).toThrow(/24|valid_until/iu);
    expect(() => parseAndValidateRepeatabilityReceipt(canonicalizeJcs(misaligned), { memberReceipts: members, now: NOW })).toThrow(/align|member|order/iu);
    expect(() => parseAndValidateRepeatabilityReceipt(canonicalizeJcs({ ...valid, status: "altered" }), { memberReceipts: members, now: NOW })).toThrow(/digest|status/iu);
  });

  it("rejects identical run/resource IDs and bundle/tool/image/migration/canary mismatch", () => {
    const first = buildTestRunReceipt(runInput(1));
    const mutations = [
      { run_id: first.run_id },
      { isolation: { ...runInput(2).isolation, resource_identity_digest: first.isolation.resource_identity_digest } },
      { isolation: { ...runInput(2).isolation, root_identity_digest: first.isolation.root_identity_digest } },
      { isolation: { ...runInput(2).isolation, docker_project_id: first.isolation.docker_project_id } },
      { isolation: { ...runInput(2).isolation, db_identity: first.isolation.db_identity } },
      { isolation: { ...runInput(2).isolation, ports: first.isolation.ports } },
      { isolation: { ...runInput(2).isolation, network_ids: first.isolation.network_ids } },
      { isolation: { ...runInput(2).isolation, container_ids: first.isolation.container_ids } },
      { isolation: { ...runInput(2).isolation, volume_ids: first.isolation.volume_ids } },
      {
        isolation: { ...runInput(2).isolation, network_ids: first.isolation.volume_ids },
        cleanup: {
          ...runInput(2).cleanup,
          owned_resource_ids: runInput(2).cleanup.owned_resource_ids
            .map((id) => id === "network-2" ? first.isolation.volume_ids[0] : id).sort(),
          removed_resource_ids: runInput(2).cleanup.removed_resource_ids
            .map((id) => id === "network-2" ? first.isolation.volume_ids[0] : id).sort(),
        },
      },
      {
        sealed_bundle_digest: "d".repeat(64),
        runtime: Object.fromEntries(
          Object.entries(runInput(2).runtime).map(([key, value]) => [
            key,
            { ...value, reported_sealed_bundle_digest: "d".repeat(64) },
          ]),
        ),
      },
      { toolchain: { ...runInput(2).toolchain, node: toolIdentity("node-other") } },
      { images: [{ ...runInput(2).images[0], digest: `sha256:${"d".repeat(64)}` }] },
      { migration: { ...runInput(2).migration, applied_global_ledger_digest: "d".repeat(64) } },
      { canaries: [{ ...runInput(2).canaries[0], normalized_result_digest: "d".repeat(64) }] },
    ];

    for (const override of mutations) {
      expect(() => {
        const second = buildTestRunReceipt(runInput(2, override));
        return buildRepeatabilityReceipt({ memberReceipts: [first, second], issuerTaskId: "task", now: NOW });
      })
        .toThrow(/run|resource|root|docker|database|port|network|container|volume|bundle|toolchain|image|migration|canary|distinct|overlap|match/iu);
    }
  });
});

describe("receipt schemas and artifact path boundary", () => {
  it("keeps JSON schemas closed and in agreement with runtime validators", () => {
    const require = createRequire(import.meta.url);
    const eslintPackage = require.resolve("@eslint/eslintrc/package.json");
    const Ajv = require(require.resolve("ajv", { paths: [eslintPackage] }));
    const runSchema = JSON.parse(readFileSync("scripts/schemas/local-mac-production-rehearsal-run-receipt.schema.json", "utf8"));
    const repeatSchema = JSON.parse(readFileSync("scripts/schemas/local-mac-production-rehearsal-repeatability-receipt.schema.json", "utf8"));
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validateRun = ajv.compile(runSchema);
    const validateRepeat = ajv.compile(repeatSchema);
    const members = [buildTestRunReceipt(runInput(1)), buildTestRunReceipt(runInput(2))];
    const repeat = buildRepeatabilityReceipt({ memberReceipts: members, issuerTaskId: "task", now: NOW });

    expect(validateRun(members[0]), JSON.stringify(validateRun.errors)).toBe(true);
    expect(validateRepeat(repeat), JSON.stringify(validateRepeat.errors)).toBe(true);
    expect(validateRun({ ...members[0], unknown: true })).toBe(false);
    expect(validateRepeat({ ...repeat, member_run_ids: [repeat.member_run_ids[0]] })).toBe(false);
  });

  it("rejects the same receipt attack table in runtime and JSON Schema", () => {
    const require = createRequire(import.meta.url);
    const eslintPackage = require.resolve("@eslint/eslintrc/package.json");
    const Ajv = require(require.resolve("ajv", { paths: [eslintPackage] }));
    const schema = JSON.parse(readFileSync("scripts/schemas/local-mac-production-rehearsal-run-receipt.schema.json", "utf8"));
    const ajv = new Ajv({ allErrors: true, strict: false });
    ajv.addFormat("date-time", (value: string) => {
      const milliseconds = Date.parse(value);
      return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
    });
    const validateSchema = ajv.compile(schema);
    const valid = buildTestRunReceipt(runInput(1));
    const attacks = [
      redigestRun({ ...valid, isolation: { ...valid.isolation, ports: [70_000] } }),
      redigestRun({ ...valid, isolation: { ...valid.isolation, docker_project_id: "p" } }),
      redigestRun({ ...valid, isolation: { ...valid.isolation, db_identity: { ...valid.isolation.db_identity, name: "db" } } }),
      redigestRun({ ...valid, isolation: { ...valid.isolation, ports: [3000, 47_001, 48_001, 49_001] } }),
      redigestRun({ ...valid, isolation: { ...valid.isolation, ports: [46_001, 47_001, 54_321, 49_001] } }),
      redigestRun({ ...valid, isolation: { ...valid.isolation, ports: [46_001, 46_001, 48_001, 49_001] } }),
      redigestRun({ ...valid, runtime: { ...valid.runtime, app: { ...valid.runtime.app, kind: "process", pid: 42, container_ids: [] } } }),
      redigestRun({ ...valid, runtime: { ...valid.runtime, full_local: { ...valid.runtime.full_local, container_ids: [] } } }),
      redigestRun({ ...valid, toolchain: { ...valid.toolchain, node: { ...valid.toolchain.node, mode: "0755" } } }),
      redigestRun({ ...valid, runtime: { ...valid.runtime, app: { ...valid.runtime.app, unexpected: true } } }),
      redigestRun({ ...valid, images: [{ ...valid.images[0], local_cache_provenance_digest: "bad" }] }),
      redigestRun({ ...valid, issued_at: "2026-02-30T08:00:00.000Z" }),
      redigestRun({ ...valid, toolchain: { ...valid.toolchain, node: { ...valid.toolchain.node, mode: Number.MAX_SAFE_INTEGER + 1 } } }),
      redigestRun({ ...valid, toolchain: { ...valid.toolchain, node: { ...valid.toolchain.node, mode: 0o777 } } }),
    ];

    for (const attack of attacks) {
      let runtimeAccepted = true;
      try {
        validateRunReceipt(attack);
      } catch {
        runtimeAccepted = false;
      }
      const schemaAccepted = validateSchema(attack);
      expect({ runtimeAccepted, schemaAccepted }, JSON.stringify(attack)).toEqual({
        runtimeAccepted: false,
        schemaAccepted: false,
      });
    }
  });

  it("accepts only absolute, canonical, private, current-owner, outside-repository regular files", () => {
    const artifactRoot = tempDirectory("homecook-receipt-");
    const repoRoot = tempDirectory("homecook-repo-");
    const receipt = buildTestRunReceipt(runInput(1));
    const receiptPath = join(artifactRoot, "receipt.json");
    writeFileSync(receiptPath, canonicalizeJcs(receipt), { mode: 0o600 });

    expect(readCanonicalReceiptFile(receiptPath, { repoRoot, expectedUid: process.getuid!(), now: NOW }).receipt_digest)
      .toBe(receipt.receipt_digest);
    expect(() => readCanonicalReceiptFile("relative.json", { repoRoot, expectedUid: process.getuid!() })).toThrow(/absolute/iu);
    expect(() => readCanonicalReceiptFile(receiptPath, { repoRoot, expectedUid: process.getuid!() + 1 })).toThrow(/owner/iu);

    chmodSync(receiptPath, 0o644);
    expect(() => readCanonicalReceiptFile(receiptPath, { repoRoot, expectedUid: process.getuid!() })).toThrow(/0600|mode|private/iu);
    chmodSync(receiptPath, 0o600);

    const symlinkPath = join(artifactRoot, "receipt-link.json");
    symlinkSync(receiptPath, symlinkPath);
    expect(() => readCanonicalReceiptFile(symlinkPath, { repoRoot, expectedUid: process.getuid!() })).toThrow(/symlink|regular|canonical/iu);

    const nested = join(repoRoot, "evidence");
    mkdirSync(nested, { mode: 0o700 });
    const insideRepo = join(nested, "receipt.json");
    writeFileSync(insideRepo, canonicalizeJcs(receipt), { mode: 0o600 });
    expect(() => readCanonicalReceiptFile(insideRepo, { repoRoot, expectedUid: process.getuid!() })).toThrow(/repository|outside|escape/iu);
  });

  it("does not include raw secret material in path or parse errors", () => {
    const artifactRoot = tempDirectory("homecook-receipt-secret-");
    const repoRoot = tempDirectory("homecook-repo-secret-");
    const receiptPath = join(artifactRoot, "receipt.json");
    const marker = "TOP_SECRET_PROVIDER_PAYLOAD";
    writeFileSync(receiptPath, `{\"schema\":\"${marker}\"}`, { mode: 0o600 });

    let message = "";
    try {
      readCanonicalReceiptFile(receiptPath, { repoRoot, expectedUid: process.getuid!() });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toContain(marker);
  });

  it("rejects invalid UTF-8 bytes before JSON decoding or canonical hashing", () => {
    const artifactRoot = tempDirectory("homecook-receipt-invalid-utf8-");
    const repoRoot = tempDirectory("homecook-repo-invalid-utf8-");
    const receiptPath = join(artifactRoot, "receipt.json");
    writeFileSync(receiptPath, Buffer.from([0x22, 0xff, 0x22]), { mode: 0o600 });

    expect(() => readPrivateCanonicalJsonFile(receiptPath, {
      repoRoot,
      expectedUid: process.getuid!(),
    })).toThrow(/UTF-8|canonical|invalid/iu);
  });

  it("rejects parent and file identity drift after the no-follow descriptor is opened", () => {
    const artifactRoot = tempDirectory("homecook-receipt-toctou-");
    const repoRoot = tempDirectory("homecook-repo-toctou-");
    const receiptPath = join(artifactRoot, "receipt.json");
    writeFileSync(receiptPath, canonicalizeJcs(buildTestRunReceipt(runInput(1))), { mode: 0o600 });

    expect(() => readPrivateCanonicalJsonFile(receiptPath, {
      repoRoot,
      expectedUid: process.getuid!(),
      afterOpen: () => chmodSync(artifactRoot, 0o755),
    })).toThrow(/parent|identity|mode|changed|TOCTOU/iu);
  });
});

describe("strict receipt time authority", () => {
  it.each([
    "release_manifest",
    "manifest_parser",
    "attestation_bundle",
    "attestation_subject",
    "attestation_trusted_root",
    "remote_tag_readback",
    "member_receipt_1",
    "member_receipt_2",
    "repeatability_receipt",
    "candidate_authority",
    "inventory",
    "classification",
    "component_digest",
    "gate_parser",
  ])("sanitizes the public promotion authority boundary for %s", (attack) => {
    const rawRoot = `/private/tmp/homecook-${attack}`;
    const rawMarker = `RAW_${attack}_ENOENT_EACCES_gh-stderr`;
    const rawError = () => new Error(`${rawMarker} '${rawRoot}/authority.json'`);
    const memberPaths = ["/private/member-1.json", "/private/member-2.json"];
    const repeatabilityPath = "/private/repeatability.json";
    const manifest = {
      release_sha: RELEASE_SHA,
      release_tree: RELEASE_TREE,
      build_id: "build-001",
      sealed_bundle_digest: SHA_B,
      repeatability_receipt_digest: SHA_C,
      rehearsal_receipt_valid_until: "2026-08-30T09:00:00.000Z",
    };
    const verifier = productionRelease.createProductionPromotionAuthorityVerifier({
      candidatePath: "/private/candidate",
      inventoryPath: "/private/inventory.json",
      manifestPath: "/private/manifest.json",
      memberReceiptPaths: memberPaths,
      repeatabilityReceiptPath: repeatabilityPath,
      repoRoot: "/private/repo",
      verifyAttestation: vi.fn(),
      readManifestSource: () => {
        if (attack === "release_manifest") throw rawError();
        if (attack === "manifest_parser") return rawMarker;
        return "{}";
      },
      validateManifest: () => {
        if (["attestation_bundle", "attestation_subject", "attestation_trusted_root", "remote_tag_readback"].includes(attack)) throw rawError();
        return manifest;
      },
      readReceipt: (path: string) => {
        if (attack === "member_receipt_1" && path === memberPaths[0]) throw rawError();
        if (attack === "member_receipt_2" && path === memberPaths[1]) throw rawError();
        if (attack === "repeatability_receipt" && path === repeatabilityPath) throw rawError();
        return { source: path };
      },
      readCandidate: () => {
        if (attack === "candidate_authority") throw rawError();
        return { manifest: {} };
      },
      readInventory: () => {
        if (attack === "inventory") throw rawError();
        return { captured_at: "2026-08-29T10:29:00.000Z" };
      },
      classifyInventory: () => {
        if (attack === "classification") throw rawError();
        return {};
      },
      digestExecutionTree: () => {
        if (attack === "component_digest") throw rawError();
        return SHA_A;
      },
      validateGate: () => {
        if (attack === "gate_parser") throw rawError();
        return { verified: true, authority_digest: SHA_A };
      },
    } as unknown as Parameters<typeof productionRelease.createProductionPromotionAuthorityVerifier>[0]);

    let message = "";
    try {
      verifier({ phase: "pre-adapter", now: NOW });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe(
      "promotion_authority_source_changed: production promotion authority source changed.",
    );
    for (const prohibited of [
      rawRoot,
      rawMarker,
      "authority.json",
      "ENOENT",
      "EACCES",
      "gh-stderr",
      attack,
    ]) expect(message).not.toContain(prohibited);
  });

  it("keeps every invalid promotion authority before the first mutation", () => {
    expect(typeof productionRelease.validateProductionPromotionPreMutationGate).toBe("function");
    const members = [buildTestRunReceipt(runInput(1)), buildTestRunReceipt(runInput(2))];
    const repeatability = buildRepeatabilityReceipt({ memberReceipts: members, issuerTaskId: "task", now: NOW });
    const valid = {
      manifest: {
        release_sha: repeatability.release_sha,
        release_tree: repeatability.release_tree,
        build_id: repeatability.build_id,
        rehearsal_receipt_schema: repeatability.schema,
        sealed_bundle_digest: repeatability.sealed_bundle_digest,
        repeatability_receipt_digest: repeatability.repeatability_receipt_digest,
        rehearsal_receipt_valid_until: repeatability.valid_until,
      },
      repeatabilityReceipt: repeatability,
      memberReceipts: members,
      candidateManifest: {
        release_sha: repeatability.release_sha,
        release_tree: repeatability.release_tree,
        build_id: repeatability.build_id,
        sealed_bundle_digest: repeatability.sealed_bundle_digest,
        candidate_identity_digest: SHA_C,
        bundle_manifest_digest: SHA_B,
      },
      candidateRoot: "/private/sealed-candidate",
      candidateComponentDigests: { app: SHA_A, full_local: SHA_B, worker: SHA_C },
      inventoryCapturedAt: "2026-08-29T10:29:00.000Z",
      classification: (() => {
        const unsigned = {
          schema: "homecook.local-mac-production-rehearsal-classification.v1",
          inventory_digest: SHA_A,
          classified_at: "2026-08-29T10:29:30.000Z",
          states: ["coherent_running"],
          promotion_safe: true,
          mutation_attempt_count: 0,
          findings: [],
          recovery_plan: [],
        };
        return { ...unsigned, classification_digest: sha256Jcs(unsigned) };
      })(),
      now: NOW,
    };
    const stable = productionRelease.validateProductionPromotionPreMutationGate(valid);
    expect(stable).toMatchObject({ verified: true, authority_digest: expect.stringMatching(/^[0-9a-f]{64}$/u) });
    const reclassifiedUnsigned = {
      ...valid.classification,
      classified_at: "2026-08-29T10:29:40.000Z",
    };
    delete (reclassifiedUnsigned as { classification_digest?: string }).classification_digest;
    const reclassified = {
      ...reclassifiedUnsigned,
      classification_digest: sha256Jcs(reclassifiedUnsigned),
    };
    expect(productionRelease.validateProductionPromotionPreMutationGate({
      ...valid,
      classification: reclassified,
    }).authority_digest).toBe(stable.authority_digest);
    expect(productionRelease.validateProductionPromotionPreMutationGate({
      ...valid,
      candidateManifest: { ...valid.candidateManifest, candidate_identity_digest: "0".repeat(64) },
    }).authority_digest).not.toBe(stable.authority_digest);

    const attacks = [
      { ...valid, repeatabilityReceipt: null },
      { ...valid, now: new Date(repeatability.valid_until) },
      { ...valid, manifest: { ...valid.manifest, sealed_bundle_digest: "0".repeat(64) } },
      { ...valid, candidateManifest: { ...valid.candidateManifest, build_id: "substituted" } },
      { ...valid, inventoryCapturedAt: "2026-08-29T10:31:00.000Z" },
      { ...valid, classification: { ...valid.classification, promotion_safe: false, states: ["mixed_running"], findings: [{ finding_id: "mixed" }] } },
    ];
    for (const attack of attacks) {
      const mutation = vi.fn();
      expect(() => {
        productionRelease.validateProductionPromotionPreMutationGate(attack);
        mutation();
      }).toThrow(/receipt|expired|bundle|candidate|future|classification|mixed|promotion|authority/iu);
      expect(mutation).toHaveBeenCalledTimes(0);
    }
  });

  it("rejects calendar-invalid RFC3339 instants instead of Date.parse normalization", () => {
    expect(() => buildRunReceipt(runInput(1, {
      issued_at: "2026-02-30T08:00:00.000Z",
    }), { now: NOW })).toThrow(/RFC3339|instant|calendar|issued_at/iu);
  });

  it("expires authority when now equals valid_until", () => {
    const members = [buildTestRunReceipt(runInput(1)), buildTestRunReceipt(runInput(2))];
    const repeatability = buildRepeatabilityReceipt({
      memberReceipts: members,
      issuerTaskId: "task",
      now: new Date("2026-08-29T10:30:00.000Z"),
    });

    expect(() => parseAndValidateRepeatabilityReceipt(canonicalizeJcs(repeatability), {
      memberReceipts: members,
      now: new Date(repeatability.valid_until),
    })).toThrow(/expired|valid_until/iu);
  });

  it("rejects stale members and binds authority to the earlier member expiry", () => {
    const stale = buildRunReceipt(runInput(1, {
      issued_at: "2020-01-01T08:00:00.000Z",
      completed_at: "2020-01-01T09:00:00.000Z",
    }), { now: NOW });
    const current = buildTestRunReceipt(runInput(2));

    expect(() => buildRepeatabilityReceipt({
      memberReceipts: [stale, current],
      issuerTaskId: "task",
      now: NOW,
    })).toThrow(/member|stale|fresh|24|interval|expired/iu);

    const valid = buildRepeatabilityReceipt({
      memberReceipts: [buildTestRunReceipt(runInput(1)), current],
      issuerTaskId: "task",
      now: NOW,
    });
    expect(valid.valid_until).toBe("2026-08-30T09:00:00.000Z");
  });

  it("rejects future run and repeatability authority at build and validation time", () => {
    const futureNow = new Date("2030-01-01T12:00:00.000Z");
    const futureRuns = [1, 2].map((index) => {
      const issuedHour = String(index + 7).padStart(2, "0");
      const completedHour = String(index + 8).padStart(2, "0");
      return buildRunReceipt(runInput(index as 1 | 2, {
      issued_at: `2030-01-01T${issuedHour}:00:00.000Z`,
      completed_at: `2030-01-01T${completedHour}:00:00.000Z`,
      canaries: [{
        ...runInput(index as 1 | 2).canaries[0],
        started_at: `2030-01-01T${issuedHour}:10:00.000Z`,
        completed_at: `2030-01-01T${issuedHour}:11:00.000Z`,
      }],
      }), { now: futureNow });
    });

    expect(() => buildRunReceipt(runInput(1, {
      issued_at: "2099-01-01T08:00:00.000Z",
      completed_at: "2099-01-01T09:00:00.000Z",
    }), { now: NOW })).toThrow(/future|completed_at|now/iu);
    expect(() => buildRepeatabilityReceipt({ memberReceipts: futureRuns, issuerTaskId: "task", now: NOW }))
      .toThrow(/future|member|completed_at|now/iu);

    const futureRepeatability = buildRepeatabilityReceipt({
      memberReceipts: futureRuns,
      issuerTaskId: "task",
      now: futureNow,
    });
    expect(() => parseAndValidateRepeatabilityReceipt(canonicalizeJcs(futureRepeatability), {
      memberReceipts: futureRuns,
      now: NOW,
    })).toThrow(/future|member|completed_at|now/iu);
  });
});
