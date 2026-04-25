import { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/response";
import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { getQaFixtureRecipeDetail, isQaFixtureModeEnabled } from "@/lib/mock/recipes";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { PantryMatchListData, PantryMatchRecipeItem } from "@/types/recipe";

interface QueryError {
  message: string;
}

interface PantryItemRow {
  ingredient_id: string;
}

interface RecipeIngredientRow {
  recipe_id: string;
  ingredient_id: string;
}

interface RecipeRow {
  id: string;
  title: string;
  thumbnail_url: string | null;
}

interface IngredientRow {
  id: string;
  standard_name: string;
}

type ArrayResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

interface PantryItemsSelectQuery {
  eq(column: string, value: string): PantryItemsSelectQuery;
  then: ArrayResult<PantryItemRow>["then"];
}

interface RecipeIngredientsSelectQuery {
  in(column: string, values: string[]): RecipeIngredientsSelectQuery;
  then: ArrayResult<RecipeIngredientRow>["then"];
}

interface RecipesSelectQuery {
  in(column: string, values: string[]): RecipesSelectQuery;
  then: ArrayResult<RecipeRow>["then"];
}

interface IngredientsSelectQuery {
  in(column: string, values: string[]): IngredientsSelectQuery;
  then: ArrayResult<IngredientRow>["then"];
}

interface PantryItemsTable {
  select(columns: string): PantryItemsSelectQuery;
}

interface RecipeIngredientsTable {
  select(columns: string): RecipeIngredientsSelectQuery;
}

interface RecipesTable {
  select(columns: string): RecipesSelectQuery;
}

interface IngredientsTable {
  select(columns: string): IngredientsSelectQuery;
}

interface PantryMatchDbClient {
  from(table: "pantry_items"): PantryItemsTable;
  from(table: "recipe_ingredients"): RecipeIngredientsTable;
  from(table: "recipes"): RecipesTable;
  from(table: "ingredients"): IngredientsTable;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function clampLimit(value: string | null) {
  if (!value) {
    return DEFAULT_LIMIT;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsed, MAX_LIMIT);
}

function parseCursor(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function createFixtureItems() {
  const detail = getQaFixtureRecipeDetail();
  const totalIngredients = detail.ingredients.length;
  const missing = detail.ingredients.slice(-1).map((ingredient) => ({
    id: ingredient.ingredient_id,
    standard_name: ingredient.standard_name,
  }));

  return [
    {
      id: detail.id,
      title: detail.title,
      thumbnail_url: detail.thumbnail_url,
      match_score: Number(((totalIngredients - missing.length) / totalIngredients).toFixed(2)),
      matched_ingredients: totalIngredients - missing.length,
      total_ingredients: totalIngredients,
      missing_ingredients: missing,
    },
  ] satisfies PantryMatchRecipeItem[];
}

function collectRecipeIngredientSets(rows: RecipeIngredientRow[]) {
  const map = new Map<string, Set<string>>();

  rows.forEach((row) => {
    if (!map.has(row.recipe_id)) {
      map.set(row.recipe_id, new Set<string>());
    }

    map.get(row.recipe_id)?.add(row.ingredient_id);
  });

  return map;
}

function normalizePantryMatchScore(matchedCount: number, totalCount: number) {
  if (totalCount <= 0) {
    return 0;
  }

  return Number((matchedCount / totalCount).toFixed(2));
}

function paginateItems(items: PantryMatchRecipeItem[], cursor: string | null, limit: number) {
  const cursorIndex = cursor ? items.findIndex((item) => item.id === cursor) : -1;
  const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;

  return items.slice(startIndex, startIndex + limit);
}

export async function GET(request: NextRequest) {
  const limit = clampLimit(request.nextUrl.searchParams.get("limit"));
  const cursor = parseCursor(request.nextUrl.searchParams.get("cursor"));

  if (isQaFixtureModeEnabled()) {
    const authOverride = readE2EAuthOverrideHeader(request.headers);

    if (authOverride !== "authenticated") {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }

    return ok({
      items: paginateItems(createFixtureItems(), cursor, limit),
    } satisfies PantryMatchListData);
  }

  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    PantryMatchDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "팬트리 기반 추천을 불러오지 못했어요."),
      500,
    );
  }

  const pantryItemsResult = await dbClient
    .from("pantry_items")
    .select("ingredient_id")
    .eq("user_id", user.id);

  if (pantryItemsResult.error || !pantryItemsResult.data) {
    return fail("INTERNAL_ERROR", "팬트리 기반 추천을 불러오지 못했어요.", 500);
  }

  const pantryIngredientIds = [...new Set(pantryItemsResult.data.map((item) => item.ingredient_id))];

  if (pantryIngredientIds.length === 0) {
    return ok({ items: [] } satisfies PantryMatchListData);
  }

  const matchedIngredientsResult = await dbClient
    .from("recipe_ingredients")
    .select("recipe_id, ingredient_id")
    .in("ingredient_id", pantryIngredientIds);

  if (matchedIngredientsResult.error || !matchedIngredientsResult.data) {
    return fail("INTERNAL_ERROR", "팬트리 기반 추천을 불러오지 못했어요.", 500);
  }

  if (matchedIngredientsResult.data.length === 0) {
    return ok({ items: [] } satisfies PantryMatchListData);
  }

  const matchedByRecipe = collectRecipeIngredientSets(matchedIngredientsResult.data);
  const candidateRecipeIds = [...matchedByRecipe.keys()];

  const recipeIngredientsResult = await dbClient
    .from("recipe_ingredients")
    .select("recipe_id, ingredient_id")
    .in("recipe_id", candidateRecipeIds);

  if (recipeIngredientsResult.error || !recipeIngredientsResult.data) {
    return fail("INTERNAL_ERROR", "팬트리 기반 추천을 불러오지 못했어요.", 500);
  }

  const totalByRecipe = collectRecipeIngredientSets(recipeIngredientsResult.data);

  const missingIngredientIds = new Set<string>();
  totalByRecipe.forEach((ingredientIds) => {
    ingredientIds.forEach((ingredientId) => {
      if (!pantryIngredientIds.includes(ingredientId)) {
        missingIngredientIds.add(ingredientId);
      }
    });
  });

  const ingredientNameById = new Map<string, string>();

  if (missingIngredientIds.size > 0) {
    const ingredientsResult = await dbClient
      .from("ingredients")
      .select("id, standard_name")
      .in("id", [...missingIngredientIds]);

    if (ingredientsResult.error || !ingredientsResult.data) {
      return fail("INTERNAL_ERROR", "팬트리 기반 추천을 불러오지 못했어요.", 500);
    }

    ingredientsResult.data.forEach((ingredient) => {
      ingredientNameById.set(ingredient.id, ingredient.standard_name);
    });
  }

  const recipesResult = await dbClient
    .from("recipes")
    .select("id, title, thumbnail_url")
    .in("id", candidateRecipeIds);

  if (recipesResult.error || !recipesResult.data) {
    return fail("INTERNAL_ERROR", "팬트리 기반 추천을 불러오지 못했어요.", 500);
  }

  const pantryIngredientSet = new Set(pantryIngredientIds);
  const items = recipesResult.data
    .map((recipe) => {
      const matchedIngredientIds = matchedByRecipe.get(recipe.id) ?? new Set<string>();
      const totalIngredientIds = totalByRecipe.get(recipe.id) ?? new Set<string>();
      const missingIngredients = [...totalIngredientIds]
        .filter((ingredientId) => !pantryIngredientSet.has(ingredientId))
        .map((ingredientId) => ({
          id: ingredientId,
          standard_name: ingredientNameById.get(ingredientId) ?? "",
        }));
      const totalIngredients = totalIngredientIds.size;
      const matchedIngredients = Math.min(matchedIngredientIds.size, totalIngredients);

      return {
        id: recipe.id,
        title: recipe.title,
        thumbnail_url: recipe.thumbnail_url,
        match_score: normalizePantryMatchScore(matchedIngredients, totalIngredients),
        matched_ingredients: matchedIngredients,
        total_ingredients: totalIngredients,
        missing_ingredients: missingIngredients,
      };
    })
    .sort((left, right) => {
      if (left.match_score !== right.match_score) {
        return right.match_score - left.match_score;
      }

      if (left.matched_ingredients !== right.matched_ingredients) {
        return right.matched_ingredients - left.matched_ingredients;
      }

      return left.id.localeCompare(right.id);
    });

  return ok({
    items: paginateItems(items, cursor, limit),
  } satisfies PantryMatchListData);
}
