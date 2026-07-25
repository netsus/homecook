begin;

create or replace function public.compensate_recipe_image_upload(
  p_owner_uuid uuid,
  p_account_generation bigint,
  p_idempotency_key uuid,
  p_image_object_id uuid,
  p_attempt_token uuid,
  p_cleanup_generation bigint,
  p_reason text,
  p_now timestamp with time zone default clock_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_idempotency public.mutation_idempotency_keys%rowtype;
  v_object public.recipe_image_objects%rowtype;
  v_key_hash text;
  v_outbox_id uuid;
  v_quota_released boolean;
  v_next_cleanup_generation bigint;
  v_reason text := btrim(p_reason);
  v_result jsonb;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'recipe image upload compensation requires READ COMMITTED'
      using errcode = '25001';
  end if;

  if p_owner_uuid is null
    or p_account_generation is null
    or p_account_generation <= 0
    or p_idempotency_key is null
    or p_image_object_id is null
    or p_attempt_token is null
    or p_cleanup_generation is null
    or p_cleanup_generation < 0
    or v_reason is null
    or v_reason not in (
      'storage_upload_failed',
      'storage_upload_timeout',
      'storage_finalize_failed',
      'storage_compensation_failed'
    )
    or p_now is null then
    raise exception 'recipe image upload compensation fields are invalid'
      using errcode = '22023';
  end if;

  v_key_hash := encode(
    extensions.digest(
      pg_catalog.convert_to(p_idempotency_key::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
  v_next_cleanup_generation := p_cleanup_generation + 1;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'homecook-account-owner:' || p_owner_uuid::text,
      0
    )
  );

  select idempotency.*
    into v_idempotency
  from public.mutation_idempotency_keys as idempotency
  where idempotency.owner_uuid = p_owner_uuid
    and idempotency.account_generation = p_account_generation
    and idempotency.operation_scope = 'recipe_image_upload'
    and idempotency.key_hash = v_key_hash
    and idempotency.result_reference = p_image_object_id
  for update;

  select object.*
    into v_object
  from public.recipe_image_objects as object
  where object.id = p_image_object_id
    and object.owner_uuid = p_owner_uuid
    and object.account_generation = p_account_generation
    and object.visibility = 'private'
  for update;

  if v_idempotency.id is null or v_object.id is null then
    raise exception 'IMAGE_EXPIRED'
      using errcode = '55000';
  end if;

  if v_idempotency.state = 'failed_terminal'
    and v_idempotency.terminal_result = 'cleanup_pending'
    and v_object.cleanup_generation = v_next_cleanup_generation
    and v_idempotency.durable_result is not null then
    return v_idempotency.durable_result;
  end if;

  if v_idempotency.state <> 'in_progress'
    or v_idempotency.attempt_token is distinct from p_attempt_token
    or v_object.state <> 'pending_upload'
    or v_object.upload_attempt_token is distinct from p_attempt_token
    or v_object.cleanup_generation <> p_cleanup_generation then
    raise exception 'IMAGE_EXPIRED'
      using errcode = '55000';
  end if;

  update public.recipe_image_objects as object
  set state = 'cleanup_pending',
      cleanup_generation = p_cleanup_generation + 1,
      upload_attempt_token = null,
      upload_lease_expires_at = null,
      unlinked_cleanup_after = null,
      updated_at = p_now
  where object.id = p_image_object_id
    and object.owner_uuid = p_owner_uuid
    and object.account_generation = p_account_generation
    and object.state = 'pending_upload'
    and object.upload_attempt_token = p_attempt_token
    and object.cleanup_generation = p_cleanup_generation;

  if not found then
    raise exception 'IMAGE_EXPIRED'
      using errcode = '55000';
  end if;

  v_result := jsonb_build_object(
    'outcome',
    'cleanup_pending',
    'object_id',
    p_image_object_id,
    'account_generation',
    p_account_generation,
    'cleanup_generation',
    v_next_cleanup_generation,
    'state',
    'cleanup_pending'
  );

  update public.mutation_idempotency_keys as idempotency
  set state = 'failed_terminal',
      terminal_result = 'cleanup_pending',
      durable_result = v_result,
      attempt_token = null,
      lease_expires_at = null,
      updated_at = p_now
  where idempotency.id = v_idempotency.id
    and idempotency.state = 'in_progress'
    and idempotency.attempt_token = p_attempt_token;

  if not found then
    raise exception 'IMAGE_EXPIRED'
      using errcode = '55000';
  end if;

  v_outbox_id := public.enqueue_recipe_image_cleanup(
    p_image_object_id,
    p_owner_uuid,
    p_account_generation,
    v_next_cleanup_generation,
    v_reason
  );

  if v_outbox_id is null then
    raise exception 'recipe image cleanup enqueue failed'
      using errcode = '55000';
  end if;

  v_result := v_result || jsonb_build_object('outbox_id', v_outbox_id);

  update public.mutation_idempotency_keys as idempotency
  set durable_result = v_result,
      updated_at = p_now
  where idempotency.id = v_idempotency.id
    and idempotency.state = 'failed_terminal'
    and idempotency.terminal_result = 'cleanup_pending';

  if not found then
    raise exception 'recipe image compensation result persistence failed'
      using errcode = '55000';
  end if;

  v_quota_released := public.release_recipe_image_upload_reservation(
    p_owner_uuid,
    p_account_generation,
    p_image_object_id,
    p_now
  );

  if not v_quota_released then
    raise exception 'recipe image quota release failed'
      using errcode = '55000';
  end if;

  return v_result;
end;
$function$;

revoke all on function public.compensate_recipe_image_upload(
  uuid,
  bigint,
  uuid,
  uuid,
  uuid,
  bigint,
  text,
  timestamp with time zone
) from public, anon, authenticated, service_role;
grant execute on function public.compensate_recipe_image_upload(
  uuid,
  bigint,
  uuid,
  uuid,
  uuid,
  bigint,
  text,
  timestamp with time zone
) to service_role;

commit;
