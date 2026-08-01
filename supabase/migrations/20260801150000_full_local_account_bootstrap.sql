-- Restore account-generation bootstrap for the local Auth authority only.

begin;

create or replace function public.bootstrap_account_generation_identity(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamp with time zone,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamp with time zone
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $function$
declare
  v_control private.full_local_auth_control%rowtype;
  v_capability public.account_generation_capability_state%rowtype;
  v_latest_lifecycle public.user_account_lifecycles%rowtype;
  v_watermark public.user_account_generation_watermarks%rowtype;
  v_auth_user auth.users%rowtype;
  v_account_generation bigint;
  v_create_generation boolean := false;
  v_profile_missing boolean;
  v_provider text;
  v_social_id text;
  v_nickname text;
  v_profile_image_url text;
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
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE'
      using errcode = '25001';
  end if;
  if p_owner_uuid is null
    or p_auth_identity_created_at_snapshot is null
    or p_session_key_hash !~ '^[0-9a-f]{64}$'
    or p_hmac_key_version is null
    or p_hmac_key_version <= 0
    or p_session_issued_at is null then
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
    or v_control.local_issuer is null
    or v_control.local_activated_at is null
    or v_control.hmac_key_version is distinct from p_hmac_key_version
    or p_session_issued_at < v_control.local_activated_at then
    raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE'
      using errcode = '55000';
  end if;

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
    or v_capability.activated_at is null then
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'homecook-account-owner:' || p_owner_uuid::text,
      0
    )
  );

  select auth_user.*
    into v_auth_user
  from auth.users as auth_user
  where auth_user.id = p_owner_uuid
    and auth_user.created_at = p_auth_identity_created_at_snapshot
  for share;

  if v_auth_user.id is null then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  select lifecycle.*
    into v_latest_lifecycle
  from public.user_account_lifecycles as lifecycle
  where lifecycle.owner_uuid = p_owner_uuid
  order by lifecycle.account_generation desc
  limit 1
  for update;

  select watermark.*
    into v_watermark
  from public.user_account_generation_watermarks as watermark
  where watermark.owner_uuid = p_owner_uuid
  for update;

  if v_latest_lifecycle.owner_uuid is null then
    if p_auth_identity_created_at_snapshot <= v_capability.activated_at
      or p_session_issued_at <= v_capability.activated_at then
      raise exception 'ACCOUNT_CUTOVER_UNCLASSIFIED'
        using errcode = '55000';
    end if;
    v_create_generation := true;
  elsif v_latest_lifecycle.status = 'active' then
    if v_latest_lifecycle.auth_identity_created_at_snapshot
        is distinct from p_auth_identity_created_at_snapshot
      or p_session_issued_at <= v_capability.activated_at then
      raise exception 'ACCOUNT_SESSION_STALE'
        using errcode = '55000';
    end if;
    v_account_generation := v_latest_lifecycle.account_generation;
  elsif v_latest_lifecycle.status = 'quarantined' then
    raise exception 'ACCOUNT_CUTOVER_QUARANTINED'
      using errcode = '55000';
  elsif v_latest_lifecycle.status = 'deleting' then
    raise exception 'ACCOUNT_DELETING'
      using errcode = '55000';
  elsif v_latest_lifecycle.status = 'cleanup_pending' then
    raise exception 'ACCOUNT_DELETION_PENDING'
      using errcode = '55000';
  elsif v_latest_lifecycle.status = 'complete' then
    if v_latest_lifecycle.personal_db_deleted_at is null
      or v_latest_lifecycle.auth_identity_deleted_at is null
      or p_auth_identity_created_at_snapshot
        <= greatest(
          v_latest_lifecycle.personal_db_deleted_at,
          v_latest_lifecycle.auth_identity_deleted_at
        )
      or p_session_issued_at
        <= greatest(
          v_latest_lifecycle.personal_db_deleted_at,
          v_latest_lifecycle.auth_identity_deleted_at
        ) then
      raise exception 'ACCOUNT_SESSION_STALE'
        using errcode = '55000';
    end if;
    v_create_generation := true;
  else
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  end if;

  if v_create_generation then
    if v_watermark.owner_uuid is null then
      v_account_generation := 1;
      insert into public.user_account_generation_watermarks (
        owner_uuid,
        last_account_generation
      ) values (
        p_owner_uuid,
        v_account_generation
      );
    else
      v_account_generation := v_watermark.last_account_generation + 1;
      update public.user_account_generation_watermarks
      set last_account_generation = v_account_generation
      where owner_uuid = p_owner_uuid;
    end if;

    insert into public.user_account_lifecycles (
      owner_uuid,
      account_generation,
      auth_identity_created_at_snapshot,
      origin,
      status,
      activated_at
    ) values (
      p_owner_uuid,
      v_account_generation,
      p_auth_identity_created_at_snapshot,
      'runtime',
      'active',
      clock_timestamp()
    );
  end if;

  select not exists (
    select 1
    from public.users as app_user
    where app_user.id = p_owner_uuid
      and app_user.deleted_at is null
  ) into v_profile_missing;

  if v_profile_missing then
    v_provider := coalesce(
      v_auth_user.raw_app_meta_data ->> 'provider',
      v_auth_user.raw_user_meta_data ->> 'provider'
    );
    if v_provider in ('custom:naver', 'naver-login') then
      v_provider := 'naver';
    end if;
    v_social_id := coalesce(
      nullif(v_auth_user.raw_user_meta_data ->> 'sub', ''),
      nullif(v_auth_user.raw_user_meta_data ->> 'provider_id', ''),
      p_owner_uuid::text
    );
    v_nickname := left(
      coalesce(
        nullif(pg_catalog.btrim(v_auth_user.raw_user_meta_data ->> 'nickname'), ''),
        '무먹러'
      ),
      30
    );
    v_profile_image_url := coalesce(
      nullif(v_auth_user.raw_user_meta_data ->> 'avatar_url', ''),
      nullif(v_auth_user.raw_user_meta_data ->> 'picture', '')
    );

    if v_provider not in ('kakao', 'naver', 'google') then
      raise exception 'ACCOUNT_SESSION_STALE'
        using errcode = '55000';
    end if;

    perform public.set_account_generation_internal_writer_marker(
      v_capability.current_cutover_attempt_id,
      true
    );
    insert into public.users (
      id,
      nickname,
      email,
      profile_image_url,
      social_provider,
      social_id,
      settings_json,
      created_at,
      updated_at,
      deleted_at
    ) values (
      p_owner_uuid,
      v_nickname,
      v_auth_user.email,
      v_profile_image_url,
      v_provider::public.social_provider_type,
      v_social_id,
      '{}'::jsonb,
      clock_timestamp(),
      clock_timestamp(),
      null
    );
    perform public.set_account_generation_internal_writer_marker(
      v_capability.current_cutover_attempt_id,
      false
    );
  end if;

  select app_user.nickname
    into v_nickname
  from public.users as app_user
  where app_user.id = p_owner_uuid
    and app_user.deleted_at is null;

  if v_nickname is null then
    raise exception 'ACCOUNT_CUTOVER_UNCLASSIFIED'
      using errcode = '55000';
  end if;

  return jsonb_build_object(
    'account_generation', v_account_generation,
    'nickname', v_nickname
  );
end;
$function$;

revoke all on function public.bootstrap_account_generation_identity(
  uuid,
  timestamp with time zone,
  text,
  integer,
  timestamp with time zone
) from public, anon, authenticated;
grant execute on function public.bootstrap_account_generation_identity(
  uuid,
  timestamp with time zone,
  text,
  integer,
  timestamp with time zone
) to service_role;

commit;
