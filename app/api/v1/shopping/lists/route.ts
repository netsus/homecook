import { fail, ok } from "@/lib/api/response";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  aggregateShoppingIngredients,
  buildShoppingListTitle,
  parseShoppingMealConfigs,
  parseShoppingRecipeConfigs,
  type ParsedShoppingMealConfig,
  type ParsedShoppingRecipeConfig,
} from "@/lib/server/shopping";
import { productPurchaseSuggestion, productVersionKey, readProductQuantityContexts, scaleProductAmount, type ProductAmount } from "@/lib/server/recipe-product-quantity";
import type { RecipeProductNutritionClient } from "@/lib/server/recipe-product-nutrition";
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
import { readVerifiedAccountGenerationSession } from
  "@/lib/server/account-generation/session-authority";
import {
  buildSessionAuthorityRpcArgs,
  callFuturePropagationRpc,
  type FuturePropagationRpcClient,
} from "@/lib/server/recipe-content-snapshot-future-propagation";
import {
  createRouteHandlerClient,
  createShoppingCreateInternalClient,
} from "@/lib/supabase/server";
import type {
  ShoppingListAllPantryCompletionSummary,
  ShoppingListAllPantrySummary,
  ShoppingListCreateBody,
  ShoppingListHistoryData,
  ShoppingListItemSummary,
  ShoppingListSummary,
} from "@/types/shopping";

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
  items?: ShoppingCreateItemRow[];
  error_code?: string;
  message?: string;
}

interface ShoppingCreateItemRow {
  id: string;
  ingredient_id: string | null;
  food_product_id: string | null;
  food_product_nutrition_version_id: string | null;
  display_text: string;
  amounts_json: Array<{ amount: number; unit: string }>;
  is_checked: boolean;
  is_pantry_excluded: boolean;
  added_to_pantry: boolean;
  sort_order: number;
}

interface PinnedIngredientSnapshot {
  ingredient_id?: unknown;
  food_product_id?: unknown;
  food_product_nutrition_version_id?: unknown;
  amount?: unknown;
  unit?: unknown;
  ingredient_type?: unknown;
  display_text?: unknown;
  scalable?: unknown;
}

interface MealsRow {
  id: string;
  user_id: string;
  recipe_id: string;
  recipe_content_snapshot_id: string | null;
  recipe_content_snapshots:
    | {
      base_servings: number | null;
      ingredients_json: unknown;
    }
    | Array<{
      base_servings: number | null;
      ingredients_json: unknown;
    }>
    | null;
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
  ingredient_id: string | null;
  food_product_id: string | null;
  food_product_nutrition_version_id: string | null;
}

type ShoppingListHistoryRow = {
  id: string;
  title: string;
  date_range_start: string;
  date_range_end: string;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
};

// History read capability only; POST's snapshot/growth/writer boundary stays separate.
export type ShoppingHistoryDbClient = Pick<SupabaseClient<{
  public: {
    Tables: {
      shopping_lists: {
        Row: ShoppingListHistoryRow & { user_id: string };
        Insert: never; Update: never; Relationships: [];
      };
      shopping_list_items: {
        Row: { shopping_list_id: string; is_pantry_excluded: boolean };
        Insert: never; Update: never; Relationships: [];
      };
    };
    Views: Record<never, never>; Functions: Record<never, never>;
  };
}>, "from">;

// These are the six consumed read projections, not runtime grants or a complete schema.
// Snapshot JSON is unknown; fields are narrowed only in the branch that consumes them.
export type ShoppingCreateDbClient = Pick<SupabaseClient<{
  public: {
    Tables: {
      meals: {
        Row: Omit<MealsRow, "recipe_content_snapshots" | "status"> & { status: "registered" | "shopping_done" | "cook_done" };
        Insert: never; Update: never;
        Relationships: [{ foreignKeyName: "meals_recipe_content_snapshot_id_fkey"; columns: ["recipe_content_snapshot_id"];
          isOneToOne: false; referencedRelation: "recipe_content_snapshots"; referencedColumns: ["id"] }];
      };
      recipe_content_snapshots: {
        Row: { id: string; base_servings: number; ingredients_json: unknown };
        Insert: never; Update: never; Relationships: [];
      };
      recipes: { Row: { [K in keyof RecipeRow]: RecipeRow[K] }; Insert: never; Update: never; Relationships: [] };
      recipe_ingredients: {
        Row: { recipe_id: string; ingredient_id: string | null; food_product_id: string | null;
          food_product_nutrition_version_id: string | null; amount: number | null; unit: string | null;
          ingredient_type: "QUANT" | "TO_TASTE"; display_text: string | null };
        Insert: never; Update: never; Relationships: [];
      };
      ingredients: { Row: { [K in keyof IngredientRow]: IngredientRow[K] }; Insert: never; Update: never; Relationships: [] };
      pantry_items: { Row: { [K in keyof PantryRow]: PantryRow[K] } & { user_id: string }; Insert: never; Update: never; Relationships: [] };
    };
    Views: Record<never, never>; Functions: Record<never, never>;
  };
}>, "from"> & Partial<RecipeProductNutritionClient>;

function isSnapshotIngredientObject(value: unknown): value is PinnedIngredientSnapshot {
  return value !== null && typeof value === "object";
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

function getMealContentSnapshot(meal: MealsRow) {
  return Array.isArray(meal.recipe_content_snapshots)
    ? meal.recipe_content_snapshots[0] ?? null
    : meal.recipe_content_snapshots;
}

function hasContentPin(meal: MealsRow) {
  return typeof meal.recipe_content_snapshot_id === "string" && meal.recipe_content_snapshot_id.length > 0;
}

function toShoppingCreateItem(row: ShoppingCreateItemRow): ShoppingListItemSummary {
  const sourceType =
    row.ingredient_id !== null
      ? "ingredient"
      : row.food_product_id !== null
          && row.food_product_nutrition_version_id !== null
        ? "food_product"
        : null;

  return {
    id: row.id,
    source_type: sourceType,
    ingredient_id: row.ingredient_id,
    food_product_id: row.food_product_id,
    food_product_nutrition_version_id:
      row.food_product_nutrition_version_id,
    display_text: row.display_text,
    amounts_json: row.amounts_json,
    is_checked: row.is_checked,
    is_pantry_excluded: row.is_pantry_excluded,
    added_to_pantry: row.added_to_pantry,
    sort_order: row.sort_order,
  };
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

function shoppingContentGroupKey(meal: MealsRow) {
  return `${meal.recipe_id}:${meal.recipe_content_snapshot_id ?? "legacy"}`;
}

function allocateRecipeShoppingServings(
  meals: MealsRow[],
  requestedServings: number,
) {
  const plannedByGroup = new Map<string, number>();
  for (const meal of meals) {
    const key = shoppingContentGroupKey(meal);
    plannedByGroup.set(key, (plannedByGroup.get(key) ?? 0) + meal.planned_servings);
  }

  const plannedTotal = [...plannedByGroup.values()].reduce(
    (total, servings) => total + servings,
    0,
  );
  if (plannedTotal <= 0) {
    return new Map<string, number>();
  }

  const allocations = [...plannedByGroup.entries()].map(([key, servings]) => {
    const exact = (requestedServings * servings) / plannedTotal;
    const allocated = Math.floor(exact);
    return { key, allocated, remainder: exact - allocated };
  });
  let unallocated = requestedServings - allocations.reduce(
    (total, allocation) => total + allocation.allocated,
    0,
  );
  allocations.sort((left, right) =>
    right.remainder - left.remainder || left.key.localeCompare(right.key),
  );
  for (const allocation of allocations) {
    if (unallocated <= 0) {
      break;
    }
    allocation.allocated += 1;
    unallocated -= 1;
  }

  return new Map(allocations.map((allocation) => [
    allocation.key,
    allocation.allocated,
  ]));
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
  const routeClient = await createRouteHandlerClient();
  const user = await requireUser(routeClient);

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

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

  const dbClient: ShoppingCreateDbClient & UserBootstrapDbClient & UserGrowthActivityDbClient = routeClient;

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
      "id, user_id, recipe_id, recipe_content_snapshot_id, recipe_content_snapshots(base_servings, ingredients_json), plan_date, column_id, planned_servings, status, is_leftover, leftover_dish_id, shopping_list_id",
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

  if (validMeals.some((meal) => hasContentPin(meal) && getMealContentSnapshot(meal) === null)) {
    return fail("INTERNAL_ERROR", "장보기 목록을 만들지 못했어요.", 500);
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

  const recipeGroupShoppingServings = new Map<string, number>();
  const recipeGroupPlannedServings = new Map<string, number>();
  for (const meal of shoppingMeals) {
    const key = shoppingContentGroupKey(meal);
    recipeGroupPlannedServings.set(
      key,
      (recipeGroupPlannedServings.get(key) ?? 0) + meal.planned_servings,
    );
  }

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

      const groupAllocations = allocateRecipeShoppingServings(
        mealsForRecipe,
        recipeConfig.shopping_servings,
      );
      for (const [key, servings] of groupAllocations) {
        recipeGroupShoppingServings.set(key, servings);
      }
    });
  }

  const shoppingServingsByMealId = new Map<string, number>();
  shoppingMeals.forEach((meal) => {
    if (!usesRecipeConfigs) {
      shoppingServingsByMealId.set(
        meal.id,
        mealConfigMap.get(meal.id)?.shopping_servings ?? meal.planned_servings,
      );
      return;
    }

    const key = shoppingContentGroupKey(meal);
    const groupPlannedServings = recipeGroupPlannedServings.get(key) ?? 0;
    const groupShoppingServings = recipeGroupShoppingServings.get(key);
    const shoppingServings = groupShoppingServings !== undefined
      && groupPlannedServings > 0
      ? (groupShoppingServings * meal.planned_servings) / groupPlannedServings
      : meal.planned_servings;
    shoppingServingsByMealId.set(meal.id, shoppingServings);
  });

  const recipeAggregation = new Map<
    string,
    {
      recipe_id: string;
      recipe_content_snapshot_id: string | null;
      planned_servings_total: number;
      shopping_servings: number;
    }
  >();

  shoppingMeals.forEach((meal) => {
    const key = shoppingContentGroupKey(meal);
    const existing = recipeAggregation.get(key) ?? {
      recipe_id: meal.recipe_id,
      recipe_content_snapshot_id: meal.recipe_content_snapshot_id,
      planned_servings_total: 0,
      shopping_servings: 0,
    };

    existing.planned_servings_total += meal.planned_servings;
    existing.shopping_servings = usesRecipeConfigs
      ? recipeGroupShoppingServings.get(key) ?? meal.planned_servings
      : existing.shopping_servings
        + (shoppingServingsByMealId.get(meal.id) ?? meal.planned_servings);
    recipeAggregation.set(key, existing);
  });

  const legacyMeals = shoppingMeals.filter((meal) => !hasContentPin(meal));
  const contentPinnedMeals = shoppingMeals.filter((meal) => hasContentPin(meal));
  const legacyRecipeIds = [...new Set(legacyMeals.map((meal) => meal.recipe_id))];
  const recipeBaseServingsMap = new Map<string, number>();
  const ingredientAggregationRows: Array<
    Omit<RecipeIngredientRow, "amount" | "unit" | "ingredient_type" | "display_text"> & {
      amount: unknown;
      unit: unknown;
      ingredient_type: unknown;
      display_text: unknown;
      shopping_key: string;
      shopping_servings: number;
      planned_servings: number;
    }
  > = [];
  const productAggregationRows: Array<{
    food_product_id: string;
    food_product_nutrition_version_id: string;
    display_text: string;
    amount: unknown;
    unit: unknown;
    shopping_servings: number;
    planned_servings: number;
    scalable: boolean;
    purchase_scale: ProductAmount["scale"];
  }> = [];

  if (legacyRecipeIds.length > 0) {
    const recipeRowsResult = await dbClient
      .from("recipes")
      .select("id, base_servings")
      .in("id", legacyRecipeIds);

    if (recipeRowsResult.error || !recipeRowsResult.data) {
      return fail("INTERNAL_ERROR", "장보기 목록을 만들지 못했어요.", 500);
    }

    recipeRowsResult.data.forEach((recipe) => {
      recipeBaseServingsMap.set(recipe.id, recipe.base_servings);
    });

    const recipeIngredientRowsResult = await dbClient
      .from("recipe_ingredients")
      .select("recipe_id, ingredient_id, food_product_id, food_product_nutrition_version_id, amount, unit, ingredient_type, display_text")
      .in("recipe_id", legacyRecipeIds);

    if (recipeIngredientRowsResult.error || !recipeIngredientRowsResult.data) {
      return fail("INTERNAL_ERROR", "장보기 목록을 만들지 못했어요.", 500);
    }

    if (recipeIngredientRowsResult.data.some((row) => row.ingredient_id === null && row.food_product_id && row.food_product_nutrition_version_id)) {
      return fail("CONFLICT", "장보기 재료를 확인하지 못했어요. 계획을 다시 열어 확인해 주세요.", 409);
    }

    for (const row of recipeIngredientRowsResult.data) {
      const ingredientId = row.ingredient_id;
      if (ingredientId === null) return fail("INTERNAL_ERROR", "장보기 재료를 확인하지 못했어요.", 500);
      legacyMeals
        .filter((meal) => meal.recipe_id === row.recipe_id)
        .forEach((meal) => {
          const plannedServings = recipeBaseServingsMap.get(row.recipe_id);
          if (!plannedServings) {
            return;
          }

          ingredientAggregationRows.push({
            ...row,
            ingredient_id: ingredientId,
            shopping_key: `${meal.recipe_id}:${meal.recipe_content_snapshot_id ?? "legacy"}`,
            shopping_servings:
              shoppingServingsByMealId.get(meal.id) ?? meal.planned_servings,
            planned_servings: plannedServings,
          });
        });
    }
  }

  for (const meal of contentPinnedMeals) {
    const contentSnapshot = getMealContentSnapshot(meal);
    if (!contentSnapshot || typeof contentSnapshot.base_servings !== "number") {
      continue;
    }

    const shoppingServings =
      shoppingServingsByMealId.get(meal.id) ?? meal.planned_servings;

    const ingredients = contentSnapshot.ingredients_json;
    if (ingredients === null || ingredients === undefined || typeof ingredients === "string") continue;
    if (!Array.isArray(ingredients)) throw new TypeError("snapshot ingredients are not iterable");
    for (const rawIngredient of ingredients) {
      if (rawIngredient === null || rawIngredient === undefined) throw new TypeError("Cannot read properties of null");
      if (!isSnapshotIngredientObject(rawIngredient)) continue;
      const ingredient = rawIngredient;
      if (
        ingredient.food_product_id &&
        ingredient.food_product_nutrition_version_id
      ) {
        const label = ingredient.display_text;
        if (label !== null && label !== undefined && typeof label !== "string") throw new TypeError("display_text.trim is not a function");
        if (typeof ingredient.food_product_id !== "string" || typeof ingredient.food_product_nutrition_version_id !== "string") {
          return fail("INTERNAL_ERROR", "장보기 재료를 확인하지 못했어요.", 500);
        }
        productAggregationRows.push({
          food_product_id: ingredient.food_product_id,
          food_product_nutrition_version_id:
            ingredient.food_product_nutrition_version_id,
          display_text: label?.trim() || "상품",
          amount: ingredient.amount,
          unit: ingredient.unit,
          shopping_servings: shoppingServings,
          planned_servings: contentSnapshot.base_servings,
          scalable: ingredient.scalable !== false,
          purchase_scale: ingredient.scalable === false ? [] : usesRecipeConfigs
            ? [{ numerator: recipeGroupShoppingServings.get(shoppingContentGroupKey(meal)) ?? meal.planned_servings, denominator: contentSnapshot.base_servings },
              { numerator: meal.planned_servings, denominator: recipeGroupPlannedServings.get(shoppingContentGroupKey(meal)) ?? meal.planned_servings }]
            : [{ numerator: shoppingServings, denominator: contentSnapshot.base_servings }],
        });
        continue;
      }

      if (!ingredient.ingredient_id) {
        continue;
      }
      if (typeof ingredient.ingredient_id !== "string") {
        return fail("INTERNAL_ERROR", "장보기 재료를 확인하지 못했어요.", 500);
      }

      ingredientAggregationRows.push({
        recipe_id: meal.recipe_id,
        ingredient_id: ingredient.ingredient_id,
        amount: ingredient.amount,
        unit: ingredient.unit,
        ingredient_type: ingredient.ingredient_type,
        display_text: ingredient.display_text,
        shopping_key:
          `${meal.recipe_id}:${meal.recipe_content_snapshot_id ?? "legacy"}`,
        shopping_servings: shoppingServings,
        planned_servings: contentSnapshot.base_servings,
      });
    }
  }

  const ingredientIds = [...new Set(ingredientAggregationRows.map((row) => row.ingredient_id))];
  const neededIngredientIds = new Set(ingredientIds);
  const neededProductVersionPairs = new Set(
    productAggregationRows.map(
      (row) =>
        `${row.food_product_id}:${row.food_product_nutrition_version_id}`,
    ),
  );
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
  const pantryProductVersionPairs = new Set<string>();
  if (ingredientIds.length > 0 || neededProductVersionPairs.size > 0) {
    const pantryIdentityFilters = [
      ...(ingredientIds.length > 0
        ? [`ingredient_id.in.(${ingredientIds.join(",")})`]
        : []),
      ...[...neededProductVersionPairs].map((pair) => {
        const [productId, versionId] = pair.split(":");
        return `and(food_product_id.eq.${productId},food_product_nutrition_version_id.eq.${versionId})`;
      }),
    ];
    const pantryRowsResult = await dbClient
      .from("pantry_items")
      .select(
        "ingredient_id, food_product_id, food_product_nutrition_version_id",
      )
      .eq("user_id", user.id)
      .or(pantryIdentityFilters.join(","));

    if (pantryRowsResult.error || !pantryRowsResult.data) {
      return fail("INTERNAL_ERROR", "장보기 목록을 만들지 못했어요.", 500);
    }

    pantryRowsResult.data.forEach((row) => {
      if (
        row.ingredient_id !== null
        && neededIngredientIds.has(row.ingredient_id)
      ) {
        pantryIngredientIds.add(row.ingredient_id);
      }
      if (
        row.food_product_id !== null
        && row.food_product_nutrition_version_id !== null
      ) {
        const pair =
          `${row.food_product_id}:${row.food_product_nutrition_version_id}`;
        if (neededProductVersionPairs.has(pair)) {
          pantryProductVersionPairs.add(pair);
        }
      }
    });
  }

  // Recover a display label only, never a replacement catalog identity.
  const unavailableIngredients = new Map<string, { name: string; hasQuant: boolean }>();
  for (const row of ingredientAggregationRows) {
    if (ingredientNameMap.has(row.ingredient_id)) continue;
    const previous = unavailableIngredients.get(row.ingredient_id);
    let displayName = previous?.name;
    if (displayName === undefined) {
      const label = row.display_text;
      if (label !== null && label !== undefined && typeof label !== "string") throw new TypeError("display_text.trim is not a function");
      displayName = label?.trim().replace(/\s+(?:\d.*|적당량|약간|조금|취향껏)$/, "").trim() || "재료";
    }
    unavailableIngredients.set(row.ingredient_id, {
      name: displayName,
      hasQuant: previous?.hasQuant === true || row.ingredient_type === "QUANT",
    });
  }

  const aggregatedIngredients = aggregateShoppingIngredients(
    ingredientAggregationRows.map((ingredientRow) => ({
      ingredient_id: ingredientRow.ingredient_id,
      standard_name: ingredientNameMap.get(ingredientRow.ingredient_id)
        ?? unavailableIngredients.get(ingredientRow.ingredient_id)?.name
        ?? "재료",
      ingredient_type: ingredientRow.ingredient_type,
      amount: ingredientRow.amount,
      unit: ingredientRow.unit,
      display_text: ingredientRow.display_text,
      planned_servings: ingredientRow.planned_servings,
      shopping_servings: ingredientRow.shopping_servings,
    })),
  );

  const title = buildShoppingListTitle(dateRangeStart);
  const shoppingMealIds = shoppingMeals.map((meal) => meal.id).sort();
  const shoppingRecipePayloadRows = [...recipeAggregation.values()]
    .sort((left, right) =>
      left.recipe_id.localeCompare(right.recipe_id)
      || (left.recipe_content_snapshot_id ?? "")
        .localeCompare(right.recipe_content_snapshot_id ?? ""),
    )
    .map((totals) => ({
      recipe_id: totals.recipe_id,
      recipe_content_snapshot_id: totals.recipe_content_snapshot_id,
      shopping_servings: totals.shopping_servings,
      planned_servings_total: totals.planned_servings_total,
    }));
  const shoppingItemPayloadRows = aggregatedIngredients.map((ingredient, index) => ({
    ingredient_id: ingredient.ingredient_id,
    food_product_id: null,
    food_product_nutrition_version_id: null,
    display_text: unavailableIngredients.get(ingredient.ingredient_id)?.hasQuant === false
      ? ingredient.standard_name
      : ingredient.display_text,
    amounts_json: ingredient.amounts_json,
    is_pantry_excluded: pantryIngredientIds.has(ingredient.ingredient_id),
    sort_order: index,
  }));
  const productPayloadByPair = new Map<
    string,
    {
      ingredient_id: null;
      food_product_id: string;
      food_product_nutrition_version_id: string;
      display_text: string;
      amounts_json: Array<{ amount: number; unit: unknown }>;
      is_pantry_excluded: boolean;
      sort_order: number;
    }
  >();

  const purchaseAmountsByPair = new Map<string, ProductAmount[] | null>();
  productAggregationRows.forEach((product) => {
    const pair = `${product.food_product_id}:${product.food_product_nutrition_version_id}`;
    const existing = productPayloadByPair.get(pair);
    if (purchaseAmountsByPair.get(pair) !== null) {
      if (typeof product.amount !== "number" || typeof product.unit !== "string" || !product.unit) purchaseAmountsByPair.set(pair, null);
      else {
        const amounts = purchaseAmountsByPair.get(pair) ?? [];
        amounts.push({ amount: product.amount, unit: product.unit, scale: product.purchase_scale });
        purchaseAmountsByPair.set(pair, amounts);
      }
    }
    const scaledAmount =
      typeof product.amount === "number" && product.planned_servings > 0
        ? product.scalable ? scaleProductAmount(product.amount, product.shopping_servings, product.planned_servings) : product.amount
        : null;
    const nextAmount =
      scaledAmount !== null && product.unit
        ? [{ amount: scaledAmount, unit: product.unit }]
        : [];

    if (existing) {
      existing.amounts_json.push(...nextAmount);
      return;
    }

    productPayloadByPair.set(pair, {
      ingredient_id: null,
      food_product_id: product.food_product_id,
      food_product_nutrition_version_id:
        product.food_product_nutrition_version_id,
      display_text: product.display_text,
      amounts_json: nextAmount,
      is_pantry_excluded: pantryProductVersionPairs.has(pair),
      sort_order: shoppingItemPayloadRows.length + productPayloadByPair.size,
    });
  });

  const allShoppingItemPayloadRows = [
    ...shoppingItemPayloadRows,
    ...productPayloadByPair.values(),
  ];
  const allNeededIngredientsAreInPantry =
    allShoppingItemPayloadRows.length > 0
    && aggregatedIngredients.every((ingredient) =>
      pantryIngredientIds.has(ingredient.ingredient_id),
    )
    && [...productPayloadByPair.keys()].every((pair) =>
      pantryProductVersionPairs.has(pair),
    );
  const shouldCompleteWithoutList =
    body.complete_without_list !== false && allNeededIngredientsAreInPantry;
  const matchedPantryItemCount =
    pantryIngredientIds.size + pantryProductVersionPairs.size;
  const verifiedSession = await readVerifiedAccountGenerationSession(routeClient);
  if (!verifiedSession.ok || verifiedSession.sessionAuthority.ownerUuid !== user.id) {
    return fail("ACCOUNT_SESSION_STALE", "세션을 다시 확인해 주세요.", 409);
  }

  const serviceClient = createShoppingCreateInternalClient();
  if (!serviceClient) {
    return fail("INTERNAL_ERROR", "장보기 목록을 만들지 못했어요.", 500);
  }

  const createResult = await callFuturePropagationRpc(
    serviceClient as unknown as FuturePropagationRpcClient,
    "create_shopping_list_with_snapshot_authority",
    {
      ...buildSessionAuthorityRpcArgs(verifiedSession.sessionAuthority),
      p_user_id: user.id,
      p_title: title,
      p_date_range_start: dateRangeStart,
      p_date_range_end: dateRangeEnd,
      p_complete_without_list: shouldCompleteWithoutList,
      p_shopping_meal_ids: shoppingMealIds,
      p_split_remainders: splitMeals.map(({ meal, remainingServings }) => ({
        user_id: meal.user_id,
        recipe_id: meal.recipe_id,
        recipe_content_snapshot_id: meal.recipe_content_snapshot_id,
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
      p_item_rows: allShoppingItemPayloadRows,
      p_pantry_item_count: allShoppingItemPayloadRows.length,
    },
  );

  if (!createResult.ok) {
    return createResult.response;
  }
  const rpcData = createResult.data as ShoppingCreateRpcData | null;

  if (!rpcData) {
    return fail("INTERNAL_ERROR", "장보기 목록을 만들지 못했어요.", 500);
  }

  if (rpcData.error_code) {
    return fail(
      rpcData.error_code,
      rpcData.message ?? "장보기 목록을 만들지 못했어요.",
      statusFromShoppingCreateRpcError(rpcData.error_code),
    );
  }

  if (rpcData.completed_without_list) {
    const completedAt = rpcData.completed_at ?? new Date().toISOString();
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
            pantry_item_count: allShoppingItemPayloadRows.length,
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
      meals_updated: rpcData.meals_updated ?? shoppingMealIds.length,
      pantry_item_count:
        rpcData.pantry_item_count ?? allShoppingItemPayloadRows.length,
      created_at: rpcData.created_at ?? completedAt,
    } satisfies ShoppingListAllPantryCompletionSummary, { status: 200 });
  }

  if (!rpcData.id || !rpcData.created_at) {
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
      sourceId: rpcData.id,
      sourceMeta: {
        action_kind: "shopping_list",
        meal_ids: shoppingMealIds,
        pantry_item_count: matchedPantryItemCount,
      },
      occurredAt: rpcData.created_at,
    });
  } catch {
    // Activity history is secondary; shopping list creation remains authoritative.
  }

  const createdItems = (rpcData.items ?? []).map(toShoppingCreateItem);
  const quantityContexts = await readProductQuantityContexts(dbClient, user.id, createdItems).catch(() => new Map());
  for (const item of createdItems) if (item.food_product_id && item.food_product_nutrition_version_id) {
    const pair = productVersionKey(item.food_product_id, item.food_product_nutrition_version_id);
    item.purchase_suggestion = productPurchaseSuggestion(purchaseAmountsByPair.get(pair) ?? [], quantityContexts.get(pair));
  }
  const summary = {
    id: rpcData.id,
    title: rpcData.title ?? title,
    is_completed: rpcData.is_completed ?? false,
    items: createdItems,
    created_at: rpcData.created_at,
  } satisfies ShoppingListSummary;
  if (allNeededIngredientsAreInPantry) {
    return ok({
      ...summary,
      all_items_in_pantry: true,
      pantry_item_count: matchedPantryItemCount,
    } satisfies ShoppingListAllPantrySummary, { status: 201 });
  }
  return ok(summary, { status: 201 });
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

  const bootstrapClient: UserBootstrapDbClient = routeClient;
  const dbClient: ShoppingHistoryDbClient = routeClient;

  try {
    await ensurePublicUserRow(bootstrapClient, user);
    await ensureUserBootstrapState(bootstrapClient, user.id);
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
