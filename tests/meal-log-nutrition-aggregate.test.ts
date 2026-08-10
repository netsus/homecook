import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260810120000_meal_log_core.sql"), "utf8");

describe("meal-log immutable nutrition aggregates", () => {
  test("pins exact product and ingredient profile evidence", () => {
    expect(sql).toMatch(/product_nutrition_version_id.*basis_relations/i);
    expect(sql).toMatch(/ingredient_nutrition_profile_id/i);
    expect(sql).toMatch(/UNIT_CONVERSION_MISSING/i);
    expect(sql).toMatch(/v_same_source[\s\S]*v_entry\.food_product_nutrition_version_id/i);
    expect(sql).toMatch(/v_same_source[\s\S]*v_entry\.ingredient_nutrition_profile_id/i);
    expect(sql).toMatch(/if v_same_source then\s+v_ingredient_profile:=v_entry\.ingredient_nutrition_profile_id;\s+v_conversion_evidence:=v_entry\.conversion_evidence_id;/i);
    expect(sql).toMatch(/resolve_meal_log_product_nutrition[\s\S]*basis_relations/i);
  });

  test("keeps unknown nutrition separate from zero in slot and day totals", () => {
    expect(sql).toMatch(/fold_meal_log_nutrition_status/i);
    expect(sql).toMatch(/active_sections[\s\S]*calculation_status/i);
    expect(sql).toMatch(/deleted_column_sections[\s\S]*calculation_status/i);
    expect(sql).toMatch(/incomplete_count/i);
    expect(sql).toMatch(/sum\(\(nutrition_evidence_json->>'calories_kcal'\)::numeric\)/i);
    expect(sql).not.toMatch(/coalesce\([^;]*calories_kcal[^;]*,\s*0\)/i);
  });

  test("uses one exact compact nutrition response shape for every source", () => {
    expect(sql).toMatch(/compact_meal_log_nutrition/i);
    for (const key of ["calories_kcal", "carbohydrate_g", "protein_g", "fat_g", "sodium_mg"]) {
      expect(sql).toContain(`'${key}'`);
    }
    expect(sql).not.toMatch(/'nutrition',p_entry\.nutrition_evidence_json\s*\|\|/i);
  });

  test("scales immutable cooked-batch nutrition by actual intake over original finished weight", () => {
    expect(sql).toMatch(/resolve_cooked_batch_nutrition[\s\S]*v_amount\s*\/\s*v_batch\.finished_weight_g/i);
    expect(sql).toMatch(/v_batch\.finished_weight_g\s+is\s+null[\s\S]*CONFLICT/i);
  });
});
