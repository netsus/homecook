import { fail, ok } from "@/lib/api/response";
import {
  aggregateShoppingIngredients,
  buildShoppingListTitle,
  parseShoppingMealConfigs,
  parseShoppingRecipeConfigs,
  type ParsedShoppingMealConfig,
  type ParsedShoppingRecipeConfig,
} from "@/lib/server/shopping";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import {
  buildShoppingBundlePreparedSourceKey,
  recordUserGrowthActivityEvent,
  type UserGrowthActivityDbClient,
} from "@/lib/server/user-growth-activity";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type {
  ShoppingListAllPantryCompletionSummary,
  ShoppingListCreateBody,
  ShoppingListHistoryData,
  ShoppingListSummary,
} from "@/types/shopping";

interface QueryError {
  message: string;
}

interface ShoppingCreateRpcData {
  id?: string | null;
  title?: string;
  date_range_start?: string;
  date_range_end?: string;
  is_completed?: boolean;
  completed_at?: string | null;
  completed_without_list?: boolean;
  meals_updated?: number;
  pantry_item_count?: number;
  created_at?: string;
  error_code?: string;
  message?: string;
}

interface MealsRow {
  id: string;
  user_id: string;
  recipe_id: string;
  plan_date: string;
  column_id: string;
  planned_servings: number;
  status: string;
  is_leftover: boolean;
  leftover_dish_id: string | null;
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

interface RecipeRow {
  id: string;
  base_servings: number;
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

interface ShoppingListHistoryRow {
  id: string;
  title: string;
  date_range_start: string;
  date_range_end: string;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
}

interface ShoppingListItemCountRow {
  shopping_list_id: string;
  is_pantry_excluded: boolean;
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

interface MealsInsertQuery {
  then: ArrayQueryResult<unknown>["then"];
}

interface ShoppingListsInsertQuery {
  select(columns: string): ShoppingListsInsertQuery;
  maybeSingle(): MaybeSingleResult<ShoppingListInsertRow>;
}

interface ShoppingListsSelectQuery {
  eq(column: string, value: string): ShoppingListsSelectQuery;
  limit(value: number): ShoppingListsSelectQuery;
  or(filters: string): ShoppingListsSelectQuery;
  order(column: string, options: { ascending: boolean }): ShoppingListsSelectQuery;
  then: ArrayQueryResult<ShoppingListHistoryRow>["then"];
}

interface ShoppingListItemsSelectForHistoryQuery {
  in(column: string, values: string[]): ShoppingListItemsSelectForHistoryQuery;
  then: ArrayQueryResult<ShoppingListItemCountRow>["then"];
}

interface RecipeIngredientsSelectQuery {
  in(column: string, values: string[]): RecipeIngredientsSelectQuery;
  then: ArrayQueryResult<RecipeIngredientRow>["then"];
}

interface RecipesSelectQuery {
  in(column: string, values: string[]): RecipesSelectQuery;
  then: ArrayQueryResult<RecipeRow>["then"];
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
  insert(values: Array<{
    user_id: string;
    recipe_id: string;
    plan_date: string;
    column_id: string;
    planned_servings: number;
    status: "registered";
    is_leftover: boolean;
    leftover_dish_id: string | null;
    shopping_list_id: null;
    cooked_at: null;
  }>): MealsInsertQuery;
  update(
    values:
      | { shopping_list_id: string }
      | { planned_servings: number }
      | { status: "shopping_done" },
  ): MealsUpdateQuery;
}

interface ShoppingListsTable {
  select(columns: string): ShoppingListsSelectQuery;
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

interface RecipesTable {
  select(columns: string): RecipesSelectQuery;
}

interface IngredientsTable {
  select(columns: string): IngredientsSelectQuery;
}

interface PantryItemsTable {
  select(columns: string): PantrySelectQuery;
}

interface ShoppingListItemsTable {
  select(columns: string): ShoppingListItemsSelectForHistoryQuery;
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
  rpc?: (
    functionName: "create_shopping_list_from_payload",
    args: {
      p_user_id: string;
      p_title: string;
      p_date_range_start: string;
      p_date_range_end: string;
      p_complete_without_list: boolean;
      p_shopping_meal_ids: string[];
      p_split_remainders: Array<Record<string, unknown>>;
      p_split_originals: Array<Record<string, unknown>>;
      p_recipe_rows: Array<Record<string, unknown>>;
      p_item_rows: Array<Record<string, unknown>>;
      p_pantry_item_count: number;
    },
  ) => PromiseLike<{
    data: ShoppingCreateRpcData | null;
    error: QueryError | null;
  }>;
  from(table: "meals"): MealsTable;
  from(table: "shopping_lists"): ShoppingListsTable;
  from(table: "shopping_list_recipes"): ShoppingListRecipesTable;
  from(table: "recipes"): RecipesTable;
  from(table: "recipe_ingredients"): RecipeIngredientsTable;
  from(table: "ingredients"): IngredientsTable;
  from(table: "pantry_items"): PantryItemsTable;
  from(table: "shopping_list_items"): ShoppingListItemsTable;
}

async function requireUser(routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>>) {
  const authResult = await routeClient.auth.getUser();
  return authResult.data.user;
}

function sortMealsForShopping(left: MealsRow, right: MealsRow) {
  const byDate = left.plan_date.localeCompare(right.plan_date);
  if (byDate !== 0) {
    return byDate;
  }

  return left.id.localeCompare(right.id);
}

function buildShoppingMealSelection({
  mealConfigMap,
  recipeConfigMap,
  usesRecipeConfigs,
  validMeals,
}: {
  mealConfigMap: Map<string, ParsedShoppingMealConfig>;
  recipeConfigMap: Map<string, ParsedShoppingRecipeConfig>;
  usesRecipeConfigs: boolean;
  validMeals: MealsRow[];
}) {
  const shoppingMeals: MealsRow[] = [];
  const splitMeals: Array<{
    meal: MealsRow;
    shoppingServings: number;
    remainingServings: number;
  }> = [];

  if (!usesRecipeConfigs) {
    validMeals.forEach((meal) => {
      const mealConfig = mealConfigMap.get(meal.id);

      if (!mealConfig) {
        return;
      }

      if (mealConfig.shopping_servings >= meal.planned_servings) {
        shoppingMeals.push(meal);
        return;
      }

      shoppingMeals.push({
        ...meal,
        planned_servings: mealConfig.shopping_servings,
      });
      splitMeals.push({
        meal,
        shoppingServings: mealConfig.shopping_servings,
        remainingServings: meal.planned_servings - mealConfig.shopping_servings,
      });
    });

    return { shoppingMeals, splitMeals };
  }

  recipeConfigMap.forEach((recipeConfig) => {
    let remainingServings = recipeConfig.shopping_servings;
    const mealsForRecipe = validMeals
      .filter(
        (meal) =>
          meal.recipe_id === recipeConfig.recipe_id &&
          recipeConfig.meal_ids.includes(meal.id),
      )
      .sort(sortMealsForShopping);

    mealsForRecipe.forEach((meal) => {
      if (remainingServings <= 0) {
        return;
      }

      if (remainingServings >= meal.planned_servings) {
        shoppingMeals.push(meal);
        remainingServings -= meal.planned_servings;
        return;
      }

      shoppingMeals.push({
        ...meal,
        planned_servings: remainingServings,
      });
      splitMeals.push({
        meal,
        shoppingServings: remainingServings,
        remainingServings: meal.planned_servings - remainingServings,
      });
      remainingServings = 0;
    });
  });

  return { shoppingMeals, splitMeals };
}

function formatHistoryCompactDateLabel(dateKey: string) {
  const [, month, day] = dateKey.split("-").map(Number);

  if (!month || !day) {
    return dateKey;
  }

  return `${month}/${day}`;
}

function buildShoppingHistoryTitle(row: ShoppingListHistoryRow) {
  const [, startMonth, startDay] = row.date_range_start.split("-").map(Number);
  const [, endMonth, endDay] = row.date_range_end.split("-").map(Number);

  if (!startMonth || !startDay || !endMonth || !endDay) {
    return row.date_range_start === row.date_range_end
      ? formatHistoryCompactDateLabel(row.date_range_start)
      : [
          formatHistoryCompactDateLabel(row.date_range_start),
          formatHistoryCompactDateLabel(row.date_range_end),
        ].join("~");
  }

  if (row.date_range_start === row.date_range_end) {
    return `${startMonth}/${startDay}`;
  }

  if (startMonth === endMonth) {
    return `${startMonth}/${startDay}~${endDay}`;
  }

  return `${startMonth}/${startDay}~${endMonth}/${endDay}`;
}

function statusFromShoppingCreateRpcError(code: string | undefined) {
  switch (code) {
    case "VALIDATION_ERROR":
      return 422;
    case "RESOURCE_NOT_FOUND":
      return 404;
    case "FORBIDDEN":
      return 403;
    case "CONFLICT":
      return 409;
    default:
      return 500;
  }
}

export async function POST(request: Request) {
  let body: ShoppingListCreateBody;

  try {
    body = (await request.json()) as ShoppingListCreateBody;
  } catch {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해 주세요.", 422, [{ field: "body", reason: "invalid_json" }]);
  }

  const usesRecipeConfigs = Array.isArray(body.recipes);
  const parsedMealConfigs = usesRecipeConfigs ? null : parseShoppingMealConfigs(body);
  const parsedRecipeConfigs = usesRecipeConfigs ? parseShoppingRecipeConfigs(body) : null;
  const parseFields = parsedRecipeConfigs?.fields ?? parsedMealConfigs?.fields ?? [];

  if (parseFields.length > 0) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해 주세요.", 422, parseFields);
  }

  const routeClient = await createRouteHandlerClient();
  const user = await requireUser(routeClient);

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    ShoppingCreateDbClient & UserBootstrapDbClient & UserGrowthActivityDbClient;

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

  const validConfigCount =
    parsedRecipeConfigs?.valid_configs.length ??
    parsedMealConfigs?.valid_configs.length ??
    0;

  if (validConfigCount === 0) {
    return fail("VALIDATION_ERROR", "선택된 식사가 없어요.", 422, [
      { field: usesRecipeConfigs ? "recipes" : "meal_configs", reason: "no_valid_meal" },
    ]);
  }

  const mealConfigMap = new Map(
    (parsedMealConfigs?.valid_configs ?? []).map((config) => [config.meal_id, config]),
  );
  const recipeConfigMap = new Map(
    (parsedRecipeConfigs?.valid_configs ?? []).map((config) => [config.recipe_id, config]),
  );
  const mealIds = usesRecipeConfigs
    ? [
        ...new Set(
          (parsedRecipeConfigs?.valid_configs ?? []).flatMap(
            (config) => config.meal_ids,
          ),
        ),
      ]
    : [...mealConfigMap.keys()];

  const mealsResult = await dbClient
    .from("meals")
    .select(
      "id, user_id, recipe_id, plan_date, column_id, planned_servings, status, is_leftover, leftover_dish_id, shopping_list_id",
    )
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

  const validMeals = mealsResult.data.filter((meal) => {
    if (meal.status !== "registered") {
      return false;
    }

    if (!usesRecipeConfigs) {
      return mealConfigMap.has(meal.id);
    }

    const recipeConfig = recipeConfigMap.get(meal.recipe_id);
    return Boolean(recipeConfig?.meal_ids.includes(meal.id));
  });

  if (validMeals.length === 0) {
    return fail("VALIDATION_ERROR", "선택된 식사가 없어요.", 422, [
      { field: "meal_configs", reason: "no_eligible_meal" },
    ]);
  }

  const { shoppingMeals, splitMeals } = buildShoppingMealSelection({
    mealConfigMap,
    recipeConfigMap,
    usesRecipeConfigs,
    validMeals,
  });

  if (shoppingMeals.length === 0) {
    return fail("VALIDATION_ERROR", "선택된 식사가 없어요.", 422, [
      { field: usesRecipeConfigs ? "recipes" : "meal_configs", reason: "no_eligible_meal" },
    ]);
  }

  const dates = shoppingMeals.map((meal) => meal.plan_date).sort();
  const dateRangeStart = dates[0] ?? shoppingMeals[0]!.plan_date;
  const dateRangeEnd = dates.at(-1) ?? shoppingMeals[0]!.plan_date;

  const recipeAggregation = new Map<
    string,
    { planned_servings_total: number; shopping_servings: number }
  >();

  if (usesRecipeConfigs) {
    (parsedRecipeConfigs?.valid_configs ?? []).forEach((recipeConfig) => {
      const mealsForRecipe = shoppingMeals.filter(
        (meal) =>
          meal.recipe_id === recipeConfig.recipe_id &&
          recipeConfig.meal_ids.includes(meal.id),
      );

      if (mealsForRecipe.length === 0) {
        return;
      }

      recipeAggregation.set(recipeConfig.recipe_id, {
        planned_servings_total: mealsForRecipe.reduce(
          (total, meal) => total + meal.planned_servings,
          0,
        ),
        shopping_servings: recipeConfig.shopping_servings,
      });
    });
  } else {
    shoppingMeals.forEach((meal) => {
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
  }

  const recipeIds = [...recipeAggregation.keys()];
  const recipeRowsResult = await dbClient
    .from("recipes")
    .select("id, base_servings")
    .in("id", recipeIds);

  if (recipeRowsResult.error || !recipeRowsResult.data) {
    return fail("INTERNAL_ERROR", "장보기 목록을 만들지 못했어요.", 500);
  }

  const recipeBaseServingsMap = new Map(
    recipeRowsResult.data.map((recipe) => [recipe.id, recipe.base_servings]),
  );

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

  const aggregatedIngredients = aggregateShoppingIngredients(
    recipeIngredientRowsResult.data
      .map((ingredientRow) => {
        const recipeTotals = recipeAggregation.get(ingredientRow.recipe_id);

        if (!recipeTotals) {
          return null;
        }

        return {
          ingredient_id: ingredientRow.ingredient_id,
          standard_name: ingredientNameMap.get(ingredientRow.ingredient_id) ?? "",
          ingredient_type: ingredientRow.ingredient_type,
          amount: ingredientRow.amount,
          unit: ingredientRow.unit,
          display_text: ingredientRow.display_text,
          planned_servings:
            recipeBaseServingsMap.get(ingredientRow.recipe_id) ??
            recipeTotals.planned_servings_total,
          shopping_servings: recipeTotals.shopping_servings,
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null),
  );

  const allNeededIngredientsAreInPantry =
    aggregatedIngredients.length > 0 &&
    aggregatedIngredients.every((ingredient) =>
      pantryIngredientIds.has(ingredient.ingredient_id),
    );
  const title = buildShoppingListTitle(dateRangeStart);
  const shoppingMealIds = shoppingMeals.map((meal) => meal.id).sort();
  const shoppingRecipePayloadRows = [...recipeAggregation.entries()].map(([recipeId, totals]) => ({
    recipe_id: recipeId,
    shopping_servings: totals.shopping_servings,
    planned_servings_total: totals.planned_servings_total,
  }));
  const shoppingItemPayloadRows = aggregatedIngredients.map((ingredient, index) => ({
    ingredient_id: ingredient.ingredient_id,
    display_text: ingredient.display_text,
    amounts_json: ingredient.amounts_json,
    is_pantry_excluded: pantryIngredientIds.has(ingredient.ingredient_id),
    sort_order: index,
  }));

  if (typeof dbClient.rpc === "function") {
    const createResult = await dbClient.rpc("create_shopping_list_from_payload", {
      p_user_id: user.id,
      p_title: title,
      p_date_range_start: dateRangeStart,
      p_date_range_end: dateRangeEnd,
      p_complete_without_list: allNeededIngredientsAreInPantry,
      p_shopping_meal_ids: shoppingMealIds,
      p_split_remainders: splitMeals.map(({ meal, remainingServings }) => ({
        user_id: meal.user_id,
        recipe_id: meal.recipe_id,
        plan_date: meal.plan_date,
        column_id: meal.column_id,
        planned_servings: remainingServings,
        status: "registered",
        is_leftover: meal.is_leftover,
        leftover_dish_id: meal.leftover_dish_id,
        shopping_list_id: null,
        cooked_at: null,
      })),
      p_split_originals: splitMeals.map((splitMeal) => ({
        meal_id: splitMeal.meal.id,
        planned_servings: splitMeal.shoppingServings,
      })),
      p_recipe_rows: shoppingRecipePayloadRows,
      p_item_rows: shoppingItemPayloadRows,
      p_pantry_item_count: aggregatedIngredients.length,
    });

    if (createResult.error || !createResult.data) {
      return fail("INTERNAL_ERROR", "장보기 목록을 만들지 못했어요.", 500);
    }

    if (createResult.data.error_code) {
      return fail(
        createResult.data.error_code,
        createResult.data.message ?? "장보기 목록을 만들지 못했어요.",
        statusFromShoppingCreateRpcError(createResult.data.error_code),
      );
    }

    if (createResult.data.completed_without_list) {
      const completedAt = createResult.data.completed_at ?? new Date().toISOString();
      const representativeMealId = shoppingMealIds[0];

      if (representativeMealId) {
        try {
          await recordUserGrowthActivityEvent(dbClient, {
            userId: user.id,
            activityType: "shopping_bundle_prepared",
            category: "shopping",
            sourceKey: buildShoppingBundlePreparedSourceKey({
              actionKind: "completed_without_list",
              mealIds: shoppingMealIds,
            }),
            sourceTable: "meals",
            sourceId: representativeMealId,
            sourceMeta: {
              action_kind: "completed_without_list",
              meal_ids: shoppingMealIds,
              pantry_item_count: aggregatedIngredients.length,
            },
            occurredAt: completedAt,
          });
        } catch {
          // Activity history is secondary; pantry-only shopping completion remains authoritative.
        }
      }

      return ok({
        id: null,
        title,
        date_range_start: dateRangeStart,
        date_range_end: dateRangeEnd,
        is_completed: true,
        completed_at: completedAt,
        completed_without_list: true,
        meals_updated: createResult.data.meals_updated ?? shoppingMealIds.length,
        pantry_item_count: createResult.data.pantry_item_count ?? aggregatedIngredients.length,
        created_at: createResult.data.created_at ?? completedAt,
      } satisfies ShoppingListAllPantryCompletionSummary, { status: 200 });
    }

    if (!createResult.data.id || !createResult.data.created_at) {
      return fail("INTERNAL_ERROR", "장보기 목록을 만들지 못했어요.", 500);
    }

    try {
      await recordUserGrowthActivityEvent(dbClient, {
        userId: user.id,
        activityType: "shopping_bundle_prepared",
        category: "shopping",
        sourceKey: buildShoppingBundlePreparedSourceKey({
          actionKind: "shopping_list",
          mealIds: shoppingMealIds,
        }),
        sourceTable: "shopping_lists",
        sourceId: createResult.data.id,
        sourceMeta: {
          action_kind: "shopping_list",
          meal_ids: shoppingMealIds,
          pantry_item_count: pantryIngredientIds.size,
        },
        occurredAt: createResult.data.created_at,
      });
    } catch {
      // Activity history is secondary; shopping list creation remains authoritative.
    }

    return ok({
      id: createResult.data.id,
      title: createResult.data.title ?? title,
      is_completed: createResult.data.is_completed ?? false,
      created_at: createResult.data.created_at,
    } satisfies ShoppingListSummary, { status: 201 });
  }

  if (splitMeals.length > 0) {
    const splitRemainderInsertResult = await dbClient
      .from("meals")
      .insert(
        splitMeals.map(({ meal, remainingServings }) => ({
          user_id: meal.user_id,
          recipe_id: meal.recipe_id,
          plan_date: meal.plan_date,
          column_id: meal.column_id,
          planned_servings: remainingServings,
          status: "registered",
          is_leftover: meal.is_leftover,
          leftover_dish_id: meal.leftover_dish_id,
          shopping_list_id: null,
          cooked_at: null,
        })),
      );

    if (splitRemainderInsertResult.error) {
      return fail("INTERNAL_ERROR", "장보기 목록을 만들지 못했어요.", 500);
    }

    for (const splitMeal of splitMeals) {
      const splitOriginalUpdateResult = await dbClient
        .from("meals")
        .update({ planned_servings: splitMeal.shoppingServings })
        .eq("id", splitMeal.meal.id)
        .eq("user_id", user.id);

      if (splitOriginalUpdateResult.error) {
        return fail("INTERNAL_ERROR", "장보기 목록을 만들지 못했어요.", 500);
      }
    }
  }

  if (allNeededIngredientsAreInPantry) {
    const mealDoneUpdateResult = await dbClient
      .from("meals")
      .update({ status: "shopping_done" })
      .in("id", shoppingMeals.map((meal) => meal.id))
      .eq("user_id", user.id);

    if (mealDoneUpdateResult.error) {
      return fail("INTERNAL_ERROR", "장보기 완료 상태로 바꾸지 못했어요.", 500);
    }

    const completedAt = new Date().toISOString();
    const mealIds = shoppingMeals.map((meal) => meal.id).sort();
    const representativeMealId = mealIds[0];

    if (representativeMealId) {
      try {
        await recordUserGrowthActivityEvent(dbClient, {
          userId: user.id,
          activityType: "shopping_bundle_prepared",
          category: "shopping",
          sourceKey: buildShoppingBundlePreparedSourceKey({
            actionKind: "completed_without_list",
            mealIds,
          }),
          sourceTable: "meals",
          sourceId: representativeMealId,
          sourceMeta: {
            action_kind: "completed_without_list",
            meal_ids: mealIds,
            pantry_item_count: aggregatedIngredients.length,
          },
          occurredAt: completedAt,
        });
      } catch {
        // Activity history is secondary; pantry-only shopping completion remains authoritative.
      }
    }

    return ok({
      id: null,
      title,
      date_range_start: dateRangeStart,
      date_range_end: dateRangeEnd,
      is_completed: true,
      completed_at: completedAt,
      completed_without_list: true,
      meals_updated: shoppingMeals.length,
      pantry_item_count: aggregatedIngredients.length,
      created_at: completedAt,
    } satisfies ShoppingListAllPantryCompletionSummary, { status: 200 });
  }

  const shoppingListInsertResult = await dbClient
    .from("shopping_lists")
    .insert({
      user_id: user.id,
      title,
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
  const shoppingRecipeRows = shoppingRecipePayloadRows.map((recipeRow) => ({
    shopping_list_id: shoppingList.id,
    recipe_id: recipeRow.recipe_id,
    shopping_servings: recipeRow.shopping_servings,
    planned_servings_total: recipeRow.planned_servings_total,
  }));

  if (shoppingRecipeRows.length > 0) {
    const shoppingListRecipesResult = await dbClient
      .from("shopping_list_recipes")
      .insert(shoppingRecipeRows);

    if (shoppingListRecipesResult.error) {
      return fail("INTERNAL_ERROR", "장보기 목록을 만들지 못했어요.", 500);
    }
  }

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
    .in("id", shoppingMeals.map((meal) => meal.id))
    .eq("user_id", user.id);

  if (mealUpdateResult.error) {
    return fail("INTERNAL_ERROR", "장보기 목록을 만들지 못했어요.", 500);
  }

  try {
    await recordUserGrowthActivityEvent(dbClient, {
      userId: user.id,
      activityType: "shopping_bundle_prepared",
      category: "shopping",
      sourceKey: buildShoppingBundlePreparedSourceKey({
        actionKind: "shopping_list",
        mealIds: shoppingMealIds,
      }),
      sourceTable: "shopping_lists",
      sourceId: shoppingList.id,
      sourceMeta: {
        action_kind: "shopping_list",
        meal_ids: shoppingMealIds,
        pantry_item_count: pantryIngredientIds.size,
      },
      occurredAt: shoppingList.created_at,
    });
  } catch {
    // Activity history is secondary; shopping list creation remains authoritative.
  }

  return ok({
    id: shoppingList.id,
    title: shoppingList.title,
    is_completed: shoppingList.is_completed,
    created_at: shoppingList.created_at,
  } satisfies ShoppingListSummary, { status: 201 });
}

const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 50;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_CURSOR_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function clampHistoryLimit(value: string | null) {
  if (!value) {
    return DEFAULT_HISTORY_LIMIT;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_HISTORY_LIMIT;
  }

  return Math.min(parsed, MAX_HISTORY_LIMIT);
}

function encodeShoppingHistoryCursor(row: ShoppingListHistoryRow) {
  return `${row.created_at}|${row.id}`;
}

function parseShoppingHistoryCursor(value: string | null) {
  if (!value) {
    return null;
  }

  const [createdAt, id] = value.split("|");

  if (
    !createdAt ||
    !id ||
    !ISO_CURSOR_DATE_PATTERN.test(createdAt) ||
    !Number.isFinite(Date.parse(createdAt)) ||
    !UUID_PATTERN.test(id)
  ) {
    return null;
  }

  return { createdAt, id };
}

function buildShoppingHistoryCursorFilter(cursor: NonNullable<ReturnType<typeof parseShoppingHistoryCursor>>) {
  return [
    `created_at.lt.${cursor.createdAt}`,
    `and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
  ].join(",");
}

export async function GET(request: Request) {
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
      formatBootstrapErrorMessage(bootstrapError, "장보기 기록을 불러오지 못했어요."),
      500,
    );
  }

  const url = new URL(request.url);
  const limit = clampHistoryLimit(url.searchParams.get("limit"));
  const cursor = parseShoppingHistoryCursor(url.searchParams.get("cursor"));
  let listsQuery = dbClient
    .from("shopping_lists")
    .select("id, title, date_range_start, date_range_end, is_completed, completed_at, created_at")
    .eq("user_id", user.id);

  if (cursor) {
    listsQuery = listsQuery.or(buildShoppingHistoryCursorFilter(cursor));
  }

  const listsResult = await listsQuery
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (listsResult.error || !listsResult.data) {
    return fail("INTERNAL_ERROR", "장보기 기록을 불러오지 못했어요.", 500);
  }

  const rowsWithExtra = listsResult.data.slice(0, limit + 1);
  const hasNext = rowsWithExtra.length > limit;
  const rows = hasNext ? rowsWithExtra.slice(0, limit) : rowsWithExtra;

  if (rows.length === 0) {
    return ok({ items: [], next_cursor: null, has_next: false } satisfies ShoppingListHistoryData);
  }

  const listIds = rows.map((row) => row.id);
  const itemsResult = await dbClient
    .from("shopping_list_items")
    .select("shopping_list_id, is_pantry_excluded")
    .in("shopping_list_id", listIds);

  if (itemsResult.error || !itemsResult.data) {
    return fail("INTERNAL_ERROR", "장보기 기록을 불러오지 못했어요.", 500);
  }

  const itemCountByListId = new Map<string, number>();

  itemsResult.data.forEach((item) => {
    if (item.is_pantry_excluded) {
      return;
    }

    itemCountByListId.set(
      item.shopping_list_id,
      (itemCountByListId.get(item.shopping_list_id) ?? 0) + 1,
    );
  });

  return ok({
    items: rows.map((row) => ({
      id: row.id,
      title: buildShoppingHistoryTitle(row),
      date_range_start: row.date_range_start,
      date_range_end: row.date_range_end,
      is_completed: row.is_completed,
      completed_at: row.completed_at,
      item_count: itemCountByListId.get(row.id) ?? 0,
      created_at: row.created_at,
    })),
    next_cursor: hasNext ? encodeShoppingHistoryCursor(rows[rows.length - 1]) : null,
    has_next: hasNext,
  } satisfies ShoppingListHistoryData);
}
