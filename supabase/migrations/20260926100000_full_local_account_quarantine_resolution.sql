-- Restore quarantine resolution with live full-local session evidence.
-- Keep the old remote-authority signature closed.
begin;

create or replace function public.resolve_account_cutover_quarantine(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamp with time zone,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_idempotency_key uuid,
  p_payload_hash text,
  p_action text,
  p_nickname text,
  p_session_record jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth, extensions, pg_temp
as $function$
declare
  v_control private.full_local_auth_control%rowtype;
  v_session_id uuid;
  v_issued_at timestamptz;
  v_verified_at timestamptz;
  v_expires_at timestamptz;
  v_binding_expires_at timestamptz;
  v_capability public.account_generation_capability_state%rowtype;
  v_lifecycle public.user_account_lifecycles%rowtype;
  v_auth_user jsonb;
  v_provider text;
  v_social_id text;
  v_email text;
  v_key_hash text;
  v_result jsonb;
  v_now timestamptz := clock_timestamp();
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE' using errcode = '42501';
  end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'account quarantine resolution requires READ COMMITTED'
      using errcode = '25001';
  end if;
  if p_owner_uuid is null
    or p_auth_identity_created_at_snapshot is null
    or p_session_key_hash is null
    or p_session_key_hash !~ '^[0-9a-f]{64}$'
    or p_hmac_key_version is null
    or p_hmac_key_version <= 0
    or p_idempotency_key is null
    or p_payload_hash is null
    or p_action is null
    or p_payload_hash !~ '^[0-9a-f]{64}$'
    or p_action not in ('activate', 'delete')
    or (
      p_action = 'activate'
      and (
        nullif(pg_catalog.btrim(p_nickname), '') is null
        or pg_catalog.char_length(pg_catalog.btrim(p_nickname)) not between 2 and 30
      )
    ) then
    raise exception 'verified quarantine resolution fields are required'
      using errcode = '22023';
  end if;

  -- This overload is only called after live Auth verification on the server.
  -- Cross-check that evidence against the current local authority and live DB session.
  if jsonb_typeof(p_session_record) is distinct from 'object'
    or (p_session_record ->> 'p_owner_uuid')::uuid is distinct from p_owner_uuid
    or (p_session_record ->> 'p_identity_created_at')::timestamptz
      is distinct from p_auth_identity_created_at_snapshot
    or p_session_record ->> 'p_session_key_hash' is distinct from p_session_key_hash
    or (p_session_record ->> 'p_hmac_key_version')::integer
      is distinct from p_hmac_key_version then
    raise exception 'ACCOUNT_SESSION_STALE' using errcode = '55000';
  end if;
  v_session_id := (p_session_record ->> 'p_session_id')::uuid;
  v_issued_at := (p_session_record ->> 'p_session_issued_at')::timestamptz;
  v_verified_at := (p_session_record ->> 'p_verified_at')::timestamptz;
  v_expires_at := (p_session_record ->> 'p_access_token_expires_at')::timestamptz;
  v_binding_expires_at := (p_session_record ->> 'p_binding_expires_at')::timestamptz;
  if v_session_id is null or v_issued_at is null or v_verified_at is null
    or v_expires_at is null or v_binding_expires_at is null
    or v_issued_at is distinct from
      (p_session_record ->> 'p_last_token_issued_at')::timestamptz
    or v_issued_at < date_trunc('second', p_auth_identity_created_at_snapshot)
    or v_issued_at > v_verified_at
    or v_verified_at > clock_timestamp() + interval '5 seconds'
    or v_expires_at <= greatest(v_verified_at, clock_timestamp())
    or v_expires_at > v_issued_at + interval '1 hour 5 seconds'
    or v_binding_expires_at <= greatest(v_verified_at, clock_timestamp())
    or v_binding_expires_at > v_expires_at then
    raise exception 'ACCOUNT_SESSION_STALE' using errcode = '55000';
  end if;

  select control.* into v_control
  from private.full_local_auth_control as control
  where control.singleton for share;
  if v_control.authority is distinct from 'local'
    or v_control.flows_open is distinct from true
    or v_control.local_activated_at is null then
    raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE' using errcode = '55000';
  end if;
  if v_control.local_issuer is distinct from p_session_record ->> 'p_issuer'
    or v_control.cutover_epoch is distinct from
      (p_session_record ->> 'p_auth_cutover_epoch')::bigint
    or v_control.hmac_key_version is distinct from p_hmac_key_version
    or v_issued_at < v_control.local_activated_at then
    raise exception 'ACCOUNT_SESSION_STALE' using errcode = '55000';
  end if;

  v_key_hash := encode(
    extensions.digest(
      pg_catalog.convert_to(p_idempotency_key::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
  );
  select capability.*
    into v_capability
  from public.account_generation_capability_state as capability
  where capability.singleton
  for key share;

  if v_capability.state is distinct from 'generation_active'
    or v_capability.current_cutover_attempt_id is null
    or v_capability.activated_at is null
    or v_issued_at <= v_capability.activated_at then
    raise exception 'ACCOUNT_GENERATION_STALE'
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
  order by lifecycle.account_generation desc
  limit 1
  for update;

  if v_lifecycle.owner_uuid is null
    or v_lifecycle.auth_identity_created_at_snapshot
      is distinct from p_auth_identity_created_at_snapshot then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  perform 1 from auth.users as auth_user
  where auth_user.id = p_owner_uuid
    and auth_user.created_at = p_auth_identity_created_at_snapshot
  for share;
  if not found then
    raise exception 'ACCOUNT_QUARANTINE_MANUAL_RECOVERY_REQUIRED' using errcode = '55000';
  end if;
  perform 1 from auth.sessions as auth_session
  where auth_session.id = v_session_id and auth_session.user_id = p_owner_uuid
  for share;
  if not found then
    raise exception 'ACCOUNT_SESSION_STALE' using errcode = '55000';
  end if;

  if v_lifecycle.resolution_idempotency_key_hash is not null then
    if v_lifecycle.resolution_idempotency_key_hash = v_key_hash then
      if v_lifecycle.resolution_payload_hash is distinct from p_payload_hash
        or v_lifecycle.resolution_session_key_hash
          is distinct from p_session_key_hash
        or v_lifecycle.resolution_hmac_key_version
          is distinct from p_hmac_key_version
        or v_lifecycle.resolution_action is distinct from p_action then
        raise exception 'IDEMPOTENCY_KEY_REUSED'
          using errcode = '23505';
      end if;
      return v_lifecycle.resolution_result_json;
    end if;
  end if;

  if exists (
    select 1 from public.user_session_generation_bindings as binding
    where binding.hmac_key_version = p_hmac_key_version
      and binding.session_key_hash = p_session_key_hash
      and (
        binding.revoked_at is not null
        or binding.binding_state is distinct from 'active'
        or binding.auth_authority is distinct from 'local'
        or binding.owner_uuid is distinct from p_owner_uuid
        or binding.expected_account_generation is distinct from v_lifecycle.account_generation
        or binding.auth_identity_created_at_snapshot
          is distinct from p_auth_identity_created_at_snapshot
      )
  ) then
    raise exception 'ACCOUNT_SESSION_STALE' using errcode = '55000';
  end if;

  if v_lifecycle.status = 'active' then
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  elsif v_lifecycle.status = 'deleting' then
    raise exception 'ACCOUNT_DELETING'
      using errcode = '55000';
  elsif v_lifecycle.status in ('cleanup_pending', 'complete') then
    raise exception 'ACCOUNT_DELETION_PENDING'
      using errcode = '55000';
  elsif v_lifecycle.status <> 'quarantined' then
    raise exception 'ACCOUNT_CUTOVER_UNCLASSIFIED'
      using errcode = '55000';
  end if;

  select to_jsonb(auth_user)
    into v_auth_user
  from auth.users as auth_user
  where auth_user.id = p_owner_uuid
    and auth_user.created_at = p_auth_identity_created_at_snapshot
  for share;

  if v_auth_user is null then
    raise exception 'ACCOUNT_QUARANTINE_MANUAL_RECOVERY_REQUIRED'
      using errcode = '55000';
  end if;

  perform public.set_account_generation_internal_writer_marker(
    v_capability.current_cutover_attempt_id,
    true
  );

  if p_action = 'activate' then
    v_provider := coalesce(
      v_auth_user -> 'raw_app_meta_data' ->> 'provider',
      v_auth_user -> 'raw_user_meta_data' ->> 'provider'
    );
    if v_provider in ('custom:naver', 'naver-login') then
      v_provider := 'naver';
    end if;
    -- Provider identity belongs to Auth; user-editable profile metadata is not
    -- evidence of which social account was authenticated.
    select identity.provider_id into v_social_id
    from auth.identities as identity
    where identity.user_id = p_owner_uuid
      and case when identity.provider in ('custom:naver', 'naver-login')
        then 'naver' else identity.provider end = v_provider
    order by identity.provider, identity.provider_id
    limit 1
    for share;
    v_email := v_auth_user ->> 'email';
    if v_provider is null or v_provider not in ('kakao', 'naver', 'google')
      or nullif(v_social_id, '') is null then
      raise exception 'ACCOUNT_QUARANTINE_MANUAL_RECOVERY_REQUIRED'
        using errcode = '55000';
    end if;

    insert into public.users (
      id,
      nickname,
      email,
      social_provider,
      social_id
    ) values (
      p_owner_uuid,
      pg_catalog.btrim(p_nickname),
      v_email,
      v_provider::public.social_provider_type,
      v_social_id
    );

    v_result := jsonb_build_object(
      'resolution_status', 'active',
      'account_generation', v_lifecycle.account_generation
    );
    update public.user_account_lifecycles
    set
      status = 'active',
      activated_at = v_now,
      resolved_at = v_now,
      resolution_idempotency_key_hash = v_key_hash,
      resolution_payload_hash = p_payload_hash,
      resolution_session_key_hash = p_session_key_hash,
      resolution_hmac_key_version = p_hmac_key_version,
      resolution_action = p_action,
      resolution_result_json = v_result,
      revision = revision + 1,
      updated_at = v_now
    where owner_uuid = p_owner_uuid
      and account_generation = v_lifecycle.account_generation;

    perform public.record_full_local_session_authority_v2(
      p_session_record ->> 'p_issuer',
      p_owner_uuid,
      p_auth_identity_created_at_snapshot,
      v_session_id,
      p_session_key_hash,
      p_hmac_key_version,
      (p_session_record ->> 'p_auth_cutover_epoch')::bigint,
      v_issued_at,
      v_issued_at,
      v_verified_at,
      v_expires_at,
      v_binding_expires_at
    );
  else
    v_result := jsonb_build_object(
      'deletion_status', 'cleanup_pending'
    );
    update public.user_account_lifecycles
    set
      status = 'deleting',
      resolution_idempotency_key_hash = v_key_hash,
      resolution_payload_hash = p_payload_hash,
      resolution_session_key_hash = p_session_key_hash,
      resolution_hmac_key_version = p_hmac_key_version,
      resolution_action = p_action,
      deletion_started_at = v_now,
      revision = revision + 1,
      updated_at = v_now
    where owner_uuid = p_owner_uuid
      and account_generation = v_lifecycle.account_generation;

    update public.user_session_generation_bindings
    set revoked_at = coalesce(revoked_at, v_now)
    where owner_uuid = p_owner_uuid
      and expected_account_generation = v_lifecycle.account_generation;

    perform public.delete_user_private_data(p_owner_uuid);
    insert into public.auth_identity_deletion_outbox (
      owner_uuid,
      account_generation,
      auth_identity_created_at_snapshot,
      state
    ) values (
      p_owner_uuid,
      v_lifecycle.account_generation,
      p_auth_identity_created_at_snapshot,
      'pending'
    )
    on conflict (owner_uuid, account_generation) do nothing;

    update public.user_account_lifecycles
    set
      status = 'cleanup_pending',
      personal_db_deleted_at = v_now,
      resolution_result_json = v_result,
      revision = revision + 1,
      updated_at = v_now
    where owner_uuid = p_owner_uuid
      and account_generation = v_lifecycle.account_generation;
  end if;

  perform public.set_account_generation_internal_writer_marker(
    v_capability.current_cutover_attempt_id,
    false
  );
  return v_result;
end;
$function$;

revoke all on function public.resolve_account_cutover_quarantine(
  uuid, timestamptz, text, integer, uuid, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.resolve_account_cutover_quarantine(
  uuid, timestamptz, text, integer, uuid, text, text, text, jsonb
) to service_role;

notify pgrst, 'reload schema';
commit;
