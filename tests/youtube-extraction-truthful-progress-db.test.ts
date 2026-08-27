import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationsDir = resolve(root, "supabase/migrations");
const expectedSchemaPath = resolve(
  root,
  "scripts/manifests/youtube-extraction-expected-schema.json",
);
const adminQuotaMigrationName =
  "20260826010000_youtube_extraction_admin_daily_quota_exception.sql";

function read(relativePath: string) {
  const absolutePath = resolve(root, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

function listMigrations() {
  return readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith(".sql"))
    .sort();
}

function readMigration(name: string) {
  return readFileSync(resolve(migrationsDir, name), "utf8");
}

function findProgressMigrationName() {
  return listMigrations().find((name) => {
    const sql = readMigration(name);
    return sql.includes("report_youtube_extraction_progress")
      || sql.includes("youtube_extraction_progress_stage_events")
      || sql.includes("progress_attempt");
  });
}

describe("YouTube truthful progress DB RED contract", () => {
  it("promotes the expected schema manifest to schema-v2 while preserving the admin quota table inventory", () => {
    const expectedSchema = JSON.parse(readFileSync(expectedSchemaPath, "utf8")) as {
      schema_identity?: string;
      tables?: string[];
      rpc_signatures?: string[];
      catalog_fingerprint_components?: string[];
    };

    expect(expectedSchema.schema_identity).toBe("youtube-extraction-worker-schema-v2");
    expect(expectedSchema.tables).toContain("public.admin_members");
    expect(expectedSchema.tables).toContain(
      "private.youtube_extraction_progress_stage_events",
    );
    expect(expectedSchema.rpc_signatures).toContain(
      "public.report_youtube_extraction_progress(uuid,text,bigint,bigint,integer,text,integer)",
    );
    expect(expectedSchema.catalog_fingerprint_components).toContain("table_privileges");
    expect(expectedSchema.catalog_fingerprint_components).toContain("rpc_security");
  });

  it("adds a new migration after the admin quota exception for truthful progress schema surfaces", () => {
    const migrations = listMigrations();
    const adminQuotaIndex = migrations.indexOf(adminQuotaMigrationName);
    const progressMigrationName = findProgressMigrationName();

    expect(adminQuotaIndex).toBeGreaterThanOrEqual(0);
    expect(progressMigrationName).toBeTruthy();
    expect(migrations.indexOf(progressMigrationName!)).toBeGreaterThan(adminQuotaIndex);
  });

  it("declares the five progress columns, queued snapshot markers, private event table, and exact report RPC", () => {
    const progressMigrationName = findProgressMigrationName();
    const sql = progressMigrationName ? readMigration(progressMigrationName) : "";

    for (const column of [
      "progress_attempt",
      "progress_stage",
      "progress_stage_started_at",
      "progress_updated_at",
      "video_duration_seconds",
    ]) {
      expect(sql).toContain(column);
    }

    expect(sql).toContain("private.youtube_extraction_progress_stage_events");
    expect(sql).toContain("report_youtube_extraction_progress");
    expect(sql).toContain("returns table (applied boolean)");
    expect(sql).toContain("queued");
    expect(sql).toContain("source_fetch");
    expect(sql).toContain("primary key (job_id, attempt, stage)");
    const eventStageConstraint = sql.split(
      "constraint youtube_extraction_progress_stage_events_stage_check",
    )[1]?.split("constraint youtube_extraction_progress_stage_events_duration_check")[0] ?? "";
    expect(sql).toMatch(
      /stage in \([\s\S]*source_fetch[\s\S]*video_download[\s\S]*frame_extraction[\s\S]*model_analysis[\s\S]*finalizing[\s\S]*\)/iu,
    );
    expect(eventStageConstraint).toContain("source_fetch");
    expect(eventStageConstraint).toContain("finalizing");
    expect(eventStageConstraint).not.toContain("queued");
  });

  it("declares duration bounds, direct-access revokes, restricted worker execute, and projection progress fields", () => {
    const progressMigrationName = findProgressMigrationName();
    const sql = progressMigrationName ? readMigration(progressMigrationName) : "";

    expect(sql).toContain("video_duration_seconds");
    expect(sql).toMatch(/1\.\.86400|between 1 and 86400/iu);
    expect(sql).toMatch(/revoke all .*youtube_extraction_progress_stage_events/iu);
    expect(sql).toMatch(
      /from public, anon, authenticated, service_role,[\s\S]*youtube_extraction_worker/iu,
    );
    expect(sql).toMatch(
      /grant execute on function public\.report_youtube_extraction_progress/iu,
    );

    for (const field of [
      "attempt",
      "stage",
      "stage_started_at",
      "updated_at",
      "video_duration_seconds",
    ]) {
      expect(sql).toContain(field);
    }
  });

  it("keeps the approved docs contract for admin quota exception and truthful progress aligned", () => {
    const source = read("docs/sync/CURRENT_SOURCE_OF_TRUTH.md");
    const db = read("docs/db설계-v1.3.36.md");
    const api = read("docs/api문서-v1.2.41.md");

    expect(source).toContain("YouTube Admin Daily Enqueue Quota Exception `2026-08-26`");
    expect(source).toContain("YouTube 실제 단계 진행바와 남은 시간 범위");
    expect(db).toContain("TABLE(applied boolean)");
    expect(db).toContain("browser/anon/authenticated/service_role");
    expect(api).toContain("admin_members");
    expect(api).toContain("progress=null");
  });
});
