-- PII-free singleton counters for the current production observation window.

begin;

create table if not exists private.full_local_session_observability (
  singleton boolean primary key default true check (singleton),
  observation_started_at timestamptz not null,
  unexpected_account_session_stale_count bigint not null default 0
    check (unexpected_account_session_stale_count >= 0),
  first_stale_at timestamptz,
  stale_token_mutation_count bigint not null default 0
    check (stale_token_mutation_count >= 0),
  check (
    (unexpected_account_session_stale_count = 0 and first_stale_at is null)
    or (unexpected_account_session_stale_count > 0 and first_stale_at is not null)
  )
);

comment on table private.full_local_session_observability is
  'PII-free singleton counters reset when this deployment migration is applied.';

insert into private.full_local_session_observability (
  singleton,
  observation_started_at,
  unexpected_account_session_stale_count,
  first_stale_at,
  stale_token_mutation_count
)
values (true, clock_timestamp(), 0, null, 0)
on conflict (singleton) do update
set observation_started_at = excluded.observation_started_at,
    unexpected_account_session_stale_count = 0,
    first_stale_at = null,
    stale_token_mutation_count = 0;

revoke all on table private.full_local_session_observability
  from public, anon, authenticated, service_role;

create or replace function private.assert_full_local_session_observability_scope()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
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
begin
  if coalesce(auth.role(), v_claims ->> 'role') is distinct from 'service_role'
    or v_headers ->> 'x-homecook-internal-scope'
      is distinct from 'session-observability'
    or v_method is distinct from 'POST'
    or v_path not in (
      '/rpc/record_full_local_session_stale_observation',
      '/rpc/read_full_local_session_observation'
    ) then
    raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE'
      using errcode = '42501';
  end if;
end;
$function$;

create or replace function public.record_full_local_session_stale_observation(
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $function$
declare
  v_now timestamptz := clock_timestamp();
begin
  perform private.assert_full_local_session_observability_scope();

  if p_reason in ('revoked', 'missing') then
    return jsonb_build_object('recorded', false);
  end if;
  if p_reason not in (
    'identity_mismatch', 'generation_mismatch', 'non_monotonic', 'auth_unavailable'
  ) then
    raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE'
      using errcode = '22023';
  end if;

  update private.full_local_session_observability
  set unexpected_account_session_stale_count =
        unexpected_account_session_stale_count + 1,
      first_stale_at = coalesce(first_stale_at, v_now)
  where singleton;

  if not found then
    raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE'
      using errcode = '55000';
  end if;

  return jsonb_build_object('recorded', true);
end;
$function$;

create or replace function public.read_full_local_session_observation()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $function$
declare
  v_observation private.full_local_session_observability%rowtype;
begin
  if session_user is distinct from 'supabase_admin'
    and current_setting('role', true) is distinct from 'supabase_admin' then
    perform private.assert_full_local_session_observability_scope();
  end if;

  select observation.*
    into v_observation
  from private.full_local_session_observability as observation
  where observation.singleton;

  if v_observation.singleton is null then
    raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE'
      using errcode = '55000';
  end if;

  return jsonb_build_object(
    'counter_scope', 'SINCE_DEPLOY',
    'observation_started_at', v_observation.observation_started_at,
    'account_session_stale_count',
      v_observation.unexpected_account_session_stale_count,
    'stale_token_mutation_count', v_observation.stale_token_mutation_count,
    'first_stale_at', v_observation.first_stale_at
  );
end;
$function$;

-- This is the current full allowlist plus the isolated observability scope.
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
    v_method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')
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
          '/rpc/assert_and_renew_full_local_session_authority_v2',
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
        v_scope = 'session-observability'
        and v_method = 'POST'
        and v_path in (
          '/rpc/record_full_local_session_stale_observation',
          '/rpc/read_full_local_session_observation'
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
          '/rpc/cancel_snapshot_v2_cooking_session',
          '/rpc/complete_snapshot_v2_cooking_session',
          '/rpc/mutate_legacy_leftover_status',
          '/rpc/list_cooked_batches',
          '/rpc/mutate_cooked_batch_weight',
          '/rpc/discard_cooked_batch',
          '/rpc/adjust_cooked_batch',
          '/rpc/close_unweighed_cooked_batch'
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
        and v_path in (
          '/rpc/consume_youtube_ingredient_registration_rate_limit',
          '/rpc/register_youtube_ingredient'
        )
      )
      or (
        v_scope = 'youtube-extraction'
        and (
          (
            v_method = 'POST'
            and v_path in (
              '/youtube_extraction_sessions',
              '/youtube_extraction_candidates',
              '/youtube_transcript_cache',
              '/youtube_transcript_fetch_events',
              '/youtube_llm_extraction_cache',
              '/youtube_llm_extraction_events',
              '/youtube_visual_extraction_cache',
              '/youtube_visual_extraction_events',
              '/cooking_methods'
            )
          )
          or (
            v_method = 'GET'
            and v_path in (
              '/youtube_transcript_cache',
              '/youtube_transcript_fetch_events',
              '/youtube_llm_extraction_cache',
              '/youtube_llm_extraction_events',
              '/youtube_visual_extraction_cache',
              '/youtube_visual_extraction_events',
              '/cooking_methods'
            )
          )
          or (
            v_method = 'PATCH'
            and v_path in (
              '/youtube_extraction_candidates',
              '/youtube_transcript_cache',
              '/youtube_llm_extraction_cache',
              '/youtube_visual_extraction_cache'
            )
          )
        )
      )
    )
  ) then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;
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
  if v_binding.last_token_issued_at is null
    or p_last_token_issued_at < v_binding.last_token_issued_at
    or p_access_token_expires_at < v_binding.binding_expires_at
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

revoke all on function private.assert_full_local_session_observability_scope()
  from public, anon, authenticated, service_role;
revoke all on function public.record_full_local_session_stale_observation(text)
  from public, anon, authenticated;
revoke all on function public.read_full_local_session_observation()
  from public, anon, authenticated;
revoke all on function public.assert_and_renew_full_local_session_authority_v2(
  text, uuid, timestamp with time zone, uuid, text, integer, bigint,
  timestamp with time zone, timestamp with time zone, timestamp with time zone,
  timestamp with time zone, timestamp with time zone
) from public, anon, authenticated;

grant execute on function public.record_full_local_session_stale_observation(text)
  to service_role;
grant execute on function public.read_full_local_session_observation()
  to service_role, supabase_admin;
grant execute on function public.assert_and_renew_full_local_session_authority_v2(
  text, uuid, timestamp with time zone, uuid, text, integer, bigint,
  timestamp with time zone, timestamp with time zone, timestamp with time zone,
  timestamp with time zone, timestamp with time zone
) to service_role;

commit;
