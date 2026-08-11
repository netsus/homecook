import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  isUnexpectedSessionAuthorityFailure,
  readSessionAuthorityFailureReason,
} from "@/lib/server/hybrid-auth/session-observability";

const MIGRATION_PATH =
  "supabase/migrations/20260811120000_full_local_session_observability.sql";
const MANIFEST_PATH =
  "docs/security/full-local-auth-db-security-function-authorization-manifest.json";

describe("full-local session observability contract", () => {
  it("parses only bounded internal reasons and treats unknown details as unavailable", () => {
    expect(readSessionAuthorityFailureReason({
      details: "HOMECOOK_SESSION_AUTHORITY_REASON::non_monotonic",
    })).toBe("non_monotonic");
    expect(readSessionAuthorityFailureReason({
      details: "HOMECOOK_SESSION_AUTHORITY_REASON::invented",
    })).toBe("auth_unavailable");
    expect(isUnexpectedSessionAuthorityFailure("identity_mismatch")).toBe(true);
    expect(isUnexpectedSessionAuthorityFailure("revoked")).toBe(false);
    expect(isUnexpectedSessionAuthorityFailure("missing")).toBe(false);
  });

  it("stores only one PII-free aggregate row and resets its deployment window", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");

    expect(sql).toMatch(
      /create table if not exists private\.full_local_session_observability/i,
    );
    expect(sql).toMatch(/singleton boolean primary key/i);
    expect(sql).toMatch(/observation_started_at timestamptz not null/i);
    expect(sql).toMatch(/unexpected_account_session_stale_count bigint not null/i);
    expect(sql).toMatch(/stale_token_mutation_count bigint not null/i);
    expect(sql).toMatch(/on conflict \(singleton\)[\s\S]*observation_started_at = excluded\.observation_started_at/i);
    expect(sql).not.toMatch(/\b(token|cookie|email|user_uuid|session_uuid|oauth_code|ip_address|request_path)\b/i);
    expect(sql).not.toMatch(/create table[\s\S]*session_observability_events/i);
  });

  it("exposes only exact scoped aggregate RPCs without direct table grants", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");

    expect(sql).toMatch(
      /create or replace function public\.record_full_local_session_stale_observation\(\s*p_reason text\s*\)/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.read_full_local_session_observation\(\)/i,
    );
    expect(sql).toMatch(/x-homecook-internal-scope[\s\S]*session-observability/i);
    expect(sql).toMatch(/\/rpc\/record_full_local_session_stale_observation/i);
    expect(sql).toMatch(/\/rpc\/read_full_local_session_observation/i);
    expect(sql).toMatch(
      /revoke all on table private\.full_local_session_observability\s+from public, anon, authenticated, service_role/i,
    );
    expect(sql).not.toMatch(
      /grant\s+(select|insert|update|delete|all)[\s\S]*full_local_session_observability/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.record_full_local_session_stale_observation\(text\)\s+to service_role/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.read_full_local_session_observation\(\)\s+to service_role, supabase_admin/i,
    );
    expect(sql).toMatch(
      /if session_user is distinct from 'supabase_admin'[\s\S]*current_setting\('role', true\) is distinct from 'supabase_admin'[\s\S]*assert_full_local_session_observability_scope/i,
    );
  });

  it("keeps the isolated PostgreSQL harness off TCP with a nologin operator role", async () => {
    const runner = await readFile(
      "scripts/run-account-session-generation-postgres-integration.mjs",
      "utf8",
    );

    expect(runner).toContain('"--auth-local=trust"');
    expect(runner).toContain('"--auth-host=reject"');
    expect(runner).toContain("-h '' -k ${socketDirectory}");
    expect(runner).toContain("create role supabase_admin nologin bypassrls");
    expect(runner).not.toContain("create role supabase_admin login bypassrls");
  });

  it("returns the fixed safe summary and never accepts a mutation counter input", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");

    expect(sql).toMatch(/'counter_scope', 'SINCE_DEPLOY'/i);
    expect(sql).toMatch(/'observation_started_at'/i);
    expect(sql).toMatch(/'account_session_stale_count'/i);
    expect(sql).toMatch(/'stale_token_mutation_count'/i);
    expect(sql).toMatch(/'first_stale_at'/i);
    expect(sql).not.toMatch(/record_full_local_session_stale_observation\([^)]*,/i);
    expect(sql).toMatch(
      /p_reason not in \(\s*'identity_mismatch', 'generation_mismatch', 'non_monotonic', 'auth_unavailable'\s*\)/i,
    );
    expect(sql).toMatch(/p_reason in \('revoked', 'missing'\)[\s\S]*return/i);
  });

  it("adds bounded internal stale reasons without changing public errors", async () => {
    const sql = await readFile(MIGRATION_PATH, "utf8");

    for (const reason of [
      "revoked",
      "missing",
      "identity_mismatch",
      "generation_mismatch",
      "non_monotonic",
      "auth_unavailable",
    ]) {
      expect(sql).toContain(`HOMECOOK_SESSION_AUTHORITY_REASON::${reason}`);
    }
    expect(sql).toMatch(/raise exception 'ACCOUNT_SESSION_STALE'/i);
    expect(sql).toMatch(/raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE'/i);
    expect(sql).not.toMatch(/raise exception 'HOMECOOK_SESSION_AUTHORITY_REASON/i);
  });

  it("classifies the new functions in the authorization manifest", async () => {
    const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as {
      migrations: string[];
      functions: Array<{
        signature: string;
        allowed_principals: string[];
        security_mode: string;
      }>;
    };

    expect(manifest.migrations).toContain(MIGRATION_PATH);
    for (const signature of [
      "private.assert_full_local_session_observability_scope()",
      "public.record_full_local_session_stale_observation(text)",
      "public.read_full_local_session_observation()",
    ]) {
      expect(manifest.functions).toContainEqual(expect.objectContaining({
        signature,
        security_mode: "definer",
      }));
    }
    expect(manifest.functions.find((entry) =>
      entry.signature === "public.read_full_local_session_observation()"
    )?.allowed_principals).toEqual(["service_role", "supabase_admin"]);
  });
});
