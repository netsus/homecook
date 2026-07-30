-- Fail closed inside account deletion when the hybrid session binding expired
-- after the server verified the remote Auth token but before the local RPC ran.

begin;

create or replace function public.initiate_account_generation_delete(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamp with time zone,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_idempotency_key uuid,
  p_payload_hash text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_capability public.account_generation_capability_state%rowtype;
  v_lifecycle public.user_account_lifecycles%rowtype;
  v_binding public.user_session_generation_bindings%rowtype;
  v_key_hash text;
  v_result jsonb := jsonb_build_object(
    'deletion_status',
    'cleanup_pending'
  );
  v_now timestamptz := clock_timestamp();
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'account generation delete requires READ COMMITTED'
      using errcode = '25001';
  end if;
  if p_owner_uuid is null
    or p_auth_identity_created_at_snapshot is null
    or nullif(p_session_key_hash, '') is null
    or length(p_session_key_hash) < 32
    or p_hmac_key_version is null
    or p_hmac_key_version <= 0
    or p_idempotency_key is null
    or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'verified generation delete authority fields are required'
      using errcode = '22023';
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
    or v_capability.current_cutover_attempt_id is null then
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

  if v_lifecycle.deletion_idempotency_key_hash is not null then
    if v_lifecycle.deletion_idempotency_key_hash = v_key_hash then
      if v_lifecycle.deletion_payload_hash is distinct from p_payload_hash
        or v_lifecycle.deletion_session_key_hash
          is distinct from p_session_key_hash
        or v_lifecycle.deletion_hmac_key_version
          is distinct from p_hmac_key_version then
        raise exception 'IDEMPOTENCY_KEY_REUSED'
          using errcode = '23505';
      end if;
      return v_lifecycle.deletion_result_json;
    end if;
  end if;

  if v_lifecycle.status = 'quarantined' then
    raise exception 'ACCOUNT_CUTOVER_QUARANTINED'
      using errcode = '55000';
  elsif v_lifecycle.status = 'deleting' then
    raise exception 'ACCOUNT_DELETING'
      using errcode = '55000';
  elsif v_lifecycle.status in ('cleanup_pending', 'complete') then
    raise exception 'ACCOUNT_DELETION_PENDING'
      using errcode = '55000';
  elsif v_lifecycle.status <> 'active' then
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  end if;

  select binding.*
    into v_binding
  from public.user_session_generation_bindings as binding
  where binding.owner_uuid = p_owner_uuid
    and binding.session_key_hash = p_session_key_hash
    and binding.hmac_key_version = p_hmac_key_version
  for update;

  if v_binding.owner_uuid is null
    or v_binding.auth_identity_created_at_snapshot
      is distinct from p_auth_identity_created_at_snapshot
    or v_binding.revoked_at is not null then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;
  if v_binding.expected_account_generation
    is distinct from v_lifecycle.account_generation then
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  end if;

  perform public.assert_hybrid_remote_session_authority(
    v_binding.issuer,
    p_owner_uuid,
    p_auth_identity_created_at_snapshot,
    p_session_key_hash,
    p_hmac_key_version
  );

  perform public.set_account_generation_internal_writer_marker(
    v_capability.current_cutover_attempt_id,
    true
  );

  update public.user_account_lifecycles
  set
    status = 'deleting',
    deletion_idempotency_key_hash = v_key_hash,
    deletion_payload_hash = p_payload_hash,
    deletion_session_key_hash = p_session_key_hash,
    deletion_hmac_key_version = p_hmac_key_version,
    deletion_started_at = v_now,
    revision = revision + 1,
    updated_at = v_now
  where owner_uuid = p_owner_uuid
    and account_generation = v_lifecycle.account_generation;

  update public.user_session_generation_bindings
  set revoked_at = coalesce(revoked_at, v_now)
  where owner_uuid = p_owner_uuid
    and expected_account_generation = v_lifecycle.account_generation;

  -- Preserve operational history without retaining direct account identifiers.
  if to_regclass('public.admin_members') is not null then
    execute 'delete from public.admin_members where user_id = $1'
      using p_owner_uuid;
    execute 'update public.admin_members set granted_by = null where granted_by = $1'
      using p_owner_uuid;
  end if;

  if to_regclass('public.admin_audit_logs') is not null then
    execute
      'update public.admin_audit_logs '
      || 'set actor_admin_user_id = null '
      || 'where actor_admin_user_id = $1'
      using p_owner_uuid;
  end if;

  if to_regclass('public.operational_events') is not null then
    execute
      'update public.operational_events '
      || 'set actor_user_id = case when actor_user_id = $1 then null else actor_user_id end, '
      || 'target_user_id = case when target_user_id = $1 then null else target_user_id end, '
      || 'metadata_json = coalesce(metadata_json, ''{}''::jsonb) '
      || '  - array[''user_id'', ''owner_uuid'', ''actor_user_id'', '
      || '          ''target_user_id'', ''account_id'']::text[] '
      || 'where actor_user_id = $1 '
      || '   or target_user_id = $1 '
      || '   or metadata_json ->> ''user_id'' = $1::text '
      || '   or metadata_json ->> ''owner_uuid'' = $1::text '
      || '   or metadata_json ->> ''actor_user_id'' = $1::text '
      || '   or metadata_json ->> ''target_user_id'' = $1::text '
      || '   or metadata_json ->> ''account_id'' = $1::text'
      using p_owner_uuid;
  end if;

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
    deletion_result_json = v_result,
    revision = revision + 1,
    updated_at = v_now
  where owner_uuid = p_owner_uuid
    and account_generation = v_lifecycle.account_generation;

  perform public.set_account_generation_internal_writer_marker(
    v_capability.current_cutover_attempt_id,
    false
  );
  return v_result;
end;
$function$;

revoke execute
  on function public.initiate_account_generation_delete(
    uuid,
    timestamp with time zone,
    text,
    integer,
    uuid,
    text
  )
  from public, anon, authenticated;
grant execute
  on function public.initiate_account_generation_delete(
    uuid,
    timestamp with time zone,
    text,
    integer,
    uuid,
    text
  )
  to service_role;

comment on function public.initiate_account_generation_delete(
  uuid,
  timestamp with time zone,
  text,
  integer,
  uuid,
  text
) is
  'Starts exact-generation deletion only for a live hybrid remote Auth epoch/session binding.';

commit;
