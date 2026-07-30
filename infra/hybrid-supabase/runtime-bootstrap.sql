create schema if not exists auth;
create schema if not exists private;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function auth.uid()
returns uuid
language sql
stable
as $function$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    coalesce(
      nullif(current_setting('request.jwt.claims', true), ''),
      '{}'
    )::jsonb ->> 'sub'
  )::uuid;
$function$;

create or replace function auth.role()
returns text
language sql
stable
as $function$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    coalesce(
      nullif(current_setting('request.jwt.claims', true), ''),
      '{}'
    )::jsonb ->> 'role'
  );
$function$;

create table if not exists public.account_generation_capability_state (
  singleton boolean primary key default true check (singleton),
  state text not null
);

insert into public.account_generation_capability_state (singleton, state)
values (true, 'legacy')
on conflict (singleton) do update
set state = excluded.state;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'social_provider_type'
  ) then
    create type public.social_provider_type as enum ('kakao', 'naver', 'google');
  end if;
  if not exists (
    select 1 from pg_type where typname = 'recipe_book_type'
  ) then
    create type public.recipe_book_type
      as enum ('my_added', 'saved', 'liked', 'custom');
  end if;
end
$$;

create table if not exists public.users (
  id uuid primary key,
  nickname text not null,
  email text,
  profile_image_url text,
  social_provider public.social_provider_type not null,
  social_id text not null,
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz
);
create unique index if not exists hybrid_runtime_users_email_active_idx
  on public.users (email)
  where deleted_at is null and email is not null;

create table if not exists public.recipe_books (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  book_type public.recipe_book_type not null,
  cover_color_key text,
  cover_image_url text,
  sort_order integer not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create unique index if not exists hybrid_runtime_recipe_books_system_idx
  on public.recipe_books (user_id, book_type)
  where book_type in ('my_added', 'saved', 'liked');

create table if not exists public.meal_plan_columns (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  sort_order integer not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (user_id, sort_order)
);

create table if not exists public.admin_members (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'viewer',
  unique (user_id)
);

create table if not exists public.operational_events (
  id uuid primary key default extensions.gen_random_uuid(),
  event_type text not null,
  severity text not null,
  source text not null,
  actor_user_id uuid,
  target_user_id uuid,
  request_path text,
  http_status integer,
  error_code text,
  message_summary text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_admin_user_id uuid not null references public.users(id),
  action text not null,
  target_type text,
  target_id text,
  request_path text not null,
  result text not null default 'success',
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists public.meals (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.users(id)
);
create table if not exists public.pantry_items (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.users(id)
);
create table if not exists public.shopping_lists (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.users(id)
);

grant select, insert, update, delete
  on public.users,
     public.recipe_books,
     public.meal_plan_columns,
     public.admin_members,
     public.operational_events,
     public.admin_audit_logs,
     public.meals,
     public.pantry_items,
     public.shopping_lists
  to service_role;

create table if not exists private.remote_auth_identity_epochs (
  issuer text not null,
  owner_uuid uuid not null,
  identity_created_at timestamptz not null,
  active_epoch boolean not null default true,
  remote_revision bigint not null,
  remote_identity_digest text not null,
  verified_at timestamptz not null,
  deleted_terminal_at timestamptz,
  deleted_terminal_reason text,
  evidence_revision bigint not null,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (issuer, owner_uuid, identity_created_at)
);

create unique index if not exists remote_auth_identity_epochs_active_idx
  on private.remote_auth_identity_epochs (issuer, owner_uuid)
  where active_epoch and deleted_terminal_at is null;

create table if not exists public.user_session_generation_bindings (
  session_key_hash text not null,
  hmac_key_version integer not null,
  owner_uuid uuid not null,
  expected_account_generation bigint,
  auth_identity_created_at_snapshot timestamptz not null,
  bound_at timestamptz not null,
  revoked_at timestamptz,
  issuer text not null,
  remote_verified_at timestamptz,
  binding_expires_at timestamptz,
  binding_state text not null,
  primary key (hmac_key_version, session_key_hash)
);

create index if not exists user_session_generation_bindings_active_epoch_idx
  on public.user_session_generation_bindings (
    issuer,
    owner_uuid,
    auth_identity_created_at_snapshot,
    binding_expires_at
  )
  where binding_state = 'active' and revoked_at is null;

drop function if exists public.record_hybrid_remote_session_authority(
  text,
  uuid,
  timestamp with time zone,
  bigint,
  text,
  timestamp with time zone,
  bigint,
  text,
  integer,
  timestamp with time zone
);

create or replace function public.record_hybrid_remote_session_authority(
  p_issuer text,
  p_owner_uuid uuid,
  p_identity_created_at timestamptz,
  p_remote_revision bigint,
  p_remote_identity_digest text,
  p_verified_at timestamptz,
  p_evidence_revision bigint,
  p_session_key_hash text,
  p_hmac_key_version integer,
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
  v_expected_issuer text := current_setting(
    'app.settings.auth_expected_issuer',
    true
  );
  v_capability_state text;
  v_active_epoch private.remote_auth_identity_epochs%rowtype;
  v_existing_binding public.user_session_generation_bindings%rowtype;
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

  if coalesce(v_expected_issuer, '') = ''
    or p_issuer is distinct from v_expected_issuer
    or p_remote_revision <= 0
    or p_evidence_revision <= 0
    or p_remote_identity_digest !~ '^[0-9a-f]{64}$'
    or p_session_key_hash !~ '^[0-9a-f]{64}$'
    or p_hmac_key_version <= 0
    or p_identity_created_at > p_verified_at
    or p_verified_at > clock_timestamp() + interval '5 seconds'
    or p_access_token_expires_at <= p_verified_at
    or p_binding_expires_at <= p_verified_at
    or p_binding_expires_at > p_access_token_expires_at then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  select capability.state
    into v_capability_state
  from public.account_generation_capability_state as capability
  where capability.singleton
  for share;

  if v_capability_state is distinct from 'legacy' then
    raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE'
      using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_issuer || ':' || p_owner_uuid::text, 0)
  );

  select epoch.*
    into v_active_epoch
  from private.remote_auth_identity_epochs as epoch
  where epoch.issuer = p_issuer
    and epoch.owner_uuid = p_owner_uuid
    and epoch.active_epoch
    and epoch.deleted_terminal_at is null
  for update;

  if v_active_epoch.issuer is not null
    and v_active_epoch.identity_created_at is distinct from p_identity_created_at then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  if v_active_epoch.issuer is not null
    and (
      p_remote_revision < v_active_epoch.remote_revision
      or p_evidence_revision < v_active_epoch.evidence_revision
    ) then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  insert into private.remote_auth_identity_epochs (
    issuer,
    owner_uuid,
    identity_created_at,
    active_epoch,
    remote_revision,
    remote_identity_digest,
    verified_at,
    evidence_revision
  )
  values (
    p_issuer,
    p_owner_uuid,
    p_identity_created_at,
    true,
    p_remote_revision,
    p_remote_identity_digest,
    p_verified_at,
    p_evidence_revision
  )
  on conflict (issuer, owner_uuid, identity_created_at)
  do update
  set remote_revision = excluded.remote_revision,
      remote_identity_digest = excluded.remote_identity_digest,
      verified_at = excluded.verified_at,
      evidence_revision = excluded.evidence_revision,
      updated_at = clock_timestamp()
  where private.remote_auth_identity_epochs.active_epoch
    and private.remote_auth_identity_epochs.deleted_terminal_at is null
    and excluded.remote_revision >= private.remote_auth_identity_epochs.remote_revision
    and excluded.evidence_revision >= private.remote_auth_identity_epochs.evidence_revision;

  select binding.*
    into v_existing_binding
  from public.user_session_generation_bindings as binding
  where binding.hmac_key_version = p_hmac_key_version
    and binding.session_key_hash = p_session_key_hash
  for update;

  if v_existing_binding.session_key_hash is not null
    and (
      v_existing_binding.owner_uuid is distinct from p_owner_uuid
      or v_existing_binding.issuer is distinct from p_issuer
      or v_existing_binding.auth_identity_created_at_snapshot
        is distinct from p_identity_created_at
    ) then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  if v_existing_binding.session_key_hash is not null
    and (
      v_existing_binding.binding_state is distinct from 'active'
      or v_existing_binding.revoked_at is not null
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
    binding_state
  )
  values (
    p_session_key_hash,
    p_hmac_key_version,
    p_owner_uuid,
    null,
    p_identity_created_at,
    p_verified_at,
    null,
    p_issuer,
    p_verified_at,
    p_binding_expires_at,
    'active'
  )
  on conflict (hmac_key_version, session_key_hash)
  do update
  set remote_verified_at = excluded.remote_verified_at,
      binding_expires_at = excluded.binding_expires_at
  where public.user_session_generation_bindings.owner_uuid = excluded.owner_uuid
    and public.user_session_generation_bindings.issuer = excluded.issuer
    and public.user_session_generation_bindings.auth_identity_created_at_snapshot
      = excluded.auth_identity_created_at_snapshot
    and public.user_session_generation_bindings.binding_state = 'active'
    and public.user_session_generation_bindings.revoked_at is null;

  return jsonb_build_object(
    'binding_state', 'active',
    'binding_expires_at', p_binding_expires_at
  );
end;
$function$;

create or replace function public.assert_hybrid_remote_session_authority(
  p_issuer text,
  p_owner_uuid uuid,
  p_identity_created_at timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $function$
declare
  v_expected_issuer text := current_setting(
    'app.settings.auth_expected_issuer',
    true
  );
  v_epoch private.remote_auth_identity_epochs%rowtype;
  v_binding public.user_session_generation_bindings%rowtype;
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

  if coalesce(v_expected_issuer, '') = ''
    or p_issuer is distinct from v_expected_issuer
    or p_session_key_hash !~ '^[0-9a-f]{64}$'
    or p_hmac_key_version <= 0 then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  select epoch.*
    into v_epoch
  from private.remote_auth_identity_epochs as epoch
  where epoch.issuer = p_issuer
    and epoch.owner_uuid = p_owner_uuid
    and epoch.identity_created_at = p_identity_created_at
    and epoch.active_epoch
    and epoch.deleted_terminal_at is null
  for key share;

  select binding.*
    into v_binding
  from public.user_session_generation_bindings as binding
  where binding.hmac_key_version = p_hmac_key_version
    and binding.session_key_hash = p_session_key_hash
    and binding.issuer = p_issuer
    and binding.owner_uuid = p_owner_uuid
    and binding.auth_identity_created_at_snapshot = p_identity_created_at
  for key share;

  if v_epoch.issuer is null
    or v_binding.owner_uuid is null
    or v_binding.binding_state is distinct from 'active'
    or v_binding.revoked_at is not null
    or v_binding.binding_expires_at is null
    or v_binding.binding_expires_at < clock_timestamp()
    or v_binding.remote_verified_at is null
    or v_binding.remote_verified_at < v_epoch.verified_at then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  return jsonb_build_object(
    'binding_state', v_binding.binding_state,
    'binding_expires_at', v_binding.binding_expires_at
  );
end;
$function$;

create or replace function public.revoke_hybrid_remote_session_authority(
  p_session_key_hash text,
  p_hmac_key_version integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $function$
declare
  v_affected integer;
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

  update public.user_session_generation_bindings
  set binding_state = 'revoked',
      revoked_at = coalesce(revoked_at, clock_timestamp())
  where session_key_hash = p_session_key_hash
    and hmac_key_version = p_hmac_key_version
    and binding_state = 'active';

  get diagnostics v_affected = row_count;
  return jsonb_build_object('revoked', v_affected > 0);
end;
$function$;

create or replace function private.decode_base64url_jsonb(p_value text)
returns jsonb
language sql
immutable
strict
set search_path = pg_catalog, pg_temp
as $function$
  select convert_from(
    decode(
      rpad(
        translate(p_value, '-_', '+/'),
        4 * ((length(p_value) + 3) / 4),
        '='
      ),
      'base64'
    ),
    'UTF8'
  )::jsonb;
$function$;

create or replace function private.verify_hybrid_request_authority()
returns void
language plpgsql
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
  v_owner_uuid uuid;
  v_issuer text;
  v_session_key_hash text;
  v_identity_created_at timestamptz;
  v_request_iat bigint;
  v_request_nbf bigint;
  v_request_exp bigint;
  v_expected_issuer text := current_setting(
    'app.settings.auth_expected_issuer',
    true
  );
  v_attestation_payload text;
  v_attestation_signature text;
  v_attestation jsonb;
  v_attestation_kind text;
  v_attestation_scope text;
  v_attestation_version integer;
  v_attestation_iat bigint;
  v_attestation_exp bigint;
  v_attestation_session_key_hash text;
  v_secret text := current_setting(
    'app.settings.homecook_session_attestation_hmac_key_v1',
    true
  );
  v_expected_signature text;
  v_epoch private.remote_auth_identity_epochs%rowtype;
  v_binding public.user_session_generation_bindings%rowtype;
begin
  v_attestation_payload := coalesce(
    v_headers ->> 'x-homecook-session-attestation',
    ''
  );
  v_attestation_signature := lower(coalesce(
    v_headers ->> 'x-homecook-session-attestation-signature',
    ''
  ));

  if v_attestation_payload = ''
    or v_attestation_signature !~ '^[0-9a-f]{64}$'
    or coalesce(v_secret, '') = '' then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  v_expected_signature := encode(
    extensions.hmac(
      pg_catalog.convert_to(v_attestation_payload, 'UTF8'),
      pg_catalog.convert_to(v_secret, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  if v_expected_signature <> v_attestation_signature then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  v_attestation := private.decode_base64url_jsonb(v_attestation_payload);
  v_attestation_kind := v_attestation ->> 'kind';
  v_attestation_scope := v_attestation ->> 'scope';
  v_attestation_version := (v_attestation ->> 'version')::integer;
  v_attestation_iat := (v_attestation ->> 'issued_at')::bigint;
  v_attestation_exp := (v_attestation ->> 'expires_at')::bigint;

  if v_attestation ->> 'method' is distinct from v_method
    or v_attestation ->> 'path' is distinct from v_path
    or v_attestation_version is distinct from 1
    or v_attestation_iat is null
    or v_attestation_exp is null
    or v_attestation_iat > extract(epoch from clock_timestamp())::bigint + 5
    or v_attestation_exp < extract(epoch from clock_timestamp())::bigint
    or v_attestation_exp - v_attestation_iat > 60
    or v_attestation_exp <= v_attestation_iat then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  if v_claims ->> 'role' = 'anon' then
    if v_attestation_kind is distinct from 'anonymous'
      or not (
        (
          v_attestation_scope = 'ingredients'
          and v_method = 'GET'
          and v_path in ('/ingredients', '/ingredient_synonyms')
        )
        or (
          v_attestation_scope = 'cooking-methods'
          and v_method = 'GET'
          and v_path in ('/cooking_methods', '/cooking_method_synonyms')
        )
        or (
          v_attestation_scope = 'tags'
          and v_method = 'POST'
          and v_path = '/rpc/list_public_recipe_tags'
        )
        or (
          v_attestation_scope = 'recipe-themes'
          and (
            (
              v_method = 'GET'
              and v_path in ('/recipes', '/recipe_steps')
            )
            or (
              v_method = 'POST'
              and v_path = '/rpc/list_home_theme_recipes'
            )
          )
        )
        or (
          v_attestation_scope = 'recipes'
          and v_method = 'GET'
          and v_path in ('/recipes', '/recipe_ingredients')
        )
        or (
          v_attestation_scope = 'recipes'
          and v_method = 'POST'
          and v_path = '/rpc/find_recipe_ids_by_public_tags'
        )
        or (
          v_attestation_scope = 'recipe-detail'
          and v_method = 'GET'
          and v_path in (
            '/recipes',
            '/recipe_ingredients',
            '/recipe_nutrition_snapshots',
            '/recipe_sources',
            '/recipe_steps'
          )
        )
        or (
          v_attestation_scope = 'recipe-cook-mode'
          and v_method = 'GET'
          and v_path in ('/recipes', '/recipe_ingredients', '/recipe_steps')
        )
      ) then
      raise exception 'ACCOUNT_SESSION_STALE'
        using errcode = '55000';
    end if;
    return;
  end if;

  if v_claims ->> 'role' = 'service_role' then
    if v_attestation_kind is distinct from 'internal'
      or not (
        (
          v_attestation_scope = 'request-authority'
          and v_method = 'POST'
          and v_path = '/rpc/assert_hybrid_remote_session_authority'
        )
        or (
          v_attestation_scope in ('auth-callback', 'auth-refresh')
          and v_method = 'POST'
          and v_path = '/rpc/record_hybrid_remote_session_authority'
        )
        or (
          v_attestation_scope = 'session-logout'
          and v_method = 'POST'
          and v_path = '/rpc/revoke_hybrid_remote_session_authority'
        )
        or (
          v_attestation_scope = 'auth-callback'
          and v_method = 'POST'
          and v_path in (
            '/rpc/get_account_generation_capability',
            '/rpc/bootstrap_account_generation_identity',
            '/rpc/bootstrap_legacy_auth_callback_identity'
          )
        )
        or (
          v_attestation_scope = 'admin-data'
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
          v_attestation_scope in ('not-found-feedback', 'operational-event')
          and v_method = 'POST'
          and v_path = '/rpc/record_internal_operational_event'
        )
        or (
          v_attestation_scope = 'account-lifecycle'
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
          v_attestation_scope = 'gamification-projection'
          and (
            (
              v_method = 'GET'
              and v_path in (
                '/recipes',
                '/shopping_lists',
                '/user_achievement_awards',
                '/user_badge_awards',
                '/user_growth_activity_events',
                '/user_progress_events',
                '/user_progress_notifications',
                '/user_progress_summary',
                '/user_quest_progress'
              )
            )
            or (
              v_method = 'POST'
              and v_path in (
                '/user_achievement_awards',
                '/user_badge_awards',
                '/user_progress_notifications',
                '/user_progress_summary',
                '/user_quest_progress'
              )
            )
            or (
              v_method = 'PATCH'
              and v_path in (
                '/user_achievement_awards',
                '/user_badge_awards',
                '/user_progress_notifications',
                '/user_quest_progress'
              )
            )
          )
        )
        or (
          v_attestation_scope = 'recipe-image'
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
          v_attestation_scope = 'youtube-ingredient-registration'
          and v_method = 'POST'
          and v_path = '/rpc/register_youtube_ingredient'
        )
      ) then
      raise exception 'ACCOUNT_SESSION_STALE'
        using errcode = '55000';
    end if;
    return;
  end if;

  if coalesce(v_expected_issuer, '') = ''
    or v_claims ->> 'iss' is distinct from v_expected_issuer
    or v_claims ->> 'aud' is distinct from 'authenticated'
    or v_claims ->> 'role' is distinct from 'authenticated'
    or v_claims ->> 'sub' is null
    or v_claims ->> 'session_id' is null
    or v_claims ->> 'iat' is null
    or v_claims ->> 'nbf' is null
    or v_claims ->> 'exp' is null
    or v_claims ->> 'sub'
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or v_claims ->> 'session_id'
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  v_owner_uuid := (v_claims ->> 'sub')::uuid;
  v_issuer := v_claims ->> 'iss';
  v_request_iat := (v_claims ->> 'iat')::bigint;
  v_request_nbf := (v_claims ->> 'nbf')::bigint;
  v_request_exp := (v_claims ->> 'exp')::bigint;

  if v_request_nbf > extract(epoch from clock_timestamp())::bigint
    or v_request_exp < extract(epoch from clock_timestamp())::bigint
    or v_request_iat > extract(epoch from clock_timestamp())::bigint + 5 then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  v_attestation_session_key_hash := v_attestation ->> 'session_key_hash';

  if v_attestation ->> 'method' is distinct from v_method
    or v_attestation ->> 'path' is distinct from v_path
    or v_attestation ->> 'issuer' is distinct from v_issuer
    or v_attestation ->> 'owner_uuid' is distinct from v_owner_uuid::text
    or v_attestation ->> 'identity_created_at' is null
    or v_attestation_session_key_hash !~ '^[0-9a-f]{64}$'
    or v_attestation_version is null
    or v_attestation_version <= 0
    or v_attestation_iat is null
    or v_attestation_exp is null
    or v_attestation_iat > extract(epoch from clock_timestamp())::bigint + 5
    or v_attestation_exp < extract(epoch from clock_timestamp())::bigint
    or v_attestation_exp - v_attestation_iat > 60
    or v_attestation_exp <= v_attestation_iat then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  v_identity_created_at := (v_attestation ->> 'identity_created_at')::timestamptz;
  v_session_key_hash := v_attestation_session_key_hash;

  if current_setting('transaction_read_only') = 'on' then
    select epoch.*
      into v_epoch
    from private.remote_auth_identity_epochs as epoch
    where epoch.issuer = v_issuer
      and epoch.owner_uuid = v_owner_uuid
      and epoch.identity_created_at = v_identity_created_at
      and epoch.active_epoch
      and epoch.deleted_terminal_at is null;
  else
    select epoch.*
      into v_epoch
    from private.remote_auth_identity_epochs as epoch
    where epoch.issuer = v_issuer
      and epoch.owner_uuid = v_owner_uuid
      and epoch.identity_created_at = v_identity_created_at
      and epoch.active_epoch
      and epoch.deleted_terminal_at is null
    for key share;
  end if;

  if v_epoch.issuer is null
    or v_request_iat < extract(epoch from v_epoch.identity_created_at)::bigint then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  if current_setting('transaction_read_only') = 'on' then
    select binding.*
      into v_binding
    from public.user_session_generation_bindings as binding
    where binding.hmac_key_version = v_attestation_version
      and binding.session_key_hash = v_session_key_hash
      and binding.issuer = v_issuer
      and binding.owner_uuid = v_owner_uuid
      and binding.auth_identity_created_at_snapshot = v_identity_created_at;
  else
    select binding.*
      into v_binding
    from public.user_session_generation_bindings as binding
    where binding.hmac_key_version = v_attestation_version
      and binding.session_key_hash = v_session_key_hash
      and binding.issuer = v_issuer
      and binding.owner_uuid = v_owner_uuid
      and binding.auth_identity_created_at_snapshot = v_identity_created_at
    for key share;
  end if;

  if v_binding.owner_uuid is null
    or v_binding.binding_state is distinct from 'active'
    or v_binding.revoked_at is not null
    or v_binding.binding_expires_at is null
    or v_binding.binding_expires_at < clock_timestamp()
    or v_binding.remote_verified_at is null
    or v_binding.remote_verified_at < v_epoch.verified_at then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;
end;
$function$;

grant usage on schema auth, private, public to anon, authenticated, service_role;
revoke all on function private.decode_base64url_jsonb(text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_hybrid_remote_session_authority(
  text,
  uuid,
  timestamp with time zone,
  bigint,
  text,
  timestamp with time zone,
  bigint,
  text,
  integer,
  timestamp with time zone,
  timestamp with time zone
) from public, anon, authenticated;
grant execute on function public.record_hybrid_remote_session_authority(
  text,
  uuid,
  timestamp with time zone,
  bigint,
  text,
  timestamp with time zone,
  bigint,
  text,
  integer,
  timestamp with time zone,
  timestamp with time zone
) to service_role;
revoke all on function public.revoke_hybrid_remote_session_authority(
  text,
  integer
) from public, anon, authenticated;
grant execute on function public.revoke_hybrid_remote_session_authority(
  text,
  integer
) to service_role;
revoke all on function public.assert_hybrid_remote_session_authority(
  text,
  uuid,
  timestamp with time zone,
  text,
  integer
) from public, anon, authenticated;
grant execute on function public.assert_hybrid_remote_session_authority(
  text,
  uuid,
  timestamp with time zone,
  text,
  integer
) to service_role;
grant execute on function private.verify_hybrid_request_authority()
  to anon, authenticated, service_role;

create table if not exists public.hybrid_runtime_probe (
  owner_uuid uuid primary key,
  note text not null
);

insert into public.hybrid_runtime_probe (owner_uuid, note)
values ('11111111-1111-4111-8111-111111111111', 'runtime-ok')
on conflict (owner_uuid) do update
set note = excluded.note;

alter table public.hybrid_runtime_probe enable row level security;

drop policy if exists hybrid_runtime_probe_owner_read on public.hybrid_runtime_probe;
create policy hybrid_runtime_probe_owner_read
  on public.hybrid_runtime_probe
  for select
  to authenticated
  using (owner_uuid = auth.uid());

grant select on public.hybrid_runtime_probe to authenticated;

create table if not exists public.hybrid_runtime_mutations (
  id uuid primary key,
  owner_uuid uuid not null,
  note text not null
);

alter table public.hybrid_runtime_mutations enable row level security;

drop policy if exists hybrid_runtime_mutations_owner_select
  on public.hybrid_runtime_mutations;
create policy hybrid_runtime_mutations_owner_select
  on public.hybrid_runtime_mutations
  for select
  to authenticated
  using (owner_uuid = auth.uid());

drop policy if exists hybrid_runtime_mutations_owner_insert
  on public.hybrid_runtime_mutations;
create policy hybrid_runtime_mutations_owner_insert
  on public.hybrid_runtime_mutations
  for insert
  to authenticated
  with check (owner_uuid = auth.uid());

grant select, insert on public.hybrid_runtime_mutations to authenticated;

create table if not exists public.recipes (
  id uuid primary key,
  title text not null,
  thumbnail_url text,
  tags text[] not null default '{}',
  base_servings integer not null default 1,
  view_count integer not null default 0,
  like_count integer not null default 0,
  save_count integer not null default 0,
  plan_count integer not null default 0,
  cook_count integer not null default 0,
  created_at timestamptz not null default clock_timestamp(),
  source_type text not null default 'system',
  visibility text not null default 'public',
  deleted_at timestamptz,
  is_public boolean not null default true
);

insert into public.recipes (id, title, visibility, is_public)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'public-recipe',
  'public',
  true
)
on conflict (id) do update
set title = excluded.title,
    visibility = excluded.visibility,
    is_public = excluded.is_public;

grant select on public.recipes to anon, authenticated;

alter table public.recipes enable row level security;

drop policy if exists recipes_public_read on public.recipes;
create policy recipes_public_read
  on public.recipes
  for select
  to anon, authenticated
  using (is_public and visibility = 'public' and deleted_at is null);

create table if not exists public.ingredients (
  id uuid primary key,
  standard_name text not null,
  category text not null
);

create table if not exists public.ingredient_synonyms (
  ingredient_id uuid not null references public.ingredients(id),
  synonym text not null
);

insert into public.ingredients (id, standard_name, category)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '감자', '채소')
on conflict (id) do update
set standard_name = excluded.standard_name,
    category = excluded.category;

insert into public.ingredient_synonyms (ingredient_id, synonym)
select 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'potato'
where not exists (
  select 1 from public.ingredient_synonyms where synonym = 'potato'
);

grant select on public.ingredients, public.ingredient_synonyms
  to anon, authenticated;
alter table public.ingredients enable row level security;
alter table public.ingredient_synonyms enable row level security;
create policy ingredients_public_read on public.ingredients
  for select to anon, authenticated using (true);
create policy ingredient_synonyms_public_read on public.ingredient_synonyms
  for select to anon, authenticated using (true);

create table if not exists public.cooking_methods (
  id uuid primary key,
  code text not null,
  label text not null,
  color_key text not null,
  is_system boolean not null,
  display_order integer not null,
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists public.cooking_method_synonyms (
  method_code text not null,
  synonym text not null,
  is_active boolean not null default true
);

insert into public.cooking_methods (
  id, code, label, color_key, is_system, display_order
)
values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'boil',
  '삶기',
  'blue',
  true,
  1
)
on conflict (id) do update set label = excluded.label;

insert into public.cooking_method_synonyms (method_code, synonym)
select 'boil', '데치기'
where not exists (
  select 1 from public.cooking_method_synonyms where synonym = '데치기'
);

grant select on public.cooking_methods, public.cooking_method_synonyms
  to anon, authenticated;
alter table public.cooking_methods enable row level security;
alter table public.cooking_method_synonyms enable row level security;
create policy cooking_methods_public_read on public.cooking_methods
  for select to anon, authenticated using (true);
create policy cooking_method_synonyms_public_read
  on public.cooking_method_synonyms
  for select to anon, authenticated using (is_active);

create or replace function public.list_public_recipe_tags(
  p_q text,
  p_kind text,
  p_theme_eligible boolean,
  p_limit integer
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $function$
  select jsonb_build_array(
    jsonb_build_object('id', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'name', '간단')
  );
$function$;

create or replace function public.list_home_theme_recipes(
  p_tag_limit integer,
  p_recipes_per_tag integer
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $function$
  select jsonb_build_array(
    jsonb_build_object('tag_id', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd')
  );
$function$;

grant execute on function public.list_public_recipe_tags(
  text, text, boolean, integer
) to anon, authenticated;
grant execute on function public.list_home_theme_recipes(
  integer, integer
) to anon, authenticated;

create or replace function public.hybrid_runtime_request_probe()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public, auth, pg_temp
as $function$
  select jsonb_build_object(
    'owner_uuid', auth.uid()::text,
    'auth_expected_issuer', current_setting('app.settings.auth_expected_issuer', true),
    'attestation_secret_length', length(current_setting('app.settings.homecook_session_attestation_hmac_key_v1', true)),
    'request_path', current_setting('request.path', true),
    'request_method', current_setting('request.method', true),
    'probe_count', (
      select count(*)::integer
      from public.hybrid_runtime_probe as probe
      where probe.owner_uuid = auth.uid()
    )
  );
$function$;

grant execute on function public.hybrid_runtime_request_probe() to authenticated;
