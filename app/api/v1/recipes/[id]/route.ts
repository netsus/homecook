import { fail, ok } from "@/lib/api/response";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { RecipeDetail, RecipeIngredient, RecipeStep, RecipeUserStatus } from "@/types/recipe";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

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
      const [likedResult, savedResult] = await Promise.all([
        routeClient
          .from("recipe_likes")
          .select("id")
          .eq("recipe_id", id)
          .eq("user_id", user.id)
          .limit(1),
        routeClient
          .from("recipe_book_items")
          .select("book_id, recipe_books!inner(book_type, user_id)")
          .eq("recipe_id", id)
          .eq("recipe_books.user_id", user.id)
          .in("recipe_books.book_type", ["saved", "custom"]),
      ]);

      userStatus = {
        is_liked: Boolean(likedResult.data?.length),
        is_saved: Boolean(savedResult.data?.length),
        saved_book_ids:
          savedResult.data?.map((item) => item.book_id as string) ?? [],
      };
    }

    const ingredients: RecipeIngredient[] =
      ingredientsResult.data?.map((item) => ({
        id: item.id,
        ingredient_id: item.ingredient_id,
        standard_name:
          Array.isArray(item.ingredients) && item.ingredients[0]
            ? item.ingredients[0].standard_name
            : (item.ingredients as { standard_name?: string } | null)
                ?.standard_name ?? "",
        amount: item.amount === null ? null : Number(item.amount),
        unit: item.unit,
        ingredient_type: item.ingredient_type,
        display_text: item.display_text,
        scalable: item.scalable,
        sort_order: item.sort_order,
      })) ?? [];

    const steps: RecipeStep[] =
      stepsResult.data?.map((item) => ({
        id: item.id,
        step_number: item.step_number,
        instruction: item.instruction,
        cooking_method: Array.isArray(item.cooking_methods)
          ? (item.cooking_methods[0] ?? null)
          : item.cooking_methods,
        ingredients_used: Array.isArray(item.ingredients_used)
          ? item.ingredients_used
          : [],
        heat_level: item.heat_level,
        duration_seconds: item.duration_seconds,
        duration_text: item.duration_text,
      })) ?? [];

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
      "CONFIG_MISSING",
      error instanceof Error ? error.message : "Supabase 설정이 필요합니다.",
      500,
    );
  }
}
