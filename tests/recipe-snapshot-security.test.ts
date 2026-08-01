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

function latestFunction(sql: string, functionName: string) {
  const marker = `create or replace function public.${functionName}()`;
  const start = sql.toLowerCase().lastIndexOf(marker);
  expect(start, `${functionName} function is missing`).toBeGreaterThanOrEqual(0);
  const bodyStart = sql.indexOf("as $$", start);
  const end = sql.indexOf("\n$$;", bodyStart);
  expect(bodyStart, `${functionName} body is missing`).toBeGreaterThan(start);
  expect(end, `${functionName} terminator is missing`).toBeGreaterThan(bodyStart);
  return sql.slice(start, end + 4);
}

describe("recipe snapshot mutation security", () => {
  it("keeps snapshot mutation server-owned and validates private/public ownership pairs", () => {
    const sql = readMigrationSource();
    const ownership = latestFunction(
      sql,
      "validate_recipe_content_snapshot_ownership",
    );

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
    expect(ownership).toContain(
      "recipe_content_snapshot recipe nutrition mismatch",
    );
    expect(ownership).toContain("v_nutrition_recipe_id is distinct from new.recipe_id");
    expect(ownership).toContain("recipe_content_snapshot ownership mismatch");
    expect(ownership).toContain("v_nutrition_owner is distinct from new.owner_user_id");
  });

  it("allows hard delete only for the transaction-local exact owner cleanup guard", () => {
    const sql = readMigrationSource();
    const contentGuard = latestFunction(
      sql,
      "prevent_recipe_content_snapshot_mutation",
    );
    const nutritionGuard = latestFunction(sql, "protect_recipe_nutrition_snapshot");

    for (const guard of [contentGuard, nutritionGuard]) {
      expect(guard).toContain("if tg_op = 'DELETE' then");
      expect(guard).toContain(
        "'homecook.recipe_snapshot_account_cleanup_owner'",
      );
      expect(guard).toContain("v_cleanup_owner = old.owner_user_id::text");
    }
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
