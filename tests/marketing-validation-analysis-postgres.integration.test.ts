import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

const databaseUrl = process.env.HOMECOOK_ISOLATED_RUNTIME_DATABASE_URL?.trim();
const projectId = process.env.HOMECOOK_ISOLATED_RUNTIME_PROJECT_ID?.trim();
const integrationIt = databaseUrl ? it : it.skip;
const repoRoot = path.resolve(__dirname, "..");
const analysisSqlPath = path.join(
  repoRoot,
  "docs/marketing/demand-validation-analysis.sql",
);

describe("marketing validation v2 analysis on isolated PostgreSQL", () => {
  integrationIt("aggregates ad funnels and q1..q4 without returning PII", () => {
    expect(projectId).toMatch(/^hcg_\d+_[a-f0-9]{6}$/u);
    expect(databaseUrl).toMatch(/^postgresql:\/\/[^@\s]+@(?:127\.0\.0\.1|\[::1\]):\d+\/postgres$/u);

    const fixtureSql = String.raw`
\set ON_ERROR_STOP on
begin;

insert into public.marketing_validation_sessions (
  id, campaign_key, creative_key, audience_key, ad_variant, attribution_status,
  viewed_at, quiz_started_at, quiz_completed_at, quiz_answers, quiz_result,
  result_viewed_at, experience_started_at, experience_completed_at,
  beta_form_viewed_at, target_qualified, email, consent_version, consented_at,
  turnstile_verified_at, lead_submitted_at, lead_submission_status,
  retention_until
) values
  (
    '31000000-0000-4000-8000-000000000001', 'weekly_nutrition_2026',
    'mumeok_funnel_prototype_v2', 'preview-fixture', 'a', 'paid_allowlisted',
    '2026-09-04T00:00:00Z', '2026-09-04T00:00:01Z', '2026-09-04T00:00:02Z',
    '{"q1":"daily","q2":"3_5","q3":"track","q4":"search"}'::jsonb,
    'ingredient-tracker', '2026-09-04T00:00:03Z', '2026-09-04T00:00:04Z',
    '2026-09-04T00:00:05Z', '2026-09-04T00:00:06Z', null,
    'preview-accepted@example.invalid', 'marketing-demand-validation-v2',
    '2026-09-04T00:00:07Z', '2026-09-04T00:00:07Z',
    '2026-09-04T00:00:08Z', 'accepted', '2027-03-03T00:00:00Z'
  ),
  (
    '31000000-0000-4000-8000-000000000002', 'weekly_nutrition_2026',
    'mumeok_funnel_prototype_v2', 'preview-fixture', 'b', 'paid_allowlisted',
    '2026-09-04T01:00:00Z', '2026-09-04T01:00:01Z', '2026-09-04T01:00:02Z',
    '{"q1":"1_2","q2":"6_plus","q3":"measure","q4":"weight"}'::jsonb,
    'pro-measurer', '2026-09-04T01:00:03Z', '2026-09-04T01:00:04Z',
    '2026-09-04T01:00:05Z', '2026-09-04T01:00:06Z', null,
    null, 'marketing-demand-validation-v2', '2026-09-04T01:00:07Z',
    '2026-09-04T01:00:07Z', '2026-09-04T01:00:08Z', 'duplicate',
    '2027-03-03T01:00:00Z'
  ),
  (
    '31000000-0000-4000-8000-000000000003', 'weekly_nutrition_2026',
    'mumeok_funnel_prototype_v2', 'preview-fixture', 'c', 'organic',
    '2026-09-04T02:00:00Z', '2026-09-04T02:00:01Z', '2026-09-04T02:00:02Z',
    '{"q1":"none","q2":"none","q3":"pass","q4":"none"}'::jsonb,
    'homecook-passer', '2026-09-04T02:00:03Z', '2026-09-04T02:00:04Z',
    '2026-09-04T02:00:05Z', '2026-09-04T02:00:06Z', null,
    null, null, null, null, null, 'none', '2027-03-03T02:00:00Z'
  ),
  (
    '31000000-0000-4000-8000-000000000004', 'other_campaign_2026',
    'mumeok_funnel_prototype_v2', 'preview-fixture', 'a', 'organic',
    '2026-09-04T03:00:00Z', '2026-09-04T03:00:01Z', '2026-09-04T03:00:02Z',
    '{"q1":"daily","q2":"3_5","q3":"track","q4":"search"}'::jsonb,
    'ingredient-tracker', '2026-09-04T03:00:03Z', '2026-09-04T03:00:04Z',
    '2026-09-04T03:00:05Z', '2026-09-04T03:00:06Z', null,
    'wrong-campaign@example.invalid', 'marketing-demand-validation-v2',
    '2026-09-04T03:00:07Z', '2026-09-04T03:00:07Z',
    '2026-09-04T03:00:08Z', 'accepted', '2027-03-03T03:00:00Z'
  );

\i ${analysisSqlPath}
rollback;
`;

    const result = spawnSync(
      "psql",
      [
        databaseUrl!,
        "--no-psqlrc",
        "--no-align",
        "--tuples-only",
        "--field-separator=|",
        "--set=campaign_start=2026-09-04T00:00:00Z",
        "--set=campaign_end=2026-09-05T00:00:00Z",
        "--file=-",
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        input: fixtureSql,
        timeout: 30_000,
      },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/^landing_view\|3\|3\|1(?:\.0+)?$/mu);
    expect(result.stdout).toMatch(/^accepted_lead\|1\|3\|0\.3+/mu);
    expect(result.stdout).toMatch(/^duplicate_submission\|1\|3\|0\.3+/mu);
    expect(result.stdout).toMatch(/^ad_variant_funnel\|a\|accepted_lead\|1\|1\|1(?:\.0+)?$/mu);
    expect(result.stdout).toMatch(/^ad_variant_funnel\|b\|duplicate_submission\|1\|1\|1(?:\.0+)?$/mu);
    expect(result.stdout).toMatch(/^ad_variant_funnel\|d\|landing_view\|0\|0\|$/mu);
    expect(result.stdout).toMatch(/^q1\|daily\|1\|3\|0\.3+/mu);
    expect(result.stdout).toMatch(/^q2\|6_plus\|1\|3\|0\.3+/mu);
    expect(result.stdout).toMatch(/^q3\|track\|1\|3\|0\.3+/mu);
    expect(result.stdout).toMatch(/^q4\|weight\|1\|3\|0\.3+/mu);
    expect(result.stdout).not.toContain("preview-accepted@example.invalid");
    expect(result.stdout).not.toContain("wrong-campaign@example.invalid");
  });
});
