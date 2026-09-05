import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import campaignContract from "@/lib/marketing/marketing-validation-campaign.json";

const databaseUrl = process.env.HOMECOOK_ISOLATED_RUNTIME_DATABASE_URL?.trim();
const projectId = process.env.HOMECOOK_ISOLATED_RUNTIME_PROJECT_ID?.trim();
const integrationIt = databaseUrl ? it : it.skip;
const retentionUntil = new Date(campaignContract.campaignEndAt);
retentionUntil.setUTCDate(retentionUntil.getUTCDate() + campaignContract.retentionDays);
const RETENTION_UNTIL = retentionUntil.toISOString();

describe("marketing validation lead persistence on isolated PostgreSQL", () => {
  integrationIt("stores one accepted email, records duplicates without PII, and preserves retention", () => {
    expect(projectId).toMatch(/^hcg_\d+_[a-f0-9]{6}$/u);
    expect(databaseUrl).toMatch(/^postgresql:\/\/[^@\s]+@(?:127\.0\.0\.1|\[::1\]):\d+\/postgres$/u);

    const sql = String.raw`
\set ON_ERROR_STOP on
begin;

insert into public.marketing_validation_sessions (
  id, campaign_key, creative_key, audience_key, ad_variant, attribution_status,
  viewed_at, quiz_started_at, quiz_completed_at, quiz_answers, quiz_result,
  result_viewed_at, experience_started_at, experience_completed_at,
  beta_form_viewed_at, target_qualified, email, consent_version, consented_at,
  turnstile_verified_at, lead_submitted_at, lead_submission_status, retention_until
) values
  (
    '32000000-0000-4000-8000-000000000001', 'weekly_nutrition_2026',
    'mumeok_funnel_prototype_v2', 'weekly_nutrition_beta_interest', 'a', 'paid_allowlisted',
    '2026-09-05T10:00:00Z', '2026-09-05T10:00:01Z', '2026-09-05T10:00:02Z',
    '{"q1":"daily","q2":"3_5","q3":"track","q4":"search"}'::jsonb,
    'ingredient-tracker', '2026-09-05T10:00:03Z', '2026-09-05T10:00:04Z',
    '2026-09-05T10:00:05Z', '2026-09-05T10:00:06Z', null,
    'accepted-lead@example.invalid', 'marketing-demand-validation-v2',
    '2026-09-05T10:00:07Z', '2026-09-05T10:00:07Z',
    '2026-09-05T10:00:08Z', 'accepted', '${RETENTION_UNTIL}'
  ),
  (
    '32000000-0000-4000-8000-000000000002', 'weekly_nutrition_2026',
    'mumeok_funnel_prototype_v2', 'weekly_nutrition_beta_interest', 'b', 'paid_allowlisted',
    '2026-09-05T11:00:00Z', '2026-09-05T11:00:01Z', '2026-09-05T11:00:02Z',
    '{"q1":"daily","q2":"3_5","q3":"measure","q4":"weight"}'::jsonb,
    'pro-measurer', '2026-09-05T11:00:03Z', '2026-09-05T11:00:04Z',
    '2026-09-05T11:00:05Z', '2026-09-05T11:00:06Z', null,
    null, 'marketing-demand-validation-v2', '2026-09-05T11:00:07Z',
    '2026-09-05T11:00:07Z', '2026-09-05T11:00:08Z', 'duplicate',
    '${RETENTION_UNTIL}'
  );

do $$
begin
  begin
    insert into public.marketing_validation_sessions (
      id, campaign_key, creative_key, audience_key, ad_variant, attribution_status,
      viewed_at, quiz_started_at, quiz_completed_at, quiz_answers, quiz_result,
      result_viewed_at, experience_started_at, experience_completed_at,
      beta_form_viewed_at, target_qualified, email, consent_version, consented_at,
      turnstile_verified_at, lead_submitted_at, lead_submission_status, retention_until
    ) values (
      '32000000-0000-4000-8000-000000000003', 'weekly_nutrition_2026',
      'mumeok_funnel_prototype_v2', 'weekly_nutrition_beta_interest', 'c', 'organic',
      '2026-09-05T12:00:00Z', '2026-09-05T12:00:01Z', '2026-09-05T12:00:02Z',
      '{"q1":"daily","q2":"3_5","q3":"track","q4":"search"}'::jsonb,
      'ingredient-tracker', '2026-09-05T12:00:03Z', '2026-09-05T12:00:04Z',
      '2026-09-05T12:00:05Z', '2026-09-05T12:00:06Z', null,
      'accepted-lead@example.invalid',
      'marketing-demand-validation-v2', '2026-09-05T12:00:01Z',
      '2026-09-05T12:00:07Z', '2026-09-05T12:00:08Z', 'accepted',
      '${RETENTION_UNTIL}'
    );
    raise exception 'duplicate accepted email unexpectedly stored';
  exception when unique_violation then
    null;
  end;
end $$;

select
  count(*) filter (where lead_submission_status = 'accepted') as accepted_count,
  count(*) filter (where lead_submission_status = 'duplicate') as duplicate_count,
  count(*) filter (where lead_submission_status = 'accepted' and email is not null) as accepted_with_email,
  count(*) filter (where lead_submission_status = 'duplicate' and email is null) as duplicate_without_email,
  bool_and(retention_until = '${RETENTION_UNTIL}'::timestamptz) as retention_exact
from public.marketing_validation_sessions
where id in (
  '32000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000002'
);

rollback;
`;

    const result = spawnSync(
      "psql",
      [databaseUrl!, "--no-psqlrc", "--no-align", "--tuples-only", "--field-separator=|", "--file=-"],
      { encoding: "utf8", input: sql, timeout: 30_000 },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/^1\|1\|1\|1\|t$/mu);
    expect(`${result.stdout}\n${result.stderr}`).not.toContain("@");
  });
});
