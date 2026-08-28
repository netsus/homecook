import {
  chmodSync,
  lstatSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

import { afterEach, describe, expect, it, vi } from "vitest";

import { canonicalizeJcs, sha256Jcs } from "../scripts/lib/rfc8785-jcs.mjs";
import {
  collectReadOnlyProductionInventory,
  createLocalProductionInventoryAdapters,
  createProductionSurfaceSnapshot,
  readCanonicalInventoryFile,
  validateProductionInventory,
} from "../scripts/lib/local-mac-production-rehearsal-inventory.mjs";
import {
  classifyProductionInventory,
  parseAndClassifyProductionInventory,
} from "../scripts/lib/local-mac-production-rehearsal-classifier.mjs";

const temporaryDirectories: string[] = [];
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const RELEASE_A = "1".repeat(40);
const RELEASE_B = "2".repeat(40);

function tempDirectory(prefix: string) {
  const path = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  temporaryDirectories.push(path);
  chmodSync(path, 0o700);
  return path;
}

function probeIdentity() {
  return {
    version: "inventory-v1",
    realpath: "/opt/homecook/tools/rehearsal-inventory",
    device: 1,
    inode: 2,
    mode: 0o755,
    ctime: "2026-08-29T08:00:00.000Z",
    size: 1024,
    sha256: SHA_A,
  };
}

function createAdapters({ mixed = false } = {}) {
  const mutation = vi.fn(() => {
    throw new Error("mutation API must never be called");
  });
  return {
    mutation,
    adapters: {
      readReleaseArtifacts: vi.fn(async () => [
        { kind: "release_root", exists: true, device: 1, inode: 10, owner_uid: process.getuid!(), mode: 0o700, size: 0, mtime: "2026-08-29T08:00:00.000Z", sha256: SHA_A, raw_env: "DATABASE_PASSWORD=secret" },
        {
          kind: "current_descriptor",
          exists: !mixed,
          device: mixed ? "0" : 1,
          inode: mixed ? "0" : 11,
          owner_uid: mixed ? 0 : process.getuid!(),
          mode: mixed ? 0 : 0o600,
          size: mixed ? "0" : 10,
          mtime: mixed ? "1970-01-01T00:00:00.000Z" : "2026-08-29T08:00:00.000Z",
          sha256: mixed ? sha256Jcs({ kind: "current_descriptor", exists: false }) : SHA_B,
        },
        {
          kind: `recovered_lock:${SHA_C}`,
          exists: mixed,
          device: mixed ? 1 : "0",
          inode: mixed ? 12 : "0",
          owner_uid: mixed ? process.getuid!() : 0,
          mode: mixed ? 0o700 : 0,
          size: mixed ? 0 : "0",
          mtime: mixed ? "2026-08-29T08:00:00.000Z" : "1970-01-01T00:00:00.000Z",
          sha256: mixed ? SHA_C : sha256Jcs({ kind: `recovered_lock:${SHA_C}`, exists: false }),
        },
        ...["com.homecook.production", "com.homecook.full-local-production", "com.homecook.youtube-extraction-worker"].map((label, offset) => ({
          kind: `launch_agent_plist:${label}`,
          exists: true,
          device: 1,
          inode: 20 + offset,
          owner_uid: process.getuid!(),
          mode: 0o600,
          size: 100,
          mtime: "2026-08-29T08:00:00.000Z",
          sha256: SHA_A,
        })),
      ]),
      readWorkloads: vi.fn(async () => [
        { component: "app", release_sha: RELEASE_A, release_tree: RELEASE_A, build_id: "build-a", sealed_bundle_digest: SHA_A, health: "running", descriptor_digest: SHA_B, provider_payload: "secret-provider-json" },
        { component: "full_local", release_sha: mixed ? RELEASE_B : RELEASE_A, release_tree: mixed ? RELEASE_B : RELEASE_A, build_id: mixed ? "build-b" : "build-a", sealed_bundle_digest: mixed ? SHA_B : SHA_A, health: mixed ? "partial" : "running", descriptor_digest: SHA_B },
        { component: "worker", release_sha: RELEASE_A, release_tree: RELEASE_A, build_id: "build-a", sealed_bundle_digest: SHA_A, health: "running", descriptor_digest: SHA_B },
      ]),
      readActivePromotionLock: vi.fn(async () => ({
        kind: "active_promotion_lock",
        exists: false,
        device: "0",
        inode: "0",
        owner_uid: 0,
        mode: 0,
        size: "0",
        mtime: "1970-01-01T00:00:00.000Z",
        sha256: sha256Jcs({ kind: "active_promotion_lock", exists: false }),
      })),
      readLaunchd: vi.fn(async () => [
        { label: "com.homecook.production", loaded: true, state: mixed ? "scheduled" : "running", pid: mixed ? null : 101, projection_digest: SHA_A, environment: { TOKEN: "secret" } },
        { label: "com.homecook.full-local-production", loaded: true, state: "running", pid: 102, projection_digest: SHA_B },
        { label: "com.homecook.youtube-extraction-worker", loaded: true, state: "running", pid: 103, projection_digest: SHA_C },
      ]),
      readDocker: vi.fn(async () => ({
        containers: [{ id: "container-db", name: "homecook-db", project: "homecook", service: "postgres", image_digest: `sha256:${SHA_A}`, image_id: `sha256:${SHA_B}`, labels_digest: SHA_A, mounts_digest: SHA_B, state: "running", generation_digest: SHA_A, config_env: ["POSTGRES_PASSWORD=secret"] }],
        networks: [{ id: "network-main", name: "homecook-network", project: "homecook", labels_digest: SHA_B, generation_digest: SHA_B }],
        volumes: [{ name: "homecook-db", project: "homecook", service: "postgres", labels_digest: SHA_C, generation_digest: SHA_C }],
      })),
      readPortListeners: vi.fn(async () => [
        { port: 3100, pid: 101, process_name: "node", listener_digest: SHA_A, command_line: "node --token secret" },
      ]),
      readOpaqueConfigIdentities: vi.fn(async () => [
        { identity: "production-env", exists: true, sha256: SHA_A, secret_contents: "secret" },
        { identity: "full-local-config", exists: true, sha256: SHA_B },
      ]),
      readToolIdentities: vi.fn(async () => [
        { name: "docker", ...probeIdentity() },
        { name: "git", ...probeIdentity() },
        { name: "launchctl", ...probeIdentity(), provider_token: "secret" },
        { name: "lsof", ...probeIdentity() },
      ]),
      readMigrationMarker: vi.fn(async () => ({
        approved: true,
        marker_digest: SHA_A,
        global_ledger_digest: mixed ? null : SHA_B,
        migration_head: "20260829000100_release",
        catalog_head: "20260829000100_release",
        raw_rows: [{ password: "secret" }],
      })),
      restart: mutation,
      stop: mutation,
      delete: mutation,
      migrate: mutation,
      connectWrite: mutation,
    },
  };
}

async function createInventory({ mixed = false } = {}) {
  const { adapters } = createAdapters({ mixed });
  return collectReadOnlyProductionInventory({
    adapters,
    capturedAt: "2026-08-29T10:00:00.000Z",
    probeIdentity: probeIdentity(),
    approvedMigrationMarker: true,
  });
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

describe("read-only production inventory", () => {
  it("collects allowlisted metadata/digests while calling mutation and production DB APIs zero times", async () => {
    const { adapters, mutation } = createAdapters();
    const inventory = await collectReadOnlyProductionInventory({
      adapters,
      capturedAt: "2026-08-29T10:00:00.000Z",
      probeIdentity: probeIdentity(),
      approvedMigrationMarker: true,
    });
    const output = canonicalizeJcs(inventory);

    expect(mutation).not.toHaveBeenCalled();
    expect(adapters.readMigrationMarker).toHaveBeenCalledTimes(1);
    expect(inventory.production_db_connection_count).toBe(0);
    expect(inventory.mutation_attempt_count).toBe(0);
    expect(inventory.tool_identities.map((entry: { name: string }) => entry.name)).toEqual(["docker", "git", "launchctl", "lsof"]);
    expect(inventory.redacted_field_count).toBeGreaterThanOrEqual(7);
    expect(output).not.toMatch(/DATABASE_PASSWORD|secret-provider|POSTGRES_PASSWORD|TOKEN|command_line|raw_rows|secret_contents/u);
    expect(inventory.inventory_digest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("defaults to zero production DB connections and skips migration marker reads without explicit approval", async () => {
    const { adapters } = createAdapters();
    const inventory = await collectReadOnlyProductionInventory({
      adapters,
      capturedAt: "2026-08-29T10:00:00.000Z",
      probeIdentity: probeIdentity(),
    });

    expect(adapters.readMigrationMarker).not.toHaveBeenCalled();
    expect(inventory.surfaces.migration).toEqual({
      approved: false,
      marker_digest: null,
      global_ledger_digest: null,
      migration_head: null,
      catalog_head: null,
    });
    expect(inventory.production_db_connection_count).toBe(0);
  });

  it("preserves APFS-width device and inode identities as exact decimal strings", async () => {
    const { adapters } = createAdapters();
    const wideProbe = {
      ...probeIdentity(),
      device: "16777229",
      inode: "1152921500311885470",
    };
    const inventory = await collectReadOnlyProductionInventory({
      adapters,
      capturedAt: "2026-08-29T10:00:00.000Z",
      probeIdentity: wideProbe,
    });

    expect(inventory.probe_identity.inode).toBe("1152921500311885470");
  });

  it("builds a deterministic pre/post surface snapshot model without volatile timestamps in the digest", async () => {
    const inventory = await createInventory();
    const first = createProductionSurfaceSnapshot(inventory, { capturedAt: "2026-08-29T10:01:00.000Z" });
    const second = createProductionSurfaceSnapshot(inventory, { capturedAt: "2026-08-29T10:02:00.000Z" });

    expect(first.surface_digest).toBe(second.surface_digest);
    expect(first.snapshot_digest).not.toBe(second.snapshot_digest);
    expect(first.production_db_connection_count).toBe(0);
    expect(first.mutation_attempt_count).toBe(0);

    const incompleteSurfaces = { ...inventory.surfaces, launchd: [] };
    const incompleteUnsigned = { ...inventory, surfaces: incompleteSurfaces, surface_digest: sha256Jcs(incompleteSurfaces) };
    delete (incompleteUnsigned as Record<string, unknown>).inventory_digest;
    const incomplete = { ...incompleteUnsigned, inventory_digest: sha256Jcs(incompleteUnsigned) };
    expect(() => createProductionSurfaceSnapshot(incomplete)).toThrow(/complete|required|launchd/iu);
  });

  it("limits default Docker inventory to the exact canonical production project", async () => {
    const rootDir = tempDirectory("homecook-inventory-adapter-root-");
    const homeDir = tempDirectory("homecook-inventory-adapter-home-");
    const configDir = join(rootDir, "infra", "full-local-supabase");
    mkdirSync(configDir, { recursive: true, mode: 0o700 });
    writeFileSync(
      join(configDir, ".env.production.local"),
      "FULL_LOCAL_COMPOSE_PROJECT_NAME=homecook-production\nPOSTGRES_PASSWORD=must-not-leak\n",
      { mode: 0o600 },
    );
    const commandRunner = vi.fn((_: string, args: string[]) => {
      if (args[0] === "ps") return { status: 0, stdout: "prod-id\tprod-db\thomecook-production\tpostgres\trunning\nother-id\tother-db\tunrelated\tpostgres\trunning\n" };
      if (args[0] === "inspect") return { status: 0, stdout: `{"com.docker.compose.project":"homecook-production"}\t[{"Type":"volume","Name":"prod-volume","Source":"/var/lib/prod","Destination":"/var/lib/postgresql/data","Driver":"local","Mode":"rw","RW":true,"Propagation":""}]\tsha256:${SHA_A}\n` };
      if (args[0] === "network" && args[1] === "ls") return { status: 0, stdout: "prod-net\tprod-network\thomecook-production\nother-net\tother-network\tunrelated\n" };
      if (args[0] === "network" && args[1] === "inspect") return { status: 0, stdout: "{\"com.docker.compose.project\":\"homecook-production\"}\n" };
      if (args[0] === "volume" && args[1] === "ls") return { status: 0, stdout: "prod-volume\thomecook-production\tpostgres\nother-volume\tunrelated\tpostgres\n" };
      if (args[0] === "volume" && args[1] === "inspect") return { status: 0, stdout: "{\"com.docker.compose.project\":\"homecook-production\"}\n" };
      return { status: 1, stdout: "" };
    });
    const adapters = createLocalProductionInventoryAdapters({
      rootDir,
      homeDir,
      dockerBin: "/usr/local/bin/docker-fixture",
      commandRunner,
    });

    const docker = await adapters.readDocker();
    expect(docker.containers.map((entry: { id: string }) => entry.id)).toEqual(["prod-id"]);
    expect(docker.networks.map((entry: { id: string }) => entry.id)).toEqual(["prod-net"]);
    expect(docker.volumes.map((entry: { name: string }) => entry.name)).toEqual(["prod-volume"]);
    expect(canonicalizeJcs(docker)).not.toContain("must-not-leak");
    expect(canonicalizeJcs(docker)).not.toContain("unrelated");
  });

  it("requires approved migration markers to use the private outside-repository artifact boundary", async () => {
    const rootDir = tempDirectory("homecook-marker-repo-");
    const homeDir = tempDirectory("homecook-marker-home-");
    const markerPath = join(rootDir, "marker.json");
    writeFileSync(markerPath, canonicalizeJcs({
      catalog_head: "20260829000100_release",
      global_ledger_digest: SHA_A,
      migration_head: "20260829000100_release",
    }), { mode: 0o600 });
    const adapters = createLocalProductionInventoryAdapters({
      rootDir,
      homeDir,
      approvedMigrationMarkerPath: markerPath,
    });

    await expect(adapters.readMigrationMarker()).rejects.toThrow(/repository|outside/iu);
  });

  it("recursively binds nested bytes, mode, and contained symlink targets", async () => {
    const rootDir = tempDirectory("homecook-tree-root-");
    const homeDir = tempDirectory("homecook-tree-home-");
    const snapshot = join(homeDir, ".homecook", "releases", "execution-snapshots", "snapshot-a");
    const nested = join(snapshot, "nested");
    mkdirSync(nested, { recursive: true, mode: 0o700 });
    const payload = join(nested, "payload.bin");
    const firstTarget = join(nested, "target-a.txt");
    const secondTarget = join(nested, "target-b.txt");
    writeFileSync(payload, "AAAA", { mode: 0o600 });
    writeFileSync(firstTarget, "one", { mode: 0o600 });
    writeFileSync(secondTarget, "two", { mode: 0o600 });
    const link = join(snapshot, "current-target");
    symlinkSync("nested/target-a.txt", link);
    const adapters = createLocalProductionInventoryAdapters({ rootDir, homeDir });
    const snapshotDigest = async () => (await adapters.readReleaseArtifacts())
      .find((entry: { kind: string }) => entry.kind.startsWith("sealed_snapshot:"))!.sha256;

    const initial = await snapshotDigest();
    writeFileSync(payload, "BBBB", { mode: 0o600 });
    const byteDrift = await snapshotDigest();
    chmodSync(payload, 0o700);
    const modeDrift = await snapshotDigest();
    unlinkSync(link);
    symlinkSync("nested/target-b.txt", link);
    const symlinkDrift = await snapshotDigest();

    expect(new Set([initial, byteDrift, modeDrift, symlinkDrift]).size).toBe(4);
  });

  it("rejects recursive tree path escape and explicit resource bounds", async () => {
    const inventoryModule = await import("../scripts/lib/local-mac-production-rehearsal-inventory.mjs");
    expect(inventoryModule.digestProductionTree).toBeTypeOf("function");
    const root = tempDirectory("homecook-tree-bounds-");
    const nested = join(root, "nested");
    mkdirSync(nested, { mode: 0o700 });
    writeFileSync(join(nested, "a"), "1234", { mode: 0o600 });
    writeFileSync(join(nested, "b"), "5678", { mode: 0o600 });

    expect(() => inventoryModule.digestProductionTree(root, { maxEntries: 1 })).toThrow(/entry|bound|limit/iu);
    expect(() => inventoryModule.digestProductionTree(root, { maxDepth: 0 })).toThrow(/depth|bound|limit/iu);
    expect(() => inventoryModule.digestProductionTree(root, { maxBytes: 4 })).toThrow(/byte|bound|limit/iu);

    const outside = tempDirectory("homecook-tree-outside-");
    writeFileSync(join(outside, "secret"), "outside", { mode: 0o600 });
    symlinkSync(join(outside, "secret"), join(root, "escape"));
    expect(() => inventoryModule.digestProductionTree(root)).toThrow(/symlink|escape|contain/iu);
  });

  it("preserves actual filesystem identity from bigint stats without Number rounding", async () => {
    const rootDir = tempDirectory("homecook-bigint-root-");
    const homeDir = tempDirectory("homecook-bigint-home-");
    const releaseRoot = join(homeDir, ".homecook", "releases");
    mkdirSync(releaseRoot, { recursive: true, mode: 0o700 });
    const adapters = createLocalProductionInventoryAdapters({ rootDir, homeDir });
    const evidence = (await adapters.readReleaseArtifacts())
      .find((entry: { kind: string }) => entry.kind === "release_root")!;
    const stats = lstatSync(releaseRoot, { bigint: true });

    expect(evidence.device).toBe(stats.dev.toString());
    expect(evidence.inode).toBe(stats.ino.toString());
    expect(evidence.size).toBe(stats.size.toString());
  });

  it("includes the canonical LaunchAgent plist file identities in release artifacts", async () => {
    const rootDir = tempDirectory("homecook-plist-root-");
    const homeDir = tempDirectory("homecook-plist-home-");
    const adapters = createLocalProductionInventoryAdapters({ rootDir, homeDir });
    const kinds = (await adapters.readReleaseArtifacts()).map((entry: { kind: string }) => entry.kind);

    expect(kinds).toEqual(expect.arrayContaining([
      "launch_agent_plist:com.homecook.production",
      "launch_agent_plist:com.homecook.full-local-production",
      "launch_agent_plist:com.homecook.youtube-extraction-worker",
    ]));
  });

  it("models the canonical active promotion lock separately and always classifies it unsafe", async () => {
    const rootDir = tempDirectory("homecook-active-lock-root-");
    const homeDir = tempDirectory("homecook-active-lock-home-");
    const lockPath = join(homeDir, ".homecook", "locks", "production-promotion.lock");
    mkdirSync(lockPath, { recursive: true, mode: 0o700 });
    const adapters = createLocalProductionInventoryAdapters({ rootDir, homeDir });
    const lockEvidence = await adapters.readActivePromotionLock();

    expect(lockEvidence.kind).toBe("active_promotion_lock");
    expect(lockEvidence.exists).toBe(true);

    const inventory = await createInventory();
    const surfaces = { ...inventory.surfaces, active_promotion_lock: lockEvidence };
    const unsigned = {
      ...inventory,
      surfaces,
      surface_digest: sha256Jcs(surfaces),
      probe_statuses: {
        ...inventory.probe_statuses,
        active_promotion_lock: { status: "success", reason_code: null, evidence_count: 1 },
      },
    };
    delete (unsigned as Record<string, unknown>).inventory_digest;
    const withLock = { ...unsigned, inventory_digest: sha256Jcs(unsigned) };
    const result = classifyProductionInventory(withLock);
    expect(result.promotion_safe).toBe(false);
    expect(result.states).toContain("unknown");

    const failedUnsigned = {
      ...withLock,
      surfaces: { ...surfaces, active_promotion_lock: inventory.surfaces.active_promotion_lock },
      probe_statuses: {
        ...withLock.probe_statuses,
        active_promotion_lock: { status: "failed", reason_code: "active_promotion_lock_probe_failed", evidence_count: 0 },
      },
    };
    failedUnsigned.surface_digest = sha256Jcs(failedUnsigned.surfaces);
    delete (failedUnsigned as Record<string, unknown>).inventory_digest;
    const failedLockProbe = { ...failedUnsigned, inventory_digest: sha256Jcs(failedUnsigned) };
    expect(classifyProductionInventory(failedLockProbe).promotion_safe).toBe(false);
  });

  it("rejects malformed active lock fields and inconsistent absent sentinels in runtime and schema", async () => {
    const require = createRequire(import.meta.url);
    const eslintPackage = require.resolve("@eslint/eslintrc/package.json");
    const Ajv = require(require.resolve("ajv", { paths: [eslintPackage] }));
    const validateSchema = new Ajv({ allErrors: true, strict: false }).compile(
      JSON.parse(readFileSync("scripts/schemas/local-mac-production-rehearsal-inventory.schema.json", "utf8")),
    );
    const valid = await createInventory();
    const mutateLock = (patch: Record<string, unknown>, evidenceCount = 1) => {
      const surfaces = { ...valid.surfaces, active_promotion_lock: { ...valid.surfaces.active_promotion_lock, ...patch } };
      const unsigned = {
        ...valid,
        surfaces,
        surface_digest: sha256Jcs(surfaces),
        probe_statuses: {
          ...valid.probe_statuses,
          active_promotion_lock: { status: "success", reason_code: null, evidence_count: evidenceCount },
        },
      };
      delete (unsigned as Record<string, unknown>).inventory_digest;
      return { ...unsigned, inventory_digest: sha256Jcs(unsigned) };
    };
    const attacks = [
      mutateLock({ exists: 0 }),
      mutateLock({ exists: "false" }),
      mutateLock({ exists: null }),
      mutateLock({ kind: "recovered_lock" }),
      mutateLock({ sha256: "bad" }),
      mutateLock({ mtime: "2026-02-30T00:00:00.000Z" }),
      mutateLock({ device: {} }),
      mutateLock({ exists: false, inode: "1" }),
      mutateLock({}, 0),
    ];

    for (const attack of attacks) {
      let runtimeAccepted = true;
      try { validateProductionInventory(attack); } catch { runtimeAccepted = false; }
      expect({ runtimeAccepted, schemaAccepted: validateSchema(attack) }, JSON.stringify(attack)).toEqual({
        runtimeAccepted: false,
        schemaAccepted: false,
      });
    }
  });

  it("rejects duplicate current and prepared descriptor kinds before classification", async () => {
    const inventory = await createInventory();
    const descriptor = inventory.surfaces.release_artifacts.find((entry: { kind: string }) => entry.kind === "current_descriptor")!;
    const variants = [
      [...inventory.surfaces.release_artifacts, { ...descriptor }],
      [...inventory.surfaces.release_artifacts, { ...descriptor, sha256: SHA_C, inode: 999 }],
      [...inventory.surfaces.release_artifacts,
        { ...descriptor, kind: "prepared_descriptor", sha256: SHA_C, inode: 997 },
        { ...descriptor, kind: "prepared_descriptor", sha256: SHA_A, inode: 998 }],
    ];

    for (const release_artifacts of variants) {
      const surfaces = { ...inventory.surfaces, release_artifacts };
      const unsigned = { ...inventory, surfaces, surface_digest: sha256Jcs(surfaces) };
      delete (unsigned as Record<string, unknown>).inventory_digest;
      const candidate = { ...unsigned, inventory_digest: sha256Jcs(unsigned) };
      expect(() => classifyProductionInventory(candidate)).toThrow(/duplicate|descriptor|unique|ambiguous/iu);
    }
  });

  it("fails probes when an intermediate trusted production parent is a symlink", async () => {
    const rootDir = tempDirectory("homecook-parent-root-");
    const homeDir = tempDirectory("homecook-parent-home-");
    const outside = tempDirectory("homecook-parent-outside-");
    const outsideReleases = join(outside, "releases");
    mkdirSync(outsideReleases, { mode: 0o700 });
    writeFileSync(join(outsideReleases, "current.json"), "{}", { mode: 0o600 });
    symlinkSync(outside, join(homeDir, ".homecook"));
    const adapters = createLocalProductionInventoryAdapters({ rootDir, homeDir });
    const inventory = await collectReadOnlyProductionInventory({
      adapters,
      capturedAt: "2026-08-29T10:00:00.000Z",
      probeIdentity: probeIdentity(),
    });

    expect(inventory.probe_statuses.release_artifacts.status).toBe("failed");
    expect(inventory.probe_statuses.active_promotion_lock.status).toBe("failed");
    expect(inventory.surfaces.release_artifacts).toEqual([]);
    expect(classifyProductionInventory(inventory).promotion_safe).toBe(false);

    const launchHome = tempDirectory("homecook-launch-parent-home-");
    const launchOutside = tempDirectory("homecook-launch-parent-outside-");
    mkdirSync(join(launchHome, "Library"), { mode: 0o700 });
    symlinkSync(launchOutside, join(launchHome, "Library", "LaunchAgents"));
    const launchInventory = await collectReadOnlyProductionInventory({
      adapters: createLocalProductionInventoryAdapters({ rootDir, homeDir: launchHome }),
      capturedAt: "2026-08-29T10:00:00.000Z",
      probeIdentity: probeIdentity(),
    });
    expect(launchInventory.probe_statuses.release_artifacts.status).toBe("failed");

    const configRoot = tempDirectory("homecook-config-parent-root-");
    const configHome = tempDirectory("homecook-config-parent-home-");
    const configOutside = tempDirectory("homecook-config-parent-outside-");
    mkdirSync(join(configOutside, "full-local-supabase"), { mode: 0o700 });
    writeFileSync(join(configOutside, "full-local-supabase", ".env.production.local"), "FULL_LOCAL_COMPOSE_PROJECT_NAME=prod\n", { mode: 0o600 });
    symlinkSync(configOutside, join(configRoot, "infra"));
    const configInventory = await collectReadOnlyProductionInventory({
      adapters: createLocalProductionInventoryAdapters({ rootDir: configRoot, homeDir: configHome }),
      capturedAt: "2026-08-29T10:00:00.000Z",
      probeIdentity: probeIdentity(),
    });
    expect(configInventory.probe_statuses.docker.status).toBe("failed");
    expect(configInventory.probe_statuses.opaque_configs.status).toBe("failed");

    const danglingHome = tempDirectory("homecook-dangling-parent-home-");
    symlinkSync(join(danglingHome, "missing-target"), join(danglingHome, ".homecook"));
    const danglingInventory = await collectReadOnlyProductionInventory({
      adapters: createLocalProductionInventoryAdapters({ rootDir, homeDir: danglingHome }),
      capturedAt: "2026-08-29T10:00:00.000Z",
      probeIdentity: probeIdentity(),
    });
    expect(danglingInventory.probe_statuses.release_artifacts.status).toBe("failed");
  });

  it("detects an absent trusted ancestor created during the probe", async () => {
    const inventoryModule = await import("../scripts/lib/local-mac-production-rehearsal-inventory.mjs");
    expect(inventoryModule.withTrustedProductionAncestors).toBeTypeOf("function");
    const homeDir = tempDirectory("homecook-ancestor-race-");
    const target = join(homeDir, ".homecook", "releases", "current.json");

    expect(() => inventoryModule.withTrustedProductionAncestors([
      { base: homeDir, target, label: "race fixture" },
    ], () => {
      mkdirSync(join(homeDir, ".homecook"), { mode: 0o700 });
      return null;
    })).toThrow(/ancestor|created|changed|race/iu);
  });

  it("canonicalizes the supplied trusted home root before checking descendants", async () => {
    const aliasRoot = tempDirectory("homecook-alias-root-");
    const canonicalHome = join(aliasRoot, "canonical-home");
    mkdirSync(canonicalHome, { mode: 0o700 });
    const aliasHome = join(aliasRoot, "home-alias");
    symlinkSync("canonical-home", aliasHome);
    chmodSync(canonicalHome, 0o700);
    const rootDir = tempDirectory("homecook-canonical-root-");
    const adapters = createLocalProductionInventoryAdapters({ rootDir, homeDir: aliasHome });

    await expect(adapters.readReleaseArtifacts()).resolves.toEqual(expect.any(Array));
    await expect(adapters.readActivePromotionLock()).resolves.toMatchObject({ exists: false });
  });

  it("reads injected allowlisted tool identities even when the trusted executable is hardlinked", async () => {
    const rootDir = tempDirectory("homecook-system-tool-root-");
    const homeDir = tempDirectory("homecook-system-tool-home-");
    const toolRoot = tempDirectory("homecook-tool-fixtures-");
    const sourceTool = join(toolRoot, "source-tool");
    writeFileSync(sourceTool, "fixture-tool", { mode: 0o755 });
    const gitPath = join(toolRoot, "git");
    const launchctlPath = join(toolRoot, "launchctl");
    const lsofPath = join(toolRoot, "lsof");
    linkSync(sourceTool, gitPath);
    linkSync(sourceTool, launchctlPath);
    linkSync(sourceTool, lsofPath);
    const commands: string[] = [];
    const commandRunner = vi.fn((command: string) => {
      commands.push(command);
      return { status: 1, signal: null, stdout: "", stderr: "" };
    });
    const adapters = createLocalProductionInventoryAdapters({
      rootDir,
      homeDir,
      commandRunner,
      trustedToolPaths: { git: gitPath, launchctl: launchctlPath, lsof: lsofPath },
    });

    const identities = await adapters.readToolIdentities();
    expect(identities).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "git", realpath: gitPath }),
      expect.objectContaining({ name: "launchctl", realpath: launchctlPath }),
      expect.objectContaining({ name: "lsof", realpath: lsofPath }),
    ]));
    await expect(adapters.readLaunchd()).rejects.toThrow(/command/iu);
    await expect(adapters.readPortListeners()).resolves.toEqual([]);
    expect(commands).toContain(launchctlPath);
    expect(commands).toContain(lsofPath);
  });

  it("records command errors, signals, and nonzero launchctl as failed without leaking output", async () => {
    const rootDir = tempDirectory("homecook-command-root-");
    const homeDir = tempDirectory("homecook-command-home-");
    const launchctlFailure = vi.fn((command: string) => command === "/bin/launchctl"
      ? { status: 1, signal: null, stdout: "", stderr: "TOP_SECRET_LAUNCHCTL" }
      : { status: 1, signal: null, stdout: "", stderr: "" });
    const launchctlInventory = await collectReadOnlyProductionInventory({
      adapters: createLocalProductionInventoryAdapters({ rootDir, homeDir, commandRunner: launchctlFailure }),
      capturedAt: "2026-08-29T10:00:00.000Z",
      probeIdentity: probeIdentity(),
    });
    expect(launchctlInventory.probe_statuses.launchd.status).toBe("failed");
    expect(canonicalizeJcs(launchctlInventory)).not.toContain("TOP_SECRET");

    const timeoutRunner = vi.fn((command: string) => command === "/usr/sbin/lsof"
      ? { status: null, signal: "SIGTERM", error: new Error("TOP_SECRET_TIMEOUT"), stdout: "", stderr: "TOP_SECRET_STDERR" }
      : { status: 1, signal: null, stdout: "", stderr: "" });
    const timeoutInventory = await collectReadOnlyProductionInventory({
      adapters: createLocalProductionInventoryAdapters({ rootDir, homeDir, commandRunner: timeoutRunner }),
      capturedAt: "2026-08-29T10:00:00.000Z",
      probeIdentity: probeIdentity(),
    });
    expect(timeoutInventory.probe_statuses.port_listeners.status).toBe("failed");
    expect(canonicalizeJcs(timeoutInventory)).not.toMatch(/TOP_SECRET/u);

    const absentRunner = vi.fn((command: string) => command === "/usr/sbin/lsof"
      ? { status: 1, signal: null, stdout: "", stderr: "" }
      : { status: 1, signal: null, stdout: "", stderr: "" });
    const absentInventory = await collectReadOnlyProductionInventory({
      adapters: createLocalProductionInventoryAdapters({ rootDir, homeDir, commandRunner: absentRunner }),
      capturedAt: "2026-08-29T10:00:00.000Z",
      probeIdentity: probeIdentity(),
    });
    expect(absentInventory.probe_statuses.port_listeners).toEqual({
      status: "success",
      reason_code: null,
      evidence_count: 0,
    });
  });

  it("rejects relative, symlinked, public-mode, and repository-contained inventory files", async () => {
    const inventory = await createInventory();
    const artifactRoot = tempDirectory("homecook-inventory-");
    const repoRoot = tempDirectory("homecook-inventory-repo-");
    const inventoryPath = join(artifactRoot, "inventory.json");
    writeFileSync(inventoryPath, canonicalizeJcs(inventory), { mode: 0o600 });

    expect(readCanonicalInventoryFile(inventoryPath, { repoRoot }).inventory_digest).toBe(inventory.inventory_digest);
    expect(() => readCanonicalInventoryFile("inventory.json", { repoRoot })).toThrow(/absolute/iu);
    expect(() => readCanonicalInventoryFile(inventoryPath, { repoRoot, expectedUid: process.getuid!() + 1 })).toThrow(/owner/iu);
    chmodSync(inventoryPath, 0o644);
    expect(() => readCanonicalInventoryFile(inventoryPath, { repoRoot })).toThrow(/0600|mode/iu);
    chmodSync(inventoryPath, 0o600);
    const link = join(artifactRoot, "inventory-link.json");
    symlinkSync(inventoryPath, link);
    expect(() => readCanonicalInventoryFile(link, { repoRoot })).toThrow(/symlink|regular|canonical/iu);
    const inside = join(repoRoot, "inventory.json");
    writeFileSync(inside, canonicalizeJcs(inventory), { mode: 0o600 });
    expect(() => readCanonicalInventoryFile(inside, { repoRoot })).toThrow(/repository|outside/iu);
  });
});

describe("mixed-state classifier", () => {
  it("classifies coherent running evidence as promotion-safe", async () => {
    const inventory = await createInventory();
    const result = classifyProductionInventory(inventory, {
      classifiedAt: "2026-08-29T10:05:00.000Z",
    });

    expect(result.states).toEqual(["coherent_running"]);
    expect(result.promotion_safe).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("marks missing required surfaces and probe failures unknown instead of promotion-safe", async () => {
    const inventory = await createInventory();
    const incompleteSurfaces = {
      ...inventory.surfaces,
      launchd: [],
      docker: { containers: [], networks: [], volumes: [] },
      port_listeners: [],
      opaque_configs: [],
    };
    const incompleteUnsigned = {
      ...inventory,
      surfaces: incompleteSurfaces,
      surface_digest: sha256Jcs(incompleteSurfaces),
    };
    delete (incompleteUnsigned as Record<string, unknown>).inventory_digest;
    const incomplete = { ...incompleteUnsigned, inventory_digest: sha256Jcs(incompleteUnsigned) };
    const result = classifyProductionInventory(incomplete);

    expect(result.states).toContain("unknown");
    expect(result.promotion_safe).toBe(false);

    const { adapters } = createAdapters();
    adapters.readDocker = vi.fn(async () => { throw new Error("TOP_SECRET_DOCKER_FAILURE"); });
    const failed = await collectReadOnlyProductionInventory({
      adapters,
      capturedAt: "2026-08-29T10:00:00.000Z",
      probeIdentity: probeIdentity(),
      approvedMigrationMarker: true,
    });
    expect(failed.probe_statuses.docker).toEqual({
      status: "failed",
      reason_code: "docker_probe_failed",
      evidence_count: 0,
    });
    expect(canonicalizeJcs(failed)).not.toContain("TOP_SECRET");
    expect(classifyProductionInventory(failed).promotion_safe).toBe(false);
  });

  it("requires exact component, descriptor, migration, and prepared identity alignment", async () => {
    const inventory = await createInventory();
    const variants = [
      { workloads: [...inventory.surfaces.workloads, inventory.surfaces.workloads[0]] },
      { workloads: inventory.surfaces.workloads.map((entry: { component: string }) => entry.component === "worker" ? { ...entry, descriptor_digest: SHA_C } : entry) },
      { migration: { ...inventory.surfaces.migration, approved: false } },
      { migration: { ...inventory.surfaces.migration, catalog_head: "different" } },
      {
        release_artifacts: [...inventory.surfaces.release_artifacts, {
          kind: "prepared_descriptor",
          exists: true,
          device: 1,
          inode: 99,
          owner_uid: process.getuid!(),
          mode: 0o600,
          size: 1,
          mtime: "2026-08-29T08:00:00.000Z",
          sha256: SHA_A,
        }],
      },
    ];

    for (const patch of variants) {
      const surfaces = { ...inventory.surfaces, ...patch };
      const unsigned = { ...inventory, surfaces, surface_digest: sha256Jcs(surfaces) };
      delete (unsigned as Record<string, unknown>).inventory_digest;
      const candidate = { ...unsigned, inventory_digest: sha256Jcs(unsigned) };
      const result = classifyProductionInventory(candidate);
      expect(result.promotion_safe, JSON.stringify(patch)).toBe(false);
      expect(result.states, JSON.stringify(patch)).toContain("unknown");
      expect(result.states).not.toContain("coherent_prepared");
    }
  });

  it("requires the exact trusted tool identity set before promotion-safe classification", async () => {
    const inventory = await createInventory();
    const unsigned = {
      ...inventory,
      tool_identities: [],
      probe_statuses: {
        ...inventory.probe_statuses,
        tool_identities: { status: "success", reason_code: null, evidence_count: 0 },
      },
    };
    delete (unsigned as Record<string, unknown>).inventory_digest;
    const forged = { ...unsigned, inventory_digest: sha256Jcs(unsigned) };
    expect(() => classifyProductionInventory(forged)).toThrow(/tool identity|trusted tool|tool set/iu);
  });

  it("records coherent running plus a distinct attested prepared identity, but rejects self-claims", async () => {
    const inventory = await createInventory();
    const withPrepared = (prepared_identity: Record<string, unknown>, includeDescriptor = true) => {
      const preparedDescriptor = {
        kind: "prepared_descriptor",
        exists: true,
        device: 1,
        inode: 90,
        owner_uid: process.getuid!(),
        mode: 0o600,
        size: 100,
        mtime: "2026-08-29T08:00:00.000Z",
        sha256: prepared_identity.descriptor_digest,
      };
      const surfaces = {
        ...inventory.surfaces,
        prepared_identity,
        release_artifacts: includeDescriptor
          ? [...inventory.surfaces.release_artifacts, preparedDescriptor]
          : inventory.surfaces.release_artifacts,
      };
      const unsigned = { ...inventory, surfaces, surface_digest: sha256Jcs(surfaces) };
      delete (unsigned as Record<string, unknown>).inventory_digest;
      return { ...unsigned, inventory_digest: sha256Jcs(unsigned) };
    };
    const distinct = withPrepared({
      attested: true,
      status: "prepared",
      release_sha: RELEASE_B,
      release_tree: RELEASE_B,
      build_id: "build-b",
      sealed_bundle_digest: SHA_C,
      descriptor_digest: SHA_C,
    });
    const distinctResult = classifyProductionInventory(distinct);
    expect(distinctResult.states).toEqual(["coherent_running", "coherent_prepared"]);
    expect(distinctResult.promotion_safe).toBe(true);

    const missingDescriptorResult = classifyProductionInventory(withPrepared({
      attested: true,
      status: "prepared",
      release_sha: RELEASE_B,
      release_tree: RELEASE_B,
      build_id: "build-b",
      sealed_bundle_digest: SHA_C,
      descriptor_digest: SHA_C,
    }, false));
    expect(missingDescriptorResult.promotion_safe).toBe(false);
    expect(missingDescriptorResult.states).toContain("unknown");

    const sameIdentity = withPrepared({
      attested: true,
      status: "prepared",
      release_sha: RELEASE_A,
      release_tree: RELEASE_A,
      build_id: "build-a",
      sealed_bundle_digest: SHA_A,
      descriptor_digest: SHA_C,
    });
    const sameResult = classifyProductionInventory(sameIdentity);
    expect(sameResult.promotion_safe).toBe(false);
    expect(sameResult.states).toContain("unknown");

    const missingAttestation = withPrepared({
      attested: false,
      status: "prepared",
      release_sha: RELEASE_B,
      release_tree: RELEASE_B,
      build_id: "build-b",
      sealed_bundle_digest: SHA_C,
      descriptor_digest: SHA_C,
    });
    expect(() => classifyProductionInventory(missingAttestation)).toThrow(/attested|prepared identity/iu);
  });

  it("classifies Phase-A-shaped mixed evidence with the exact unsafe vocabulary", async () => {
    const inventory = await createInventory({ mixed: true });
    const result = classifyProductionInventory(inventory, {
      classifiedAt: "2026-08-29T10:05:00.000Z",
    });

    expect(result.states).toEqual([
      "mixed_running",
      "partial_failed_install",
      "orphaned_lock_or_descriptor",
      "migration_authority_incomplete",
      "unknown",
    ]);
    expect(result.promotion_safe).toBe(false);
    expect(result.recovery_plan).toHaveLength(5);
    expect(result.recovery_plan.every((entry: unknown) => typeof entry === "object" && entry !== null)).toBe(true);
    expect(() => result.recovery_plan.push({})).toThrow();
  });

  it("never marks mixed, partial, orphaned, migration-incomplete, or unknown evidence safe", async () => {
    const mixed = await createInventory({ mixed: true });
    const unknown = {
      ...await createInventory(),
      surfaces: {
        ...(await createInventory()).surfaces,
        workloads: [],
      },
    };
    unknown.surface_digest = sha256Jcs(unknown.surfaces);
    const unknownUnsigned = { ...unknown };
    delete unknownUnsigned.inventory_digest;
    const unknownInventory = { ...unknownUnsigned, inventory_digest: sha256Jcs(unknownUnsigned) };

    expect(classifyProductionInventory(mixed).promotion_safe).toBe(false);
    const unknownResult = classifyProductionInventory(unknownInventory);
    expect(unknownResult.states).toContain("unknown");
    expect(unknownResult.promotion_safe).toBe(false);
  });

  it("rejects unknown evidence and noncanonical inventory before classification", async () => {
    const inventory = await createInventory();
    const withUnknown = { ...inventory, unexpected_provider_payload: "secret" };

    expect(() => parseAndClassifyProductionInventory(canonicalizeJcs(withUnknown))).toThrow(/unknown|inventory/iu);
    expect(() => parseAndClassifyProductionInventory(`${canonicalizeJcs(inventory)}\n`)).toThrow(/canonical/iu);
  });

  it("keeps closed inventory/classification schemas aligned with runtime fail-closed behavior", async () => {
    const require = createRequire(import.meta.url);
    const eslintPackage = require.resolve("@eslint/eslintrc/package.json");
    const Ajv = require(require.resolve("ajv", { paths: [eslintPackage] }));
    const ajv = new Ajv({ allErrors: true, strict: false });
    const inventorySchema = JSON.parse(readFileSync("scripts/schemas/local-mac-production-rehearsal-inventory.schema.json", "utf8"));
    const classificationSchema = JSON.parse(readFileSync("scripts/schemas/local-mac-production-rehearsal-classification.schema.json", "utf8"));
    const validateInventory = ajv.compile(inventorySchema);
    const validateClassification = ajv.compile(classificationSchema);
    const inventory = await createInventory({ mixed: true });
    const classification = classifyProductionInventory(inventory);

    expect(validateInventory(inventory), JSON.stringify(validateInventory.errors)).toBe(true);
    expect(validateClassification(classification), JSON.stringify(validateClassification.errors)).toBe(true);
    expect(validateInventory({ ...inventory, raw_env: "secret" })).toBe(false);
    expect(validateClassification({ ...classification, promotion_safe: true })).toBe(false);
  });

  it("rejects the same nested inventory attack table in runtime and JSON Schema", async () => {
    const require = createRequire(import.meta.url);
    const eslintPackage = require.resolve("@eslint/eslintrc/package.json");
    const Ajv = require(require.resolve("ajv", { paths: [eslintPackage] }));
    const schema = JSON.parse(readFileSync("scripts/schemas/local-mac-production-rehearsal-inventory.schema.json", "utf8"));
    const ajv = new Ajv({ allErrors: true, strict: false });
    ajv.addFormat("date-time", (value: string) => {
      const milliseconds = Date.parse(value);
      return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
    });
    const validateSchema = ajv.compile(schema);
    const valid = await createInventory();
    const withSurfaces = (surfaces: Record<string, unknown>) => {
      const unsigned = { ...valid, surfaces, surface_digest: sha256Jcs(surfaces) };
      delete (unsigned as Record<string, unknown>).inventory_digest;
      return { ...unsigned, inventory_digest: sha256Jcs(unsigned) };
    };
    const attacks = [
      withSurfaces({ ...valid.surfaces, port_listeners: [{ ...valid.surfaces.port_listeners[0], port: 70_000 }] }),
      withSurfaces({ ...valid.surfaces, launchd: [{ ...valid.surfaces.launchd[0], loaded: "yes" }, ...valid.surfaces.launchd.slice(1)] }),
      withSurfaces({ ...valid.surfaces, docker: { ...valid.surfaces.docker, containers: [{ ...valid.surfaces.docker.containers[0], labels_digest: "bad" }] } }),
      withSurfaces({ ...valid.surfaces, release_artifacts: [{ ...valid.surfaces.release_artifacts[0], size: -1 }, ...valid.surfaces.release_artifacts.slice(1)] }),
      (() => {
        const unsigned = { ...valid, probe_statuses: { ...valid.probe_statuses, docker: { status: "success", reason_code: null, evidence_count: -1 } } };
        delete (unsigned as Record<string, unknown>).inventory_digest;
        return { ...unsigned, inventory_digest: sha256Jcs(unsigned) };
      })(),
      (() => {
        const unsigned = { ...valid, captured_at: "2026-02-30T08:00:00.000Z" };
        delete (unsigned as Record<string, unknown>).inventory_digest;
        return { ...unsigned, inventory_digest: sha256Jcs(unsigned) };
      })(),
      (() => {
        const unsigned = { ...valid, probe_statuses: { ...valid.probe_statuses, docker: { status: "success", reason_code: null, evidence_count: Number.MAX_SAFE_INTEGER + 1 } } };
        delete (unsigned as Record<string, unknown>).inventory_digest;
        return { ...unsigned, inventory_digest: sha256Jcs(unsigned) };
      })(),
    ];

    for (const attack of attacks) {
      let runtimeAccepted = true;
      try {
        validateProductionInventory(attack);
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
});
