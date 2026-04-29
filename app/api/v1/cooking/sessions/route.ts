import { fail, ok } from "@/lib/api/response";
import { parseCookingSessionBody } from "@/lib/server/cooking";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type {
  CookingSessionCreateBody,
  CookingSessionCreateData,
  CookingSessionMealData,
} from "@/types/cooking";

interface QueryError {
  message: string;
}

interface RecipeRow {
  id: string;
}

interface MealRow {
  id: string;
  user_id: string;
  recipe_id: string;
  status: string;
}

interface SessionInsertRow {
  id: string;
  status: "in_progress";
}

interface SessionMealInsertRow {
  meal_id: string;
  is_cooked: boolean;
}

type ArrayResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

type MaybeSingleResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

interface RecipesSelectQuery {
  eq(column: string, value: string): RecipesSelectQuery;
  maybeSingle(): MaybeSingleResult<RecipeRow>;
}

interface MealsSelectQuery {
  in(column: string, values: string[]): MealsSelectQuery;
  then: ArrayResult<MealRow>["then"];
}

interface SessionsInsertQuery {
  select(columns: string): SessionsInsertQuery;
  maybeSingle(): MaybeSingleResult<SessionInsertRow>;
}

interface SessionMealsInsertQuery {
  select(columns: string): ArrayResult<SessionMealInsertRow>;
}

interface RecipesTable {
  select(columns: string): RecipesSelectQuery;
}

interface MealsTable {
  select(columns: string): MealsSelectQuery;
}

interface CookingSessionsTable {
  insert(value: { user_id: string; status: "in_progress" }): SessionsInsertQuery;
}

interface CookingSessionMealsTable {
  insert(values: Array<{
    session_id: string;
    meal_id: string;
    recipe_id: string;
    cooking_servings: number;
    is_cooked: false;
  }>): SessionMealsInsertQuery;
}

interface CookingSessionDbClient {
  from(table: "recipes"): RecipesTable;
  from(table: "meals"): MealsTable;
  from(table: "cooking_sessions"): CookingSessionsTable;
  from(table: "cooking_session_meals"): CookingSessionMealsTable;
}

async function requireUser(routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>>) {
  const authResult = await routeClient.auth.getUser();
  return authResult.data.user;
}

async function readCreateBody(request: Request) {
  try {
    return (await request.json()) as CookingSessionCreateBody;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = await readCreateBody(request);

  if (!body) {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해주세요.", 422, [
      { field: "body", reason: "invalid_json" },
    ]);
  }

  const parsed = parseCookingSessionBody(body);

  if (!parsed.data) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해주세요.", 422, parsed.fields);
  }

  const sessionInput = parsed.data;
  const routeClient = await createRouteHandlerClient();
  const user = await requireUser(routeClient);

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    CookingSessionDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "요리 세션을 만들지 못했어요."),
      500,
    );
  }

  const recipeResult = await dbClient
    .from("recipes")
    .select("id")
    .eq("id", sessionInput.recipe_id)
    .maybeSingle();

  if (recipeResult.error) {
    return fail("INTERNAL_ERROR", "요리 세션을 만들지 못했어요.", 500);
  }

  if (!recipeResult.data) {
    return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
  }

  const mealsResult = await dbClient
    .from("meals")
    .select("id, user_id, recipe_id, status")
    .in("id", sessionInput.meal_ids);

  if (mealsResult.error || !mealsResult.data) {
    return fail("INTERNAL_ERROR", "요리 세션을 만들지 못했어요.", 500);
  }

  if (mealsResult.data.length !== sessionInput.meal_ids.length) {
    return fail("RESOURCE_NOT_FOUND", "식사를 찾을 수 없어요.", 404);
  }

  if (mealsResult.data.some((meal) => meal.user_id !== user.id)) {
    return fail("FORBIDDEN", "내 식사만 요리 세션으로 만들 수 있어요.", 403);
  }

  if (mealsResult.data.some((meal) => meal.status !== "shopping_done")) {
    return fail("CONFLICT", "장보기가 완료된 식사만 요리할 수 있어요.", 409);
  }

  if (mealsResult.data.some((meal) => meal.recipe_id !== sessionInput.recipe_id)) {
    return fail("VALIDATION_ERROR", "같은 레시피의 식사만 함께 요리할 수 있어요.", 422, [
      { field: "meal_ids", reason: "recipe_mismatch" },
    ]);
  }

  const sessionResult = await dbClient
    .from("cooking_sessions")
    .insert({
      user_id: user.id,
      status: "in_progress",
    })
    .select("id, status")
    .maybeSingle();

  if (sessionResult.error || !sessionResult.data) {
    return fail("INTERNAL_ERROR", "요리 세션을 만들지 못했어요.", 500);
  }

  const sessionMealRows: Array<{
    session_id: string;
    meal_id: string;
    recipe_id: string;
    cooking_servings: number;
    is_cooked: false;
  }> = sessionInput.meal_ids.map((mealId) => ({
    session_id: sessionResult.data!.id,
    meal_id: mealId,
    recipe_id: sessionInput.recipe_id,
    cooking_servings: sessionInput.cooking_servings,
    is_cooked: false,
  }));
  const sessionMealsResult = await dbClient
    .from("cooking_session_meals")
    .insert(sessionMealRows)
    .select("meal_id, is_cooked");

  if (sessionMealsResult.error || !sessionMealsResult.data) {
    return fail("INTERNAL_ERROR", "요리 세션을 만들지 못했어요.", 500);
  }

  const data: CookingSessionCreateData = {
    session_id: sessionResult.data.id,
    recipe_id: sessionInput.recipe_id,
    status: "in_progress",
    cooking_servings: sessionInput.cooking_servings,
    meals: sessionMealsResult.data.map((meal): CookingSessionMealData => ({
      meal_id: meal.meal_id,
      is_cooked: meal.is_cooked,
    })),
  };

  return ok(data, { status: 201 });
}
