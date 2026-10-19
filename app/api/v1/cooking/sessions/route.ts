import { fail, ok } from "@/lib/api/response";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCookingSessionBody } from "@/lib/server/cooking";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import type {
  CookingSessionCreateBody,
  CookingSessionCreateData,
  CookingSessionMealData,
} from "@/types/cooking";

// Consumed fields and actual insert/select phases. Snapshot JSON remains unknown
// until the existing inline product guard; no new writer or authority boundary.
export type CookingSessionDbClient = Pick<SupabaseClient<{
  public: {
    Tables: {
      recipe_ingredients: {
        Row: { recipe_id: string; ingredient_id: string | null; food_product_id: string | null; food_product_nutrition_version_id: string | null };
        Insert: never; Update: never; Relationships: [];
      };
      recipes: {
        Row: { id: string }; Insert: never; Update: never; Relationships: [];
      };
      meals: {
        Row: { id: string; user_id: string; recipe_id: string; status: "registered" | "shopping_done" | "cook_done";
          recipe_content_snapshot_id: string | null };
        Insert: never; Update: never;
        Relationships: [{ foreignKeyName: "meals_recipe_content_snapshot_id_fkey";
          columns: ["recipe_content_snapshot_id"]; isOneToOne: false;
          referencedRelation: "recipe_content_snapshots"; referencedColumns: ["id"]; }];
      };
      recipe_content_snapshots: {
        Row: { id: string; ingredients_json: unknown };
        Insert: never; Update: never; Relationships: [];
      };
      cooking_sessions: {
        Row: { id: string; user_id: string; status: "in_progress" | "completed" | "cancelled" };
        Insert: { user_id: string; status: "in_progress" }; Update: never; Relationships: [];
      };
      cooking_session_meals: {
        Row: { session_id: string; meal_id: string; recipe_id: string; cooking_servings: number; is_cooked: boolean };
        Insert: { session_id: string; meal_id: string; recipe_id: string; cooking_servings: number; is_cooked: false };
        Update: never; Relationships: [];
      };
    };
    Views: Record<never, never>; Functions: Record<never, never>;
  };
}>, "from">;

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
    return fail("VALIDATION_ERROR", "요청 본문을 확인해 주세요.", 422, [
      { field: "body", reason: "invalid_json" },
    ]);
  }

  const parsed = parseCookingSessionBody(body);

  if (!parsed.data) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해 주세요.", 422, parsed.fields);
  }

  const sessionInput = parsed.data;
  const routeClient = await createRouteHandlerClient();
  const user = await requireUser(routeClient);

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const bootstrapClient: UserBootstrapDbClient = routeClient;
  const dbClient: CookingSessionDbClient = routeClient;

  try {
    await ensurePublicUserRow(bootstrapClient, user);
    await ensureUserBootstrapState(bootstrapClient, user.id);
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
    .select("id, user_id, recipe_id, status, recipe_content_snapshots(ingredients_json)")
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

  let requiresProductSession = mealsResult.data.some((meal) => {
    const snapshot = Array.isArray(meal.recipe_content_snapshots)
      ? meal.recipe_content_snapshots[0] : meal.recipe_content_snapshots;
    return Array.isArray(snapshot?.ingredients_json) && snapshot.ingredients_json.some((item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      return "ingredient_id" in item && item.ingredient_id === null
        && "food_product_id" in item && typeof item.food_product_id === "string"
        && "food_product_nutrition_version_id" in item && typeof item.food_product_nutrition_version_id === "string";
    });
  });
  if (!requiresProductSession && mealsResult.data.some((meal) => !meal.recipe_content_snapshots
    || (Array.isArray(meal.recipe_content_snapshots) && meal.recipe_content_snapshots.length === 0))) {
    const sources = await dbClient.from("recipe_ingredients")
      .select("ingredient_id, food_product_id, food_product_nutrition_version_id")
      .eq("recipe_id", sessionInput.recipe_id);
    if (sources.error || !sources.data) return fail("INTERNAL_ERROR", "요리 세션을 만들지 못했어요.", 500);
    requiresProductSession = sources.data.some((row) => row.ingredient_id === null && row.food_product_id && row.food_product_nutrition_version_id);
  }
  if (requiresProductSession) {
    return fail("CONFLICT", "이 레시피의 요리 화면을 준비하지 못했어요. 다시 시도해 주세요.", 409);
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
