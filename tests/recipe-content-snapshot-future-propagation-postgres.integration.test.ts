import { randomUUID } from "node:crypto";
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
const racePublicIdentityEpoch = "2026-08-02T00:06:00Z";
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

function createPublicStandaloneRaceFixture(label: string) {
  const sourceOwner = randomUUID();
  const recipeIdForRace = randomUUID();
  const nutritionSnapshotId = randomUUID();
  const contentSnapshotId = randomUUID();
  const contentJson = simpleDraft(
    `경쟁 공개 원본 ${label}`,
    secondGenericIngredient,
    `경쟁 공개 재료 ${label} 100g`,
  );

  psql(`
    begin;
    select public.set_account_generation_internal_writer_marker(
      '${cutoverAttempt}',
      true
    );
    insert into auth.users (id, created_at, email)
    values ('${sourceOwner}', '${racePublicIdentityEpoch}', '${sourceOwner}@example.invalid');
    insert into public.users (id, nickname, social_provider, social_id)
    values ('${sourceOwner}', 'race-public-${label}', 'test', 'race-public-${label}');
    insert into public.user_account_generation_watermarks (owner_uuid, last_account_generation)
    values ('${sourceOwner}', 1);
    insert into public.user_account_lifecycles (
      owner_uuid, account_generation, auth_identity_created_at_snapshot,
      origin, status, activated_at
    ) values (
      '${sourceOwner}',
      1,
      '${racePublicIdentityEpoch}',
      'runtime',
      'active',
      now()
    );
    insert into public.recipes (
      id, title, base_servings, created_by, visibility, deleted_at, revision, updated_at
    ) values (
      '${recipeIdForRace}',
      '경쟁 공개 원본 ${label}',
      2,
      '${sourceOwner}',
      'public',
      null,
      1,
      '2026-08-02T01:07:00Z'
    );
    insert into public.recipe_nutrition_snapshots (
      id, recipe_id, owner_user_id, base_servings, input_hash,
      calculation_version, scalable_values_json, fixed_values_json,
      nutrient_status_json, calculation_status, calculation_quality,
      reflected_ingredient_count, target_ingredient_count, missing_reasons,
      warnings_json, sources_json, is_current, calculated_at
    ) values (
      '${nutritionSnapshotId}',
      '${recipeIdForRace}',
      null,
      2,
      repeat('b', 64),
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
      '2026-08-02T01:07:00Z'
    );
    insert into public.recipe_content_snapshots (
      id, owner_user_id, recipe_id, recipe_nutrition_snapshot_id,
      title, base_servings, ingredients_json, steps_json,
      content_hash, schema_version, created_at
    ) values (
      '${contentSnapshotId}',
      null,
      '${recipeIdForRace}',
      '${nutritionSnapshotId}',
      '경쟁 공개 원본 ${label}',
      2,
      ('${contentJson}'::jsonb -> 'ingredients'),
      ('${contentJson}'::jsonb -> 'steps'),
      repeat('c', 64),
      1,
      '2026-08-02T01:07:00Z'
    );
    select public.set_account_generation_internal_writer_marker(
      '${cutoverAttempt}',
      false
    );
    commit;
  `);

  return {
    recipeId: recipeIdForRace,
    sourceOwner,
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
  barrier?: string;
  barrierDelaySeconds?: number;
}) {
  const barrierSql = options.barrier
    ? `select pg_advisory_xact_lock_shared(hashtextextended('${options.barrier}', 0));\n${
      options.barrierDelaySeconds
        ? `select pg_sleep(${options.barrierDelaySeconds});\n`
        : ""
    }`
    : "";
  return `
    begin;
    set local request.jwt.claim.role = 'service_role';
    set local homecook.snapshot_v2_creation = 'on';
    ${barrierSql}
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

function sourceOwnerTransitionSql(options: {
  ownerUuid: string;
  identityEpoch: string;
  barrier: string;
  barrierDelaySeconds?: number;
  status: "deleting" | "quarantined";
}) {
  return `
    begin;
    set local request.jwt.claim.role = 'service_role';
    select pg_advisory_xact_lock_shared(hashtextextended('${options.barrier}', 0));
    ${options.barrierDelaySeconds
      ? `select pg_sleep(${options.barrierDelaySeconds});`
      : ""}
    select pg_advisory_xact_lock(
      hashtextextended('homecook-account-owner:' || '${options.ownerUuid}', 0)
    );
    select public.set_account_generation_internal_writer_marker(
      '${cutoverAttempt}',
      true
    );
    insert into public.user_account_lifecycles (
      owner_uuid,
      account_generation,
      auth_identity_created_at_snapshot,
      origin,
      status,
      activated_at
    ) values (
      '${options.ownerUuid}',
      2,
      '${options.identityEpoch}',
      'runtime',
      '${options.status}',
      now()
    );
    update public.user_account_generation_watermarks
    set last_account_generation = 2
    where owner_uuid = '${options.ownerUuid}';
    select public.set_account_generation_internal_writer_marker(
      '${cutoverAttempt}',
      false
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
      date '2026-08-02',
      date '2026-08-02' + 14,
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
    if (process.env.HOMECOOK_ESTIMATED_WEIGHT_PG_REGRESSION === "1") {
      // The shared harness predates the already-shipped 202609220300 reader
      // volatility repair. Match production metadata without replacing its body.
      psql("alter function public.read_snapshot_v2_cook_mode(uuid,timestamptz,text,integer,timestamptz,uuid,timestamptz) volatile;");
    }
    if (process.env.HOMECOOK_MANUAL_PUBLIC_RUNTIME_REGRESSION === "1") {
      const tagSource = readFileSync(join(process.cwd(), "supabase/migrations/20260617090000_36b_recipe_tags_model.sql"), "utf8");
      psql(tagSource.slice(tagSource.indexOf("create or replace function public.normalize_recipe_tag_key("),
        tagSource.indexOf("create or replace function public.set_recipe_tags(")));
    }
    if (process.env.HOMECOOK_RECIPE_FUTURE_SAVE_REPAIR_REGRESSION === "1") {
      psql(`alter table public.recipe_tags add constraint recipe_tags_source_check
        check (source in ('system_suggested','user_reviewed','provider','backfill','admin'));`);
    }

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
        ('${incompleteShopping}', '${owner}', '미완료', date '2026-08-02', date '2026-08-02' + 14, false, null),
        ('${completedShopping}', '${owner}', '완료 기록', date '2026-08-02' - 14, date '2026-08-02' - 1, true, now());
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
        ('${eligibleMeal}', '${owner}', '${recipeId}', date '2026-08-02' + 5, '${plannerColumn}', 2, 'registered', '${incompleteShopping}'),
        ('${secondEligibleMeal}', '${owner}', '${recipeId}', date '2026-08-02' + 6, '${plannerColumn}', 2, 'registered', null),
        ('${pastMeal}', '${owner}', '${recipeId}', date '2026-08-02' - 5, '${plannerColumn}', 2, 'registered', '${completedShopping}'),
        ('${cookedMeal}', '${owner}', '${recipeId}', date '2026-08-02' + 7, '${plannerColumn}', 2, 'registered', '${completedShopping}'),
        ('${cancelMeal}', '${owner}', '${recipeId}', date '2026-08-02' + 8, '${plannerColumn}', 2, 'registered', null),
        ('${concurrentMeal}', '${owner}', '${recipeId}', date '2026-08-02' + 9, '${plannerColumn}', 2, 'registered', null),
        ('${replayMeal}', '${owner}', '${recipeId}', date '2026-08-02' + 10, '${plannerColumn}', 2, 'registered', null),
        ('${multiRecipeMealA}', '${owner}', '${recipeId}', date '2026-08-02' + 11, '${plannerColumn}', 2, 'registered', null),
        ('${multiRecipeMealB}', '${owner}', '${recipeId}', date '2026-08-02' + 12, '${plannerColumn}', 2, 'registered', null),
        ('${multiRecipeMealC}', '${owner}', '${secondRecipeId}', date '2026-08-02' + 11, '${plannerColumn}', 2, 'registered', null),
        ('${multiRecipeMealD}', '${owner}', '${secondRecipeId}', date '2026-08-02' + 12, '${plannerColumn}', 2, 'registered', null);
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

  it("derives only the joint server UI mode and keeps public execution closed", () => {
    expect(psql(`
      begin;
      set local homecook.personal_recipe_v2 = 'on';
      set local homecook.snapshot_v2_creation = 'on';
      select public.read_recipe_snapshot_ui_mode();
      commit;
    `)).toBe("snapshot_v2");
    expect(psql(`
      begin;
      set local homecook.personal_recipe_v2 = 'on';
      reset homecook.snapshot_v2_creation;
      select public.read_recipe_snapshot_ui_mode();
      commit;
    `)).toBe("legacy_v1");
    expect(psql(`
      select concat_ws(':',
        has_function_privilege('anon', 'public.read_recipe_snapshot_ui_mode()', 'execute'),
        has_function_privilege('authenticated', 'public.read_recipe_snapshot_ui_mode()', 'execute'),
        has_function_privilege('service_role', 'public.read_recipe_snapshot_ui_mode()', 'execute')
      );
    `)).toBe("f:f:t");
  });

  it("reads one exact owner editor snapshot and rejects a different owner", () => {
    const context = JSON.parse(psql(`
      begin;
      set local request.jwt.claim.role = 'service_role';
      select public.read_recipe_snapshot_entrypoint_context(
        ${authArgs()}, '${recipeId}'::uuid
      );
      commit;
    `));

    expect(context.revision).toBeGreaterThan(0);
    expect(context.edit_context.base_recipe_revision).toBe(context.revision);
    expect(Object.keys(context.edit_context).sort()).toEqual([
      "base_recipe_revision",
      "draft",
      "image_object_id",
    ]);
    expect(Object.keys(context.edit_context.draft).sort()).toEqual([
      "base_servings",
      "description",
      "ingredients",
      "steps",
      "title",
    ]);
    expect(context.edit_context.image_object_id).toBeNull();
    expect(context.edit_context.draft.ingredients).toHaveLength(2);
    expect(context.edit_context.draft.steps[0].ingredients_used[0]).toHaveProperty(
      "cut_size",
    );

    const nonOwnerResult = psqlResult(`
      begin;
      set local request.jwt.claim.role = 'service_role';
      select public.read_recipe_snapshot_entrypoint_context(
        ${authArgs()}, '${hiddenPublicRecipeId}'::uuid
      );
      commit;
    `);
    expect(nonOwnerResult.status).not.toBe(0);
    expect(nonOwnerResult.stderr).toContain("RESOURCE_NOT_FOUND");
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
    if (process.env.HOMECOOK_RECIPE_FUTURE_SAVE_REPAIR_REGRESSION === "1") {
      psql("alter table public.ingredients rename column name to standard_name;");
    }

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
    const replay = JSON.parse(psql(patchSql({
      title: "replace-current", revision: 2, strategy: "replace_all",
      impactToken: replacePreview.data.impact_token,
      key: "96000000-0000-4000-8000-000000000011",
    })));
    expect(replay).toEqual(replace);

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

  it.skipIf(process.env.HOMECOOK_RECIPE_FUTURE_SAVE_REPAIR_REGRESSION !== "1")("rejects arbitrary units while retaining a source row's existing legacy unit", () => {
    const originalDraft = JSON.parse(draft("unit guard"));
    const changedDraft = structuredClone(originalDraft);
    changedDraft.ingredients[0].unit = "injected-unit";
    const writeCall = (value: unknown, key: string) => `
      select public.write_personal_recipe_core(
        ${authArgs()}, 'update', '${recipeId}'::uuid, null::uuid, 3,
        ${jsonSql(value)}, '${nutritionSnapshot()}'::jsonb, '[]'::jsonb,
        null::uuid, null::bigint, '${key}'::uuid, '2026-08-02T02:00:00Z'::timestamptz
      );`;
    const before = domainDigest();
    expectSqlFailure(`begin; set local homecook.personal_recipe_v2 = 'on';
      set local request.jwt.claim.role = 'service_role';
      ${writeCall(changedDraft, "96000000-0000-4000-8000-000000000201")}`, /VALIDATION_ERROR/);
    expect(domainDigest()).toBe(before);
    // Model an already-existing legacy catalog unit, preserving it only for
    // this authorized source ingredient/component. Roll back the fixture edit.
    const preserved = psqlResult(`begin;
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',true);
      update public.recipe_ingredients set unit='injected-unit'
      where recipe_id='${recipeId}' and ingredient_id='${genericIngredient}';
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',false);
      set local homecook.personal_recipe_v2 = 'on';
      set local request.jwt.claim.role = 'service_role';
      ${writeCall(changedDraft, "96000000-0000-4000-8000-000000000202")}
      rollback;`);
    expect(preserved.status, preserved.stderr).toBe(0);
    expect(domainDigest()).toBe(before);
  });

  it.skipIf(process.env.HOMECOOK_RECIPE_FUTURE_SAVE_REPAIR_REGRESSION !== "1")("aggregates component portions without losing existing shopping checks", () => {
    const groupedDraft = JSON.parse(draft("grouped portions"));
    groupedDraft.ingredients[0].component_label = "푸딩";
    groupedDraft.ingredients.push({ ...groupedDraft.ingredients[0], amount: 50, display_text: "일반 재료 50g", component_label: "콩포트" });
    const groupedSql = jsonSql(groupedDraft);
    const previewResult = JSON.parse(psql(`begin; set local request.jwt.claim.role='service_role';
      select public.preview_recipe_future_plan_impact(${authArgs()}, '${recipeId}', 3, ${groupedSql}, '2026-08-02T02:02:00Z'); commit;`));
    const result = JSON.parse(psql(`begin; set local homecook.personal_recipe_v2='on'; set local request.jwt.claim.role='service_role';
      select public.write_recipe_future_plan_change(${authArgs()}, '${recipeId}', 3, ${groupedSql},
        '${nutritionSnapshot([genericIngredient, productIngredient, genericIngredient])}'::jsonb,
        public.build_recipe_draft_nutrition_predecessor_guard(${groupedSql}), 'replace_all',
        '${previewResult.data.impact_token}', null,
        '96000000-0000-4000-8000-000000000203', '2026-08-02T02:03:00Z'); commit;`));
    expect(result.data.revision).toBe(4);
    const rows = JSON.parse(psql(`select jsonb_agg(jsonb_build_object(
      'checked', is_checked, 'excluded', is_pantry_excluded,
      'amount', (select sum((portion->>'amount')::numeric) from jsonb_array_elements(amounts_json) portion)
    )) from public.shopping_list_items
    where shopping_list_id='${incompleteShopping}' and ingredient_id='${genericIngredient}';`));
    expect(rows).toEqual([{ checked: true, excluded: false, amount: 150 }]);
  });

  it.skipIf(process.env.HOMECOOK_RECIPE_FUTURE_SAVE_REPAIR_REGRESSION !== "1")("uses Korean midnight consistently for preview and replacement", () => {
    const yesterdayMeal = "93000000-0000-4000-8000-000000000120";
    const todayMeal = "93000000-0000-4000-8000-000000000121";
    psql(`begin; select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',true);
      insert into public.meals (id,user_id,recipe_id,plan_date,column_id,planned_servings,status)
      values ('${yesterdayMeal}','${owner}','${recipeId}','2026-08-02','${plannerColumn}',2,'registered'),
        ('${todayMeal}','${owner}','${recipeId}','2026-08-03','${plannerColumn}',2,'registered');
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',false); commit;`);
    const priorPin = psql(`select recipe_content_snapshot_id::text from public.meals where id='${yesterdayMeal}';`);
    const expected = Number(psql(`select count(*) from public.meals where user_id='${owner}' and recipe_id='${recipeId}'
      and status <> 'cook_done' and plan_date >= '2026-08-03';`));
    const nextDraft = draft("Korean midnight update");
    const impact = JSON.parse(psql(`begin; set local request.jwt.claim.role='service_role';
      select public.preview_recipe_future_plan_impact(${authArgs()},'${recipeId}',4,'${nextDraft}'::jsonb,'2026-08-02T15:30:00Z'); commit;`));
    expect(impact.data.future_meal_count).toBe(expected);
    expect(impact.data.date_range.from).toBe("2026-08-03");
    const updated = JSON.parse(psql(`begin; set local homecook.personal_recipe_v2='on'; set local request.jwt.claim.role='service_role';
      select public.write_recipe_future_plan_change(${authArgs()},'${recipeId}',4,'${nextDraft}'::jsonb,
        '${nutritionSnapshot()}'::jsonb,public.build_recipe_draft_nutrition_predecessor_guard('${nextDraft}'::jsonb),
        'replace_all','${impact.data.impact_token}',null,'96000000-0000-4000-8000-000000000204','2026-08-02T15:31:00Z'); commit;`));
    expect(updated.data.revision).toBe(5);
    expect(psql(`select recipe_content_snapshot_id::text from public.meals where id='${yesterdayMeal}';`)).toBe(priorPin);
    expect(psql(`select recipe_content_snapshot_id::text from public.meals where id='${todayMeal}';`)).not.toBe(priorPin);
  });

  it.skipIf(process.env.HOMECOOK_RECIPE_FUTURE_SAVE_REPAIR_REGRESSION !== "1")("preserves fixed quantities for four servings on shopping update and insert", () => {
    const fixedDraft = JSON.parse(draft("fixed four servings"));
    fixedDraft.ingredients[0].component_label = "푸딩";
    fixedDraft.ingredients[1].scalable = false;
    fixedDraft.ingredients.push({ ...fixedDraft.ingredients[0], amount: 50, scalable: false,
      display_text: "일반 재료 50g", component_label: "콩포트" });
    const fixedSql = jsonSql(fixedDraft);
    const before = domainDigest();
    const result = psqlResult(`begin; set local homecook.personal_recipe_v2='on'; set local request.jwt.claim.role='service_role';
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',true);
      update public.meals set planned_servings=4 where id='${eligibleMeal}';
      delete from public.shopping_list_items where shopping_list_id='${incompleteShopping}' and food_product_id='${foodProduct}';
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',false);
      do $check$ declare v_preview jsonb; v_parts numeric[]; v_product numeric; begin
        v_preview := public.preview_recipe_future_plan_impact(${authArgs()},'${recipeId}',5,${fixedSql},'2026-08-02T15:32:00Z');
        perform public.write_recipe_future_plan_change(${authArgs()},'${recipeId}',5,${fixedSql},
          '${nutritionSnapshot([genericIngredient, productIngredient, genericIngredient])}'::jsonb,
          public.build_recipe_draft_nutrition_predecessor_guard(${fixedSql}),'replace_all',
          v_preview #>> '{data,impact_token}',null,'96000000-0000-4000-8000-000000000205','2026-08-02T15:33:00Z');
        select array_agg((part->>'amount')::numeric order by (part->>'amount')::numeric) into v_parts
        from public.shopping_list_items item cross join jsonb_array_elements(item.amounts_json) part
        where item.shopping_list_id='${incompleteShopping}' and item.ingredient_id='${genericIngredient}';
        if v_parts is distinct from array[50,200]::numeric[] then raise exception 'FIXED_GENERIC_AMOUNT_CHANGED: %',v_parts; end if;
        select sum((part->>'amount')::numeric) into v_product
        from public.shopping_list_items item cross join jsonb_array_elements(item.amounts_json) part
        where item.shopping_list_id='${incompleteShopping}' and item.food_product_id='${foodProduct}';
        if v_product is distinct from 1::numeric then raise exception 'FIXED_PRODUCT_AMOUNT_CHANGED: %',v_product; end if;
      end $check$; rollback;`);
    expect(result.status, result.stderr).toBe(0);
    expect(domainDigest()).toBe(before);
  });

  it.skipIf(process.env.HOMECOOK_RECIPE_FUTURE_SAVE_REPAIR_REGRESSION !== "1")("creates shopping from an owner's existing pin after source deletion and rejects forged pins", () => {
    const before = domainDigest();
    const result = psqlResult(`begin; set local homecook.personal_recipe_v2='on'; set local request.jwt.claim.role='service_role';
      select public.write_personal_recipe_core(${authArgs()},'delete','${secondRecipeId}',null,null,null,null,null,null,null,
        '96000000-0000-4000-8000-000000000206',clock_timestamp());
      do $check$ declare v_pin uuid; v_recipes jsonb; v_items jsonb; v_result jsonb; v_before bigint; begin
        select recipe_content_snapshot_id into strict v_pin from public.meals where id='${multiRecipeMealC}';
        if v_pin is null then raise exception 'TEST_PIN_MISSING'; end if;
        v_recipes := jsonb_build_array(jsonb_build_object('recipe_id','${secondRecipeId}',
          'recipe_content_snapshot_id',v_pin,'shopping_servings',2,'planned_servings_total',2));
        v_items := jsonb_build_array(jsonb_build_object('ingredient_id','${secondGenericIngredient}',
          'display_text','두 번째 일반 재료','amounts_json','[{"amount":100,"unit":"g"}]'::jsonb,
          'is_pantry_excluded',false,'sort_order',0));
        select count(*) into v_before from public.shopping_lists;
        begin
          perform public.create_shopping_list_with_snapshot_authority(${authArgs()},'${hiddenOwner}','forged-owner',
            '2026-08-02','2026-08-20',false,array['${multiRecipeMealC}'::uuid],'[]','[]',v_recipes,v_items,0);
          raise exception 'OTHER_OWNER_ACCEPTED';
        exception when insufficient_privilege then if sqlerrm <> 'FORBIDDEN' then raise; end if; end;
        begin
          perform public.create_shopping_list_with_snapshot_authority(${authArgs()},'${owner}','missing-pin',
            '2026-08-02','2026-08-20',false,array['${multiRecipeMealC}'::uuid],'[]','[]',
            jsonb_set(v_recipes,'{0,recipe_content_snapshot_id}','null'),v_items,0);
          raise exception 'MISSING_PIN_ACCEPTED';
        exception when insufficient_privilege then if sqlerrm <> 'FORBIDDEN' then raise; end if; end;
        begin
          perform public.create_shopping_list_with_snapshot_authority(${authArgs()},'${owner}','wrong-pin',
            '2026-08-02','2026-08-20',false,array['${multiRecipeMealC}'::uuid],'[]','[]',
            jsonb_set(v_recipes,'{0,recipe_content_snapshot_id}',to_jsonb('${initialContentId}'::text)),v_items,0);
          raise exception 'WRONG_PIN_ACCEPTED';
        exception when insufficient_privilege then if sqlerrm <> 'FORBIDDEN' then raise; end if; end;
        if (select count(*) from public.shopping_lists) <> v_before then raise exception 'REJECTED_REQUEST_WROTE_LIST'; end if;
        v_result := public.create_shopping_list_with_snapshot_authority(${authArgs()},'${owner}','deleted-source-plan',
          '2026-08-02','2026-08-20',false,array['${multiRecipeMealC}'::uuid],'[]','[]',v_recipes,v_items,0);
        if nullif(v_result->>'id','') is null then raise exception 'SHOPPING_CREATE_FAILED: %',v_result; end if;
        if not exists (select 1 from public.shopping_list_recipes where shopping_list_id=(v_result->>'id')::uuid
          and recipe_id='${secondRecipeId}' and recipe_content_snapshot_id=v_pin) then raise exception 'SHOPPING_PIN_NOT_RETAINED'; end if;
        if not exists (select 1 from public.shopping_list_items where shopping_list_id=(v_result->>'id')::uuid
          and ingredient_id='${secondGenericIngredient}' and amounts_json='[{"amount":100,"unit":"g"}]'::jsonb) then raise exception 'PINNED_AMOUNT_NOT_RETAINED'; end if;
        if not exists (select 1 from public.recipes where id='${secondRecipeId}' and deleted_at is not null) then raise exception 'SOURCE_REVIVED'; end if;
      end $check$; rollback;`);
    expect(result.status, result.stderr).toBe(0);
    expect(domainDigest()).toBe(before);
  });

  it.skipIf(process.env.HOMECOOK_MANUAL_PUBLIC_RUNTIME_REGRESSION !== "1")("publishes a direct manual recipe ready to cook while retaining private copies and historic plans", () => {
    const originalDraft = JSON.parse(simpleDraft("직접 공개할 요리", genericIngredient, "일반 재료 100g"));
    originalDraft.steps[0].ingredients_used = [];
    const nextDraft = { ...originalDraft, title: "공개 원본 수정" };
    const originalSql = jsonSql(originalDraft);
    const nextSql = jsonSql(nextDraft);
    const payload = jsonSql({ p_title: originalDraft.title, p_base_servings: 2, p_thumbnail_url: null,
      p_tags: ["공개 태그"], p_tag_source: "user_reviewed", p_ingredients: originalDraft.ingredients, p_steps: originalDraft.steps });
    const before = domainDigest();
    const result = psqlResult(`begin;
      alter table public.recipes alter column id set default gen_random_uuid();
      set local homecook.personal_recipe_v2='on'; set local homecook.snapshot_v2_creation='on';
      set local request.jwt.claim.role='service_role';
      do $check$
      declare v_created jsonb; v_recipe uuid; v_plan uuid:=gen_random_uuid(); v_old_pin uuid;
        v_context jsonb; v_updated timestamptz; v_result jsonb; v_runtime jsonb; v_cook jsonb;
        v_fork jsonb; v_preview jsonb; v_snapshot jsonb; v_list jsonb;
      begin
        perform public.set_account_generation_internal_writer_marker('${cutoverAttempt}',true);
        insert into public.tags(normalized_key,label,kind,is_system,theme_eligible)
        values ('공개태그','공개 태그','semantic',true,true);
        perform public.set_account_generation_internal_writer_marker('${cutoverAttempt}',false);
        v_created := public.create_manual_recipe_recoverable(${authArgs()},
          '96000000-0000-4000-8000-000000000301','{}',${payload});
        v_recipe := (v_created->>'id')::uuid;
        if v_created->>'visibility' <> 'private' then raise exception 'UNPREPARED_RECIPE_PUBLIC'; end if;
        select public.read_owned_manual_recipe_publication_context(${authArgs()},v_recipe) into v_context;
        if v_context->>'idempotency_key' <> '96000000-0000-4000-8000-000000000301' then raise exception 'RECEIPT_IDENTITY_CHANGED'; end if;
        perform public.set_account_generation_internal_writer_marker('${cutoverAttempt}',true);
        insert into public.meals(id,user_id,recipe_id,plan_date,column_id,planned_servings,status)
        values(v_plan,'${owner}',v_recipe,current_date+2,'${plannerColumn}',2,'registered');
        perform public.set_account_generation_internal_writer_marker('${cutoverAttempt}',false);
        select recipe_content_snapshot_id into v_old_pin from public.meals where id=v_plan;
        if not exists(select 1 from public.recipe_content_snapshots where id=v_old_pin and owner_user_id='${owner}') then raise exception 'PRIVATE_PLAN_PIN_MISSING'; end if;
        select updated_at into v_updated from public.recipes where id=v_recipe;
        v_snapshot := '${nutritionSnapshot([genericIngredient])}'::jsonb || jsonb_build_object('base_servings',2,'input_hash',repeat('d',64),'calculated_at',clock_timestamp());
        v_result := public.publish_manual_recipe(${authArgs()},'96000000-0000-4000-8000-000000000301',v_recipe,
          v_updated,v_snapshot,public.build_recipe_nutrition_input_guard(v_recipe),null);
        if v_result->>'status' <> 'published' then raise exception 'PUBLICATION_INCOMPLETE: %',v_result; end if;
        v_context := public.read_owned_manual_recipe_publication_context(${authArgs()},v_recipe);
        if not (v_context->>'runtime_ready')::boolean then raise exception 'PUBLIC_RUNTIME_NOT_READY'; end if;
        if not exists(select 1 from public.recipes where id=v_recipe and visibility='public' and origin_recipe_id is null) then raise exception 'DIRECT_RECIPE_NOT_PUBLIC'; end if;
        if not exists(select 1 from public.recipe_tags where recipe_id=v_recipe and visibility='public') then raise exception 'DIRECT_TAGS_NOT_PUBLIC'; end if;
        v_runtime := public.read_recipe_snapshot_entrypoint_context(${authArgs()},v_recipe);
        if not (v_runtime ? 'edit_context') then raise exception 'PUBLIC_OWNER_CANNOT_EDIT'; end if;
        v_cook := public.start_snapshot_v2_cooking_session(${authArgs()},'96000000-0000-4000-8000-000000000302',
          'standalone',null,null,v_recipe,1,2,clock_timestamp());
        if v_cook#>>'{data,status}' <> 'in_progress' then raise exception 'PUBLIC_MANUAL_CANNOT_COOK: %',v_cook; end if;
        v_fork := public.write_personal_recipe_core(${authArgs()},'fork',null,v_recipe,1,${originalSql},
          '${nutritionSnapshot([genericIngredient])}'::jsonb,null,null,null,
          '96000000-0000-4000-8000-000000000303',clock_timestamp());
        if not exists(select 1 from public.recipes where id=(v_fork#>>'{data,id}')::uuid
          and visibility='private' and origin_recipe_id=v_recipe) then raise exception 'FORK_BECAME_PUBLIC'; end if;
        v_preview := public.preview_recipe_future_plan_impact(${authArgs()},v_recipe,1,${nextSql},clock_timestamp());
        v_result := public.write_recipe_future_plan_change(${authArgs()},v_recipe,1,${nextSql},
          '${nutritionSnapshot([genericIngredient])}'::jsonb,public.build_recipe_draft_nutrition_predecessor_guard(${nextSql}),
          'keep',v_preview#>>'{data,impact_token}',null,'96000000-0000-4000-8000-000000000304',clock_timestamp());
        if v_result#>>'{data,revision}' <> '2' then raise exception 'PUBLIC_OWNER_UPDATE_FAILED'; end if;
        if (select recipe_content_snapshot_id from public.meals where id=v_plan) is distinct from v_old_pin then raise exception 'OLD_PRIVATE_PIN_CHANGED'; end if;
        if not exists(select 1 from public.recipe_content_snapshots c join public.recipe_nutrition_snapshots n on n.id=c.recipe_nutrition_snapshot_id
          where c.recipe_id=v_recipe and c.owner_user_id is null and n.owner_user_id is null and n.is_current and c.title='공개 원본 수정') then raise exception 'PUBLIC_UPDATED_SNAPSHOT_INVALID'; end if;
        perform public.write_personal_recipe_core(${authArgs()},'delete',v_recipe,null,null,null,null,null,null,null,
          '96000000-0000-4000-8000-000000000305',clock_timestamp());
        v_list := public.create_shopping_list_with_snapshot_authority(${authArgs()},'${owner}','게시 전 계획 장보기',
          current_date+2,current_date+2,false,array[v_plan],'[]','[]',
          jsonb_build_array(jsonb_build_object('recipe_id',v_recipe,'recipe_content_snapshot_id',v_old_pin,'shopping_servings',2,'planned_servings_total',2)),
          jsonb_build_array(jsonb_build_object('ingredient_id','${genericIngredient}','display_text','일반 재료','amounts_json','[{"amount":100,"unit":"g"}]'::jsonb,'is_pantry_excluded',false,'sort_order',0)),0);
        if nullif(v_list->>'id','') is null then raise exception 'OLD_PRIVATE_PLAN_SHOPPING_BLOCKED: %',v_list; end if;
        if not exists(select 1 from public.recipe_content_snapshots where id=v_old_pin and owner_user_id='${owner}' and title='직접 공개할 요리') then raise exception 'PRIVATE_HISTORY_MUTATED'; end if;
      end;
      $check$; rollback;`);
    expect(result.status, result.stderr).toBe(0);
    expect(domainDigest()).toBe(before);
  });

  it.skipIf(process.env.HOMECOOK_RECIPE_FUTURE_SAVE_REPAIR_REGRESSION !== "1")("creates one shopping list for five mixed live and deleted private plans without changing meal progress", () => {
    const mixedDraft = jsonSql(JSON.parse(simpleDraft("다섯 계획 묶음", genericIngredient, "일반 재료 100g")));
    const before = domainDigest();
    const result = psqlResult(`begin; set local homecook.personal_recipe_v2='on'; set local request.jwt.claim.role='service_role';
      do $check$
      declare v_recipe uuid; v_meal uuid; v_pin uuid; v_meals uuid[]:='{}'; v_recipes uuid[]:='{}';
        v_rows jsonb:='[]'; v_items jsonb; v_result jsonb; v_before bigint; v_created jsonb; n integer;
      begin
        for n in 1..5 loop
          v_created := public.write_personal_recipe_core(${authArgs()},'create',null,null,null,${mixedDraft},
            '${nutritionSnapshot([genericIngredient])}'::jsonb,'[]',null,null,gen_random_uuid(),clock_timestamp());
          v_recipe := (v_created#>>'{data,id}')::uuid; v_meal := gen_random_uuid();
          perform public.set_account_generation_internal_writer_marker('${cutoverAttempt}',true);
          insert into public.meals(id,user_id,recipe_id,plan_date,column_id,planned_servings,status)
          values(v_meal,'${owner}',v_recipe,current_date+n,'${plannerColumn}',2,'registered');
          perform public.set_account_generation_internal_writer_marker('${cutoverAttempt}',false);
          select recipe_content_snapshot_id into v_pin from public.meals where id=v_meal;
          v_rows := v_rows || jsonb_build_array(jsonb_build_object('recipe_id',v_recipe,
            'recipe_content_snapshot_id',v_pin,'shopping_servings',2,'planned_servings_total',2));
          v_meals := array_append(v_meals,v_meal); v_recipes := array_append(v_recipes,v_recipe);
          if n<=3 then
            perform public.write_personal_recipe_core(${authArgs()},'delete',v_recipe,null,null,null,null,null,null,null,gen_random_uuid(),clock_timestamp());
          end if;
        end loop;
        if (select count(*) from public.recipes where id=any(v_recipes) and deleted_at is not null)<>3 then raise exception 'MIXED_SOURCE_FIXTURE_INVALID'; end if;
        if (select count(*) from public.meals where id=any(v_meals) and status='registered' and shopping_list_id is null)<>5 then raise exception 'ELIGIBLE_FIVE_MISSING'; end if;
        select count(*) into v_before from public.shopping_lists;
        v_items := jsonb_build_array(jsonb_build_object('ingredient_id','${genericIngredient}',
          'display_text','일반 재료','amounts_json','[{"amount":500,"unit":"g"}]'::jsonb,'is_pantry_excluded',false,'sort_order',0));
        begin
          perform public.create_shopping_list_with_snapshot_authority(${authArgs()},'${owner}','invalid fifth plan',
            current_date+1,current_date+5,false,v_meals,'[]','[]',
            jsonb_set(v_rows,'{4,recipe_content_snapshot_id}','null'),v_items,0);
          raise exception 'INVALID_FIFTH_PIN_ACCEPTED';
        exception when insufficient_privilege then if sqlerrm<>'FORBIDDEN' then raise; end if; end;
        if (select count(*) from public.shopping_lists)<>v_before then raise exception 'PARTIAL_LIST_CREATED'; end if;
        v_result := public.create_shopping_list_with_snapshot_authority(${authArgs()},'${owner}','five mixed plans',
          current_date+1,current_date+5,false,v_meals,'[]','[]',v_rows,v_items,0);
        if nullif(v_result->>'id','') is null then raise exception 'FIVE_PLAN_CREATE_FAILED: %',v_result; end if;
        if (select count(*) from public.shopping_list_recipes where shopping_list_id=(v_result->>'id')::uuid)<>5 then raise exception 'PLAN_GROUP_DROPPED'; end if;
        if (select count(*) from public.meals where id=any(v_meals) and status='registered' and shopping_list_id=(v_result->>'id')::uuid)<>5 then raise exception 'MEAL_PROGRESS_CHANGED'; end if;
        if (select count(*) from public.recipes where id=any(v_recipes) and deleted_at is not null)<>3 then raise exception 'DELETED_SOURCE_REVIVED'; end if;
        begin
          perform public.create_shopping_list_with_snapshot_authority(${authArgs()},'${owner}','duplicate list',
            current_date+1,current_date+5,false,v_meals,'[]','[]',v_rows,v_items,0);
          raise exception 'ALREADY_LINKED_MEALS_REUSED';
        exception when no_data_found then if sqlerrm<>'RESOURCE_NOT_FOUND' then raise; end if; end;
        if (select count(*) from public.shopping_lists)<>v_before+1 then raise exception 'DUPLICATE_LIST_CREATED'; end if;
      end;
      $check$; rollback;`);
    expect(result.status, result.stderr).toBe(0);
    expect(domainDigest()).toBe(before);
  });

  it.skipIf(process.env.HOMECOOK_ESTIMATED_WEIGHT_PG_REGRESSION !== "1")("completes estimated weight atomically, resumes only active sessions and protects measured or consumed batches", () => {
    const before = domainDigest();
    const ownerB = "91000000-0000-4000-8000-000000000701";
    const hashB = "e7".repeat(32);
    const result = psqlResult(`begin; set local request.jwt.claim.role='service_role';
      set local homecook.personal_recipe_v2='on';
      set local homecook.snapshot_v2_creation='on';
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',true);
      insert into auth.users(id,created_at,email) values ('${ownerB}','${identityEpoch}','weight-other@example.invalid');
      insert into public.users(id,nickname,social_provider,social_id) values ('${ownerB}','weight-other','test','weight-other');
      insert into public.user_account_generation_watermarks(owner_uuid,last_account_generation) values ('${ownerB}',1);
      insert into public.user_account_lifecycles(owner_uuid,account_generation,auth_identity_created_at_snapshot,origin,status,activated_at)
      values ('${ownerB}',1,'${identityEpoch}','runtime','active',now());
      insert into public.user_session_generation_bindings(session_key_hash,hmac_key_version,owner_uuid,expected_account_generation,
        auth_identity_created_at_snapshot,binding_state,auth_authority,local_issuer,local_verified_at,auth_cutover_epoch,session_issued_at,binding_expires_at)
      values ('${hashB}',1,'${ownerB}',1,'${identityEpoch}','active','local','${localIssuer}','${sessionIssuedAt}',2,'${sessionIssuedAt}','2099-01-01');
      update public.meals set status='shopping_done' where id='${multiRecipeMealC}';
      select public.set_account_generation_internal_writer_marker('${cutoverAttempt}',false);
      do $check$
      declare v_start jsonb; v_resume jsonb; v_completed jsonb; v_replay jsonb; v_measured jsonb;
        v_planner jsonb; v_result jsonb; v_session uuid; v_new_session uuid; v_planner_session uuid;
        v_key uuid:=gen_random_uuid(); v_pantry uuid:=gen_random_uuid(); v_event uuid:=gen_random_uuid(); v_event_before jsonb;
        v_batch_before jsonb; v_invalid numeric; v_revision bigint;
      begin
        v_start := public.start_snapshot_v2_cooking_session(${authArgs()},gen_random_uuid(),'standalone',null,null,'${secondRecipeId}',1,2,clock_timestamp());
        v_session := (v_start#>>'{data,session_id}')::uuid;
        v_resume := public.start_snapshot_v2_cooking_session(${authArgs()},gen_random_uuid(),'standalone',null,null,'${secondRecipeId}',1,2,clock_timestamp());
        if v_resume#>>'{data,session_id}' is distinct from v_session::text then raise exception 'ACTIVE_STANDALONE_NOT_RESUMED'; end if;
        select revision into v_revision from public.meals where id='${multiRecipeMealC}';
        v_planner := public.start_snapshot_v2_cooking_session(${authArgs()},gen_random_uuid(),'planner',array['${multiRecipeMealC}'::uuid],
          jsonb_build_object('${multiRecipeMealC}',v_revision),null,null,null,clock_timestamp());
        v_planner_session := (v_planner#>>'{data,session_id}')::uuid;
        if v_planner_session=v_session then raise exception 'DIFFERENT_MODE_RESUMED'; end if;
        perform set_config('homecook.snapshot_v2_creation','off',true);
        v_resume := public.start_snapshot_v2_cooking_session(${authArgs()},gen_random_uuid(),'planner',array['${multiRecipeMealC}'::uuid],
          jsonb_build_object('${multiRecipeMealC}',v_revision),null,null,null,clock_timestamp());
        if v_resume#>>'{data,session_id}' is distinct from v_planner_session::text then raise exception 'ACTIVE_PLANNER_NOT_RESUMED'; end if;
        perform set_config('homecook.snapshot_v2_creation','on',true);
        perform public.set_account_generation_internal_writer_marker('${cutoverAttempt}',true);
        insert into public.pantry_items(id,user_id,ingredient_id) values(v_pantry,'${owner}','${secondGenericIngredient}');
        perform public.set_account_generation_internal_writer_marker('${cutoverAttempt}',false);
        v_completed := public.complete_snapshot_v2_cooking_session(${authArgs()},v_session,v_key,array[v_pantry],'estimate_from_ingredients',75,clock_timestamp());
        if v_completed#>>'{data,cooked_batch,weight_source}' is distinct from 'estimated'
          or v_completed#>>'{data,cooked_batch,weight_status}' is distinct from 'known'
          or (v_completed#>>'{data,cooked_batch,finished_weight_g}')::numeric<>75 then raise exception 'ESTIMATED_COMPLETION_INVALID: %',v_completed; end if;
        v_replay := public.complete_snapshot_v2_cooking_session(${authArgs()},v_session,v_key,array[v_pantry],'estimate_from_ingredients',120,clock_timestamp());
        if v_replay is distinct from v_completed then raise exception 'CHANGED_ESTIMATE_REPLAY_DRIFT'; end if;
        v_replay := public.complete_snapshot_v2_cooking_session(${authArgs()},v_session,v_key,array[v_pantry],'estimate_from_ingredients',null,clock_timestamp());
        if v_replay is distinct from v_completed then raise exception 'UNKNOWN_ESTIMATE_REPLAY_DRIFT'; end if;
        if (select count(*) from public.leftover_dishes where id=v_session)<>1 then raise exception 'DUPLICATE_COMPLETION_BATCH'; end if;
        if (v_completed#>>'{data,pantry_removed}')::integer<>1
          or exists(select 1 from public.pantry_items where id=v_pantry)
          or not exists(select 1 from public.pantry_items where id='${genericPantry}') then raise exception 'PANTRY_COMPLETION_REPLAY_CHANGED_SCOPE'; end if;
        if (select status::text from public.meals where id='${multiRecipeMealC}')<>'shopping_done' then raise exception 'STANDALONE_CHANGED_PLAN'; end if;
        begin
          perform public.mutate_cooked_batch_weight('${ownerB}','${identityEpoch}','${hashB}',1,'${sessionIssuedAt}',v_session,gen_random_uuid(),'set_finished_weight',100,1,clock_timestamp());
          raise exception 'OTHER_OWNER_CHANGED_BATCH';
        exception when no_data_found then if sqlerrm<>'RESOURCE_NOT_FOUND' then raise; end if; end;
        v_measured := public.mutate_cooked_batch_weight(${authArgs()},v_session,gen_random_uuid(),'set_finished_weight',100,1,clock_timestamp());
        if v_measured#>>'{data,batch,weight_source}' is distinct from 'measured'
          or (v_measured#>>'{data,batch,finished_weight_g}')::numeric<>100
          or (v_measured#>>'{data,batch,revision}')::bigint<>2 then raise exception 'MEASURED_CORRECTION_INVALID'; end if;
        -- A legacy known weight with no source marker is not an editable estimate.
        perform public.set_account_generation_internal_writer_marker('${cutoverAttempt}',true);
        update public.leftover_dishes set weight_source=null where id=v_session;
        perform public.set_account_generation_internal_writer_marker('${cutoverAttempt}',false);
        begin
          perform public.mutate_cooked_batch_weight(${authArgs()},v_session,gen_random_uuid(),'set_finished_weight',110,2,clock_timestamp());
          raise exception 'LEGACY_KNOWN_WEIGHT_REPLACED';
        exception when sqlstate '55000' then if sqlerrm<>'CONFLICT' then raise; end if; end;
        v_start := public.start_snapshot_v2_cooking_session(${authArgs()},gen_random_uuid(),'standalone',null,null,'${secondRecipeId}',1,2,clock_timestamp());
        v_new_session := (v_start#>>'{data,session_id}')::uuid;
        if v_new_session=v_session then raise exception 'COMPLETED_SESSION_RESUMED'; end if;
        v_result := public.complete_snapshot_v2_cooking_session(${authArgs()},v_new_session,gen_random_uuid(),'{}'::uuid[],'estimate_from_ingredients',null,clock_timestamp());
        if v_result#>>'{data,cooked_batch,weight_status}' is distinct from 'missing'
          or v_result#>>'{data,cooked_batch,finished_weight_g}' is not null
          or v_result#>>'{data,cooked_batch,weight_source}' is not null then raise exception 'UNKNOWN_WEIGHT_BECAME_ZERO'; end if;
        v_start := public.start_snapshot_v2_cooking_session(${authArgs()},gen_random_uuid(),'standalone',null,null,'${secondRecipeId}',1,2,clock_timestamp());
        v_new_session := (v_start#>>'{data,session_id}')::uuid;
        foreach v_invalid in array array[0::numeric,'NaN'::numeric,'Infinity'::numeric] loop
          begin
            perform public.complete_snapshot_v2_cooking_session(${authArgs()},v_new_session,gen_random_uuid(),'{}'::uuid[],'estimate_from_ingredients',v_invalid,clock_timestamp());
            raise exception 'INVALID_ESTIMATE_ACCEPTED';
          exception when invalid_parameter_value then if sqlerrm<>'VALIDATION_ERROR' then raise; end if; end;
        end loop;
        if exists(select 1 from public.leftover_dishes where id=v_new_session) then raise exception 'FAILED_COMPLETION_WROTE_BATCH'; end if;
        -- Deleted original content remains usable only through this owner's
        -- existing planner session/pin; new standalone source access stays closed.
        perform public.write_personal_recipe_core(${authArgs()},'delete','${secondRecipeId}',null,null,null,null,null,null,null,gen_random_uuid(),clock_timestamp());
        v_resume := public.start_snapshot_v2_cooking_session(${authArgs()},gen_random_uuid(),'planner',array['${multiRecipeMealC}'::uuid],
          jsonb_build_object('${multiRecipeMealC}',v_revision),null,null,null,clock_timestamp());
        if v_resume#>>'{data,session_id}' is distinct from v_planner_session::text then raise exception 'DELETED_OWNER_PLAN_NOT_RESUMED'; end if;
        v_result := public.read_snapshot_v2_cook_mode(${authArgs()},v_planner_session,clock_timestamp());
        if v_result#>>'{data,status}' is distinct from 'in_progress' then raise exception 'DELETED_OWNER_PLAN_NOT_READABLE'; end if;
        -- Planner completion advances only its linked Meal and creates another estimate.
        v_result := public.complete_snapshot_v2_cooking_session(${authArgs()},v_planner_session,gen_random_uuid(),'{}'::uuid[],'estimate_from_ingredients',75,clock_timestamp());
        if (select status::text from public.meals where id='${multiRecipeMealC}')<>'cook_done' then raise exception 'PLANNER_COMPLETION_NOT_APPLIED'; end if;
        -- Exercise the real consumption-ledger/replay boundary without loading the
        -- unrelated meal-log UI/food-catalog migrations into this focused fixture.
        perform public.set_account_generation_internal_writer_marker('${cutoverAttempt}',true);
        insert into public.cooked_batch_quantity_events(id,owner_user_id,cooked_batch_id,event_type,delta_g,reason,operation_id,ordinal,payload_hash)
        values(v_event,'${owner}',v_planner_session,'consumed',-20,'meal-log fixture',gen_random_uuid(),1,repeat('c',64));
        perform private.replay_cooked_batch(v_planner_session,'${owner}',clock_timestamp());
        perform public.set_account_generation_internal_writer_marker('${cutoverAttempt}',false);
        select to_jsonb(event) into v_event_before from public.cooked_batch_quantity_events event where id=v_event;
        select to_jsonb(batch) into v_batch_before from public.leftover_dishes batch where id=v_planner_session;
        begin
          perform public.mutate_cooked_batch_weight(${authArgs()},v_planner_session,gen_random_uuid(),'set_finished_weight',100,2,clock_timestamp());
          raise exception 'CONSUMED_ESTIMATE_REPLACED';
        exception when sqlstate '55000' then if sqlerrm<>'CONFLICT' then raise; end if; end;
        if (select to_jsonb(batch) from public.leftover_dishes batch where id=v_planner_session) is distinct from v_batch_before then raise exception 'REJECTED_CORRECTION_CHANGED_BATCH'; end if;
        v_result := public.adjust_cooked_batch(${authArgs()},v_planner_session,gen_random_uuid(),-5,'잔량 확인',2,clock_timestamp());
        if (v_result#>>'{data,batch,remaining_weight_g}')::numeric<>50 then raise exception 'REMAINING_ADJUSTMENT_FAILED'; end if;
        if (select to_jsonb(event) from public.cooked_batch_quantity_events event where id=v_event) is distinct from v_event_before then raise exception 'CONSUMPTION_EVENT_CHANGED'; end if;
      end;
      $check$; rollback;`);
    expect(result.status, result.stderr).toBe(0);
    expect(domainDigest()).toBe(before);
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

  it.each(["deleting", "quarantined"] as const)(
    "serializes transition-first standalone public start against source-owner %s transition",
    async (nextStatus) => {
      const fixture = createPublicStandaloneRaceFixture(`transition-first-${nextStatus}`);
      const recipeRevision = Number(
        psql(`select revision::text from public.recipes where id = '${fixture.recipeId}';`),
      );
      const barrier = `homecook-public-standalone-transition-first-${nextStatus}`;
      const key = `96000000-0000-4000-8000-00000000008${nextStatus === "deleting" ? "0" : "1"}`;
      const keyHash = psql(`
        select encode(extensions.digest(convert_to('${key}', 'UTF8'), 'sha256'), 'hex');
      `);
      const control = spawnPsql(
        `select pg_advisory_lock(hashtextextended('${barrier}', 0)); select pg_sleep(1); select pg_advisory_unlock(hashtextextended('${barrier}', 0));`,
      );
      const controlExit = waitForExit(control);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const start = spawnPsql(
        standaloneStartSql({
          recipeId: fixture.recipeId,
          recipeRevision,
          key,
          cookingServings: 2,
          barrier,
          barrierDelaySeconds: 0.2,
        }),
      );
      const transition = spawnPsql(
        sourceOwnerTransitionSql({
          ownerUuid: fixture.sourceOwner,
          identityEpoch: racePublicIdentityEpoch,
          barrier,
          status: nextStatus,
        }),
      );

      const [startResult, transitionResult] = await Promise.all([
        waitForExit(start),
        waitForExit(transition),
      ]);
      await controlExit;

      expect(transitionResult.status, transitionResult.stderr).toBe(0);
      expect(startResult.status).not.toBe(0);
      expect(startResult.stderr).toContain("RESOURCE_NOT_FOUND");
      expect(
        psql(`select count(*)::text from public.cooking_sessions where recipe_id = '${fixture.recipeId}' and contract_version = 'snapshot_v2';`),
      ).toBe("0");
      expect(
        psql(`
          select count(*)::text
          from public.cooking_session_meal_claims as claim
          join public.cooking_sessions as session on session.id = claim.session_id
          where session.recipe_id = '${fixture.recipeId}';
        `),
      ).toBe("0");
      expect(
        psql(`
          select count(*)::text
          from public.mutation_idempotency_keys
          where operation_scope = 'snapshot_v2_start'
            and key_hash = '${keyHash}';
        `),
      ).toBe("0");
    },
  );

  it.each(["deleting", "quarantined"] as const)(
    "fails closed on durable read when source-owner %s transition races after standalone public start",
    async (nextStatus) => {
      const fixture = createPublicStandaloneRaceFixture(`start-first-${nextStatus}`);
      const recipeRevision = Number(
        psql(`select revision::text from public.recipes where id = '${fixture.recipeId}';`),
      );
      const barrier = `homecook-public-standalone-start-first-${nextStatus}`;
      const key = `96000000-0000-4000-8000-00000000009${nextStatus === "deleting" ? "0" : "1"}`;
      const control = spawnPsql(
        `select pg_advisory_lock(hashtextextended('${barrier}', 0)); select pg_sleep(1); select pg_advisory_unlock(hashtextextended('${barrier}', 0));`,
      );
      const controlExit = waitForExit(control);
      await new Promise((resolve) => setTimeout(resolve, 100));

      const start = spawnPsql(
        standaloneStartSql({
          recipeId: fixture.recipeId,
          recipeRevision,
          key,
          cookingServings: 2,
          barrier,
        }),
      );
      const transition = spawnPsql(
        sourceOwnerTransitionSql({
          ownerUuid: fixture.sourceOwner,
          identityEpoch: racePublicIdentityEpoch,
          barrier,
          barrierDelaySeconds: 0.2,
          status: nextStatus,
        }),
      );

      const [startResult, transitionResult] = await Promise.all([
        waitForExit(start),
        waitForExit(transition),
      ]);
      await controlExit;

      expect(transitionResult.status, transitionResult.stderr).toBe(0);
      if (startResult.status === 0) {
        const startPayload = extractPsqlJson(startResult.stdout) as {
          data?: { session_id?: string };
        };
        const sessionId = startPayload.data?.session_id;
        expect(typeof sessionId).toBe("string");
        const readResult = psqlResult(readSql(sessionId!));
        expect(readResult.status).not.toBe(0);
        expect(readResult.stderr).toContain("RESOURCE_NOT_FOUND");
      } else {
        expect(startResult.stderr).toContain("RESOURCE_NOT_FOUND");
        expect(
          psql(`select count(*)::text from public.cooking_sessions where recipe_id = '${fixture.recipeId}' and contract_version = 'snapshot_v2';`),
        ).toBe("0");
      }
      expect(
        psql(`
          select count(*)::text
          from public.cooking_session_meal_claims as claim
          join public.cooking_sessions as session on session.id = claim.session_id
          where session.recipe_id = '${fixture.recipeId}';
        `),
      ).toBe("0");
    },
  );

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
        date '2026-08-02' + 13,
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
    const leftListId = typeof leftPayload?.id === "string" ? leftPayload.id : null;
    const rightListId = typeof rightPayload?.id === "string" ? rightPayload.id : null;
    const secondContentSnapshotId = psql(`
      select id::text
      from public.recipe_content_snapshots
      where recipe_id = '${secondRecipeId}'
      order by created_at, id
      limit 1;
    `);

    expect(leftResult.status, leftResult.stderr).toBe(0);
    expect(rightResult.status, rightResult.stderr).toBe(0);
    expect(leftPayload?.error_code ?? null, JSON.stringify(leftPayload)).toBe(null);
    expect(rightPayload?.error_code ?? null, JSON.stringify(rightPayload)).toBe(null);
    expect(leftListId).not.toBe(rightListId);
    expect(
      psql(`
        select count(*)::text
        from public.shopping_lists
        where title in ('멀티 레시피 A', '멀티 레시피 B');
      `),
    ).toBe("2");
    expect(
      psql(`
        select count(*)::text
        from public.meals
        where id in ('${multiRecipeMealA}','${multiRecipeMealB}','${multiRecipeMealC}','${multiRecipeMealD}')
          and shopping_list_id is not null;
      `),
    ).toBe("4");
    const expectedMealProjection = [
      { meal_id: multiRecipeMealA, shopping_list_id: leftListId },
      { meal_id: multiRecipeMealC, shopping_list_id: leftListId },
      { meal_id: multiRecipeMealB, shopping_list_id: rightListId },
      { meal_id: multiRecipeMealD, shopping_list_id: rightListId },
    ].sort((left, right) =>
      left.shopping_list_id!.localeCompare(right.shopping_list_id!)
      || left.meal_id.localeCompare(right.meal_id)
    );
    expect(
      JSON.parse(
        psql(`
          select coalesce(jsonb_agg(jsonb_build_object(
            'meal_id', meal.id,
            'shopping_list_id', meal.shopping_list_id
          ) order by meal.shopping_list_id::text collate "C", meal.id::text collate "C"), '[]'::jsonb)::text
          from public.meals as meal
          where meal.id in (
            '${multiRecipeMealA}',
            '${multiRecipeMealB}',
            '${multiRecipeMealC}',
            '${multiRecipeMealD}'
          );
        `),
      ),
    ).toEqual(expectedMealProjection);
    expect(
      psql(`
        select count(*)::text
        from public.shopping_list_recipes as row
        join public.shopping_lists as list on list.id = row.shopping_list_id
        where list.title in ('멀티 레시피 A', '멀티 레시피 B');
      `),
    ).toBe("4");
    const mealProjection = JSON.parse(
      psql(`
        select coalesce(jsonb_agg(jsonb_build_object(
          'meal_id', meal.id,
          'shopping_list_id', meal.shopping_list_id,
          'recipe_id', meal.recipe_id,
          'recipe_content_snapshot_id', meal.recipe_content_snapshot_id,
          'planned_servings', meal.planned_servings
        ) order by meal.shopping_list_id::text collate "C", meal.id::text collate "C"), '[]'::jsonb)::text
        from public.meals as meal
        where meal.id in (
          '${multiRecipeMealA}',
          '${multiRecipeMealB}',
          '${multiRecipeMealC}',
          '${multiRecipeMealD}'
        );
      `),
    ) as Array<{
      meal_id: string;
      shopping_list_id: string;
      recipe_id: string;
      recipe_content_snapshot_id: string;
      planned_servings: number;
    }>;
    const expectedRecipeRows = [...mealProjection
      .reduce((map, meal) => {
        const key = `${meal.shopping_list_id}:${meal.recipe_id}:${meal.recipe_content_snapshot_id}`;
        const existing = map.get(key) ?? {
          shopping_list_id: meal.shopping_list_id,
          recipe_id: meal.recipe_id,
          recipe_content_snapshot_id: meal.recipe_content_snapshot_id,
          shopping_servings: 0,
          planned_servings_total: 0,
        };
        existing.shopping_servings += meal.planned_servings;
        existing.planned_servings_total += meal.planned_servings;
        map.set(key, existing);
        return map;
      }, new Map<string, {
        shopping_list_id: string;
        recipe_id: string;
        recipe_content_snapshot_id: string;
        shopping_servings: number;
        planned_servings_total: number;
      }>())
      .values()]
      .sort((left, right) =>
        left.shopping_list_id.localeCompare(right.shopping_list_id)
        || left.recipe_id.localeCompare(right.recipe_id)
        || left.recipe_content_snapshot_id.localeCompare(right.recipe_content_snapshot_id)
      );
    expect(
      JSON.parse(
        psql(`
          select coalesce(jsonb_agg(jsonb_build_object(
            'shopping_list_id', row.shopping_list_id,
            'recipe_id', row.recipe_id,
            'recipe_content_snapshot_id', row.recipe_content_snapshot_id,
            'shopping_servings', row.shopping_servings,
            'planned_servings_total', row.planned_servings_total
          ) order by row.shopping_list_id::text collate "C", row.recipe_id::text collate "C", row.recipe_content_snapshot_id::text collate "C"), '[]'::jsonb)::text
          from public.shopping_list_recipes as row
          where row.shopping_list_id in ('${leftListId}', '${rightListId}');
        `),
      ),
    ).toEqual(expectedRecipeRows);
    expect(
      psql(`
        select count(*)::text
        from public.shopping_lists as list
        where list.title in ('멀티 레시피 A', '멀티 레시피 B')
          and not exists (
            select 1 from public.meals as meal where meal.shopping_list_id = list.id
          );
      `),
    ).toBe("0");
    expect(
      psql(`
        select count(*)::text
        from public.shopping_list_recipes as row
        where row.shopping_list_id = '${leftListId}'
          and row.recipe_id = '${secondRecipeId}'
          and row.recipe_content_snapshot_id = '${initialContentId}';
      `),
    ).toBe("0");
    expect(
      psql(`
        select count(*)::text
        from public.shopping_list_recipes as row
        where row.shopping_list_id = '${rightListId}'
          and row.recipe_id = '${recipeId}'
          and row.recipe_content_snapshot_id = '${secondContentSnapshotId}';
      `),
    ).toBe("0");
    expect(
      psql(`
        with duplicated as (
          select
            item.shopping_list_id,
            coalesce(item.ingredient_id::text, 'product:' || item.food_product_id::text || ':' || item.food_product_nutrition_version_id::text) as identity_key,
            count(*)::integer as duplicate_count
          from public.shopping_list_items as item
          join public.shopping_lists as list on list.id = item.shopping_list_id
          where list.title in ('멀티 레시피 A', '멀티 레시피 B')
          group by item.shopping_list_id, identity_key
          having count(*) > 1
        )
        select count(*)::text from duplicated;
      `),
    ).toBe("0");
  });
});
