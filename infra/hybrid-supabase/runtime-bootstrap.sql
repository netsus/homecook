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
    or p_binding_expires_at <= p_verified_at
    or p_binding_expires_at > p_verified_at + interval '5 minutes' then
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
  if v_claims ->> 'role' in ('anon', 'service_role') then
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
  v_attestation_version := (v_attestation ->> 'version')::integer;
  v_attestation_iat := (v_attestation ->> 'issued_at')::bigint;
  v_attestation_exp := (v_attestation ->> 'expires_at')::bigint;
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
  is_public boolean not null default true
);

insert into public.recipes (id, title, is_public)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'public-recipe', true)
on conflict (id) do update
set title = excluded.title,
    is_public = excluded.is_public;

grant select on public.recipes to anon, authenticated;

alter table public.recipes enable row level security;

drop policy if exists recipes_public_read on public.recipes;
create policy recipes_public_read
  on public.recipes
  for select
  to anon, authenticated
  using (is_public);

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
