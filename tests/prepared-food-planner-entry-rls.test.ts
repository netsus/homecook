import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260716150000_prepared_food_planner_entries.sql",
);

function readMigration() {
  expect(existsSync(migrationPath), "prepared food planner entry migration must exist").toBe(true);
  return existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
}

function functionDefinition(sql: string, name: string) {
  const start = sql.toLowerCase().indexOf(`create function public.${name}`.toLowerCase());
  if (start < 0) return "";
  const end = sql.indexOf("\n$$;", start);
  return end < 0 ? sql.slice(start) : sql.slice(start, end + 4);
}

describe("prepared food planner entry database boundary", () => {
  it("defines only the official columns with composite column and pinned-version ownership", () => {
    const sql = readMigration();
    const tableStart = sql.toLowerCase().indexOf("create table public.product_planner_entries");
    const tableEnd = sql.indexOf("\n);", tableStart);
    const table = tableStart < 0 ? "" : sql.slice(tableStart, tableEnd + 3);

    expect(table).toMatch(/foreign key \(column_id, user_id\)/i);
    expect(table).toMatch(/foreign key \(product_id, product_nutrition_version_id\)/i);
    expect(table).toMatch(/quantity_amount numeric\(12,4\) not null check \(quantity_amount > 0\)/i);
    expect(table).toMatch(/quantity_unit varchar\(20\) not null check \(quantity_unit in \('serving', 'package', 'g', 'ml'\)\)/i);
    expect(table).not.toMatch(/\b(recipe_id|shopping_list_id|cooked_at|leftover_dish_id|status)\b/i);
    expect(sql).toMatch(/product_planner_entries_user_slot_idx[\s\S]*\(user_id, plan_date, column_id\)/i);
    expect(sql).toMatch(/product_planner_entries_version_idx[\s\S]*\(product_nutrition_version_id\)/i);
  });

  it("locks immutable pins and validates every quantity change against the pinned version", () => {
    const sql = readMigration();
    const guard = functionDefinition(sql, "protect_product_planner_entry");
    const scale = functionDefinition(sql, "product_planner_quantity_scale");
    const update = functionDefinition(sql, "update_product_planner_entry_quantity");

    expect(guard).toMatch(/product_nutrition_version_id[\s\S]*product_name_snapshot[\s\S]*product_brand_snapshot/i);
    expect(guard).toMatch(/IMMUTABLE_PRODUCT_PLANNER_ENTRY/i);
    expect(scale).toMatch(/food_product_nutrition_versions/i);
    expect(scale).toMatch(/jsonb_array_elements\(v_version\.basis_relations_json\)/i);
    expect(scale).toMatch(/v_candidate_count <> 1/i);
    expect(scale).toMatch(/NUTRITION_BASIS_MISMATCH/i);
    expect(update).toMatch(/product_planner_quantity_scale\(\s*v_entry\.product_nutrition_version_id/i);
    expect(update).not.toMatch(/current_nutrition_version_id/i);
  });

  it("requires authenticated actor identity and locked search paths on every public RPC", () => {
    const sql = readMigration();
    const names = [
      "create_product_planner_entry",
      "update_product_planner_entry_quantity",
      "delete_product_planner_entry",
      "list_product_planner_entries",
      "delete_owned_planner_column",
    ];

    for (const name of names) {
      const definition = functionDefinition(sql, name);
      expect(definition, `${name} must exist`).not.toBe("");
      expect(definition).toMatch(/security definer/i);
      expect(definition).toMatch(/set search_path = pg_catalog, public/i);
      expect(definition).toMatch(/perform public\.assert_food_product_actor\(p_user_id\)/i);
    }
  });

  it("uses owner RLS and column-scoped direct grants so pins cannot be forged", () => {
    const sql = readMigration();

    expect(sql).toMatch(/alter table public\.product_planner_entries enable row level security/i);
    expect(sql).toMatch(/for select to authenticated[\s\S]*auth\.uid\(\) = user_id/i);
    expect(sql).toMatch(/for insert to authenticated[\s\S]*with check \(auth\.uid\(\) = user_id\)/i);
    expect(sql).toMatch(/for update to authenticated[\s\S]*using \(auth\.uid\(\) = user_id\)[\s\S]*with check \(auth\.uid\(\) = user_id\)/i);
    expect(sql).toMatch(/for delete to authenticated[\s\S]*auth\.uid\(\) = user_id/i);
    expect(sql).toMatch(/grant select, delete on table public\.product_planner_entries to authenticated/i);
    expect(sql).toMatch(/grant insert \(user_id, plan_date, column_id, product_id, quantity_amount, quantity_unit\)/i);
    expect(sql).toMatch(/grant update \(quantity_amount, quantity_unit\)/i);
    expect(sql).not.toMatch(/grant (?:insert|update)[^\n]*on table public\.product_planner_entries to authenticated/i);
    expect(sql).not.toMatch(/grant [^\n]*(product_nutrition_version_id|product_name_snapshot|product_brand_snapshot)[^\n]*to authenticated/i);
  });

  it("provides atomic create/read/delete and a race-safe dual-entry column guard", () => {
    const sql = readMigration();
    const create = functionDefinition(sql, "create_product_planner_entry");
    const list = functionDefinition(sql, "list_product_planner_entries");
    const deleteColumn = functionDefinition(sql, "delete_owned_planner_column");

    expect(create).toMatch(/for update/i);
    expect(create).toMatch(/p_expected_current_version_id/i);
    expect(create).toMatch(/NUTRITION_VERSION_CONFLICT/i);
    expect(create).toMatch(/PRODUCT_DELETED/i);
    expect(create).toMatch(/product_name_snapshot[\s\S]*product_brand_snapshot/i);
    expect(list).toMatch(/entry\.user_id = p_user_id/i);
    expect(list).toMatch(/entry\.plan_date between p_start_date and p_end_date/i);
    expect(list).toMatch(/p_column_id is null or entry\.column_id = p_column_id/i);
    expect(deleteColumn).toMatch(/from public\.meals/i);
    expect(deleteColumn).toMatch(/from public\.product_planner_entries/i);
    expect(deleteColumn).toMatch(/COLUMN_HAS_MEALS/i);
    expect(deleteColumn).toMatch(/for update/i);
  });
});
