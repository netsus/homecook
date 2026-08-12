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
    expect(sql).toContain("with inherit false, set true granted by %i");
    expect(sql).toContain("from %i granted by %i");
    expect(sql).toContain("grant create on schema private to youtube_extraction_worker_rpc_owner");
    expect(sql).toContain("revoke create on schema private from youtube_extraction_worker_rpc_owner");
    expect(sql.match(/set local role youtube_extraction_enqueue_rpc_owner/g)?.length).toBe(2);
    expect(sql.match(/set local role youtube_extraction_worker_rpc_owner/g)?.length).toBe(3);
    expect(sql).toContain("set local role youtube_extraction_credential_manager_rpc_owner");
    expect(sql).toContain("revoke all on table public.youtube_extraction_jobs from public, anon, authenticated, service_role");
  });

  it("exposes only lease-fenced worker data and permit-contention mutation RPCs", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    for (const signature of [
      "read_youtube_extraction_worker_catalog(uuid, text, bigint)",
      "access_youtube_extraction_worker_cache(uuid, text, bigint, text, jsonb)",
      "record_youtube_extraction_worker_event(uuid, text, bigint, text, jsonb)",
      "reserve_youtube_extraction_worker_quota(uuid, text, bigint, text, integer)",
      "update_youtube_extraction_job_title(uuid, text, bigint, text)",
      "requeue_youtube_extraction_job_without_attempt(uuid, text, bigint, integer, integer)",
    ]) {
      expect(sql, signature).toContain(signature);
    }
    expect(sql).toContain("youtube_extraction_job_fence_is_active");
    expect(sql).toContain("greatest(1, min_delay_seconds)");
    expect(sql).toContain("least(30, max_delay_seconds)");
    for (const functionName of [
      "resolve_youtube_extraction_worker_methods",
      "access_youtube_extraction_worker_cache",
      "record_youtube_extraction_worker_event",
      "reserve_youtube_extraction_worker_quota",
    ]) {
      const functionBody = sql.split(`function public.${functionName}`)[1]?.split("$function$;")[0] ?? "";
      expect(functionBody, `${functionName} must hold the job fence row lock`).toContain("for update");
    }
  });

  it("uses auth.uid owner reads and returns exact delivered/seen count keys", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    expect(sql).toContain("read_youtube_extraction_enqueue_readiness()");
    expect(sql).toContain("read_youtube_extraction_job_projection(uuid)");
    expect(sql).toContain("read_youtube_extraction_session_projection(uuid)");
    expect(sql).toContain(
      "list_youtube_extraction_job_projections(text, timestamp with time zone, timestamp with time zone, uuid, integer)",
    );
    expect(sql).toContain("jsonb_build_object('delivered_count', v_count)");
    expect(sql).toContain("jsonb_build_object('seen_count', v_count)");
    expect(sql).not.toContain("returns jsonb_build_object('updated', v_count)");
  });

  it("pins exact worker JWT authority and lifetime limits", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    expect(sql).toContain("v_issuer is distinct from 'https://worker.mumeok.kr'");
    expect(sql).toContain("v_audience is distinct from 'youtube-extraction'");
    expect(sql).toContain("clock_timestamp() + interval '5 minutes'");
    expect(sql).toContain("clock_timestamp() + interval '30 minutes'");
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
