begin;

do $temporary_role_membership$
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
$temporary_role_membership$;

alter table public.youtube_extraction_jobs
  add column if not exists progress_attempt integer,
  add column if not exists progress_stage text,
  add column if not exists progress_stage_started_at timestamptz,
  add column if not exists progress_updated_at timestamptz,
  add column if not exists video_duration_seconds integer;

do $constraints$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.youtube_extraction_jobs'::regclass
      and conname = 'youtube_extraction_jobs_progress_attempt_check'
  ) then
    alter table public.youtube_extraction_jobs
      add constraint youtube_extraction_jobs_progress_attempt_check
      check (
        progress_attempt is null
        or progress_attempt between 0 and attempt_count
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.youtube_extraction_jobs'::regclass
      and conname = 'youtube_extraction_jobs_progress_stage_check'
  ) then
    alter table public.youtube_extraction_jobs
      add constraint youtube_extraction_jobs_progress_stage_check
      check (
        progress_stage is null
        or progress_stage in (
          'queued',
          'source_fetch',
          'video_download',
          'frame_extraction',
          'model_analysis',
          'finalizing'
        )
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.youtube_extraction_jobs'::regclass
      and conname = 'youtube_extraction_jobs_progress_snapshot_check'
  ) then
    alter table public.youtube_extraction_jobs
      add constraint youtube_extraction_jobs_progress_snapshot_check
      check (
        (progress_attempt is null
          and progress_stage is null
          and progress_stage_started_at is null
          and progress_updated_at is null)
        or
        (progress_attempt is not null
          and progress_stage is not null
          and progress_stage_started_at is not null
          and progress_updated_at is not null)
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.youtube_extraction_jobs'::regclass
      and conname = 'youtube_extraction_jobs_video_duration_check'
  ) then
    alter table public.youtube_extraction_jobs
      add constraint youtube_extraction_jobs_video_duration_check
      check (
        video_duration_seconds is null
        or video_duration_seconds between 1 and 86400
      );
  end if;
end;
$constraints$;

create table if not exists private.youtube_extraction_progress_stage_events (
  job_id uuid not null
    references public.youtube_extraction_jobs(id) on delete cascade,
  attempt integer not null,
  stage text not null,
  entered_at timestamptz not null default clock_timestamp(),
  video_duration_seconds integer,
  constraint youtube_extraction_progress_stage_events_pkey
    primary key (job_id, attempt, stage),
  constraint youtube_extraction_progress_stage_events_attempt_check
    check (attempt >= 1),
  constraint youtube_extraction_progress_stage_events_stage_check
    check (stage in (
      'source_fetch',
      'video_download',
      'frame_extraction',
      'model_analysis',
      'finalizing'
    )),
  constraint youtube_extraction_progress_stage_events_duration_check
    check (
      video_duration_seconds is null
      or video_duration_seconds between 1 and 86400
    )
);

grant create on schema private to youtube_extraction_worker_rpc_owner;

alter table private.youtube_extraction_progress_stage_events
  owner to youtube_extraction_worker_rpc_owner;

revoke create on schema private from youtube_extraction_worker_rpc_owner;

revoke all privileges on private.youtube_extraction_progress_stage_events
  from public, anon, authenticated, service_role,
    youtube_extraction_worker, youtube_extraction_credential_manager,
    youtube_extraction_enqueue_rpc_owner,
    youtube_extraction_credential_manager_rpc_owner;

-- Preserve the current enqueue implementation (including the admin daily quota
-- exception) and only extend its INSERT with the initial queued snapshot.
grant create on schema public to youtube_extraction_enqueue_rpc_owner;

set local role youtube_extraction_enqueue_rpc_owner;

do $rewrite_enqueue$
declare
  v_signature constant regprocedure :=
    'public.enqueue_youtube_extraction_job(text,bigint,text,text,text,text,text,text)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_signature);
  v_rewritten text;
  v_columns_source constant text :=
    E'    available_at,\n    created_at,\n    updated_at';
  v_columns_target constant text :=
    E'    available_at,\n    progress_attempt,\n    progress_stage,\n    progress_stage_started_at,\n    progress_updated_at,\n    created_at,\n    updated_at';
  v_values_source constant text :=
    E'    now(),\n    now(),\n    now()';
  v_values_target constant text :=
    E'    now(),\n    0,\n    ''queued'',\n    now(),\n    now(),\n    now(),\n    now()';
begin
  if pg_catalog.strpos(v_definition, 'progress_stage_started_at') > 0 then
    return;
  end if;

  if pg_catalog.strpos(v_definition, v_columns_source) = 0
    or pg_catalog.strpos(v_definition, v_values_source) = 0
    or pg_catalog.strpos(v_definition, 'public.admin_members as member') = 0
    or pg_catalog.strpos(
      v_definition,
      'v_active_count >= 2 or (not v_is_admin and v_daily_count >= 10)'
    ) = 0 then
    raise exception 'YouTube enqueue truthful progress source drifted'
      using errcode = '55000';
  end if;

  v_rewritten := pg_catalog.replace(v_definition, v_columns_source, v_columns_target);
  v_rewritten := pg_catalog.replace(v_rewritten, v_values_source, v_values_target);
  execute v_rewritten;
end;
$rewrite_enqueue$;

reset role;

revoke create on schema public from youtube_extraction_enqueue_rpc_owner;

create or replace function public.report_youtube_extraction_progress(
  job_id uuid,
  worker_id text,
  lease_generation bigint,
  permit_generation bigint,
  attempt integer,
  stage text,
  video_duration_seconds integer default null
)
returns table (applied boolean)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.youtube_extraction_jobs%rowtype;
  v_permit public.youtube_extractor_permits%rowtype;
  v_now timestamptz := clock_timestamp();
  v_current_ordinal integer;
  v_requested_ordinal integer;
begin
  perform public.check_youtube_extraction_worker_pre_request();

  if job_id is null
    or coalesce(btrim(worker_id), '') = ''
    or lease_generation is null
    or permit_generation is null
    or attempt is null
    or attempt < 1
    or stage not in (
      'source_fetch',
      'video_download',
      'frame_extraction',
      'model_analysis',
      'finalizing'
    )
    or (
      video_duration_seconds is not null
      and video_duration_seconds not between 1 and 86400
    ) then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;

  select job.*
    into v_job
  from public.youtube_extraction_jobs as job
  where job.id = report_youtube_extraction_progress.job_id
  for update;

  if not found
    or v_job.status is distinct from 'processing'
    or v_job.lease_owner is distinct from worker_id
    or v_job.lease_generation is distinct from lease_generation
    or v_job.lease_expires_at is null
    or v_job.lease_expires_at < v_now
    or v_job.attempt_count is distinct from attempt then
    return query select false;
    return;
  end if;

  select permit.*
    into v_permit
  from public.youtube_extractor_permits as permit
  where permit.permit_key = 'primary'
  for update;

  if not found
    or v_permit.owner_id is distinct from worker_id
    or v_permit.permit_generation is distinct from permit_generation
    or v_permit.expires_at is null
    or v_permit.expires_at < v_now then
    return query select false;
    return;
  end if;

  v_requested_ordinal := case stage
    when 'source_fetch' then 1
    when 'video_download' then 2
    when 'frame_extraction' then 3
    when 'model_analysis' then 4
    when 'finalizing' then 5
  end;
  v_current_ordinal := case v_job.progress_stage
    when 'queued' then 0
    when 'source_fetch' then 1
    when 'video_download' then 2
    when 'frame_extraction' then 3
    when 'model_analysis' then 4
    when 'finalizing' then 5
    else null
  end;

  if v_job.progress_attempt is not distinct from attempt then
    if v_current_ordinal is null or v_requested_ordinal < v_current_ordinal then
      return query select false;
      return;
    end if;

    if v_requested_ordinal = v_current_ordinal then
      return query select true;
      return;
    end if;
  elsif stage is distinct from 'source_fetch' then
    return query select false;
    return;
  end if;

  insert into private.youtube_extraction_progress_stage_events (
    job_id,
    attempt,
    stage,
    entered_at,
    video_duration_seconds
  ) values (
    report_youtube_extraction_progress.job_id,
    report_youtube_extraction_progress.attempt,
    report_youtube_extraction_progress.stage,
    v_now,
    report_youtube_extraction_progress.video_duration_seconds
  )
  on conflict on constraint youtube_extraction_progress_stage_events_pkey
  do nothing;

  update public.youtube_extraction_jobs as job
  set progress_attempt = report_youtube_extraction_progress.attempt,
      progress_stage = report_youtube_extraction_progress.stage,
      progress_stage_started_at = v_now,
      progress_updated_at = v_now,
      video_duration_seconds = coalesce(
        job.video_duration_seconds,
        report_youtube_extraction_progress.video_duration_seconds
      ),
      updated_at = v_now
  where job.id = report_youtube_extraction_progress.job_id;

  return query select true;
end;
$function$;

grant create on schema public to youtube_extraction_worker_rpc_owner;

alter function public.report_youtube_extraction_progress(
  uuid, text, bigint, bigint, integer, text, integer
) owner to youtube_extraction_worker_rpc_owner;

set local role youtube_extraction_worker_rpc_owner;

revoke all on function public.report_youtube_extraction_progress(
  uuid, text, bigint, bigint, integer, text, integer
) from public, anon, authenticated, service_role,
  youtube_extraction_credential_manager,
  youtube_extraction_enqueue_rpc_owner,
  youtube_extraction_credential_manager_rpc_owner;
grant execute on function public.report_youtube_extraction_progress(
  uuid, text, bigint, bigint, integer, text, integer
) to youtube_extraction_worker;

-- Keep this projection internal and source-oriented. Phase D derives the public
-- confirmed floor and ETA fields from these authoritative DB values.
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
    'progress', case
      when job.status not in ('queued', 'processing')
        or job.progress_attempt is null
        or job.progress_stage is null then null
      else jsonb_build_object(
        'attempt', job.progress_attempt,
        'stage', job.progress_stage,
        'stage_started_at', to_char(
          job.progress_stage_started_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'updated_at', to_char(
          job.progress_updated_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'video_duration_seconds', job.video_duration_seconds
      )
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
    into v_payload
  from public.youtube_extraction_jobs as job
  left join public.youtube_extraction_sessions as session_row
    on session_row.id = job.extraction_session_id
  where job.id = v_requested_job_id
    and job.user_id = v_requested_user_id;

  return v_payload;
end;
$function$;

alter function public.read_youtube_extraction_job_projection(uuid)
  owner to youtube_extraction_worker_rpc_owner;

revoke all on function public.read_youtube_extraction_job_projection(uuid)
from public, anon, service_role, youtube_extraction_worker,
  youtube_extraction_credential_manager;
grant execute on function public.read_youtube_extraction_job_projection(uuid)
to authenticated;

reset role;

revoke create on schema public from youtube_extraction_worker_rpc_owner;

-- New credentials and the expected-schema artifact move together. The release
-- installer still performs the final same-SHA credential/app/worker attestation.
update private.youtube_extraction_worker_credentials
set schema_identity = 'youtube-extraction-worker-schema-v2'
where credential_name = 'primary'
  and schema_identity is distinct from 'youtube-extraction-worker-schema-v2';

-- Extend the live catalog inventory and temporarily pin the expected digest.
-- The exact digest below is replaced after the isolated PG15/PG17 catalog run.
do $membership$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute format(
      'grant youtube_extraction_credential_manager_rpc_owner to %I with inherit false, set true granted by %I',
      current_user,
      current_user
    );
  else
    execute format(
      'grant youtube_extraction_credential_manager_rpc_owner to %I',
      current_user
    );
  end if;
end;
$membership$;

grant create on schema public, private
  to youtube_extraction_credential_manager_rpc_owner;

set local role youtube_extraction_credential_manager_rpc_owner;

do $rewrite_catalog$
declare
  v_previous_fingerprint constant text :=
    '1f452cdfb35031c2f9be5f8162f11878f443834d5d42265b64e77dceddc129e3';
  v_current_fingerprint constant text :=
    '06e3d277cbf5ae9199c21866567b141698385fa25c0429289c3b53002ca51e13';
  v_signature regprocedure;
  v_definition text;
  v_rewritten text;
  v_inventory_source constant text :=
    E'          ''private.youtube_extraction_worker_credentials'',\n';
  v_inventory_target constant text :=
    E'          ''private.youtube_extraction_worker_credentials'',\n          ''private.youtube_extraction_progress_stage_events'',\n';
begin
  v_signature := 'public.read_youtube_extraction_enqueue_readiness()'::regprocedure;
  v_definition := pg_catalog.pg_get_functiondef(v_signature);

  if pg_catalog.strpos(
    v_definition,
    'private.youtube_extraction_progress_stage_events'
  ) = 0 then
    v_definition := pg_catalog.replace(
      v_definition,
      v_inventory_source,
      v_inventory_target
    );
  end if;

  if pg_catalog.strpos(
    v_definition,
    'private.youtube_extraction_progress_stage_events'
  ) = 0 then
    raise exception 'YouTube truthful progress table inventory source drifted'
      using errcode = '55000';
  end if;

  v_rewritten := pg_catalog.replace(
    v_definition,
    v_previous_fingerprint,
    v_current_fingerprint
  );
  if pg_catalog.strpos(v_rewritten, v_current_fingerprint) = 0 then
    raise exception 'YouTube truthful progress catalog rewrite failed'
      using errcode = '55000';
  end if;
  execute v_rewritten;

  v_signature := 'private.assert_youtube_extraction_catalog_ready()'::regprocedure;
  v_definition := pg_catalog.pg_get_functiondef(v_signature);
  if pg_catalog.strpos(v_definition, v_current_fingerprint) = 0 then
    v_definition := pg_catalog.replace(
      v_definition,
      v_previous_fingerprint,
      v_current_fingerprint
    );
  end if;
  if pg_catalog.strpos(v_definition, v_current_fingerprint) = 0 then
    raise exception 'YouTube truthful progress assertion rewrite failed'
      using errcode = '55000';
  end if;
  execute v_definition;
end;
$rewrite_catalog$;

reset role;

revoke create on schema public, private
  from youtube_extraction_credential_manager_rpc_owner;

do $membership$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute format(
      'revoke youtube_extraction_credential_manager_rpc_owner from %I granted by %I',
      current_user,
      current_user
    );
  else
    execute format(
      'revoke youtube_extraction_credential_manager_rpc_owner from %I',
      current_user
    );
  end if;
end;
$membership$;

do $temporary_role_membership$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute format(
      'revoke youtube_extraction_enqueue_rpc_owner, youtube_extraction_worker_rpc_owner from %I granted by %I',
      current_user,
      current_user
    );
  else
    execute format(
      'revoke youtube_extraction_enqueue_rpc_owner, youtube_extraction_worker_rpc_owner from %I',
      current_user
    );
  end if;
end;
$temporary_role_membership$;

commit;
