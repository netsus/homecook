import { fail, ok } from "@/lib/api/response";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { ShoppingListItemSummary, ShoppingListItemUpdateBody } from "@/types/shopping";

interface RouteContext {
  params: Promise<{
    list_id: string;
    item_id: string;
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

interface ShoppingListsSelectQuery {
  eq(column: string, value: string): ShoppingListsSelectQuery;
  maybeSingle(): MaybeSingleResult<ShoppingListRow>;
}

interface ShoppingListItemsSelectQuery {
  eq(column: string, value: string): ShoppingListItemsSelectQuery;
  maybeSingle(): MaybeSingleResult<ShoppingListItemRow>;
}

interface ShoppingListItemsUpdateQuery {
  eq(column: string, value: string): ShoppingListItemsUpdateQuery;
  select(columns: string): ShoppingListItemsUpdateQuery;
  maybeSingle(): MaybeSingleResult<ShoppingListItemRow>;
}

interface ShoppingListsTable {
  select(columns: string): ShoppingListsSelectQuery;
}

interface ShoppingListItemsTable {
  select(columns: string): ShoppingListItemsSelectQuery;
  update(values: { is_checked?: boolean; is_pantry_excluded?: boolean }): ShoppingListItemsUpdateQuery;
}

interface ShoppingItemUpdateDbClient {
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

function isConflictError(error: QueryError | null) {
  if (!error) {
    return false;
  }

  return error.code === "409" || /conflict/i.test(error.message);
}

function parseBody(body: ShoppingListItemUpdateBody | null):
  | {
    ok: true;
    value: { is_checked?: boolean; is_pantry_excluded?: boolean };
  }
  | {
    ok: false;
    fields: Array<{ field: string; reason: string }>;
  } {
  if (!body || typeof body !== "object") {
    return {
      ok: false,
      fields: [{ field: "body", reason: "invalid_object" }],
    };
  }

  const allowedKeys = new Set(["is_checked", "is_pantry_excluded"]);
  const unknownKeys = Object.keys(body).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      fields: unknownKeys.map((key) => ({ field: key, reason: "unknown_field" })),
    };
  }

  const fields: Array<{ field: string; reason: string }> = [];
  const parsed: { is_checked?: boolean; is_pantry_excluded?: boolean } = {};

  if ("is_checked" in body) {
    if (typeof body.is_checked !== "boolean") {
      fields.push({ field: "is_checked", reason: "invalid_boolean" });
    } else {
      parsed.is_checked = body.is_checked;
    }
  }

  if ("is_pantry_excluded" in body) {
    if (typeof body.is_pantry_excluded !== "boolean") {
      fields.push({ field: "is_pantry_excluded", reason: "invalid_boolean" });
    } else {
      parsed.is_pantry_excluded = body.is_pantry_excluded;
    }
  }

  if (fields.length > 0) {
    return {
      ok: false,
      fields,
    };
  }

  if (parsed.is_checked === undefined && parsed.is_pantry_excluded === undefined) {
    return {
      ok: false,
      fields: [{ field: "body", reason: "empty_payload" }],
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
  const { list_id: listId, item_id: itemId } = await context.params;

  if (!isUuid(listId) || !isUuid(itemId)) {
    return fail("RESOURCE_NOT_FOUND", "장보기 항목을 찾을 수 없어요.", 404);
  }

  let body: ShoppingListItemUpdateBody;

  try {
    body = (await request.json()) as ShoppingListItemUpdateBody;
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
    ShoppingItemUpdateDbClient & UserBootstrapDbClient;

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

  const itemResult = await dbClient
    .from("shopping_list_items")
    .select("id, shopping_list_id, ingredient_id, display_text, amounts_json, is_checked, is_pantry_excluded, added_to_pantry, sort_order")
    .eq("id", itemId)
    .eq("shopping_list_id", listId)
    .maybeSingle();

  if (itemResult.error || !itemResult.data) {
    return fail("RESOURCE_NOT_FOUND", "장보기 항목을 찾을 수 없어요.", 404);
  }

  const nextExcluded = parsedBody.value.is_pantry_excluded ?? itemResult.data.is_pantry_excluded;
  let nextChecked = parsedBody.value.is_checked ?? itemResult.data.is_checked;

  if (nextExcluded) {
    nextChecked = false;
  }

  if (nextChecked === itemResult.data.is_checked && nextExcluded === itemResult.data.is_pantry_excluded) {
    return ok({
      ...buildItem(itemResult.data),
      is_checked: nextChecked,
      is_pantry_excluded: nextExcluded,
    });
  }

  const updateResult = await dbClient
    .from("shopping_list_items")
    .update({
      is_checked: nextChecked,
      is_pantry_excluded: nextExcluded,
    })
    .eq("id", itemId)
    .eq("shopping_list_id", listId)
    .select("id, shopping_list_id, ingredient_id, display_text, amounts_json, is_checked, is_pantry_excluded, added_to_pantry, sort_order")
    .maybeSingle();

  if (isConflictError(updateResult.error)) {
    return fail("CONFLICT", "완료된 장보기 기록은 수정할 수 없어요.", 409);
  }

  if (updateResult.error || !updateResult.data) {
    return fail("INTERNAL_ERROR", "장보기 항목을 수정하지 못했어요.", 500);
  }

  return ok(buildItem(updateResult.data));
}
