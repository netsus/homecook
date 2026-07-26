begin;

create or replace function public.finalize_recipe_image_auth_deletion_claim(
  p_outbox_id uuid,
  p_owner_uuid uuid,
  p_account_generation bigint,
  p_auth_identity_created_at_snapshot timestamp with time zone,
  p_lease_token uuid,
  p_expected_attempts integer,
  p_terminal_result text,
  p_error text,
  p_now timestamp with time zone
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_capability_state text;
  v_lifecycle public.user_account_lifecycles%rowtype;
  v_outbox public.auth_identity_deletion_outbox%rowtype;
  v_result jsonb;
begin
  if p_outbox_id is null
    or p_owner_uuid is null
    or p_account_generation is null
    or p_account_generation < 1
    or p_auth_identity_created_at_snapshot is null
    or p_lease_token is null
    or p_expected_attempts is null
    or p_expected_attempts < 1
    or p_now is null
    or (
      p_terminal_result is null
      and nullif(p_error, '') is null
    )
    or (
      p_terminal_result is not null
      and p_terminal_result not in (
        'deleted',
        'already_absent',
        'identity_replaced'
      )
    ) then
    raise exception 'Auth deletion guarded finalize fields are invalid'
      using errcode = '22023';
  end if;

  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Auth deletion guarded finalize requires READ COMMITTED'
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
    raise exception 'Auth deletion guarded finalize is inactive'
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
    and lifecycle.auth_identity_created_at_snapshot
      is not distinct from p_auth_identity_created_at_snapshot
  for update;

  if v_lifecycle.owner_uuid is null
    or v_lifecycle.status <> 'cleanup_pending'
    or v_lifecycle.personal_db_deleted_at is null
    or v_lifecycle.auth_identity_deleted_at is not null then
    raise exception 'Auth deletion lifecycle finalize compare-and-swap failed'
      using errcode = '40001';
  end if;

  select outbox.*
    into v_outbox
  from public.auth_identity_deletion_outbox as outbox
  where outbox.id = p_outbox_id
    and outbox.owner_uuid = p_owner_uuid
    and outbox.account_generation = p_account_generation
    and outbox.auth_identity_created_at_snapshot
      is not distinct from p_auth_identity_created_at_snapshot
  for update;

  if v_outbox.id is null
    or v_outbox.state <> 'processing'
    or v_outbox.lease_token is distinct from p_lease_token
    or v_outbox.attempts is distinct from p_expected_attempts
    or v_outbox.lease_expires_at < p_now then
    raise exception 'Auth deletion outbox finalize compare-and-swap failed'
      using errcode = '40001';
  end if;

  v_result := public.finalize_auth_identity_deletion_outbox(
    p_outbox_id,
    p_lease_token,
    p_expected_attempts,
    p_terminal_result,
    p_error,
    p_now
  );

  if (v_result ->> 'id')::uuid is distinct from p_outbox_id
    or (v_result ->> 'attempts')::integer
      is distinct from p_expected_attempts
    or (
      p_terminal_result is not null
      and (
        (v_result ->> 'state') is distinct from 'succeeded'
        or (v_result ->> 'terminal_result')
          is distinct from p_terminal_result
      )
    )
    or (
      p_terminal_result is null
      and (
        (v_result ->> 'state') is null
        or (v_result ->> 'state') not in ('failed', 'dead_letter')
        or (v_result ->> 'terminal_result') is not null
      )
    ) then
    raise exception 'Auth deletion guarded finalize result is inconsistent'
      using errcode = '40001';
  end if;

  if p_terminal_result is not null then
    update public.user_account_lifecycles
    set
      auth_identity_deleted_at = p_now,
      revision = revision + 1,
      updated_at = p_now
    where owner_uuid = p_owner_uuid
      and account_generation = p_account_generation
      and auth_identity_created_at_snapshot
        is not distinct from p_auth_identity_created_at_snapshot
      and auth_identity_deleted_at is null
    returning * into v_lifecycle;

    if v_lifecycle.auth_identity_deleted_at is distinct from p_now then
      raise exception 'Auth deletion lifecycle resolution update failed'
        using errcode = '40001';
    end if;
  end if;

  return v_result || jsonb_build_object(
    'owner_uuid', p_owner_uuid,
    'account_generation', p_account_generation,
    'auth_identity_created_at_snapshot',
      p_auth_identity_created_at_snapshot,
    'auth_identity_deleted_at', v_lifecycle.auth_identity_deleted_at
  );
end;
$function$;

revoke all
  on function public.finalize_recipe_image_auth_deletion_claim(
    uuid,
    uuid,
    bigint,
    timestamp with time zone,
    uuid,
    integer,
    text,
    text,
    timestamp with time zone
  )
  from public, anon, authenticated, service_role;
grant execute
  on function public.finalize_recipe_image_auth_deletion_claim(
    uuid,
    uuid,
    bigint,
    timestamp with time zone,
    uuid,
    integer,
    text,
    text,
    timestamp with time zone
  )
  to service_role;

revoke execute
  on function public.claim_auth_identity_deletion_outbox(
    uuid,
    uuid,
    timestamp with time zone
  )
  from public, anon, authenticated, service_role;
revoke execute
  on function public.finalize_auth_identity_deletion_outbox(
    uuid,
    uuid,
    integer,
    text,
    text,
    timestamp with time zone
  )
  from public, anon, authenticated, service_role;

commit;
