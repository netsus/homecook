import { NextRequest } from "next/server";

import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { buildFixedPlannerColumns } from "@/lib/planner/fixed-slots";
import { fail, ok } from "@/lib/api/response";
import { getQaFixturePlannerData, isQaFixtureModeEnabled } from "@/lib/mock/recipes";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { MealStatus, PlannerData, PlannerMealData } from "@/types/planner";

interface QueryError {
  message: string;
}

interface QueryOrderOption {
  ascending: boolean;
}

interface PlannerColumnRow {
  id: string;
  name: string;
  sort_order: number;
}

interface PlannerMealRow {
  id: string;
  recipe_id: string;
  plan_date: string;
  column_id: string;
  planned_servings: number;
  status: string;
  is_leftover: boolean;
  shopping_list_id: string | null;
  created_at: string;
}

interface RecipeRow {
  id: string;
  title: string;
  thumbnail_url: string | null;
}

interface ShoppingListRow {
  id: string;
  title: string;
}

type ArrayQueryResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

interface PlannerColumnsSelectQuery {
  eq(column: string, value: string): PlannerColumnsSelectQuery;
  order(column: string, options: QueryOrderOption): PlannerColumnsSelectQuery;
  then: ArrayQueryResult<PlannerColumnRow>["then"];
}

interface PlannerMealsSelectQuery {
  eq(column: string, value: string): PlannerMealsSelectQuery;
  gte(column: string, value: string): PlannerMealsSelectQuery;
  lte(column: string, value: string): PlannerMealsSelectQuery;
  order(column: string, options: QueryOrderOption): PlannerMealsSelectQuery;
  then: ArrayQueryResult<PlannerMealRow>["then"];
}

interface RecipesSelectQuery {
  in(column: string, values: string[]): RecipesSelectQuery;
  then: ArrayQueryResult<RecipeRow>["then"];
}

interface ShoppingListsSelectQuery {
  in(column: string, values: string[]): ShoppingListsSelectQuery;
  then: ArrayQueryResult<ShoppingListRow>["then"];
}

interface PlannerColumnsTable {
  select(columns: string): PlannerColumnsSelectQuery;
}

interface PlannerMealsTable {
  select(columns: string): PlannerMealsSelectQuery;
}

interface RecipesTable {
  select(columns: string): RecipesSelectQuery;
}

interface ShoppingListsTable {
  select(columns: string): ShoppingListsSelectQuery;
}

interface PlannerDbClient {
  from(table: "meal_plan_columns"): PlannerColumnsTable;
  from(table: "meals"): PlannerMealsTable;
  from(table: "recipes"): RecipesTable;
  from(table: "shopping_lists"): ShoppingListsTable;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateString(value: string) {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.toISOString().slice(0, 10) === value;
}

function normalizeMealStatus(status: string): MealStatus {
  if (status === "shopping_done" || status === "cook_done") {
    return status;
  }

  return "registered";
}

function toPlannerMeal(
  meal: PlannerMealRow,
  recipeMap: Map<string, RecipeRow>,
  shoppingListMap: Map<string, ShoppingListRow>,
): PlannerMealData {
  const recipe = recipeMap.get(meal.recipe_id);
  const shoppingList = meal.shopping_list_id ? shoppingListMap.get(meal.shopping_list_id) : null;

  return {
    id: meal.id,
    recipe_id: meal.recipe_id,
    recipe_title: recipe?.title ?? "",
    recipe_thumbnail_url: recipe?.thumbnail_url ?? null,
    plan_date: meal.plan_date,
    column_id: meal.column_id,
    planned_servings: meal.planned_servings,
    status: normalizeMealStatus(meal.status),
    is_leftover: meal.is_leftover,
    shopping_list_id: meal.shopping_list_id ?? null,
    shopping_list_title: shoppingList?.title ?? null,
  };
}

function parseDateRange(request: NextRequest) {
  const startDate = request.nextUrl.searchParams.get("start_date");
  const endDate = request.nextUrl.searchParams.get("end_date");

  if (!startDate || !isValidDateString(startDate)) {
    return {
      ok: false as const,
      fields: [{ field: "start_date", reason: "invalid_date" }],
    };
  }

  if (!endDate || !isValidDateString(endDate)) {
    return {
      ok: false as const,
      fields: [{ field: "end_date", reason: "invalid_date" }],
    };
  }

  if (startDate > endDate) {
    return {
      ok: false as const,
      fields: [{ field: "date_range", reason: "start_after_end" }],
    };
  }

  return {
    ok: true as const,
    startDate,
    endDate,
  };
}

export async function GET(request: NextRequest) {
  const dateRange = parseDateRange(request);

  if (!dateRange.ok) {
    return fail("VALIDATION_ERROR", "날짜 범위를 확인해주세요.", 422, dateRange.fields);
  }

  if (isQaFixtureModeEnabled()) {
    const authOverride = readE2EAuthOverrideHeader(request.headers);

    if (authOverride !== "authenticated") {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }

    return ok(getQaFixturePlannerData(dateRange.startDate, dateRange.endDate));
  }

  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    PlannerDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "플래너를 불러오지 못했어요."),
      500,
    );
  }

  const columnsResult = await dbClient
    .from("meal_plan_columns")
    .select("id, name, sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (columnsResult.error || !columnsResult.data) {
    return fail("INTERNAL_ERROR", "플래너를 불러오지 못했어요.", 500);
  }

  const mealsResult = await dbClient
    .from("meals")
    .select("id, recipe_id, plan_date, column_id, planned_servings, status, is_leftover, shopping_list_id, created_at")
    .eq("user_id", user.id)
    .gte("plan_date", dateRange.startDate)
    .lte("plan_date", dateRange.endDate)
    .order("plan_date", { ascending: true })
    .order("column_id", { ascending: true })
    .order("created_at", { ascending: true });

  if (mealsResult.error || !mealsResult.data) {
    return fail("INTERNAL_ERROR", "플래너를 불러오지 못했어요.", 500);
  }

  const recipeIds = [...new Set(mealsResult.data.map((meal) => meal.recipe_id))];
  const shoppingListIds = [
    ...new Set(
      mealsResult.data
        .map((meal) => meal.shopping_list_id)
        .filter((listId): listId is string => typeof listId === "string" && listId.length > 0),
    ),
  ];
  const recipeMap = new Map<string, RecipeRow>();
  const shoppingListMap = new Map<string, ShoppingListRow>();

  if (recipeIds.length > 0) {
    const recipesResult = await dbClient
      .from("recipes")
      .select("id, title, thumbnail_url")
      .in("id", recipeIds);

    if (recipesResult.error || !recipesResult.data) {
      return fail("INTERNAL_ERROR", "플래너를 불러오지 못했어요.", 500);
    }

    recipesResult.data.forEach((recipe) => {
      recipeMap.set(recipe.id, recipe);
    });
  }

  if (shoppingListIds.length > 0) {
    const shoppingListsResult = await dbClient
      .from("shopping_lists")
      .select("id, title")
      .in("id", shoppingListIds);

    if (shoppingListsResult.error || !shoppingListsResult.data) {
      return fail("INTERNAL_ERROR", "플래너를 불러오지 못했어요.", 500);
    }

    shoppingListsResult.data.forEach((shoppingList) => {
      shoppingListMap.set(shoppingList.id, shoppingList);
    });
  }

  const normalizedColumns = buildFixedPlannerColumns(columnsResult.data);
  const responseData: PlannerData = {
    columns: normalizedColumns.columns,
    meals: mealsResult.data.map((meal) =>
      toPlannerMeal(
        {
          ...meal,
          shopping_list_id: meal.shopping_list_id ?? null,
          column_id: normalizedColumns.getFixedColumnId(meal.column_id),
        },
        recipeMap,
        shoppingListMap,
      )),
  };

  return ok(responseData);
}
