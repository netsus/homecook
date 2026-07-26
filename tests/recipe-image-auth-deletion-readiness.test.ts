import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260724250000_recipe_image_auth_deletion_readiness_authority.sql",
);

describe("managed recipe image Auth deletion readiness authority", () => {
  it("requires the exact cleanup lifecycle and contiguous terminal generations", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /create or replace function public\.inspect_recipe_image_auth_deletion_readiness\(/i,
    );
    expect(sql).toMatch(
      /lifecycle\.owner_uuid = p_owner_uuid[\s\S]*lifecycle\.account_generation = p_account_generation/i,
    );
    expect(sql).toMatch(
      /lifecycle\.status = 'cleanup_pending'[\s\S]*lifecycle\.personal_db_deleted_at is not null/i,
    );
    expect(sql).toMatch(
      /auth_outbox\.auth_identity_created_at_snapshot[\s\S]*v_lifecycle\.auth_identity_created_at_snapshot[\s\S]*auth_outbox\.next_attempt_at <= p_now/i,
    );
    expect(sql).toMatch(
      /count\(distinct outbox\.cleanup_generation\)[\s\S]*between 1 and v_required_cleanup_generation/i,
    );
    expect(sql).toMatch(
      /v_terminal_cleanup_generation_count\s*=\s*v_required_cleanup_generation/i,
    );
  });

  it("fails closed on every nonterminal Storage and registry shape", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /outbox\.state <> 'succeeded'[\s\S]*v_storage_nonterminal_count/i,
    );
    expect(sql).toMatch(
      /outbox\.state = 'dead_letter'[\s\S]*v_storage_dead_letter_count/i,
    );
    expect(sql).toMatch(
      /object\.state not in \('deleted', 'verified_not_found'\)[\s\S]*v_registry_nonterminal_count/i,
    );
    expect(sql).toMatch(
      /object\.cleanup_generation[\s\S]*not between 1 and v_required_cleanup_generation[\s\S]*v_registry_generation_mismatch_count/i,
    );
  });

  it("requires the existing expected-owner union authority to return zero", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /from public\.inspect_recipe_image_expected_owner_signal\(\s*p_owner_uuid,\s*p_account_generation\s*\)/i,
    );
    expect(sql).toMatch(/v_owner_signal_union_count = 0/i);
    expect(sql).toMatch(/v_owner_signal_union_zero/i);
  });

  it("stays a service-only read authority without enabling the Auth consumer", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(
      /set search_path = pg_catalog, public, pg_temp/i,
    );
    expect(sql).toMatch(/current_setting\('transaction_isolation'\)/i);
    expect(sql).toMatch(
      /pg_advisory_xact_lock_shared[\s\S]*homecook-account-generation-cutover[\s\S]*pg_advisory_xact_lock[\s\S]*homecook-account-owner:/i,
    );
    expect(sql).toMatch(
      /revoke all[\s\S]*inspect_recipe_image_auth_deletion_readiness[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute[\s\S]*inspect_recipe_image_auth_deletion_readiness[\s\S]*to service_role/i,
    );
    expect(sql).not.toMatch(/grant execute[\s\S]*claim_auth_identity_deletion_outbox/i);
    expect(sql).not.toMatch(/delete_user|auth\.users/i);
  });
});
