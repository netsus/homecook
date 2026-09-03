select md5((
  to_jsonb(row_value) - array[
    'ad_variant',
    'result_viewed_at',
    'experience_started_at',
    'experience_completed_at',
    'beta_form_viewed_at'
  ]
)::text) = :'v1_digest_before' as v1_digest_preserved
from public.marketing_validation_sessions row_value
where id = '10000000-0000-4000-8000-000000000001'
\gset

\if :v1_digest_preserved
\else
  select v1_digest_mismatch_should_fail();
\endif

begin;

do $fixture$
declare
  v1_id uuid := '10000000-0000-4000-8000-000000000001';
begin
  begin
    update public.marketing_validation_sessions set ad_variant = 'a' where id = v1_id;
    raise exception 'expected v1 ad_variant rejection';
  exception when check_violation then null;
  end;

  begin
    update public.marketing_validation_sessions set result_viewed_at = '2026-08-31T00:00:07Z' where id = v1_id;
    raise exception 'expected v1 result_viewed_at rejection';
  exception when check_violation then null;
  end;

  begin
    update public.marketing_validation_sessions set experience_started_at = '2026-08-31T00:00:07Z' where id = v1_id;
    raise exception 'expected v1 experience_started_at rejection';
  exception when check_violation then null;
  end;

  begin
    update public.marketing_validation_sessions set experience_completed_at = '2026-08-31T00:00:07Z' where id = v1_id;
    raise exception 'expected v1 experience_completed_at rejection';
  exception when check_violation then null;
  end;

  begin
    update public.marketing_validation_sessions set beta_form_viewed_at = '2026-08-31T00:00:07Z' where id = v1_id;
    raise exception 'expected v1 beta_form_viewed_at rejection';
  exception when check_violation then null;
  end;

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
  exception when check_violation then null;
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
  exception when check_violation then null;
  end;
end;
$fixture$;

delete from public.marketing_validation_sessions
where id in (
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001'
);

commit;
