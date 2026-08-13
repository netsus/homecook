import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
  buildFullLocalBackupKeyRecoveryEvidence,
  openFullLocalBackupKeyEscrow,
  sealFullLocalBackupKeyEscrow,
} from "@/scripts/lib/full-local-backup-key-recovery.mjs";

const ARCHIVE_SHA = "a".repeat(64);
const METADATA_SHA = "b".repeat(64);

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

  it("issues evidence only for a clean replacement-Mac drill with separate media", () => {
    expect(buildFullLocalBackupKeyRecoveryEvidence({
      archiveDeviceId: "off-mac-archive-device",
      archiveSha256: ARCHIVE_SHA,
      cleanRestoreVerified: true,
      createdAt: "2026-08-13T08:00:00.000Z",
      escrowDeviceId: "independent-key-escrow-device",
      expectedMetadataSha256: METADATA_SHA,
      keychainReregistered: true,
      replacementMachineId: "replacement-mac",
      restoredArchiveSha256: ARCHIVE_SHA,
      restoredMetadataSha256: METADATA_SHA,
      sourceMachineId: "source-mac",
    })).toEqual({
      archive_device_id: "off-mac-archive-device",
      archive_sha256: ARCHIVE_SHA,
      clean_restore_verified: true,
      created_at: "2026-08-13T08:00:00.000Z",
      escrow_device_id: "independent-key-escrow-device",
      format: "homecook-full-local-backup-key-recovery-v1",
      keychain_reregistered: true,
      replacement_machine_id: "replacement-mac",
      restored_metadata_sha256: METADATA_SHA,
      source_machine_id: "source-mac",
    });
  });

  it.each([
    ["same medium", { escrowDeviceId: "off-mac-archive-device" }],
    ["same Mac", { replacementMachineId: "source-mac" }],
    ["missing Keychain registration", { keychainReregistered: false }],
    ["missing clean restore", { cleanRestoreVerified: false }],
    ["wrong restored archive", { restoredArchiveSha256: "c".repeat(64) }],
    ["wrong restored metadata", { restoredMetadataSha256: "c".repeat(64) }],
  ])("fails closed for %s", (_label, override) => {
    expect(() => buildFullLocalBackupKeyRecoveryEvidence({
      archiveDeviceId: "off-mac-archive-device",
      archiveSha256: ARCHIVE_SHA,
      cleanRestoreVerified: true,
      createdAt: "2026-08-13T08:00:00.000Z",
      escrowDeviceId: "independent-key-escrow-device",
      expectedMetadataSha256: METADATA_SHA,
      keychainReregistered: true,
      replacementMachineId: "replacement-mac",
      restoredArchiveSha256: ARCHIVE_SHA,
      restoredMetadataSha256: METADATA_SHA,
      sourceMachineId: "source-mac",
      ...override,
    })).toThrow(/recovery|escrow|replacement|restore|Keychain/iu);
  });

  it("runs a replacement-Mac-compatible isolated key recovery drill", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/run-full-local-backup-key-recovery-drill.mjs", "--execute"],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      clean_restore_verified: true,
      destructive_scope: "isolated-fixture-only",
      keychain_reregistered: true,
      media_distinct: true,
      replacement_machine_verified: true,
      status: "PASS",
    });
  });
});
