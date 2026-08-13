import { describe, expect, it } from "vitest";

import {
  buildFullLocalBackupReadinessEvidence,
  verifyFullLocalBackupReadiness,
} from "@/scripts/lib/full-local-backup-readiness.mjs";

const NOW = Date.parse("2026-08-13T08:00:00.000Z");
const SHA = "a".repeat(64);

function validEvidence() {
  return {
    backup: {
      archive_path: "/Volumes/homecook-off-mac/platform.tar.gz.enc",
      archive_sha256: SHA,
      created_at: "2026-08-13T07:00:00.000Z",
    },
    format: "homecook-full-local-backup-readiness-v1",
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
      database_reference_count: 1,
      object_count: 1,
      payload_catalog_sha256: "d".repeat(64),
      source_archive_sha256: SHA,
      storage_payload_included: true,
      target_compose_project: "homecook-full-local-restore-drill",
      target_storage_volume: "homecook-full-local-restore-storage",
      total_bytes: 36,
      verified_at: "2026-08-13T07:20:00.000Z",
    },
  };
}

describe("full-local backup readiness", () => {
  it("builds readiness only from one authenticated archive and complete restore manifest", () => {
    expect(buildFullLocalBackupReadinessEvidence({
      archivePath: "/Volumes/homecook-off-mac/platform.tar.gz.enc",
      archiveSha256: SHA,
      backupMetadata: {
        created_at: "2026-08-13T07:00:00.000Z",
        database: {
          provenance: {
            compose_project: "homecook-full-local-isolated",
            container_name: "homecook-full-local-isolated-postgres-1",
            image: `public.ecr.aws/supabase/postgres@sha256:${"b".repeat(64)}`,
            postgres_volume: "homecook-full-local-postgres",
          },
        },
        storage_payload: {
          catalog_sha256: "d".repeat(64),
          object_count: 1,
          source_identity:
            "docker-compose-volume:homecook-full-local-isolated:homecook-full-local-storage",
          total_bytes: 36,
        },
        storage_payload_included: true,
      },
      now: "2026-08-13T07:30:00.000Z",
      offMacCopyPath: "/Volumes/homecook-off-mac/platform-copy.tar.gz.enc",
      offMacCopySha256: SHA,
      restoreManifest: {
        created_at: "2026-08-13T07:20:00.000Z",
        compose_project: "homecook-full-local-restore-drill",
        format: "homecook-full-local-restore-v1",
        postgres_volume: "homecook-full-local-restore-postgres",
        source_archive_sha256: SHA,
        storage_payload_catalog_sha256: "d".repeat(64),
        storage_payload_object_count: 1,
        storage_payload_total_bytes: 36,
        storage_reference_count: 1,
        storage_volume: "homecook-full-local-restore-storage",
      },
    })).toEqual(validEvidence());
  });

  it("accepts only recent backup, distinct off-Mac copy, and clean restore evidence for the exact production stack", () => {
    expect(verifyFullLocalBackupReadiness({
      evidence: validEvidence(),
      evidenceFileMode: 0o600,
      nowMs: NOW,
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
    ["same-path copy", { off_mac_copy: { archive_path: "/Volumes/homecook-off-mac/platform.tar.gz.enc" } }],
    ["wrong production volume", { production: { storage_volume: "supabase_storage_homecook" } }],
  ])("fails closed for %s", (_label, override) => {
    const evidence = validEvidence();
    for (const [section, values] of Object.entries(override)) {
      Object.assign(evidence[section as keyof ReturnType<typeof validEvidence>], values);
    }
    expect(() => verifyFullLocalBackupReadiness({
      evidence,
      evidenceFileMode: 0o600,
      nowMs: NOW,
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

  it("wires validate, start, and status to readiness before reporting PASS", async () => {
    const { readFileSync } = await import("node:fs");
    const runtime = readFileSync("scripts/full-local-production-runtime.mjs", "utf8");

    for (const command of ["validate", "start", "status"]) {
      expect(runtime).toMatch(
        new RegExp(`case "${command}":[\\s\\S]*loadFullLocalBackupReadiness`, "u"),
      );
    }
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
});
