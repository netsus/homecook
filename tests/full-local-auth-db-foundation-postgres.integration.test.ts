import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.HOMECOOK_FULL_LOCAL_AUTH_DB_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_ACCOUNT_GENERATION_PGHOST ?? "";
const port = process.env.HOMECOOK_ACCOUNT_GENERATION_PGPORT ?? "";
const database = process.env.HOMECOOK_ACCOUNT_GENERATION_PGDATABASE ?? "";
const run = enabled ? describe.sequential : describe.skip;

function psqlResult(sql: string) {
  return spawnSync("psql", [
    "-h", host,
    "-p", port,
    "-U", "postgres",
    "-d", database,
    "-At",
    "-v", "ON_ERROR_STOP=1",
    "-c", sql,
  ], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      NODE_ENV: "test",
    },
  });
}

function psql(sql: string) {
  const result = psqlResult(sql);
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim().split("\n").filter(Boolean).at(-1) ?? "";
}

const serviceClaims = `set request.jwt.claims = '{"role":"service_role"}';`;
const owner = "00000000-0000-4000-8000-000000000001";

function authSnapshot() {
  const [count, digest] = psql(`
    select concat_ws(
      ':',
      count(*),
      encode(
        extensions.digest(
          convert_to(
            coalesce(
              string_agg(
                id::text || ':' || to_char(
                  created_at at time zone 'UTC',
                  'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
                ),
                E'\\n'
                order by id
              ),
              ''
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      )
    )
    from auth.users;
  `).split(":");
  expect(count).toMatch(/^\d+$/u);
  expect(digest).toMatch(/^[0-9a-f]{64}$/u);
  return { count, digest };
}

run("full-local Auth isolated PostgreSQL foundation", () => {
  beforeAll(() => {
    expect(host).not.toBe("");
    expect(port).not.toBe("");
    expect(database).toMatch(/^homecook_[a-z0-9_]+$/u);
  });

  it("starts remote and keeps both control tables inaccessible directly", () => {
    expect(psql(`
      ${serviceClaims}
      select concat_ws(
        ':',
        control.authority,
        control.cutover_epoch,
        control.hmac_key_version,
        control.flows_open
      )
      from private.full_local_auth_control as control;
    `)).toBe("remote:1:1:t");

    for (const role of ["anon", "authenticated", "service_role"]) {
      expect(psql(`
        select concat_ws(
          ':',
          has_table_privilege('${role}', 'private.auth_flow_attempts', 'SELECT'),
          has_table_privilege('${role}', 'private.full_local_auth_control', 'SELECT')
        );
      `)).toBe("f:f");
    }
    expect(psql(`
      select count(*)
      from pg_constraint
      where conrelid = 'public.user_session_generation_bindings'::regclass
        and conname = 'user_session_generation_bindings_epoch_fkey';
    `)).toBe("1");
  });

  it("keeps exact ledger reads side-effect free and denies user roles", () => {
    const denied = psqlResult(`
      set request.jwt.claims = '{"role":"authenticated"}';
      select public.insert_auth_flow_attempt(
        repeat('a', 64),
        'login',
        'google',
        'remote',
        1,
        clock_timestamp(),
        clock_timestamp() + interval '900 seconds'
      );
    `);
    expect(denied.status).not.toBe(0);
    expect(denied.stderr).toContain("ACCOUNT_LIFECYCLE_MAINTENANCE");

    expect(psql(`
      ${serviceClaims}
      with clock as (
        select date_trunc('second', clock_timestamp()) as issued_at
      )
      select public.insert_auth_flow_attempt(
        repeat('b', 64),
        'login',
        'google',
        'remote',
        1,
        clock.issued_at,
        clock.issued_at + interval '900 seconds'
      ) ->> 'inserted'
      from clock;
    `)).toBe("true");

    expect(psql(`
      ${serviceClaims}
      select public.read_auth_flow_attempt(repeat('b', 64), 'login')
        ->> 'provider';
    `)).toBe("google");
    expect(psql(`
      select concat_ws(':', terminal_at is null, terminal_reason is null)
      from private.auth_flow_attempts
      where attempt_hash = repeat('b', 64) and flow_kind = 'login';
    `)).toBe("t:t");
  });

  it("blocks activation until every pre-cutover flow is terminal", () => {
    expect(psql(`
      insert into auth.users (id, created_at)
      values ('${owner}', '2026-08-01T00:00:00Z');
      insert into public.user_account_lifecycles (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        origin,
        status,
        activated_at
      ) values (
        '${owner}',
        1,
        '2026-08-01T00:00:00Z',
        'cutover_active',
        'active',
        clock_timestamp() - interval '2 minutes'
      );
      update public.account_generation_capability_state
      set state = 'generation_active',
          revision = revision + 1,
          activated_at = clock_timestamp() - interval '1 minute'
      where singleton;
      select state from public.account_generation_capability_state;
    `)).toBe("generation_active");

    expect(psql(`
      ${serviceClaims}
      with clock as (
        select date_trunc('second', clock_timestamp()) as issued_at
      )
      select public.insert_auth_flow_attempt(
        repeat('9', 64),
        'login',
        'kakao',
        'remote',
        1,
        clock.issued_at,
        clock.issued_at + interval '900 seconds'
      ) ->> 'inserted'
      from clock;
    `)).toBe("true");

    const snapshot = authSnapshot();
    expect(psql(`
      ${serviceClaims}
      select public.start_full_local_auth_cutover(
        ${snapshot.count}, '${snapshot.digest}', clock_timestamp()
      )
        ->> 'flows_open';
    `)).toBe("false");

    expect(psql(`
      update private.auth_flow_attempts
      set issued_at = (
            select cutover_started_at - interval '960 seconds'
            from private.full_local_auth_control
          ),
          expires_at = (
            select cutover_started_at - interval '60 seconds'
            from private.full_local_auth_control
          )
      where attempt_hash = repeat('b', 64) and flow_kind = 'login';
      ${serviceClaims}
      select concat_ws(
        ':',
        result ->> 'expired_count',
        result ->> 'outstanding_count'
      )
      from (
        select public.expire_and_count_remote_auth_flows(
          (select cutover_started_at from private.full_local_auth_control),
          clock_timestamp()
        ) as result
      ) as drained;
    `)).toBe("1:1");

    const insertWhileClosed = psqlResult(`
      ${serviceClaims}
      with clock as (
        select date_trunc('second', clock_timestamp()) as issued_at
      )
      select public.insert_auth_flow_attempt(
        repeat('c', 64), 'login', 'google', 'remote', 1,
        clock.issued_at, clock.issued_at + interval '900 seconds'
      )
      from clock;
    `);
    expect(insertWhileClosed.status).not.toBe(0);
    expect(insertWhileClosed.stderr).toContain("ACCOUNT_SESSION_STALE");

    expect(psql(`
      insert into auth.users (id, created_at)
      values ('00000000-0000-4000-8000-000000000099', clock_timestamp());
      select count(*) from auth.users;
    `)).toBe("2");

    const changedIdentitySet = psqlResult(`
      ${serviceClaims}
      select public.activate_full_local_auth_authority(
        1, 2, 'https://auth.mumeok.com/auth/v1', clock_timestamp()
      );
    `);
    expect(changedIdentitySet.status).not.toBe(0);
    expect(changedIdentitySet.stderr).toContain("ACCOUNT_SESSION_STALE");

    expect(psql(`
      delete from auth.users
      where id = '00000000-0000-4000-8000-000000000099';
      select count(*) from auth.users;
    `)).toBe("1");

    const prematureActivation = psqlResult(`
      ${serviceClaims}
      select public.activate_full_local_auth_authority(
        1, 2, 'https://auth.mumeok.com/auth/v1', clock_timestamp()
      );
    `);
    expect(prematureActivation.status).not.toBe(0);
    expect(prematureActivation.stderr).toContain("ACCOUNT_LIFECYCLE_MAINTENANCE");

    expect(psql(`
      ${serviceClaims}
      select public.terminal_auth_flow_attempt(
        repeat('9', 64), 'login', 'cutover_rejected', clock_timestamp()
      ) ->> 'terminal_reason';
    `)).toBe("cutover_rejected");
    expect(psql(`
      ${serviceClaims}
      select concat_ws(
        ':',
        result ->> 'authority',
        result ->> 'cutover_epoch',
        result ->> 'hmac_key_version',
        result ->> 'flows_open'
      )
      from (
        select public.activate_full_local_auth_authority(
          1, 2, 'https://auth.mumeok.com/auth/v1', clock_timestamp()
        ) as result
      ) as activated;
    `)).toBe("local:2:2:true");
  });

  it("binds only post-activation local sessions to the exact auth user", () => {
    const staleIdentity = psqlResult(`
      ${serviceClaims}
      with control as (
        select local_activated_at from private.full_local_auth_control
      )
      select public.record_full_local_session_authority(
        'https://auth.mumeok.com/auth/v1',
        '${owner}',
        '2026-08-01T00:00:01Z',
        repeat('d', 64),
        2,
        2,
        control.local_activated_at + interval '1 second',
        control.local_activated_at + interval '2 seconds',
        control.local_activated_at + interval '1 hour',
        control.local_activated_at + interval '30 minutes'
      )
      from control;
    `);
    expect(staleIdentity.status).not.toBe(0);
    expect(staleIdentity.stderr).toContain("ACCOUNT_SESSION_STALE");

    const preActivation = psqlResult(`
      ${serviceClaims}
      with control as (
        select local_activated_at from private.full_local_auth_control
      )
      select public.record_full_local_session_authority(
        'https://auth.mumeok.com/auth/v1',
        '${owner}',
        '2026-08-01T00:00:00Z',
        repeat('d', 64),
        2,
        2,
        control.local_activated_at - interval '1 second',
        control.local_activated_at + interval '2 seconds',
        control.local_activated_at + interval '1 hour',
        control.local_activated_at + interval '30 minutes'
      )
      from control;
    `);
    expect(preActivation.status).not.toBe(0);
    expect(preActivation.stderr).toContain("ACCOUNT_SESSION_STALE");

    expect(psql(`
      ${serviceClaims}
      with control as (
        select local_activated_at from private.full_local_auth_control
      )
      select public.record_full_local_session_authority(
        'https://auth.mumeok.com/auth/v1',
        '${owner}',
        '2026-08-01T00:00:00Z',
        repeat('d', 64),
        2,
        2,
        control.local_activated_at + interval '1 second',
        control.local_activated_at + interval '2 seconds',
        control.local_activated_at + interval '1 hour',
        control.local_activated_at + interval '30 minutes'
      ) ->> 'binding_state'
      from control;
    `)).toBe("active");

    expect(psql(`
      ${serviceClaims}
      with control as (
        select local_activated_at from private.full_local_auth_control
      )
      select public.assert_full_local_session_authority(
        'https://auth.mumeok.com/auth/v1',
        '${owner}',
        '2026-08-01T00:00:00Z',
        repeat('d', 64),
        2,
        2,
        control.local_activated_at + interval '1 second'
      ) ->> 'binding_state'
      from control;
    `)).toBe("active");

    expect(psql(`
      select concat_ws(':', issuer is null, local_issuer, auth_cutover_epoch)
      from public.user_session_generation_bindings
      where session_key_hash = repeat('d', 64);
    `)).toBe("t:https://auth.mumeok.com/auth/v1:2");
  });

  it("preserves hybrid recovery and revokes local sessions idempotently", () => {
    expect(psql(`
      ${serviceClaims}
      select concat_ws(
        ':',
        first_result ->> 'already_revoked',
        second_result ->> 'already_revoked'
      )
      from (
        select
          public.revoke_full_local_session_authority(
            'https://auth.mumeok.com/auth/v1', '${owner}', repeat('d', 64), 2
          ) as first_result,
          public.revoke_full_local_session_authority(
            'https://auth.mumeok.com/auth/v1', '${owner}', repeat('d', 64), 2
          ) as second_result
      ) as revoked;
    `)).toBe("false:true");

    const revokedAssert = psqlResult(`
      ${serviceClaims}
      with control as (
        select local_activated_at from private.full_local_auth_control
      )
      select public.assert_full_local_session_authority(
        'https://auth.mumeok.com/auth/v1', '${owner}',
        '2026-08-01T00:00:00Z', repeat('d', 64), 2, 2,
        control.local_activated_at + interval '1 second'
      )
      from control;
    `);
    expect(revokedAssert.status).not.toBe(0);
    expect(revokedAssert.stderr).toContain("ACCOUNT_SESSION_STALE");

    expect(psql(`
      ${serviceClaims}
      with control as (
        select local_activated_at from private.full_local_auth_control
      )
      select public.record_full_local_session_authority(
        'https://auth.mumeok.com/auth/v1',
        '${owner}',
        '2026-08-01T00:00:00Z',
        repeat('e', 64),
        2,
        2,
        control.local_activated_at + interval '3 seconds',
        control.local_activated_at + interval '4 seconds',
        control.local_activated_at + interval '1 hour',
        control.local_activated_at + interval '30 minutes'
      ) ->> 'binding_state'
      from control;
    `)).toBe("active");

    expect(psql(`
      update public.user_account_lifecycles
      set status = 'quarantined',
          quarantine_reason = 'integration-test'
      where owner_uuid = '${owner}' and account_generation = 1;
      select concat_ws(':', binding_state, revoked_at is not null)
      from public.user_session_generation_bindings
      where session_key_hash = repeat('e', 64);
    `)).toBe("revoked:t");

    const secondOwner = "00000000-0000-4000-8000-000000000002";
    expect(psql(`
      insert into auth.users (id, created_at)
      values ('${secondOwner}', '2026-08-01T00:00:00Z');
      insert into public.user_account_lifecycles (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        origin,
        status,
        activated_at
      ) values (
        '${secondOwner}', 1, '2026-08-01T00:00:00Z',
        'runtime', 'active', clock_timestamp()
      );
      ${serviceClaims}
      with control as (
        select local_activated_at from private.full_local_auth_control
      )
      select public.record_full_local_session_authority(
        'https://auth.mumeok.com/auth/v1',
        '${secondOwner}',
        '2026-08-01T00:00:00Z',
        repeat('f', 64),
        2,
        2,
        control.local_activated_at + interval '1 second',
        control.local_activated_at + interval '2 seconds',
        control.local_activated_at + interval '1 hour',
        control.local_activated_at + interval '30 minutes'
      ) ->> 'binding_state'
      from control;
    `)).toBe("active");

    expect(psql(`
      delete from auth.users where id = '${secondOwner}';
      select concat_ws(':', binding_state, revoked_at is not null)
      from public.user_session_generation_bindings
      where session_key_hash = repeat('f', 64);
    `)).toBe("revoked:t");

    expect(psql(`
      select concat_ws(
        ':',
        to_regclass('private.remote_auth_identity_epochs') is not null,
        to_regprocedure(
          'public.assert_hybrid_remote_session_authority(text,uuid,timestamp with time zone,text,integer)'
        ) is not null,
        count(*)
      )
      from pg_constraint
      where conrelid = 'public.user_session_generation_bindings'::regclass
        and conname = 'user_session_generation_bindings_epoch_fkey';
    `)).toBe("t:t:1");
  });
});
