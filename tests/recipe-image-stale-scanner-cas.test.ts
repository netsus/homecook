import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260724200000_recipe_image_stale_scanner_cas.sql",
);

describe("managed recipe image stale scanner CAS", () => {
  it("claims at most 50 due upload leases or unlinked grace rows", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /create or replace function public\.scan_stale_recipe_image_uploads\(/i,
    );
    expect(sql).toMatch(/p_limit < 1[\s\S]*p_limit > 50/i);
    expect(sql).toMatch(
      /state = 'pending_upload'[\s\S]*upload_lease_expires_at <= p_now/i,
    );
    expect(sql).toMatch(
      /state = 'uploaded_unlinked'[\s\S]*unlinked_cleanup_after <= p_now/i,
    );
    expect(sql).toMatch(
      /order by[\s\S]*coalesce\([\s\S]*upload_lease_expires_at[\s\S]*unlinked_cleanup_after[\s\S]*object\.id/i,
    );
  });

  it("uses the owner lock and exact idempotency/object CAS before cleanup", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /pg_try_advisory_xact_lock[\s\S]*homecook-account-owner:/i,
    );
    expect(sql).toMatch(
      /mutation_idempotency_keys[\s\S]*operation_scope = 'recipe_image_upload'[\s\S]*for update/i,
    );
    expect(sql).toMatch(
      /recipe_image_objects[\s\S]*for update/i,
    );
    expect(sql).toMatch(
      /not exists \([\s\S]*recipe_image_object_references[\s\S]*image_object_id = v_object\.id/i,
    );
    expect(sql).toMatch(
      /set state = 'cancelled'[\s\S]*terminal_result = 'cleanup_pending'[\s\S]*attempt_token = null[\s\S]*lease_expires_at = null/i,
    );
    expect(sql).toMatch(
      /set state = 'cleanup_pending'[\s\S]*cleanup_generation = v_next_cleanup_generation[\s\S]*upload_attempt_token = null[\s\S]*upload_lease_expires_at = null[\s\S]*unlinked_cleanup_after = null/i,
    );
  });

  it("enqueues one cleanup generation and releases the active reservation", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /public\.enqueue_recipe_image_cleanup\([\s\S]*'stale_upload'/i,
    );
    expect(sql).toMatch(
      /public\.release_recipe_image_upload_reservation\(/i,
    );
    expect(sql).toMatch(
      /return next/i,
    );
  });

  it("holds the cutover fence and verifies the exact lifecycle generation", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(
      /pg_advisory_xact_lock_shared[\s\S]*homecook-account-generation-cutover/i,
    );
    expect(sql).toMatch(
      /account_generation_capability_state[\s\S]*generation_active/i,
    );
    expect(sql).toMatch(
      /user_account_lifecycles[\s\S]*account_generation = v_candidate\.account_generation[\s\S]*for update/i,
    );
    expect(sql).toMatch(
      /status not in\s*\(\s*'active',\s*'deleting',\s*'cleanup_pending'\s*\)/i,
    );
  });

  it("keeps the scanner service-only with a hardened search path", () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) {
      return;
    }

    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(
      /set search_path = pg_catalog, public, pg_temp/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.scan_stale_recipe_image_uploads\([\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute on function public\.scan_stale_recipe_image_uploads\([\s\S]*to service_role/i,
    );
  });
});
