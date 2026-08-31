-- PII-free demand-validation report.
-- Run only against an identity-verified local Supabase target, for example:
-- psql "$MARKETING_VALIDATION_LOCAL_DATABASE_URL" \
--   --set campaign_start='2026-09-01T00:00:00Z' \
--   --set campaign_end='2026-09-08T00:00:00Z' \
--   --file docs/marketing/demand-validation-analysis.sql

with params as (
  select
    :'campaign_start'::timestamptz as campaign_start,
    :'campaign_end'::timestamptz as campaign_end
),
cohort as (
  select
    id,
    viewed_at,
    quiz_started_at,
    quiz_completed_at,
    solution_viewed_at,
    intent_choice,
    quiz_result,
    quiz_answers,
    target_qualified,
    lead_submission_status,
    lead_submitted_at,
    consented_at,
    planner_intent,
    planner_priority,
    followup_submitted_at,
    (
      quiz_answers ->> 'q1' in (
        '해보려 했지만 시작하지 못함',
        '시작했지만 중단함',
        '가끔 기록 중'
      )
      and quiz_answers ->> 'q2' in ('2~3일', '4~7일')
      and quiz_answers ->> 'q4' in (
        '레시피에 있는 재료를 다시 입력할 때',
        '조리 후 무게와 내가 먹은 양을 계산할 때',
        '집밥과 완제품을 따로 기록할 때',
        '하루 합계와 주간 흐름을 한눈에 못 볼 때'
      )
      and quiz_answers ->> 'q4' <> '특별히 불편하지 않음'
      and quiz_answers ->> 'q5' <> '현재 방식으로 충분함'
    ) as recomputed_target_qualified
  from public.marketing_validation_sessions, params
  where campaign_key = 'weekly_nutrition_2026'
    and creative_key = 'weekly_nutrition_v2'
    and attribution_status = 'paid_allowlisted'
    and viewed_at >= params.campaign_start
    and viewed_at < params.campaign_end
),
counts as (
  select
    count(distinct id)::bigint as unique_ad_landing_session,
    count(*) filter (where quiz_started_at is not null)::bigint as quiz_start,
    count(*) filter (where quiz_completed_at is not null)::bigint as quiz_complete,
    count(*) filter (where solution_viewed_at is not null)::bigint as solution_view,
    count(*) filter (where intent_choice = 'needed')::bigint as product_intent,
    count(*) filter (
      where lead_submission_status = 'accepted'
        and lead_submitted_at is not null
        and consented_at is not null
    )::bigint as submitted_lead,
    count(*) filter (
      where lead_submission_status = 'duplicate'
        and lead_submitted_at is not null
    )::bigint as duplicate_submission,
    count(*) filter (
      where lead_submission_status = 'accepted'
        and planner_intent in ('definitely', 'maybe')
    )::bigint as planner_interest,
    count(*) filter (where target_qualified is true)::bigint as target_qualified_count,
    count(*) filter (
      where target_qualified is true
        and lead_submission_status = 'accepted'
    )::bigint as target_qualified_lead_count,
    count(*) filter (
      where quiz_completed_at is not null
        and target_qualified is false
    )::bigint as non_target_qualified_count,
    count(*) filter (
      where target_qualified is false
        and lead_submission_status = 'accepted'
    )::bigint as non_target_qualified_lead_count,
    count(*) filter (where quiz_result = 'satisfied_control')::bigint as satisfied_control_count,
    count(*) filter (
      where quiz_completed_at is not null
        and target_qualified is distinct from recomputed_target_qualified
    )::bigint as target_rule_mismatch_count
  from cohort
),
funnel as (
  select
    'landing_view'::text as metric,
    unique_ad_landing_session as numerator,
    unique_ad_landing_session as denominator
  from counts
  union all
  select 'quiz_start', quiz_start, unique_ad_landing_session from counts
  union all
  select 'quiz_complete', quiz_complete, quiz_start from counts
  union all
  select 'solution_view', solution_view, quiz_complete from counts
  union all
  select 'product_intent', product_intent, solution_view from counts
  union all
  select 'submitted_lead', submitted_lead, unique_ad_landing_session from counts
  union all
  select 'planner_interest', planner_interest, submitted_lead from counts
  union all
  select 'target_qualified', target_qualified_count, quiz_complete from counts
  union all
  select
    'target_qualified_lead',
    target_qualified_lead_count,
    target_qualified_count
  from counts
  union all
  select
    'non_target_qualified_lead',
    non_target_qualified_lead_count,
    non_target_qualified_count
  from counts
  union all
  select 'satisfied_control', satisfied_control_count, quiz_complete from counts
),
rates as (
  select
    metric,
    numerator,
    denominator,
    case
      when denominator = 0 then null
      else numerator::numeric / denominator
    end as rate,
    case
      when denominator = 0 then null
      else (
        (numerator::numeric / denominator)
        + power(1.96, 2) / (2 * denominator)
        - 1.96 * sqrt(
          (
            (numerator::numeric / denominator)
            * (1 - numerator::numeric / denominator)
            + power(1.96, 2) / (4 * denominator)
          ) / denominator
        )
      ) / (1 + power(1.96, 2) / denominator)
    end as wilson_lower_95,
    case
      when denominator = 0 then null
      else (
        (numerator::numeric / denominator)
        + power(1.96, 2) / (2 * denominator)
        + 1.96 * sqrt(
          (
            (numerator::numeric / denominator)
            * (1 - numerator::numeric / denominator)
            + power(1.96, 2) / (4 * denominator)
          ) / denominator
        )
      ) / (1 + power(1.96, 2) / denominator)
    end as wilson_upper_95
  from funnel
),
primary_decision as (
  select
    case
      when unique_ad_landing_session < 100
      then '판단 보류'
      when unique_ad_landing_session >= 200
        and submitted_lead >= 20
        and submitted_lead::numeric / nullif(unique_ad_landing_session, 0) >= 0.10
      then 'Green'
      when submitted_lead < 10
        or submitted_lead::numeric / nullif(unique_ad_landing_session, 0) < 0.05
      then 'Red'
      else 'Yellow'
    end as primary_status,
    case
      when unique_ad_landing_session < 100 then '판단 보류'
      else '판정 가능'
    end as sample_status,
    counts.*
  from counts
)
select
  'primary'::text as report_section,
  jsonb_build_object(
    'status', primary_status,
    'sample_status', sample_status,
    'unique_ad_landing_session', unique_ad_landing_session,
    'submitted_lead', submitted_lead,
    'duplicate_submission', duplicate_submission,
    'target_qualified_count', target_qualified_count,
    'target_qualified_lead_count', target_qualified_lead_count,
    'non_target_qualified_count', non_target_qualified_count,
    'non_target_qualified_lead_count', non_target_qualified_lead_count,
    'satisfied_control_count', satisfied_control_count,
    'target_rule_mismatch_count', target_rule_mismatch_count
  ) as report_value
from primary_decision
union all
select
  'funnel',
  jsonb_agg(
    jsonb_build_object(
      'metric', metric,
      'numerator', numerator,
      'denominator', denominator,
      'rate', rate,
      'wilson_lower_95', wilson_lower_95,
      'wilson_upper_95', wilson_upper_95
    )
    order by metric
  )
from rates;

with params as (
  select
    :'campaign_start'::timestamptz as campaign_start,
    :'campaign_end'::timestamptz as campaign_end
),
cohort as (
  select
    quiz_started_at,
    quiz_completed_at,
    quiz_answers,
    quiz_result,
    target_qualified,
    planner_intent,
    planner_priority,
    lead_submission_status
  from public.marketing_validation_sessions, params
  where campaign_key = 'weekly_nutrition_2026'
    and creative_key = 'weekly_nutrition_v2'
    and attribution_status = 'paid_allowlisted'
    and viewed_at >= params.campaign_start
    and viewed_at < params.campaign_end
),
diagnostics as (
  select
    'result_distribution'::text as diagnostic,
    quiz_result as segment,
    count(*)::bigint as session_count
  from cohort
  where quiz_completed_at is not null
  group by quiz_result
  union all
  select
    'target_qualified_distribution',
    target_qualified::text,
    count(*)::bigint
  from cohort
  where quiz_completed_at is not null
  group by target_qualified::text
  union all
  select
    'q1_distribution',
    quiz_answers ->> 'q1',
    count(*)::bigint
  from cohort
  where quiz_completed_at is not null
  group by quiz_answers ->> 'q1'
  union all
  select
    'planner_intent_distribution',
    coalesce(planner_intent, 'not_answered'),
    count(*)::bigint
  from cohort
  where lead_submission_status = 'accepted'
  group by coalesce(planner_intent, 'not_answered')
  union all
  select
    'planner_priority_distribution',
    coalesce(planner_priority, 'not_answered'),
    count(*)::bigint
  from cohort
  where lead_submission_status = 'accepted'
  group by coalesce(planner_priority, 'not_answered')
),
diagnostic_rates as (
  select
    diagnostic,
    segment,
    session_count as numerator,
    sum(session_count) over (partition by diagnostic) as denominator
  from diagnostics
)
select
  diagnostic,
  segment,
  numerator,
  denominator,
  numerator::numeric / nullif(denominator, 0) as rate,
  (
    (numerator::numeric / nullif(denominator, 0))
    + power(1.96, 2) / (2 * nullif(denominator, 0))
    - 1.96 * sqrt(
      (
        (numerator::numeric / nullif(denominator, 0))
        * (1 - numerator::numeric / nullif(denominator, 0))
        + power(1.96, 2) / (4 * nullif(denominator, 0))
      ) / nullif(denominator, 0)
    )
  ) / (1 + power(1.96, 2) / nullif(denominator, 0)) as wilson_lower_95,
  (
    (numerator::numeric / nullif(denominator, 0))
    + power(1.96, 2) / (2 * nullif(denominator, 0))
    + 1.96 * sqrt(
      (
        (numerator::numeric / nullif(denominator, 0))
        * (1 - numerator::numeric / nullif(denominator, 0))
        + power(1.96, 2) / (4 * nullif(denominator, 0))
      ) / nullif(denominator, 0)
    )
  ) / (1 + power(1.96, 2) / nullif(denominator, 0)) as wilson_upper_95
from diagnostic_rates
order by diagnostic, numerator desc, segment;
