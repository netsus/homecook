import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildQuizOutcome } from "@/lib/marketing/demand-validation";
import { readMarketingValidationOperatorEnv } from "../scripts/lib/marketing-validation-operations.mjs";

const repoRoot = path.resolve(__dirname, "..");
const purgeScriptPath = path.join(repoRoot, "scripts/purge-expired-marketing-validation.mjs");
const exportScriptPath = path.join(repoRoot, "scripts/export-marketing-leads.mjs");
const operationsModulePath = path.join(
  repoRoot,
  "scripts/lib/marketing-validation-operations.mjs",
);
const analysisSqlPath = path.join(repoRoot, "docs/marketing/demand-validation-analysis.sql");
const resultTemplatePath = path.join(
  repoRoot,
  "docs/marketing/demand-validation-result-template.md",
);
const retentionMigrationPath = path.join(
  repoRoot,
  "supabase/migrations/20260831110000_marketing_validation_retention_operations.sql",
);
const exportScopeMigrationPath = path.join(
  repoRoot,
  "supabase/migrations/20260831120000_marketing_validation_export_scope.sql",
);
const safeOutputRoot = path.join(repoRoot, ".artifacts", "marketing-validation");

function writeJson(filePath: string, value: unknown) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function requireFileText(filePath: string) {
  return readFileSync(filePath, "utf8");
}

function runNodeScript(scriptPath: string, args: string[], env: Record<string, string | undefined> = {}) {
  return spawnSync("node", [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
    },
  });
}

function makeSessionRows() {
  return {
    rows: [
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        campaign_key: "weekly_nutrition_2026",
        creative_key: "weekly_nutrition_v2",
        audience_key: "weekly_nutrition_beta_interest",
        attribution_status: "paid_allowlisted",
        viewed_at: "2026-08-20T00:00:00.000Z",
        quiz_started_at: "2026-08-20T00:00:05.000Z",
        quiz_completed_at: "2026-08-20T00:01:00.000Z",
        solution_viewed_at: "2026-08-20T00:01:05.000Z",
        intent_choice: "needed",
        intent_clicked_at: "2026-08-20T00:01:10.000Z",
        quiz_result: "weekly_blindspot",
        quiz_answers: {
          q1: "시작했지만 중단함",
          q2: "2~3일",
          q3: "재료를 하나씩 검색해 입력",
          q4: "하루 합계와 주간 흐름을 한눈에 못 볼 때",
          q5: "레시피 기준 자동 계산",
        },
        target_qualified: true,
        email: "accepted@example.com",
        consent_version: "marketing-demand-validation-v1",
        consented_at: "2026-08-20T00:01:11.000Z",
        turnstile_verified_at: "2026-08-20T00:01:11.500Z",
        lead_submitted_at: "2026-08-20T00:01:12.000Z",
        lead_submission_status: "accepted",
        planner_intent: "definitely",
        planner_priority: "weekly_average",
        followup_submitted_at: "2026-08-20T00:01:20.000Z",
        retention_until: "2026-08-27T00:00:00.000Z",
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440001",
        campaign_key: "weekly_nutrition_2026",
        creative_key: "weekly_nutrition_v2",
        audience_key: "weekly_nutrition_beta_interest",
        attribution_status: "paid_allowlisted",
        viewed_at: "2026-08-25T00:00:00.000Z",
        quiz_started_at: "2026-08-25T00:00:05.000Z",
        quiz_completed_at: "2026-08-25T00:01:00.000Z",
        solution_viewed_at: "2026-08-25T00:01:05.000Z",
        intent_choice: "needed",
        intent_clicked_at: "2026-08-25T00:01:10.000Z",
        quiz_result: "split_tracking",
        quiz_answers: {
          q1: "가끔 기록 중",
          q2: "4~7일",
          q3: "대략 계산",
          q4: "집밥과 완제품을 따로 기록할 때",
          q5: "완성 무게·섭취량까지 반영한 정확한 계산",
        },
        target_qualified: true,
        email: null,
        consent_version: "marketing-demand-validation-v1",
        consented_at: "2026-08-25T00:01:11.000Z",
        turnstile_verified_at: "2026-08-25T00:01:11.500Z",
        lead_submitted_at: "2026-08-25T00:01:12.000Z",
        lead_submission_status: "duplicate",
        planner_intent: null,
        planner_priority: null,
        followup_submitted_at: null,
        retention_until: "2026-09-01T00:00:00.000Z",
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440003",
        campaign_key: "weekly_nutrition_2026",
        creative_key: "weekly_nutrition_v2",
        audience_key: "weekly_nutrition_beta_interest",
        attribution_status: "paid_allowlisted",
        viewed_at: "2026-08-26T00:00:00.000Z",
        quiz_started_at: "2026-08-26T00:00:05.000Z",
        quiz_completed_at: "2026-08-26T00:01:00.000Z",
        solution_viewed_at: "2026-08-26T00:01:05.000Z",
        intent_choice: "needed",
        intent_clicked_at: "2026-08-26T00:01:10.000Z",
        quiz_result: "ingredient_reentry",
        quiz_answers: {
          q1: "가끔 기록 중",
          q2: "2~3일",
          q3: "저장한 레시피를 재사용",
          q4: "레시피에 있는 재료를 다시 입력할 때",
          q5: "레시피 기준 자동 계산",
        },
        target_qualified: true,
        email: "no-consent@example.com",
        consent_version: null,
        consented_at: null,
        turnstile_verified_at: "2026-08-26T00:01:11.500Z",
        lead_submitted_at: "2026-08-26T00:01:12.000Z",
        lead_submission_status: "accepted",
        planner_intent: "definitely",
        planner_priority: "daily_macros",
        followup_submitted_at: "2026-08-26T00:01:20.000Z",
        retention_until: "2026-09-10T00:00:00.000Z",
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440002",
        campaign_key: "weekly_nutrition_2026",
        creative_key: "weekly_nutrition_v1",
        audience_key: "weekly_nutrition_beta_interest",
        attribution_status: "organic",
        viewed_at: "2026-08-15T00:00:00.000Z",
        quiz_started_at: "2026-08-15T00:00:05.000Z",
        quiz_completed_at: "2026-08-15T00:01:00.000Z",
        solution_viewed_at: "2026-08-15T00:01:05.000Z",
        intent_choice: "enough",
        intent_clicked_at: "2026-08-15T00:01:10.000Z",
        quiz_result: "satisfied_control",
        quiz_answers: {
          q1: "꾸준히 기록 중",
          q2: "2~3일",
          q3: "저장한 레시피를 재사용",
          q4: "특별히 불편하지 않음",
          q5: "현재 방식으로 충분함",
        },
        target_qualified: false,
        email: null,
        consent_version: null,
        consented_at: null,
        turnstile_verified_at: null,
        lead_submitted_at: null,
        lead_submission_status: "none",
        planner_intent: null,
        planner_priority: null,
        followup_submitted_at: null,
        retention_until: "2026-08-18T00:00:00.000Z",
      },
    ],
  };
}

describe("marketing validation Stage 6 operations", () => {
  it("keeps the purge CLI dry-run by default, deletes only expired rows after explicit enablement, and redacts stdout plus JSON evidence", () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), "marketing-validation-purge-"));
    const inputPath = path.join(sandbox, "marketing-validation-sessions.json");
    const unsafeEvidencePath = path.join(sandbox, "purge-evidence.json");
    const evidencePath = path.join(safeOutputRoot, "test-purge-evidence.json");

    writeJson(inputPath, makeSessionRows());

    const unsafeEvidence = runNodeScript(purgeScriptPath, [
      "--mock-db-export",
      inputPath,
      "--now",
      "2026-08-31T00:00:00.000Z",
      "--operator-id",
      "marketing_ops_test",
      "--evidence",
      unsafeEvidencePath,
    ]);

    expect(unsafeEvidence.status).toBe(1);
    expect(`${unsafeEvidence.stdout}\n${unsafeEvidence.stderr}`).toMatch(
      /gitignored safe directory/u,
    );

    const dryRun = runNodeScript(purgeScriptPath, [
      "--mock-db-export",
      inputPath,
      "--now",
      "2026-08-31T00:00:00.000Z",
      "--operator-id",
      "marketing_ops_test",
      "--evidence",
      evidencePath,
    ]);

    expect(dryRun.status).toBe(0);
    expect(dryRun.stdout).not.toContain("accepted@example.com");
    expect(dryRun.stdout).not.toContain("550e8400-e29b-41d4-a716-446655440000");

    const dryRunEvidence = JSON.parse(requireFileText(evidencePath)) as {
      deleted_count?: number;
      matched_count?: number;
      mode?: string;
      generated_at?: string;
      rows?: unknown;
      email?: unknown;
      operator_id?: string;
      raw_rows?: unknown;
      remaining_expired_count?: number;
    };
    expect(dryRunEvidence).toEqual({
      deleted_count: 0,
      generated_at: "2026-08-31T00:00:00.000Z",
      matched_count: 2,
      mode: "dry-run",
      operator_id: "marketing_ops_test",
      remaining_expired_count: 2,
    });
    expect(dryRunEvidence.rows).toBeUndefined();
    expect(dryRunEvidence.email).toBeUndefined();
    expect(dryRunEvidence.raw_rows).toBeUndefined();

    const blockedDelete = runNodeScript(purgeScriptPath, [
      "--mock-db-export",
      inputPath,
      "--now",
      "2026-08-31T00:00:00.000Z",
      "--operator-id",
      "marketing_ops_test",
      "--confirm",
      "--evidence",
      evidencePath,
    ]);

    expect(blockedDelete.status).toBe(1);
    expect(`${blockedDelete.stdout}\n${blockedDelete.stderr}`).toMatch(/MARKETING_VALIDATION_ALLOW_PURGE=1/u);

    const confirmedDelete = runNodeScript(purgeScriptPath, [
      "--mock-db-export",
      inputPath,
      "--now",
      "2026-08-31T00:00:00.000Z",
      "--operator-id",
      "marketing_ops_test",
      "--confirm",
      "--evidence",
      evidencePath,
    ], {
      MARKETING_VALIDATION_ALLOW_PURGE: "1",
    });

    expect(confirmedDelete.status).toBe(0);
    expect(confirmedDelete.stdout).not.toContain("accepted@example.com");
    expect(confirmedDelete.stdout).not.toContain("550e8400-e29b-41d4-a716-446655440002");

    const confirmedEvidence = JSON.parse(requireFileText(evidencePath)) as {
      deleted_count?: number;
      matched_count?: number;
      mode?: string;
      generated_at?: string;
      operator_id?: string;
      remaining_expired_count?: number;
    };
    expect(confirmedEvidence).toEqual({
      deleted_count: 2,
      generated_at: "2026-08-31T00:00:00.000Z",
      matched_count: 2,
      mode: "confirm",
      operator_id: "marketing_ops_test",
      remaining_expired_count: 0,
    });

    expect(JSON.parse(requireFileText(inputPath))).toEqual({
      rows: makeSessionRows().rows.filter(
        (row) => new Date(row.retention_until).getTime()
          >= new Date("2026-08-31T00:00:00.000Z").getTime(),
      ),
    });
  });

  it("keeps custom purge cutoffs mock-only and requires a non-PII operator alias", () => {
    const safeEvidencePath = path.join(safeOutputRoot, "test-purge-guard-evidence.json");

    const missingOperator = runNodeScript(purgeScriptPath, [
      "--evidence",
      safeEvidencePath,
    ]);
    expect(missingOperator.status).toBe(1);
    expect(`${missingOperator.stdout}\n${missingOperator.stderr}`).toMatch(/--operator-id/u);

    const productionCutoffOverride = runNodeScript(purgeScriptPath, [
      "--now",
      "2099-01-01T00:00:00.000Z",
      "--operator-id",
      "marketing_ops_test",
      "--evidence",
      safeEvidencePath,
    ]);
    expect(productionCutoffOverride.status).toBe(1);
    expect(`${productionCutoffOverride.stdout}\n${productionCutoffOverride.stderr}`).toMatch(
      /mock fixture에서만/u,
    );
  });

  it("rejects remote or ambiguous operator targets and accepts only explicit full-local loopback Data authority", () => {
    expect(() => readMarketingValidationOperatorEnv({
      DATA_SUPABASE_SECRET_KEY: "fixture-secret",
      DATA_SUPABASE_URL: "http://127.0.0.1:54321",
    })).toThrow(/HOMECOOK_DATA_AUTHORITY=local/u);

    expect(() => readMarketingValidationOperatorEnv({
      DATA_SUPABASE_SECRET_KEY: "fixture-secret",
      HOMECOOK_DATA_AUTHORITY: "local",
      MARKETING_VALIDATION_SUPABASE_URL: "https://example.supabase.co",
    })).toThrow(/loopback/u);

    expect(readMarketingValidationOperatorEnv({
      DATA_SUPABASE_SECRET_KEY: "fixture-secret",
      DATA_SUPABASE_URL: "http://127.0.0.1:54321",
      HOMECOOK_DATA_AUTHORITY: "local",
    })).toEqual({
      serviceRoleKey: "fixture-secret",
      url: "http://127.0.0.1:54321",
    });
  });

  it("uses exact PostgREST counts, deterministic export pagination, and a repo-anchored safe artifact root", () => {
    const moduleText = requireFileText(operationsModulePath);
    const exactCountUses = moduleText.match(/count:\s*"exact"/gu) ?? [];

    expect(exactCountUses.length).toBeGreaterThanOrEqual(3);
    expect(moduleText).toContain(".range(offset, offset + EXPORT_PAGE_SIZE - 1)");
    expect(moduleText).toContain('.order("lead_submitted_at", { ascending: true })');
    expect(moduleText).toContain('.order("id", { ascending: true })');
    expect(moduleText).toContain('.select("retention_until", { count: "exact" })');
    expect(moduleText).not.toContain("head: true");
    expect(moduleText).not.toContain("return data.length;");
    expect(moduleText).toContain("cwd = REPO_ROOT");
  });

  it("requires an explicit export output path inside a gitignored safe directory and writes an accepted-lead-only CSV with 0600 permissions", () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), "marketing-validation-export-"));
    const inputPath = path.join(sandbox, "marketing-validation-sessions.json");
    const unsafeOutputPath = path.join(sandbox, "marketing-validation-export.csv");
    const safeOutputPath = path.join(safeOutputRoot, "test-marketing-validation-export.csv");

    writeJson(inputPath, makeSessionRows());

    const missingOutput = runNodeScript(exportScriptPath, [
      "--mock-db-export",
      inputPath,
    ]);

    expect(missingOutput.status).toBe(1);
    expect(`${missingOutput.stdout}\n${missingOutput.stderr}`).toMatch(/--output/u);

    const unsafeOutput = runNodeScript(exportScriptPath, [
      "--mock-db-export",
      inputPath,
      "--output",
      unsafeOutputPath,
    ]);

    expect(unsafeOutput.status).toBe(1);
    expect(`${unsafeOutput.stdout}\n${unsafeOutput.stderr}`).toMatch(/gitignored safe directory/u);

    const safeOutput = runNodeScript(exportScriptPath, [
      "--mock-db-export",
      inputPath,
      "--output",
      safeOutputPath,
    ]);

    expect(safeOutput.status).toBe(0);
    expect(safeOutput.stdout).not.toContain("accepted@example.com");

    const csv = requireFileText(safeOutputPath);
    expect(csv).toContain("email,consent_version,consented_at");
    expect(csv).toContain(
      "accepted@example.com,marketing-demand-validation-v1,2026-08-20T00:01:11.000Z",
    );
    expect(csv).not.toContain("session_id");
    expect(csv).not.toContain("quiz_result");
    expect(csv).not.toContain("planner_intent");
    expect(csv).not.toContain("550e8400-e29b-41d4-a716-446655440000");
    expect(csv).not.toContain("550e8400-e29b-41d4-a716-446655440001");
    expect(csv).not.toContain("550e8400-e29b-41d4-a716-446655440003");
    expect(csv).not.toContain("no-consent@example.com");
    expect(csv).not.toContain("550e8400-e29b-41d4-a716-446655440002");
    expect(statSync(safeOutputPath).mode & 0o777).toBe(0o600);
  });

  it("escapes CSV cells instead of writing raw multiline or formula-like lead fields", () => {
    const sandbox = mkdtempSync(path.join(tmpdir(), "marketing-validation-export-escape-"));
    const inputPath = path.join(sandbox, "marketing-validation-sessions.json");
    const safeOutputPath = path.join(safeOutputRoot, "test-marketing-validation-export-escaped.csv");
    const fixture = makeSessionRows();

    fixture.rows[0].email = "=cmd,\n@example.com";
    writeJson(inputPath, fixture);

    const result = runNodeScript(exportScriptPath, [
      "--mock-db-export",
      inputPath,
      "--output",
      safeOutputPath,
    ]);

    expect(result.status).toBe(0);
    expect(requireFileText(safeOutputPath)).toContain("\"'=cmd,\n@example.com\"");
  });

  it("ships a PII-free analysis SQL scoped to the v2 creative and lead cohorts", () => {
    const sql = requireFileText(analysisSqlPath);

    expect(sql).not.toMatch(/\bselect\s+[^;]*(email|utm_term|ip|user_agent|referrer|cookie)\b/iu);
    expect(sql).toContain("mumeok_funnel_prototype_v2");
    expect(sql).toContain("ad_variant");
    expect(sql).toContain("quiz_result");
    expect(sql).toContain("lead_submission_status = 'accepted'");
    expect(sql).toContain("lead_submission_status = 'duplicate'");
    expect(sql).not.toContain("planner_intent");
    expect(sql).not.toContain("target_qualified");
  });

  it("reports every v2 funnel stage and beta-form-to-lead conversion", () => {
    const sql = requireFileText(analysisSqlPath);

    for (const metric of [
      "landing_view", "quiz_start", "quiz_complete", "result_view",
      "experience_start", "experience_complete", "beta_form_view", "accepted_lead",
      "duplicate_submission",
    ]) expect(sql).toContain(`'${metric}'`);
    expect(sql).toContain("beta_form_to_lead_rate");
    expect(sql).toMatch(/select 'accepted_lead', accepted_lead, beta_form_view from counts[\s\S]*select 'duplicate_submission', duplicate_submission, beta_form_view from counts/iu);
  });

  it("keeps the analysis SQL aligned with the Q3-only four-result rule", () => {
    const sql = requireFileText(analysisSqlPath);
    const result = buildQuizOutcome({ q1: "none", q2: "none", q3: "track", q4: "none" });
    expect(result).toEqual({ quiz_result: "ingredient-tracker", target_qualified: null });
    for (const key of ["homecook-passer", "eyeballing-master", "ingredient-tracker", "pro-measurer"]) {
      expect(sql).toContain(`'${key}'`);
    }
  });

  it("keeps every production activation blocker visible in the result-template sign-off", () => {
    const template = requireFileText(resultTemplatePath);

    for (const blocker of [
      "canonical `/privacy`",
      "Turnstile secret / hostname / action",
      "production origin",
      "edge rate-limit",
      "retention / sender domain",
      "full-local migration apply",
      "image rights / product example label",
      "iOS Safari / paid ads approval",
    ]) {
      expect(template).toContain(blocker);
    }
  });

  it("adds exact export and purge internal scopes without broadening the public marketing route scope", () => {
    const retentionMigration = requireFileText(retentionMigrationPath);
    const exportScopeMigration = requireFileText(exportScopeMigrationPath);

    expect(retentionMigration).toContain("v_scope = 'marketing-validation-purge'");
    expect(retentionMigration).toMatch(
      /v_method\s+in\s*\(\s*'GET'\s*,\s*'DELETE'\s*\)/iu,
    );
    expect(exportScopeMigration).toMatch(
      /v_scope\s*=\s*'marketing-validation'\s+and\s+v_method\s+in\s*\(\s*'GET'\s*,\s*'POST'\s*,\s*'PATCH'\s*\)[\s\S]*?v_path\s*=\s*'\/marketing_validation_sessions'/iu,
    );
    expect(exportScopeMigration).toMatch(
      /v_scope\s*=\s*'marketing-validation-export'\s+and\s+v_method\s*=\s*'GET'[\s\S]*?v_path\s*=\s*'\/marketing_validation_sessions'/iu,
    );
    expect(exportScopeMigration).toMatch(
      /v_scope\s*=\s*'marketing-validation-purge'\s+and\s+v_method\s+in\s*\(\s*'GET'\s*,\s*'DELETE'\s*\)[\s\S]*?v_path\s*=\s*'\/marketing_validation_sessions'/iu,
    );
    expect(requireFileText(operationsModulePath)).toContain(
      'createOperatorClient(env, "marketing-validation-export")',
    );
  });
});
