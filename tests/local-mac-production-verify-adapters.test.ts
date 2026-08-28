import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createLocalMacProductionVerifyAdapters,
  readCurrentFullLocalJwksEvidence,
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
};

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
    const commandRunner = vi.fn((command: string, args: readonly string[], options: {
      input?: string,
    }) => {
      expect(command).toBe("docker");
      if (args[0] === "ps") {
        return { status: 0, stdout: "postgres-container\n", stderr: "" };
      }
      expect(args).toContain("postgres-container");
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
      fullLocalConfigPath: configPath,
    })).toEqual({
      migrationHead: "20260811120000_full_local_session_observability.sql",
      migrationHeadSource: "database_catalog_marker",
    });
    expect(commandRunner).toHaveBeenCalledTimes(2);
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
});
