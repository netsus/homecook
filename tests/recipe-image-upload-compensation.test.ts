import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/20260724150000_recipe_image_upload_compensation.sql",
);

describe("recipe image upload compensation authority", () => {
  it("moves only the exact pending attempt into a newer cleanup generation", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    if (!existsSync(MIGRATION_PATH)) {
      return;
    }

    const sql = readFileSync(MIGRATION_PATH, "utf8");
    expect(sql).toMatch(
      /create or replace function public\.compensate_recipe_image_upload\(/i,
    );
    expect(sql).toMatch(/transaction_isolation[\s\S]*read committed/i);
    expect(sql).toMatch(
      /idempotency\.operation_scope\s*=\s*'recipe_image_upload'[\s\S]*idempotency\.state\s*=\s*'in_progress'[\s\S]*idempotency\.attempt_token\s*=\s*p_attempt_token/i,
    );
    expect(sql).toMatch(
      /object\.state\s*=\s*'pending_upload'[\s\S]*object\.upload_attempt_token\s*=\s*p_attempt_token[\s\S]*object\.cleanup_generation\s*=\s*p_cleanup_generation/i,
    );
    expect(sql).toMatch(
      /set state\s*=\s*'cleanup_pending'[\s\S]*cleanup_generation\s*=\s*p_cleanup_generation\s*\+\s*1[\s\S]*upload_attempt_token\s*=\s*null[\s\S]*upload_lease_expires_at\s*=\s*null/i,
    );
  });

  it("durably terminates the key, enqueues cleanup, and releases active quota", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    if (!existsSync(MIGRATION_PATH)) {
      return;
    }

    const sql = readFileSync(MIGRATION_PATH, "utf8");
    expect(sql).toMatch(
      /update public\.mutation_idempotency_keys[\s\S]*state\s*=\s*'failed_terminal'[\s\S]*terminal_result\s*=\s*'cleanup_pending'/i,
    );
    expect(sql).toMatch(/public\.enqueue_recipe_image_cleanup\(/i);
    expect(sql).toMatch(/public\.release_recipe_image_upload_reservation\(/i);
    expect(sql).toMatch(/storage_upload_failed/i);
    expect(sql).toMatch(/storage_upload_timeout/i);
    expect(sql).toMatch(/storage_finalize_failed/i);
    expect(sql).toMatch(/storage_compensation_failed/i);
  });

  it("keeps compensation service-only with a hardened search path", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    if (!existsSync(MIGRATION_PATH)) {
      return;
    }

    const sql = readFileSync(MIGRATION_PATH, "utf8");
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(
      /set search_path\s*=\s*pg_catalog,\s*public,\s*extensions,\s*pg_temp/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.compensate_recipe_image_upload\([\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute on function public\.compensate_recipe_image_upload\([\s\S]*to service_role/i,
    );
  });
});
