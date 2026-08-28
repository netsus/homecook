import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
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
        { kind: "current_descriptor", exists: !mixed, device: 1, inode: 11, owner_uid: process.getuid!(), mode: 0o600, size: 10, mtime: "2026-08-29T08:00:00.000Z", sha256: SHA_B },
        { kind: `recovered_lock:${SHA_C}`, exists: mixed, device: 1, inode: 12, owner_uid: process.getuid!(), mode: 0o700, size: 0, mtime: "2026-08-29T08:00:00.000Z", sha256: SHA_C },
      ]),
      readWorkloads: vi.fn(async () => [
        { component: "app", release_sha: RELEASE_A, release_tree: RELEASE_A, build_id: "build-a", sealed_bundle_digest: SHA_A, health: "running", descriptor_digest: SHA_A, provider_payload: "secret-provider-json" },
        { component: "full_local", release_sha: mixed ? RELEASE_B : RELEASE_A, release_tree: mixed ? RELEASE_B : RELEASE_A, build_id: mixed ? "build-b" : "build-a", sealed_bundle_digest: mixed ? SHA_B : SHA_A, health: mixed ? "partial" : "running", descriptor_digest: SHA_B },
        { component: "worker", release_sha: RELEASE_A, release_tree: RELEASE_A, build_id: "build-a", sealed_bundle_digest: SHA_A, health: "running", descriptor_digest: SHA_C },
      ]),
      readLaunchd: vi.fn(async () => [
        { label: "com.homecook.production", loaded: true, state: mixed ? "scheduled" : "running", pid: mixed ? null : 101, projection_digest: SHA_A, environment: { TOKEN: "secret" } },
      ]),
      readDocker: vi.fn(async () => ({
        containers: [{ id: "container-db", name: "homecook-db", project: "homecook", service: "postgres", image_digest: `sha256:${SHA_A}`, state: "running", generation_digest: SHA_A, config_env: ["POSTGRES_PASSWORD=secret"] }],
        networks: [{ id: "network-main", name: "homecook-network", project: "homecook", generation_digest: SHA_B }],
        volumes: [{ name: "homecook-db", project: "homecook", service: "postgres", generation_digest: SHA_C }],
      })),
      readPortListeners: vi.fn(async () => [
        { port: 3100, pid: 101, process_name: "node", listener_digest: SHA_A, command_line: "node --token secret" },
      ]),
      readOpaqueConfigIdentities: vi.fn(async () => [
        { identity: "production-env", sha256: SHA_A, secret_contents: "secret" },
      ]),
      readToolIdentities: vi.fn(async () => [
        { name: "launchctl", ...probeIdentity(), provider_token: "secret" },
        { name: "lsof", ...probeIdentity() },
      ]),
      readMigrationMarker: vi.fn(async () => ({
        approved: true,
        marker_digest: SHA_A,
        global_ledger_digest: mixed ? null : SHA_B,
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
    expect(inventory.tool_identities.map((entry: { name: string }) => entry.name)).toEqual(["launchctl", "lsof"]);
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
      if (args[0] === "ps") return { status: 0, stdout: `prod-id\tprod-db\thomecook-production\tpostgres\tsha256:${SHA_A}\trunning\nother-id\tother-db\tunrelated\tpostgres\tsha256:${SHA_B}\trunning\n` };
      if (args[0] === "network") return { status: 0, stdout: "prod-net\tprod-network\thomecook-production\nother-net\tother-network\tunrelated\n" };
      if (args[0] === "volume") return { status: 0, stdout: "prod-volume\thomecook-production\tpostgres\nother-volume\tunrelated\tpostgres\n" };
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
    }), { mode: 0o600 });
    const adapters = createLocalProductionInventoryAdapters({
      rootDir,
      homeDir,
      approvedMigrationMarkerPath: markerPath,
    });

    await expect(adapters.readMigrationMarker()).rejects.toThrow(/repository|outside/iu);
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
    ]);
    expect(result.promotion_safe).toBe(false);
    expect(result.recovery_plan).toHaveLength(4);
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
});
