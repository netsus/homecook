import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

function runScript(scriptPath: string, args: string[], envOverrides: Record<string, string | undefined> = {}) {
  return spawnSync("node", [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      FOODSAFETYKOREA_API_KEY: "",
      DATA_GO_KR_API_KEY: "",
      DATA_GO_KR_API_KEY1: "",
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      ...envOverrides,
    },
  });
}

const foodsafetyRow = {
  RCP_SEQ: "1001",
  RCP_NM: "두부 김치찌개",
  RCP_WAY2: "끓이기",
  RCP_PAT2: "국&찌개",
  HASH_TAG: "한식",
  INFO_WGT: "2인분",
  INFO_ENG: "320",
  RCP_PARTS_DTLS: "[찌개 재료] 두부 1모, 김치 200g, 돼지고기 100g, 대파 1대\n[양념장] 고춧가루 1큰술",
  ATT_FILE_NO_MAIN: "https://example.test/tofu-kimchi.jpg",
  MANUAL01: "1. 김치와 돼지고기를 냄비에 넣고 볶는다.",
  MANUAL02: "2. 고춧가루로 양념장을 만든 뒤 물을 붓고 두부와 대파를 넣는다.",
};

describe("external recipe ingest scripts", () => {
  it("writes an existing recipe hygiene report from a mock DB export", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "homecook-recipe-hygiene-"));
    const inputPath = join(tempDir, "db-export.json");
    const outputDir = join(tempDir, "out");

    writeFileSync(
      inputPath,
      `${JSON.stringify(
        {
          recipes: [
            { id: "r1", title: "ㄴㅇㄹㅇ", source_type: "manual", created_by: null, tags: [] },
            { id: "r2", title: "두부 김치찌개", source_type: "system", created_by: null, thumbnail_url: "https://example.test/a.jpg", tags: ["한식"] },
            { id: "r3", title: "두부 김치찌개", source_type: "youtube", created_by: null, tags: [] },
          ],
          recipe_sources: [
            { recipe_id: "r2", extraction_meta_json: { source_provider: "foodsafety-cookrcp", license: "approved", image_provenance: "source" } },
          ],
          recipe_ingredients: [{ recipe_id: "r2" }, { recipe_id: "r2" }],
          recipe_steps: [{ recipe_id: "r2" }, { recipe_id: "r2" }],
          recipe_tags: [{ recipe_id: "r2", tag_id: "t1" }],
        },
        null,
        2,
      )}\n`,
    );

    const result = runScript("scripts/external-recipe-hygiene-report.mjs", [
      "--mock-db-export",
      inputPath,
      "--output-dir",
      outputDir,
      "--generated-at",
      "2026-06-25T00:00:00.000Z",
    ]);

    expect(result.status).toBe(0);
    const report = JSON.parse(readFileSync(join(outputDir, "existing-recipe-hygiene-report.json"), "utf8"));

    expect(report.summary).toMatchObject({
      recipe_count: 3,
      flagged_recipe_count: 3,
      production_db_writes: 0,
    });
    expect(report.recipes.find((recipe: { id: string }) => recipe.id === "r1").flags).toContain(
      "jamo_fixture_like_title",
    );
    expect(report.recipes.find((recipe: { id: string }) => recipe.id === "r3").flags).toContain(
      "duplicate_normalized_title",
    );
  });

  it("fetches a FoodSafetyKorea mock response into source artifacts", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "homecook-recipe-live-fetch-"));
    const responsePath = join(tempDir, "foodsafety-response.json");
    const outputDir = join(tempDir, "out");

    writeFileSync(
      responsePath,
      `${JSON.stringify(
        {
          COOKRCP01: {
            total_count: "1",
            row: [foodsafetyRow],
            RESULT: { CODE: "INFO-000", MSG: "정상처리되었습니다." },
          },
        },
        null,
        2,
      )}\n`,
    );

    const result = runScript("scripts/external-recipe-live-fetch.mjs", [
      "--mock-response-file",
      responsePath,
      "--output-dir",
      outputDir,
      "--generated-at",
      "2026-06-25T00:00:00.000Z",
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Production DB writes: 0");
    const sourceExport = JSON.parse(readFileSync(join(outputDir, "live-source-export.json"), "utf8"));
    const report = JSON.parse(readFileSync(join(outputDir, "live-fetch-report.json"), "utf8"));

    expect(sourceExport.foodsafetyCookRecipeRows).toHaveLength(1);
    expect(report.summary).toMatchObject({
      total_source_rows: 1,
      production_db_writes: 0,
      candidate_dry_run_executed: false,
    });
  });

  it("builds recipe review pack and pilot candidates from a source export", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "homecook-recipe-review-pack-"));
    const sourcePath = join(tempDir, "live-source-export.json");
    const dictionaryPath = join(tempDir, "dictionary.json");
    const outputDir = join(tempDir, "out");

    writeFileSync(
      sourcePath,
      `${JSON.stringify(
        {
          generated_at: "2026-06-25T00:00:00.000Z",
          source_provider: "foodsafety-cookrcp",
          source_kind: "mock",
          foodsafetyCookRecipeRows: [foodsafetyRow],
        },
        null,
        2,
      )}\n`,
    );
    writeFileSync(
      dictionaryPath,
      `${JSON.stringify(
        {
          ingredients: [
            { id: "ing-tofu", standard_name: "두부" },
            { id: "ing-kimchi", standard_name: "김치" },
            { id: "ing-pork", standard_name: "돼지고기" },
            { id: "ing-green-onion", standard_name: "대파" },
            { id: "ing-chili", standard_name: "고춧가루" },
          ],
          ingredient_synonyms: [],
        },
        null,
        2,
      )}\n`,
    );

    const result = runScript("scripts/external-recipe-review-pack.mjs", [
      "--source-export",
      sourcePath,
      "--ingredient-dictionary",
      dictionaryPath,
      "--output-dir",
      outputDir,
      "--target-count",
      "1",
      "--generated-at",
      "2026-06-25T00:00:00.000Z",
    ]);

    expect(result.status).toBe(0);
    expect(existsSync(join(outputDir, "recipe-review.html"))).toBe(true);
    expect(existsSync(join(outputDir, "recipe-review-worklist.tsv"))).toBe(true);
    const reviewHtml = readFileSync(join(outputDir, "recipe-review.html"), "utf8");

    const candidates = JSON.parse(readFileSync(join(outputDir, "recipe-candidates.json"), "utf8"));
    const riskReport = JSON.parse(readFileSync(join(outputDir, "recipe-load-risk-report.json"), "utf8"));

    expect(candidates.summary).toMatchObject({
      source_row_count: 1,
      candidate_recipe_count: 1,
      blocked_count: 0,
      pilot_selected_count: 1,
      production_db_writes: 0,
    });
    expect(candidates.candidates[0]).toMatchObject({
      title: "두부 김치찌개",
      cooking_method: { label: "끓이기" },
      blocked: false,
    });
    expect(candidates.candidates[0].ingredients.filter((ingredient: { resolved: boolean }) => ingredient.resolved)).toHaveLength(5);
    expect(candidates.candidates[0].ingredients.map((ingredient: { component_label: string | null }) => ingredient.component_label)).toEqual([
      "찌개 재료",
      "찌개 재료",
      "찌개 재료",
      "찌개 재료",
      "양념장",
    ]);
    expect(candidates.candidates[0].steps[1].component_label).toBe("양념장");
    expect(reviewHtml).toContain("Pilot 1/1");
    expect(reviewHtml).toContain("data-ingredient-reviewed");
    expect(reviewHtml).toContain("원본 재료 전문");
    expect(reviewHtml).toContain("단계 미언급");
    expect(reviewHtml).toContain("미확인 재료");
    expect(riskReport.summary.pilot_selected_count).toBe(1);
  });
});
