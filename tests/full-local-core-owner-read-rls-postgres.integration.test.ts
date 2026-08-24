import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

const enabled =
  process.env.HOMECOOK_FULL_LOCAL_CORE_OWNER_READ_RLS_PG === "1"
  || Boolean(process.env.HOMECOOK_ISOLATED_RUNTIME_DATABASE_URL);
const isolatedProjectId =
  process.env.HOMECOOK_ISOLATED_RUNTIME_PROJECT_ID?.trim() ?? "homecook";
const postgresContainer = `supabase_db_${isolatedProjectId}`;

const ownerA = "f1000000-0000-4000-8000-000000000001";
const ownerB = "f1000000-0000-4000-8000-000000000002";
const identityA = "2026-08-24T00:00:00.000Z";
const identityB = "2026-08-24T00:01:00.000Z";
const columnA = "f1100000-0000-4000-8000-000000000001";
const columnB = "f1100000-0000-4000-8000-000000000002";
const recipeA = "f1200000-0000-4000-8000-000000000001";
const recipeB = "f1200000-0000-4000-8000-000000000002";
const recipeBookA = "f1300000-0000-4000-8000-000000000001";
const recipeBookB = "f1300000-0000-4000-8000-000000000002";
const recipeBookItemA = "f1400000-0000-4000-8000-000000000001";
const recipeBookItemB = "f1400000-0000-4000-8000-000000000002";
const mealA = "f1500000-0000-4000-8000-000000000001";
const mealB = "f1500000-0000-4000-8000-000000000002";
const sessionA = "f1600000-0000-4000-8000-000000000001";
const sessionB = "f1600000-0000-4000-8000-000000000002";
const sessionMealA = "f1700000-0000-4000-8000-000000000001";
const sessionMealB = "f1700000-0000-4000-8000-000000000002";

const TABLE_EXPECTATIONS = [
  {
    table: "users",
    ownerColumn: "id",
    ownerAId: ownerA,
    ownerBId: ownerB,
  },
  {
    table: "recipe_books",
    ownerColumn: "user_id",
    ownerAId: recipeBookA,
    ownerBId: recipeBookB,
  },
  {
    table: "recipe_book_items",
    ownerColumn: "id",
    ownerAId: recipeBookItemA,
    ownerBId: recipeBookItemB,
  },
  {
    table: "meal_plan_columns",
    ownerColumn: "user_id",
    ownerAId: columnA,
    ownerBId: columnB,
  },
  {
    table: "meals",
    ownerColumn: "user_id",
    ownerAId: mealA,
    ownerBId: mealB,
  },
  {
    table: "cooking_sessions",
    ownerColumn: "user_id",
    ownerAId: sessionA,
    ownerBId: sessionB,
  },
  {
    table: "cooking_session_meals",
    ownerColumn: "id",
    ownerAId: sessionMealA,
    ownerBId: sessionMealB,
  },
] as const;

function psql(sql: string, expectSuccess = true) {
  const result = spawnSync("docker", [
    "exec",
    "-i",
    postgresContainer,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-At",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    sql,
  ], { encoding: "utf8" });
  if (expectSuccess) {
    expect(result.status, result.stderr).toBe(0);
  }
  return result;
}

function lastMatchingLine(stdout: string, pattern: RegExp) {
  return stdout
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .findLast((line) => pattern.test(line)) ?? "";
}

function sqlStringArray(values: readonly string[]) {
  return `array[${values.map((value) => `'${value}'`).join(",")}]::text[]`;
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function authClaimStatements(
  owner: string,
  mode: "json" | "split" = "json",
) {
  if (mode === "split") {
    return `
      set local request.jwt.claim.role = 'authenticated';
      set local request.jwt.claim.sub = ${sqlLiteral(owner)};
    `;
  }

  const claims = JSON.stringify({ role: "authenticated", sub: owner });
  return `set local request.jwt.claims = ${sqlLiteral(claims)};`;
}

function visibleIds(
  table: string,
  owner: string,
  mode: "json" | "split" = "json",
) {
  const result = psql(`
    begin;
    set local role authenticated;
    ${authClaimStatements(owner, mode)}
    select coalesce(json_agg(id::text order by id::text), '[]'::json)::text
    from public.${table};
    rollback;
  `);
  return JSON.parse(
    lastMatchingLine(result.stdout, /^\[/u) || "[]",
  ) as string[];
}

function visibleCountForId(
  table: string,
  owner: string,
  rowId: string,
  mode: "json" | "split" = "json",
) {
  const result = psql(`
    begin;
    set local role authenticated;
    ${authClaimStatements(owner, mode)}
    select count(*)::text
    from public.${table}
    where id = ${sqlLiteral(rowId)};
    rollback;
  `);
  return Number(lastMatchingLine(result.stdout, /^\d+$/u) || "0");
}

describe.runIf(enabled)("full-local core owner-read RLS PostgreSQL", () => {
  beforeAll(() => {
    psql(`
      set session_replication_role = replica;

      insert into auth.users (id, created_at, email)
      values
        ('${ownerA}', '${identityA}', 'core-owner-a@example.invalid'),
        ('${ownerB}', '${identityB}', 'core-owner-b@example.invalid')
      on conflict (id) do nothing;

      insert into public.users (id, nickname, email, social_provider, social_id)
      values
        ('${ownerA}', 'core-owner-a', 'core-owner-a@example.invalid', 'google', 'core-owner-a'),
        ('${ownerB}', 'core-owner-b', 'core-owner-b@example.invalid', 'google', 'core-owner-b')
      on conflict (id) do nothing;

      insert into public.recipes (
        id,
        title,
        base_servings,
        source_type,
        created_by,
        visibility,
        revision
      ) values
        ('${recipeA}', 'owner a recipe', 2, 'manual', '${ownerA}', 'private', 1),
        ('${recipeB}', 'owner b recipe', 2, 'manual', '${ownerB}', 'private', 1)
      on conflict (id) do nothing;

      insert into public.meal_plan_columns (id, user_id, name, sort_order)
      values
        ('${columnA}', '${ownerA}', '아침', 1),
        ('${columnB}', '${ownerB}', '저녁', 1)
      on conflict (id) do nothing;

      insert into public.recipe_books (
        id,
        user_id,
        name,
        book_type,
        sort_order,
        cover_color_key
      ) values
        ('${recipeBookA}', '${ownerA}', 'A custom', 'custom', 1, 'sage'),
        ('${recipeBookB}', '${ownerB}', 'B custom', 'custom', 1, 'sky')
      on conflict (id) do nothing;

      insert into public.recipe_book_items (id, book_id, recipe_id)
      values
        ('${recipeBookItemA}', '${recipeBookA}', '${recipeA}'),
        ('${recipeBookItemB}', '${recipeBookB}', '${recipeB}')
      on conflict (id) do nothing;

      insert into public.meals (
        id,
        user_id,
        recipe_id,
        plan_date,
        column_id,
        planned_servings,
        status,
        revision
      ) values
        ('${mealA}', '${ownerA}', '${recipeA}', '2026-08-24', '${columnA}', 2, 'registered', 1),
        ('${mealB}', '${ownerB}', '${recipeB}', '2026-08-24', '${columnB}', 2, 'registered', 1)
      on conflict (id) do nothing;

      insert into public.cooking_sessions (
        id,
        user_id,
        status,
        contract_version
      ) values
        ('${sessionA}', '${ownerA}', 'in_progress', 'legacy_v1'),
        ('${sessionB}', '${ownerB}', 'in_progress', 'legacy_v1')
      on conflict (id) do nothing;

      insert into public.cooking_session_meals (
        id,
        session_id,
        meal_id,
        recipe_id,
        cooking_servings,
        is_cooked,
        meal_revision_snapshot
      ) values
        ('${sessionMealA}', '${sessionA}', '${mealA}', '${recipeA}', 2, false, 1),
        ('${sessionMealB}', '${sessionB}', '${mealB}', '${recipeB}', 2, false, 1)
      on conflict (id) do nothing;

      set session_replication_role = origin;
    `);
  });

  it("enables non-forced RLS on all seven owner-read tables", () => {
    const result = psql(`
      select json_object_agg(
        relname,
        json_build_object(
          'rls', relrowsecurity,
          'force_rls', relforcerowsecurity
        )
      )::text
      from pg_class
      where oid in (
        'public.users'::regclass,
        'public.recipe_books'::regclass,
        'public.recipe_book_items'::regclass,
        'public.meal_plan_columns'::regclass,
        'public.meals'::regclass,
        'public.cooking_sessions'::regclass,
        'public.cooking_session_meals'::regclass
      );
    `);
    expect(
      JSON.parse(result.stdout.trim().split("\n").at(-1) ?? "{}"),
    ).toEqual({
      cooking_session_meals: { force_rls: false, rls: true },
      cooking_sessions: { force_rls: false, rls: true },
      meal_plan_columns: { force_rls: false, rls: true },
      meals: { force_rls: false, rls: true },
      recipe_book_items: { force_rls: false, rls: true },
      recipe_books: { force_rls: false, rls: true },
      users: { force_rls: false, rls: true },
    });
  });

  it("grants authenticated SELECT only, keeps anon unreadable, and keeps authenticated writes revoked", () => {
    const result = psql(`
      with target_tables(table_name) as (
        values
          ('users'),
          ('recipe_books'),
          ('recipe_book_items'),
          ('meal_plan_columns'),
          ('meals'),
          ('cooking_sessions'),
          ('cooking_session_meals')
      )
      select json_agg(
        json_build_object(
          'table', table_name,
          'authenticated_select', has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT'),
          'authenticated_insert', has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT'),
          'authenticated_update', has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE'),
          'authenticated_delete', has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE'),
          'anon_select', has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
        )
        order by table_name
      )::text
      from target_tables;
    `);
    expect(
      JSON.parse(result.stdout.trim().split("\n").at(-1) ?? "[]"),
    ).toEqual([
      {
        anon_select: false,
        authenticated_delete: false,
        authenticated_insert: false,
        authenticated_select: true,
        authenticated_update: false,
        table: "cooking_session_meals",
      },
      {
        anon_select: false,
        authenticated_delete: false,
        authenticated_insert: false,
        authenticated_select: true,
        authenticated_update: false,
        table: "cooking_sessions",
      },
      {
        anon_select: false,
        authenticated_delete: false,
        authenticated_insert: false,
        authenticated_select: true,
        authenticated_update: false,
        table: "meal_plan_columns",
      },
      {
        anon_select: false,
        authenticated_delete: false,
        authenticated_insert: false,
        authenticated_select: true,
        authenticated_update: false,
        table: "meals",
      },
      {
        anon_select: false,
        authenticated_delete: false,
        authenticated_insert: false,
        authenticated_select: true,
        authenticated_update: false,
        table: "recipe_book_items",
      },
      {
        anon_select: false,
        authenticated_delete: false,
        authenticated_insert: false,
        authenticated_select: true,
        authenticated_update: false,
        table: "recipe_books",
      },
      {
        anon_select: false,
        authenticated_delete: false,
        authenticated_insert: false,
        authenticated_select: true,
        authenticated_update: false,
        table: "users",
      },
    ]);
  });

  it("lets each owner read only their direct and nested rows", () => {
    for (const { table, ownerAId, ownerBId } of TABLE_EXPECTATIONS) {
      expect(visibleIds(table, ownerA, "json")).toEqual([ownerAId]);
      expect(visibleIds(table, ownerB, "json")).toEqual([ownerBId]);
      expect(visibleCountForId(table, ownerA, ownerBId, "json")).toBe(0);
      expect(visibleCountForId(table, ownerB, ownerAId, "json")).toBe(0);
      expect(visibleIds(table, ownerA, "split")).toEqual([ownerAId]);
      expect(visibleIds(table, ownerB, "split")).toEqual([ownerBId]);
    }
  });

  it("creates the exact authenticated SELECT policies for each protected table", () => {
    const result = psql(`
      select json_agg(
        json_build_object(
          'table', tablename,
          'policy', policyname,
          'roles', roles,
          'command', cmd,
          'permissive', permissive
        )
        order by tablename, policyname
      )::text
      from pg_policies
      where schemaname = 'public'
        and policyname = any (${sqlStringArray([
          "users_select_own",
          "recipe_books_select_own",
          "recipe_book_items_select_owned_book",
          "meal_plan_columns_select_own",
          "meals_select_own",
          "cooking_sessions_select_own",
          "cooking_session_meals_select_owned_session",
        ])});
    `);

    expect(
      JSON.parse(result.stdout.trim().split("\n").at(-1) ?? "[]"),
    ).toEqual([
      {
        command: "SELECT",
        permissive: "PERMISSIVE",
        policy: "cooking_session_meals_select_owned_session",
        roles: ["authenticated"],
        table: "cooking_session_meals",
      },
      {
        command: "SELECT",
        permissive: "PERMISSIVE",
        policy: "cooking_sessions_select_own",
        roles: ["authenticated"],
        table: "cooking_sessions",
      },
      {
        command: "SELECT",
        permissive: "PERMISSIVE",
        policy: "meal_plan_columns_select_own",
        roles: ["authenticated"],
        table: "meal_plan_columns",
      },
      {
        command: "SELECT",
        permissive: "PERMISSIVE",
        policy: "meals_select_own",
        roles: ["authenticated"],
        table: "meals",
      },
      {
        command: "SELECT",
        permissive: "PERMISSIVE",
        policy: "recipe_book_items_select_owned_book",
        roles: ["authenticated"],
        table: "recipe_book_items",
      },
      {
        command: "SELECT",
        permissive: "PERMISSIVE",
        policy: "recipe_books_select_own",
        roles: ["authenticated"],
        table: "recipe_books",
      },
      {
        command: "SELECT",
        permissive: "PERMISSIVE",
        policy: "users_select_own",
        roles: ["authenticated"],
        table: "users",
      },
    ]);
  });
});
