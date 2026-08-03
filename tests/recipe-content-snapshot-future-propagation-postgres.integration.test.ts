import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";
import { aggregateShoppingIngredients } from "@/lib/server/shopping";

const enabled =
  process.env.HOMECOOK_RECIPE_CONTENT_SNAPSHOT_FUTURE_PROPAGATION_PG_INTEGRATION ===
    "1" || process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PG_INTEGRATION === "1";
const host =
  process.env.HOMECOOK_RECIPE_CONTENT_SNAPSHOT_FUTURE_PROPAGATION_PGHOST ??
  process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PGHOST ??
  "";
const port =
  process.env.HOMECOOK_RECIPE_CONTENT_SNAPSHOT_FUTURE_PROPAGATION_PGPORT ??
  process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PGPORT ??
  "";
const database =
  process.env.HOMECOOK_RECIPE_CONTENT_SNAPSHOT_FUTURE_PROPAGATION_PGDATABASE ??
  process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PGDATABASE ??
  "";
const databaseMode =
  process.env.HOMECOOK_RECIPE_CONTENT_SNAPSHOT_FUTURE_PROPAGATION_PGMODE ??
  process.env.HOMECOOK_PERSONAL_RECIPE_WRITE_PGMODE ??
  "";

const owner = "91000000-0000-4000-8000-000000000001";
const identityEpoch = "2026-08-02T00:00:00Z";
const sessionKeyHash = "9a".repeat(32);
const sessionIssuedAt = "2026-08-02T00:30:00Z";
const hiddenOwner = "91000000-0000-4000-8000-000000000003";
const hiddenIdentityEpoch = "2026-08-02T00:05:00Z";
const hiddenSessionKeyHash = "8b".repeat(32);
const hiddenSessionIssuedAt = "2026-08-02T00:35:00Z";
const localIssuer = "https://auth.homecook.test/auth/v1";
const cutoverAttempt = "91000000-0000-4000-8000-000000000002";
const genericIngredient = "92000000-0000-4000-8000-000000000001";
const productIngredient = "92000000-0000-4000-8000-000000000002";
const cookingMethod = "92000000-0000-4000-8000-000000000003";
const foodProduct = "92000000-0000-4000-8000-000000000004";
const foodProductVersion = "92000000-0000-4000-8000-000000000005";
const nutritionProfile = "92000000-0000-4000-8000-000000000006";
const secondGenericIngredient = "92000000-0000-4000-8000-000000000007";
const plannerColumn = "97000000-0000-4000-8000-000000000001";
const eligibleMeal = "93000000-0000-4000-8000-000000000001";
const secondEligibleMeal = "93000000-0000-4000-8000-000000000002";
const pastMeal = "93000000-0000-4000-8000-000000000003";
const cookedMeal = "93000000-0000-4000-8000-000000000004";
const cancelMeal = "93000000-0000-4000-8000-000000000005";
const concurrentMeal = "93000000-0000-4000-8000-000000000006";
const replayMeal = "93000000-0000-4000-8000-000000000007";
const multiRecipeMealA = "93000000-0000-4000-8000-000000000008";
const multiRecipeMealB = "93000000-0000-4000-8000-000000000009";
const multiRecipeMealC = "93000000-0000-4000-8000-000000000010";
const multiRecipeMealD = "93000000-0000-4000-8000-000000000011";
const incompleteShopping = "94000000-0000-4000-8000-000000000001";
const completedShopping = "94000000-0000-4000-8000-000000000002";
const genericPantry = "95000000-0000-4000-8000-000000000001";
const productPantry = "95000000-0000-4000-8000-000000000002";

interface ShoppingConcurrencyIngredientRow {
  ingredient_id: string | null;
  food_product_id: string | null;
  food_product_nutrition_version_id: string | null;
  ingredient_type: "QUANT" | "TO_TASTE";
  amount: number | null;
  unit: string | null;
  display_text: string | null;
}

interface ShoppingConcurrencyMealRow {
  meal_id: string;
  recipe_id: string;
  recipe_content_snapshot_id: string | null;
  planned_servings: number;
  base_servings: number;
  ingredients_json: ShoppingConcurrencyIngredientRow[];
}

let recipeId = "";
let initialContentId = "";
let secondRecipeId = "";
let hiddenPublicRecipeId = "";

function migrationPath() {
  const name = readdirSync(join(process.cwd(), "supabase/migrations"))
    .filter((candidate) =>
      candidate.endsWith("_recipe_content_snapshot_future_propagation.sql"),
    )
    .sort()
    .at(-1);
  expect(name, "recipe content snapshot future propagation migration is missing").toBeTruthy();
  return join(process.cwd(), "supabase/migrations", name!);
}

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

function psql(sql: string) {
  const result = psqlResult(sql);
  expect(result.status, result.stderr).toBe(0);
  return (
    result.stdout
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
      .at(-1) ?? ""
  );
}

function extractPsqlJson(stdout: string) {
  return JSON.parse(
    stdout
      .trim()
      .split("\n")
      .map((line) => line.trim())
      .filter(
        (line) =>
          line.length > 0
          && !/^(?:BEGIN|COMMIT|DELETE \d+|INSERT \d+ \d+|SELECT \d+|SET|UPDATE \d+)$/.test(
            line,
          ),
      )
      .at(-1) ?? "null",
  );
}

function jsonSql(value: unknown) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function shoppingConcurrencyPayload(mealIds: string[]) {
  const meals = JSON.parse(psql(`
    select jsonb_agg(jsonb_build_object(
      'meal_id', meal.id,
      'recipe_id', meal.recipe_id,
      'recipe_content_snapshot_id', meal.recipe_content_snapshot_id,
      'planned_servings', meal.planned_servings,
      'base_servings', snapshot.base_servings,
      'ingredients_json', snapshot.ingredients_json
    ) order by meal.id::text collate "C")::text
    from public.meals as meal
    join public.recipe_content_snapshots as snapshot
      on snapshot.id = meal.recipe_content_snapshot_id
    where meal.id = any(array[${mealIds.map((mealId) => `'${mealId}'::uuid`).join(",")}]);
  `)) as ShoppingConcurrencyMealRow[];
  const ingredientNames = JSON.parse(psql(`
    with ingredient_ids as (
      select distinct nullif(item ->> 'ingredient_id', '')::uuid as ingredient_id
      from public.meals as meal
      join public.recipe_content_snapshots as snapshot
        on snapshot.id = meal.recipe_content_snapshot_id
      cross join jsonb_array_elements(snapshot.ingredients_json) as item
      where meal.id = any(array[${mealIds.map((mealId) => `'${mealId}'::uuid`).join(",")}])
        and nullif(item ->> 'ingredient_id', '') is not null
    )
    select jsonb_object_agg(ingredient.id::text, ingredient.name)::text
    from public.ingredients as ingredient
    join ingredient_ids on ingredient_ids.ingredient_id = ingredient.id;
  `) || "{}") as Record<string, string>;

  const recipeRowsMap = new Map<string, {
    recipe_id: string;
    recipe_content_snapshot_id: string | null;
    shopping_servings: number;
    planned_servings_total: number;
  }>();
  const genericInputs: Array<{
    ingredient_id: string;
    standard_name: string;
    ingredient_type: "QUANT" | "TO_TASTE";
    amount: number | null;
    unit: string | null;
    display_text: string | null;
    planned_servings: number;
    shopping_servings: number;
  }> = [];
  const productPayloadByPair = new Map<string, {
    ingredient_id: null;
    food_product_id: string;
    food_product_nutrition_version_id: string;
    display_text: string;
    amounts_json: Array<{ amount: number; unit: string }>;
    is_pantry_excluded: boolean;
    sort_order: number;
  }>();

  for (const meal of meals) {
    const key = `${meal.recipe_id}:${meal.recipe_content_snapshot_id ?? ""}`;
    const existing = recipeRowsMap.get(key) ?? {
      recipe_id: meal.recipe_id,
      recipe_content_snapshot_id: meal.recipe_content_snapshot_id ?? null,
      shopping_servings: 0,
      planned_servings_total: 0,
    };
    existing.shopping_servings += meal.planned_servings;
    existing.planned_servings_total += meal.planned_servings;
    recipeRowsMap.set(key, existing);

    for (const ingredient of meal.ingredients_json) {
      if (
        ingredient.food_product_id
        && ingredient.food_product_nutrition_version_id
      ) {
        const pair = `${ingredient.food_product_id}:${ingredient.food_product_nutrition_version_id}`;
        const existingProduct = productPayloadByPair.get(pair) ?? {
          ingredient_id: null,
          food_product_id: ingredient.food_product_id,
          food_product_nutrition_version_id: ingredient.food_product_nutrition_version_id,
          display_text: ingredient.display_text?.trim() || "상품",
          amounts_json: [],
          is_pantry_excluded: false,
          sort_order: 0,
        };
        if (
          typeof ingredient.amount === "number"
          && ingredient.unit
          && meal.base_servings > 0
        ) {
          existingProduct.amounts_json.push({
            amount: (ingredient.amount * meal.planned_servings) / meal.base_servings,
            unit: ingredient.unit,
          });
        }
        productPayloadByPair.set(pair, existingProduct);
        continue;
      }
      if (!ingredient.ingredient_id) {
        continue;
      }
      genericInputs.push({
        ingredient_id: ingredient.ingredient_id,
        standard_name: ingredientNames[ingredient.ingredient_id] ?? "",
        ingredient_type: ingredient.ingredient_type,
        amount: ingredient.amount,
        unit: ingredient.unit,
        display_text: ingredient.display_text,
        planned_servings: meal.base_servings,
        shopping_servings: meal.planned_servings,
      });
    }
  }

  const genericRows = aggregateShoppingIngredients(genericInputs).map((row, index) => ({
    ingredient_id: row.ingredient_id,
    food_product_id: null,
    food_product_nutrition_version_id: null,
    display_text: row.display_text,
    amounts_json: row.amounts_json,
    is_pantry_excluded: false,
    sort_order: index,
  }));
  const productRows = [...productPayloadByPair.values()].map((row, index) => ({
    ...row,
    sort_order: genericRows.length + index,
  }));

  return {
    recipeRows: [...recipeRowsMap.values()].sort((left, right) =>
      left.recipe_id.localeCompare(right.recipe_id)
      || (left.recipe_content_snapshot_id ?? "").localeCompare(
        right.recipe_content_snapshot_id ?? "",
      )
    ),
    itemRows: [...genericRows, ...productRows],
  };
}

function expectSqlFailure(sql: string, pattern: RegExp) {
  const result = psqlResult(sql);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toMatch(pattern);
}

function spawnPsql(sql: string) {
  return spawn(
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
    { env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" } },
  );
}

function waitForExit(child: ChildProcessWithoutNullStreams) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>(
    (resolve) => {
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.once("exit", (status) => resolve({ status, stdout, stderr }));
    },
  );
}

function draft(title: string, description = "future propagation PostgreSQL fixture") {
  return JSON.stringify({
    title,
    description,
    base_servings: 2,
    ingredients: [
      {
        ingredient_id: genericIngredient,
        amount: 100,
        unit: "g",
        ingredient_type: "QUANT",
        display_text: "일반 재료 100g",
        scalable: true,
      },
      {
        ingredient_id: productIngredient,
        amount: 1,
        unit: "개",
        ingredient_type: "QUANT",
        display_text: "고정 상품 1개",
        scalable: true,
        food_product_id: foodProduct,
        food_product_nutrition_version_id: foodProductVersion,
      },
    ],
    steps: [
      {
        step_number: 1,
        instruction: `${title} 조리 단계`,
        cooking_method_id: cookingMethod,
        ingredients_used: [genericIngredient, productIngredient],
      },
    ],
  }).replaceAll("'", "''");
}

function simpleDraft(
  title: string,
  ingredientId: string,
  standardDisplayText: string,
  description = "future propagation PostgreSQL fixture",
) {
  return JSON.stringify({
    title,
    description,
    base_servings: 2,
    ingredients: [
      {
        ingredient_id: ingredientId,
        amount: 100,
        unit: "g",
        ingredient_type: "QUANT",
        display_text: standardDisplayText,
        scalable: true,
      },
    ],
    steps: [
      {
        step_number: 1,
        instruction: `${title} 조리 단계`,
        cooking_method_id: cookingMethod,
        ingredients_used: [ingredientId],
      },
    ],
  }).replaceAll("'", "''");
}

function nutritionSnapshot(
  missingIngredientIds: string[] = [genericIngredient, productIngredient],
) {
  const unavailable = {
    status: "unavailable",
    amount: null,
    known_amount: null,
    display_mode: null,
  };
  return JSON.stringify({
    calculation_version: "personal-recipe-v2",
    scalable_values: {},
    fixed_values: {},
    nutrient_status: {
      energy_kcal: unavailable,
      carbohydrate_g: unavailable,
      protein_g: unavailable,
      fat_g: unavailable,
      sodium_mg: unavailable,
    },
    calculation_status: "unavailable",
    calculation_quality: null,
    reflected_ingredient_count: 0,
    target_ingredient_count: missingIngredientIds.length,
    missing_reasons: missingIngredientIds.map((ingredientId) =>
      `PREDECESSOR_NOT_APPROVED:${ingredientId}`
    ),
    warnings: ["PREDECESSOR_NOT_APPROVED"],
    sources: [],
  }).replaceAll("'", "''");
}

function authArgs() {
  return `
    '${owner}'::uuid,
    '${identityEpoch}'::timestamptz,
    '${sessionKeyHash}'::text,
    1,
    '${sessionIssuedAt}'::timestamptz`;
}

function previewSql(
  title: string,
  revision: number,
  description = "future propagation PostgreSQL fixture",
) {
  return `
    begin;
    set local request.jwt.claim.role = 'service_role';
    select public.preview_recipe_future_plan_impact(
      ${authArgs()},
      '${recipeId}'::uuid,
      ${revision},
      '${draft(title, description)}'::jsonb,
      '2026-08-02T02:00:00Z'::timestamptz
    );
    commit;
  `;
}

function patchSql(options: {
  title: string;
  revision: number;
  strategy: "keep" | "replace_all";
  impactToken: string;
  key: string;
  nutritionGuard?: string;
  description?: string;
}) {
  const nutritionGuard = options.nutritionGuard
    ? `'${options.nutritionGuard.replaceAll("'", "''")}'::jsonb`
    : `public.build_recipe_draft_nutrition_predecessor_guard('${draft(options.title, options.description)}'::jsonb)`;
  return `
    begin;
    set local homecook.personal_recipe_v2 = 'on';
    set local request.jwt.claim.role = 'service_role';
    select public.write_recipe_future_plan_change(
      ${authArgs()},
      '${recipeId}'::uuid,
      ${options.revision},
      '${draft(options.title, options.description)}'::jsonb,
      '${nutritionSnapshot()}'::jsonb,
      ${nutritionGuard},
      '${options.strategy}',
      '${options.impactToken}',
      null::uuid,
      '${options.key}'::uuid,
      '2026-08-02T02:01:00Z'::timestamptz
    );
    commit;
  `;
}

function standaloneStartSql(options: {
  recipeId: string;
  recipeRevision: number;
  key: string;
  cookingServings: number;
}) {
  return `
    begin;
    set local request.jwt.claim.role = 'service_role';
    set local homecook.snapshot_v2_creation = 'on';
    select public.start_snapshot_v2_cooking_session(
      ${authArgs()},
      '${options.key}'::uuid,
      'standalone',
      array[]::uuid[],
      '{}'::jsonb,
      '${options.recipeId}'::uuid,
      ${options.recipeRevision},
      ${options.cookingServings}::numeric,
      '2026-08-02T02:10:00Z'::timestamptz
    );
    commit;
  `;
}

function shoppingCreateSql(options: {
  mealIds: string[];
  title: string;
  recipeRows: unknown[];
  itemRows: unknown[];
}) {
  const mealArray = options.mealIds.map((mealId) => `'${mealId}'::uuid`).join(",");
  return `
    begin;
    set local request.jwt.claim.role = 'service_role';
    select public.create_shopping_list_with_snapshot_authority(
      ${authArgs()},
      '${owner}'::uuid,
      '${options.title}',
      current_date,
      current_date + 14,
      false,
      array[${mealArray}],
      '[]'::jsonb,
      '[]'::jsonb,
      ${jsonSql(options.recipeRows)},
      ${jsonSql(options.itemRows)},
      0
    );
    commit;
  `;
}

function startSql(options: {
  mealId: string;
  mealRevision: number;
  key: string;
  creation?: "on" | "off";
}) {
  return `
    begin;
    set local request.jwt.claim.role = 'service_role';
    set local homecook.snapshot_v2_creation = '${options.creation ?? "on"}';
    select public.start_snapshot_v2_cooking_session(
      ${authArgs()},
      '${options.key}'::uuid,
      'planner',
      array['${options.mealId}'::uuid],
      jsonb_build_object('${options.mealId}', ${options.mealRevision}),
      null::uuid,
      null::bigint,
      null::numeric,
      '2026-08-02T02:10:00Z'::timestamptz
    );
    commit;
  `;
}

function readSql(sessionId: string) {
  return `
    begin;
    set local request.jwt.claim.role = 'service_role';
    select public.read_snapshot_v2_cook_mode(
      ${authArgs()},
      '${sessionId}'::uuid,
      '2026-08-02T02:20:00Z'::timestamptz
    );
    commit;
  `;
}

function cancelSql(sessionId: string, key: string) {
  return `
    begin;
    set local request.jwt.claim.role = 'service_role';
    select public.cancel_snapshot_v2_cooking_session(
      ${authArgs()},
      '${sessionId}'::uuid,
      '${key}'::uuid,
      '2026-08-02T02:30:00Z'::timestamptz
    );
    commit;
  `;
}

function preview(
  title: string,
  revision: number,
  description = "future propagation PostgreSQL fixture",
) {
  const result = JSON.parse(psql(previewSql(title, revision, description)));
  expect(result.success).toBe(true);
  return result as {
    success: true;
    data: { impact_token: string };
    error: null;
  };
}

function domainDigest() {
  return psql(`
    select md5(concat_ws('|',
      (select coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text)::text, '[]') from public.recipes row_value),
      (select coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text)::text, '[]') from public.recipe_content_snapshots row_value),
      (select coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text)::text, '[]') from public.meals row_value),
      (select coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text)::text, '[]') from public.shopping_lists row_value),
      (select coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text)::text, '[]') from public.shopping_list_items row_value),
      (select coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text)::text, '[]') from public.cooking_sessions row_value),
      (select coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text)::text, '[]') from public.cooking_session_meal_claims row_value)
    ));
  `);
}

function wholeRequestDigest() {
  return psql(`
    select md5(concat_ws('|',
      '${domainDigest()}',
      (select coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text)::text, '[]') from public.recipe_change_previews row_value),
      (select coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text)::text, '[]') from public.mutation_idempotency_keys row_value)
    ));
  `);
}

const describeIf = enabled ? describe : describe.skip;

describeIf("recipe content snapshot future propagation PostgreSQL", () => {
  beforeAll(() => {
    psql(`
      insert into auth.users (id, created_at, email)
      values
        ('${owner}', '${identityEpoch}', 'future-owner@example.invalid'),
        ('${hiddenOwner}', '${hiddenIdentityEpoch}', 'hidden-owner@example.invalid');

      update private.full_local_auth_control
      set authority = 'local', local_issuer = '${localIssuer}', cutover_epoch = 2,
          hmac_key_version = 1, flows_open = true,
          local_activated_at = '2026-08-02T00:10:00Z',
          updated_at = '2026-08-02T00:10:00Z'
      where singleton;

      insert into public.users (id, nickname, social_provider, social_id)
      values
        ('${owner}', 'future-owner', 'test', 'future-owner'),
        ('${hiddenOwner}', 'hidden-owner', 'test', 'hidden-owner');
      insert into public.user_account_generation_watermarks
        (owner_uuid, last_account_generation)
      values
        ('${owner}', 1),
        ('${hiddenOwner}', 1);
      insert into public.user_account_lifecycles (
        owner_uuid, account_generation, auth_identity_created_at_snapshot,
        origin, status, activated_at
      ) values
        ('${owner}', 1, '${identityEpoch}', 'runtime', 'active', now()),
        ('${hiddenOwner}', 1, '${hiddenIdentityEpoch}', 'runtime', 'active', now());
      insert into public.user_session_generation_bindings (
        session_key_hash, hmac_key_version, owner_uuid,
        expected_account_generation, auth_identity_created_at_snapshot,
        binding_state, auth_authority, local_issuer, local_verified_at,
        auth_cutover_epoch, session_issued_at, binding_expires_at
      ) values (
        '${sessionKeyHash}', 1, '${owner}', 1, '${identityEpoch}', 'active',
        'local', '${localIssuer}', '${sessionIssuedAt}', 2,
        '${sessionIssuedAt}', '2099-01-01T00:00:00Z'
      ), (
        '${hiddenSessionKeyHash}', 1, '${hiddenOwner}', 1,
        '${hiddenIdentityEpoch}', 'active',
        'local', '${localIssuer}', '${hiddenSessionIssuedAt}', 2,
        '${hiddenSessionIssuedAt}', '2099-01-01T00:00:00Z'
      );
      insert into public.ingredients (id, name) values
        ('${genericIngredient}', '일반 재료'),
        ('${productIngredient}', '상품 연결 재료'),
        ('${secondGenericIngredient}', '두 번째 일반 재료');
      create table if not exists public.meal_plan_columns (
        id uuid primary key,
        user_id uuid not null
      );
      insert into public.meal_plan_columns (id, user_id)
      values ('${plannerColumn}', '${owner}')
      on conflict (id) do nothing;
      insert into public.cooking_methods (id, code, label, color_key, category_code)
      values ('${cookingMethod}', 'future-fixture', '조리', 'red', 'wet_heat');
      insert into public.nutrition_profiles (id, created_by)
      values ('${nutritionProfile}', '${owner}');
      insert into public.food_products (
        id, owner_user_id, visibility, source_type, moderation_status, name, brand
      ) values (
        '${foodProduct}', null, 'public', 'manual', 'visible', '고정 상품', '고정 브랜드'
      );
      insert into public.food_product_nutrition_versions (
        id, product_id, nutrition_profile_id, created_by
      ) values ('${foodProductVersion}', '${foodProduct}', '${nutritionProfile}', '${owner}');
      update public.food_products
      set current_nutrition_version_id = '${foodProductVersion}'
      where id = '${foodProduct}';
      insert into public.food_product_ingredient_links (
        product_id, ingredient_id, relation, review_status, is_primary,
        is_active, source, decision_reason, reviewed_at
      ) values (
        '${foodProduct}', '${productIngredient}', 'represents', 'approved',
        true, true, 'fixture', 'fixture approval', now()
      );
      insert into public.account_generation_cutover_attempts
        (id, state, capability_revision, result_json)
      values ('${cutoverAttempt}', 'promoted', 2, '{}'::jsonb);
      update public.account_generation_capability_state
      set state = 'generation_active', revision = revision + 1,
          current_cutover_attempt_id = '${cutoverAttempt}',
          activated_at = '2026-08-02T00:20:00Z'
      where singleton;
    `);

    const created = JSON.parse(
      psql(`
        begin;
        set local homecook.personal_recipe_v2 = 'on';
        set local request.jwt.claim.role = 'service_role';
        select public.write_personal_recipe_core(
          ${authArgs()}, 'create', null::uuid, null::uuid, null::bigint,
          '${draft("고정 원본")}'::jsonb,
          '${nutritionSnapshot()}'::jsonb,
          '[{"normalized_key":"future-tag","label":"미래 태그"}]'::jsonb,
          null::uuid, 0,
          '96000000-0000-4000-8000-000000000001'::uuid,
          '2026-08-02T01:00:00Z'::timestamptz
        );
        commit;
      `),
    );
    recipeId = created.data.id as string;
    initialContentId = psql(`
      select id::text from public.recipe_content_snapshots
      where recipe_id = '${recipeId}' order by created_at, id limit 1;
    `);
    const secondCreated = JSON.parse(
      psql(`
        begin;
        set local homecook.personal_recipe_v2 = 'on';
        set local request.jwt.claim.role = 'service_role';
        select public.write_personal_recipe_core(
          ${authArgs()}, 'create', null::uuid, null::uuid, null::bigint,
          '${simpleDraft("두 번째 원본", secondGenericIngredient, "두 번째 일반 재료 100g")}'::jsonb,
          '${nutritionSnapshot([secondGenericIngredient])}'::jsonb,
          '[{"normalized_key":"future-tag-2","label":"미래 태그 2"}]'::jsonb,
          null::uuid, 0,
          '96000000-0000-4000-8000-000000000101'::uuid,
          '2026-08-02T01:05:00Z'::timestamptz
        );
        commit;
      `),
    );
    secondRecipeId = secondCreated.data.id as string;
    psql(`
      select id::text from public.recipe_content_snapshots
      where recipe_id = '${secondRecipeId}' order by created_at, id limit 1;
    `);
    hiddenPublicRecipeId = "91000000-0000-4000-8000-000000000101";
    psql(`
      begin;
      select public.set_account_generation_internal_writer_marker(
        '${cutoverAttempt}',
        true
      );
      insert into public.recipes (
        id, title, base_servings, created_by, visibility, deleted_at, revision, updated_at
      ) values (
        '${hiddenPublicRecipeId}',
        '숨김 공개 원본',
        2,
        '${hiddenOwner}',
        'public',
        null,
        1,
        '2026-08-02T01:06:00Z'
      );
      insert into public.recipe_nutrition_snapshots (
        id, recipe_id, owner_user_id, base_servings, input_hash,
        calculation_version, scalable_values_json, fixed_values_json,
        nutrient_status_json, calculation_status, calculation_quality,
        reflected_ingredient_count, target_ingredient_count, missing_reasons,
        warnings_json, sources_json, is_current, calculated_at
      ) values (
        '91000000-0000-4000-8000-000000000102',
        '${hiddenPublicRecipeId}',
        null,
        2,
        repeat('9', 64),
        'personal-recipe-v2',
        '{}'::jsonb,
        '{}'::jsonb,
        '{}'::jsonb,
        'unavailable',
        null,
        0,
        1,
        array['PREDECESSOR_NOT_APPROVED:${secondGenericIngredient}'],
        '[]'::jsonb,
        '[]'::jsonb,
        true,
        '2026-08-02T01:06:00Z'
      );
      update public.recipe_content_snapshots
      set recipe_nutrition_snapshot_id = recipe_nutrition_snapshot_id
      where false;
      insert into public.recipe_content_snapshots (
        id, owner_user_id, recipe_id, recipe_nutrition_snapshot_id,
        title, base_servings, ingredients_json, steps_json,
        content_hash, schema_version, created_at
      ) values (
        '91000000-0000-4000-8000-000000000103',
        null,
        '${hiddenPublicRecipeId}',
        '91000000-0000-4000-8000-000000000102',
        '숨김 공개 원본',
        2,
        ('${simpleDraft("숨김 공개 원본", secondGenericIngredient, "숨김 공개 재료 100g")}'::jsonb -> 'ingredients'),
        ('${simpleDraft("숨김 공개 원본", secondGenericIngredient, "숨김 공개 재료 100g")}'::jsonb -> 'steps'),
        repeat('a', 64),
        1,
        '2026-08-02T01:06:00Z'
      );
      insert into public.user_account_lifecycles (
        owner_uuid, account_generation, auth_identity_created_at_snapshot,
        origin, status, activated_at
      ) values (
        '${hiddenOwner}',
        2,
        '${hiddenIdentityEpoch}',
        'runtime',
        'deleting',
        now()
      );
      update public.user_account_generation_watermarks
      set last_account_generation = 2
      where owner_uuid = '${hiddenOwner}';
      select public.set_account_generation_internal_writer_marker(
        '${cutoverAttempt}',
        false
      );
      commit;
    `);

    psql(`
      begin;
      select public.set_account_generation_internal_writer_marker(
        '${cutoverAttempt}',
        true
      );
      insert into public.shopping_lists (
        id, user_id, title, date_range_start, date_range_end,
        is_completed, completed_at
      ) values
        ('${incompleteShopping}', '${owner}', '미완료', current_date, current_date + 14, false, null),
        ('${completedShopping}', '${owner}', '완료 기록', current_date - 14, current_date - 1, true, now());
      insert into public.shopping_list_recipes (
        shopping_list_id, recipe_id, shopping_servings, planned_servings_total
      ) values
        ('${incompleteShopping}', '${recipeId}', 4, 4),
        ('${completedShopping}', '${recipeId}', 2, 2);
      insert into public.shopping_list_items (
        shopping_list_id, ingredient_id, display_text, amounts_json,
        is_pantry_excluded, is_checked, added_to_pantry, sort_order
      ) values
        ('${incompleteShopping}', '${genericIngredient}', '일반 재료', '[{"amount":200,"unit":"g"}]', false, true, false, 0),
        ('${completedShopping}', '${genericIngredient}', '완료 일반 재료', '[{"amount":100,"unit":"g"}]', false, true, true, 0);
      insert into public.shopping_list_items (
        shopping_list_id, ingredient_id, food_product_id,
        food_product_nutrition_version_id, display_text, amounts_json,
        is_pantry_excluded, is_checked, added_to_pantry, sort_order
      ) values (
        '${completedShopping}', null, '${foodProduct}', '${foodProductVersion}',
        '완료 고정 상품', '[{"amount":1,"unit":"개"}]', true, false, true, 1
      );
      insert into public.pantry_items (id, user_id, ingredient_id)
      values ('${genericPantry}', '${owner}', '${genericIngredient}');
      insert into public.pantry_items (
        id, user_id, ingredient_id, food_product_id,
        food_product_nutrition_version_id
      ) values (
        '${productPantry}', '${owner}', null, '${foodProduct}', '${foodProductVersion}'
      );
      insert into public.meals (
        id, user_id, recipe_id, plan_date, column_id, planned_servings, status,
        shopping_list_id
      ) values
        ('${eligibleMeal}', '${owner}', '${recipeId}', current_date + 5, '${plannerColumn}', 2, 'registered', '${incompleteShopping}'),
        ('${secondEligibleMeal}', '${owner}', '${recipeId}', current_date + 6, '${plannerColumn}', 2, 'registered', null),
        ('${pastMeal}', '${owner}', '${recipeId}', current_date - 5, '${plannerColumn}', 2, 'registered', '${completedShopping}'),
        ('${cookedMeal}', '${owner}', '${recipeId}', current_date + 7, '${plannerColumn}', 2, 'registered', '${completedShopping}'),
        ('${cancelMeal}', '${owner}', '${recipeId}', current_date + 8, '${plannerColumn}', 2, 'registered', null),
        ('${concurrentMeal}', '${owner}', '${recipeId}', current_date + 9, '${plannerColumn}', 2, 'registered', null),
        ('${replayMeal}', '${owner}', '${recipeId}', current_date + 10, '${plannerColumn}', 2, 'registered', null),
        ('${multiRecipeMealA}', '${owner}', '${recipeId}', current_date + 11, '${plannerColumn}', 2, 'registered', null),
        ('${multiRecipeMealB}', '${owner}', '${recipeId}', current_date + 12, '${plannerColumn}', 2, 'registered', null),
        ('${multiRecipeMealC}', '${owner}', '${secondRecipeId}', current_date + 11, '${plannerColumn}', 2, 'registered', null),
        ('${multiRecipeMealD}', '${owner}', '${secondRecipeId}', current_date + 12, '${plannerColumn}', 2, 'registered', null);
      update public.meals set status = 'shopping_done' where id = '${cookedMeal}';
      update public.meals set status = 'cook_done', cooked_at = now()
      where id = '${cookedMeal}';
      select public.set_account_generation_internal_writer_marker(
        '${cutoverAttempt}',
        false
      );
      commit;
    `);
    expect(
      psql(`
        select (result_json ? '_internal_generation_writer_txid')::text
        from public.account_generation_cutover_attempts
        where id = '${cutoverAttempt}';
      `),
    ).toBe("false");
  });

  it("applies the dedicated migration in both fresh and replay modes with exact RPC signatures", () => {
    expect(databaseMode).toMatch(/fresh|replay/);
    const sql = readFileSync(migrationPath(), "utf8");
    expect(sql).toContain("recipe_change_previews");
    expect(sql).toContain("RECIPE_IMPACT_STALE");
    expect(sql).toContain("SNAPSHOT_V2_CREATION_DISABLED");
    for (const signature of [
      "preview_recipe_future_plan_impact(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,bigint,jsonb,timestamp with time zone)",
      "write_recipe_future_plan_change(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,bigint,jsonb,jsonb,jsonb,text,text,uuid,uuid,timestamp with time zone)",
      "start_snapshot_v2_cooking_session(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,text,uuid[],jsonb,uuid,bigint,numeric,timestamp with time zone)",
      "read_snapshot_v2_cook_mode(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,timestamp with time zone)",
      "cancel_snapshot_v2_cooking_session(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,uuid,timestamp with time zone)",
    ]) {
      expect(
        psql(`select (to_regprocedure('public.${signature}') is not null)::text;`),
      ).toBe("true");
    }
  });

  it("denies authenticated preview DML and preview mutates no domain row", () => {
    expect(psql(`
      select relrowsecurity::text from pg_class
      where oid = 'public.recipe_change_previews'::regclass;
    `)).toBe("true");
    for (const statement of [
      "insert into public.recipe_change_previews default values",
      "update public.recipe_change_previews set expires_at = expires_at",
      "delete from public.recipe_change_previews",
    ]) {
      expectSqlFailure(
        `begin; set local role authenticated; set local request.jwt.claim.sub = '${owner}'; ${statement}; commit;`,
        /permission denied|row-level security|42501/i,
      );
    }

    const before = domainDigest();
    const result = preview("preview-only", 1);
    expect(result.data.impact_token).toBeTruthy();
    expect(domainDigest()).toBe(before);
  });

  it("keeps every Meal pin, then replace-all repins only eligible future Meals and preserves completed shopping/history", () => {
    const completedBefore = psql(`
      select jsonb_build_object(
        'list', to_jsonb(list_row),
        'items', (select jsonb_agg(to_jsonb(item_row) order by id)
                  from public.shopping_list_items item_row
                  where shopping_list_id = '${completedShopping}')
      )::text
      from public.shopping_lists list_row where id = '${completedShopping}';
    `);
    const pinsBefore = psql(`
      select string_agg(id::text || ':' || recipe_content_snapshot_id::text, ',' order by id)
      from public.meals where recipe_id = '${recipeId}';
    `);

    const keepPreview = preview("keep-current", 1);
    const keep = JSON.parse(
      psql(
        patchSql({
          title: "keep-current",
          revision: 1,
          strategy: "keep",
          impactToken: keepPreview.data.impact_token,
          key: "96000000-0000-4000-8000-000000000010",
        }),
      ),
    );
    expect(keep.data).toEqual({ id: recipeId, revision: 2 });
    expect(
      psql(`
        select string_agg(id::text || ':' || recipe_content_snapshot_id::text, ',' order by id)
        from public.meals where recipe_id = '${recipeId}';
      `),
    ).toBe(pinsBefore);

    const replacePreview = preview("replace-current", 2);
    const replace = JSON.parse(
      psql(
        patchSql({
          title: "replace-current",
          revision: 2,
          strategy: "replace_all",
          impactToken: replacePreview.data.impact_token,
          key: "96000000-0000-4000-8000-000000000011",
        }),
      ),
    );
    expect(replace.data).toEqual({ id: recipeId, revision: 3 });
    const currentContent = psql(`
      select id::text from public.recipe_content_snapshots
      where recipe_id = '${recipeId}' order by created_at desc, id desc limit 1;
    `);
    expect(currentContent).not.toBe(initialContentId);
    expect(
      psql(`
        select bool_and(recipe_content_snapshot_id = '${currentContent}')::text
        from public.meals where id in ('${eligibleMeal}', '${secondEligibleMeal}', '${cancelMeal}', '${concurrentMeal}');
      `),
    ).toBe("true");
    expect(
      psql(`
        select bool_and(recipe_content_snapshot_id = '${initialContentId}')::text
        from public.meals where id in ('${pastMeal}', '${cookedMeal}');
      `),
    ).toBe("true");
    expect(
      psql(`
        select jsonb_build_object(
          'list', to_jsonb(list_row),
          'items', (select jsonb_agg(to_jsonb(item_row) order by id)
                    from public.shopping_list_items item_row
                    where shopping_list_id = '${completedShopping}')
        )::text
        from public.shopping_lists list_row where id = '${completedShopping}';
      `),
    ).toBe(completedBefore);
    expect(
      psql(`select count(*)::text from public.recipe_tags where recipe_id = '${recipeId}';`),
    ).toBe("1");
  });

  it("rolls back stale recipe revision, target drift, predecessor drift, and active-claim replace-all as whole requests", () => {
    const staleRevision = preview("stale-revision", 3);
    const advance = preview("advance-current", 3);
    psql(
      patchSql({
        title: "advance-current",
        revision: 3,
        strategy: "keep",
        impactToken: advance.data.impact_token,
        key: "96000000-0000-4000-8000-000000000020",
      }),
    );
    const revisionDigest = wholeRequestDigest();
    expectSqlFailure(
      patchSql({
        title: "stale-revision",
        revision: 3,
        strategy: "keep",
        impactToken: staleRevision.data.impact_token,
        key: "96000000-0000-4000-8000-000000000021",
      }),
      /RECIPE_IMPACT_STALE/,
    );
    expect(wholeRequestDigest()).toBe(revisionDigest);

    const targetDrift = preview("target-drift", 4);
    psql(`
      begin;
      set local session_replication_role = replica;
      update public.meals set plan_date = plan_date + 1, revision = revision + 1
      where id = '${eligibleMeal}';
      commit;
    `);
    const targetDigest = wholeRequestDigest();
    expectSqlFailure(
      patchSql({
        title: "target-drift",
        revision: 4,
        strategy: "replace_all",
        impactToken: targetDrift.data.impact_token,
        key: "96000000-0000-4000-8000-000000000022",
      }),
      /RECIPE_IMPACT_STALE/,
    );
    expect(wholeRequestDigest()).toBe(targetDigest);

    const predecessorDrift = preview("predecessor-drift", 4);
    const lockedPredecessorGuard = psql(`
      select public.build_recipe_draft_nutrition_predecessor_guard(
        '${draft("predecessor-drift")}'::jsonb
      )::text;
    `);
    psql(`
      update public.food_product_ingredient_links
      set review_status = 'revoked', is_primary = false, is_active = false,
          decision_reason = 'fixture drift', reviewed_at = now()
      where product_id = '${foodProduct}';
    `);
    const predecessorDigest = wholeRequestDigest();
    expectSqlFailure(
      patchSql({
        title: "predecessor-drift",
        revision: 4,
        strategy: "keep",
        impactToken: predecessorDrift.data.impact_token,
        key: "96000000-0000-4000-8000-000000000023",
        nutritionGuard: lockedPredecessorGuard,
      }),
      /RECIPE_IMPACT_STALE/,
    );
    expect(wholeRequestDigest()).toBe(predecessorDigest);
    psql(`
      update public.food_product_ingredient_links
      set review_status = 'approved', is_primary = true, is_active = true,
          decision_reason = 'fixture restored', reviewed_at = now()
      where product_id = '${foodProduct}';
    `);

    const claimSession = "97000000-0000-4000-8000-000000000001";
    psql(`
      begin;
      select public.set_account_generation_internal_writer_marker(
        '${cutoverAttempt}',
        true
      );
      set constraints all deferred;
      insert into public.cooking_sessions (
        id, user_id, contract_version, session_kind, recipe_id,
        recipe_content_snapshot_id, cooking_servings, base_recipe_revision
      ) select '${claimSession}', user_id, 'snapshot_v2', 'planner', recipe_id,
               recipe_content_snapshot_id, planned_servings, null
        from public.meals where id = '${secondEligibleMeal}';
      insert into public.cooking_session_meals (
        session_id, meal_id, recipe_id, cooking_servings, meal_revision_snapshot
      ) select '${claimSession}', id, recipe_id, planned_servings, revision
        from public.meals where id = '${secondEligibleMeal}';
      insert into public.cooking_session_meal_claims (meal_id, session_id, owner_user_id)
      values ('${secondEligibleMeal}', '${claimSession}', '${owner}');
      select public.set_account_generation_internal_writer_marker(
        '${cutoverAttempt}',
        false
      );
      commit;
    `);
    expect(
      psql(`
        select (result_json ? '_internal_generation_writer_txid')::text
        from public.account_generation_cutover_attempts
        where id = '${cutoverAttempt}';
      `),
    ).toBe("false");
    const claimed = preview("claimed-replace", 4);
    const claimDigest = wholeRequestDigest();
    expectSqlFailure(
      patchSql({
        title: "claimed-replace",
        revision: 4,
        strategy: "replace_all",
        impactToken: claimed.data.impact_token,
        key: "96000000-0000-4000-8000-000000000024",
      }),
      /MEAL_COOKING_ALREADY_STARTED/,
    );
    expect(wholeRequestDigest()).toBe(claimDigest);
  });

  it("durably replays the same PATCH payload and rejects a different payload under the same key with zero writes", () => {
    const result = preview("durable-replay", 4);
    const key = "96000000-0000-4000-8000-000000000030";
    const call = patchSql({
      title: "durable-replay",
      revision: 4,
      strategy: "keep",
      impactToken: result.data.impact_token,
      key,
    });
    const first = JSON.parse(psql(call));
    const replay = JSON.parse(psql(call));
    expect(replay).toEqual(first);

    const beforeReuse = wholeRequestDigest();
    expectSqlFailure(
      patchSql({
        title: "different-payload",
        revision: 4,
        strategy: "keep",
        impactToken: result.data.impact_token,
        key,
      }),
      /IDEMPOTENCY_KEY_REUSED/,
    );
    expect(wholeRequestDigest()).toBe(beforeReuse);
  });

  it("keeps capability-off start free of session, claim, and idempotency writes", () => {
    const before = psql(`
      select concat_ws(':',
        (select count(*) from public.cooking_sessions),
        (select count(*) from public.cooking_session_meal_claims),
        (select count(*) from public.mutation_idempotency_keys));
    `);
    const revision = Number(
      psql(`select revision::text from public.meals where id = '${cancelMeal}';`),
    );
    expectSqlFailure(
      startSql({
        mealId: cancelMeal,
        mealRevision: revision,
        key: "96000000-0000-4000-8000-000000000040",
        creation: "off",
      }),
      /SNAPSHOT_V2_CREATION_DISABLED/,
    );
    expect(
      psql(`
        select concat_ws(':',
          (select count(*) from public.cooking_sessions),
          (select count(*) from public.cooking_session_meal_claims),
          (select count(*) from public.mutation_idempotency_keys));
      `),
    ).toBe(before);
  });

  it("replays the first snapshot-v2 start after its claim exists and creation turns off", () => {
    const key = "96000000-0000-4000-8000-000000000041";
    const revision = Number(
      psql(`select revision::text from public.meals where id = '${replayMeal}';`),
    );
    const first = JSON.parse(
      psql(startSql({ mealId: replayMeal, mealRevision: revision, key })),
    );
    const replay = JSON.parse(
      psql(startSql({
        mealId: replayMeal,
        mealRevision: revision,
        key,
        creation: "off",
      })),
    );

    expect(replay).toEqual(first);
    expect(
      psql(`select count(*)::text from public.cooking_session_meal_claims where meal_id = '${replayMeal}';`),
    ).toBe("1");
  });

  it("reads seeded v2 content immutably with exact generic/product pantry provenance", () => {
    const seededSession = "97000000-0000-4000-8000-000000000010";
    const pinnedContent = psql(`
      select recipe_content_snapshot_id::text from public.meals where id = '${pastMeal}';
    `);
    psql(`
      begin;
      select public.set_account_generation_internal_writer_marker(
        '${cutoverAttempt}',
        true
      );
      insert into public.cooking_sessions (
        id, user_id, contract_version, session_kind, recipe_id,
        recipe_content_snapshot_id, cooking_servings, base_recipe_revision
      ) values (
        '${seededSession}', '${owner}', 'snapshot_v2', 'standalone', '${recipeId}',
        '${pinnedContent}', 2, 1
      );
      select public.set_account_generation_internal_writer_marker(
        '${cutoverAttempt}',
        false
      );
      commit;
    `);
    expect(
      psql(`
        select (result_json ? '_internal_generation_writer_txid')::text
        from public.account_generation_cutover_attempts
        where id = '${cutoverAttempt}';
      `),
    ).toBe("false");
    expect(
      psql(`select title from public.recipes where id = '${recipeId}';`),
    ).not.toBe("고정 원본");
    const result = JSON.parse(psql(readSql(seededSession)));
    expect(result.data).toEqual({
      session_id: seededSession,
      contract_version: "snapshot_v2",
      mode: "standalone",
      status: "in_progress",
      recipe: expect.objectContaining({
        title: "고정 원본",
        ingredients: expect.any(Array),
        steps: expect.any(Array),
      }),
      pantry_candidates: expect.arrayContaining([
        {
          pantry_item_id: genericPantry,
          ingredient_id: genericIngredient,
          item_type: "ingredient",
          standard_name: "일반 재료",
          food_product_id: null,
          food_product_nutrition_version_id: null,
          name: "일반 재료",
          brand: null,
        },
        {
          pantry_item_id: productPantry,
          ingredient_id: productIngredient,
          item_type: "food_product",
          standard_name: "상품 연결 재료",
          food_product_id: foodProduct,
          food_product_nutrition_version_id: foodProductVersion,
          name: "고정 상품",
          brand: "고정 브랜드",
        },
      ]),
    });
  });

  it("cancels durably, replays the result, and releases only that planner claim", () => {
    const revision = Number(
      psql(`select revision::text from public.meals where id = '${cancelMeal}';`),
    );
    const started = JSON.parse(
      psql(
        startSql({
          mealId: cancelMeal,
          mealRevision: revision,
          key: "96000000-0000-4000-8000-000000000050",
        }),
      ),
    );
    const sessionId = started.data.session_id as string;
    expect(
      psql(`select count(*)::text from public.cooking_session_meal_claims where session_id = '${sessionId}';`),
    ).toBe("1");
    const first = JSON.parse(
      psql(
        cancelSql(sessionId, "96000000-0000-4000-8000-000000000051"),
      ),
    );
    const replay = JSON.parse(
      psql(
        cancelSql(sessionId, "96000000-0000-4000-8000-000000000051"),
      ),
    );
    expect(replay).toEqual(first);
    expect(first.data).toEqual({
      session_id: sessionId,
      contract_version: "snapshot_v2",
      mode: "planner",
      status: "cancelled",
    });
    expect(
      psql(`select count(*)::text from public.cooking_session_meal_claims where session_id = '${sessionId}';`),
    ).toBe("0");
    expect(
      psql(`select count(*)::text from public.cooking_session_meal_claims where session_id <> '${sessionId}';`),
    ).not.toBe("0");
  });

  it("allows exactly one concurrent planner start winner for the same Meal", async () => {
    const revision = Number(
      psql(`select revision::text from public.meals where id = '${concurrentMeal}';`),
    );
    const barrier = "homecook-snapshot-v2-start-barrier";
    const control = spawnPsql(
      `select pg_advisory_lock(hashtextextended('${barrier}', 0)); select pg_sleep(1); select pg_advisory_unlock(hashtextextended('${barrier}', 0));`,
    );
    const controlExit = waitForExit(control);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const contenders = [
      "96000000-0000-4000-8000-000000000060",
      "96000000-0000-4000-8000-000000000061",
    ].map((key) =>
      spawnPsql(
        startSql({ mealId: concurrentMeal, mealRevision: revision, key }).replace(
          "select public.start_snapshot_v2_cooking_session(",
          `select pg_advisory_xact_lock_shared(hashtextextended('${barrier}', 0));\nselect public.start_snapshot_v2_cooking_session(`,
        ),
      ),
    );
    const outcomes = await Promise.all(contenders.map(waitForExit));
    await controlExit;
    expect(outcomes.filter((outcome) => outcome.status === 0)).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status !== 0)).toHaveLength(1);
    expect(outcomes.map((outcome) => outcome.stderr).join("\n")).toMatch(
      /MEAL_COOKING_ALREADY_STARTED|claim|duplicate/i,
    );
    expect(
      psql(`select count(*)::text from public.cooking_session_meal_claims where meal_id = '${concurrentMeal}';`),
    ).toBe("1");
    expect(
      psql(`
        select count(*)::text from public.cooking_session_meals
        where meal_id = '${concurrentMeal}';
      `),
    ).toBe("1");
  });

  it("fails closed for hidden public standalone recipes with exact 404 and zero session/claim mutation", () => {
    const recipeRevision = Number(
      psql(`select revision::text from public.recipes where id = '${hiddenPublicRecipeId}';`),
    );
    const beforeSessionCount = psql(
      "select count(*)::text from public.cooking_sessions where contract_version = 'snapshot_v2';",
    );
    const beforeClaimCount = psql(
      "select count(*)::text from public.cooking_session_meal_claims;",
    );

    const result = psqlResult(
      standaloneStartSql({
        recipeId: hiddenPublicRecipeId,
        recipeRevision,
        key: "96000000-0000-4000-8000-000000000070",
        cookingServings: 2,
      }),
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("RESOURCE_NOT_FOUND");
    expect(
      psql("select count(*)::text from public.cooking_sessions where contract_version = 'snapshot_v2';"),
    ).toBe(beforeSessionCount);
    expect(psql("select count(*)::text from public.cooking_session_meal_claims;")).toBe(
      beforeClaimCount,
    );
  });

  it("returns RECIPE_IMPACT_STALE for description-only drift and leaves the post-preview state unchanged", () => {
    const revision = Number(
      psql(`select revision::text from public.recipes where id = '${secondRecipeId}';`),
    );
    const previewResult = JSON.parse(
      psql(`
        begin;
        set local request.jwt.claim.role = 'service_role';
        select public.preview_recipe_future_plan_impact(
          ${authArgs()},
          '${secondRecipeId}'::uuid,
          ${revision},
          '${simpleDraft("설명 드리프트 테스트", secondGenericIngredient, "두 번째 일반 재료 100g", "preview description")}'::jsonb,
          '2026-08-02T02:00:00Z'::timestamptz
        );
        commit;
      `),
    );
    const digestBeforePatch = wholeRequestDigest();
    const result = psqlResult(
      `
        begin;
        set local homecook.personal_recipe_v2 = 'on';
        set local request.jwt.claim.role = 'service_role';
        select public.write_recipe_future_plan_change(
          ${authArgs()},
          '${secondRecipeId}'::uuid,
          ${revision},
          '${simpleDraft("설명 드리프트 테스트", secondGenericIngredient, "두 번째 일반 재료 100g", "patched description only")}'::jsonb,
          '${nutritionSnapshot([secondGenericIngredient])}'::jsonb,
          public.build_recipe_draft_nutrition_predecessor_guard(
            '${simpleDraft("설명 드리프트 테스트", secondGenericIngredient, "두 번째 일반 재료 100g", "patched description only")}'::jsonb
          ),
          'replace_all',
          '${previewResult.data.impact_token}',
          null::uuid,
          '96000000-0000-4000-8000-000000000071'::uuid,
          '2026-08-02T02:01:00Z'::timestamptz
        );
        commit;
      `,
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("RECIPE_IMPACT_STALE");
    expect(wholeRequestDigest()).toBe(digestBeforePatch);
  });

  it("treats post-preview Meal insertion as target drift and keeps replace-all mutation-free", () => {
    const revision = Number(
      psql(`select revision::text from public.recipes where id = '${recipeId}';`),
    );
    const previewResult = preview("사후 식사 추가", revision);

    psql(`
      begin;
      select public.set_account_generation_internal_writer_marker(
        '${cutoverAttempt}',
        true
      );
      insert into public.meals (
        id, user_id, recipe_id, plan_date, planned_servings, status, shopping_list_id
      ) values (
        '93000000-0000-4000-8000-000000000012',
        '${owner}',
        '${recipeId}',
        current_date + 13,
        2,
        'registered',
        null
      );
      select public.set_account_generation_internal_writer_marker(
        '${cutoverAttempt}',
        false
      );
      commit;
    `);
    const digestBeforePatch = wholeRequestDigest();

    const result = psqlResult(
      patchSql({
        title: "사후 식사 추가",
        revision,
        strategy: "replace_all",
        impactToken: previewResult.data.impact_token,
        key: "96000000-0000-4000-8000-000000000072",
      }),
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("RECIPE_IMPACT_STALE");
    expect(wholeRequestDigest()).toBe(digestBeforePatch);
  });

  it("lets opposite-order multi-recipe shopping writers finish without deadlock and land in a deterministic terminal state", async () => {
    const leftPayloadInput = shoppingConcurrencyPayload([
      multiRecipeMealC,
      multiRecipeMealA,
    ]);
    const rightPayloadInput = shoppingConcurrencyPayload([
      multiRecipeMealB,
      multiRecipeMealD,
    ]);
    const control = spawnPsql(
      "select pg_advisory_lock(hashtextextended('homecook-multi-recipe-shopping-barrier', 0)); select pg_sleep(1); select pg_advisory_unlock(hashtextextended('homecook-multi-recipe-shopping-barrier', 0));",
    );
    const controlExit = waitForExit(control);
    await new Promise((resolve) => setTimeout(resolve, 100));

    const left = spawnPsql(
      shoppingCreateSql({
        mealIds: [multiRecipeMealC, multiRecipeMealA],
        title: "멀티 레시피 A",
        recipeRows: leftPayloadInput.recipeRows,
        itemRows: leftPayloadInput.itemRows,
      }).replace(
        "select public.create_shopping_list_with_snapshot_authority(",
        "select pg_advisory_xact_lock_shared(hashtextextended('homecook-multi-recipe-shopping-barrier', 0));\nselect public.create_shopping_list_with_snapshot_authority(",
      ),
    );
    const right = spawnPsql(
      shoppingCreateSql({
        mealIds: [multiRecipeMealB, multiRecipeMealD],
        title: "멀티 레시피 B",
        recipeRows: rightPayloadInput.recipeRows,
        itemRows: rightPayloadInput.itemRows,
      }).replace(
        "select public.create_shopping_list_with_snapshot_authority(",
        "select pg_advisory_xact_lock_shared(hashtextextended('homecook-multi-recipe-shopping-barrier', 0));\nselect public.create_shopping_list_with_snapshot_authority(",
      ),
    );

    const [leftResult, rightResult] = await Promise.all([
      waitForExit(left),
      waitForExit(right),
    ]);
    await controlExit;

    const leftPayload = extractPsqlJson(leftResult.stdout);
    const rightPayload = extractPsqlJson(rightResult.stdout);

    expect(leftResult.status, leftResult.stderr).toBe(0);
    expect(rightResult.status, rightResult.stderr).toBe(0);
    expect(leftPayload?.error_code ?? null, JSON.stringify(leftPayload)).toBe(null);
    expect(rightPayload?.error_code ?? null, JSON.stringify(rightPayload)).toBe(null);
  });
});
