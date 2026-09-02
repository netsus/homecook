import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260831100000_marketing_validation_sessions.sql";
const v2MigrationPath =
  "supabase/migrations/20260903010000_marketing_validation_sessions_v2.sql";
const fixturePath = "tests/sql/marketing-validation-v2-fixture.sql";
const preMigrationFixturePath =
  "tests/sql/marketing-validation-v2-pre-migration-fixture.sql";

describe("marketing demand validation migration contract", () => {
  it("creates exactly one marketing session table and extends the internal scope allowlist", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();

    expect(sql).toContain("create table public.marketing_validation_sessions");
    expect(sql).toContain("create unique index marketing_validation_sessions_email_unique_idx");
    expect(sql).toContain("lower(email)");
    expect(sql).toContain("where email is not null");
    expect(sql).toContain(
      "attribution_status in ('paid_allowlisted', 'organic', 'unverified')",
    );
    expect(sql).toContain("char_length(utm_source) <= 120");
    expect(sql).toContain("target_qualified boolean");
    expect(sql).not.toContain("target_qualified boolean not null");
    expect(sql).toContain("intent_choice = 'needed'");
    expect(sql).toContain("lead_submission_status in ('accepted', 'duplicate')");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("force row level security");
    expect(sql).toContain("grant all privileges on public.marketing_validation_sessions to service_role");
    expect(sql).toContain("create policy marketing_validation_sessions_service_role_access");
    expect(sql).toContain("v_scope = 'marketing-validation'");
    expect(sql).toContain("/marketing_validation_sessions");
  });

  it("stays privacy-minimal and does not introduce raw request metadata columns", () => {
    const sql = readFileSync(migrationPath, "utf8").toLowerCase();

    expect(sql).not.toMatch(/\b(ip|ip_address|user_agent|referrer_url|fingerprint)\b/u);
    expect(sql).toContain("quiz_answers jsonb");
    expect(sql).toContain("target_qualified boolean");
    expect(sql).toContain("retention_until timestamptz");
    expect(sql).not.toMatch(/create table public\.[a-z_]*marketing[a-z_]*events/u);
  });
});

describe("marketing demand validation v2 successor migration", () => {
  it("adds only nullable v2 columns and named conditional constraints", () => {
    expect(existsSync(v2MigrationPath)).toBe(true);
    const sql = existsSync(v2MigrationPath)
      ? readFileSync(v2MigrationPath, "utf8").toLowerCase()
      : "";

    for (const column of [
      "ad_variant", "result_viewed_at", "experience_started_at",
      "experience_completed_at", "beta_form_viewed_at",
    ]) {
      expect(sql).toMatch(new RegExp(`add column(?: if not exists)? ${column}[^;]*`));
    }
    for (const constraint of [
      "marketing_validation_sessions_quiz_contract_check",
      "marketing_validation_sessions_lead_contract_check",
      "marketing_validation_sessions_stage_order_check",
      "marketing_validation_sessions_v2_legacy_null_check",
    ]) {
      expect(sql).toContain(constraint);
    }
    expect(sql).toContain("creative_key = 'mumeok_funnel_prototype_v2'");
    expect(sql).toContain("quiz_answers - array['q1', 'q2', 'q3', 'q4'] = '{}'::jsonb");
    expect(sql).toContain("quiz_answers ? 'q4'");
    expect(sql).not.toContain("quiz_answers ? 'q5' and creative_key = 'mumeok_funnel_prototype_v2'");
    expect(sql).toContain("target_qualified is null");
    expect(sql).toContain("beta_form_viewed_at is not null");
    expect(sql).toContain("lead_submitted_at >= beta_form_viewed_at");
    expect(sql).toContain("creative_key <> 'mumeok_funnel_prototype_v2'");
    for (const column of [
      "ad_variant", "result_viewed_at", "experience_started_at",
      "experience_completed_at", "beta_form_viewed_at",
    ]) {
      expect(sql).toMatch(new RegExp(`creative_key <> 'mumeok_funnel_prototype_v2'[\\s\\S]*${column} is null`));
    }
  });

  it("preserves v1 taxonomy while allowing only four v2 results", () => {
    const sql = existsSync(v2MigrationPath) ? readFileSync(v2MigrationPath, "utf8") : "";
    for (const legacy of [
      "ingredient_reentry", "rough_match", "split_tracking", "weekly_blindspot", "satisfied_control",
    ]) expect(sql).toContain(`'${legacy}'`);
    for (const current of [
      "homecook-passer", "eyeballing-master", "ingredient-tracker", "pro-measurer",
    ]) expect(sql).toContain(`'${current}'`);
    expect(sql).not.toMatch(/create\s+table\s+public\.[a-z_]*marketing[a-z_]*/iu);
  });

  it("runs v1 digest and v2 rejection fixtures in the pinned isolated gate", () => {
    expect(existsSync(preMigrationFixturePath)).toBe(true);
    expect(existsSync(fixturePath)).toBe(true);
    const preFixture = existsSync(preMigrationFixturePath)
      ? readFileSync(preMigrationFixturePath, "utf8")
      : "";
    const fixture = existsSync(fixturePath) ? readFileSync(fixturePath, "utf8") : "";
    const runner = readFileSync("scripts/run-isolated-security-function-gate.mjs", "utf8");

    expect(preFixture).toContain("v1_digest_before");
    expect(runner).toMatch(/marketing-validation-v2-pre-migration-fixture\.sql[\s\S]*20260903010000_marketing_validation_sessions_v2\.sql[\s\S]*marketing-validation-v2-fixture\.sql/);
    expect(fixture).toContain("v1_digest_preserved");
    expect(fixture).toContain("to_jsonb(row_value) - array[");
    expect(fixture).toContain("v1_digest_mismatch_should_fail");
    expect(fixture).toContain("mumeok_funnel_prototype_v2");
    expect(fixture).toContain("beta_form_viewed_at");
    expect(fixture).toContain("expected v2 lead-before-beta rejection");
    expect(fixture).toContain("expected v2 target-qualified rejection");
    for (const column of [
      "ad_variant", "result_viewed_at", "experience_started_at",
      "experience_completed_at", "beta_form_viewed_at",
    ]) expect(fixture).toContain(`expected v1 ${column} rejection`);
  });
});
