import { fail, ok } from "@/lib/api/response";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { ShoppingListCompleteData } from "@/types/shopping";

interface RouteContext {
  params: Promise<{
    list_id: string;
  }>;
}

interface QueryError {
  message: string;
}

interface ShoppingListRow {
  id: string;
  user_id: string;
  is_completed: boolean;
  completed_at: string | null;
}

interface CompletedShoppingListRow {
  id: string;
  is_completed: boolean;
  completed_at: string | null;
}

interface MealUpdateRow {
  id: string;
}

interface ShoppingListItemRow {
  id: string;
  ingredient_id: string;
  is_checked: boolean;
  is_pantry_excluded: boolean;
  added_to_pantry: boolean;
}

interface PantryItemRow {
  ingredient_id: string;
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

interface ShoppingListsUpdateQuery {
  eq(column: string, value: string): ShoppingListsUpdateQuery;
  select(columns: string): ShoppingListsUpdateQuery;
  maybeSingle(): MaybeSingleResult<CompletedShoppingListRow>;
}

interface MealsUpdateQuery {
  eq(column: string, value: string): MealsUpdateQuery;
  select(columns: string): MealsUpdateQuery;
  then: ArrayResult<MealUpdateRow>["then"];
}

interface ShoppingListItemsSelectQuery {
  eq(column: string, value: string): ShoppingListItemsSelectQuery;
  then: ArrayResult<ShoppingListItemRow>["then"];
}

interface ShoppingListItemsUpdateQuery {
  in(column: string, values: string[]): ShoppingListItemsUpdateQuery;
  select(columns: string): ShoppingListItemsUpdateQuery;
  then: ArrayResult<{ id: string }>["then"];
}

interface PantryItemsSelectQuery {
  eq(column: string, value: string): PantryItemsSelectQuery;
  in(column: string, values: string[]): PantryItemsSelectQuery;
  then: ArrayResult<PantryItemRow>["then"];
}

interface PantryItemsInsertQuery {
  then: PromiseLike<{ data: null; error: QueryError | null }>["then"];
}

interface ShoppingListsTable {
  select(columns: string): ShoppingListsSelectQuery;
  update(values: { is_completed: true; completed_at: string }): ShoppingListsUpdateQuery;
}

interface MealsTable {
  update(values: { status: "shopping_done" }): MealsUpdateQuery;
}

interface ShoppingListItemsTable {
  select(columns: string): ShoppingListItemsSelectQuery;
  update(values: { added_to_pantry: true }): ShoppingListItemsUpdateQuery;
}

interface PantryItemsTable {
  select(columns: string): PantryItemsSelectQuery;
  insert(values: Array<{ user_id: string; ingredient_id: string }>): PantryItemsInsertQuery;
}

interface ShoppingCompleteDbClient {
  from(table: "shopping_lists"): ShoppingListsTable;
  from(table: "meals"): MealsTable;
  from(table: "shopping_list_items"): ShoppingListItemsTable;
  from(table: "pantry_items"): PantryItemsTable;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

async function parseCompleteBody(request: Request) {
  const rawBody = await request.text();

  if (!rawBody.trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(rawBody) as { add_to_pantry_item_ids?: unknown };
    const value = parsed.add_to_pantry_item_ids;

    if (value === null || value === undefined) {
      return undefined;
    }

    if (!Array.isArray(value)) {
      return null;
    }

    return value.filter((itemId): itemId is string => typeof itemId === "string" && isUuid(itemId));
  } catch {
    return null;
  }
}

async function requireUser(routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>>) {
  const authResult = await routeClient.auth.getUser();
  return authResult.data.user;
}

export async function POST(request: Request, context: RouteContext) {
  const { list_id: listId } = await context.params;

  if (!isUuid(listId)) {
    return fail("RESOURCE_NOT_FOUND", "장보기 리스트를 찾을 수 없어요.", 404);
  }

  const routeClient = await createRouteHandlerClient();
  const user = await requireUser(routeClient);

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const requestedPantryItemIds = await parseCompleteBody(request);

  if (requestedPantryItemIds === null) {
    return fail("VALIDATION_ERROR", "팬트리 반영 항목 형식이 올바르지 않아요.", 422, [
      { field: "add_to_pantry_item_ids", reason: "invalid_type" },
    ]);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    ShoppingCompleteDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "장보기를 완료하지 못했어요."),
      500,
    );
  }

  const listResult = await dbClient
    .from("shopping_lists")
    .select("id, user_id, is_completed, completed_at")
    .eq("id", listId)
    .maybeSingle();

  if (listResult.error || !listResult.data) {
    return fail("RESOURCE_NOT_FOUND", "장보기 리스트를 찾을 수 없어요.", 404);
  }

  if (listResult.data.user_id !== user.id) {
    return fail("FORBIDDEN", "내 장보기 리스트만 완료할 수 있어요.", 403);
  }

  if (!listResult.data.is_completed) {
    const completedAt = new Date().toISOString();
    const listUpdateResult = await dbClient
      .from("shopping_lists")
      .update({
        is_completed: true,
        completed_at: completedAt,
      })
      .eq("id", listId)
      .eq("user_id", user.id)
      .select("id, is_completed, completed_at")
      .maybeSingle();

    if (listUpdateResult.error || !listUpdateResult.data) {
      return fail("INTERNAL_ERROR", "장보기를 완료하지 못했어요.", 500);
    }
  }

  const mealsUpdateResult = await dbClient
    .from("meals")
    .update({ status: "shopping_done" })
    .eq("shopping_list_id", listId)
    .eq("user_id", user.id)
    .eq("status", "registered")
    .select("id");

  if (mealsUpdateResult.error || !mealsUpdateResult.data) {
    return fail("INTERNAL_ERROR", "식사 상태를 장보기 완료로 바꾸지 못했어요.", 500);
  }

  let pantryAddedItemIds: string[] = [];

  if (listResult.data.is_completed) {
    const reflectedItemsResult = await dbClient
      .from("shopping_list_items")
      .select("id, ingredient_id, is_checked, is_pantry_excluded, added_to_pantry")
      .eq("shopping_list_id", listId);

    if (reflectedItemsResult.error || !reflectedItemsResult.data) {
      return fail("INTERNAL_ERROR", "팬트리 반영 항목을 확인하지 못했어요.", 500);
    }

    pantryAddedItemIds = reflectedItemsResult.data
      .filter((item) => item.added_to_pantry)
      .map((item) => item.id);

    return ok({
      completed: true,
      meals_updated: mealsUpdateResult.data.length,
      pantry_added: pantryAddedItemIds.length,
      pantry_added_item_ids: pantryAddedItemIds,
    } satisfies ShoppingListCompleteData);
  }

  if (requestedPantryItemIds === undefined || requestedPantryItemIds.length > 0) {
    const itemsResult = await dbClient
      .from("shopping_list_items")
      .select("id, ingredient_id, is_checked, is_pantry_excluded, added_to_pantry")
      .eq("shopping_list_id", listId);

    if (itemsResult.error || !itemsResult.data) {
      return fail("INTERNAL_ERROR", "팬트리 반영 항목을 확인하지 못했어요.", 500);
    }

    const requestedSet =
      requestedPantryItemIds === undefined ? null : new Set(requestedPantryItemIds);
    const validItems = itemsResult.data.filter((item) => {
      if (requestedSet && !requestedSet.has(item.id)) {
        return false;
      }

      return item.is_checked && !item.is_pantry_excluded;
    });

    pantryAddedItemIds = validItems.map((item) => item.id);

    const ingredientIds = [...new Set(validItems.map((item) => item.ingredient_id))];

    if (ingredientIds.length > 0) {
      const existingPantryResult = await dbClient
        .from("pantry_items")
        .select("ingredient_id")
        .eq("user_id", user.id)
        .in("ingredient_id", ingredientIds);

      if (existingPantryResult.error || !existingPantryResult.data) {
        return fail("INTERNAL_ERROR", "팬트리 보유 재료를 확인하지 못했어요.", 500);
      }

      const existingIngredientIds = new Set(
        existingPantryResult.data.map((item) => item.ingredient_id),
      );
      const pantryRowsToInsert = ingredientIds
        .filter((ingredientId) => !existingIngredientIds.has(ingredientId))
        .map((ingredientId) => ({
          user_id: user.id,
          ingredient_id: ingredientId,
        }));

      if (pantryRowsToInsert.length > 0) {
        const pantryInsertResult = await dbClient.from("pantry_items").insert(pantryRowsToInsert);

        if (pantryInsertResult.error) {
          return fail("INTERNAL_ERROR", "팬트리에 재료를 추가하지 못했어요.", 500);
        }
      }
    }

    const itemIdsToMark = validItems.filter((item) => !item.added_to_pantry).map((item) => item.id);

    if (itemIdsToMark.length > 0) {
      const itemsUpdateResult = await dbClient
        .from("shopping_list_items")
        .update({ added_to_pantry: true })
        .in("id", itemIdsToMark)
        .select("id");

      if (itemsUpdateResult.error || !itemsUpdateResult.data) {
        return fail("INTERNAL_ERROR", "팬트리 반영 상태를 저장하지 못했어요.", 500);
      }
    }
  }

  return ok({
    completed: true,
    meals_updated: mealsUpdateResult.data.length,
    pantry_added: pantryAddedItemIds.length,
    pantry_added_item_ids: pantryAddedItemIds,
  } satisfies ShoppingListCompleteData);
}
