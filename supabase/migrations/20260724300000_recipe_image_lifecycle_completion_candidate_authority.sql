begin;

create index if not exists
  user_account_lifecycles_completion_candidates_idx
  on public.user_account_lifecycles (
    auth_identity_deleted_at,
    owner_uuid,
    account_generation
  )
  where status = 'cleanup_pending'
    and personal_db_deleted_at is not null
    and auth_identity_deleted_at is not null;

create or replace function public.list_recipe_image_lifecycle_completion_candidates(
  p_limit integer,
  p_now timestamp with time zone,
  p_after_auth_identity_deleted_at timestamp with time zone default null,
  p_after_owner_uuid uuid default null,
  p_after_account_generation bigint default null
)
returns table (
  owner_uuid uuid,
  account_generation bigint,
  auth_identity_deleted_at timestamp with time zone
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_capability_state text;
begin
  if p_limit is null
    or p_limit < 1
    or p_limit > 50
    or p_now is null
    or (
      (p_after_auth_identity_deleted_at is null)
      is distinct from
      (p_after_owner_uuid is null)
    )
    or (
      (p_after_owner_uuid is null)
      is distinct from
      (p_after_account_generation is null)
    )
    or (
      p_after_auth_identity_deleted_at is not null
      and (
        p_after_auth_identity_deleted_at > p_now
        or p_after_account_generation < 1
      )
    ) then
    raise exception 'Lifecycle completion candidate page input is invalid'
      using errcode = '22023';
  end if;

  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Lifecycle completion candidate page requires READ COMMITTED'
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
    raise exception 'Lifecycle completion candidate page is inactive'
      using errcode = '55000';
  end if;

  return query
  select
    lifecycle.owner_uuid,
    lifecycle.account_generation,
    lifecycle.auth_identity_deleted_at
  from public.user_account_lifecycles as lifecycle
  cross join lateral (
    select
      count(*) filter (
        where auth_outbox.auth_identity_created_at_snapshot
            is not distinct from
              lifecycle.auth_identity_created_at_snapshot
          and auth_outbox.state = 'succeeded'
          and auth_outbox.terminal_result in (
            'deleted',
            'already_absent',
            'identity_replaced'
          )
      ) as auth_terminal_count,
      count(*) filter (
        where auth_outbox.state <> 'succeeded'
      ) as auth_nonterminal_count,
      count(*) filter (
        where auth_outbox.state = 'dead_letter'
      ) as auth_dead_letter_count,
      count(*) filter (
        where auth_outbox.auth_identity_created_at_snapshot
          is distinct from
            lifecycle.auth_identity_created_at_snapshot
      ) as auth_epoch_mismatch_count
    from public.auth_identity_deletion_outbox as auth_outbox
    where auth_outbox.owner_uuid = lifecycle.owner_uuid
      and auth_outbox.account_generation
        = lifecycle.account_generation
  ) as auth_evidence
  cross join lateral (
    select
      count(distinct outbox.cleanup_generation) filter (
        where outbox.state = 'succeeded'
          and outbox.terminal_result in (
            'deleted',
            'verified_not_found'
          )
          and outbox.cleanup_generation
            between 1 and lifecycle.required_cleanup_generation
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
                <= lifecycle.required_cleanup_generation
          )
      ) as terminal_cleanup_generation_count,
      count(*) filter (
        where outbox.state <> 'succeeded'
      ) as storage_nonterminal_count,
      count(*) filter (
        where outbox.state = 'dead_letter'
      ) as storage_dead_letter_count,
      count(*) filter (
        where outbox.cleanup_generation
          not between 1 and lifecycle.required_cleanup_generation
      ) as storage_generation_mismatch_count,
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
              <= lifecycle.required_cleanup_generation
        )
      ) as storage_registry_mismatch_count
    from public.storage_object_deletion_outbox as outbox
    where outbox.owner_uuid = lifecycle.owner_uuid
      and outbox.account_generation = lifecycle.account_generation
  ) as storage_evidence
  cross join lateral (
    select
      count(*) filter (
        where object.state not in (
          'deleted',
          'verified_not_found'
        )
      ) as registry_nonterminal_count,
      count(*) filter (
        where object.cleanup_generation
          not between 1 and lifecycle.required_cleanup_generation
      ) as registry_generation_mismatch_count,
      count(*) filter (
        where object.state in (
          'deleted',
          'verified_not_found'
        )
          and not exists (
            select 1
            from public.storage_object_deletion_outbox
              as terminal_outbox
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
      ) as registry_terminal_mismatch_count
    from public.recipe_image_objects as object
    where object.owner_uuid = lifecycle.owner_uuid
      and object.account_generation = lifecycle.account_generation
      and object.visibility = 'private'
  ) as registry_evidence
  cross join lateral
    public.inspect_recipe_image_expected_owner_signal(
      lifecycle.owner_uuid,
      lifecycle.account_generation
    ) as owner_signal
  where lifecycle.status = 'cleanup_pending'
    and lifecycle.personal_db_deleted_at is not null
    and lifecycle.auth_identity_created_at_snapshot is not null
    and lifecycle.auth_identity_deleted_at is not null
    and lifecycle.auth_identity_deleted_at <= p_now
    and auth_evidence.auth_terminal_count = 1
    and auth_evidence.auth_nonterminal_count = 0
    and auth_evidence.auth_dead_letter_count = 0
    and auth_evidence.auth_epoch_mismatch_count = 0
    and storage_evidence.terminal_cleanup_generation_count
      = lifecycle.required_cleanup_generation
    and storage_evidence.storage_nonterminal_count = 0
    and storage_evidence.storage_dead_letter_count = 0
    and storage_evidence.storage_generation_mismatch_count = 0
    and storage_evidence.storage_registry_mismatch_count = 0
    and registry_evidence.registry_nonterminal_count = 0
    and registry_evidence.registry_generation_mismatch_count = 0
    and registry_evidence.registry_terminal_mismatch_count = 0
    and owner_signal.union_signal_count = 0
    and owner_signal.union_zero is true
    and (
      p_after_auth_identity_deleted_at is null
      or (
        lifecycle.auth_identity_deleted_at,
        lifecycle.owner_uuid,
        lifecycle.account_generation
      ) > (
        p_after_auth_identity_deleted_at,
        p_after_owner_uuid,
        p_after_account_generation
      )
    )
  order by
    lifecycle.auth_identity_deleted_at,
    lifecycle.owner_uuid,
    lifecycle.account_generation
  limit p_limit;
end;
$function$;

revoke all
  on function public.list_recipe_image_lifecycle_completion_candidates(
    integer,
    timestamp with time zone,
    timestamp with time zone,
    uuid,
    bigint
  )
  from public, anon, authenticated, service_role;
grant execute
  on function public.list_recipe_image_lifecycle_completion_candidates(
    integer,
    timestamp with time zone,
    timestamp with time zone,
    uuid,
    bigint
  )
  to service_role;

commit;
