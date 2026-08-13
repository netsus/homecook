import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  assertDestructiveRestoreAllowed,
  assertFreshRestoreExecutionApproved,
  assertFreshRestoreAllowed,
  assertRestoredStorageVolumeProvenance,
  buildBootstrapAwareDatabaseResetSql,
  buildComposeLabeledStorageVolumeCreateArgs,
  buildPlatformRestoreSql,
  buildCutoverPreflight,
  buildSanitizedPlatformData,
  classifyRollbackMode,
  compareRestoreReplayManifests,
  compareStorageObjectManifests,
  executeBootstrapAwarePlatformRestore,
  inventoryPlatformDataRelations,
  verifyRestoredPlatformDataSnapshot,
} from "@/scripts/lib/full-local-restore-cutover.mjs";

const platformData = `-- platform data\nCOPY auth.users (id, email) FROM stdin;
user-a\ta@example.com
\\.
COPY auth.identities (id, user_id, provider) FROM stdin;
identity-a\tuser-a\tgoogle
\\.
COPY auth.sessions (id, user_id) FROM stdin;
session-a\tuser-a
\\.
COPY auth.refresh_tokens (id, token) FROM stdin;
refresh-a\tsecret
\\.
COPY auth.flow_state (id, auth_code) FROM stdin;
flow-a\tsecret
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

describe("full-local platform restore boundary", () => {
  it("binds clean restore evidence to the archive's exact sanitized DB/Auth data", () => {
    const sanitized = buildSanitizedPlatformData(platformData);
    const sourceDataSha256 = createHash("sha256").update(sanitized.sql).digest("hex");

    expect(verifyRestoredPlatformDataSnapshot({
      restoredDataSql: platformData,
      sourceDataSha256,
      sourceRelationClassificationDigest:
        sanitized.manifest.relation_classification_digest,
    })).toEqual({
      restored_data_sha256: sourceDataSha256,
      restored_relation_classification_digest:
        sanitized.manifest.relation_classification_digest,
    });
    expect(() => verifyRestoredPlatformDataSnapshot({
      restoredDataSql: platformData.replace("a@example.com", "drift@example.com"),
      sourceDataSha256,
      sourceRelationClassificationDigest:
        sanitized.manifest.relation_classification_digest,
    })).toThrow(/archive|DB|data/iu);
  });

  it("restores only into brand-new PostgreSQL and Storage volumes", () => {
    expect(assertFreshRestoreAllowed({ postgresVolumeExists: false, storageVolumeExists: false })).toBe(true);
    expect(() => assertFreshRestoreAllowed({
      postgresVolumeExists: true,
      storageVolumeExists: false,
    })).toThrow("fresh named volumes");
  });

  it("requires an exact operator confirmation before creating restore volumes", () => {
    expect(() => assertFreshRestoreExecutionApproved({ confirmation: null }))
      .toThrow("--confirm-fresh-restore");
    expect(() => assertFreshRestoreExecutionApproved({ confirmation: "yes" }))
      .toThrow("--confirm-fresh-restore");
    expect(assertFreshRestoreExecutionApproved({
      confirmation: "RESTORE_VERIFIED_BACKUP_TO_FRESH_VOLUMES",
    })).toBe(true);
  });

  it("keeps official roles, schema, replica-mode data restore order", () => {
    expect(buildPlatformRestoreSql({
      dataSql: "DATA;",
      rolesSql: "ROLES;",
      schemaSql: "SCHEMA;",
    })).toBe([
      "\\set ON_ERROR_STOP on",
      "ROLES;",
      "SCHEMA;",
      "SET session_replication_role = replica;",
      "DATA;",
      "SET session_replication_role = origin;",
      "",
    ].join("\n"));
  });

  it("recreates the bootstrap database from template0 before replaying a non-clean schema dump", () => {
    expect(buildBootstrapAwareDatabaseResetSql()).toBe([
      "\\set ON_ERROR_STOP on",
      "SELECT pg_terminate_backend(pid)",
      "FROM pg_catalog.pg_stat_activity",
      "WHERE datname = 'postgres' AND pid <> pg_backend_pid();",
      "DROP DATABASE IF EXISTS postgres WITH (FORCE);",
      "CREATE DATABASE postgres WITH TEMPLATE template0 OWNER supabase_admin;",
      "",
    ].join("\n"));
  });

  it("runs the restore-platform integration boundary in the required clean replay order", async () => {
    const calls: string[] = [];
    const result = await executeBootstrapAwarePlatformRestore({
      bootstrapServices: async () => calls.push("bootstrap-services"),
      replayDatabase: async () => calls.push("replay-database"),
      resetDatabase: async () => calls.push("reset-database"),
      restoreStoragePayload: async () => calls.push("restore-storage"),
      startPostgres: async () => calls.push("start-postgres"),
      startServices: async () => calls.push("start-services"),
      stopServices: async () => calls.push("stop-services"),
      verifyResources: async () => calls.push("verify-resources"),
      verifyRestoredPlatform: async () => {
        calls.push("verify-restored-platform");
        return { status: "PASS" };
      },
    });

    expect(calls).toEqual([
      "bootstrap-services",
      "stop-services",
      "restore-storage",
      "start-postgres",
      "reset-database",
      "replay-database",
      "start-services",
      "verify-resources",
      "verify-restored-platform",
    ]);
    expect(result).toEqual({ status: "PASS" });
  });

  it("keeps stable Auth UUID and Storage object metadata while removing transient sessions", () => {
    const result = buildSanitizedPlatformData(platformData);

    expect(result.sql).toContain("COPY auth.users");
    expect(result.sql).toContain("COPY auth.identities");
    expect(result.sql).toContain("COPY public.users");
    expect(result.sql).toContain("COPY storage.buckets");
    expect(result.sql).not.toContain("COPY auth.sessions");
    expect(result.sql).not.toContain("COPY auth.refresh_tokens");
    expect(result.sql).not.toContain("COPY auth.flow_state");
    expect(result.sql).toContain("COPY storage.objects");
    expect(result.manifest.unclassified).toEqual([]);
    expect(result.manifest.transient_promote_count).toBe(0);
    expect(result.manifest.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({ relation: "auth.users", action: "include" }),
      expect.objectContaining({ relation: "auth.sessions", action: "exclude" }),
      expect.objectContaining({ relation: "storage.objects", action: "include" }),
    ]));
  });

  it("fails closed when a new Auth relation has no explicit classification", () => {
    expect(() => buildSanitizedPlatformData(
      `${platformData}COPY auth.future_unknown_relation (id) FROM stdin;\nclient-a\n\\.\n`,
    )).toThrow("Unclassified platform restore relation: auth.future_unknown_relation");
  });

  it("excludes provider configuration and every observed remote session companion", () => {
    const result = buildSanitizedPlatformData(`${platformData}
COPY auth.custom_oauth_providers (id) FROM stdin;
provider-a
\\.
COPY auth.mfa_amr_claims (id) FROM stdin;
claim-a
\\.
COPY auth.oauth_client_states (id) FROM stdin;
state-a
\\.
COPY storage.s3_multipart_uploads (id) FROM stdin;
upload-a
\\.
COPY storage.iceberg_namespaces (id) FROM stdin;
namespace-a
\\.
COPY storage.iceberg_tables (id) FROM stdin;
table-a
\\.
COPY supabase_functions.hooks (id) FROM stdin;
hook-a
\\.
`);
    expect(result.sql).not.toContain("custom_oauth_providers");
    expect(result.sql).not.toContain("mfa_amr_claims");
    expect(result.sql).not.toContain("oauth_client_states");
    expect(result.sql).not.toContain("s3_multipart_uploads");
    expect(result.sql).not.toContain("iceberg_namespaces");
    expect(result.sql).not.toContain("iceberg_tables");
    expect(result.sql).not.toContain("supabase_functions.hooks");
  });

  it("inventories relation and column names without exposing row values", () => {
    expect(inventoryPlatformDataRelations(platformData)).toEqual(expect.arrayContaining([
      {
        columns: ["id", "email"],
        relation: "auth.users",
        row_count: 1,
      },
      {
        columns: ["id", "bucket_id", "name"],
        relation: "storage.objects",
        row_count: 1,
      },
    ]));
    expect(JSON.stringify(inventoryPlatformDataRelations(platformData))).not.toContain("a@example.com");
  });

  it("fails closed when a COPY block is unterminated", () => {
    expect(() => buildSanitizedPlatformData(
      "COPY auth.users (id) FROM stdin;\nuser-a\n",
    )).toThrow("Unterminated COPY block");
  });

  it("requires a current encrypted pre-restore backup before destructive restore", () => {
    expect(() => assertDestructiveRestoreAllowed({
      current: { database_digest: "db-a", project: "homecook", storage_digest: "storage-a" },
      destructive: true,
      preRestoreBackup: {
        encrypted: true,
        database_digest: "db-old",
        project: "homecook",
        storage_digest: "storage-a",
        verified: true,
      },
    })).toThrow("current database digest");

    expect(assertDestructiveRestoreAllowed({
      current: { database_digest: "db-a", project: "homecook", storage_digest: "storage-a" },
      destructive: true,
      preRestoreBackup: {
        encrypted: true,
        database_digest: "db-a",
        project: "homecook",
        storage_digest: "storage-a",
        verified: true,
      },
    })).toBe(true);
  });

  it("requires two clean restores with the same stable digest", () => {
    const first = {
      auth_identity_digest: "auth-a",
      database_digest: "db-a",
      relation_classification_digest: "class-a",
      source_data_sha256: "data-a",
      source_roles_sha256: "roles-a",
      source_schema_sha256: "schema-a",
      storage_digest: "storage-a",
      transient_promote_count: 0,
      unclassified_count: 0,
    };
    expect(compareRestoreReplayManifests(first, { ...first })).toEqual({
      digest_match: true,
      restore_count: 2,
    });
    expect(() => compareRestoreReplayManifests(first, {
      ...first,
      auth_identity_digest: "auth-b",
    })).toThrow("restore replay digest mismatch");
    expect(() => compareRestoreReplayManifests(first, {
      ...first,
      source_roles_sha256: "roles-b",
    })).toThrow("restore replay digest mismatch");
  });
});

describe("full-local Storage and cutover boundary", () => {
  const objects = [
    {
      bytes: 3,
      mime: "image/jpeg",
      owner_prefix: "user-a",
      path: "user-a/a.jpg",
      referenced: true,
      sha256: "a".repeat(64),
    },
  ];

  it("compares path, bytes, MIME, streamed digest, owner prefix, and DB reference", () => {
    expect(compareStorageObjectManifests(objects, structuredClone(objects))).toEqual({
      bytes: 3,
      count: 1,
      mismatch_count: 0,
      storage_digest: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(() => compareStorageObjectManifests(objects, [{
      ...objects[0],
      owner_prefix: "user-b",
    }])).toThrow("Storage manifest mismatch");
  });

  it("creates and verifies the restored Storage volume with exact Compose provenance", () => {
    expect(buildComposeLabeledStorageVolumeCreateArgs({
      attemptToken: "attempt-token-storage-restore",
      composeProject: "homecook-restore-fixture",
      volumeName: "homecook-restore-fixture-storage",
    })).toEqual([
      "volume",
      "create",
      "--label",
      "com.docker.compose.project=homecook-restore-fixture",
      "--label",
      "com.docker.compose.volume=storage-data",
      "--label",
      "homecook.local/restore-attempt=attempt-token-storage-restore",
      "homecook-restore-fixture-storage",
    ]);
    expect(assertRestoredStorageVolumeProvenance({
      attemptToken: "attempt-token-storage-restore",
      composeProject: "homecook-restore-fixture",
      inspect: {
        Name: "homecook-restore-fixture-storage",
        Labels: {
          "com.docker.compose.project": "homecook-restore-fixture",
          "com.docker.compose.volume": "storage-data",
          "homecook.local/restore-attempt": "attempt-token-storage-restore",
        },
      },
      volumeName: "homecook-restore-fixture-storage",
    })).toBe(true);
    expect(() => assertRestoredStorageVolumeProvenance({
      attemptToken: "attempt-token-storage-restore",
      composeProject: "homecook-restore-fixture",
      inspect: {
        Name: "homecook-restore-fixture-storage",
        Labels: {},
      },
      volumeName: "homecook-restore-fixture-storage",
    })).toThrow(/provenance|Compose|label/iu);
  });

  it("never reports cutover ready without every manual-only gate", () => {
    const result = buildCutoverPreflight({
      completeStorageBackupVerified: false,
      firstLocalMutationApproved: false,
      offMacRestoreCount: 2,
      providerCallbackVerified: true,
      remoteOutstandingFlows: 0,
      restoreReplayVerified: true,
      storageVerified: true,
      temporaryHostedS3CredentialRevoked: true,
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toContain("first-local-production-auth-mutation-approval-missing");
    expect(result.blockers).toContain("complete-storage-backup-verification-missing");
  });

  it("allows env rollback only before the rollback floor", () => {
    expect(classifyRollbackMode({ firstLocalMutationAt: null, jointDeltaExportVerified: false }))
      .toEqual({ envOnlyRollbackAllowed: true, mode: "pre-floor" });
    expect(() => classifyRollbackMode({
      firstLocalMutationAt: "2026-08-01T00:00:00.000Z",
      jointDeltaExportVerified: false,
    })).toThrow("post-floor rollback requires joint Auth/DB/Storage delta evidence");
    expect(classifyRollbackMode({
      firstLocalMutationAt: "2026-08-01T00:00:00.000Z",
      jointDeltaExportVerified: true,
    })).toEqual({ envOnlyRollbackAllowed: false, mode: "post-floor" });
  });
});
