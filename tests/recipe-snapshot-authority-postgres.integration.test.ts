import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

const enabled =
  process.env.HOMECOOK_RECIPE_SNAPSHOT_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_RECIPE_SNAPSHOT_PGHOST ?? "";
const port = process.env.HOMECOOK_RECIPE_SNAPSHOT_PGPORT ?? "";
const database = process.env.HOMECOOK_RECIPE_SNAPSHOT_PGDATABASE ?? "";
const databaseMode = process.env.HOMECOOK_RECIPE_SNAPSHOT_PGMODE ?? "";

const ownerA = "10000000-0000-4000-8000-000000000001";
const ownerB = "10000000-0000-4000-8000-000000000002";
const privateRecipe = "20000000-0000-4000-8000-000000000001";
const publicRecipe = "20000000-0000-4000-8000-000000000002";
const deletedRecipe = "20000000-0000-4000-8000-000000000003";
const privateRecipeB = "20000000-0000-4000-8000-000000000004";
const privateNutrition = "30000000-0000-4000-8000-000000000001";
const alternateNutrition = "30000000-0000-4000-8000-000000000002";
const publicNutrition = "30000000-0000-4000-8000-000000000003";
const privateNutritionB = "30000000-0000-4000-8000-000000000006";
const privateContent = "40000000-0000-4000-8000-000000000001";
const publicContent = "40000000-0000-4000-8000-000000000002";
const privateContentB = "40000000-0000-4000-8000-000000000003";
const legacyMeal = "50000000-0000-4000-8000-000000000001";
const newMeal = "50000000-0000-4000-8000-000000000002";
const plannerMeal = "50000000-0000-4000-8000-000000000003";
const foodProduct = "60000000-0000-4000-8000-000000000001";
const foodProductVersion = "61000000-0000-4000-8000-000000000001";
const nutritionProfile = "62000000-0000-4000-8000-000000000001";
const cookingMethod = "63000000-0000-4000-8000-000000000001";

function psqlResult(sql: string) {
  return spawnSync(
    "psql",
    [
      "-h",
      host,
      "-p",
      port,
      "-U",
      "postgres",
      "-d",
      database,
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    {
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" },
    },
  );
}

function psql(sql: string): string {
  const result = psqlResult(sql);
  expect(result.status, result.stderr).toBe(0);
  return result.stdout
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !/^(?:BEGIN|COMMIT|DELETE \d+|INSERT \d+ \d+|SELECT \d+|SET|UPDATE \d+)$/.test(
          line,
        ),
    )
    .at(-1) ?? "";
}

function expectSqlFailure(sql: string, pattern: RegExp) {
  const result = psqlResult(sql);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(pattern);
}

function nutritionInsertSql(options: {
  id: string;
  recipeId: string;
  inputHash: string;
  current?: boolean;
  ownerUserId?: string | null;
}) {
  const ownerSql =
    options.ownerUserId === undefined
      ? "null"
      : options.ownerUserId === null
        ? "null"
        : `'${options.ownerUserId}'::uuid`;
  return `
    insert into public.recipe_nutrition_snapshots (
      id,
      owner_user_id,
      recipe_id,
      base_servings,
      input_hash,
      calculation_version,
      scalable_values_json,
      fixed_values_json,
      nutrient_status_json,
      calculation_status,
      calculation_quality,
      reflected_ingredient_count,
      target_ingredient_count,
      missing_reasons,
      warnings_json,
      sources_json,
      is_current,
      calculated_at
    ) values (
      '${options.id}',
      ${ownerSql},
      '${options.recipeId}',
      2,
      '${options.inputHash}',
      'recipe-nutrition-v1',
      '{"energy_kcal":100}'::jsonb,
      '{"energy_kcal":5}'::jsonb,
      '{"energy_kcal":{"status":"complete","amount":105}}'::jsonb,
      'complete',
      'direct',
      1,
      1,
      '{}',
      '[]',
      '[{"provider":"fixture"}]',
      ${options.current ?? true},
      now()
    );
  `;
}

function contentInsertSql(options: {
  id?: string;
  ownerUserId: string | null;
  recipeId: string;
  nutritionId: string | null;
  contentHash: string;
}) {
  return `
    insert into public.recipe_content_snapshots (
      ${options.id ? "id," : ""}
      owner_user_id,
      recipe_id,
      recipe_nutrition_snapshot_id,
      title,
      base_servings,
      ingredients_json,
      steps_json,
      content_hash,
      schema_version
    ) values (
      ${options.id ? `'${options.id}',` : ""}
      ${options.ownerUserId ? `'${options.ownerUserId}'` : "null"},
      '${options.recipeId}',
      ${options.nutritionId ? `'${options.nutritionId}'` : "null"},
      '고정된 레시피',
      2,
      '[{"ingredient_id":"fixture","amount":100,"unit":"g"}]',
      '[{"step_number":1,"instruction":"조리"}]',
      '${options.contentHash}',
      1
    )
    returning id;
  `;
}

describe.skipIf(!enabled)("recipe snapshot authority PostgreSQL", () => {
  beforeAll(() => {
    psql(`
      insert into public.users (id, nickname, social_provider, social_id)
      values
        ('${ownerA}', 'owner-a', 'test', 'owner-a'),
        ('${ownerB}', 'owner-b', 'test', 'owner-b');

      insert into public.recipes (
        id, title, base_servings, created_by, visibility, deleted_at
      ) values
        ('${privateRecipe}', '개인 레시피', 2, '${ownerA}', 'private', null),
        ('${publicRecipe}', '공용 레시피', 2, null, 'public', null),
        ('${deletedRecipe}', '삭제 레시피', 2, '${ownerA}', 'private', now()),
        ('${privateRecipeB}', '다른 사용자 레시피', 2, '${ownerB}', 'private', null);

      insert into public.recipe_ingredients (
        recipe_id, ingredient_id, amount, unit, ingredient_type,
        display_text, sort_order, scalable
      ) values
        ('${privateRecipe}', '90000000-0000-4000-8000-000000000001',
         100, 'g', 'QUANT', '재료 100g', 0, true),
        ('${publicRecipe}', '90000000-0000-4000-8000-000000000001',
         200, 'g', 'QUANT', '재료 200g', 0, true);

      insert into public.recipe_steps (
        recipe_id, step_number, instruction, ingredients_used
      ) values
        ('${privateRecipe}', 1, '개인 조리', '[]'),
        ('${publicRecipe}', 1, '공용 조리', '[]');

      insert into public.nutrition_profiles (id, created_by)
      values ('${nutritionProfile}', '${ownerA}');

      insert into public.food_products (
        id, owner_user_id, visibility, source_type,
        current_nutrition_version_id, name, brand
      ) values (
        '${foodProduct}', '${ownerA}', 'private', 'manual',
        null, '고정 상품', '고정 브랜드'
      );

      insert into public.food_product_nutrition_versions (
        id, product_id, nutrition_profile_id, created_by
      ) values (
        '${foodProductVersion}', '${foodProduct}', '${nutritionProfile}', '${ownerA}'
      );

      update public.food_products
      set current_nutrition_version_id = '${foodProductVersion}'
      where id = '${foodProduct}';

      update public.recipe_ingredients
      set component_label = '고정 재료',
          food_product_id = '${foodProduct}',
          food_product_nutrition_version_id = '${foodProductVersion}'
      where recipe_id = '${privateRecipe}';

      insert into public.cooking_methods (
        id, code, label, color_key, category_code
      ) values (
        '${cookingMethod}', 'boil', '끓이기', 'red', 'wet_heat'
      );

      update public.recipe_steps
      set component_label = '고정 단계',
          cooking_method_id = '${cookingMethod}',
          heat_level = '중불',
          duration_seconds = 600,
          duration_text = '10분'
      where recipe_id = '${privateRecipe}';

      insert into public.recipe_step_cooking_methods (
        step_id, method_id, position
      )
      select id, '${cookingMethod}', 1
      from public.recipe_steps
      where recipe_id = '${privateRecipe}';
    `);

    psql(
      nutritionInsertSql({
        id: privateNutrition,
        recipeId: privateRecipe,
        inputHash: "a".repeat(64),
      }),
    );
    psql(
      nutritionInsertSql({
        id: alternateNutrition,
        recipeId: privateRecipe,
        inputHash: "b".repeat(64),
        current: false,
      }),
    );
    psql(
      nutritionInsertSql({
        id: publicNutrition,
        recipeId: publicRecipe,
        inputHash: "c".repeat(64),
      }),
    );
    psql(
      nutritionInsertSql({
        id: privateNutritionB,
        recipeId: privateRecipeB,
        inputHash: "f".repeat(64),
      }),
    );
  });

  it.skipIf(databaseMode !== "replay")(
    "upgrades preexisting private and soft-deleted nutrition ownership without losing history",
    () => {
      expect(
        JSON.parse(psql(`
          select jsonb_build_object(
            'active_owner', (
              select owner_user_id
              from public.recipe_nutrition_snapshots
              where id = '31000000-0000-4000-8000-000000000001'
            ),
            'deleted_owner', (
              select owner_user_id
              from public.recipe_nutrition_snapshots
              where id = '31000000-0000-4000-8000-000000000002'
            ),
            'history_count', (
              select count(*)
              from public.recipe_nutrition_snapshots
              where id in (
                '31000000-0000-4000-8000-000000000001',
                '31000000-0000-4000-8000-000000000002'
              )
            )
          )::text;
        `)),
      ).toEqual({
          active_owner: "11000000-0000-4000-8000-000000000001",
          deleted_owner: "11000000-0000-4000-8000-000000000001",
          history_count: 2,
        });
    },
  );

  it("builds immutable product provenance and visible cooking metadata", () => {
    expect(
      JSON.parse(psql(`
        select jsonb_build_object(
          'ingredient', input.ingredients_json -> 0,
          'step', input.steps_json -> 0
        )::text
        from public.build_recipe_content_snapshot_input('${privateRecipe}') as input;
      `)),
    ).toMatchObject({
      ingredient: {
        component_label: "고정 재료",
        food_product_id: foodProduct,
        food_product_nutrition_version_id: foodProductVersion,
        food_product_name: "고정 상품",
        food_product_brand: "고정 브랜드",
      },
      step: {
        component_label: "고정 단계",
        heat_level: "중불",
        duration_seconds: 600,
        duration_text: "10분",
        cooking_methods: [
          {
            code: "boil",
            label: "끓이기",
            color_key: "red",
            category_code: "wet_heat",
          },
        ],
      },
    });
  });

  it("executes the remote inventory SQL and reports exact target-owned drift zero", async () => {
    const verifier = await import(
      "../scripts/lib/recipe-snapshot-authority-remote-verifier.mjs"
    );
    const plan = verifier.buildRecipeSnapshotAuthorityRemoteVerificationPlan({
      mode: "post-merge-read-only",
    });
    const result = JSON.parse(psql(plan.sql));

    expect(
      () =>
        verifier.assertRecipeSnapshotAuthorityRemoteVerificationResult(result),
      JSON.stringify(result),
    ).not.toThrow();
  });

  it("rejects remote inventory evidence when a target-owned function drifts", async () => {
    const verifier = await import(
      "../scripts/lib/recipe-snapshot-authority-remote-verifier.mjs"
    );
    const plan = verifier.buildRecipeSnapshotAuthorityRemoteVerificationPlan({
      mode: "post-merge-read-only",
    });
    const result = psqlResult(`
      begin;
      alter function public.protect_recipe_nutrition_snapshot()
        set search_path = pg_catalog, public;
      ${plan.sql};
      rollback;
    `);
    expect(result.status, result.stderr).toBe(0);
    const inventory = JSON.parse(
      result.stdout
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.startsWith("{")) ?? "{}",
    );

    expect(inventory.function_search_path_drift_count).toBeGreaterThan(0);
    expect(() =>
      verifier.assertRecipeSnapshotAuthorityRemoteVerificationResult(inventory),
    ).toThrow(/remote recipe snapshot authority verification failed/i);
  });

  it("rejects remote inventory evidence when a target-owned function overload is added", async () => {
    const verifier = await import(
      "../scripts/lib/recipe-snapshot-authority-remote-verifier.mjs"
    );
    const plan = verifier.buildRecipeSnapshotAuthorityRemoteVerificationPlan({
      mode: "post-merge-read-only",
    });
    const result = psqlResult(`
      begin;
      create function public.protect_recipe_nutrition_snapshot(integer)
      returns integer
      language sql
      as 'select $1';
      ${plan.sql};
      rollback;
    `);
    expect(result.status, result.stderr).toBe(0);
    const inventory = JSON.parse(
      result.stdout
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.startsWith("{")) ?? "{}",
    );

    expect(inventory.unexpected_function_count).toBe(1);
    expect(inventory.function_drift_count).toBeGreaterThan(0);
    expect(() =>
      verifier.assertRecipeSnapshotAuthorityRemoteVerificationResult(inventory),
    ).toThrow(/remote recipe snapshot authority verification failed/i);
  });

  it("preserves the existing nutrition FK, unique indexes, and writer conflict target", () => {
    expect(
      psql(`
        select attnotnull::text
        from pg_attribute
        where attrelid = 'public.recipe_nutrition_snapshots'::regclass
          and attname = 'recipe_id';
      `),
    ).toBe("true");
    expect(
      psql(`
        select confdeltype
        from pg_constraint
        where conrelid = 'public.recipe_nutrition_snapshots'::regclass
          and contype = 'f';
      `),
    ).toBe("r");
    const indexes = psql(`
      select string_agg(indexdef, E'\\n' order by indexname)
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'recipe_nutrition_snapshots';
    `);
    expect(indexes).toMatch(
      /UNIQUE INDEX [^\n]+ \(recipe_id, input_hash, calculation_version\)/i,
    );
    expect(indexes).toMatch(
      /UNIQUE \(recipe_id\) WHERE is_current/i,
    );
    expect(
      psql(`
        select pg_get_functiondef(
          'public.write_recipe_nutrition_snapshot(uuid,jsonb,timestamptz,jsonb)'::regprocedure
        );
      `),
    ).toMatch(
      /on conflict\s*\(\s*recipe_id,\s*input_hash,\s*calculation_version\s*\)/i,
    );
  });

  it("keeps snapshot functions and claim DML on an exact internal ACL", () => {
    expect(
      JSON.parse(psql(`
        select jsonb_build_object(
          'anon_backfill', has_function_privilege(
            'anon',
            'public.backfill_meal_recipe_content_snapshots()',
            'EXECUTE'
          ),
          'authenticated_backfill', has_function_privilege(
            'authenticated',
            'public.backfill_meal_recipe_content_snapshots()',
            'EXECUTE'
          ),
          'service_backfill', has_function_privilege(
            'service_role',
            'public.backfill_meal_recipe_content_snapshots()',
            'EXECUTE'
          ),
          'anon_cleanup_guard', has_function_privilege(
            'anon',
            'public.recipe_snapshot_account_cleanup_guard(uuid)',
            'EXECUTE'
          ),
          'service_cleanup_guard', has_function_privilege(
            'service_role',
            'public.recipe_snapshot_account_cleanup_guard(uuid)',
            'EXECUTE'
          ),
          'service_claim_insert', has_table_privilege(
            'service_role',
            'public.cooking_session_meal_claims',
            'INSERT'
          ),
          'service_claim_update', has_table_privilege(
            'service_role',
            'public.cooking_session_meal_claims',
            'UPDATE'
          ),
          'service_claim_delete', has_table_privilege(
            'service_role',
            'public.cooking_session_meal_claims',
            'DELETE'
          )
        )::text;
      `)),
    ).toEqual({
        anon_backfill: false,
        authenticated_backfill: false,
        service_backfill: true,
        anon_cleanup_guard: false,
        service_cleanup_guard: true,
        service_claim_insert: false,
        service_claim_update: false,
        service_claim_delete: false,
      });
    expect(
      psql(`
        select array_to_json(proconfig)::text
        from pg_proc
        where oid = 'public.delete_user_private_data(uuid)'::regprocedure;
      `),
    ).toContain("search_path=pg_catalog, public, pg_temp");
  });

  it("derives private nutrition ownership and rejects public/deleted mismatches", () => {
    expect(
      psql(`
        select owner_user_id
        from public.recipe_nutrition_snapshots
        where id = '${privateNutrition}';
      `),
    ).toBe(ownerA);
    expect(
      psql(`
        select owner_user_id is null
        from public.recipe_nutrition_snapshots
        where id = '${publicNutrition}';
      `),
    ).toBe("t");

    expectSqlFailure(
      nutritionInsertSql({
        id: "30000000-0000-4000-8000-000000000004",
        recipeId: publicRecipe,
        inputHash: "d".repeat(64),
        current: false,
        ownerUserId: ownerA,
      }),
      /owner|public|23514/i,
    );
    expectSqlFailure(
      nutritionInsertSql({
        id: "30000000-0000-4000-8000-000000000005",
        recipeId: deletedRecipe,
        inputHash: "e".repeat(64),
      }),
      /deleted|23514/i,
    );
  });

  it("enforces private/public content ownership, exact nutrition pairing, and dedupe", () => {
    expect(
      psql(
        contentInsertSql({
          id: privateContent,
          ownerUserId: ownerA,
          recipeId: privateRecipe,
          nutritionId: privateNutrition,
          contentHash: "private-content-v1",
        }),
      ),
    ).toBe(privateContent);
    expect(
      psql(
        contentInsertSql({
          id: publicContent,
          ownerUserId: null,
          recipeId: publicRecipe,
          nutritionId: publicNutrition,
          contentHash: "public-content-v1",
        }),
      ),
    ).toBe(publicContent);

    expectSqlFailure(
      contentInsertSql({
        ownerUserId: null,
        recipeId: privateRecipe,
        nutritionId: privateNutrition,
        contentHash: "bad-private-owner",
      }),
      /owner|private|23514/i,
    );
    expectSqlFailure(
      contentInsertSql({
        ownerUserId: ownerA,
        recipeId: publicRecipe,
        nutritionId: publicNutrition,
        contentHash: "bad-public-owner",
      }),
      /owner|public|23514/i,
    );
    expectSqlFailure(
      contentInsertSql({
        ownerUserId: ownerA,
        recipeId: privateRecipe,
        nutritionId: publicNutrition,
        contentHash: "bad-recipe-pair",
      }),
      /recipe|ownership|mismatch|23514/i,
    );
    expectSqlFailure(
      contentInsertSql({
        ownerUserId: ownerA,
        recipeId: privateRecipe,
        nutritionId: privateNutrition,
        contentHash: "private-content-v1",
      }),
      /duplicate key|unique/i,
    );
    expect(
      psql(
        contentInsertSql({
          ownerUserId: ownerA,
          recipeId: privateRecipe,
          nutritionId: alternateNutrition,
          contentHash: "private-content-v1",
        }),
      ),
    ).not.toBe(privateContent);
    expect(
      psql(
        contentInsertSql({
          id: privateContentB,
          ownerUserId: ownerB,
          recipeId: privateRecipeB,
          nutritionId: privateNutritionB,
          contentHash: "private-content-owner-b",
        }),
      ),
    ).toBe(privateContentB);
  });

  it("lets an authenticated consumer read shared and own exact snapshot pairs without cross-owner access", () => {
    expect(
      JSON.parse(psql(`
        set role authenticated;
        set request.jwt.claim.sub = '${ownerA}';
        select jsonb_build_object(
          'content_ids', (
            select jsonb_agg(id order by id)
            from public.recipe_content_snapshots
            where id in ('${privateContent}', '${publicContent}', '${privateContentB}')
          ),
          'nutrition_ids', (
            select jsonb_agg(id order by id)
            from public.recipe_nutrition_snapshots
            where id in ('${privateNutrition}', '${publicNutrition}', '${privateNutritionB}')
          ),
          'exact_pair_count', (
            select count(*)
            from public.recipe_content_snapshots as content
            join public.recipe_nutrition_snapshots as nutrition
              on nutrition.id = content.recipe_nutrition_snapshot_id
            where content.id in ('${privateContent}', '${publicContent}', '${privateContentB}')
          ),
          'cross_owner_content_count', (
            select count(*)
            from public.recipe_content_snapshots
            where id = '${privateContentB}'
          ),
          'cross_owner_nutrition_count', (
            select count(*)
            from public.recipe_nutrition_snapshots
            where id = '${privateNutritionB}'
          )
        )::text;
      `)),
    ).toEqual({
      content_ids: [privateContent, publicContent],
      nutrition_ids: [privateNutrition, publicNutrition],
      exact_pair_count: 2,
      cross_owner_content_count: 0,
      cross_owner_nutrition_count: 0,
    });

    expect(
      JSON.parse(psql(`
        select jsonb_build_object(
          'content_select', has_table_privilege(
            'authenticated', 'public.recipe_content_snapshots', 'SELECT'
          ),
          'content_insert', has_table_privilege(
            'authenticated', 'public.recipe_content_snapshots', 'INSERT'
          ),
          'content_update', has_table_privilege(
            'authenticated', 'public.recipe_content_snapshots', 'UPDATE'
          ),
          'content_delete', has_table_privilege(
            'authenticated', 'public.recipe_content_snapshots', 'DELETE'
          ),
          'nutrition_select', has_table_privilege(
            'authenticated', 'public.recipe_nutrition_snapshots', 'SELECT'
          ),
          'nutrition_insert', has_table_privilege(
            'authenticated', 'public.recipe_nutrition_snapshots', 'INSERT'
          ),
          'nutrition_update', has_table_privilege(
            'authenticated', 'public.recipe_nutrition_snapshots', 'UPDATE'
          ),
          'nutrition_delete', has_table_privilege(
            'authenticated', 'public.recipe_nutrition_snapshots', 'DELETE'
          )
        )::text;
      `)),
    ).toEqual({
      content_select: true,
      content_insert: false,
      content_update: false,
      content_delete: false,
      nutrition_select: true,
      nutrition_insert: false,
      nutrition_update: false,
      nutrition_delete: false,
    });

    expectSqlFailure(
      "set role anon; select * from public.recipe_content_snapshots;",
      /permission denied|42501/i,
    );
    expectSqlFailure(
      "set role anon; select * from public.recipe_nutrition_snapshots;",
      /permission denied|42501/i,
    );
    expectSqlFailure(
      `
        set role authenticated;
        set request.jwt.claim.sub = '${ownerA}';
        update public.recipe_content_snapshots
        set title = 'cross-owner mutation'
        where id = '${privateContentB}';
      `,
      /permission denied|42501/i,
    );
    expectSqlFailure(
      `
        set role authenticated;
        set request.jwt.claim.sub = '${ownerA}';
        delete from public.recipe_nutrition_snapshots
        where id = '${privateNutritionB}';
      `,
      /permission denied|42501/i,
    );
    expect(
      psql(`
        select count(*)
        from public.recipe_content_snapshots
        where id = '${privateContentB}';
      `),
    ).toBe("1");
    expect(
      psql(`
        select count(*)
        from public.recipe_nutrition_snapshots
        where id = '${privateNutritionB}';
      `),
    ).toBe("1");
  });

  it("denies ordinary snapshot mutation and permits only exact-owner cleanup delete", () => {
    expectSqlFailure(
      `update public.recipe_content_snapshots set title = '변조' where id = '${privateContent}';`,
      /immutable|42501/i,
    );
    expectSqlFailure(
      `delete from public.recipe_content_snapshots where id = '${privateContent}';`,
      /immutable|42501/i,
    );
    expectSqlFailure(
      `
        begin;
        select set_config(
          'homecook.recipe_snapshot_account_cleanup_owner',
          '${ownerB}',
          true
        );
        delete from public.recipe_content_snapshots
        where id = '${privateContent}';
        commit;
      `,
      /immutable|42501/i,
    );
    expectSqlFailure(
      `
        begin;
        select set_config(
          'homecook.recipe_snapshot_account_cleanup_owner',
          '${ownerA}',
          true
        );
        delete from public.recipe_content_snapshots
        where id = '${publicContent}';
        commit;
      `,
      /immutable|42501/i,
    );
  });

  it("backfills eligible legacy Meals idempotently without changing direct N", () => {
    psql(`
      set session_replication_role = replica;
      insert into public.meals (
        id, user_id, recipe_id, plan_date, planned_servings, status,
        recipe_nutrition_snapshot_id, nutrition_snapshot_origin
      ) values (
        '${legacyMeal}', '${ownerA}', '${privateRecipe}', current_date, 2,
        'registered', '${privateNutrition}', 'backfill'
      );
      set session_replication_role = origin;
    `);

    const before = psql(`
      select recipe_nutrition_snapshot_id
      from public.meals
      where id = '${legacyMeal}';
    `);
    psql("select public.backfill_meal_recipe_content_snapshots();");
    const first = JSON.parse(
      psql(`
        select jsonb_build_object(
          'content', recipe_content_snapshot_id,
          'origin', recipe_content_snapshot_origin,
          'nutrition', recipe_nutrition_snapshot_id
        )::text
        from public.meals
        where id = '${legacyMeal}';
      `),
    ) as { content: string; origin: string; nutrition: string };
    psql("select public.backfill_meal_recipe_content_snapshots();");
    const secondContent = psql(`
      select recipe_content_snapshot_id
      from public.meals
      where id = '${legacyMeal}';
    `);

    expect(first.content).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.origin).toBe("legacy_backfill");
    expect(first.nutrition).toBe(before);
    expect(secondContent).toBe(first.content);
  });

  it("derives new Meal content/direct pins and rejects later client mismatch", () => {
    psql(`
      insert into public.meals (
        id, user_id, recipe_id, plan_date, planned_servings, status
      ) values (
        '${newMeal}', '${ownerA}', '${privateRecipe}', current_date, 2,
        'registered'
      );
    `);
    const pins = JSON.parse(
      psql(`
        select jsonb_build_object(
          'content', recipe_content_snapshot_id,
          'content_origin', recipe_content_snapshot_origin,
          'nutrition', recipe_nutrition_snapshot_id
        )::text
        from public.meals
        where id = '${newMeal}';
      `),
    ) as { content: string; content_origin: string; nutrition: string };
    expect(pins.content).toMatch(/^[0-9a-f-]{36}$/);
    expect(pins.content_origin).toBe("created");
    expect(pins.nutrition).toBe(privateNutrition);

    expectSqlFailure(
      `
        update public.meals
        set recipe_nutrition_snapshot_id = '${alternateNutrition}'
        where id = '${newMeal}';
      `,
      /immutable|mismatch|client|23514/i,
    );

    expect(
      psql(`
        select revision
        from public.meals
        where id = '${newMeal}';
      `),
    ).toBe("1");
    psql(`
      update public.meals
      set status = 'shopping_done'
      where id = '${newMeal}';
    `);
    expect(
      psql(`
        select revision
        from public.meals
        where id = '${newMeal}';
      `),
    ).toBe("2");
    expectSqlFailure(
      `
        update public.meals
        set revision = 20
        where id = '${newMeal}';
      `,
      /revision|immutable|server|42501/i,
    );
  });

  it("enforces snapshot-v2 planner/standalone association shape and immutable pins", () => {
    const standaloneSession = "60000000-0000-4000-8000-000000000001";
    const plannerSession = "60000000-0000-4000-8000-000000000002";

    expectSqlFailure(
      `
        insert into public.cooking_sessions (
          id, user_id, contract_version, session_kind, recipe_id,
          recipe_content_snapshot_id, cooking_servings
        ) values (
          '${standaloneSession}', '${ownerA}', 'snapshot_v2', 'standalone',
          '${privateRecipe}', '${privateContent}', 2
        );
      `,
      /check constraint|base_recipe_revision/i,
    );

    psql(`
      insert into public.cooking_sessions (
        id, user_id, contract_version, session_kind, recipe_id,
        recipe_content_snapshot_id, cooking_servings, base_recipe_revision
      ) values (
        '${standaloneSession}', '${ownerA}', 'snapshot_v2', 'standalone',
        '${privateRecipe}', '${privateContent}', 2, 1
      );
    `);
    expectSqlFailure(
      `
        update public.cooking_sessions
        set cooking_servings = 3
        where id = '${standaloneSession}';
      `,
      /immutable|42501/i,
    );
    expectSqlFailure(
      `
        begin;
        insert into public.cooking_session_meals (
          session_id, meal_id, recipe_id, cooking_servings,
          meal_revision_snapshot
        ) values (
          '${standaloneSession}', '${newMeal}', '${privateRecipe}', 2, 1
        );
        commit;
      `,
      /standalone|session-meal|23514/i,
    );

    psql(`
      insert into public.meals (
        id, user_id, recipe_id, plan_date, planned_servings, status
      ) values (
        '${plannerMeal}', '${ownerA}', '${privateRecipe}', current_date, 2,
        'registered'
      );

      begin;
      set constraints all deferred;
      insert into public.cooking_sessions (
        id, user_id, contract_version, session_kind, recipe_id,
        recipe_content_snapshot_id, cooking_servings, base_recipe_revision
      )
      select
        '${plannerSession}', '${ownerA}', 'snapshot_v2', 'planner',
        recipe_id, recipe_content_snapshot_id, planned_servings, null
      from public.meals
      where id = '${plannerMeal}';
      insert into public.cooking_session_meals (
        session_id, meal_id, recipe_id, cooking_servings,
        meal_revision_snapshot
      )
      select
        '${plannerSession}', id, recipe_id, planned_servings, revision
      from public.meals
      where id = '${plannerMeal}';
      commit;
    `);
    expect(
      psql(`
        select count(*)
        from public.cooking_session_meals
        where session_id = '${plannerSession}';
      `),
    ).toBe("1");
  });

  it("allows one active claim per Meal and validates session/owner provenance", () => {
    const plannerSession = "60000000-0000-4000-8000-000000000002";
    psql(`
      insert into public.cooking_session_meal_claims (
        meal_id, session_id, owner_user_id
      ) values (
        '${plannerMeal}', '${plannerSession}', '${ownerA}'
      );
    `);
    expectSqlFailure(
      `
        insert into public.cooking_session_meal_claims (
          meal_id, session_id, owner_user_id
        ) values (
          '${plannerMeal}', '${plannerSession}', '${ownerA}'
        );
      `,
      /duplicate key|primary key/i,
    );
    expectSqlFailure(
      `
        insert into public.cooking_session_meal_claims (
          meal_id, session_id, owner_user_id
        ) values (
          '${newMeal}',
          '60000000-0000-4000-8000-000000000001',
          '${ownerB}'
        );
      `,
      /owner|session|meal|23514/i,
    );
  });

  it("deletes private dependencies in account cleanup while preserving shared snapshots", () => {
    const publicContentCountBefore = psql(`
      select count(*)
      from public.recipe_content_snapshots
      where id = '${publicContent}';
    `);
    psql(`select public.delete_user_private_data('${ownerA}');`);

    expect(
      psql(`
        select count(*)
        from public.recipe_content_snapshots
        where owner_user_id = '${ownerA}';
      `),
    ).toBe("0");
    expect(
      psql(`
        select count(*)
        from public.recipe_nutrition_snapshots
        where owner_user_id = '${ownerA}';
      `),
    ).toBe("0");
    expect(
      psql(`
        select count(*)
        from public.recipe_content_snapshots
        where id = '${publicContent}';
      `),
    ).toBe(publicContentCountBefore);
    expect(
      psql(`
        select count(*)
        from public.recipe_nutrition_snapshots
        where id = '${publicNutrition}';
      `),
    ).toBe("1");
  });
});
