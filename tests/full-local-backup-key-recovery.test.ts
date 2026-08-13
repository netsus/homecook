import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  createIsolatedKeychainAdapter,
  openFullLocalBackupKeyEscrow,
  sealFullLocalBackupKeyEscrow,
  signFullLocalBackupKeyRecoveryEvidence,
  verifyFullLocalBackupKeyEscrowBinding,
  verifyFullLocalBackupKeyRecoveryIssuerAttestation,
  withRecoveredBackupKeyCreateOnlyRegistration,
} from "@/scripts/lib/full-local-backup-key-recovery.mjs";

const ESCROW_SHA = "c".repeat(64);
const ESCROW_PATH = "/Volumes/homecook-key-escrow/platform-key.escrow.json";

describe("full-local backup key recovery", () => {
  it("rejects an existing direct platform backup account before archive verification", async () => {
    const calls: string[] = [];

    await expect(withRecoveredBackupKeyCreateOnlyRegistration({
      createItem: () => calls.push("create"),
      deleteOwnedItem: () => calls.push("delete"),
      directItemExists: () => true,
      execute: () => calls.push("execute"),
      ownershipToken: () => "attempt-token",
      readOwnedItem: () => "original-source-key",
      recoveredKey: "recovered-backup-key-with-at-least-twenty-four-characters",
      verifyArchive: () => calls.push("verify"),
    })).rejects.toThrow(/already exists|source backup Keychain/iu);
    expect(calls).toEqual([]);
  });

  it("does not confuse a chunk-count account with the direct platform backup account", async () => {
    const calls: string[] = [];
    const recoveredKey = "recovered-backup-key-with-at-least-twenty-four-characters";
    const accounts = new Set(["platform-backup-encryption-key__count"]);

    await expect(withRecoveredBackupKeyCreateOnlyRegistration({
      createItem: () => calls.push("create"),
      deleteOwnedItem: () => calls.push("delete"),
      directItemExists: () => accounts.has("platform-backup-encryption-key"),
      execute: () => calls.push("execute"),
      ownershipToken: () => "attempt-token",
      readOwnedItem: () => recoveredKey,
      recoveredKey,
      verifyArchive: () => calls.push("verify"),
    })).resolves.toBe(3);
    expect(calls).toEqual(["verify", "create", "execute"]);
  });

  it("fails closed when another process creates the direct item after the precheck", async () => {
    let directItem: string | null = "competitor-owned-original-key";

    let deleteCalled = false;
    await expect(withRecoveredBackupKeyCreateOnlyRegistration({
      createItem: () => {
        if (directItem !== null) {
          throw new Error("Keychain item already exists");
        }
        directItem = "overwritten";
      },
      deleteOwnedItem: () => {
        deleteCalled = true;
      },
      directItemExists: () => false,
      execute: () => undefined,
      ownershipToken: () => "attempt-token",
      readOwnedItem: () => directItem ?? "",
      recoveredKey: "recovered-backup-key-with-at-least-twenty-four-characters",
      verifyArchive: () => undefined,
    })).rejects.toThrow(/already exists/iu);
    expect(directItem).toBe("competitor-owned-original-key");
    expect(deleteCalled).toBe(false);
  });

  it("never persists a recovered key when archive authentication fails", async () => {
    let original = "original-key-remains-untouched";
    let createCalled = false;

    await expect(withRecoveredBackupKeyCreateOnlyRegistration({
      createItem: () => {
        createCalled = true;
        original = "overwritten";
      },
      deleteOwnedItem: () => undefined,
      directItemExists: () => false,
      execute: () => undefined,
      ownershipToken: () => "attempt-token",
      readOwnedItem: () => original,
      recoveredKey: "mismatched-recovered-key-with-at-least-twenty-four-characters",
      verifyArchive: () => {
        throw new Error("archive authentication failed");
      },
    })).rejects.toThrow(/archive authentication/iu);
    expect(createCalled).toBe(false);
    expect(original).toBe("original-key-remains-untouched");
  });

  it.each(["compose", "database", "storage", "signing"])(
    "rolls back its exact owned item after %s failure and permits retry",
    async (failureStage) => {
      const recoveredKey = "recovered-backup-key-with-at-least-twenty-four-characters";
      let directItem: { key: string; token: string } | null = null;
      let attempts = 0;
      const runAttempt = () => withRecoveredBackupKeyCreateOnlyRegistration({
        createItem: (key: string, token: string) => {
          if (directItem) throw new Error("direct item already exists");
          directItem = { key, token };
        },
        deleteOwnedItem: (token: string) => {
          if (directItem?.token !== token) throw new Error("ownership mismatch");
          directItem = null;
        },
        directItemExists: () => directItem !== null,
        execute: () => {
          attempts += 1;
          if (attempts === 1) throw new Error(`${failureStage} restore failure`);
          return "restored";
        },
        ownershipToken: () => `attempt-token-${attempts}`,
        readOwnedItem: (token: string) => directItem?.token === token
          ? directItem.key
          : "",
        recoveredKey,
        verifyArchive: () => undefined,
      });

      await expect(runAttempt()).rejects.toThrow(new RegExp(failureStage, "iu"));
      expect(directItem).toBeNull();
      await expect(runAttempt()).resolves.toBe("restored");
      expect(directItem).toEqual(expect.objectContaining({ key: recoveredKey }));
    },
  );

  it("fails closed with explicit manual recovery when owned cleanup fails", async () => {
    const recoveredKey = "recovered-backup-key-with-at-least-twenty-four-characters";

    await expect(withRecoveredBackupKeyCreateOnlyRegistration({
      createItem: () => undefined,
      deleteOwnedItem: () => {
        throw new Error("Keychain unavailable");
      },
      directItemExists: () => false,
      execute: () => {
        throw new Error("storage restore failed");
      },
      ownershipToken: () => "attempt-token",
      readOwnedItem: () => recoveredKey,
      recoveredKey,
      verifyArchive: () => undefined,
    })).rejects.toThrow(/cleanup failed.*manual recovery required/iu);
  });

  it("never deletes an item whose attempt ownership or recovered value changed", async () => {
    let deleteCalled = false;

    await expect(withRecoveredBackupKeyCreateOnlyRegistration({
      createItem: () => undefined,
      deleteOwnedItem: () => {
        deleteCalled = true;
      },
      directItemExists: () => false,
      execute: () => {
        throw new Error("database restore failed");
      },
      ownershipToken: () => "attempt-token",
      readOwnedItem: () => "competitor-replaced-key-with-at-least-twenty-four-chars",
      recoveredKey: "recovered-backup-key-with-at-least-twenty-four-characters",
      verifyArchive: () => undefined,
    })).rejects.toThrow(/cleanup failed.*manual recovery required/iu);
    expect(deleteCalled).toBe(false);
  });

  it("keeps the attempt-owned item after a successful restore", async () => {
    const recoveredKey = "recovered-backup-key-with-at-least-twenty-four-characters";
    let deleted = false;

    await expect(withRecoveredBackupKeyCreateOnlyRegistration({
      createItem: () => undefined,
      deleteOwnedItem: () => {
        deleted = true;
      },
      directItemExists: () => false,
      execute: () => "restored",
      ownershipToken: () => "attempt-token",
      readOwnedItem: () => recoveredKey,
      recoveredKey,
      verifyArchive: () => undefined,
    })).resolves.toBe("restored");
    expect(deleted).toBe(false);
  });

  it("recovers the archive key from an authenticated escrow envelope", () => {
    const backupKey = "backup-key-with-at-least-twenty-four-characters";
    const recoveryCredential = "independent-credential-manager-secret";
    const envelope = sealFullLocalBackupKeyEscrow({ backupKey, recoveryCredential });

    expect(openFullLocalBackupKeyEscrow({ envelope, recoveryCredential }))
      .toBe(backupKey);
    expect(() => openFullLocalBackupKeyEscrow({
      envelope: { ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -2)}aa` },
      recoveryCredential,
    })).toThrow(/escrow|authentication|decrypt/iu);
  });

  it("accepts only recovery evidence signed by the issuer pinned in the escrow", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const envelope = sealFullLocalBackupKeyEscrow({
      backupKey: "backup-key-with-at-least-twenty-four-characters",
      recoveryCredential: "independent-credential-manager-secret",
      recoveryIssuerPublicKey: publicKey,
    });
    const evidence = signFullLocalBackupKeyRecoveryEvidence({
      evidence: {
        archive_sha256: "a".repeat(64),
        clean_restore_verified: true,
        restored_metadata_sha256: "b".repeat(64),
      },
      privateKey,
    });

    expect(verifyFullLocalBackupKeyRecoveryIssuerAttestation({
      envelope,
      evidence,
    })).toBe(true);
    expect(() => verifyFullLocalBackupKeyRecoveryIssuerAttestation({
      envelope,
      evidence: { ...evidence, clean_restore_verified: false },
    })).toThrow(/issuer|attestation|signature/iu);
    expect(() => verifyFullLocalBackupKeyRecoveryIssuerAttestation({
      envelope,
      evidence: {
        ...evidence,
        issuer_attestation: undefined,
      },
    })).toThrow(/issuer|attestation|signature/iu);
  });

  it("registers and reads the recovered key through an isolated Keychain adapter", () => {
    const directory = mkdtempSync(join(tmpdir(), "homecook-isolated-keychain-test-"));
    const adapter = createIsolatedKeychainAdapter({ directory });
    const secret = "recovered-backup-key-with-at-least-twenty-four-characters";

    adapter.register("platform-backup", secret);

    expect(adapter.read("platform-backup")).toBe(secret);
    expect(statSync(directory).mode & 0o777).toBe(0o700);
    expect(statSync(join(directory, "platform-backup.secret")).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(directory, "platform-backup.secret"), "utf8")).toBe(secret);
  });

  it.each([
    ["deleted envelope", { observedPath: undefined }],
    ["mutated envelope", { observedSha256: "e".repeat(64) }],
    ["path substitution", { observedPath: "/Volumes/other/platform-key.escrow.json" }],
    ["same archive device", { observedDeviceId: "archive-device" }],
  ])("rejects %s before readiness", (_label, override) => {
    expect(() => verifyFullLocalBackupKeyEscrowBinding({
      archiveDeviceIds: ["archive-device", "copy-device"],
      manifest: {
        escrow_device_id: "escrow-device",
        escrow_envelope_path: ESCROW_PATH,
        escrow_envelope_sha256: ESCROW_SHA,
      },
      observedDeviceId: "escrow-device",
      observedPath: ESCROW_PATH,
      observedSha256: ESCROW_SHA,
      ...override,
    })).toThrow(/escrow|envelope|device|path/iu);
  });

  it("accepts only an exact independent escrow artifact binding", () => {
    expect(verifyFullLocalBackupKeyEscrowBinding({
      archiveDeviceIds: ["archive-device", "copy-device"],
      manifest: {
        escrow_device_id: "escrow-device",
        escrow_envelope_path: ESCROW_PATH,
        escrow_envelope_sha256: ESCROW_SHA,
      },
      observedDeviceId: "escrow-device",
      observedPath: ESCROW_PATH,
      observedSha256: ESCROW_SHA,
    })).toBe(true);
  });

  it("delegates the recovery drill to the actual encrypted Docker backup/restore chain", () => {
    const script = readFileSync(
      "scripts/run-full-local-backup-key-recovery-drill.mjs",
      "utf8",
    );
    expect(script).toContain("run-isolated-local-backup-restore-drill.mjs");
    expect(script).toContain("--key-recovery");
    expect(script).not.toMatch(/new Map|cleanRestoreVerified:\s*true|isolated-encrypted-archive-fixture/iu);
  });
});
