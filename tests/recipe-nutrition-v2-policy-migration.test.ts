import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20260914230000_recipe_nutrition_v2_piece_and_zero_sources.sql",
);

describe("recipe nutrition v2 database provenance", () => {
  it("attributes TO_TASTE observed zero and approved medium piece standards", () => {
    const sql = readFileSync(MIGRATION, "utf8");

    expect(sql).toMatch(/create or replace function public\.build_recipe_nutrition_contributing_sources/i);
    expect(sql).toMatch(/ingredient_type'\s*=\s*'TO_TASTE'[\s\S]*value_status'\s*=\s*'observed'[\s\S]*amount'\)::numeric\s*=\s*0/i);
    expect(sql).toMatch(/piece_unit_weights[\s\S]*size_code\s*=\s*'medium'/i);
    expect(sql).toMatch(/resolution_kind\s*=\s*'piece'/i);
    expect(sql).toMatch(/'개',\s*'장',\s*'대',\s*'모',\s*'piece',\s*'pieces'/i);
  });
});
