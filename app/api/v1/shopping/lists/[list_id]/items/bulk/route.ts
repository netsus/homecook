import { fail, ok } from "@/lib/api/response";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type {
  ShoppingListItemSummary,
  ShoppingListItemsBulkUpdateBody,
  ShoppingListItemsBulkUpdateData,
} from "@/types/shopping";

interface RouteContext {
  params: Promise<{
    list_id: string;
  }>;
}

interface QueryError {
  code?: string;
  message: string;
}

interface ShoppingListRow {
  id: string;
  user_id: string;
  is_completed: boolean;
}

interface ShoppingListItemRow {
  id: string;
  shopping_list_id: string;
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

interface ShoppingListItemsUpdateQuery {
  eq(column: string, value: string | boolean): ShoppingListItemsUpdateQuery;
  in(column: string, values: string[]): ShoppingListItemsUpdateQuery;
  select(columns: string): ShoppingListItemsUpdateQuery;
  then: ArrayResult<ShoppingListItemRow>["then"];
}

interface ShoppingListsTable {
  select(columns: string): ShoppingListsSelectQuery;
}

interface ShoppingListItemsTable {
  update(values: { is_checked: boolean }): ShoppingListItemsUpdateQuery;
}

interface ShoppingBulkItemUpdateDbClient {
  from(table: "shopping_lists"): ShoppingListsTable;
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

function parseBody(body: ShoppingListItemsBulkUpdateBody | null):
  | {
    ok: true;
    value: ShoppingListItemsBulkUpdateBody;
  }
  | {
    ok: false;
    fields: Array<{ field: string; reason: string }>;
  } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      fields: [{ field: "body", reason: "invalid_object" }],
    };
  }

  const allowedKeys = new Set(["item_ids", "is_checked"]);
  const unknownKeys = Object.keys(body).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      fields: unknownKeys.map((key) => ({ field: key, reason: "unknown_field" })),
    };
  }

  const fields: Array<{ field: string; reason: string }> = [];
  const itemIds = Array.isArray(body.item_ids) ? body.item_ids : [];

  if (!Array.isArray(body.item_ids)) {
    fields.push({ field: "item_ids", reason: "invalid_array" });
  } else if (body.item_ids.length === 0) {
    fields.push({ field: "item_ids", reason: "empty_array" });
  }

  itemIds.forEach((itemId, index) => {
    if (typeof itemId !== "string" || !isUuid(itemId)) {
      fields.push({ field: `item_ids[${index}]`, reason: "invalid_uuid" });
    }
  });

  if (typeof body.is_checked !== "boolean") {
    fields.push({ field: "is_checked", reason: "invalid_boolean" });
  }

  if (fields.length > 0) {
    return {
      ok: false,
      fields,
    };
  }

  return {
    ok: true,
    value: {
      item_ids: [...new Set(itemIds)],
      is_checked: body.is_checked,
    },
  };
}

async function requireUser(routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>>) {
  const authResult = await routeClient.auth.getUser();
  return authResult.data.user;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { list_id: listId } = await context.params;

  if (!isUuid(listId)) {
    return fail("RESOURCE_NOT_FOUND", "장보기 리스트를 찾을 수 없어요.", 404);
  }

  let body: ShoppingListItemsBulkUpdateBody;

  try {
    body = (await request.json()) as ShoppingListItemsBulkUpdateBody;
  } catch {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해 주세요.", 422, [{ field: "body", reason: "invalid_json" }]);
  }

  const parsedBody = parseBody(body);
  if (!parsedBody.ok) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해 주세요.", 422, parsedBody.fields);
  }

  const routeClient = await createRouteHandlerClient();
  const user = await requireUser(routeClient);

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    ShoppingBulkItemUpdateDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "장보기 항목을 수정하지 못했어요."),
      500,
    );
  }

  const listResult = await dbClient
    .from("shopping_lists")
    .select("id, user_id, is_completed")
    .eq("id", listId)
    .maybeSingle();

  if (listResult.error || !listResult.data) {
    return fail("RESOURCE_NOT_FOUND", "장보기 리스트를 찾을 수 없어요.", 404);
  }

  if (listResult.data.user_id !== user.id) {
    return fail("FORBIDDEN", "내 장보기 리스트만 수정할 수 있어요.", 403);
  }

  if (listResult.data.is_completed) {
    return fail("CONFLICT", "완료된 장보기 기록은 수정할 수 없어요.", 409);
  }

  const updateResult = await dbClient
    .from("shopping_list_items")
    .update({ is_checked: parsedBody.value.is_checked })
    .eq("shopping_list_id", listId)
    .eq("is_pantry_excluded", false)
    .in("id", parsedBody.value.item_ids)
    .select("id, shopping_list_id, ingredient_id, display_text, amounts_json, is_checked, is_pantry_excluded, added_to_pantry, sort_order");

  if (updateResult.error || !updateResult.data) {
    return fail("INTERNAL_ERROR", "장보기 항목을 수정하지 못했어요.", 500);
  }

  const items = updateResult.data
    .map(buildItem)
    .sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id));

  return ok({ items } satisfies ShoppingListItemsBulkUpdateData);
}
