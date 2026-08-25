import { chmodSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { platformBackupAuthenticationPath } from "@/scripts/lib/full-local-platform-backup.mjs";

function makePrivateDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  chmodSync(directory, 0o700);
  return realpathSync(directory);
}

function makeMode600File(path: string, contents = "fixture") {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, contents, { mode: 0o600 });
  chmodSync(path, 0o600);
}

describe("isolated local backup restore drill regression", () => {
  afterEach(() => {
    vi.doUnmock("node:fs");
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns authenticated recovery manifest outputs for valid external archive inputs", async () => {
    const root = makePrivateDirectory("homecook-drill-valid-");
    const externalRoot = makePrivateDirectory("homecook-drill-valid-ext-");
    const replacementRoot = makePrivateDirectory("homecook-drill-valid-repl-");
    const archive = join(externalRoot, "platform.tar.gz.enc");
    const escrow = join(replacementRoot, "platform-key.escrow.json");
    const credential = join(replacementRoot, "credential.txt");
    const issuerKey = join(replacementRoot, "issuer.pem");
    const restoreManifest = join(replacementRoot, "restore.json");
    const recoveryManifest = join(replacementRoot, "recovery.json");
    const archiveAuth = platformBackupAuthenticationPath(archive);

    for (const path of [archive, escrow, credential, issuerKey]) {
      makeMode600File(path);
    }
    makeMode600File(archiveAuth, "{}\n");

    const archiveDevicePaths = new Set([archive, archiveAuth]);
    const replacementDevicePaths = new Set([
      escrow,
      credential,
      issuerKey,
      replacementRoot,
    ]);

    vi.doMock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");

      return {
        ...actual,
        statSync(path: Parameters<typeof actual.statSync>[0], options?: Parameters<typeof actual.statSync>[1]) {
          const stats = actual.statSync(path, options as never);
          const normalizedPath = String(path);
          const dev = archiveDevicePaths.has(normalizedPath)
            ? 101
            : replacementDevicePaths.has(normalizedPath)
              ? 202
              : stats.dev;

          if (dev === stats.dev) {
            return stats;
          }

          return Object.assign(
            Object.create(Object.getPrototypeOf(stats)),
            stats,
            { dev },
          );
        },
      };
    });

    const { validateExternalArchiveDrillOptions } = await import(
      "@/scripts/lib/isolated-local-backup-restore-drill.mjs"
    );

    expect(validateExternalArchiveDrillOptions({
      args: [
        "--external-archive",
        archive,
        "--escrow-envelope",
        escrow,
        "--recovery-credential-file",
        credential,
        "--recovery-issuer-private-key",
        issuerKey,
        "--restore-manifest",
        restoreManifest,
        "--recovery-manifest",
        recoveryManifest,
      ],
      repositoryRoot: root,
    })).toMatchObject({
      archive_authentication_path: archiveAuth,
      external_archive: archive,
      recovery_manifest: {
        authentication_path: platformBackupAuthenticationPath(recoveryManifest),
        path: recoveryManifest,
      },
      restore_manifest: {
        authentication_path: platformBackupAuthenticationPath(restoreManifest),
        path: restoreManifest,
      },
    });
  });
});
