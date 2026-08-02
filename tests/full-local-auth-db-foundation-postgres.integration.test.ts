import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

import * as fullLocalVerifier from
  "../scripts/lib/recipe-snapshot-authority-full-local-verifier.mjs";
import {
  assertPersonalRecipeEditorFullLocalResult,
  buildPersonalRecipeEditorFullLocalVerificationPlan,
  collectPersonalRecipeEditorSourceEvidence,
} from "../scripts/lib/personal-recipe-editor-full-local-verifier.mjs";

const enabled = process.env.HOMECOOK_FULL_LOCAL_AUTH_DB_PG_INTEGRATION === "1";
const inventoryOnly =
  process.env.HOMECOOK_FULL_LOCAL_SECURITY_INVENTORY_ONLY === "1";
const host = process.env.HOMECOOK_ACCOUNT_GENERATION_PGHOST ?? "";
const port = process.env.HOMECOOK_ACCOUNT_GENERATION_PGPORT ?? "";
const database = process.env.HOMECOOK_ACCOUNT_GENERATION_PGDATABASE ?? "";
const run = enabled && !inventoryOnly ? describe.sequential : describe.skip;
const activeInventoryRun = enabled && inventoryOnly
  ? describe.sequential
  : describe.skip;

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

function securityInventoryApi() {
  const verifierApi = fullLocalVerifier as Record<string, unknown>;
  const buildSql = verifierApi
    .buildRecipeSnapshotAuthorityFullLocalSecurityInventorySql;
  const assertResult = verifierApi
    .assertRecipeSnapshotAuthorityFullLocalSecurityInventoryResult;
  expect(buildSql).toBeTypeOf("function");
  expect(assertResult).toBeTypeOf("function");
  return {
    buildSql: buildSql as (options?: { includeSnapshotTables?: boolean }) => string,
    assertResult: assertResult as (
      result: Record<string, unknown>,
      options?: { includeSnapshotTables?: boolean },
    ) => void,
  };
}

function securityInventoryAfter(
  mutation = "",
  options: { includeSnapshotTables?: boolean } = {},
) {
  const api = securityInventoryApi();
  const result = psqlResult(`
    begin;
    ${mutation}
    ${api.buildSql(options)}
    rollback;
  `);
  expect(result.status, result.stderr).toBe(0);
  const json = result.stdout
    .trim()
    .split("\n")
    .find((line) => line.trim().startsWith("{"));
  expect(json).toBeDefined();
  return {
    api,
    result: JSON.parse(json ?? "{}") as Record<string, unknown>,
  };
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
    expect(psql(`
      update private.full_local_auth_control
      set cutover_started_at = clock_timestamp() - interval '20 seconds',
          local_activated_at = clock_timestamp() - interval '10 seconds'
      where singleton;
      select authority from private.full_local_auth_control;
    `)).toBe("local");
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
        to_timestamp(ceil(extract(epoch from control.local_activated_at)) + 1),
        to_timestamp(ceil(extract(epoch from control.local_activated_at)) + 2),
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
        to_timestamp(ceil(extract(epoch from control.local_activated_at)) + 1),
        to_timestamp(ceil(extract(epoch from control.local_activated_at)) + 2),
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
        to_timestamp(ceil(extract(epoch from control.local_activated_at)) + 1)
      ) ->> 'binding_state'
      from control;
    `)).toBe("active");

    expect(psql(`
      select concat_ws(':', issuer is null, local_issuer, auth_cutover_epoch)
      from public.user_session_generation_bindings
      where session_key_hash = repeat('d', 64);
    `)).toBe("t:https://auth.mumeok.com/auth/v1:2");
  });

  it("allows only scoped internal RPCs and verifies the active local binding", () => {
    expect(psql(`
      set request.jwt.claims = '{"role":"service_role"}';
      set request.method = 'POST';
      set request.path = '/rpc/read_full_local_auth_control';
      set request.headers = '{"x-homecook-internal-scope":"auth-flow"}';
      select private.verify_hybrid_request_authority();
      select 'ok';
    `)).toBe("ok");

    const broadInternalRequest = psqlResult(`
      set request.jwt.claims = '{"role":"service_role"}';
      set request.method = 'GET';
      set request.path = '/users';
      set request.headers = '{"x-homecook-internal-scope":"auth-flow"}';
      select private.verify_hybrid_request_authority();
    `);
    expect(broadInternalRequest.status).not.toBe(0);
    expect(broadInternalRequest.stderr).toContain("ACCOUNT_SESSION_STALE");

    expect(psql(`
      set request.method = 'GET';
      set request.path = '/users';
      with authority as (
        select
          extract(epoch from binding.session_issued_at)::bigint as session_iat,
          extract(epoch from clock_timestamp())::bigint as now_epoch
        from public.user_session_generation_bindings as binding
        where binding.session_key_hash = repeat('d', 64)
      ), claims as (
        select set_config(
          'request.jwt.claims',
          jsonb_build_object(
            'iss', 'https://auth.mumeok.com/auth/v1',
            'aud', 'authenticated',
            'role', 'authenticated',
            'sub', '${owner}',
            'session_id', '22222222-2222-4222-8222-222222222222',
            'iat', authority.session_iat,
            'nbf', authority.session_iat,
            'exp', authority.now_epoch + 1800
          )::text,
          false
        )
        from authority
      ), payload as (
        select rtrim(translate(replace(encode(convert_to(
          jsonb_build_object(
            'version', 2,
            'method', 'GET',
            'path', '/users',
            'issuer', 'https://auth.mumeok.com/auth/v1',
            'owner_uuid', '${owner}',
            'identity_created_at', '2026-08-01T00:00:00.000Z',
            'session_key_hash', repeat('d', 64),
            'issued_at', authority.now_epoch,
            'expires_at', authority.now_epoch + 30
          )::text,
          'UTF8'
        ), 'base64'), E'\\n', ''), '+/', '-_'), '=') as value
        from authority, claims
      ), headers as (
        select set_config(
          'request.headers',
          jsonb_build_object(
            'x-homecook-attestation-verified', payload.value
          )::text,
          false
        )
        from payload
      )
      select private.verify_hybrid_request_authority()
      from headers;
      select 'ok';
    `)).toBe("ok");

    const unverifiedPayload = psqlResult(`
      set request.jwt.claims = '{"role":"authenticated"}';
      set request.method = 'GET';
      set request.path = '/users';
      set request.headers = '{"x-homecook-session-attestation":"forged"}';
      select private.verify_hybrid_request_authority();
    `);
    expect(unverifiedPayload.status).not.toBe(0);
    expect(unverifiedPayload.stderr).toContain("ACCOUNT_SESSION_STALE");
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

  it("accepts the exact manifest function and protected-table RLS inventory", () => {
    const { api, result } = securityInventoryAfter();
    expect(result).toMatchObject({
      required_function_count: 13,
      function_missing_count: 0,
      function_source_drift_count: 0,
      function_security_drift_count: 0,
      function_owner_drift_count: 0,
      function_search_path_drift_count: 0,
      function_acl_drift_count: 0,
      unexpected_function_overload_count: 0,
      required_role_count: 4,
      role_missing_count: 0,
      role_attribute_drift_count: 0,
      required_role_membership_count: 2,
      role_membership_missing_count: 0,
      role_membership_drift_count: 0,
      unexpected_role_membership_count: 0,
      required_rls_table_count: 9,
      rls_table_missing_count: 0,
      rls_disabled_count: 0,
      rls_owner_drift_count: 0,
      rls_force_drift_count: 0,
      required_policy_count: 7,
      policy_missing_count: 0,
      policy_drift_count: 0,
      unexpected_policy_count: 0,
    });
    expect(result._policy_expression_inventory).toHaveLength(7);
    expect(() => api.assertResult(result)).not.toThrow();
  });

  it("rejects an allow-all replacement body", () => {
    const { api, result } = securityInventoryAfter(`
      create or replace function public.read_full_local_auth_control()
      returns jsonb
      language plpgsql
      stable
      security definer
      set search_path = pg_catalog, public, private, auth, pg_temp
      as $mutation$
      begin
        return '{}'::jsonb;
      end;
      $mutation$;
    `);
    expect(() => api.assertResult(result)).toThrow(
      /security inventory failed closed/i,
    );
  });

  it("rejects an unexpected anon EXECUTE grant", () => {
    const { api, result } = securityInventoryAfter(`
      grant execute on function public.read_full_local_auth_control() to anon;
    `);
    expect(() => api.assertResult(result)).toThrow(
      /security inventory failed closed/i,
    );
  });

  it("rejects EXECUTE WITH GRANT OPTION delegation drift", () => {
    const { api, result } = securityInventoryAfter(`
      grant execute on function public.read_full_local_auth_control()
        to service_role with grant option;
    `);
    expect(() => api.assertResult(result)).toThrow(
      /security inventory failed closed/i,
    );
  });

  it("rejects SECURITY INVOKER and unsafe search_path drift", () => {
    const { api, result } = securityInventoryAfter(`
      alter function public.read_full_local_auth_control() security invoker;
      alter function public.read_full_local_auth_control()
        set search_path = public, pg_temp;
    `);
    expect(() => api.assertResult(result)).toThrow(
      /security inventory failed closed/i,
    );
  });

  it("rejects removed owner RLS even when a dummy auth.uid policy exists", () => {
    const { api, result } = securityInventoryAfter(`
      alter table public.recipes disable row level security;
      drop policy recipes_public_and_owner_read on public.recipes;
      create policy dummy_auth_uid_policy
        on public.users
        for select
        to authenticated
        using (auth.uid() = id);
    `);
    expect(() => api.assertResult(result)).toThrow(
      /security inventory failed closed/i,
    );
  });

  it("rejects FORCE RLS drift on a protected table", () => {
    const { api, result } = securityInventoryAfter(`
      alter table public.recipes force row level security;
    `);
    expect(() => api.assertResult(result)).toThrow(
      /security inventory failed closed/i,
    );
  });

  it("rejects a restrictive replacement of an otherwise exact policy", () => {
    const { api, result } = securityInventoryAfter(`
      drop policy recipes_public_and_owner_read on public.recipes;
      create policy recipes_public_and_owner_read
        on public.recipes
        as restrictive
        for select
        to anon, authenticated
        using (
          deleted_at is null
          and recipe_visibility_guard.is_owner_publicly_visible(created_by)
          and (visibility = 'public' or auth.uid() = created_by)
        );
    `);
    expect(() => api.assertResult(result)).toThrow(
      /security inventory failed closed/i,
    );
  });

  it("rejects a policy whose parentheses change the boolean tree", () => {
    const { api, result } = securityInventoryAfter(`
      drop policy recipes_public_and_owner_read on public.recipes;
      create policy recipes_public_and_owner_read
        on public.recipes
        for select
        to anon, authenticated
        using (
          (
            deleted_at is null
            and recipe_visibility_guard.is_owner_publicly_visible(created_by)
            and visibility = 'public'
          )
          or auth.uid() = created_by
        );
    `);
    expect(() => api.assertResult(result)).toThrow(
      /security inventory failed closed/i,
    );
  });

  it("rejects an unexpected overload of a manifest function", () => {
    const { api, result } = securityInventoryAfter(`
      create function public.read_full_local_auth_control(p_dummy integer)
      returns jsonb
      language sql
      stable
      set search_path = pg_catalog, public, private, auth, pg_temp
      as $mutation$
        select '{}'::jsonb
      $mutation$;
    `);
    expect(() => api.assertResult(result)).toThrow(
      /security inventory failed closed/i,
    );
  });
});

activeInventoryRun("active full-local snapshot security inventory", () => {
  const options = { includeSnapshotTables: true };

  beforeAll(() => {
    expect(host).not.toBe("");
    expect(port).not.toBe("");
    expect(database).toMatch(/^homecook_[a-z0-9_]+$/u);
  });

  it("accepts the active 12-table, 2 snapshot ACL, and 12-policy inventory", () => {
    const { api, result } = securityInventoryAfter("", options);
    expect(result._snapshot_table_acl_inventory).toEqual([
      {
        schema: "public",
        table: "recipe_content_snapshots",
        acl: "authenticated:SELECT:false,service_role:SELECT:false",
      },
      {
        schema: "public",
        table: "recipe_nutrition_snapshots",
        acl: "authenticated:SELECT:false,service_role:SELECT:false",
      },
    ]);
    expect(result).toMatchObject({
      required_function_count: 29,
      required_role_count: 4,
      required_role_membership_count: 2,
      role_attribute_drift_count: 0,
      role_membership_drift_count: 0,
      unexpected_role_membership_count: 0,
      required_rls_table_count: 12,
      required_snapshot_table_acl_count: 2,
      snapshot_table_acl_missing_count: 0,
      snapshot_table_acl_drift_count: 0,
      required_policy_count: 12,
      function_acl_drift_count: 0,
      rls_owner_drift_count: 0,
      rls_force_drift_count: 0,
      policy_drift_count: 0,
    });
    expect(result._policy_expression_inventory).toHaveLength(12);
    const policyInventory = result._policy_expression_inventory as Array<{
      name: string;
      schema: string;
      table: string;
      using: string;
      check: string;
    }>;
    expect(
      policyInventory.filter((policy) =>
        policy.name.includes("snapshots_authenticated_read"),
      ),
    ).toEqual([
      {
        schema: "public",
        table: "recipe_content_snapshots",
        name: "recipe_content_snapshots_authenticated_read",
        using: "((owner_user_id IS NULL) OR (auth.uid() = owner_user_id))",
        check: "",
      },
      {
        schema: "public",
        table: "recipe_nutrition_snapshots",
        name: "recipe_nutrition_snapshots_authenticated_read",
        using: "((owner_user_id IS NULL) OR (auth.uid() = owner_user_id))",
        check: "",
      },
    ]);
    expect(() => api.assertResult(result, options)).not.toThrow();
  });

  it("observes local Auth and private Storage authority in a read-only verifier transaction", () => {
    const ownerUuid = "10000000-0000-4000-8000-000000000002";
    const imageObjectId = "71000000-0000-4000-8000-000000000001";
    const objectPath = `${ownerUuid}/1/${imageObjectId}.webp`;
    const setup = psqlResult(`
      delete from auth.identities as identity
      where not exists (
        select 1 from public.users as app_user
        where app_user.id = identity.user_id
      );
      delete from auth.users as auth_user
      where not exists (
        select 1 from public.users as app_user
        where app_user.id = auth_user.id
      );
      insert into auth.users (id, created_at, email)
      select app_user.id, now(), app_user.id::text || '@example.invalid'
      from public.users as app_user
      left join auth.users as auth_user on auth_user.id = app_user.id
      where auth_user.id is null;
      insert into auth.identities (id, user_id)
      select app_user.id::text, app_user.id
      from public.users as app_user
      left join auth.identities as identity on identity.user_id = app_user.id
      where identity.user_id is null;

      update private.full_local_auth_control
      set authority = 'local',
          local_issuer = 'https://auth.mumeok.com/auth/v1',
          cutover_epoch = 2,
          hmac_key_version = 2,
          local_activated_at = clock_timestamp(),
          updated_at = clock_timestamp();

      insert into public.recipe_image_objects (
        id,
        owner_uuid,
        account_generation,
        bucket_id,
        object_path,
        raw_sha256,
        byte_size,
        actual_mime_type,
        visibility,
        state
      ) values (
        '${imageObjectId}',
        '${ownerUuid}',
        1,
        'recipe-images-private',
        '${objectPath}',
        repeat('a', 64),
        128,
        'image/webp',
        'private',
        'attached_private'
      );

      insert into storage.objects (bucket_id, name)
      values ('recipe-images-private', '${objectPath}');
    `);
    expect(setup.status, setup.stderr).toBe(0);

    const plan = buildPersonalRecipeEditorFullLocalVerificationPlan({
      mode: "post-merge-full-local-read-only",
    });
    const verification = psqlResult(`
      begin transaction isolation level read committed read only;
      ${plan.sql}
      commit;
    `);
    expect(verification.status, verification.stderr).toBe(0);
    const json = verification.stdout
      .trim()
      .split("\n")
      .find((line) => line.trim().startsWith("{"));
    expect(json).toBeDefined();
    const authority = JSON.parse(json ?? "{}") as Record<string, unknown>;
    const identityMapping = JSON.parse(psql(`
      select jsonb_build_object(
        'app_users', (select jsonb_agg(id order by id) from public.users),
        'auth_users', (select jsonb_agg(id order by id) from auth.users),
        'identity_users', (select jsonb_agg(user_id order by user_id) from auth.identities)
      );
    `)) as Record<string, unknown>;
    expect(identityMapping.auth_users).toEqual(identityMapping.app_users);
    expect(identityMapping.identity_users).toEqual(identityMapping.auth_users);
    expect(authority).toMatchObject({
      auth_identity_mapping_mismatch_count: 0,
      auth_session_row_count: 0,
      auth_refresh_token_row_count: 0,
      auth_flow_state_row_count: 0,
      private_storage_bucket_count: 1,
      private_storage_bucket_drift_count: 0,
      private_storage_object_count: 1,
      private_storage_object_registry_mismatch_count: 0,
      private_image_registry_shape_drift_count: 0,
      private_image_registry_active_object_mismatch_count: 0,
    });
    expect(authority.auth_user_count).toBeGreaterThan(0);
    expect(authority.auth_identity_count).toBe(authority.auth_user_count);
    expect(() => assertPersonalRecipeEditorFullLocalResult({
      full_local_authority: authority,
      personal_editor_source: collectPersonalRecipeEditorSourceEvidence(
        process.cwd(),
      ),
    })).not.toThrow();
  });

  it.each([
    [
      "grant option",
      `grant execute on function public.read_full_local_auth_control()
         to service_role with grant option;`,
    ],
    [
      "snapshot function grant option",
      `grant execute on function public.backfill_meal_recipe_content_snapshots()
         to service_role with grant option;`,
    ],
    [
      "snapshot function unexpected principal",
      `grant execute on function public.backfill_meal_recipe_content_snapshots()
         to authenticator;`,
    ],
    [
      "authenticated content snapshot write",
      "grant insert on table public.recipe_content_snapshots to authenticated;",
    ],
    [
      "anonymous content snapshot read",
      "grant select on table public.recipe_content_snapshots to anon;",
    ],
    [
      "missing authenticated nutrition snapshot read",
      "revoke select on table public.recipe_nutrition_snapshots from authenticated;",
    ],
    [
      "authenticated BYPASSRLS",
      "alter role authenticated bypassrls;",
    ],
    [
      "anon SUPERUSER",
      "alter role anon superuser;",
    ],
    [
      "authenticated privileged membership",
      "grant service_role to authenticated;",
    ],
    [
      "authenticator service-role membership",
      "grant service_role to authenticator;",
    ],
    [
      "service-role reverse membership",
      `revoke service_role from authenticator;
       grant authenticator to service_role;`,
    ],
    [
      "authenticator predefined privileged membership",
      "grant pg_read_all_data to authenticator;",
    ],
    [
      "service role BYPASSRLS contract",
      "alter role service_role nobypassrls;",
    ],
    [
      "authenticator SET ROLE contract",
      "revoke set option for authenticated from authenticator;",
    ],
    ["FORCE RLS", "alter table public.recipes force row level security;"],
    [
      "snapshot FORCE RLS",
      "alter table public.recipe_content_snapshots force row level security;",
    ],
    [
      "protected table owner",
      "alter table public.recipes owner to authenticated;",
    ],
    [
      "snapshot table owner",
      "alter table public.recipe_nutrition_snapshots owner to authenticated;",
    ],
    [
      "broad snapshot read policy",
      `drop policy recipe_content_snapshots_authenticated_read
         on public.recipe_content_snapshots;
       create policy recipe_content_snapshots_authenticated_read
         on public.recipe_content_snapshots
         for select
         to authenticated
         using (true);`,
    ],
    [
      "restrictive policy",
      `drop policy recipes_public_and_owner_read on public.recipes;
       create policy recipes_public_and_owner_read
         on public.recipes as restrictive for select to anon, authenticated
         using (
           deleted_at is null
           and recipe_visibility_guard.is_owner_publicly_visible(created_by)
           and (visibility = 'public' or auth.uid() = created_by)
         );`,
    ],
    [
      "changed boolean tree",
      `drop policy recipes_public_and_owner_read on public.recipes;
       create policy recipes_public_and_owner_read
         on public.recipes for select to anon, authenticated
         using (
           (deleted_at is null
             and recipe_visibility_guard.is_owner_publicly_visible(created_by)
             and visibility = 'public')
           or auth.uid() = created_by
         );`,
    ],
    [
      "uppercase policy literal",
      `drop policy recipes_public_and_owner_read on public.recipes;
       create policy recipes_public_and_owner_read
         on public.recipes for select to anon, authenticated
         using (
           deleted_at is null
           and recipe_visibility_guard.is_owner_publicly_visible(created_by)
           and (visibility = 'PUBLIC' or auth.uid() = created_by)
         );`,
    ],
    [
      "spaced policy literal",
      `drop policy recipes_public_and_owner_read on public.recipes;
       create policy recipes_public_and_owner_read
         on public.recipes for select to anon, authenticated
         using (
           deleted_at is null
           and recipe_visibility_guard.is_owner_publicly_visible(created_by)
           and (visibility = 'p u b l i c' or auth.uid() = created_by)
         );`,
    ],
    [
      "uppercase review-status literal",
      `drop policy recipe_tags_parent_read on public.recipe_tags;
       create policy recipe_tags_parent_read
         on public.recipe_tags for select to anon, authenticated
         using (
           visibility = 'public'
           and review_status = 'APPROVED'
           and exists (
             select 1 from public.recipes as recipe
             where recipe.id = recipe_tags.recipe_id
           )
         );`,
    ],
  ])("rejects %s drift through the active verifier path", (_name, mutation) => {
    const { api, result } = securityInventoryAfter(mutation, options);
    expect(() => api.assertResult(result, options)).toThrow(
      /security inventory failed closed/i,
    );
  });
});
