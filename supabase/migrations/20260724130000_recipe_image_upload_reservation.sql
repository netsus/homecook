begin;

create table if not exists public.mutation_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  owner_uuid uuid not null,
  account_generation bigint not null,
  operation_scope text not null,
  key_hash text not null,
  payload_hash text not null,
  state text not null,
  terminal_result text,
  durable_result jsonb,
  result_reference uuid,
  attempt_token uuid,
  attempts integer not null default 1,
  lease_expires_at timestamp with time zone,
  reserved_byte_size bigint,
  quota_reserved_at timestamp with time zone,
  quota_released_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint mutation_idempotency_keys_owner_generation_check
    check (account_generation > 0),
  constraint mutation_idempotency_keys_scope_check
    check (length(btrim(operation_scope)) > 0),
  constraint mutation_idempotency_keys_hash_check
    check (
      key_hash ~ '^[0-9a-f]{64}$'
      and payload_hash ~ '^[0-9a-f]{64}$'
    ),
  constraint mutation_idempotency_keys_state_check
    check (
      state in (
        'in_progress',
        'succeeded',
        'failed_retriable',
        'failed_terminal',
        'cancelled'
      )
    ),
  constraint mutation_idempotency_keys_attempt_check
    check (attempts > 0),
  constraint mutation_idempotency_keys_image_reservation_check
    check (
      operation_scope <> 'recipe_image_upload'
      or (
        result_reference is not null
        and reserved_byte_size between 0 and 5242880
        and quota_reserved_at is not null
      )
    ),
  constraint mutation_idempotency_keys_in_progress_lease_check
    check (
      state <> 'in_progress'
      or (
        attempt_token is not null
        and lease_expires_at is not null
      )
    ),
  constraint mutation_idempotency_keys_owner_scope_key_unique
    unique (
      owner_uuid,
      account_generation,
      operation_scope,
      key_hash
    )
);

create table if not exists public.image_upload_quota_counters (
  owner_uuid uuid not null,
  account_generation bigint not null,
  request_events jsonb not null default '[]'::jsonb,
  byte_events jsonb not null default '[]'::jsonb,
  active_reservation_count integer not null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  primary key (owner_uuid, account_generation),
  constraint image_upload_quota_counters_generation_check
    check (account_generation > 0),
  constraint image_upload_quota_counters_request_events_check
    check (jsonb_typeof(request_events) = 'array'),
  constraint image_upload_quota_counters_byte_events_check
    check (jsonb_typeof(byte_events) = 'array'),
  constraint image_upload_quota_counters_active_check
    check (active_reservation_count >= 0)
);

create index if not exists mutation_idempotency_keys_image_result_idx
  on public.mutation_idempotency_keys (
    owner_uuid,
    account_generation,
    result_reference
  )
  where operation_scope = 'recipe_image_upload';

alter table public.mutation_idempotency_keys enable row level security;
alter table public.image_upload_quota_counters enable row level security;

revoke all on table
  public.mutation_idempotency_keys,
  public.image_upload_quota_counters
from public, anon, authenticated, service_role;

create or replace function public.reserve_recipe_image_upload(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamp with time zone,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_idempotency_key uuid,
  p_payload_hash text,
  p_raw_sha256 text,
  p_byte_size bigint,
  p_actual_mime_type text,
  p_extension text,
  p_now timestamp with time zone default clock_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_capability_state text;
  v_lifecycle public.user_account_lifecycles%rowtype;
  v_binding public.user_session_generation_bindings%rowtype;
  v_idempotency public.mutation_idempotency_keys%rowtype;
  v_counter public.image_upload_quota_counters%rowtype;
  v_object public.recipe_image_objects%rowtype;
  v_key_hash text;
  v_object_id uuid;
  v_attempt_token uuid;
  v_request_count integer;
  v_byte_total bigint;
  v_backlog_count bigint;
  v_oldest_due timestamp with time zone;
  v_has_dead_letter boolean;
  v_request_events jsonb;
  v_byte_events jsonb;
  v_retry_after_seconds integer;
  v_normalized_extension text := lower(btrim(p_extension));
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'recipe image upload reservation requires READ COMMITTED'
      using errcode = '25001';
  end if;

  if p_owner_uuid is null
    or p_auth_identity_created_at_snapshot is null
    or nullif(p_session_key_hash, '') is null
    or length(p_session_key_hash) < 32
    or p_hmac_key_version is null
    or p_hmac_key_version <= 0
    or p_idempotency_key is null
    or p_payload_hash is null
    or p_payload_hash !~ '^[0-9a-f]{64}$'
    or p_raw_sha256 is null
    or p_raw_sha256 !~ '^[0-9a-f]{64}$'
    or p_byte_size is null
    or p_byte_size < 0
    or p_byte_size > 5242880
    or p_actual_mime_type is null
    or p_actual_mime_type not in ('image/jpeg', 'image/png', 'image/webp')
    or p_extension is null
    or v_normalized_extension not in ('jpg', 'jpeg', 'png', 'webp')
    or (
      p_actual_mime_type = 'image/jpeg'
      and v_normalized_extension not in ('jpg', 'jpeg')
    )
    or (
      p_actual_mime_type = 'image/png'
      and v_normalized_extension <> 'png'
    )
    or (
      p_actual_mime_type = 'image/webp'
      and v_normalized_extension <> 'webp'
    )
    or p_now is null then
    raise exception 'recipe image upload reservation fields are invalid'
      using errcode = '22023';
  end if;

  v_key_hash := encode(
    extensions.digest(
      pg_catalog.convert_to(p_idempotency_key::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
  );

  select capability.state
    into v_capability_state
  from public.account_generation_capability_state as capability
  where capability.singleton
  for key share;

  if v_capability_state is distinct from 'generation_active' then
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'homecook-account-owner:' || p_owner_uuid::text,
      0
    )
  );

  select lifecycle.*
    into v_lifecycle
  from public.user_account_lifecycles as lifecycle
  where lifecycle.owner_uuid = p_owner_uuid
  order by lifecycle.account_generation desc
  limit 1
  for update;

  if v_lifecycle.owner_uuid is null
    or v_lifecycle.status is distinct from 'active'
    or v_lifecycle.auth_identity_created_at_snapshot
      is distinct from p_auth_identity_created_at_snapshot then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  select binding.*
    into v_binding
  from public.user_session_generation_bindings as binding
  where binding.session_key_hash = p_session_key_hash
    and binding.hmac_key_version = p_hmac_key_version
    and binding.owner_uuid = p_owner_uuid
    and binding.expected_account_generation = v_lifecycle.account_generation
    and binding.auth_identity_created_at_snapshot
      = p_auth_identity_created_at_snapshot
    and binding.revoked_at is null
  for key share;

  if v_binding.owner_uuid is null then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  select idempotency.*
    into v_idempotency
  from public.mutation_idempotency_keys as idempotency
  where idempotency.owner_uuid = p_owner_uuid
    and idempotency.account_generation = v_lifecycle.account_generation
    and idempotency.operation_scope = 'recipe_image_upload'
    and idempotency.key_hash = v_key_hash
  for update;

  if v_idempotency.id is not null then
    if v_idempotency.payload_hash is distinct from p_payload_hash
      or v_idempotency.reserved_byte_size is distinct from p_byte_size then
      raise exception 'IDEMPOTENCY_KEY_REUSED'
        using errcode = '23505';
    end if;

    select object.*
      into v_object
    from public.recipe_image_objects as object
    where object.id = v_idempotency.result_reference
      and object.owner_uuid = p_owner_uuid
      and object.account_generation = v_lifecycle.account_generation
    for update;

    if v_object.id is null then
      raise exception 'IMAGE_UPLOAD_CONFLICT'
        using errcode = '55000';
    end if;

    if v_idempotency.state = 'succeeded' then
      return jsonb_build_object(
        'outcome', 'succeeded',
        'object_id', v_object.id,
        'account_generation', v_lifecycle.account_generation,
        'cleanup_generation', v_object.cleanup_generation,
        'bucket_id', v_object.bucket_id,
        'object_path', v_object.object_path,
        'state', v_object.state
      );
    end if;

    if v_idempotency.state <> 'in_progress'
      or v_object.state <> 'pending_upload' then
      return jsonb_build_object(
        'outcome', 'terminal',
        'object_id', v_object.id,
        'account_generation', v_lifecycle.account_generation,
        'cleanup_generation', v_object.cleanup_generation,
        'bucket_id', v_object.bucket_id,
        'object_path', v_object.object_path,
        'state', v_object.state,
        'terminal_result', v_idempotency.terminal_result
      );
    end if;

    if v_idempotency.lease_expires_at > p_now
      and v_object.upload_lease_expires_at > p_now
      and v_idempotency.attempt_token = v_object.upload_attempt_token then
      v_retry_after_seconds := greatest(
        1,
        ceil(
          extract(epoch from (v_idempotency.lease_expires_at - p_now))
        )::integer
      );
      return jsonb_build_object(
        'outcome', 'live_replay',
        'object_id', v_object.id,
        'attempt_token', v_idempotency.attempt_token,
        'account_generation', v_lifecycle.account_generation,
        'cleanup_generation', v_object.cleanup_generation,
        'bucket_id', v_object.bucket_id,
        'object_path', v_object.object_path,
        'state', v_object.state,
        'retry_after_seconds', v_retry_after_seconds
      );
    end if;

    if v_idempotency.attempt_token is distinct from v_object.upload_attempt_token
      or v_object.cleanup_generation < 0 then
      raise exception 'IMAGE_EXPIRED'
        using errcode = '55000';
    end if;

    v_attempt_token := gen_random_uuid();

    update public.mutation_idempotency_keys as idempotency
    set attempt_token = v_attempt_token,
        attempts = idempotency.attempts + 1,
        lease_expires_at = p_now + interval '5 minutes',
        updated_at = p_now
    where idempotency.id = v_idempotency.id
      and idempotency.state = 'in_progress'
      and idempotency.attempt_token = v_idempotency.attempt_token;

    if not found then
      raise exception 'IMAGE_EXPIRED'
        using errcode = '55000';
    end if;

    update public.recipe_image_objects as object
    set upload_attempt_token = v_attempt_token,
        upload_lease_expires_at = p_now + interval '5 minutes',
        updated_at = p_now
    where object.id = v_object.id
      and object.state = 'pending_upload'
      and object.owner_uuid = p_owner_uuid
      and object.account_generation = v_lifecycle.account_generation
      and object.upload_attempt_token = v_object.upload_attempt_token
      and object.cleanup_generation = v_object.cleanup_generation;

    if not found then
      raise exception 'IMAGE_EXPIRED'
        using errcode = '55000';
    end if;

    return jsonb_build_object(
      'outcome', 'takeover',
      'object_id', v_object.id,
      'attempt_token', v_attempt_token,
      'account_generation', v_lifecycle.account_generation,
      'cleanup_generation', v_object.cleanup_generation,
      'bucket_id', v_object.bucket_id,
      'object_path', v_object.object_path,
      'state', 'pending_upload'
    );
  end if;

  insert into public.image_upload_quota_counters (
    owner_uuid,
    account_generation
  ) values (
    p_owner_uuid,
    v_lifecycle.account_generation
  )
  on conflict (owner_uuid, account_generation) do nothing;

  select counter.*
    into v_counter
  from public.image_upload_quota_counters as counter
  where counter.owner_uuid = p_owner_uuid
    and counter.account_generation = v_lifecycle.account_generation
  for update;

  select coalesce(jsonb_agg(event.value order by event.ordinality), '[]'::jsonb)
    into v_request_events
  from jsonb_array_elements(v_counter.request_events)
    with ordinality as event(value, ordinality)
  where (event.value ->> 'at')::timestamp with time zone
    > p_now - interval '10 minutes';

  select coalesce(jsonb_agg(event.value order by event.ordinality), '[]'::jsonb)
    into v_byte_events
  from jsonb_array_elements(v_counter.byte_events)
    with ordinality as event(value, ordinality)
  where (event.value ->> 'at')::timestamp with time zone
    > p_now - interval '24 hours';

  v_request_count := jsonb_array_length(v_request_events);
  select coalesce(sum((event.value ->> 'bytes')::bigint), 0)
    into v_byte_total
  from jsonb_array_elements(v_byte_events) as event(value);

  select
    count(*) filter (
      where outbox.state in (
        'pending',
        'processing',
        'awaiting_not_found_recheck',
        'failed',
        'dead_letter'
      )
    ),
    min(outbox.next_attempt_at) filter (
      where outbox.state in ('pending', 'failed')
        and outbox.next_attempt_at <= p_now
    ),
    coalesce(bool_or(outbox.state = 'dead_letter'), false)
  into v_backlog_count, v_oldest_due, v_has_dead_letter
  from public.storage_object_deletion_outbox as outbox;

  if v_request_count >= 10
    or v_byte_total + p_byte_size > 104857600
    or v_counter.active_reservation_count >= 20
    or v_backlog_count >= 500
    or (
      v_oldest_due is not null
      and v_oldest_due < p_now - interval '15 minutes'
    )
    or v_has_dead_letter then
    return jsonb_build_object(
      'outcome', 'limited',
      'retry_after_seconds', 60
    );
  end if;

  v_object_id := gen_random_uuid();
  v_attempt_token := gen_random_uuid();

  insert into public.recipe_image_objects (
    id,
    owner_uuid,
    account_generation,
    bucket_id,
    object_path,
    raw_sha256,
    byte_size,
    actual_mime_type,
    visibility,
    state,
    upload_attempt_token,
    cleanup_generation,
    upload_lease_expires_at,
    created_at,
    updated_at
  ) values (
    v_object_id,
    p_owner_uuid,
    v_lifecycle.account_generation,
    'recipe-images-private',
    p_owner_uuid::text
      || '/'
      || v_lifecycle.account_generation::text
      || '/'
      || v_object_id::text
      || '.'
      || v_normalized_extension,
    p_raw_sha256,
    p_byte_size,
    p_actual_mime_type,
    'private',
    'pending_upload',
    v_attempt_token,
    0,
    p_now + interval '5 minutes',
    p_now,
    p_now
  );

  insert into public.mutation_idempotency_keys (
    owner_uuid,
    account_generation,
    operation_scope,
    key_hash,
    payload_hash,
    state,
    result_reference,
    attempt_token,
    attempts,
    lease_expires_at,
    reserved_byte_size,
    quota_reserved_at,
    created_at,
    updated_at
  ) values (
    p_owner_uuid,
    v_lifecycle.account_generation,
    'recipe_image_upload',
    v_key_hash,
    p_payload_hash,
    'in_progress',
    v_object_id,
    v_attempt_token,
    1,
    p_now + interval '5 minutes',
    p_byte_size,
    p_now,
    p_now,
    p_now
  );

  update public.image_upload_quota_counters as counter
  set request_events = v_request_events || jsonb_build_array(
        jsonb_build_object(
          'at',
          p_now
        )
      ),
      byte_events = v_byte_events || jsonb_build_array(
        jsonb_build_object(
          'at',
          p_now,
          'bytes',
          p_byte_size
        )
      ),
      active_reservation_count = counter.active_reservation_count + 1,
      updated_at = p_now
  where counter.owner_uuid = p_owner_uuid
    and counter.account_generation = v_lifecycle.account_generation;

  return jsonb_build_object(
    'outcome', 'reserved',
    'object_id', v_object_id,
    'attempt_token', v_attempt_token,
    'account_generation', v_lifecycle.account_generation,
    'cleanup_generation', 0,
    'bucket_id', 'recipe-images-private',
    'object_path',
      p_owner_uuid::text
        || '/'
        || v_lifecycle.account_generation::text
        || '/'
        || v_object_id::text
        || '.'
        || v_normalized_extension,
    'state', 'pending_upload'
  );
end;
$function$;

create or replace function public.finalize_recipe_image_upload(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamp with time zone,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_idempotency_key uuid,
  p_attempt_token uuid,
  p_cleanup_generation bigint,
  p_now timestamp with time zone default clock_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_capability_state text;
  v_lifecycle public.user_account_lifecycles%rowtype;
  v_binding public.user_session_generation_bindings%rowtype;
  v_idempotency public.mutation_idempotency_keys%rowtype;
  v_object public.recipe_image_objects%rowtype;
  v_key_hash text;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'recipe image upload finalize requires READ COMMITTED'
      using errcode = '25001';
  end if;

  if p_owner_uuid is null
    or p_auth_identity_created_at_snapshot is null
    or nullif(p_session_key_hash, '') is null
    or length(p_session_key_hash) < 32
    or p_hmac_key_version is null
    or p_hmac_key_version <= 0
    or p_idempotency_key is null
    or p_attempt_token is null
    or p_cleanup_generation is null
    or p_cleanup_generation < 0
    or p_now is null then
    raise exception 'recipe image upload finalize fields are invalid'
      using errcode = '22023';
  end if;

  v_key_hash := encode(
    extensions.digest(
      pg_catalog.convert_to(p_idempotency_key::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
  );
  select capability.state
    into v_capability_state
  from public.account_generation_capability_state as capability
  where capability.singleton
  for key share;

  if v_capability_state is distinct from 'generation_active' then
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'homecook-account-owner:' || p_owner_uuid::text,
      0
    )
  );

  select lifecycle.*
    into v_lifecycle
  from public.user_account_lifecycles as lifecycle
  where lifecycle.owner_uuid = p_owner_uuid
  order by lifecycle.account_generation desc
  limit 1
  for update;

  if v_lifecycle.owner_uuid is null
    or v_lifecycle.status is distinct from 'active'
    or v_lifecycle.auth_identity_created_at_snapshot
      is distinct from p_auth_identity_created_at_snapshot then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  select binding.*
    into v_binding
  from public.user_session_generation_bindings as binding
  where binding.session_key_hash = p_session_key_hash
    and binding.hmac_key_version = p_hmac_key_version
    and binding.owner_uuid = p_owner_uuid
    and binding.expected_account_generation = v_lifecycle.account_generation
    and binding.auth_identity_created_at_snapshot
      = p_auth_identity_created_at_snapshot
    and binding.revoked_at is null
  for key share;

  if v_binding.owner_uuid is null then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  select idempotency.*
    into v_idempotency
  from public.mutation_idempotency_keys as idempotency
  where idempotency.owner_uuid = p_owner_uuid
    and idempotency.account_generation = v_lifecycle.account_generation
    and idempotency.operation_scope = 'recipe_image_upload'
    and idempotency.key_hash = v_key_hash
    and idempotency.state = 'in_progress'
    and idempotency.attempt_token = p_attempt_token
    and idempotency.lease_expires_at > p_now
  for update;

  if v_idempotency.id is null then
    raise exception 'IMAGE_EXPIRED'
      using errcode = '55000';
  end if;

  select object.*
    into v_object
  from public.recipe_image_objects as object
  where object.id = v_idempotency.result_reference
    and object.owner_uuid = p_owner_uuid
    and object.account_generation = v_lifecycle.account_generation
    and object.state = 'pending_upload'
    and object.upload_attempt_token = p_attempt_token
    and object.upload_lease_expires_at > p_now
    and object.cleanup_generation = p_cleanup_generation
  for update;

  if v_object.id is null then
    raise exception 'IMAGE_EXPIRED'
      using errcode = '55000';
  end if;

  update public.recipe_image_objects as object
  set state = 'uploaded_unlinked',
      upload_attempt_token = null,
      upload_lease_expires_at = null,
      unlinked_cleanup_after = p_now + interval '24 hours',
      updated_at = p_now
  where object.id = v_object.id
    and object.state = 'pending_upload'
    and object.upload_attempt_token = p_attempt_token
    and object.upload_lease_expires_at > p_now
    and object.cleanup_generation = p_cleanup_generation;

  if not found then
    raise exception 'IMAGE_EXPIRED'
      using errcode = '55000';
  end if;

  update public.mutation_idempotency_keys as idempotency
  set state = 'succeeded',
      durable_result = jsonb_build_object(
        'object_id',
        v_object.id,
        'state',
        'uploaded_unlinked'
      ),
      attempt_token = null,
      lease_expires_at = null,
      updated_at = p_now
  where idempotency.id = v_idempotency.id
    and idempotency.state = 'in_progress'
    and idempotency.attempt_token = p_attempt_token
    and idempotency.lease_expires_at > p_now;

  if not found then
    raise exception 'IMAGE_EXPIRED'
      using errcode = '55000';
  end if;

  return jsonb_build_object(
    'outcome', 'succeeded',
    'object_id', v_object.id,
    'state', 'uploaded_unlinked',
    'unlinked_cleanup_after', p_now + interval '24 hours'
  );
end;
$function$;

create or replace function public.release_recipe_image_upload_reservation(
  p_owner_uuid uuid,
  p_account_generation bigint,
  p_image_object_id uuid,
  p_now timestamp with time zone default clock_timestamp()
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_idempotency_id uuid;
begin
  if p_owner_uuid is null
    or p_account_generation is null
    or p_account_generation <= 0
    or p_image_object_id is null
    or p_now is null then
    raise exception 'recipe image quota release fields are invalid'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'homecook-account-owner:' || p_owner_uuid::text,
      0
    )
  );

  select idempotency.id
    into v_idempotency_id
  from public.mutation_idempotency_keys as idempotency
  join public.recipe_image_objects as object
    on object.id = idempotency.result_reference
   and object.owner_uuid = idempotency.owner_uuid
   and object.account_generation = idempotency.account_generation
  where idempotency.owner_uuid = p_owner_uuid
    and idempotency.account_generation = p_account_generation
    and idempotency.operation_scope = 'recipe_image_upload'
    and idempotency.result_reference = p_image_object_id
    and idempotency.state in (
      'succeeded',
      'failed_terminal',
      'cancelled'
    )
    and idempotency.quota_released_at is null
    and object.state not in ('pending_upload', 'uploaded_unlinked')
  for update of idempotency, object;

  if v_idempotency_id is null then
    return false;
  end if;

  update public.image_upload_quota_counters
  set active_reservation_count = greatest(
        active_reservation_count - 1,
        0
      ),
      updated_at = p_now
  where owner_uuid = p_owner_uuid
    and account_generation = p_account_generation;

  if not found then
    raise exception 'recipe image quota counter is unavailable'
      using errcode = '55000';
  end if;

  update public.mutation_idempotency_keys
  set quota_released_at = p_now,
      updated_at = p_now
  where id = v_idempotency_id
    and quota_released_at is null;

  return found;
end;
$function$;

revoke all on function public.reserve_recipe_image_upload(
  uuid,
  timestamp with time zone,
  text,
  integer,
  uuid,
  text,
  text,
  bigint,
  text,
  text,
  timestamp with time zone
) from public, anon, authenticated, service_role;
grant execute on function public.reserve_recipe_image_upload(
  uuid,
  timestamp with time zone,
  text,
  integer,
  uuid,
  text,
  text,
  bigint,
  text,
  text,
  timestamp with time zone
) to service_role;

revoke all on function public.finalize_recipe_image_upload(
  uuid,
  timestamp with time zone,
  text,
  integer,
  uuid,
  uuid,
  bigint,
  timestamp with time zone
) from public, anon, authenticated, service_role;
grant execute on function public.finalize_recipe_image_upload(
  uuid,
  timestamp with time zone,
  text,
  integer,
  uuid,
  uuid,
  bigint,
  timestamp with time zone
) to service_role;

revoke all on function public.release_recipe_image_upload_reservation(
  uuid,
  bigint,
  uuid,
  timestamp with time zone
) from public, anon, authenticated, service_role;
grant execute on function public.release_recipe_image_upload_reservation(
  uuid,
  bigint,
  uuid,
  timestamp with time zone
) to service_role;

commit;
