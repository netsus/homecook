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
grant usage on schema auth to youtube_extraction_enqueue_rpc_owner;
grant usage on schema auth to youtube_extraction_worker_rpc_owner;
grant usage on schema auth to youtube_extraction_credential_manager_rpc_owner;
grant usage on schema extensions to youtube_extraction_enqueue_rpc_owner;
grant usage on schema extensions to youtube_extraction_worker_rpc_owner;
grant usage on schema extensions to youtube_extraction_credential_manager_rpc_owner;
grant execute on function auth.uid() to youtube_extraction_enqueue_rpc_owner;
grant execute on function auth.uid() to youtube_extraction_worker_rpc_owner;
grant execute on function auth.uid() to youtube_extraction_credential_manager_rpc_owner;
grant execute on function auth.role() to youtube_extraction_enqueue_rpc_owner;
grant execute on function auth.role() to youtube_extraction_worker_rpc_owner;
grant execute on function auth.role() to youtube_extraction_credential_manager_rpc_owner;

grant youtube_extraction_worker to authenticator;
grant youtube_extraction_credential_manager to authenticator;

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
  using (user_id = auth.uid());

drop policy if exists youtube_extraction_jobs_enqueue_owner_insert
  on public.youtube_extraction_jobs;
create policy youtube_extraction_jobs_enqueue_owner_insert
  on public.youtube_extraction_jobs
  for insert
  to youtube_extraction_enqueue_rpc_owner
  with check (user_id = auth.uid());

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
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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
      or v_issuer = ''
      or v_audience = ''
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
      or to_timestamp(v_exp) < clock_timestamp() then
      raise exception 'YOUTUBE_EXTRACTION_WORKER_UNAUTHORIZED'
        using errcode = '42501';
    end if;
  elsif v_role = 'youtube_extraction_credential_manager' then
    if v_scope is distinct from 'youtube-extraction-credential-manager'
      or v_issuer = ''
      or v_audience = ''
      or v_exp is null
      or to_timestamp(v_exp) < clock_timestamp() then
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
  v_requested_lease_seconds integer := lease_seconds;
begin
  perform public.check_youtube_extraction_worker_pre_request();

  if v_requested_job_id is null
    or coalesce(btrim(v_requested_worker_id), '') = ''
    or v_requested_lease_generation is null
    or v_requested_lease_seconds is null
    or v_requested_lease_seconds < 15
    or v_requested_lease_seconds > 3600 then
    raise exception 'VALIDATION_ERROR'
      using errcode = '22023';
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

  select permit.*
    into strict v_permit
  from public.youtube_extractor_permits as permit
  where permit.permit_key = 'primary'
  for update;

  if v_permit.owner_id is distinct from v_requested_worker_id
    or v_permit.permit_generation is distinct from v_requested_permit_generation
    or v_permit.expires_at is null
    or v_permit.expires_at < v_now then
    raise exception 'YOUTUBE_EXTRACTION_PERMIT_STALE'
      using errcode = '55000';
  end if;

  update public.youtube_extraction_jobs as job
  set attempt_count = attempt_count + 1,
      started_at = coalesce(job.started_at, v_now),
      updated_at = v_now
  where job.id = v_requested_job_id
    and job.status = 'processing'
    and job.lease_owner = v_requested_worker_id
    and job.lease_generation = v_requested_lease_generation
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

create or replace function public.read_youtube_extraction_job_projection(
  user_id uuid,
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
  v_requested_user_id uuid := user_id;
  v_requested_job_id uuid := job_id;
  v_payload jsonb;
begin
  if v_role is distinct from 'service_role'
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
  user_id uuid,
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
  v_requested_user_id uuid := user_id;
  v_requested_extraction_id uuid := extraction_id;
  v_payload jsonb;
begin
  if v_role is distinct from 'service_role'
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

create or replace function public.list_youtube_extraction_job_projections(
  user_id uuid,
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
  v_requested_user_id uuid := user_id;
  v_requested_list_view text := list_view;
  v_requested_retention_floor timestamptz := retention_floor;
  v_cursor_completed_at timestamptz := cursor_completed_at;
  v_cursor_job_id uuid := cursor_job_id;
  v_limit integer := greatest(1, least(coalesce(row_limit, 20), 51));
begin
  if v_role is distinct from 'service_role'
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
        'video_title_snapshot', job.video_title_snapshot,
        'completion_delivery_key', job.completion_delivery_key,
        'completion_delivered_at', case
          when job.completion_delivered_at is null then null
          else to_char(job.completion_delivered_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        end,
        'completion_seen_at', case
          when job.completion_seen_at is null then null
          else to_char(job.completion_seen_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        end,
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
  v_requested_youtube_video_id text := youtube_video_id;
  v_job public.youtube_extraction_jobs%rowtype;
begin
  perform public.check_youtube_extraction_worker_pre_request();

  if v_requested_job_id is null
    or coalesce(btrim(v_requested_youtube_video_id), '') = ''
    or runtime_result is null
    or coalesce(btrim(v_requested_worker_id), '') = ''
    or v_requested_lease_generation is null then
    raise exception 'VALIDATION_ERROR'
      using errcode = '22023';
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

  return jsonb_build_object(
    'applied', true,
    'source_job_id', v_job.id,
    'youtube_video_id', v_job.youtube_video_id,
    'video_title_snapshot', coalesce(
      runtime_result ->> 'video_title_snapshot',
      runtime_result ->> 'title',
      v_job.video_title_snapshot
    ),
    'draft', coalesce(runtime_result -> 'draft', runtime_result, '{}'::jsonb),
    'source_meta_json', jsonb_build_object(
      'policy_version', v_job.policy_version,
      'policy_snapshot_digest', v_job.policy_snapshot_digest,
      'extractor_mode', v_job.extractor_mode,
      'pipeline_identity', v_job.pipeline_identity
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

  select permit.*
    into strict v_permit
  from public.youtube_extractor_permits as permit
  where permit.permit_key = 'primary'
  for update;

  if v_permit.owner_id is distinct from v_requested_worker_id
    or v_permit.permit_generation is distinct from v_permit_generation
    or v_permit.expires_at is null
    or v_permit.expires_at < v_now then
    return jsonb_build_object('finalized', false);
  end if;

  update public.youtube_extraction_jobs as job
  set updated_at = job.updated_at
  where job.id = v_requested_job_id
    and job.status = 'processing'
    and job.lease_owner = v_requested_worker_id
    and job.lease_generation = v_requested_lease_generation
  returning *
    into v_job;

  if not found then
    select existing_job.*
      into v_job
    from public.youtube_extraction_jobs as existing_job
    where existing_job.id = v_requested_job_id
      and existing_job.status = 'succeeded'
      and existing_job.extraction_session_id is not null;

    return case when found then jsonb_build_object(
      'applied', true,
      'finalized', true,
      'job_id', v_job.id,
      'extraction_session_id', v_job.extraction_session_id,
      'completion_delivery_key', v_job.completion_delivery_key
    ) else jsonb_build_object('applied', false, 'finalized', false) end;
  end if;

  if jsonb_typeof(v_draft_json -> 'source_providers') = 'array' then
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
          v_finalized_payload ->> 'video_title_snapshot',
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
    insert into public.youtube_extraction_sessions (
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
      video_title_snapshot = coalesce(v_title, job.video_title_snapshot),
      error_code = null,
      error_message = null,
      completed_at = v_now,
      completion_delivery_key = coalesce(
        job.completion_delivery_key,
        private.youtube_extraction_completion_delivery_key(job.id, v_now)
      ),
      lease_owner = null,
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

  update public.youtube_extraction_jobs
  set updated_at = updated_at
  where id = v_requested_job_id
    and status = 'processing'
    and lease_owner = v_requested_worker_id
    and lease_generation = v_requested_lease_generation
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
    and v_permit.owner_id is distinct from v_requested_worker_id
    and v_permit.expires_at is not null
    and v_permit.expires_at + interval '60 seconds' > v_now then
    return jsonb_build_object(
      'claimed', false,
      'owner_id', v_permit.owner_id,
      'permit_generation', v_permit.permit_generation
    );
  end if;

  update public.youtube_extractor_permits
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
  worker_id text,
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
  v_requested_permit_generation bigint := permit_generation;
  v_requested_lease_seconds integer := lease_seconds;
begin
  perform public.check_youtube_extraction_worker_pre_request();

  if coalesce(btrim(v_requested_worker_id), '') = ''
    or v_requested_permit_generation is null
    or v_requested_lease_seconds is null
    or v_requested_lease_seconds < 15
    or v_requested_lease_seconds > 3600 then
    raise exception 'VALIDATION_ERROR'
      using errcode = '22023';
  end if;

  update public.youtube_extractor_permits
  set heartbeat_at = v_now,
      expires_at = v_now + make_interval(secs => v_requested_lease_seconds)
  where permit_key = 'primary'
    and owner_id = v_requested_worker_id
    and permit_generation = v_requested_permit_generation
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
    return jsonb_build_object('updated', 0);
  end if;

  update public.youtube_extraction_jobs as job
  set completion_delivered_at = v_now,
      updated_at = v_now
  where job.user_id = v_requested_user_id
    and job.status in ('succeeded', 'failed')
    and job.completion_delivery_key = any (v_requested_delivery_keys)
    and job.completion_delivered_at is null;

  get diagnostics v_count = row_count;

  return jsonb_build_object('updated', v_count);
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
    return jsonb_build_object('updated', 0);
  end if;

  update public.youtube_extraction_jobs as job
  set completion_seen_at = v_now,
      updated_at = v_now
  where job.user_id = v_requested_user_id
    and job.id = any (v_requested_job_ids)
    and job.status in ('succeeded', 'failed')
    and job.completion_seen_at is null;

  get diagnostics v_count = row_count;

  return jsonb_build_object('updated', v_count);
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
    or coalesce(v_claims ->> 'iss', '') = ''
    or coalesce(v_claims ->> 'aud', '') = ''
    or nullif(v_claims ->> 'exp', '')::bigint is null
    or to_timestamp((v_claims ->> 'exp')::bigint) < clock_timestamp() then
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

alter function public.check_youtube_extraction_worker_pre_request()
  owner to youtube_extraction_worker_rpc_owner;
alter function public.enqueue_youtube_extraction_job(
  text, bigint, text, text, text, text, text, text
) owner to youtube_extraction_enqueue_rpc_owner;
alter function public.claim_youtube_extraction_job(text, text, integer)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.heartbeat_youtube_extraction_job(uuid, text, bigint, integer)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.start_youtube_extraction_attempt(uuid, text, bigint, bigint)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.read_youtube_extraction_job_projection(uuid, uuid)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.read_youtube_extraction_session_projection(uuid, uuid)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.list_youtube_extraction_job_projections(uuid, text, timestamptz, timestamptz, uuid, integer)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.resolve_youtube_extraction_job_draft(uuid, text, bigint, text, jsonb)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.finalize_youtube_extraction_job(uuid, text, bigint, jsonb)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.fail_or_retry_youtube_extraction_job(uuid, text, bigint, text)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.claim_youtube_extractor_permit(text, integer)
  owner to youtube_extraction_worker_rpc_owner;
alter function public.heartbeat_youtube_extractor_permit(text, bigint, integer)
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
alter function private.verify_full_local_internal_scope()
  owner to postgres;

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

revoke all on function public.claim_youtube_extraction_job(text, text, integer)
from public, anon, authenticated, service_role, youtube_extraction_credential_manager;
grant execute on function public.claim_youtube_extraction_job(text, text, integer)
to youtube_extraction_worker;

revoke all on function public.heartbeat_youtube_extraction_job(uuid, text, bigint, integer)
from public, anon, authenticated, service_role, youtube_extraction_credential_manager;
grant execute on function public.heartbeat_youtube_extraction_job(uuid, text, bigint, integer)
to youtube_extraction_worker;

revoke all on function public.start_youtube_extraction_attempt(uuid, text, bigint, bigint)
from public, anon, authenticated, service_role, youtube_extraction_credential_manager;
grant execute on function public.start_youtube_extraction_attempt(uuid, text, bigint, bigint)
to youtube_extraction_worker;

revoke all on function public.read_youtube_extraction_job_projection(uuid, uuid)
from public, anon, authenticated, youtube_extraction_worker, youtube_extraction_credential_manager;
grant execute on function public.read_youtube_extraction_job_projection(uuid, uuid)
to service_role;

revoke all on function public.read_youtube_extraction_session_projection(uuid, uuid)
from public, anon, authenticated, youtube_extraction_worker, youtube_extraction_credential_manager;
grant execute on function public.read_youtube_extraction_session_projection(uuid, uuid)
to service_role;

revoke all on function public.list_youtube_extraction_job_projections(uuid, text, timestamptz, timestamptz, uuid, integer)
from public, anon, authenticated, youtube_extraction_worker, youtube_extraction_credential_manager;
grant execute on function public.list_youtube_extraction_job_projections(uuid, text, timestamptz, timestamptz, uuid, integer)
to service_role;

revoke all on function public.resolve_youtube_extraction_job_draft(uuid, text, bigint, text, jsonb)
from public, anon, authenticated, service_role, youtube_extraction_credential_manager;
grant execute on function public.resolve_youtube_extraction_job_draft(uuid, text, bigint, text, jsonb)
to youtube_extraction_worker;

revoke all on function public.finalize_youtube_extraction_job(uuid, text, bigint, jsonb)
from public, anon, authenticated, service_role, youtube_extraction_credential_manager;
grant execute on function public.finalize_youtube_extraction_job(uuid, text, bigint, jsonb)
to youtube_extraction_worker;

revoke all on function public.fail_or_retry_youtube_extraction_job(uuid, text, bigint, text)
from public, anon, authenticated, service_role, youtube_extraction_credential_manager;
grant execute on function public.fail_or_retry_youtube_extraction_job(uuid, text, bigint, text)
to youtube_extraction_worker;

revoke all on function public.claim_youtube_extractor_permit(text, integer)
from public, anon, authenticated, service_role, youtube_extraction_credential_manager;
grant execute on function public.claim_youtube_extractor_permit(text, integer)
to youtube_extraction_worker;

revoke all on function public.heartbeat_youtube_extractor_permit(text, bigint, integer)
from public, anon, authenticated, service_role, youtube_extraction_credential_manager;
grant execute on function public.heartbeat_youtube_extractor_permit(text, bigint, integer)
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

revoke all on function public.check_youtube_extraction_worker_pre_request()
from public, anon, authenticated, service_role;
grant execute on function public.check_youtube_extraction_worker_pre_request()
to youtube_extraction_worker, youtube_extraction_credential_manager;

commit;
