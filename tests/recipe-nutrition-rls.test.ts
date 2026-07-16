import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATION_PATH = path.join(
  process.cwd(),
  "supabase/migrations/20260716090000_add_recipe_nutrition_snapshots.sql",
);

function migrationSql() {
  return fs.readFileSync(MIGRATION_PATH, "utf8");
}

describe("recipe nutrition snapshot database contract", () => {
  it("creates the official snapshot payload without a second calculation authority", () => {
    const sql = migrationSql();
    const table = sql.match(
      /create table public\.recipe_nutrition_snapshots[\s\S]*?;\n/i,
    )?.[0] ?? "";

    expect(table).toContain("sources_json jsonb not null default '[]'::jsonb");
    expect(table).toContain("nutrient_status_json jsonb not null default '{}'::jsonb");
    expect(table).toContain("scalable_values_json jsonb not null default '{}'::jsonb");
    expect(table).toContain("fixed_values_json jsonb not null default '{}'::jsonb");
    expect(table).not.toContain("nutrition_profile_id");
    expect(table).not.toContain("source_calculation_hash");
    expect(sql).toMatch(/unique \(recipe_id, input_hash, calculation_version\)/i);
    expect(sql).toMatch(/where is_current/i);
  });

  it("validates nested six-field sources, vectors, statuses and safe URLs inside PostgreSQL", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/create function public\.validate_recipe_nutrition_snapshot_payload/i);
    expect(sql).toMatch(/jsonb_object_keys\(v_source\)/i);
    for (const key of [
      "provider",
      "dataset",
      "source_version",
      "data_basis_date",
      "license",
      "source_url",
    ]) {
      expect(sql).toContain(`'${key}'`);
    }
    expect(sql).toMatch(/UNSAFE_SNAPSHOT_SOURCE/);
    expect(sql).toMatch(/x-amz-signature/i);
    expect(sql).toMatch(/create function public\.decode_recipe_nutrition_query_key/i);
    for (const credentialKey of ["password", "subscriptionkey", "accesskey", "credential"]) {
      expect(sql).toContain(credentialKey);
    }
    expect(sql).toMatch(/source_url[^\n]*~[^\n]*@/i);
    expect(sql).toMatch(/source_url[^\n]*~[^\n]*#/i);
    expect(sql).toMatch(/SNAPSHOT_VECTOR_SUM_MISMATCH/);
    expect(sql).toMatch(/INVALID_SNAPSHOT_NUTRIENT_STATUS/);
    for (const code of ["sugars_g", "saturated_fat_g", "fiber_g"]) {
      expect(sql).toContain(`'${code}'`);
    }
    expect(sql).toMatch(/v_value\.key\s*<>\s*all/i);
    expect(sql).toMatch(/INVALID_SNAPSHOT_STATUS/);
    expect(sql).toMatch(/REPRESENTATIVE_VOLUME_CONVERSION_USED/);
    expect(sql).toMatch(/NUTRIENT_VALUE_MISSING/);
    expect(sql).toMatch(/calculation_status[^\n]*unavailable[^\n]*jsonb_array_length/i);
    expect(sql).toMatch(/collate "C"/i);
  });

  it("uses a locked atomic idempotent writer and preserves rows on current switch or rollback", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/create function public\.write_recipe_nutrition_snapshot/i);
    expect(sql).toMatch(/pg_advisory_xact_lock/i);
    expect(sql).toMatch(/p_expected_recipe_updated_at timestamptz/i);
    expect(sql).toMatch(/select updated_at[\s\S]*for share/i);
    expect(sql).toMatch(/RECIPE_NUTRITION_INPUT_STALE/);
    expect(sql).toMatch(/md5\(\s*p_recipe_id::text \|\| chr\(31\)/i);
    expect(sql).toMatch(/insert into public\.recipe_nutrition_snapshots \(\s*id,/i);
    expect(sql).toMatch(/set_config\('homecook\.recipe_nutrition_writer', 'on', true\)/i);
    expect(sql).toMatch(/update public\.recipe_nutrition_snapshots[\s\S]*set is_current = false/i);
    expect(sql).toMatch(/on conflict \(recipe_id, input_hash, calculation_version\)/i);
    expect(sql).toMatch(/create function public\.restore_recipe_nutrition_snapshot_current/i);
    expect(sql).toMatch(/p_expected_current_snapshot_id uuid/i);
    expect(sql).toMatch(/BACKFILL_CURRENT_DRIFT/);
    expect(sql).not.toMatch(/delete from public\.recipe_nutrition_snapshots/i);
  });

  it("recomputes the canonical ingredient and predecessor guard inside the writer transaction", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/create function public\.build_recipe_nutrition_input_guard\(p_recipe_id uuid\)/i);
    expect(sql).toMatch(/p_input_guard jsonb/i);
    expect(sql).toMatch(/build_recipe_nutrition_input_guard\(p_recipe_id\)[\s\S]*is distinct from p_input_guard/i);
    expect(sql).toMatch(/RECIPE_NUTRITION_INPUT_STALE/i);
    for (const relation of [
      "recipe_ingredients",
      "ingredient_nutrition_profiles",
      "nutrition_profiles",
      "nutrition_source_items",
      "nutrition_sources",
      "ingredient_conversion_assignments",
      "measurement_conversion_profiles",
      "measurement_source_evidence",
      "nutrition_values",
    ]) {
      expect(sql).toContain(`public.${relation}`);
    }
    expect(sql).toMatch(/'nutrient_code'[\s\S]*'value_status'/i);
    expect(sql).toMatch(/create function public\.build_recipe_nutrition_contributing_sources/i);
    expect(sql).toMatch(/SNAPSHOT_SOURCE_MISMATCH/i);
  });

  it("shares ordered recipe and ingredient transaction locks with every input mutation", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/create function public\.lock_recipe_nutrition_ingredient_ids/i);
    expect(sql).toMatch(/pg_advisory_xact_lock_shared/i);
    expect(sql).toMatch(/create function public\.lock_recipe_nutrition_predecessor_mutation/i);
    expect(sql).toMatch(/referencing new table as new_rows/i);
    expect(sql).toMatch(/referencing old table as old_rows/i);
    expect(sql).toMatch(/revoke truncate on table[\s\S]*from anon, authenticated, service_role/i);
    for (const relation of [
      "recipe_ingredients",
      "nutrition_sources",
      "nutrition_source_items",
      "nutrition_profiles",
      "nutrition_values",
      "ingredient_nutrition_profiles",
      "measurement_conversion_profiles",
      "measurement_source_evidence",
      "ingredient_conversion_assignments",
      "piece_unit_weights",
    ]) {
      expect(sql).toMatch(new RegExp(`on public\\.${relation}`, "i"));
    }
    expect(sql).toMatch(/pg_advisory_xact_lock[\s\S]*pg_advisory_xact_lock_shared[\s\S]*validate_recipe_nutrition_snapshot_payload/i);
  });

  it("makes snapshot rows append-only and denies direct anon or authenticated access", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/before update or delete on public\.recipe_nutrition_snapshots/i);
    expect(sql).toMatch(/IMMUTABLE_RECIPE_NUTRITION_SNAPSHOT/);
    expect(sql).toMatch(/alter table public\.recipe_nutrition_snapshots enable row level security/i);
    expect(sql).toMatch(/revoke all on table public\.recipe_nutrition_snapshots from anon, authenticated/i);
    expect(sql).toMatch(/revoke all on table public\.recipe_nutrition_snapshots from service_role/i);
    expect(sql).toMatch(/grant select on table public\.recipe_nutrition_snapshots to service_role/i);
    expect(sql).toMatch(
      /revoke all on function public\.write_recipe_nutrition_snapshot\(uuid, jsonb, timestamptz, jsonb\)[\s\S]*from public, anon, authenticated/i,
    );
    expect(sql).toMatch(/grant execute on function public\.write_recipe_nutrition_snapshot[\s\S]*to service_role/i);
    for (const triggerFunction of [
      "protect_recipe_nutrition_snapshot",
      "pin_current_recipe_nutrition_snapshot_on_meal_insert",
      "protect_meal_recipe_nutrition_pin",
    ]) {
      expect(sql).toMatch(new RegExp(
        `revoke all on function public\\.${triggerFunction}\\(\\)[\\s\\S]*from public, anon, authenticated, service_role`,
        "i",
      ));
    }
  });

  it("pins current snapshot on Meal insert and permits only one-time bounded backfill", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/add column recipe_nutrition_snapshot_id uuid/i);
    expect(sql).toMatch(/add column nutrition_snapshot_origin varchar\(20\)/i);
    expect(sql).toMatch(/before insert on public\.meals/i);
    expect(sql).toMatch(/CLIENT_SELECTED_NUTRITION_SNAPSHOT_NOT_ALLOWED/);
    expect(sql).toMatch(/nutrition_snapshot_origin := 'created'/i);
    expect(sql).toMatch(/create function public\.backfill_foodsafety_recipe_nutrition_meal_pins/i);
    expect(sql).toContain("pilot_30_quality_corrected");
    expect(sql).toContain("pilot_30_quality_corrected_replacement");
    expect(sql).not.toContain("pilot_30_user_reviewed");
    expect(sql).toMatch(/count\(distinct source\.recipe_id\)[\s\S]*<> 30/i);
    expect(sql).not.toMatch(/skip locked/i);
    expect(sql).toMatch(/nutrition_snapshot_origin = 'backfill'/i);
    expect(sql).toMatch(/recipe_nutrition_snapshot_id is null/i);
  });
});
