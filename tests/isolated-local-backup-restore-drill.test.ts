import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildFullLocalBackupReadinessEvidence,
  fullLocalBackupMetadataSha256,
} from "@/scripts/lib/full-local-backup-readiness.mjs";
import {
  sealFullLocalBackupKeyEscrow,
  signFullLocalBackupKeyRecoveryEvidence,
} from "@/scripts/lib/full-local-backup-key-recovery.mjs";
import {
  buildSanitizedPlatformData,
  verifyRestoredPlatformDataSnapshot,
} from "@/scripts/lib/full-local-restore-cutover.mjs";
import {
  assertIsolatedDrillTarget,
  buildIsolatedDrillPlan,
  filterRunningIsolatedContainers,
  mapStorageRowsToPayloadReferences,
  validateExternalArchiveDrillOptions,
  writeAuthenticatedJsonArtifact,
} from "@/scripts/lib/isolated-local-backup-restore-drill.mjs";
import { platformBackupAuthenticationPath } from "@/scripts/lib/full-local-platform-backup.mjs";
import { buildRestoreManifestPayload } from "@/scripts/full-local-production-runtime.mjs";

const READINESS_ARCHIVE_SHA = "a".repeat(64);
const RECOVERY_ISSUER = generateKeyPairSync("ed25519");
const RECOVERY_ENVELOPE = sealFullLocalBackupKeyEscrow({
  backupKey: "backup-key-with-at-least-twenty-four-characters",
  recoveryCredential: "independent-recovery-credential-secret",
  recoveryIssuerPublicKey: RECOVERY_ISSUER.publicKey,
});

function validBackupMetadata() {
  const restored = buildSanitizedPlatformData(restoredDataSqlFixture());
  return {
    components: {
      data_sha256: createHash("sha256").update(restored.sql).digest("hex"),
      roles_sha256: "f".repeat(64),
      schema_sha256: "0".repeat(64),
    },
    created_at: "2026-08-25T07:00:00.000Z",
    format: "homecook-full-local-platform-v5",
    database: {
      provenance: {
        compose_project: "homecook-full-local-isolated",
        container_name: "homecook-full-local-isolated-postgres-1",
        image: `public.ecr.aws/supabase/postgres@sha256:${"b".repeat(64)}`,
        postgres_volume: "homecook-full-local-postgres",
      },
    },
    manifest: {
      data_semantic_sha256: restored.manifest.data_semantic_sha256,
      relation_classification_digest: restored.manifest.relation_classification_digest,
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

function restoredDataSqlFixture() {
  return `-- platform data
COPY auth.users (id, email) FROM stdin;
user-a\ta@example.com
\\.
COPY auth.identities (id, user_id, provider, provider_id) FROM stdin;
identity-a\tuser-a\tgoogle\tprovider-user-a
\\.
COPY public.users (id, nickname) FROM stdin;
user-a\t무먹러
\\.
COPY storage.buckets (id, name, public) FROM stdin;
recipe-images\trecipe-images\tf
\\.
COPY storage.objects (id, bucket_id, name) FROM stdin;
object-a\trecipe-images\tuser-a/a.jpg
\\.
`;
}

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

describe("isolated local Supabase backup and restore drill", () => {
  it("builds external archive restore and recovery manifests that satisfy readiness v5", () => {
    const backupMetadata = validBackupMetadata();
    const restoredData = verifyRestoredPlatformDataSnapshot({
      restoredDataSql: restoredDataSqlFixture(),
      sourceDataSha256: backupMetadata.components.data_sha256,
      sourceDataSemanticSha256: backupMetadata.manifest.data_semantic_sha256,
      sourceRelationClassificationDigest:
        backupMetadata.manifest.relation_classification_digest,
    });
    const restoreManifestPath = "/Volumes/homecook-recovery/restore.json";
    const restoreManifest = buildRestoreManifestPayload({
      archiveSha256: READINESS_ARCHIVE_SHA,
      attemptToken: "isolated-rehearsal-attempt",
      createdAt: "2026-08-25T07:20:00.000Z",
      dataSnapshot: restoredData,
      metadata: backupMetadata,
      runtimeConfig: {
        FULL_LOCAL_COMPOSE_PROJECT_NAME: "homecook-full-local-restore-drill",
        FULL_LOCAL_POSTGRES_VOLUME_NAME: "homecook-full-local-restore-postgres",
        FULL_LOCAL_STORAGE_VOLUME_NAME: "homecook-full-local-restore-storage",
      },
      semantic: {
        auth_identities: 1,
        auth_identity_digest: createHash("sha256")
          .update("auth-identity-md5")
          .digest("hex"),
        auth_users: 1,
        database_digest: createHash("sha256")
          .update(JSON.stringify([{ relation: "public.users", row_count: 1, row_digest: "abc" }]))
          .digest("hex"),
        public_relation_count: 1,
        storage_bucket_count: 1,
        storage_digest: createHash("sha256")
          .update("storage-bucket-md5\nstorage-object-md5")
          .digest("hex"),
        storage_object_count: 1,
        storage_referenced_object_count: 1,
        transient_promote_count: 0,
      },
    });
    const restoreManifestSha256 = createHash("sha256")
      .update(`${JSON.stringify(restoreManifest, null, 2)}\n`)
      .digest("hex");
    const recoveryManifest = signFullLocalBackupKeyRecoveryEvidence({
      evidence: {
        archive_device_id: "11",
        archive_sha256: READINESS_ARCHIVE_SHA,
        clean_restore_verified: true,
        created_at: "2026-08-25T07:25:00.000Z",
        escrow_device_id: "12",
        escrow_envelope_path: "/Volumes/homecook-key-escrow/platform-key.escrow.json",
        escrow_envelope_sha256: "c".repeat(64),
        format: "homecook-full-local-backup-key-recovery-v1",
        isolated_replacement_environment_verified: true,
        keychain_reregistered: true,
        keychain_registration: {
          account: "platform-backup",
          adapter: "isolated-filesystem-keychain-adapter-v1",
          key_sha256: "8".repeat(64),
        },
        restored_metadata_sha256: fullLocalBackupMetadataSha256(backupMetadata),
        restore_manifest_path: restoreManifestPath,
        restore_manifest_sha256: restoreManifestSha256,
      },
      privateKey: RECOVERY_ISSUER.privateKey,
    });

    expect(() => buildFullLocalBackupReadinessEvidence({
      archivePath: "/Volumes/homecook-off-mac/platform.tar.gz.enc",
      archiveSha256: READINESS_ARCHIVE_SHA,
      backupMetadata,
      keyRecoveryEscrowEnvelope: RECOVERY_ENVELOPE,
      keyRecoveryManifest: recoveryManifest,
      keyRecoveryManifestPath: "/Volumes/homecook-key-escrow/recovery.json",
      keyRecoveryManifestSha256: "7".repeat(64),
      now: Date.parse("2026-08-25T08:00:00.000Z"),
      offMacCopyPath: "/Volumes/homecook-off-mac/platform-copy.tar.gz.enc",
      offMacCopySha256: READINESS_ARCHIVE_SHA,
      restoreManifest,
      restoreManifestPath,
      restoreManifestSha256,
    })).not.toThrow();
  });

  it("exposes an external archive recovery CLI with explicit isolated evidence outputs", () => {
    const cli = readFileSync("scripts/run-isolated-local-backup-restore-drill.mjs", "utf8");

    expect(cli).toContain("--external-archive");
    expect(cli).toContain("--escrow-envelope");
    expect(cli).toContain("--recovery-credential-file");
    expect(cli).toContain("--recovery-issuer-private-key");
    expect(cli).toContain("--restore-manifest");
    expect(cli).toContain("--recovery-manifest");
  });

  it("reaches the execute guard instead of crashing during module import", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/run-isolated-local-backup-restore-drill.mjs"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Use --execute to run the isolated fixture drill.");
    expect(result.stderr).not.toContain("SyntaxError");
  });

  it("uses the production service schema catalog contract for restored archives", () => {
    const cli = readFileSync("scripts/run-isolated-local-backup-restore-drill.mjs", "utf8");

    expect(cli).toContain("buildPlatformServiceSchemaCatalogSql");
    expect(cli).toContain("digestPlatformServiceSchemaCatalog");
  });

  it("binds external recovery evidence to the restored archive and authenticated metadata", () => {
    const cli = readFileSync("scripts/run-isolated-local-backup-restore-drill.mjs", "utf8");

    expect(cli).toContain("archive_sha256: restoreManifest.source_archive_sha256");
    expect(cli).toContain("clean_restore_verified: restoreManifest.fresh_target_attested");
    expect(cli).toContain(
      "restored_metadata_sha256: fullLocalBackupMetadataSha256(authenticatedMetadata)",
    );
  });

  it("rejects external archive inputs not owned by the current user", () => {
    const root = makePrivateDirectory("homecook-drill-owner-");
    const externalRoot = makePrivateDirectory("homecook-drill-owner-ext-");
    const replacementRoot = makePrivateDirectory("homecook-drill-owner-repl-");
    const archive = join(externalRoot, "platform.tar.gz.enc");
    const escrow = join(replacementRoot, "platform-key.escrow.json");
    const credential = join(replacementRoot, "credential.txt");
    const issuerKey = join(replacementRoot, "issuer.pem");
    const restoreManifest = join(replacementRoot, "restore.json");
    const recoveryManifest = join(replacementRoot, "recovery.json");

    for (const path of [archive, escrow, credential, issuerKey]) {
      makeMode600File(path);
      makeMode600File(platformBackupAuthenticationPath(path), "{}\n");
    }

    expect(() => validateExternalArchiveDrillOptions({
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
      expectedUid: (process.getuid?.() ?? 0) + 1,
      repositoryRoot: root,
    })).toThrow(/owner|owned/iu);
  });

  it("cleans up a partially written authenticated artifact when auth sidecar creation fails", () => {
    const outputRoot = makePrivateDirectory("homecook-drill-output-");
    const outputPath = join(outputRoot, "restore.json");
    makeMode600File(platformBackupAuthenticationPath(outputPath), "{}\n");

    expect(() => writeAuthenticatedJsonArtifact({
      backupKey: "backup-key-with-at-least-twenty-four-characters",
      outputPath,
      payload: { status: "PASS" },
    })).toThrow(/exists|already exists/iu);
    expect(existsSync(outputPath)).toBe(false);
  });

  it("rejects symlinked and same-device external archive inputs before restore", () => {
    const root = makePrivateDirectory("homecook-drill-symlink-");
    const externalRoot = makePrivateDirectory("homecook-drill-symlink-ext-");
    const replacementRoot = makePrivateDirectory("homecook-drill-symlink-repl-");
    const archiveTarget = join(externalRoot, "archive-target.tar.gz.enc");
    const archive = join(externalRoot, "platform.tar.gz.enc");
    const escrow = join(replacementRoot, "platform-key.escrow.json");
    const credential = join(replacementRoot, "credential.txt");
    const issuerKey = join(replacementRoot, "issuer.pem");

    makeMode600File(archiveTarget);
    makeMode600File(platformBackupAuthenticationPath(archiveTarget), "{}\n");
    symlinkSync(archiveTarget, archive);
    for (const path of [escrow, credential, issuerKey]) {
      makeMode600File(path);
      makeMode600File(platformBackupAuthenticationPath(path), "{}\n");
    }

    expect(() => validateExternalArchiveDrillOptions({
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
        join(replacementRoot, "restore.json"),
        "--recovery-manifest",
        join(replacementRoot, "recovery.json"),
      ],
      repositoryRoot: root,
    })).toThrow(/symbolic link/iu);
  });

  it("rejects same-device recovery media and create-only output collisions", () => {
    const root = makePrivateDirectory("homecook-drill-collision-");
    const sharedRoot = makePrivateDirectory("homecook-drill-collision-shared-");
    const archive = join(sharedRoot, "platform.tar.gz.enc");
    const escrow = join(sharedRoot, "platform-key.escrow.json");
    const credential = join(sharedRoot, "credential.txt");
    const issuerKey = join(sharedRoot, "issuer.pem");
    const restoreManifest = join(sharedRoot, "restore.json");
    const recoveryManifest = join(sharedRoot, "recovery.json");

    for (const path of [archive, escrow, credential, issuerKey]) {
      makeMode600File(path);
      makeMode600File(platformBackupAuthenticationPath(path), "{}\n");
    }
    makeMode600File(restoreManifest, "{}\n");

    expect(() => validateExternalArchiveDrillOptions({
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
    })).toThrow(/distinct devices|already exists/iu);
  });

  it("pins every mutable target to a disposable drill namespace", () => {
    expect(buildIsolatedDrillPlan({ suffix: "fixtr001" })).toMatchObject({
      cli_version: "2.110.0",
      destructive_scope: "isolated-fixture-only",
      project_id: "homecook-backup-drill-fixtr001",
      source_database_container: "homecook-backup-drill-fixtr001-postgres-1",
      source_postgres_volume: "homecook-backup-drill-fixtr001-postgres",
      source_storage_volume: "homecook-backup-drill-fixtr001-storage",
      restore_project_id: "homecook-backup-drill-fixtr001-restore",
      restore_storage_volume: "homecook-backup-drill-fixtr001-restore-storage",
    });
  });

  it.each([
    "homecook",
    "homecook-full-local-storage",
    "supabase_storage_homecook",
    "production-storage",
  ])("rejects non-isolated target %s", (target) => {
    expect(() => assertIsolatedDrillTarget(target)).toThrow(/isolated|drill/iu);
  });

  it("rejects suffixes that would make Supabase truncate restore resource names", () => {
    expect(() => buildIsolatedDrillPlan({ suffix: "fixture-too-long" }))
      .toThrow(/suffix/iu);
  });

  it("maps database object identity to the local file backend payload path", () => {
    expect(mapStorageRowsToPayloadReferences([
      {
        bucket_id: "fixture",
        name: "owner-a/object.bin",
        version: "version-1",
      },
    ], ["stub/stub/fixture/owner-a/object.bin/version-1"])).toEqual([
      {
        path: "stub/stub/fixture/owner-a/object.bin/version-1",
        reference: "fixture/owner-a/object.bin",
      },
    ]);
  });

  it("maps the current two-segment tenant/project Storage prefix without hardcoding its value", () => {
    expect(mapStorageRowsToPayloadReferences([
      {
        bucket_id: "fixture",
        name: "owner-a/object.bin",
        version: "version-1",
      },
    ], ["tenant-a/project-a/fixture/owner-a/object.bin/version-1"])).toEqual([
      {
        path: "tenant-a/project-a/fixture/owner-a/object.bin/version-1",
        reference: "fixture/owner-a/object.bin",
      },
    ]);
  });

  it("fails closed when one database reference cannot resolve one exact payload", () => {
    const rows = [{
      bucket_id: "fixture",
      name: "owner-a/object.bin",
      version: "version-1",
    }];
    expect(() => mapStorageRowsToPayloadReferences(rows, []))
      .toThrow(/exact Storage payload/iu);
    expect(() => mapStorageRowsToPayloadReferences(rows, [
      "fixture/owner-a/object.bin/version-1",
      "stub/stub/fixture/owner-a/object.bin/version-1",
    ])).toThrow(/exact Storage payload/iu);
  });

  it("stops only running isolated writers during a cut", () => {
    expect(filterRunningIsolatedContainers([
      { name: "homecook-backup-drill-fixture01-auth", running: true },
      { name: "homecook-backup-drill-fixture01-rest", running: false },
      { name: "homecook-backup-drill-fixture01-storage", running: true },
    ])).toEqual([
      "homecook-backup-drill-fixture01-auth",
      "homecook-backup-drill-fixture01-storage",
    ]);
  });
});
