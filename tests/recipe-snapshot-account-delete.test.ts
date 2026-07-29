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

describe("recipe snapshot account cleanup boundary", () => {
  it("adds claims and deletes private snapshot dependencies in the guarded FK order", () => {
    const sql = readMigrationSource();

    expect(
      /create table(?: if not exists)? public\.cooking_session_meal_claims\s*\([\s\S]*meal_id uuid primary key/i
        .test(sql),
      "Meal active-claim authority is missing",
    ).toBe(true);
    expect(
      /delete from public\.cooking_session_meal_claims[\s\S]*delete from public\.cooking_session_meals[\s\S]*delete from public\.cooking_sessions[\s\S]*delete from public\.meals[\s\S]*delete from public\.leftover_dishes[\s\S]*delete from public\.recipe_content_snapshots[\s\S]*delete from public\.recipe_nutrition_snapshots[\s\S]*delete from public\.recipes/i
        .test(sql),
      "account cleanup does not preserve the required FK deletion order",
    ).toBe(true);
    expect(
      /recipe_snapshot_account_cleanup_guard[\s\S]*set_config[\s\S]*owner/i.test(sql),
      "snapshot hard delete lacks an exact-owner transaction guard",
    ).toBe(true);
    expect(
      /alter table public\.meals[^;]*leftover_dish_id[^;]*on delete set null/i.test(sql),
      "Meal-to-leftover FK must not be relaxed to SET NULL",
    ).toBe(false);
  });

  it("runs the cleanup chain for every owned Meal/session even when no private recipe exists", () => {
    const sql = readMigrationSource();
    const cleanupFunction = sql.match(
      /create or replace function public\.delete_user_private_data\(p_user_id uuid\)([\s\S]*?)\n\$\$;/gi,
    )?.at(-1) ?? "";

    expect(cleanupFunction.length, "latest account cleanup function is missing").toBeGreaterThan(0);
    expect(
      /delete from public\.cooking_session_meal_claims/i.test(cleanupFunction),
      "account cleanup does not delete active claims",
    ).toBe(true);
    expect(
      /delete from public\.meals/i.test(cleanupFunction),
      "account cleanup does not delete owned Meals explicitly",
    ).toBe(true);
    expect(
      /if cardinality\(v_private_recipe_ids\) > 0 then[\s\S]*delete from public\.meals/i
        .test(cleanupFunction),
      "owned Meal cleanup must not depend on owning a private recipe",
    ).toBe(false);
  });
});
