import { readRecipeProductLabels, readPublicRecipeProductLabels } from "@/lib/server/recipe-product-labels";
import { fail, ok } from "@/lib/api/response";
import {
  isUuid,
  toCookingModeIngredient,
  toCookingModeStep,
  type CookingIngredientRow,
  type CookingStepRow,
} from "@/lib/server/cooking";
import { formatBootstrapErrorMessage } from "@/lib/server/user-bootstrap";
import {
  createRecipeFuturePropagationInternalClient,
  createRouteHandlerClient,
} from "@/lib/supabase/server";
import {
  parseYoutubeSavedPublicRecipeProjection,
} from "@/lib/server/youtube-saved-public-recipe";
import {
  COOK_MODE_STEP_SELECT_LEGACY,
  COOK_MODE_STEP_SELECT_WITH_METHODS,
  isMissingStepCookingMethodsRelation,
} from "@/lib/server/recipe-step-method-select";
import type { CookingStandaloneCookModeData } from "@/types/cooking";
import type { SupabaseClient } from "@supabase/supabase-js";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

// Only the consumed columns and real FK joins, not a replacement database
// schema or runtime read-only grant. Keep the SDK's native query phases.
export type StandaloneCookModeDbClient = Pick<SupabaseClient<{
  public: {
    Tables: {
      recipes: {
        Row: { id: string; title: string; base_servings: number };
        Insert: never; Update: never; Relationships: [];
      };
      recipe_ingredients: {
        Row: {
          id: string; recipe_id: string; ingredient_id: string | null;
          source_kind: "ingredient" | "food_product" | null;
          amount: number | null; unit: string | null; display_text: string | null;
          component_label: string | null; ingredient_type: "QUANT" | "TO_TASTE";
          scalable: boolean; sort_order: number; quantity_input: unknown;
          food_product_id: string | null; food_product_nutrition_version_id: string | null;
        };
        Insert: never; Update: never;
        Relationships: [{ foreignKeyName: "recipe_ingredients_ingredient_id_fkey";
          columns: ["ingredient_id"]; isOneToOne: false;
          referencedRelation: "ingredients"; referencedColumns: ["id"]; }];
      };
      ingredients: {
        Row: { id: string; standard_name: string };
        Insert: never; Update: never; Relationships: [];
      };
      recipe_steps: {
        Row: { id: string; recipe_id: string; step_number: number; instruction: string;
          component_label: string | null; ingredients_used: unknown; heat_level: string | null;
          duration_seconds: number | null; duration_text: string | null; cooking_method_id: string };
        Insert: never; Update: never;
        Relationships: [{ foreignKeyName: "recipe_steps_cooking_method_id_fkey";
          columns: ["cooking_method_id"]; isOneToOne: false;
          referencedRelation: "cooking_methods"; referencedColumns: ["id"]; }];
      };
      cooking_methods: {
        Row: { id: string; code: string; label: string; color_key: string; category_code: string | null };
        Insert: never; Update: never; Relationships: [];
      };
      recipe_step_cooking_methods: {
        Row: { step_id: string; method_id: string; position: number };
        Insert: never; Update: never;
        Relationships: [
          { foreignKeyName: "recipe_step_cooking_methods_step_id_fkey";
            columns: ["step_id"]; isOneToOne: false;
            referencedRelation: "recipe_steps"; referencedColumns: ["id"]; },
          { foreignKeyName: "recipe_step_cooking_methods_method_id_fkey";
            columns: ["method_id"]; isOneToOne: false;
            referencedRelation: "cooking_methods"; referencedColumns: ["id"]; },
        ];
      };
    };
    Views: Record<never, never>; Functions: Record<never, never>;
  };
}>, "from">;

const INGREDIENT_COLUMNS_PUBLIC = "id, source_kind, ingredient_id, amount, unit, display_text, component_label, ingredient_type, scalable, sort_order, ingredients(standard_name)";
const INGREDIENT_COLUMNS_AUTH = "id, source_kind, ingredient_id, amount, unit, display_text, component_label, ingredient_type, scalable, sort_order, ingredients(standard_name), food_product_id, food_product_nutrition_version_id, quantity_input";

function parseServings(value: string | null) {
  if (!value) {
    return {
      data: null,
      fields: [{ field: "servings", reason: "required" }],
    };
  }

  const servings = Number(value);

  if (!Number.isInteger(servings)) {
    return {
      data: null,
      fields: [{ field: "servings", reason: "invalid_integer" }],
    };
  }

  if (servings < 1) {
    return {
      data: null,
      fields: [{ field: "servings", reason: "min_value" }],
    };
  }

  return {
    data: servings,
    fields: [],
  };
}

export async function GET(request: Request, context: RouteContext) {
  const { id: recipeId } = await context.params;

  if (!isUuid(recipeId)) {
    return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
  }

  const parsedServings = parseServings(
    new URL(request.url).searchParams.get("servings"),
  );

  if (!parsedServings.data) {
    return fail(
      "VALIDATION_ERROR",
      "요리 인분을 확인해 주세요.",
      422,
      parsedServings.fields,
    );
  }

  const cookingServings = parsedServings.data;

  try {
    const routeClient = await createRouteHandlerClient({
      anonymousPublicReadScope: "recipe-cook-mode",
    });
    const dbClient: StandaloneCookModeDbClient = routeClient;

    const recipeResult = await dbClient
      .from("recipes")
      .select("id, title, base_servings")
      .eq("id", recipeId)
      .maybeSingle();

    if (recipeResult.error || !recipeResult.data) {
      return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
    }

    const user = (await routeClient.auth.getUser()).data.user;
    const ingredientTable = dbClient.from("recipe_ingredients");
    const ingredientQuery = user
      ? ingredientTable.select(INGREDIENT_COLUMNS_AUTH)
      : ingredientTable.select(INGREDIENT_COLUMNS_PUBLIC);
    const ingredientsResult = await ingredientQuery
      .eq("recipe_id", recipeId)
      .order("sort_order", { ascending: true });

    if (ingredientsResult.error || !ingredientsResult.data) {
      return fail("INTERNAL_ERROR", "요리모드 데이터를 불러오지 못했어요.", 500);
    }

    let productIngredients: CookingIngredientRow[] = user
      ? await readRecipeProductLabels(routeClient, ingredientsResult.data)
      : await readPublicRecipeProductLabels(routeClient, recipeId, ingredientsResult.data);

    let stepsResult: { data: CookingStepRow[] | null; error: unknown } = await dbClient
      .from("recipe_steps")
      .select(COOK_MODE_STEP_SELECT_WITH_METHODS)
      .eq("recipe_id", recipeId)
      .order("step_number", { ascending: true });

    if (stepsResult.error && isMissingStepCookingMethodsRelation(stepsResult.error)) {
      stepsResult = await dbClient
        .from("recipe_steps")
        .select(COOK_MODE_STEP_SELECT_LEGACY)
        .eq("recipe_id", recipeId)
        .order("step_number", { ascending: true });
    }

    if (stepsResult.error || !stepsResult.data) {
      return fail("INTERNAL_ERROR", "요리모드 데이터를 불러오지 못했어요.", 500);
    }

    let cookingSteps = stepsResult.data;
    if (ingredientsResult.data.length === 0 && stepsResult.data.length === 0) {
      const internalClient = createRecipeFuturePropagationInternalClient();
      if (!internalClient) {
        return fail("INTERNAL_ERROR", "요리모드 데이터를 불러오지 못했어요.", 500);
      }
      const projectionResult = await internalClient.rpc(
        "read_public_youtube_saved_recipe_detail",
        { p_recipe_id: recipeId },
      );
      if (projectionResult.error) {
        return fail("INTERNAL_ERROR", "요리모드 데이터를 불러오지 못했어요.", 500);
      }

      const projection = projectionResult.data === null
        ? null
        : parseYoutubeSavedPublicRecipeProjection(projectionResult.data);
      if (projectionResult.data !== null && !projection) {
        return fail("INTERNAL_ERROR", "요리모드 데이터를 불러오지 못했어요.", 500);
      }

      if (projection) {
        productIngredients = projection.ingredients.map((ingredient) => ({
            ingredient_id: ingredient.ingredient_id,
            row_key: ingredient.row_key, source_kind: ingredient.source_kind,
            food_product_id: ingredient.food_product_id, food_product_nutrition_version_id: ingredient.food_product_nutrition_version_id,
            amount: ingredient.amount,
            quantity_input: ingredient.quantity_input,
            unit: ingredient.unit,
            display_text: ingredient.display_text,
            component_label: ingredient.component_label,
            ingredient_type: ingredient.ingredient_type,
            scalable: ingredient.scalable,
            sort_order: ingredient.sort_order,
            ingredients: { standard_name: ingredient.standard_name },
          }));
        cookingSteps = projection.steps.map((step) => ({
            step_number: step.step_number,
            instruction: step.instruction,
            component_label: step.component_label,
            ingredients_used: step.ingredients_used,
            heat_level: step.heat_level,
            duration_seconds: step.duration_seconds,
            duration_text: step.duration_text,
            cooking_methods: step.cooking_method,
            recipe_step_cooking_methods: (step.cooking_methods ?? []).map(
              (method, index) => ({
                position: index + 1,
                cooking_methods: method,
              }),
            ),
        }));
      }
    }

    return ok<CookingStandaloneCookModeData>({
      recipe: {
        id: recipeResult.data.id,
        title: recipeResult.data.title,
        cooking_servings: cookingServings,
        ingredients: productIngredients.map((row) =>
          toCookingModeIngredient({
            row,
            baseServings: recipeResult.data!.base_servings,
            cookingServings,
          }),
        ),
        steps: cookingSteps.map((row) => toCookingModeStep(row)),
      },
    });
  } catch (error) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(error, "요리모드 데이터를 불러오지 못했어요."),
      500,
    );
  }
}
