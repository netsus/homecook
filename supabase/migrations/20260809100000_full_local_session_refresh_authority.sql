-- Separate stable local session identity from rotating access-token evidence.

begin;

alter table public.user_session_generation_bindings
  add column if not exists last_token_issued_at timestamptz,
  add column if not exists session_identity_hash text;

update public.user_session_generation_bindings
set last_token_issued_at = session_issued_at
where auth_authority = 'local'
  and session_issued_at is not null
  and last_token_issued_at is null;

alter table public.user_session_generation_bindings
  drop constraint if exists user_session_generation_bindings_refresh_shape_check,
  add constraint user_session_generation_bindings_refresh_shape_check
    check (
      auth_authority is distinct from 'local'
      or binding_state is distinct from 'active'
      or (
        session_issued_at is not null
        and last_token_issued_at is not null
        and last_token_issued_at >= session_issued_at
      )
    );

alter table public.user_session_generation_bindings
  drop constraint if exists user_session_generation_bindings_session_identity_hash_check,
  add constraint user_session_generation_bindings_session_identity_hash_check
    check (
      session_identity_hash is null
      or session_identity_hash ~ '^[0-9a-f]{64}$'
    );

create or replace function private.protect_full_local_session_binding_identity()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if old.auth_authority = 'local'
    and (
      new.auth_authority is distinct from old.auth_authority
      or new.local_issuer is distinct from old.local_issuer
      or new.owner_uuid is distinct from old.owner_uuid
      or new.expected_account_generation
        is distinct from old.expected_account_generation
      or new.auth_identity_created_at_snapshot
        is distinct from old.auth_identity_created_at_snapshot
      or new.session_key_hash is distinct from old.session_key_hash
      or new.hmac_key_version is distinct from old.hmac_key_version
      or new.auth_cutover_epoch is distinct from old.auth_cutover_epoch
      or new.session_issued_at is distinct from old.session_issued_at
      or (
        old.session_identity_hash is not null
        and new.session_identity_hash is distinct from old.session_identity_hash
      )
    ) then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;
  return new;
end;
$function$;

revoke all on function private.protect_full_local_session_binding_identity()
  from public, anon, authenticated, service_role;

create or replace function private.hydrate_full_local_session_token_evidence()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if new.auth_authority = 'local'
    and new.session_issued_at is not null
    and new.last_token_issued_at is null then
    new.last_token_issued_at := new.session_issued_at;
  end if;
  return new;
end;
$function$;

revoke all on function private.hydrate_full_local_session_token_evidence()
  from public, anon, authenticated, service_role;

drop trigger if exists hydrate_full_local_session_token_evidence
  on public.user_session_generation_bindings;
create trigger hydrate_full_local_session_token_evidence
before insert or update on public.user_session_generation_bindings
for each row execute function private.hydrate_full_local_session_token_evidence();

create or replace function public.record_full_local_session_authority_v2(
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
  v_expected_generation bigint;
  v_existing public.user_session_generation_bindings%rowtype;
  v_binding public.user_session_generation_bindings%rowtype;
  v_auth_created_at timestamptz;
  v_generation_activated_at timestamptz;
  v_session_identity_hash text;
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
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'homecook-account-owner:' || p_owner_uuid::text,
      0
    )
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

  select auth_user.created_at
    into v_auth_created_at
  from auth.users as auth_user
  where auth_user.id = p_owner_uuid
  for share;

  if v_auth_created_at is null
    or v_auth_created_at is distinct from p_identity_created_at
    or not exists (
      select 1
      from auth.sessions as auth_session
      where auth_session.id = p_session_id
        and auth_session.user_id = p_owner_uuid
    ) then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  if p_session_issued_at <= v_generation_activated_at then
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  end if;

  v_session_identity_hash := encode(
    extensions.digest(convert_to(p_session_id::text, 'UTF8'), 'sha256'),
    'hex'
  );

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

  if v_existing.session_key_hash is null then
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
      session_issued_at,
      last_token_issued_at,
      session_identity_hash
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
      p_session_issued_at,
      p_last_token_issued_at,
      v_session_identity_hash
    )
    returning * into v_binding;
  else
    if v_existing.auth_authority is distinct from 'local'
      or v_existing.local_issuer is distinct from p_issuer
      or v_existing.owner_uuid is distinct from p_owner_uuid
      or v_existing.auth_identity_created_at_snapshot
        is distinct from p_identity_created_at
      or v_existing.expected_account_generation
        is distinct from v_expected_generation
      or v_existing.auth_cutover_epoch is distinct from p_auth_cutover_epoch
      or v_existing.binding_state is distinct from 'active'
      or v_existing.revoked_at is not null
      or v_existing.last_token_issued_at is null
      or (
        v_existing.session_identity_hash is not null
        and v_existing.session_identity_hash is distinct from v_session_identity_hash
      )
      or p_last_token_issued_at < v_existing.last_token_issued_at
      or p_access_token_expires_at < v_existing.binding_expires_at
      or p_binding_expires_at < v_existing.binding_expires_at then
      raise exception 'ACCOUNT_SESSION_STALE'
        using errcode = '55000';
    end if;

    if p_last_token_issued_at = v_existing.last_token_issued_at then
      v_binding := v_existing;
    else
      update public.user_session_generation_bindings
      set last_token_issued_at = greatest(
            last_token_issued_at,
            p_last_token_issued_at
          ),
          local_verified_at = p_verified_at,
          binding_expires_at = greatest(
            binding_expires_at,
            p_binding_expires_at
          ),
          session_identity_hash = coalesce(
            session_identity_hash,
            v_session_identity_hash
          )
      where hmac_key_version = p_hmac_key_version
        and session_key_hash = p_session_key_hash
        and binding_state = 'active'
        and revoked_at is null
        and (
          last_token_issued_at < p_last_token_issued_at
          or session_identity_hash is null
        )
      returning * into v_binding;
    end if;
  end if;

  if v_binding.session_key_hash is null then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  return jsonb_build_object(
    'binding_state', v_binding.binding_state,
    'binding_expires_at', v_binding.binding_expires_at,
    'expected_account_generation', v_binding.expected_account_generation,
    'last_token_issued_at', v_binding.last_token_issued_at
  );
end;
$function$;

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
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'homecook-account-owner:' || p_owner_uuid::text,
      0
    )
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

  select auth_user.created_at
    into v_auth_created_at
  from auth.users as auth_user
  where auth_user.id = p_owner_uuid
  for share;

  if v_auth_created_at is null
    or v_auth_created_at is distinct from p_identity_created_at
    or not exists (
      select 1
      from auth.sessions as auth_session
      where auth_session.id = p_session_id
        and auth_session.user_id = p_owner_uuid
    ) then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  v_session_identity_hash := encode(
    extensions.digest(convert_to(p_session_id::text, 'UTF8'), 'sha256'),
    'hex'
  );

  select binding.*
    into v_binding
  from public.user_session_generation_bindings as binding
  where binding.hmac_key_version = p_hmac_key_version
    and binding.session_key_hash = p_session_key_hash
  for update;

  if v_binding.session_key_hash is null
    or v_binding.auth_authority is distinct from 'local'
    or v_binding.local_issuer is distinct from p_issuer
    or v_binding.owner_uuid is distinct from p_owner_uuid
    or v_binding.auth_identity_created_at_snapshot
      is distinct from p_identity_created_at
    or v_binding.auth_cutover_epoch is distinct from p_auth_cutover_epoch
    or v_binding.binding_state is distinct from 'active'
    or v_binding.revoked_at is not null
    or v_binding.last_token_issued_at is null
    or (
      v_binding.session_identity_hash is not null
      and v_binding.session_identity_hash is distinct from v_session_identity_hash
    )
    or p_last_token_issued_at < v_binding.last_token_issued_at
    or p_access_token_expires_at < v_binding.binding_expires_at
    or p_binding_expires_at < v_binding.binding_expires_at then
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

  if p_last_token_issued_at > v_binding.last_token_issued_at then
    update public.user_session_generation_bindings
    set last_token_issued_at = greatest(
          last_token_issued_at,
          p_last_token_issued_at
        ),
        local_verified_at = p_verified_at,
        binding_expires_at = greatest(
          binding_expires_at,
          p_binding_expires_at
        ),
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
      using errcode = '55000';
  end if;

  return jsonb_build_object(
    'binding_state', v_binding.binding_state,
    'binding_expires_at', v_binding.binding_expires_at,
    'expected_account_generation', v_binding.expected_account_generation,
    'last_token_issued_at', v_binding.last_token_issued_at
  );
end;
$function$;

create or replace function private.verify_full_local_internal_scope()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_headers jsonb := coalesce(
    nullif(current_setting('request.headers', true), ''),
    '{}'
  )::jsonb;
  v_scope text;
  v_method text := upper(coalesce(current_setting('request.method', true), ''));
  v_path text := coalesce(current_setting('request.path', true), '');
begin
  v_scope := v_headers ->> 'x-homecook-internal-scope';

  if not (
    v_method in ('GET', 'POST', 'PUT', 'DELETE')
    and (
      (
        v_scope = 'auth-flow'
        and v_method = 'POST'
        and v_path in (
          '/rpc/read_full_local_auth_control',
          '/rpc/insert_auth_flow_attempt',
          '/rpc/read_auth_flow_attempt',
          '/rpc/terminal_auth_flow_attempt',
          '/rpc/expire_and_count_remote_auth_flows'
        )
      )
      or (
        v_scope in ('auth-callback', 'auth-refresh')
        and v_method = 'POST'
        and v_path in (
          '/rpc/read_full_local_auth_control',
          '/rpc/record_hybrid_remote_session_authority',
          '/rpc/record_full_local_session_authority',
          '/rpc/record_full_local_session_authority_v2',
          '/rpc/get_account_generation_capability',
          '/rpc/bootstrap_account_generation_identity',
          '/rpc/bootstrap_legacy_auth_callback_identity'
        )
      )
      or (
        v_scope = 'request-authority'
        and v_method = 'POST'
        and v_path in (
          '/rpc/read_full_local_auth_control',
          '/rpc/assert_hybrid_remote_session_authority',
          '/rpc/assert_full_local_session_authority',
          '/rpc/assert_and_renew_full_local_session_authority_v2'
        )
      )
      or (
        v_scope = 'session-logout'
        and v_method = 'POST'
        and v_path in (
          '/rpc/read_full_local_auth_control',
          '/rpc/revoke_hybrid_remote_session_authority',
          '/rpc/revoke_full_local_session_authority'
        )
      )
      or (
        v_scope = 'account-lifecycle'
        and v_method = 'POST'
        and v_path in (
          '/rpc/get_account_generation_capability',
          '/rpc/bootstrap_account_generation_identity',
          '/rpc/initiate_account_generation_delete',
          '/rpc/replay_account_generation_delete',
          '/rpc/resolve_account_cutover_quarantine',
          '/rpc/delete_user_private_data_with_generation_receipt',
          '/rpc/start_legacy_external_write_attempt',
          '/rpc/finalize_legacy_external_write_attempt',
          '/operational_events'
        )
      )
      or (
        v_scope = 'admin-data'
        and (
          (
            v_method = 'GET'
            and v_path in (
              '/admin_audit_logs',
              '/admin_members',
              '/meals',
              '/operational_events',
              '/pantry_items',
              '/recipe_books',
              '/shopping_lists',
              '/users'
            )
          )
          or (
            v_method = 'POST'
            and v_path in ('/admin_audit_logs', '/operational_events')
          )
        )
      )
      or (
        v_scope in ('not-found-feedback', 'operational-event')
        and v_method = 'POST'
        and v_path = '/rpc/record_internal_operational_event'
      )
      or (
        v_scope = 'recipe-image'
        and v_method = 'POST'
        and v_path in (
          '/rpc/cancel_recipe_image_upload',
          '/rpc/compensate_recipe_image_upload',
          '/rpc/finalize_recipe_image_upload',
          '/rpc/read_recipe_image_projections',
          '/rpc/reserve_recipe_image_upload',
          '/operational_events'
        )
      )
      or (
        v_scope = 'recipe-future-propagation'
        and (
          (
            v_method = 'POST'
            and v_path in (
              '/rpc/preview_recipe_future_plan_impact',
              '/rpc/write_personal_recipe_core',
              '/rpc/write_recipe_future_plan_change'
            )
          )
          or (
            v_method = 'GET'
            and v_path in (
              '/ingredient_conversion_assignments',
              '/ingredient_nutrition_profiles'
            )
          )
        )
      )
      or (
        v_scope = 'snapshot-v2-session'
        and v_method = 'POST'
        and v_path in (
          '/rpc/start_snapshot_v2_cooking_session',
          '/rpc/read_snapshot_v2_cook_mode',
          '/rpc/cancel_snapshot_v2_cooking_session'
        )
      )
      or (
        v_scope = 'future-meal-write'
        and v_method = 'POST'
        and v_path = '/rpc/write_future_meal_with_snapshot_authority'
      )
      or (
        v_scope = 'shopping-create'
        and v_method = 'POST'
        and v_path = '/rpc/create_shopping_list_with_snapshot_authority'
      )
      or (
        v_scope = 'youtube-ingredient-registration'
        and v_method = 'POST'
        and v_path = '/rpc/register_youtube_ingredient'
      )
    )
  ) then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;
end;
$function$;

revoke all on function private.verify_full_local_internal_scope()
  from public, anon, authenticated, service_role;

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
  v_session_id uuid;
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
  v_session_identity_hash text;
begin
  v_read_only_request := v_method in ('GET', 'HEAD');

  if v_read_only_request then
    select control.* into v_control
    from private.full_local_auth_control as control
    where control.singleton;
  else
    select control.* into v_control
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

  v_payload := coalesce(v_headers ->> 'x-homecook-attestation-verified', '');
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
  v_session_id := (v_claims ->> 'session_id')::uuid;
  v_session_identity_hash := encode(
    extensions.digest(convert_to(v_session_id::text, 'UTF8'), 'sha256'),
    'hex'
  );
  v_issuer := v_claims ->> 'iss';
  v_request_iat := (v_claims ->> 'iat')::bigint;
  v_request_nbf := coalesce(v_claims ->> 'nbf', v_claims ->> 'iat')::bigint;
  v_request_exp := (v_claims ->> 'exp')::bigint;

  if v_request_nbf > extract(epoch from clock_timestamp())::bigint
    or v_request_exp < extract(epoch from clock_timestamp())::bigint
    or v_request_iat > extract(epoch from clock_timestamp())::bigint + 5
    or v_request_exp - v_request_iat > 3605
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
  ) or not exists (
    select 1
    from auth.sessions as auth_session
    where auth_session.id = v_session_id
      and auth_session.user_id = v_owner_uuid
  ) then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  if v_read_only_request then
    select binding.* into v_binding
    from public.user_session_generation_bindings as binding
    where binding.hmac_key_version = v_attestation_version
      and binding.session_key_hash = v_session_key_hash
      and binding.auth_authority = 'local'
      and binding.local_issuer = v_issuer
      and binding.owner_uuid = v_owner_uuid
      and binding.auth_identity_created_at_snapshot = v_identity_created_at
      and binding.auth_cutover_epoch = v_control.cutover_epoch;
  else
    select binding.* into v_binding
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
    or v_binding.session_issued_at is null
    or v_binding.last_token_issued_at is null
    or (
      v_binding.session_identity_hash is not null
      and v_binding.session_identity_hash is distinct from v_session_identity_hash
    )
    or to_timestamp(v_request_iat) < v_binding.session_issued_at
    or to_timestamp(v_request_iat) > v_binding.last_token_issued_at
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
    or v_binding.session_issued_at is null
    or v_binding.last_token_issued_at is null
    or p_session_issued_at < v_binding.session_issued_at
    or v_binding.last_token_issued_at is distinct from p_session_issued_at then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  if v_binding.session_issued_at <= v_generation_activated_at
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

revoke all on function public.record_full_local_session_authority_v2(
  text, uuid, timestamp with time zone, uuid, text, integer, bigint,
  timestamp with time zone, timestamp with time zone, timestamp with time zone,
  timestamp with time zone, timestamp with time zone
) from public, anon, authenticated;
revoke all on function public.assert_full_local_session_authority(
  text, uuid, timestamp with time zone, text, integer, bigint,
  timestamp with time zone
) from public, anon, authenticated;
revoke all on function public.assert_and_renew_full_local_session_authority_v2(
  text, uuid, timestamp with time zone, uuid, text, integer, bigint,
  timestamp with time zone, timestamp with time zone, timestamp with time zone,
  timestamp with time zone, timestamp with time zone
) from public, anon, authenticated;

grant execute on function public.record_full_local_session_authority_v2(
  text, uuid, timestamp with time zone, uuid, text, integer, bigint,
  timestamp with time zone, timestamp with time zone, timestamp with time zone,
  timestamp with time zone, timestamp with time zone
) to service_role;
grant execute on function public.assert_full_local_session_authority(
  text, uuid, timestamp with time zone, text, integer, bigint,
  timestamp with time zone
) to service_role;
grant execute on function public.assert_and_renew_full_local_session_authority_v2(
  text, uuid, timestamp with time zone, uuid, text, integer, bigint,
  timestamp with time zone, timestamp with time zone, timestamp with time zone,
  timestamp with time zone, timestamp with time zone
) to service_role;

revoke all on function private.verify_full_local_authenticated_authority()
  from public, anon, authenticated, service_role;

commit;
