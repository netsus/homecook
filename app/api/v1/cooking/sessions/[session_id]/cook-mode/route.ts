import { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/response";
import {
  isUuid,
  toCookingModeIngredient,
  toCookingModeStep,
  type CookingIngredientRow,
  type CookingStepRow,
} from "@/lib/server/cooking";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { CookingSessionCookModeData, CookingSessionStatus } from "@/types/cooking";

interface RouteContext {
  params: Promise<{
    session_id: string;
  }>;
}

interface QueryError {
  message: string;
}

interface SessionRow {
  id: string;
  user_id: string;
  status: CookingSessionStatus;
}

interface SessionMealRow {
  meal_id: string;
  recipe_id: string;
  cooking_servings: number;
}

interface RecipeRow {
  id: string;
  title: string;
  base_servings: number;
}

type ArrayResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

type MaybeSingleResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

interface QueryOrderOption {
  ascending: boolean;
}

interface SessionSelectQuery {
  eq(column: string, value: string): SessionSelectQuery;
  maybeSingle(): MaybeSingleResult<SessionRow>;
}

interface SessionMealsSelectQuery {
  eq(column: string, value: string): SessionMealsSelectQuery;
  then: ArrayResult<SessionMealRow>["then"];
}

interface RecipeSelectQuery {
  eq(column: string, value: string): RecipeSelectQuery;
  maybeSingle(): MaybeSingleResult<RecipeRow>;
}

interface IngredientsSelectQuery {
  eq(column: string, value: string): IngredientsSelectQuery;
  order(column: string, options: QueryOrderOption): IngredientsSelectQuery;
  then: ArrayResult<CookingIngredientRow>["then"];
}

interface StepsSelectQuery {
  eq(column: string, value: string): StepsSelectQuery;
  order(column: string, options: QueryOrderOption): StepsSelectQuery;
  then: ArrayResult<CookingStepRow>["then"];
}

interface CookingSessionsTable {
  select(columns: string): SessionSelectQuery;
}

interface CookingSessionMealsTable {
  select(columns: string): SessionMealsSelectQuery;
}

interface RecipesTable {
  select(columns: string): RecipeSelectQuery;
}

interface RecipeIngredientsTable {
  select(columns: string): IngredientsSelectQuery;
}

interface RecipeStepsTable {
  select(columns: string): StepsSelectQuery;
}

interface CookModeDbClient {
  from(table: "cooking_sessions"): CookingSessionsTable;
  from(table: "cooking_session_meals"): CookingSessionMealsTable;
  from(table: "recipes"): RecipesTable;
  from(table: "recipe_ingredients"): RecipeIngredientsTable;
  from(table: "recipe_steps"): RecipeStepsTable;
}

async function requireUser(routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>>) {
  const authResult = await routeClient.auth.getUser();
  return authResult.data.user;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { session_id: sessionId } = await context.params;

  if (!isUuid(sessionId)) {
    return fail("RESOURCE_NOT_FOUND", "요리 세션을 찾을 수 없어요.", 404);
  }

  const routeClient = await createRouteHandlerClient();
  const user = await requireUser(routeClient);

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    CookModeDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "요리모드 데이터를 불러오지 못했어요."),
      500,
    );
  }

  const sessionResult = await dbClient
    .from("cooking_sessions")
    .select("id, user_id, status")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionResult.error) {
    return fail("INTERNAL_ERROR", "요리모드 데이터를 불러오지 못했어요.", 500);
  }

  if (!sessionResult.data) {
    return fail("RESOURCE_NOT_FOUND", "요리 세션을 찾을 수 없어요.", 404);
  }

  if (sessionResult.data.user_id !== user.id) {
    return fail("FORBIDDEN", "내 요리 세션만 볼 수 있어요.", 403);
  }

  if (sessionResult.data.status !== "in_progress") {
    return fail(
      "CONFLICT",
      "이미 종료된 요리 세션이에요. 요리 준비 리스트에서 다시 시작해 주세요.",
      409,
    );
  }

  const sessionMealsResult = await dbClient
    .from("cooking_session_meals")
    .select("meal_id, recipe_id, cooking_servings")
    .eq("session_id", sessionId);

  if (sessionMealsResult.error || !sessionMealsResult.data || sessionMealsResult.data.length === 0) {
    return fail("INTERNAL_ERROR", "요리모드 데이터를 불러오지 못했어요.", 500);
  }

  const sessionMeal = sessionMealsResult.data[0]!;
  const recipeResult = await dbClient
    .from("recipes")
    .select("id, title, base_servings")
    .eq("id", sessionMeal.recipe_id)
    .maybeSingle();

  if (recipeResult.error || !recipeResult.data) {
    return fail("INTERNAL_ERROR", "요리모드 데이터를 불러오지 못했어요.", 500);
  }

  const ingredientsResult = await dbClient
    .from("recipe_ingredients")
    .select("ingredient_id, amount, unit, display_text, ingredient_type, scalable, sort_order, ingredients(standard_name)")
    .eq("recipe_id", sessionMeal.recipe_id)
    .order("sort_order", { ascending: true });

  if (ingredientsResult.error || !ingredientsResult.data) {
    return fail("INTERNAL_ERROR", "요리모드 데이터를 불러오지 못했어요.", 500);
  }

  const stepsResult = await dbClient
    .from("recipe_steps")
    .select("step_number, instruction, ingredients_used, heat_level, duration_seconds, duration_text, cooking_methods(code, label, color_key)")
    .eq("recipe_id", sessionMeal.recipe_id)
    .order("step_number", { ascending: true });

  if (stepsResult.error || !stepsResult.data) {
    return fail("INTERNAL_ERROR", "요리모드 데이터를 불러오지 못했어요.", 500);
  }

  return ok<CookingSessionCookModeData>({
    session_id: sessionId,
    recipe: {
      id: recipeResult.data.id,
      title: recipeResult.data.title,
      cooking_servings: sessionMeal.cooking_servings,
      ingredients: ingredientsResult.data.map((row) =>
        toCookingModeIngredient({
          row,
          baseServings: recipeResult.data!.base_servings,
          cookingServings: sessionMeal.cooking_servings,
        }),
      ),
      steps: stepsResult.data.map((row) => toCookingModeStep(row)),
    },
  });
}
