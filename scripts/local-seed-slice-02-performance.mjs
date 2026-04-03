#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

import {
  buildSlice02PerformanceDataset,
  PERF_INGREDIENT_NAME_PREFIX,
  PERF_RECIPE_TITLE_PREFIX,
  PERF_SYNONYM_PREFIX,
  SLICE_02_PERFORMANCE_DEFAULTS,
} from "./lib/slice-02-performance-fixture.mjs";
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

async function listIdsByPrefix(supabase, table, column, prefix) {
  const result = await supabase
    .from(table)
    .select("id")
    .ilike(column, `${prefix}%`);

  assertNoError(result, `${table} prefix 조회 실패`);
  return (result.data ?? []).map((row) => row.id);
}

function chunkValues(values, size = 50) {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

async function clearExistingPerformanceDataset(supabase) {
  const [ingredientIds, recipeIds] = await Promise.all([
    listIdsByPrefix(supabase, "ingredients", "standard_name", PERF_INGREDIENT_NAME_PREFIX),
    listIdsByPrefix(supabase, "recipes", "title", PERF_RECIPE_TITLE_PREFIX),
  ]);

  if (recipeIds.length > 0) {
    for (const recipeIdChunk of chunkValues(recipeIds)) {
      const deleteRecipeIngredients = await supabase
        .from("recipe_ingredients")
        .delete()
        .in("recipe_id", recipeIdChunk);

      assertNoError(deleteRecipeIngredients, "기존 성능 recipe_ingredients 삭제 실패");

      const deleteRecipes = await supabase
        .from("recipes")
        .delete()
        .in("id", recipeIdChunk);

      assertNoError(deleteRecipes, "기존 성능 recipes 삭제 실패");
    }
  }

  const orphanSynonyms = await supabase
    .from("ingredient_synonyms")
    .delete()
    .ilike("synonym", `${PERF_SYNONYM_PREFIX}%`);

  assertNoError(orphanSynonyms, "기존 성능 synonym prefix 삭제 실패");

  if (ingredientIds.length > 0) {
    for (const ingredientIdChunk of chunkValues(ingredientIds)) {
      const deleteIngredients = await supabase
        .from("ingredients")
        .delete()
        .in("id", ingredientIdChunk);

      assertNoError(deleteIngredients, "기존 성능 ingredients 삭제 실패");
    }
  }
}

async function seedPerformanceDataset(supabase, dataset) {
  const now = new Date().toISOString();

  const insertIngredients = await supabase
    .from("ingredients")
    .insert(
      dataset.ingredients.map((ingredient) => ({
        id: ingredient.id,
        standard_name: ingredient.standard_name,
        category: ingredient.category,
        default_unit: ingredient.default_unit,
        created_at: now,
      })),
    );

  assertNoError(insertIngredients, "성능 ingredients 생성 실패");

  const insertSynonyms = await supabase
    .from("ingredient_synonyms")
    .insert(dataset.synonyms);

  assertNoError(insertSynonyms, "성능 ingredient_synonyms 생성 실패");

  const insertRecipes = await supabase
    .from("recipes")
    .insert(
      dataset.recipes.map((recipe) => ({
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

  assertNoError(insertRecipes, "성능 recipes 생성 실패");

  const insertRecipeIngredients = await supabase
    .from("recipe_ingredients")
    .insert(dataset.recipeIngredients);

  assertNoError(insertRecipeIngredients, "성능 recipe_ingredients 생성 실패");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const ingredientCount = parsePositiveInteger(
    args["ingredient-count"],
    SLICE_02_PERFORMANCE_DEFAULTS.ingredientCount,
  );
  const recipeCount = parsePositiveInteger(
    args["recipe-count"],
    SLICE_02_PERFORMANCE_DEFAULTS.recipeCount,
  );
  const sharedFilterMatchCount = parsePositiveInteger(
    args["shared-filter-match-count"],
    SLICE_02_PERFORMANCE_DEFAULTS.sharedFilterMatchCount,
  );
  const env = readLocalSupabaseEnv();
  const supabase = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const dataset = buildSlice02PerformanceDataset({
    ingredientCount,
    recipeCount,
    sharedFilterMatchCount,
  });

  await clearExistingPerformanceDataset(supabase);
  await seedPerformanceDataset(supabase, dataset);

  process.stdout.write(
    [
      "Seeded slice 02 performance dataset",
      `- ingredients: ${dataset.ingredients.length}`,
      `- synonyms: ${dataset.synonyms.length}`,
      `- recipes: ${dataset.recipes.length}`,
      `- recipe_ingredients: ${dataset.recipeIngredients.length}`,
      `- search query: ${dataset.scenario.searchQuery}`,
      `- filter ingredients: ${dataset.scenario.filterIngredientNames.join(", ")}`,
      `- matched recipes after apply: ${dataset.scenario.matchedRecipeCount}`,
    ].join("\n") + "\n",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
