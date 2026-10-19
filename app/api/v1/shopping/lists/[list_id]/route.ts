import { fail, ok } from "@/lib/api/response";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeFoodSafetyImageUrl } from "@/lib/recipe-image";
import { productPurchaseSuggestion, productVersionKey, readProductQuantityContexts, shoppingProductPurchaseAmounts } from "@/lib/server/recipe-product-quantity";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import type { ShoppingListDetail, ShoppingListItemSummary } from "@/types/shopping";

interface RouteContext {
  params: Promise<{
    list_id: string;
  }>;
}

interface QueryError {
  code?: string;
  message: string;
}

type ShoppingListRow = {
  id: string;
  user_id: string;
  title: string;
  date_range_start: string;
  date_range_end: string;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
};

interface RecipeRow {
  id: string;
  title: string;
  thumbnail_url: string | null;
}

interface MealRecipeContentRow {
  recipe_id: string;
  recipe_content_snapshot_id: string | null;
  recipe_content_snapshots:
    | {
      title: string | null;
    }
    | Array<{
      title: string | null;
    }>
    | null;
}

type ShoppingListItemRow = {
  id: string;
  ingredient_id: string | null;
  food_product_id: string | null;
  food_product_nutrition_version_id: string | null;
  display_text: string;
  amounts_json: unknown;
  is_checked: boolean;
  is_pantry_excluded: boolean;
  added_to_pantry: boolean;
  sort_order: number;
};

type ArrayResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

// Selected read fields and nullable snapshot FKs only. Quantity RPC uses the
// original request client separately, without mixing RPCs into table projections.
export type ShoppingListDetailDbClient = Pick<SupabaseClient<{
  public: {
    Tables: {
      shopping_lists: {
        Row: ShoppingListRow; Insert: never; Update: never; Relationships: [];
      };
      shopping_list_recipes: {
        Row: { shopping_list_id: string; recipe_id: string; recipe_content_snapshot_id: string | null;
          shopping_servings: number; planned_servings_total: number };
        Insert: never; Update: never;
        Relationships: [{ foreignKeyName: "shopping_list_recipes_recipe_content_snapshot_id_fkey";
          columns: ["recipe_content_snapshot_id"]; isOneToOne: false;
          referencedRelation: "recipe_content_snapshots"; referencedColumns: ["id"]; }];
      };
      meals: {
        Row: { shopping_list_id: string | null; recipe_id: string; recipe_content_snapshot_id: string | null };
        Insert: never; Update: never;
        Relationships: [{ foreignKeyName: "meals_recipe_content_snapshot_id_fkey";
          columns: ["recipe_content_snapshot_id"]; isOneToOne: false;
          referencedRelation: "recipe_content_snapshots"; referencedColumns: ["id"]; }];
      };
      recipe_content_snapshots: {
        Row: { id: string; title: string; base_servings: number; ingredients_json: unknown };
        Insert: never; Update: never; Relationships: [];
      };
      recipes: {
        Row: { id: string; title: string; thumbnail_url: string | null };
        Insert: never; Update: never; Relationships: [];
      };
      ingredients: {
        Row: { id: string; category: string };
        Insert: never; Update: never; Relationships: [];
      };
      shopping_list_items: {
        Row: ShoppingListItemRow & { shopping_list_id: string };
        Insert: never; Update: never; Relationships: [];
      };
    };
    Views: Record<never, never>; Functions: Record<never, never>;
  };
}>, "from">;

function getMealPinnedTitle(meal: MealRecipeContentRow) {
  const contentSnapshot = Array.isArray(meal.recipe_content_snapshots)
    ? meal.recipe_content_snapshots[0] ?? null
    : meal.recipe_content_snapshots;

  return contentSnapshot?.title?.trim() || null;
}

function hasContentPin(meal: MealRecipeContentRow) {
  return typeof meal.recipe_content_snapshot_id === "string" && meal.recipe_content_snapshot_id.length > 0;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function normalizeAmountsJson(value: unknown): ShoppingListItemSummary["amounts_json"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const amount = (entry as { amount?: unknown }).amount;
      const unit = (entry as { unit?: unknown }).unit;

      if (typeof amount !== "number" || !Number.isFinite(amount) || typeof unit !== "string") {
        return null;
      }

      return { amount, unit };
    })
    .filter((entry): entry is { amount: number; unit: string } => entry !== null);
}

function buildItem(
  item: ShoppingListItemRow,
  categoryByIngredientId: Map<string, string | null> = new Map(),
): ShoppingListItemSummary {
  return {
    id: item.id,
    ingredient_id: item.ingredient_id,
    source_type:
      item.ingredient_id !== null
        ? "ingredient"
        : item.food_product_id !== null &&
            item.food_product_nutrition_version_id !== null
          ? "food_product"
          : null,
    food_product_id: item.food_product_id ?? null,
    food_product_nutrition_version_id:
      item.food_product_nutrition_version_id ?? null,
    category:
      item.ingredient_id === null
        ? null
        : categoryByIngredientId.get(item.ingredient_id) ?? null,
    display_text: item.display_text,
    amounts_json: normalizeAmountsJson(item.amounts_json),
    is_checked: item.is_checked,
    is_pantry_excluded: item.is_pantry_excluded,
    added_to_pantry: item.added_to_pantry,
    sort_order: item.sort_order,
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const { list_id: listId } = await context.params;

  if (!isUuid(listId)) {
    return fail("RESOURCE_NOT_FOUND", "장보기 리스트를 찾을 수 없어요.", 404);
  }

  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const bootstrapClient: UserBootstrapDbClient = routeClient;
  const dbClient: ShoppingListDetailDbClient = routeClient;

  try {
    await ensurePublicUserRow(bootstrapClient, user);
    await ensureUserBootstrapState(bootstrapClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "장보기 상세를 불러오지 못했어요."),
      500,
    );
  }

  const listResult = await dbClient
    .from("shopping_lists")
    .select("id, user_id, title, date_range_start, date_range_end, is_completed, completed_at, created_at")
    .eq("id", listId)
    .maybeSingle();

  if (listResult.error || !listResult.data) {
    return fail("RESOURCE_NOT_FOUND", "장보기 리스트를 찾을 수 없어요.", 404);
  }

  if (listResult.data.user_id !== user.id) {
    return fail("FORBIDDEN", "내 장보기 리스트만 조회할 수 있어요.", 403);
  }

  const recipesResult = await dbClient
    .from("shopping_list_recipes")
    .select("recipe_id, recipe_content_snapshot_id, shopping_servings, planned_servings_total, recipe_content_snapshots(base_servings, ingredients_json)")
    .eq("shopping_list_id", listId);

  if (recipesResult.error || !recipesResult.data) {
    return fail("INTERNAL_ERROR", "장보기 상세를 불러오지 못했어요.", 500);
  }

  const recipeIds = [...new Set(recipesResult.data.map((recipe) => recipe.recipe_id))];
  const recipeNameMap = new Map<string, RecipeRow>();
  const pinnedRecipeTitleMap = new Map<string, string>();

  let mealContentResult: Awaited<ArrayResult<MealRecipeContentRow>>;
  try {
    mealContentResult = await dbClient
      .from("meals")
      .select("recipe_id, recipe_content_snapshot_id, recipe_content_snapshots(title)")
      .eq("shopping_list_id", listId);
  } catch {
    return fail("INTERNAL_ERROR", "장보기 상세를 불러오지 못했어요.", 500);
  }

  if (mealContentResult.error || !mealContentResult.data) {
    return fail("INTERNAL_ERROR", "장보기 상세를 불러오지 못했어요.", 500);
  }

  if (mealContentResult.data.some((meal) => hasContentPin(meal) && getMealPinnedTitle(meal) === null)) {
    return fail("INTERNAL_ERROR", "장보기 상세를 불러오지 못했어요.", 500);
  }

  mealContentResult.data.forEach((meal) => {
    const pinnedTitle = getMealPinnedTitle(meal);
    if (pinnedTitle) {
      pinnedRecipeTitleMap.set(meal.recipe_id, pinnedTitle);
    }
  });

  if (recipeIds.length > 0) {
    const recipeRowsResult = await dbClient
      .from("recipes")
      .select("id, title, thumbnail_url")
      .in("id", recipeIds);

    if (recipeRowsResult.error || !recipeRowsResult.data) {
      return fail("INTERNAL_ERROR", "장보기 상세를 불러오지 못했어요.", 500);
    }

    recipeRowsResult.data.forEach((recipeRow) => {
      recipeNameMap.set(recipeRow.id, recipeRow);
    });
  }

  const itemsResult = await dbClient
    .from("shopping_list_items")
    .select("id, ingredient_id, food_product_id, food_product_nutrition_version_id, display_text, amounts_json, is_checked, is_pantry_excluded, added_to_pantry, sort_order")
    .eq("shopping_list_id", listId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (itemsResult.error || !itemsResult.data) {
    return fail("INTERNAL_ERROR", "장보기 상세를 불러오지 못했어요.", 500);
  }

  const ingredientIds = [
    ...new Set(
      itemsResult.data
        .map((item) => item.ingredient_id)
        .filter((ingredientId): ingredientId is string => ingredientId !== null),
    ),
  ];
  const categoryByIngredientId = new Map<string, string | null>();

  if (ingredientIds.length > 0) {
    const ingredientsResult = await dbClient
      .from("ingredients")
      .select("id, category")
      .in("id", ingredientIds);

    ingredientsResult.data?.forEach((ingredient) => {
      categoryByIngredientId.set(ingredient.id, ingredient.category);
    });
  }

  const items = itemsResult.data.map((item) => buildItem(item, categoryByIngredientId));
  const quantityContexts = await readProductQuantityContexts(routeClient, user.id, items).catch(() => new Map());
  const purchaseAmounts = shoppingProductPurchaseAmounts(recipesResult.data, mealContentResult.data);
  for (const item of items) if (item.food_product_id && item.food_product_nutrition_version_id) {
    const pair = productVersionKey(item.food_product_id, item.food_product_nutrition_version_id);
    item.purchase_suggestion = productPurchaseSuggestion(purchaseAmounts.get(pair) ?? [], quantityContexts.get(pair));
  }
  return ok({
    id: listResult.data.id,
    title: listResult.data.title,
    date_range_start: listResult.data.date_range_start,
    date_range_end: listResult.data.date_range_end,
    is_completed: listResult.data.is_completed,
    completed_at: listResult.data.completed_at,
    created_at: listResult.data.created_at,
    updated_at: listResult.data.created_at,
    recipes: recipesResult.data
      .map((recipe) => ({
        recipe_id: recipe.recipe_id,
        recipe_name:
          pinnedRecipeTitleMap.get(recipe.recipe_id) ??
          recipeNameMap.get(recipe.recipe_id)?.title ??
          "",
        recipe_thumbnail: normalizeFoodSafetyImageUrl(
          recipeNameMap.get(recipe.recipe_id)?.thumbnail_url,
        ),
        shopping_servings: recipe.shopping_servings,
        planned_servings_total: recipe.planned_servings_total,
      }))
      .sort((left, right) => left.recipe_id.localeCompare(right.recipe_id)),
    items,
  } satisfies ShoppingListDetail);
}
