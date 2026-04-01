import { readE2EAuthOverrideHeader } from "@/lib/auth/e2e-auth-override";
import { fail, ok } from "@/lib/api/response";
import {
  getQaFixtureRecipeDetail,
  isQaFixtureModeEnabled,
  MOCK_RECIPE_DETAIL,
  MOCK_RECIPE_ID,
} from "@/lib/mock/recipes";
import {
  mapRecipeUserStatus,
  normalizeRecipeIngredients,
  normalizeRecipeSteps,
} from "@/lib/recipe-detail";
import { formatBootstrapErrorMessage } from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { RecipeDetail, RecipeUserStatus } from "@/types/recipe";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (isQaFixtureModeEnabled() && id === MOCK_RECIPE_ID) {
    const authOverride = readE2EAuthOverrideHeader(request.headers);

    return ok(
      authOverride === "authenticated"
        ? getQaFixtureRecipeDetail()
        : MOCK_RECIPE_DETAIL,
    );
  }

  try {
    const routeClient = await createRouteHandlerClient();
    const serviceClient = createServiceRoleClient();
    const dbClient = serviceClient ?? routeClient;

    const [
      recipeResult,
      sourceResult,
      ingredientsResult,
      stepsResult,
      authResult,
    ] = await Promise.all([
      dbClient
        .from("recipes")
        .select(
          "id, title, description, thumbnail_url, base_servings, tags, source_type, view_count, like_count, save_count, plan_count, cook_count",
        )
        .eq("id", id)
        .maybeSingle(),
      dbClient
        .from("recipe_sources")
        .select("youtube_url, youtube_video_id")
        .eq("recipe_id", id)
        .maybeSingle(),
      dbClient
        .from("recipe_ingredients")
        .select(
          "id, ingredient_id, amount, unit, ingredient_type, display_text, scalable, sort_order, ingredients(standard_name)",
        )
        .eq("recipe_id", id)
        .order("sort_order", { ascending: true }),
      dbClient
        .from("recipe_steps")
        .select(
          "id, step_number, instruction, ingredients_used, heat_level, duration_seconds, duration_text, cooking_methods(id, code, label, color_key)",
        )
        .eq("recipe_id", id)
        .order("step_number", { ascending: true }),
      routeClient.auth.getUser(),
    ]);

    if (recipeResult.error || !recipeResult.data) {
      return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없습니다.", 404);
    }

    if (ingredientsResult.error || stepsResult.error) {
      return fail(
        "INTERNAL_ERROR",
        "레시피 상세를 불러오지 못했어요.",
        500,
      );
    }

    const user = authResult.data.user;
    let userStatus: RecipeUserStatus | null = null;

    if (user) {
      const userStatusClient = serviceClient ?? routeClient;
      const [likedResult, savedResult] = await Promise.all([
        userStatusClient
          .from("recipe_likes")
          .select("id")
          .eq("recipe_id", id)
          .eq("user_id", user.id)
          .limit(1),
        userStatusClient
          .from("recipe_book_items")
          .select("book_id, recipe_books!inner(book_type, user_id)")
          .eq("recipe_id", id)
          .eq("recipe_books.user_id", user.id)
          .in("recipe_books.book_type", ["saved", "custom"]),
      ]);

      userStatus = mapRecipeUserStatus(likedResult.data, savedResult.data);
    }

    const ingredients = normalizeRecipeIngredients(ingredientsResult.data);
    const steps = normalizeRecipeSteps(stepsResult.data);

    const detail: RecipeDetail = {
      id: recipeResult.data.id,
      title: recipeResult.data.title,
      description: recipeResult.data.description,
      thumbnail_url: recipeResult.data.thumbnail_url,
      base_servings: recipeResult.data.base_servings,
      tags: recipeResult.data.tags ?? [],
      source_type: recipeResult.data.source_type,
      source: sourceResult.data
        ? {
            youtube_url: sourceResult.data.youtube_url,
            youtube_video_id: sourceResult.data.youtube_video_id,
          }
        : null,
      view_count: recipeResult.data.view_count + (serviceClient ? 1 : 0),
      like_count: recipeResult.data.like_count,
      save_count: recipeResult.data.save_count,
      plan_count: recipeResult.data.plan_count,
      cook_count: recipeResult.data.cook_count,
      ingredients,
      steps,
      user_status: userStatus,
    };

    if (serviceClient) {
      void serviceClient
        .from("recipes")
        .update({
          view_count: recipeResult.data.view_count + 1,
        })
        .eq("id", id);
    }

    return ok(detail);
  } catch (error) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(error, "레시피 상세를 불러오지 못했어요."),
      500,
    );
  }
}
