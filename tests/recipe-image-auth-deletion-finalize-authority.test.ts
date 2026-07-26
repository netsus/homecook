import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260724270000_recipe_image_auth_deletion_finalize_authority.sql",
);

describe("managed recipe image Auth deletion finalize authority", () => {
  it("locks the exact identity epoch and claimed lease before finalizing", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /create or replace function public\.finalize_recipe_image_auth_deletion_claim\(/i,
    );
    expect(sql).toMatch(
      /pg_advisory_xact_lock_shared[\s\S]*homecook-account-generation-cutover[\s\S]*for key share[\s\S]*pg_advisory_xact_lock[\s\S]*homecook-account-owner:/i,
    );
    expect(sql).toMatch(
      /lifecycle\.owner_uuid = p_owner_uuid[\s\S]*lifecycle\.account_generation = p_account_generation[\s\S]*lifecycle\.auth_identity_created_at_snapshot[\s\S]*p_auth_identity_created_at_snapshot[\s\S]*for update/i,
    );
    expect(sql).toMatch(
      /outbox\.id = p_outbox_id[\s\S]*outbox\.owner_uuid = p_owner_uuid[\s\S]*outbox\.account_generation = p_account_generation[\s\S]*outbox\.auth_identity_created_at_snapshot[\s\S]*p_auth_identity_created_at_snapshot[\s\S]*for update/i,
    );
    expect(sql).toMatch(
      /v_outbox\.state <> 'processing'[\s\S]*v_outbox\.lease_token is distinct from p_lease_token[\s\S]*v_outbox\.attempts is distinct from p_expected_attempts[\s\S]*v_outbox\.lease_expires_at < p_now/i,
    );
  });

  it("delegates to F0 finalize and validates the exact terminal or retry result", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /public\.finalize_auth_identity_deletion_outbox\(\s*p_outbox_id,\s*p_lease_token,\s*p_expected_attempts,\s*p_terminal_result,\s*p_error,\s*p_now\s*\)/i,
    );
    expect(sql).toMatch(
      /p_terminal_result is not null[\s\S]*v_result ->> 'state'[\s\S]*'succeeded'[\s\S]*v_result ->> 'terminal_result'[\s\S]*p_terminal_result/i,
    );
    expect(sql).toMatch(
      /p_terminal_result is null[\s\S]*v_result ->> 'state'[\s\S]*\('failed', 'dead_letter'\)/i,
    );
  });

  it("records terminal identity resolution atomically but leaves retries unresolved", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /if p_terminal_result is not null then[\s\S]*update public\.user_account_lifecycles[\s\S]*auth_identity_deleted_at = p_now[\s\S]*revision = revision \+ 1/i,
    );
    expect(sql).toMatch(
      /where owner_uuid = p_owner_uuid[\s\S]*account_generation = p_account_generation[\s\S]*auth_identity_deleted_at is null/i,
    );
  });

  it("opens only the guarded finalize wrapper to service_role", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = pg_catalog, public, pg_temp/i);
    expect(sql).toMatch(
      /revoke all[\s\S]*finalize_recipe_image_auth_deletion_claim[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute[\s\S]*finalize_recipe_image_auth_deletion_claim[\s\S]*to service_role/i,
    );
    expect(sql).not.toMatch(
      /grant execute\s+on function public\.finalize_auth_identity_deletion_outbox/i,
    );
    expect(sql).not.toMatch(/delete_user|auth\.users|supabase\.auth\.admin/i);
  });
});
