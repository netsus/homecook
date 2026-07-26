begin;

create or replace function public.claim_recipe_image_auth_deletion_if_ready(
  p_outbox_id uuid,
  p_owner_uuid uuid,
  p_account_generation bigint,
  p_lease_token uuid,
  p_now timestamp with time zone
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_claim jsonb;
  v_lifecycle public.user_account_lifecycles%rowtype;
  v_outbox public.auth_identity_deletion_outbox%rowtype;
  v_readiness record;
begin
  if p_outbox_id is null
    or p_owner_uuid is null
    or p_account_generation is null
    or p_account_generation < 1
    or p_lease_token is null
    or p_now is null then
    raise exception 'Auth deletion guarded claim identity is required'
      using errcode = '22023';
  end if;

  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Auth deletion guarded claim requires READ COMMITTED'
      using errcode = '25001';
  end if;

  select readiness.*
    into v_readiness
  from public.inspect_recipe_image_auth_deletion_readiness(
    p_owner_uuid,
    p_account_generation,
    p_now
  ) as readiness;

  if v_readiness.ready is distinct from true
    or v_readiness.auth_outbox_due_count is distinct from 1::bigint then
    raise exception 'Auth deletion cleanup evidence is not ready'
      using errcode = '55000';
  end if;

  select lifecycle.*
    into v_lifecycle
  from public.user_account_lifecycles as lifecycle
  where lifecycle.owner_uuid = p_owner_uuid
    and lifecycle.account_generation = p_account_generation
  for update;

  select outbox.*
    into v_outbox
  from public.auth_identity_deletion_outbox as outbox
  where outbox.id = p_outbox_id
    and outbox.owner_uuid = p_owner_uuid
    and outbox.account_generation = p_account_generation
    and outbox.auth_identity_created_at_snapshot
      is not distinct from v_lifecycle.auth_identity_created_at_snapshot
  for update;

  if v_outbox.id is null
    or not (
      (
        v_outbox.state in ('pending', 'failed')
        and v_outbox.next_attempt_at <= p_now
      )
      or (
        v_outbox.state = 'processing'
        and v_outbox.lease_expires_at <= p_now
      )
    ) then
    raise exception 'Auth deletion outbox claim identity compare-and-swap failed'
      using errcode = '40001';
  end if;

  v_claim := public.claim_auth_identity_deletion_outbox(
    p_outbox_id,
    p_lease_token,
    p_now
  );

  if (v_claim ->> 'id')::uuid is distinct from p_outbox_id
    or (v_claim ->> 'owner_uuid')::uuid is distinct from p_owner_uuid
    or (v_claim ->> 'account_generation')::bigint
      is distinct from p_account_generation
    or (v_claim ->> 'auth_identity_created_at_snapshot')::timestamptz
      is distinct from v_lifecycle.auth_identity_created_at_snapshot
    or (v_claim ->> 'state') is distinct from 'processing'
    or (v_claim ->> 'lease_token')::uuid is distinct from p_lease_token then
    raise exception 'Auth deletion guarded claim result is inconsistent'
      using errcode = '40001';
  end if;

  return v_claim;
end;
$function$;

revoke all
  on function public.claim_recipe_image_auth_deletion_if_ready(
    uuid,
    uuid,
    bigint,
    uuid,
    timestamp with time zone
  )
  from public, anon, authenticated, service_role;
grant execute
  on function public.claim_recipe_image_auth_deletion_if_ready(
    uuid,
    uuid,
    bigint,
    uuid,
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
