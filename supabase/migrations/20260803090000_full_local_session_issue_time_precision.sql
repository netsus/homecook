-- Accept GoTrue's integer-second JWT iat without weakening identity-epoch checks.

begin;

create or replace function public.record_full_local_session_authority(
  p_issuer text,
  p_owner_uuid uuid,
  p_identity_created_at timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_auth_cutover_epoch bigint,
  p_session_issued_at timestamptz,
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
  v_expected_generation bigint;
  v_existing public.user_session_generation_bindings%rowtype;
  v_binding public.user_session_generation_bindings%rowtype;
  v_auth_created_at timestamptz;
  v_generation_activated_at timestamptz;
  v_control private.full_local_auth_control%rowtype;
begin
  if coalesce(
    auth.role(),
    coalesce(
      nullif(current_setting('request.jwt.claims', true), ''),
      '{}'
    )::jsonb ->> 'role'
  ) is distinct from 'service_role' then
    raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE'
      using errcode = '42501';
  end if;

  if p_issuer !~ '^https://[^/?#]+/auth/v1$'
    or p_owner_uuid is null
    or p_identity_created_at is null
    or p_session_key_hash !~ '^[0-9a-f]{64}$'
    or p_hmac_key_version is null
    or p_hmac_key_version <= 0
    or p_auth_cutover_epoch is null
    or p_auth_cutover_epoch <= 0
    or p_session_issued_at is null
    or p_session_issued_at < date_trunc('second', p_identity_created_at)
    or p_verified_at is null
    or p_session_issued_at > p_verified_at
    or p_verified_at > clock_timestamp() + interval '5 seconds'
    or p_access_token_expires_at <= p_verified_at
    or p_binding_expires_at <= p_verified_at
    or p_binding_expires_at > p_access_token_expires_at then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '22023';
  end if;

  select control.*
    into v_control
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
      using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'homecook-account-owner:' || p_owner_uuid::text,
      0
    )
  );

  select auth_user.created_at
    into v_auth_created_at
  from auth.users as auth_user
  where auth_user.id = p_owner_uuid
  for share;

  if v_auth_created_at is null
    or v_auth_created_at is distinct from p_identity_created_at then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  if p_session_issued_at <= v_generation_activated_at then
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  end if;

  select lifecycle.account_generation
    into v_expected_generation
  from public.user_account_lifecycles as lifecycle
  where lifecycle.owner_uuid = p_owner_uuid
    and lifecycle.auth_identity_created_at_snapshot = p_identity_created_at
    and lifecycle.status = 'active'
  for share;

  if v_expected_generation is null then
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  end if;

  select binding.*
    into v_existing
  from public.user_session_generation_bindings as binding
  where binding.hmac_key_version = p_hmac_key_version
    and binding.session_key_hash = p_session_key_hash
  for update;

  if v_existing.session_key_hash is not null
    and (
      v_existing.auth_authority is distinct from 'local'
      or v_existing.local_issuer is distinct from p_issuer
      or v_existing.owner_uuid is distinct from p_owner_uuid
      or v_existing.auth_identity_created_at_snapshot
        is distinct from p_identity_created_at
      or v_existing.expected_account_generation
        is distinct from v_expected_generation
      or v_existing.auth_cutover_epoch is distinct from p_auth_cutover_epoch
      or v_existing.session_issued_at is distinct from p_session_issued_at
      or v_existing.binding_state is distinct from 'active'
      or v_existing.revoked_at is not null
      or v_existing.local_verified_at > p_verified_at
    ) then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  insert into public.user_session_generation_bindings (
    session_key_hash,
    hmac_key_version,
    owner_uuid,
    expected_account_generation,
    auth_identity_created_at_snapshot,
    bound_at,
    revoked_at,
    issuer,
    remote_verified_at,
    binding_expires_at,
    binding_state,
    auth_authority,
    local_issuer,
    local_verified_at,
    auth_cutover_epoch,
    session_issued_at
  ) values (
    p_session_key_hash,
    p_hmac_key_version,
    p_owner_uuid,
    v_expected_generation,
    p_identity_created_at,
    p_verified_at,
    null,
    null,
    null,
    p_binding_expires_at,
    'active',
    'local',
    p_issuer,
    p_verified_at,
    p_auth_cutover_epoch,
    p_session_issued_at
  )
  on conflict (hmac_key_version, session_key_hash)
  do update
  set local_verified_at = excluded.local_verified_at,
      binding_expires_at = excluded.binding_expires_at
  where public.user_session_generation_bindings.auth_authority = 'local'
    and public.user_session_generation_bindings.local_issuer
      = excluded.local_issuer
    and public.user_session_generation_bindings.owner_uuid = excluded.owner_uuid
    and public.user_session_generation_bindings.auth_identity_created_at_snapshot
      = excluded.auth_identity_created_at_snapshot
    and public.user_session_generation_bindings.expected_account_generation
      is not distinct from excluded.expected_account_generation
    and public.user_session_generation_bindings.auth_cutover_epoch
      = excluded.auth_cutover_epoch
    and public.user_session_generation_bindings.session_issued_at
      = excluded.session_issued_at
    and public.user_session_generation_bindings.binding_state = 'active'
    and public.user_session_generation_bindings.revoked_at is null
  returning * into v_binding;

  if v_binding.session_key_hash is null then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  return jsonb_build_object(
    'binding_state', v_binding.binding_state,
    'binding_expires_at', v_binding.binding_expires_at,
    'expected_account_generation', v_binding.expected_account_generation
  );
end;
$function$;

create or replace function public.assert_full_local_session_authority(
  p_issuer text,
  p_owner_uuid uuid,
  p_identity_created_at timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_auth_cutover_epoch bigint,
  p_session_issued_at timestamptz
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
  v_control private.full_local_auth_control%rowtype;
begin
  if coalesce(
    auth.role(),
    coalesce(
      nullif(current_setting('request.jwt.claims', true), ''),
      '{}'
    )::jsonb ->> 'role'
  ) is distinct from 'service_role' then
    raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE'
      using errcode = '42501';
  end if;

  if p_issuer !~ '^https://[^/?#]+/auth/v1$'
    or p_owner_uuid is null
    or p_identity_created_at is null
    or p_session_key_hash !~ '^[0-9a-f]{64}$'
    or p_hmac_key_version is null
    or p_hmac_key_version <= 0
    or p_auth_cutover_epoch is null
    or p_auth_cutover_epoch <= 0
    or p_session_issued_at is null
    or p_session_issued_at < date_trunc('second', p_identity_created_at) then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '22023';
  end if;

  select control.*
    into v_control
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
      using errcode = '55000';
  end if;

  select capability.state, capability.activated_at
    into v_capability_state, v_generation_activated_at
  from public.account_generation_capability_state as capability
  where capability.singleton
  for share;

  if v_capability_state is distinct from 'generation_active'
    or v_generation_activated_at is null then
    raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE'
      using errcode = '55000';
  end if;

  select auth_user.created_at
    into v_auth_created_at
  from auth.users as auth_user
  where auth_user.id = p_owner_uuid
  for share;

  if v_auth_created_at is null
    or v_auth_created_at is distinct from p_identity_created_at then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  select binding.*
    into v_binding
  from public.user_session_generation_bindings as binding
  where binding.hmac_key_version = p_hmac_key_version
    and binding.session_key_hash = p_session_key_hash
    and binding.auth_authority = 'local'
    and binding.local_issuer = p_issuer
    and binding.owner_uuid = p_owner_uuid
    and binding.auth_identity_created_at_snapshot = p_identity_created_at
  for share;

  if v_binding.session_key_hash is null
    or v_binding.binding_state is distinct from 'active'
    or v_binding.revoked_at is not null
    or v_binding.local_verified_at is null
    or v_binding.binding_expires_at is null
    or v_binding.binding_expires_at < clock_timestamp()
    or v_binding.auth_cutover_epoch is distinct from v_control.cutover_epoch
    or v_binding.session_issued_at is distinct from p_session_issued_at then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
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

  return jsonb_build_object(
    'binding_state', v_binding.binding_state,
    'binding_expires_at', v_binding.binding_expires_at,
    'expected_account_generation', v_binding.expected_account_generation
  );
end;
$function$;

revoke all on function public.record_full_local_session_authority(
  text, uuid, timestamp with time zone, text, integer, bigint,
  timestamp with time zone, timestamp with time zone,
  timestamp with time zone, timestamp with time zone
) from public, anon, authenticated;
revoke all on function public.assert_full_local_session_authority(
  text, uuid, timestamp with time zone, text, integer, bigint,
  timestamp with time zone
) from public, anon, authenticated;

grant execute on function public.record_full_local_session_authority(
  text, uuid, timestamp with time zone, text, integer, bigint,
  timestamp with time zone, timestamp with time zone,
  timestamp with time zone, timestamp with time zone
) to service_role;
grant execute on function public.assert_full_local_session_authority(
  text, uuid, timestamp with time zone, text, integer, bigint,
  timestamp with time zone
) to service_role;

commit;
