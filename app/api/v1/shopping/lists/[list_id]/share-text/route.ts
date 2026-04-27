import { fail, ok } from "@/lib/api/response";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { ShoppingShareTextData } from "@/types/shopping";

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
  title: string;
  date_range_start: string;
  is_completed: boolean;
}

interface ShoppingListShareItemRow {
  id: string;
  display_text: string;
  is_pantry_excluded: boolean;
  sort_order: number;
}

interface QueryOrderOption {
  ascending: boolean;
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

interface ShoppingListItemsSelectQuery {
  eq(column: string, value: string | boolean): ShoppingListItemsSelectQuery;
  order(column: string, options: QueryOrderOption): ShoppingListItemsSelectQuery;
  then: ArrayResult<ShoppingListShareItemRow>["then"];
}

interface ShoppingListsTable {
  select(columns: string): ShoppingListsSelectQuery;
}

interface ShoppingListItemsTable {
  select(columns: string): ShoppingListItemsSelectQuery;
}

interface ShoppingShareTextDbClient {
  from(table: "shopping_lists"): ShoppingListsTable;
  from(table: "shopping_list_items"): ShoppingListItemsTable;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

function buildFallbackTitle(dateIso: string) {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();

  return `${month}/${day} 장보기`;
}

function buildShoppingShareText(list: ShoppingListRow, items: ShoppingListShareItemRow[]): string {
  const title = list.title.trim() || buildFallbackTitle(list.date_range_start);
  const header = `📋 ${title}`;

  if (items.length === 0) {
    return header;
  }

  return `${header}\n\n${items.map((item) => `☐ ${item.display_text}`).join("\n")}`;
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
    ShoppingShareTextDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "장보기 공유 텍스트를 만들지 못했어요."),
      500,
    );
  }

  const listResult = await dbClient
    .from("shopping_lists")
    .select("id, user_id, title, date_range_start, is_completed")
    .eq("id", listId)
    .maybeSingle();

  if (listResult.error || !listResult.data) {
    return fail("RESOURCE_NOT_FOUND", "장보기 리스트를 찾을 수 없어요.", 404);
  }

  if (listResult.data.user_id !== user.id) {
    return fail("FORBIDDEN", "내 장보기 리스트만 공유할 수 있어요.", 403);
  }

  const itemsResult = await dbClient
    .from("shopping_list_items")
    .select("id, display_text, is_pantry_excluded, sort_order")
    .eq("shopping_list_id", listId)
    .eq("is_pantry_excluded", false)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if (itemsResult.error || !itemsResult.data) {
    return fail("INTERNAL_ERROR", "장보기 공유 텍스트를 만들지 못했어요.", 500);
  }

  return ok({
    text: buildShoppingShareText(listResult.data, itemsResult.data),
  } satisfies ShoppingShareTextData);
}
