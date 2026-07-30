-- Stage 2 addendum: hybrid remote Auth identity epoch mirror and session authority.

begin;

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create table if not exists private.remote_auth_identity_epochs (
  issuer text not null,
  owner_uuid uuid not null,
  identity_created_at timestamptz not null,
  active_epoch boolean not null default true,
  remote_revision bigint not null check (remote_revision > 0),
  remote_identity_digest text not null
    check (remote_identity_digest ~ '^[0-9a-f]{64}$'),
  verified_at timestamptz not null,
  deleted_terminal_at timestamptz,
  deleted_terminal_reason text,
  evidence_revision bigint not null default 1 check (evidence_revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (issuer, owner_uuid, identity_created_at),
  check (
    (deleted_terminal_at is null and deleted_terminal_reason is null)
    or deleted_terminal_at is not null
  ),
  check (not (active_epoch and deleted_terminal_at is not null))
);

create unique index remote_auth_identity_epochs_one_active_owner_idx
  on private.remote_auth_identity_epochs (issuer, owner_uuid)
  where active_epoch and deleted_terminal_at is null;

revoke all on private.remote_auth_identity_epochs from public, anon, authenticated;
revoke all on private.remote_auth_identity_epochs from service_role;

comment on table private.remote_auth_identity_epochs is
  'PII-free remote identity epoch authority mirror for hybrid session validation.';
comment on column private.remote_auth_identity_epochs.issuer is
  'Exact remote Auth issuer URL.';
comment on column private.remote_auth_identity_epochs.owner_uuid is
  'Local owner UUID that must match the remote subject.';
comment on column private.remote_auth_identity_epochs.identity_created_at is
  'Remote identity created_at snapshot used as the epoch key.';
comment on column private.remote_auth_identity_epochs.active_epoch is
  'Only one non-terminal active epoch may exist for an issuer-owner pair.';
comment on column private.remote_auth_identity_epochs.remote_revision is
  'Monotonic remote control-plane revision for compare-and-swap reconciliation.';
comment on column private.remote_auth_identity_epochs.remote_identity_digest is
  'Fixed SHA-256 digest of the remote identity allowlist surface.';
comment on column private.remote_auth_identity_epochs.verified_at is
  'Remote liveness verification time for the mirrored epoch.';
comment on column private.remote_auth_identity_epochs.deleted_terminal_at is
  'Terminal delete or replacement timestamp if the epoch is no longer valid.';
comment on column private.remote_auth_identity_epochs.deleted_terminal_reason is
  'Structured terminal reason such as deleted or identity_replaced.';
comment on column private.remote_auth_identity_epochs.evidence_revision is
  'Monotonic evidence revision for idempotent reconciler writes.';

alter table public.user_session_generation_bindings
  drop constraint if exists
    user_session_generation_bindi_expected_account_generation_check,
  alter column expected_account_generation drop not null,
  add column issuer text,
  add column remote_verified_at timestamptz,
  add column binding_expires_at timestamptz,
  add column binding_state text,
  add constraint user_session_generation_bindings_binding_state_check
    check (
      binding_state is null
      or binding_state in ('legacy', 'active', 'revoked', 'deleted_terminal')
    ),
  add constraint user_session_generation_bindings_expected_generation_check
    check (
      expected_account_generation is null
      or expected_account_generation > 0
    ),
  add constraint user_session_generation_bindings_hybrid_shape_check
    check (
      binding_state is distinct from 'active'
      or (
        issuer is not null
        and remote_verified_at is not null
        and binding_expires_at is not null
        and binding_expires_at > remote_verified_at
      )
    ),
  add constraint user_session_generation_bindings_epoch_fkey
    foreign key (
      issuer,
      owner_uuid,
      auth_identity_created_at_snapshot
    )
    references private.remote_auth_identity_epochs (
      issuer,
      owner_uuid,
      identity_created_at
    )
    on delete restrict
    not valid;

update public.user_session_generation_bindings
set binding_state = case
  when binding_state is not null then binding_state
  when revoked_at is null then 'legacy'
  else 'revoked'
end
where binding_state is null;

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
    and excluded.remote_revision
      >= private.remote_auth_identity_epochs.remote_revision
    and excluded.evidence_revision
      >= private.remote_auth_identity_epochs.evidence_revision;

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
      or v_existing_binding.binding_state in ('revoked', 'deleted_terminal')
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
      binding_expires_at = excluded.binding_expires_at,
      binding_state = public.user_session_generation_bindings.binding_state
  where public.user_session_generation_bindings.owner_uuid
      = excluded.owner_uuid
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
  v_active_epoch private.remote_auth_identity_epochs%rowtype;
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
    into v_active_epoch
  from private.remote_auth_identity_epochs as epoch
  where epoch.issuer = p_issuer
    and epoch.owner_uuid = p_owner_uuid
    and epoch.identity_created_at = p_identity_created_at
    and epoch.active_epoch
    and epoch.deleted_terminal_at is null
  for share;

  if v_active_epoch.issuer is null then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  select binding.*
    into v_binding
  from public.user_session_generation_bindings as binding
  where binding.hmac_key_version = p_hmac_key_version
    and binding.session_key_hash = p_session_key_hash
    and binding.issuer = p_issuer
    and binding.owner_uuid = p_owner_uuid
    and binding.auth_identity_created_at_snapshot = p_identity_created_at
  for share;

  if v_binding.session_key_hash is null
    or v_binding.binding_state is distinct from 'active'
    or v_binding.revoked_at is not null
    or v_binding.binding_expires_at is null
    or v_binding.binding_expires_at < clock_timestamp()
    or v_binding.remote_verified_at is null
    or v_binding.remote_verified_at < v_active_epoch.verified_at then
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
          and v_method in ('GET', 'HEAD')
          and v_path in ('/ingredients', '/ingredient_synonyms')
        )
        or (
          v_attestation_scope = 'cooking-methods'
          and v_method in ('GET', 'HEAD')
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
              v_method in ('GET', 'HEAD')
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
          and v_method in ('GET', 'HEAD')
          and v_path in ('/recipes', '/recipe_ingredients')
        )
        or (
          v_attestation_scope = 'recipes'
          and v_method = 'POST'
          and v_path = '/rpc/find_recipe_ids_by_public_tags'
        )
        or (
          v_attestation_scope = 'recipe-detail'
          and v_method in ('GET', 'HEAD')
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
          and v_method in ('GET', 'HEAD')
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
            '/rpc/bootstrap_account_generation_identity'
          )
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

revoke all on function private.decode_base64url_jsonb(text)
  from public, anon, authenticated, service_role;
revoke all on function private.verify_hybrid_request_authority()
  from public, anon, authenticated, service_role;
grant execute on function private.verify_hybrid_request_authority()
  to anon, authenticated, service_role;

create or replace function account_generation_storage_guard.allows_legacy_recipe_image_write()
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  perform public.assert_legacy_account_generation_write();
  perform private.verify_hybrid_request_authority();
  return true;
end;
$function$;

revoke execute
  on function account_generation_storage_guard.allows_legacy_recipe_image_write()
  from public, anon, service_role;
grant execute
  on function account_generation_storage_guard.allows_legacy_recipe_image_write()
  to authenticated;

alter role authenticator set pgrst.db_pre_request = 'private.verify_hybrid_request_authority';

alter table if exists public.admin_members
  drop constraint if exists admin_members_user_id_fkey,
  drop constraint if exists admin_members_granted_by_fkey,
  add constraint admin_members_user_id_fkey
    foreign key (user_id)
    references public.users(id)
    on delete cascade
    not valid,
  add constraint admin_members_granted_by_fkey
    foreign key (granted_by)
    references public.users(id)
    on delete set null
    not valid;

alter table if exists public.admin_audit_logs
  add column if not exists actor_identity_created_at_snapshot timestamptz;

alter table if exists public.admin_audit_logs
  drop constraint if exists admin_audit_logs_actor_admin_user_id_fkey,
  add constraint admin_audit_logs_actor_public_user_id_fkey
    foreign key (actor_admin_user_id)
    references public.users(id)
    on delete set null
    not valid;

alter table public.user_session_generation_bindings
  validate constraint user_session_generation_bindings_epoch_fkey;

alter table public.admin_members
  validate constraint admin_members_user_id_fkey,
  validate constraint admin_members_granted_by_fkey;

alter table public.admin_audit_logs
  validate constraint admin_audit_logs_actor_public_user_id_fkey;

create or replace function public.set_account_generation_cutover_snapshot(
  p_attempt_id uuid,
  p_expected_capability_revision bigint,
  p_staged_auth_count bigint,
  p_staged_auth_digest text,
  p_staged_public_count bigint,
  p_staged_public_digest text,
  p_staged_personal_owner_count bigint,
  p_staged_personal_owner_digest text,
  p_auth_barrier_type text,
  p_auth_barrier_evidence jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE'
    using errcode = '55000';
end;
$function$;

create or replace function public.promote_account_generation_cutover(
  p_attempt_id uuid,
  p_expected_capability_revision bigint,
  p_final_auth_count bigint,
  p_final_auth_digest text,
  p_final_public_count bigint,
  p_final_public_digest text,
  p_final_personal_owner_count bigint,
  p_final_personal_owner_digest text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE'
    using errcode = '55000';
end;
$function$;

create or replace function public.resolve_account_cutover_quarantine(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamp with time zone,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_idempotency_key uuid,
  p_payload_hash text,
  p_action text,
  p_nickname text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth, extensions, pg_temp
as $function$
begin
  raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE'
    using errcode = '55000';
end;
$function$;

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
set search_path = pg_catalog, public, auth, pg_temp
as $function$
begin
  raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE'
    using errcode = '55000';
end;
$function$;

revoke all on function public.set_account_generation_cutover_snapshot(
  uuid,
  bigint,
  bigint,
  text,
  bigint,
  text,
  bigint,
  text,
  text,
  jsonb
) from public, anon, authenticated;
grant execute on function public.set_account_generation_cutover_snapshot(
  uuid,
  bigint,
  bigint,
  text,
  bigint,
  text,
  bigint,
  text,
  text,
  jsonb
) to service_role;

revoke all on function public.promote_account_generation_cutover(
  uuid,
  bigint,
  bigint,
  text,
  bigint,
  text,
  bigint,
  text
) from public, anon, authenticated;
grant execute on function public.promote_account_generation_cutover(
  uuid,
  bigint,
  bigint,
  text,
  bigint,
  text,
  bigint,
  text
) to service_role;

revoke all on function public.resolve_account_cutover_quarantine(
  uuid,
  timestamp with time zone,
  text,
  integer,
  uuid,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.resolve_account_cutover_quarantine(
  uuid,
  timestamp with time zone,
  text,
  integer,
  uuid,
  text,
  text,
  text
) to service_role;

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
