begin;

create or replace function public.list_recipe_image_auth_deletion_candidates(
  p_limit integer,
  p_now timestamp with time zone,
  p_after_next_attempt_at timestamp with time zone default null,
  p_after_outbox_id uuid default null
)
returns table (
  outbox_id uuid,
  owner_uuid uuid,
  account_generation bigint,
  auth_identity_created_at_snapshot timestamp with time zone,
  next_attempt_at timestamp with time zone
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
      (p_after_next_attempt_at is null)
      is distinct from
      (p_after_outbox_id is null)
    ) then
    raise exception 'Auth deletion candidate page input is invalid'
      using errcode = '22023';
  end if;

  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Auth deletion candidate page requires READ COMMITTED'
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
    raise exception 'Auth deletion candidate page is inactive'
      using errcode = '55000';
  end if;

  return query
  select
    outbox.id,
    outbox.owner_uuid,
    outbox.account_generation,
    outbox.auth_identity_created_at_snapshot,
    outbox.next_attempt_at
  from public.auth_identity_deletion_outbox as outbox
  join public.user_account_lifecycles as lifecycle
    on lifecycle.owner_uuid = outbox.owner_uuid
   and lifecycle.account_generation = outbox.account_generation
   and lifecycle.auth_identity_created_at_snapshot
     is not distinct from outbox.auth_identity_created_at_snapshot
  where lifecycle.status = 'cleanup_pending'
    and lifecycle.personal_db_deleted_at is not null
    and lifecycle.auth_identity_deleted_at is null
    and (
      (
        outbox.state in ('pending', 'failed')
        and outbox.next_attempt_at <= p_now
      )
      or (
        outbox.state = 'processing'
        and outbox.lease_expires_at <= p_now
      )
    )
    and (
      p_after_next_attempt_at is null
      or (outbox.next_attempt_at, outbox.id)
        > (p_after_next_attempt_at, p_after_outbox_id)
    )
  order by outbox.next_attempt_at, outbox.id
  limit p_limit;
end;
$function$;

revoke all
  on function public.list_recipe_image_auth_deletion_candidates(
    integer,
    timestamp with time zone,
    timestamp with time zone,
    uuid
  )
  from public, anon, authenticated, service_role;
grant execute
  on function public.list_recipe_image_auth_deletion_candidates(
    integer,
    timestamp with time zone,
    timestamp with time zone,
    uuid
  )
  to service_role;

commit;
