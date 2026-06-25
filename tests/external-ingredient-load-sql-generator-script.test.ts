import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const SCRIPT_PATH = "scripts/external-ingredient-load-sql-generator.mjs";

function runSqlGenerator(args: string[]) {
  return spawnSync("node", [SCRIPT_PATH, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

describe("external ingredient load SQL generator", () => {
  it("generates idempotent migration and rollback SQL from reviewed decisions", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "homecook-external-ingredient-load-sql-"));
    const inputPath = join(tempDir, "load-ready-medium-reviewed.json");
    const migrationPath = join(tempDir, "migration.sql");
    const rollbackPath = join(tempDir, "rollback.sql");
    const summaryPath = join(tempDir, "summary.json");
    const existingSqlPath = join(tempDir, "existing.sql");

    writeFileSync(
      existingSqlPath,
      [
        "insert into public.ingredients (id, standard_name, category, default_unit)",
        "values ('550e8400-e29b-41d4-a716-446655440010', '양파', '채소', '개')",
        "on conflict (standard_name) do nothing;",
        "",
      ].join("\n"),
    );
    writeFileSync(
      inputPath,
      `${JSON.stringify(
        {
          generated_at: "2026-06-25T00:00:00.000Z",
          decisions: [
            {
              review_id: "canonical:양파",
              type: "canonical",
              standard_name: "양파",
              category: "채소",
              decision: "approve",
            },
            {
              review_id: "canonical:레몬착즙",
              type: "canonical",
              standard_name: "레몬 착즙",
              category: "과일",
              decision: "rename",
              rename_to: "레몬즙",
            },
            {
              review_id: "canonical:멥쌀밥",
              type: "canonical",
              standard_name: "멥쌀밥",
              category: "곡류",
              decision: "rename",
              rename_to: "쌀밥",
            },
            {
              review_id: "canonical:과자",
              type: "canonical",
              standard_name: "과자",
              category: "곡류",
              decision: "exclude",
            },
            {
              review_id: "canonical:열무김치",
              type: "canonical",
              standard_name: "열무 김치",
              category: "채소",
              decision: "approve",
            },
            {
              review_id: "synonym:양파:둥근파",
              type: "synonym",
              standard_name: "양파",
              synonym: "둥근파",
              category: "채소",
              decision: "approve",
            },
            {
              review_id: "synonym:레몬즙:레몬착즙",
              type: "synonym",
              standard_name: "레몬즙",
              synonym: "레몬 착즙",
              category: "과일",
              decision: "approve",
            },
            {
              review_id: "synonym:김치:열무물김치",
              type: "synonym",
              standard_name: "열무김치",
              synonym: "열무 물김치",
              category: "채소",
              decision: "approve",
            },
            {
              review_id: "synonym:과자:스낵",
              type: "synonym",
              standard_name: "과자",
              synonym: "스낵",
              category: "곡류",
              decision: "exclude",
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const result = runSqlGenerator([
      "--review-decisions",
      inputPath,
      "--migration-output",
      migrationPath,
      "--rollback-output",
      rollbackPath,
      "--summary-output",
      summaryPath,
      "--existing-ingredients-sql",
      existingSqlPath,
      "--generated-at",
      "2026-06-25T00:00:00.000Z",
    ]);

    expect(result.status).toBe(0);
    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(rollbackPath)).toBe(true);
    expect(existsSync(summaryPath)).toBe(true);

    const migrationSql = readFileSync(migrationPath, "utf8");
    const rollbackSql = readFileSync(rollbackPath, "utf8");
    const summary = JSON.parse(readFileSync(summaryPath, "utf8"));

    expect(migrationSql).toContain("insert into public.ingredients");
    expect(migrationSql).toContain("'레몬즙'");
    expect(migrationSql).toContain("'쌀밥'");
    expect(migrationSql).toContain("'양파'");
    expect(migrationSql).toContain("'열무 김치'");
    expect(migrationSql).toContain("'열무 김치', '열무 물김치'");
    expect(migrationSql).not.toContain("'과자'");
    expect(migrationSql).toContain("insert into public.ingredient_synonyms");
    expect(migrationSql).toContain("'둥근파'");
    expect(migrationSql).toContain("'레몬 착즙'");
    expect(migrationSql).toContain("on conflict do nothing");
    expect(rollbackSql).toContain("delete from public.ingredient_synonyms");
    expect(rollbackSql).toContain("delete from public.ingredients");
    expect(rollbackSql).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/);
    expect(summary).toMatchObject({
      source_decision_count: 9,
      ingredient_value_count: 4,
      synonym_value_count: 3,
      existing_ingredient_reference_count: 1,
      excluded_decision_count: 2,
      validation: {
        blocked: false,
        duplicate_standard_name_count: 0,
        missing_synonym_target_count: 0,
        ambiguous_synonym_count: 0,
      },
    });
  });

  it("blocks synonym SQL when the resolved target is absent", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "homecook-external-ingredient-load-sql-"));
    const inputPath = join(tempDir, "load-ready-missing-target.json");
    const migrationPath = join(tempDir, "migration.sql");
    const rollbackPath = join(tempDir, "rollback.sql");
    const summaryPath = join(tempDir, "summary.json");

    writeFileSync(
      inputPath,
      `${JSON.stringify(
        {
          decisions: [
            {
              review_id: "synonym:김치:열무물김치",
              type: "synonym",
              standard_name: "열무김치",
              synonym: "열무 물김치",
              category: "채소",
              decision: "approve",
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const result = runSqlGenerator([
      "--review-decisions",
      inputPath,
      "--migration-output",
      migrationPath,
      "--rollback-output",
      rollbackPath,
      "--summary-output",
      summaryPath,
      "--generated-at",
      "2026-06-25T00:00:00.000Z",
    ]);

    expect(result.status).not.toBe(0);
    const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
    expect(summary.validation).toMatchObject({
      blocked: true,
      missing_synonym_target_count: 1,
    });
    expect(summary.validation.missing_synonym_targets[0]).toMatchObject({
      standard_name: "열무김치",
      synonym: "열무 물김치",
    });
  });
});
