import { fail, ok } from "@/lib/api/response";
import { buildReadyRecipes, todayDateString } from "@/lib/server/cooking";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { CookingReadyData } from "@/types/cooking";

interface QueryError {
  message: string;
}

interface ReadyMealRow {
  id: string;
  recipe_id: string;
  plan_date: string;
  planned_servings: number;
}

interface RecipeRow {
  id: string;
  title: string;
  thumbnail_url: string | null;
}

type ArrayResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

interface QueryOrderOption {
  ascending: boolean;
}

interface MealsSelectQuery {
  eq(column: string, value: string): MealsSelectQuery;
  gte(column: string, value: string): MealsSelectQuery;
  order(column: string, options: QueryOrderOption): MealsSelectQuery;
  then: ArrayResult<ReadyMealRow>["then"];
}

interface RecipesSelectQuery {
  in(column: string, values: string[]): RecipesSelectQuery;
  then: ArrayResult<RecipeRow>["then"];
}

interface MealsTable {
  select(columns: string): MealsSelectQuery;
}

interface RecipesTable {
  select(columns: string): RecipesSelectQuery;
}

interface CookingReadyDbClient {
  from(table: "meals"): MealsTable;
  from(table: "recipes"): RecipesTable;
}

async function requireUser(routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>>) {
  const authResult = await routeClient.auth.getUser();
  return authResult.data.user;
}

export async function GET() {
  const routeClient = await createRouteHandlerClient();
  const user = await requireUser(routeClient);

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    CookingReadyDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "요리 준비 리스트를 불러오지 못했어요."),
      500,
    );
  }

  const today = todayDateString();
  const mealsResult = await dbClient
    .from("meals")
    .select("id, recipe_id, plan_date, planned_servings")
    .eq("user_id", user.id)
    .eq("status", "shopping_done")
    .gte("plan_date", today)
    .order("plan_date", { ascending: true })
    .order("id", { ascending: true });

  if (mealsResult.error || !mealsResult.data) {
    return fail("INTERNAL_ERROR", "요리 준비 리스트를 불러오지 못했어요.", 500);
  }

  const recipeIds = [...new Set(mealsResult.data.map((meal) => meal.recipe_id))];
  const recipeRows: RecipeRow[] = [];

  if (recipeIds.length > 0) {
    const recipesResult = await dbClient
      .from("recipes")
      .select("id, title, thumbnail_url")
      .in("id", recipeIds);

    if (recipesResult.error || !recipesResult.data) {
      return fail("INTERNAL_ERROR", "요리 준비 리스트를 불러오지 못했어요.", 500);
    }

    recipeRows.push(...recipesResult.data);
  }

  const dateRangeEnd =
    mealsResult.data.length > 0
      ? [...mealsResult.data.map((meal) => meal.plan_date)].sort().at(-1) ?? today
      : today;
  const data: CookingReadyData = {
    date_range: {
      start: today,
      end: dateRangeEnd,
    },
    recipes: buildReadyRecipes({
      meals: mealsResult.data,
      recipes: recipeRows,
    }),
  };

  return ok(data);
}
