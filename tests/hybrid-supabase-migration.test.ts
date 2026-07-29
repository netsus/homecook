import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const MIGRATION_PATH
  = "supabase/migrations/20260730090000_hybrid_auth_remote_identity_epoch_mirror.sql";
const sql = readFileSync(MIGRATION_PATH, "utf8");

describe("hybrid remote identity/session authority migration", () => {
  it("creates a PII-free private active-epoch singleton", () => {
    expect(sql).toMatch(
      /create table(?: if not exists)? private\.remote_auth_identity_epochs/i,
    );
    expect(sql).toMatch(
      /create unique index remote_auth_identity_epochs_one_active_owner_idx[\s\S]+on private\.remote_auth_identity_epochs\s*\(\s*issuer\s*,\s*owner_uuid\s*\)[\s\S]+where active_epoch and deleted_terminal_at is null/i,
    );
    expect(sql).toMatch(/verified_at timestamptz not null/i);
    expect(sql).not.toMatch(
      /\b(email|phone|provider_subject|raw_user_meta_data|raw_provider_payload|refresh_token|access_token)\b/i,
    );
    expect(sql).toMatch(
      /revoke all on private\.remote_auth_identity_epochs from public, anon, authenticated/i,
    );
  });

  it("extends the existing binding with remote liveness TTL and epoch identity", () => {
    expect(sql).toMatch(
      /alter table public\.user_session_generation_bindings[\s\S]+add column issuer text/i,
    );
    expect(sql).toMatch(/add column remote_verified_at timestamptz/i);
    expect(sql).toMatch(/add column binding_expires_at timestamptz/i);
    expect(sql).toMatch(/add column binding_state text/i);
    expect(sql).toMatch(
      /foreign key\s*\(\s*issuer\s*,\s*owner_uuid\s*,\s*auth_identity_created_at_snapshot\s*\)[\s\S]+references private\.remote_auth_identity_epochs/i,
    );
    expect(sql).toMatch(
      /alter column expected_account_generation drop not null/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.record_hybrid_remote_session_authority\(/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.revoke_hybrid_remote_session_authority\(/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.assert_hybrid_remote_session_authority\(/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.record_hybrid_remote_session_authority[\s\S]+to service_role/i,
    );
    expect(sql).toMatch(
      /grant execute on function public\.assert_hybrid_remote_session_authority[\s\S]+to service_role/i,
    );
    expect(sql).toMatch(
      /v_existing_binding\.binding_state in \('revoked', 'deleted_terminal'\)[\s\S]+raise exception 'ACCOUNT_SESSION_STALE'/i,
    );
    expect(sql).toMatch(
      /on conflict \(hmac_key_version, session_key_hash\)[\s\S]+binding_state = 'active'[\s\S]+revoked_at is null/i,
    );
  });

  it("verifies attestation, active epoch and binding in the PostgREST transaction", () => {
    expect(sql).toMatch(
      /create or replace function private\.verify_hybrid_request_authority\(\)/i,
    );
    expect(sql).toMatch(/current_setting\('request\.jwt\.claims'/i);
    expect(sql).toMatch(/current_setting\('request\.headers'/i);
    expect(sql).toMatch(/current_setting\('request\.method'/i);
    expect(sql).toMatch(/current_setting\('request\.path'/i);
    expect(sql).toMatch(/extensions\.hmac/i);
    expect(sql).toMatch(/app\.settings\.auth_expected_issuer/i);
    expect(sql).toMatch(/v_attestation_exp - v_attestation_iat > 60/i);
    expect(sql).toMatch(
      /from private\.remote_auth_identity_epochs[\s\S]+for (?:key )?share/i,
    );
    expect(sql).toMatch(
      /from public\.user_session_generation_bindings[\s\S]+for (?:key )?share/i,
    );
    expect(sql).toMatch(
      /alter role authenticator set pgrst\.db_pre_request\s*=\s*'private\.verify_hybrid_request_authority'/i,
    );
    expect(sql).toMatch(
      /revoke all on schema private from public[\s\S]+grant usage on schema private to anon, authenticated, service_role/i,
    );
    expect(sql).toMatch(
      /grant execute on function private\.verify_hybrid_request_authority\(\)\s+to anon, authenticated, service_role/i,
    );
  });

  it("replaces the three historical auth.users FKs without reviving audit ownership", () => {
    expect(sql).toMatch(
      /admin_members_user_id_fkey[\s\S]+references public\.users\(id\)/i,
    );
    expect(sql).toMatch(
      /admin_members_granted_by_fkey[\s\S]+references public\.users\(id\)[\s\S]+on delete set null/i,
    );
    expect(sql).toMatch(
      /admin_audit_logs[\s\S]+actor_identity_created_at_snapshot/i,
    );
    expect(sql).toMatch(
      /drop constraint if exists admin_audit_logs_actor_admin_user_id_fkey/i,
    );
    expect(sql).toMatch(
      /admin_audit_logs_actor_public_user_id_fkey[\s\S]+references public\.users\(id\)[\s\S]+on delete set null/i,
    );
    expect(sql).toMatch(
      /validate constraint admin_members_user_id_fkey/i,
    );
    expect(sql).toMatch(
      /validate constraint user_session_generation_bindings_epoch_fkey/i,
    );
  });

  it("keeps generation activation and old auth.users functions fail closed", () => {
    expect(sql).toMatch(
      /create or replace function public\.promote_account_generation_cutover\(/i,
    );
    expect(sql).toMatch(
      /raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE'/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.bootstrap_account_generation_identity\(/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.bootstrap_account_generation_identity\([\s\S]+?set search_path = pg_catalog, public, auth, pg_temp[\s\S]+?as \$function\$/i,
    );
    expect(sql).toMatch(
      /create or replace function public\.resolve_account_cutover_quarantine\([\s\S]+?set search_path = pg_catalog, public, auth, extensions, pg_temp[\s\S]+?as \$function\$/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.bootstrap_account_generation_identity\([\s\S]+?from public, anon, authenticated[\s\S]+?grant execute on function public\.bootstrap_account_generation_identity\([\s\S]+?to service_role/i,
    );
    expect(sql).not.toMatch(/lock table auth\.users/i);
    expect(sql).not.toMatch(/from auth\.users/i);
    expect(sql).not.toMatch(/references auth\.users/i);
  });
});
