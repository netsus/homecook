begin;

create index if not exists storage_object_deletion_outbox_recheck_due_idx
  on public.storage_object_deletion_outbox (
    next_attempt_at,
    id
  )
  where state = 'awaiting_not_found_recheck';

create or replace function public.recheck_recipe_image_cleanup_not_found(
  p_outbox_id uuid,
  p_owner_uuid uuid,
  p_account_generation bigint,
  p_cleanup_generation bigint,
  p_object_found boolean,
  p_rechecked_at timestamptz
)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  return null;
end;
$function$;

create or replace function public.claim_recipe_image_cleanup_not_found_rechecks(
  p_limit integer,
  p_now timestamptz
)
returns table (
  outbox_id uuid,
  bucket_id text,
  object_path text,
  owner_uuid uuid,
  account_generation bigint,
  cleanup_generation bigint,
  claimed_next_attempt_at timestamptz
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
    raise exception 'recipe image quarantine recheck claim requires READ COMMITTED'
      using errcode = '25001';
  end if;

  if p_limit is null
    or p_limit < 1
    or p_limit > 50
    or p_now is null then
    raise exception 'valid quarantine recheck claim input is required'
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

  return query
  with due as materialized (
    select
      outbox.id,
      outbox.next_attempt_at as previous_next_attempt_at
    from public.storage_object_deletion_outbox as outbox
    join public.recipe_image_objects as object
      on object.bucket_id = outbox.bucket_id
     and object.object_path = outbox.object_path
    where outbox.state = 'awaiting_not_found_recheck'
      and outbox.next_attempt_at <= p_now
      and object.visibility = 'private'
      and object.owner_uuid = outbox.owner_uuid
      and object.account_generation = outbox.account_generation
      and object.cleanup_generation = outbox.cleanup_generation
      and object.state = 'not_found_observed'
      and object.late_upload_quarantine_until <= p_now
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
       set next_attempt_at = p_now + interval '5 minutes',
           updated_at = p_now
      from due
     where outbox.id = due.id
    returning
      outbox.id as outbox_id,
      outbox.bucket_id,
      outbox.object_path,
      outbox.owner_uuid,
      outbox.account_generation,
      outbox.cleanup_generation,
      outbox.next_attempt_at as claimed_next_attempt_at,
      due.previous_next_attempt_at
  )
  select
    claimed.outbox_id,
    claimed.bucket_id,
    claimed.object_path,
    claimed.owner_uuid,
    claimed.account_generation,
    claimed.cleanup_generation,
    claimed.claimed_next_attempt_at
  from claimed
  order by claimed.previous_next_attempt_at, claimed.outbox_id;
end;
$function$;

create or replace function public.recheck_claimed_recipe_image_cleanup_not_found(
  p_outbox_id uuid,
  p_owner_uuid uuid,
  p_account_generation bigint,
  p_cleanup_generation bigint,
  p_expected_next_attempt_at timestamptz,
  p_object_found boolean,
  p_rechecked_at timestamptz
)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_capability_state text;
  v_image_object_id uuid;
  v_lifecycle_status text;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'recipe image quarantine recheck requires READ COMMITTED'
      using errcode = '25001';
  end if;

  if p_expected_next_attempt_at is null
    or p_object_found is null
    or p_rechecked_at is null then
    return null;
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

  select object.id
    into v_image_object_id
  from public.storage_object_deletion_outbox as outbox
  join public.recipe_image_objects as object
    on object.bucket_id = outbox.bucket_id
   and object.object_path = outbox.object_path
  where outbox.id = p_outbox_id
    and outbox.owner_uuid = p_owner_uuid
    and outbox.account_generation = p_account_generation
    and outbox.cleanup_generation = p_cleanup_generation
    and outbox.state = 'awaiting_not_found_recheck'
    and outbox.next_attempt_at = p_expected_next_attempt_at
    and object.visibility = 'private'
    and object.owner_uuid = p_owner_uuid
    and object.account_generation = p_account_generation
    and object.cleanup_generation = p_cleanup_generation
    and object.state = 'not_found_observed'
    and object.late_upload_quarantine_until <= p_rechecked_at
    and not exists (
      select 1
      from public.recipe_image_object_references as reference
      where reference.image_object_id = object.id
    )
  for update of outbox, object;

  if not found then
    return null;
  end if;

  if p_object_found then
    update public.recipe_image_objects
       set state = 'cleanup_pending',
           not_found_observed_at = null,
           late_upload_quarantine_until = null,
           updated_at = p_rechecked_at
     where id = v_image_object_id;

    update public.storage_object_deletion_outbox
       set state = 'pending',
           terminal_result = null,
           next_attempt_at = p_rechecked_at,
           lease_token = null,
           lease_expires_at = null,
           last_error = null,
           updated_at = p_rechecked_at
     where id = p_outbox_id;

    return 'pending';
  end if;

  update public.recipe_image_objects
     set state = 'verified_not_found',
         not_found_observed_at = null,
         late_upload_quarantine_until = null,
         next_terminal_scan_at = p_rechecked_at + interval '5 minutes',
         updated_at = p_rechecked_at
   where id = v_image_object_id;

  update public.storage_object_deletion_outbox
     set state = 'succeeded',
         terminal_result = 'verified_not_found',
         next_attempt_at = p_rechecked_at,
         lease_token = null,
         lease_expires_at = null,
         last_error = null,
         updated_at = p_rechecked_at
   where id = p_outbox_id;

  return 'verified_not_found';
end;
$function$;

revoke all on function public.recheck_recipe_image_cleanup_not_found(
  uuid,
  uuid,
  bigint,
  bigint,
  boolean,
  timestamp with time zone
) from public, anon, authenticated, service_role;
grant execute on function public.recheck_recipe_image_cleanup_not_found(
  uuid,
  uuid,
  bigint,
  bigint,
  boolean,
  timestamp with time zone
) to service_role;

revoke all on function public.claim_recipe_image_cleanup_not_found_rechecks(
  integer,
  timestamp with time zone
) from public, anon, authenticated, service_role;
grant execute on function public.claim_recipe_image_cleanup_not_found_rechecks(
  integer,
  timestamp with time zone
) to service_role;

revoke all on function public.recheck_claimed_recipe_image_cleanup_not_found(
  uuid,
  uuid,
  bigint,
  bigint,
  timestamp with time zone,
  boolean,
  timestamp with time zone
) from public, anon, authenticated, service_role;
grant execute on function public.recheck_claimed_recipe_image_cleanup_not_found(
  uuid,
  uuid,
  bigint,
  bigint,
  timestamp with time zone,
  boolean,
  timestamp with time zone
) to service_role;

commit;
