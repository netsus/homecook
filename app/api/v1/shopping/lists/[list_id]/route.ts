import { fail, ok } from "@/lib/api/response";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
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

interface QueryOrderOption {
  ascending: boolean;
}

interface ShoppingListRow {
  id: string;
  user_id: string;
  title: string;
  date_range_start: string;
  date_range_end: string;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ShoppingListRecipeRow {
  recipe_id: string;
  shopping_servings: number;
  planned_servings_total: number;
}

interface RecipeRow {
  id: string;
  title: string;
  thumbnail_url: string | null;
}

interface ShoppingListItemRow {
  id: string;
  ingredient_id: string;
  display_text: string;
  amounts_json: unknown;
  is_checked: boolean;
  is_pantry_excluded: boolean;
  added_to_pantry: boolean;
  sort_order: number;
}

type MaybeSingleResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

type ArrayResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

interface ShoppingListsSelectQuery {
  eq(column: string, value: string): ShoppingListsSelectQuery;
  maybeSingle(): MaybeSingleResult<ShoppingListRow>;
}

interface ShoppingListRecipesSelectQuery {
  eq(column: string, value: string): ShoppingListRecipesSelectQuery;
  then: ArrayResult<ShoppingListRecipeRow>["then"];
}

interface RecipesSelectQuery {
  in(column: string, values: string[]): RecipesSelectQuery;
  then: ArrayResult<RecipeRow>["then"];
}

interface ShoppingListItemsSelectQuery {
  eq(column: string, value: string): ShoppingListItemsSelectQuery;
  order(column: string, options: QueryOrderOption): ShoppingListItemsSelectQuery;
  then: ArrayResult<ShoppingListItemRow>["then"];
}

interface ShoppingListsTable {
  select(columns: string): ShoppingListsSelectQuery;
}

interface ShoppingListRecipesTable {
  select(columns: string): ShoppingListRecipesSelectQuery;
}

interface RecipesTable {
  select(columns: string): RecipesSelectQuery;
}

interface ShoppingListItemsTable {
  select(columns: string): ShoppingListItemsSelectQuery;
}

interface ShoppingListDetailDbClient {
  from(table: "shopping_lists"): ShoppingListsTable;
  from(table: "shopping_list_recipes"): ShoppingListRecipesTable;
  from(table: "recipes"): RecipesTable;
  from(table: "shopping_list_items"): ShoppingListItemsTable;
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

function buildItem(item: ShoppingListItemRow): ShoppingListItemSummary {
  return {
    id: item.id,
    ingredient_id: item.ingredient_id,
    display_text: item.display_text,
    amounts_json: normalizeAmountsJson(item.amounts_json),
    is_checked: item.is_checked,
    is_pantry_excluded: item.is_pantry_excluded,
    added_to_pantry: item.added_to_pantry,
    sort_order: item.sort_order,
  };
}

async function requireUser(routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>>) {
  const authResult = await routeClient.auth.getUser();
  return authResult.data.user;
}

export async function GET(_request: Request, context: RouteContext) {
  const { list_id: listId } = await context.params;

  if (!isUuid(listId)) {
    return fail("RESOURCE_NOT_FOUND", "장보기 리스트를 찾을 수 없어요.", 404);
  }

  const routeClient = await createRouteHandlerClient();
  const user = await requireUser(routeClient);

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    ShoppingListDetailDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "장보기 상세를 불러오지 못했어요."),
      500,
    );
  }

  const listResult = await dbClient
    .from("shopping_lists")
    .select("id, user_id, title, date_range_start, date_range_end, is_completed, completed_at, created_at, updated_at")
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
    .select("recipe_id, shopping_servings, planned_servings_total")
    .eq("shopping_list_id", listId);

  if (recipesResult.error || !recipesResult.data) {
    return fail("INTERNAL_ERROR", "장보기 상세를 불러오지 못했어요.", 500);
  }

  const recipeIds = [...new Set(recipesResult.data.map((recipe) => recipe.recipe_id))];
  const recipeNameMap = new Map<string, RecipeRow>();

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
    .select("id, ingredient_id, display_text, amounts_json, is_checked, is_pantry_excluded, added_to_pantry, sort_order")
    .eq("shopping_list_id", listId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (itemsResult.error || !itemsResult.data) {
    return fail("INTERNAL_ERROR", "장보기 상세를 불러오지 못했어요.", 500);
  }

  return ok({
    id: listResult.data.id,
    title: listResult.data.title,
    date_range_start: listResult.data.date_range_start,
    date_range_end: listResult.data.date_range_end,
    is_completed: listResult.data.is_completed,
    completed_at: listResult.data.completed_at,
    created_at: listResult.data.created_at,
    updated_at: listResult.data.updated_at,
    recipes: recipesResult.data
      .map((recipe) => ({
        recipe_id: recipe.recipe_id,
        recipe_name: recipeNameMap.get(recipe.recipe_id)?.title ?? "",
        recipe_thumbnail: recipeNameMap.get(recipe.recipe_id)?.thumbnail_url ?? null,
        shopping_servings: recipe.shopping_servings,
        planned_servings_total: recipe.planned_servings_total,
      }))
      .sort((left, right) => left.recipe_id.localeCompare(right.recipe_id)),
    items: itemsResult.data.map(buildItem),
  } satisfies ShoppingListDetail);
}
