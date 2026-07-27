import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.HOMECOOK_ACCOUNT_GENERATION_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_ACCOUNT_GENERATION_PGHOST ?? "";
const port = process.env.HOMECOOK_ACCOUNT_GENERATION_PGPORT ?? "";
const database = process.env.HOMECOOK_ACCOUNT_GENERATION_PGDATABASE ?? "";

function populationDigest(lines: string[]) {
  return createHash("sha256")
    .update([...lines].sort().join("\n"), "utf8")
    .digest("hex");
}

function authPopulationLine(ownerUuid: string, identityEpoch: string) {
  const utc = new Date(identityEpoch).toISOString().replace(
    /\.(\d{3})Z$/u,
    ".$1000Z",
  );
  return `${ownerUuid}:${utc}`;
}

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

function canonicalDeleteUserPrivateDataSql() {
  const source = readFileSync(
    "supabase/migrations/20260718090000_community_prepared_food_catalog.sql",
    "utf8",
  );
  const signature
    = "create or replace function public.delete_user_private_data(p_user_id uuid)";
  const start = source.indexOf(signature);
  const end = source.indexOf("\n$$;", start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + "\n$$;".length);
}

describe.runIf(enabled)("account session generation isolated PostgreSQL foundation", () => {
  beforeAll(() => {
    expect(host).not.toBe("");
    expect(port).not.toBe("");
    expect(database).toMatch(/^homecook_[a-z0-9_]+$/);
  });

  it("starts dark-shipped with one legacy capability row and no canonical generations", () => {
    expect(psql(`
      select state || ':' || revision::text || ':' || count(*) over ()::text
      from public.account_generation_capability_state;
    `)).toBe("legacy:1:1");
    expect(psql(`
      select
        (select count(*) from public.user_account_generation_watermarks)::text
        || ':'
        || (select count(*) from public.user_account_lifecycles)::text;
    `)).toBe("0:0");
  });

  it("does not let even the migration owner delete the capability singleton", () => {
    const deletion = psqlResult(`
      begin;
      delete from public.account_generation_capability_state;
      rollback;
    `);

    expect(deletion.status).not.toBe(0);
    expect(deletion.stderr).toContain(
      "account generation capability singleton cannot be deleted",
    );
    expect(psql("select count(*) from public.account_generation_capability_state;"))
      .toBe("1");
  });

  it("gives the hook owner SELECT-only capability access and no login path", () => {
    expect(psql(`
      select concat_ws(
        ':',
        rolcanlogin,
        rolsuper,
        rolcreaterole,
        rolcreatedb,
        rolreplication,
        rolbypassrls
      )
      from pg_roles
      where rolname = 'homecook_auth_hook_guard_owner';
    `)).toBe("f:f:f:f:f:f");
    expect(psql(`
      select concat_ws(
        ':',
        has_schema_privilege(
          'homecook_auth_hook_guard_owner',
          'account_generation_auth_hook',
          'USAGE'
        ),
        has_table_privilege(
          'homecook_auth_hook_guard_owner',
          'public.account_generation_capability_state',
          'SELECT'
        ),
        has_table_privilege(
          'homecook_auth_hook_guard_owner',
          'public.account_generation_capability_state',
          'INSERT'
        ),
        has_table_privilege(
          'homecook_auth_hook_guard_owner',
          'public.account_generation_capability_state',
          'UPDATE'
        ),
        has_table_privilege(
          'homecook_auth_hook_guard_owner',
          'public.account_generation_capability_state',
          'DELETE'
        )
      );
    `)).toBe("t:t:f:f:f");
  });

  it("allows only supabase_auth_admin to call the hook in legacy mode", () => {
    const allowed = psqlResult(`
      set role supabase_auth_admin;
      select account_generation_auth_hook.before_user_created('{}'::jsonb);
    `);
    expect(allowed.status, allowed.stderr).toBe(0);
    expect(allowed.stdout).toContain("{}");

    for (const role of ["anon", "authenticated", "service_role"]) {
      const denied = psqlResult(`
        set role ${role};
        select account_generation_auth_hook.before_user_created('{}'::jsonb);
      `);
      expect(denied.status).not.toBe(0);
      expect(denied.stderr).toContain("permission denied");
    }
  });

  it("denies identity creation in maintenance and allows it after active promote", () => {
    const maintenance = psqlResult(`
      begin;
      update public.account_generation_capability_state
      set state = 'cutover_maintenance', revision = 2;
      set role supabase_auth_admin;
      select account_generation_auth_hook.before_user_created('{}'::jsonb);
      rollback;
    `);
    expect(maintenance.status).not.toBe(0);
    expect(maintenance.stderr).toContain("account lifecycle maintenance is active");

    const active = psqlResult(`
      begin;
      update public.account_generation_capability_state
      set state = 'cutover_maintenance', revision = 2;
      update public.account_generation_capability_state
      set state = 'generation_active', revision = 3, activated_at = now();
      set role supabase_auth_admin;
      select account_generation_auth_hook.before_user_created('{}'::jsonb);
      rollback;
    `);
    expect(active.status, active.stderr).toBe(0);
    expect(active.stdout).toContain("{}");
    expect(psql(`
      select state || ':' || revision::text
      from public.account_generation_capability_state;
    `)).toBe("legacy:1");
  });

  it("keeps the legacy mutation guard internal and fail-closed outside legacy", () => {
    expect(psql(`
      select prosecdef::text || ':' || provolatile::text
      from pg_proc
      where oid = 'public.assert_legacy_account_generation_write()'::regprocedure;
    `)).toBe("true:v");
    expect(psql("select public.assert_legacy_account_generation_write();"))
      .toBe("");

    const directServiceCall = psqlResult(`
      set role service_role;
      select public.assert_legacy_account_generation_write();
    `);
    expect(directServiceCall.status).not.toBe(0);
    expect(directServiceCall.stderr).toContain("permission denied");

    const repeatableRead = psqlResult(`
      begin isolation level repeatable read;
      select public.assert_legacy_account_generation_write();
      rollback;
    `);
    expect(repeatableRead.status).not.toBe(0);
    expect(repeatableRead.stderr).toContain("requires READ COMMITTED");

    const maintenance = psqlResult(`
      begin;
      update public.account_generation_capability_state
      set state = 'cutover_maintenance', revision = 2;
      select public.assert_legacy_account_generation_write();
      rollback;
    `);
    expect(maintenance.status).not.toBe(0);
    expect(maintenance.stderr).toContain(
      "legacy account mutation authority is unavailable",
    );

    const active = psqlResult(`
      begin;
      update public.account_generation_capability_state
      set state = 'cutover_maintenance', revision = 2;
      update public.account_generation_capability_state
      set state = 'generation_active', revision = 3, activated_at = now();
      select public.assert_legacy_account_generation_write();
      rollback;
    `);
    expect(active.status).not.toBe(0);
    expect(active.stderr).toContain(
      "legacy account mutation authority is unavailable",
    );
    expect(psql(`
      select state || ':' || revision::text
      from public.account_generation_capability_state;
    `)).toBe("legacy:1");
  });

  it("installs the legacy fence on personal direct DML and denies maintenance or active writers", () => {
    const owner = "09000000-0000-4000-8000-000000000001";
    expect(psql(`
      select count(*)
      from pg_trigger
      where tgrelid = 'public.pantry_items'::regclass
        and tgname = 'account_generation_legacy_mutation_fence'
        and not tgisinternal;
    `)).toBe("1");

    expect(psql(`
      set role service_role;
      insert into public.pantry_items (user_id, label)
      values ('${owner}', 'legacy-allowed');
      select count(*) from public.pantry_items where user_id = '${owner}';
    `)).toBe("1");

    const maintenance = psqlResult(`
      begin;
      set role service_role;
      select public.begin_account_generation_cutover(
        '09000000-0000-4000-8000-000000000002',
        1
      );
      insert into public.pantry_items (user_id, label)
      values ('${owner}', 'maintenance-denied');
    `);
    expect(maintenance.status).not.toBe(0);
    expect(maintenance.stderr).toContain(
      "legacy account mutation authority is unavailable",
    );

    const active = psqlResult(`
      begin;
      update public.account_generation_capability_state
      set state = 'cutover_maintenance', revision = 2;
      update public.account_generation_capability_state
      set state = 'generation_active', revision = 3, activated_at = now();
      set role service_role;
      insert into public.pantry_items (user_id, label)
      values ('${owner}', 'active-denied');
    `);
    expect(active.status).not.toBe(0);
    expect(active.stderr).toContain(
      "legacy account mutation authority is unavailable",
    );
    expect(psql(`
      select string_agg(label, ',' order by label)
      from public.pantry_items
      where user_id = '${owner}';
    `)).toBe("legacy-allowed");
  });

  it("adds the same legacy capability predicate to authenticated recipe image policies", () => {
    expect(psql(`
      select count(*)
      from pg_policies
      where schemaname = 'storage'
        and tablename = 'objects'
        and policyname in (
          'recipe_images_insert_own',
          'recipe_images_update_own',
          'recipe_images_delete_own'
        )
        and roles = array['authenticated'::name]
        and (
          coalesce(qual, '') like
            '%account_generation_storage_guard.allows_legacy_recipe_image_write%'
          or coalesce(with_check, '') like
            '%account_generation_storage_guard.allows_legacy_recipe_image_write%'
        );
    `)).toBe("3");
    expect(psql(`
      set role authenticated;
      select account_generation_storage_guard.allows_legacy_recipe_image_write();
    `)).toBe("t");

    const maintenance = psqlResult(`
      begin;
      set role service_role;
      select public.begin_account_generation_cutover(
        '09500000-0000-4000-8000-000000000001',
        1
      );
      reset role;
      set role authenticated;
      select account_generation_storage_guard.allows_legacy_recipe_image_write();
    `);
    expect(maintenance.status).not.toBe(0);
    expect(maintenance.stderr).toContain(
      "legacy account mutation authority is unavailable",
    );
  });

  it("binds and revokes only the exact active identity generation", () => {
    const owner = "10000000-0000-4000-8000-000000000001";
    const identityEpoch = "2026-07-23T01:00:00Z";
    const sessionHash = "a".repeat(64);
    const replay = psqlResult(`
      begin;
      update public.account_generation_capability_state
      set state = 'cutover_maintenance', revision = 2;
      update public.account_generation_capability_state
      set state = 'generation_active', revision = 3, activated_at = now();
      insert into public.user_account_generation_watermarks (
        owner_uuid,
        last_account_generation
      ) values (
        '${owner}',
        1
      );
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
        '${identityEpoch}',
        'runtime',
        'active',
        now()
      );
      set role service_role;
      select public.bind_user_session_generation(
        '${owner}',
        1,
        '${sessionHash}',
        1,
        '${identityEpoch}'
      );
      select public.bind_user_session_generation(
        '${owner}',
        1,
        '${sessionHash}',
        1,
        '${identityEpoch}'
      );
      select public.revoke_user_session_generation_binding(
        '${owner}',
        1,
        '${sessionHash}',
        1
      );
      select public.revoke_user_session_generation_binding(
        '${owner}',
        1,
        '${sessionHash}',
        1
      );
      rollback;
    `);
    expect(replay.status, replay.stderr).toBe(0);
    expect(replay.stdout).toContain('"expected_account_generation": 1');
    expect(replay.stdout).toContain('"hmac_key_version": 1');

    const wrongEpoch = psqlResult(`
      begin;
      update public.account_generation_capability_state
      set state = 'cutover_maintenance', revision = 2;
      update public.account_generation_capability_state
      set state = 'generation_active', revision = 3, activated_at = now();
      insert into public.user_account_generation_watermarks (
        owner_uuid,
        last_account_generation
      ) values (
        '${owner}',
        1
      );
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
        '${identityEpoch}',
        'runtime',
        'active',
        now()
      );
      set role service_role;
      select public.bind_user_session_generation(
        '${owner}',
        1,
        '${sessionHash}',
        1,
        '2026-07-23T02:00:00Z'
      );
      rollback;
    `);
    expect(wrongEpoch.status).not.toBe(0);
    expect(wrongEpoch.stderr).toContain(
      "account generation lifecycle does not match the verified identity",
    );
    expect(psql(`
      select
        (select count(*) from public.user_account_generation_watermarks)::text
        || ':'
        || (select count(*) from public.user_account_lifecycles)::text
        || ':'
        || (select count(*) from public.user_session_generation_bindings)::text;
    `)).toBe("0:0:0");
  });

  it("fails closed before #3 installs the joint activation gate", () => {
    const attempt = "10500000-0000-4000-8000-000000000001";
    const owner = "10500000-0000-4000-8000-000000000002";
    const result = psqlResult(`
      begin;
      set role service_role;
      select public.begin_account_generation_cutover('${attempt}', 1);
      select public.stage_account_generation_cutover_owner(
        '${attempt}', 2, '${owner}', null, 1,
        'quarantine', 'public_without_auth_quarantined', null,
        null, 'validated'
      );
      select public.set_account_generation_cutover_snapshot(
        '${attempt}', 2,
        0, 'empty-auth',
        0, 'empty-public',
        1, 'one-personal-owner',
        'auth_table_lock',
        '{"verified":true,"storage_terminal":true,"owner_signal_union_zero":true}'::jsonb
      );
      select public.promote_account_generation_cutover(
        '${attempt}', 2,
        0, 'empty-auth',
        0, 'empty-public',
        1, 'one-personal-owner'
      );
      rollback;
    `);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "account generation joint activation gate is unavailable",
    );
    expect(psql(`
      select
        (select state from public.account_generation_capability_state)
        || ':'
        || (select count(*) from public.user_account_generation_watermarks)::text
        || ':'
        || (select count(*) from public.user_account_lifecycles)::text;
    `)).toBe("legacy:0:0");
  });

  it("recomputes the locked auth population before atomic promote", () => {
    const attempt = "10500000-0000-4000-8000-000000000003";
    const stagedOwner = "10500000-0000-4000-8000-000000000004";
    const lateAuthOwner = "10500000-0000-4000-8000-000000000005";
    const emptyDigest = populationDigest([]);
    const personalDigest = populationDigest([stagedOwner]);
    const result = psqlResult(`
      begin;
      create table public.recipe_image_objects (id uuid primary key);
      create table public.storage_object_deletion_outbox (id uuid primary key);
      set role service_role;
      select public.begin_account_generation_cutover('${attempt}', 1);
      select public.stage_account_generation_cutover_owner(
        '${attempt}', 2, '${stagedOwner}', null, 1,
        'quarantine', 'public_without_auth_quarantined', null,
        null, 'validated'
      );
      select public.set_account_generation_cutover_snapshot(
        '${attempt}', 2,
        0, '${emptyDigest}',
        0, '${emptyDigest}',
        1, '${personalDigest}',
        'auth_table_lock',
        '{"verified":true,"storage_terminal":true,"owner_signal_union_zero":true}'::jsonb
      );
      reset role;
      insert into auth.users (
        id,
        created_at,
        email,
        raw_app_meta_data,
        raw_user_meta_data
      ) values (
        '${lateAuthOwner}',
        '2026-07-23T10:30:00Z',
        'late-auth@example.com',
        '{"provider":"google"}'::jsonb,
        '{"sub":"late-auth-social-id"}'::jsonb
      );
      set role service_role;
      do $block$
      begin
        perform public.promote_account_generation_cutover(
          '${attempt}', 2,
          0, '${emptyDigest}',
          0, '${emptyDigest}',
          1, '${personalDigest}'
        );
        raise exception 'live auth digest drift was not rejected';
      exception
        when sqlstate '40001' then
          null;
      end;
      $block$;
      reset role;
      select
        (select state from public.account_generation_capability_state)
        || ':'
        || (select count(*) from public.user_account_generation_watermarks)::text
        || ':'
        || (select count(*) from public.user_account_lifecycles)::text;
      rollback;
    `);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("cutover_maintenance:0:0");
  });

  it("rejects a nonzero owner signal before any canonical mutation", () => {
    const attempt = "10500000-0000-4000-8000-000000000006";
    const owner = "10500000-0000-4000-8000-000000000007";
    const result = psqlResult(`
      begin;
      create table public.recipe_image_objects (id uuid primary key);
      create table public.storage_object_deletion_outbox (id uuid primary key);
      set role service_role;
      select public.begin_account_generation_cutover('${attempt}', 1);
      select public.stage_account_generation_cutover_owner(
        '${attempt}', 2, '${owner}', null, 1,
        'quarantine', 'public_without_auth_quarantined', null,
        null, 'validated'
      );
      select public.set_account_generation_cutover_snapshot(
        '${attempt}', 2,
        0, '${populationDigest([])}',
        0, '${populationDigest([])}',
        1, '${populationDigest([owner])}',
        'provider_barrier',
        '{"verified":true,"storage_terminal":true,"owner_signal_union_zero":false}'::jsonb
      );
      rollback;
    `);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "complete verified cutover population snapshot is required",
    );
    expect(psql(`
      select
        (select state from public.account_generation_capability_state)
        || ':'
        || (select count(*) from public.user_account_generation_watermarks)::text
        || ':'
        || (select count(*) from public.user_account_lifecycles)::text;
    `)).toBe("legacy:0:0");
  });

  it("bootstraps only a verified post-cutover identity and binds its exact session", () => {
    const attempt = "10600000-0000-4000-8000-000000000001";
    const owner = "10600000-0000-4000-8000-000000000002";
    const preCutoverOwner = "10600000-0000-4000-8000-000000000003";
    const identityEpoch = "2026-07-23T11:00:00Z";
    const sessionHash = "7".repeat(64);
    const reboundSessionHash = "8".repeat(64);
    const result = psqlResult(`
      begin;
      insert into public.account_generation_cutover_attempts (
        id,
        state,
        capability_revision,
        result_json,
        promoted_at
      ) values (
        '${attempt}',
        'promoted',
        2,
        '{"promoted_owner_count":0,"capability_revision":3}'::jsonb,
        '2026-07-23T10:00:00Z'
      );
      update public.account_generation_capability_state
      set
        state = 'cutover_maintenance',
        revision = 2,
        current_cutover_attempt_id = '${attempt}';
      update public.account_generation_capability_state
      set
        state = 'generation_active',
        revision = 3,
        activated_at = '2026-07-23T10:00:00Z';
      insert into auth.users (
        id,
        created_at,
        email,
        raw_app_meta_data,
        raw_user_meta_data
      ) values (
        '${owner}',
        '${identityEpoch}',
        'post-cutover@example.com',
        '{"provider":"google"}'::jsonb,
        '{"nickname":"새 집밥러","sub":"post-cutover-social-id"}'::jsonb
      );
      insert into auth.users (
        id,
        created_at,
        email,
        raw_app_meta_data,
        raw_user_meta_data
      ) values (
        '${preCutoverOwner}',
        '2026-07-23T09:00:00Z',
        'pre-cutover@example.com',
        '{"provider":"google"}'::jsonb,
        '{"nickname":"이전 사용자","sub":"pre-cutover-social-id"}'::jsonb
      );
      set role service_role;
      select public.bootstrap_account_generation_identity(
        '${owner}',
        '${identityEpoch}',
        '${sessionHash}',
        1,
        '2026-07-23T11:01:00Z'
      );
      select public.bootstrap_account_generation_identity(
        '${owner}',
        '${identityEpoch}',
        '${reboundSessionHash}',
        1,
        '2026-07-23T11:02:00Z'
      );
      do $block$
      begin
        perform public.bootstrap_account_generation_identity(
          '${preCutoverOwner}',
          '2026-07-23T09:00:00Z',
          '${"9".repeat(64)}',
          1,
          '2026-07-23T11:03:00Z'
        );
        raise exception 'pre-cutover identity bootstrap was not rejected';
      exception
        when sqlstate '55000' then
          if sqlerrm is distinct from 'ACCOUNT_CUTOVER_UNCLASSIFIED' then
            raise exception 'unexpected pre-cutover bootstrap error: %', sqlerrm;
          end if;
      end;
      $block$;
      reset role;
      select concat_ws(
        ':',
        (select last_account_generation
         from public.user_account_generation_watermarks
         where owner_uuid = '${owner}'),
        (select status
         from public.user_account_lifecycles
         where owner_uuid = '${owner}' and account_generation = 1),
        (select nickname from public.users where id = '${owner}'),
        (select count(*)
         from public.user_session_generation_bindings
         where owner_uuid = '${owner}'
           and expected_account_generation = 1),
        (select count(*)
         from public.user_account_lifecycles
         where owner_uuid = '${preCutoverOwner}'),
        (select count(*)
         from public.users
         where id = '${preCutoverOwner}')
      );
      rollback;
    `);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("1:active:새 집밥러:2:0:0");
  });

  it("commits legacy cleanup and the exact identity-epoch receipt atomically", () => {
    const owner = "20000000-0000-4000-8000-000000000001";
    const identityEpoch = "2026-07-23T03:00:00Z";

    expect(psql(`
      insert into public.account_generation_legacy_delete_fixture (owner_uuid)
      values ('${owner}');
      set role service_role;
      select public.delete_user_private_data_with_generation_receipt(
        '${owner}',
        '${identityEpoch}'
      );
    `)).toContain('"deleted": true');

    expect(psql(`
      select concat_ws(
        ':',
        (select count(*) from public.account_generation_legacy_delete_fixture),
        (select count(*) from public.legacy_account_delete_receipts),
        (
          select owner_uuid::text
            || '|'
            || to_char(
                 auth_identity_created_at_snapshot at time zone 'UTC',
                 'YYYY-MM-DD"T"HH24:MI:SS"Z"'
               )
            || '|'
            || length(receipt_hash)::text
          from public.legacy_account_delete_receipts
          where owner_uuid = '${owner}'
        )
      );
    `)).toBe(`0:1:${owner}|2026-07-23T03:00:00Z|64`);
  });

  it("rolls legacy cleanup and receipt back together when cleanup fails", () => {
    const owner = "20000000-0000-4000-8000-000000000002";
    const identityEpoch = "2026-07-23T03:05:00Z";
    psql(`
      insert into public.account_generation_legacy_delete_fixture (
        owner_uuid,
        fail_cleanup
      ) values (
        '${owner}',
        true
      );
    `);

    const failed = psqlResult(`
      set role service_role;
      select public.delete_user_private_data_with_generation_receipt(
        '${owner}',
        '${identityEpoch}'
      );
    `);
    expect(failed.status).not.toBe(0);
    expect(failed.stderr).toContain("forced legacy cleanup failure");
    expect(psql(`
      select
        (select count(*)
         from public.account_generation_legacy_delete_fixture
         where owner_uuid = '${owner}')::text
        || ':'
        || (select count(*)
            from public.legacy_account_delete_receipts
            where owner_uuid = '${owner}')::text;
    `)).toBe("1:0");
  });

  it("aborts a mismatched cutover without canonical rows and permits a second atomic promote", () => {
    const firstAttempt = "30000000-0000-4000-8000-000000000001";
    const secondAttempt = "30000000-0000-4000-8000-000000000002";
    const activeOwner = "31000000-0000-4000-8000-000000000001";
    const cleanupOwner = "31000000-0000-4000-8000-000000000002";
    const quarantineOwner = "31000000-0000-4000-8000-000000000003";
    const identityEpoch = "2026-07-23T04:00:00Z";
    const emptyDigest = populationDigest([]);
    const firstPersonalDigest = populationDigest([activeOwner]);
    const secondPersonalDigest = populationDigest([
      activeOwner,
      cleanupOwner,
      quarantineOwner,
    ]);
    const result = psqlResult(`
      begin;
      create table public.recipe_image_objects (id uuid primary key);
      create table public.storage_object_deletion_outbox (id uuid primary key);
      set role service_role;
      select public.begin_account_generation_cutover('${firstAttempt}', 1);
      select public.stage_account_generation_cutover_owner(
        '${firstAttempt}', 2, '${activeOwner}', '${identityEpoch}', 1,
        'activate', 'active_candidate', 'auth_public_intersection',
        'active-evidence', 'validated'
      );
      select public.set_account_generation_cutover_snapshot(
        '${firstAttempt}', 2,
        0, '${emptyDigest}',
        0, '${emptyDigest}',
        1, '${firstPersonalDigest}',
        'provider_barrier',
        '{"verified":true,"storage_terminal":true,"owner_signal_union_zero":true}'::jsonb
      );
      do $block$
      begin
        perform public.promote_account_generation_cutover(
          '${firstAttempt}', 2,
          1, 'wrong-auth-digest',
          0, '${emptyDigest}',
          1, '${firstPersonalDigest}'
        );
        raise exception 'digest mismatch was not rejected';
      exception
        when sqlstate '40001' then
          null;
      end;
      $block$;
      reset role;
      select
        (select state from public.account_generation_capability_state)
        || ':'
        || (select count(*) from public.user_account_generation_watermarks)::text
        || ':'
        || (select count(*) from public.user_account_lifecycles)::text;
      set role service_role;
      select public.abort_account_generation_cutover(
        '${firstAttempt}', 2, 'digest_mismatch'
      );
      select public.begin_account_generation_cutover('${secondAttempt}', 3);
      select public.stage_account_generation_cutover_owner(
        '${secondAttempt}', 4, '${activeOwner}', '${identityEpoch}', 1,
        'activate', 'active_candidate', 'auth_public_intersection',
        'active-evidence', 'validated'
      );
      select public.stage_account_generation_cutover_owner(
        '${secondAttempt}', 4, '${cleanupOwner}', '${identityEpoch}', 1,
        'cleanup', 'legacy_deleted_confirmed', 'legacy_delete_receipt',
        'cleanup-evidence', 'validated'
      );
      select public.stage_account_generation_cutover_owner(
        '${secondAttempt}', 4, '${quarantineOwner}', null, 1,
        'quarantine', 'public_without_auth_quarantined', null,
        null, 'validated'
      );
      select public.set_account_generation_cutover_snapshot(
        '${secondAttempt}', 4,
        0, '${emptyDigest}',
        0, '${emptyDigest}',
        3, '${secondPersonalDigest}',
        'auth_table_lock',
        '{"verified":true,"storage_terminal":true,"owner_signal_union_zero":true}'::jsonb
      );
      select public.promote_account_generation_cutover(
        '${secondAttempt}', 4,
        0, '${emptyDigest}',
        0, '${emptyDigest}',
        3, '${secondPersonalDigest}'
      );
      reset role;
      select concat_ws(
        ':',
        (select state from public.account_generation_capability_state),
        (select revision from public.account_generation_capability_state),
        (select count(*) from public.user_account_generation_watermarks),
        (select count(*) from public.user_account_lifecycles),
        (select count(*) from public.auth_identity_deletion_outbox),
        (
          select status
          from public.user_account_lifecycles
          where owner_uuid = '${quarantineOwner}'
        )
      );
      do $block$
      begin
        update public.account_generation_capability_state
        set state = 'legacy', revision = 6;
        raise exception 'post-promote legacy rollback was not rejected';
      exception
        when check_violation then
          null;
      end;
      $block$;
      rollback;
    `);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("cutover_maintenance:0:0");
    expect(result.stdout).toContain("generation_active:5:3:3:1:quarantined");
    expect(psql(`
      select state || ':' || revision::text
      from public.account_generation_capability_state;
    `)).toBe("legacy:1");
    expect(psql(`
      select
        (select count(*) from public.user_account_generation_watermarks)::text
        || ':'
        || (select count(*) from public.user_account_lifecycles)::text;
    `)).toBe("0:0");
  });

  it("fences legacy external writes with a 120-second lease and cleans late success", () => {
    const attempt = "40000000-0000-4000-8000-000000000001";
    const owner = "41000000-0000-4000-8000-000000000001";
    const result = psqlResult(`
      begin;
      set role service_role;
      do $block$
      declare
        v_started jsonb;
        v_attempt_token uuid;
      begin
        v_started := public.start_legacy_external_write_attempt(
          '${owner}', 'private/${owner}/image.webp'
        );
        v_attempt_token := (v_started ->> 'attempt_token')::uuid;
        perform public.begin_account_generation_cutover('${attempt}', 1);
        perform public.finalize_legacy_external_write_attempt(
          v_attempt_token, 'succeeded'
        );
        perform public.cleanup_legacy_external_write_attempt(
          v_attempt_token, 'maintenance_late_success'
        );
      end;
      $block$;
      do $block$
      begin
        perform public.start_legacy_external_write_attempt(
          '${owner}', 'private/${owner}/late.webp'
        );
        raise exception 'maintenance external write start was not rejected';
      exception
        when object_not_in_prerequisite_state then
          null;
      end;
      $block$;
      reset role;
      select concat_ws(
        ':',
        (
          select extract(epoch from (deadline_at - created_at))::integer
          from public.legacy_external_write_attempts
          where owner_uuid = '${owner}'
            and object_path = 'private/${owner}/image.webp'
        ),
        (
          select extract(epoch from (lease_expires_at - created_at))::integer
          from public.legacy_external_write_attempts
          where owner_uuid = '${owner}'
            and object_path = 'private/${owner}/image.webp'
        ),
        (
          select state
          from public.legacy_external_write_attempts
          where owner_uuid = '${owner}'
            and object_path = 'private/${owner}/image.webp'
        )
      );
      set role service_role;
      select public.abort_account_generation_cutover(
        '${attempt}', 2, 'external_write_test'
      );
      rollback;
    `);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("120:120:terminal");
    expect(psql(`
      select state || ':' || revision::text
      from public.account_generation_capability_state;
    `)).toBe("legacy:1");
  });

  it("keeps the auth deletion lease CAS skeleton feature-off for service role", () => {
    const outboxId = "50000000-0000-4000-8000-000000000001";
    const owner = "51000000-0000-4000-8000-000000000001";
    const leaseToken = "52000000-0000-4000-8000-000000000001";
    const wrongLeaseToken = "52000000-0000-4000-8000-000000000002";
    const identityEpoch = "2026-07-23T06:00:00Z";

    const serviceCall = psqlResult(`
      set role service_role;
      select public.claim_auth_identity_deletion_outbox(
        '${outboxId}', '${leaseToken}', '2099-07-23T06:01:00Z'
      );
    `);
    expect(serviceCall.status).not.toBe(0);
    expect(serviceCall.stderr).toContain("permission denied");

    const result = psqlResult(`
      begin;
      insert into public.auth_identity_deletion_outbox (
        id,
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        state
      ) values (
        '${outboxId}',
        '${owner}',
        1,
        '${identityEpoch}',
        'pending'
      );
      select public.claim_auth_identity_deletion_outbox(
        '${outboxId}', '${leaseToken}', '2099-07-23T06:01:00Z'
      );
      do $block$
      begin
        perform public.finalize_auth_identity_deletion_outbox(
          '${outboxId}', '${wrongLeaseToken}', 1,
          'identity_replaced', null, '2099-07-23T06:01:01Z'
        );
        raise exception 'wrong auth deletion lease was not rejected';
      exception
        when sqlstate '40001' then
          null;
      end;
      $block$;
      select public.finalize_auth_identity_deletion_outbox(
        '${outboxId}', '${leaseToken}', 1,
        'identity_replaced', null, '2099-07-23T06:01:02Z'
      );
      select concat_ws(
        ':',
        state,
        terminal_result,
        attempts,
        lease_token is null,
        lease_expires_at is null
      )
      from public.auth_identity_deletion_outbox
      where id = '${outboxId}';
      rollback;
    `);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("succeeded:identity_replaced:1:t:t");
  });

  it("atomically initiates active generation delete and replays only the exact session key payload", () => {
    const attempt = "60000000-0000-4000-8000-000000000001";
    const owner = "61000000-0000-4000-8000-000000000001";
    const identityEpoch = "2026-07-23T07:00:00Z";
    const secondIdentityEpoch = "2026-07-23T07:10:00Z";
    const sessionHash = "d".repeat(64);
    const secondSessionHash = "c".repeat(64);
    const deletionKey = "62000000-0000-4000-8000-000000000001";
    const payloadHash = "e".repeat(64);
    const authDigest = populationDigest([
      authPopulationLine(owner, identityEpoch),
    ]);
    const ownerDigest = populationDigest([owner]);
    const result = psqlResult(`
      begin;
      create table public.recipe_image_objects (id uuid primary key);
      create table public.storage_object_deletion_outbox (id uuid primary key);
      insert into auth.users (
        id, created_at, email, raw_app_meta_data, raw_user_meta_data
      ) values (
        '${owner}', '${identityEpoch}', 'delete@example.com',
        '{"provider":"google"}'::jsonb,
        '{"sub":"delete-social-id"}'::jsonb
      );
      insert into public.users (
        id, nickname, email, social_provider, social_id
      ) values (
        '${owner}', '삭제 대상', 'delete@example.com', 'google',
        'delete-social-id'
      );
      insert into public.account_generation_legacy_delete_fixture (owner_uuid)
      values ('${owner}');
      set role service_role;
      select public.begin_account_generation_cutover('${attempt}', 1);
      select public.stage_account_generation_cutover_owner(
        '${attempt}', 2, '${owner}', '${identityEpoch}', 1,
        'activate', 'active_candidate', 'auth_public_intersection',
        'active-evidence', 'validated'
      );
      select public.set_account_generation_cutover_snapshot(
        '${attempt}', 2,
        1, '${authDigest}',
        1, '${ownerDigest}',
        1, '${ownerDigest}',
        'auth_table_lock',
        '{"verified":true,"storage_terminal":true,"owner_signal_union_zero":true}'::jsonb
      );
      select public.promote_account_generation_cutover(
        '${attempt}', 2,
        1, '${authDigest}',
        1, '${ownerDigest}',
        1, '${ownerDigest}'
      );
      select public.bind_user_session_generation(
        '${owner}', 1, '${sessionHash}', 1, '${identityEpoch}'
      );
      do $block$
      begin
        perform public.initiate_account_generation_delete(
          '${owner}', '${identityEpoch}', '${"9".repeat(64)}', 1,
          '62000000-0000-4000-8000-000000000002', '${payloadHash}'
        );
        raise exception 'stale delete session was not rejected';
      exception
        when sqlstate '55000' then
          if sqlerrm is distinct from 'ACCOUNT_SESSION_STALE' then
            raise exception 'unexpected stale delete error: %', sqlerrm;
          end if;
      end;
      $block$;
      select public.initiate_account_generation_delete(
        '${owner}', '${identityEpoch}', '${sessionHash}', 1,
        '${deletionKey}', '${payloadHash}'
      );
      select public.initiate_account_generation_delete(
        '${owner}', '${identityEpoch}', '${sessionHash}', 1,
        '${deletionKey}', '${payloadHash}'
      );
      do $block$
      begin
        perform public.initiate_account_generation_delete(
          '${owner}', '${identityEpoch}', '${sessionHash}', 1,
          '${deletionKey}', '${"f".repeat(64)}'
        );
        raise exception 'delete payload reuse conflict was not rejected';
      exception
        when unique_violation then
          if sqlerrm is distinct from 'IDEMPOTENCY_KEY_REUSED' then
            raise exception 'unexpected delete replay error: %', sqlerrm;
          end if;
      end;
      $block$;
      do $block$
      begin
        perform public.initiate_account_generation_delete(
          '${owner}', '${identityEpoch}', '${sessionHash}', 1,
          '62000000-0000-4000-8000-000000000002', '${payloadHash}'
        );
        raise exception 'pending delete generation was not rejected';
      exception
        when sqlstate '55000' then
          if sqlerrm is distinct from 'ACCOUNT_DELETION_PENDING' then
            raise exception 'unexpected pending delete error: %', sqlerrm;
          end if;
      end;
      $block$;
      reset role;
      delete from auth.users where id = '${owner}';
      create temporary table account_delete_replay_snapshot as
      select
        lifecycle.revision as lifecycle_revision,
        (
          select count(*)
          from public.user_session_generation_bindings
          where owner_uuid = '${owner}'
        ) as binding_count,
        (
          select count(*)
          from public.auth_identity_deletion_outbox
          where owner_uuid = '${owner}'
        ) as outbox_count
      from public.user_account_lifecycles as lifecycle
      where lifecycle.owner_uuid = '${owner}'
        and lifecycle.account_generation = 1;
      set role service_role;
      select public.replay_account_generation_delete(
        '${owner}', '${sessionHash}', 1,
        '${deletionKey}', '${payloadHash}'
      );
      reset role;
      do $block$
      declare
        v_snapshot account_delete_replay_snapshot%rowtype;
      begin
        select * into v_snapshot
        from account_delete_replay_snapshot;
        if v_snapshot.lifecycle_revision is distinct from (
            select revision
            from public.user_account_lifecycles
            where owner_uuid = '${owner}' and account_generation = 1
          )
          or v_snapshot.binding_count is distinct from (
            select count(*)
            from public.user_session_generation_bindings
            where owner_uuid = '${owner}'
          )
          or v_snapshot.outbox_count is distinct from (
            select count(*)
            from public.auth_identity_deletion_outbox
            where owner_uuid = '${owner}'
          ) then
          raise exception 'delete replay was not read-only and durable';
        end if;
      end;
      $block$;
      set role service_role;
      do $block$
      begin
        perform public.replay_account_generation_delete(
          '${owner}', '${"9".repeat(64)}', 1,
          '${deletionKey}', '${payloadHash}'
        );
        raise exception 'different replay session was not rejected';
      exception
        when sqlstate '55000' then
          if sqlerrm is distinct from 'ACCOUNT_SESSION_STALE' then
            raise exception 'unexpected replay session error: %', sqlerrm;
          end if;
      end;
      $block$;
      do $block$
      begin
        perform public.replay_account_generation_delete(
          '${owner}', '${sessionHash}', 1,
          '${deletionKey}', '${"f".repeat(64)}'
        );
        raise exception 'different replay payload was not rejected';
      exception
        when unique_violation then
          if sqlerrm is distinct from 'IDEMPOTENCY_KEY_REUSED' then
            raise exception 'unexpected replay payload error: %', sqlerrm;
          end if;
      end;
      $block$;
      do $block$
      begin
        perform public.replay_account_generation_delete(
          '${owner}', '${sessionHash}', 1,
          '62000000-0000-4000-8000-000000000003', '${payloadHash}'
        );
        raise exception 'different replay key was not rejected';
      exception
        when sqlstate '55000' then
          if sqlerrm is distinct from 'ACCOUNT_DELETION_PENDING' then
            raise exception 'unexpected replay key error: %', sqlerrm;
          end if;
      end;
      $block$;
      reset role;
      insert into auth.users (
        id, created_at, email, raw_app_meta_data, raw_user_meta_data
      ) values (
        '${owner}', '${secondIdentityEpoch}', 'delete-g2@example.com',
        '{"provider":"google"}'::jsonb,
        '{"sub":"delete-social-id-g2"}'::jsonb
      );
      select public.set_account_generation_internal_writer_marker(
        '${attempt}', true
      );
      insert into public.users (
        id, nickname, email, social_provider, social_id
      ) values (
        '${owner}', '재가입 사용자', 'delete-g2@example.com', 'google',
        'delete-social-id-g2'
      );
      select public.set_account_generation_internal_writer_marker(
        '${attempt}', false
      );
      update public.user_account_generation_watermarks
      set last_account_generation = 2
      where owner_uuid = '${owner}';
      insert into public.user_account_lifecycles (
        owner_uuid,
        account_generation,
        auth_identity_created_at_snapshot,
        origin,
        status,
        activated_at
      ) values (
        '${owner}', 2, '${secondIdentityEpoch}', 'runtime', 'active', now()
      );
      set role service_role;
      select public.bind_user_session_generation(
        '${owner}', 2, '${secondSessionHash}', 1, '${secondIdentityEpoch}'
      );
      reset role;
      create temporary table account_delete_g2_replay_snapshot as
      select
        (
          select revision
          from public.user_account_lifecycles
          where owner_uuid = '${owner}' and account_generation = 1
        ) as g1_revision,
        (
          select deletion_result_json
          from public.user_account_lifecycles
          where owner_uuid = '${owner}' and account_generation = 1
        ) as g1_deletion_result,
        (
          select revision
          from public.user_account_lifecycles
          where owner_uuid = '${owner}' and account_generation = 2
        ) as g2_revision,
        (
          select count(*)
          from public.user_session_generation_bindings
          where owner_uuid = '${owner}'
        ) as binding_count,
        (
          select count(*)
          from public.auth_identity_deletion_outbox
          where owner_uuid = '${owner}'
        ) as outbox_count;
      set role service_role;
      do $block$
      begin
        perform public.replay_account_generation_delete(
          '${owner}', '${sessionHash}', 1,
          '${deletionKey}', '${payloadHash}'
        );
        raise exception 'stale G1 replay was not rejected after G2 activation';
      exception
        when sqlstate '55000' then
          if sqlerrm is distinct from 'ACCOUNT_GENERATION_STALE' then
            raise exception 'unexpected stale G1 replay error: %', sqlerrm;
          end if;
      end;
      $block$;
      reset role;
      do $block$
      declare
        v_snapshot account_delete_g2_replay_snapshot%rowtype;
      begin
        select * into v_snapshot
        from account_delete_g2_replay_snapshot;
        if v_snapshot.g1_revision is distinct from (
            select revision
            from public.user_account_lifecycles
            where owner_uuid = '${owner}' and account_generation = 1
          )
          or v_snapshot.g1_deletion_result is distinct from (
            select deletion_result_json
            from public.user_account_lifecycles
            where owner_uuid = '${owner}' and account_generation = 1
          )
          or v_snapshot.g2_revision is distinct from (
            select revision
            from public.user_account_lifecycles
            where owner_uuid = '${owner}' and account_generation = 2
          )
          or v_snapshot.binding_count is distinct from (
            select count(*)
            from public.user_session_generation_bindings
            where owner_uuid = '${owner}'
          )
          or v_snapshot.outbox_count is distinct from (
            select count(*)
            from public.auth_identity_deletion_outbox
            where owner_uuid = '${owner}'
          ) then
          raise exception 'stale G1 replay changed durable G1 or G2 state';
        end if;
      end;
      $block$;
      select concat_ws(
        ':',
        (
          select status
          from public.user_account_lifecycles
          where owner_uuid = '${owner}' and account_generation = 1
        ),
        (
          select count(*)
          from public.user_session_generation_bindings
          where owner_uuid = '${owner}' and revoked_at is not null
        ),
        (
          select state
          from public.auth_identity_deletion_outbox
          where owner_uuid = '${owner}' and account_generation = 1
        ),
        (select count(*) from public.users where id = '${owner}'),
        (
          select deletion_result_json ->> 'deletion_status'
          from public.user_account_lifecycles
          where owner_uuid = '${owner}' and account_generation = 1
        ),
        (
          select status
          from public.user_account_lifecycles
          where owner_uuid = '${owner}' and account_generation = 2
        )
      );
      rollback;
    `);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      "cleanup_pending:1:pending:1:cleanup_pending:active",
    );
  });

  it("resolves auth-present quarantine activate or delete with durable exact replay", () => {
    const attempt = "70000000-0000-4000-8000-000000000001";
    const activateOwner = "71000000-0000-4000-8000-000000000001";
    const deleteOwner = "71000000-0000-4000-8000-000000000002";
    const identityEpoch = "2026-07-23T08:00:00Z";
    const activateSessionHash = "1".repeat(64);
    const deleteSessionHash = "2".repeat(64);
    const activateKey = "72000000-0000-4000-8000-000000000001";
    const deleteKey = "72000000-0000-4000-8000-000000000002";
    const activatePayloadHash = "3".repeat(64);
    const deletePayloadHash = "4".repeat(64);
    const systemRecipe = "73000000-0000-4000-8000-000000000001";
    const activateRecipe = "73000000-0000-4000-8000-000000000002";
    const recoveryTag = "74000000-0000-4000-8000-000000000001";
    const authDigest = populationDigest([
      authPopulationLine(activateOwner, identityEpoch),
      authPopulationLine(deleteOwner, identityEpoch),
    ]);
    const emptyDigest = populationDigest([]);
    const personalDigest = populationDigest([activateOwner, deleteOwner]);
    const result = psqlResult(`
      begin;
      create table public.recipe_image_objects (id uuid primary key);
      create table public.storage_object_deletion_outbox (id uuid primary key);
      insert into public.recipes (
        id, title, source_type, created_by, visibility
      ) values
        ('${systemRecipe}', 'system recovery control', 'system', null, 'public'),
        ('${activateRecipe}', 'quarantine recovery target', 'manual', '${activateOwner}', 'public');
      insert into public.recipe_sources (id, recipe_id) values
        (gen_random_uuid(), '${systemRecipe}'),
        (gen_random_uuid(), '${activateRecipe}');
      insert into public.tags (
        id, normalized_key, label, kind, is_system, theme_eligible
      ) values (
        '${recoveryTag}', 'recovery', 'Recovery', 'semantic', true, true
      );
      insert into public.recipe_tags (
        recipe_id, tag_id, visibility, review_status
      ) values
        ('${systemRecipe}', '${recoveryTag}', 'public', 'approved'),
        ('${activateRecipe}', '${recoveryTag}', 'public', 'approved');
      select 'stored-before:' ||
        md5(string_agg(to_jsonb(recipe)::text, '|' order by recipe.id))
      from public.recipes as recipe;
      insert into auth.users (
        id, created_at, email, raw_app_meta_data, raw_user_meta_data
      ) values
      (
        '${activateOwner}', '${identityEpoch}', 'activate@example.com',
        '{"provider":"google"}'::jsonb,
        '{"sub":"activate-social-id"}'::jsonb
      ),
      (
        '${deleteOwner}', '${identityEpoch}', 'delete-q@example.com',
        '{"provider":"google"}'::jsonb,
        '{"sub":"delete-q-social-id"}'::jsonb
      );
      insert into public.account_generation_legacy_delete_fixture (owner_uuid)
      values ('${deleteOwner}');
      set role service_role;
      select public.begin_account_generation_cutover('${attempt}', 1);
      select public.stage_account_generation_cutover_owner(
        '${attempt}', 2, '${activateOwner}', '${identityEpoch}', 1,
        'quarantine', 'auth_without_profile_quarantined', null,
        null, 'validated'
      );
      select public.stage_account_generation_cutover_owner(
        '${attempt}', 2, '${deleteOwner}', '${identityEpoch}', 1,
        'quarantine', 'auth_without_profile_quarantined', null,
        null, 'validated'
      );
      select public.set_account_generation_cutover_snapshot(
        '${attempt}', 2,
        2, '${authDigest}',
        0, '${emptyDigest}',
        2, '${personalDigest}',
        'auth_table_lock',
        '{"verified":true,"storage_terminal":true,"owner_signal_union_zero":true}'::jsonb
      );
      select public.promote_account_generation_cutover(
        '${attempt}', 2,
        2, '${authDigest}',
        0, '${emptyDigest}',
        2, '${personalDigest}'
      );
      reset role;
      set local role anon;
      select 'visibility-before:' || concat_ws(
        ':',
        (
          select count(*) from public.recipes
          where id = '${activateRecipe}'
        ),
        (
          select count(*) from public.recipes
          where id = '${systemRecipe}'
        ),
        (
          select count(*) from public.recipe_sources
          where recipe_id = '${activateRecipe}'
        ),
        (
          select count(*)
          from public.find_recipe_ids_by_public_tags(null, 'recovery')
          where recipe_id = '${activateRecipe}'
        )
      );
      reset role;
      set role service_role;
      select public.resolve_account_cutover_quarantine(
        '${activateOwner}', '${identityEpoch}', '${activateSessionHash}', 1,
        '${activateKey}', '${activatePayloadHash}', 'activate', '복구 사용자'
      );
      select public.resolve_account_cutover_quarantine(
        '${activateOwner}', '${identityEpoch}', '${activateSessionHash}', 1,
        '${activateKey}', '${activatePayloadHash}', 'activate', '복구 사용자'
      );
      do $block$
      begin
        perform public.resolve_account_cutover_quarantine(
          '${activateOwner}', '${identityEpoch}', '${activateSessionHash}', 1,
          '${activateKey}', '${"5".repeat(64)}', 'activate', '복구 사용자'
        );
        raise exception 'resolution payload reuse conflict was not rejected';
      exception
        when unique_violation then
          if sqlerrm is distinct from 'IDEMPOTENCY_KEY_REUSED' then
            raise exception 'unexpected resolution replay error: %', sqlerrm;
          end if;
      end;
      $block$;
      select public.resolve_account_cutover_quarantine(
        '${deleteOwner}', '${identityEpoch}', '${deleteSessionHash}', 1,
        '${deleteKey}', '${deletePayloadHash}', 'delete', null
      );
      reset role;
      set local role anon;
      select 'visibility-after:' || concat_ws(
        ':',
        (
          select count(*) from public.recipes
          where id = '${activateRecipe}'
        ),
        (
          select count(*) from public.recipes
          where id = '${systemRecipe}'
        ),
        (
          select count(*) from public.recipe_sources
          where recipe_id = '${activateRecipe}'
        ),
        (
          select count(*)
          from public.find_recipe_ids_by_public_tags(null, 'recovery')
          where recipe_id = '${activateRecipe}'
        )
      );
      reset role;
      select 'stored-after:' ||
        md5(string_agg(to_jsonb(recipe)::text, '|' order by recipe.id))
      from public.recipes as recipe;
      select concat_ws(
        ':',
        (
          select status from public.user_account_lifecycles
          where owner_uuid = '${activateOwner}' and account_generation = 1
        ),
        (
          select nickname from public.users where id = '${activateOwner}'
        ),
        (
          select count(*) from public.user_session_generation_bindings
          where owner_uuid = '${activateOwner}' and revoked_at is null
        ),
        (
          select status from public.user_account_lifecycles
          where owner_uuid = '${deleteOwner}' and account_generation = 1
        ),
        (
          select state from public.auth_identity_deletion_outbox
          where owner_uuid = '${deleteOwner}' and account_generation = 1
        )
      );
      rollback;
    `);
    expect(result.status, result.stderr).toBe(0);
    const outputLines = result.stdout.trim().split("\n");
    expect(outputLines).toContain("visibility-before:0:1:0:0");
    expect(outputLines).toContain("visibility-after:1:1:1:1");
    expect(
      outputLines.find((line) => line.startsWith("stored-after:")),
    ).toBe(
      outputLines
        .find((line) => line.startsWith("stored-before:"))
        ?.replace("stored-before:", "stored-after:"),
    );
    expect(result.stdout).toContain(
      "active:복구 사용자:1:cleanup_pending:pending",
    );
  });

  it("keeps pre-existing owner-neutral and system content unchanged through recovery and account cleanup", () => {
    const attempt = "75000000-0000-4000-8000-000000000001";
    const owner = "75000000-0000-4000-8000-000000000002";
    const systemRecipe = "75000000-0000-4000-8000-000000000003";
    const ownerRecipe = "75000000-0000-4000-8000-000000000004";
    const neutralProduct = "75000000-0000-4000-8000-000000000005";
    const ownerProduct = "75000000-0000-4000-8000-000000000006";
    const neutralVersion = "75000000-0000-4000-8000-000000000007";
    const ownerVersion = "75000000-0000-4000-8000-000000000008";
    const neutralProfile = "75000000-0000-4000-8000-000000000009";
    const ownerProfile = "75000000-0000-4000-8000-000000000010";
    const identityEpoch = "2026-07-27T11:00:00Z";
    const sessionHash = "6".repeat(64);
    const activateKey = "75000000-0000-4000-8000-000000000011";
    const deleteKey = "75000000-0000-4000-8000-000000000012";
    const activatePayloadHash = "7".repeat(64);
    const deletePayloadHash = "8".repeat(64);
    const authDigest = populationDigest([
      authPopulationLine(owner, identityEpoch),
    ]);
    const emptyDigest = populationDigest([]);
    const personalDigest = populationDigest([owner]);
    const canonicalCleanupSql = canonicalDeleteUserPrivateDataSql();

    const result = psqlResult(`
      begin;

      create table public.recipe_books (
        id uuid primary key,
        user_id uuid not null
      );
      create table public.recipe_book_items (
        id uuid primary key default gen_random_uuid(),
        book_id uuid not null,
        recipe_id uuid not null
      );
      create table public.recipe_likes (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null,
        recipe_id uuid not null
      );
      create table public.nutrition_profiles (
        id uuid primary key,
        created_by uuid
      );
      create table public.nutrition_values (
        profile_id uuid not null
      );
      create table public.food_products (
        id uuid primary key,
        owner_user_id uuid,
        visibility text not null,
        source_type text not null,
        current_nutrition_version_id uuid,
        updated_at timestamptz not null default now()
      );
      create table public.food_product_nutrition_versions (
        id uuid primary key,
        product_id uuid not null,
        nutrition_profile_id uuid not null,
        created_by uuid
      );
      alter table public.food_products
        add constraint food_products_current_version_fk
        foreign key (current_nutrition_version_id)
        references public.food_product_nutrition_versions(id)
        deferrable;
      create table public.product_planner_entries (
        id uuid primary key default gen_random_uuid(),
        product_id uuid not null
      );
      create table public.recipe_image_objects (id uuid primary key);
      create table public.storage_object_deletion_outbox (id uuid primary key);

      ${canonicalCleanupSql}

      set constraints all deferred;
      insert into public.recipes (
        id, title, source_type, created_by, visibility
      ) values
        ('${systemRecipe}', 'neutral preservation system recipe', 'system', null, 'public'),
        ('${ownerRecipe}', 'neutral preservation owner recipe', 'manual', '${owner}', 'public');
      insert into public.nutrition_profiles (id, created_by) values
        ('${neutralProfile}', null),
        ('${ownerProfile}', '${owner}');
      insert into public.food_products (
        id, owner_user_id, visibility, source_type, current_nutrition_version_id
      ) values
        ('${neutralProduct}', null, 'public', 'manual', '${neutralVersion}'),
        ('${ownerProduct}', '${owner}', 'public', 'manual', '${ownerVersion}');
      insert into public.food_product_nutrition_versions (
        id, product_id, nutrition_profile_id, created_by
      ) values
        ('${neutralVersion}', '${neutralProduct}', '${neutralProfile}', null),
        ('${ownerVersion}', '${ownerProduct}', '${ownerProfile}', '${owner}');

      create temporary table neutral_digest_before as
      select extensions.digest(
        string_agg(stored_row::text, '|' order by kind, id),
        'sha256'
      ) as value
      from (
        select 'product'::text as kind, product.id, to_jsonb(product) as stored_row
        from public.food_products as product
        where product.id = '${neutralProduct}'
        union all
        select 'profile', profile.id, to_jsonb(profile)
        from public.nutrition_profiles as profile
        where profile.id = '${neutralProfile}'
        union all
        select 'recipe', recipe.id, to_jsonb(recipe)
        from public.recipes as recipe
        where recipe.id = '${systemRecipe}'
        union all
        select 'version', version.id, to_jsonb(version)
        from public.food_product_nutrition_versions as version
        where version.id = '${neutralVersion}'
      ) as neutral_rows;

      insert into auth.users (
        id, created_at, email, raw_app_meta_data, raw_user_meta_data
      ) values (
        '${owner}', '${identityEpoch}', 'neutral-preservation@example.com',
        '{"provider":"google"}'::jsonb,
        '{"sub":"neutral-preservation"}'::jsonb
      );

      set role service_role;
      select public.begin_account_generation_cutover('${attempt}', 1);
      select public.stage_account_generation_cutover_owner(
        '${attempt}', 2, '${owner}', '${identityEpoch}', 1,
        'quarantine', 'auth_without_profile_quarantined', null,
        null, 'validated'
      );
      select public.set_account_generation_cutover_snapshot(
        '${attempt}', 2,
        1, '${authDigest}',
        0, '${emptyDigest}',
        1, '${personalDigest}',
        'auth_table_lock',
        '{"verified":true,"storage_terminal":true,"owner_signal_union_zero":true}'::jsonb
      );
      select public.promote_account_generation_cutover(
        '${attempt}', 2,
        1, '${authDigest}',
        0, '${emptyDigest}',
        1, '${personalDigest}'
      );
      select public.resolve_account_cutover_quarantine(
        '${owner}', '${identityEpoch}', '${sessionHash}', 1,
        '${activateKey}', '${activatePayloadHash}', 'activate', '중립 보존 사용자'
      );
      reset role;

      create temporary table neutral_digest_after_recovery as
      select extensions.digest(
        string_agg(stored_row::text, '|' order by kind, id),
        'sha256'
      ) as value
      from (
        select 'product'::text as kind, product.id, to_jsonb(product) as stored_row
        from public.food_products as product
        where product.id = '${neutralProduct}'
        union all
        select 'profile', profile.id, to_jsonb(profile)
        from public.nutrition_profiles as profile
        where profile.id = '${neutralProfile}'
        union all
        select 'recipe', recipe.id, to_jsonb(recipe)
        from public.recipes as recipe
        where recipe.id = '${systemRecipe}'
        union all
        select 'version', version.id, to_jsonb(version)
        from public.food_product_nutrition_versions as version
        where version.id = '${neutralVersion}'
      ) as neutral_rows;

      set role service_role;
      select public.initiate_account_generation_delete(
        '${owner}', '${identityEpoch}', '${sessionHash}', 1,
        '${deleteKey}', '${deletePayloadHash}'
      );
      reset role;

      select concat_ws(
        ':',
        (
          select status
          from public.user_account_lifecycles
          where owner_uuid = '${owner}' and account_generation = 1
        ),
        (select count(*) from public.users where id = '${owner}'),
        (
          select coalesce(owner_user_id::text, 'neutral')
          from public.food_products
          where id = '${ownerProduct}'
        ),
        (
          select before.value = recovered.value
          from neutral_digest_before as before
          cross join neutral_digest_after_recovery as recovered
        ),
        (
          select value = (
            select extensions.digest(
              string_agg(stored_row::text, '|' order by kind, id),
              'sha256'
            )
            from (
              select 'product'::text as kind, product.id, to_jsonb(product) as stored_row
              from public.food_products as product
              where product.id = '${neutralProduct}'
              union all
              select 'profile', profile.id, to_jsonb(profile)
              from public.nutrition_profiles as profile
              where profile.id = '${neutralProfile}'
              union all
              select 'recipe', recipe.id, to_jsonb(recipe)
              from public.recipes as recipe
              where recipe.id = '${systemRecipe}'
              union all
              select 'version', version.id, to_jsonb(version)
              from public.food_product_nutrition_versions as version
              where version.id = '${neutralVersion}'
            ) as neutral_rows
          )
          from neutral_digest_before
        )
      );
      rollback;
    `);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("cleanup_pending:0:neutral:t:t");
  });
});
