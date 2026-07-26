import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260724260000_recipe_image_auth_deletion_claim_authority.sql",
);

describe("managed recipe image Auth deletion claim authority", () => {
  it("rechecks readiness before claiming one exact identity epoch", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /create or replace function public\.claim_recipe_image_auth_deletion_if_ready\(/i,
    );
    expect(sql).toMatch(
      /from public\.inspect_recipe_image_auth_deletion_readiness\(\s*p_owner_uuid,\s*p_account_generation,\s*p_now\s*\)[\s\S]*v_readiness\.ready is distinct from true/i,
    );
    expect(sql).toMatch(
      /outbox\.id = p_outbox_id[\s\S]*outbox\.owner_uuid = p_owner_uuid[\s\S]*outbox\.account_generation = p_account_generation[\s\S]*outbox\.auth_identity_created_at_snapshot[\s\S]*v_lifecycle\.auth_identity_created_at_snapshot/i,
    );
  });

  it("claims only after the guarded row is locked and still due", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /from public\.auth_identity_deletion_outbox as outbox[\s\S]*for update[\s\S]*outbox claim identity compare-and-swap failed[\s\S]*public\.claim_auth_identity_deletion_outbox\(/i,
    );
    expect(sql).toMatch(
      /v_outbox\.state in \('pending', 'failed'\)[\s\S]*v_outbox\.next_attempt_at <= p_now[\s\S]*v_outbox\.state = 'processing'[\s\S]*v_outbox\.lease_expires_at <= p_now/i,
    );
  });

  it("preserves READ COMMITTED and the readiness lock order", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/current_setting\('transaction_isolation'\)/i);
    expect(sql).toMatch(
      /inspect_recipe_image_auth_deletion_readiness[\s\S]*claim_auth_identity_deletion_outbox/i,
    );
    expect(sql).not.toMatch(
      /pg_advisory_xact_lock\([\s\S]*homecook-account-owner:[\s\S]*pg_advisory_xact_lock_shared[\s\S]*homecook-account-generation-cutover/i,
    );
  });

  it("opens only the guarded wrapper to service_role", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = pg_catalog, public, pg_temp/i);
    expect(sql).toMatch(
      /revoke all[\s\S]*claim_recipe_image_auth_deletion_if_ready[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute[\s\S]*claim_recipe_image_auth_deletion_if_ready[\s\S]*to service_role/i,
    );
    expect(sql).not.toMatch(
      /grant execute\s+on function public\.claim_auth_identity_deletion_outbox/i,
    );
    expect(sql).not.toMatch(
      /grant execute\s+on function public\.finalize_auth_identity_deletion_outbox/i,
    );
    expect(sql).not.toMatch(/delete_user|auth\.users|supabase\.auth\.admin/i);
  });
});
