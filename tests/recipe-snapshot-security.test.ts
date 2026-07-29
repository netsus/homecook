import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationsDirectory = join(process.cwd(), "supabase", "migrations");

function readMigrationSource() {
  return readdirSync(migrationsDirectory)
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort()
    .map((fileName) => readFileSync(join(migrationsDirectory, fileName), "utf8"))
    .join("\n");
}

describe("recipe snapshot mutation security", () => {
  it("keeps snapshot mutation server-owned and validates private/public ownership pairs", () => {
    const sql = readMigrationSource();

    expect(
      /revoke all on table public\.recipe_content_snapshots from public,\s*anon,\s*authenticated,\s*service_role/i
        .test(sql),
      "content snapshot table mutation must be revoked from ordinary principals",
    ).toBe(true);
    expect(
      /before update or delete on public\.recipe_content_snapshots/i.test(sql),
      "content snapshot immutable trigger is missing",
    ).toBe(true);
    expect(
      /alter table public\.recipe_nutrition_snapshots[\s\S]*add column(?: if not exists)? owner_user_id uuid/i
        .test(sql),
      "nutrition snapshots need additive nullable ownership",
    ).toBe(true);
    expect(
      /recipe_content_snapshot[\s\S]*(owner|ownership)[\s\S]*(recipe|nutrition)[\s\S]*(mismatch|match)/i
        .test(sql),
      "private/public content-nutrition ownership validation is missing",
    ).toBe(true);
  });

  it("allows hard delete only for the transaction-local exact owner cleanup guard", () => {
    const sql = readMigrationSource();

    expect(
      /prevent_recipe_content_snapshot_mutation[\s\S]*tg_op\s*=\s*'DELETE'[\s\S]*current_setting\s*\(\s*'homecook\.recipe_snapshot_account_cleanup_owner'/i
        .test(sql),
      "content immutable guard does not consume the exact-owner cleanup setting",
    ).toBe(true);
    expect(
      /protect_recipe_nutrition_snapshot[\s\S]*tg_op\s*=\s*'DELETE'[\s\S]*current_setting\s*\(\s*'homecook\.recipe_snapshot_account_cleanup_owner'/i
        .test(sql),
      "nutrition immutable guard does not consume the exact-owner cleanup setting",
    ).toBe(true);
    expect(
      /prevent_recipe_(?:content|nutrition)_snapshot_mutation[\s\S]*old\.owner_user_id/i
        .test(sql),
      "cleanup exception is not tied to the deleted row owner",
    ).toBe(true);
  });

  it("rejects owner-neutral private rows, owned public rows, and soft-deleted recipe snapshots", () => {
    const sql = readMigrationSource();

    expect(
      /validate_recipe_content_snapshot_ownership[\s\S]*visibility[\s\S]*private[\s\S]*owner_user_id/i
        .test(sql),
      "private recipe snapshots do not require the recipe owner",
    ).toBe(true);
    expect(
      /validate_recipe_content_snapshot_ownership[\s\S]*visibility[\s\S]*public[\s\S]*owner_user_id/i
        .test(sql),
      "public/shared snapshots are not constrained to owner-null",
    ).toBe(true);
    expect(
      /validate_recipe_content_snapshot_ownership[\s\S]*deleted_at[\s\S]*(raise exception|23514)/i
        .test(sql),
      "soft-deleted recipes can still create snapshots",
    ).toBe(true);
  });

  it("derives nutrition ownership and blocks soft-deleted current transitions", () => {
    const sql = readMigrationSource();

    expect(
      /validate_recipe_nutrition_snapshot_ownership[\s\S]*before insert or update/i
        .test(sql),
      "nutrition snapshots need a server-derived owner/recipe validation trigger",
    ).toBe(true);
    expect(
      /validate_recipe_nutrition_snapshot_ownership[\s\S]*deleted_at[\s\S]*(raise exception|23514)/i
        .test(sql),
      "soft-deleted recipes can still create or switch nutrition snapshots",
    ).toBe(true);
    expect(
      /protect_recipe_nutrition_snapshot[\s\S]*homecook\.recipe_nutrition_writer[\s\S]*is_current/i
        .test(sql),
      "the existing allowlisted current-switch writer contract was not preserved",
    ).toBe(true);
  });

  it("preserves hardened SECURITY DEFINER search paths and service-only cleanup ACL", () => {
    const sql = readMigrationSource();
    const cleanup = sql.match(
      /create or replace function public\.delete_user_private_data\(p_user_id uuid\)([\s\S]*?)\n\$\$;/gi,
    )?.at(-1) ?? "";

    expect(cleanup).toMatch(
      /security definer[\s\S]*set search_path\s*=\s*pg_catalog,\s*public,\s*pg_temp/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.delete_user_private_data\(uuid\)[\s\S]*from public,\s*anon,\s*authenticated[\s\S]*grant execute on function public\.delete_user_private_data\(uuid\)[\s\S]*to service_role/i,
    );
  });
});
