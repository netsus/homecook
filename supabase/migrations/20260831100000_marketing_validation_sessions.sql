begin;

create table public.marketing_validation_sessions (
  id uuid primary key,
  campaign_key text not null,
  creative_key text not null,
  audience_key text not null,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  attribution_status text not null
    check (attribution_status in ('paid_allowlisted', 'organic', 'unverified')),
  viewed_at timestamptz not null,
  quiz_started_at timestamptz,
  quiz_completed_at timestamptz,
  solution_viewed_at timestamptz,
  intent_choice text
    check (intent_choice in ('needed', 'enough')),
  intent_clicked_at timestamptz,
  quiz_result text check (
    quiz_result in (
      'ingredient_reentry',
      'rough_match',
      'split_tracking',
      'weekly_blindspot',
      'satisfied_control'
    )
  ),
  quiz_answers jsonb,
  target_qualified boolean,
  email text,
  consent_version text,
  consented_at timestamptz,
  turnstile_verified_at timestamptz,
  lead_submitted_at timestamptz,
  lead_submission_status text not null default 'none'
    check (lead_submission_status in ('none', 'accepted', 'duplicate')),
  planner_intent text
    check (planner_intent in ('definitely', 'maybe', 'not_needed')),
  planner_priority text
    check (
      planner_priority in (
        'daily_macros',
        'weekly_average',
        'meal_table',
        'plan_record_switch',
        'not_interested'
      )
    ),
  followup_submitted_at timestamptz,
  retention_until timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (utm_source is null or char_length(utm_source) <= 120),
  check (utm_medium is null or char_length(utm_medium) <= 120),
  check (utm_campaign is null or char_length(utm_campaign) <= 120),
  check (utm_content is null or char_length(utm_content) <= 120),
  check (utm_term is null or char_length(utm_term) <= 120),
  check (
    (
      quiz_completed_at is null
      and quiz_result is null
      and quiz_answers is null
      and target_qualified is null
    ) or (
      quiz_completed_at is not null
      and quiz_result is not null
      and quiz_answers is not null
      and target_qualified is not null
    )
  ),
  check (
    lead_submitted_at is null
    or intent_choice = 'needed'
  ),
  check (
    lead_submission_status = 'none'
    or (
      lead_submission_status in ('accepted', 'duplicate')
      and lead_submitted_at is not null
      and consent_version is not null
      and consented_at is not null
      and turnstile_verified_at is not null
      and (
        (lead_submission_status = 'accepted' and email is not null)
        or (lead_submission_status = 'duplicate' and email is null)
      )
    )
  ),
  check (
    lead_submission_status <> 'none'
    or (
      lead_submitted_at is null
      and email is null
      and consent_version is null
      and consented_at is null
      and turnstile_verified_at is null
    )
  ),
  check (quiz_started_at is null or quiz_started_at >= viewed_at),
  check (
    quiz_completed_at is null
    or (quiz_started_at is not null and quiz_completed_at >= quiz_started_at)
  ),
  check (
    solution_viewed_at is null
    or (quiz_completed_at is not null and solution_viewed_at >= quiz_completed_at)
  ),
  check (
    intent_clicked_at is null
    or (solution_viewed_at is not null and intent_clicked_at >= solution_viewed_at)
  ),
  check (
    lead_submitted_at is null
    or (intent_clicked_at is not null and lead_submitted_at >= intent_clicked_at)
  ),
  check (
    followup_submitted_at is null
    or (lead_submitted_at is not null and followup_submitted_at >= lead_submitted_at)
  )
);

create unique index marketing_validation_sessions_email_unique_idx
  on public.marketing_validation_sessions (lower(email))
  where email is not null;

create index marketing_validation_sessions_campaign_creative_created_idx
  on public.marketing_validation_sessions (
    campaign_key,
    creative_key,
    created_at desc
  );

alter table public.marketing_validation_sessions enable row level security;
alter table public.marketing_validation_sessions force row level security;

revoke all on table public.marketing_validation_sessions
  from public, anon, authenticated, service_role;
grant all privileges on public.marketing_validation_sessions to service_role;

create policy marketing_validation_sessions_service_role_access
  on public.marketing_validation_sessions
  for all
  to service_role
  using (true)
  with check (true);

create or replace function private.verify_full_local_internal_scope()
returns void
language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_headers jsonb := coalesce(
    nullif(current_setting('request.headers', true), ''),
    '{}'
  )::jsonb;
  v_scope text := v_headers ->> 'x-homecook-internal-scope';
  v_method text := upper(coalesce(current_setting('request.method', true), ''));
  v_path text := coalesce(current_setting('request.path', true), '');
begin
  if v_scope = 'marketing-validation'
    and v_method in ('GET', 'POST', 'PATCH')
    and v_path = '/marketing_validation_sessions' then
    return;
  end if;

  if v_scope = 'snapshot-v2-session'
    and v_method = 'POST'
    and v_path in (
      '/rpc/complete_cooking_session',
      '/rpc/complete_standalone_cooking'
    ) then
    return;
  end if;

  perform private.verify_full_local_internal_scope_pre_legacy_compat();
end;
$function$;

alter function private.verify_full_local_internal_scope() owner to postgres;

revoke all on function private.verify_full_local_internal_scope()
  from public, anon, authenticated, service_role;

commit;
