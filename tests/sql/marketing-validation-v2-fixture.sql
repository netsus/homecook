begin;

do $fixture$
declare
  v1_id uuid := '10000000-0000-4000-8000-000000000001';
  v1_digest_before text;
  v1_digest_after text;
begin
  insert into public.marketing_validation_sessions (
    id, campaign_key, creative_key, audience_key, attribution_status,
    viewed_at, quiz_started_at, quiz_completed_at, solution_viewed_at,
    intent_choice, intent_clicked_at, quiz_result, quiz_answers,
    target_qualified, email, consent_version, consented_at,
    turnstile_verified_at, lead_submitted_at, lead_submission_status,
    planner_intent, planner_priority, followup_submitted_at, retention_until,
    created_at, updated_at
  ) values (
    v1_id, 'weekly_nutrition_2026', 'weekly_nutrition_v2', 'fixture', 'organic',
    '2026-08-31T00:00:00Z', '2026-08-31T00:00:01Z', '2026-08-31T00:00:02Z', '2026-08-31T00:00:03Z',
    'needed', '2026-08-31T00:00:04Z', 'weekly_blindspot',
    '{"q1":"시작했지만 중단함","q2":"2~3일","q3":"재료를 하나씩 검색해 입력","q4":"하루 합계와 주간 흐름을 한눈에 못 볼 때","q5":"레시피 기준 자동 계산"}'::jsonb,
    true, 'fixture-v1@example.invalid', 'marketing-demand-validation-v1', '2026-08-31T00:00:05Z',
    '2026-08-31T00:00:05Z', '2026-08-31T00:00:05Z', 'accepted',
    'maybe', 'weekly_average', '2026-08-31T00:00:06Z', '2027-02-27T00:00:00Z',
    '2026-08-31T00:00:00Z', '2026-08-31T00:00:06Z'
  );

  select md5(to_jsonb(row_value)::text) into v1_digest_before
  from public.marketing_validation_sessions row_value where id = v1_id;

  insert into public.marketing_validation_sessions (
    id, campaign_key, creative_key, audience_key, ad_variant, attribution_status,
    viewed_at, quiz_started_at, quiz_completed_at, quiz_answers, quiz_result,
    result_viewed_at, experience_started_at, experience_completed_at,
    beta_form_viewed_at, target_qualified, lead_submission_status, retention_until
  ) values (
    '20000000-0000-4000-8000-000000000001', 'weekly_nutrition_2026',
    'mumeok_funnel_prototype_v2', 'fixture', 'default', 'organic',
    '2026-09-03T00:00:00Z', '2026-09-03T00:00:01Z', '2026-09-03T00:00:02Z',
    '{"q1":"daily","q2":"3_5","q3":"track","q4":"search"}'::jsonb,
    'ingredient-tracker', '2026-09-03T00:00:03Z', '2026-09-03T00:00:04Z',
    '2026-09-03T00:00:05Z', '2026-09-03T00:00:06Z', null, 'none',
    '2027-03-02T00:00:00Z'
  );

  begin
    insert into public.marketing_validation_sessions (
      id, campaign_key, creative_key, audience_key, attribution_status,
      viewed_at, target_qualified, lead_submission_status, retention_until
    ) values (
      '20000000-0000-4000-8000-000000000002', 'weekly_nutrition_2026',
      'mumeok_funnel_prototype_v2', 'fixture', 'organic',
      '2026-09-03T00:00:00Z', true, 'none', '2027-03-02T00:00:00Z'
    );
    raise exception 'expected v2 target-qualified rejection';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.marketing_validation_sessions (
      id, campaign_key, creative_key, audience_key, attribution_status,
      viewed_at, lead_submitted_at, lead_submission_status, email,
      consent_version, consented_at, turnstile_verified_at, retention_until
    ) values (
      '20000000-0000-4000-8000-000000000003', 'weekly_nutrition_2026',
      'mumeok_funnel_prototype_v2', 'fixture', 'organic',
      '2026-09-03T00:00:00Z', '2026-09-03T00:00:01Z', 'accepted',
      'fixture-v2@example.invalid', 'marketing-demand-validation-v2',
      '2026-09-03T00:00:01Z', '2026-09-03T00:00:01Z', '2027-03-02T00:00:00Z'
    );
    raise exception 'expected v2 lead-before-beta rejection';
  exception when check_violation then
    null;
  end;

  select md5(to_jsonb(row_value)::text) into v1_digest_after
  from public.marketing_validation_sessions row_value where id = v1_id;
  if v1_digest_before is distinct from v1_digest_after then
    raise exception 'v1 fixture row digest changed';
  end if;
end;
$fixture$;

rollback;
