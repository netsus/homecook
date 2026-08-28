import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createLocalMacProductionVerifyAdapters,
  readCurrentFullLocalJwksEvidence,
  readCurrentFullLocalDockerGeneration,
  readCurrentFullLocalMigrationHead,
} from "../scripts/lib/local-mac-production-promote-adapters.mjs";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

const manifest = {
  release_sha: "a".repeat(40),
  release_tree: "b".repeat(40),
  build_id: "build-verified",
  promotion_id: "promotion-verified",
  migration_head: "20260811120000_full_local_session_observability.sql",
  full_local_config_sha256: "1".repeat(64),
};

function configSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    path: "/Users/tester/.homecook/full-local/config.env",
    digest: manifest.full_local_config_sha256,
    dev: 1,
    ino: 2,
    size: 128,
    ctimeMs: 10,
    mtimeMs: 10,
    ...overrides,
  };
}

function dockerGeneration(overrides: Record<string, unknown> = {}) {
  return {
    digest: "d".repeat(64),
    postgresContainerId: "a".repeat(64),
    ...overrides,
  };
}

function currentBundle() {
  const identity = {
    ready: true,
    release_sha: manifest.release_sha,
    release_tree: manifest.release_tree,
    build_id: manifest.build_id,
    promotion_id: manifest.promotion_id,
  };
  return {
    stable_key: "current-runtime-stable",
    app: { ...identity },
    full_local: {
      ...identity,
      authorization_contract_status: "PASS",
      healthy: true,
      product_catalog_status: "PASS",
      runtime_present: true,
    },
    youtube_worker: { ...identity },
  };
}

describe("local Mac production verify adapters", () => {
  it("probes JWKS through the exact loopback-only proxy", async () => {
    const root = mkdtempSync(join(tmpdir(), "homecook-verify-auth-"));
    temporaryDirectories.push(root);
    const configPath = join(root, "full-local.env");
    writeFileSync(configPath, "FULL_LOCAL_AUTH_PROXY_PORT=55431\n");
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      expect(url).toBe("http://127.0.0.1:55431/auth/v1/.well-known/jwks.json");
      return new Response(JSON.stringify({ keys: [{ kid: "verified-key", kty: "RSA" }] }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });

    await expect(readCurrentFullLocalJwksEvidence({
      fetchImpl,
      fullLocalConfigPath: configPath,
    })).resolves.toEqual({
      jwksReady: true,
      localOnly: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("queries the single exact production PostgreSQL container in a read-only transaction", () => {
    const root = mkdtempSync(join(tmpdir(), "homecook-verify-migration-"));
    temporaryDirectories.push(root);
    const configPath = join(root, "full-local.env");
    writeFileSync(configPath, "FULL_LOCAL_COMPOSE_PROJECT_NAME=homecook-full-local\n");
    const postgresContainerId = "a".repeat(64);
    const commandRunner = vi.fn((command: string, args: readonly string[], options: {
      input?: string,
    }) => {
      expect(command).toBe("/trusted/docker");
      if (args[0] === "ps") {
        return { status: 0, stdout: `${postgresContainerId}\n`, stderr: "" };
      }
      expect(args).toContain(postgresContainerId);
      expect(options.input).toContain("begin transaction read only");
      expect(options.input).toContain("rollback;");
      return {
        status: 0,
        stdout: `${JSON.stringify({
          migration_head: "20260811120000_full_local_session_observability.sql",
          source: "database_catalog_marker",
        })}\n`,
        stderr: "",
      };
    });

    expect(readCurrentFullLocalMigrationHead({
      commandRunner: commandRunner as unknown as typeof import("node:child_process").spawnSync,
      dockerBin: "/trusted/docker",
      fullLocalConfigPath: configPath,
    })).toEqual({
      migrationHead: "20260811120000_full_local_session_observability.sql",
      migrationHeadSource: "database_catalog_marker",
    });
    expect(commandRunner).toHaveBeenCalledTimes(2);
  });

  it("binds Docker generation to exact container IDs and volume provenance", () => {
    const root = mkdtempSync(join(tmpdir(), "homecook-verify-docker-"));
    temporaryDirectories.push(root);
    const configPath = join(root, "full-local.env");
    writeFileSync(configPath, [
      "FULL_LOCAL_COMPOSE_PROJECT_NAME=homecook-full-local",
      "FULL_LOCAL_POSTGRES_VOLUME_NAME=homecook-postgres",
      "FULL_LOCAL_STORAGE_VOLUME_NAME=homecook-storage",
      "",
    ].join("\n"));
    const services = [
      "api-gateway",
      "auth",
      "auth-proxy",
      "postgres",
      "postgrest",
      "postgrest-probe",
      "storage",
    ];
    const ids = services.map((_, index) => String(index + 1).repeat(64));
    const commandRunner = vi.fn((command: string, args: readonly string[]) => {
      expect(command).toBe("/trusted/docker");
      if (args[0] === "ps") {
        return { status: 0, stdout: `${ids.join("\n")}\n`, stderr: "" };
      }
      if (args[0] === "container") {
        return {
          status: 0,
          stdout: JSON.stringify(ids.map((id, index) => ({
            Id: id,
            Config: {
              Image: `image-${services[index]}@sha256:${"a".repeat(64)}`,
              Labels: {
                "com.docker.compose.project": "homecook-full-local",
                "com.docker.compose.service": services[index],
              },
            },
            State: { Running: true, Status: "running", Health: { Status: "healthy" } },
          }))),
          stderr: "",
        };
      }
      return {
        status: 0,
        stdout: JSON.stringify([
          {
            Name: "homecook-postgres",
            Driver: "local",
            Mountpoint: "/var/lib/docker/volumes/postgres/_data",
            CreatedAt: "2026-08-28T00:00:00Z",
            Labels: {
              "com.docker.compose.project": "homecook-full-local",
              "com.docker.compose.volume": "postgres-data",
            },
          },
          {
            Name: "homecook-storage",
            Driver: "local",
            Mountpoint: "/var/lib/docker/volumes/storage/_data",
            CreatedAt: "2026-08-28T00:00:00Z",
            Labels: {
              "com.docker.compose.project": "homecook-full-local",
              "com.docker.compose.volume": "storage-data",
            },
          },
        ]),
        stderr: "",
      };
    });

    expect(readCurrentFullLocalDockerGeneration({
      commandRunner: commandRunner as unknown as typeof import("node:child_process").spawnSync,
      dockerBin: "/trusted/docker",
      fullLocalConfigPath: configPath,
    })).toMatchObject({
      digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      postgresContainerId: ids[3],
    });
    expect(commandRunner).toHaveBeenCalledTimes(3);
  });

  it("projects successful canonical runtime checks into complete read-only verify evidence", async () => {
    const readCurrentRuntimeBundle = vi.fn(async () => currentBundle());
    const readMigrationHead = vi.fn(() => ({
      migrationHead: manifest.migration_head,
      migrationHeadSource: "database_catalog_marker",
    }));
    const adapters = createLocalMacProductionVerifyAdapters({
      homeDir: "/Users/tester",
      nodeBin: "/usr/local/bin/node",
      rootDir: "/Users/tester/homecook",
    }, {
      readJwksEvidence: async () => ({
        jwksReady: true,
        localOnly: true,
      }),
      readCurrentRuntimeBundle,
      readConfigEvidence: () => configSnapshot(),
      readDockerGeneration: () => dockerGeneration(),
      readMigrationHead,
    });

    await expect(adapters.verifyRuntimeBundle({
      currentDescriptor: manifest,
      homeDir: "/Users/tester",
      manifest,
      releaseDir: "/Users/tester/.homecook/releases/execution/app",
      rootDir: "/Users/tester/homecook",
    })).resolves.toMatchObject({
      app: { release_sha: manifest.release_sha },
      full_local: {
        auth_ready: true,
        docker_ready: true,
        jwks_ready: true,
        local_only: true,
        migration_head: manifest.migration_head,
        migration_head_source: "database_catalog_marker",
        volume_identity_verified: true,
      },
      youtube_worker: { release_sha: manifest.release_sha },
    });
    expect(readCurrentRuntimeBundle).toHaveBeenCalledTimes(2);
    expect(readMigrationHead).toHaveBeenCalledTimes(1);
  });

  it("fails closed instead of projecting incomplete full-local health as verified", async () => {
    const broken = currentBundle();
    broken.full_local.authorization_contract_status = "BLOCKED";
    const adapters = createLocalMacProductionVerifyAdapters({
      homeDir: "/Users/tester",
      nodeBin: "/usr/local/bin/node",
      rootDir: "/Users/tester/homecook",
    }, {
      readCurrentRuntimeBundle: async () => broken,
      readConfigEvidence: () => configSnapshot(),
      readDockerGeneration: () => dockerGeneration(),
      readMigrationHead: () => ({
        migrationHead: manifest.migration_head,
        migrationHeadSource: "database_catalog_marker",
      }),
    });

    await expect(adapters.verifyRuntimeBundle({
      currentDescriptor: manifest,
      homeDir: "/Users/tester",
      manifest,
      releaseDir: "/Users/tester/.homecook/releases/execution/app",
      rootDir: "/Users/tester/homecook",
    })).rejects.toThrow(/full-local|authorization|health/iu);
  });

  it("fails closed when the runtime bundle changes around migration verification", async () => {
    const readCurrentRuntimeBundle = vi.fn()
      .mockResolvedValueOnce(currentBundle())
      .mockResolvedValueOnce({
        ...currentBundle(),
        stable_key: "changed-runtime",
      });
    const adapters = createLocalMacProductionVerifyAdapters({
      homeDir: "/Users/tester",
      nodeBin: "/usr/local/bin/node",
      rootDir: "/Users/tester/homecook",
    }, {
      readJwksEvidence: async () => ({
        jwksReady: true,
        localOnly: true,
      }),
      readCurrentRuntimeBundle,
      readConfigEvidence: () => configSnapshot(),
      readDockerGeneration: () => dockerGeneration(),
      readMigrationHead: () => ({
        migrationHead: manifest.migration_head,
        migrationHeadSource: "database_catalog_marker",
      }),
    });

    await expect(adapters.verifyRuntimeBundle({
      currentDescriptor: manifest,
      homeDir: "/Users/tester",
      manifest,
      releaseDir: "/Users/tester/.homecook/releases/execution/app",
      rootDir: "/Users/tester/homecook",
    })).rejects.toThrow(/runtime.*changed|stable|concurrent/iu);
  });

  it("fails closed when the canonical full-local config changes during verify", async () => {
    const readConfigEvidence = vi.fn()
      .mockReturnValueOnce(configSnapshot())
      .mockReturnValueOnce(configSnapshot({ ctimeMs: 11 }));
    const adapters = createLocalMacProductionVerifyAdapters({
      dockerBin: "/trusted/docker",
      homeDir: "/Users/tester",
      nodeBin: "/trusted/node",
      rootDir: "/Users/tester/homecook",
    }, {
      readConfigEvidence,
      readCurrentRuntimeBundle: async () => currentBundle(),
      readDockerGeneration: () => dockerGeneration(),
      readJwksEvidence: async () => ({ jwksReady: true, localOnly: true }),
      readMigrationHead: () => ({
        migrationHead: manifest.migration_head,
        migrationHeadSource: "database_catalog_marker",
      }),
    });

    await expect(adapters.verifyRuntimeBundle({
      currentDescriptor: manifest,
      homeDir: "/Users/tester",
      manifest,
      releaseDir: "/Users/tester/.homecook/releases/execution/app",
      rootDir: "/Users/tester/homecook",
    })).rejects.toThrow(/config.*changed|config.*drift|config.*digest/iu);
  });

  it("fails closed when Docker container or volume generation changes", async () => {
    const readDockerGeneration = vi.fn()
      .mockReturnValueOnce(dockerGeneration())
      .mockReturnValueOnce(dockerGeneration({ digest: "e".repeat(64) }));
    const adapters = createLocalMacProductionVerifyAdapters({
      dockerBin: "/trusted/docker",
      homeDir: "/Users/tester",
      nodeBin: "/trusted/node",
      rootDir: "/Users/tester/homecook",
    }, {
      readConfigEvidence: () => configSnapshot(),
      readCurrentRuntimeBundle: async () => currentBundle(),
      readDockerGeneration,
      readJwksEvidence: async () => ({ jwksReady: true, localOnly: true }),
      readMigrationHead: () => ({
        migrationHead: manifest.migration_head,
        migrationHeadSource: "database_catalog_marker",
      }),
    });

    await expect(adapters.verifyRuntimeBundle({
      currentDescriptor: manifest,
      homeDir: "/Users/tester",
      manifest,
      releaseDir: "/Users/tester/.homecook/releases/execution/app",
      rootDir: "/Users/tester/homecook",
    })).rejects.toThrow(/Docker.*changed|container.*volume|generation/iu);
  });
});
