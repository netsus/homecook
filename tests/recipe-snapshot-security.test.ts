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

const migrationSql = readMigrationSource();

function readLatestFunctionSource(functionName: string) {
  const matches = migrationSql.matchAll(
    new RegExp(
      `create or replace function public\\.${functionName}\\([^)]*\\)[\\s\\S]*?\\n\\$\\$;`,
      "gi",
    ),
  );

  return Array.from(matches).at(-1)?.[0] ?? "";
}

describe("recipe snapshot mutation security", () => {
  it("keeps snapshot mutation server-owned and validates private/public ownership pairs", () => {
    const contentOwnership = readLatestFunctionSource(
      "validate_recipe_content_snapshot_ownership",
    );

    expect(
      /revoke all on table public\.recipe_content_snapshots from public,\s*anon,\s*authenticated,\s*service_role/i
        .test(migrationSql),
      "content snapshot table mutation must be revoked from ordinary principals",
    ).toBe(true);
    expect(
      /before update or delete on public\.recipe_content_snapshots/i.test(migrationSql),
      "content snapshot immutable trigger is missing",
    ).toBe(true);
    expect(
      /alter table public\.recipe_nutrition_snapshots[^;]*add column(?: if not exists)? owner_user_id uuid/i
        .test(migrationSql),
      "nutrition snapshots need additive nullable ownership",
    ).toBe(true);
    expect(
      /recipe_content_snapshot[\s\S]*(owner|ownership)[\s\S]*(recipe|nutrition)[\s\S]*(mismatch|match)/i
        .test(contentOwnership),
      "private/public content-nutrition ownership validation is missing",
    ).toBe(true);
  });

  it("allows hard delete only for the transaction-local exact owner cleanup guard", () => {
    const contentMutation = readLatestFunctionSource(
      "prevent_recipe_content_snapshot_mutation",
    );
    const nutritionMutation = readLatestFunctionSource(
      "protect_recipe_nutrition_snapshot",
    );

    expect(
      /tg_op\s*=\s*'DELETE'[\s\S]*current_setting\s*\(\s*'homecook\.recipe_snapshot_account_cleanup_owner'/i
        .test(contentMutation),
      "content immutable guard does not consume the exact-owner cleanup setting",
    ).toBe(true);
    expect(
      /tg_op\s*=\s*'DELETE'[\s\S]*current_setting\s*\(\s*'homecook\.recipe_snapshot_account_cleanup_owner'/i
        .test(nutritionMutation),
      "nutrition immutable guard does not consume the exact-owner cleanup setting",
    ).toBe(true);
    expect(
      /old\.owner_user_id/i.test(contentMutation),
      "cleanup exception is not tied to the deleted row owner",
    ).toBe(true);
  });

  it("rejects owner-neutral private rows, owned public rows, and soft-deleted recipe snapshots", () => {
    const contentOwnership = readLatestFunctionSource(
      "validate_recipe_content_snapshot_ownership",
    );

    expect(
      /visibility[\s\S]*private[\s\S]*owner_user_id/i.test(contentOwnership),
      "private recipe snapshots do not require the recipe owner",
    ).toBe(true);
    expect(
      /visibility[\s\S]*public[\s\S]*owner_user_id/i.test(contentOwnership),
      "public/shared snapshots are not constrained to owner-null",
    ).toBe(true);
    expect(
      /deleted_at[\s\S]*(raise exception|23514)/i.test(contentOwnership),
      "soft-deleted recipes can still create snapshots",
    ).toBe(true);
  });

  it("derives nutrition ownership and blocks soft-deleted current transitions", () => {
    const nutritionOwnership = readLatestFunctionSource(
      "validate_recipe_nutrition_snapshot_ownership",
    );
    const nutritionMutation = readLatestFunctionSource(
      "protect_recipe_nutrition_snapshot",
    );

    expect(
      /before insert or update/i.test(migrationSql) && nutritionOwnership.length > 0,
      "nutrition snapshots need a server-derived owner/recipe validation trigger",
    ).toBe(true);
    expect(
      /deleted_at[\s\S]*(raise exception|23514)/i.test(nutritionOwnership),
      "soft-deleted recipes can still create or switch nutrition snapshots",
    ).toBe(true);
    expect(
      /homecook\.recipe_nutrition_writer[\s\S]*is_current/i.test(nutritionMutation),
      "the existing allowlisted current-switch writer contract was not preserved",
    ).toBe(true);
  });

  it("preserves hardened SECURITY DEFINER search paths and service-only cleanup ACL", () => {
    const cleanup = readLatestFunctionSource("delete_user_private_data");

    expect(cleanup).toMatch(
      /security definer[\s\S]*set search_path\s*=\s*pg_catalog,\s*public,\s*pg_temp/i,
    );
    expect(migrationSql).toMatch(
      /revoke all on function public\.delete_user_private_data\(uuid\)[\s\S]*from public,\s*anon,\s*authenticated[\s\S]*grant execute on function public\.delete_user_private_data\(uuid\)[\s\S]*to service_role/i,
    );
  });
});
