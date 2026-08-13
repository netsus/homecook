import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertExternalBackupPath,
  assertSafeBackupEntries,
  buildDockerStorageVolumeCaptureInvocation,
  buildDockerStorageVolumeRestoreInvocation,
  buildPinnedSupabaseCliInvocation,
  buildPlatformBackupAuthentication,
  buildPlatformDumpCommands,
  buildStoragePayloadManifest,
  createEncryptedPlatformBackup,
  createFailSafeConsistentCutController,
  PINNED_SUPABASE_CLI_VERSION,
  restoreVerifiedStoragePayload,
  verifyPlatformBackupMetadata,
  verifyPlatformBackupAuthentication,
  verifyStoragePayloadManifest,
  withVerifiedPlatformBackup,
} from "@/scripts/lib/full-local-platform-backup.mjs";
import {
  makePostgresRoleDumpIdempotent,
  selectFullLocalProductionResources,
} from "@/scripts/lib/full-local-production-resources.mjs";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
  }
});

describe("full-local platform backup boundary", () => {
  it("keeps the Supabase CLI local dump adapter isolated-fixture only", () => {
    const commands = buildPlatformDumpCommands("/tmp/homecook-platform-backup");

    expect(commands).toEqual([
      ["db", "dump", "--local", "--file", "/tmp/homecook-platform-backup/roles.sql", "--role-only"],
      ["db", "dump", "--local", "--file", "/tmp/homecook-platform-backup/schema.sql"],
      ["db", "dump", "--local", "--file", "/tmp/homecook-platform-backup/data.sql", "--use-copy", "--data-only"],
    ]);
    expect(commands.flat()).not.toContain("--linked");
    expect(commands.flat()).not.toContain("--db-url");
    expect(commands.flat()).not.toContain("--password");
  });

  it("binds the production backup entrypoint to the full-local Compose manifest, never the dev CLI stack", () => {
    const entrypoint = readFileSync("scripts/full-local-platform-backup.mjs", "utf8");
    const resolver = readFileSync(
      "scripts/lib/full-local-production-resources.mjs",
      "utf8",
    );
    const productionPath = `${entrypoint}\n${resolver}`;

    expect(productionPath).toContain("FULL_LOCAL_COMPOSE_PROJECT_NAME");
    expect(productionPath).toContain("FULL_LOCAL_POSTGRES_VOLUME_NAME");
    expect(productionPath).toContain("FULL_LOCAL_STORAGE_VOLUME_NAME");
    expect(productionPath).toContain("com.docker.compose.project");
    expect(productionPath).toContain("com.docker.compose.service");
    expect(entrypoint).toContain("dumpFullLocalProductionDatabase");
    expect(productionPath).not.toContain("supabase/config.toml");
    expect(productionPath).not.toContain("supabase_db_");
    expect(productionPath).not.toContain("supabase_storage_");
    expect(productionPath).not.toContain('["db", "dump", "--local"');
  });

  it("selects the exact healthy production stack when a dev Supabase stack also exists", () => {
    const project = "homecook-full-local-isolated";
    const image = `public.ecr.aws/supabase/postgres@sha256:${"a".repeat(64)}`;
    const result = selectFullLocalProductionResources({
      config: {
        FULL_LOCAL_COMPOSE_PROJECT_NAME: project,
        FULL_LOCAL_POSTGRES_IMAGE: image,
        FULL_LOCAL_POSTGRES_VOLUME_NAME: "homecook-full-local-postgres",
        FULL_LOCAL_STORAGE_VOLUME_NAME: "homecook-full-local-storage",
      },
      containers: [
        {
          Config: { Image: "supabase/postgres:dev", Labels: {} },
          Id: "dev-db",
          Name: "/supabase_db_homecook",
          State: { Health: { Status: "healthy" }, Running: true },
        },
        {
          Config: {
            Image: image,
            Labels: {
              "com.docker.compose.project": project,
              "com.docker.compose.service": "postgres",
            },
          },
          Id: "prod-db",
          Name: "/homecook-full-local-isolated-postgres-1",
          State: { Health: { Status: "healthy" }, Running: true },
        },
      ],
      volumes: [
        { Labels: null, Name: "supabase_storage_homecook" },
        {
          Labels: {
            "com.docker.compose.project": project,
            "com.docker.compose.volume": "postgres-data",
          },
          Name: "homecook-full-local-postgres",
        },
        {
          Labels: {
            "com.docker.compose.project": project,
            "com.docker.compose.volume": "storage-data",
          },
          Name: "homecook-full-local-storage",
        },
      ],
    });

    expect(result).toMatchObject({
      postgresContainerId: "prod-db",
      postgresContainerName: "homecook-full-local-isolated-postgres-1",
      storageVolumeName: "homecook-full-local-storage",
    });
  });

  it("makes production role creation safe for a clean image that already owns pinned roles", () => {
    const dump = [
      "CREATE ROLE anon;",
      "ALTER ROLE anon WITH NOSUPERUSER NOLOGIN;",
      'CREATE ROLE "quoted-role";',
      'ALTER ROLE "quoted-role" WITH LOGIN;',
      "",
    ].join("\n");

    const normalized = makePostgresRoleDumpIdempotent(dump);

    expect(normalized).not.toMatch(/^CREATE ROLE /mu);
    expect(normalized).toContain("WHERE rolname = 'anon'");
    expect(normalized).toContain("quote_ident('anon')");
    expect(normalized).toContain("WHERE rolname = 'quoted-role'");
    expect(normalized).toContain("ALTER ROLE anon WITH NOSUPERUSER NOLOGIN;");
    expect(() => makePostgresRoleDumpIdempotent("CREATE ROLE broken role;\n"))
      .toThrow(/unsafe CREATE ROLE/iu);
  });

  it("uses only the exact pinned Supabase CLI package and records its version", () => {
    expect(PINNED_SUPABASE_CLI_VERSION).toBe("2.110.0");
    expect(buildPinnedSupabaseCliInvocation(["--version"])).toEqual({
      args: ["dlx", "supabase@2.110.0", "--version"],
      command: "pnpm",
    });
    expect(buildPinnedSupabaseCliInvocation(["db", "dump", "--local"])).toEqual({
      args: ["dlx", "supabase@2.110.0", "db", "dump", "--local"],
      command: "pnpm",
    });
  });

  it("captures and restores a named local Storage volume with one pinned helper image", () => {
    const capture = buildDockerStorageVolumeCaptureInvocation({
      archiveDirectory: "/private/tmp/homecook-storage-cut",
      volumeName: "homecook-isolated-storage",
    });
    const restore = buildDockerStorageVolumeRestoreInvocation({
      archiveDirectory: "/private/tmp/homecook-storage-cut",
      volumeName: "homecook-isolated-restore",
    });

    for (const invocation of [capture, restore]) {
      expect(invocation.command).toBe("docker");
      expect(invocation.args.join(" ")).toContain(
        "supabase/storage-api@sha256:9326eb9c6b74c0a5ba393ab46a08a51d16bc5ea5f2978fc5b0f17fc67c64a4de",
      );
      expect(invocation.args).toEqual(expect.arrayContaining([
        "--rm",
        "--platform",
        "linux/arm64",
        "--entrypoint",
        "tar",
      ]));
      expect(invocation.args.join(" ")).not.toMatch(/password|secret|credential/iu);
    }
    expect(capture.args.join(" ")).toContain(
      "type=volume,src=homecook-isolated-storage,dst=/source,readonly",
    );
    expect(restore.args.join(" ")).toContain(
      "type=volume,src=homecook-isolated-restore,dst=/destination",
    );
  });

  it("binds local Storage payload bytes, hashes, references, and source identity", () => {
    const root = mkdtempSync(join(tmpdir(), "homecook-storage-payload-"));
    temporaryDirectories.push(root);
    mkdirSync(join(root, "recipe-images", "owner-a"), { recursive: true });
    writeFileSync(join(root, "recipe-images", "owner-a", "one.png"), "image-one");
    writeFileSync(join(root, "recipe-images", "owner-a", "two.png"), "image-two");

    const manifest = buildStoragePayloadManifest({
      references: [
        "recipe-images/owner-a/one.png",
        "recipe-images/owner-a/two.png",
      ],
      sourceDirectory: root,
      sourceIdentity: "docker-volume:homecook-full-local-storage",
    });

    expect(manifest).toMatchObject({
      object_count: 2,
      source_identity: "docker-volume:homecook-full-local-storage",
      total_bytes: 18,
    });
    expect(manifest.catalog_sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(manifest.objects).toEqual([
      expect.objectContaining({
        bytes: 9,
        path: "recipe-images/owner-a/one.png",
        reference: "recipe-images/owner-a/one.png",
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
      }),
      expect.objectContaining({
        bytes: 9,
        path: "recipe-images/owner-a/two.png",
        reference: "recipe-images/owner-a/two.png",
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/u),
      }),
    ]);
    expect(verifyStoragePayloadManifest(manifest, {
      references: manifest.objects.map((object: { reference: string }) => object.reference),
      sourceDirectory: root,
      sourceIdentity: manifest.source_identity,
    })).toBe(true);

    writeFileSync(join(root, "recipe-images", "owner-a", "one.png"), "tampered");
    expect(() => verifyStoragePayloadManifest(manifest, {
      references: manifest.objects.map((object: { reference: string }) => object.reference),
      sourceDirectory: root,
      sourceIdentity: manifest.source_identity,
    })).toThrow(/Storage payload/iu);
  });

  it("keeps the physical Storage path distinct from the database object reference", () => {
    const root = mkdtempSync(join(tmpdir(), "homecook-storage-layout-"));
    temporaryDirectories.push(root);
    mkdirSync(join(root, "stub", "recipe-images", "owner-a", "one.png"), {
      recursive: true,
    });
    writeFileSync(
      join(root, "stub", "recipe-images", "owner-a", "one.png", "version-a"),
      "image-one",
    );

    const manifest = buildStoragePayloadManifest({
      references: [{
        path: "stub/recipe-images/owner-a/one.png/version-a",
        reference: "recipe-images/owner-a/one.png",
      }],
      sourceDirectory: root,
      sourceIdentity: "docker-volume:isolated-storage",
    });

    expect(manifest.objects).toEqual([
      expect.objectContaining({
        path: "stub/recipe-images/owner-a/one.png/version-a",
        reference: "recipe-images/owner-a/one.png",
      }),
    ]);
  });

  it("restores into a clean isolated Storage target and proves bytes, hashes, and references", () => {
    const source = mkdtempSync(join(tmpdir(), "homecook-storage-source-"));
    const destination = mkdtempSync(join(tmpdir(), "homecook-storage-restore-"));
    const archiveRoot = mkdtempSync(join(tmpdir(), "homecook-storage-archive-"));
    temporaryDirectories.push(source, destination, archiveRoot);
    mkdirSync(join(source, "stub", "fixture", "object.bin"), { recursive: true });
    const path = "stub/fixture/object.bin/version-1";
    writeFileSync(join(source, path), "fixture-payload");
    const references = [{ path, reference: "fixture/object.bin" }];
    const manifest = buildStoragePayloadManifest({
      references,
      sourceDirectory: source,
      sourceIdentity: "docker-volume:fixture-source",
    });
    const archive = join(archiveRoot, "storage.payload.tar");
    execFileSync("tar", ["-C", source, "-cf", archive, "."]);

    const evidence = restoreVerifiedStoragePayload({
      destinationDirectory: destination,
      manifest,
      storagePayloadPath: archive,
    });

    expect(readFileSync(join(destination, path), "utf8")).toBe("fixture-payload");
    expect(evidence).toEqual({
      catalog_sha256: manifest.catalog_sha256,
      database_reference_count: 1,
      object_count: 1,
      source_identity: "docker-volume:fixture-source",
      total_bytes: 15,
    });
    expect(() => restoreVerifiedStoragePayload({
      destinationDirectory: destination,
      manifest,
      storagePayloadPath: archive,
    })).toThrow(/clean|empty/iu);
  });

  it("requires encrypted backup output outside the repository", () => {
    expect(() => assertExternalBackupPath({
      output: "/repo/backups/platform.tar.gz.enc",
      repositoryRoot: "/repo",
    })).toThrow("outside the repository");
    expect(() => assertExternalBackupPath({
      output: "/off-mac/platform.tar.gz",
      repositoryRoot: "/repo",
    })).toThrow(".tar.gz.enc");
    expect(assertExternalBackupPath({
      output: "/off-mac/platform.tar.gz.enc",
      repositoryRoot: "/repo",
    })).toBe("/off-mac/platform.tar.gz.enc");
  });

  it("rejects an external-looking backup path whose parent symlink resolves inside the repository", () => {
    const repositoryRoot = mkdtempSync(join(tmpdir(), "homecook-backup-repo-"));
    const externalRoot = mkdtempSync(join(tmpdir(), "homecook-backup-external-"));
    temporaryDirectories.push(repositoryRoot, externalRoot);
    const alias = join(externalRoot, "repository-alias");
    symlinkSync(repositoryRoot, alias, "dir");

    expect(() => assertExternalBackupPath({
      output: join(alias, "platform.tar.gz.enc"),
      repositoryRoot,
    })).toThrow(/real|outside|symbolic/iu);
  });

  it("rejects a symbolic-link archive before authentication or decryption", async () => {
    const externalRoot = mkdtempSync(join(tmpdir(), "homecook-backup-link-"));
    temporaryDirectories.push(externalRoot);
    const target = join(externalRoot, "target.tar.gz.enc");
    const archive = join(externalRoot, "platform.tar.gz.enc");
    writeFileSync(target, "encrypted bytes");
    chmodSync(target, 0o600);
    symlinkSync(target, archive, "file");

    await expect(withVerifiedPlatformBackup({
      archive,
      backupKey: "test-backup-key-with-enough-entropy",
    })).rejects.toThrow(/symbolic link/iu);
  });

  it("rejects a symbolic-link authentication sidecar before decryption", async () => {
    const externalRoot = mkdtempSync(join(tmpdir(), "homecook-backup-auth-link-"));
    temporaryDirectories.push(externalRoot);
    const archive = join(externalRoot, "platform.tar.gz.enc");
    const authenticationTarget = join(externalRoot, "authentication-target.json");
    writeFileSync(archive, "encrypted bytes");
    writeFileSync(authenticationTarget, "{}");
    chmodSync(archive, 0o600);
    chmodSync(authenticationTarget, 0o600);
    symlinkSync(authenticationTarget, `${archive}.auth.json`, "file");

    await expect(withVerifiedPlatformBackup({
      archive,
      backupKey: "test-backup-key-with-enough-entropy",
    })).rejects.toThrow(/authentication.*symbolic link/iu);
  });

  it("requires an authenticated restore-manifest sidecar before readiness recording", () => {
    const backupCli = readFileSync("scripts/full-local-platform-backup.mjs", "utf8");
    const runtimeCli = readFileSync("scripts/full-local-production-runtime.mjs", "utf8");

    expect(runtimeCli).toContain("buildPlatformBackupAuthentication");
    expect(runtimeCli).toContain("platformBackupAuthenticationPath(manifestPath)");
    expect(backupCli).toContain("verifyPlatformBackupAuthentication");
    expect(backupCli).toContain("platformBackupAuthenticationPath(restoreManifestPath)");
  });

  it("rejects a symbolic-link readiness archive before config, Keychain, or digest access", () => {
    const externalRoot = mkdtempSync(join(tmpdir(), "homecook-readiness-link-"));
    temporaryDirectories.push(externalRoot);
    const target = join(externalRoot, "target.tar.gz.enc");
    const archive = join(externalRoot, "platform.tar.gz.enc");
    writeFileSync(target, "encrypted bytes");
    chmodSync(target, 0o600);
    symlinkSync(target, archive, "file");

    const result = spawnSync(process.execPath, [
      "scripts/full-local-platform-backup.mjs",
      "record-readiness",
      "--confirm-off-mac-copy",
      "OFF_MAC_COPY_VERIFIED",
      "--archive",
      archive,
      "--off-mac-copy",
      target,
      "--restore-manifest",
      target,
      "--output",
      join(externalRoot, "readiness.json"),
    ], { cwd: process.cwd(), encoding: "utf8" });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/--archive.*symbolic link/iu);
    expect(result.stderr).not.toMatch(/Keychain|digest|Docker/iu);
  });

  it("accepts only the exact encrypted bundle entries", () => {
    expect(assertSafeBackupEntries(
      "manifest.json\nroles.sql\nschema.sql\ndata.sanitized.sql\nstorage.payload.tar\n",
    )).toBe(true);
    expect(() => assertSafeBackupEntries(
      "manifest.json\nroles.sql\nschema.sql\ndata.sanitized.sql\nstorage.payload.tar\n../secret\n",
    )).toThrow("unexpected entries");
    expect(() => assertSafeBackupEntries(
      "manifest.json\nroles.sql\nschema.sql\ndata.sanitized.sql\n",
    )).toThrow("unexpected entries");
  });

  it("removes plaintext staging even when encryption fails", () => {
    const remove = vi.fn();
    const storageRoot = mkdtempSync(join(tmpdir(), "homecook-storage-empty-"));
    temporaryDirectories.push(storageRoot);
    expect(() => createEncryptedPlatformBackup({
      backupKey: "test-backup-key-with-enough-entropy",
      output: "/off-mac/platform.tar.gz.enc",
      repositoryRoot: "/repo",
      dependencies: {
        chmod: vi.fn(),
        createTempDirectory: () => "/private/tmp/homecook-platform-secret",
        exists: () => false,
        hashFile: () => "a".repeat(64),
        now: () => "2026-08-01T00:00:00.000Z",
        read: (path: string) => path.endsWith("data.sql")
          ? "COPY public.users (id) FROM stdin;\nuser-a\n\\.\n"
          : "sql",
        remove,
        run: (command: string) => {
          if (command === "pnpm") return "2.110.0\n";
          if (command === "openssl") throw new Error("encryption failed");
          return "";
        },
        write: vi.fn(),
      },
      storage: {
        beginConsistentCut: vi.fn(),
        captureSource: vi.fn(),
        endConsistentCut: vi.fn(),
        references: [],
        sourceDirectory: storageRoot,
        sourceIdentity: "fixture:empty-storage",
      },
    })).toThrow("encryption failed");
    expect(remove).toHaveBeenCalledWith(
      "/private/tmp/homecook-platform-secret",
      { force: true, recursive: true },
    );
  });

  it("captures Storage inside the same fail-safe cut as the local database dumps", () => {
    const order: string[] = [];
    const storageRoot = mkdtempSync(join(tmpdir(), "homecook-storage-cut-"));
    temporaryDirectories.push(storageRoot);

    expect(() => createEncryptedPlatformBackup({
      backupKey: "test-backup-key-with-enough-entropy",
      output: "/off-mac/platform.tar.gz.enc",
      repositoryRoot: "/repo",
      dependencies: {
        chmod: vi.fn(),
        createTempDirectory: () => "/private/tmp/homecook-platform-cut",
        exists: () => false,
        hashFile: () => "a".repeat(64),
        now: () => "2026-08-01T00:00:00.000Z",
        read: (path: string) => path.endsWith("data.sql")
          ? "COPY public.users (id) FROM stdin;\nuser-a\n\\.\n"
          : "sql",
        remove: vi.fn(),
        run: (command: string, args: string[]) => {
          if (command === "pnpm" && args.includes("--version")) return "2.110.0\n";
          if (command === "pnpm") order.push("database-dump");
          if (command === "tar" && args.includes("-cf")) order.push("storage-archive");
          if (command === "openssl") throw new Error("stop-after-cut");
          return "";
        },
        write: vi.fn(),
      },
      storage: {
        beginConsistentCut: () => order.push("begin-cut"),
        captureSource: () => order.push("capture-storage"),
        endConsistentCut: () => order.push("end-cut"),
        references: [],
        sourceDirectory: storageRoot,
        sourceIdentity: "fixture:consistent-cut",
      },
    })).toThrow("stop-after-cut");

    expect(order).toEqual([
      "begin-cut",
      "database-dump",
      "database-dump",
      "database-dump",
      "capture-storage",
      "storage-archive",
      "end-cut",
    ]);
  });

  it("restarts the exact successfully stopped writers when a later stop fails", () => {
    const stopped: string[] = [];
    const restarted: string[] = [];
    const cut = createFailSafeConsistentCutController({
      startWriter: (writer: string) => restarted.push(writer),
      stopWriter: (writer: string) => {
        if (writer === "storage") throw new Error("storage stop failed");
        stopped.push(writer);
      },
      writers: ["auth", "storage", "postgrest"],
    });
    const storageRoot = mkdtempSync(join(tmpdir(), "homecook-storage-partial-cut-"));
    temporaryDirectories.push(storageRoot);

    expect(() => createEncryptedPlatformBackup({
      backupKey: "test-backup-key-with-enough-entropy",
      output: "/off-mac/platform.tar.gz.enc",
      repositoryRoot: "/repo",
      dependencies: {
        chmod: vi.fn(),
        createTempDirectory: () => "/private/tmp/homecook-platform-partial-cut",
        exists: () => false,
        hashFile: () => "a".repeat(64),
        now: () => "2026-08-01T00:00:00.000Z",
        read: () => "sql",
        remove: vi.fn(),
        run: (command: string) => command === "pnpm" ? "2.110.0\n" : "",
        write: vi.fn(),
      },
      storage: {
        ...cut,
        captureSource: vi.fn(),
        references: [],
        sourceDirectory: storageRoot,
        sourceIdentity: "fixture:partial-consistent-cut",
      },
    })).toThrow("storage stop failed");

    expect(stopped).toEqual(["auth"]);
    expect(restarted).toEqual(["auth"]);
    expect(cut.stoppedWriters()).toEqual([]);
  });

  it("fails closed unless DB and complete Storage payload checksums are bound", () => {
    const metadata = {
      database: {
        provenance: { adapter: "isolated-supabase-cli-local" },
        source_identity: "isolated-supabase-cli-local",
      },
      components: {
        data_sha256: "a".repeat(64),
        roles_sha256: "b".repeat(64),
        schema_sha256: "c".repeat(64),
        storage_payload_sha256: "e".repeat(64),
      },
      format: "homecook-full-local-platform-v1",
      storage_payload: {
        catalog_sha256: "f".repeat(64),
        object_count: 1,
        objects: [{
          bytes: 9,
          path: "recipe-images/owner-a/one.png",
          reference: "recipe-images/owner-a/one.png",
          sha256: "1".repeat(64),
        }],
        source_identity: "docker-volume:homecook-full-local-storage",
        total_bytes: 9,
      },
      storage_payload_included: true,
      manifest: {
        relation_classification_digest: "d".repeat(64),
        transient_promote_count: 0,
        unclassified: [],
      },
    };
    expect(verifyPlatformBackupMetadata(metadata, {
      data_sha256: "a".repeat(64),
      roles_sha256: "b".repeat(64),
      schema_sha256: "c".repeat(64),
      storage_payload_sha256: "e".repeat(64),
    })).toBe(true);
    expect(() => verifyPlatformBackupMetadata({
      ...metadata,
      manifest: { ...metadata.manifest, transient_promote_count: 1 },
    }, metadata.components)).toThrow("transient");
    expect(() => verifyPlatformBackupMetadata({
      ...metadata,
      storage_payload_included: false,
    }, metadata.components)).toThrow(/Storage payload/iu);
    expect(() => verifyPlatformBackupMetadata({
      ...metadata,
      database: {
        provenance: { adapter: "remote-or-unreviewed-adapter" },
        source_identity: "remote-or-unreviewed-adapter",
      },
    }, metadata.components)).toThrow(/database provenance/iu);
    expect(() => verifyPlatformBackupMetadata({
      ...metadata,
      database: {
        provenance: {
          compose_project: "homecook-full-local-isolated",
          container_name: "homecook-full-local-isolated-postgres-1",
          image: `public.ecr.aws/supabase/postgres@sha256:${"a".repeat(64)}`,
        },
        source_identity: "docker-compose:incomplete",
      },
    }, metadata.components)).toThrow(/database provenance/iu);
  });

  it("authenticates the encrypted archive before decryption", () => {
    const archive = "/off-mac/platform.tar.gz.enc";
    const archiveBytes = Buffer.from("encrypted-platform-archive");
    const backupKey = "test-backup-key-with-enough-entropy";
    const authentication = buildPlatformBackupAuthentication({
      archive,
      archiveBytes,
      backupKey,
    });

    expect(verifyPlatformBackupAuthentication({
      archive,
      archiveBytes,
      authentication,
      backupKey,
    })).toEqual(authentication);
    expect(() => verifyPlatformBackupAuthentication({
      archive,
      archiveBytes: Buffer.from("tampered-platform-archive"),
      authentication,
      backupKey,
    })).toThrow(/authentication/iu);
  });

  it("removes decrypted plaintext when verification consumers fail", async () => {
    const remove = vi.fn();
    const metadata = {
      database: {
        provenance: { adapter: "isolated-supabase-cli-local" },
        source_identity: "isolated-supabase-cli-local",
      },
      components: {
        data_sha256: "a".repeat(64),
        roles_sha256: "b".repeat(64),
        schema_sha256: "c".repeat(64),
        storage_payload_sha256: "e".repeat(64),
      },
      format: "homecook-full-local-platform-v1",
      storage_payload: {
        catalog_sha256: "f".repeat(64),
        object_count: 0,
        objects: [],
        source_identity: "fixture:empty-storage",
        total_bytes: 0,
      },
      storage_payload_included: true,
      manifest: {
        relation_classification_digest: "d".repeat(64),
        transient_promote_count: 0,
        unclassified: [],
      },
    };
    await expect(withVerifiedPlatformBackup({
      archive: "/off-mac/platform.tar.gz.enc",
      backupKey: "test-backup-key-with-enough-entropy",
      consume: () => {
        throw new Error("restore consumer failed");
      },
      dependencies: {
        chmod: vi.fn(),
        createTempDirectory: () => "/private/tmp/homecook-platform-verified",
        exists: () => true,
        hashFile: (path: string) => path.endsWith("data.sanitized.sql")
          ? "a".repeat(64)
          : path.endsWith("roles.sql")
            ? "b".repeat(64)
            : path.endsWith("schema.sql")
              ? "c".repeat(64)
              : "e".repeat(64),
        read: (path: string) => path.endsWith(".auth.json")
          ? JSON.stringify(buildPlatformBackupAuthentication({
              archive: "/off-mac/platform.tar.gz.enc",
              archiveBytes: Buffer.from("encrypted-platform-archive"),
              backupKey: "test-backup-key-with-enough-entropy",
            }))
          : JSON.stringify(metadata),
        readBuffer: () => Buffer.from("encrypted-platform-archive"),
        remove,
        run: (command: string, args: string[]) =>
          command === "tar" && args.includes("-tzf")
            ? "manifest.json\nroles.sql\nschema.sql\ndata.sanitized.sql\nstorage.payload.tar\n"
            : "",
        stat: () => ({ isFile: () => true, mode: 0o100600 }),
      },
    })).rejects.toThrow("restore consumer failed");
    expect(remove).toHaveBeenCalledWith(
      "/private/tmp/homecook-platform-verified",
      { force: true, recursive: true },
    );
  });
});
