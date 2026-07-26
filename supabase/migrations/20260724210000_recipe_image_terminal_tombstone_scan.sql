begin;

create or replace function public.claim_recipe_image_terminal_tombstones(
  p_limit integer,
  p_now timestamp with time zone default clock_timestamp()
)
returns table (
  object_id uuid,
  owner_uuid uuid,
  account_generation bigint,
  expected_cleanup_generation bigint,
  bucket_id text,
  object_path text,
  terminal_state text,
  claimed_next_terminal_scan_at timestamp with time zone
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
    raise exception 'recipe image terminal tombstone claim requires READ COMMITTED'
      using errcode = '25001';
  end if;

  if p_limit is null
    or p_limit < 1
    or p_limit > 50
    or p_now is null then
    raise exception 'valid recipe image terminal tombstone claim input is required'
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
  with candidates as (
    select object.id
    from public.recipe_image_objects as object
    where object.visibility = 'private'
      and object.owner_uuid is not null
      and object.account_generation is not null
      and object.state in ('deleted', 'verified_not_found')
      and object.next_terminal_scan_at <= p_now
    order by object.next_terminal_scan_at, object.id
    limit p_limit
    for update skip locked
  ),
  claimed as (
    update public.recipe_image_objects as object
       set next_terminal_scan_at = case
         when p_now < object.updated_at + interval '24 hours'
           then p_now + interval '5 minutes'
         else p_now + interval '24 hours'
       end
      from candidates
     where object.id = candidates.id
    returning
      object.id,
      object.owner_uuid,
      object.account_generation,
      object.cleanup_generation,
      object.bucket_id,
      object.object_path,
      object.state,
      object.next_terminal_scan_at
  )
  select
    claimed.id,
    claimed.owner_uuid,
    claimed.account_generation,
    claimed.cleanup_generation,
    claimed.bucket_id,
    claimed.object_path,
    claimed.state,
    claimed.next_terminal_scan_at
  from claimed;
end;
$function$;

create or replace function public.reopen_recipe_image_terminal_tombstone(
  p_object_id uuid,
  p_owner_uuid uuid,
  p_account_generation bigint,
  p_expected_cleanup_generation bigint,
  p_expected_next_terminal_scan_at timestamp with time zone,
  p_reopened_at timestamp with time zone default clock_timestamp()
)
returns table (
  object_id uuid,
  cleanup_generation bigint,
  outbox_id uuid
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_capability_state text;
  v_lifecycle public.user_account_lifecycles%rowtype;
  v_object public.recipe_image_objects%rowtype;
  v_next_cleanup_generation bigint;
  v_outbox_id uuid;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'recipe image terminal tombstone reopen requires READ COMMITTED'
      using errcode = '25001';
  end if;

  if p_object_id is null
    or p_owner_uuid is null
    or p_account_generation is null
    or p_account_generation <= 0
    or p_expected_cleanup_generation is null
    or p_expected_cleanup_generation <= 0
    or p_expected_next_terminal_scan_at is null
    or p_reopened_at is null then
    raise exception 'complete recipe image terminal tombstone identity is required'
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

  select lifecycle.*
    into v_lifecycle
  from public.user_account_lifecycles as lifecycle
  where lifecycle.owner_uuid = p_owner_uuid
    and lifecycle.account_generation = p_account_generation
  for update;

  if v_lifecycle.owner_uuid is null
    or v_lifecycle.status not in (
      'active',
      'deleting',
      'cleanup_pending',
      'complete'
    ) then
    return;
  end if;

  select object.*
    into v_object
  from public.recipe_image_objects as object
  where object.id = p_object_id
    and object.owner_uuid = p_owner_uuid
    and object.account_generation = p_account_generation
    and object.visibility = 'private'
    and object.cleanup_generation = p_expected_cleanup_generation
    and object.next_terminal_scan_at = p_expected_next_terminal_scan_at
    and object.state in ('deleted', 'verified_not_found')
    and not exists (
      select 1
      from public.recipe_image_object_references as reference
      where reference.image_object_id = object.id
    )
  for update;

  if v_object.id is null then
    return;
  end if;

  if greatest(
    v_lifecycle.required_cleanup_generation,
    v_object.cleanup_generation
  ) = 9223372036854775807 then
    raise exception 'recipe image cleanup generation exhausted'
      using errcode = '22003';
  end if;

  v_next_cleanup_generation := greatest(
    v_lifecycle.required_cleanup_generation,
    v_object.cleanup_generation
  ) + 1;

  update public.user_account_lifecycles
     set required_cleanup_generation = v_next_cleanup_generation,
         status = case
           when status in ('deleting', 'cleanup_pending', 'complete')
             then 'cleanup_pending'
           else status
         end,
         revision = revision + 1,
         updated_at = p_reopened_at
   where owner_uuid = p_owner_uuid
     and account_generation = p_account_generation
     and required_cleanup_generation
       = v_lifecycle.required_cleanup_generation;

  if not found then
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  end if;

  update public.recipe_image_objects as object
     set state = 'cleanup_pending',
         cleanup_generation = v_next_cleanup_generation,
         next_terminal_scan_at = null,
         not_found_observed_at = null,
         late_upload_quarantine_until = null,
         updated_at = p_reopened_at
   where object.id = v_object.id
     and object.owner_uuid = p_owner_uuid
     and object.account_generation = p_account_generation
     and object.cleanup_generation = p_expected_cleanup_generation
     and object.next_terminal_scan_at = p_expected_next_terminal_scan_at
     and object.state in ('deleted', 'verified_not_found')
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
    p_owner_uuid,
    p_account_generation,
    v_next_cleanup_generation,
    'late_terminal_object'
  );

  if v_outbox_id is null then
    raise exception 'recipe image terminal tombstone enqueue failed'
      using errcode = '55000';
  end if;

  object_id := v_object.id;
  cleanup_generation := v_next_cleanup_generation;
  outbox_id := v_outbox_id;
  return next;
end;
$function$;

revoke all on function public.claim_recipe_image_terminal_tombstones(
  integer,
  timestamp with time zone
) from public, anon, authenticated, service_role;
grant execute on function public.claim_recipe_image_terminal_tombstones(
  integer,
  timestamp with time zone
) to service_role;

revoke all on function public.reopen_recipe_image_terminal_tombstone(
  uuid,
  uuid,
  bigint,
  bigint,
  timestamp with time zone,
  timestamp with time zone
) from public, anon, authenticated, service_role;
grant execute on function public.reopen_recipe_image_terminal_tombstone(
  uuid,
  uuid,
  bigint,
  bigint,
  timestamp with time zone,
  timestamp with time zone
) to service_role;

commit;
