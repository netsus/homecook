import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260722090000_apply_reviewed_ingredient_nutrition.sql",
);

describe("reviewed ingredient nutrition apply migration", () => {
  it("keeps source payloads append-only, atomically supersedes primaries, and records replay state", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain(
      "create or replace function public.apply_reviewed_ingredient_nutrition",
    );
    expect(sql).toContain("ingredient_nutrition_review_applied");
    expect(sql).toContain("'replayed', true");
    expect(sql).toContain("insert into public.nutrition_source_items");
    expect(sql).toContain("insert into public.nutrition_profiles");
    expect(sql).toContain("insert into public.nutrition_values");
    expect(sql).toContain("insert into public.ingredient_nutrition_profiles");
    expect(sql).toContain("review_status = 'superseded'");
    expect(sql).toContain("superseded_by_id = v_new_link_id");
    expect(sql).toContain("nutrition_profile_id = v_profile_id");
    expect(sql).toContain("continue;");
    expect(sql).toContain("review_status = 'approved'");
    expect(sql).toContain("revoke all on function public.apply_reviewed_ingredient_nutrition(jsonb) from public");
    expect(sql).not.toMatch(/delete\s+from\s+public\.(nutrition_|ingredient_nutrition)/i);
  });
});
