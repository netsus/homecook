import { readRecipeProductLabels } from "@/lib/server/recipe-product-labels";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

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

// SQL JSON columns remain unknown until the consumed snapshot shape is checked.
type SnapshotIngredient = Omit<CookingIngredientRow, "ingredients" | "scalable" | "id"> & { scalable?: boolean | null };
type SnapshotMethod = { code?: string | null; label?: string | null; color_key?: string | null; category_code?: string | null };
type SnapshotStep = {
  step_number: number; instruction: string; component_label?: string | null;
  ingredients_used?: unknown; heat_level?: string | null; duration_seconds?: number | null;
  duration_text?: string | null; cooking_methods?: SnapshotMethod[] | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function nullableText(value: unknown) {
  return value === undefined || value === null || typeof value === "string";
}
function isSnapshotIngredient(value: unknown): value is SnapshotIngredient {
  if (!isRecord(value)) return false;
  return (value.ingredient_id === null || typeof value.ingredient_id === "string")
    && (value.amount === null || typeof value.amount === "number")
    && (value.unit === null || typeof value.unit === "string")
    && (value.display_text === null || typeof value.display_text === "string")
    && (value.ingredient_type === "QUANT" || value.ingredient_type === "TO_TASTE")
    && (value.scalable === undefined || value.scalable === null || typeof value.scalable === "boolean")
    && (value.sort_order === undefined || value.sort_order === null || typeof value.sort_order === "number")
    && (value.row_key === undefined || typeof value.row_key === "string")
    && (value.source_kind === undefined || value.source_kind === null || value.source_kind === "ingredient" || value.source_kind === "food_product")
    && [value.component_label, value.food_product_id, value.food_product_nutrition_version_id,
      value.food_product_name, value.food_product_brand].every(nullableText);
}
function isSnapshotMethod(value: unknown): value is SnapshotMethod {
  return isRecord(value) && [value.code, value.label, value.color_key, value.category_code].every(nullableText);
}
function isSnapshotStep(value: unknown): value is SnapshotStep {
  return isRecord(value) && typeof value.step_number === "number" && typeof value.instruction === "string"
    && [value.component_label, value.heat_level, value.duration_text].every(nullableText)
    && (value.duration_seconds === undefined || value.duration_seconds === null || typeof value.duration_seconds === "number")
    && (value.cooking_methods === undefined || value.cooking_methods === null
      || Array.isArray(value.cooking_methods) && value.cooking_methods.every(isSnapshotMethod));
}

// Consumed native tables/FKs only; not a replacement schema or permission grant.
export type CookModeDbClient = Pick<SupabaseClient<{
  public: {
    Tables: {
      cooking_sessions: {
        Row: { id: string; user_id: string; status: CookingSessionStatus;
          contract_version: "legacy_v1" | "snapshot_v2"; session_kind: "planner" | "standalone" | null;
          recipe_id: string | null; recipe_content_snapshot_id: string | null; cooking_servings: number | null };
        Insert: never; Update: never;
        Relationships: [{ foreignKeyName: "cooking_sessions_recipe_content_snapshot_id_fkey";
          columns: ["recipe_content_snapshot_id"]; isOneToOne: false;
          referencedRelation: "recipe_content_snapshots"; referencedColumns: ["id"]; }];
      };
      recipe_content_snapshots: {
        Row: { id: string; recipe_id: string; title: string; base_servings: number;
          ingredients_json: unknown; steps_json: unknown };
        Insert: never; Update: never; Relationships: [];
      };
      cooking_session_meals: {
        Row: { session_id: string; meal_id: string; recipe_id: string; cooking_servings: number };
        Insert: never; Update: never; Relationships: [];
      };
      recipes: {
        Row: { id: string; title: string; base_servings: number };
        Insert: never; Update: never; Relationships: [];
      };
      recipe_ingredients: {
        Row: { recipe_id: string; ingredient_id: string | null; quantity_input: unknown;
          amount: number | null; unit: string | null; display_text: string | null; component_label: string | null;
          ingredient_type: "QUANT" | "TO_TASTE"; scalable: boolean; sort_order: number;
          food_product_id: string | null; food_product_nutrition_version_id: string | null };
        Insert: never; Update: never;
        Relationships: [{ foreignKeyName: "recipe_ingredients_ingredient_id_fkey";
          columns: ["ingredient_id"]; isOneToOne: false; referencedRelation: "ingredients"; referencedColumns: ["id"]; }];
      };
      ingredients: {
        Row: { id: string; standard_name: string };
        Insert: never; Update: never; Relationships: [];
      };
      recipe_steps: {
        Row: { id: string; recipe_id: string; step_number: number; instruction: string; component_label: string | null;
          ingredients_used: unknown; heat_level: string | null; duration_seconds: number | null;
          duration_text: string | null; cooking_method_id: string };
        Insert: never; Update: never;
        Relationships: [{ foreignKeyName: "recipe_steps_cooking_method_id_fkey";
          columns: ["cooking_method_id"]; isOneToOne: false; referencedRelation: "cooking_methods"; referencedColumns: ["id"]; }];
      };
      cooking_methods: {
        Row: { id: string; code: string; label: string; color_key: string; category_code: string | null };
        Insert: never; Update: never; Relationships: [];
      };
      recipe_step_cooking_methods: {
        Row: { step_id: string; method_id: string; position: number };
        Insert: never; Update: never;
        Relationships: [
          { foreignKeyName: "recipe_step_cooking_methods_step_id_fkey"; columns: ["step_id"]; isOneToOne: false; referencedRelation: "recipe_steps"; referencedColumns: ["id"]; },
          { foreignKeyName: "recipe_step_cooking_methods_method_id_fkey"; columns: ["method_id"]; isOneToOne: false; referencedRelation: "cooking_methods"; referencedColumns: ["id"]; },
        ];
      };
    };
    Views: Record<never, never>; Functions: Record<never, never>;
  };
}>, "from">;

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

  const bootstrapClient: UserBootstrapDbClient = routeClient;
  const dbClient: CookModeDbClient = routeClient;

  try {
    await ensurePublicUserRow(bootstrapClient, user);
    await ensureUserBootstrapState(bootstrapClient, user.id);
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
    .select("meal_id, recipe_id, cooking_servings")
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
    const snapshotIngredients = sessionContentSnapshot.ingredients_json ?? [];
    const snapshotSteps = sessionContentSnapshot.steps_json ?? [];
    // Valid legacy snapshots may omit optional metadata. Malformed JSON must
    // fail with the API wrapper, not escape as an unhandled map/flatMap error.
    if (!Array.isArray(snapshotIngredients) || !snapshotIngredients.every(isSnapshotIngredient)
      || !Array.isArray(snapshotSteps) || !snapshotSteps.every(isSnapshotStep)) {
      return fail("INTERNAL_ERROR", "요리모드 데이터를 불러오지 못했어요.", 500);
    }
    const ingredientIds = [
      ...new Set(snapshotIngredients.flatMap((ingredient) => ingredient.ingredient_id ? [ingredient.ingredient_id] : [])),
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
        ingredients: snapshotIngredients.map((row) =>
          toCookingModeIngredient({
            row: {
              ingredient_id: row.ingredient_id,
              row_key: row.row_key,
              source_kind: row.source_kind,
              quantity_input: row.quantity_input,
              food_product_nutrition_version_id: row.food_product_nutrition_version_id ?? null,
              food_product_id: row.food_product_id ?? null,
              food_product_name: row.food_product_name ?? null,
              food_product_brand: row.food_product_brand ?? null,
              amount: row.amount,
              unit: row.unit,
              display_text: row.display_text,
              component_label: row.component_label ?? null,
              ingredient_type: row.ingredient_type,
              scalable: row.scalable ?? true,
              sort_order: row.sort_order ?? null,
              ingredients: { standard_name: row.ingredient_id ? ingredientNameMap.get(row.ingredient_id) ?? null : null },
            },
            baseServings: sessionContentSnapshot.base_servings,
            cookingServings: session.cooking_servings ?? sessionMeal.cooking_servings,
          }),
        ),
        steps: snapshotSteps.map((row) =>
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
    .select("ingredient_id, quantity_input, amount, unit, display_text, component_label, ingredient_type, scalable, sort_order, food_product_id, food_product_nutrition_version_id, ingredients(standard_name)")
    .eq("recipe_id", sessionMeal.recipe_id)
    .order("sort_order", { ascending: true });

  if (ingredientsResult.error || !ingredientsResult.data) {
    return fail("INTERNAL_ERROR", "요리모드 데이터를 불러오지 못했어요.", 500);
  }

  let stepsResult: { data: CookingStepRow[] | null; error: unknown } = await dbClient
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

  let productIngredients;
  try {
    productIngredients = await readRecipeProductLabels(routeClient, ingredientsResult.data);
  } catch {
    return fail("INTERNAL_ERROR", "요리 재료의 제품 정보를 불러오지 못했어요.", 500);
  }

  return ok<CookingSessionCookModeData>({
    session_id: sessionId,
    recipe: {
      id: recipeResult.data.id,
      title: recipeResult.data.title,
      cooking_servings: sessionMeal.cooking_servings,
      ingredients: productIngredients.map((row) =>
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
