begin;

create or replace function public.inspect_recipe_image_expected_owner_signal(
  p_owner_uuid uuid,
  p_account_generation bigint
)
returns table (
  owner_id_signal_count bigint,
  legacy_owner_path_signal_count bigint,
  registry_signal_count bigint,
  union_signal_count bigint,
  union_zero boolean
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_capability_state text;
begin
  if p_owner_uuid is null
    or p_account_generation is null
    or p_account_generation < 1 then
    raise exception 'expected owner signal identity is required'
      using errcode = '22023';
  end if;

  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'expected owner signal inspection requires READ COMMITTED'
      using errcode = '25001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended(
      'homecook-account-generation-cutover',
      0
    )
  );

  select capability.state
    into v_capability_state
  from public.account_generation_capability_state as capability
  where capability.singleton
  for key share;

  if v_capability_state is null
    or v_capability_state not in (
      'cutover_maintenance',
      'generation_active'
    ) then
    raise exception 'expected owner signal inspection is inactive'
      using errcode = '55000';
  end if;

  return query
  with owner_id_signals as (
    select object.id as object_id
    from storage.objects as object
    where object.owner_id = p_owner_uuid::text
  ),
  legacy_owner_path_signals as (
    select object.id as object_id
    from storage.objects as object
    where object.bucket_id = 'recipe-images'
      and object.name ~ (
        '^'
        || p_owner_uuid::text
        || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
      )
  ),
  registry_signals as (
    select object.id as object_id
    from public.recipe_image_objects as registry
    join storage.objects as object
      on object.bucket_id = registry.bucket_id
     and object.name = registry.object_path
    where registry.owner_uuid = p_owner_uuid
      and registry.account_generation = p_account_generation
      and registry.visibility = 'private'
      and registry.bucket_id = 'recipe-images-private'
      and registry.object_path ~ (
        '^'
        || p_owner_uuid::text
        || '/'
        || p_account_generation::text
        || '/'
        || registry.id::text
        || '\.(jpg|jpeg|png|webp)$'
      )
  ),
  signals as (
    select object_id, 'owner_id'::text as signal_kind
    from owner_id_signals
    union all
    select object_id, 'legacy_owner_path'
    from legacy_owner_path_signals
    union all
    select object_id, 'registry'
    from registry_signals
  ),
  signal_counts as (
    select
      count(distinct signal.object_id)
        filter (where signal.signal_kind = 'owner_id')
        as owner_id_signal_count,
      count(distinct signal.object_id)
        filter (where signal.signal_kind = 'legacy_owner_path')
        as legacy_owner_path_signal_count,
      count(distinct signal.object_id)
        filter (where signal.signal_kind = 'registry')
        as registry_signal_count,
      count(distinct signal.object_id) as union_signal_count
    from signals as signal
  )
  select
    counts.owner_id_signal_count,
    counts.legacy_owner_path_signal_count,
    counts.registry_signal_count,
    counts.union_signal_count,
    counts.union_signal_count = 0
  from signal_counts as counts;
end;
$function$;

revoke all
  on function public.inspect_recipe_image_expected_owner_signal(uuid, bigint)
  from public, anon, authenticated, service_role;
grant execute
  on function public.inspect_recipe_image_expected_owner_signal(uuid, bigint)
  to service_role;

commit;
