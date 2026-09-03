insert into public.marketing_validation_sessions (
  id, campaign_key, creative_key, audience_key, attribution_status,
  viewed_at, quiz_started_at, quiz_completed_at, solution_viewed_at,
  intent_choice, intent_clicked_at, quiz_result, quiz_answers,
  target_qualified, email, consent_version, consented_at,
  turnstile_verified_at, lead_submitted_at, lead_submission_status,
  planner_intent, planner_priority, followup_submitted_at, retention_until,
  created_at, updated_at
) values (
  '10000000-0000-4000-8000-000000000001',
  'weekly_nutrition_2026', 'weekly_nutrition_v2', 'fixture', 'organic',
  '2026-08-31T00:00:00Z', '2026-08-31T00:00:01Z',
  '2026-08-31T00:00:02Z', '2026-08-31T00:00:03Z',
  'needed', '2026-08-31T00:00:04Z', 'weekly_blindspot',
  '{"q1":"시작했지만 중단함","q2":"2~3일","q3":"재료를 하나씩 검색해 입력","q4":"하루 합계와 주간 흐름을 한눈에 못 볼 때","q5":"레시피 기준 자동 계산"}'::jsonb,
  true, 'fixture-v1@example.invalid', 'marketing-demand-validation-v1',
  '2026-08-31T00:00:05Z', '2026-08-31T00:00:05Z',
  '2026-08-31T00:00:05Z', 'accepted', 'maybe', 'weekly_average',
  '2026-08-31T00:00:06Z', '2027-02-27T00:00:00Z',
  '2026-08-31T00:00:00Z', '2026-08-31T00:00:06Z'
);

select md5(to_jsonb(row_value)::text) as v1_digest_before
from public.marketing_validation_sessions row_value
where id = '10000000-0000-4000-8000-000000000001'
\gset
