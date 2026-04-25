import { fail, ok } from "@/lib/api/response";
import {
  aggregateShoppingIngredients,
  buildShoppingListTitle,
  parseShoppingMealConfigs,
} from "@/lib/server/shopping";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { ShoppingListCreateBody, ShoppingListSummary } from "@/types/shopping";

interface QueryError {
  message: string;
}

interface MealsRow {
  id: string;
  user_id: string;
  recipe_id: string;
  plan_date: string;
  planned_servings: number;
  status: string;
  shopping_list_id: string | null;
}

interface RecipeIngredientRow {
  recipe_id: string;
  ingredient_id: string;
  amount: number | null;
  unit: string | null;
  ingredient_type: "QUANT" | "TO_TASTE";
  display_text: string | null;
}

interface IngredientRow {
  id: string;
  standard_name: string;
}

interface PantryRow {
  ingredient_id: string;
}

interface ShoppingListInsertRow {
  id: string;
  title: string;
  is_completed: boolean;
  created_at: string;
}

type ArrayQueryResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

type MaybeSingleResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

interface MealsSelectQuery {
  in(column: string, values: string[]): MealsSelectQuery;
  then: ArrayQueryResult<MealsRow>["then"];
}

interface MealsUpdateQuery {
  in(column: string, values: string[]): MealsUpdateQuery;
  eq(column: string, value: string): MealsUpdateQuery;
  then: ArrayQueryResult<MealsRow>["then"];
}

interface ShoppingListsInsertQuery {
  select(columns: string): ShoppingListsInsertQuery;
  maybeSingle(): MaybeSingleResult<ShoppingListInsertRow>;
}

interface RecipeIngredientsSelectQuery {
  in(column: string, values: string[]): RecipeIngredientsSelectQuery;
  then: ArrayQueryResult<RecipeIngredientRow>["then"];
}

interface IngredientsSelectQuery {
  in(column: string, values: string[]): IngredientsSelectQuery;
  then: ArrayQueryResult<IngredientRow>["then"];
}

interface PantrySelectQuery {
  eq(column: string, value: string): PantrySelectQuery;
  in(column: string, values: string[]): PantrySelectQuery;
  then: ArrayQueryResult<PantryRow>["then"];
}

interface ShoppingListRecipesInsertQuery {
  then: ArrayQueryResult<unknown>["then"];
}

interface ShoppingListItemsInsertQuery {
  then: ArrayQueryResult<unknown>["then"];
}

interface MealsTable {
  select(columns: string): MealsSelectQuery;
  update(values: { shopping_list_id: string }): MealsUpdateQuery;
}

interface ShoppingListsTable {
  insert(value: {
    user_id: string;
    title: string;
    date_range_start: string;
    date_range_end: string;
    is_completed: false;
  }): ShoppingListsInsertQuery;
}

interface ShoppingListRecipesTable {
  insert(values: Array<{
    shopping_list_id: string;
    recipe_id: string;
    shopping_servings: number;
    planned_servings_total: number;
  }>): ShoppingListRecipesInsertQuery;
}

interface RecipeIngredientsTable {
  select(columns: string): RecipeIngredientsSelectQuery;
}

interface IngredientsTable {
  select(columns: string): IngredientsSelectQuery;
}

interface PantryItemsTable {
  select(columns: string): PantrySelectQuery;
}

interface ShoppingListItemsTable {
  insert(values: Array<{
    shopping_list_id: string;
    ingredient_id: string;
    display_text: string;
    amounts_json: Array<{ amount: number; unit: string }>;
    is_pantry_excluded: boolean;
    is_checked: false;
    added_to_pantry: false;
    sort_order: number;
  }>): ShoppingListItemsInsertQuery;
}

interface ShoppingCreateDbClient {
  from(table: "meals"): MealsTable;
  from(table: "shopping_lists"): ShoppingListsTable;
  from(table: "shopping_list_recipes"): ShoppingListRecipesTable;
  from(table: "recipe_ingredients"): RecipeIngredientsTable;
  from(table: "ingredients"): IngredientsTable;
  from(table: "pantry_items"): PantryItemsTable;
  from(table: "shopping_list_items"): ShoppingListItemsTable;
}

async function requireUser(routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>>) {
  const authResult = await routeClient.auth.getUser();
  return authResult.data.user;
}

export async function POST(request: Request) {
  let body: ShoppingListCreateBody;

  try {
    body = (await request.json()) as ShoppingListCreateBody;
  } catch {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해주세요.", 422, [{ field: "body", reason: "invalid_json" }]);
  }

  const parsedMealConfigs = parseShoppingMealConfigs(body);
  if (parsedMealConfigs.fields.length > 0) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해주세요.", 422, parsedMealConfigs.fields);
  }

  const routeClient = await createRouteHandlerClient();
  const user = await requireUser(routeClient);

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    ShoppingCreateDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "장보기 목록을 만들지 못했어요."),
      500,
    );
  }

  if (parsedMealConfigs.valid_configs.length === 0) {
    return fail("VALIDATION_ERROR", "선택된 식사가 없어요.", 422, [
      { field: "meal_configs", reason: "no_valid_meal" },
    ]);
  }

  const mealConfigMap = new Map(parsedMealConfigs.valid_configs.map((config) => [config.meal_id, config]));
  const mealIds = [...mealConfigMap.keys()];

  const mealsResult = await dbClient
    .from("meals")
    .select("id, user_id, recipe_id, plan_date, planned_servings, status, shopping_list_id")
    .in("id", mealIds);

  if (mealsResult.error || !mealsResult.data) {
    return fail("INTERNAL_ERROR", "장보기 목록을 만들지 못했어요.", 500);
  }

  for (const meal of mealsResult.data) {
    if (meal.user_id !== user.id) {
      return fail("FORBIDDEN", "내 식사만 장보기로 만들 수 있어요.", 403);
    }
  }

  if (mealsResult.data.some((meal) => meal.shopping_list_id !== null)) {
    return fail("CONFLICT", "이미 다른 장보기 리스트에 포함된 식사가 있어요.", 409);
  }

  const validMeals = mealsResult.data.filter((meal) => meal.status === "registered");

  if (validMeals.length === 0) {
    return fail("VALIDATION_ERROR", "선택된 식사가 없어요.", 422, [
      { field: "meal_configs", reason: "no_eligible_meal" },
    ]);
  }

  const dates = validMeals.map((meal) => meal.plan_date).sort();
  const dateRangeStart = dates[0] ?? validMeals[0]!.plan_date;
  const dateRangeEnd = dates.at(-1) ?? validMeals[0]!.plan_date;

  const shoppingListInsertResult = await dbClient
    .from("shopping_lists")
    .insert({
      user_id: user.id,
      title: buildShoppingListTitle(dateRangeStart),
      date_range_start: dateRangeStart,
      date_range_end: dateRangeEnd,
      is_completed: false,
    })
    .select("id, title, is_completed, created_at")
    .maybeSingle();

  if (shoppingListInsertResult.error || !shoppingListInsertResult.data) {
    return fail("INTERNAL_ERROR", "장보기 목록을 만들지 못했어요.", 500);
  }

  const shoppingList = shoppingListInsertResult.data;
  const recipeAggregation = new Map<string, { planned_servings_total: number; shopping_servings: number }>();

  validMeals.forEach((meal) => {
    const mealConfig = mealConfigMap.get(meal.id);

    if (!mealConfig) {
      return;
    }

    const existing = recipeAggregation.get(meal.recipe_id) ?? {
      planned_servings_total: 0,
      shopping_servings: 0,
    };

    recipeAggregation.set(meal.recipe_id, {
      planned_servings_total: existing.planned_servings_total + meal.planned_servings,
      shopping_servings: existing.shopping_servings + mealConfig.shopping_servings,
    });
  });

  const shoppingRecipeRows = [...recipeAggregation.entries()].map(([recipeId, totals]) => ({
    shopping_list_id: shoppingList.id,
    recipe_id: recipeId,
    shopping_servings: totals.shopping_servings,
    planned_servings_total: totals.planned_servings_total,
  }));

  if (shoppingRecipeRows.length > 0) {
    const shoppingListRecipesResult = await dbClient
      .from("shopping_list_recipes")
      .insert(shoppingRecipeRows);

    if (shoppingListRecipesResult.error) {
      return fail("INTERNAL_ERROR", "장보기 목록을 만들지 못했어요.", 500);
    }
  }

  const recipeIds = [...recipeAggregation.keys()];
  const recipeIngredientRowsResult = await dbClient
    .from("recipe_ingredients")
    .select("recipe_id, ingredient_id, amount, unit, ingredient_type, display_text")
    .in("recipe_id", recipeIds);

  if (recipeIngredientRowsResult.error || !recipeIngredientRowsResult.data) {
    return fail("INTERNAL_ERROR", "장보기 목록을 만들지 못했어요.", 500);
  }

  const ingredientIds = [...new Set(recipeIngredientRowsResult.data.map((row) => row.ingredient_id))];
  const ingredientNameMap = new Map<string, string>();

  if (ingredientIds.length > 0) {
    const ingredientRowsResult = await dbClient
      .from("ingredients")
      .select("id, standard_name")
      .in("id", ingredientIds);

    if (ingredientRowsResult.error || !ingredientRowsResult.data) {
      return fail("INTERNAL_ERROR", "장보기 목록을 만들지 못했어요.", 500);
    }

    ingredientRowsResult.data.forEach((ingredient) => {
      ingredientNameMap.set(ingredient.id, ingredient.standard_name);
    });
  }

  const pantryIngredientIds = new Set<string>();
  if (ingredientIds.length > 0) {
    const pantryRowsResult = await dbClient
      .from("pantry_items")
      .select("ingredient_id")
      .eq("user_id", user.id)
      .in("ingredient_id", ingredientIds);

    if (pantryRowsResult.error || !pantryRowsResult.data) {
      return fail("INTERNAL_ERROR", "장보기 목록을 만들지 못했어요.", 500);
    }

    pantryRowsResult.data.forEach((row) => {
      pantryIngredientIds.add(row.ingredient_id);
    });
  }

  const mealsByRecipe = new Map<string, MealsRow[]>();
  validMeals.forEach((meal) => {
    const current = mealsByRecipe.get(meal.recipe_id) ?? [];
    current.push(meal);
    mealsByRecipe.set(meal.recipe_id, current);
  });

  const aggregatedIngredients = aggregateShoppingIngredients(
    recipeIngredientRowsResult.data.flatMap((ingredientRow) => {
      const meals = mealsByRecipe.get(ingredientRow.recipe_id) ?? [];

      return meals
        .map((meal) => {
          const config = mealConfigMap.get(meal.id);

          if (!config) {
            return null;
          }

          return {
            ingredient_id: ingredientRow.ingredient_id,
            standard_name: ingredientNameMap.get(ingredientRow.ingredient_id) ?? "",
            ingredient_type: ingredientRow.ingredient_type,
            amount: ingredientRow.amount,
            unit: ingredientRow.unit,
            display_text: ingredientRow.display_text,
            planned_servings: meal.planned_servings,
            shopping_servings: config.shopping_servings,
          };
        })
        .filter((value): value is NonNullable<typeof value> => value !== null);
    }),
  );

  if (aggregatedIngredients.length > 0) {
    const itemsInsertResult = await dbClient
      .from("shopping_list_items")
      .insert(
        aggregatedIngredients.map((ingredient, index) => ({
          shopping_list_id: shoppingList.id,
          ingredient_id: ingredient.ingredient_id,
          display_text: ingredient.display_text,
          amounts_json: ingredient.amounts_json,
          is_pantry_excluded: pantryIngredientIds.has(ingredient.ingredient_id),
          is_checked: false,
          added_to_pantry: false,
          sort_order: index,
        })),
      );

    if (itemsInsertResult.error) {
      return fail("INTERNAL_ERROR", "장보기 목록을 만들지 못했어요.", 500);
    }
  }

  const mealUpdateResult = await dbClient
    .from("meals")
    .update({ shopping_list_id: shoppingList.id })
    .in("id", validMeals.map((meal) => meal.id))
    .eq("user_id", user.id);

  if (mealUpdateResult.error) {
    return fail("INTERNAL_ERROR", "장보기 목록을 만들지 못했어요.", 500);
  }

  return ok({
    id: shoppingList.id,
    title: shoppingList.title,
    is_completed: shoppingList.is_completed,
    created_at: shoppingList.created_at,
  } satisfies ShoppingListSummary, { status: 201 });
}
