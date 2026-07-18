import { spawnSync } from "node:child_process";

import { beforeAll, describe, expect, it } from "vitest";

import {
  buildAllRecipeNutritionInventoryArtifact,
  deriveRecipeNutritionSnapshotId,
  rollbackAllRecipeNutritionRecalculation,
  runAllRecipeNutritionRecalculationLifecycle,
} from "@/scripts/lib/recipe-nutrition-backfill.mjs";
import { sha256 } from "@/scripts/lib/public-nutrition-pipeline.mjs";

const enabled = process.env.HOMECOOK_RECIPE_NUTRITION_PG_INTEGRATION === "1";
const host = process.env.HOMECOOK_RECIPE_NUTRITION_PGHOST ?? "";
const port = process.env.HOMECOOK_RECIPE_NUTRITION_PGPORT ?? "";
const database = process.env.HOMECOOK_RECIPE_NUTRITION_PGDATABASE ?? "";
const ACTOR_ID = "10000000-0000-4000-8000-000000019999";
const SOURCE_ID = "49000000-0000-4000-8000-000000000001";

const SOURCE = {
  provider: "식품의약품안전처",
  dataset: "식품영양성분DB정보",
  source_version: "2025-12-05",
  data_basis_date: null,
  license: "이용허락범위 제한 없음",
  source_url: "https://www.data.go.kr/data/15127578/openapi.do",
};

type LifecycleResult = {
  candidate_count: number;
  writes_committed: number;
  next_cursor: string | null;
  checkpoints: Array<Record<string, unknown>>;
};

const runAllRecipeLifecycle = runAllRecipeNutritionRecalculationLifecycle as unknown as
  (input: unknown) => Promise<LifecycleResult>;
const rollbackAllRecipe = rollbackAllRecipeNutritionRecalculation as unknown as
  (input: unknown) => Promise<unknown>;

function psql(sql: string): string {
  const result = spawnSync("psql", [
    "-h", host,
    "-p", port,
    "-U", "postgres",
    "-d", database,
    "-At",
    "-v", "ON_ERROR_STOP=1",
    "-c", sql,
  ], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", NODE_ENV: "test" },
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function jsonExpression(value: unknown): string {
  return `convert_from(decode('${Buffer.from(JSON.stringify(value), "utf8").toString("base64")}', 'base64'), 'UTF8')::jsonb`;
}

function queryRows<T>(sql: string): T[] {
  const encoded = psql(`
    select encode(
      convert_to(coalesce((select jsonb_agg(to_jsonb(result)) from (${sql}) result), '[]'::jsonb)::text, 'UTF8'),
      'hex'
    );
  `).split("\n").filter(Boolean).at(-1) ?? "";
  return JSON.parse(Buffer.from(encoded, "hex").toString("utf8")) as T[];
}

function deterministicCalculation(input: {
  recipe_id: string;
  recipe_version: string;
  base_servings: number;
  ingredients: Array<{ id: string }>;
}) {
  const nutrient = (amount: number) => ({
    status: "complete",
    amount,
    known_amount: null,
    display_mode: "total",
  });
  const seed = sha256({
    recipe_id: input.recipe_id,
    recipe_version: input.recipe_version,
    ingredient_ids: input.ingredients.map((ingredient) => ingredient.id),
  });
  return {
    basis: { amount: input.base_servings, unit: "serving" as const },
    base_servings: input.base_servings,
    values: {
      energy_kcal: nutrient(100),
      carbohydrate_g: nutrient(20),
      protein_g: nutrient(10),
      fat_g: nutrient(5),
      sodium_mg: nutrient(50),
    },
    scalable_values: {
      energy_kcal: 100,
      carbohydrate_g: 20,
      protein_g: 10,
      fat_g: 5,
      sodium_mg: 50,
    },
    fixed_values: {
      energy_kcal: 0,
      carbohydrate_g: 0,
      protein_g: 0,
      fat_g: 0,
      sodium_mg: 0,
    },
    calculation_status: "complete" as const,
    calculation_quality: "direct" as const,
    reflected_ingredient_count: input.ingredients.length,
    target_ingredient_count: input.ingredients.length,
    missing_reasons: [],
    warnings: [],
    sources: [SOURCE],
    input_hash: seed,
    calculation_version: "recipe-nutrition-v1",
    rounding_policy_version: "display-v1",
  };
}

function repository() {
  const calls: Array<{ afterRecipeId: string | null; limit: number }> = [];
  return {
    calls,
    deriveSnapshotId(recipeId: string, calculation: { input_hash: string; calculation_version: string }) {
      return deriveRecipeNutritionSnapshotId(
        recipeId,
        calculation.input_hash,
        calculation.calculation_version,
      );
    },
    async listAllRecipeInventoryPage({
      afterRecipeId,
      limit,
    }: {
      afterRecipeId: string | null;
      limit: number;
    }) {
      calls.push({ afterRecipeId, limit });
      return queryRows<{
        recipe_id: string;
        base_servings: number;
        updated_at: string;
      }>(`
        select id::text as recipe_id, base_servings::float8 as base_servings, updated_at::text as updated_at
        from public.recipes
        ${afterRecipeId ? `where id > '${afterRecipeId}'::uuid` : ""}
        order by id
        limit ${limit}
      `);
    },
    async loadRecipes(recipeIds: string[]) {
      return queryRows<{ id: string; base_servings: number; updated_at: string }>(`
        select id::text as id, base_servings::float8 as base_servings, updated_at::text as updated_at
        from public.recipes
        where id = any(array['${recipeIds.join("','")}']::uuid[])
        order by id
      `);
    },
    async loadIngredients(recipeIds: string[]) {
      return queryRows<{
        id: string;
        recipe_id: string;
        ingredient_id: string;
        amount: number | null;
        unit: string | null;
        ingredient_type: "QUANT" | "TO_TASTE";
        scalable: boolean;
        sort_order: number;
      }>(`
        select id::text as id, recipe_id::text as recipe_id, ingredient_id::text as ingredient_id,
               amount::float8 as amount, unit, ingredient_type::text as ingredient_type,
               scalable, sort_order
        from public.recipe_ingredients
        where recipe_id = any(array['${recipeIds.join("','")}']::uuid[])
        order by recipe_id, sort_order, id
      `);
    },
    async loadPredecessors(ingredientIds: string[]) {
      return new Map(ingredientIds.map((ingredientId) => [ingredientId, {
        nutrition_candidates: [{
          ingredientId,
          preparationState: "raw-edible",
          nutrition: {
            link: {
              id: `link-${ingredientId}`,
              review_status: "approved",
              is_active: true,
              is_primary: true,
              preparation_state: "raw-edible",
            },
            profile: {
              id: `profile-${ingredientId}`,
              source_item_id: `source-item-${ingredientId}`,
              normalization_method: "mass_100g",
              basis_amount: 100,
              basis_unit: "g",
              review_status: "approved",
              is_active: true,
              values: Object.fromEntries([
                ["energy_kcal", 100],
                ["carbohydrate_g", 20],
                ["protein_g", 10],
                ["fat_g", 5],
                ["sodium_mg", 50],
              ].map(([code, amount]) => [code, { amount, value_status: "observed" }])),
            },
            source: {
              id: SOURCE_ID,
              review_status: "approved",
              freshness_status: "current",
              is_active: true,
              provider: SOURCE.provider,
              dataset: SOURCE.dataset,
              source_version: SOURCE.source_version,
              data_basis_date: SOURCE.data_basis_date,
              license: SOURCE.license,
              source_url: SOURCE.source_url,
            },
          },
        }],
        conversion_candidates: [],
        piece_weight: null,
      }]));
    },
    async loadCurrentSnapshots(recipeIds: string[]) {
      return queryRows<{ recipe_id: string; id: string }>(`
        select recipe_id::text as recipe_id, id::text as id
        from public.recipe_nutrition_snapshots
        where recipe_id = any(array['${recipeIds.join("','")}']::uuid[]) and is_current
        order by recipe_id
      `);
    },
    async writeSnapshot(
      recipeId: string,
      calculation: ReturnType<typeof deterministicCalculation>,
      calculatedAt: string,
      _expectedRecipeVersion: string,
      _inputGuard: unknown,
    ) {
      void _expectedRecipeVersion;
      void _inputGuard;
      const snapshotId = deriveRecipeNutritionSnapshotId(
        recipeId,
        calculation.input_hash,
        calculation.calculation_version,
      );
      const beforeCurrent = currentSnapshotId(recipeId);
      psql(`
        select set_config('homecook.recipe_nutrition_writer', 'on', true);
        insert into public.recipe_nutrition_snapshots (
          id, recipe_id, base_servings, input_hash, calculation_version,
          scalable_values_json, fixed_values_json, nutrient_status_json,
          calculation_status, calculation_quality, reflected_ingredient_count,
          target_ingredient_count, missing_reasons, warnings_json, sources_json,
          is_current, calculated_at
        ) values (
          '${snapshotId}'::uuid,
          '${recipeId}'::uuid,
          ${calculation.base_servings},
          '${calculation.input_hash}',
          '${calculation.calculation_version}',
          ${jsonExpression(calculation.scalable_values)},
          ${jsonExpression(calculation.fixed_values)},
          ${jsonExpression(calculation.values)},
          '${calculation.calculation_status}',
          ${calculation.calculation_quality ? `'${calculation.calculation_quality}'` : "null"},
          ${calculation.reflected_ingredient_count},
          ${calculation.target_ingredient_count},
          array(select jsonb_array_elements_text(${jsonExpression(calculation.missing_reasons)})),
          ${jsonExpression(calculation.warnings)},
          ${jsonExpression(calculation.sources)},
          false,
          '${calculatedAt}'::timestamptz
        )
        on conflict (recipe_id, input_hash, calculation_version) do nothing;
        update public.recipe_nutrition_snapshots
          set is_current = false
          where recipe_id = '${recipeId}'::uuid and is_current and id <> '${snapshotId}'::uuid;
        update public.recipe_nutrition_snapshots
          set is_current = true
          where id = '${snapshotId}'::uuid and not is_current;
      `);
      return {
        snapshot_id: snapshotId,
        created: beforeCurrent !== snapshotId,
        is_current: true,
      };
    },
    async restoreCurrent(recipeId: string, snapshotId: string | null, expectedCurrentSnapshotId: string) {
      const [row] = queryRows<{ value: { snapshot_id: string | null; is_current: boolean } }>(`
        select public.restore_recipe_nutrition_snapshot_current(
          '${recipeId}'::uuid,
          ${snapshotId ? `'${snapshotId}'::uuid` : "null::uuid"},
          '${expectedCurrentSnapshotId}'::uuid
        ) as value
      `);
      return row.value;
    },
  };
}

function seedRecipe(recipeId: string, ingredientId: string, amount = 100) {
  psql(`
    insert into public.recipes (id, title, base_servings)
    values ('${recipeId}', 'Recipe ${recipeId}', 2);
    insert into public.ingredients (id, standard_name, category, default_unit)
    values ('${ingredientId}', 'Ingredient ${ingredientId}', 'fixture', 'g');
    insert into public.recipe_ingredients (
      id, recipe_id, ingredient_id, amount, unit, ingredient_type, scalable, sort_order
    ) values (
      gen_random_uuid(), '${recipeId}', '${ingredientId}', ${amount}, 'g', 'QUANT', true, 0
    );
  `);
}

function currentSnapshotId(recipeId: string) {
  return psql(`
    select id::text
    from public.recipe_nutrition_snapshots
    where recipe_id = '${recipeId}'::uuid and is_current
    limit 1;
  `).split("\n").filter(Boolean).at(-1) ?? "";
}

beforeAll(() => {
  if (!enabled) return;
  psql(`
    insert into public.users (id, nickname, social_provider, social_id)
    values ('${ACTOR_ID}', 'fixture-user', 'test', 'fixture-user')
    on conflict (id) do nothing;
    insert into public.nutrition_sources (
      id, provider_code, dataset_name, source_kind, source_version, data_basis_date,
      fetched_at, freshness_checked_at, freshness_status, priority_rank,
      source_url, license_name, license_url, manifest_sha256, review_status,
      decision_reason, reviewed_by, reviewed_at, is_active
    ) values (
      '${SOURCE_ID}',
      '${SOURCE.provider}',
      '${SOURCE.dataset}',
      'nutrition_dataset',
      '${SOURCE.source_version}',
      null,
      now(),
      now(),
      'current',
      1,
      '${SOURCE.source_url}',
      '${SOURCE.license}',
      '${SOURCE.source_url}',
      repeat('9', 64),
      'approved',
      'all recipe recalculation fixture',
      '${ACTOR_ID}',
      now(),
      true
    ) on conflict (id) do nothing;
  `);
});

describe.runIf(enabled)("all recipe nutrition recalculation PostgreSQL", () => {
  it("uses bounded inventory paging and preserves meal pins across apply, replay, and rollback", async () => {
    const recipeA = "29000000-0000-4000-8000-000000000001";
    const recipeB = "29000000-0000-4000-8000-000000000002";
    const ingredientA = "29100000-0000-4000-8000-000000000001";
    const ingredientB = "29100000-0000-4000-8000-000000000002";
    seedRecipe(recipeA, ingredientA);
    seedRecipe(recipeB, ingredientB);

    const repo = repository();
    const recipeAVersion = psql(`select updated_at::text from public.recipes where id = '${recipeA}'::uuid;`).trim();
    const recipeBVersion = psql(`select updated_at::text from public.recipes where id = '${recipeB}'::uuid;`).trim();
    const inventory = buildAllRecipeNutritionInventoryArtifact({
      recipes: [
        { recipe_id: recipeB, base_servings: 2, updated_at: recipeBVersion },
        { recipe_id: recipeA, base_servings: 2, updated_at: recipeAVersion },
      ],
      query_version: "all-recipes-inventory-sql-v1",
    });

    const priorCalculation = deterministicCalculation({
      recipe_id: recipeA,
      recipe_version: recipeAVersion,
      base_servings: 2,
      ingredients: [{ id: "prior-ingredient" }],
    });
    const priorGuard = JSON.parse(psql(`
      select public.build_recipe_nutrition_input_guard('${recipeA}'::uuid)::text;
    `));
    await repo.writeSnapshot(
      recipeA,
      priorCalculation,
      "2026-07-18T00:00:00.000Z",
      recipeAVersion,
      priorGuard,
    );
    const priorCurrent = currentSnapshotId(recipeA);

    const applied = await runAllRecipeLifecycle({
      repository: repo,
      inventory,
      mode: "apply",
      batchSize: 1,
      inventoryPageSize: 1,
      calculateRecipeNutrition: deterministicCalculation,
    });

    expect(repo.calls).toEqual([
      { afterRecipeId: null, limit: 1 },
      { afterRecipeId: recipeA, limit: 1 },
      { afterRecipeId: recipeB, limit: 1 },
    ]);
    expect(applied.candidate_count).toBe(2);
    expect(applied.writes_committed).toBe(2);
    expect(applied.next_cursor).toBeNull();
    expect(currentSnapshotId(recipeA)).not.toBe(priorCurrent);

    const mealId = "39000000-0000-4000-8000-000000000099";
    psql(`insert into public.meals (id, recipe_id) values ('${mealId}', '${recipeA}');`);
    const pinnedSnapshotId = psql(`
      select recipe_nutrition_snapshot_id::text
      from public.meals
      where id = '${mealId}'::uuid;
    `).trim();
    expect(pinnedSnapshotId).toBe(currentSnapshotId(recipeA));

    const replay = await runAllRecipeLifecycle({
      repository: repo,
      inventory,
      mode: "apply",
      batchSize: 1,
      inventoryPageSize: 1,
      calculateRecipeNutrition: deterministicCalculation,
    });
    expect(replay.writes_committed).toBe(0);

    await rollbackAllRecipe({
      repository: repo,
      inventory,
      inventoryPageSize: 1,
      checkpoints: applied.checkpoints,
    });
    expect(currentSnapshotId(recipeA)).toBe(priorCurrent);
    expect(psql(`
      select recipe_nutrition_snapshot_id::text
      from public.meals
      where id = '${mealId}'::uuid;
    `).trim()).toBe(pinnedSnapshotId);
  }, 30_000);
});
