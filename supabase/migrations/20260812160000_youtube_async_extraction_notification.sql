begin;

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'youtube_extraction_enqueue_rpc_owner'
  ) then
    execute
      'create role youtube_extraction_enqueue_rpc_owner '
      || 'nologin nosuperuser nocreatedb nocreaterole '
      || 'noreplication nobypassrls noinherit';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'youtube_extraction_worker'
  ) then
    execute
      'create role youtube_extraction_worker '
      || 'nologin nosuperuser nocreatedb nocreaterole '
      || 'noreplication nobypassrls noinherit';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'youtube_extraction_worker_rpc_owner'
  ) then
    execute
      'create role youtube_extraction_worker_rpc_owner '
      || 'nologin nosuperuser nocreatedb nocreaterole '
      || 'noreplication nobypassrls noinherit';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'youtube_extraction_credential_manager'
  ) then
    execute
      'create role youtube_extraction_credential_manager '
      || 'nologin nosuperuser nocreatedb nocreaterole '
      || 'noreplication nobypassrls noinherit';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'youtube_extraction_credential_manager_rpc_owner'
  ) then
    execute
      'create role youtube_extraction_credential_manager_rpc_owner '
      || 'nologin nosuperuser nocreatedb nocreaterole '
      || 'noreplication nobypassrls noinherit';
  end if;
end;
$$;

grant usage on schema public to youtube_extraction_enqueue_rpc_owner;
grant usage on schema public to youtube_extraction_worker;
grant usage on schema public to youtube_extraction_worker_rpc_owner;
grant usage on schema public to youtube_extraction_credential_manager;
grant usage on schema public to youtube_extraction_credential_manager_rpc_owner;
grant usage on schema private to youtube_extraction_enqueue_rpc_owner;
grant usage on schema private to youtube_extraction_worker_rpc_owner;
grant usage on schema private to youtube_extraction_credential_manager_rpc_owner;
grant usage on schema extensions to youtube_extraction_enqueue_rpc_owner;
grant usage on schema extensions to youtube_extraction_worker_rpc_owner;
grant usage on schema extensions to youtube_extraction_credential_manager_rpc_owner;

grant youtube_extraction_worker to authenticator;
grant youtube_extraction_credential_manager to authenticator;

-- i031 writes only bounded, allowlisted cache/event projections. Widen the
-- legacy Gemini-only provider constraints without removing either provider.
alter table public.youtube_llm_extraction_events
  drop constraint if exists youtube_llm_extraction_events_provider_check;
alter table public.youtube_llm_extraction_events
  add constraint youtube_llm_extraction_events_provider_check
  check (provider in ('gemini', 'codex-vision-keyframes'));

alter table public.youtube_visual_extraction_cache
  drop constraint if exists youtube_visual_extraction_cache_provider_check;
alter table public.youtube_visual_extraction_cache
  add constraint youtube_visual_extraction_cache_provider_check
  check (provider in ('gemini', 'codex-vision-keyframes'));

alter table public.youtube_visual_extraction_events
  drop constraint if exists youtube_visual_extraction_events_provider_check;
alter table public.youtube_visual_extraction_events
  add constraint youtube_visual_extraction_events_provider_check
  check (provider in ('gemini', 'codex-vision-keyframes'));

alter role youtube_extraction_worker
  set pgrst.db_pre_request = 'public.check_youtube_extraction_worker_pre_request';

alter role youtube_extraction_credential_manager
  set pgrst.db_pre_request = 'public.check_youtube_extraction_worker_pre_request';

-- create table public.youtube_extraction_jobs
create table if not exists public.youtube_extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  youtube_video_id varchar(20) not null,
  video_title_snapshot varchar(160),
  request_fingerprint text not null,
  request_fingerprint_key_version text not null,
  release_policy_key text not null,
  policy_version bigint not null,
  policy_snapshot_digest text not null,
  extractor_mode text not null,
  pipeline_identity text not null,
  result_affecting_options jsonb not null default '{}'::jsonb,
  submission_mode text not null,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_generation bigint not null default 0,
  lease_expires_at timestamptz,
  heartbeat_at timestamptz,
  started_at timestamptz,
  extraction_session_id uuid,
  error_code text,
  error_message text,
  completed_at timestamptz,
  completion_delivery_key text,
  completion_delivered_at timestamptz,
  completion_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint youtube_extraction_jobs_video_id_check
    check (length(btrim(youtube_video_id)) between 1 and 20),
  constraint youtube_extraction_jobs_fingerprint_check
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint youtube_extraction_jobs_policy_snapshot_digest_check
    check (policy_snapshot_digest ~ '^[0-9a-f]{64}$'),
  constraint youtube_extraction_jobs_submission_mode_check
    check (submission_mode in ('background_notify', 'sync_wait')),
  constraint youtube_extraction_jobs_status_check
    check (status in ('queued', 'processing', 'succeeded', 'failed')),
  constraint youtube_extraction_jobs_attempts_check
    check (attempt_count >= 0 and max_attempts > 0 and attempt_count <= max_attempts),
  constraint youtube_extraction_jobs_policy_version_check
    check (policy_version > 0),
  constraint youtube_extraction_jobs_terminal_consistency_check
    check (
      (
        status in ('queued', 'processing')
        and completed_at is null
      )
      or (
        status in ('succeeded', 'failed')
        and completed_at is not null
      )
    ),
  constraint youtube_extraction_jobs_succeeded_session_check
    check (
      status <> 'succeeded'
      or extraction_session_id is not null
    ),
  constraint youtube_extraction_jobs_completion_delivery_key_unique
    unique (completion_delivery_key)
);

-- create table public.youtube_extractor_permits
create table if not exists public.youtube_extractor_permits (
  permit_key text primary key,
  owner_id text,
  permit_generation bigint not null default 0,
  heartbeat_at timestamptz,
  expires_at timestamptz,
  constraint youtube_extractor_permits_singleton_check
    check (permit_key = 'primary'),
  constraint youtube_extractor_permits_generation_check
    check (permit_generation >= 0)
);

-- create table private.youtube_extraction_current_policy
create table if not exists private.youtube_extraction_current_policy (
  policy_key text primary key,
  policy_version bigint not null,
  extractor_mode text not null,
  pipeline_identity text not null,
  result_affecting_options jsonb not null,
  fingerprint_key_version text not null,
  previous_fingerprint_key_version text,
  previous_fingerprint_valid_until timestamptz,
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  constraint youtube_extraction_current_policy_singleton_check
    check (policy_key = 'primary'),
  constraint youtube_extraction_current_policy_version_check
    check (policy_version > 0),
  constraint youtube_extraction_current_policy_previous_pair_check
    check (
      (previous_fingerprint_key_version is null and previous_fingerprint_valid_until is null)
      or (
        previous_fingerprint_key_version is not null
        and previous_fingerprint_valid_until is not null
      )
    ),
  constraint youtube_extraction_current_policy_options_object_check
    check (jsonb_typeof(result_affecting_options) = 'object')
);

-- create table private.youtube_extraction_worker_credentials
create table if not exists private.youtube_extraction_worker_credentials (
  credential_name text primary key,
  current_generation bigint not null,
  current_jti_hash text not null,
  expires_at timestamptz not null,
  release_sha text not null,
  schema_identity text not null,
  allowed_snapshot_digest text not null,
  updated_at timestamptz not null default now(),
  constraint youtube_extraction_worker_credentials_singleton_check
    check (credential_name = 'primary'),
  constraint youtube_extraction_worker_credentials_generation_check
    check (current_generation > 0),
  constraint youtube_extraction_worker_credentials_jti_hash_check
    check (current_jti_hash ~ '^[0-9a-f]{64}$'),
  constraint youtube_extraction_worker_credentials_snapshot_digest_check
    check (allowed_snapshot_digest ~ '^[0-9a-f]{64}$')
);

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'youtube_extraction_jobs_extraction_session_id_fkey'
  ) then
    execute
      'alter table public.youtube_extraction_jobs '
      || 'add constraint youtube_extraction_jobs_extraction_session_id_fkey '
      || 'foreign key (extraction_session_id) '
      || 'references public.youtube_extraction_sessions(id) on delete set null';
  end if;
end;
$$;

alter table public.youtube_extraction_sessions
  -- add column source_job_id uuid
  add column if not exists source_job_id uuid
  references public.youtube_extraction_jobs(id)
  on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'youtube_extraction_sessions_source_job_id_unique'
  ) then
    execute
      'alter table public.youtube_extraction_sessions '
      || 'add constraint youtube_extraction_sessions_source_job_id_unique '
      || 'unique (source_job_id)';
  end if;
end;
$$;

create unique index if not exists youtube_extraction_jobs_active_dedupe_uidx
  on public.youtube_extraction_jobs (
    user_id,
    request_fingerprint_key_version,
    request_fingerprint
  )
  where status in ('queued', 'processing');

create index if not exists youtube_extraction_jobs_claim_idx
  on public.youtube_extraction_jobs (status, available_at, created_at)
  where status = 'queued';

create index if not exists youtube_extraction_jobs_user_created_idx
  on public.youtube_extraction_jobs (user_id, created_at desc, id desc);

create index if not exists youtube_extraction_jobs_terminal_unseen_idx
  on public.youtube_extraction_jobs (
    user_id,
    completion_seen_at,
    completed_at desc,
    id desc
  )
  where status in ('succeeded', 'failed');

create index if not exists youtube_extraction_jobs_snapshot_processing_idx
  on public.youtube_extraction_jobs (
    policy_snapshot_digest,
    lease_expires_at,
    created_at,
    id
  )
  where status = 'processing';

create index if not exists youtube_extraction_jobs_snapshot_queue_idx
  on public.youtube_extraction_jobs (
    policy_snapshot_digest,
    available_at,
    created_at,
    id
  )
  where status = 'queued';

alter table public.youtube_extraction_jobs enable row level security;
alter table public.youtube_extraction_jobs force row level security;

alter table public.youtube_extractor_permits enable row level security;
alter table public.youtube_extractor_permits force row level security;

alter table private.youtube_extraction_current_policy enable row level security;
alter table private.youtube_extraction_current_policy force row level security;

alter table private.youtube_extraction_worker_credentials enable row level security;
alter table private.youtube_extraction_worker_credentials force row level security;

drop policy if exists youtube_extraction_current_policy_enqueue_owner_select
  on private.youtube_extraction_current_policy;
create policy youtube_extraction_current_policy_enqueue_owner_select
  on private.youtube_extraction_current_policy
  for select
  to youtube_extraction_enqueue_rpc_owner
  using (policy_key = 'primary');

drop policy if exists youtube_extraction_jobs_enqueue_owner_select
  on public.youtube_extraction_jobs;
create policy youtube_extraction_jobs_enqueue_owner_select
  on public.youtube_extraction_jobs
  for select
  to youtube_extraction_enqueue_rpc_owner
  using (
    user_id = nullif(
      coalesce(
        nullif(pg_catalog.current_setting('request.jwt.claims', true), ''),
        '{}'
      )::jsonb ->> 'sub',
      ''
    )::uuid
  );

drop policy if exists youtube_extraction_jobs_enqueue_owner_insert
  on public.youtube_extraction_jobs;
create policy youtube_extraction_jobs_enqueue_owner_insert
  on public.youtube_extraction_jobs
  for insert
  to youtube_extraction_enqueue_rpc_owner
  with check (
    user_id = nullif(
      coalesce(
        nullif(pg_catalog.current_setting('request.jwt.claims', true), ''),
        '{}'
      )::jsonb ->> 'sub',
      ''
    )::uuid
  );

drop policy if exists youtube_extraction_worker_credentials_enqueue_owner_select
  on private.youtube_extraction_worker_credentials;
drop policy if exists youtube_extraction_worker_credentials_readiness_owner_select
  on private.youtube_extraction_worker_credentials;

drop policy if exists youtube_extraction_sessions_enqueue_owner_select
  on public.youtube_extraction_sessions;
drop policy if exists youtube_extraction_sessions_projection_owner_select
  on public.youtube_extraction_sessions;

drop policy if exists youtube_extraction_current_policy_readiness_owner_select
  on private.youtube_extraction_current_policy;

drop policy if exists youtube_extraction_jobs_projection_owner_select
  on public.youtube_extraction_jobs;

drop policy if exists youtube_extraction_current_policy_worker_owner_select
  on private.youtube_extraction_current_policy;
create policy youtube_extraction_current_policy_worker_owner_select
  on private.youtube_extraction_current_policy
  for select
  to youtube_extraction_worker_rpc_owner
  using (policy_key = 'primary');

drop policy if exists youtube_extraction_current_policy_credential_owner_select
  on private.youtube_extraction_current_policy;
create policy youtube_extraction_current_policy_credential_owner_select
  on private.youtube_extraction_current_policy
  for select
  to youtube_extraction_credential_manager_rpc_owner
  using (policy_key = 'primary');

drop policy if exists youtube_extraction_current_policy_pre_request_worker_select
  on private.youtube_extraction_current_policy;
drop policy if exists youtube_extraction_jobs_worker_owner_select
  on public.youtube_extraction_jobs;
create policy youtube_extraction_jobs_worker_owner_select
  on public.youtube_extraction_jobs
  for select
  to youtube_extraction_worker_rpc_owner
  using (true);

drop policy if exists youtube_extraction_jobs_worker_owner_update
  on public.youtube_extraction_jobs;
create policy youtube_extraction_jobs_worker_owner_update
  on public.youtube_extraction_jobs
  for update
  to youtube_extraction_worker_rpc_owner
  using (true)
  with check (true);

drop policy if exists youtube_extraction_jobs_delivery_owner_update
  on public.youtube_extraction_jobs;
create policy youtube_extraction_jobs_delivery_owner_update
  on public.youtube_extraction_jobs
  for update
  to youtube_extraction_worker_rpc_owner
  using (
    nullif(
      coalesce(
        nullif(pg_catalog.current_setting('request.jwt.claims', true), ''),
        '{}'
      )::jsonb ->> 'sub',
      ''
    )::uuid = user_id
  )
  with check (
    nullif(
      coalesce(
        nullif(pg_catalog.current_setting('request.jwt.claims', true), ''),
        '{}'
      )::jsonb ->> 'sub',
      ''
    )::uuid = user_id
  );

drop policy if exists youtube_extractor_permits_worker_owner_select
  on public.youtube_extractor_permits;
create policy youtube_extractor_permits_worker_owner_select
  on public.youtube_extractor_permits
  for select
  to youtube_extraction_worker_rpc_owner
  using (permit_key = 'primary');

drop policy if exists youtube_extractor_permits_worker_owner_update
  on public.youtube_extractor_permits;
create policy youtube_extractor_permits_worker_owner_update
  on public.youtube_extractor_permits
  for update
  to youtube_extraction_worker_rpc_owner
  using (permit_key = 'primary')
  with check (permit_key = 'primary');

drop policy if exists youtube_extraction_sessions_worker_owner_select
  on public.youtube_extraction_sessions;
create policy youtube_extraction_sessions_worker_owner_select
  on public.youtube_extraction_sessions
  for select
  to youtube_extraction_worker_rpc_owner
  using (true);

drop policy if exists youtube_extraction_sessions_worker_owner_insert
  on public.youtube_extraction_sessions;
create policy youtube_extraction_sessions_worker_owner_insert
  on public.youtube_extraction_sessions
  for insert
  to youtube_extraction_worker_rpc_owner
  with check (true);

drop policy if exists youtube_extraction_sessions_worker_owner_update
  on public.youtube_extraction_sessions;
create policy youtube_extraction_sessions_worker_owner_update
  on public.youtube_extraction_sessions
  for update
  to youtube_extraction_worker_rpc_owner
  using (true)
  with check (true);

drop policy if exists youtube_extraction_candidates_worker_owner_select
  on public.youtube_extraction_candidates;
create policy youtube_extraction_candidates_worker_owner_select
  on public.youtube_extraction_candidates
  for select
  to youtube_extraction_worker_rpc_owner
  using (true);

drop policy if exists youtube_extraction_candidates_worker_owner_insert
  on public.youtube_extraction_candidates;
create policy youtube_extraction_candidates_worker_owner_insert
  on public.youtube_extraction_candidates
  for insert
  to youtube_extraction_worker_rpc_owner
  with check (true);

drop policy if exists youtube_extraction_candidates_worker_owner_update
  on public.youtube_extraction_candidates;
create policy youtube_extraction_candidates_worker_owner_update
  on public.youtube_extraction_candidates
  for update
  to youtube_extraction_worker_rpc_owner
  using (true)
  with check (true);

drop policy if exists youtube_worker_catalog_ingredients_select on public.ingredients;
create policy youtube_worker_catalog_ingredients_select on public.ingredients
  for select to youtube_extraction_worker_rpc_owner using (true);
drop policy if exists youtube_worker_catalog_ingredient_synonyms_select on public.ingredient_synonyms;
create policy youtube_worker_catalog_ingredient_synonyms_select on public.ingredient_synonyms
  for select to youtube_extraction_worker_rpc_owner using (true);
drop policy if exists youtube_worker_catalog_cooking_methods_all on public.cooking_methods;
create policy youtube_worker_catalog_cooking_methods_all on public.cooking_methods
  for all to youtube_extraction_worker_rpc_owner using (true) with check (true);

drop policy if exists youtube_worker_transcript_cache_all on public.youtube_transcript_cache;
create policy youtube_worker_transcript_cache_all on public.youtube_transcript_cache
  for all to youtube_extraction_worker_rpc_owner using (true) with check (true);
drop policy if exists youtube_worker_transcript_events_all on public.youtube_transcript_fetch_events;
create policy youtube_worker_transcript_events_all on public.youtube_transcript_fetch_events
  for all to youtube_extraction_worker_rpc_owner using (true) with check (true);
drop policy if exists youtube_worker_llm_cache_all on public.youtube_llm_extraction_cache;
create policy youtube_worker_llm_cache_all on public.youtube_llm_extraction_cache
  for all to youtube_extraction_worker_rpc_owner using (true) with check (true);
drop policy if exists youtube_worker_llm_events_all on public.youtube_llm_extraction_events;
create policy youtube_worker_llm_events_all on public.youtube_llm_extraction_events
  for all to youtube_extraction_worker_rpc_owner using (true) with check (true);
drop policy if exists youtube_worker_visual_cache_all on public.youtube_visual_extraction_cache;
create policy youtube_worker_visual_cache_all on public.youtube_visual_extraction_cache
  for all to youtube_extraction_worker_rpc_owner using (true) with check (true);
drop policy if exists youtube_worker_visual_events_all on public.youtube_visual_extraction_events;
create policy youtube_worker_visual_events_all on public.youtube_visual_extraction_events
  for all to youtube_extraction_worker_rpc_owner using (true) with check (true);

drop policy if exists youtube_extraction_worker_credentials_worker_owner_select
  on private.youtube_extraction_worker_credentials;
create policy youtube_extraction_worker_credentials_worker_owner_select
  on private.youtube_extraction_worker_credentials
  for select
  to youtube_extraction_worker_rpc_owner
  using (credential_name = 'primary');

drop policy if exists youtube_extraction_worker_credentials_credential_owner_select
  on private.youtube_extraction_worker_credentials;
create policy youtube_extraction_worker_credentials_credential_owner_select
  on private.youtube_extraction_worker_credentials
  for select
  to youtube_extraction_credential_manager_rpc_owner
  using (credential_name = 'primary');

drop policy if exists youtube_extraction_worker_credentials_credential_owner_update
  on private.youtube_extraction_worker_credentials;
create policy youtube_extraction_worker_credentials_credential_owner_update
  on private.youtube_extraction_worker_credentials
  for update
  to youtube_extraction_credential_manager_rpc_owner
  using (credential_name = 'primary')
  with check (credential_name = 'primary');

revoke all on table public.youtube_extraction_jobs from public, anon, authenticated, service_role;
revoke all on table public.youtube_extractor_permits from public, anon, authenticated, service_role;
revoke all on table private.youtube_extraction_current_policy from public, anon, authenticated, service_role;
revoke all on table private.youtube_extraction_worker_credentials from public, anon, authenticated, service_role;
revoke all on table public.youtube_extraction_jobs from youtube_extraction_worker, youtube_extraction_credential_manager;
revoke all on table public.youtube_extractor_permits from youtube_extraction_worker, youtube_extraction_credential_manager;
revoke all on table private.youtube_extraction_current_policy from youtube_extraction_worker, youtube_extraction_credential_manager;
revoke all on table private.youtube_extraction_worker_credentials from youtube_extraction_worker, youtube_extraction_credential_manager;

grant select on table private.youtube_extraction_current_policy
  to youtube_extraction_enqueue_rpc_owner;
grant select, insert on table public.youtube_extraction_jobs
  to youtube_extraction_enqueue_rpc_owner;
revoke all on table private.youtube_extraction_worker_credentials
  from youtube_extraction_enqueue_rpc_owner;
revoke all on table public.youtube_extraction_sessions
  from youtube_extraction_enqueue_rpc_owner;

grant select on table private.youtube_extraction_current_policy
  to youtube_extraction_worker_rpc_owner;
grant select on table private.youtube_extraction_worker_credentials
  to youtube_extraction_worker_rpc_owner;
grant select, update on table public.youtube_extraction_jobs
  to youtube_extraction_worker_rpc_owner;
grant select, update on table public.youtube_extractor_permits
  to youtube_extraction_worker_rpc_owner;
grant select, insert, update on table public.youtube_extraction_sessions
  to youtube_extraction_worker_rpc_owner;
grant select, insert, update on table public.youtube_extraction_candidates
  to youtube_extraction_worker_rpc_owner;
grant select on table public.ingredients, public.ingredient_synonyms
  to youtube_extraction_worker_rpc_owner;
grant select, insert, update on table public.cooking_methods
  to youtube_extraction_worker_rpc_owner;
grant select, insert, update on table
  public.youtube_transcript_cache,
  public.youtube_transcript_fetch_events,
  public.youtube_llm_extraction_cache,
  public.youtube_llm_extraction_events,
  public.youtube_visual_extraction_cache,
  public.youtube_visual_extraction_events
  to youtube_extraction_worker_rpc_owner;

grant select on table private.youtube_extraction_current_policy
  to youtube_extraction_credential_manager_rpc_owner;
grant select, update on table private.youtube_extraction_worker_credentials
  to youtube_extraction_credential_manager_rpc_owner;

insert into private.youtube_extraction_current_policy (
  policy_key,
  policy_version,
  extractor_mode,
  pipeline_identity,
  result_affecting_options,
  fingerprint_key_version,
  previous_fingerprint_key_version,
  previous_fingerprint_valid_until,
  enabled,
  updated_at
) values (
  'primary',
  1,
  'i031_codex_vision',
  '9adc7876a02c2da55a92e3a65369bf4e803c78efb9a791717201eedc242c1908',
  '{
    "codexEffort": "low",
    "frameMode": "hybrid",
    "hybridAnchorBudget": 36,
    "interval": 4,
    "keyframeTotalLimit": 8,
    "keyframesPerRecipe": 8,
    "packetPromptTextOnly": false,
    "publicSourceBundle": null,
    "recipeMode": "single",
    "screenOcrMode": "auto",
    "selectorCandidateLimit": 12,
    "selectorEffort": "low",
    "singleRecipeOnly": true,
    "sourceMode": "source-text",
    "useApifyFallback": true,
    "useEvidencePackets": false,
    "useVisual": true
  }'::jsonb,
  '1',
  null,
  null,
  false,
  now()
) on conflict (policy_key) do nothing;

insert into public.youtube_extractor_permits (
  permit_key,
  owner_id,
  permit_generation,
  heartbeat_at,
  expires_at
) values (
  'primary',
  null,
  0,
  null,
  null
) on conflict (permit_key) do nothing;

insert into private.youtube_extraction_worker_credentials (
  credential_name,
  current_generation,
  current_jti_hash,
  expires_at,
  release_sha,
  schema_identity,
  allowed_snapshot_digest,
  updated_at
) values (
  'primary',
  1,
  repeat('0', 64),
  now(),
  'bootstrap-disabled',
  'youtube-extraction-worker-schema-v1',
  repeat('0', 64),
  now()
) on conflict (credential_name) do nothing;

create or replace function private.youtube_extraction_policy_snapshot_digest(
  p_extractor_mode text,
  p_pipeline_identity text,
  p_result_affecting_options jsonb,
  p_policy_version bigint
)
returns text
language sql
immutable
set search_path = ''
as $function$
  select encode(
    extensions.digest(
      pg_catalog.convert_to(
        '{'
        || '"extractor_mode":' || to_jsonb(p_extractor_mode)::text
        || ',"pipeline_identity":' || to_jsonb(p_pipeline_identity)::text
        || ',"policy_version":' || to_jsonb(p_policy_version)::text
        || ',"result_affecting_options":{'
        || '"codexEffort":' || coalesce(p_result_affecting_options -> 'codexEffort', 'null'::jsonb)::text
        || ',"frameMode":' || coalesce(p_result_affecting_options -> 'frameMode', 'null'::jsonb)::text
        || ',"hybridAnchorBudget":' || coalesce(p_result_affecting_options -> 'hybridAnchorBudget', 'null'::jsonb)::text
        || ',"interval":' || coalesce(p_result_affecting_options -> 'interval', 'null'::jsonb)::text
        || ',"keyframeTotalLimit":' || coalesce(p_result_affecting_options -> 'keyframeTotalLimit', 'null'::jsonb)::text
        || ',"keyframesPerRecipe":' || coalesce(p_result_affecting_options -> 'keyframesPerRecipe', 'null'::jsonb)::text
        || ',"packetPromptTextOnly":' || coalesce(p_result_affecting_options -> 'packetPromptTextOnly', 'null'::jsonb)::text
        || ',"publicSourceBundle":' || coalesce(p_result_affecting_options -> 'publicSourceBundle', 'null'::jsonb)::text
        || ',"recipeMode":' || coalesce(p_result_affecting_options -> 'recipeMode', 'null'::jsonb)::text
        || ',"screenOcrMode":' || coalesce(p_result_affecting_options -> 'screenOcrMode', 'null'::jsonb)::text
        || ',"selectorCandidateLimit":' || coalesce(p_result_affecting_options -> 'selectorCandidateLimit', 'null'::jsonb)::text
        || ',"selectorEffort":' || coalesce(p_result_affecting_options -> 'selectorEffort', 'null'::jsonb)::text
        || ',"singleRecipeOnly":' || coalesce(p_result_affecting_options -> 'singleRecipeOnly', 'null'::jsonb)::text
        || ',"sourceMode":' || coalesce(p_result_affecting_options -> 'sourceMode', 'null'::jsonb)::text
        || ',"useApifyFallback":' || coalesce(p_result_affecting_options -> 'useApifyFallback', 'null'::jsonb)::text
        || ',"useEvidencePackets":' || coalesce(p_result_affecting_options -> 'useEvidencePackets', 'null'::jsonb)::text
        || ',"useVisual":' || coalesce(p_result_affecting_options -> 'useVisual', 'null'::jsonb)::text
        || '}'
        || ',"schema_identity":"youtube-extraction-policy-snapshot-v1"}',
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$function$;

create or replace function private.youtube_extraction_policy_options_valid(
  options jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select pg_catalog.jsonb_typeof(options) = 'object'
    and (
      select pg_catalog.array_agg(key order by key collate "C")
      from pg_catalog.jsonb_object_keys(options) as entry(key)
    ) = array[
      'codexEffort',
      'frameMode',
      'hybridAnchorBudget',
      'interval',
      'keyframeTotalLimit',
      'keyframesPerRecipe',
      'packetPromptTextOnly',
      'publicSourceBundle',
      'recipeMode',
      'screenOcrMode',
      'selectorCandidateLimit',
      'selectorEffort',
      'singleRecipeOnly',
      'sourceMode',
      'useApifyFallback',
      'useEvidencePackets',
      'useVisual'
    ]::text[]
    and pg_catalog.jsonb_typeof(options -> 'codexEffort') = 'string'
    and pg_catalog.jsonb_typeof(options -> 'frameMode') = 'string'
    and pg_catalog.jsonb_typeof(options -> 'hybridAnchorBudget') = 'number'
    and pg_catalog.jsonb_typeof(options -> 'interval') = 'number'
    and pg_catalog.jsonb_typeof(options -> 'keyframeTotalLimit') = 'number'
    and pg_catalog.jsonb_typeof(options -> 'keyframesPerRecipe') = 'number'
    and pg_catalog.jsonb_typeof(options -> 'packetPromptTextOnly') = 'boolean'
    and pg_catalog.jsonb_typeof(options -> 'publicSourceBundle') = 'null'
    and pg_catalog.jsonb_typeof(options -> 'recipeMode') = 'string'
    and pg_catalog.jsonb_typeof(options -> 'screenOcrMode') = 'string'
    and pg_catalog.jsonb_typeof(options -> 'selectorCandidateLimit') = 'number'
    and pg_catalog.jsonb_typeof(options -> 'selectorEffort') = 'string'
    and options -> 'singleRecipeOnly' = 'true'::jsonb
    and pg_catalog.jsonb_typeof(options -> 'sourceMode') = 'string'
    and pg_catalog.jsonb_typeof(options -> 'useApifyFallback') = 'boolean'
    and pg_catalog.jsonb_typeof(options -> 'useEvidencePackets') = 'boolean'
    and pg_catalog.jsonb_typeof(options -> 'useVisual') = 'boolean';
$function$;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'youtube_extraction_current_policy_options_schema_check'
      and conrelid = 'private.youtube_extraction_current_policy'::regclass
  ) then
    alter table private.youtube_extraction_current_policy
      add constraint youtube_extraction_current_policy_options_schema_check
      check (private.youtube_extraction_policy_options_valid(result_affecting_options));
  end if;
end;
$$;

create or replace function private.youtube_extraction_completion_delivery_key(
  p_job_id uuid,
  p_completed_at timestamptz
)
returns text
language sql
immutable
set search_path = ''
as $function$
  select 'ytasync:' || encode(
    extensions.digest(
      pg_catalog.convert_to(
        p_job_id::text
          || ':'
          || to_char(
            p_completed_at at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
          ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$function$;

create or replace function private.youtube_extraction_error_message(
  p_error_code text
)
returns text
language sql
immutable
set search_path = ''
as $function$
  select case p_error_code
    when 'ATTEMPTS_EXHAUSTED' then '재시도 한도를 초과했어요.'
    when 'NETWORK_ERROR' then '네트워크 오류로 다시 시도해요.'
    when 'RATE_LIMITED' then '잠시 후 다시 시도해요.'
    when 'PROVIDER_TIMEOUT' then '처리가 지연되어 다시 시도해요.'
    when 'TRANSIENT_INTERNAL_ERROR' then '일시적인 오류로 다시 시도해요.'
    else '추출을 완료하지 못했어요.'
  end;
$function$;

create or replace function private.youtube_extraction_backoff_seconds(
  p_attempt_count integer
)
returns integer
language sql
immutable
set search_path = ''
as $function$
  select least(900, greatest(30, 30 * (2 ^ greatest(p_attempt_count, 0))));
$function$;

revoke all on function private.youtube_extraction_policy_snapshot_digest(text, text, jsonb, bigint)
  from public, anon, authenticated, service_role;
revoke all on function private.youtube_extraction_policy_options_valid(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.youtube_extraction_completion_delivery_key(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function private.youtube_extraction_error_message(text)
  from public, anon, authenticated, service_role;
revoke all on function private.youtube_extraction_backoff_seconds(integer)
  from public, anon, authenticated, service_role;

grant execute on function private.youtube_extraction_policy_snapshot_digest(text, text, jsonb, bigint)
  to youtube_extraction_enqueue_rpc_owner,
     youtube_extraction_worker_rpc_owner,
     youtube_extraction_credential_manager_rpc_owner;
grant execute on function private.youtube_extraction_completion_delivery_key(uuid, timestamptz)
  to youtube_extraction_worker_rpc_owner;
grant execute on function private.youtube_extraction_error_message(text)
  to youtube_extraction_worker_rpc_owner;
grant execute on function private.youtube_extraction_backoff_seconds(integer)
  to youtube_extraction_worker_rpc_owner;

create or replace function public.check_youtube_extraction_worker_pre_request()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_claims jsonb := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
  v_role text := coalesce(nullif(v_claims ->> 'role', ''), current_user);
  v_scope text := coalesce(v_claims ->> 'scope', '');
  v_issuer text := coalesce(v_claims ->> 'iss', '');
  v_audience text := coalesce(v_claims ->> 'aud', '');
  v_jti_hash text := coalesce(v_claims ->> 'jti_hash', '');
  v_release_sha text := coalesce(v_claims ->> 'release_sha', '');
  v_schema_identity text := coalesce(v_claims ->> 'schema_identity', '');
  v_allowed_snapshot_digest text := coalesce(
    v_claims ->> 'allowed_snapshot_digest',
    ''
  );
  v_generation bigint := nullif(v_claims ->> 'generation', '')::bigint;
  v_exp bigint := nullif(v_claims ->> 'exp', '')::bigint;
  v_credential private.youtube_extraction_worker_credentials%rowtype;
begin
  if v_role = 'youtube_extraction_worker' then
    select credentials.*
      into strict v_credential
    from private.youtube_extraction_worker_credentials as credentials
    where credentials.credential_name = 'primary';

    if v_scope is distinct from 'youtube-extraction-worker'
      or v_issuer is distinct from 'https://worker.mumeok.kr'
      or v_audience is distinct from 'youtube-extraction'
      or v_generation is null
      or v_exp is null
      or v_jti_hash !~ '^[0-9a-f]{64}$'
      or v_release_sha = ''
      or v_schema_identity = ''
      or v_allowed_snapshot_digest !~ '^[0-9a-f]{64}$'
      or v_generation is distinct from v_credential.current_generation
      or v_jti_hash is distinct from v_credential.current_jti_hash
      or v_release_sha is distinct from v_credential.release_sha
      or v_schema_identity is distinct from v_credential.schema_identity
      or v_allowed_snapshot_digest is distinct from v_credential.allowed_snapshot_digest
      or to_timestamp(v_exp) > v_credential.expires_at + interval '5 seconds'
      or to_timestamp(v_exp) < clock_timestamp()
      or v_credential.expires_at <= clock_timestamp() + interval '30 minutes' then
      raise exception 'YOUTUBE_EXTRACTION_WORKER_UNAUTHORIZED'
        using errcode = '42501';
    end if;

    perform private.assert_youtube_extraction_catalog_ready();
  elsif v_role = 'youtube_extraction_credential_manager' then
    if v_scope is distinct from 'youtube-extraction-credential-manager'
      or v_issuer is distinct from 'https://worker.mumeok.kr'
      or v_audience is distinct from 'youtube-extraction'
      or v_exp is null
      or to_timestamp(v_exp) < clock_timestamp()
      or to_timestamp(v_exp) > clock_timestamp() + interval '5 minutes' then
      raise exception 'YOUTUBE_EXTRACTION_CREDENTIAL_MANAGER_UNAUTHORIZED'
        using errcode = '42501';
    end if;
  else
    raise exception 'YOUTUBE_EXTRACTION_WORKER_UNAUTHORIZED'
      using errcode = '42501';
  end if;
end;
$function$;

create or replace function public.enqueue_youtube_extraction_job(
  video_id text,
  expected_policy_version bigint,
  expected_policy_snapshot_digest text,
  current_key_version text,
  current_digest text,
  previous_key_version text,
  previous_digest text,
  submission_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_claims jsonb := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
  v_owner_id uuid := nullif(v_claims ->> 'sub', '')::uuid;
  v_role text := coalesce(nullif(v_claims ->> 'role', ''), current_user);
  v_policy private.youtube_extraction_current_policy%rowtype;
  v_policy_digest text;
  v_existing_job public.youtube_extraction_jobs%rowtype;
  v_job public.youtube_extraction_jobs%rowtype;
  v_active_count integer;
  v_daily_count integer;
begin
  if v_role is distinct from 'authenticated' or v_owner_id is null then
    raise exception 'YOUTUBE_EXTRACTION_ENQUEUE_UNAUTHORIZED'
      using errcode = '42501';
  end if;

  perform private.assert_youtube_extraction_catalog_ready();

  if video_id is null
    or btrim(video_id) = ''
    or length(btrim(video_id)) > 20
    or expected_policy_version is null
    or expected_policy_version <= 0
    or expected_policy_snapshot_digest !~ '^[0-9a-f]{64}$'
    or current_digest !~ '^[0-9a-f]{64}$'
    or coalesce(btrim(current_key_version), '') = ''
    or submission_mode not in ('background_notify', 'sync_wait')
    or (
      (previous_key_version is null) <> (previous_digest is null)
    )
    or (
      previous_digest is not null
      and previous_digest !~ '^[0-9a-f]{64}$'
    ) then
    raise exception 'VALIDATION_ERROR'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(86120317);

  select policy.*
    into strict v_policy
  from private.youtube_extraction_current_policy as policy
  where policy.policy_key = 'primary';

  v_policy_digest := private.youtube_extraction_policy_snapshot_digest(
    v_policy.extractor_mode,
    v_policy.pipeline_identity,
    v_policy.result_affecting_options,
    v_policy.policy_version
  );

  if not v_policy.enabled then
    raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE'
      using errcode = '55000';
  end if;

  if v_policy.policy_version is distinct from expected_policy_version
    or v_policy_digest is distinct from expected_policy_snapshot_digest then
    raise exception 'POLICY_CHANGED'
      using errcode = '40001';
  end if;

  if v_policy.fingerprint_key_version is distinct from current_key_version then
    raise exception 'POLICY_CHANGED'
      using errcode = '40001';
  end if;

  if previous_key_version is not null and (
    v_policy.previous_fingerprint_key_version is distinct from previous_key_version
    or v_policy.previous_fingerprint_valid_until is null
    or v_policy.previous_fingerprint_valid_until < clock_timestamp()
  ) then
    raise exception 'POLICY_CHANGED'
      using errcode = '40001';
  end if;

  -- Serialize dedupe, budgets and insert per owner so concurrent distinct
  -- fingerprints cannot both pass a count-then-insert check.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_owner_id::text, 86120318)
  );

  select job.*
    into v_existing_job
  from public.youtube_extraction_jobs as job
  where job.user_id = v_owner_id
    and job.status in ('queued', 'processing')
    and (
      (
        job.request_fingerprint_key_version = current_key_version
        and job.request_fingerprint = current_digest
      )
      or (
        previous_key_version is not null
        and job.request_fingerprint_key_version = previous_key_version
        and job.request_fingerprint = previous_digest
      )
    )
  order by job.created_at desc, job.id desc
  limit 1;

  if found then
    return jsonb_build_object(
      'job_id', v_existing_job.id,
      'status', v_existing_job.status,
      'deduplicated', true,
      'submitted_at', v_existing_job.created_at
    );
  end if;

  select
    count(*) filter (where job.status in ('queued', 'processing')),
    count(*) filter (where job.created_at >= clock_timestamp() - interval '24 hours')
    into v_active_count, v_daily_count
  from public.youtube_extraction_jobs as job
  where job.user_id = v_owner_id;

  if v_active_count >= 2 or v_daily_count >= 10 then
    raise exception 'RATE_LIMITED'
      using errcode = 'P0001';
  end if;

  insert into public.youtube_extraction_jobs (
    user_id,
    youtube_video_id,
    request_fingerprint,
    request_fingerprint_key_version,
    release_policy_key,
    policy_version,
    policy_snapshot_digest,
    extractor_mode,
    pipeline_identity,
    result_affecting_options,
    submission_mode,
    status,
    attempt_count,
    max_attempts,
    available_at,
    created_at,
    updated_at
  ) values (
    v_owner_id,
    btrim(video_id),
    current_digest,
    current_key_version,
    v_policy.policy_key,
    v_policy.policy_version,
    v_policy_digest,
    v_policy.extractor_mode,
    v_policy.pipeline_identity,
    v_policy.result_affecting_options,
    submission_mode,
    'queued',
    0,
    3,
    now(),
    now(),
    now()
  )
  returning *
    into v_job;

  return jsonb_build_object(
    'job_id', v_job.id,
    'status', v_job.status,
    'deduplicated', false,
    'submitted_at', v_job.created_at
  );
end;
$function$;

create or replace function public.claim_youtube_extraction_job(
  worker_id text,
  allowed_snapshot_digest text,
  lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_worker_claims jsonb := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
  v_credential private.youtube_extraction_worker_credentials%rowtype;
  v_reaper_job public.youtube_extraction_jobs%rowtype;
  v_job public.youtube_extraction_jobs%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  perform public.check_youtube_extraction_worker_pre_request();

  if to_timestamp(nullif(v_worker_claims ->> 'exp', '')::bigint)
    <= clock_timestamp() + interval '30 minutes' then
    raise exception 'YOUTUBE_EXTRACTION_WORKER_UNAUTHORIZED'
      using errcode = '42501';
  end if;

  if coalesce(btrim(worker_id), '') = ''
    or allowed_snapshot_digest !~ '^[0-9a-f]{64}$'
    or lease_seconds is null
    or lease_seconds < 15
    or lease_seconds > 3600 then
    raise exception 'VALIDATION_ERROR'
      using errcode = '22023';
  end if;

  select credentials.*
    into strict v_credential
  from private.youtube_extraction_worker_credentials as credentials
  where credentials.credential_name = 'primary';

  if v_credential.expires_at <= v_now + interval '30 minutes' then
    raise exception 'YOUTUBE_EXTRACTION_WORKER_UNAUTHORIZED'
      using errcode = '42501';
  end if;

  if allowed_snapshot_digest is distinct from v_credential.allowed_snapshot_digest
    or allowed_snapshot_digest is distinct from (v_worker_claims ->> 'allowed_snapshot_digest') then
    raise exception 'POLICY_CHANGED'
      using errcode = '40001';
  end if;

  select job.*
    into v_reaper_job
  from public.youtube_extraction_jobs as job
  where job.status = 'processing'
    and job.policy_snapshot_digest = allowed_snapshot_digest
    and job.lease_expires_at is not null
    and job.lease_expires_at < v_now
  order by job.lease_expires_at, job.created_at, job.id
  for update skip locked
  limit 1;

  if found then
    if v_reaper_job.attempt_count >= v_reaper_job.max_attempts then
      update public.youtube_extraction_jobs as job
      set status = 'failed',
          error_code = 'ATTEMPTS_EXHAUSTED',
          error_message = private.youtube_extraction_error_message('ATTEMPTS_EXHAUSTED'),
          completed_at = v_now,
          completion_delivery_key = coalesce(
            job.completion_delivery_key,
            private.youtube_extraction_completion_delivery_key(job.id, v_now)
          ),
          lease_owner = null,
          lease_expires_at = null,
          heartbeat_at = null,
          updated_at = v_now
      where job.id = v_reaper_job.id;
    else
      update public.youtube_extraction_jobs as job
      set status = 'queued',
          lease_owner = null,
          lease_expires_at = null,
          heartbeat_at = null,
          available_at = v_now,
          updated_at = v_now
      where job.id = v_reaper_job.id;
    end if;
  end if;

  select job.*
    into v_job
  from public.youtube_extraction_jobs as job
  where job.status = 'queued'
    and job.policy_snapshot_digest = allowed_snapshot_digest
    and job.available_at <= v_now
    and job.attempt_count < job.max_attempts
  order by job.available_at, job.created_at, job.id
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object('status', 'empty', 'applied', false);
  end if;

  update public.youtube_extraction_jobs as job
  set status = 'processing',
      lease_owner = worker_id,
      lease_generation = job.lease_generation + 1,
      lease_expires_at = v_now + make_interval(secs => lease_seconds),
      heartbeat_at = v_now,
      updated_at = v_now
  where job.id = v_job.id
  returning *
    into v_job;

  return jsonb_build_object(
    'applied', true,
    'status', v_job.status,
    'job_id', v_job.id,
    'youtube_video_id', v_job.youtube_video_id,
    'lease_generation', v_job.lease_generation,
    'attempt_count', v_job.attempt_count,
    'policy_snapshot_digest', v_job.policy_snapshot_digest,
    'result_affecting_options', v_job.result_affecting_options
  );
end;
$function$;

create or replace function public.heartbeat_youtube_extraction_job(
  job_id uuid,
  worker_id text,
  lease_generation bigint,
  permit_generation bigint,
  lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.youtube_extraction_jobs%rowtype;
  v_now timestamptz := clock_timestamp();
  v_requested_job_id uuid := job_id;
  v_requested_worker_id text := worker_id;
  v_requested_lease_generation bigint := lease_generation;
  v_requested_permit_generation bigint := permit_generation;
  v_requested_lease_seconds integer := lease_seconds;
begin
  perform public.check_youtube_extraction_worker_pre_request();

  if v_requested_job_id is null
    or coalesce(btrim(v_requested_worker_id), '') = ''
    or v_requested_lease_generation is null
    or v_requested_permit_generation is null
    or v_requested_lease_seconds is null
    or v_requested_lease_seconds < 15
    or v_requested_lease_seconds > 3600 then
    raise exception 'VALIDATION_ERROR'
      using errcode = '22023';
  end if;

  if not private.youtube_extraction_worker_write_fence_is_active(
    v_requested_job_id,
    v_requested_worker_id,
    v_requested_lease_generation,
    v_requested_permit_generation
  ) then
    return jsonb_build_object('applied', false, 'updated', false);
  end if;

  update public.youtube_extraction_jobs as job
  set heartbeat_at = v_now,
      lease_expires_at = v_now + make_interval(secs => v_requested_lease_seconds),
      updated_at = v_now
  where job.id = v_requested_job_id
    and job.status = 'processing'
    and job.lease_owner = v_requested_worker_id
    and job.lease_generation = v_requested_lease_generation
  returning *
    into v_job;

  if not found then
    return jsonb_build_object('applied', false, 'updated', false);
  end if;

  return jsonb_build_object(
    'applied', true,
    'updated', true,
    'job_id', v_job.id,
    'lease_generation', v_job.lease_generation
  );
end;
$function$;

create or replace function public.start_youtube_extraction_attempt(
  job_id uuid,
  worker_id text,
  lease_generation bigint,
  permit_generation bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.youtube_extraction_jobs%rowtype;
  v_permit public.youtube_extractor_permits%rowtype;
  v_now timestamptz := clock_timestamp();
  v_requested_job_id uuid := job_id;
  v_requested_worker_id text := worker_id;
  v_requested_lease_generation bigint := lease_generation;
  v_requested_permit_generation bigint := permit_generation;
begin
  perform public.check_youtube_extraction_worker_pre_request();

  if v_requested_job_id is null
    or coalesce(btrim(v_requested_worker_id), '') = ''
    or v_requested_lease_generation is null
    or v_requested_permit_generation is null then
    raise exception 'VALIDATION_ERROR'
      using errcode = '22023';
  end if;

  select job.*
    into v_job
  from public.youtube_extraction_jobs as job
  where job.id = v_requested_job_id
  for update;

  if not found
    or v_job.status is distinct from 'processing'
    or v_job.lease_owner is distinct from v_requested_worker_id
    or v_job.lease_generation is distinct from v_requested_lease_generation
    or v_job.lease_expires_at is null
    or v_job.lease_expires_at < v_now
    or v_job.attempt_count >= v_job.max_attempts then
    return jsonb_build_object('started', false);
  end if;

  select permit.*
    into strict v_permit
  from public.youtube_extractor_permits as permit
  where permit.permit_key = 'primary'
  for update;

  if v_permit.owner_id is distinct from v_requested_worker_id
    or v_permit.permit_generation is distinct from v_requested_permit_generation
    or v_permit.expires_at is null
    or v_permit.expires_at < v_now then
    return jsonb_build_object('started', false);
  end if;

  update public.youtube_extraction_jobs as job
  set attempt_count = attempt_count + 1,
      started_at = coalesce(job.started_at, v_now),
      updated_at = v_now
  where job.id = v_requested_job_id
    and job.status = 'processing'
    and job.lease_owner = v_requested_worker_id
    and job.lease_generation = v_requested_lease_generation
    and job.lease_expires_at is not null
    and job.lease_expires_at >= v_now
    and job.attempt_count < job.max_attempts
  returning *
    into v_job;

  if not found then
    return jsonb_build_object('started', false);
  end if;

  return jsonb_build_object(
    'started', true,
    'job_id', v_job.id,
    'attempt_count', v_job.attempt_count
  );
end;
$function$;

-- signature: private.youtube_extraction_job_fence_is_active(uuid, text, bigint)
create or replace function private.youtube_extraction_job_fence_is_active(
  p_job_id uuid,
  p_worker_id text,
  p_lease_generation bigint
)
returns boolean
language sql
stable
set search_path = ''
as $function$
  select exists (
    select 1
    from public.youtube_extraction_jobs as job
    where job.id = p_job_id
      and job.status = 'processing'
      and job.lease_owner = p_worker_id
      and job.lease_generation = p_lease_generation
      and job.lease_expires_at is not null
      and job.lease_expires_at >= clock_timestamp()
  );
$function$;

-- signature: private.youtube_extraction_worker_write_fence_is_active(uuid, text, bigint, bigint)
create or replace function private.youtube_extraction_worker_write_fence_is_active(
  p_job_id uuid,
  p_worker_id text,
  p_lease_generation bigint,
  p_permit_generation bigint
)
returns boolean
language plpgsql
volatile
set search_path = ''
as $function$
declare
  v_job_active boolean := false;
  v_permit_active boolean := false;
begin
  select true
    into v_job_active
  from public.youtube_extraction_jobs as job
  where job.id = p_job_id
    and job.status = 'processing'
    and job.lease_owner = p_worker_id
    and job.lease_generation = p_lease_generation
    and job.lease_expires_at is not null
    and job.lease_expires_at >= clock_timestamp()
  for update of job;

  if not coalesce(v_job_active, false) then
    return false;
  end if;

  select true
    into v_permit_active
  from public.youtube_extractor_permits as permit
  where permit.permit_key = 'primary'
    and permit.owner_id = p_worker_id
    and permit.permit_generation = p_permit_generation
    and permit.expires_at is not null
    and permit.expires_at >= clock_timestamp()
  for update of permit;

  return coalesce(v_permit_active, false);
end;
$function$;

-- signature: public.requeue_youtube_extraction_job_without_attempt(uuid, text, bigint, integer, integer)
create or replace function public.requeue_youtube_extraction_job_without_attempt(
  job_id uuid,
  worker_id text,
  lease_generation bigint,
  min_delay_seconds integer,
  max_delay_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_min integer := greatest(1, min_delay_seconds);
  v_max integer := least(30, max_delay_seconds);
  v_delay integer;
begin
  perform public.check_youtube_extraction_worker_pre_request();
  if job_id is null or coalesce(btrim(worker_id), '') = ''
    or lease_generation is null or min_delay_seconds is null
    or max_delay_seconds is null or v_min > v_max then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;
  v_delay := v_min + floor(random() * (v_max - v_min + 1))::integer;

  update public.youtube_extraction_jobs as job
  set status = 'queued',
      available_at = clock_timestamp() + make_interval(secs => v_delay),
      lease_owner = null,
      lease_expires_at = null,
      heartbeat_at = null,
      updated_at = clock_timestamp()
  where job.id = requeue_youtube_extraction_job_without_attempt.job_id
    and job.status = 'processing'
    and job.lease_owner = requeue_youtube_extraction_job_without_attempt.worker_id
    and job.lease_generation = requeue_youtube_extraction_job_without_attempt.lease_generation
    and job.lease_expires_at is not null
    and job.lease_expires_at >= clock_timestamp();

  if not found then
    return jsonb_build_object('applied', false, 'requeued', false);
  end if;
  return jsonb_build_object('applied', true, 'requeued', true, 'delay_seconds', v_delay);
end;
$function$;

-- signature: public.update_youtube_extraction_job_title(uuid, text, bigint, bigint, text)
create or replace function public.update_youtube_extraction_job_title(
  job_id uuid,
  worker_id text,
  lease_generation bigint,
  permit_generation bigint,
  title text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_title text := left(nullif(btrim(regexp_replace(title, '[[:cntrl:][:space:]]+', ' ', 'g')), ''), 160);
begin
  perform public.check_youtube_extraction_worker_pre_request();
  if v_title is null then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;
  if not private.youtube_extraction_worker_write_fence_is_active(
    job_id, worker_id, lease_generation, permit_generation
  ) then
    return jsonb_build_object('applied', false, 'updated', false);
  end if;
  update public.youtube_extraction_jobs as job
  set video_title_snapshot = coalesce(job.video_title_snapshot, v_title),
      updated_at = clock_timestamp()
  where job.id = update_youtube_extraction_job_title.job_id
    and job.status = 'processing'
    and job.lease_owner = update_youtube_extraction_job_title.worker_id
    and job.lease_generation = update_youtube_extraction_job_title.lease_generation;
  return jsonb_build_object('applied', found, 'updated', found);
end;
$function$;

-- signature: public.read_youtube_extraction_worker_catalog(uuid, text, bigint)
create or replace function public.read_youtube_extraction_worker_catalog(
  job_id uuid,
  worker_id text,
  lease_generation bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform public.check_youtube_extraction_worker_pre_request();
  if not private.youtube_extraction_job_fence_is_active(job_id, worker_id, lease_generation) then
    return jsonb_build_object('applied', false);
  end if;
  return jsonb_build_object(
    'applied', true,
    'ingredients', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.standard_name)
      from (select id, standard_name, category, default_unit from public.ingredients) row_value), '[]'::jsonb),
    'ingredient_synonyms', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.synonym)
      from (select ingredient_id, synonym from public.ingredient_synonyms) row_value), '[]'::jsonb),
    'cooking_methods', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.display_order, row_value.code)
      from (select id, code, label, color_key, is_system, display_order from public.cooking_methods) row_value), '[]'::jsonb)
  );
end;
$function$;

-- signature: public.resolve_youtube_extraction_worker_methods(uuid, text, bigint, bigint, text[])
create or replace function public.resolve_youtube_extraction_worker_methods(
  job_id uuid,
  worker_id text,
  lease_generation bigint,
  permit_generation bigint,
  method_labels text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_label text;
  v_method public.cooking_methods%rowtype;
  v_methods jsonb := '[]'::jsonb;
  v_code text;
  v_job public.youtube_extraction_jobs%rowtype;
  v_is_new boolean;
begin
  perform public.check_youtube_extraction_worker_pre_request();
  if not private.youtube_extraction_worker_write_fence_is_active(
    job_id, worker_id, lease_generation, permit_generation
  ) then
    return jsonb_build_object('applied', false, 'methods', v_methods);
  end if;
  select job.* into v_job from public.youtube_extraction_jobs as job
  where job.id = resolve_youtube_extraction_worker_methods.job_id
    and job.status = 'processing'
    and job.lease_owner = resolve_youtube_extraction_worker_methods.worker_id
    and job.lease_generation = resolve_youtube_extraction_worker_methods.lease_generation
    and job.lease_expires_at >= clock_timestamp()
  for update;
  if not found then
    return jsonb_build_object('applied', false, 'methods', v_methods);
  end if;
  if method_labels is null or cardinality(method_labels) > 100 then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;
  foreach v_label in array method_labels loop
    v_is_new := false;
    v_label := left(nullif(btrim(regexp_replace(v_label, '[[:cntrl:][:space:]]+', ' ', 'g')), ''), 20);
    if v_label is null then raise exception 'VALIDATION_ERROR' using errcode = '22023'; end if;
    select method.* into v_method from public.cooking_methods method
    where lower(method.label) = lower(v_label) or lower(method.code) = lower(v_label)
    order by method.is_system desc, method.display_order, method.id limit 1;
    if not found then
      v_code := 'custom_' || substr(encode(extensions.digest(convert_to(lower(v_label), 'UTF8'), 'sha256'), 'hex'), 1, 12);
      insert into public.cooking_methods(code, label, color_key, is_system, display_order)
      values (v_code, v_label, 'unassigned', false, 9999)
      on conflict (code) do update set code = excluded.code
      returning * into v_method;
      v_is_new := true;
    end if;
    v_methods := v_methods || jsonb_build_array(jsonb_build_object(
      'id', v_method.id, 'code', v_method.code, 'label', v_method.label,
      'color_key', v_method.color_key, 'is_system', v_method.is_system,
      'is_new', v_is_new
    ));
  end loop;
  return jsonb_build_object('applied', true, 'methods', v_methods);
end;
$function$;

-- signature: public.access_youtube_extraction_worker_cache(uuid, text, bigint, bigint, text, jsonb)
create or replace function public.access_youtube_extraction_worker_cache(
  job_id uuid,
  worker_id text,
  lease_generation bigint,
  permit_generation bigint,
  cache_operation text,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.youtube_extraction_jobs%rowtype;
  v_result jsonb;
begin
  perform public.check_youtube_extraction_worker_pre_request();
  if not private.youtube_extraction_worker_write_fence_is_active(
    job_id, worker_id, lease_generation, permit_generation
  ) then
    return jsonb_build_object('applied', false);
  end if;
  select job.* into v_job from public.youtube_extraction_jobs job
  where job.id = access_youtube_extraction_worker_cache.job_id
    and job.status = 'processing'
    and job.lease_owner = access_youtube_extraction_worker_cache.worker_id
    and job.lease_generation = access_youtube_extraction_worker_cache.lease_generation
    and job.lease_expires_at >= clock_timestamp()
  for update;
  if not found then return jsonb_build_object('applied', false); end if;
  if cache_operation not in (
    'transcript_read','transcript_upsert','transcript_touch',
    'llm_read','llm_upsert','llm_touch','visual_read','visual_upsert','visual_touch'
  ) or payload is null then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;

  if cache_operation = 'transcript_read' then
    select to_jsonb(cache) into v_result from public.youtube_transcript_cache cache
    where cache.youtube_video_id = v_job.youtube_video_id and cache.expires_at > clock_timestamp()
    order by cache.last_used_at desc limit 1;
  elsif cache_operation = 'transcript_upsert' then
    insert into public.youtube_transcript_cache (
      youtube_video_id, language, source_provider, source_kind,
      transcript_text, segments_json, expires_at, last_used_at
    ) values (
      v_job.youtube_video_id, payload ->> 'language', payload ->> 'source_provider',
      coalesce(payload ->> 'source_kind', 'caption'), payload ->> 'transcript_text',
      coalesce(payload -> 'segments_json', '[]'::jsonb),
      (payload ->> 'expires_at')::timestamptz, clock_timestamp()
    ) on conflict (youtube_video_id, language, source_provider) do update
      set transcript_text = excluded.transcript_text, segments_json = excluded.segments_json,
          expires_at = excluded.expires_at, last_used_at = excluded.last_used_at
    returning to_jsonb(youtube_transcript_cache.*) into v_result;
  elsif cache_operation = 'transcript_touch' then
    update public.youtube_transcript_cache set last_used_at = clock_timestamp()
    where id = (payload ->> 'id')::uuid and youtube_video_id = v_job.youtube_video_id
    returning to_jsonb(youtube_transcript_cache.*) into v_result;
  elsif cache_operation = 'llm_read' then
    select to_jsonb(cache) into v_result from public.youtube_llm_extraction_cache cache
    where cache.youtube_video_id = v_job.youtube_video_id
      and cache.source_hash = payload ->> 'source_hash'
      and cache.schema_version = payload ->> 'schema_version'
      and cache.model = payload ->> 'model' and cache.expires_at > clock_timestamp()
    order by cache.last_used_at desc limit 1;
  elsif cache_operation = 'llm_upsert' then
    insert into public.youtube_llm_extraction_cache (
      youtube_video_id, source_hash, schema_version, model, source_kinds,
      result_json, expires_at, last_used_at
    ) values (
      v_job.youtube_video_id, payload ->> 'source_hash', payload ->> 'schema_version',
      payload ->> 'model', coalesce(array(select jsonb_array_elements_text(payload -> 'source_kinds')), '{}'::text[]),
      payload -> 'result_json', (payload ->> 'expires_at')::timestamptz, clock_timestamp()
    ) on conflict (youtube_video_id, source_hash, schema_version, model) do update
      set source_kinds = excluded.source_kinds, result_json = excluded.result_json,
          expires_at = excluded.expires_at, last_used_at = excluded.last_used_at
    returning to_jsonb(youtube_llm_extraction_cache.*) into v_result;
  elsif cache_operation = 'llm_touch' then
    update public.youtube_llm_extraction_cache set last_used_at = clock_timestamp()
    where id = (payload ->> 'id')::uuid and youtube_video_id = v_job.youtube_video_id
    returning to_jsonb(youtube_llm_extraction_cache.*) into v_result;
  elsif cache_operation = 'visual_read' then
    select to_jsonb(cache) into v_result from public.youtube_visual_extraction_cache cache
    where cache.youtube_video_id = v_job.youtube_video_id
      and cache.provider = payload ->> 'provider'
      and cache.schema_version = payload ->> 'schema_version'
      and cache.visual_request_hash = payload ->> 'visual_request_hash'
      and cache.expires_at > clock_timestamp() order by cache.last_used_at desc limit 1;
  elsif cache_operation = 'visual_upsert' then
    insert into public.youtube_visual_extraction_cache (
      youtube_video_id, provider, schema_version, visual_request_hash,
      result_json, expires_at, last_used_at
    ) values (
      v_job.youtube_video_id, payload ->> 'provider', payload ->> 'schema_version',
      payload ->> 'visual_request_hash', payload -> 'result_json',
      (payload ->> 'expires_at')::timestamptz, clock_timestamp()
    ) on conflict (youtube_video_id, provider, schema_version, visual_request_hash) do update
      set result_json = excluded.result_json, expires_at = excluded.expires_at,
          last_used_at = excluded.last_used_at
    returning to_jsonb(youtube_visual_extraction_cache.*) into v_result;
  else
    update public.youtube_visual_extraction_cache set last_used_at = clock_timestamp()
    where id = (payload ->> 'id')::uuid and youtube_video_id = v_job.youtube_video_id
    returning to_jsonb(youtube_visual_extraction_cache.*) into v_result;
  end if;
  return jsonb_build_object('applied', true, 'cache', v_result);
end;
$function$;

-- signature: public.record_youtube_extraction_worker_event(uuid, text, bigint, bigint, text, jsonb)
create or replace function public.record_youtube_extraction_worker_event(
  job_id uuid,
  worker_id text,
  lease_generation bigint,
  permit_generation bigint,
  event_kind text,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_job public.youtube_extraction_jobs%rowtype;
begin
  perform public.check_youtube_extraction_worker_pre_request();
  if not private.youtube_extraction_worker_write_fence_is_active(
    job_id, worker_id, lease_generation, permit_generation
  ) then
    return jsonb_build_object('applied', false, 'recorded', false);
  end if;
  select job.* into v_job from public.youtube_extraction_jobs job
  where job.id = record_youtube_extraction_worker_event.job_id
    and job.status = 'processing'
    and job.lease_owner = record_youtube_extraction_worker_event.worker_id
    and job.lease_generation = record_youtube_extraction_worker_event.lease_generation
    and job.lease_expires_at >= clock_timestamp()
  for update;
  if not found then return jsonb_build_object('applied', false, 'recorded', false); end if;
  if event_kind = 'transcript' then
    insert into public.youtube_transcript_fetch_events (
      user_id, youtube_video_id, provider, cache_hit, status, reason, estimated_cost_microusd
    ) values (v_job.user_id, v_job.youtube_video_id, payload ->> 'provider',
      coalesce((payload ->> 'cache_hit')::boolean, false), payload ->> 'status',
      payload ->> 'reason', coalesce((payload ->> 'estimated_cost_microusd')::integer, 0));
  elsif event_kind = 'llm' then
    insert into public.youtube_llm_extraction_events (
      user_id, youtube_video_id, provider, model, cache_hit, status, reason,
      input_tokens, output_tokens, estimated_cost_microusd
    ) values (v_job.user_id, v_job.youtube_video_id, payload ->> 'provider', payload ->> 'model',
      coalesce((payload ->> 'cache_hit')::boolean, false), payload ->> 'status', payload ->> 'reason',
      coalesce((payload ->> 'input_tokens')::integer, 0), coalesce((payload ->> 'output_tokens')::integer, 0),
      coalesce((payload ->> 'estimated_cost_microusd')::integer, 0));
  elsif event_kind = 'visual' then
    insert into public.youtube_visual_extraction_events (
      user_id, youtube_video_id, provider, model, cache_hit, event_type, status,
      reason, input_tokens, output_tokens, estimated_cost_microusd
    ) values (v_job.user_id, v_job.youtube_video_id, payload ->> 'provider', payload ->> 'model',
      coalesce((payload ->> 'cache_hit')::boolean, false), payload ->> 'event_type', payload ->> 'status',
      payload ->> 'reason', coalesce((payload ->> 'input_tokens')::integer, 0),
      coalesce((payload ->> 'output_tokens')::integer, 0), coalesce((payload ->> 'estimated_cost_microusd')::integer, 0));
  else raise exception 'VALIDATION_ERROR' using errcode = '22023'; end if;
  return jsonb_build_object('applied', true, 'recorded', true);
end;
$function$;

-- signature: public.reserve_youtube_extraction_worker_quota(uuid, text, bigint, bigint, text, integer)
create or replace function public.reserve_youtube_extraction_worker_quota(
  job_id uuid,
  worker_id text,
  lease_generation bigint,
  permit_generation bigint,
  provider text,
  units integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_job public.youtube_extraction_jobs%rowtype; v_used integer;
begin
  perform public.check_youtube_extraction_worker_pre_request();
  if units is distinct from 1
    or provider not in ('external_transcript_api', 'gemini') then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;
  if not private.youtube_extraction_worker_write_fence_is_active(
    job_id, worker_id, lease_generation, permit_generation
  ) then
    return jsonb_build_object('applied', false, 'reserved', false);
  end if;
  select job.* into v_job from public.youtube_extraction_jobs job
  where job.id = reserve_youtube_extraction_worker_quota.job_id
    and job.status = 'processing'
    and job.lease_owner = reserve_youtube_extraction_worker_quota.worker_id
    and job.lease_generation = reserve_youtube_extraction_worker_quota.lease_generation
    and job.lease_expires_at >= clock_timestamp() for update;
  if not found then return jsonb_build_object('applied', false, 'reserved', false); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(provider || ':' || v_job.user_id::text, 86120319));
  if provider = 'external_transcript_api' then
    select count(*) into v_used from public.youtube_transcript_fetch_events as event
    where event.user_id = v_job.user_id
      and event.provider = reserve_youtube_extraction_worker_quota.provider
      and not event.cache_hit
      and event.reason = 'worker_quota_reserved'
      and event.created_at >= date_trunc('day', clock_timestamp() at time zone 'UTC') at time zone 'UTC';
  else
    select count(*) into v_used from public.youtube_llm_extraction_events as event
    where event.user_id = v_job.user_id
      and event.provider = reserve_youtube_extraction_worker_quota.provider
      and not event.cache_hit
      and event.reason = 'worker_quota_reserved'
      and event.created_at >= date_trunc('day', clock_timestamp() at time zone 'UTC') at time zone 'UTC';
  end if;
  if v_used + units > 5 then
    return jsonb_build_object('applied', true, 'reserved', false, 'used', v_used);
  end if;
  if provider = 'external_transcript_api' then
    insert into public.youtube_transcript_fetch_events(
      user_id, youtube_video_id, provider, cache_hit, status, reason, estimated_cost_microusd
    ) values (v_job.user_id, v_job.youtube_video_id,
      reserve_youtube_extraction_worker_quota.provider, false, 'skipped', 'worker_quota_reserved', 0);
  else
    insert into public.youtube_llm_extraction_events(
      user_id, youtube_video_id, provider, model, cache_hit, status, reason,
      input_tokens, output_tokens, estimated_cost_microusd
    ) values (v_job.user_id, v_job.youtube_video_id,
      reserve_youtube_extraction_worker_quota.provider, null, false, 'skipped',
      'worker_quota_reserved', 0, 0, 0);
  end if;
  return jsonb_build_object('applied', true, 'reserved', true, 'used', v_used + units);
end;
$function$;

create or replace function public.read_youtube_extraction_enqueue_readiness()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_claims jsonb := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
  v_policy private.youtube_extraction_current_policy%rowtype;
  v_credential private.youtube_extraction_worker_credentials%rowtype;
  v_snapshot_digest text;
  v_catalog_preimage text;
  v_catalog_fingerprint text;
begin
  if not (
    (
      coalesce(v_claims ->> 'role', '') = 'authenticated'
      and nullif(v_claims ->> 'sub', '') is not null
    )
    or coalesce(v_claims ->> 'role', '') = 'youtube_extraction_worker'
  ) then
    raise exception 'YOUTUBE_EXTRACTION_ENQUEUE_UNAUTHORIZED'
      using errcode = '42501';
  end if;

  select policy.* into strict v_policy
  from private.youtube_extraction_current_policy as policy
  where policy.policy_key = 'primary';
  select credential.* into strict v_credential
  from private.youtube_extraction_worker_credentials as credential
  where credential.credential_name = 'primary';

  v_snapshot_digest := private.youtube_extraction_policy_snapshot_digest(
    v_policy.extractor_mode,
    v_policy.pipeline_identity,
    v_policy.result_affecting_options,
    v_policy.policy_version
  );

  v_catalog_preimage := pg_catalog.concat_ws(
    E'\n',
    'youtube-extraction-live-catalog-v1',
    'tables',
    coalesce((
      select pg_catalog.string_agg(
        pg_catalog.format('%I.%I', table_row.schemaname, table_row.tablename),
        E'\n'
        order by table_row.schemaname, table_row.tablename
      )
      from pg_catalog.pg_tables as table_row
      where (
        table_row.schemaname = 'private'
        and table_row.tablename like 'youtube_extraction%'
      ) or (
        table_row.schemaname = 'public'
        and (
          table_row.tablename like 'youtube_extraction%'
          or table_row.tablename like 'youtube_extractor%'
          or table_row.tablename like 'youtube_llm_extraction%'
          or table_row.tablename like 'youtube_transcript%'
          or table_row.tablename like 'youtube_visual_extraction%'
          or table_row.tablename in ('cooking_methods', 'ingredient_synonyms', 'ingredients')
        )
      )
    ), ''),
    'columns',
    coalesce((
      select pg_catalog.string_agg(
        namespace.nspname || '.' || relation.relname || '.' || attribute.attname
          || '|position=' || attribute.attnum::text
          || '|type=' || pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
          || '|not_null=' || attribute.attnotnull::text
          || '|identity=' || attribute.attidentity::text
          || '|generated=' || attribute.attgenerated::text
          || '|default=' || coalesce(
            pg_catalog.pg_get_expr(attribute_default.adbin, attribute_default.adrelid),
            ''
          ),
        E'\n'
        order by namespace.nspname, relation.relname, attribute.attnum
      )
      from pg_catalog.pg_attribute as attribute
      join pg_catalog.pg_class as relation on relation.oid = attribute.attrelid
      join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
      left join pg_catalog.pg_attrdef as attribute_default
        on attribute_default.adrelid = attribute.attrelid
       and attribute_default.adnum = attribute.attnum
      where attribute.attnum > 0
        and not attribute.attisdropped
        and namespace.nspname || '.' || relation.relname in (
          'private.youtube_extraction_current_policy',
          'private.youtube_extraction_worker_credentials',
          'public.cooking_methods',
          'public.ingredient_synonyms',
          'public.ingredients',
          'public.youtube_extraction_candidates',
          'public.youtube_extraction_jobs',
          'public.youtube_extraction_sessions',
          'public.youtube_extractor_permits',
          'public.youtube_llm_extraction_cache',
          'public.youtube_llm_extraction_events',
          'public.youtube_transcript_cache',
          'public.youtube_transcript_fetch_events',
          'public.youtube_visual_extraction_cache',
          'public.youtube_visual_extraction_events'
        )
    ), ''),
    'constraints',
    coalesce((
      select pg_catalog.string_agg(
        namespace.nspname || '.' || relation.relname || '|' || constraint_row.conname
          || '|type=' || constraint_row.contype::text
          || '|definition=' || pg_catalog.pg_get_constraintdef(constraint_row.oid, true),
        E'\n'
        order by namespace.nspname, relation.relname, constraint_row.conname
      )
      from pg_catalog.pg_constraint as constraint_row
      join pg_catalog.pg_class as relation on relation.oid = constraint_row.conrelid
      join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname || '.' || relation.relname in (
        'private.youtube_extraction_current_policy',
        'private.youtube_extraction_worker_credentials',
        'public.cooking_methods',
        'public.ingredient_synonyms',
        'public.ingredients',
        'public.youtube_extraction_candidates',
        'public.youtube_extraction_jobs',
        'public.youtube_extraction_sessions',
        'public.youtube_extractor_permits',
        'public.youtube_llm_extraction_cache',
        'public.youtube_llm_extraction_events',
        'public.youtube_transcript_cache',
        'public.youtube_transcript_fetch_events',
        'public.youtube_visual_extraction_cache',
        'public.youtube_visual_extraction_events'
      )
    ), ''),
    'indexes',
    coalesce((
      select pg_catalog.string_agg(
        namespace.nspname || '.' || relation.relname || '|' || index_relation.relname
          || '|unique=' || index_row.indisunique::text
          || '|primary=' || index_row.indisprimary::text
          || '|valid=' || index_row.indisvalid::text
          || '|definition=' || pg_catalog.pg_get_indexdef(index_row.indexrelid),
        E'\n'
        order by namespace.nspname, relation.relname, index_relation.relname
      )
      from pg_catalog.pg_index as index_row
      join pg_catalog.pg_class as relation on relation.oid = index_row.indrelid
      join pg_catalog.pg_class as index_relation on index_relation.oid = index_row.indexrelid
      join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname || '.' || relation.relname in (
        'private.youtube_extraction_current_policy',
        'private.youtube_extraction_worker_credentials',
        'public.cooking_methods',
        'public.ingredient_synonyms',
        'public.ingredients',
        'public.youtube_extraction_candidates',
        'public.youtube_extraction_jobs',
        'public.youtube_extraction_sessions',
        'public.youtube_extractor_permits',
        'public.youtube_llm_extraction_cache',
        'public.youtube_llm_extraction_events',
        'public.youtube_transcript_cache',
        'public.youtube_transcript_fetch_events',
        'public.youtube_visual_extraction_cache',
        'public.youtube_visual_extraction_events'
      )
    ), ''),
    'table_owners',
    coalesce((
      select pg_catalog.string_agg(
        namespace.nspname || '.' || relation.relname
          || '|owner=' || pg_catalog.pg_get_userbyid(relation.relowner),
        E'\n'
        order by namespace.nspname, relation.relname
      )
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
      where relation.relkind in ('r', 'p')
        and (
          (namespace.nspname = 'private' and relation.relname like 'youtube_extraction%')
          or (
            namespace.nspname = 'public'
            and (
              relation.relname like 'youtube_extraction%'
              or relation.relname like 'youtube_extractor%'
              or relation.relname like 'youtube_llm_extraction%'
              or relation.relname like 'youtube_transcript%'
              or relation.relname like 'youtube_visual_extraction%'
              or relation.relname in ('cooking_methods', 'ingredient_synonyms', 'ingredients')
            )
          )
        )
    ), ''),
    'sequence_owners',
    coalesce((
      select pg_catalog.string_agg(
        namespace.nspname || '.' || relation.relname
          || '|owner=' || pg_catalog.pg_get_userbyid(relation.relowner),
        E'\n'
        order by namespace.nspname, relation.relname
      )
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
      where relation.relkind = 'S'
        and namespace.nspname in ('private', 'public')
        and relation.relname like 'youtube%'
    ), ''),
    'schema_owners',
    coalesce((
      select pg_catalog.string_agg(
        namespace.nspname
          || '|owner=' || pg_catalog.pg_get_userbyid(namespace.nspowner),
        E'\n'
        order by namespace.nspname
      )
      from pg_catalog.pg_namespace as namespace
      where namespace.nspname in ('private', 'public')
    ), ''),
    'roles',
    coalesce((
      select pg_catalog.string_agg(role_row.rolname, E'\n' order by role_row.rolname)
      from pg_catalog.pg_roles as role_row
      where role_row.rolname like 'youtube_extraction%'
    ), ''),
    'role_attributes',
    coalesce((
      select pg_catalog.string_agg(
        pg_catalog.format(
          '%s|super=%s|inherit=%s|createrole=%s|createdb=%s|login=%s|replication=%s|bypassrls=%s|config=%s',
          role_row.rolname,
          role_row.rolsuper,
          role_row.rolinherit,
          role_row.rolcreaterole,
          role_row.rolcreatedb,
          role_row.rolcanlogin,
          role_row.rolreplication,
          role_row.rolbypassrls,
          coalesce((
            select pg_catalog.string_agg(setting, ',' order by setting)
            from pg_catalog.unnest(role_row.rolconfig) as setting
          ), '')
        ),
        E'\n'
        order by role_row.rolname
      )
      from pg_catalog.pg_roles as role_row
      where role_row.rolname like 'youtube_extraction%'
    ), ''),
    'owner_role_attributes',
    coalesce((
      select pg_catalog.string_agg(
        pg_catalog.format(
          '%s|super=%s|inherit=%s|createrole=%s|createdb=%s|login=%s|replication=%s|bypassrls=%s|config=%s',
          role_row.rolname,
          role_row.rolsuper,
          role_row.rolinherit,
          role_row.rolcreaterole,
          role_row.rolcreatedb,
          role_row.rolcanlogin,
          role_row.rolreplication,
          role_row.rolbypassrls,
          coalesce((
            select pg_catalog.string_agg(setting, ',' order by setting)
            from pg_catalog.unnest(role_row.rolconfig) as setting
          ), '')
        ),
        E'\n'
        order by role_row.rolname
      )
      from pg_catalog.pg_roles as role_row
      where role_row.oid in (
        select relation.relowner
        from pg_catalog.pg_class as relation
        join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
        where (
          relation.relkind in ('r', 'p')
          and (
            (namespace.nspname = 'private' and relation.relname like 'youtube_extraction%')
            or (
              namespace.nspname = 'public'
              and (
                relation.relname like 'youtube_extraction%'
                or relation.relname like 'youtube_extractor%'
                or relation.relname like 'youtube_llm_extraction%'
                or relation.relname like 'youtube_transcript%'
                or relation.relname like 'youtube_visual_extraction%'
                or relation.relname in ('cooking_methods', 'ingredient_synonyms', 'ingredients')
              )
            )
          )
        ) or (
          relation.relkind = 'S'
          and namespace.nspname in ('private', 'public')
          and relation.relname like 'youtube%'
        )
        union
        select namespace.nspowner
        from pg_catalog.pg_namespace as namespace
        where namespace.nspname in ('private', 'public')
      )
    ), ''),
    'memberships',
    coalesce((
      select pg_catalog.string_agg(
        member_role.rolname || '->' || granted_role.rolname
          || '|admin=' || membership.admin_option::text
          || '|inherit=' || coalesce(
            (pg_catalog.to_jsonb(membership) ->> 'inherit_option')::boolean,
            false
          )::text
          || '|set=' || coalesce(
            (pg_catalog.to_jsonb(membership) ->> 'set_option')::boolean,
            true
          )::text,
        E'\n'
        order by member_role.rolname, granted_role.rolname
      )
      from pg_catalog.pg_auth_members as membership
      join pg_catalog.pg_roles as granted_role on granted_role.oid = membership.roleid
      join pg_catalog.pg_roles as member_role on member_role.oid = membership.member
      where (
        granted_role.rolname like 'youtube_extraction%'
        or member_role.rolname like 'youtube_extraction%'
      )
      and not (
        member_role.rolname = 'postgres'
        and granted_role.rolname like 'youtube_extraction%'
        and membership.admin_option
        and coalesce((pg_catalog.to_jsonb(membership) ->> 'inherit_option')::boolean, false) = false
        and coalesce((pg_catalog.to_jsonb(membership) ->> 'set_option')::boolean, false) = false
      )
    ), ''),
    'table_security',
    coalesce((
      select pg_catalog.string_agg(
        namespace.nspname || '.' || relation.relname
          || '|rls=' || relation.relrowsecurity::text
          || '|force=' || relation.relforcerowsecurity::text,
        E'\n'
        order by namespace.nspname, relation.relname
      )
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
      where relation.relkind in ('r', 'p')
        and (
          (namespace.nspname = 'private' and relation.relname like 'youtube_extraction%')
          or (
            namespace.nspname = 'public'
            and (
              relation.relname like 'youtube_extraction%'
              or relation.relname like 'youtube_extractor%'
              or relation.relname like 'youtube_llm_extraction%'
              or relation.relname like 'youtube_transcript%'
              or relation.relname like 'youtube_visual_extraction%'
              or relation.relname in ('cooking_methods', 'ingredient_synonyms', 'ingredients')
            )
          )
        )
    ), ''),
    'rls_policies',
    coalesce((
      select pg_catalog.string_agg(
        policy.schemaname || '.' || policy.tablename
          || '|' || policy.policyname
          || '|permissive=' || policy.permissive
          || '|cmd=' || policy.cmd
          || '|roles=' || coalesce(pg_catalog.array_to_string(policy.roles, ','), '')
          || '|qual=' || coalesce(policy.qual, '')
          || '|check=' || coalesce(policy.with_check, ''),
        E'\n'
        order by policy.schemaname, policy.tablename, policy.policyname
      )
      from pg_catalog.pg_policies as policy
      where (
        policy.schemaname = 'private'
        and policy.tablename like 'youtube_extraction%'
      ) or (
        policy.schemaname = 'public'
        and (
          policy.tablename like 'youtube_extraction%'
          or policy.tablename like 'youtube_extractor%'
          or policy.tablename like 'youtube_llm_extraction%'
          or policy.tablename like 'youtube_transcript%'
          or policy.tablename like 'youtube_visual_extraction%'
          or policy.tablename in ('cooking_methods', 'ingredient_synonyms', 'ingredients')
        )
      )
    ), ''),
    'table_privileges',
    coalesce((
      select pg_catalog.string_agg(
        namespace.nspname || '.' || relation.relname
          || '|' || coalesce(grantee.rolname, 'PUBLIC')
          || '|' || privilege.privilege_type
          || '|grantable=' || privilege.is_grantable::text,
        E'\n'
        order by namespace.nspname, relation.relname,
          coalesce(grantee.rolname, 'PUBLIC'), privilege.privilege_type
      )
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
      cross join lateral pg_catalog.aclexplode(
        coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
      ) as privilege
      left join pg_catalog.pg_roles as grantee on grantee.oid = privilege.grantee
      where relation.relkind in ('r', 'p')
        and (
          (namespace.nspname = 'private' and relation.relname like 'youtube_extraction%')
          or (
            namespace.nspname = 'public'
            and (
              relation.relname like 'youtube_extraction%'
              or relation.relname like 'youtube_extractor%'
              or relation.relname like 'youtube_llm_extraction%'
              or relation.relname like 'youtube_transcript%'
              or relation.relname like 'youtube_visual_extraction%'
              or relation.relname in ('cooking_methods', 'ingredient_synonyms', 'ingredients')
            )
          )
        )
    ), ''),
    'sequence_privileges',
    coalesce((
      select pg_catalog.string_agg(
        namespace.nspname || '.' || relation.relname
          || '|' || coalesce(grantee.rolname, 'PUBLIC')
          || '|' || privilege.privilege_type
          || '|grantable=' || privilege.is_grantable::text,
        E'\n'
        order by namespace.nspname, relation.relname,
          coalesce(grantee.rolname, 'PUBLIC'), privilege.privilege_type
      )
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
      cross join lateral pg_catalog.aclexplode(
        coalesce(relation.relacl, pg_catalog.acldefault('S', relation.relowner))
      ) as privilege
      left join pg_catalog.pg_roles as grantee on grantee.oid = privilege.grantee
      where relation.relkind = 'S'
        and namespace.nspname in ('private', 'public')
        and relation.relname like 'youtube%'
    ), ''),
    'rpc_signatures',
    coalesce((
      select pg_catalog.string_agg(
        namespace.nspname || '.' || procedure.proname || '('
          || pg_catalog.replace(
            pg_catalog.oidvectortypes(procedure.proargtypes),
            ', ',
            ','
          ) || ')',
        E'\n'
        order by procedure.proname, procedure.proargtypes::text
      )
      from pg_catalog.pg_proc as procedure
      join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
      where namespace.nspname = 'public'
        and (
          procedure.proname like '%youtube_extraction%'
          or procedure.proname like '%youtube_extractor_permit%'
        )
    ), ''),
    'rpc_security',
    coalesce((
      select pg_catalog.string_agg(
        namespace.nspname || '.' || procedure.proname || '('
          || pg_catalog.replace(
            pg_catalog.oidvectortypes(procedure.proargtypes),
            ', ',
            ','
          ) || ')'
          || '|owner=' || pg_catalog.pg_get_userbyid(procedure.proowner)
          || '|security_definer=' || procedure.prosecdef::text
          || '|config=' || coalesce((
            select pg_catalog.string_agg(setting, ',' order by setting)
            from pg_catalog.unnest(procedure.proconfig) as setting
          ), '')
          || '|acl=' || coalesce((
            select pg_catalog.string_agg(
              coalesce(grantee.rolname, 'PUBLIC') || ':'
                || privilege.privilege_type || ':' || privilege.is_grantable::text,
              ','
              order by coalesce(grantee.rolname, 'PUBLIC'), privilege.privilege_type
            )
            from pg_catalog.aclexplode(
              coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))
            ) as privilege
            left join pg_catalog.pg_roles as grantee on grantee.oid = privilege.grantee
          ), ''),
        E'\n'
        order by namespace.nspname, procedure.proname, procedure.proargtypes::text
      )
      from pg_catalog.pg_proc as procedure
      join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
      where (
        namespace.nspname = 'public'
        and (
          procedure.proname like '%youtube_extraction%'
          or procedure.proname like '%youtube_extractor_permit%'
        )
      ) or (
        namespace.nspname = 'private'
        and procedure.proname in (
          'assert_youtube_extraction_catalog_ready',
          'youtube_extraction_job_fence_is_active',
          'youtube_extraction_worker_write_fence_is_active'
        )
      )
    ), ''),
    'rpc_function_definitions',
    coalesce((
      select pg_catalog.string_agg(
        namespace.nspname || '.' || procedure.proname || '('
          || pg_catalog.replace(
            pg_catalog.oidvectortypes(procedure.proargtypes),
            ', ',
            ','
          ) || ')|sha256='
          || pg_catalog.encode(
            extensions.digest(
              pg_catalog.convert_to(
                case
                  when procedure.proname in (
                    'assert_youtube_extraction_catalog_ready',
                    'read_youtube_extraction_enqueue_readiness'
                  )
                    then pg_catalog.regexp_replace(
                      pg_catalog.pg_get_functiondef(procedure.oid),
                      '[0-9a-f]{64}',
                      '<catalog-fingerprint>',
                      'g'
                    )
                  else pg_catalog.pg_get_functiondef(procedure.oid)
                end,
                'UTF8'
              ),
              'sha256'
            ),
            'hex'
          ),
        E'\n'
        order by namespace.nspname, procedure.proname, procedure.proargtypes::text
      )
      from pg_catalog.pg_proc as procedure
      join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
      where (
        namespace.nspname = 'public'
        and (
          procedure.proname like '%youtube_extraction%'
          or procedure.proname like '%youtube_extractor_permit%'
        )
      ) or (
        namespace.nspname = 'private'
        and procedure.proname in (
          'assert_youtube_extraction_catalog_ready',
          'youtube_extraction_job_fence_is_active',
          'youtube_extraction_worker_write_fence_is_active'
        )
      )
    ), ''),
    'internal_scope_function_definition',
    coalesce((
      select pg_catalog.encode(
        extensions.digest(
          pg_catalog.convert_to(pg_catalog.pg_get_functiondef(procedure.oid), 'UTF8'),
          'sha256'
        ),
        'hex'
      )
      from pg_catalog.pg_proc as procedure
      where procedure.oid = pg_catalog.to_regprocedure(
        'private.verify_full_local_internal_scope()'
      )
    ), '')
  );
  v_catalog_fingerprint := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_catalog_preimage, 'UTF8'), 'sha256'),
    'hex'
  );

  return jsonb_build_object(
    'ready', v_policy.enabled
      and v_credential.allowed_snapshot_digest = v_snapshot_digest
      and v_credential.expires_at > clock_timestamp() + interval '30 minutes'
      and v_catalog_fingerprint = 'b8561e40e39a97962dab877e3d7c732236bf1bc55c8c985e56b846c50f7f90b1',
    'release_sha', v_credential.release_sha,
    'schema_identity', v_credential.schema_identity,
    'catalog_fingerprint', v_catalog_fingerprint,
    'policy_version', v_policy.policy_version,
    'policy_snapshot_digest', v_snapshot_digest,
    'fingerprint_key_version', v_policy.fingerprint_key_version,
    'previous_fingerprint_key_version', v_policy.previous_fingerprint_key_version,
    'previous_fingerprint_valid_until', v_policy.previous_fingerprint_valid_until,
    'allowed_snapshot_digest', v_credential.allowed_snapshot_digest,
    'credential_expires_at', v_credential.expires_at
  );
exception
  when no_data_found then
    return jsonb_build_object('ready', false);
end;
$function$;

create or replace function private.assert_youtube_extraction_catalog_ready()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_readiness jsonb;
begin
  v_readiness := public.read_youtube_extraction_enqueue_readiness();
  if coalesce(v_readiness ->> 'catalog_fingerprint', '')
    is distinct from 'b8561e40e39a97962dab877e3d7c732236bf1bc55c8c985e56b846c50f7f90b1' then
    raise exception 'YOUTUBE_EXTRACTION_SCHEMA_NOT_READY'
      using errcode = '55000';
  end if;
end;
$function$;

create or replace function public.read_youtube_extraction_job_projection(
  job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_claims jsonb := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
  v_role text := coalesce(nullif(v_claims ->> 'role', ''), current_user);
  v_requested_user_id uuid := nullif(v_claims ->> 'sub', '')::uuid;
  v_requested_job_id uuid := job_id;
  v_payload jsonb;
begin
  if v_role is distinct from 'authenticated'
    or v_requested_user_id is null
    or v_requested_job_id is null then
    raise exception 'YOUTUBE_EXTRACTION_INTERNAL_UNAUTHORIZED'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', job.id,
    'status', job.status,
    'created_at', to_char(job.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'started_at', case
      when job.started_at is null then null
      else to_char(job.started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    end,
    'completed_at', case
      when job.completed_at is null then null
      else to_char(job.completed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    end,
    'error_code', job.error_code,
    'youtube_video_id', job.youtube_video_id,
    'result_affecting_options', job.result_affecting_options,
    'extraction_session', case
      when session_row.id is null then null
      else jsonb_build_object(
        'id', session_row.id,
        'status', session_row.status,
        'recipe_id', session_row.recipe_id,
        'expires_at', to_char(session_row.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    end
  )
    into v_payload
  from public.youtube_extraction_jobs as job
  left join public.youtube_extraction_sessions as session_row
    on session_row.id = job.extraction_session_id
  where job.id = v_requested_job_id
    and job.user_id = v_requested_user_id;

  return v_payload;
end;
$function$;

create or replace function public.read_youtube_extraction_session_projection(
  extraction_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_claims jsonb := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
  v_role text := coalesce(nullif(v_claims ->> 'role', ''), current_user);
  v_requested_user_id uuid := nullif(v_claims ->> 'sub', '')::uuid;
  v_requested_extraction_id uuid := extraction_id;
  v_payload jsonb;
begin
  if v_role is distinct from 'authenticated'
    or v_requested_user_id is null
    or v_requested_extraction_id is null then
    raise exception 'YOUTUBE_EXTRACTION_INTERNAL_UNAUTHORIZED'
      using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', session_row.id,
    'status', session_row.status,
    'draft_json', session_row.draft_json,
    'recipe_id', session_row.recipe_id,
    'expires_at', to_char(session_row.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )
    into v_payload
  from public.youtube_extraction_sessions as session_row
  where session_row.id = v_requested_extraction_id
    and session_row.user_id = v_requested_user_id;

  return v_payload;
end;
$function$;

-- signature: public.list_youtube_extraction_job_projections(text, timestamp with time zone, timestamp with time zone, uuid, integer)
create or replace function public.list_youtube_extraction_job_projections(
  list_view text,
  retention_floor timestamptz,
  cursor_completed_at timestamptz,
  cursor_job_id uuid,
  row_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_claims jsonb := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
  v_role text := coalesce(nullif(v_claims ->> 'role', ''), current_user);
  v_requested_user_id uuid := nullif(v_claims ->> 'sub', '')::uuid;
  v_requested_list_view text := list_view;
  v_requested_retention_floor timestamptz := retention_floor;
  v_cursor_completed_at timestamptz := cursor_completed_at;
  v_cursor_job_id uuid := cursor_job_id;
  v_limit integer := greatest(1, least(coalesce(row_limit, 20), 51));
begin
  if v_role is distinct from 'authenticated'
    or v_requested_user_id is null
    or v_requested_list_view not in ('unseen-completed', 'archive')
    or v_requested_retention_floor is null
    or ((v_cursor_completed_at is null) <> (v_cursor_job_id is null)) then
    raise exception 'YOUTUBE_EXTRACTION_INTERNAL_UNAUTHORIZED'
      using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', job.id,
        'status', job.status,
        'created_at', to_char(job.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'started_at', case
          when job.started_at is null then null
          else to_char(job.started_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
        end,
        'completed_at', case
          when job.completed_at is null then null
          else to_char(job.completed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
        end,
        'error_code', job.error_code,
        'youtube_video_id', job.youtube_video_id,
        'video_title_snapshot', job.video_title_snapshot,
        'completion_delivery_key', job.completion_delivery_key,
        'completion_delivered_at', case
          when job.completion_delivered_at is null then null
          else to_char(job.completion_delivered_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
        end,
        'completion_seen_at', case
          when job.completion_seen_at is null then null
          else to_char(job.completion_seen_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
        end,
        'extraction_session', case
          when session_row.id is null then null
          else jsonb_build_object(
            'id', session_row.id,
            'status', session_row.status,
            'recipe_id', session_row.recipe_id,
            'expires_at', to_char(session_row.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
          )
        end
      )
      order by job.completed_at desc, job.id desc
    )
    from (
      select *
      from public.youtube_extraction_jobs as candidate_job
      where candidate_job.user_id = v_requested_user_id
        and candidate_job.status in ('succeeded', 'failed')
        and candidate_job.completed_at is not null
        and candidate_job.completed_at >= v_requested_retention_floor
        and (
          v_cursor_completed_at is null
          or candidate_job.completed_at < v_cursor_completed_at
          or (
            candidate_job.completed_at = v_cursor_completed_at
            and candidate_job.id < v_cursor_job_id
          )
        )
        and (
          (v_requested_list_view = 'unseen-completed' and candidate_job.completion_seen_at is null)
          or v_requested_list_view = 'archive'
        )
      order by candidate_job.completed_at desc, candidate_job.id desc
      limit v_limit
    ) as job
    left join public.youtube_extraction_sessions as session_row
      on session_row.id = job.extraction_session_id
  ), '[]'::jsonb);
end;
$function$;

create or replace function public.resolve_youtube_extraction_job_draft(
  job_id uuid,
  worker_id text,
  lease_generation bigint,
  permit_generation bigint,
  youtube_video_id text,
  runtime_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_requested_job_id uuid := job_id;
  v_requested_worker_id text := worker_id;
  v_requested_lease_generation bigint := lease_generation;
  v_requested_permit_generation bigint := permit_generation;
  v_requested_youtube_video_id text := youtube_video_id;
  v_job public.youtube_extraction_jobs%rowtype;
  v_recipe jsonb;
  v_ingredient jsonb;
  v_ingredient_row jsonb;
  v_ingredient_index bigint;
  v_ingredient_name text;
  v_ingredient_standard_name text;
  v_ingredient_id uuid;
  v_ingredient_match_count integer;
  v_ingredient_candidates jsonb;
  v_amount_text text;
  v_amount_match text;
  v_amount numeric;
  v_unit text;
  v_display_text text;
  v_component_label text;
  v_resolution_status text;
  v_draft_ingredient_hash text;
  v_draft_ingredient_id uuid;
  v_ingredients jsonb := '[]'::jsonb;
  v_blocking_issues jsonb := '[]'::jsonb;
  v_method_labels text[] := '{}'::text[];
  v_method_result jsonb;
  v_method jsonb;
  v_steps jsonb := '[]'::jsonb;
  v_new_cooking_methods jsonb := '[]'::jsonb;
  v_step jsonb;
  v_step_text text;
  v_step_index bigint;
  v_title text;
  v_source_availability jsonb;
  v_extraction_methods jsonb := '[]'::jsonb;
  v_source_providers jsonb := jsonb_build_array('youtube_videos_list');
  v_session_hash text;
  v_extraction_id uuid;
  v_draft jsonb;
begin
  perform public.check_youtube_extraction_worker_pre_request();

  if v_requested_job_id is null
    or coalesce(btrim(v_requested_youtube_video_id), '') = ''
    or runtime_result is null
    or coalesce(btrim(v_requested_worker_id), '') = ''
    or v_requested_lease_generation is null
    or v_requested_permit_generation is null
    or jsonb_typeof(runtime_result) <> 'object'
    or jsonb_typeof(runtime_result -> 'identity') <> 'object'
    or jsonb_typeof(runtime_result -> 'recipe') <> 'object'
    or jsonb_typeof(runtime_result #> '{recipe,ingredients}') <> 'array'
    or jsonb_typeof(runtime_result #> '{recipe,steps}') <> 'array'
    or jsonb_array_length(runtime_result #> '{recipe,ingredients}') > 200
    or jsonb_array_length(runtime_result #> '{recipe,steps}') > 200 then
    raise exception 'VALIDATION_ERROR'
      using errcode = '22023';
  end if;

  if not private.youtube_extraction_worker_write_fence_is_active(
    v_requested_job_id,
    v_requested_worker_id,
    v_requested_lease_generation,
    v_requested_permit_generation
  ) then
    raise exception 'YOUTUBE_EXTRACTION_JOB_STALE'
      using errcode = '55000';
  end if;

  select job_row.*
    into v_job
  from public.youtube_extraction_jobs as job_row
  where job_row.id = v_requested_job_id
    and job_row.youtube_video_id = v_requested_youtube_video_id
    and job_row.status = 'processing'
    and job_row.lease_owner = v_requested_worker_id
    and job_row.lease_generation = v_requested_lease_generation
    and job_row.lease_expires_at is not null
    and job_row.lease_expires_at >= clock_timestamp()
  for update;

  if not found then
    raise exception 'YOUTUBE_EXTRACTION_JOB_STALE'
      using errcode = '55000';
  end if;

  v_recipe := runtime_result -> 'recipe';
  v_title := left(
    nullif(btrim(regexp_replace(v_recipe ->> 'title', '[[:cntrl:][:space:]]+', ' ', 'g')), ''),
    160
  );
  if v_title is null then
    raise exception 'VALIDATION_ERROR'
      using errcode = '22023';
  end if;

  v_session_hash := encode(
    extensions.digest(
      convert_to('youtube-extraction-session-v1:' || v_job.id::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_extraction_id := (
    substr(v_session_hash, 1, 8) || '-' ||
    substr(v_session_hash, 9, 4) || '-5' ||
    substr(v_session_hash, 14, 3) || '-8' ||
    substr(v_session_hash, 18, 3) || '-' ||
    substr(v_session_hash, 21, 12)
  )::uuid;

  for v_ingredient, v_ingredient_index in
    select ingredient.value, ingredient.ordinality
    from jsonb_array_elements(v_recipe -> 'ingredients')
      with ordinality as ingredient(value, ordinality)
  loop
    if jsonb_typeof(v_ingredient) <> 'object' then
      raise exception 'VALIDATION_ERROR'
        using errcode = '22023';
    end if;

    v_ingredient_name := left(
      nullif(btrim(regexp_replace(v_ingredient ->> 'name', '[[:cntrl:][:space:]]+', ' ', 'g')), ''),
      100
    );
    if v_ingredient_name is null then
      raise exception 'VALIDATION_ERROR'
        using errcode = '22023';
    end if;

    v_amount_text := nullif(btrim(regexp_replace(v_ingredient ->> 'amount', '[[:cntrl:][:space:]]+', ' ', 'g')), '');
    v_amount_match := substring(replace(v_amount_text, ',', '.') from '[0-9]+[.]?[0-9]*');
    v_amount := case
      when v_amount_match is not null and v_amount_match::numeric > 0
        then v_amount_match::numeric
      else null
    end;
    v_unit := case when v_amount is null then null else left(
      nullif(btrim(regexp_replace(v_ingredient ->> 'unit', '[[:cntrl:][:space:]]+', ' ', 'g')), ''),
      20
    ) end;
    v_component_label := left(
      nullif(btrim(regexp_replace(v_ingredient ->> 'groupLabel', '[[:cntrl:][:space:]]+', ' ', 'g')), ''),
      80
    );
    v_display_text := btrim(v_ingredient_name || ' ' || coalesce(v_amount_text, '') || coalesce(v_unit, ''));

    v_ingredient_id := null;
    v_ingredient_standard_name := v_ingredient_name;
    v_ingredient_match_count := 0;
    v_ingredient_candidates := '[]'::jsonb;

    select ingredient.id, ingredient.standard_name
      into v_ingredient_id, v_ingredient_standard_name
    from public.ingredients as ingredient
    where lower(ingredient.standard_name) = lower(v_ingredient_name)
    order by ingredient.id
    limit 1;

    if found then
      v_ingredient_match_count := 1;
    else
      select count(distinct synonym.ingredient_id)::integer,
             coalesce(jsonb_agg(distinct jsonb_build_object(
               'ingredient_id', ingredient.id,
               'standard_name', ingredient.standard_name,
               'confidence', 0.9
             )), '[]'::jsonb)
        into v_ingredient_match_count, v_ingredient_candidates
      from public.ingredient_synonyms as synonym
      join public.ingredients as ingredient on ingredient.id = synonym.ingredient_id
      where lower(synonym.synonym) = lower(v_ingredient_name);

      if v_ingredient_match_count = 1 then
        select ingredient.id, ingredient.standard_name
          into v_ingredient_id, v_ingredient_standard_name
        from public.ingredient_synonyms as synonym
        join public.ingredients as ingredient on ingredient.id = synonym.ingredient_id
        where lower(synonym.synonym) = lower(v_ingredient_name)
        order by ingredient.id
        limit 1;
      end if;
    end if;

    v_resolution_status := case
      when v_ingredient_id is not null and v_ingredient_match_count = 1 then 'resolved'
      when v_ingredient_match_count > 0 then 'needs_review'
      else 'unresolved'
    end;

    v_draft_ingredient_hash := encode(
      extensions.digest(
        convert_to(
          'youtube-draft-ingredient-v1:' || v_job.id::text || ':' ||
          v_ingredient_index::text || ':' || lower(v_ingredient_name),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );
    v_draft_ingredient_id := (
      substr(v_draft_ingredient_hash, 1, 8) || '-' ||
      substr(v_draft_ingredient_hash, 9, 4) || '-5' ||
      substr(v_draft_ingredient_hash, 14, 3) || '-8' ||
      substr(v_draft_ingredient_hash, 18, 3) || '-' ||
      substr(v_draft_ingredient_hash, 21, 12)
    )::uuid;

    v_ingredient_row := jsonb_build_object(
      'draft_ingredient_id', v_draft_ingredient_id,
      'ingredient_id', coalesce(v_ingredient_id::text, ''),
      'standard_name', case
        when v_resolution_status = 'resolved' then v_ingredient_standard_name
        else v_ingredient_name
      end,
      'amount', v_amount,
      'unit', v_unit,
      'ingredient_type', case when v_amount is null then 'TO_TASTE' else 'QUANT' end,
      'display_text', v_display_text,
      'sort_order', v_ingredient_index,
      'scalable', v_amount is not null and v_unit is not null,
      'confidence', case when v_ingredient_match_count > 0 then 0.9 else null end,
      'resolution_status', v_resolution_status,
      'component_label', v_component_label,
      'raw_text', v_display_text,
      'quantity_source', 'unknown',
      'quantity_confidence', null,
      'quantity_raw_text', v_display_text,
      'quantity_evidence_refs', jsonb_build_array(),
      'quantity_review_required', v_amount is not null and v_unit is null,
      'quantity_user_confirmed', false
    );
    if v_resolution_status = 'needs_review' then
      v_ingredient_row := v_ingredient_row || jsonb_build_object('candidates', v_ingredient_candidates);
    elsif v_resolution_status = 'unresolved' then
      v_ingredient_row := v_ingredient_row || jsonb_build_object('candidates', jsonb_build_array());
    end if;
    v_ingredients := v_ingredients || jsonb_build_array(v_ingredient_row);
    if v_resolution_status <> 'resolved' then
      v_blocking_issues := v_blocking_issues || jsonb_build_array(
        'ingredients[' || (v_ingredient_index - 1)::text || '].ingredient_id'
      );
    end if;
  end loop;

  for v_step, v_step_index in
    select step.value, step.ordinality
    from jsonb_array_elements(v_recipe -> 'steps')
      with ordinality as step(value, ordinality)
  loop
    if jsonb_typeof(v_step) <> 'string' then
      raise exception 'VALIDATION_ERROR'
        using errcode = '22023';
    end if;
    v_step_text := left(
      nullif(btrim(regexp_replace(v_step #>> '{}', '[[:cntrl:][:space:]]+', ' ', 'g')), ''),
      2000
    );
    if v_step_text is null then
      raise exception 'VALIDATION_ERROR'
        using errcode = '22023';
    end if;
    v_method_labels := array_append(v_method_labels, case
      when lower(v_step_text) ~ '(에어[[:space:]]*프라이어|air[[:space:]]*fryer)' then 'air_fryer'
      when lower(v_step_text) ~ '(전자[[:space:]]*레인지|전자렌지|전자레인지|microwave)' then 'microwave'
      when lower(v_step_text) ~ '(오븐|oven)' then 'oven_bake'
      when lower(v_step_text) ~ '(튀김|튀겨|튀기|deep[[:space:]]*fry)' then 'deep_fry'
      when lower(v_step_text) ~ '(부쳐|부치|pan[[:space:]]*fry)' then 'pan_fry'
      when lower(v_step_text) ~ '(볶|stir[[:space:]]*fry)' then 'stir_fry'
      when lower(v_step_text) ~ '(찜기|찐|쪄|찌기|steam)' then 'steam'
      when lower(v_step_text) ~ '(데쳐|데치|블랜칭)' then 'blanch'
      when lower(v_step_text) ~ '(졸|줄여|reduce)' then 'reduce'
      when lower(v_step_text) ~ '(조려|조림|brais)' then 'braise'
      when lower(v_step_text) ~ '(삶|boil[[:space:]]+in)' then 'parboil'
      when lower(v_step_text) ~ '(끓|boil)' then 'boil'
      when lower(v_step_text) ~ '(굽|구워|토스트|grill|toast)' then 'grill'
      when lower(v_step_text) ~ '(절여|절이|pickle)' then 'pickle'
      when lower(v_step_text) ~ '(재워|재우|밑간|숙성|marinat)' then 'pre_season'
      when lower(v_step_text) ~ '(해동|thaw)' then 'thaw'
      when lower(v_step_text) ~ '(버무|무쳐|무치|toss)' then 'toss'
      when lower(v_step_text) ~ '(섞|비벼|비비|풀어|mix)' then 'mix'
      when lower(v_step_text) ~ '(다져|다지|mince)' then 'mince'
      else 'slice'
    end);
  end loop;

  v_method_result := public.resolve_youtube_extraction_worker_methods(
    v_job.id,
    v_requested_worker_id,
    v_requested_lease_generation,
    v_requested_permit_generation,
    v_method_labels
  );
  if coalesce((v_method_result ->> 'applied')::boolean, false) is not true then
    raise exception 'YOUTUBE_EXTRACTION_JOB_STALE'
      using errcode = '55000';
  end if;

  for v_step, v_step_index in
    select step.value, step.ordinality
    from jsonb_array_elements(v_recipe -> 'steps')
      with ordinality as step(value, ordinality)
  loop
    v_step_text := btrim(regexp_replace(v_step #>> '{}', '[[:cntrl:][:space:]]+', ' ', 'g'));
    v_method := v_method_result #> array['methods', (v_step_index - 1)::text];
    if v_method is null then
      raise exception 'VALIDATION_ERROR'
        using errcode = '22023';
    end if;
    v_steps := v_steps || jsonb_build_array(jsonb_build_object(
      'step_number', v_step_index,
      'instruction', v_step_text,
      'component_label', null,
      'cooking_method', (v_method - 'is_system'),
      'duration_text', null,
      'is_incomplete', false,
      'missing_fields', jsonb_build_array(),
      'raw_text', v_step_text
    ));
  end loop;

  select coalesce(jsonb_agg(method order by method ->> 'code'), '[]'::jsonb)
    into v_new_cooking_methods
  from (
    select distinct (method - 'is_system') as method
    from jsonb_array_elements(coalesce(v_method_result -> 'methods', '[]'::jsonb)) as method
    where coalesce((method ->> 'is_new')::boolean, false)
  ) as newly_resolved_methods;

  v_source_availability := coalesce(runtime_result #> '{meta,sourceAvailability}', '{}'::jsonb);
  if coalesce((v_source_availability ->> 'description')::boolean, false) then
    v_extraction_methods := v_extraction_methods || jsonb_build_array('description');
    v_source_providers := v_source_providers || jsonb_build_array('youtube_description');
  end if;
  if coalesce((v_source_availability ->> 'authorComment')::boolean, false) then
    v_extraction_methods := v_extraction_methods || jsonb_build_array('comment');
    v_source_providers := v_source_providers || jsonb_build_array('youtube_comment_threads');
  end if;
  if coalesce((v_source_availability ->> 'transcript')::boolean, false) then
    v_extraction_methods := v_extraction_methods || jsonb_build_array('caption');
    v_source_providers := v_source_providers || jsonb_build_array('youtube_timedtext_or_apify');
  end if;
  v_source_providers := v_source_providers || jsonb_build_array('codex_vision_i031');

  v_draft := jsonb_build_object(
    'extraction_id', v_extraction_id,
    'title', v_title,
    'base_servings', 2,
    'thumbnail_url', 'https://i.ytimg.com/vi/' || v_job.youtube_video_id || '/hqdefault.jpg',
    'tags', jsonb_build_array(),
    'extraction_methods', v_extraction_methods,
    'draft_warnings', jsonb_build_array(),
    'blocking_issues', v_blocking_issues,
    'ingredients', v_ingredients,
    'steps', v_steps,
    'new_cooking_methods', v_new_cooking_methods,
    'multi_recipe_status', 'single',
    'primary_candidate_id', null,
    'recipe_candidates', jsonb_build_array()
  );

  return jsonb_build_object(
    'applied', true,
    'source_job_id', v_job.id,
    'youtube_video_id', v_job.youtube_video_id,
    'video_title_snapshot', v_job.video_title_snapshot,
    'source_providers', v_source_providers,
    'draft', v_draft,
    'source_meta_json', jsonb_build_object(
      'policy_version', v_job.policy_version,
      'policy_snapshot_digest', v_job.policy_snapshot_digest,
      'extractor_mode', v_job.extractor_mode,
      'pipeline_identity', v_job.pipeline_identity,
      'i031_extractor', jsonb_build_object(
        'identity', runtime_result -> 'identity',
        'meta', coalesce(runtime_result -> 'meta', '{}'::jsonb)
      )
    )
  );
end;
$function$;

create or replace function public.finalize_youtube_extraction_job(
  job_id uuid,
  worker_id text,
  lease_generation bigint,
  finalized_draft_json jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.youtube_extraction_jobs%rowtype;
  v_permit public.youtube_extractor_permits%rowtype;
  v_session public.youtube_extraction_sessions%rowtype;
  v_candidate jsonb;
  v_now timestamptz := clock_timestamp();
  v_source_providers text[] := array['youtube_async'];
  v_extraction_methods text[] := array['i031_codex_vision'];
  v_classification_reasons text[] := '{}'::text[];
  v_title text;
  v_classification_status text := 'recipe';
  v_permit_generation bigint := nullif(
    finalized_draft_json ->> 'worker_permit_generation',
    ''
  )::bigint;
  v_finalized_payload jsonb := finalized_draft_json - 'worker_permit_generation';
  v_draft_json jsonb := coalesce(
    v_finalized_payload -> 'draft',
    v_finalized_payload,
    '{}'::jsonb
  );
  v_source_meta jsonb;
  v_session_hash text;
  v_session_id uuid;
  v_session_kind text := coalesce(
    nullif(btrim(v_draft_json ->> 'session_kind'), ''),
    'single'
  );
  v_requested_job_id uuid := job_id;
  v_requested_worker_id text := worker_id;
  v_requested_lease_generation bigint := lease_generation;
begin
  perform public.check_youtube_extraction_worker_pre_request();

  if v_requested_job_id is null
    or coalesce(btrim(v_requested_worker_id), '') = ''
    or v_requested_lease_generation is null
    or v_permit_generation is null
    or finalized_draft_json is null then
    raise exception 'VALIDATION_ERROR'
      using errcode = '22023';
  end if;

  select existing_job.*
    into v_job
  from public.youtube_extraction_jobs as existing_job
  where existing_job.id = v_requested_job_id
  for update;

  if not found then
    return jsonb_build_object('applied', false, 'finalized', false);
  end if;

  if v_job.status = 'succeeded'
    and v_job.lease_owner = v_requested_worker_id
    and v_job.lease_generation = v_requested_lease_generation
    and v_job.extraction_session_id is not null then
    return jsonb_build_object(
      'applied', true,
      'finalized', true,
      'job_id', v_job.id,
      'extraction_session_id', v_job.extraction_session_id,
      'completion_delivery_key', v_job.completion_delivery_key
    );
  end if;

  select permit.*
    into strict v_permit
  from public.youtube_extractor_permits as permit
  where permit.permit_key = 'primary'
  for update;

  v_now := clock_timestamp();

  if v_job.status is distinct from 'processing'
    or v_job.lease_owner is distinct from v_requested_worker_id
    or v_job.lease_generation is distinct from v_requested_lease_generation
    or v_job.lease_expires_at is null
    or v_job.lease_expires_at < v_now
    or v_permit.owner_id is distinct from v_requested_worker_id
    or v_permit.permit_generation is distinct from v_permit_generation
    or v_permit.expires_at is null
    or v_permit.expires_at < v_now then
    return jsonb_build_object('applied', false, 'finalized', false);
  end if;

  v_session_hash := encode(
    extensions.digest(
      convert_to('youtube-extraction-session-v1:' || v_job.id::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_session_id := (
    substr(v_session_hash, 1, 8) || '-' ||
    substr(v_session_hash, 9, 4) || '-5' ||
    substr(v_session_hash, 14, 3) || '-8' ||
    substr(v_session_hash, 18, 3) || '-' ||
    substr(v_session_hash, 21, 12)
  )::uuid;

  if jsonb_typeof(v_finalized_payload -> 'source_providers') = 'array' then
    select coalesce(array_agg(value order by ordinality), array['youtube_async']::text[])
      into v_source_providers
    from jsonb_array_elements_text(v_finalized_payload -> 'source_providers')
      with ordinality as t(value, ordinality);
  elsif jsonb_typeof(v_draft_json -> 'source_providers') = 'array' then
    select coalesce(array_agg(value order by ordinality), array['youtube_async']::text[])
      into v_source_providers
    from jsonb_array_elements_text(v_draft_json -> 'source_providers') with ordinality as t(value, ordinality);
  end if;

  if jsonb_typeof(v_draft_json -> 'extraction_methods') = 'array' then
    select coalesce(array_agg(value order by ordinality), array['i031_codex_vision']::text[])
      into v_extraction_methods
    from jsonb_array_elements_text(v_draft_json -> 'extraction_methods') with ordinality as t(value, ordinality);
  end if;

  if jsonb_typeof(v_finalized_payload -> 'classification_reasons') = 'array' then
    select coalesce(array_agg(value order by ordinality), '{}'::text[])
      into v_classification_reasons
    from jsonb_array_elements_text(v_finalized_payload -> 'classification_reasons')
      with ordinality as t(value, ordinality);
  end if;

  v_title := left(
    nullif(
      regexp_replace(
        coalesce(
          v_draft_json ->> 'title',
          ''
        ),
        '[[:cntrl:]]',
        '',
        'g'
      ),
      ''
    ),
    160
  );

  if coalesce(nullif(btrim(v_draft_json ->> 'classification_status'), ''), 'recipe')
    in ('recipe', 'uncertain', 'non_recipe') then
    v_classification_status := coalesce(nullif(btrim(v_draft_json ->> 'classification_status'), ''), 'recipe');
  end if;

  v_source_meta := coalesce(
    v_finalized_payload -> 'source_meta_json',
    '{}'::jsonb
  ) || jsonb_build_object(
    'policy_version', v_job.policy_version,
    'policy_snapshot_digest', v_job.policy_snapshot_digest,
    'source_job_id', v_job.id
  );

  select session_row.*
    into v_session
  from public.youtube_extraction_sessions as session_row
  where session_row.source_job_id = v_requested_job_id
  for update;

  if found then
    v_session_id := v_session.id;
    v_draft_json := jsonb_set(
      v_draft_json,
      '{extraction_id}',
      to_jsonb(v_session_id::text),
      true
    );
    update public.youtube_extraction_sessions as session_row
    set youtube_url = 'https://www.youtube.com/watch?v=' || v_job.youtube_video_id,
        youtube_video_id = v_job.youtube_video_id,
        video_title = coalesce(v_title, session_row.video_title),
        provider_version = v_job.pipeline_identity,
        source_providers = v_source_providers,
        classification_status = v_classification_status,
        classification_reasons = v_classification_reasons,
        raw_source_text = null,
        extraction_meta_json = v_source_meta,
        draft_json = v_draft_json,
        extraction_methods = v_extraction_methods,
        status = case
          when session_row.status = 'consumed' then 'consumed'
          else 'draft'
        end,
        expires_at = v_now + interval '24 hours',
        updated_at = v_now,
        session_kind = v_session_kind
    where session_row.id = v_session.id
    returning *
      into v_session;
  else
    v_draft_json := jsonb_set(
      v_draft_json,
      '{extraction_id}',
      to_jsonb(v_session_id::text),
      true
    );
    insert into public.youtube_extraction_sessions (
      id,
      user_id,
      youtube_url,
      youtube_video_id,
      video_title,
      provider_version,
      source_providers,
      classification_status,
      classification_reasons,
      raw_source_text,
      extraction_meta_json,
      draft_json,
      extraction_methods,
      status,
      expires_at,
      created_at,
      updated_at,
      session_kind,
      source_job_id
    ) values (
      v_session_id,
      v_job.user_id,
      'https://www.youtube.com/watch?v=' || v_job.youtube_video_id,
      v_job.youtube_video_id,
      v_title,
      v_job.pipeline_identity,
      v_source_providers,
      v_classification_status,
      v_classification_reasons,
      null,
      v_source_meta,
      v_draft_json,
      v_extraction_methods,
      'draft',
      v_now + interval '24 hours',
      v_now,
      v_now,
      v_session_kind,
      v_requested_job_id
    )
    returning *
      into v_session;
  end if;

  if jsonb_typeof(v_draft_json -> 'candidates') = 'array' then
    for v_candidate in
      select value
      from jsonb_array_elements(v_draft_json -> 'candidates')
    loop
      insert into public.youtube_extraction_candidates (
        extraction_session_id,
        candidate_id,
        status,
        title,
        start_ms,
        end_ms,
        confidence,
        draft_ingredient_ids_json,
        source_meta_json,
        updated_at
      ) values (
        v_session.id,
        coalesce(v_candidate ->> 'candidate_id', gen_random_uuid()::text),
        coalesce(nullif(v_candidate ->> 'status', ''), 'draft'),
        coalesce(v_candidate ->> 'title', v_title, 'YouTube extraction'),
        nullif(v_candidate ->> 'start_ms', '')::integer,
        nullif(v_candidate ->> 'end_ms', '')::integer,
        nullif(v_candidate ->> 'confidence', '')::numeric,
        coalesce(v_candidate -> 'draft_ingredient_ids_json', '[]'::jsonb),
        coalesce(v_candidate -> 'source_meta_json', '{}'::jsonb),
        v_now
      )
      on conflict (extraction_session_id, candidate_id)
      do update
        set status = excluded.status,
            title = excluded.title,
            start_ms = excluded.start_ms,
            end_ms = excluded.end_ms,
            confidence = excluded.confidence,
            draft_ingredient_ids_json = excluded.draft_ingredient_ids_json,
            source_meta_json = excluded.source_meta_json,
            updated_at = excluded.updated_at;
    end loop;
  end if;

  update public.youtube_extraction_jobs as job
  set status = 'succeeded',
      extraction_session_id = v_session.id,
      error_code = null,
      error_message = null,
      completed_at = v_now,
      completion_delivery_key = coalesce(
        job.completion_delivery_key,
        private.youtube_extraction_completion_delivery_key(job.id, v_now)
      ),
      lease_expires_at = null,
      heartbeat_at = null,
      updated_at = v_now
  where job.id = v_requested_job_id
  returning *
    into v_job;

  return jsonb_build_object(
    'applied', true,
    'finalized', true,
    'job_id', v_job.id,
    'extraction_session_id', v_session.id,
    'completion_delivery_key', v_job.completion_delivery_key
  );
end;
$function$;

create or replace function public.fail_or_retry_youtube_extraction_job(
  job_id uuid,
  worker_id text,
  lease_generation bigint,
  permit_generation bigint,
  error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.youtube_extraction_jobs%rowtype;
  v_now timestamptz := clock_timestamp();
  v_requested_job_id uuid := job_id;
  v_requested_worker_id text := worker_id;
  v_requested_lease_generation bigint := lease_generation;
  v_requested_permit_generation bigint := permit_generation;
  v_error_code text := error_code;
  v_retryable boolean := error_code in (
    'NETWORK_ERROR',
    'RATE_LIMITED',
    'PROVIDER_TIMEOUT',
    'TRANSIENT_INTERNAL_ERROR'
  );
begin
  perform public.check_youtube_extraction_worker_pre_request();

  if v_requested_job_id is null
    or coalesce(btrim(v_requested_worker_id), '') = ''
    or v_requested_lease_generation is null
    or v_requested_permit_generation is null
    or v_error_code not in (
      'NOT_RECIPE_VIDEO',
      'QUOTA_EXCEEDED',
      'RUNTIME_UNAVAILABLE',
      'EXTRACTION_FAILED',
      'NETWORK_ERROR',
      'RATE_LIMITED',
      'PROVIDER_TIMEOUT',
      'TRANSIENT_INTERNAL_ERROR'
    ) then
    raise exception 'VALIDATION_ERROR'
      using errcode = '22023';
  end if;

  if not private.youtube_extraction_worker_write_fence_is_active(
    v_requested_job_id,
    v_requested_worker_id,
    v_requested_lease_generation,
    v_requested_permit_generation
  ) then
    return jsonb_build_object('applied', false, 'updated', false);
  end if;

  update public.youtube_extraction_jobs as job
  set updated_at = job.updated_at
  where job.id = v_requested_job_id
    and job.status = 'processing'
    and job.lease_owner = v_requested_worker_id
    and job.lease_generation = v_requested_lease_generation
    and job.lease_expires_at is not null
    and job.lease_expires_at >= v_now
  returning *
    into v_job;

  if not found then
    return jsonb_build_object('applied', false, 'updated', false);
  end if;

  if v_retryable and v_job.attempt_count < v_job.max_attempts then
    update public.youtube_extraction_jobs
    set status = 'queued',
        error_code = v_error_code,
        error_message = private.youtube_extraction_error_message(v_error_code),
        available_at = v_now + make_interval(
          secs => private.youtube_extraction_backoff_seconds(v_job.attempt_count)
        ),
        lease_owner = null,
        lease_expires_at = null,
        heartbeat_at = null,
        updated_at = v_now
    where id = v_requested_job_id
    returning *
      into v_job;
  else
    if v_retryable then
      v_error_code := 'ATTEMPTS_EXHAUSTED';
    end if;
    update public.youtube_extraction_jobs
    set status = 'failed',
        error_code = v_error_code,
        error_message = private.youtube_extraction_error_message(v_error_code),
        completed_at = v_now,
        completion_delivery_key = coalesce(
          completion_delivery_key,
          private.youtube_extraction_completion_delivery_key(id, v_now)
        ),
        lease_owner = null,
        lease_expires_at = null,
        heartbeat_at = null,
        updated_at = v_now
    where id = v_requested_job_id
    returning *
      into v_job;
  end if;

  return jsonb_build_object(
    'applied', true,
    'updated', true,
    'status', v_job.status,
    'job_id', v_job.id
  );
end;
$function$;

create or replace function public.claim_youtube_extractor_permit(
  worker_id text,
  lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_permit public.youtube_extractor_permits%rowtype;
  v_now timestamptz := clock_timestamp();
  v_requested_worker_id text := worker_id;
  v_requested_lease_seconds integer := lease_seconds;
begin
  perform public.check_youtube_extraction_worker_pre_request();

  if coalesce(btrim(v_requested_worker_id), '') = ''
    or v_requested_lease_seconds is null
    or v_requested_lease_seconds < 15
    or v_requested_lease_seconds > 3600 then
    raise exception 'VALIDATION_ERROR'
      using errcode = '22023';
  end if;

  select permit.*
    into strict v_permit
  from public.youtube_extractor_permits as permit
  where permit.permit_key = 'primary'
  for update;

  if v_permit.owner_id is not null
    and v_permit.expires_at is not null
    and v_permit.expires_at + interval '60 seconds' > v_now then
    return jsonb_build_object(
      'claimed', false,
      'owner_id', v_permit.owner_id,
      'permit_generation', v_permit.permit_generation
    );
  end if;

  update public.youtube_extractor_permits as permit
  set owner_id = v_requested_worker_id,
      permit_generation = permit_generation + 1,
      heartbeat_at = v_now,
      expires_at = v_now + make_interval(secs => v_requested_lease_seconds)
  where permit_key = 'primary'
  returning *
    into v_permit;

  return jsonb_build_object(
    'claimed', true,
    'permit_generation', v_permit.permit_generation,
    'expires_at', v_permit.expires_at
  );
end;
$function$;

create or replace function public.heartbeat_youtube_extractor_permit(
  job_id uuid,
  worker_id text,
  lease_generation bigint,
  permit_generation bigint,
  lease_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_permit public.youtube_extractor_permits%rowtype;
  v_now timestamptz := clock_timestamp();
  v_requested_worker_id text := worker_id;
  v_requested_job_id uuid := job_id;
  v_requested_lease_generation bigint := lease_generation;
  v_requested_permit_generation bigint := permit_generation;
  v_requested_lease_seconds integer := lease_seconds;
begin
  perform public.check_youtube_extraction_worker_pre_request();

  if v_requested_job_id is null
    or coalesce(btrim(v_requested_worker_id), '') = ''
    or v_requested_lease_generation is null
    or v_requested_permit_generation is null
    or v_requested_lease_seconds is null
    or v_requested_lease_seconds < 15
    or v_requested_lease_seconds > 3600 then
    raise exception 'VALIDATION_ERROR'
      using errcode = '22023';
  end if;

  if not private.youtube_extraction_worker_write_fence_is_active(
    v_requested_job_id,
    v_requested_worker_id,
    v_requested_lease_generation,
    v_requested_permit_generation
  ) then
    return jsonb_build_object('applied', false, 'updated', false);
  end if;

  update public.youtube_extractor_permits as permit
  set heartbeat_at = v_now,
      expires_at = v_now + make_interval(secs => v_requested_lease_seconds)
  where permit.permit_key = 'primary'
    and permit.owner_id = v_requested_worker_id
    and permit.permit_generation = v_requested_permit_generation
    and permit.expires_at is not null
    and permit.expires_at >= v_now
  returning *
    into v_permit;

  if not found then
    return jsonb_build_object('applied', false, 'updated', false);
  end if;

  return jsonb_build_object(
    'applied', true,
    'updated', true,
    'permit_generation', v_permit.permit_generation
  );
end;
$function$;

create or replace function public.release_youtube_extractor_permit(
  worker_id text,
  permit_generation bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_permit public.youtube_extractor_permits%rowtype;
  v_current_generation bigint;
  v_requested_worker_id text := worker_id;
  v_requested_permit_generation bigint := permit_generation;
begin
  perform public.check_youtube_extraction_worker_pre_request();

  if coalesce(btrim(v_requested_worker_id), '') = ''
    or v_requested_permit_generation is null then
    raise exception 'VALIDATION_ERROR'
      using errcode = '22023';
  end if;

  select permit.*
    into strict v_permit
  from public.youtube_extractor_permits as permit
  where permit.permit_key = 'primary';

  v_current_generation := v_permit.permit_generation;

  update public.youtube_extractor_permits as permit
  set owner_id = null,
      heartbeat_at = null,
      expires_at = null
  where permit.permit_key = 'primary'
    and permit.owner_id = v_requested_worker_id
    and permit.permit_generation = v_requested_permit_generation
    and permit.expires_at is not null
    and permit.expires_at >= clock_timestamp()
  returning *
    into v_permit;

  if not found then
    return jsonb_build_object(
      'released', false,
      'permit_generation', v_current_generation
    );
  end if;

  return jsonb_build_object(
    'released', true,
    'permit_generation', coalesce(v_permit.permit_generation, v_requested_permit_generation)
  );
end;
$function$;

create or replace function public.mark_youtube_extraction_jobs_delivered(
  user_id uuid,
  delivery_keys text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_claims jsonb := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
  v_role text := coalesce(nullif(v_claims ->> 'role', ''), current_user);
  v_now timestamptz := clock_timestamp();
  v_count integer := 0;
  v_requested_user_id uuid := user_id;
  v_requested_delivery_keys text[] := delivery_keys;
begin
  if v_role is distinct from 'authenticated'
    or nullif(v_claims ->> 'sub', '')::uuid is distinct from v_requested_user_id then
    raise exception 'YOUTUBE_EXTRACTION_ENQUEUE_UNAUTHORIZED'
      using errcode = '42501';
  end if;

  if v_requested_delivery_keys is null or coalesce(array_length(v_requested_delivery_keys, 1), 0) = 0 then
    return jsonb_build_object('delivered_count', 0);
  end if;

  update public.youtube_extraction_jobs as job
  set completion_delivered_at = v_now,
      updated_at = v_now
  where job.user_id = v_requested_user_id
    and job.status in ('succeeded', 'failed')
    and job.completion_delivery_key = any (v_requested_delivery_keys)
    and job.completion_delivered_at is null;

  get diagnostics v_count = row_count;

  return jsonb_build_object('delivered_count', v_count);
end;
$function$;

create or replace function public.mark_youtube_extraction_jobs_seen(
  user_id uuid,
  job_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_claims jsonb := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
  v_role text := coalesce(nullif(v_claims ->> 'role', ''), current_user);
  v_now timestamptz := clock_timestamp();
  v_count integer := 0;
  v_requested_user_id uuid := user_id;
  v_requested_job_ids uuid[] := job_ids;
begin
  if v_role is distinct from 'authenticated'
    or nullif(v_claims ->> 'sub', '')::uuid is distinct from v_requested_user_id then
    raise exception 'YOUTUBE_EXTRACTION_ENQUEUE_UNAUTHORIZED'
      using errcode = '42501';
  end if;

  if v_requested_job_ids is null or coalesce(array_length(v_requested_job_ids, 1), 0) = 0 then
    return jsonb_build_object('seen_count', 0);
  end if;

  update public.youtube_extraction_jobs as job
  set completion_seen_at = v_now,
      updated_at = v_now
  where job.user_id = v_requested_user_id
    and job.id = any (v_requested_job_ids)
    and job.status in ('succeeded', 'failed')
    and job.completion_seen_at is null;

  get diagnostics v_count = row_count;

  return jsonb_build_object('seen_count', v_count);
end;
$function$;

create or replace function public.rotate_youtube_extraction_worker_credential(
  expected_generation bigint,
  new_generation bigint,
  new_jti_hash text,
  new_expires_at timestamptz,
  release_sha text,
  schema_identity text,
  allowed_snapshot_digest text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_claims jsonb := coalesce(
    nullif(pg_catalog.current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
  v_role text := coalesce(nullif(v_claims ->> 'role', ''), current_user);
  v_policy private.youtube_extraction_current_policy%rowtype;
  v_row private.youtube_extraction_worker_credentials%rowtype;
  v_expected_generation bigint := expected_generation;
  v_new_generation bigint := new_generation;
  v_new_jti_hash text := new_jti_hash;
  v_new_expires_at timestamptz := new_expires_at;
  v_release_sha text := release_sha;
  v_schema_identity text := schema_identity;
  v_allowed_snapshot_digest text := allowed_snapshot_digest;
begin
  if v_role is distinct from 'youtube_extraction_credential_manager' then
    raise exception 'YOUTUBE_EXTRACTION_CREDENTIAL_MANAGER_UNAUTHORIZED'
      using errcode = '42501';
  end if;

  if coalesce(v_claims ->> 'scope', '') is distinct from 'youtube-extraction-credential-manager'
    or coalesce(v_claims ->> 'iss', '') is distinct from 'https://worker.mumeok.kr'
    or coalesce(v_claims ->> 'aud', '') is distinct from 'youtube-extraction'
    or nullif(v_claims ->> 'exp', '')::bigint is null
    or to_timestamp((v_claims ->> 'exp')::bigint) < clock_timestamp()
    or to_timestamp((v_claims ->> 'exp')::bigint) > clock_timestamp() + interval '5 minutes' then
    raise exception 'YOUTUBE_EXTRACTION_CREDENTIAL_MANAGER_UNAUTHORIZED'
      using errcode = '42501';
  end if;

  if v_expected_generation is null
    or v_new_generation is null
    or v_new_generation <> v_expected_generation + 1
    or v_new_jti_hash !~ '^[0-9a-f]{64}$'
    or v_new_expires_at is null
    or v_new_expires_at > clock_timestamp() + interval '7 days'
    or coalesce(btrim(v_release_sha), '') = ''
    or coalesce(btrim(v_schema_identity), '') = ''
    or v_allowed_snapshot_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'VALIDATION_ERROR'
      using errcode = '22023';
  end if;

  select policy.*
    into strict v_policy
  from private.youtube_extraction_current_policy as policy
  where policy.policy_key = 'primary';

  if v_allowed_snapshot_digest is distinct from private.youtube_extraction_policy_snapshot_digest(
    v_policy.extractor_mode,
    v_policy.pipeline_identity,
    v_policy.result_affecting_options,
    v_policy.policy_version
  ) then
    raise exception 'POLICY_CHANGED'
      using errcode = '40001';
  end if;

  update private.youtube_extraction_worker_credentials
  set current_generation = v_new_generation,
      current_jti_hash = v_new_jti_hash,
      expires_at = v_new_expires_at,
      release_sha = v_release_sha,
      schema_identity = v_schema_identity,
      allowed_snapshot_digest = v_allowed_snapshot_digest,
      updated_at = clock_timestamp()
  where credential_name = 'primary'
    and current_generation = v_expected_generation
  returning *
    into v_row;

  return jsonb_build_object(
    'rotated', found,
    'current_generation', coalesce(v_row.current_generation, v_expected_generation)
  );
end;
$function$;

create or replace function private.verify_full_local_internal_scope()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_headers jsonb := coalesce(
    nullif(current_setting('request.headers', true), ''),
    '{}'
  )::jsonb;
  v_scope text;
  v_method text := upper(coalesce(current_setting('request.method', true), ''));
  v_path text := coalesce(current_setting('request.path', true), '');
begin
  v_scope := v_headers ->> 'x-homecook-internal-scope';

  if not (
    v_method in ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')
    and (
      (
        v_scope = 'auth-flow'
        and v_method = 'POST'
        and v_path in (
          '/rpc/read_full_local_auth_control',
          '/rpc/insert_auth_flow_attempt',
          '/rpc/read_auth_flow_attempt',
          '/rpc/terminal_auth_flow_attempt',
          '/rpc/expire_and_count_remote_auth_flows'
        )
      )
      or (
        v_scope in ('auth-callback', 'auth-refresh')
        and v_method = 'POST'
        and v_path in (
          '/rpc/read_full_local_auth_control',
          '/rpc/record_hybrid_remote_session_authority',
          '/rpc/record_full_local_session_authority',
          '/rpc/get_account_generation_capability',
          '/rpc/bootstrap_account_generation_identity',
          '/rpc/bootstrap_legacy_auth_callback_identity',
          '/rpc/record_full_local_session_authority_v2',
          '/rpc/assert_and_renew_full_local_session_authority_v2'
        )
      )
      or (
        v_scope = 'request-authority'
        and v_method = 'POST'
        and v_path in (
          '/rpc/read_full_local_auth_control',
          '/rpc/assert_hybrid_remote_session_authority',
          '/rpc/assert_full_local_session_authority',
          '/rpc/assert_and_renew_full_local_session_authority_v2'
        )
      )
      or (
        v_scope = 'session-logout'
        and v_method = 'POST'
        and v_path in (
          '/rpc/read_full_local_auth_control',
          '/rpc/revoke_hybrid_remote_session_authority',
          '/rpc/revoke_full_local_session_authority'
        )
      )
      or (
        v_scope = 'account-lifecycle'
        and v_method = 'POST'
        and v_path in (
          '/rpc/get_account_generation_capability',
          '/rpc/bootstrap_account_generation_identity',
          '/rpc/initiate_account_generation_delete',
          '/rpc/replay_account_generation_delete',
          '/rpc/resolve_account_cutover_quarantine',
          '/rpc/delete_user_private_data_with_generation_receipt',
          '/rpc/start_legacy_external_write_attempt',
          '/rpc/finalize_legacy_external_write_attempt',
          '/operational_events'
        )
      )
      or (
        v_scope = 'admin-data'
        and (
          (
            v_method = 'GET'
            and v_path in (
              '/admin_audit_logs',
              '/admin_members',
              '/meals',
              '/operational_events',
              '/pantry_items',
              '/recipe_books',
              '/shopping_lists',
              '/users'
            )
          )
          or (
            v_method = 'POST'
            and v_path in ('/admin_audit_logs', '/operational_events')
          )
        )
      )
      or (
        v_scope in ('not-found-feedback', 'operational-event')
        and v_method = 'POST'
        and v_path = '/rpc/record_internal_operational_event'
      )
      or (
        v_scope = 'recipe-image'
        and v_method = 'POST'
        and v_path in (
          '/rpc/cancel_recipe_image_upload',
          '/rpc/compensate_recipe_image_upload',
          '/rpc/finalize_recipe_image_upload',
          '/rpc/read_recipe_image_projections',
          '/rpc/reserve_recipe_image_upload',
          '/operational_events'
        )
      )
      or (
        v_scope = 'recipe-future-propagation'
        and (
          (
            v_method = 'POST'
            and v_path in (
              '/rpc/preview_recipe_future_plan_impact',
              '/rpc/write_personal_recipe_core',
              '/rpc/write_recipe_future_plan_change'
            )
          )
          or (
            v_method = 'GET'
            and v_path in (
              '/ingredient_conversion_assignments',
              '/ingredient_nutrition_profiles'
            )
          )
        )
      )
      or (
        v_scope = 'snapshot-v2-session'
        and v_method = 'POST'
        and v_path in (
          '/rpc/start_snapshot_v2_cooking_session',
          '/rpc/read_snapshot_v2_cook_mode',
          '/rpc/cancel_snapshot_v2_cooking_session'
        )
      )
      or (
        v_scope = 'future-meal-write'
        and v_method = 'POST'
        and v_path = '/rpc/write_future_meal_with_snapshot_authority'
      )
      or (
        v_scope = 'shopping-create'
        and v_method = 'POST'
        and v_path = '/rpc/create_shopping_list_with_snapshot_authority'
      )
      or (
        v_scope = 'youtube-ingredient-registration'
        and v_method = 'POST'
        and v_path in (
          '/rpc/consume_youtube_ingredient_registration_rate_limit',
          '/rpc/register_youtube_ingredient'
        )
      )
      or (
        v_scope = 'youtube-extraction'
        and (
          (
            v_method = 'POST'
            and v_path in (
              '/youtube_extraction_sessions',
              '/youtube_extraction_candidates',
              '/youtube_transcript_cache',
              '/youtube_transcript_fetch_events',
              '/youtube_llm_extraction_cache',
              '/youtube_llm_extraction_events',
              '/youtube_visual_extraction_cache',
              '/youtube_visual_extraction_events',
              '/cooking_methods',
              '/rpc/read_youtube_extraction_job_projection',
              '/rpc/read_youtube_extraction_session_projection',
              '/rpc/list_youtube_extraction_job_projections'
            )
          )
          or (
            v_method = 'GET'
            and v_path in (
              '/youtube_transcript_cache',
              '/youtube_transcript_fetch_events',
              '/youtube_llm_extraction_cache',
              '/youtube_llm_extraction_events',
              '/youtube_visual_extraction_cache',
              '/youtube_visual_extraction_events',
              '/cooking_methods'
            )
          )
          or (
            v_method = 'PATCH'
            and v_path in (
              '/youtube_extraction_candidates',
              '/youtube_transcript_cache',
              '/youtube_llm_extraction_cache',
              '/youtube_visual_extraction_cache'
            )
          )
        )
      )
    )
  ) then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;
end;
$function$;

-- Supabase migrations run as a non-superuser role. Grant only temporary SET
-- membership so ownership can be assigned, then remove that grantor-specific
-- edge. PostgreSQL 16+ may retain its automatic admin-only, non-SET creator
-- edge; it cannot assume the RPC owner identity.
do $$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute format(
      'grant youtube_extraction_enqueue_rpc_owner, youtube_extraction_worker_rpc_owner, youtube_extraction_credential_manager_rpc_owner to %I with inherit false, set true granted by %I',
      current_user,
      current_user
    );
  else
    execute format(
      'grant youtube_extraction_enqueue_rpc_owner, youtube_extraction_worker_rpc_owner, youtube_extraction_credential_manager_rpc_owner to %I',
      current_user
    );
  end if;
end;
$$;

grant create on schema public
  to youtube_extraction_enqueue_rpc_owner,
     youtube_extraction_worker_rpc_owner,
     youtube_extraction_credential_manager_rpc_owner;

-- PostgreSQL requires the prospective function owner to hold CREATE on the
-- containing schema while ALTER OWNER runs. Keep this edge transaction-local.
grant create on schema private
  to youtube_extraction_worker_rpc_owner,
     youtube_extraction_credential_manager_rpc_owner;

alter function public.check_youtube_extraction_worker_pre_request()
  owner to youtube_extraction_worker_rpc_owner;
alter function public.enqueue_youtube_extraction_job(
  text, bigint, text, text, text, text, text, text
) owner to youtube_extraction_enqueue_rpc_owner;
alter function public.claim_youtube_extraction_job(text, text, integer)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.heartbeat_youtube_extraction_job(uuid, text, bigint, bigint, integer)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.start_youtube_extraction_attempt(uuid, text, bigint, bigint)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.read_youtube_extraction_enqueue_readiness()
  owner to youtube_extraction_credential_manager_rpc_owner;
alter function private.assert_youtube_extraction_catalog_ready()
  owner to youtube_extraction_credential_manager_rpc_owner;
alter function public.read_youtube_extraction_job_projection(uuid)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.read_youtube_extraction_session_projection(uuid)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.list_youtube_extraction_job_projections(text, timestamptz, timestamptz, uuid, integer)
  owner to youtube_extraction_worker_rpc_owner;
alter function private.youtube_extraction_job_fence_is_active(uuid, text, bigint)
  owner to youtube_extraction_worker_rpc_owner;
alter function private.youtube_extraction_worker_write_fence_is_active(uuid, text, bigint, bigint)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.requeue_youtube_extraction_job_without_attempt(uuid, text, bigint, integer, integer)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.update_youtube_extraction_job_title(uuid, text, bigint, bigint, text)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.read_youtube_extraction_worker_catalog(uuid, text, bigint)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.resolve_youtube_extraction_worker_methods(uuid, text, bigint, bigint, text[])
  owner to youtube_extraction_worker_rpc_owner;
alter function public.access_youtube_extraction_worker_cache(uuid, text, bigint, bigint, text, jsonb)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.record_youtube_extraction_worker_event(uuid, text, bigint, bigint, text, jsonb)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.reserve_youtube_extraction_worker_quota(uuid, text, bigint, bigint, text, integer)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.resolve_youtube_extraction_job_draft(uuid, text, bigint, bigint, text, jsonb)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.finalize_youtube_extraction_job(uuid, text, bigint, jsonb)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.fail_or_retry_youtube_extraction_job(uuid, text, bigint, bigint, text)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.claim_youtube_extractor_permit(text, integer)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.heartbeat_youtube_extractor_permit(uuid, text, bigint, bigint, integer)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.release_youtube_extractor_permit(text, bigint)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.mark_youtube_extraction_jobs_delivered(uuid, text[])
  owner to youtube_extraction_worker_rpc_owner;
alter function public.mark_youtube_extraction_jobs_seen(uuid, uuid[])
  owner to youtube_extraction_worker_rpc_owner;
alter function public.rotate_youtube_extraction_worker_credential(
  bigint, bigint, text, timestamptz, text, text, text
) owner to youtube_extraction_credential_manager_rpc_owner;

set local role youtube_extraction_credential_manager_rpc_owner;

revoke all on function private.assert_youtube_extraction_catalog_ready()
from public, anon, authenticated, service_role,
  youtube_extraction_worker, youtube_extraction_credential_manager;
grant execute on function private.assert_youtube_extraction_catalog_ready()
to youtube_extraction_enqueue_rpc_owner,
   youtube_extraction_worker_rpc_owner,
   supabase_admin;

reset role;
set local role youtube_extraction_enqueue_rpc_owner;

revoke all on function public.enqueue_youtube_extraction_job(
  text,
  bigint,
  text,
  text,
  text,
  text,
  text,
  text
)
from public, anon, service_role, youtube_extraction_worker, youtube_extraction_credential_manager;
grant execute on function public.enqueue_youtube_extraction_job(
  text,
  bigint,
  text,
  text,
  text,
  text,
  text,
  text
)
to authenticated;

reset role;
set local role youtube_extraction_worker_rpc_owner;

revoke all on function public.claim_youtube_extraction_job(text, text, integer)
from public, anon, authenticated, service_role, youtube_extraction_credential_manager;
grant execute on function public.claim_youtube_extraction_job(text, text, integer)
to youtube_extraction_worker;

revoke all on function public.heartbeat_youtube_extraction_job(uuid, text, bigint, bigint, integer)
from public, anon, authenticated, service_role, youtube_extraction_credential_manager;
grant execute on function public.heartbeat_youtube_extraction_job(uuid, text, bigint, bigint, integer)
to youtube_extraction_worker;

revoke all on function public.start_youtube_extraction_attempt(uuid, text, bigint, bigint)
from public, anon, authenticated, service_role, youtube_extraction_credential_manager;
grant execute on function public.start_youtube_extraction_attempt(uuid, text, bigint, bigint)
to youtube_extraction_worker;

reset role;
set local role youtube_extraction_credential_manager_rpc_owner;

revoke all on function public.read_youtube_extraction_enqueue_readiness()
from public, anon, service_role, youtube_extraction_worker, youtube_extraction_credential_manager;
grant execute on function public.read_youtube_extraction_enqueue_readiness() to authenticated;

reset role;
set local role youtube_extraction_worker_rpc_owner;

revoke all on function public.read_youtube_extraction_job_projection(uuid)
from public, anon, service_role, youtube_extraction_worker, youtube_extraction_credential_manager;
grant execute on function public.read_youtube_extraction_job_projection(uuid) to authenticated;

revoke all on function public.read_youtube_extraction_session_projection(uuid)
from public, anon, service_role, youtube_extraction_worker, youtube_extraction_credential_manager;
grant execute on function public.read_youtube_extraction_session_projection(uuid) to authenticated;

revoke all on function public.list_youtube_extraction_job_projections(text, timestamptz, timestamptz, uuid, integer)
from public, anon, service_role, youtube_extraction_worker, youtube_extraction_credential_manager;
grant execute on function public.list_youtube_extraction_job_projections(text, timestamptz, timestamptz, uuid, integer)
to authenticated;

reset role;
set local role youtube_extraction_worker_rpc_owner;

revoke all on function private.youtube_extraction_job_fence_is_active(uuid, text, bigint)
from public, anon, authenticated, service_role, youtube_extraction_worker, youtube_extraction_credential_manager;
revoke all on function private.youtube_extraction_worker_write_fence_is_active(uuid, text, bigint, bigint)
from public, anon, authenticated, service_role, youtube_extraction_worker, youtube_extraction_credential_manager;

revoke all on function public.requeue_youtube_extraction_job_without_attempt(uuid, text, bigint, integer, integer)
from public, anon, authenticated, service_role, youtube_extraction_credential_manager;
grant execute on function public.requeue_youtube_extraction_job_without_attempt(uuid, text, bigint, integer, integer)
to youtube_extraction_worker;
revoke all on function public.update_youtube_extraction_job_title(uuid, text, bigint, bigint, text)
from public, anon, authenticated, service_role, youtube_extraction_credential_manager;
grant execute on function public.update_youtube_extraction_job_title(uuid, text, bigint, bigint, text)
to youtube_extraction_worker;
revoke all on function public.read_youtube_extraction_worker_catalog(uuid, text, bigint)
from public, anon, authenticated, service_role, youtube_extraction_credential_manager;
grant execute on function public.read_youtube_extraction_worker_catalog(uuid, text, bigint)
to youtube_extraction_worker;
revoke all on function public.resolve_youtube_extraction_worker_methods(uuid, text, bigint, bigint, text[])
from public, anon, authenticated, service_role, youtube_extraction_credential_manager;
grant execute on function public.resolve_youtube_extraction_worker_methods(uuid, text, bigint, bigint, text[])
to youtube_extraction_worker;
revoke all on function public.access_youtube_extraction_worker_cache(uuid, text, bigint, bigint, text, jsonb)
from public, anon, authenticated, service_role, youtube_extraction_credential_manager;
grant execute on function public.access_youtube_extraction_worker_cache(uuid, text, bigint, bigint, text, jsonb)
to youtube_extraction_worker;
revoke all on function public.record_youtube_extraction_worker_event(uuid, text, bigint, bigint, text, jsonb)
from public, anon, authenticated, service_role, youtube_extraction_credential_manager;
grant execute on function public.record_youtube_extraction_worker_event(uuid, text, bigint, bigint, text, jsonb)
to youtube_extraction_worker;
revoke all on function public.reserve_youtube_extraction_worker_quota(uuid, text, bigint, bigint, text, integer)
from public, anon, authenticated, service_role, youtube_extraction_credential_manager;
grant execute on function public.reserve_youtube_extraction_worker_quota(uuid, text, bigint, bigint, text, integer)
to youtube_extraction_worker;

revoke all on function public.resolve_youtube_extraction_job_draft(uuid, text, bigint, bigint, text, jsonb)
from public, anon, authenticated, service_role, youtube_extraction_credential_manager;
grant execute on function public.resolve_youtube_extraction_job_draft(uuid, text, bigint, bigint, text, jsonb)
to youtube_extraction_worker;

revoke all on function public.finalize_youtube_extraction_job(uuid, text, bigint, jsonb)
from public, anon, authenticated, service_role, youtube_extraction_credential_manager;
grant execute on function public.finalize_youtube_extraction_job(uuid, text, bigint, jsonb)
to youtube_extraction_worker;

revoke all on function public.fail_or_retry_youtube_extraction_job(uuid, text, bigint, bigint, text)
from public, anon, authenticated, service_role, youtube_extraction_credential_manager;
grant execute on function public.fail_or_retry_youtube_extraction_job(uuid, text, bigint, bigint, text)
to youtube_extraction_worker;

revoke all on function public.claim_youtube_extractor_permit(text, integer)
from public, anon, authenticated, service_role, youtube_extraction_credential_manager;
grant execute on function public.claim_youtube_extractor_permit(text, integer)
to youtube_extraction_worker;

revoke all on function public.heartbeat_youtube_extractor_permit(uuid, text, bigint, bigint, integer)
from public, anon, authenticated, service_role, youtube_extraction_credential_manager;
grant execute on function public.heartbeat_youtube_extractor_permit(uuid, text, bigint, bigint, integer)
to youtube_extraction_worker;

revoke all on function public.release_youtube_extractor_permit(text, bigint)
from public, anon, authenticated, service_role, youtube_extraction_credential_manager;
grant execute on function public.release_youtube_extractor_permit(text, bigint)
to youtube_extraction_worker;

revoke all on function public.mark_youtube_extraction_jobs_delivered(uuid, text[])
from public, anon, service_role, youtube_extraction_worker, youtube_extraction_credential_manager;
grant execute on function public.mark_youtube_extraction_jobs_delivered(uuid, text[])
to authenticated;

revoke all on function public.mark_youtube_extraction_jobs_seen(uuid, uuid[])
from public, anon, service_role, youtube_extraction_worker, youtube_extraction_credential_manager;
grant execute on function public.mark_youtube_extraction_jobs_seen(uuid, uuid[])
to authenticated;

reset role;
set local role youtube_extraction_credential_manager_rpc_owner;

revoke all on function public.rotate_youtube_extraction_worker_credential(
  bigint,
  bigint,
  text,
  timestamptz,
  text,
  text,
  text
)
from public, anon, authenticated, service_role, youtube_extraction_worker;
grant execute on function public.rotate_youtube_extraction_worker_credential(
  bigint,
  bigint,
  text,
  timestamptz,
  text,
  text,
  text
)
to youtube_extraction_credential_manager;

reset role;
set local role youtube_extraction_worker_rpc_owner;

revoke all on function public.check_youtube_extraction_worker_pre_request()
from public, anon, authenticated, service_role;
grant execute on function public.check_youtube_extraction_worker_pre_request()
to youtube_extraction_worker, youtube_extraction_credential_manager;

reset role;

revoke create on schema public
  from youtube_extraction_enqueue_rpc_owner,
       youtube_extraction_worker_rpc_owner,
       youtube_extraction_credential_manager_rpc_owner;

revoke create on schema private
  from youtube_extraction_worker_rpc_owner,
       youtube_extraction_credential_manager_rpc_owner;

do $$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute format(
      'revoke youtube_extraction_enqueue_rpc_owner, youtube_extraction_worker_rpc_owner, youtube_extraction_credential_manager_rpc_owner from %I granted by %I',
      current_user,
      current_user
    );
  else
    execute format(
      'revoke youtube_extraction_enqueue_rpc_owner, youtube_extraction_worker_rpc_owner, youtube_extraction_credential_manager_rpc_owner from %I',
      current_user
    );
  end if;
end;
$$;

commit;
