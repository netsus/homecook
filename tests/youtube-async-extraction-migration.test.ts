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
    expect(sql).not.toContain("create role youtube_extraction_readiness_rpc_owner");
    expect(sql).not.toContain("create role youtube_extraction_projection_rpc_owner");
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
    expect(sql).toContain("grant create on schema private\n  to youtube_extraction_worker_rpc_owner,\n     youtube_extraction_credential_manager_rpc_owner");
    expect(sql).toContain("revoke create on schema private\n  from youtube_extraction_worker_rpc_owner,\n       youtube_extraction_credential_manager_rpc_owner");
    expect(sql.match(/set local role youtube_extraction_enqueue_rpc_owner/g)?.length).toBe(1);
    expect(sql.match(/set local role youtube_extraction_worker_rpc_owner/g)?.length).toBe(4);
    expect(sql.match(/set local role youtube_extraction_credential_manager_rpc_owner/g)?.length).toBe(3);
    expect(sql).toContain("revoke all on table public.youtube_extraction_jobs from public, anon, authenticated, service_role");
    expect(sql).not.toContain(
      "grant select on table private.youtube_extraction_worker_credentials\n  to youtube_extraction_enqueue_rpc_owner",
    );
    expect(sql).not.toContain(
      "grant select on table public.youtube_extraction_sessions\n  to youtube_extraction_enqueue_rpc_owner",
    );
    expect(sql).not.toContain(
      "create policy youtube_extraction_worker_credentials_enqueue_owner_select",
    );
    expect(sql).not.toContain(
      "create policy youtube_extraction_sessions_enqueue_owner_select",
    );
    expect(sql).toContain(
      "alter function public.read_youtube_extraction_enqueue_readiness()\n  owner to youtube_extraction_credential_manager_rpc_owner",
    );
    expect(sql).toContain(
      "alter function public.read_youtube_extraction_job_projection(uuid)\n  owner to youtube_extraction_worker_rpc_owner",
    );
  });

  it("locks a real two-connection enqueue/retry versus policy rotation race", () => {
    const integration = readFileSync(
      "tests/youtube-extraction-policy-postgres.integration.test.ts",
      "utf8",
    );
    expect(integration).toContain("YTASYNC-DB-POLICY-RACE");
    expect(integration).toContain("runPsqlAsync");
    expect(integration).toContain("pg_catalog.pg_stat_activity");
    expect(integration).toContain("yta-policy-race-enqueue");
    expect(integration).toContain("ShareLock");
    expect(integration).toContain("ExclusiveLock");
    expect(integration).not.toContain("select pg_advisory_xact_lock_shared(86120317);");
  });

  it("keeps the security-function inventory aligned with split read owners", () => {
    const manifest = JSON.parse(readFileSync(
      "docs/security/youtube-async-extraction-security-function-authorization-manifest.json",
      "utf8",
    )) as {
      functions: Array<{
        signature: string;
        owner?: string;
        allowed_principals: string[];
      }>;
    };
    const owners = Object.fromEntries(
      manifest.functions.map((entry) => [entry.signature, entry.owner]),
    );

    expect(owners["public.read_youtube_extraction_enqueue_readiness()"]).toBe(
      "youtube_extraction_credential_manager_rpc_owner",
    );
    for (const signature of [
      "public.list_youtube_extraction_job_projections(text, timestamp with time zone, timestamp with time zone, uuid, integer)",
      "public.read_youtube_extraction_job_projection(uuid)",
      "public.read_youtube_extraction_session_projection(uuid)",
    ]) {
      expect(owners[signature], signature).toBe("youtube_extraction_worker_rpc_owner");
    }

    const catalogGuard = manifest.functions.find(
      (entry) => entry.signature === "private.assert_youtube_extraction_catalog_ready()",
    );
    expect(catalogGuard?.allowed_principals).toEqual(["supabase_admin"]);
    expect(readFileSync(migrationPath, "utf8")).toContain(
      "set local role youtube_extraction_credential_manager_rpc_owner;\n\n" +
        "revoke all on function private.assert_youtube_extraction_catalog_ready()\n" +
        "from public, anon, authenticated, service_role,\n" +
        "  youtube_extraction_worker, youtube_extraction_credential_manager;\n" +
        "grant execute on function private.assert_youtube_extraction_catalog_ready()\n" +
        "to youtube_extraction_enqueue_rpc_owner,\n" +
        "   youtube_extraction_worker_rpc_owner,\n" +
        "   supabase_admin;\n\n" +
        "reset role;",
    );
  });

  it("exposes only lease-fenced worker data and permit-contention mutation RPCs", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    for (const signature of [
      "read_youtube_extraction_worker_catalog(uuid, text, bigint)",
      "access_youtube_extraction_worker_cache(uuid, text, bigint, bigint, text, jsonb)",
      "record_youtube_extraction_worker_event(uuid, text, bigint, bigint, text, jsonb)",
      "reserve_youtube_extraction_worker_quota(uuid, text, bigint, bigint, text, integer)",
      "update_youtube_extraction_job_title(uuid, text, bigint, bigint, text)",
      "requeue_youtube_extraction_job_without_attempt(uuid, text, bigint, integer, integer)",
      "resolve_youtube_extraction_worker_methods(uuid, text, bigint, bigint, text[])",
      "resolve_youtube_extraction_job_draft(uuid, text, bigint, bigint, text, jsonb)",
      "fail_or_retry_youtube_extraction_job(uuid, text, bigint, bigint, text)",
      "heartbeat_youtube_extraction_job(uuid, text, bigint, bigint, integer)",
      "heartbeat_youtube_extractor_permit(uuid, text, bigint, bigint, integer)",
    ]) {
      expect(sql, signature).toContain(signature);
    }
    expect(sql).toContain("youtube_extraction_worker_write_fence_is_active");
    expect(sql).toContain("permit.permit_generation = p_permit_generation");
    expect(sql).toContain("permit.expires_at >= clock_timestamp()");
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
    expect(sql).toContain("youtube_llm_extraction_events_provider_check");
    expect(sql).toContain("youtube_visual_extraction_cache_provider_check");
    expect(sql).toContain("youtube_visual_extraction_events_provider_check");
    expect(sql).toContain("provider in ('gemini', 'codex-vision-keyframes')");
  });

  it("uses auth.uid owner reads and returns exact delivered/seen count keys", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    expect(sql).toContain("read_youtube_extraction_enqueue_readiness()");
    expect(sql).toContain("'catalog_fingerprint'");
    expect(sql).toContain("youtube-extraction-live-catalog-v1");
    for (const component of [
      "columns",
      "constraints",
      "indexes",
      "role_attributes",
      "table_owners",
      "sequence_owners",
      "schema_owners",
      "owner_role_attributes",
      "rls_policies",
      "table_privileges",
      "sequence_privileges",
      "rpc_security",
      "rpc_function_definitions",
      "internal_scope_function_definition",
    ]) {
      expect(sql, component).toContain(`'${component}'`);
    }
    expect(sql).toContain("pg_catalog.pg_get_functiondef");
    expect(sql).toContain("private.verify_full_local_internal_scope()");
    expect(sql).toContain("function private.assert_youtube_extraction_catalog_ready()");

    const enqueue = sql.split("function public.enqueue_youtube_extraction_job")[1]
      ?.split("$function$;")[0] ?? "";
    const preRequest = sql.split("function public.check_youtube_extraction_worker_pre_request")[1]
      ?.split("$function$;")[0] ?? "";
    expect(enqueue).toContain("perform private.assert_youtube_extraction_catalog_ready()");
    expect(preRequest).toContain("perform private.assert_youtube_extraction_catalog_ready()");
    expect(sql).toContain("pg_catalog.pg_get_userbyid(relation.relowner)");
    expect(sql).toContain("pg_catalog.pg_get_userbyid(namespace.nspowner)");
    expect(sql).toContain("v_credential.expires_at <= clock_timestamp() + interval '30 minutes'");
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
    expect(sql).toContain("and not event.cache_hit");
  });

  it("fences successful finalize replay by the exact original worker and lease generation", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    const finalize = sql.split("function public.finalize_youtube_extraction_job")[1]
      ?.split("$function$;")[0] ?? "";
    const jobLock = finalize.indexOf("from public.youtube_extraction_jobs as existing_job");
    const permitLock = finalize.indexOf("from public.youtube_extractor_permits as permit");
    expect(finalize).toContain("v_job.lease_owner = v_requested_worker_id");
    expect(finalize).toContain("v_job.lease_generation = v_requested_lease_generation");
    expect(jobLock).toBeGreaterThan(-1);
    expect(finalize.slice(jobLock, permitLock)).toContain("for update");
    expect(permitLock).toBeGreaterThan(jobLock);
    expect(finalize.indexOf("v_job.status = 'succeeded'"))
      .toBeLessThan(permitLock);
    expect(finalize).not.toContain("lease_owner = null");
  });

  it("locks start attempts in the same job then permit order as every shared writer", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    const start = sql.split("function public.start_youtube_extraction_attempt")[1]
      ?.split("$function$;")[0] ?? "";
    const jobLock = start.indexOf("from public.youtube_extraction_jobs as job");
    const permitLock = start.indexOf("from public.youtube_extractor_permits as permit");

    expect(jobLock).toBeGreaterThan(-1);
    expect(start.slice(jobLock, permitLock)).toContain("for update");
    expect(permitLock).toBeGreaterThan(jobLock);
    expect(start.slice(permitLock)).toContain("for update");
  });

  it("serializes projection timestamps without millisecond truncation", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();
    const list = sql.split("function public.list_youtube_extraction_job_projections")[1]
      ?.split("$function$;")[0] ?? "";
    expect(list).toContain("yyyy-mm-dd\"t\"hh24:mi:ss.us\"z\"");
    expect(list).not.toContain("yyyy-mm-dd\"t\"hh24:mi:ss.ms\"z\"");
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
