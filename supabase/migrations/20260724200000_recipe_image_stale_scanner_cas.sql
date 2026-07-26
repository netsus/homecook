begin;

create or replace function public.scan_stale_recipe_image_uploads(
  p_limit integer,
  p_now timestamp with time zone default clock_timestamp()
)
returns table (
  object_id uuid,
  owner_uuid uuid,
  account_generation bigint,
  cleanup_generation bigint,
  outbox_id uuid,
  previous_state text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_capability_state text;
  v_candidate record;
  v_lifecycle public.user_account_lifecycles%rowtype;
  v_idempotency public.mutation_idempotency_keys%rowtype;
  v_object public.recipe_image_objects%rowtype;
  v_next_cleanup_generation bigint;
  v_outbox_id uuid;
  v_quota_released boolean;
  v_previous_state text;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'recipe image stale scanner requires READ COMMITTED'
      using errcode = '25001';
  end if;

  if p_limit is null
    or p_limit < 1
    or p_limit > 50
    or p_now is null then
    raise exception 'valid recipe image stale scanner input is required'
      using errcode = '22023';
  end if;

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

  for v_candidate in
    select
      object.id,
      object.owner_uuid,
      object.account_generation,
      object.bucket_id,
      object.object_path,
      object.cleanup_generation
    from public.recipe_image_objects as object
    where object.visibility = 'private'
      and object.owner_uuid is not null
      and object.account_generation is not null
      and (
        (
          object.state = 'pending_upload'
          and object.upload_lease_expires_at <= p_now
        )
        or (
          object.state = 'uploaded_unlinked'
          and object.unlinked_cleanup_after <= p_now
        )
      )
    order by
      coalesce(
        object.upload_lease_expires_at,
        object.unlinked_cleanup_after
      ),
      object.id
    limit p_limit
  loop
    if not pg_catalog.pg_try_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'homecook-account-owner:' || v_candidate.owner_uuid::text,
        0
      )
    ) then
      continue;
    end if;

    select lifecycle.*
      into v_lifecycle
    from public.user_account_lifecycles as lifecycle
    where lifecycle.owner_uuid = v_candidate.owner_uuid
      and lifecycle.account_generation = v_candidate.account_generation
    for update;

    if v_lifecycle.owner_uuid is null
      or v_lifecycle.status not in (
        'active',
        'deleting',
        'cleanup_pending'
      ) then
      continue;
    end if;

    select idempotency.*
      into v_idempotency
    from public.mutation_idempotency_keys as idempotency
    where idempotency.owner_uuid = v_candidate.owner_uuid
      and idempotency.account_generation
        = v_candidate.account_generation
      and idempotency.operation_scope = 'recipe_image_upload'
      and idempotency.result_reference = v_candidate.id
    for update;

    select object.*
      into v_object
    from public.recipe_image_objects as object
    where object.id = v_candidate.id
      and object.owner_uuid = v_candidate.owner_uuid
      and object.account_generation = v_candidate.account_generation
      and object.bucket_id = v_candidate.bucket_id
      and object.object_path = v_candidate.object_path
      and object.visibility = 'private'
      and object.cleanup_generation = v_candidate.cleanup_generation
    for update;

    if v_idempotency.id is null
      or v_object.id is null
      or exists (
        select 1
        from public.recipe_image_object_references as reference
        where reference.image_object_id = v_object.id
      )
      or not (
        (
          v_object.state = 'pending_upload'
          and v_object.upload_lease_expires_at <= p_now
          and v_idempotency.state = 'in_progress'
          and v_idempotency.attempt_token
            is not distinct from v_object.upload_attempt_token
          and v_idempotency.lease_expires_at <= p_now
        )
        or (
          v_object.state = 'uploaded_unlinked'
          and v_object.unlinked_cleanup_after <= p_now
          and v_object.upload_attempt_token is null
          and v_idempotency.state = 'succeeded'
          and v_idempotency.attempt_token is null
        )
      ) then
      continue;
    end if;

    if v_object.cleanup_generation = 9223372036854775807 then
      raise exception 'recipe image cleanup generation exhausted'
        using errcode = '22003';
    end if;

    v_previous_state := v_object.state;
    v_next_cleanup_generation := v_object.cleanup_generation + 1;

    update public.mutation_idempotency_keys as idempotency
    set state = 'cancelled',
        terminal_result = 'cleanup_pending',
        attempt_token = null,
        lease_expires_at = null,
        updated_at = p_now
    where idempotency.id = v_idempotency.id
      and (
        (
          v_previous_state = 'pending_upload'
          and idempotency.state = 'in_progress'
          and idempotency.attempt_token
            is not distinct from v_object.upload_attempt_token
          and idempotency.lease_expires_at <= p_now
        )
        or (
          v_previous_state = 'uploaded_unlinked'
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
    where object.id = v_object.id
      and object.owner_uuid = v_object.owner_uuid
      and object.account_generation = v_object.account_generation
      and object.visibility = 'private'
      and object.state = v_previous_state
      and object.cleanup_generation = v_object.cleanup_generation
      and (
        (
          v_previous_state = 'pending_upload'
          and object.upload_attempt_token
            is not distinct from v_object.upload_attempt_token
          and object.upload_lease_expires_at <= p_now
        )
        or (
          v_previous_state = 'uploaded_unlinked'
          and object.upload_attempt_token is null
          and object.unlinked_cleanup_after <= p_now
        )
      )
      and not exists (
        select 1
        from public.recipe_image_object_references as reference
        where reference.image_object_id = v_object.id
      );

    if not found then
      raise exception 'IMAGE_EXPIRED'
        using errcode = '55000';
    end if;

    v_outbox_id := public.enqueue_recipe_image_cleanup(
      v_object.id,
      v_object.owner_uuid,
      v_object.account_generation,
      v_next_cleanup_generation,
      'stale_upload'
    );

    if v_outbox_id is null then
      raise exception 'recipe image stale cleanup enqueue failed'
        using errcode = '55000';
    end if;

    v_quota_released := public.release_recipe_image_upload_reservation(
      v_object.owner_uuid,
      v_object.account_generation,
      v_object.id,
      p_now
    );

    if not v_quota_released then
      raise exception 'recipe image stale scanner quota release failed'
        using errcode = '55000';
    end if;

    object_id := v_object.id;
    owner_uuid := v_object.owner_uuid;
    account_generation := v_object.account_generation;
    cleanup_generation := v_next_cleanup_generation;
    outbox_id := v_outbox_id;
    previous_state := v_previous_state;
    return next;
  end loop;
end;
$function$;

revoke all on function public.scan_stale_recipe_image_uploads(
  integer,
  timestamp with time zone
) from public, anon, authenticated, service_role;
grant execute on function public.scan_stale_recipe_image_uploads(
  integer,
  timestamp with time zone
) to service_role;

commit;
