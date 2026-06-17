import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildRecipeTagBackfillPlan,
  buildRecipeTagUsageReconcileReport,
} from "@/lib/server/recipe-tags-backfill";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260617123000_36d_recipe_tags_rules_backfill.sql",
);

function readMigration() {
  return readFileSync(migrationPath, "utf8");
}

describe("36d recipe tags backfill and usage reconcile", () => {
  it("builds a deterministic dry-run backfill report without mutating recipes", () => {
    const plan = buildRecipeTagBackfillPlan({
      dryRun: true,
      recipes: [
        {
          id: "recipe-b",
          createdAt: "2026-06-11T10:00:00.000Z",
          title: "매콤 김치찌개",
          sourceType: "manual",
          baseServings: 2,
          ingredientNames: ["김치", "돼지고기", "고춧가루"],
          stepTexts: ["냄비에 넣고 보글보글 끓여요."],
          cookingMethodLabels: ["끓이기"],
          currentTags: [],
        },
        {
          id: "recipe-a",
          createdAt: "2026-06-10T10:00:00.000Z",
          title: "전자레인지 10분 계란밥",
          sourceType: "youtube",
          baseServings: 1,
          totalTimeMinutes: 10,
          ingredientNames: ["밥", "계란", "참치"],
          stepTexts: ["전자레인지로 5분 돌려요."],
          cookingMethodLabels: ["전자레인지"],
          providerTags: ["레시피"],
          currentTags: ["유튜브레시피"],
        },
      ],
    });

    expect(plan).toMatchObject({
      dry_run: true,
      total_recipes: 2,
      would_update_recipes: 2,
      would_write_recipe_tags: 2,
      would_reconcile_usage_count: true,
    });
    expect(plan.recipes.map((recipe) => recipe.recipe_id)).toEqual(["recipe-a", "recipe-b"]);
    expect(plan.recipes[0]).toMatchObject({
      recipe_id: "recipe-a",
      tag_source: "backfill",
      reason_codes: expect.arrayContaining(["stale_projection"]),
      suggested_tags: ["유튜브레시피", "자취요리", "10분컷", "전자레인지", "한그릇요리", "초보가능"],
    });
    expect(plan.recipes[1].suggested_tags).toEqual([
      "자취요리",
      "한식",
      "국물요리",
      "매콤",
      "초보가능",
      "고단백",
    ]);
  });

  it("reports no-op recipes when existing approved projection already matches suggestions", () => {
    const plan = buildRecipeTagBackfillPlan({
      dryRun: true,
      recipes: [
        {
          id: "recipe-1",
          createdAt: "2026-06-10T10:00:00.000Z",
          title: "저당 닭가슴살 샐러드",
          sourceType: "manual",
          ingredientNames: ["닭가슴살", "상추", "무설탕 요거트"],
          stepTexts: ["샐러드로 담아요."],
          cookingMethodLabels: ["무치기"],
          currentTags: ["샐러드", "초보가능", "고단백", "저당", "발효한끼"],
        },
      ],
    });

    expect(plan.would_update_recipes).toBe(0);
    expect(plan.recipes[0]).toMatchObject({
      would_update: false,
      reason_codes: [],
    });
  });

  it("reconciles usage_count from public approved recipe tag relations only", () => {
    const report = buildRecipeTagUsageReconcileReport({
      tags: [
        { id: "tag-korean", normalized_key: "한식", label: "한식", usage_count: 9 },
        { id: "tag-user", normalized_key: "내메모", label: "내메모", usage_count: 1 },
      ],
      recipeTags: [
        { tag_id: "tag-korean", visibility: "public", review_status: "approved" },
        { tag_id: "tag-korean", visibility: "public_pending", review_status: "pending" },
        { tag_id: "tag-user", visibility: "private", review_status: "pending" },
      ],
    });

    expect(report).toEqual([
      {
        tag_id: "tag-korean",
        normalized_key: "한식",
        label: "한식",
        before_count: 9,
        after_count: 1,
        would_update: true,
      },
      {
        tag_id: "tag-user",
        normalized_key: "내메모",
        label: "내메모",
        before_count: 1,
        after_count: 0,
        would_update: true,
      },
    ]);
  });

  it("adds service-role-only dry-run and usage reconcile RPCs in migration", () => {
    const sql = readMigration();

    expect(sql).toContain("('도시락반찬', '도시락반찬', 'lunchbox-side', 'semantic', true, true)");
    expect(sql).toContain("('k디저트', 'K디저트', 'k-dessert', 'semantic', true, true)");
    expect(sql).toContain("('밥도둑', '밥도둑', 'rice-thief', 'semantic', true, true)");
    expect(sql).toMatch(/update public\.tags[\s\S]*theme_eligible = false[\s\S]*'15분컷'/i);
    expect(sql).toMatch(/create or replace function public\.reconcile_recipe_tag_usage_counts/i);
    expect(sql).toMatch(/rt\.visibility = 'public'/i);
    expect(sql).toMatch(/rt\.review_status = 'approved'/i);
    expect(sql).toMatch(/create or replace function public\.dry_run_recipe_tag_projection_backfill/i);
    expect(sql).toMatch(/not exists \([\s\S]*from public\.recipe_tags rt[\s\S]*where rt\.recipe_id = r\.id/i);
    expect(sql).toMatch(/grant execute on function public\.reconcile_recipe_tag_usage_counts\(boolean\) to service_role/i);
    expect(sql).toMatch(/grant execute on function public\.dry_run_recipe_tag_projection_backfill\(integer\) to service_role/i);
    expect(sql).toMatch(/revoke execute on function public\.reconcile_recipe_tag_usage_counts\(boolean\) from authenticated/i);
    expect(sql).toMatch(/revoke execute on function public\.dry_run_recipe_tag_projection_backfill\(integer\) from authenticated/i);
  });
});
