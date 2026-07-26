begin;

create or replace function public.inspect_recipe_image_auth_deletion_readiness(
  p_owner_uuid uuid,
  p_account_generation bigint,
  p_now timestamp with time zone
)
returns table (
  lifecycle_ready boolean,
  auth_outbox_due_count bigint,
  required_cleanup_generation bigint,
  terminal_cleanup_generation_count bigint,
  storage_nonterminal_count bigint,
  storage_dead_letter_count bigint,
  storage_generation_mismatch_count bigint,
  registry_nonterminal_count bigint,
  registry_generation_mismatch_count bigint,
  owner_signal_union_count bigint,
  owner_signal_union_zero boolean,
  ready boolean
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_auth_outbox_due_count bigint := 0;
  v_capability_state text;
  v_lifecycle public.user_account_lifecycles%rowtype;
  v_lifecycle_ready boolean := false;
  v_owner_signal_union_count bigint := 0;
  v_owner_signal_union_zero boolean := false;
  v_registry_generation_mismatch_count bigint := 0;
  v_registry_nonterminal_count bigint := 0;
  v_required_cleanup_generation bigint := 0;
  v_storage_dead_letter_count bigint := 0;
  v_storage_generation_mismatch_count bigint := 0;
  v_storage_nonterminal_count bigint := 0;
  v_terminal_cleanup_generation_count bigint := 0;
begin
  if p_owner_uuid is null
    or p_account_generation is null
    or p_account_generation < 1
    or p_now is null then
    raise exception 'Auth deletion readiness identity is required'
      using errcode = '22023';
  end if;

  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Auth deletion readiness requires READ COMMITTED'
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

  if v_capability_state is distinct from 'generation_active' then
    raise exception 'Auth deletion readiness is inactive'
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

  if v_lifecycle.owner_uuid is not null then
    v_required_cleanup_generation :=
      v_lifecycle.required_cleanup_generation;
    v_lifecycle_ready :=
      v_lifecycle.status = 'cleanup_pending'
      and v_lifecycle.personal_db_deleted_at is not null
      and v_lifecycle.auth_identity_created_at_snapshot is not null
      and v_lifecycle.auth_identity_deleted_at is null;
  end if;

  select count(*)
    into v_auth_outbox_due_count
  from public.auth_identity_deletion_outbox as auth_outbox
  where auth_outbox.owner_uuid = p_owner_uuid
    and auth_outbox.account_generation = p_account_generation
    and auth_outbox.auth_identity_created_at_snapshot
      is not distinct from v_lifecycle.auth_identity_created_at_snapshot
    and (
      (
        auth_outbox.state in ('pending', 'failed')
        and auth_outbox.next_attempt_at <= p_now
      )
      or (
        auth_outbox.state = 'processing'
        and auth_outbox.lease_expires_at <= p_now
      )
    );

  select
    count(distinct outbox.cleanup_generation) filter (
      where outbox.state = 'succeeded'
        and outbox.terminal_result in ('deleted', 'verified_not_found')
        and outbox.cleanup_generation
          between 1 and v_required_cleanup_generation
        and (
          (
            outbox.terminal_result = 'deleted'
            and object.state = 'deleted'
          )
          or (
            outbox.terminal_result = 'verified_not_found'
            and object.state = 'verified_not_found'
          )
        )
    ),
    count(*) filter (where outbox.state <> 'succeeded'),
    count(*) filter (where outbox.state = 'dead_letter'),
    count(*) filter (
      where outbox.cleanup_generation
        not between 1 and v_required_cleanup_generation
    )
  into
    v_terminal_cleanup_generation_count,
    v_storage_nonterminal_count,
    v_storage_dead_letter_count,
    v_storage_generation_mismatch_count
  from public.storage_object_deletion_outbox as outbox
  left join public.recipe_image_objects as object
    on object.bucket_id = outbox.bucket_id
   and object.object_path = outbox.object_path
   and object.owner_uuid = outbox.owner_uuid
   and object.account_generation = outbox.account_generation
   and object.cleanup_generation = outbox.cleanup_generation
   and object.visibility = 'private'
  where outbox.owner_uuid = p_owner_uuid
    and outbox.account_generation = p_account_generation;

  select
    count(*) filter (
      where object.state not in ('deleted', 'verified_not_found')
    ),
    count(*) filter (
      where object.state in ('deleted', 'verified_not_found')
        and object.cleanup_generation
          not between 1 and v_required_cleanup_generation
    )
  into
    v_registry_nonterminal_count,
    v_registry_generation_mismatch_count
  from public.recipe_image_objects as object
  where object.owner_uuid = p_owner_uuid
    and object.account_generation = p_account_generation
    and object.visibility = 'private';

  select
    signal.union_signal_count,
    signal.union_zero
  into
    v_owner_signal_union_count,
    v_owner_signal_union_zero
  from public.inspect_recipe_image_expected_owner_signal(
    p_owner_uuid,
    p_account_generation
  ) as signal;

  return query
  select
    v_lifecycle_ready,
    v_auth_outbox_due_count,
    v_required_cleanup_generation,
    v_terminal_cleanup_generation_count,
    v_storage_nonterminal_count,
    v_storage_dead_letter_count,
    v_storage_generation_mismatch_count,
    v_registry_nonterminal_count,
    v_registry_generation_mismatch_count,
    v_owner_signal_union_count,
    v_owner_signal_union_zero,
    (
      v_lifecycle_ready
      and v_auth_outbox_due_count = 1
      and v_terminal_cleanup_generation_count
        = v_required_cleanup_generation
      and v_storage_nonterminal_count = 0
      and v_storage_dead_letter_count = 0
      and v_storage_generation_mismatch_count = 0
      and v_registry_nonterminal_count = 0
      and v_registry_generation_mismatch_count = 0
      and v_owner_signal_union_count = 0
      and v_owner_signal_union_zero
    );
end;
$function$;

revoke all
  on function public.inspect_recipe_image_auth_deletion_readiness(
    uuid,
    bigint,
    timestamp with time zone
  )
  from public, anon, authenticated, service_role;
grant execute
  on function public.inspect_recipe_image_auth_deletion_readiness(
    uuid,
    bigint,
    timestamp with time zone
  )
  to service_role;

commit;
