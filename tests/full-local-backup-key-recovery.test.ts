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
} from "@/scripts/lib/full-local-backup-key-recovery.mjs";

const ESCROW_SHA = "c".repeat(64);
const ESCROW_PATH = "/Volumes/homecook-key-escrow/platform-key.escrow.json";

describe("full-local backup key recovery", () => {
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
