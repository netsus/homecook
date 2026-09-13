begin;

-- Preserve the original r2.1 answer meanings; select newer meanings by version.
create or replace function private.marketing_round2_answers(topic text, survey_version text, value jsonb) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp
as $$ select coalesce(case
 when survey_version = 'r2.1-' || topic then private.marketing_round2_answers(topic, value)
 when topic = 'homeflow' and survey_version = 'r2.2-homeflow' then
  private.marketing_round2_keys(value, array['q1','q2','q3','q4'])
  and jsonb_typeof(value->'q1') = 'string' and jsonb_typeof(value->'q2') = 'string'
  and jsonb_typeof(value->'q3') = 'string' and jsonb_typeof(value->'q4') = 'string'
  and value->>'q1' in ('none','one_two','three_four','five_seven')
  and value->>'q2' in ('none','once','two_three','four_plus')
  and value->>'q3' in ('spontaneous','mental','memo','scheduled')
  and value->>'q4' in ('planning','shopping','video','none')
 else false end, false) $$;

create or replace function private.marketing_round2_payload(topic text, action text, activity text, value jsonb) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp
as $$ select coalesce(case action
 when 'bootstrap' then activity = 'menu' and private.marketing_round2_attribution(topic,value)
 when 'activity_start' then activity in ('example','survey','lead') and value = '{}'::jsonb
 when 'example_complete' then activity = 'example' and value = '{}'::jsonb
 when 'survey_submit' then activity = 'survey' and private.marketing_round2_keys(value,array['survey_version','answers']) and jsonb_typeof(value->'survey_version') = 'string' and private.marketing_round2_answers(topic,value->>'survey_version',value->'answers')
 when 'lead_submit' then activity = 'lead' and value = '{}'::jsonb
 when 'menu_return' then activity = 'menu' and private.marketing_round2_keys(value,array['from_activity']) and jsonb_typeof(value->'from_activity') = 'string' and value->>'from_activity' in ('example','survey','lead')
 else false end, false) $$;

-- The original constraint has a generated name. Identify its exact responsibility
-- instead of assuming a PostgreSQL-generated suffix or dropping other checks.
do $$
declare
 old_name text;
 matches integer;
begin
 select count(*), min(conname::text) into matches, old_name
 from pg_catalog.pg_constraint
 where conrelid = 'public.marketing_round2_participations'::regclass
   and contype = 'c'
   and pg_catalog.pg_get_constraintdef(oid) like '%marketing_round2_answers%'
   and pg_catalog.pg_get_constraintdef(oid) like '%survey_version%';
 if matches <> 1 then raise exception 'ROUND2_SURVEY_CONSTRAINT_TARGET_MISMATCH'; end if;
 execute format('alter table public.marketing_round2_participations drop constraint %I', old_name);
end $$;

alter table public.marketing_round2_participations
 add constraint marketing_round2_participations_survey_version_answers_check
 check ((survey_submitted_at is null and survey_example_at_submit is null and survey_version is null and answers is null)
     or (survey_submitted_at is not null and survey_example_at_submit is not null and survey_version is not null and answers is not null and private.marketing_round2_answers(topic,survey_version,answers)));

alter function private.marketing_round2_answers(text,text,jsonb) owner to postgres;
revoke all on function private.marketing_round2_answers(text,text,jsonb) from public, anon, authenticated, service_role;
alter function private.marketing_round2_payload(text,text,text,jsonb) owner to postgres;
revoke all on function private.marketing_round2_payload(text,text,text,jsonb) from public, anon, authenticated, service_role;

commit;
