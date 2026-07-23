import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

const enabled =
  process.env.HOMECOOK_RECIPE_VISIBILITY_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_RECIPE_VISIBILITY_PGHOST ?? "";
const port = process.env.HOMECOOK_RECIPE_VISIBILITY_PGPORT ?? "";
const database = process.env.HOMECOOK_RECIPE_VISIBILITY_PGDATABASE ?? "";
const MIGRATION_PATH =
  "supabase/migrations/20260723170000_recipe_visibility_read_hardening.sql";

const OWNER_ACTIVE = "00000000-0000-4000-8000-000000000201";
const OWNER_QUARANTINED = "00000000-0000-4000-8000-000000000202";
const OWNER_REACTIVATED = "00000000-0000-4000-8000-000000000203";

const RECIPE_SYSTEM = "00000000-0000-4000-8000-000000000001";
const RECIPE_ACTIVE_PUBLIC = "00000000-0000-4000-8000-000000000002";
const RECIPE_ACTIVE_PRIVATE = "00000000-0000-4000-8000-000000000003";
const RECIPE_QUARANTINED = "00000000-0000-4000-8000-000000000004";
const RECIPE_DELETED = "00000000-0000-4000-8000-000000000005";
const RECIPE_REACTIVATED = "00000000-0000-4000-8000-000000000006";

const TAG_SYSTEM = "00000000-0000-4000-8000-000000000101";
const TAG_PRIVATE_ONLY = "00000000-0000-4000-8000-000000000102";
const TAG_PENDING = "00000000-0000-4000-8000-000000000103";

function psqlResult(sql: string) {
  return spawnSync("psql", [
    "-h", host,
    "-p", port,
    "-U", "postgres",
    "-d", database,
    "-qAt",
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

function psqlFileResult(filePath: string, user = "migration_runner") {
  return spawnSync("psql", [
    "-h", host,
    "-p", port,
    "-U", user,
    "-d", database,
    "-qAt",
    "-v", "ON_ERROR_STOP=1",
    "-f", filePath,
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

function asRole(role: "anon" | "authenticated", sql: string, subject = "") {
  return psql(`
    begin;
    set local role ${role};
    select set_config('request.jwt.claim.sub', '${subject}', true);
    ${sql}
    rollback;
  `);
}

function asRoleResult(
  role: "anon" | "authenticated",
  sql: string,
  subject = "",
) {
  return psqlResult(`
    begin;
    set local role ${role};
    select set_config('request.jwt.claim.sub', '${subject}', true);
    ${sql}
    rollback;
  `);
}

describe.runIf(enabled)("recipe visibility isolated PostgreSQL boundary", () => {
  beforeAll(() => {
    expect(host).not.toBe("");
    expect(port).not.toBe("");
    expect(database).toMatch(/^homecook_[a-z0-9_]+$/);

    psql(`
      insert into public.user_account_lifecycles (
        owner_uuid,
        account_generation,
        status
      ) values
        ('${OWNER_ACTIVE}', 1, 'active'),
        ('${OWNER_QUARANTINED}', 1, 'cleanup_pending'),
        ('${OWNER_REACTIVATED}', 1, 'complete'),
        ('${OWNER_REACTIVATED}', 2, 'active');

      insert into public.recipes (
        id,
        title,
        source_type,
        created_by,
        visibility,
        deleted_at
      ) values
        ('${RECIPE_SYSTEM}', 'system', 'system', null, 'public', null),
        ('${RECIPE_ACTIVE_PUBLIC}', 'active public', 'manual', '${OWNER_ACTIVE}', 'public', null),
        ('${RECIPE_ACTIVE_PRIVATE}', 'active private', 'manual', '${OWNER_ACTIVE}', 'private', null),
        ('${RECIPE_QUARANTINED}', 'quarantined', 'manual', '${OWNER_QUARANTINED}', 'public', null),
        ('${RECIPE_DELETED}', 'deleted', 'manual', '${OWNER_ACTIVE}', 'public', now()),
        ('${RECIPE_REACTIVATED}', 'reactivated', 'manual', '${OWNER_REACTIVATED}', 'public', null);

      insert into public.recipe_sources (id, recipe_id)
      select gen_random_uuid(), id from public.recipes;
      insert into public.recipe_ingredients (id, recipe_id, ingredient_id)
      select gen_random_uuid(), id, gen_random_uuid() from public.recipes;
      insert into public.recipe_steps (id, recipe_id, step_number, instruction)
      select gen_random_uuid(), id, 1, 'step' from public.recipes;
      insert into public.recipe_step_cooking_methods (
        id,
        step_id,
        method_id,
        position
      )
      select gen_random_uuid(), id, gen_random_uuid(), 1
      from public.recipe_steps;

      insert into public.tags (
        id,
        normalized_key,
        label,
        kind,
        is_system,
        theme_eligible,
        usage_count
      ) values
        ('${TAG_SYSTEM}', 'visible', 'Visible', 'semantic', true, true, 99),
        ('${TAG_PRIVATE_ONLY}', 'private-only', 'Private only', 'user', false, false, 99),
        ('${TAG_PENDING}', 'pending-only', 'Pending only', 'user', false, false, 99);

      insert into public.recipe_tags (
        recipe_id,
        tag_id,
        visibility,
        review_status,
        sort_order
      ) values
        ('${RECIPE_ACTIVE_PUBLIC}', '${TAG_SYSTEM}', 'public', 'approved', 0),
        ('${RECIPE_ACTIVE_PRIVATE}', '${TAG_PRIVATE_ONLY}', 'public', 'approved', 0),
        ('${RECIPE_ACTIVE_PRIVATE}', '${TAG_PENDING}', 'private', 'pending', 1),
        ('${RECIPE_QUARANTINED}', '${TAG_SYSTEM}', 'public', 'approved', 0),
        ('${RECIPE_DELETED}', '${TAG_SYSTEM}', 'public', 'approved', 0),
        ('${RECIPE_REACTIVATED}', '${TAG_SYSTEM}', 'public', 'approved', 0);

      set local role service_role;
      select public.set_recipe_tags(
        '${RECIPE_ACTIVE_PRIVATE}',
        jsonb_build_array(
          jsonb_build_object(
            'normalized_key', 'private-only',
            'label', 'Private only',
            'kind', 'user',
            'visibility', 'public',
            'review_status', 'approved'
          ),
          jsonb_build_object(
            'normalized_key', 'pending-only',
            'label', 'Pending only',
            'kind', 'user',
            'visibility', 'private',
            'review_status', 'pending'
          )
        ),
        '${OWNER_ACTIVE}',
        'user_reviewed'
      );
      reset role;
    `);
  });

  it("keeps the guard function under an exact no-login least-privilege owner", () => {
    expect(psql(`
      select pg_get_userbyid(proc.proowner)
      from pg_catalog.pg_proc as proc
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = proc.pronamespace
      where namespace.nspname = 'recipe_visibility_guard'
        and proc.proname = 'is_owner_publicly_visible';
    `)).toBe("homecook_recipe_visibility_guard_owner");

    expect(psql(`
      select concat_ws(
        ':',
        rolcanlogin,
        rolsuper,
        rolcreatedb,
        rolcreaterole,
        rolinherit,
        rolreplication,
        rolbypassrls
      )
      from pg_catalog.pg_roles
      where rolname = 'homecook_recipe_visibility_guard_owner';
    `)).toBe("f:f:f:f:f:f:f");

    const membershipMode =
      Number(psql("select current_setting('server_version_num');")) >= 160000
        ? "SET"
        : "MEMBER";
    expect(psql(`
      select concat_ws(
        ':',
        pg_has_role(
          'migration_runner',
          'homecook_recipe_visibility_guard_owner',
          '${membershipMode}'
        ),
        pg_has_role(
          'migration_runner',
          'homecook_recipe_visibility_guard_owner',
          'USAGE'
        ),
        has_schema_privilege(
          'homecook_recipe_visibility_guard_owner',
          'recipe_visibility_guard',
          'CREATE'
        )
      );
    `)).toBe("f:f:f");

    expect(psql(`
      select concat_ws(
        ':',
        has_table_privilege(
          'homecook_recipe_visibility_guard_owner',
          'public.user_account_lifecycles',
          'SELECT'
        ),
        has_table_privilege(
          'homecook_recipe_visibility_guard_owner',
          'public.user_account_lifecycles',
          'INSERT'
        ),
        has_function_privilege(
          'service_role',
          'recipe_visibility_guard.is_owner_publicly_visible(uuid)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.find_recipe_ids_by_public_tags(text,text)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.list_public_recipe_tags(text,text,boolean,integer)',
          'EXECUTE'
        ),
        has_function_privilege(
          'service_role',
          'public.list_home_theme_recipes(integer,integer)',
          'EXECUTE'
        )
      );
    `)).toBe("t:f:f:f:f:f");
  });

  it("applies latest-generation visibility to anon and owner detail reads", () => {
    expect(asRole("anon", `
      select string_agg(id::text, ',' order by id)
      from public.recipes;
    `)).toBe([
      RECIPE_SYSTEM,
      RECIPE_ACTIVE_PUBLIC,
      RECIPE_REACTIVATED,
    ].sort().join(","));

    expect(asRole("authenticated", `
      select string_agg(id::text, ',' order by id)
      from public.recipes;
    `, OWNER_ACTIVE)).toBe([
      RECIPE_SYSTEM,
      RECIPE_ACTIVE_PUBLIC,
      RECIPE_ACTIVE_PRIVATE,
      RECIPE_REACTIVATED,
    ].sort().join(","));

    expect(asRole("authenticated", `
      select count(*)::text
      from public.recipes
      where created_by = '${OWNER_QUARANTINED}';
    `, OWNER_QUARANTINED)).toBe("0");
  });

  it("keeps direct child and association reads bounded by the same parent", () => {
    for (const table of [
      "recipe_sources",
      "recipe_ingredients",
      "recipe_steps",
      "recipe_step_cooking_methods",
    ]) {
      expect(asRole("anon", `
        select count(*)::text from public.${table};
      `)).toBe("3");
    }

    expect(asRole("anon", `
      select count(*)::text from public.recipe_tags;
    `)).toBe("2");
    expect(asRole("anon", `
      select count(*)::text
      from public.tags
      where normalized_key = 'private-only';
    `)).toBe("0");
  });

  it("keeps hidden tag labels and raw usage counts out of public projections", () => {
    expect(psql(`
      select array_to_string(tags, ',')
      from public.recipes
      where id = '${RECIPE_ACTIVE_PRIVATE}';
    `)).toBe("Private only");

    const rawCountRead = asRoleResult("anon", `
      select usage_count::text
      from public.tags
      where normalized_key = 'visible';
    `);
    expect(rawCountRead.status).not.toBe(0);
    expect(rawCountRead.stderr).toMatch(/permission denied/i);
  });

  it("computes public tag search, count, and themes from live visible parents", () => {
    expect(asRole("anon", `
      select string_agg(recipe_id::text, ',' order by recipe_id)
      from public.find_recipe_ids_by_public_tags(null, 'visible');
    `)).toBe([
      RECIPE_ACTIVE_PUBLIC,
      RECIPE_REACTIVATED,
    ].sort().join(","));

    expect(asRole("anon", `
      select normalized_key || ':' || usage_count::text
      from public.list_public_recipe_tags(null, null, null, 30)
      where normalized_key = 'visible';
    `)).toBe("visible:2");

    expect(asRole("anon", `
      select string_agg(id::text, ',' order by id)
      from public.list_home_theme_recipes(8, 10);
    `)).toBe([
      RECIPE_ACTIVE_PUBLIC,
      RECIPE_REACTIVATED,
    ].sort().join(","));
  });

  it("fails replay closed when the guard owner has an unexpected member", () => {
    const setup = psqlResult(`
      create role recipe_visibility_unexpected_member login;
      grant homecook_recipe_visibility_guard_owner
        to recipe_visibility_unexpected_member;
    `);
    expect(setup.status, setup.stderr).toBe(0);

    try {
      const replay = psqlFileResult(MIGRATION_PATH);

      expect(replay.status).not.toBe(0);
      expect(replay.stderr).toContain(
        "recipe visibility guard owner has unexpected members",
      );
    } finally {
      const cleanup = psqlResult(`
        revoke homecook_recipe_visibility_guard_owner
          from recipe_visibility_unexpected_member;
        drop role recipe_visibility_unexpected_member;
      `);
      expect(cleanup.status, cleanup.stderr).toBe(0);
    }

    const replayAfterCleanup = psqlFileResult(MIGRATION_PATH);
    expect(replayAfterCleanup.status, replayAfterCleanup.stderr).toBe(0);
  });

  it("fails replay closed on PostgreSQL 16 when the guard owner has an admin-only member", () => {
    if (Number(psql("show server_version_num")) < 160000) {
      return;
    }

    const setup = psqlResult(`
      create role recipe_visibility_admin_only login;
      grant homecook_recipe_visibility_guard_owner
        to recipe_visibility_admin_only
        with inherit false, set false, admin true;
    `);
    expect(setup.status, setup.stderr).toBe(0);

    try {
      const replay = psqlFileResult(MIGRATION_PATH);

      expect(replay.status).not.toBe(0);
      expect(replay.stderr).toContain(
        "recipe visibility guard owner has unexpected members",
      );
    } finally {
      const cleanup = psqlResult(`
        revoke homecook_recipe_visibility_guard_owner
          from recipe_visibility_admin_only;
        drop role recipe_visibility_admin_only;
      `);
      expect(cleanup.status, cleanup.stderr).toBe(0);
    }

    const replayAfterCleanup = psqlFileResult(MIGRATION_PATH);
    expect(replayAfterCleanup.status, replayAfterCleanup.stderr).toBe(0);
  });
});
