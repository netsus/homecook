import { describe, expect, it, vi } from "vitest";

import {
  assertExternalBackupPath,
  assertSafeBackupEntries,
  buildPlatformBackupAuthentication,
  buildPlatformDumpCommands,
  createEncryptedPlatformBackup,
  verifyPlatformBackupMetadata,
  verifyPlatformBackupAuthentication,
  withVerifiedPlatformBackup,
} from "@/scripts/lib/full-local-platform-backup.mjs";

describe("full-local platform backup boundary", () => {
  it("uses the Supabase CLI linked-project flow without credentials in argv", () => {
    const commands = buildPlatformDumpCommands("/tmp/homecook-platform-backup");

    expect(commands).toEqual([
      ["db", "dump", "--linked", "--file", "/tmp/homecook-platform-backup/roles.sql", "--role-only"],
      ["db", "dump", "--linked", "--file", "/tmp/homecook-platform-backup/schema.sql"],
      ["db", "dump", "--linked", "--file", "/tmp/homecook-platform-backup/data.sql", "--use-copy", "--data-only"],
    ]);
    expect(commands.flat()).not.toContain("--db-url");
    expect(commands.flat()).not.toContain("--password");
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

  it("accepts only the exact encrypted bundle entries", () => {
    expect(assertSafeBackupEntries(
      "manifest.json\nroles.sql\nschema.sql\ndata.sanitized.sql\n",
    )).toBe(true);
    expect(() => assertSafeBackupEntries(
      "manifest.json\nroles.sql\nschema.sql\ndata.sanitized.sql\n../secret\n",
    )).toThrow("unexpected entries");
  });

  it("removes plaintext staging even when encryption fails", () => {
    const remove = vi.fn();
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
          if (command === "openssl") throw new Error("encryption failed");
          return "";
        },
        write: vi.fn(),
      },
    })).toThrow("encryption failed");
    expect(remove).toHaveBeenCalledWith(
      "/private/tmp/homecook-platform-secret",
      { force: true, recursive: true },
    );
  });

  it("binds verification to checksums and zero transient promotion", () => {
    const metadata = {
      components: {
        data_sha256: "a".repeat(64),
        roles_sha256: "b".repeat(64),
        schema_sha256: "c".repeat(64),
      },
      format: "homecook-full-local-platform-v1",
      storage_payload_included: false,
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
    })).toBe(true);
    expect(() => verifyPlatformBackupMetadata({
      ...metadata,
      manifest: { ...metadata.manifest, transient_promote_count: 1 },
    }, metadata.components)).toThrow("transient");
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
      components: {
        data_sha256: "a".repeat(64),
        roles_sha256: "b".repeat(64),
        schema_sha256: "c".repeat(64),
      },
      format: "homecook-full-local-platform-v1",
      storage_payload_included: false,
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
            : "c".repeat(64),
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
            ? "manifest.json\nroles.sql\nschema.sql\ndata.sanitized.sql\n"
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
