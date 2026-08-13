#!/usr/bin/env node

import {
  buildFullLocalBackupKeyRecoveryEvidence,
  openFullLocalBackupKeyEscrow,
  sealFullLocalBackupKeyEscrow,
} from "./lib/full-local-backup-key-recovery.mjs";
import {
  buildPlatformBackupAuthentication,
  verifyPlatformBackupAuthentication,
} from "./lib/full-local-platform-backup.mjs";

if (!process.argv.includes("--execute")) {
  throw new Error("The isolated key recovery drill requires --execute.");
}

const archive = "/replacement-mac/off-mac/platform.tar.gz.enc";
const archiveBytes = Buffer.from("isolated-encrypted-archive-fixture");
const backupKey = "isolated-backup-key-with-at-least-twenty-four-characters";
const recoveryCredential = "independent-credential-manager-fixture-secret";
const envelope = sealFullLocalBackupKeyEscrow({ backupKey, recoveryCredential });
const recoveredKey = openFullLocalBackupKeyEscrow({
  envelope,
  recoveryCredential,
});
const replacementKeychain = new Map([["homecook-full-local-platform-backup", recoveredKey]]);
const authentication = buildPlatformBackupAuthentication({
  archive,
  archiveBytes,
  backupKey,
});
verifyPlatformBackupAuthentication({
  archive,
  archiveBytes,
  authentication,
  backupKey: replacementKeychain.get("homecook-full-local-platform-backup"),
});
const metadataSha256 = "b".repeat(64);
const evidence = buildFullLocalBackupKeyRecoveryEvidence({
  archiveDeviceId: "isolated-off-mac-archive-device",
  archiveSha256: authentication.archive_sha256,
  cleanRestoreVerified: true,
  createdAt: "2026-08-13T08:00:00.000Z",
  escrowDeviceId: "isolated-independent-key-escrow-device",
  expectedMetadataSha256: metadataSha256,
  keychainReregistered:
    replacementKeychain.get("homecook-full-local-platform-backup") === backupKey,
  replacementMachineId: "isolated-replacement-mac",
  restoredArchiveSha256: authentication.archive_sha256,
  restoredMetadataSha256: metadataSha256,
  sourceMachineId: "isolated-source-mac",
});

process.stdout.write(`${JSON.stringify({
  clean_restore_verified: evidence.clean_restore_verified,
  destructive_scope: "isolated-fixture-only",
  keychain_reregistered: evidence.keychain_reregistered,
  media_distinct: evidence.archive_device_id !== evidence.escrow_device_id,
  replacement_machine_verified:
    evidence.source_machine_id !== evidence.replacement_machine_id,
  status: "PASS",
}, null, 2)}\n`);
