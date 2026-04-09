#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

import {
  buildSlice05PerformanceDataset,
  SLICE_05_PERFORMANCE_DEFAULTS,
} from "./lib/slice-05-performance-fixture.mjs";
import { readLocalSupabaseEnv } from "./lib/local-supabase-env.mjs";

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const nextValue = argv[index + 1];

    if (!nextValue || nextValue.startsWith("--")) {
      args[key] = "true";
      continue;
    }

    args[key] = nextValue;
    index += 1;
  }

  return args;
}

function assertNoError(result, message) {
  if (result.error) {
    throw new Error(`${message}: ${result.error.message}`);
  }
}

function parsePositiveInteger(value, fallback) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`양의 정수가 필요합니다: ${value}`);
  }

  return parsed;
}

async function readPerformanceUserId(supabase) {
  const result = await supabase
    .from("users")
    .select("id, email")
    .eq("email", SLICE_05_PERFORMANCE_DEFAULTS.performanceUserEmail)
    .maybeSingle();

  assertNoError(result, "플래너 성능용 사용자 조회 실패");

  if (!result.data?.id) {
    throw new Error(
      [
        "플래너 성능용 local 계정을 찾지 못했어요.",
        "`pnpm dev:demo` 또는 `pnpm local:seed:demo`로 local demo dataset을 먼저 준비해주세요.",
      ].join(" "),
    );
  }

  return result.data.id;
}

async function clearUserPlannerData(supabase, userId) {
  const deleteMeals = await supabase
    .from("meals")
    .delete()
    .eq("user_id", userId);

  assertNoError(deleteMeals, "기존 성능 user meals 삭제 실패");

  const deleteColumns = await supabase
    .from("meal_plan_columns")
    .delete()
    .eq("user_id", userId);

  assertNoError(deleteColumns, "기존 성능 user columns 삭제 실패");
}

async function listRecipeIdsByPrefix(supabase, prefix) {
  const result = await supabase
    .from("recipes")
    .select("id")
    .ilike("title", `${prefix}%`);

  assertNoError(result, "기존 성능 planner recipes 조회 실패");
  return (result.data ?? []).map((row) => row.id);
}

async function clearExistingPerformanceRecipes(supabase, titlePrefix) {
  const recipeIds = await listRecipeIdsByPrefix(supabase, titlePrefix);

  if (recipeIds.length === 0) {
    return;
  }

  const deleteMeals = await supabase
    .from("meals")
    .delete()
    .in("recipe_id", recipeIds);

  assertNoError(deleteMeals, "기존 성능 planner meals 삭제 실패");

  const deleteRecipes = await supabase
    .from("recipes")
    .delete()
    .in("id", recipeIds);

  assertNoError(deleteRecipes, "기존 성능 planner recipes 삭제 실패");
}

async function seedPlannerColumns(supabase, userId, columns) {
  const now = new Date().toISOString();

  const result = await supabase
    .from("meal_plan_columns")
    .insert(
      columns.map((column) => ({
        id: column.id,
        user_id: userId,
        name: column.name,
        sort_order: column.sort_order,
        created_at: now,
      })),
    );

  assertNoError(result, "플래너 성능 columns 생성 실패");
}

async function seedRecipes(supabase, recipes) {
  const now = new Date().toISOString();

  const result = await supabase
    .from("recipes")
    .insert(
      recipes.map((recipe) => ({
        id: recipe.id,
        title: recipe.title,
        description: recipe.description,
        thumbnail_url: recipe.thumbnail_url,
        base_servings: recipe.base_servings,
        tags: recipe.tags,
        source_type: recipe.source_type,
        created_by: null,
        view_count: recipe.view_count,
        like_count: recipe.like_count,
        save_count: recipe.save_count,
        plan_count: recipe.plan_count,
        cook_count: recipe.cook_count,
        created_at: now,
        updated_at: now,
      })),
    );

  assertNoError(result, "플래너 성능 recipes 생성 실패");
}

async function seedMeals(supabase, userId, meals) {
  const result = await supabase
    .from("meals")
    .insert(
      meals.map((meal) => ({
        ...meal,
        user_id: userId,
      })),
    );

  assertNoError(result, "플래너 성능 meals 생성 실패");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const localEnv = readLocalSupabaseEnv();
  const supabase = createClient(localEnv.API_URL, localEnv.SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const dataset = buildSlice05PerformanceDataset({
    baseDate: args["base-date"],
    daysAfter: parsePositiveInteger(
      args["days-after"],
      SLICE_05_PERFORMANCE_DEFAULTS.daysAfter,
    ),
    daysBefore: parsePositiveInteger(
      args["days-before"],
      SLICE_05_PERFORMANCE_DEFAULTS.daysBefore,
    ),
    recipeCount: parsePositiveInteger(
      args["recipe-count"],
      SLICE_05_PERFORMANCE_DEFAULTS.recipeCount,
    ),
  });
  const userId = await readPerformanceUserId(supabase);

  await clearExistingPerformanceRecipes(
    supabase,
    SLICE_05_PERFORMANCE_DEFAULTS.recipeTitlePrefix,
  );
  await clearUserPlannerData(supabase, userId);
  await seedPlannerColumns(supabase, userId, dataset.columns);
  await seedRecipes(supabase, dataset.recipes);
  await seedMeals(supabase, userId, dataset.meals);

  process.stdout.write(
    [
      "Seeded slice 05 long-run performance dataset",
      `- user: ${SLICE_05_PERFORMANCE_DEFAULTS.performanceUserEmail}`,
      `- columns: ${dataset.columns.length}`,
      `- recipes: ${dataset.recipes.length}`,
      `- meals: ${dataset.meals.length}`,
      `- initial range: ${dataset.scenario.initialRangeStartDate} ~ ${dataset.scenario.initialRangeEndDate}`,
      `- initial range meals: ${dataset.scenario.initialMealCount}`,
      `- shift meal counts: ${dataset.scenario.shifts.map((shift) => shift.expectedMealCount).join(", ")}`,
    ].join("\n") + "\n",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
