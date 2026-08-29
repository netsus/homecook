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
} from "../scripts/lib/local-mac-production-rehearsal-runner.mjs";
import { runLocalMacProductionRehearsalRunnerCli } from "../scripts/local-mac-production-rehearsal-run.mjs";
import {
  buildFullLocalComposeOverride,
  buildFullLocalRehearsalEnvironment,
} from "../scripts/lib/local-mac-production-rehearsal-runner-adapters.mjs";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const RUN_ID = "11111111-2222-4333-8444-555555555555";

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
      ordered_migration_files_digest: "f".repeat(64),
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

function migrationReplay(overrides = {}) {
  return {
    ordered_migration_files_digest: "f".repeat(64),
    applied_global_ledger_digest: "7".repeat(64),
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

function runtime(component: "app" | "full_local" | "worker") {
  return {
    component,
    kind: component === "full_local" ? "container" : "process",
    pid: component === "full_local" ? null : component === "app" ? 41001 : 41002,
    process_group_id: component === "full_local" ? null : 41000,
    container_ids: component === "full_local" ? ["container-full-local"] : [],
    release_sha: SHA_A,
    release_tree: SHA_B,
    build_id: "build-r2",
    sealed_bundle_digest: DIGEST_A,
    migration_head: "20260102000000_two",
    ready: true,
    exit_code: null,
  };
}

function createAdapters() {
  const resources = [
    { kind: "network", id: "network-1", name: `homecook-rehearsal-${RUN_ID}-network` },
    { kind: "volume", id: "volume-1", name: `homecook-rehearsal-${RUN_ID}-postgres` },
    { kind: "container", id: "container-full-local", name: `homecook-rehearsal-${RUN_ID}-full-local` },
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
    startComponents: vi.fn().mockResolvedValue([
      runtime("app"), runtime("full_local"), runtime("worker"),
    ]),
    waitForReadiness: vi.fn().mockResolvedValue({ ready: true }),
    runCanaries: vi.fn().mockResolvedValue([
      { canary_id: "app-health", exit_code: 0, normalized_result_digest: "1".repeat(64) },
      { canary_id: "cross-component-identity", exit_code: 0, normalized_result_digest: "2".repeat(64) },
      { canary_id: "full-local-synthetic-fixture", exit_code: 0, normalized_result_digest: "3".repeat(64) },
      { canary_id: "worker-synthetic-job", exit_code: 0, normalized_result_digest: "4".repeat(64) },
    ]),
    readNetworkEvidence: vi.fn().mockResolvedValue({
      default_deny_policy_digest: "0".repeat(64),
      allowed_endpoints: ["loopback", "run-owned-network", "approved-unix-sockets"],
      denied_attempt_count: 1,
      unexpected_successful_egress_count: 0,
    }),
    stopRuntime: vi.fn().mockResolvedValue(undefined),
    removeResource: vi.fn().mockResolvedValue(undefined),
    listResidue: vi.fn().mockResolvedValue([]),
    countPersistentSecretFiles: vi.fn().mockResolvedValue(0),
    closeSecretHandles: vi.fn().mockResolvedValue(undefined),
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
    const context = { runId: RUN_ID, project: `homecook-rehearsal-${RUN_ID}` };
    expect(validateDockerInvocation(["ps", "--no-trunc"], context).mode).toBe("read-only");
    expect(validateDockerInvocation([
      "network", "create",
      "--label", `${RUN_OWNERSHIP_LABEL}=${RUN_ID}`,
      "--label", `com.docker.compose.project=${context.project}`,
      `${context.project}-network`,
    ], context).mode).toBe("run-owned-mutation");
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
    expect(result.cleanup).toMatchObject({ completed: true, residue_resource_ids: [], cleanup_errors: [], secret_bearing_persistent_file_count: 0 });
    expect(() => validateRunEvidence(result)).not.toThrow();
    expect(adapters.createResources).toHaveBeenCalledWith(expect.objectContaining({
      candidateRoot: join(namespaceRoot, RUN_ID, "execution-candidate"),
    }));
    expect(adapters.stopRuntime.mock.calls.map(([entry]) => entry.component)).toEqual(["worker", "full_local", "app"]);
    expect(adapters.removeResource.mock.calls.map(([entry]) => entry.id)).toEqual(["container-full-local", "volume-1", "network-1"]);
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
    expect(reads).toBe(3);
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
});

describe("release rehearsal R2 cleanup ownership", () => {
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

describe("release rehearsal R2 public command and schema", () => {
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
    expect(override).toContain(`${RUN_OWNERSHIP_LABEL}: ${JSON.stringify(RUN_ID)}`);
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
      "production_guard",
      "cleanup",
      "evidence_digest",
    ]));
    expect(schema.properties.trusted_receipt.const).toBe(false);
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
