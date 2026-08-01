-- Full-local Auth flow ledger and local session authority compatibility layer.

begin;

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to service_role;

create table private.full_local_auth_control (
  singleton boolean primary key default true check (singleton),
  authority text not null check (authority in ('remote', 'local')),
  local_issuer text,
  cutover_epoch bigint not null check (cutover_epoch > 0),
  hmac_key_version integer not null check (hmac_key_version > 0),
  flows_open boolean not null,
  cutover_started_at timestamptz,
  local_activated_at timestamptz,
  staged_auth_count bigint check (staged_auth_count >= 0),
  staged_auth_digest text check (
    staged_auth_digest is null or staged_auth_digest ~ '^[0-9a-f]{64}$'
  ),
  updated_at timestamptz not null default now(),
  check (
    (authority = 'remote' and local_issuer is null and local_activated_at is null)
    or (
      authority = 'local'
      and local_issuer ~ '^https://[^/?#]+/auth/v1$'
      and local_activated_at is not null
    )
  ),
  check (
    cutover_started_at is null
    or cutover_started_at <= coalesce(local_activated_at, updated_at)
  ),
  check (
    (staged_auth_count is null and staged_auth_digest is null)
    or (staged_auth_count is not null and staged_auth_digest is not null)
  )
);

insert into private.full_local_auth_control (
  singleton,
  authority,
  cutover_epoch,
  hmac_key_version,
  flows_open
) values (true, 'remote', 1, 1, true);

alter table private.full_local_auth_control enable row level security;
revoke all on table private.full_local_auth_control
  from public, anon, authenticated, service_role;

create or replace function public.read_full_local_auth_control()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $function$
declare
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

  select control.*
    into strict v_control
  from private.full_local_auth_control as control
  where control.singleton;

  return jsonb_build_object(
    'authority', v_control.authority,
    'local_issuer', v_control.local_issuer,
    'cutover_epoch', v_control.cutover_epoch,
    'hmac_key_version', v_control.hmac_key_version,
    'flows_open', v_control.flows_open,
      'cutover_started_at', v_control.cutover_started_at,
      'local_activated_at', v_control.local_activated_at,
      'staged_auth_count', v_control.staged_auth_count,
      'staged_auth_digest', v_control.staged_auth_digest
  );
end;
$function$;

create or replace function public.start_full_local_auth_cutover(
  p_expected_auth_count bigint,
  p_expected_auth_digest text,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $function$
declare
  v_control private.full_local_auth_control%rowtype;
  v_live_auth_count bigint;
  v_live_auth_digest text;
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
  if p_expected_auth_count is null
    or p_expected_auth_count < 0
    or p_expected_auth_digest !~ '^[0-9a-f]{64}$'
    or p_now is null
    or p_now > clock_timestamp() + interval '5 seconds' then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '22023';
  end if;

  select control.*
    into v_control
  from private.full_local_auth_control as control
  where control.singleton
  for update;

  if v_control.authority is distinct from 'remote' then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  lock table auth.users in share row exclusive mode;

  select
    count(*),
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              auth_user.id::text
                || ':'
                || to_char(
                  auth_user.created_at at time zone 'UTC',
                  'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
                ),
              E'\n'
              order by auth_user.id
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
    into v_live_auth_count, v_live_auth_digest
  from auth.users as auth_user;

  if v_live_auth_count is distinct from p_expected_auth_count
    or v_live_auth_digest is distinct from p_expected_auth_digest then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '40001';
  end if;

  if v_control.flows_open then
    update private.full_local_auth_control
    set flows_open = false,
        cutover_started_at = p_now,
        staged_auth_count = p_expected_auth_count,
        staged_auth_digest = p_expected_auth_digest,
        updated_at = p_now
    where singleton
    returning * into v_control;
  elsif v_control.staged_auth_count is distinct from p_expected_auth_count
    or v_control.staged_auth_digest is distinct from p_expected_auth_digest then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '40001';
  end if;

  return jsonb_build_object(
    'authority', v_control.authority,
    'cutover_epoch', v_control.cutover_epoch,
    'hmac_key_version', v_control.hmac_key_version,
    'flows_open', v_control.flows_open,
    'cutover_started_at', v_control.cutover_started_at
  );
end;
$function$;

create or replace function public.activate_full_local_auth_authority(
  p_expected_cutover_epoch bigint,
  p_new_hmac_key_version integer,
  p_local_issuer text,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $function$
declare
  v_control private.full_local_auth_control%rowtype;
  v_outstanding_count bigint;
  v_live_auth_count bigint;
  v_live_auth_digest text;
  v_capability_state text;
  v_generation_activated_at timestamptz;
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
  if p_expected_cutover_epoch is null
    or p_expected_cutover_epoch <= 0
    or p_new_hmac_key_version is null
    or p_new_hmac_key_version <= 0
    or p_local_issuer !~ '^https://[^/?#]+/auth/v1$'
    or p_now is null
    or p_now > clock_timestamp() + interval '5 seconds' then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '22023';
  end if;

  select control.*
    into v_control
  from private.full_local_auth_control as control
  where control.singleton
  for update;

  if v_control.authority is distinct from 'remote'
    or v_control.flows_open
    or v_control.cutover_started_at is null
    or v_control.cutover_epoch is distinct from p_expected_cutover_epoch
    or p_new_hmac_key_version <= v_control.hmac_key_version then
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

  lock table auth.users in share row exclusive mode;

  select
    count(*),
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          coalesce(
            string_agg(
              auth_user.id::text
                || ':'
                || to_char(
                  auth_user.created_at at time zone 'UTC',
                  'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
                ),
              E'\n'
              order by auth_user.id
            ),
            ''
          ),
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
    into v_live_auth_count, v_live_auth_digest
  from auth.users as auth_user;

  if v_live_auth_count is distinct from v_control.staged_auth_count
    or v_live_auth_digest is distinct from v_control.staged_auth_digest then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '40001';
  end if;

  select count(*)
    into v_outstanding_count
  from private.auth_flow_attempts as attempt
  where attempt.authority = 'remote'
    and attempt.issued_at <= v_control.cutover_started_at
    and attempt.terminal_at is null;

  if v_outstanding_count <> 0 then
    raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE'
      using errcode = '55000';
  end if;

  update private.full_local_auth_control
  set authority = 'local',
      local_issuer = p_local_issuer,
      cutover_epoch = cutover_epoch + 1,
      hmac_key_version = p_new_hmac_key_version,
      flows_open = true,
      local_activated_at = p_now,
      updated_at = p_now
  where singleton
  returning * into v_control;

  return jsonb_build_object(
    'authority', v_control.authority,
    'local_issuer', v_control.local_issuer,
    'cutover_epoch', v_control.cutover_epoch,
    'hmac_key_version', v_control.hmac_key_version,
    'flows_open', v_control.flows_open,
    'local_activated_at', v_control.local_activated_at
  );
end;
$function$;

create table private.auth_flow_attempts (
  attempt_hash text not null
    check (attempt_hash ~ '^[0-9a-f]{64}$'),
  flow_kind text not null check (flow_kind in ('login', 'link')),
  provider text not null
    check (provider in ('google', 'kakao', 'custom:naver')),
  authority text not null check (authority in ('remote', 'local')),
  cutover_epoch bigint not null check (cutover_epoch > 0),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  terminal_at timestamptz,
  terminal_reason text check (
    terminal_reason is null
    or terminal_reason in (
      'success',
      'error',
      'cancelled',
      'expired',
      'cutover_rejected'
    )
  ),
  primary key (attempt_hash, flow_kind),
  check (expires_at = issued_at + interval '900 seconds'),
  check (
    (terminal_at is null and terminal_reason is null)
    or (terminal_at is not null and terminal_reason is not null)
  ),
  check (terminal_at is null or terminal_at >= issued_at)
);

create index auth_flow_attempts_remote_outstanding_idx
  on private.auth_flow_attempts (issued_at, expires_at)
  where authority = 'remote' and terminal_at is null;

alter table private.auth_flow_attempts enable row level security;
revoke all on table private.auth_flow_attempts
  from public, anon, authenticated, service_role;

comment on table private.auth_flow_attempts is
  'HMAC-only server Auth flow ledger; raw nonce and OAuth identity material are forbidden.';

create or replace function public.insert_auth_flow_attempt(
  p_attempt_hash text,
  p_flow_kind text,
  p_provider text,
  p_authority text,
  p_cutover_epoch bigint,
  p_issued_at timestamptz,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $function$
declare
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

  select control.*
    into v_control
  from private.full_local_auth_control as control
  where control.singleton
  for share;

  if not v_control.flows_open
    or v_control.authority is distinct from p_authority
    or v_control.cutover_epoch is distinct from p_cutover_epoch then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  if p_attempt_hash !~ '^[0-9a-f]{64}$'
    or p_flow_kind not in ('login', 'link')
    or p_provider not in ('google', 'kakao', 'custom:naver')
    or p_authority not in ('remote', 'local')
    or p_cutover_epoch is null
    or p_cutover_epoch <= 0
    or p_issued_at is null
    or p_expires_at is distinct from p_issued_at + interval '900 seconds'
    or p_issued_at > clock_timestamp() + interval '5 seconds'
    or p_expires_at <= clock_timestamp() then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '22023';
  end if;

  insert into private.auth_flow_attempts (
    attempt_hash,
    flow_kind,
    provider,
    authority,
    cutover_epoch,
    issued_at,
    expires_at
  ) values (
    p_attempt_hash,
    p_flow_kind,
    p_provider,
    p_authority,
    p_cutover_epoch,
    p_issued_at,
    p_expires_at
  );

  return jsonb_build_object('inserted', true);
end;
$function$;

create or replace function public.read_auth_flow_attempt(
  p_attempt_hash text,
  p_flow_kind text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $function$
declare
  v_attempt private.auth_flow_attempts%rowtype;
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

  if p_attempt_hash !~ '^[0-9a-f]{64}$'
    or p_flow_kind not in ('login', 'link') then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '22023';
  end if;

  select attempt.*
    into v_attempt
  from private.auth_flow_attempts as attempt
  where attempt.attempt_hash = p_attempt_hash
    and attempt.flow_kind = p_flow_kind
  ;

  if v_attempt.attempt_hash is null then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'provider', v_attempt.provider,
    'flow_kind', v_attempt.flow_kind,
    'authority', v_attempt.authority,
    'cutover_epoch', v_attempt.cutover_epoch,
    'expires_at', v_attempt.expires_at,
    'terminal_at', v_attempt.terminal_at,
    'terminal_reason', v_attempt.terminal_reason
  );
end;
$function$;

create or replace function public.terminal_auth_flow_attempt(
  p_attempt_hash text,
  p_flow_kind text,
  p_terminal_reason text,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $function$
declare
  v_attempt private.auth_flow_attempts%rowtype;
  v_terminal_reason text;
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

  if p_attempt_hash !~ '^[0-9a-f]{64}$'
    or p_flow_kind not in ('login', 'link')
    or p_terminal_reason not in (
      'success',
      'error',
      'cancelled',
      'expired',
      'cutover_rejected'
    )
    or p_now is null
    or p_now > clock_timestamp() + interval '5 seconds' then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '22023';
  end if;

  select attempt.*
    into v_attempt
  from private.auth_flow_attempts as attempt
  where attempt.attempt_hash = p_attempt_hash
    and attempt.flow_kind = p_flow_kind
  for update;

  if v_attempt.attempt_hash is null then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = 'P0002';
  end if;

  if v_attempt.terminal_at is null then
    v_terminal_reason := case
      when v_attempt.expires_at <= p_now then 'expired'
      else p_terminal_reason
    end;
    update private.auth_flow_attempts
    set terminal_at = greatest(p_now, issued_at),
        terminal_reason = v_terminal_reason
    where attempt_hash = p_attempt_hash
      and flow_kind = p_flow_kind
    returning * into v_attempt;
  end if;

  return jsonb_build_object(
    'terminal_at', v_attempt.terminal_at,
    'terminal_reason', v_attempt.terminal_reason
  );
end;
$function$;

create or replace function public.expire_and_count_remote_auth_flows(
  p_cutover_started_at timestamptz,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $function$
declare
  v_expired_count bigint;
  v_outstanding_count bigint;
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

  select control.*
    into v_control
  from private.full_local_auth_control as control
  where control.singleton
  for share;

  if v_control.authority is distinct from 'remote'
    or v_control.flows_open
    or v_control.cutover_started_at is distinct from p_cutover_started_at then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  if p_cutover_started_at is null
    or p_now is null
    or p_cutover_started_at > p_now + interval '5 seconds'
    or p_now > clock_timestamp() + interval '5 seconds' then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '22023';
  end if;

  update private.auth_flow_attempts
  set terminal_at = greatest(p_now, issued_at),
      terminal_reason = 'expired'
  where terminal_at is null
    and expires_at <= p_now;
  get diagnostics v_expired_count = row_count;

  select count(*)
    into v_outstanding_count
  from private.auth_flow_attempts
  where authority = 'remote'
    and issued_at <= p_cutover_started_at
    and terminal_at is null
    and expires_at > clock_timestamp();

  return jsonb_build_object(
    'expired_count', v_expired_count,
    'outstanding_count', v_outstanding_count
  );
end;
$function$;

revoke all on function public.insert_auth_flow_attempt(
  text, text, text, text, bigint,
  timestamp with time zone, timestamp with time zone
) from public, anon, authenticated;
revoke all on function public.read_auth_flow_attempt(text, text)
  from public, anon, authenticated;
revoke all on function public.terminal_auth_flow_attempt(
  text, text, text, timestamp with time zone
) from public, anon, authenticated;
revoke all on function public.expire_and_count_remote_auth_flows(
  timestamp with time zone, timestamp with time zone
) from public, anon, authenticated;

grant execute on function public.insert_auth_flow_attempt(
  text, text, text, text, bigint,
  timestamp with time zone, timestamp with time zone
) to service_role;
grant execute on function public.read_auth_flow_attempt(text, text)
  to service_role;
grant execute on function public.terminal_auth_flow_attempt(
  text, text, text, timestamp with time zone
) to service_role;
grant execute on function public.expire_and_count_remote_auth_flows(
  timestamp with time zone, timestamp with time zone
) to service_role;

revoke all on function public.read_full_local_auth_control()
  from public, anon, authenticated;
revoke all on function public.start_full_local_auth_cutover(
  bigint, text, timestamp with time zone
)
  from public, anon, authenticated;
revoke all on function public.activate_full_local_auth_authority(
  bigint, integer, text, timestamp with time zone
) from public, anon, authenticated;
grant execute on function public.read_full_local_auth_control()
  to service_role;
grant execute on function public.start_full_local_auth_cutover(
  bigint, text, timestamp with time zone
)
  to service_role;
grant execute on function public.activate_full_local_auth_authority(
  bigint, integer, text, timestamp with time zone
) to service_role;

alter table public.user_session_generation_bindings
  drop constraint if exists user_session_generation_bindings_hybrid_shape_check,
  add column auth_authority text,
  add column local_issuer text,
  add column local_verified_at timestamptz,
  add column auth_cutover_epoch bigint,
  add column session_issued_at timestamptz,
  add constraint user_session_generation_bindings_auth_authority_check
    check (
      auth_authority is null
      or auth_authority in ('remote', 'local')
    ),
  add constraint user_session_generation_bindings_authority_shape_check
    check (
      binding_state is distinct from 'active'
      or (
        auth_authority = 'local'
        and issuer is null
        and remote_verified_at is null
        and local_issuer is not null
        and local_verified_at is not null
        and auth_cutover_epoch is not null
        and auth_cutover_epoch > 0
        and session_issued_at is not null
        and binding_expires_at is not null
        and binding_expires_at > local_verified_at
      )
      or (
        auth_authority is distinct from 'local'
        and issuer is not null
        and local_issuer is null
        and local_verified_at is null
        and auth_cutover_epoch is null
        and session_issued_at is null
        and remote_verified_at is not null
        and binding_expires_at is not null
        and binding_expires_at > remote_verified_at
      )
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
    ) then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;
  return new;
end;
$function$;

revoke all on function private.protect_full_local_session_binding_identity()
  from public, anon, authenticated, service_role;

create trigger protect_full_local_session_binding_identity
before update on public.user_session_generation_bindings
for each row execute function private.protect_full_local_session_binding_identity();

create or replace function private.revoke_full_local_bindings_on_lifecycle_exit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if old.status = 'active' and new.status is distinct from 'active' then
    update public.user_session_generation_bindings
    set binding_state = 'revoked',
        revoked_at = clock_timestamp()
    where auth_authority = 'local'
      and owner_uuid = old.owner_uuid
      and expected_account_generation = old.account_generation
      and auth_identity_created_at_snapshot
        is not distinct from old.auth_identity_created_at_snapshot
      and binding_state = 'active'
      and revoked_at is null;
  end if;
  return new;
end;
$function$;

revoke all on function private.revoke_full_local_bindings_on_lifecycle_exit()
  from public, anon, authenticated, service_role;

create trigger revoke_full_local_bindings_on_lifecycle_exit
after update of status on public.user_account_lifecycles
for each row execute function private.revoke_full_local_bindings_on_lifecycle_exit();

create or replace function private.revoke_full_local_bindings_on_auth_identity_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $function$
begin
  if tg_op = 'DELETE'
    or new.id is distinct from old.id
    or new.created_at is distinct from old.created_at then
    update public.user_session_generation_bindings
    set binding_state = 'revoked',
        revoked_at = clock_timestamp()
    where auth_authority = 'local'
      and owner_uuid = old.id
      and auth_identity_created_at_snapshot = old.created_at
      and binding_state = 'active'
      and revoked_at is null;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function private.revoke_full_local_bindings_on_auth_identity_change()
  from public, anon, authenticated, service_role;

create trigger revoke_full_local_bindings_on_auth_identity_change
before delete or update of id, created_at on auth.users
for each row execute function private.revoke_full_local_bindings_on_auth_identity_change();

create index user_session_generation_bindings_active_local_idx
  on public.user_session_generation_bindings (
    local_issuer,
    owner_uuid,
    auth_identity_created_at_snapshot,
    binding_expires_at
  )
  where auth_authority = 'local'
    and binding_state = 'active'
    and revoked_at is null;

create or replace function public.record_full_local_session_authority(
  p_issuer text,
  p_owner_uuid uuid,
  p_identity_created_at timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_auth_cutover_epoch bigint,
  p_session_issued_at timestamptz,
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
    or p_session_issued_at < p_identity_created_at
    or p_verified_at is null
    or p_session_issued_at > p_verified_at
    or p_verified_at > clock_timestamp() + interval '5 seconds'
    or p_access_token_expires_at <= p_verified_at
    or p_binding_expires_at <= p_verified_at
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'homecook-account-owner:' || p_owner_uuid::text,
      0
    )
  );

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

  if p_session_issued_at <= v_generation_activated_at then
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  end if;

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

  if v_existing.session_key_hash is not null
    and (
      v_existing.auth_authority is distinct from 'local'
      or v_existing.local_issuer is distinct from p_issuer
      or v_existing.owner_uuid is distinct from p_owner_uuid
      or v_existing.auth_identity_created_at_snapshot
        is distinct from p_identity_created_at
      or v_existing.expected_account_generation
        is distinct from v_expected_generation
      or v_existing.auth_cutover_epoch is distinct from p_auth_cutover_epoch
      or v_existing.session_issued_at is distinct from p_session_issued_at
      or v_existing.binding_state is distinct from 'active'
      or v_existing.revoked_at is not null
      or v_existing.local_verified_at > p_verified_at
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
    binding_state,
    auth_authority,
    local_issuer,
    local_verified_at,
    auth_cutover_epoch,
    session_issued_at
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
    p_session_issued_at
  )
  on conflict (hmac_key_version, session_key_hash)
  do update
  set local_verified_at = excluded.local_verified_at,
      binding_expires_at = excluded.binding_expires_at
  where public.user_session_generation_bindings.auth_authority = 'local'
    and public.user_session_generation_bindings.local_issuer
      = excluded.local_issuer
    and public.user_session_generation_bindings.owner_uuid = excluded.owner_uuid
    and public.user_session_generation_bindings.auth_identity_created_at_snapshot
      = excluded.auth_identity_created_at_snapshot
    and public.user_session_generation_bindings.expected_account_generation
      is not distinct from excluded.expected_account_generation
    and public.user_session_generation_bindings.auth_cutover_epoch
      = excluded.auth_cutover_epoch
    and public.user_session_generation_bindings.session_issued_at
      = excluded.session_issued_at
    and public.user_session_generation_bindings.binding_state = 'active'
    and public.user_session_generation_bindings.revoked_at is null
  returning * into v_binding;

  if v_binding.session_key_hash is null then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  return jsonb_build_object(
    'binding_state', v_binding.binding_state,
    'binding_expires_at', v_binding.binding_expires_at,
    'expected_account_generation', v_binding.expected_account_generation
  );
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
    or p_session_issued_at < p_identity_created_at then
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
    or v_binding.session_issued_at is distinct from p_session_issued_at then
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

  return jsonb_build_object(
    'binding_state', v_binding.binding_state,
    'binding_expires_at', v_binding.binding_expires_at,
    'expected_account_generation', v_binding.expected_account_generation
  );
end;
$function$;

create or replace function public.revoke_full_local_session_authority(
  p_issuer text,
  p_owner_uuid uuid,
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
  v_binding public.user_session_generation_bindings%rowtype;
  v_already_revoked boolean;
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
    or p_session_key_hash !~ '^[0-9a-f]{64}$'
    or p_hmac_key_version is null
    or p_hmac_key_version <= 0 then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'homecook-account-owner:' || p_owner_uuid::text,
      0
    )
  );

  select binding.*
    into v_binding
  from public.user_session_generation_bindings as binding
  where binding.hmac_key_version = p_hmac_key_version
    and binding.session_key_hash = p_session_key_hash
    and binding.auth_authority = 'local'
    and binding.local_issuer = p_issuer
    and binding.owner_uuid = p_owner_uuid
  for update;

  if v_binding.session_key_hash is null then
    return jsonb_build_object(
      'revoked', false,
      'already_revoked', false
    );
  end if;

  v_already_revoked := v_binding.binding_state = 'revoked'
    or v_binding.revoked_at is not null;

  if not v_already_revoked then
    update public.user_session_generation_bindings
    set binding_state = 'revoked',
        revoked_at = clock_timestamp()
    where hmac_key_version = p_hmac_key_version
      and session_key_hash = p_session_key_hash;
  end if;

  return jsonb_build_object(
    'revoked', true,
    'already_revoked', v_already_revoked
  );
end;
$function$;

revoke all on function public.record_full_local_session_authority(
  text, uuid, timestamp with time zone, text, integer, bigint,
  timestamp with time zone, timestamp with time zone,
  timestamp with time zone, timestamp with time zone
) from public, anon, authenticated;
revoke all on function public.assert_full_local_session_authority(
  text, uuid, timestamp with time zone, text, integer, bigint,
  timestamp with time zone
) from public, anon, authenticated;
revoke all on function public.revoke_full_local_session_authority(
  text, uuid, text, integer
) from public, anon, authenticated;

grant execute on function public.record_full_local_session_authority(
  text, uuid, timestamp with time zone, text, integer, bigint,
  timestamp with time zone, timestamp with time zone,
  timestamp with time zone, timestamp with time zone
) to service_role;
grant execute on function public.assert_full_local_session_authority(
  text, uuid, timestamp with time zone, text, integer, bigint,
  timestamp with time zone
) to service_role;
grant execute on function public.revoke_full_local_session_authority(
  text, uuid, text, integer
) to service_role;

commit;
