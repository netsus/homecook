begin;

-- This is a new namespace, never an overwrite of an existing deployment.
do $$ begin
 if exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('private','public') and p.proname like 'marketing_round2_%')
   or exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname in ('marketing_round2_participations','marketing_round2_events','marketing_round2_lead_requests')) then
  raise exception 'ROUND2_MIGRATION_TARGET_EXISTS';
 end if;
end $$;

-- Private predicates keep the JSON CHECKs and the authenticated RPC aligned.
create or replace function private.marketing_round2_keys(value jsonb, keys text[]) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp
as $$ select coalesce(jsonb_typeof(value) = 'object' and value ?& keys and (value - keys) = '{}'::jsonb, false) $$;

create or replace function private.marketing_round2_answers(topic text, value jsonb) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp
as $$ select coalesce(
  private.marketing_round2_keys(value, array['q1','q2','q3','q4'])
  and jsonb_typeof(value->'q1') = 'string' and jsonb_typeof(value->'q2') = 'string'
  and jsonb_typeof(value->'q3') = 'string' and jsonb_typeof(value->'q4') = 'string'
  and value->>'q1' in ('none','one_two','three_five','six_plus')
  and value->>'q4' in ('yes','maybe','no','unsure')
  and ((topic = 'recording' and value->>'q2' in ('no_record','photo_memo','search_app','ingredient_entry','reuse_saved','other')
        and value->>'q3' in ('reuse_recipe','portion_nutrition','record_history','none'))
    or (topic = 'homeflow' and value->>'q2' in ('on_the_day','memo_list','separate_apps','shared_plan','not_managing','other')
        and value->>'q3' in ('meal_plan','combined_shopping','pantry_exclusion','leftover_management','none'))), false) $$;

create or replace function private.marketing_round2_attribution(topic text, value jsonb) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp
as $$ select coalesce(
  private.marketing_round2_keys(value, array['first_channel','utm_source','utm_medium','utm_campaign','utm_content'])
  and jsonb_typeof(value->'first_channel') = 'string'
  and value->>'first_channel' in ('direct','ad_tagged','profile_tagged','shared','unknown')
  and (value->'utm_source' = 'null'::jsonb or (jsonb_typeof(value->'utm_source') = 'string' and value->>'utm_source' in ('instagram','facebook')))
  and (value->'utm_medium' = 'null'::jsonb or (jsonb_typeof(value->'utm_medium') = 'string' and value->>'utm_medium' in ('paid_social','social_profile','share')))
  and (value->'utm_campaign' = 'null'::jsonb or (jsonb_typeof(value->'utm_campaign') = 'string' and value->>'utm_campaign' = 'mumeok_r2'))
  and (value->'utm_content' = 'null'::jsonb or (jsonb_typeof(value->'utm_content') = 'string' and value->>'utm_content' in ('video_recording_v2','video_homeflow_v1','profile_link')))
  and case value->>'first_channel'
    when 'direct' then value->'utm_source' = 'null'::jsonb and value->'utm_medium' = 'null'::jsonb and value->'utm_campaign' = 'null'::jsonb and value->'utm_content' = 'null'::jsonb
    when 'ad_tagged' then value->>'utm_source' in ('instagram','facebook') and value->>'utm_medium' = 'paid_social' and value->>'utm_campaign' = 'mumeok_r2' and value->>'utm_content' = case topic when 'recording' then 'video_recording_v2' when 'homeflow' then 'video_homeflow_v1' end
    when 'profile_tagged' then value->>'utm_source' in ('instagram','facebook') and value->>'utm_medium' = 'social_profile' and value->>'utm_content' = 'profile_link'
    when 'shared' then value->>'utm_medium' = 'share'
    else true end, false) $$;

create or replace function private.marketing_round2_email(value text) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp
as $$ select coalesce(
  length(value) between 3 and 254 and octet_length(value) = length(value)
  and value = lower(value collate "C") and value = btrim(value, E' \t\r\n')
  and length(split_part(value,'@',1)) between 1 and 64
  and length(split_part(value,'@',2)) between 1 and 253
  and value ~ '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
  and split_part(value,'@',1) not like '.%' and split_part(value,'@',1) not like '%.'
  and position('..' in split_part(value,'@',1)) = 0, false) $$;

create or replace function private.marketing_round2_payload(topic text, action text, activity text, value jsonb) returns boolean
language sql immutable set search_path = pg_catalog, pg_temp
as $$ select coalesce(case action
 when 'bootstrap' then activity = 'menu' and private.marketing_round2_attribution(topic,value)
 when 'activity_start' then activity in ('example','survey','lead') and value = '{}'::jsonb
 when 'example_complete' then activity = 'example' and value = '{}'::jsonb
 when 'survey_submit' then activity = 'survey' and private.marketing_round2_keys(value,array['survey_version','answers']) and jsonb_typeof(value->'survey_version') = 'string' and value->>'survey_version' = 'r2.1-' || topic and private.marketing_round2_answers(topic,value->'answers')
 when 'lead_submit' then activity = 'lead' and value = '{}'::jsonb
 when 'menu_return' then activity = 'menu' and private.marketing_round2_keys(value,array['from_activity']) and jsonb_typeof(value->'from_activity') = 'string' and value->>'from_activity' in ('example','survey','lead')
 else false end, false) $$;

create table public.marketing_round2_participations (
 id uuid primary key default gen_random_uuid(),
 round_version text not null default 'r2.1' check (round_version = 'r2.1'),
 topic text not null check (topic in ('recording','homeflow')),
 bootstrap_digest bytea not null check (octet_length(bootstrap_digest) = 32),
 first_channel text not null,
 utm_source text, utm_medium text, utm_campaign text, utm_content text,
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 purge_after timestamptz not null default '2026-11-30 15:00:00+00' check (purge_after = '2026-11-30 15:00:00+00'),
 revision integer not null default 1 check (revision >= 1),
 example_started_at timestamptz, example_completed_at timestamptz,
 survey_started_at timestamptz, survey_example_at_start text,
 survey_submitted_at timestamptz, survey_example_at_submit text,
 survey_version text, answers jsonb,
 lead_started_at timestamptz, lead_completed_at timestamptz,
 constraint marketing_round2_participations_bootstrap_key unique (round_version,topic,bootstrap_digest),
 constraint marketing_round2_participations_identity_key unique (id,round_version,topic),
 check (created_at >= '2026-09-10 15:00:00+00' and created_at < '2026-10-31 15:00:00+00'),
 check (expires_at = least(created_at + interval '30 days',timestamptz '2026-10-31 15:00:00+00') and expires_at > created_at and purge_after > expires_at),
 check (private.marketing_round2_attribution(topic,jsonb_build_object('first_channel',first_channel,'utm_source',utm_source,'utm_medium',utm_medium,'utm_campaign',utm_campaign,'utm_content',utm_content))),
 check (example_started_at is null or (created_at <= example_started_at and example_started_at < expires_at)),
 check (survey_started_at is null or (created_at <= survey_started_at and survey_started_at < expires_at)),
 check (lead_started_at is null or (created_at <= lead_started_at and lead_started_at < expires_at)),
 check (example_completed_at is null or (example_started_at is not null and example_started_at <= example_completed_at and example_completed_at < expires_at)),
 check (survey_submitted_at is null or (survey_started_at is not null and survey_started_at <= survey_submitted_at and survey_submitted_at < expires_at)),
 check (lead_completed_at is null or (lead_started_at is not null and lead_started_at <= lead_completed_at and lead_completed_at < expires_at)),
 check ((survey_started_at is null) = (survey_example_at_start is null)),
 check (survey_example_at_start is null or survey_example_at_start in ('not_started','started','completed')),
 check (survey_example_at_submit is null or survey_example_at_submit in ('not_started','started','completed')),
 check ((survey_submitted_at is null and survey_example_at_submit is null and survey_version is null and answers is null)
     or (survey_submitted_at is not null and survey_example_at_submit is not null and survey_version is not null and answers is not null and survey_version = 'r2.1-' || topic and private.marketing_round2_answers(topic,answers)))
);
create index marketing_round2_participations_cohort_idx on public.marketing_round2_participations(round_version,topic,first_channel,created_at,id);
create index marketing_round2_participations_purge_idx on public.marketing_round2_participations(purge_after,id);

create table public.marketing_round2_events (
 event_id uuid primary key check (event_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
 participation_id uuid not null references public.marketing_round2_participations(id) on delete cascade,
 action text not null check (action in ('bootstrap','activity_start','example_complete','survey_submit','lead_submit','menu_return')),
 activity text not null check (activity in ('menu','example','survey','lead')),
 payload jsonb not null default '{}'::jsonb,
 payload_digest bytea not null check (octet_length(payload_digest) = 32),
 applied boolean not null,
 revision integer not null check (revision >= 1),
 example_state_at_event text not null check (example_state_at_event in ('not_started','started','completed')),
 recorded_at timestamptz not null default clock_timestamp(),
 check (action <> 'menu_return' or not applied),
 check (private.marketing_round2_payload('recording',action,activity,payload) or private.marketing_round2_payload('homeflow',action,activity,payload))
);
create index marketing_round2_events_participation_idx on public.marketing_round2_events(participation_id,recorded_at,event_id);
create unique index marketing_round2_events_first_apply_key on public.marketing_round2_events(participation_id,action,activity) where applied and action <> 'menu_return';

create table public.marketing_round2_lead_requests (
 request_id uuid primary key references public.marketing_round2_events(event_id) on delete cascade,
 participation_id uuid not null unique,
 round_version text not null default 'r2.1' check (round_version = 'r2.1'),
 topic text not null check (topic in ('recording','homeflow')),
 email_key bytea not null check (octet_length(email_key) = 32),
 email_normalized text,
 topic_status text not null check (topic_status in ('new_topic','repeat_topic')),
 contact_observation text not null check (contact_observation in ('existing_legacy','existing_round2','new_observed')),
 consent_version text not null check (consent_version = 'mumeok-r2-beta-notice-20260911'),
 purpose text not null check (purpose = 'beta_open_notice'),
 consent_generation integer not null check (consent_generation between 1 and 2147483647),
 consented_at timestamptz not null,
 turnstile_verified_at timestamptz not null,
 request_digest bytea not null check (octet_length(request_digest) = 32),
 created_at timestamptz not null default clock_timestamp(),
 purge_after timestamptz not null default '2026-11-30 15:00:00+00' check (purge_after = '2026-11-30 15:00:00+00'),
 foreign key (participation_id,round_version,topic) references public.marketing_round2_participations(id,round_version,topic) on delete cascade,
 check ((topic_status = 'new_topic' and email_normalized is not null) or (topic_status = 'repeat_topic' and email_normalized is null)),
 check (email_normalized is null or private.marketing_round2_email(email_normalized)),
 check (consented_at = created_at and turnstile_verified_at <= created_at and turnstile_verified_at >= created_at - interval '5 minutes' and created_at < purge_after)
);
create unique index marketing_round2_lead_requests_topic_email_key on public.marketing_round2_lead_requests(round_version,topic,email_key) where topic_status = 'new_topic';
create index marketing_round2_lead_requests_email_idx on public.marketing_round2_lead_requests(email_key,created_at,request_id);
create index marketing_round2_lead_requests_purge_idx on public.marketing_round2_lead_requests(purge_after,request_id);

alter table public.marketing_round2_participations enable row level security;
alter table public.marketing_round2_participations force row level security;
alter table public.marketing_round2_events enable row level security;
alter table public.marketing_round2_events force row level security;
alter table public.marketing_round2_lead_requests enable row level security;
alter table public.marketing_round2_lead_requests force row level security;
revoke all on public.marketing_round2_participations, public.marketing_round2_events, public.marketing_round2_lead_requests from public, anon, authenticated, service_role;

create or replace function private.marketing_round2_state(started timestamptz, completed timestamptz) returns text
language sql immutable set search_path = pg_catalog, pg_temp
as $$ select case when completed is not null then 'completed' when started is not null then 'started' else 'not_started' end $$;

create or replace function private.marketing_round2_digest_equal(a bytea, b bytea) returns boolean
language plpgsql immutable set search_path = pg_catalog, pg_temp
as $$ declare difference integer := 0; i integer;
begin
 if a is null or b is null or octet_length(a) <> 32 or octet_length(b) <> 32 then return false; end if;
 for i in 0..31 loop difference := difference | (get_byte(a,i) # get_byte(b,i)); end loop;
 return difference = 0;
end $$;

create or replace function private.marketing_round2_check_consistency() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
 p public.marketing_round2_participations%rowtype;
 parent_id uuid; candidate_ids uuid[]; old_json jsonb; new_json jsonb;
 deadline timestamptz; now_at timestamptz;
begin
 if TG_OP <> 'INSERT' then old_json := to_jsonb(OLD); end if;
 if TG_OP <> 'DELETE' then new_json := to_jsonb(NEW); end if;
 if TG_TABLE_NAME = 'marketing_round2_participations' then
  candidate_ids := array[(old_json->>'id')::uuid,(new_json->>'id')::uuid];
 else
  candidate_ids := array[(old_json->>'participation_id')::uuid,(new_json->>'participation_id')::uuid];
 end if;
 for parent_id in select distinct unnest(candidate_ids) loop
  if parent_id is null then continue; end if;
  select * into p from public.marketing_round2_participations where id = parent_id;
  if not found then
   if exists(select 1 from public.marketing_round2_events where participation_id = parent_id)
     or exists(select 1 from public.marketing_round2_lead_requests where participation_id = parent_id) then
    raise exception using errcode = '23514', message = 'ROUND2_CONSISTENCY';
   end if;
   continue; -- Authorized maintenance deleted the entire parent; no web deadline applies.
  end if;
  deadline := nullif(current_setting('homecook.r2_valid_until',true),'')::timestamptz;
  now_at := clock_timestamp();
  if deadline is null or now_at >= deadline then raise exception using errcode = 'PT503', message = 'ROUND2_UNAVAILABLE'; end if;
  if now_at >= timestamptz '2026-10-31 15:00:00+00' then raise exception using errcode = 'PT410', message = 'CAMPAIGN_ENDED'; end if;
  if now_at >= p.expires_at then raise exception using errcode = 'PT410', message = 'PARTICIPATION_EXPIRED'; end if;
  if (select count(*) from public.marketing_round2_events where participation_id=p.id and applied) <> p.revision
   or (select count(*) from public.marketing_round2_events where participation_id=p.id and action='bootstrap' and applied and recorded_at=p.created_at) <> 1
   or exists(select 1 from public.marketing_round2_events e where e.participation_id=p.id and
     (e.recorded_at < p.created_at or e.recorded_at >= p.expires_at or e.revision > p.revision
      or not private.marketing_round2_payload(p.topic,e.action,e.activity,e.payload)))
   or exists (
     select 1 from (values
       ('activity_start','example',p.example_started_at),('example_complete','example',p.example_completed_at),
       ('activity_start','survey',p.survey_started_at),('survey_submit','survey',p.survey_submitted_at),
       ('activity_start','lead',p.lead_started_at),('lead_submit','lead',p.lead_completed_at)
     ) as expected(action,activity,recorded_at)
     where (select count(*) from public.marketing_round2_events e where e.participation_id=p.id and e.applied and e.action=expected.action and e.activity=expected.activity) <> (case when expected.recorded_at is null then 0 else 1 end)
       or (expected.recorded_at is not null and not exists(select 1 from public.marketing_round2_events e where e.participation_id=p.id and e.applied and e.action=expected.action and e.activity=expected.activity and e.recorded_at=expected.recorded_at))
   )
   or exists(select 1 from public.marketing_round2_events e where e.participation_id=p.id and e.applied and
      ((e.action='bootstrap' and e.payload <> jsonb_build_object('first_channel',p.first_channel,'utm_source',p.utm_source,'utm_medium',p.utm_medium,'utm_campaign',p.utm_campaign,'utm_content',p.utm_content))
       or (e.action='activity_start' and e.activity='survey' and e.example_state_at_event <> p.survey_example_at_start)
       or (e.action='survey_submit' and (e.payload <> jsonb_build_object('survey_version',p.survey_version,'answers',p.answers) or e.example_state_at_event <> p.survey_example_at_submit))))
   or (select count(*) from public.marketing_round2_lead_requests where participation_id=p.id) <> (case when p.lead_completed_at is null then 0 else 1 end)
   or exists(select 1 from public.marketing_round2_lead_requests l left join public.marketing_round2_events e on e.event_id=l.request_id
      where l.participation_id=p.id and (l.created_at is distinct from p.lead_completed_at or l.topic<>p.topic or l.round_version<>p.round_version or e.participation_id is distinct from p.id or e.action is distinct from 'lead_submit' or e.applied is distinct from true or e.recorded_at is distinct from l.created_at)) then
   raise exception using errcode = '23514', message = 'ROUND2_CONSISTENCY';
  end if;
  if TG_TABLE_NAME = 'marketing_round2_lead_requests' and TG_OP='INSERT'
    and now_at > (new_json->>'turnstile_verified_at')::timestamptz + interval '300 seconds' then
   raise exception using errcode = 'PT422', message = 'TURNSTILE_FAILED';
  end if;
 end loop;
 return null;
end $$;
create constraint trigger marketing_round2_consistency after insert or update or delete on public.marketing_round2_participations deferrable initially deferred for each row execute function private.marketing_round2_check_consistency();
create constraint trigger marketing_round2_consistency after insert or update or delete on public.marketing_round2_events deferrable initially deferred for each row execute function private.marketing_round2_check_consistency();
create constraint trigger marketing_round2_consistency after insert or update or delete on public.marketing_round2_lead_requests deferrable initially deferred for each row execute function private.marketing_round2_check_consistency();

create or replace function public.marketing_round2_apply(p_command jsonb) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, pg_temp
set statement_timeout = '8s'
set lock_timeout = '2s'
as $$
#variable_conflict use_variable
declare
 p public.marketing_round2_participations%rowtype;
 cookie_row public.marketing_round2_participations%rowtype;
 e public.marketing_round2_events%rowtype;
 l public.marketing_round2_lead_requests%rowtype;
 op text := p_command->>'op'; action text := p_command->>'action'; topic text := p_command->>'topic';
 activity text := p_command->>'activity'; intent text := p_command->>'bootstrap_intent';
 event_id uuid; cookie_pid uuid; bootstrap_digest bytea; payload_digest bytea;
 payload jsonb := p_command->'payload'; lead jsonb := p_command->'lead'; control jsonb := p_command->'control';
 generation integer; checked_at timestamptz; valid_until timestamptz; verified_at timestamptz;
 write_at timestamptz; final_at timestamptz; applied boolean := false; replay boolean := false; is_new boolean := false;
 state text; result_data jsonb; bootstrap jsonb; cookie_claims jsonb; receipt uuid;
 email_key bytea; request_digest bytea; email text; existing_topic boolean; observation text; constraint_name text; key text;
begin
 if coalesce((nullif(current_setting('request.jwt.claims',true),'')::jsonb)->>'role','') <> 'service_role'
   or current_setting('role',true) <> 'service_role'
   or coalesce((nullif(current_setting('request.headers',true),'')::jsonb)->>'x-homecook-internal-scope','') <> 'marketing-round2'
   or coalesce(current_setting('request.method',true),'') <> 'POST'
   or coalesce(current_setting('request.path',true),'') <> '/rpc/marketing_round2_apply' then
  raise exception using errcode='PT403', message='INTERNAL_SCOPE_DENIED';
 end if;
 if not private.marketing_round2_keys(p_command,array['op','action','event_id','topic','round_version','participation_id','bootstrap_intent','bootstrap_digest','activity','payload','payload_digest','lead','control']) then
  raise exception using errcode='PT422', message='VALIDATION_ERROR';
 end if;
 foreach key in array array['op','action','event_id','topic','round_version','activity'] loop
  if jsonb_typeof(p_command->key) <> 'string' then raise exception using errcode='PT422',message='VALIDATION_ERROR'; end if;
 end loop;
 foreach key in array array['participation_id','bootstrap_intent','bootstrap_digest','payload_digest'] loop
  if jsonb_typeof(p_command->key) not in ('string','null') then raise exception using errcode='PT422',message='VALIDATION_ERROR'; end if;
 end loop;
 if coalesce(op not in ('inspect','apply') or topic not in ('recording','homeflow') or p_command->>'round_version' <> 'r2.1'
  or p_command->>'event_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  or (p_command->>'participation_id' is not null and p_command->>'participation_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  or not ((action='bootstrap' and intent in ('create_or_resume','resume') and p_command->>'bootstrap_digest' ~ '^[0-9a-f]{64}$')
       or (action='bootstrap' and intent='cookie_resume' and p_command->'bootstrap_digest'='null'::jsonb and p_command->>'participation_id' is not null)
       or (action<>'bootstrap' and intent is null and p_command->'bootstrap_digest'='null'::jsonb and p_command->>'participation_id' is not null))
  or not ((op='inspect' and action='bootstrap' and intent='cookie_resume' and activity='menu' and payload='{}'::jsonb and p_command->'payload_digest'='null'::jsonb)
       or (p_command->>'payload_digest' ~ '^[0-9a-f]{64}$' and private.marketing_round2_payload(topic,action,activity,payload))),true) then
  raise exception using errcode='PT422',message='VALIDATION_ERROR';
 end if;
 if not private.marketing_round2_keys(control,array['collection_enabled','lead_enabled','consent_generation','checked_at','valid_until'])
   or jsonb_typeof(control->'collection_enabled') <> 'boolean' or jsonb_typeof(control->'lead_enabled') <> 'boolean'
   or jsonb_typeof(control->'consent_generation') <> 'number' or control->>'consent_generation' !~ '^[1-9][0-9]{0,9}$'
   or (control->>'consent_generation')::numeric > 2147483647
   or jsonb_typeof(control->'checked_at') <> 'string' or jsonb_typeof(control->'valid_until') <> 'string'
   or control->>'checked_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$'
   or control->>'valid_until' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$' then
  raise exception using errcode='PT422',message='VALIDATION_ERROR';
 end if;
 begin
  checked_at := (control->>'checked_at')::timestamptz; valid_until := (control->>'valid_until')::timestamptz;
 exception when datetime_field_overflow or invalid_datetime_format then raise exception using errcode='PT422',message='VALIDATION_ERROR'; end;
 generation := (control->>'consent_generation')::integer;
 write_at := clock_timestamp();
 if write_at >= timestamptz '2026-10-31 15:00:00+00' then raise exception using errcode='PT410',message='CAMPAIGN_ENDED'; end if;
 if write_at < timestamptz '2026-09-10 15:00:00+00' or control->'collection_enabled'<>'true'::jsonb then raise exception using errcode='PT503',message='ROUND2_DISABLED'; end if;
 if valid_until <> least(checked_at + interval '10 seconds',timestamptz '2026-10-31 15:00:00+00') or checked_at > write_at + interval '30 seconds' or valid_until <= write_at then raise exception using errcode='PT503',message='ROUND2_UNAVAILABLE'; end if;
 if action='lead_submit' then
  if control->'lead_enabled'<>'true'::jsonb then raise exception using errcode='PT503',message='LEAD_CAPTURE_NOT_READY'; end if;
  if not private.marketing_round2_keys(lead,array['email_normalized','email_key','request_digest','consent_version','purpose','consent_generation','turnstile_verified_at']) then raise exception using errcode='PT422',message='VALIDATION_ERROR'; end if;
  foreach key in array array['email_normalized','email_key','request_digest','consent_version','purpose'] loop
   if jsonb_typeof(lead->key) <> 'string' then raise exception using errcode='PT422',message='VALIDATION_ERROR'; end if;
  end loop;
  if not private.marketing_round2_email(lead->>'email_normalized') or lead->>'email_key' !~ '^[0-9a-f]{64}$' or lead->>'request_digest' !~ '^[0-9a-f]{64}$'
   or lead->>'consent_version'<>'mumeok-r2-beta-notice-20260911' or lead->>'purpose'<>'beta_open_notice'
   or jsonb_typeof(lead->'consent_generation') <> 'number' or lead->>'consent_generation' !~ '^[1-9][0-9]{0,9}$' or (lead->>'consent_generation')::numeric > 2147483647
   or jsonb_typeof(lead->'turnstile_verified_at') not in ('null','string')
   or (op='inspect' and lead->'turnstile_verified_at'<>'null'::jsonb) then raise exception using errcode='PT422',message='VALIDATION_ERROR'; end if;
  if (lead->>'consent_generation')::integer <> generation then raise exception using errcode='PT409',message='CONSENT_REFRESH_REQUIRED'; end if;
  email := lead->>'email_normalized'; email_key:=decode(lead->>'email_key','hex'); request_digest:=decode(lead->>'request_digest','hex');
  if lead->>'turnstile_verified_at' is not null then
   if lead->>'turnstile_verified_at' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?Z$' then raise exception using errcode='PT422',message='VALIDATION_ERROR'; end if;
   begin verified_at:=(lead->>'turnstile_verified_at')::timestamptz;
   exception when datetime_field_overflow or invalid_datetime_format then raise exception using errcode='PT422',message='VALIDATION_ERROR'; end;
  end if;
 elsif lead<>'null'::jsonb then raise exception using errcode='PT422',message='VALIDATION_ERROR';
 end if;
 event_id:=(p_command->>'event_id')::uuid; cookie_pid:=(p_command->>'participation_id')::uuid;
 bootstrap_digest:=decode(p_command->>'bootstrap_digest','hex'); payload_digest:=decode(p_command->>'payload_digest','hex');
 if action='bootstrap' and intent<>'cookie_resume' and cookie_pid is not null then
  select * into cookie_row from public.marketing_round2_participations where id=cookie_pid;
  if cookie_row.id is null or clock_timestamp()>=cookie_row.expires_at then raise exception using errcode='PT410',message='PARTICIPATION_EXPIRED'; end if;
  if cookie_row.topic<>topic or cookie_row.round_version<>'r2.1' then raise exception using errcode='PT409',message='BOOTSTRAP_CONFLICT'; end if;
 end if;
 if action='bootstrap' and intent<>'cookie_resume' then
  if op='apply' then
   perform pg_advisory_xact_lock(hashtextextended('marketing-round2-bootstrap:' || topic || ':' || (p_command->>'bootstrap_digest'),0));
   select * into p from public.marketing_round2_participations r where r.round_version='r2.1' and r.topic=topic and r.bootstrap_digest=bootstrap_digest for update;
  else
   select * into p from public.marketing_round2_participations r where r.round_version='r2.1' and r.topic=topic and r.bootstrap_digest=bootstrap_digest;
  end if;
  if p.id is null and intent='resume' then raise exception using errcode='PT410',message='PARTICIPATION_EXPIRED'; end if;
  if cookie_pid is not null and (p.id is null or p.id <> cookie_pid) then
   -- Recheck deletion after the bootstrap lock; maintenance may have raced inspect.
   if not exists(select 1 from public.marketing_round2_participations where id=cookie_pid and expires_at>clock_timestamp()) then raise exception using errcode='PT410',message='PARTICIPATION_EXPIRED'; end if;
   raise exception using errcode='PT409',message='BOOTSTRAP_CONFLICT';
  end if;
  if p.id is null and op='apply' then
   write_at:=clock_timestamp();
   insert into public.marketing_round2_participations(topic,bootstrap_digest,first_channel,utm_source,utm_medium,utm_campaign,utm_content,created_at,expires_at)
   values(topic,bootstrap_digest,payload->>'first_channel',payload->>'utm_source',payload->>'utm_medium',payload->>'utm_campaign',payload->>'utm_content',write_at,least(write_at+interval '30 days',timestamptz '2026-10-31 15:00:00+00')) returning * into p;
   is_new:=true;
  end if;
 else
  if op='apply' then select * into p from public.marketing_round2_participations where id=cookie_pid for update;
  else select * into p from public.marketing_round2_participations where id=cookie_pid; end if;
  if p.id is null then raise exception using errcode='PT410',message='PARTICIPATION_EXPIRED'; end if;
 end if;
 if p.id is not null and (p.topic<>topic or p.round_version<>'r2.1') then raise exception using errcode='PT409',message='BOOTSTRAP_CONFLICT'; end if;
 if p.id is not null and clock_timestamp()>=p.expires_at then raise exception using errcode='PT410',message='PARTICIPATION_EXPIRED'; end if;
 if op='apply' and intent='cookie_resume' and payload <> jsonb_build_object('first_channel',p.first_channel,'utm_source',p.utm_source,'utm_medium',p.utm_medium,'utm_campaign',p.utm_campaign,'utm_content',p.utm_content) then
  raise exception using errcode='PT409',message='EVENT_CONFLICT';
 end if;
 select * into e from public.marketing_round2_events r where r.event_id=event_id;
 if e.event_id is not null then
  if e.participation_id is distinct from p.id or e.action<>action or e.activity<>activity then raise exception using errcode='PT409',message='EVENT_CONFLICT'; end if;
  if not (op='inspect' and intent='cookie_resume') and (e.payload<>payload or not private.marketing_round2_digest_equal(e.payload_digest,payload_digest)) then raise exception using errcode='PT409',message='EVENT_CONFLICT'; end if;
  replay:=true;
 end if;
 if action='lead_submit' then
  select * into l from public.marketing_round2_lead_requests where participation_id=p.id;
  if l.request_id is not null then
   if l.request_id<>event_id then raise exception using errcode='PT409',message='ACTIVITY_ALREADY_COMPLETED'; end if;
   if not private.marketing_round2_digest_equal(l.request_digest,request_digest) or not private.marketing_round2_digest_equal(l.email_key,email_key) then raise exception using errcode='PT409',message='EVENT_CONFLICT'; end if;
  elsif replay then raise exception using errcode='PT503',message='LEAD_CAPTURE_UNAVAILABLE'; end if;
 end if;
 if p.id is not null then
  state:=private.marketing_round2_state(p.example_started_at,p.example_completed_at);
  if not replay then
   if action='example_complete' and p.example_started_at is null or action='survey_submit' and p.survey_started_at is null or action='lead_submit' and p.lead_started_at is null then raise exception using errcode='PT409',message='INVALID_TRANSITION'; end if;
   if action='survey_submit' and p.survey_submitted_at is not null and (p.answers<>payload->'answers' or p.survey_version<>payload->>'survey_version') then raise exception using errcode='PT409',message='ACTIVITY_ALREADY_COMPLETED'; end if;
  end if;
 end if;
 if op='apply' and not replay then
  if action='lead_submit' then
   perform pg_advisory_xact_lock(hashtextextended('marketing-round2-email:' || (lead->>'email_key'),0));
  end if;
  if not is_new then write_at:=clock_timestamp(); end if;
  if action='lead_submit' and (verified_at is null or verified_at>write_at or verified_at<write_at-interval '300 seconds') then raise exception using errcode='PT422',message='TURNSTILE_FAILED'; end if;
  applied:=case action when 'bootstrap' then is_new
    when 'activity_start' then case activity when 'example' then p.example_started_at is null when 'survey' then p.survey_started_at is null when 'lead' then p.lead_started_at is null end
    when 'example_complete' then p.example_completed_at is null when 'survey_submit' then p.survey_submitted_at is null when 'lead_submit' then true else false end;
  if applied and not is_new then p.revision:=p.revision+1; end if;
  begin
   insert into public.marketing_round2_events(event_id,participation_id,action,activity,payload,payload_digest,applied,revision,example_state_at_event,recorded_at)
   values(event_id,p.id,action,activity,payload,payload_digest,applied,p.revision,state,write_at);
  exception when unique_violation then
   get stacked diagnostics constraint_name = CONSTRAINT_NAME;
   if constraint_name='marketing_round2_events_pkey' then raise exception using errcode='PT409',message='EVENT_CONFLICT'; end if;
   raise;
  end;
  if applied then
   if action='activity_start' then
    if activity='example' then p.example_started_at:=write_at;
    elsif activity='survey' then p.survey_started_at:=write_at; p.survey_example_at_start:=state;
    else p.lead_started_at:=write_at; end if;
   elsif action='example_complete' then p.example_completed_at:=write_at;
   elsif action='survey_submit' then p.survey_submitted_at:=write_at; p.survey_example_at_submit:=state; p.survey_version:=payload->>'survey_version'; p.answers:=payload->'answers';
   elsif action='lead_submit' then
    select exists(select 1 from public.marketing_validation_sessions v where v.lead_submission_status='accepted' and v.email is not null and v.retention_until>write_at and lower(btrim(v.email))=email) into existing_topic;
    if existing_topic then observation:='existing_legacy';
    elsif exists(select 1 from public.marketing_round2_lead_requests r where r.email_key=email_key) then observation:='existing_round2';
    else observation:='new_observed'; end if;
    select exists(select 1 from public.marketing_round2_lead_requests r where r.round_version='r2.1' and r.topic=topic and r.email_key=email_key and r.topic_status='new_topic') into existing_topic;
    insert into public.marketing_round2_lead_requests(request_id,participation_id,topic,email_key,email_normalized,topic_status,contact_observation,consent_version,purpose,consent_generation,consented_at,turnstile_verified_at,request_digest,created_at)
    values(event_id,p.id,topic,email_key,case when existing_topic then null else email end,case when existing_topic then 'repeat_topic' else 'new_topic' end,observation,lead->>'consent_version',lead->>'purpose',generation,write_at,verified_at,request_digest,write_at);
    p.lead_completed_at:=write_at;
   end if;
   if not is_new then
    update public.marketing_round2_participations r set revision=p.revision,example_started_at=p.example_started_at,example_completed_at=p.example_completed_at,
     survey_started_at=p.survey_started_at,survey_example_at_start=p.survey_example_at_start,survey_submitted_at=p.survey_submitted_at,survey_example_at_submit=p.survey_example_at_submit,survey_version=p.survey_version,answers=p.answers,lead_started_at=p.lead_started_at,lead_completed_at=p.lead_completed_at where r.id=p.id;
   end if;
  end if;
 end if;
 final_at:=clock_timestamp();
 if final_at>=timestamptz '2026-10-31 15:00:00+00' then raise exception using errcode='PT410',message='CAMPAIGN_ENDED'; end if;
 if p.id is not null and final_at>=p.expires_at then raise exception using errcode='PT410',message='PARTICIPATION_EXPIRED'; end if;
 if final_at>=valid_until then raise exception using errcode='PT503',message='ROUND2_UNAVAILABLE'; end if;
 if op='apply' then perform set_config('homecook.r2_valid_until',valid_until::text,true); end if;
 if p.id is not null then
  select request_id into receipt from public.marketing_round2_lead_requests where participation_id=p.id;
  result_data:=jsonb_build_object('round_version','r2.1','topic',topic,'participation_id',p.id,'event_id',event_id,'revision',p.revision,'consent_generation',generation,
   'state',jsonb_build_object('example',private.marketing_round2_state(p.example_started_at,p.example_completed_at),'survey',private.marketing_round2_state(p.survey_started_at,p.survey_submitted_at),'lead',private.marketing_round2_state(p.lead_started_at,p.lead_completed_at)),
   'receipt',case when receipt is null then null else jsonb_build_object('event_id',receipt,'status','received') end,
   'participation_expires_at',to_char(p.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'retention_until','2026-11-30T15:00:00Z');
  bootstrap:=jsonb_build_object('participation_id',p.id,'created_at',to_char(p.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),'expires_at',to_char(p.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
   'first_attribution',jsonb_build_object('first_channel',p.first_channel,'utm_source',p.utm_source,'utm_medium',p.utm_medium,'utm_campaign',p.utm_campaign,'utm_content',p.utm_content));
  if action='bootstrap' then cookie_claims:=jsonb_build_object('v',1,'pid',p.id,'topic',topic,'round_version','r2.1','iat',floor(extract(epoch from p.created_at)),'exp',floor(extract(epoch from p.expires_at))); end if;
 end if;
 if op='inspect' then return jsonb_build_object('kind','inspected','data',result_data,'bootstrap',bootstrap,'replay',case when replay then 'same' else 'absent' end,'needs_turnstile',action='lead_submit' and l.request_id is null); end if;
 return jsonb_build_object('kind','applied','data',result_data,'cookie_claims',cookie_claims);
end $$;

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
  if v_scope = 'marketing-round2' and v_method = 'POST' and v_path = '/rpc/marketing_round2_apply' then
    return;
  end if;

  if v_scope = 'marketing-validation'
    and v_method in ('GET', 'POST', 'PATCH')
    and v_path = '/marketing_validation_sessions' then
    return;
  end if;

  if v_scope = 'marketing-validation-export'
    and v_method = 'GET'
    and v_path = '/marketing_validation_sessions' then
    return;
  end if;

  if v_scope = 'marketing-validation-purge'
    and v_method in ('GET', 'DELETE')
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

alter function private.marketing_round2_keys(jsonb,text[]) owner to postgres;
revoke all on function private.marketing_round2_keys(jsonb,text[]) from public, anon, authenticated, service_role;
alter function private.marketing_round2_answers(text,jsonb) owner to postgres;
revoke all on function private.marketing_round2_answers(text,jsonb) from public, anon, authenticated, service_role;
alter function private.marketing_round2_attribution(text,jsonb) owner to postgres;
revoke all on function private.marketing_round2_attribution(text,jsonb) from public, anon, authenticated, service_role;
alter function private.marketing_round2_email(text) owner to postgres;
revoke all on function private.marketing_round2_email(text) from public, anon, authenticated, service_role;
alter function private.marketing_round2_payload(text,text,text,jsonb) owner to postgres;
revoke all on function private.marketing_round2_payload(text,text,text,jsonb) from public, anon, authenticated, service_role;
alter function private.marketing_round2_state(timestamptz,timestamptz) owner to postgres;
revoke all on function private.marketing_round2_state(timestamptz,timestamptz) from public, anon, authenticated, service_role;
alter function private.marketing_round2_digest_equal(bytea,bytea) owner to postgres;
revoke all on function private.marketing_round2_digest_equal(bytea,bytea) from public, anon, authenticated, service_role;
alter function private.marketing_round2_check_consistency() owner to postgres;
revoke all on function private.marketing_round2_check_consistency() from public, anon, authenticated, service_role;
alter function public.marketing_round2_apply(jsonb) owner to postgres;
revoke all on function public.marketing_round2_apply(jsonb) from public, anon, authenticated;
grant execute on function public.marketing_round2_apply(jsonb) to service_role;
commit;
