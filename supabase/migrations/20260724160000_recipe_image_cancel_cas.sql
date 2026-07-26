begin;

create or replace function public.cancel_recipe_image_upload(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamp with time zone,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_idempotency_key uuid,
  p_image_object_id uuid,
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
  v_upload_idempotency public.mutation_idempotency_keys%rowtype;
  v_object public.recipe_image_objects%rowtype;
  v_key_hash text;
  v_payload_hash text;
  v_next_cleanup_generation bigint;
  v_outbox_id uuid;
  v_quota_released boolean;
  v_result jsonb;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'recipe image cancel requires READ COMMITTED'
      using errcode = '25001';
  end if;

  if p_owner_uuid is null
    or p_auth_identity_created_at_snapshot is null
    or nullif(p_session_key_hash, '') is null
    or length(p_session_key_hash) < 32
    or p_hmac_key_version is null
    or p_hmac_key_version <= 0
    or p_idempotency_key is null
    or p_image_object_id is null
    or p_now is null then
    raise exception 'recipe image cancel fields are invalid'
      using errcode = '22023';
  end if;

  v_key_hash := encode(
    extensions.digest(
      pg_catalog.convert_to(p_idempotency_key::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_payload_hash := encode(
    extensions.digest(
      pg_catalog.convert_to(p_image_object_id::text, 'UTF8'),
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
    and idempotency.operation_scope = 'recipe_image_cancel'
    and idempotency.key_hash = v_key_hash
  for update;

  if v_idempotency.id is not null then
    if v_idempotency.payload_hash is distinct from v_payload_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED'
        using errcode = '23505';
    end if;

    if v_idempotency.state = 'succeeded'
      and v_idempotency.durable_result is not null then
      return v_idempotency.durable_result;
    end if;

    raise exception 'IMAGE_EXPIRED'
      using errcode = '55000';
  end if;

  select idempotency.*
    into v_upload_idempotency
  from public.mutation_idempotency_keys as idempotency
  where idempotency.owner_uuid = p_owner_uuid
    and idempotency.account_generation = v_lifecycle.account_generation
    and idempotency.operation_scope = 'recipe_image_upload'
    and idempotency.result_reference = p_image_object_id
  for update;

  select object.*
    into v_object
  from public.recipe_image_objects as object
  where object.id = p_image_object_id
    and object.owner_uuid = p_owner_uuid
    and object.account_generation = v_lifecycle.account_generation
    and object.visibility = 'private'
  for update;

  if v_object.id is null then
    raise exception 'IMAGE_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_upload_idempotency.id is null
    or v_object.state not in ('pending_upload', 'uploaded_unlinked')
    or (
      v_object.state = 'pending_upload'
      and (
        v_upload_idempotency.state <> 'in_progress'
        or v_upload_idempotency.attempt_token
          is distinct from v_object.upload_attempt_token
      )
    )
    or (
      v_object.state = 'uploaded_unlinked'
      and (
        v_upload_idempotency.state <> 'succeeded'
        or v_object.unlinked_cleanup_after is null
        or v_object.unlinked_cleanup_after <= p_now
      )
    )
    or exists (
      select 1
      from public.recipe_image_object_references as reference
      where reference.image_object_id = p_image_object_id
    )
    or v_object.cleanup_generation = 9223372036854775807 then
    raise exception 'IMAGE_EXPIRED'
      using errcode = '55000';
  end if;

  v_next_cleanup_generation := v_object.cleanup_generation + 1;

  update public.mutation_idempotency_keys as idempotency
  set state = 'cancelled',
      terminal_result = 'cleanup_pending',
      attempt_token = null,
      lease_expires_at = null,
      updated_at = p_now
  where idempotency.id = v_upload_idempotency.id
    and idempotency.result_reference = p_image_object_id
    and (
      (
        v_object.state = 'pending_upload'
        and idempotency.state = 'in_progress'
        and idempotency.attempt_token
          is not distinct from v_upload_idempotency.attempt_token
      )
      or (
        v_object.state = 'uploaded_unlinked'
        and idempotency.state = 'succeeded'
        and idempotency.attempt_token is null
      )
    );

  if not found then
    raise exception 'IMAGE_EXPIRED'
      using errcode = '55000';
  end if;

  update public.recipe_image_objects as object
  set state = 'cleanup_pending',
      cleanup_generation = v_next_cleanup_generation,
      upload_attempt_token = null,
      upload_lease_expires_at = null,
      unlinked_cleanup_after = null,
      updated_at = p_now
  where object.id = p_image_object_id
    and object.owner_uuid = p_owner_uuid
    and object.account_generation = v_lifecycle.account_generation
    and object.visibility = 'private'
    and object.state in ('pending_upload', 'uploaded_unlinked')
    and object.cleanup_generation = v_object.cleanup_generation
    and (
      (
        v_object.state = 'pending_upload'
        and object.upload_attempt_token
          is not distinct from v_object.upload_attempt_token
      )
      or (
        v_object.state = 'uploaded_unlinked'
        and object.upload_attempt_token is null
      )
    )
    and not exists (
      select 1
      from public.recipe_image_object_references as reference
      where reference.image_object_id = p_image_object_id
    );

  if not found then
    raise exception 'IMAGE_EXPIRED'
      using errcode = '55000';
  end if;

  v_outbox_id := public.enqueue_recipe_image_cleanup(
    p_image_object_id,
    p_owner_uuid,
    v_lifecycle.account_generation,
    v_next_cleanup_generation,
    'owner_cancelled'
  );

  if v_outbox_id is null then
    raise exception 'recipe image cancel cleanup enqueue failed'
      using errcode = '55000';
  end if;

  v_quota_released := public.release_recipe_image_upload_reservation(
    p_owner_uuid,
    v_lifecycle.account_generation,
    p_image_object_id,
    p_now
  );

  if not v_quota_released then
    raise exception 'recipe image cancel quota release failed'
      using errcode = '55000';
  end if;

  v_result := jsonb_build_object(
    'outcome',
    'succeeded',
    'object_id',
    p_image_object_id,
    'account_generation',
    v_lifecycle.account_generation,
    'cleanup_generation',
    v_next_cleanup_generation,
    'state',
    'cleanup_pending',
    'outbox_id',
    v_outbox_id
  );

  insert into public.mutation_idempotency_keys (
    owner_uuid,
    account_generation,
    operation_scope,
    key_hash,
    payload_hash,
    state,
    terminal_result,
    durable_result,
    result_reference,
    attempts,
    created_at,
    updated_at
  ) values (
    p_owner_uuid,
    v_lifecycle.account_generation,
    'recipe_image_cancel',
    v_key_hash,
    v_payload_hash,
    'succeeded',
    'cleanup_pending',
    v_result,
    p_image_object_id,
    1,
    p_now,
    p_now
  );

  return v_result;
end;
$function$;

revoke all on function public.cancel_recipe_image_upload(
  uuid,
  timestamp with time zone,
  text,
  integer,
  uuid,
  uuid,
  timestamp with time zone
) from public, anon, authenticated, service_role;
grant execute on function public.cancel_recipe_image_upload(
  uuid,
  timestamp with time zone,
  text,
  integer,
  uuid,
  uuid,
  timestamp with time zone
) to service_role;

commit;
