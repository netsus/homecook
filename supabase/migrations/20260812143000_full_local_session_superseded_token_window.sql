-- Split bounded in-flight stale tokens from non-monotonic regressions and
-- reset the singleton observation window for this deployment.

begin;

insert into private.full_local_session_observability (
  singleton,
  observation_started_at,
  unexpected_account_session_stale_count,
  first_stale_at,
  stale_token_mutation_count
)
values (true, clock_timestamp(), 0, null, 0)
on conflict (singleton) do update
set observation_started_at = clock_timestamp(),
    unexpected_account_session_stale_count = 0,
    stale_token_mutation_count = 0,
    first_stale_at = null;

create or replace function public.assert_and_renew_full_local_session_authority_v2(
  p_issuer text,
  p_owner_uuid uuid,
  p_identity_created_at timestamptz,
  p_session_id uuid,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_auth_cutover_epoch bigint,
  p_session_issued_at timestamptz,
  p_last_token_issued_at timestamptz,
  p_verified_at timestamptz,
  p_access_token_expires_at timestamptz,
  p_binding_expires_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $function$
declare
  v_capability_state text;
  v_auth_created_at timestamptz;
  v_binding public.user_session_generation_bindings%rowtype;
  v_generation_activated_at timestamptz;
  v_session_identity_hash text;
  v_control private.full_local_auth_control%rowtype;
begin
  if coalesce(
    auth.role(),
    coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
      ->> 'role'
  ) is distinct from 'service_role' then
    raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE'
      using errcode = '42501';
  end if;

  if p_issuer !~ '^https://[^/?#]+/auth/v1$'
    or p_owner_uuid is null
    or p_identity_created_at is null
    or p_session_id is null
    or p_session_key_hash !~ '^[0-9a-f]{64}$'
    or p_hmac_key_version is null
    or p_hmac_key_version <= 0
    or p_auth_cutover_epoch is null
    or p_auth_cutover_epoch <= 0
    or p_session_issued_at is null
    or p_last_token_issued_at is null
    or p_session_issued_at is distinct from p_last_token_issued_at
    or p_session_issued_at < date_trunc('second', p_identity_created_at)
    or p_verified_at is null
    or p_last_token_issued_at > p_verified_at
    or p_verified_at > clock_timestamp() + interval '5 seconds'
    or p_access_token_expires_at <= p_verified_at
    or p_access_token_expires_at <= clock_timestamp()
    or p_access_token_expires_at
      > p_last_token_issued_at + interval '1 hour 5 seconds'
    or p_binding_expires_at <= p_verified_at
    or p_binding_expires_at <= clock_timestamp()
    or p_binding_expires_at > p_access_token_expires_at then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '22023',
        detail = 'HOMECOOK_SESSION_AUTHORITY_REASON::non_monotonic';
  end if;

  select control.* into v_control
  from private.full_local_auth_control as control
  where control.singleton
  for share;

  if v_control.authority is distinct from 'local'
    or not v_control.flows_open
    or v_control.local_issuer is distinct from p_issuer
    or v_control.cutover_epoch is distinct from p_auth_cutover_epoch
    or v_control.hmac_key_version is distinct from p_hmac_key_version
    or v_control.local_activated_at is null
    or p_session_issued_at < v_control.local_activated_at then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000',
        detail = 'HOMECOOK_SESSION_AUTHORITY_REASON::auth_unavailable';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('homecook-account-owner:' || p_owner_uuid::text, 0)
  );

  select capability.state, capability.activated_at
    into v_capability_state, v_generation_activated_at
  from public.account_generation_capability_state as capability
  where capability.singleton
  for key share;

  if v_capability_state is distinct from 'generation_active'
    or v_generation_activated_at is null then
    raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE'
      using errcode = '55000';
  end if;

  select auth_user.created_at into v_auth_created_at
  from auth.users as auth_user
  where auth_user.id = p_owner_uuid
  for share;

  if v_auth_created_at is null
    or not exists (
      select 1 from auth.sessions as auth_session
      where auth_session.id = p_session_id
        and auth_session.user_id = p_owner_uuid
    ) then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000',
        detail = 'HOMECOOK_SESSION_AUTHORITY_REASON::missing';
  end if;
  if v_auth_created_at is distinct from p_identity_created_at then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000',
        detail = 'HOMECOOK_SESSION_AUTHORITY_REASON::identity_mismatch';
  end if;

  v_session_identity_hash := encode(
    extensions.digest(convert_to(p_session_id::text, 'UTF8'), 'sha256'),
    'hex'
  );

  select binding.* into v_binding
  from public.user_session_generation_bindings as binding
  where binding.hmac_key_version = p_hmac_key_version
    and binding.session_key_hash = p_session_key_hash
  for update;

  if v_binding.session_key_hash is null then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000',
        detail = 'HOMECOOK_SESSION_AUTHORITY_REASON::missing';
  end if;
  if v_binding.binding_state is distinct from 'active'
    or v_binding.revoked_at is not null then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000',
        detail = 'HOMECOOK_SESSION_AUTHORITY_REASON::revoked';
  end if;
  if v_binding.auth_cutover_epoch is distinct from p_auth_cutover_epoch
    or v_binding.hmac_key_version is distinct from p_hmac_key_version then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000',
        detail = 'HOMECOOK_SESSION_AUTHORITY_REASON::generation_mismatch';
  end if;
  if v_binding.auth_authority is distinct from 'local'
    or v_binding.local_issuer is distinct from p_issuer
    or v_binding.owner_uuid is distinct from p_owner_uuid
    or v_binding.auth_identity_created_at_snapshot
      is distinct from p_identity_created_at
    or (
      v_binding.session_identity_hash is not null
      and v_binding.session_identity_hash is distinct from v_session_identity_hash
    ) then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000',
        detail = 'HOMECOOK_SESSION_AUTHORITY_REASON::identity_mismatch';
  end if;
  if v_binding.last_token_issued_at is null then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000',
        detail = 'HOMECOOK_SESSION_AUTHORITY_REASON::non_monotonic';
  end if;
  if p_last_token_issued_at < v_binding.last_token_issued_at then
    if clock_timestamp() <= v_binding.local_verified_at + interval '10 seconds' then
      raise exception 'ACCOUNT_SESSION_STALE'
        using errcode = '55000',
          detail = 'HOMECOOK_SESSION_AUTHORITY_REASON::superseded_token';
    else
      raise exception 'ACCOUNT_SESSION_STALE'
        using errcode = '55000',
          detail = 'HOMECOOK_SESSION_AUTHORITY_REASON::non_monotonic';
    end if;
  end if;
  if p_access_token_expires_at < v_binding.binding_expires_at
    or p_binding_expires_at < v_binding.binding_expires_at then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000',
        detail = 'HOMECOOK_SESSION_AUTHORITY_REASON::non_monotonic';
  end if;

  if p_session_issued_at <= v_generation_activated_at
    or not exists (
      select 1
      from public.user_account_lifecycles as lifecycle
      where lifecycle.owner_uuid = p_owner_uuid
        and lifecycle.account_generation = v_binding.expected_account_generation
        and lifecycle.auth_identity_created_at_snapshot = p_identity_created_at
        and lifecycle.status = 'active'
    ) then
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  end if;

  if p_last_token_issued_at > v_binding.last_token_issued_at then
    update public.user_session_generation_bindings
    set last_token_issued_at = greatest(last_token_issued_at, p_last_token_issued_at),
        local_verified_at = p_verified_at,
        binding_expires_at = greatest(binding_expires_at, p_binding_expires_at),
        session_identity_hash = coalesce(
          session_identity_hash,
          v_session_identity_hash
        )
    where hmac_key_version = p_hmac_key_version
      and session_key_hash = p_session_key_hash
      and binding_state = 'active'
      and revoked_at is null
      and last_token_issued_at < p_last_token_issued_at
    returning * into v_binding;
  end if;

  if v_binding.session_key_hash is null then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000',
        detail = 'HOMECOOK_SESSION_AUTHORITY_REASON::non_monotonic';
  end if;

  return jsonb_build_object(
    'binding_state', v_binding.binding_state,
    'binding_expires_at', v_binding.binding_expires_at,
    'expected_account_generation', v_binding.expected_account_generation,
    'last_token_issued_at', v_binding.last_token_issued_at
  );
end;
$function$;

revoke all on function public.assert_and_renew_full_local_session_authority_v2(
  text, uuid, timestamp with time zone, uuid, text, integer, bigint,
  timestamp with time zone, timestamp with time zone, timestamp with time zone,
  timestamp with time zone, timestamp with time zone
) from public, anon, authenticated;

grant execute on function public.assert_and_renew_full_local_session_authority_v2(
  text, uuid, timestamp with time zone, uuid, text, integer, bigint,
  timestamp with time zone, timestamp with time zone, timestamp with time zone,
  timestamp with time zone, timestamp with time zone
) to service_role;

commit;
