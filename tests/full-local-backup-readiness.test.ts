import {
  chmodSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  assertPrivateArtifactParent,
  buildFullLocalBackupReadinessEvidence,
  fullLocalBackupMetadataSha256,
  authenticateFullLocalBackupArchives,
  assertRegularReadinessArtifact,
  verifyFullLocalBackupReadiness,
} from "@/scripts/lib/full-local-backup-readiness.mjs";
import {
  sealFullLocalBackupKeyEscrow,
  signFullLocalBackupKeyRecoveryEvidence,
} from "@/scripts/lib/full-local-backup-key-recovery.mjs";

const NOW = Date.parse("2026-08-13T08:00:00.000Z");
const SHA = "a".repeat(64);

function validBackupMetadata() {
  return {
    components: {
      data_sha256: "e".repeat(64),
      roles_sha256: "f".repeat(64),
      schema_sha256: "0".repeat(64),
    },
    created_at: "2026-08-13T07:00:00.000Z",
    database: {
      provenance: {
        compose_project: "homecook-full-local-isolated",
        container_name: "homecook-full-local-isolated-postgres-1",
        image: `public.ecr.aws/supabase/postgres@sha256:${"b".repeat(64)}`,
        postgres_volume: "homecook-full-local-postgres",
      },
    },
    manifest: {
      relation_classification_digest: "4".repeat(64),
      unclassified: [],
    },
    storage_payload: {
      catalog_sha256: "d".repeat(64),
      object_count: 1,
      source_identity:
        "docker-compose-volume:homecook-full-local-isolated:homecook-full-local-storage",
      total_bytes: 36,
    },
    storage_payload_included: true,
  };
}

const METADATA_SHA = fullLocalBackupMetadataSha256(validBackupMetadata());
const RECOVERY_ISSUER = generateKeyPairSync("ed25519");
const RECOVERY_ENVELOPE = sealFullLocalBackupKeyEscrow({
  backupKey: "backup-key-with-at-least-twenty-four-characters",
  recoveryCredential: "independent-credential-manager-secret",
  recoveryIssuerPublicKey: RECOVERY_ISSUER.publicKey,
});

function validRecoveryManifest() {
  return signFullLocalBackupKeyRecoveryEvidence({
    evidence: {
      archive_device_id: "11",
      archive_sha256: SHA,
      clean_restore_verified: true,
      created_at: "2026-08-13T07:10:00.000Z",
      escrow_device_id: "12",
      escrow_envelope_path: "/Volumes/homecook-key-escrow/platform-key.escrow.json",
      escrow_envelope_sha256: "c".repeat(64),
      format: "homecook-full-local-backup-key-recovery-v1",
      keychain_reregistered: true,
      keychain_registration: {
        account: "platform-backup",
        adapter: "isolated-filesystem-keychain-adapter-v1",
        key_sha256: "8".repeat(64),
      },
      isolated_replacement_environment_verified: true,
      restored_metadata_sha256: METADATA_SHA,
      restore_manifest_path: "/Volumes/homecook-restore/restore.json",
      restore_manifest_sha256: "6".repeat(64),
    },
    privateKey: RECOVERY_ISSUER.privateKey,
  });
}

function validEvidence() {
  return {
    backup: {
      archive_path: "/Volumes/homecook-off-mac/platform.tar.gz.enc",
      archive_sha256: SHA,
      created_at: "2026-08-13T07:00:00.000Z",
      data_sha256: "e".repeat(64),
      metadata_sha256: METADATA_SHA,
      relation_classification_digest: "4".repeat(64),
      roles_sha256: "f".repeat(64),
      schema_sha256: "0".repeat(64),
    },
    format: "homecook-full-local-backup-readiness-v1",
    key_recovery: {
      ...validRecoveryManifest(),
      evidence_path: "/Volumes/homecook-key-escrow/recovery.json",
      evidence_sha256: "7".repeat(64),
    },
    off_mac_copy: {
      archive_path: "/Volumes/homecook-off-mac/platform-copy.tar.gz.enc",
      archive_sha256: SHA,
      verified_at: "2026-08-13T07:30:00.000Z",
    },
    production: {
      compose_project: "homecook-full-local-isolated",
      container_name: "homecook-full-local-isolated-postgres-1",
      image: `public.ecr.aws/supabase/postgres@sha256:${"b".repeat(64)}`,
      postgres_volume: "homecook-full-local-postgres",
      storage_volume: "homecook-full-local-storage",
    },
    restore: {
      auth_identity_digest: "1".repeat(64),
      auth_identities: 1,
      auth_users: 1,
      database_digest: "2".repeat(64),
      database_data_sha256: "e".repeat(64),
      database_reference_count: 1,
      execution: "clean-isolated-restore-platform-v1",
      fresh_target_attested: true,
      object_count: 1,
      payload_catalog_sha256: "d".repeat(64),
      public_relation_count: 1,
      relation_classification_digest: "4".repeat(64),
      manifest_path: "/Volumes/homecook-restore/restore.json",
      manifest_sha256: "6".repeat(64),
      source_archive_sha256: SHA,
      source_data_sha256: "e".repeat(64),
      source_roles_sha256: "f".repeat(64),
      source_schema_sha256: "0".repeat(64),
      storage_bucket_count: 1,
      storage_digest: "3".repeat(64),
      storage_object_count: 1,
      storage_payload_included: true,
      storage_referenced_object_count: 1,
      target_compose_project: "homecook-full-local-restore-drill",
      target_storage_volume: "homecook-full-local-restore-storage",
      total_bytes: 36,
      unclassified_count: 0,
      verified_at: "2026-08-13T07:20:00.000Z",
    },
  };
}

describe("full-local backup readiness", () => {
  it("authenticates and decrypts both primary and off-Mac archives at every gate", async () => {
    const evidence = validEvidence();
    const metadata = { format: "homecook-full-local-platform-v1" };
    const verifyArchive = vi.fn(async () => metadata);

    await expect(authenticateFullLocalBackupArchives({ evidence, verifyArchive }))
      .resolves.toEqual(metadata);
    expect(verifyArchive).toHaveBeenNthCalledWith(
      1,
      evidence.backup.archive_path,
    );
    expect(verifyArchive).toHaveBeenNthCalledWith(
      2,
      evidence.off_mac_copy.archive_path,
    );

    await expect(authenticateFullLocalBackupArchives({
      evidence,
      verifyArchive: async () => {
        throw new Error("archive authentication sidecar or Keychain key is missing");
      },
    })).rejects.toThrow(/authentication|sidecar|Keychain/iu);
  });

  it("rejects symlinked readiness and archive artifacts", () => {
    const directory = mkdtempSync(join(tmpdir(), "homecook-readiness-symlink-"));
    const target = join(directory, "target.json");
    const link = join(directory, "readiness.json");
    writeFileSync(target, "{}\n", { mode: 0o600 });
    chmodSync(target, 0o600);
    symlinkSync(target, link);

    expect(() => assertRegularReadinessArtifact(link)).toThrow(/symlink/iu);
    expect(assertRegularReadinessArtifact(target)).toEqual(realpathSync(target));
  });

  it("requires canonical owner-controlled mode 0700 artifact parents", () => {
    const directory = realpathSync(
      mkdtempSync(join(tmpdir(), "homecook-private-parent-")),
    );
    const artifact = join(directory, "artifact.enc");
    writeFileSync(artifact, "fixture", { mode: 0o600 });
    chmodSync(directory, 0o700);
    expect(assertPrivateArtifactParent(artifact)).toEqual(realpathSync(directory));

    chmodSync(directory, 0o755);
    expect(() => assertPrivateArtifactParent(artifact)).toThrow(/0700|owner/iu);
  });

  it("builds readiness only from one authenticated archive and complete restore manifest", () => {
    expect(buildFullLocalBackupReadinessEvidence({
      archivePath: "/Volumes/homecook-off-mac/platform.tar.gz.enc",
      archiveSha256: SHA,
      backupMetadata: validBackupMetadata(),
      now: "2026-08-13T07:30:00.000Z",
      keyRecoveryEscrowEnvelope: RECOVERY_ENVELOPE,
      keyRecoveryManifest: validRecoveryManifest(),
      keyRecoveryManifestPath: "/Volumes/homecook-key-escrow/recovery.json",
      keyRecoveryManifestSha256: "7".repeat(64),
      offMacCopyPath: "/Volumes/homecook-off-mac/platform-copy.tar.gz.enc",
      offMacCopySha256: SHA,
      restoreManifestPath: "/Volumes/homecook-restore/restore.json",
      restoreManifestSha256: "6".repeat(64),
      restoreManifest: {
        auth_identity_digest: "1".repeat(64),
        auth_identities: 1,
        auth_users: 1,
        created_at: "2026-08-13T07:20:00.000Z",
        compose_project: "homecook-full-local-restore-drill",
        database_digest: "2".repeat(64),
        format: "homecook-full-local-restore-v1",
        fresh_target_attested: true,
        postgres_volume: "homecook-full-local-restore-postgres",
        public_relation_count: 1,
        relation_classification_digest: "4".repeat(64),
        restore_execution: "clean-isolated-restore-platform-v1",
        restored_data_sha256: "e".repeat(64),
        source_archive_sha256: SHA,
        source_data_sha256: "e".repeat(64),
        source_roles_sha256: "f".repeat(64),
        source_schema_sha256: "0".repeat(64),
        storage_digest: "3".repeat(64),
        storage_bucket_count: 1,
        storage_object_count: 1,
        storage_payload_catalog_sha256: "d".repeat(64),
        storage_payload_object_count: 1,
        storage_payload_total_bytes: 36,
        storage_reference_count: 1,
        storage_referenced_object_count: 1,
        storage_volume: "homecook-full-local-restore-storage",
        unclassified_count: 0,
      },
    })).toEqual(validEvidence());
  });

  it("accepts only recent backup, distinct off-Mac copy, and clean restore evidence for the exact production stack", () => {
    expect(verifyFullLocalBackupReadiness({
      authenticatedBackupMetadataSha256: METADATA_SHA,
      evidence: validEvidence(),
      evidenceFileMode: 0o600,
      nowMs: NOW,
      observedEscrowFiles: {
        "/Volumes/homecook-key-escrow/platform-key.escrow.json": "c".repeat(64),
      },
      observedFiles: {
        "/Volumes/homecook-off-mac/platform.tar.gz.enc": SHA,
        "/Volumes/homecook-off-mac/platform-copy.tar.gz.enc": SHA,
      },
      production: {
        composeProject: "homecook-full-local-isolated",
        postgresContainerName: "homecook-full-local-isolated-postgres-1",
        postgresImage: `public.ecr.aws/supabase/postgres@sha256:${"b".repeat(64)}`,
        postgresVolumeName: "homecook-full-local-postgres",
        storageVolumeName: "homecook-full-local-storage",
      },
    })).toEqual(expect.objectContaining({
      backup_age_hours: 1,
      off_mac_copy_verified: true,
      restore_age_hours: 2 / 3,
      status: "PASS",
    }));
  });

  it.each([
    ["stale backup", { backup: { created_at: "2026-08-11T07:00:00.000Z" } }],
    ["missing Storage payload proof", { restore: { storage_payload_included: false } }],
    ["wrong restore archive", { restore: { source_archive_sha256: "c".repeat(64) } }],
    ["unproven restore execution", { restore: { execution: "verification-only" } }],
    ["missing fresh target attestation", { restore: { fresh_target_attested: false } }],
    ["wrong restored DB/Auth data", { restore: { database_data_sha256: "c".repeat(64) } }],
    ["missing Auth digest", { restore: { auth_identity_digest: null } }],
    ["wrong archive roles component", { restore: { source_roles_sha256: "c".repeat(64) } }],
    ["wrong authenticated metadata binding", { backup: { metadata_sha256: "c".repeat(64) } }],
    ["missing signed restore path", { restore: { manifest_path: null } }],
    ["missing replacement-Mac key recovery", { key_recovery: { clean_restore_verified: false } }],
    ["same-path copy", { off_mac_copy: { archive_path: "/Volumes/homecook-off-mac/platform.tar.gz.enc" } }],
    ["wrong production volume", { production: { storage_volume: "supabase_storage_homecook" } }],
  ])("fails closed for %s", (_label, override) => {
    const evidence = validEvidence();
    for (const [section, values] of Object.entries(override)) {
      Object.assign(evidence[section as keyof ReturnType<typeof validEvidence>], values);
    }
    expect(() => verifyFullLocalBackupReadiness({
      authenticatedBackupMetadataSha256: METADATA_SHA,
      evidence,
      evidenceFileMode: 0o600,
      nowMs: NOW,
      observedEscrowFiles: {
        "/Volumes/homecook-key-escrow/platform-key.escrow.json": "c".repeat(64),
      },
      observedFiles: {
        "/Volumes/homecook-off-mac/platform.tar.gz.enc": SHA,
        "/Volumes/homecook-off-mac/platform-copy.tar.gz.enc": SHA,
      },
      production: {
        composeProject: "homecook-full-local-isolated",
        postgresContainerName: "homecook-full-local-isolated-postgres-1",
        postgresImage: `public.ecr.aws/supabase/postgres@sha256:${"b".repeat(64)}`,
        postgresVolumeName: "homecook-full-local-postgres",
        storageVolumeName: "homecook-full-local-storage",
      },
    })).toThrow(/readiness|backup|restore|off-Mac|production/iu);
  });

  it.each([
    ["deleted escrow envelope", {}],
    ["mutated escrow envelope", {
      "/Volumes/homecook-key-escrow/platform-key.escrow.json": "d".repeat(64),
    }],
  ])("fails closed for %s", (_label, observedEscrowFiles) => {
    expect(() => verifyFullLocalBackupReadiness({
      authenticatedBackupMetadataSha256: METADATA_SHA,
      evidence: validEvidence(),
      evidenceFileMode: 0o600,
      nowMs: NOW,
      observedEscrowFiles,
      observedFiles: {
        "/Volumes/homecook-off-mac/platform.tar.gz.enc": SHA,
        "/Volumes/homecook-off-mac/platform-copy.tar.gz.enc": SHA,
      },
      production: {
        composeProject: "homecook-full-local-isolated",
        postgresContainerName: "homecook-full-local-isolated-postgres-1",
        postgresImage: `public.ecr.aws/supabase/postgres@sha256:${"b".repeat(64)}`,
        postgresVolumeName: "homecook-full-local-postgres",
        storageVolumeName: "homecook-full-local-storage",
      },
    })).toThrow(/escrow|recovery/iu);
  });

  it("wires validate, start, and status to readiness before reporting PASS", async () => {
    const { readFileSync } = await import("node:fs");
    const runtime = readFileSync("scripts/full-local-production-runtime.mjs", "utf8");

    for (const command of ["validate", "start", "status"]) {
      expect(runtime).toMatch(
        new RegExp(`case "${command}":[\\s\\S]*loadFullLocalBackupReadiness`, "u"),
      );
    }
    expect(runtime).toContain("authenticateFullLocalBackupArchives");
    expect(runtime).toContain("selectFullLocalProductionResources");
    expect(runtime).toMatch(
      /case "start":[\s\S]*compose\(runtime, \["up", "-d"\]\)[\s\S]*liveFullLocalProductionResources/u,
    );
  });

  it("preflights authenticated readiness before start and stops services if live identity fails", async () => {
    const { readFileSync } = await import("node:fs");
    const runtime = readFileSync("scripts/full-local-production-runtime.mjs", "utf8");
    const start = /case "start": \{([\s\S]*?)\n\s*case "status":/u
      .exec(runtime)?.[1] ?? "";

    expect(start.indexOf("configuredFullLocalProductionResources"))
      .toBeLessThan(start.indexOf('compose(runtime, ["up", "-d"])'));
    expect(start).toMatch(
      /loadFullLocalBackupReadiness[\s\S]*configuredFullLocalProductionResources[\s\S]*compose\(runtime, \["up", "-d"\]\)[\s\S]*liveFullLocalProductionResources[\s\S]*loadFullLocalBackupReadiness/u,
    );
    expect(start).toMatch(
      /catch[\s\S]*selectNewlyStartedFullLocalWriterServices[\s\S]*compose\(runtime, \["stop", \.\.\.newlyStartedWriters\]\)[\s\S]*throw/u,
    );
  });

  it("provides one authenticated command to record immutable readiness evidence", async () => {
    const { readFileSync } = await import("node:fs");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const backupCli = readFileSync("scripts/full-local-platform-backup.mjs", "utf8");

    expect(packageJson.scripts["full-local-production:backup-readiness:record"])
      .toContain("record-readiness");
    expect(backupCli).toContain('case "record-readiness"');
    expect(backupCli).toContain("buildFullLocalBackupReadinessEvidence");
    expect(backupCli).toContain("--confirm-off-mac-copy");
  });

  it("HMAC-authenticates readiness itself before parsing it on every runtime gate", async () => {
    const { readFileSync } = await import("node:fs");
    const backupCli = readFileSync("scripts/full-local-platform-backup.mjs", "utf8");
    const runtime = readFileSync("scripts/full-local-production-runtime.mjs", "utf8");

    expect(backupCli).toMatch(
      /recordBackupReadiness[\s\S]*platformBackupAuthenticationPath\(output\)[\s\S]*buildPlatformBackupAuthentication/u,
    );
    expect(runtime).toMatch(
      /loadFullLocalBackupReadiness[\s\S]*platformBackupAuthenticationPath\(readinessPath\)[\s\S]*verifyPlatformBackupAuthentication[\s\S]*JSON\.parse/u,
    );
    expect(runtime).toMatch(
      /evidence\?\.restore\?\.manifest_path[\s\S]*platformBackupAuthenticationPath\(restoreManifestPath\)[\s\S]*verifyPlatformBackupAuthentication[\s\S]*manifest_sha256/u,
    );
  });

  it("revalidates the exact escrow envelope and sidecar on record and every runtime gate", async () => {
    const { readFileSync } = await import("node:fs");
    const recorder = readFileSync("scripts/full-local-platform-backup.mjs", "utf8");
    const runtime = readFileSync("scripts/full-local-production-runtime.mjs", "utf8");

    for (const source of [recorder, runtime]) {
      expect(source).toContain("escrow_envelope_path");
      expect(source).toContain("escrow_envelope_sha256");
      expect(source).toContain("verifyFullLocalBackupKeyEscrowBinding");
      expect(source).toMatch(
        /platformBackupAuthenticationPath\(escrowEnvelopePath\)[\s\S]*verifyPlatformBackupAuthentication/u,
      );
    }
  });

  it("permits only restore-platform to issue an issuer-attested recovery manifest", async () => {
    const { readFileSync } = await import("node:fs");
    const runtime = readFileSync("scripts/full-local-production-runtime.mjs", "utf8");
    expect(runtime).toMatch(
      /restorePlatformBackup[\s\S]*executeBootstrapAwarePlatformRestore[\s\S]*writeCanonicalRecoveryManifest/u,
    );
    expect(runtime).toContain("signFullLocalBackupKeyRecoveryEvidence");
    expect(runtime).toContain("--recovery-issuer-private-key");
  });

  it("rejects a fabricated recovery manifest even when its backup-key HMAC could be valid", () => {
    const fabricated = {
      ...validRecoveryManifest(),
      isolated_replacement_environment_verified: false,
    };
    expect(() => buildFullLocalBackupReadinessEvidence({
      archivePath: "/Volumes/homecook-off-mac/platform.tar.gz.enc",
      archiveSha256: SHA,
      backupMetadata: validBackupMetadata(),
      keyRecoveryEscrowEnvelope: RECOVERY_ENVELOPE,
      keyRecoveryManifest: fabricated,
      keyRecoveryManifestPath: "/Volumes/homecook-key-escrow/recovery.json",
      keyRecoveryManifestSha256: "7".repeat(64),
      now: "2026-08-13T07:30:00.000Z",
      offMacCopyPath: "/Volumes/homecook-off-mac/platform-copy.tar.gz.enc",
      offMacCopySha256: SHA,
      restoreManifest: {},
      restoreManifestPath: "/Volumes/homecook-restore/restore.json",
      restoreManifestSha256: "6".repeat(64),
    })).toThrow(/issuer|attestation|signature/iu);
  });

  it("allows only restore-platform to issue readiness-eligible clean restore evidence", async () => {
    const { readFileSync } = await import("node:fs");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const runtime = readFileSync("scripts/full-local-production-runtime.mjs", "utf8");

    expect(packageJson.scripts["full-local-production:restore-platform:verify"])
      .toBeUndefined();
    expect(runtime).not.toContain('case "verify-restored-platform"');
    expect(runtime).toContain('restore_execution: "clean-isolated-restore-platform-v1"');
    expect(runtime).toContain("verifyRestoredPlatformDataSnapshot");
  });
});
