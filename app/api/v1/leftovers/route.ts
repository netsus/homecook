import { NextRequest } from "next/server";

import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { fail, ok } from "@/lib/api/response";
import { getQaFixtureLeftovers, isQaFixtureModeEnabled } from "@/lib/mock/recipes";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import {
  normalizeLeftoverStatus,
  projectLeftoverCompatibilityStatus,
  toLeftoverListItem,
  type LeftoverDishRow,
  type LeftoverOriginMealRow,
  type LeftoverRecipeRow,
  type LeftoverSourceMealRow,
} from "@/lib/server/leftovers";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import type { LeftoverListData } from "@/types/leftover";

interface QueryError {
  code?: string;
  message: string;
}

type ArrayQueryResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

interface QueryOrderOption {
  ascending: boolean;
}

interface LeftoverSelectQuery {
  eq(column: string, value: string): LeftoverSelectQuery;
  gt(column: string, value: string): LeftoverSelectQuery;
  or(filters: string): LeftoverSelectQuery;
  order(column: string, options: QueryOrderOption): LeftoverSelectQuery;
  then: ArrayQueryResult<LeftoverDishRow>["then"];
}

interface RecipeSelectQuery {
  in(column: string, values: string[]): RecipeSelectQuery;
  then: ArrayQueryResult<LeftoverRecipeRow>["then"];
}

interface SourceMealSelectQuery {
  eq(column: string, value: string): SourceMealSelectQuery;
  in(column: string, values: string[]): SourceMealSelectQuery;
  order(column: string, options: QueryOrderOption): SourceMealSelectQuery;
  then: ArrayQueryResult<LeftoverSourceMealRow>["then"];
}

interface OriginMealSelectQuery {
  in(column: string, values: string[]): OriginMealSelectQuery;
  order(column: string, options: QueryOrderOption): OriginMealSelectQuery;
  then: ArrayQueryResult<LeftoverOriginMealRow>["then"];
}

interface LeftoverDishesTable {
  select(columns: string): LeftoverSelectQuery;
}

interface RecipesTable {
  select(columns: string): RecipeSelectQuery;
}

interface RecipeContentSnapshotsSelectQuery {
  in(column: string, values: string[]): RecipeContentSnapshotsSelectQuery;
  then: ArrayQueryResult<{ id: string; recipe_id: string; title: string }>["then"];
}

interface RecipeContentSnapshotsTable {
  select(columns: string): RecipeContentSnapshotsSelectQuery;
}

interface MealsTable {
  select(columns: string): SourceMealSelectQuery;
}

interface CookingSessionMealsTable {
  select(columns: string): OriginMealSelectQuery;
}

interface LeftoversDbClient {
  from(table: "leftover_dishes"): LeftoverDishesTable;
  from(table: "recipes"): RecipesTable;
  from(table: "recipe_content_snapshots"): RecipeContentSnapshotsTable;
  from(table: "meals"): MealsTable;
  from(table: "cooking_session_meals"): CookingSessionMealsTable;
}

async function requireUser(routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>>) {
  const authResult = await routeClient.auth.getUser();
  return authResult.data.user;
}

export async function GET(request: NextRequest) {
  const status = normalizeLeftoverStatus(request.nextUrl.searchParams.get("status"));

  if (!status) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해 주세요.", 422, [
      { field: "status", reason: "invalid_value" },
    ]);
  }

  if (isQaFixtureModeEnabled()) {
    const authOverride = readE2EAuthOverrideHeader(request.headers);

    if (authOverride !== "authenticated") {
      return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
    }

    return ok(getQaFixtureLeftovers(status) satisfies LeftoverListData);
  }

  const routeClient = await createRouteHandlerClient();
  const user = await requireUser(routeClient);

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = routeClient as unknown as
    LeftoversDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "남은 요리 목록을 불러오지 못했어요."),
      500,
    );
  }

  let leftoversQuery = dbClient
    .from("leftover_dishes")
    .select(
      "id, user_id, recipe_id, recipe_content_snapshot_id, status, cooked_at, eaten_at, auto_hide_at, stale_reviewed_at, cooking_servings, weight_status, batch_status, depleted_reason",
    )
    .eq("user_id", user.id);

  if (status === "eaten") {
    leftoversQuery = leftoversQuery
      .or("and(recipe_content_snapshot_id.is.null,status.eq.eaten),and(recipe_content_snapshot_id.not.is.null,batch_status.eq.depleted,depleted_reason.in.(consumed,consumed_unweighed))")
      .gt("auto_hide_at", new Date().toISOString())
      .order("eaten_at", { ascending: false })
      .order("id", { ascending: false });
  } else {
    leftoversQuery = leftoversQuery
      .or("and(recipe_content_snapshot_id.is.null,status.eq.leftover),and(recipe_content_snapshot_id.not.is.null,batch_status.eq.available),and(recipe_content_snapshot_id.not.is.null,batch_status.eq.depleted,depleted_reason.in.(discarded,mixed,discarded_unweighed,mixed_unweighed))")
      .order("cooked_at", { ascending: false })
      .order("id", { ascending: false });
  }

  const leftoversResult = await leftoversQuery;

  if (leftoversResult.error || !leftoversResult.data) {
    return fail("INTERNAL_ERROR", "남은 요리 목록을 불러오지 못했어요.", 500);
  }

  const visibleLeftovers = leftoversResult.data
    .map((row) => ({
      ...row,
      status: projectLeftoverCompatibilityStatus(row),
    }))
    .filter((row) => row.status === status);

  const recipeIds = [...new Set(visibleLeftovers.map((item) => item.recipe_id))];
  const leftoverIds = visibleLeftovers.map((item) => item.id);
  const recipeMap = new Map<string, LeftoverRecipeRow>();
  const sourceMealMap = new Map<string, LeftoverSourceMealRow>();
  const contentSnapshotIds = [
    ...new Set(
      visibleLeftovers
        .map((item) => item.recipe_content_snapshot_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  ];
  const contentSnapshotMap = new Map<string, { id: string; recipe_id: string; title: string }>();

  if (recipeIds.length > 0) {
    const recipesResult = await dbClient
      .from("recipes")
      .select("id, title, thumbnail_url")
      .in("id", recipeIds);

    if (recipesResult.error || !recipesResult.data) {
      return fail("INTERNAL_ERROR", "남은 요리 목록을 불러오지 못했어요.", 500);
    }

    recipesResult.data.forEach((recipe) => {
      recipeMap.set(recipe.id, recipe);
    });
  }

  if (contentSnapshotIds.length > 0) {
    const contentSnapshotsResult = await dbClient
      .from("recipe_content_snapshots")
      .select("id, recipe_id, title")
      .in("id", contentSnapshotIds);

    if (contentSnapshotsResult.error || !contentSnapshotsResult.data) {
      return fail("INTERNAL_ERROR", "남은 요리 목록을 불러오지 못했어요.", 500);
    }

    contentSnapshotsResult.data.forEach((snapshot) => {
      contentSnapshotMap.set(snapshot.id, snapshot);
    });

    if (visibleLeftovers.some((item) =>
      item.recipe_content_snapshot_id !== null &&
      item.recipe_content_snapshot_id !== undefined &&
      !contentSnapshotMap.has(item.recipe_content_snapshot_id)
    )) {
      return fail("INTERNAL_ERROR", "남은 요리 목록을 불러오지 못했어요.", 500);
    }
  }

  if (leftoverIds.length > 0) {
    const sourceMealsResult = await dbClient
      .from("meals")
      .select("leftover_dish_id, planned_servings, meal_plan_columns(name)")
      .eq("user_id", user.id)
      .in("leftover_dish_id", leftoverIds)
      .order("cooked_at", { ascending: false })
      .order("id", { ascending: false });

    if (!sourceMealsResult.error && sourceMealsResult.data) {
      sourceMealsResult.data.forEach((meal) => {
        if (meal.leftover_dish_id && !sourceMealMap.has(meal.leftover_dish_id)) {
          sourceMealMap.set(meal.leftover_dish_id, meal);
        }
      });
    }

    const originMealsResult = await dbClient
      .from("cooking_session_meals")
      .select("session_id, meals(planned_servings, meal_plan_columns(name))")
      .in("session_id", leftoverIds)
      .order("cooked_at", { ascending: false })
      .order("id", { ascending: false });

    if (!originMealsResult.error && originMealsResult.data) {
      originMealsResult.data.forEach((originMeal) => {
        const originSourceMeal = Array.isArray(originMeal.meals)
          ? originMeal.meals[0]
          : originMeal.meals;

        if (
          !originMeal.session_id ||
          sourceMealMap.has(originMeal.session_id) ||
          !originSourceMeal
        ) {
          return;
        }

        sourceMealMap.set(originMeal.session_id, {
          leftover_dish_id: originMeal.session_id,
          planned_servings: originSourceMeal.planned_servings,
          meal_plan_columns: originSourceMeal.meal_plan_columns,
        });
      });
    }
  }

  return ok({
    items: visibleLeftovers.map((row) =>
      toLeftoverListItem(row, recipeMap, sourceMealMap, contentSnapshotMap)
    ),
  } satisfies LeftoverListData);
}
