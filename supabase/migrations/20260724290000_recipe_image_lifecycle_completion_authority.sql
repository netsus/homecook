begin;

create or replace function public.complete_recipe_image_account_lifecycle(
  p_owner_uuid uuid,
  p_account_generation bigint,
  p_now timestamp with time zone
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_auth_dead_letter_count bigint := 0;
  v_auth_epoch_mismatch_count bigint := 0;
  v_auth_nonterminal_count bigint := 0;
  v_auth_terminal_count bigint := 0;
  v_capability_state text;
  v_lifecycle public.user_account_lifecycles%rowtype;
  v_owner_signal_union_count bigint := 0;
  v_owner_signal_union_zero boolean := false;
  v_registry_generation_mismatch_count bigint := 0;
  v_registry_nonterminal_count bigint := 0;
  v_registry_terminal_mismatch_count bigint := 0;
  v_required_cleanup_generation bigint := 0;
  v_storage_dead_letter_count bigint := 0;
  v_storage_generation_mismatch_count bigint := 0;
  v_storage_nonterminal_count bigint := 0;
  v_storage_registry_mismatch_count bigint := 0;
  v_terminal_cleanup_generation_count bigint := 0;
  v_was_complete boolean := false;
begin
  if p_owner_uuid is null
    or p_account_generation is null
    or p_account_generation < 1
    or p_now is null then
    raise exception 'Lifecycle completion identity is required'
      using errcode = '22023';
  end if;

  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Lifecycle completion requires READ COMMITTED'
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
    raise exception 'Lifecycle completion is inactive'
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

  if v_lifecycle.owner_uuid is null then
    raise exception 'Lifecycle completion compare-and-swap failed'
      using errcode = '40001';
  end if;

  if v_lifecycle.status not in ('cleanup_pending', 'complete')
    or v_lifecycle.personal_db_deleted_at is null
    or v_lifecycle.auth_identity_created_at_snapshot is null
    or v_lifecycle.auth_identity_deleted_at is null then
    raise exception 'Lifecycle completion compare-and-swap failed'
      using errcode = '40001';
  end if;

  v_required_cleanup_generation :=
    v_lifecycle.required_cleanup_generation;
  v_was_complete := v_lifecycle.status = 'complete';

  select
    count(*) filter (
      where auth_outbox.auth_identity_created_at_snapshot
          is not distinct from
            v_lifecycle.auth_identity_created_at_snapshot
        and auth_outbox.state = 'succeeded'
        and auth_outbox.terminal_result in (
          'deleted',
          'already_absent',
          'identity_replaced'
        )
    ),
    count(*) filter (
      where auth_outbox.state <> 'succeeded'
    ),
    count(*) filter (
      where auth_outbox.state = 'dead_letter'
    ),
    count(*) filter (
      where auth_outbox.auth_identity_created_at_snapshot
        is distinct from v_lifecycle.auth_identity_created_at_snapshot
    )
  into
    v_auth_terminal_count,
    v_auth_nonterminal_count,
    v_auth_dead_letter_count,
    v_auth_epoch_mismatch_count
  from public.auth_identity_deletion_outbox as auth_outbox
  where auth_outbox.owner_uuid = p_owner_uuid
    and auth_outbox.account_generation = p_account_generation;

  select
    count(distinct outbox.cleanup_generation) filter (
      where outbox.state = 'succeeded'
        and outbox.terminal_result in ('deleted', 'verified_not_found')
        and outbox.cleanup_generation
          between 1 and v_required_cleanup_generation
        and exists (
          select 1
          from public.recipe_image_objects as durable_object
          where durable_object.bucket_id = outbox.bucket_id
            and durable_object.object_path = outbox.object_path
            and durable_object.owner_uuid = outbox.owner_uuid
            and durable_object.account_generation
              = outbox.account_generation
            and durable_object.visibility = 'private'
            and durable_object.cleanup_generation
              >= outbox.cleanup_generation
            and durable_object.cleanup_generation
              <= v_required_cleanup_generation
        )
    ),
    count(*) filter (
      where outbox.state <> 'succeeded'
    ),
    count(*) filter (
      where outbox.state = 'dead_letter'
    ),
    count(*) filter (
      where outbox.cleanup_generation
        not between 1 and v_required_cleanup_generation
    ),
    count(*) filter (
      where not exists (
        select 1
        from public.recipe_image_objects as durable_object
        where durable_object.bucket_id = outbox.bucket_id
          and durable_object.object_path = outbox.object_path
          and durable_object.owner_uuid = outbox.owner_uuid
          and durable_object.account_generation
            = outbox.account_generation
          and durable_object.visibility = 'private'
          and durable_object.cleanup_generation
            >= outbox.cleanup_generation
          and durable_object.cleanup_generation
            <= v_required_cleanup_generation
      )
    )
  into
    v_terminal_cleanup_generation_count,
    v_storage_nonterminal_count,
    v_storage_dead_letter_count,
    v_storage_generation_mismatch_count,
    v_storage_registry_mismatch_count
  from public.storage_object_deletion_outbox as outbox
  where outbox.owner_uuid = p_owner_uuid
    and outbox.account_generation = p_account_generation;

  select
    count(*) filter (
      where object.state not in ('deleted', 'verified_not_found')
    ),
    count(*) filter (
      where object.cleanup_generation
        not between 1 and v_required_cleanup_generation
    ),
    count(*) filter (
      where object.state in ('deleted', 'verified_not_found')
        and not exists (
          select 1
          from public.storage_object_deletion_outbox as terminal_outbox
          where terminal_outbox.bucket_id = object.bucket_id
            and terminal_outbox.object_path = object.object_path
            and terminal_outbox.owner_uuid = object.owner_uuid
            and terminal_outbox.account_generation
              = object.account_generation
            and terminal_outbox.cleanup_generation
              = object.cleanup_generation
            and terminal_outbox.state = 'succeeded'
            and (
              (
                object.state = 'deleted'
                and terminal_outbox.terminal_result = 'deleted'
              )
              or (
                object.state = 'verified_not_found'
                and terminal_outbox.terminal_result
                  = 'verified_not_found'
              )
            )
        )
    )
  into
    v_registry_nonterminal_count,
    v_registry_generation_mismatch_count,
    v_registry_terminal_mismatch_count
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

  if v_auth_terminal_count <> 1
    or v_auth_nonterminal_count <> 0
    or v_auth_dead_letter_count <> 0
    or v_auth_epoch_mismatch_count <> 0
    or v_terminal_cleanup_generation_count
      <> v_required_cleanup_generation
    or v_storage_nonterminal_count <> 0
    or v_storage_dead_letter_count <> 0
    or v_storage_generation_mismatch_count <> 0
    or v_storage_registry_mismatch_count <> 0
    or v_registry_nonterminal_count <> 0
    or v_registry_generation_mismatch_count <> 0
    or v_registry_terminal_mismatch_count <> 0
    or v_owner_signal_union_count <> 0
    or v_owner_signal_union_zero is distinct from true then
    raise exception 'Lifecycle completion terminal evidence is not ready'
      using errcode = '55000';
  end if;

  if v_was_complete then
    if v_lifecycle.completed_cleanup_generation
      is distinct from v_required_cleanup_generation then
      raise exception 'Completed lifecycle generation evidence is inconsistent'
        using errcode = '40001';
    end if;

    return jsonb_build_object(
      'owner_uuid', v_lifecycle.owner_uuid,
      'account_generation', v_lifecycle.account_generation,
      'status', v_lifecycle.status,
      'required_cleanup_generation',
        v_lifecycle.required_cleanup_generation,
      'completed_cleanup_generation',
        v_lifecycle.completed_cleanup_generation,
      'updated_at', v_lifecycle.updated_at,
      'changed', false
    );
  end if;

  update public.user_account_lifecycles
  set
    status = 'complete',
    completed_cleanup_generation = v_required_cleanup_generation,
    revision = revision + 1,
    updated_at = p_now
  where owner_uuid = p_owner_uuid
    and account_generation = p_account_generation
    and status = 'cleanup_pending'
    and required_cleanup_generation = v_required_cleanup_generation
    and revision = v_lifecycle.revision
  returning * into v_lifecycle;

  if v_lifecycle.owner_uuid is null
    or v_lifecycle.status <> 'complete'
    or v_lifecycle.completed_cleanup_generation
      is distinct from v_required_cleanup_generation then
    raise exception 'Lifecycle completion update failed'
      using errcode = '40001';
  end if;

  return jsonb_build_object(
    'owner_uuid', v_lifecycle.owner_uuid,
    'account_generation', v_lifecycle.account_generation,
    'status', v_lifecycle.status,
    'required_cleanup_generation',
      v_lifecycle.required_cleanup_generation,
    'completed_cleanup_generation',
      v_lifecycle.completed_cleanup_generation,
    'updated_at', v_lifecycle.updated_at,
    'changed', true
  );
end;
$function$;

revoke all
  on function public.complete_recipe_image_account_lifecycle(
    uuid,
    bigint,
    timestamp with time zone
  )
  from public, anon, authenticated, service_role;
grant execute
  on function public.complete_recipe_image_account_lifecycle(
    uuid,
    bigint,
    timestamp with time zone
  )
  to service_role;

commit;
