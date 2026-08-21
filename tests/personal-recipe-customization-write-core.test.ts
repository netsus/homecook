import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260802130000_personal_recipe_customization_write_core.sql",
);
const postgresRunnerPath = join(
  process.cwd(),
  "scripts/run-personal-recipe-customization-write-core-postgres-integration.mjs",
);

function migration() {
  expect(existsSync(migrationPath), "personal recipe write migration is missing").toBe(
    true,
  );
  return readFileSync(migrationPath, "utf8");
}

describe("personal recipe customization write core", () => {
  it("keeps the generation-bound core behind the exact Stage 2 successor route", () => {
    const sql = migration();

    expect(sql).toMatch(/create or replace function public\.write_personal_recipe_core/i);
    expect(sql).toMatch(/current_setting\('homecook\.personal_recipe_v2',\s*true\)/i);
    expect(sql).toMatch(/account_generation_capability_state[\s\S]*generation_active/i);
    expect(sql).toMatch(/assert_full_local_session_authority/i);
    expect(sql).toMatch(/revoke all on function public\.write_personal_recipe_core/i);
    expect(sql).toMatch(/grant execute on function public\.write_personal_recipe_core[\s\S]*service_role/i);

    const recipeDetailRoute = readFileSync(
      join(process.cwd(), "app/api/v1/recipes/[id]/route.ts"),
      "utf8",
    );
    expect(recipeDetailRoute).toContain("export async function PATCH");
    expect(recipeDetailRoute).toContain("export async function DELETE");
    expect(recipeDetailRoute).toContain("readVerifiedAccountGenerationSession");
    expect(recipeDetailRoute).toContain('"write_recipe_future_plan_change"');
    expect(recipeDetailRoute).toContain('"write_personal_recipe_core"');
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
    const runner = readFileSync(
      join(
        process.cwd(),
        "scripts/run-recipe-snapshot-authority-postgres-integration.mjs",
      ),
      "utf8",
    );

    expect(sql).toMatch(/delete from public\.recipe_ingredients/i);
    expect(sql).toMatch(/insert into public\.recipe_ingredients/i);
    expect(sql).toMatch(
      /alter table public\.recipe_ingredients[\s\S]*add column if not exists food_product_id uuid/i,
    );
    expect(sql).toMatch(
      /alter table public\.recipe_ingredients[\s\S]*add column if not exists food_product_nutrition_version_id uuid/i,
    );
    expect(sql).toMatch(
      /foreign key \(food_product_id, food_product_nutrition_version_id\)[\s\S]*food_product_nutrition_versions \(product_id, id\)/i,
    );
    expect(sql).toMatch(/recipe_ingredient_product_provenance_pair/i);
    expect(sql).toMatch(/recipe_ingredient_product_link_guard/i);
    expect(sql).toMatch(
      /insert into public\.recipe_ingredients\s*\([\s\S]*food_product_id[\s\S]*food_product_nutrition_version_id/i,
    );
    expect(runner).not.toMatch(
      /create table public\.recipe_ingredients \([^;]*food_product_id uuid/i,
    );
    expect(runner).toMatch(
      /drop column food_product_id,[\s\S]*drop column food_product_nutrition_version_id[\s\S]*FOLLOWUP_MIGRATIONS/i,
    );
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

  it("pins the current successor migration chain for active full-local inventory", () => {
    const runner = readFileSync(postgresRunnerPath, "utf8");

    expect(runner).toContain('process.env.HOMECOOK_RECIPE_FUTURE_PROPAGATION_SECURITY_FUNCTIONS = "1";');
    expect(runner).toContain(
      "process.env.HOMECOOK_RECIPE_SNAPSHOT_POST_TARGET_MIGRATIONS = [",
    );
    const followupTarget = "20260802130000_personal_recipe_customization_write_core.sql";
    const prerequisiteOrder = [
      "20260425000000_08b_add_pantry_items_table.sql",
      "20260426090000_09_shopping_tables.sql",
      "20260610120000_33a_user_progress_foundation.sql",
      "20260610183000_33c_user_gamification.sql",
      "20260611152000_34b_growth_backend_model.sql",
      "20260615090000_35c_leftover_eaten_progress_event.sql",
      "20260620065500_shopping_already_have_pantry_reflection.sql",
      "20260620110500_leftover_stale_review_sync.sql",
      "20260724090000_recipe_tag_parent_visibility_upper_bound.sql",
      "20260724120000_recipe_image_cleanup_outbox.sql",
      "20260724130000_recipe_image_upload_reservation.sql",
      "20260724180000_recipe_image_attach_cas.sql",
      "20260730210000_product_ingredient_link_foundation.sql",
      "20260731110000_product_ingredient_link_contract_runtime.sql",
    ];
    let previousPrerequisiteIndex = -1;
    for (const migration of prerequisiteOrder) {
      const currentIndex = runner.indexOf(migration);
      expect(currentIndex, `missing prerequisite migration ${migration}`).toBeGreaterThan(
        previousPrerequisiteIndex,
      );
      previousPrerequisiteIndex = currentIndex;
    }
    expect(runner.indexOf(followupTarget)).toBeGreaterThan(previousPrerequisiteIndex);

    const expectedOrder = [
      "20260802210000_recipe_content_snapshot_future_propagation.sql",
      "20260803100000_recipe_future_scoped_internal_rpc_clients.sql",
      "20260803101000_recipe_content_snapshot_future_propagation.sql",
      "20260804100000_recipe_snapshot_entrypoint_projection.sql",
      "20260809100000_full_local_session_refresh_authority.sql",
      "20260809110000_full_local_request_transaction_and_youtube_scope.sql",
      "20260809120000_cooked_batch_weight_ledger.sql",
      "20260811120000_full_local_session_observability.sql",
      "20260812143000_full_local_session_superseded_token_window.sql",
      "20260820120000_full_local_session_bounded_token_overlap.sql",
    ];
    let previousIndex = -1;
    for (const migration of expectedOrder) {
      const currentIndex = runner.indexOf(migration);
      expect(currentIndex, `missing successor migration ${migration}`).toBeGreaterThan(
        previousIndex,
      );
      previousIndex = currentIndex;
    }
  });
});
