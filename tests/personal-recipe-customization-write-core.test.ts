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

describe("personal recipe customization write core", () => {
  it("dark-ships one server-only generation-bound RPC without a new public route", () => {
    const sql = migration();

    expect(sql).toMatch(/create or replace function public\.write_personal_recipe_core/i);
    expect(sql).toMatch(/current_setting\('homecook\.personal_recipe_v2',\s*true\)/i);
    expect(sql).toMatch(/account_generation_capability_state[\s\S]*generation_active/i);
    expect(sql).toMatch(/user_session_generation_bindings/i);
    expect(sql).toMatch(/revoke all on function public\.write_personal_recipe_core/i);
    expect(sql).toMatch(/grant execute on function public\.write_personal_recipe_core[\s\S]*service_role/i);

    const recipeDetailRoute = readFileSync(
      join(process.cwd(), "app/api/v1/recipes/[id]/route.ts"),
      "utf8",
    );
    expect(recipeDetailRoute).not.toMatch(/export async function (?:PATCH|DELETE)/);
  });

  it("supports create, immutable public fork, same-ID update, and explicit save-as-new", () => {
    const sql = migration();

    for (const operation of ["create", "fork", "update", "save_as_new"]) {
      expect(sql, `missing operation ${operation}`).toContain(`'${operation}'`);
    }
    expect(sql).toMatch(/origin_recipe_id[\s\S]*p_source_recipe_id/i);
    expect(sql).toMatch(/visibility[\s\S]*'private'/i);
    expect(sql).toMatch(/created_by[\s\S]*p_owner_uuid/i);
    expect(sql).toMatch(/revision\s*=\s*recipe\.revision\s*\+\s*1/i);
    expect(sql).toMatch(/base_recipe_revision/i);
  });

  it("replaces canonical ingredients and steps and pins immutable content plus nutrition", () => {
    const sql = migration();

    expect(sql).toMatch(/delete from public\.recipe_ingredients/i);
    expect(sql).toMatch(/insert into public\.recipe_ingredients/i);
    expect(sql).toMatch(/food_product_nutrition_version_id/i);
    expect(sql).toMatch(/delete from public\.recipe_steps/i);
    expect(sql).toMatch(/insert into public\.recipe_steps/i);
    expect(sql).toMatch(/public\.write_recipe_nutrition_snapshot/i);
    expect(sql).toMatch(/public\.build_recipe_nutrition_input_guard/i);
    expect(sql).not.toMatch(/insert into public\.recipe_nutrition_snapshots/i);
    expect(sql).toMatch(/insert into public\.recipe_content_snapshots/i);
    expect(sql).toMatch(/recipe_nutrition_snapshot_id/i);
  });

  it("keeps successor-owned preview, propagation, and session completion absent", () => {
    const sql = migration();

    expect(sql).not.toMatch(/recipe_change_previews|impact_token|future_plan_strategy/i);
    expect(sql).not.toMatch(/replace_all|cooking_session_attempt|session_attempt/i);
    expect(sql).not.toMatch(/update public\.meals|update public\.shopping/i);
  });
});
