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
    expect(sql).toMatch(/calculation_status[\s\S]*complete[\s\S]*partial[\s\S]*unavailable/i);
    expect(sql).toMatch(/incomplete_count/i);
    expect(sql).toMatch(/sum\(\(nutrition_evidence_json#>>'\{values,energy_kcal\}'\)::numeric\)/i);
    expect(sql).not.toMatch(/coalesce\([^;]*energy_kcal[^;]*,\s*0\)/i);
  });
});
