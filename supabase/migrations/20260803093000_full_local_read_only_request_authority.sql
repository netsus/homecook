-- Keep authenticated GET/HEAD pre-request verification compatible with
-- PostgREST read-only transactions without weakening mutation locks.

begin;

create or replace function private.verify_full_local_authenticated_authority()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, extensions, pg_temp
as $function$
declare
  v_claims jsonb := coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
  v_headers jsonb := coalesce(
    nullif(current_setting('request.headers', true), ''),
    '{}'
  )::jsonb;
  v_method text := upper(coalesce(current_setting('request.method', true), ''));
  v_path text := coalesce(current_setting('request.path', true), '');
  v_read_only_request boolean;
  v_control private.full_local_auth_control%rowtype;
  v_binding public.user_session_generation_bindings%rowtype;
  v_owner_uuid uuid;
  v_issuer text;
  v_identity_created_at timestamptz;
  v_request_iat bigint;
  v_request_nbf bigint;
  v_request_exp bigint;
  v_payload text;
  v_attestation jsonb;
  v_attestation_iat bigint;
  v_attestation_exp bigint;
  v_attestation_version integer;
  v_session_key_hash text;
begin
  v_read_only_request := v_method in ('GET', 'HEAD');

  if v_read_only_request then
    select control.*
      into v_control
    from private.full_local_auth_control as control
    where control.singleton;
  else
    select control.*
      into v_control
    from private.full_local_auth_control as control
    where control.singleton
    for share;
  end if;

  if v_control.authority is distinct from 'local'
    or not v_control.flows_open
    or v_control.local_issuer is null
    or v_control.local_activated_at is null then
    raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE'
      using errcode = '55000';
  end if;

  v_payload := coalesce(
    v_headers ->> 'x-homecook-attestation-verified',
    ''
  );
  if v_payload = '' then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  v_attestation := private.decode_base64url_jsonb(v_payload);
  v_attestation_version := (v_attestation ->> 'version')::integer;
  v_attestation_iat := (v_attestation ->> 'issued_at')::bigint;
  v_attestation_exp := (v_attestation ->> 'expires_at')::bigint;
  v_session_key_hash := v_attestation ->> 'session_key_hash';

  if v_claims ->> 'iss' is distinct from v_control.local_issuer
    or v_claims ->> 'aud' is distinct from 'authenticated'
    or v_claims ->> 'role' is distinct from 'authenticated'
    or v_claims ->> 'sub'
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or v_claims ->> 'session_id'
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or v_claims ->> 'iat' is null
    or v_claims ->> 'exp' is null then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  v_owner_uuid := (v_claims ->> 'sub')::uuid;
  v_issuer := v_claims ->> 'iss';
  v_request_iat := (v_claims ->> 'iat')::bigint;
  v_request_nbf := coalesce(
    v_claims ->> 'nbf',
    v_claims ->> 'iat'
  )::bigint;
  v_request_exp := (v_claims ->> 'exp')::bigint;

  if v_request_nbf > extract(epoch from clock_timestamp())::bigint
    or v_request_exp < extract(epoch from clock_timestamp())::bigint
    or v_request_iat > extract(epoch from clock_timestamp())::bigint + 5
    or v_request_iat < extract(epoch from v_control.local_activated_at)::bigint
    or v_attestation ->> 'method' is distinct from v_method
    or v_attestation ->> 'path' is distinct from v_path
    or v_attestation ->> 'issuer' is distinct from v_issuer
    or v_attestation ->> 'owner_uuid' is distinct from v_owner_uuid::text
    or v_attestation ->> 'identity_created_at' is null
    or v_session_key_hash !~ '^[0-9a-f]{64}$'
    or v_attestation_version is distinct from v_control.hmac_key_version
    or v_attestation_iat > extract(epoch from clock_timestamp())::bigint + 5
    or v_attestation_exp < extract(epoch from clock_timestamp())::bigint
    or v_attestation_exp - v_attestation_iat > 60
    or v_attestation_exp <= v_attestation_iat then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  v_identity_created_at := (v_attestation ->> 'identity_created_at')::timestamptz;

  if not exists (
    select 1
    from auth.users as auth_user
    where auth_user.id = v_owner_uuid
      and auth_user.created_at = v_identity_created_at
  ) then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  if v_read_only_request then
    select binding.*
      into v_binding
    from public.user_session_generation_bindings as binding
    where binding.hmac_key_version = v_attestation_version
      and binding.session_key_hash = v_session_key_hash
      and binding.auth_authority = 'local'
      and binding.local_issuer = v_issuer
      and binding.owner_uuid = v_owner_uuid
      and binding.auth_identity_created_at_snapshot = v_identity_created_at
      and binding.auth_cutover_epoch = v_control.cutover_epoch;
  else
    select binding.*
      into v_binding
    from public.user_session_generation_bindings as binding
    where binding.hmac_key_version = v_attestation_version
      and binding.session_key_hash = v_session_key_hash
      and binding.auth_authority = 'local'
      and binding.local_issuer = v_issuer
      and binding.owner_uuid = v_owner_uuid
      and binding.auth_identity_created_at_snapshot = v_identity_created_at
      and binding.auth_cutover_epoch = v_control.cutover_epoch
    for key share;
  end if;

  if v_binding.owner_uuid is null
    or v_binding.binding_state is distinct from 'active'
    or v_binding.revoked_at is not null
    or v_binding.local_verified_at is null
    or v_binding.binding_expires_at is null
    or v_binding.binding_expires_at < clock_timestamp()
    or v_binding.session_issued_at
      is distinct from to_timestamp(v_request_iat)
    or not exists (
      select 1
      from public.user_account_lifecycles as lifecycle
      where lifecycle.owner_uuid = v_owner_uuid
        and lifecycle.account_generation = v_binding.expected_account_generation
        and lifecycle.auth_identity_created_at_snapshot = v_identity_created_at
        and lifecycle.status = 'active'
    ) then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;
end;
$function$;

revoke all on function private.verify_full_local_authenticated_authority()
  from public, anon, authenticated, service_role;

commit;
