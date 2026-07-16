import { fail, ok } from "@/lib/api/response";
import { parseProductPlannerEntryPatchBody } from "@/lib/server/prepared-food-planner-entry";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { ProductPlannerEntryData } from "@/types/product-planner-entry";

interface RouteContext {
  params: Promise<{ entry_id: string }>;
}

interface RpcError {
  code?: string;
  message: string;
}

interface EntryState {
  id: string;
  user_id: string;
}

interface StateQuery {
  eq(column: string, value: string): StateQuery;
  maybeSingle(): PromiseLike<{ data: EntryState | null; error: RpcError | null }>;
}

interface EntryTable {
  select(columns: string): StateQuery;
}

interface ProductPlannerEntryMutationDbClient {
  from(table: "product_planner_entries"): EntryTable;
  rpc(
    name: "update_product_planner_entry_quantity" | "delete_product_planner_entry",
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RpcError | null }>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function databaseFailure(error: RpcError | null, fallback: string) {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (/NUTRITION_BASIS_MISMATCH/i.test(detail)) {
    return fail("NUTRITION_BASIS_MISMATCH", "이 수량 단위로 영양을 계산할 수 없어요.", 422);
  }
  if (/FORBIDDEN/i.test(detail)) {
    return fail("FORBIDDEN", "내 완제품 항목만 변경할 수 있어요.", 403);
  }
  if (/RESOURCE_NOT_FOUND/i.test(detail)) {
    return fail("RESOURCE_NOT_FOUND", "완제품 항목을 찾을 수 없어요.", 404);
  }
  if (/VALIDATION_ERROR|22003|23514/i.test(detail)) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해 주세요.", 422);
  }
  return fail("INTERNAL_ERROR", fallback, 500);
}

async function requireEntry(context: RouteContext) {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;
  if (!user) {
    return {
      response: fail("UNAUTHORIZED", "로그인이 필요해요.", 401),
      db: null,
      user: null,
      entryId: null,
    };
  }

  const { entry_id: entryId } = await context.params;
  if (!UUID_PATTERN.test(entryId)) {
    return {
      response: fail("VALIDATION_ERROR", "항목 ID를 확인해 주세요.", 422, [
        { field: "entry_id", reason: "invalid_uuid" },
      ]),
      db: null,
      user: null,
      entryId: null,
    };
  }

  const db = (createServiceRoleClient() ?? routeClient) as unknown as ProductPlannerEntryMutationDbClient;
  const stateResult = await db
    .from("product_planner_entries")
    .select("id, user_id")
    .eq("id", entryId)
    .maybeSingle();
  if (stateResult.error) {
    return {
      response: databaseFailure(stateResult.error, "완제품 항목을 확인하지 못했어요."),
      db: null,
      user: null,
      entryId: null,
    };
  }
  if (!stateResult.data) {
    return {
      response: fail("RESOURCE_NOT_FOUND", "완제품 항목을 찾을 수 없어요.", 404),
      db: null,
      user: null,
      entryId: null,
    };
  }
  if (stateResult.data.user_id !== user.id) {
    return {
      response: fail("FORBIDDEN", "내 완제품 항목만 변경할 수 있어요.", 403),
      db: null,
      user: null,
      entryId: null,
    };
  }

  return { response: null, db, user, entryId };
}

export async function PATCH(request: Request, context: RouteContext) {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);

  const { entry_id: entryId } = await context.params;
  if (!UUID_PATTERN.test(entryId)) {
    return fail("VALIDATION_ERROR", "항목 ID를 확인해 주세요.", 422, [
      { field: "entry_id", reason: "invalid_uuid" },
    ]);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해 주세요.", 422, [
      { field: "body", reason: "invalid_json" },
    ]);
  }
  const parsed = parseProductPlannerEntryPatchBody(body);
  if (!parsed.ok) {
    return fail(parsed.code, "요청 값을 확인해 주세요.", 422, parsed.fields);
  }

  const db = (createServiceRoleClient() ?? routeClient) as unknown as ProductPlannerEntryMutationDbClient;
  const stateResult = await db
    .from("product_planner_entries")
    .select("id, user_id")
    .eq("id", entryId)
    .maybeSingle();
  if (stateResult.error) {
    return databaseFailure(stateResult.error, "완제품 수량을 변경하지 못했어요.");
  }
  if (!stateResult.data) {
    return fail("RESOURCE_NOT_FOUND", "완제품 항목을 찾을 수 없어요.", 404);
  }
  if (stateResult.data.user_id !== user.id) {
    return fail("FORBIDDEN", "내 완제품 항목만 변경할 수 있어요.", 403);
  }

  const result = await db.rpc("update_product_planner_entry_quantity", {
    p_user_id: user.id,
    p_entry_id: entryId,
    p_quantity_amount: parsed.value.quantity.amount,
    p_quantity_unit: parsed.value.quantity.unit,
  });
  if (result.error || !result.data) {
    return databaseFailure(result.error, "완제품 수량을 변경하지 못했어요.");
  }
  return ok({ entry: result.data as ProductPlannerEntryData });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const required = await requireEntry(context);
  if (required.response || !required.db || !required.user || !required.entryId) {
    return required.response ?? fail("INTERNAL_ERROR", "완제품 항목을 삭제하지 못했어요.", 500);
  }

  const result = await required.db.rpc("delete_product_planner_entry", {
    p_user_id: required.user.id,
    p_entry_id: required.entryId,
  });
  if (result.error) {
    return databaseFailure(result.error, "완제품 항목을 삭제하지 못했어요.");
  }
  return ok({ deleted: true, entry_id: required.entryId });
}
