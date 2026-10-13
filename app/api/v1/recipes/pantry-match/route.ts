import { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/response";
import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { getQaFixtureRecipeDetail, isQaFixtureModeEnabled } from "@/lib/mock/recipes";
import { recipeIngredientSourceId } from "@/lib/recipe-ingredient-source";
import { readRecipeProductLabels, recipeProductLabel } from "@/lib/server/recipe-product-labels";
import { normalizeFoodSafetyImageUrl } from "@/lib/recipe-image";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import type { PantryMatchListData, PantryMatchRecipeItem } from "@/types/recipe";

interface QueryError {
  message: string;
}

interface PantryItemRow {
  ingredient_id: string;
}

interface SourceRow {
  ingredient_id: string | null;
  food_product_id?: string | null;
  food_product_nutrition_version_id?: string | null;
}
interface RecipeIngredientRow extends SourceRow {
  id?: string;
  recipe_id: string;
  display_text?: string | null;
  food_product_name?: string | null;
  food_product_brand?: string | null;
}
interface PantrySourcesQuery extends ArrayResult<SourceRow> {
  eq(column: string, value: string): PantrySourcesQuery;
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
  from(table: "recipe_ingredients"): RecipeIngredientsTable;
  from(table: "pantry_items"): { select(columns: string): PantrySourcesQuery };
  from(table: "recipes"): RecipesTable;
  from(table: "ingredients"): IngredientsTable;
  rpc(
    functionName: "select_pantry_effective_ingredients",
    args: { p_user_id: string },
  ): ArrayResult<PantryItemRow>;
}

function asPantryMatchDbClient(value: unknown) {
  return value as PantryMatchDbClient & UserBootstrapDbClient;
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
    id: recipeIngredientSourceId(ingredient),
    standard_name: ingredient.standard_name,
  }));

  return [
    {
      id: detail.id,
      title: detail.title,
      thumbnail_url: normalizeFoodSafetyImageUrl(detail.thumbnail_url),
      match_score: Number(((totalIngredients - missing.length) / totalIngredients).toFixed(2)),
      matched_ingredients: totalIngredients - missing.length,
      total_ingredients: totalIngredients,
      missing_ingredients: missing,
    },
  ] satisfies PantryMatchRecipeItem[];
}

function sourceKey(row: SourceRow) {
  return row.food_product_id && row.food_product_nutrition_version_id
    ? JSON.stringify(["food_product", row.food_product_id, row.food_product_nutrition_version_id])
    : row.ingredient_id ? JSON.stringify(["ingredient", row.ingredient_id]) : null;
}

function collectRecipeIngredientSets(rows: RecipeIngredientRow[]) {
  const map = new Map<string, Set<string>>();

  rows.forEach((row) => {
    if (!map.has(row.recipe_id)) {
      map.set(row.recipe_id, new Set<string>());
    }

    const key = sourceKey(row);
    if (key) map.get(row.recipe_id)?.add(key);
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

  const dbClient = asPantryMatchDbClient(routeClient);

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

  const pantryItemsResult = await dbClient.rpc(
    "select_pantry_effective_ingredients",
    { p_user_id: user.id },
  );

  if (pantryItemsResult.error || !pantryItemsResult.data) {
    return fail("INTERNAL_ERROR", "팬트리 기반 추천을 불러오지 못했어요.", 500);
  }

  const pantrySourcesResult = await dbClient.from("pantry_items")
    .select("ingredient_id, food_product_id, food_product_nutrition_version_id")
    .eq("user_id", user.id);
  if (pantrySourcesResult.error || !pantrySourcesResult.data) {
    return fail("INTERNAL_ERROR", "팬트리 기반 추천을 불러오지 못했어요.", 500);
  }
  const pantryIngredientIds = [...new Set(pantryItemsResult.data.map((item) => item.ingredient_id))];
  const pantryProducts = pantrySourcesResult.data.filter((item) => item.food_product_id && item.food_product_nutrition_version_id);
  const pantryKeys = new Set([
    ...pantryIngredientIds.map((id) => JSON.stringify(["ingredient", id])),
    ...pantryProducts.flatMap((item) => { const key = sourceKey(item); return key ? [key] : []; }),
  ]);
  if (pantryKeys.size === 0) return ok({ items: [] } satisfies PantryMatchListData);

  const columns = "id, recipe_id, ingredient_id, food_product_id, food_product_nutrition_version_id, display_text";
  const matchedRows: RecipeIngredientRow[] = [];
  if (pantryIngredientIds.length) {
    const result = await dbClient.from("recipe_ingredients").select(columns).in("ingredient_id", pantryIngredientIds);
    if (result.error || !result.data) return fail("INTERNAL_ERROR", "팬트리 기반 추천을 불러오지 못했어요.", 500);
    matchedRows.push(...result.data);
  }
  if (pantryProducts.length) {
    const result = await dbClient.from("recipe_ingredients").select(columns)
      .in("food_product_id", [...new Set(pantryProducts.flatMap((row) => row.food_product_id ? [row.food_product_id] : []))]);
    if (result.error || !result.data) return fail("INTERNAL_ERROR", "팬트리 기반 추천을 불러오지 못했어요.", 500);
    matchedRows.push(...result.data);
  }
  const matchedByRecipe = collectRecipeIngredientSets(matchedRows.filter((row) => {
    const key = sourceKey(row); return key !== null && pantryKeys.has(key);
  }));
  const candidateRecipeIds = [...matchedByRecipe.keys()];
  if (!candidateRecipeIds.length) return ok({ items: [] } satisfies PantryMatchListData);
  const recipeIngredientsResult = await dbClient.from("recipe_ingredients").select(columns).in("recipe_id", candidateRecipeIds);
  if (recipeIngredientsResult.error || !recipeIngredientsResult.data) {
    return fail("INTERNAL_ERROR", "팬트리 기반 추천을 불러오지 못했어요.", 500);
  }
  let sourceRows: RecipeIngredientRow[];
  try {
    sourceRows = await readRecipeProductLabels(routeClient, recipeIngredientsResult.data);
  } catch {
    return fail("INTERNAL_ERROR", "팬트리 기반 추천을 불러오지 못했어요.", 500);
  }
  const totalByRecipe = collectRecipeIngredientSets(sourceRows);
  const byKey = new Map(sourceRows.flatMap((row) => { const key = sourceKey(row); return key ? [[key, row] as const] : []; }));
  const missingIngredientIds = [...new Set(sourceRows.flatMap((row) => {
    const key = sourceKey(row);
    return key && !pantryKeys.has(key) && !row.food_product_id && row.ingredient_id ? [row.ingredient_id] : [];
  }))];
  const ingredientNameById = new Map<string, string>();
  if (missingIngredientIds.length) {
    const result = await dbClient.from("ingredients").select("id, standard_name").in("id", missingIngredientIds);
    if (result.error || !result.data) return fail("INTERNAL_ERROR", "팬트리 기반 추천을 불러오지 못했어요.", 500);
    result.data.forEach((row) => ingredientNameById.set(row.id, row.standard_name));
  }

  const recipesResult = await dbClient
    .from("recipes")
    .select("id, title, thumbnail_url")
    .in("id", candidateRecipeIds);

  if (recipesResult.error || !recipesResult.data) {
    return fail("INTERNAL_ERROR", "팬트리 기반 추천을 불러오지 못했어요.", 500);
  }

  const items = recipesResult.data
    .map((recipe) => {
      const matchedIngredientIds = matchedByRecipe.get(recipe.id) ?? new Set<string>();
      const totalIngredientIds = totalByRecipe.get(recipe.id) ?? new Set<string>();
      const missingIngredients: PantryMatchRecipeItem["missing_ingredients"] = [];
      for (const key of totalIngredientIds) {
        if (!pantryKeys.has(key)) {
          const row = byKey.get(key);
          if (!row) throw new Error("RECIPE_SOURCE_ROW_MISSING");
          const missing: PantryMatchRecipeItem["missing_ingredients"][number] = {
            id: recipeIngredientSourceId(row),
            standard_name: recipeProductLabel(row) ?? (row.ingredient_id ? ingredientNameById.get(row.ingredient_id) : null) ?? row.display_text ?? "제품",
          };
          if (row.food_product_id) {
            missing.source_kind = "food_product";
            missing.food_product_id = row.food_product_id;
            missing.food_product_nutrition_version_id = row.food_product_nutrition_version_id ?? null;
            missing.row_key = row.id;
          }
          missingIngredients.push(missing);
        }
      }
      const totalIngredients = totalIngredientIds.size;
      const matchedIngredients = Math.min(matchedIngredientIds.size, totalIngredients);

      return {
        id: recipe.id,
        title: recipe.title,
        thumbnail_url: normalizeFoodSafetyImageUrl(recipe.thumbnail_url),
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
