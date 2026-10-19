import { fail, ok } from "@/lib/api/response";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeFoodSafetyImageUrl } from "@/lib/recipe-image";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { isMealEligibleForShopping } from "@/lib/server/shopping";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import type { ShoppingPreviewData } from "@/types/shopping";

interface MealRow {
  id: string;
  column_id: string;
  recipe_id: string;
  recipe_content_snapshot_id: string | null;
  recipe_content_snapshots:
    | {
      title: string | null;
    }
    | Array<{
      title: string | null;
    }>
    | null;
  plan_date: string;
  planned_servings: number;
  status: string;
  shopping_list_id: string | null;
  created_at: string;
}

interface RecipeRow {
  id: string;
  title: string;
  thumbnail_url: string | null;
}

// Actual selected rows and nullable meal snapshot FK, not a runtime adapter.
export type ShoppingPreviewDbClient = Pick<SupabaseClient<{
  public: {
    Tables: {
      meals: {
        Row: { id: string; user_id: string; column_id: string; recipe_id: string;
          recipe_content_snapshot_id: string | null; plan_date: string; planned_servings: number;
          status: "registered" | "shopping_done" | "cook_done"; shopping_list_id: string | null; created_at: string };
        Insert: never; Update: never;
        Relationships: [{ foreignKeyName: "meals_recipe_content_snapshot_id_fkey";
          columns: ["recipe_content_snapshot_id"]; isOneToOne: false;
          referencedRelation: "recipe_content_snapshots"; referencedColumns: ["id"]; }];
      };
      recipe_content_snapshots: {
        Row: { id: string; title: string };
        Insert: never; Update: never; Relationships: [];
      };
      recipes: {
        Row: { id: string; title: string; thumbnail_url: string | null };
        Insert: never; Update: never; Relationships: [];
      };
      meal_plan_columns: {
        Row: { id: string; user_id: string; name: string };
        Insert: never; Update: never; Relationships: [];
      };
    };
    Views: Record<never, never>; Functions: Record<never, never>;
  };
}>, "from">;

function getPinnedMealTitle(meal: MealRow) {
  const contentSnapshot = Array.isArray(meal.recipe_content_snapshots)
    ? meal.recipe_content_snapshots[0] ?? null
    : meal.recipe_content_snapshots;

  return contentSnapshot?.title?.trim() || null;
}

function hasContentPin(meal: MealRow) {
  return typeof meal.recipe_content_snapshot_id === "string" && meal.recipe_content_snapshot_id.length > 0;
}

export async function GET() {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const bootstrapClient: UserBootstrapDbClient = routeClient;
  const dbClient: ShoppingPreviewDbClient = routeClient;

  try {
    await ensurePublicUserRow(bootstrapClient, user);
    await ensureUserBootstrapState(bootstrapClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "장보기 미리보기를 불러오지 못했어요."),
      500,
    );
  }

  const mealsResult = await dbClient
    .from("meals")
    .select(
      "id, recipe_id, recipe_content_snapshot_id, recipe_content_snapshots(title), column_id, plan_date, planned_servings, status, shopping_list_id, created_at",
    )
    .eq("user_id", user.id)
    .eq("status", "registered")
    .is("shopping_list_id", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (mealsResult.error || !mealsResult.data) {
    return fail("INTERNAL_ERROR", "장보기 미리보기를 불러오지 못했어요.", 500);
  }

  const eligibleMeals = mealsResult.data.filter(isMealEligibleForShopping);
  if (eligibleMeals.some((meal) => hasContentPin(meal) && getPinnedMealTitle(meal) === null)) {
    return fail("INTERNAL_ERROR", "장보기 미리보기를 불러오지 못했어요.", 500);
  }

  const recipeIds = [...new Set(eligibleMeals.map((meal) => meal.recipe_id))];
  const columnIds = [...new Set(eligibleMeals.map((meal) => meal.column_id))];
  const recipeMap = new Map<string, RecipeRow>();
  const columnNameMap = new Map<string, string>();

  if (recipeIds.length > 0) {
    const recipesResult = await dbClient
      .from("recipes")
      .select("id, title, thumbnail_url")
      .in("id", recipeIds);

    if (recipesResult.error || !recipesResult.data) {
      return fail("INTERNAL_ERROR", "장보기 미리보기를 불러오지 못했어요.", 500);
    }

    recipesResult.data.forEach((recipe) => {
      recipeMap.set(recipe.id, recipe);
    });
  }

  if (columnIds.length > 0) {
    const columnsResult = await dbClient
      .from("meal_plan_columns")
      .select("id, name")
      .eq("user_id", user.id)
      .in("id", columnIds);

    if (!columnsResult.error && columnsResult.data) {
      columnsResult.data.forEach((column) => {
        columnNameMap.set(column.id, column.name);
      });
    }
  }

  const recipeGroups = new Map<
    string,
    {
      recipe_id: string;
      meal_ids: string[];
      planned_servings_total: number;
      first_created_at: string;
    }
  >();

  eligibleMeals.forEach((meal) => {
    const existing = recipeGroups.get(meal.recipe_id);

    if (existing) {
      existing.meal_ids.push(meal.id);
      existing.planned_servings_total += meal.planned_servings;
      if (meal.created_at < existing.first_created_at) {
        existing.first_created_at = meal.created_at;
      }
      return;
    }

    recipeGroups.set(meal.recipe_id, {
      recipe_id: meal.recipe_id,
      meal_ids: [meal.id],
      planned_servings_total: meal.planned_servings,
      first_created_at: meal.created_at,
    });
  });

  return ok({
    eligible_meals: eligibleMeals.map((meal) => ({
      id: meal.id,
      column_id: meal.column_id,
      column_name: columnNameMap.get(meal.column_id) ?? null,
      plan_date: meal.plan_date,
      recipe_id: meal.recipe_id,
      recipe_name: getPinnedMealTitle(meal) ?? recipeMap.get(meal.recipe_id)?.title ?? "",
      recipe_thumbnail: normalizeFoodSafetyImageUrl(
        recipeMap.get(meal.recipe_id)?.thumbnail_url,
      ),
      planned_servings: meal.planned_servings,
      created_at: meal.created_at,
    })),
    recipes: [...recipeGroups.values()]
      .sort((left, right) => {
        const byCreatedAt = left.first_created_at.localeCompare(right.first_created_at);
        if (byCreatedAt !== 0) {
          return byCreatedAt;
        }

        return left.recipe_id.localeCompare(right.recipe_id);
      })
      .map((recipe) => ({
        recipe_id: recipe.recipe_id,
        recipe_name:
          eligibleMeals.find((meal) => meal.recipe_id === recipe.recipe_id && getPinnedMealTitle(meal))
            ? getPinnedMealTitle(
              eligibleMeals.find((meal) =>
                meal.recipe_id === recipe.recipe_id && getPinnedMealTitle(meal)
              )!,
            ) ?? ""
            : recipeMap.get(recipe.recipe_id)?.title ?? "",
        recipe_thumbnail: normalizeFoodSafetyImageUrl(
          recipeMap.get(recipe.recipe_id)?.thumbnail_url,
        ),
        meal_ids: recipe.meal_ids,
        planned_servings_total: recipe.planned_servings_total,
        shopping_servings: recipe.planned_servings_total,
        is_selected: true,
      })),
  } satisfies ShoppingPreviewData);
}
