import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260724280000_recipe_image_auth_deletion_candidate_authority.sql",
);

describe("managed recipe image Auth deletion candidate authority", () => {
  it("lists a bounded due page with an exact durable cursor", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /create or replace function public\.list_recipe_image_auth_deletion_candidates\(/i,
    );
    expect(sql).toMatch(
      /p_limit is null[\s\S]*p_limit < 1[\s\S]*p_limit > 50/i,
    );
    expect(sql).toMatch(
      /p_after_next_attempt_at is null[\s\S]*p_after_outbox_id is null[\s\S]*is distinct from/i,
    );
    expect(sql).toMatch(
      /\(outbox\.next_attempt_at, outbox\.id\)\s*>\s*\(p_after_next_attempt_at, p_after_outbox_id\)/i,
    );
    expect(sql).toMatch(
      /order by outbox\.next_attempt_at, outbox\.id[\s\S]*limit p_limit/i,
    );
    expect(sql).not.toMatch(/skip locked/i);
  });

  it("uses the guarded claim due semantics without claiming or deferring", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /outbox\.state in \('pending', 'failed'\)[\s\S]*outbox\.next_attempt_at <= p_now[\s\S]*outbox\.state = 'processing'[\s\S]*outbox\.lease_expires_at <= p_now/i,
    );
    expect(sql).toMatch(
      /lifecycle\.status = 'cleanup_pending'[\s\S]*lifecycle\.personal_db_deleted_at is not null[\s\S]*lifecycle\.auth_identity_deleted_at is null/i,
    );
    expect(sql).toMatch(
      /outbox\.auth_identity_created_at_snapshot[\s\S]*lifecycle\.auth_identity_created_at_snapshot/i,
    );
    expect(sql).not.toMatch(
      /update\s+public\.auth_identity_deletion_outbox/i,
    );
    expect(sql).not.toMatch(
      /delete\s+from\s+public\.auth_identity_deletion_outbox/i,
    );
  });

  it("preserves the cutover fence and service-only least privilege", () => {
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
      /revoke all[\s\S]*list_recipe_image_auth_deletion_candidates[\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute[\s\S]*list_recipe_image_auth_deletion_candidates[\s\S]*to service_role/i,
    );
    expect(sql).not.toMatch(
      /grant\s+(select|insert|update|delete)[\s\S]*auth_identity_deletion_outbox/i,
    );
    expect(sql).not.toMatch(
      /grant execute[\s\S]*claim_auth_identity_deletion_outbox/i,
    );
    expect(sql).not.toMatch(/delete_user|auth\.users|supabase\.auth\.admin/i);
  });
});
