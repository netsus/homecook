import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260802130000_personal_recipe_customization_write_core.sql",
);

function migration() {
  expect(existsSync(migrationPath), "personal recipe write migration is missing").toBe(
    true,
  );
  return readFileSync(migrationPath, "utf8");
}

describe("personal recipe deletion and account cleanup", () => {
  it("soft-deletes through the same guarded RPC without detaching history", () => {
    const sql = migration();

    expect(sql).toContain("'delete'");
    expect(sql).toMatch(/set deleted_at\s*=\s*coalesce\(recipe\.deleted_at,\s*p_now\)/i);
    expect(sql).not.toMatch(/delete from public\.recipes[\s\S]*p_recipe_id/i);
    expect(sql).not.toMatch(/delete from public\.recipe_content_snapshots[\s\S]*p_recipe_id/i);
    expect(sql).toMatch(
      /v_recipe\.visibility = 'public'[\s\S]*recipe_visibility_guard\.is_owner_publicly_visible\(v_recipe\.created_by\)[\s\S]*RESOURCE_NOT_FOUND/i,
    );
  });

  it("removes personal idempotency tombstones only inside exact account cleanup before private recipes", () => {
    const sql = migration();
    const cleanup = sql.indexOf("create or replace function public.cleanup_personal_recipe_write_receipts");
    const idempotencyDelete = sql.indexOf("delete from public.mutation_idempotency_keys", cleanup);
    const trigger = sql.indexOf("create trigger cleanup_personal_recipe_write_receipts", cleanup);

    expect(cleanup).toBeGreaterThan(-1);
    expect(idempotencyDelete).toBeGreaterThan(cleanup);
    expect(trigger).toBeGreaterThan(idempotencyDelete);
    expect(sql).toMatch(/operation_scope like 'personal_recipe_%'/i);
    expect(sql).toMatch(/account_generation\s*=\s*new\.account_generation/i);
    expect(sql).toMatch(/new\.status is distinct from 'deleting'/i);
  });

  it("preserves public/shared owner-neutral rows during private cleanup", () => {
    migration();
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260731111000_product_ingredient_link_account_cleanup.sql",
      ),
      "utf8",
    );

    expect(sql).toMatch(/recipe_snapshot_account_cleanup_guard\(p_user_id\)/i);
    expect(sql).toMatch(/visibility\s*=\s*'private'/i);
    expect(sql).toMatch(/owner_user_id\s*=\s*p_user_id/i);
    expect(sql).not.toMatch(/delete from public\.recipe_content_snapshots\s*;|delete from public\.recipe_nutrition_snapshots\s*;/i);
  });
});
