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

interface ShoppingListsTable {
  select(columns: string): ShoppingListsSelectQuery;
  update(values: { is_completed: true; completed_at: string }): ShoppingListsUpdateQuery;
}

interface MealsTable {
  update(values: { status: "shopping_done" }): MealsUpdateQuery;
}

interface ShoppingCompleteDbClient {
  from(table: "shopping_lists"): ShoppingListsTable;
  from(table: "meals"): MealsTable;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

async function requireUser(routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>>) {
  const authResult = await routeClient.auth.getUser();
  return authResult.data.user;
}

export async function POST(_request: Request, context: RouteContext) {
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

  if (listResult.data.is_completed) {
    return ok({
      completed: true,
      meals_updated: 0,
    } satisfies ShoppingListCompleteData);
  }

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

  return ok({
    completed: true,
    meals_updated: mealsUpdateResult.data.length,
  } satisfies ShoppingListCompleteData);
}
