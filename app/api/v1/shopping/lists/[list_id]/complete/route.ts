import { fail, ok } from "@/lib/api/response";
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
import { awardUserProgressEvent, type UserProgressDbClient } from "@/lib/server/user-progress";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import type { ShoppingListCompleteData } from "@/types/shopping";

interface RouteContext {
  params: Promise<{
    list_id: string;
  }>;
}

interface QueryError {
  message: string;
}

interface CompleteShoppingListRpcData {
  completed?: boolean;
  meals_updated?: number;
  pantry_added?: number;
  pantry_added_item_ids?: string[];
  completed_at?: string | null;
  meal_ids?: string[];
  newly_completed?: boolean;
  error_code?: string;
  message?: string;
}

interface ShoppingCompleteDbClient {
  rpc?: (
    functionName: "complete_shopping_list",
    args: {
      p_list_id: string;
      p_user_id: string;
      p_add_to_pantry_item_ids: string[] | null;
    },
  ) => PromiseLike<{
    data: CompleteShoppingListRpcData | null;
    error: QueryError | null;
  }>;
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

function statusFromRpcErrorCode(code: string | undefined) {
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

async function recordShoppingCompletionRewards(
  dbClient: UserProgressDbClient & UserGrowthActivityDbClient,
  {
    userId,
    listId,
    completedAt,
    mealIds,
  }: {
    userId: string;
    listId: string;
    completedAt: string;
    mealIds: string[];
  },
) {
  try {
    await awardUserProgressEvent(dbClient, {
      userId,
      eventType: "shopping_completed",
      sourceTable: "shopping_lists",
      sourceId: listId,
      occurredAt: completedAt,
    });
  } catch {
    // Progress is a secondary reward ledger; shopping completion remains authoritative.
  }

  if (mealIds.length === 0) {
    return;
  }

  try {
    await recordUserGrowthActivityEvent(dbClient, {
      userId,
      activityType: "shopping_bundle_prepared",
      category: "shopping",
      sourceKey: buildShoppingBundlePreparedSourceKey({
        actionKind: "shopping_list",
        mealIds,
      }),
      sourceTable: "shopping_lists",
      sourceId: listId,
      sourceMeta: {
        action_kind: "shopping_list",
        meal_ids: mealIds,
        shopping_list_id: listId,
      },
      occurredAt: completedAt,
    });
  } catch {
    // Activity history is secondary; shopping completion remains authoritative.
  }
}

export async function POST(request: Request, context: RouteContext) {
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

  const requestedPantryItemIds = await parseCompleteBody(request);

  if (requestedPantryItemIds === null) {
    return fail("VALIDATION_ERROR", "팬트리 반영 항목 형식이 올바르지 않아요.", 422, [
      { field: "add_to_pantry_item_ids", reason: "invalid_type" },
    ]);
  }

  const dbClient: ShoppingCompleteDbClient & UserBootstrapDbClient & UserProgressDbClient & UserGrowthActivityDbClient
    = routeClient;

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

  if (typeof dbClient.rpc !== "function") {
    return fail("INTERNAL_ERROR", "장보기를 완료하지 못했어요.", 500);
  }

  const completeResult = await dbClient.rpc("complete_shopping_list", {
    p_list_id: listId,
    p_user_id: user.id,
    p_add_to_pantry_item_ids: requestedPantryItemIds ?? null,
  });

  if (completeResult.error || !completeResult.data) {
    return fail("INTERNAL_ERROR", "장보기를 완료하지 못했어요.", 500);
  }

  if (completeResult.data.error_code) {
    return fail(
      completeResult.data.error_code,
      completeResult.data.message ?? "장보기를 완료하지 못했어요.",
      statusFromRpcErrorCode(completeResult.data.error_code),
    );
  }

  const mealIds = completeResult.data.meal_ids ?? [];
  const completedAt = completeResult.data.completed_at;

  if (completeResult.data.newly_completed && completedAt) {
    await recordShoppingCompletionRewards(dbClient, {
      userId: user.id,
      listId,
      completedAt,
      mealIds,
    });
  }

  return ok({
    completed: true,
    meals_updated: completeResult.data.meals_updated ?? 0,
    pantry_added: completeResult.data.pantry_added ?? 0,
    pantry_added_item_ids: completeResult.data.pantry_added_item_ids ?? [],
  } satisfies ShoppingListCompleteData);
}
