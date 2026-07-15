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
    expect(sql).toMatch(/SNAPSHOT_VECTOR_SUM_MISMATCH/);
    expect(sql).toMatch(/INVALID_SNAPSHOT_NUTRIENT_STATUS/);
    expect(sql).toMatch(/INVALID_SNAPSHOT_STATUS/);
    expect(sql).toMatch(/collate "C"/i);
  });

  it("uses a locked atomic idempotent writer and preserves rows on current switch or rollback", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/create function public\.write_recipe_nutrition_snapshot/i);
    expect(sql).toMatch(/pg_advisory_xact_lock/i);
    expect(sql).toMatch(/set_config\('homecook\.recipe_nutrition_writer', 'on', true\)/i);
    expect(sql).toMatch(/update public\.recipe_nutrition_snapshots[\s\S]*set is_current = false/i);
    expect(sql).toMatch(/on conflict \(recipe_id, input_hash, calculation_version\)/i);
    expect(sql).toMatch(/create function public\.restore_recipe_nutrition_snapshot_current/i);
    expect(sql).not.toMatch(/delete from public\.recipe_nutrition_snapshots/i);
  });

  it("makes snapshot rows append-only and denies direct anon or authenticated access", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/before update or delete on public\.recipe_nutrition_snapshots/i);
    expect(sql).toMatch(/IMMUTABLE_RECIPE_NUTRITION_SNAPSHOT/);
    expect(sql).toMatch(/alter table public\.recipe_nutrition_snapshots enable row level security/i);
    expect(sql).toMatch(/revoke all on table public\.recipe_nutrition_snapshots from anon, authenticated/i);
    expect(sql).toMatch(/revoke insert, update, delete on table public\.recipe_nutrition_snapshots from service_role/i);
    expect(sql).toMatch(/grant select on table public\.recipe_nutrition_snapshots to service_role/i);
    expect(sql).toMatch(/grant execute on function public\.write_recipe_nutrition_snapshot[\s\S]*to service_role/i);
  });

  it("pins current snapshot on Meal insert and permits only one-time bounded backfill", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/add column recipe_nutrition_snapshot_id uuid/i);
    expect(sql).toMatch(/add column nutrition_snapshot_origin varchar\(20\)/i);
    expect(sql).toMatch(/before insert on public\.meals/i);
    expect(sql).toMatch(/CLIENT_SELECTED_NUTRITION_SNAPSHOT_NOT_ALLOWED/);
    expect(sql).toMatch(/nutrition_snapshot_origin := 'created'/i);
    expect(sql).toMatch(/create function public\.backfill_foodsafety_recipe_nutrition_meal_pins/i);
    expect(sql).toContain("pilot_30_user_reviewed");
    expect(sql).toMatch(/nutrition_snapshot_origin = 'backfill'/i);
    expect(sql).toMatch(/recipe_nutrition_snapshot_id is null/i);
  });
});
