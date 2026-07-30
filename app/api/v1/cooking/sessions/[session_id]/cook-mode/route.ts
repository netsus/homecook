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
import {
  COOK_MODE_STEP_SELECT_LEGACY,
  COOK_MODE_STEP_SELECT_WITH_METHODS,
  isMissingStepCookingMethodsRelation,
} from "@/lib/server/recipe-step-method-select";
import { createRouteHandlerClient } from "@/lib/supabase/server";
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
  contract_version?: string | null;
  session_kind?: string | null;
  recipe_id?: string | null;
  recipe_content_snapshot_id?: string | null;
  cooking_servings?: number | null;
  recipe_content_snapshots?:
    | {
      id: string;
      recipe_id: string;
      title: string;
      base_servings: number;
      ingredients_json: Array<{
        ingredient_id: string;
        amount: number | null;
        unit: string | null;
        display_text: string | null;
        component_label?: string | null;
        ingredient_type: "QUANT" | "TO_TASTE";
        scalable?: boolean;
        sort_order?: number;
        food_product_id?: string | null;
        food_product_nutrition_version_id?: string | null;
        food_product_name?: string | null;
        food_product_brand?: string | null;
      }> | null;
      steps_json: Array<{
        step_number: number;
        instruction: string;
        component_label?: string | null;
        ingredients_used?: unknown;
        heat_level?: string | null;
        duration_seconds?: number | null;
        duration_text?: string | null;
        cooking_methods?: Array<{
          code?: string | null;
          label?: string | null;
          color_key?: string | null;
          category_code?: string | null;
        }> | null;
      }> | null;
    }
    | Array<{
      id: string;
      recipe_id: string;
      title: string;
      base_servings: number;
      ingredients_json: Array<{
        ingredient_id: string;
        amount: number | null;
        unit: string | null;
        display_text: string | null;
        component_label?: string | null;
        ingredient_type: "QUANT" | "TO_TASTE";
        scalable?: boolean;
        sort_order?: number;
        food_product_id?: string | null;
        food_product_nutrition_version_id?: string | null;
        food_product_name?: string | null;
        food_product_brand?: string | null;
      }> | null;
      steps_json: Array<{
        step_number: number;
        instruction: string;
        component_label?: string | null;
        ingredients_used?: unknown;
        heat_level?: string | null;
        duration_seconds?: number | null;
        duration_text?: string | null;
        cooking_methods?: Array<{
          code?: string | null;
          label?: string | null;
          color_key?: string | null;
          category_code?: string | null;
        }> | null;
      }> | null;
    }>
    | null;
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
  from(table: "ingredients"): {
    select(columns: string): {
      in(column: string, values: string[]): ArrayResult<{ id: string; standard_name: string }>;
    };
  };
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

  const dbClient = routeClient as unknown as
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
    .select("id, user_id, status, contract_version, session_kind, recipe_id, recipe_content_snapshot_id, cooking_servings, recipe_content_snapshots(id, recipe_id, title, base_servings, ingredients_json, steps_json)")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionResult.error) {
    return fail("INTERNAL_ERROR", "요리모드 데이터를 불러오지 못했어요.", 500);
  }

  if (!sessionResult.data) {
    return fail("RESOURCE_NOT_FOUND", "요리 세션을 찾을 수 없어요.", 404);
  }

  const session = sessionResult.data;

  if (session.user_id !== user.id) {
    return fail("FORBIDDEN", "내 요리 세션만 볼 수 있어요.", 403);
  }

  if (session.status !== "in_progress") {
    return fail(
      "CONFLICT",
      "이미 종료된 요리 세션이에요. 끼니 화면에서 다시 시작해 주세요.",
      409,
    );
  }

  const sessionMealsResult = await dbClient
    .from("cooking_session_meals")
    .select("meal_id, recipe_id, cooking_servings, recipe_content_snapshot_id")
    .eq("session_id", sessionId);

  if (sessionMealsResult.error || !sessionMealsResult.data || sessionMealsResult.data.length === 0) {
    return fail("INTERNAL_ERROR", "요리모드 데이터를 불러오지 못했어요.", 500);
  }

  const sessionMeal = sessionMealsResult.data[0]!;
  const sessionContentSnapshot = Array.isArray(session.recipe_content_snapshots)
    ? session.recipe_content_snapshots[0] ?? null
    : session.recipe_content_snapshots;

  if (session.recipe_content_snapshot_id && sessionContentSnapshot === null) {
    return fail("INTERNAL_ERROR", "요리모드 데이터를 불러오지 못했어요.", 500);
  }

  if (session.contract_version === "snapshot_v2" && sessionContentSnapshot) {
    const ingredientIds = [
      ...new Set((sessionContentSnapshot.ingredients_json ?? []).map((ingredient) => ingredient.ingredient_id)),
    ];
    const ingredientNameMap = new Map<string, string>();

    if (ingredientIds.length > 0) {
      const ingredientNamesResult = await dbClient
        .from("ingredients")
        .select("id, standard_name")
        .in("id", ingredientIds);

      if (ingredientNamesResult.error || !ingredientNamesResult.data) {
        return fail("INTERNAL_ERROR", "요리모드 데이터를 불러오지 못했어요.", 500);
      }

      ingredientNamesResult.data.forEach((ingredient) => {
        ingredientNameMap.set(ingredient.id, ingredient.standard_name);
      });
    }

    return ok<CookingSessionCookModeData>({
      session_id: sessionId,
      recipe: {
        id: session.recipe_id ?? sessionMeal.recipe_id,
        title: sessionContentSnapshot.title,
        cooking_servings: session.cooking_servings ?? sessionMeal.cooking_servings,
        ingredients: (sessionContentSnapshot.ingredients_json ?? []).map((row) =>
          toCookingModeIngredient({
            row: {
              ingredient_id: row.ingredient_id,
              amount: row.amount,
              unit: row.unit,
              display_text: row.display_text,
              component_label: row.component_label ?? null,
              ingredient_type: row.ingredient_type,
              scalable: row.scalable ?? true,
              sort_order: row.sort_order ?? null,
              ingredients: { standard_name: ingredientNameMap.get(row.ingredient_id) ?? null },
            },
            baseServings: sessionContentSnapshot.base_servings,
            cookingServings: session.cooking_servings ?? sessionMeal.cooking_servings,
          }),
        ),
        steps: (sessionContentSnapshot.steps_json ?? []).map((row) =>
          toCookingModeStep({
            step_number: row.step_number,
            instruction: row.instruction,
            component_label: row.component_label ?? null,
            ingredients_used: row.ingredients_used ?? [],
            heat_level: row.heat_level ?? null,
            duration_seconds: row.duration_seconds ?? null,
            duration_text: row.duration_text ?? null,
            cooking_methods: row.cooking_methods?.[0] ?? null,
            recipe_step_cooking_methods: (row.cooking_methods ?? []).map(
              (method, index) => ({
                position: index + 1,
                cooking_methods: method,
              }),
            ),
          }),
        ),
      },
    });
  }

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
    .select("ingredient_id, amount, unit, display_text, component_label, ingredient_type, scalable, sort_order, ingredients(standard_name)")
    .eq("recipe_id", sessionMeal.recipe_id)
    .order("sort_order", { ascending: true });

  if (ingredientsResult.error || !ingredientsResult.data) {
    return fail("INTERNAL_ERROR", "요리모드 데이터를 불러오지 못했어요.", 500);
  }

  let stepsResult = await dbClient
    .from("recipe_steps")
    .select(COOK_MODE_STEP_SELECT_WITH_METHODS)
    .eq("recipe_id", sessionMeal.recipe_id)
    .order("step_number", { ascending: true });

  if (stepsResult.error && isMissingStepCookingMethodsRelation(stepsResult.error)) {
    stepsResult = await dbClient
      .from("recipe_steps")
      .select(COOK_MODE_STEP_SELECT_LEGACY)
      .eq("recipe_id", sessionMeal.recipe_id)
      .order("step_number", { ascending: true });
  }

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
