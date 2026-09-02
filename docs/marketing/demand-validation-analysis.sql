-- PII-free marketing demand validation v2 report.
-- Run only against an identity-verified local Supabase target.
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
    ad_variant,
    quiz_result,
    viewed_at,
    quiz_started_at,
    quiz_completed_at,
    result_viewed_at,
    experience_started_at,
    experience_completed_at,
    beta_form_viewed_at,
    lead_submitted_at,
    lead_submission_status
  from public.marketing_validation_sessions, params
  where creative_key = 'mumeok_funnel_prototype_v2'
    and viewed_at >= params.campaign_start
    and viewed_at < params.campaign_end
),
counts as (
  select
    count(*)::bigint as landing_view,
    count(*) filter (where quiz_started_at is not null)::bigint as quiz_start,
    count(*) filter (where quiz_completed_at is not null)::bigint as quiz_complete,
    count(*) filter (where result_viewed_at is not null)::bigint as result_view,
    count(*) filter (where experience_started_at is not null)::bigint as experience_start,
    count(*) filter (where experience_completed_at is not null)::bigint as experience_complete,
    count(*) filter (where beta_form_viewed_at is not null)::bigint as beta_form_view,
    count(*) filter (
      where lead_submission_status = 'accepted' and lead_submitted_at is not null
    )::bigint as accepted_lead,
    count(*) filter (
      where lead_submission_status = 'duplicate' and lead_submitted_at is not null
    )::bigint as duplicate_submission
  from cohort
),
funnel as (
  select 'landing_view'::text as metric, landing_view as numerator, landing_view as denominator from counts
  union all select 'quiz_start', quiz_start, landing_view from counts
  union all select 'quiz_complete', quiz_complete, quiz_start from counts
  union all select 'result_view', result_view, quiz_complete from counts
  union all select 'experience_start', experience_start, result_view from counts
  union all select 'experience_complete', experience_complete, experience_start from counts
  union all select 'beta_form_view', beta_form_view, experience_complete from counts
  union all select 'accepted_lead', accepted_lead, beta_form_view from counts
  union all select 'duplicate_submission', duplicate_submission, beta_form_view from counts
)
select
  metric,
  numerator,
  denominator,
  numerator::numeric / nullif(denominator, 0) as rate
from funnel;

with params as (
  select
    :'campaign_start'::timestamptz as campaign_start,
    :'campaign_end'::timestamptz as campaign_end
),
cohort as (
  select ad_variant, quiz_result, beta_form_viewed_at, lead_submission_status
  from public.marketing_validation_sessions, params
  where creative_key = 'mumeok_funnel_prototype_v2'
    and viewed_at >= params.campaign_start
    and viewed_at < params.campaign_end
),
segments as (
  select
    'ad_variant'::text as cohort_type,
    coalesce(ad_variant, 'default') as cohort_value,
    count(*)::bigint as sessions,
    count(*) filter (where beta_form_viewed_at is not null)::bigint as beta_form_views,
    count(*) filter (where lead_submission_status = 'accepted')::bigint as accepted_leads
  from cohort
  group by coalesce(ad_variant, 'default')
  union all
  select
    'quiz_result',
    quiz_result,
    count(*)::bigint,
    count(*) filter (where beta_form_viewed_at is not null)::bigint,
    count(*) filter (where lead_submission_status = 'accepted')::bigint
  from cohort
  where quiz_result in (
    'homecook-passer', 'eyeballing-master', 'ingredient-tracker', 'pro-measurer'
  )
  group by quiz_result
)
select
  cohort_type,
  cohort_value,
  sessions,
  beta_form_views,
  accepted_leads,
  accepted_leads::numeric / nullif(beta_form_views, 0) as beta_form_to_lead_rate
from segments
order by cohort_type, cohort_value;
