-- Treat read-only transactions as read-only request authority and
-- allowlist exact YouTube extraction internal routes.

begin;

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
    v_method in ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')
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
          '/rpc/get_account_generation_capability',
          '/rpc/bootstrap_account_generation_identity',
          '/rpc/bootstrap_legacy_auth_callback_identity',
          '/rpc/record_full_local_session_authority_v2',
          '/rpc/assert_and_renew_full_local_session_authority_v2'
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
  v_read_only_request := v_method in ('GET', 'HEAD')
    or current_setting('transaction_read_only') = 'on';

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

revoke all on function private.verify_full_local_authenticated_authority()
  from public, anon, authenticated, service_role;

commit;
