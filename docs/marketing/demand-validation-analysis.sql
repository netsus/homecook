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
  where campaign_key = 'weekly_nutrition_2026'
    and creative_key = 'mumeok_funnel_prototype_v2'
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
variants as (
  select variant
  from (values ('a'), ('b'), ('c'), ('d'), ('default')) as variants(variant)
),
cohort as (
  select
    coalesce(ad_variant, 'default') as ad_variant,
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
  where campaign_key = 'weekly_nutrition_2026'
    and creative_key = 'mumeok_funnel_prototype_v2'
    and viewed_at >= params.campaign_start
    and viewed_at < params.campaign_end
),
ad_variant_stage_counts as (
  select
    variants.variant as ad_variant,
    coalesce(stage_counts.landing_view, 0)::bigint as landing_view,
    coalesce(stage_counts.quiz_start, 0)::bigint as quiz_start,
    coalesce(stage_counts.quiz_complete, 0)::bigint as quiz_complete,
    coalesce(stage_counts.result_view, 0)::bigint as result_view,
    coalesce(stage_counts.experience_start, 0)::bigint as experience_start,
    coalesce(stage_counts.experience_complete, 0)::bigint as experience_complete,
    coalesce(stage_counts.beta_form_view, 0)::bigint as beta_form_view,
    coalesce(stage_counts.accepted_lead, 0)::bigint as accepted_lead,
    coalesce(stage_counts.duplicate_submission, 0)::bigint as duplicate_submission
  from variants
  left join (
    select
      ad_variant,
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
    group by ad_variant
  ) as stage_counts on stage_counts.ad_variant = variants.variant
),
ad_variant_funnel as (
  select ad_variant, 'landing_view'::text as metric, landing_view as numerator, landing_view as denominator from ad_variant_stage_counts
  union all select ad_variant, 'quiz_start', quiz_start, landing_view from ad_variant_stage_counts
  union all select ad_variant, 'quiz_complete', quiz_complete, quiz_start from ad_variant_stage_counts
  union all select ad_variant, 'result_view', result_view, quiz_complete from ad_variant_stage_counts
  union all select ad_variant, 'experience_start', experience_start, result_view from ad_variant_stage_counts
  union all select ad_variant, 'experience_complete', experience_complete, experience_start from ad_variant_stage_counts
  union all select ad_variant, 'beta_form_view', beta_form_view, experience_complete from ad_variant_stage_counts
  union all select ad_variant, 'accepted_lead', accepted_lead, beta_form_view from ad_variant_stage_counts
  union all select ad_variant, 'duplicate_submission', duplicate_submission, beta_form_view from ad_variant_stage_counts
)
select
  'ad_variant_funnel'::text as cohort_type,
  ad_variant as cohort_value,
  metric,
  numerator,
  denominator,
  numerator::numeric / nullif(denominator, 0) as rate
from ad_variant_funnel
order by cohort_value, metric;

with params as (
  select
    :'campaign_start'::timestamptz as campaign_start,
    :'campaign_end'::timestamptz as campaign_end
),
variants as (
  select variant
  from (values ('a'), ('b'), ('c'), ('d'), ('default')) as variants(variant)
),
results as (
  select result_key
  from (
    values
      ('homecook-passer'),
      ('eyeballing-master'),
      ('ingredient-tracker'),
      ('pro-measurer')
  ) as results(result_key)
),
cohort as (
  select
    coalesce(ad_variant, 'default') as ad_variant,
    quiz_result,
    beta_form_viewed_at,
    lead_submitted_at,
    lead_submission_status
  from public.marketing_validation_sessions, params
  where campaign_key = 'weekly_nutrition_2026'
    and creative_key = 'mumeok_funnel_prototype_v2'
    and viewed_at >= params.campaign_start
    and viewed_at < params.campaign_end
),
segments as (
  select
    'ad_variant'::text as cohort_type,
    variants.variant as cohort_value,
    coalesce(segment_counts.sessions, 0)::bigint as sessions,
    coalesce(segment_counts.beta_form_views, 0)::bigint as beta_form_views,
    coalesce(segment_counts.accepted_leads, 0)::bigint as accepted_leads,
    coalesce(segment_counts.duplicate_submissions, 0)::bigint as duplicate_submissions
  from variants
  left join (
    select
      ad_variant,
      count(*)::bigint as sessions,
      count(*) filter (where beta_form_viewed_at is not null)::bigint as beta_form_views,
      count(*) filter (
        where lead_submission_status = 'accepted' and lead_submitted_at is not null
      )::bigint as accepted_leads,
      count(*) filter (
        where lead_submission_status = 'duplicate' and lead_submitted_at is not null
      )::bigint as duplicate_submissions
    from cohort
    group by ad_variant
  ) as segment_counts on segment_counts.ad_variant = variants.variant
  union all
  select
    'quiz_result',
    results.result_key,
    coalesce(segment_counts.sessions, 0)::bigint,
    coalesce(segment_counts.beta_form_views, 0)::bigint,
    coalesce(segment_counts.accepted_leads, 0)::bigint,
    coalesce(segment_counts.duplicate_submissions, 0)::bigint
  from results
  left join (
    select
      quiz_result,
      count(*)::bigint as sessions,
      count(*) filter (where beta_form_viewed_at is not null)::bigint as beta_form_views,
      count(*) filter (
        where lead_submission_status = 'accepted' and lead_submitted_at is not null
      )::bigint as accepted_leads,
      count(*) filter (
        where lead_submission_status = 'duplicate' and lead_submitted_at is not null
      )::bigint as duplicate_submissions
    from cohort
    where quiz_result in (
      'homecook-passer', 'eyeballing-master', 'ingredient-tracker', 'pro-measurer'
    )
    group by quiz_result
  ) as segment_counts on segment_counts.quiz_result = results.result_key
)
select
  cohort_type,
  cohort_value,
  sessions,
  beta_form_views,
  accepted_leads,
  duplicate_submissions,
  accepted_leads::numeric / nullif(beta_form_views, 0) as beta_form_to_lead_rate
from segments
order by cohort_type, cohort_value;

with params as (
  select
    :'campaign_start'::timestamptz as campaign_start,
    :'campaign_end'::timestamptz as campaign_end
),
question_options as (
  select question_key, answer_key
  from (
    values
      ('q1', 'daily'),
      ('q1', '3_5'),
      ('q1', '1_2'),
      ('q1', 'none'),
      ('q2', 'none'),
      ('q2', '1_2'),
      ('q2', '3_5'),
      ('q2', '6_plus'),
      ('q3', 'pass'),
      ('q3', 'eyeball'),
      ('q3', 'track'),
      ('q3', 'measure'),
      ('q4', 'ingredients'),
      ('q4', 'weight'),
      ('q4', 'search'),
      ('q4', 'none')
  ) as question_options(question_key, answer_key)
),
cohort as (
  select
    quiz_answers ->> 'q1' as q1,
    quiz_answers ->> 'q2' as q2,
    quiz_answers ->> 'q3' as q3,
    quiz_answers ->> 'q4' as q4
  from public.marketing_validation_sessions, params
  where campaign_key = 'weekly_nutrition_2026'
    and creative_key = 'mumeok_funnel_prototype_v2'
    and viewed_at >= params.campaign_start
    and viewed_at < params.campaign_end
    and quiz_completed_at is not null
),
question_totals as (
  select
    count(q1)::bigint as q1_total,
    count(q2)::bigint as q2_total,
    count(q3)::bigint as q3_total,
    count(q4)::bigint as q4_total
  from cohort
),
question_distribution as (
  select
    question_options.question_key,
    question_options.answer_key,
    coalesce(distribution.responses, 0)::bigint as responses,
    case question_options.question_key
      when 'q1' then question_totals.q1_total
      when 'q2' then question_totals.q2_total
      when 'q3' then question_totals.q3_total
      when 'q4' then question_totals.q4_total
    end::bigint as total_responses
  from question_options
  cross join question_totals
  left join (
    select 'q1'::text as question_key, q1 as answer_key, count(*)::bigint as responses
    from cohort
    where q1 in ('daily', '3_5', '1_2', 'none')
    group by q1
    union all
    select 'q2', q2, count(*)::bigint
    from cohort
    where q2 in ('none', '1_2', '3_5', '6_plus')
    group by q2
    union all
    select 'q3', q3, count(*)::bigint
    from cohort
    where q3 in ('pass', 'eyeball', 'track', 'measure')
    group by q3
    union all
    select 'q4', q4, count(*)::bigint
    from cohort
    where q4 in ('ingredients', 'weight', 'search', 'none')
    group by q4
  ) as distribution
    on distribution.question_key = question_options.question_key
   and distribution.answer_key = question_options.answer_key
)
select
  question_key,
  answer_key,
  responses,
  total_responses,
  responses::numeric / nullif(total_responses, 0) as question_response_share
from question_distribution
order by question_key, answer_key;
