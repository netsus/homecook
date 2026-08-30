import { linkSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  RUN_EVIDENCE_SCHEMA,
  RUN_OWNERSHIP_LABEL,
  buildRunNamespace,
  cleanupOwnedResources,
  resolveCompletedCandidateInput,
  runIsolatedReleaseRehearsal,
  validateChildEnvironment,
  validateDockerInvocation,
  validateMigrationReplay,
  validateRunEvidence,
  validateIndependentProductionObserver,
  validateSealedWorkerSyntheticResult,
} from "../scripts/lib/local-mac-production-rehearsal-runner.mjs";
import { runLocalMacProductionRehearsalRunnerCli } from "../scripts/local-mac-production-rehearsal-run.mjs";
import {
  assertDiscoveredResourcesRemainUnowned,
  recordPrimitiveCreateResult,
  compileClosedPrimitivePlan,
  buildFullLocalComposeOverride,
  buildFullLocalRehearsalEnvironment,
  validateContainerImageAuthority,
  normalizeResolvedComposeFixture,
  buildSafeResolvedComposeGoldenFixture,
  buildPsqlVariableArgs,
  parseAndValidateWorkerFixtureReadback,
  compilePrimitiveServiceOperations,
  validatePrimitiveContainerInspection,
} from "../scripts/lib/local-mac-production-rehearsal-runner-adapters.mjs";
import { sha256Jcs } from "../scripts/lib/rfc8785-jcs.mjs";
import { createImmutableCreationLedger } from "../scripts/lib/local-mac-production-rehearsal-runner-safety.mjs";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const RUN_ID = "11111111-2222-4333-8444-555555555555";
const PRIMITIVE_PORTS = { app: 43101, auth: 43102, postgres: 43103, storage: 43104 };
const MIGRATION_FILE_ENTRIES = [
  { path: "supabase/migrations/20260101000000_one.sql", sha256: "1".repeat(64) },
  { path: "supabase/migrations/20260102000000_two.sql", sha256: "2".repeat(64) },
];
const MIGRATION_FILES_DIGEST = sha256Jcs(MIGRATION_FILE_ENTRIES);

function canonicalPrimitiveConfig() {
  const secretName = (...parts: string[]) => parts.join("_");
  const postgresPassword = secretName("postgres", "password");
  const jwtJwks = secretName("jwt", "jwks");
  const secretNames = [
    "anon_key", "anon_key_asymmetric", jwtJwks, "jwt_keys", "jwt_secret",
    postgresPassword, "publishable_key", "secret_key", "service_role_key",
    "service_role_key_asymmetric", "session_attestation_hmac_key_v1",
    "storage_s3_access_key_id", "storage_s3_access_key_secret",
  ];
  const base = (name: string, overrides: Record<string, unknown>) => ({
    command: ["node", `${name}.mjs`],
    environment: {},
    image: `example/${name}@sha256:${"a".repeat(64)}`,
    labels: {},
    logging: { driver: "local", options: { "max-file": "1", "max-size": "1m" } },
    platform: "linux/arm64",
    pull_policy: "never",
    restart: "unless-stopped",
    security_opt: ["no-new-privileges:true"],
    ...overrides,
  });
  const healthcheck = {
    interval: "5s",
    retries: 60,
    test: ["CMD", "node", "-e", "process.exit(0)"],
    timeout: "5s",
  };
  const bind = (target: string) => ({
    read_only: true,
    source: `/private/rehearsal${target}`,
    target,
    type: "bind",
  });
  const services: Record<string, Record<string, unknown>> = {
    postgres: base("postgres", {
      healthcheck,
      networks: { "data-internal": { aliases: ["postgres"] } },
      ports: [{ host_ip: "127.0.0.1", protocol: "tcp", published: String(PRIMITIVE_PORTS.postgres), target: 5432 }],
      secrets: [{ source: postgresPassword, target: postgresPassword }],
      volumes: [
        { source: "r2-postgres", target: "/var/lib/postgresql/data", type: "volume" },
        bind("/homecook/secret-entrypoint.sh"),
        bind("/docker-entrypoint-initdb.d/zz-homecook-role-passwords.sh"),
      ],
    }),
    auth: base("auth", {
      depends_on: { postgres: { condition: "service_healthy" } },
      healthcheck,
      networks: { "data-internal": { aliases: ["auth"] }, "auth-egress": { aliases: ["auth"] } },
      secrets: [postgresPassword, "jwt_secret", "jwt_keys"].map((source) => ({ source, target: source })),
      volumes: [bind("/homecook/secret-entrypoint.sh"), bind("/homecook/start-auth.sh")],
    }),
    postgrest: base("postgrest", {
      depends_on: { auth: { condition: "service_healthy" }, postgres: { condition: "service_healthy" } },
      networks: { "data-internal": { aliases: ["postgrest"] } },
      secrets: [postgresPassword, jwtJwks].map((source) => ({ source, target: source })),
      volumes: [bind("/homecook/secret-entrypoint.sh"), bind("/homecook/start-postgrest.sh")],
    }),
    "postgrest-probe": base("postgrest-probe", {
      depends_on: { postgrest: { condition: "service_started" } },
      healthcheck,
      networks: { "data-internal": { aliases: ["postgrest-probe"] } },
      read_only: true,
      secrets: [],
      volumes: [bind("/sealed-candidate")],
    }),
    storage: base("storage", {
      depends_on: { auth: { condition: "service_healthy" }, "postgrest-probe": { condition: "service_healthy" } },
      healthcheck,
      networks: { "data-internal": { aliases: ["storage"] } },
      secrets: [postgresPassword, "anon_key", "service_role_key", jwtJwks, "jwt_secret", "storage_s3_access_key_id", "storage_s3_access_key_secret"].map((source) => ({ source, target: source })),
      volumes: [
        { source: "r2-storage", target: "/var/lib/storage", type: "volume" },
        bind("/homecook/secret-entrypoint.sh"),
        bind("/homecook/start-storage.sh"),
      ],
    }),
    "api-gateway": base("api-gateway", {
      depends_on: { storage: { condition: "service_healthy" } },
      healthcheck,
      networks: { "auth-edge": { aliases: ["api-gateway"] }, "data-internal": { aliases: ["api-gateway"] } },
      ports: [{ host_ip: "127.0.0.1", protocol: "tcp", published: String(PRIMITIVE_PORTS.storage), target: PRIMITIVE_PORTS.storage }],
      secrets: ["anon_key", "service_role_key", "publishable_key", "secret_key", "anon_key_asymmetric", "service_role_key_asymmetric", "session_attestation_hmac_key_v1"].map((source) => ({ source, target: source })),
      tmpfs: ["/tmp:mode=1777"],
      volumes: [bind("/homecook/secret-entrypoint.sh"), bind("/homecook/kong-entrypoint.sh"), bind("/homecook/kong.yml"), bind("/usr/local/share/lua/5.1/kong/plugins/homecook-attestation")],
    }),
    "auth-proxy": base("auth-proxy", {
      depends_on: { "api-gateway": { condition: "service_healthy" } },
      healthcheck,
      networks: { "auth-edge": { aliases: ["auth-proxy"] } },
      ports: [{ host_ip: "127.0.0.1", protocol: "tcp", published: String(PRIMITIVE_PORTS.auth), target: 8080 }],
      read_only: true,
      secrets: [],
      volumes: [bind("/homecook/auth-only-proxy.mjs")],
    }),
  };
  return {
    name: "ignored",
    networks: { "auth-edge": { internal: true }, "auth-egress": { internal: true }, "data-internal": { internal: true } },
    secrets: Object.fromEntries(secretNames.map((name) => [name, { file: `/private/rehearsal/secrets/${name}` }])),
    services,
    volumes: { "postgres-data": {}, "storage-data": {} },
  };
}

function candidateManifest() {
  return {
    schema: "homecook.local-mac-production-rehearsal-candidate.v1",
    repository: "netsus/homecook",
    source_ref: "refs/heads/master",
    release_sha: SHA_A,
    release_tree: SHA_B,
    build_id: "build-r2",
    sealed_bundle_digest: DIGEST_A,
    bundle_manifest_digest: DIGEST_B,
    candidate_identity_digest: "c".repeat(64),
    manifest_digest: "d".repeat(64),
    images: [{
      digest: `sha256:${"d".repeat(64)}`,
      platform: "linux/arm64",
      local_cache_provenance_digest: "e".repeat(64),
    }],
    migration: {
      ordered_migration_files: [
        "supabase/migrations/20260101000000_one.sql",
        "supabase/migrations/20260102000000_two.sql",
      ],
      ordered_migration_files_digest: MIGRATION_FILES_DIGEST,
      migration_head: "20260102000000_two",
    },
  };
}

function completedCandidate(root: string) {
  return Object.freeze({
    complete: { status: "complete" },
    manifest: candidateManifest(),
    bundle_manifest: { schema: "homecook.local-mac-production-rehearsal-bundle-manifest.v1" },
    root,
  });
}

function productionSnapshot(digest = "9".repeat(64)) {
  return {
    schema: "homecook.local-mac-production-surface-snapshot.v1",
    surface_allowlist_version: "homecook-production-surface-v1",
    surface_digest: digest,
    snapshot_digest: "8".repeat(64),
    production_db_connection_count: 0,
    mutation_attempt_count: 0,
  };
}

function independentObserver() {
  return { schema: "homecook.r2-production-observer.v1", source_identity_digest: "a".repeat(64), started_at: "2026-08-29T00:00:00.000Z", completed_at: "2026-08-29T00:01:00.000Z", pre_snapshot_digest: "9".repeat(64), post_snapshot_digest: "9".repeat(64), process_binding_digest: "c".repeat(64), docker_daemon_identity_digest: "d".repeat(64), observation_digest: "e".repeat(64), available: true, truncated: false, production_db_connection_count: 0, production_db_write_count: 0, production_credential_access_count: 0, production_socket_access_count: 0, provider_remote_access_count: 0, production_mutation_count: 0, unrelated_noise_count: 0, registered_subjects: [{ container_id: "container-app", host_pid: 1, host_pgid: 1, component: "app", started_at: "2026-08-29T00:00:00.000Z", image_digest: "f".repeat(64), config_digest: "a".repeat(64), executable_identity_digest: "b".repeat(64) }] };
}

function migrationReplay(overrides = {}) {
  const globalLedgerEntries = [
    { sequence: 1, migration_id: "20260101000000_one", migration_sha256: "1".repeat(64) },
    { sequence: 2, migration_id: "20260102000000_two", migration_sha256: "2".repeat(64) },
  ];
  return {
    ordered_migration_files_digest: MIGRATION_FILES_DIGEST,
    applied_global_ledger_digest: sha256Jcs(globalLedgerEntries),
    global_ledger_entries: globalLedgerEntries,
    ordered_global_ledger: [
      "20260101000000_one",
      "20260102000000_two",
    ],
    migration_head: "20260102000000_two",
    catalog_head: "20260102000000_two",
    schema_identity_digest: "6".repeat(64),
    ...overrides,
  };
}

function evidenceFixture() {
  const canaryIds = [
    "app-production-route",
    "cross-component-identity",
    "external-network-deny",
    "full-local-api-gateway-route",
    "full-local-auth-route",
    "full-local-postgrest-fixture",
    "full-local-storage-route",
    "worker-synthetic-job",
  ];
  const productionMeasurement = {
    schema: "homecook.release-rehearsal-production-isolation-telemetry.v1",
    production_db_connection_count: 0,
    production_db_write_count: 0,
    mutation_attempt_count: 0,
    forbidden_mount_count: 0,
    forbidden_environment_count: 0,
    observed_container_count: 12,
    container_policy_digest: "a".repeat(64),
    command_policy_digest: "b".repeat(64),
    network_policy_digest: "c".repeat(64),
    external_attempt_count: 1,
    successful_egress_count: 0,
    docker_endpoint_identity_digest: "d".repeat(64),
    docker_daemon_identity_digest: "e".repeat(64),
  };
  const unsigned = {
    schema: RUN_EVIDENCE_SCHEMA,
    canonicalization: "RFC8785-JCS+SHA256",
    status: "passed",
    trusted_receipt: false,
    candidate_identity_digest: "c".repeat(64),
    release_sha: SHA_A,
    release_tree: SHA_B,
    build_id: "build-r2",
    sealed_bundle_digest: DIGEST_A,
    bundle_manifest_digest: DIGEST_B,
    run_id: RUN_ID,
    issued_at: "2026-08-29T00:00:00.000Z",
    completed_at: "2026-08-29T00:01:00.000Z",
    isolation: {
      docker_project_id: `homecook-rehearsal-${RUN_ID}`,
      container_names: ["container-a"],
      network_names: ["network-a"],
      volume_names: ["volume-a"],
      db_identity: { name: "hc_r2_1111111122224333", user: "hc_r2_user_1111111122224333", identity_digest: "1".repeat(64) },
      ports: { app: 43101, auth: 43102, postgres: 43103, storage: 43104 },
      root_identity_digest: "2".repeat(64),
      execution_root_identity_digest: "4".repeat(64),
      resource_identity_digest: sha256Jcs({ project: `homecook-rehearsal-${RUN_ID}`, container_names: ["container-a"], network_names: ["network-a"], volume_names: ["volume-a"], owned_resource_ids: ["container-app", "container-full-local", "container-worker"] }),
    },
    migration: migrationReplay(),
    fixtures: { fixture_set_id: "homecook-r2-synthetic-v1", fixture_set_digest: "5".repeat(64), production_derived_row_count: 0 },
    runtime: {
      app: runtime("app"),
      full_local: runtime("full_local"),
      worker: runtime("worker"),
      foreground_supervisor: {
        component: "foreground_supervisor",
        pid: 41000,
        process_group_id: null,
        child_process_groups_enforced: true,
        launchd_used: false,
        child_identity_digest: "6".repeat(64),
        timeout_policy_digest: "7".repeat(64),
      },
    },
    canaries: canaryIds.map((canary_id, index) => ({ canary_id, exit_code: 0, normalized_result_digest: String(index + 1).repeat(64).slice(0, 64) })),
    network: { default_deny_policy_digest: "8".repeat(64), allowed_endpoints: ["loopback", "run-owned-network"], denied_attempt_count: 1, unexpected_successful_egress_count: 0 },
    cleanup: {
      completed: true,
      owned_resource_ids: ["container-app", "container-full-local", "container-worker"],
      removed_resource_ids: ["container-app", "container-full-local", "container-worker"],
      residue_resource_ids: [],
      cleanup_errors: [],
      secret_bearing_persistent_file_count: 0,
    },
    worker_rehearsal_rpc_authority: { config_digest: "c".repeat(64), config_file_identity_digest: "d".repeat(64), token_reference_digest: "e".repeat(64), lifecycle_version: "v1", fixture_identity_digest: "f".repeat(64) },
    production_guard: {
      surface_allowlist_version: "homecook-production-surface-v1",
      production_snapshot_pre_digest: "9".repeat(64),
      production_snapshot_post_digest: "9".repeat(64),
      equal: true,
      mutation_attempt_count: 0,
      production_db_connection_count: 0,
      production_db_write_count: 0,
      measurement: productionMeasurement,
      measurement_digest: sha256Jcs(productionMeasurement),
      independent_observer: independentObserver(),
    },
    threat_controls: { symlink_toctou: "pass", namespace_collision: "pass", digest_substitution: "pass", stale_candidate: "pass", cleanup_ownership: "pass" },
  };
  return { ...unsigned, evidence_digest: sha256Jcs(unsigned) };
}

function runtime(component: "app" | "full_local" | "worker") {
  return {
    component,
    kind: "container",
    pid: null,
    process_group_id: null,
    container_ids: [component === "full_local" ? "container-full-local" : `container-${component}`],
    release_sha: SHA_A,
    release_tree: SHA_B,
    build_id: "build-r2",
    sealed_bundle_digest: DIGEST_A,
    migration_head: "20260102000000_two",
    ready: true,
    exit_code: null,
    ...(component === "worker" ? { worker_rehearsal_rpc_config_digest: "c".repeat(64), worker_rehearsal_rpc_config_identity_digest: "d".repeat(64) } : {}),
  };
}

function createAdapters() {
  const resources = [
    { kind: "network", id: "network-1", name: `homecook-rehearsal-${RUN_ID}-network` },
    { kind: "volume", id: "volume-1", name: `homecook-rehearsal-${RUN_ID}-postgres` },
    { kind: "container", id: "container-full-local", name: `homecook-rehearsal-${RUN_ID}-full-local` },
    { kind: "container", id: "container-app", name: `homecook-rehearsal-${RUN_ID}-app` },
    { kind: "container", id: "container-worker", name: `homecook-rehearsal-${RUN_ID}-worker` },
  ];
  return {
    snapshotProduction: vi.fn().mockResolvedValue(productionSnapshot()),
    inspectCollisions: vi.fn().mockResolvedValue({ collisions: [] }),
    reservePorts: vi.fn().mockResolvedValue({ app: 43101, auth: 43102, postgres: 43103, storage: 43104 }),
    assertImagesLocal: vi.fn().mockResolvedValue({ verified: true, image_ids: ["image-local"] }),
    createResources: vi.fn().mockResolvedValue(resources),
    applyMigrations: vi.fn().mockResolvedValue(migrationReplay()),
    loadSyntheticFixtures: vi.fn().mockResolvedValue({
      fixture_set_id: "homecook-r2-synthetic-v1",
      fixture_set_digest: "5".repeat(64),
      production_derived_row_count: 0,
    }),
    prepareYoutubeWorkerSyntheticFixture: vi.fn().mockResolvedValue(undefined),
    startComponents: vi.fn().mockResolvedValue([
      runtime("app"), runtime("full_local"), runtime("worker"),
    ]),
    waitForReadiness: vi.fn().mockResolvedValue({ ready: true }),
    runCanaries: vi.fn().mockResolvedValue([
      { canary_id: "app-production-route", exit_code: 0, normalized_result_digest: "1".repeat(64) },
      { canary_id: "cross-component-identity", exit_code: 0, normalized_result_digest: "2".repeat(64) },
      { canary_id: "external-network-deny", exit_code: 0, normalized_result_digest: "3".repeat(64) },
      { canary_id: "full-local-api-gateway-route", exit_code: 0, normalized_result_digest: "4".repeat(64) },
      { canary_id: "full-local-auth-route", exit_code: 0, normalized_result_digest: "5".repeat(64) },
      { canary_id: "full-local-postgrest-fixture", exit_code: 0, normalized_result_digest: "6".repeat(64) },
      { canary_id: "full-local-storage-route", exit_code: 0, normalized_result_digest: "7".repeat(64) },
      { canary_id: "worker-synthetic-job", exit_code: 0, normalized_result_digest: "8".repeat(64) },
    ]),
    readNetworkEvidence: vi.fn().mockResolvedValue({
      default_deny_policy_digest: "0".repeat(64),
      allowed_endpoints: ["loopback", "run-owned-network", "approved-unix-sockets"],
      denied_attempt_count: 1,
      unexpected_successful_egress_count: 0,
    }),
    readIsolationTelemetry: vi.fn().mockResolvedValue({
      schema: "homecook.release-rehearsal-production-isolation-telemetry.v1",
      production_db_connection_count: 0,
      production_db_write_count: 0,
      mutation_attempt_count: 0,
      forbidden_mount_count: 0,
      forbidden_environment_count: 0,
      observed_container_count: 3,
      container_policy_digest: "a".repeat(64),
      command_policy_digest: "b".repeat(64),
      network_policy_digest: "0".repeat(64),
      external_attempt_count: 1,
      successful_egress_count: 0,
      docker_endpoint_identity_digest: "d".repeat(64),
      docker_daemon_identity_digest: "e".repeat(64),
    }),
    independentObserver: { begin: vi.fn().mockResolvedValue(undefined), registerChild: vi.fn().mockResolvedValue(undefined), end: vi.fn().mockResolvedValue(independentObserver()) },
    readWorkerRehearsalRpcAuthority: vi.fn().mockResolvedValue({ config_digest: "c".repeat(64), config_file_identity_digest: "d".repeat(64), token_reference_digest: "e".repeat(64), lifecycle_version: "v1", fixture_identity_digest: "f".repeat(64) }),
    reinspectObserverSubjects: vi.fn().mockResolvedValue(independentObserver().registered_subjects),
    stopRuntime: vi.fn().mockResolvedValue(undefined),
    removeResource: vi.fn().mockResolvedValue(undefined),
    listResidue: vi.fn().mockResolvedValue([]),
    countPersistentSecretFiles: vi.fn().mockResolvedValue(0),
    closeSecretHandles: vi.fn().mockResolvedValue(undefined),
    getCreationLedger: vi.fn().mockReturnValue(resources),
    readVerifiedMigrationInputs: vi.fn().mockReturnValue({
      ordered_migration_files_digest: MIGRATION_FILES_DIGEST,
      entries: MIGRATION_FILE_ENTRIES,
      inputs: [
        { path: "supabase/migrations/20260101000000_one.sql", sha256: "1".repeat(64), bytes: Buffer.from("select 1;\n") },
        { path: "supabase/migrations/20260102000000_two.sql", sha256: "2".repeat(64), bytes: Buffer.from("select 2;\n") },
      ],
    }),
    resources,
  };
}

describe("release rehearsal R2 input and namespace gates", () => {
  it("accepts only an absolute completed candidate root or its exact candidate.json", () => {
    const root = mkdtempSync(join(tmpdir(), "homecook-r2-input-"));
    const manifest = join(root, "candidate.json");
    writeFileSync(manifest, "{}", { mode: 0o400 });
    expect(resolveCompletedCandidateInput(root)).toBe(root);
    expect(resolveCompletedCandidateInput(manifest)).toBe(root);
    expect(() => resolveCompletedCandidateInput("candidate.json")).toThrow(/absolute/iu);
    expect(() => resolveCompletedCandidateInput(join(root, "complete.json"))).toThrow(/candidate\.json|root/iu);
  });

  it("rejects symlink, hardlink-shaped and production path candidates", () => {
    const parent = mkdtempSync(join(tmpdir(), "homecook-r2-input-attack-"));
    const real = join(parent, "real");
    mkdirSync(real, { mode: 0o500 });
    const link = join(parent, "candidate-link");
    symlinkSync(real, link);
    expect(() => resolveCompletedCandidateInput(link)).toThrow(/symlink|realpath/iu);
    const manifest = join(parent, "candidate.json");
    writeFileSync(manifest, "{}", { mode: 0o400 });
    linkSync(manifest, join(parent, "candidate-hardlink.json"));
    expect(() => resolveCompletedCandidateInput(manifest)).toThrow(/hardlink|link count/iu);
    expect(() => resolveCompletedCandidateInput("/Users/example/.homecook/releases/current.json"))
      .toThrow(/production|candidate/iu);
  });

  it("derives every resource from one UUID and rejects reserved prefixes or ports", () => {
    const namespace = buildRunNamespace({ runId: RUN_ID, ports: { app: 43101, auth: 43102, postgres: 43103, storage: 43104 } });
    expect(namespace.project).toContain(RUN_ID);
    expect(namespace.container_names.every((name: string) => name.startsWith("homecook-rehearsal-"))).toBe(true);
    expect(namespace.db_name).not.toMatch(/production|postgres$/iu);
    expect(namespace.db_user).not.toMatch(/postgres|supabase/iu);
    expect(() => buildRunNamespace({ runId: "com.homecook.production", ports: { app: 43101, auth: 43102, postgres: 43103, storage: 43104 } })).toThrow(/run.?id|uuid|reserved/iu);
    expect(() => buildRunNamespace({ runId: RUN_ID, ports: { app: 3100, auth: 43102, postgres: 43103, storage: 43104 } })).toThrow(/reserved|production.*port/iu);
  });
});

describe("release rehearsal R2 command, env, and migration gates", () => {
  it("sorts only explicit safe psql variables", () => {
    expect(buildPsqlVariableArgs({ job_id: "22222222-2222-4222-8222-222222222222", allowed_snapshot: "a".repeat(64) }, new Set(["job_id", "allowed_snapshot"]))).toEqual([`--set=allowed_snapshot=${"a".repeat(64)}`, "--set=job_id=22222222-2222-4222-8222-222222222222"]);
    expect(() => buildPsqlVariableArgs({ unknown: "x" }, new Set())).toThrow(/allowlisted/iu);
    expect(() => buildPsqlVariableArgs({ job_id: "x\n--command=bad" }, new Set(["job_id"]))).toThrow(/unsafe/iu);
  });
  it("accepts exactly one closed worker fixture readback row", () => {
    const expected = { user_id: "22222222-2222-4222-8222-222222222222", job_id: "33333333-3333-4333-8333-333333333333", job_status: "queued", attempt_count: 0, policy_snapshot_digest: "a".repeat(64), computed_policy_snapshot_digest: "a".repeat(64), credential_jti_hash: "b".repeat(64), credential_generation: 1, credential_release_sha: SHA_A, credential_schema_identity: "schema", credential_snapshot_digest: "a".repeat(64), permit_generation: 0 };
    expect(parseAndValidateWorkerFixtureReadback(JSON.stringify(expected), expected)).toMatchObject(expected);
    for (const bad of ["", "{}", `${JSON.stringify(expected)}\n${JSON.stringify(expected)}`, JSON.stringify({ ...expected, job_status: "processing" })]) expect(() => parseAndValidateWorkerFixtureReadback(bad, expected)).toThrow();
  });
  it("rejects self-reported zeroes unless an independent observer binds the exact run window", () => {
    const observer = {
      schema: "homecook.r2-production-observer.v1", source_identity_digest: "a".repeat(64),
      started_at: "2026-08-29T00:00:00.000Z", completed_at: "2026-08-29T00:01:00.000Z",
      pre_snapshot_digest: "b".repeat(64), post_snapshot_digest: "b".repeat(64),
      process_binding_digest: "c".repeat(64), docker_daemon_identity_digest: "d".repeat(64),
      observation_digest: "e".repeat(64), available: true, truncated: false,
      production_db_connection_count: 0, production_db_write_count: 0, production_credential_access_count: 0,
      production_socket_access_count: 0, provider_remote_access_count: 0, production_mutation_count: 0,
      unrelated_noise_count: 3,
      registered_subjects: [{ container_id: "container-app", host_pid: 11, host_pgid: 11, component: "app", started_at: "2026-08-29T00:00:00.000Z", image_digest: "f".repeat(64), config_digest: "1".repeat(64), executable_identity_digest: "2".repeat(64) }],
    };
    expect(validateIndependentProductionObserver(observer)).toEqual(observer);
    for (const field of ["production_db_connection_count", "production_socket_access_count", "provider_remote_access_count", "production_mutation_count"] as const) {
      expect(() => validateIndependentProductionObserver({ ...observer, [field]: 1 })).toThrow(/observer|production|zero/iu);
    }
    expect(() => validateIndependentProductionObserver({ ...observer, available: false })).toThrow(/observer/iu);
    expect(() => validateIndependentProductionObserver({ ...observer, pre_snapshot_digest: "f".repeat(64) })).toThrow(/snapshot|observer/iu);
    expect(() => validateIndependentProductionObserver({ ...observer, registered_subjects: [] })).toThrow(/subject/iu);
    expect(() => validateIndependentProductionObserver({ ...observer, registered_subjects: [observer.registered_subjects[0], observer.registered_subjects[0]] })).toThrow(/duplicated/iu);
  });

  it("accepts only the sealed worker's complete fence lifecycle", () => {
    const result = { schema: "homecook.youtube-extraction-worker-rehearsal-result.v1", status: "succeeded", synthetic: true, provider_requests: 0, rpc_sequence: ["claim_youtube_extraction_job", "claim_youtube_extractor_permit", "start_youtube_extraction_attempt", "heartbeat_youtube_extraction_job", "heartbeat_youtube_extractor_permit", "read_youtube_extraction_worker_catalog", "report_youtube_extraction_progress", "resolve_youtube_extraction_job_draft", "heartbeat_youtube_extraction_job", "heartbeat_youtube_extractor_permit", "finalize_youtube_extraction_job", "release_youtube_extractor_permit"] };
    expect(validateSealedWorkerSyntheticResult(result)).toEqual(result);
    expect(() => validateSealedWorkerSyntheticResult({ ...result, rpc_sequence: result.rpc_sequence.filter((step) => step !== "heartbeat_youtube_extraction_job") })).toThrow(/lifecycle|fence/iu);
    expect(() => validateSealedWorkerSyntheticResult({ ...result, provider_requests: 1 })).toThrow(/provider/iu);
    expect(() => validateSealedWorkerSyntheticResult({ ...result, status: "succeeded", synthetic: false })).toThrow(/synthetic/iu);
  });

  it.each([
    ["pull", ["pull", "postgres:17"]],
    ["build", ["build", "."]],
    ["system prune", ["system", "prune"]],
    ["production stop", ["stop", "homecook-production-app"]],
    ["socket override", ["--host", "unix:///var/run/docker.sock", "ps"]],
  ])("rejects forbidden Docker %s argv", (_label, argv) => {
    expect(() => validateDockerInvocation(argv, { runId: RUN_ID, project: `homecook-rehearsal-${RUN_ID}` }))
      .toThrow(/docker|forbidden|production|socket/iu);
  });

  it("allows only bounded read inventory and exact run-owned mutations", () => {
    const dockerHost = "unix:///private/run/homecook-r2/docker.sock";
    const context = { dockerHost, runId: RUN_ID, project: `homecook-rehearsal-${RUN_ID}` };
    expect(validateDockerInvocation(["--host", dockerHost, "ps", "--no-trunc"], context).mode).toBe("read-only");
    expect(() => validateDockerInvocation(["ps", "--no-trunc"], context)).toThrow(/--host|endpoint/iu);
    expect(validateDockerInvocation([
      "--host", dockerHost,
      "network", "create",
      "--label", `${RUN_OWNERSHIP_LABEL}=${RUN_ID}`,
      "--label", `com.docker.compose.project=${context.project}`,
      `${context.project}-network`,
    ], context).mode).toBe("run-owned-mutation");
  });

  it("requires --pull=never on every exact-ID docker create", () => {
    const dockerHost = "unix:///private/run/homecook-r2/docker.sock";
    const context = { dockerHost, runId: RUN_ID, project: `homecook-rehearsal-${RUN_ID}` };
    const base = [
      "--host", dockerHost,
      "create",
      "--label", `${RUN_OWNERSHIP_LABEL}=${RUN_ID}`,
      "--label", `com.docker.compose.project=${context.project}`,
    ];
    expect(() => validateDockerInvocation([...base, "node@sha256:abc"], context))
      .toThrow(/pull.*never/iu);
    expect(validateDockerInvocation([...base, "--pull=never", "node@sha256:abc"], context).mode)
      .toBe("run-owned-mutation");
  });

  it("constructs a new allowlisted child environment and rejects production credentials", () => {
    const clean = validateChildEnvironment({
      HOME: "/private/r2/home",
      PATH: "/usr/bin:/bin",
      NODE_ENV: "production",
      HOMECOOK_REHEARSAL_RUN_ID: RUN_ID,
      DATABASE_URL: "postgresql://r2_user:opaque@127.0.0.1:43103/r2_db",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:43102",
    }, { runId: RUN_ID, runRoot: "/private/r2" });
    expect(clean.HOMECOOK_REHEARSAL_RUN_ID).toBe(RUN_ID);
    expect(() => validateChildEnvironment({ ...clean, SUPABASE_SERVICE_ROLE_KEY: "secret" }, { runId: RUN_ID, runRoot: "/private/r2" })).toThrow(/credential|forbidden|secret/iu);
    expect(() => validateChildEnvironment({ ...clean, DATABASE_URL: "postgresql://prod:secret@db.internal/prod" }, { runId: RUN_ID, runRoot: "/private/r2" })).toThrow(/loopback|production|database/iu);
    expect(() => validateChildEnvironment({ ...clean, DOCKER_HOST: "unix:///var/run/docker.sock" }, { runId: RUN_ID, runRoot: "/private/r2" })).toThrow(/docker|socket|forbidden/iu);
  });

  it("requires the exact ordered ledger and catalog head", () => {
    expect(validateMigrationReplay(migrationReplay(), candidateManifest().migration).catalog_head)
      .toBe("20260102000000_two");
    expect(() => validateMigrationReplay(migrationReplay({ ordered_global_ledger: ["20260102000000_two"] }), candidateManifest().migration)).toThrow(/ledger|order|missing/iu);
    expect(() => validateMigrationReplay(migrationReplay({ catalog_head: "wrong" }), candidateManifest().migration)).toThrow(/catalog|head|mismatch/iu);
    expect(() => validateMigrationReplay(migrationReplay({ ordered_migration_files_digest: DIGEST_A }), candidateManifest().migration)).toThrow(/migration.*digest|mismatch/iu);
  });
});

describe("release rehearsal R2 orchestration", () => {
  it("runs sealed identities, canaries, exact cleanup, and produces non-receipt evidence", async () => {
    const namespaceRoot = mkdtempSync(join(tmpdir(), "homecook-r2-runs-"));
    const candidateRoot = join(namespaceRoot, "candidate");
    mkdirSync(candidateRoot, { mode: 0o500 });
    const adapters = createAdapters();
    const result = await runIsolatedReleaseRehearsal({
      candidateInput: candidateRoot,
      namespaceRoot,
      runId: RUN_ID,
      readCandidate: () => completedCandidate(candidateRoot),
      adapters,
      now: () => new Date("2026-08-29T00:00:00.000Z"),
    });

    expect(result.schema).toBe(RUN_EVIDENCE_SCHEMA);
    expect(result.trusted_receipt).toBe(false);
    expect(result.status).toBe("passed");
    expect(result.fixtures.production_derived_row_count).toBe(0);
    expect(result.production_guard).toMatchObject({ equal: true, mutation_attempt_count: 0, production_db_connection_count: 0, production_db_write_count: 0 });
    expect(adapters.independentObserver.begin).toHaveBeenCalledBefore(adapters.createResources);
    expect(adapters.independentObserver.end).toHaveBeenCalledBefore(adapters.removeResource);
    expect(result.cleanup).toMatchObject({ completed: true, residue_resource_ids: [], cleanup_errors: [], secret_bearing_persistent_file_count: 0 });
    expect(() => validateRunEvidence(result)).not.toThrow();
    expect(adapters.createResources).toHaveBeenCalledWith(expect.objectContaining({
      candidateRoot: join(namespaceRoot, RUN_ID, "execution-candidate"),
    }));
    expect(adapters.stopRuntime.mock.calls.map(([entry]) => entry.component)).toEqual(["worker", "full_local", "app"]);
    expect(adapters.removeResource.mock.calls.map(([entry]) => entry.id)).toEqual([
      "container-worker", "container-app", "container-full-local", "volume-1", "network-1",
    ]);
  });

  it("cleans only the immutable partial-create ledger after create failure", async () => {
    const namespaceRoot = mkdtempSync(join(tmpdir(), "homecook-r2-partial-create-"));
    const candidateRoot = join(namespaceRoot, "candidate");
    mkdirSync(candidateRoot, { mode: 0o500 });
    const adapters = createAdapters();
    adapters.createResources.mockRejectedValue(new Error("compose partial start"));
    adapters.getCreationLedger.mockReturnValue(adapters.resources.slice(0, 2));
    await expect(runIsolatedReleaseRehearsal({
      candidateInput: candidateRoot,
      namespaceRoot,
      runId: RUN_ID,
      readCandidate: () => completedCandidate(candidateRoot),
      adapters,
    })).rejects.toThrow(/partial start/iu);
    expect(adapters.removeResource.mock.calls.map(([entry]) => entry.id).sort())
      .toEqual(["network-1", "volume-1"]);
  });

  it("reports label-only discovered resources as residue and never adopts or removes them", async () => {
    const namespaceRoot = mkdtempSync(join(tmpdir(), "homecook-r2-label-residue-"));
    const candidateRoot = join(namespaceRoot, "candidate");
    mkdirSync(candidateRoot, { mode: 0o500 });
    const adapters = createAdapters();
    adapters.listResidue.mockResolvedValue([
      { kind: "container", id: "attacker-decoy", name: `homecook-rehearsal-${RUN_ID}-app` },
    ]);
    await expect(runIsolatedReleaseRehearsal({
      candidateInput: candidateRoot,
      namespaceRoot,
      runId: RUN_ID,
      readCandidate: () => completedCandidate(candidateRoot),
      adapters,
    })).rejects.toThrow(/residue|cleanup/iu);
    expect(adapters.removeResource).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: "attacker-decoy" }),
      expect.anything(),
    );
  });

  it.each([
    ["existing resource collision", (adapters: ReturnType<typeof createAdapters>) => adapters.inspectCollisions.mockResolvedValue({ collisions: [{ kind: "network", id: "existing" }] })],
    ["image cache missing", (adapters: ReturnType<typeof createAdapters>) => adapters.assertImagesLocal.mockRejectedValue(new Error("local image missing; pull forbidden"))],
    ["production environment credential", (adapters: ReturnType<typeof createAdapters>) => adapters.startComponents.mockRejectedValue(new Error("production credential rejected"))],
    ["external network success", (adapters: ReturnType<typeof createAdapters>) => adapters.readNetworkEvidence.mockResolvedValue({ default_deny_policy_digest: "0".repeat(64), allowed_endpoints: [], denied_attempt_count: 1, unexpected_successful_egress_count: 1 })],
    ["child identity mismatch", (adapters: ReturnType<typeof createAdapters>) => adapters.startComponents.mockResolvedValue([runtime("app"), runtime("full_local"), { ...runtime("worker"), release_sha: SHA_B }])],
    ["child crash", (adapters: ReturnType<typeof createAdapters>) => adapters.startComponents.mockResolvedValue([runtime("app"), runtime("full_local"), { ...runtime("worker"), exit_code: 1, ready: false }])],
    ["child hang", (adapters: ReturnType<typeof createAdapters>) => adapters.waitForReadiness.mockRejectedValue(new Error("readiness timeout"))],
    ["output overflow", (adapters: ReturnType<typeof createAdapters>) => adapters.startComponents.mockRejectedValue(new Error("bounded output overflow"))],
    ["production drift", (adapters: ReturnType<typeof createAdapters>) => adapters.snapshotProduction.mockResolvedValueOnce(productionSnapshot()).mockResolvedValueOnce(productionSnapshot("7".repeat(64)))],
    ["residue", (adapters: ReturnType<typeof createAdapters>) => adapters.listResidue.mockResolvedValue([{ id: "orphan" }])],
    ["secret persistence", (adapters: ReturnType<typeof createAdapters>) => adapters.countPersistentSecretFiles.mockResolvedValue(1)],
  ])("fails closed on %s but still attempts cleanup", async (_label, arrange) => {
    const namespaceRoot = mkdtempSync(join(tmpdir(), "homecook-r2-fail-"));
    const candidateRoot = join(namespaceRoot, "candidate");
    mkdirSync(candidateRoot, { mode: 0o500 });
    const adapters = createAdapters();
    arrange(adapters);
    await expect(runIsolatedReleaseRehearsal({
      candidateInput: candidateRoot,
      namespaceRoot,
      runId: RUN_ID,
      readCandidate: () => completedCandidate(candidateRoot),
      adapters,
    })).rejects.toThrow();
    expect(adapters.closeSecretHandles).toHaveBeenCalled();
  });

  it("re-reads the sealed candidate after execution and rejects tampering", async () => {
    const namespaceRoot = mkdtempSync(join(tmpdir(), "homecook-r2-stale-"));
    const candidateRoot = join(namespaceRoot, "candidate");
    mkdirSync(candidateRoot, { mode: 0o500 });
    const adapters = createAdapters();
    let reads = 0;
    await expect(runIsolatedReleaseRehearsal({
      candidateInput: candidateRoot,
      namespaceRoot,
      runId: RUN_ID,
      readCandidate: () => {
        reads += 1;
        const value = completedCandidate(candidateRoot);
        if (reads === 3) value.manifest.sealed_bundle_digest = "0".repeat(64);
        return value;
      },
      adapters,
    })).rejects.toThrow(/candidate|sealed|tamper|drift/iu);
    expect(reads).toBeGreaterThanOrEqual(3);
  });

  it("cleans exact run-owned resources when signalled midway", async () => {
    const namespaceRoot = mkdtempSync(join(tmpdir(), "homecook-r2-signal-"));
    const candidateRoot = join(namespaceRoot, "candidate");
    mkdirSync(candidateRoot, { mode: 0o500 });
    const adapters = createAdapters();
    const controller = new AbortController();
    adapters.createResources.mockImplementation(async () => {
      controller.abort("SIGTERM");
      return adapters.resources;
    });
    await expect(runIsolatedReleaseRehearsal({
      candidateInput: candidateRoot,
      namespaceRoot,
      runId: RUN_ID,
      readCandidate: () => completedCandidate(candidateRoot),
      adapters,
      signal: controller.signal,
    })).rejects.toThrow(/SIGTERM|signal|interrupt|abort/iu);
    expect(adapters.removeResource).toHaveBeenCalledTimes(adapters.resources.length);
    expect(adapters.applyMigrations).not.toHaveBeenCalled();
  });

  it("aborts an in-flight readiness wait and immediately enters cleanup", async () => {
    const namespaceRoot = mkdtempSync(join(tmpdir(), "homecook-r2-readiness-signal-"));
    const candidateRoot = join(namespaceRoot, "candidate");
    mkdirSync(candidateRoot, { mode: 0o500 });
    const adapters = createAdapters();
    const controller = new AbortController();
    adapters.waitForReadiness.mockImplementation(async ({ signal }: { signal: AbortSignal }) =>
      new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })));
    const run = runIsolatedReleaseRehearsal({
      candidateInput: candidateRoot,
      namespaceRoot,
      runId: RUN_ID,
      readCandidate: () => completedCandidate(candidateRoot),
      adapters,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(adapters.waitForReadiness).toHaveBeenCalled());
    controller.abort(new Error("SIGTERM readiness"));
    await expect(run).rejects.toThrow(/SIGTERM|readiness/iu);
    expect(adapters.removeResource).toHaveBeenCalledTimes(adapters.resources.length);
    expect(adapters.runCanaries).not.toHaveBeenCalled();
  });
});

describe("release rehearsal R2 cleanup ownership", () => {
  it("records only a single create-returned ID with inspect cross-binding", () => {
    const ledger = createImmutableCreationLedger();
    const expected = { kind: "network", name: "r2-net", labels: { [RUN_OWNERSHIP_LABEL]: RUN_ID } };
    const id = "a".repeat(64);
    expect(recordPrimitiveCreateResult(ledger, expected, `${id}\n`, { kind: "network", id, name: "r2-net", labels: expected.labels })).toEqual({ kind: "network", id, name: "r2-net" });
    for (const output of ["", `${id}\n${id}\n`, "not-an-id\n"]) expect(() => recordPrimitiveCreateResult(createImmutableCreationLedger(), expected, output, { kind: "network", id, name: "r2-net", labels: expected.labels })).toThrow();
    expect(() => recordPrimitiveCreateResult(createImmutableCreationLedger(), expected, `${id}\n`, { kind: "network", id, name: "spoof", labels: expected.labels })).toThrow();
  });
  it("keeps adapter-discovered spoofed resources outside the immutable cleanup ledger", () => {
    const ledger = createImmutableCreationLedger();
    ledger.record({ kind: "network", id: "created-network", name: "expected-network" });
    const attacker = { kind: "network", id: "attacker-network", name: "expected-network" };
    expect(() => assertDiscoveredResourcesRemainUnowned(ledger, [attacker]))
      .toThrow(/discovered.*exact successful-create.*ledger/iu);
    expect(ledger.snapshot()).toEqual([{ kind: "network", id: "created-network", name: "expected-network" }]);
  });

  it("never removes unknown, spoofed-label, or mismatched-id resources", async () => {
    const remove = vi.fn();
    const owned = [
      { kind: "network", id: "network-1", name: "r2-network" },
      { kind: "volume", id: "volume-1", name: "r2-volume" },
    ];
    const observed = [
      { ...owned[0], labels: { [RUN_OWNERSHIP_LABEL]: RUN_ID, "com.docker.compose.project": `homecook-rehearsal-${RUN_ID}` } },
      { ...owned[1], id: "spoofed", labels: { [RUN_OWNERSHIP_LABEL]: RUN_ID, "com.docker.compose.project": `homecook-rehearsal-${RUN_ID}` } },
      { kind: "container", id: "production", name: "homecook-production-app", labels: { [RUN_OWNERSHIP_LABEL]: RUN_ID } },
    ];
    const result = await cleanupOwnedResources({
      runId: RUN_ID,
      project: `homecook-rehearsal-${RUN_ID}`,
      ownedResources: owned,
      inspectResource: async (entry: { kind: string }) => observed.find((item) => item.kind === entry.kind),
      removeResource: remove,
    });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(expect.objectContaining({ id: "network-1" }));
    expect(result.cleanup_errors).toEqual(expect.arrayContaining([expect.stringMatching(/ownership|identity|mismatch/iu)]));
  });
});

describe("release rehearsal R2 evidence semantic attack table", () => {
  it("accepts only the exact closed semantic evidence", () => {
    expect(() => validateRunEvidence(evidenceFixture())).not.toThrow();
  });

  it.each([
    ["timestamp order", (value: ReturnType<typeof evidenceFixture>) => { value.issued_at = "2026-08-29T00:02:00.000Z"; }],
    ["runtime slot", (value: ReturnType<typeof evidenceFixture>) => { value.runtime.app.component = "worker"; }],
    ["runtime kind", (value: ReturnType<typeof evidenceFixture>) => { value.runtime.worker.kind = "process"; }],
    ["runtime release binding", (value: ReturnType<typeof evidenceFixture>) => { value.runtime.worker.release_sha = SHA_B; }],
    ["runtime bundle binding", (value: ReturnType<typeof evidenceFixture>) => { value.runtime.worker.sealed_bundle_digest = DIGEST_B; }],
    ["worker RPC digest missing", (value: ReturnType<typeof evidenceFixture>) => { delete (value.runtime.worker as Record<string, unknown>).worker_rehearsal_rpc_config_digest; }],
    ["worker RPC identity mismatch", (value: ReturnType<typeof evidenceFixture>) => { value.runtime.worker.worker_rehearsal_rpc_config_identity_digest = "0".repeat(64); }],
    ["canary set", (value: ReturnType<typeof evidenceFixture>) => { value.canaries = value.canaries.slice(1); }],
    ["failed canary", (value: ReturnType<typeof evidenceFixture>) => { value.canaries[0].exit_code = 9; }],
    ["invalid canary digest", (value: ReturnType<typeof evidenceFixture>) => { value.canaries[0].normalized_result_digest = "not-a-digest"; }],
    ["migration head", (value: ReturnType<typeof evidenceFixture>) => { value.migration.catalog_head = "wrong"; }],
    ["ledger digest", (value: ReturnType<typeof evidenceFixture>) => { value.migration.applied_global_ledger_digest = "0".repeat(64); }],
    ["denied count", (value: ReturnType<typeof evidenceFixture>) => { value.network.denied_attempt_count = 0; }],
    ["network digest", (value: ReturnType<typeof evidenceFixture>) => { value.network.default_deny_policy_digest = "not-a-digest"; }],
    ["cleanup equality", (value: ReturnType<typeof evidenceFixture>) => { value.cleanup.removed_resource_ids = []; }],
    ["resource identity forgery", (value: ReturnType<typeof evidenceFixture>) => { value.isolation.resource_identity_digest = "0".repeat(64); }],
    ["production measurement", (value: ReturnType<typeof evidenceFixture>) => { value.production_guard.measurement_digest = "0".repeat(64); }],
    ["production snapshots differ", (value: ReturnType<typeof evidenceFixture>) => { value.production_guard.production_snapshot_post_digest = "0".repeat(64); }],
    ["threat control", (value: ReturnType<typeof evidenceFixture>) => { value.threat_controls.cleanup_ownership = "fail"; }],
    ["measured production DB access", (value: ReturnType<typeof evidenceFixture>) => {
      value.production_guard.production_db_connection_count = 1;
      value.production_guard.measurement.production_db_connection_count = 1;
      value.production_guard.measurement_digest = sha256Jcs(value.production_guard.measurement);
    }],
  ])("rejects digest-correct false pass evidence: %s", (_label, mutate) => {
    const value = structuredClone(evidenceFixture());
    mutate(value);
    const unsigned = { ...value };
    delete (unsigned as { evidence_digest?: string }).evidence_digest;
    value.evidence_digest = sha256Jcs(unsigned);
    expect(() => validateRunEvidence(value)).toThrow();
  });
});

describe("release rehearsal R2 public command and schema", () => {
  it("normalizes only the closed resolved Compose schema into safe sentinels", () => {
    const resolved = {
      name: "synthetic-project",
      services: Object.fromEntries(["api-gateway", "auth", "auth-proxy", "postgres", "postgrest", "postgrest-probe", "storage"].map((name) => [name, {
        image: `example/${name}@sha256:${"a".repeat(64)}`,
        command: ["node", "service.mjs"], entrypoint: ["/entrypoint"],
        environment: { SAFE_FLAG: "true", LOCAL_PATH: "/Users/private/synthetic" },
        labels: { "com.example.safe": "true" }, networks: { "data-internal": { aliases: [name] } },
        restart: "unless-stopped", security_opt: ["no-new-privileges:true"],
        volumes: [{ type: "bind", source: "/private/synthetic/script", target: "/homecook/script", read_only: true }],
      }])),
      networks: Object.fromEntries(["auth-edge", "auth-egress", "data-internal"].map((name) => [name, { name: `synthetic_${name}`, internal: true, external: false, ipam: {} }])),
      volumes: Object.fromEntries(["postgres-data", "storage-data"].map((name) => [name, { name: `synthetic_${name}`, external: false, labels: {} }])),
      secrets: {},
    };
    const normalized = normalizeResolvedComposeFixture(resolved);
    expect(JSON.stringify(normalized)).not.toMatch(/\/Users|\/private|synthetic-project/iu);
    expect(JSON.stringify(normalized)).not.toContain("credential-shaped-value");
    expect(normalized.services.postgres.environment.LOCAL_PATH).toMatch(/^__HOMECOOK_PATH_\d{2}__$/u);
    expect(normalized.services.auth.volumes[0].source).toMatch(/^__HOMECOOK_PATH_\d{2}__$/u);
    expect(() => normalizeResolvedComposeFixture({ ...resolved, x: true })).toThrow(/closed/i);
    const credential = structuredClone(resolved);
    (credential.services.auth.environment as Record<string, string>).ACCESS_TOKEN = "credential-shaped-value";
    expect(() => normalizeResolvedComposeFixture(credential)).toThrow(/credential/i);
  });

  it("publishes a digest-bound safe seven-service golden fixture", () => {
    const golden = buildSafeResolvedComposeGoldenFixture();
    expect(golden.schema).toBe("homecook.r2-resolved-compose-golden.v1");
    expect(Object.keys(golden.fixture.services).sort()).toEqual(["api-gateway", "auth", "auth-proxy", "postgres", "postgrest", "postgrest-probe", "storage"]);
    expect(golden.digest).toBe(sha256Jcs(golden.fixture));
    expect(JSON.stringify(golden)).not.toMatch(/\/Users|\/private|password|access_token/iu);
  });

  it("compiles only the exact resolved seven-service internal primitive plan", () => {
    const config = canonicalPrimitiveConfig();
    expect(compileClosedPrimitivePlan(config, { project: "homecook-rehearsal-x", ports: PRIMITIVE_PORTS }).services).toHaveLength(7);
    for (const mutate of [
      (v: typeof config) => { delete v.services.auth; },
      (v: typeof config) => { v.services.extra = structuredClone(v.services.auth); },
      (v: typeof config) => { v.services.auth.image = "example/auth:latest"; },
      (v: typeof config) => { v.networks["auth-edge"].internal = false; },
      (v: typeof config) => { delete (v.volumes as Partial<typeof v.volumes>)["storage-data"]; },
      (v: typeof config) => { v.services.auth.build = "."; },
    ]) {
      const value = structuredClone(config); mutate(value);
      expect(() => compileClosedPrimitivePlan(value, { project: "homecook-rehearsal-x", ports: PRIMITIVE_PORTS })).toThrow();
    }
  });

  it("orders actual primitive service operations with PostgreSQL ready before migration", () => {
    const plan = compileClosedPrimitivePlan(canonicalPrimitiveConfig(), { project: `homecook-rehearsal-${RUN_ID}`, ports: PRIMITIVE_PORTS });
    const namespace = buildRunNamespace({ runId: RUN_ID, ports: PRIMITIVE_PORTS });
    const operations = compilePrimitiveServiceOperations(plan, namespace, ["--label", `${RUN_OWNERSHIP_LABEL}=${RUN_ID}`, "--label", `com.docker.compose.project=${namespace.project}`]);
    type Operation = { kind: string; service: string; network?: string; argv?: string[] };
    const typedOperations = operations as Operation[];
    expect(typedOperations.filter((item) => item.kind === "create")).toHaveLength(7);
    expect(typedOperations.find((item) => item.kind === "connect" && item.service === "auth")).toMatchObject({ network: "auth-egress" });
    expect(typedOperations.findIndex((item) => item.kind === "readiness" && item.service === "postgres")).toBeLessThan(typedOperations.findIndex((item) => item.kind === "create" && item.service === "postgrest"));
    const allArgs = typedOperations.flatMap((item) => item.argv ?? []);
    expect(allArgs).toContain("--health-cmd");
    expect(allArgs).toContain("--tmpfs");
    expect(allArgs).toContain("--publish");
    expect(allArgs.filter((item) => item === "--mount").length).toBeGreaterThan(20);
    expect(typedOperations.flatMap((item) => item.argv ?? []).join(" ")).not.toMatch(/compose (?:create|start|up)/u);
  });

  it("cross-binds primitive inspect output to secrets, health, ports, mounts, and networks", () => {
    type PrimitiveService = {
      command: string[];
      entrypoint?: string[];
      environment: Record<string, string>;
      healthcheck: { command: string; retries: number };
      image: string;
      logging: { driver: string; options: Record<string, string> };
      name: string;
      networks: Record<string, { aliases: string[] }>;
      ports: Array<{ host_ip: string; protocol: string; published: number; target: number }>;
      read_only?: boolean;
      restart: string;
      secret_mounts: Array<{ file: string; target: string }>;
      security_opt: string[];
      tmpfs: string[];
      volumes: Array<{ read_only?: boolean; source: string; target: string; type: string }>;
    };
    const namespace = buildRunNamespace({ runId: RUN_ID, ports: PRIMITIVE_PORTS });
    const plan = compileClosedPrimitivePlan(canonicalPrimitiveConfig(), {
      project: namespace.project,
      ports: PRIMITIVE_PORTS,
    });
    const service = plan.services.find((entry) => entry.name === "api-gateway") as
      PrimitiveService | undefined;
    if (!service) throw new Error("api gateway plan missing");
    const observed = {
      Config: {
        Cmd: service.command,
        Entrypoint: service.entrypoint ?? null,
        Env: Object.entries(service.environment ?? {}).map(([key, value]) => `${key}=${value}`),
        Healthcheck: { Retries: service.healthcheck.retries, Test: ["CMD-SHELL", service.healthcheck.command] },
        Image: service.image,
      },
      HostConfig: {
        LogConfig: { Config: service.logging.options, Type: service.logging.driver },
        PortBindings: Object.fromEntries(service.ports.map((port) => [`${port.target}/${port.protocol}`, [{ HostIp: port.host_ip, HostPort: String(port.published) }]])),
        ReadonlyRootfs: service.read_only === true,
        RestartPolicy: { Name: service.restart },
        SecurityOpt: service.security_opt,
        Tmpfs: Object.fromEntries(service.tmpfs.map((entry) => [entry.split(":", 1)[0], entry])),
      },
      Mounts: [
        ...service.volumes.map((entry) => ({ Destination: entry.target, Name: entry.type === "volume" ? entry.source : "", RW: entry.read_only !== true, Source: entry.source, Type: entry.type })),
        ...service.secret_mounts.map((entry) => ({ Destination: `/run/secrets/${entry.target}`, Name: "", RW: false, Source: entry.file, Type: "bind" })),
      ],
      NetworkSettings: { Networks: Object.fromEntries(Object.entries(service.networks).map(([name, entry]) => [`${namespace.project}_${name}`, { Aliases: entry.aliases }])) },
    };
    expect(validatePrimitiveContainerInspection(observed, service, namespace)).toBe(service);
    expect(() => validatePrimitiveContainerInspection({ ...observed, Mounts: observed.Mounts.filter((entry) => !entry.Destination.startsWith("/run/secrets/")) }, service, namespace)).toThrow(/mount/iu);
    expect(() => validatePrimitiveContainerInspection({ ...observed, HostConfig: { ...observed.HostConfig, PortBindings: {} } }, service, namespace)).toThrow(/port/iu);
  });
  it("rejects every post-create container image substitution", () => {
    const authority = {
      reference: `docker.io/library/node@sha256:${"a".repeat(64)}`,
      digest: `sha256:${"a".repeat(64)}`,
      image_id: `sha256:${"b".repeat(64)}`,
      platform: "linux/arm64",
    };
    const observed = {
      configured_reference: authority.reference,
      container_image_id: authority.image_id,
      local_image_id: authority.image_id,
      platform: authority.platform,
      repo_digests: [authority.reference],
    };
    expect(() => validateContainerImageAuthority({ authority, observed })).not.toThrow();
    for (const patch of [
      { container_image_id: `sha256:${"c".repeat(64)}` },
      { configured_reference: `docker.io/library/node@sha256:${"d".repeat(64)}` },
      { local_image_id: `sha256:${"e".repeat(64)}` },
      { platform: "linux/amd64" },
      { repo_digests: [`other@sha256:${"f".repeat(64)}`] },
    ]) {
      expect(() => validateContainerImageAuthority({ authority, observed: { ...observed, ...patch } }))
        .toThrow(/image|digest|platform|reference/iu);
    }
  });

  it("uses the actual sealed app and worker runtime entrypoints", () => {
    const adaptersSource = readFileSync(
      "scripts/lib/local-mac-production-rehearsal-runner-adapters.mjs",
      "utf8",
    );
    expect(adaptersSource).toContain("scripts/start-production.mjs");
    expect(adaptersSource).toContain("rehearsal-synthetic");
    expect(adaptersSource).toContain("--pull=never");
    expect(adaptersSource).not.toContain("node_modules/next/dist/bin/next','start'");
    expect(adaptersSource).not.toContain('"compose", "create"');
    expect(adaptersSource).not.toContain('"compose", "start"');
    expect(adaptersSource).not.toContain('"compose", "up"');
    expect((adaptersSource.match(/\["network", "create"/gu) ?? []).length).toBe(1);
    expect((adaptersSource.match(/\["volume", "create"/gu) ?? []).length).toBe(1);
  });

  it("generates only run-owned internal Compose networks and loopback environment", () => {
    const namespace = buildRunNamespace({
      runId: RUN_ID,
      ports: { app: 43101, auth: 43102, postgres: 43103, storage: 43104 },
    });
    const manifest = candidateManifest();
    const environment = buildFullLocalRehearsalEnvironment({
      namespace,
      runRoot: "/private/r2-run",
      manifest,
    });
    expect(environment.FULL_LOCAL_COMPOSE_PROJECT_NAME).toBe(namespace.project);
    expect(environment.FULL_LOCAL_SECRET_DIR).toMatch(/^\/private\/r2-run\//u);
    expect(environment.FULL_LOCAL_API_EXTERNAL_URL).toMatch(/^http:\/\/127\.0\.0\.1:/u);
    expect(Object.values(environment).join("\n")).not.toContain("mumeok.kr");
    const override = buildFullLocalComposeOverride(namespace);
    expect(override.match(/internal: true/gu)).toHaveLength(3);
    expect(override.match(/pull_policy: never/gu)).toHaveLength(7);
    expect(override.match(/max-size: "1m"/gu)).toHaveLength(7);
    expect(override).toContain(`${RUN_OWNERSHIP_LABEL}: ${JSON.stringify(RUN_ID)}`);
    expect(override.match(/HOMECOOK_REHEARSAL_DB_NAME:/gu)).toHaveLength(3);
    expect((override.match(/HOMECOOK_REHEARSAL_RUN_ID:/gu) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(override).not.toMatch(/external:\s*true/iu);
  });

  it("exposes the exact package command and a closed non-receipt evidence schema", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    expect(packageJson.scripts["release:rehearsal:run"]).toBe(
      "node scripts/local-mac-production-rehearsal-run.mjs",
    );
    const schema = JSON.parse(readFileSync(
      "scripts/schemas/local-mac-production-rehearsal-run-evidence.schema.json",
      "utf8",
    ));
    expect(schema.$id).toBe(RUN_EVIDENCE_SCHEMA);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(expect.arrayContaining([
      "trusted_receipt",
      "issued_at",
      "production_guard",
      "cleanup",
      "evidence_digest",
    ]));
    expect(schema.properties.trusted_receipt.const).toBe(false);
    expect(schema.properties.canaries.prefixItems.map((entry: { properties: { canary_id: { const: string } } }) =>
      entry.properties.canary_id.const)).toEqual([
      "app-production-route",
      "cross-component-identity",
      "external-network-deny",
      "full-local-api-gateway-route",
      "full-local-auth-route",
      "full-local-postgrest-fixture",
      "full-local-storage-route",
      "worker-synthetic-job",
    ]);
    expect(schema.properties.runtime.properties.app.allOf[1].properties.component.const).toBe("app");
    expect(schema.properties.runtime.properties.full_local.allOf[1].properties.component.const).toBe("full_local");
    expect(schema.properties.runtime.properties.worker.$ref).toBe("#/$defs/workerRuntime");
    expect(schema.properties.production_guard.required).toEqual(expect.arrayContaining([
      "measurement",
      "measurement_digest",
    ]));
    expect(JSON.stringify(schema)).not.toContain("receipt_digest");
  });

  it("requires --json and delegates an absolute candidate to the isolated runner", async () => {
    const root = mkdtempSync(join(tmpdir(), "homecook-r2-cli-"));
    mkdirSync(join(root, "candidate"), { mode: 0o500 });
    const output = { value: "", write(chunk: string) { this.value += chunk; } };
    const run = vi.fn().mockResolvedValue({ schema: RUN_EVIDENCE_SCHEMA, status: "passed" });
    await runLocalMacProductionRehearsalRunnerCli([
      "--candidate", join(root, "candidate"), "--json",
    ], {
      output,
      run,
      createAdapters: () => ({ adapter: true }),
      namespaceResolver: () => root,
      runIdFactory: () => RUN_ID,
    });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({
      candidateInput: join(root, "candidate"),
      namespaceRoot: root,
      runId: RUN_ID,
      adapters: { adapter: true },
    }));
    expect(JSON.parse(output.value)).toEqual({ schema: RUN_EVIDENCE_SCHEMA, status: "passed" });
    await expect(runLocalMacProductionRehearsalRunnerCli([
      "--candidate", join(root, "candidate"),
    ], { run })).rejects.toThrow(/--json/iu);
  });
});
