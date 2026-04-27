import { fail, ok } from "@/lib/api/response";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { ShoppingListReorderBody, ShoppingListReorderData } from "@/types/shopping";

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
}

type MaybeSingleResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

type ArrayResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

type UpdateResult = PromiseLike<{
  data: null;
  error: QueryError | null;
}>;

interface ShoppingListsSelectQuery {
  eq(column: string, value: string): ShoppingListsSelectQuery;
  maybeSingle(): MaybeSingleResult<ShoppingListRow>;
}

interface ShoppingListItemsSelectQuery {
  eq(column: string, value: string): ShoppingListItemsSelectQuery;
  in(column: string, values: string[]): ShoppingListItemsSelectQuery;
  then: ArrayResult<ShoppingListItemRow>["then"];
}

interface ShoppingListItemsUpdateQuery {
  eq(column: string, value: string): ShoppingListItemsUpdateQuery;
  then: UpdateResult["then"];
}

interface ShoppingListsTable {
  select(columns: string): ShoppingListsSelectQuery;
}

interface ShoppingListItemsTable {
  select(columns: string): ShoppingListItemsSelectQuery;
  update(values: { sort_order: number }): ShoppingListItemsUpdateQuery;
}

interface ShoppingReorderDbClient {
  from(table: "shopping_lists"): ShoppingListsTable;
  from(table: "shopping_list_items"): ShoppingListItemsTable;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isConflictError(error: QueryError | null) {
  if (!error) {
    return false;
  }

  return error.code === "409" || /conflict/i.test(error.message);
}

function parseBody(body: ShoppingListReorderBody | null):
  | {
    ok: true;
    value: Map<string, number>;
  }
  | {
    ok: false;
    fields: Array<{ field: string; reason: string }>;
  } {
  if (!isRecord(body)) {
    return {
      ok: false,
      fields: [{ field: "body", reason: "invalid_object" }],
    };
  }

  const allowedKeys = new Set(["orders"]);
  const unknownKeys = Object.keys(body).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      fields: unknownKeys.map((key) => ({ field: key, reason: "unknown_field" })),
    };
  }

  if (!Array.isArray(body.orders)) {
    return {
      ok: false,
      fields: [{ field: "orders", reason: "invalid_array" }],
    };
  }

  if (body.orders.length === 0) {
    return {
      ok: false,
      fields: [{ field: "orders", reason: "empty_array" }],
    };
  }

  const fields: Array<{ field: string; reason: string }> = [];
  const parsed = new Map<string, number>();

  body.orders.forEach((order, index) => {
    if (!isRecord(order)) {
      fields.push({ field: `orders.${index}`, reason: "invalid_object" });
      return;
    }

    const itemId = order.item_id;
    const sortOrder = order.sort_order;

    if (typeof itemId !== "string" || !isUuid(itemId)) {
      fields.push({ field: `orders.${index}.item_id`, reason: "invalid_uuid" });
    }

    if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder) || sortOrder < 0) {
      fields.push({ field: `orders.${index}.sort_order`, reason: "invalid_integer" });
    }

    if (typeof itemId === "string" && isUuid(itemId) && typeof sortOrder === "number") {
      parsed.set(itemId, sortOrder);
    }
  });

  if (fields.length > 0) {
    return {
      ok: false,
      fields,
    };
  }

  return {
    ok: true,
    value: parsed,
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

  let body: ShoppingListReorderBody;

  try {
    body = (await request.json()) as ShoppingListReorderBody;
  } catch {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해주세요.", 422, [{ field: "body", reason: "invalid_json" }]);
  }

  const parsedBody = parseBody(body);
  if (!parsedBody.ok) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해주세요.", 422, parsedBody.fields);
  }

  const routeClient = await createRouteHandlerClient();
  const user = await requireUser(routeClient);

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    ShoppingReorderDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "장보기 순서를 저장하지 못했어요."),
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

  const itemIds = [...parsedBody.value.keys()];
  const itemsResult = await dbClient
    .from("shopping_list_items")
    .select("id")
    .eq("shopping_list_id", listId)
    .in("id", itemIds);

  if (itemsResult.error || !itemsResult.data) {
    return fail("INTERNAL_ERROR", "장보기 순서를 저장하지 못했어요.", 500);
  }

  const ownedItemIds = new Set(itemsResult.data.map((item) => item.id));
  let updated = 0;

  for (const [itemId, sortOrder] of parsedBody.value) {
    if (!ownedItemIds.has(itemId)) {
      continue;
    }

    const updateResult = await dbClient
      .from("shopping_list_items")
      .update({ sort_order: sortOrder })
      .eq("id", itemId)
      .eq("shopping_list_id", listId);

    if (isConflictError(updateResult.error)) {
      return fail("CONFLICT", "완료된 장보기 기록은 수정할 수 없어요.", 409);
    }

    if (updateResult.error) {
      return fail("INTERNAL_ERROR", "장보기 순서를 저장하지 못했어요.", 500);
    }

    updated += 1;
  }

  return ok({
    updated,
  } satisfies ShoppingListReorderData);
}
