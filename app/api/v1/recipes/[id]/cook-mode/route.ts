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
  createRouteHandlerClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
import type { CookingStandaloneCookModeData } from "@/types/cooking";

interface RouteContext {
  params: Promise<{
    id: string;
  }>;
}

interface QueryError {
  message: string;
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

interface RecipesTable {
  select(columns: string): RecipeSelectQuery;
}

interface RecipeIngredientsTable {
  select(columns: string): IngredientsSelectQuery;
}

interface RecipeStepsTable {
  select(columns: string): StepsSelectQuery;
}

interface StandaloneCookModeDbClient {
  from(table: "recipes"): RecipesTable;
  from(table: "recipe_ingredients"): RecipeIngredientsTable;
  from(table: "recipe_steps"): RecipeStepsTable;
}

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
      "요리 인분을 확인해주세요.",
      422,
      parsedServings.fields,
    );
  }

  const cookingServings = parsedServings.data;

  try {
    const routeClient = await createRouteHandlerClient();
    const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
      StandaloneCookModeDbClient;

    const recipeResult = await dbClient
      .from("recipes")
      .select("id, title, base_servings")
      .eq("id", recipeId)
      .maybeSingle();

    if (recipeResult.error || !recipeResult.data) {
      return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
    }

    const ingredientsResult = await dbClient
      .from("recipe_ingredients")
      .select(
        "ingredient_id, amount, unit, display_text, ingredient_type, scalable, sort_order, ingredients(standard_name)",
      )
      .eq("recipe_id", recipeId)
      .order("sort_order", { ascending: true });

    if (ingredientsResult.error || !ingredientsResult.data) {
      return fail("INTERNAL_ERROR", "요리모드 데이터를 불러오지 못했어요.", 500);
    }

    const stepsResult = await dbClient
      .from("recipe_steps")
      .select(
        "step_number, instruction, ingredients_used, heat_level, duration_seconds, duration_text, cooking_methods(code, label, color_key)",
      )
      .eq("recipe_id", recipeId)
      .order("step_number", { ascending: true });

    if (stepsResult.error || !stepsResult.data) {
      return fail("INTERNAL_ERROR", "요리모드 데이터를 불러오지 못했어요.", 500);
    }

    return ok<CookingStandaloneCookModeData>({
      recipe: {
        id: recipeResult.data.id,
        title: recipeResult.data.title,
        cooking_servings: cookingServings,
        ingredients: ingredientsResult.data.map((row) =>
          toCookingModeIngredient({
            row,
            baseServings: recipeResult.data!.base_servings,
            cookingServings,
          }),
        ),
        steps: stepsResult.data.map((row) => toCookingModeStep(row)),
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
