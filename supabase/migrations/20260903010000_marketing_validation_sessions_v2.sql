begin;

alter table public.marketing_validation_sessions
  add column if not exists ad_variant text,
  add column if not exists result_viewed_at timestamptz,
  add column if not exists experience_started_at timestamptz,
  add column if not exists experience_completed_at timestamptz,
  add column if not exists beta_form_viewed_at timestamptz;

do $drop_checks$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.marketing_validation_sessions'::regclass
      and contype = 'c'
  loop
    execute format(
      'alter table public.marketing_validation_sessions drop constraint %I',
      v_constraint.conname
    );
  end loop;
end;
$drop_checks$;

alter table public.marketing_validation_sessions
  add constraint marketing_validation_sessions_attribution_check check (
    attribution_status in ('paid_allowlisted', 'organic', 'unverified')
  ),
  add constraint marketing_validation_sessions_attribution_length_check check (
    (utm_source is null or char_length(utm_source) <= 120)
    and (utm_medium is null or char_length(utm_medium) <= 120)
    and (utm_campaign is null or char_length(utm_campaign) <= 120)
    and (utm_content is null or char_length(utm_content) <= 120)
    and (utm_term is null or char_length(utm_term) <= 120)
  ),
  add constraint marketing_validation_sessions_ad_variant_check check (
    ad_variant is null or ad_variant in ('a', 'b', 'c', 'd', 'default')
  ),
  add constraint marketing_validation_sessions_legacy_enum_check check (
    (intent_choice is null or intent_choice in ('needed', 'enough'))
    and (planner_intent is null or planner_intent in ('definitely', 'maybe', 'not_needed'))
    and (
      planner_priority is null
      or planner_priority in (
        'daily_macros', 'weekly_average', 'meal_table',
        'plan_record_switch', 'not_interested'
      )
    )
  ),
  add constraint marketing_validation_sessions_quiz_contract_check check (
    case
      when creative_key = 'mumeok_funnel_prototype_v2' then
        target_qualified is null
        and (
          (
            quiz_completed_at is null
            and quiz_result is null
            and quiz_answers is null
          )
          or (
            quiz_completed_at is not null
            and quiz_result in (
              'homecook-passer', 'eyeballing-master',
              'ingredient-tracker', 'pro-measurer'
            )
            and jsonb_typeof(quiz_answers) = 'object'
            and quiz_answers ? 'q1'
            and quiz_answers ? 'q2'
            and quiz_answers ? 'q3'
            and quiz_answers ? 'q4'
            and quiz_answers - array['q1', 'q2', 'q3', 'q4'] = '{}'::jsonb
            and (quiz_answers ->> 'q1') in ('daily', '3_5', '1_2', 'none')
            and (quiz_answers ->> 'q2') in ('none', '1_2', '3_5', '6_plus')
            and (quiz_answers ->> 'q3') in ('pass', 'eyeball', 'track', 'measure')
            and (quiz_answers ->> 'q4') in ('ingredients', 'weight', 'search', 'none')
            and quiz_result = case quiz_answers ->> 'q3'
              when 'pass' then 'homecook-passer'
              when 'eyeball' then 'eyeballing-master'
              when 'track' then 'ingredient-tracker'
              when 'measure' then 'pro-measurer'
            end
          )
        )
      else
        (
          quiz_completed_at is null
          and quiz_result is null
          and quiz_answers is null
          and target_qualified is null
        )
        or (
          quiz_completed_at is not null
          and quiz_result in (
            'ingredient_reentry', 'rough_match', 'split_tracking',
            'weekly_blindspot', 'satisfied_control'
          )
          and quiz_answers is not null
          and target_qualified is not null
        )
    end
  ),
  add constraint marketing_validation_sessions_lead_contract_check check (
    case
      when creative_key = 'mumeok_funnel_prototype_v2' then
        (
          lead_submission_status = 'none'
          and lead_submitted_at is null
          and email is null
          and consent_version is null
          and consented_at is null
          and turnstile_verified_at is null
        )
        or (
          lead_submission_status in ('accepted', 'duplicate')
          and lead_submitted_at is not null
          and consent_version = 'marketing-demand-validation-v2'
          and consented_at is not null
          and turnstile_verified_at is not null
          and (
            (lead_submission_status = 'accepted' and email is not null)
            or (lead_submission_status = 'duplicate' and email is null)
          )
        )
      else
        (
          lead_submission_status = 'none'
          and lead_submitted_at is null
          and email is null
          and consent_version is null
          and consented_at is null
          and turnstile_verified_at is null
        )
        or (
          lead_submission_status in ('accepted', 'duplicate')
          and lead_submitted_at is not null
          and intent_choice = 'needed'
          and consent_version is not null
          and consented_at is not null
          and turnstile_verified_at is not null
          and (
            (lead_submission_status = 'accepted' and email is not null)
            or (lead_submission_status = 'duplicate' and email is null)
          )
        )
    end
  ),
  add constraint marketing_validation_sessions_stage_order_check check (
    (quiz_started_at is null or quiz_started_at >= viewed_at)
    and (
      quiz_completed_at is null
      or (quiz_started_at is not null and quiz_completed_at >= quiz_started_at)
    )
    and (
      case
        when creative_key = 'mumeok_funnel_prototype_v2' then
          (result_viewed_at is null or (quiz_completed_at is not null and result_viewed_at >= quiz_completed_at))
          and (experience_started_at is null or (result_viewed_at is not null and experience_started_at >= result_viewed_at))
          and (experience_completed_at is null or (experience_started_at is not null and experience_completed_at >= experience_started_at))
          and (beta_form_viewed_at is null or (experience_completed_at is not null and beta_form_viewed_at >= experience_completed_at))
          and (lead_submitted_at is null or (beta_form_viewed_at is not null and lead_submitted_at >= beta_form_viewed_at))
        else
          (solution_viewed_at is null or (quiz_completed_at is not null and solution_viewed_at >= quiz_completed_at))
          and (intent_clicked_at is null or (solution_viewed_at is not null and intent_clicked_at >= solution_viewed_at))
          and (lead_submitted_at is null or (intent_clicked_at is not null and lead_submitted_at >= intent_clicked_at))
          and (followup_submitted_at is null or (lead_submitted_at is not null and followup_submitted_at >= lead_submitted_at))
      end
    )
  ),
  add constraint marketing_validation_sessions_v2_legacy_null_check check (
    creative_key <> 'mumeok_funnel_prototype_v2'
    or (
      solution_viewed_at is null
      and intent_choice is null
      and intent_clicked_at is null
      and planner_intent is null
      and planner_priority is null
      and followup_submitted_at is null
    )
  );

commit;
