import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260724290000_recipe_image_lifecycle_completion_authority.sql",
);

describe("managed recipe image lifecycle completion authority", () => {
  it("requires the exact resolved cleanup lifecycle and terminal Auth epoch", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /create or replace function public\.complete_recipe_image_account_lifecycle\(/i,
    );
    expect(sql).toMatch(
      /lifecycle\.owner_uuid = p_owner_uuid[\s\S]*lifecycle\.account_generation = p_account_generation/i,
    );
    expect(sql).toMatch(
      /v_lifecycle\.status not in \('cleanup_pending', 'complete'\)[\s\S]*v_lifecycle\.personal_db_deleted_at is null[\s\S]*v_lifecycle\.auth_identity_deleted_at is null/i,
    );
    expect(sql).toMatch(
      /auth_outbox\.auth_identity_created_at_snapshot[\s\S]*v_lifecycle\.auth_identity_created_at_snapshot/i,
    );
    expect(sql).toMatch(
      /auth_outbox\.state = 'succeeded'[\s\S]*auth_outbox\.terminal_result in \(\s*'deleted',\s*'already_absent',\s*'identity_replaced'\s*\)/i,
    );
  });

  it("requires contiguous terminal cleanup generations and exact object evidence", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /count\(distinct outbox\.cleanup_generation\)[\s\S]*between 1 and v_required_cleanup_generation/i,
    );
    expect(sql).toMatch(
      /count\(distinct outbox\.cleanup_generation\)[\s\S]*exists \([\s\S]*from public\.recipe_image_objects as durable_object[\s\S]*durable_object\.cleanup_generation[\s\S]*>= outbox\.cleanup_generation/i,
    );
    expect(sql).toMatch(
      /v_terminal_cleanup_generation_count\s*<>\s*v_required_cleanup_generation/i,
    );
    expect(sql).toMatch(
      /outbox\.state <> 'succeeded'[\s\S]*v_storage_nonterminal_count/i,
    );
    expect(sql).toMatch(
      /outbox\.state = 'dead_letter'[\s\S]*v_storage_dead_letter_count/i,
    );
    expect(sql).toMatch(
      /not exists \([\s\S]*from public\.recipe_image_objects as durable_object[\s\S]*v_storage_registry_mismatch_count/i,
    );
    expect(sql).toMatch(
      /object\.state not in \('deleted', 'verified_not_found'\)[\s\S]*v_registry_nonterminal_count/i,
    );
    expect(sql).toMatch(
      /not exists \([\s\S]*storage_object_deletion_outbox[\s\S]*terminal_result[\s\S]*v_registry_terminal_mismatch_count/i,
    );
  });

  it("rechecks expected-owner union-zero before the terminal transition", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /from public\.inspect_recipe_image_expected_owner_signal\(\s*p_owner_uuid,\s*p_account_generation\s*\)/i,
    );
    expect(sql).toMatch(/v_owner_signal_union_count <> 0/i);
    expect(sql).toMatch(/v_owner_signal_union_zero is distinct from true/i);
  });

  it("updates only the exact cleanup-pending generation and remains service-only", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /set\s+status = 'complete',[\s\S]*completed_cleanup_generation = v_required_cleanup_generation[\s\S]*revision = revision \+ 1/i,
    );
    expect(sql).toMatch(
      /where owner_uuid = p_owner_uuid[\s\S]*account_generation = p_account_generation[\s\S]*status = 'cleanup_pending'[\s\S]*required_cleanup_generation = v_required_cleanup_generation/i,
    );
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(
      /set search_path = pg_catalog, public, pg_temp/i,
    );
    expect(sql).toMatch(/current_setting\('transaction_isolation'\)/i);
    expect(sql).toMatch(
      /pg_advisory_xact_lock_shared[\s\S]*homecook-account-generation-cutover[\s\S]*for key share[\s\S]*pg_advisory_xact_lock[\s\S]*homecook-account-owner:/i,
    );
    expect(sql).toMatch(
      /revoke all[\s\S]*complete_recipe_image_account_lifecycle[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute[\s\S]*complete_recipe_image_account_lifecycle[\s\S]*to service_role/i,
    );
    expect(sql).not.toMatch(/delete_user|auth\.users/i);
  });
});
