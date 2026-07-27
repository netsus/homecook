import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260724300000_recipe_image_lifecycle_completion_candidate_authority.sql",
);

describe("managed recipe image lifecycle completion candidate authority", () => {
  it("lists at most 50 ready rows in one exact durable cursor order", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /create or replace function public\.list_recipe_image_lifecycle_completion_candidates\(/i,
    );
    expect(sql).toMatch(
      /p_limit is null[\s\S]*p_limit < 1[\s\S]*p_limit > 50/i,
    );
    expect(sql).toMatch(
      /p_after_auth_identity_deleted_at is null[\s\S]*p_after_owner_uuid is null[\s\S]*p_after_account_generation is null[\s\S]*is distinct from/i,
    );
    expect(sql).toMatch(
      /\(\s*lifecycle\.auth_identity_deleted_at,\s*lifecycle\.owner_uuid,\s*lifecycle\.account_generation\s*\)\s*>\s*\(\s*p_after_auth_identity_deleted_at,\s*p_after_owner_uuid,\s*p_after_account_generation\s*\)/i,
    );
    expect(sql).toMatch(
      /order by\s+lifecycle\.auth_identity_deleted_at,\s*lifecycle\.owner_uuid,\s*lifecycle\.account_generation[\s\S]*limit p_limit/i,
    );
    expect(sql).not.toMatch(/for update|skip locked/i);
  });

  it("excludes every incomplete Auth, Storage, registry, or owner-signal row", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /lifecycle\.status = 'cleanup_pending'[\s\S]*lifecycle\.personal_db_deleted_at is not null[\s\S]*lifecycle\.auth_identity_deleted_at is not null[\s\S]*lifecycle\.auth_identity_deleted_at <= p_now/i,
    );
    expect(sql).toMatch(
      /auth_outbox\.auth_identity_created_at_snapshot[\s\S]*lifecycle\.auth_identity_created_at_snapshot[\s\S]*auth_outbox\.state = 'succeeded'[\s\S]*auth_outbox\.terminal_result in \(\s*'deleted',\s*'already_absent',\s*'identity_replaced'\s*\)/i,
    );
    expect(sql).toMatch(
      /auth_terminal_count = 1[\s\S]*auth_nonterminal_count = 0[\s\S]*auth_dead_letter_count = 0[\s\S]*auth_epoch_mismatch_count = 0/i,
    );
    expect(sql).toMatch(
      /terminal_cleanup_generation_count\s*=\s*lifecycle\.required_cleanup_generation[\s\S]*storage_nonterminal_count = 0[\s\S]*storage_dead_letter_count = 0[\s\S]*storage_generation_mismatch_count = 0[\s\S]*storage_registry_mismatch_count = 0/i,
    );
    expect(sql).toMatch(
      /registry_nonterminal_count = 0[\s\S]*registry_generation_mismatch_count = 0[\s\S]*registry_terminal_mismatch_count = 0/i,
    );
    expect(sql).toMatch(
      /inspect_recipe_image_expected_owner_signal\([\s\S]*owner_signal\.union_signal_count = 0[\s\S]*owner_signal\.union_zero is true/i,
    );
  });

  it("preserves the generation cutover fence and service-only least privilege", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/current_setting\('transaction_isolation'\)/i);
    expect(sql).toMatch(
      /pg_advisory_xact_lock_shared[\s\S]*homecook-account-generation-cutover[\s\S]*for key share/i,
    );
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(
      /set search_path = pg_catalog, public, pg_temp/i,
    );
    expect(sql).toMatch(
      /revoke all[\s\S]*list_recipe_image_lifecycle_completion_candidates[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute[\s\S]*list_recipe_image_lifecycle_completion_candidates[\s\S]*to service_role/i,
    );
    expect(sql).not.toMatch(
      /update\s+public\.user_account_lifecycles|delete\s+from|insert\s+into/i,
    );
    expect(sql).not.toMatch(/delete_user|auth\.users|supabase\.auth\.admin/i);
  });
});
