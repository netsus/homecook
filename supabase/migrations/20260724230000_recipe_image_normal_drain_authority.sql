begin;

create or replace function public.claim_recipe_image_cleanup(
  p_limit integer,
  p_lease_token uuid,
  p_now timestamptz
)
returns table (
  outbox_id uuid,
  bucket_id text,
  object_path text,
  owner_uuid uuid,
  account_generation bigint,
  cleanup_generation bigint,
  reason text,
  lease_token uuid
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_capability_state text;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'recipe image cleanup claim requires READ COMMITTED'
      using errcode = '25001';
  end if;

  if p_limit is null
    or p_limit < 1
    or p_limit > 50
    or p_lease_token is null
    or p_now is null then
    raise exception 'valid cleanup claim input is required'
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

  with recoverable as materialized (
    select outbox.id
    from public.storage_object_deletion_outbox as outbox
    where (
        outbox.state = 'failed'
        and outbox.next_attempt_at <= p_now
      )
      or (
        outbox.state = 'processing'
        and outbox.lease_expires_at <= p_now
      )
    order by outbox.next_attempt_at, outbox.id
    limit p_limit
    for update skip locked
  )
  update public.storage_object_deletion_outbox as outbox
     set state = 'pending',
         next_attempt_at = p_now,
         lease_token = null,
         lease_expires_at = null,
         updated_at = p_now
    from recoverable
   where outbox.id = recoverable.id;

  return query
  with candidates as materialized (
    select outbox.id
    from public.storage_object_deletion_outbox as outbox
    join public.recipe_image_objects as object
      on object.bucket_id = outbox.bucket_id
     and object.object_path = outbox.object_path
     and object.owner_uuid = outbox.owner_uuid
     and object.account_generation = outbox.account_generation
     and object.cleanup_generation = outbox.cleanup_generation
    join public.user_account_lifecycles as lifecycle
      on lifecycle.owner_uuid = outbox.owner_uuid
     and lifecycle.account_generation = outbox.account_generation
    where outbox.state = 'pending'
      and outbox.next_attempt_at <= p_now
      and lifecycle.status in (
        'active',
        'deleting',
        'cleanup_pending'
      )
      and object.visibility = 'private'
      and object.state = 'cleanup_pending'
      and not exists (
        select 1
        from public.recipe_image_object_references as reference
        where reference.image_object_id = object.id
      )
    order by outbox.next_attempt_at, outbox.id
    limit p_limit
    for update of outbox, object skip locked
  ),
  claimed as (
    update public.storage_object_deletion_outbox as outbox
       set state = 'processing',
           attempts = outbox.attempts + 1,
           lease_token = p_lease_token,
           lease_expires_at = p_now + interval '5 minutes',
           last_error = null,
           updated_at = p_now
      from candidates
     where outbox.id = candidates.id
    returning outbox.*
  )
  select
    claimed.id,
    claimed.bucket_id,
    claimed.object_path,
    claimed.owner_uuid,
    claimed.account_generation,
    claimed.cleanup_generation,
    claimed.reason,
    claimed.lease_token
  from claimed
  order by claimed.next_attempt_at, claimed.id;
end;
$function$;

create or replace function public.fail_recipe_image_cleanup(
  p_outbox_id uuid,
  p_owner_uuid uuid,
  p_account_generation bigint,
  p_cleanup_generation bigint,
  p_lease_token uuid,
  p_error_code text,
  p_failed_at timestamptz
)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_capability_state text;
  v_lifecycle_status text;
  v_next_state text;
  v_outbox public.storage_object_deletion_outbox%rowtype;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'recipe image cleanup failure requires READ COMMITTED'
      using errcode = '25001';
  end if;

  if p_outbox_id is null
    or p_owner_uuid is null
    or p_account_generation is null
    or p_account_generation <= 0
    or p_cleanup_generation is null
    or p_cleanup_generation <= 0
    or p_lease_token is null
    or p_error_code is null
    or p_error_code !~ '^[A-Z0-9_]{1,64}$'
    or p_failed_at is null then
    raise exception 'valid cleanup failure input is required'
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'homecook-account-owner:' || p_owner_uuid::text,
      0
    )
  );

  select lifecycle.status
    into v_lifecycle_status
  from public.user_account_lifecycles as lifecycle
  where lifecycle.owner_uuid = p_owner_uuid
    and lifecycle.account_generation = p_account_generation
  for update;

  if v_lifecycle_status is null
    or v_lifecycle_status not in (
      'active',
      'deleting',
      'cleanup_pending'
    ) then
    return null;
  end if;

  select outbox.*
    into v_outbox
  from public.storage_object_deletion_outbox as outbox
  where outbox.id = p_outbox_id
    and outbox.owner_uuid = p_owner_uuid
    and outbox.account_generation = p_account_generation
    and outbox.cleanup_generation = p_cleanup_generation
    and outbox.state = 'processing'
    and outbox.lease_token = p_lease_token
    and outbox.lease_expires_at >= p_failed_at
  for update;

  if not found then
    return null;
  end if;

  v_next_state := case
    when v_outbox.attempts >= 10 then 'dead_letter'
    else 'failed'
  end;

  update public.storage_object_deletion_outbox
     set state = v_next_state,
         terminal_result = null,
         next_attempt_at = case
           when v_next_state = 'failed'
             then p_failed_at + interval '5 minutes'
           else next_attempt_at
         end,
         lease_token = null,
         lease_expires_at = null,
         last_error = p_error_code,
         updated_at = p_failed_at
   where id = p_outbox_id;

  return v_next_state;
end;
$function$;

revoke all on function public.claim_recipe_image_cleanup(
  integer,
  uuid,
  timestamp with time zone
) from public, anon, authenticated, service_role;
grant execute on function public.claim_recipe_image_cleanup(
  integer,
  uuid,
  timestamp with time zone
) to service_role;

revoke all on function public.fail_recipe_image_cleanup(
  uuid,
  uuid,
  bigint,
  bigint,
  uuid,
  text,
  timestamp with time zone
) from public, anon, authenticated, service_role;
grant execute on function public.fail_recipe_image_cleanup(
  uuid,
  uuid,
  bigint,
  bigint,
  uuid,
  text,
  timestamp with time zone
) to service_role;

commit;
