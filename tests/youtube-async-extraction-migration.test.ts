import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260812160000_youtube_async_extraction_notification.sql";

describe("YTASYNC-DB/SEC migration contract", () => {
  it("is additive and creates the exact durable authority surfaces", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    for (const fragment of [
      "create table public.youtube_extraction_jobs",
      "create table public.youtube_extractor_permits",
      "create table private.youtube_extraction_current_policy",
      "create table private.youtube_extraction_worker_credentials",
      "add column source_job_id uuid",
      "unique (source_job_id)",
      "on delete set null",
      "enable row level security",
      "force row level security",
      "youtube_extraction_current_policy_enqueue_owner_select",
      "youtube_extraction_jobs_enqueue_owner_select",
      "youtube_extraction_jobs_enqueue_owner_insert",
    ]) {
      expect(sql, fragment).toContain(fragment);
    }
    expect(sql).not.toMatch(/drop\s+(?:table|column|schema)/u);
  });

  it("defines the exact roles, memberships, hardened RPCs and denied direct access", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    for (const role of [
      "youtube_extraction_enqueue_rpc_owner",
      "youtube_extraction_worker",
      "youtube_extraction_worker_rpc_owner",
      "youtube_extraction_credential_manager",
      "youtube_extraction_credential_manager_rpc_owner",
    ]) {
      expect(sql).toContain(role);
    }
    for (const rpc of [
      "enqueue_youtube_extraction_job",
      "claim_youtube_extraction_job",
      "heartbeat_youtube_extraction_job",
      "start_youtube_extraction_attempt",
      "finalize_youtube_extraction_job",
      "fail_or_retry_youtube_extraction_job",
      "claim_youtube_extractor_permit",
      "heartbeat_youtube_extractor_permit",
      "release_youtube_extractor_permit",
      "mark_youtube_extraction_jobs_delivered",
      "mark_youtube_extraction_jobs_seen",
      "rotate_youtube_extraction_worker_credential",
      "check_youtube_extraction_worker_pre_request",
    ]) {
      expect(sql).toContain(`function public.${rpc}`);
    }
    expect(sql.match(/security definer/g)?.length ?? 0).toBeGreaterThanOrEqual(12);
    expect(sql.match(/set search_path = ''/g)?.length ?? 0).toBeGreaterThanOrEqual(12);
    expect(sql).toContain("grant youtube_extraction_worker to authenticator");
    expect(sql).toContain("grant youtube_extraction_credential_manager to authenticator");
    expect(sql).toContain("revoke all on table public.youtube_extraction_jobs from public, anon, authenticated, service_role");
  });

  it("seeds the exact i031-only policy disabled", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain("9adc7876a02c2da55a92e3a65369bf4e803c78efb9a791717201eedc242c1908");
    expect(sql).toContain("i031_codex_vision");
    expect(sql).toContain("\"singleRecipeOnly\": true");
    expect(sql).toContain("\"hybridAnchorBudget\": 36");
    expect(sql).toMatch(/'1'[\s\S]*null[\s\S]*null[\s\S]*false/u);
  });
});
