import { fail, ok } from "@/lib/api/response";
import { parseProductPlannerEntryCreateBody } from "@/lib/server/prepared-food-planner-entry";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { ProductPlannerEntryData } from "@/types/product-planner-entry";

interface RpcError {
  code?: string;
  message: string;
}

interface ProductState {
  id: string;
  owner_user_id: string | null;
  visibility: "public" | "private";
  deleted_at: string | null;
  current_nutrition_version_id: string | null;
}

interface ColumnState {
  id: string;
  user_id: string;
}

interface StateQuery<T> {
  eq(column: string, value: string): StateQuery<T>;
  maybeSingle(): PromiseLike<{ data: T | null; error: RpcError | null }>;
}

interface StateTable<T> {
  select(columns: string): StateQuery<T>;
}

interface ProductPlannerEntryCreateDbClient {
  from(table: "food_products"): StateTable<ProductState>;
  from(table: "meal_plan_columns"): StateTable<ColumnState>;
  rpc(
    name: "create_product_planner_entry",
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RpcError | null }>;
}

function databaseFailure(error: RpcError | null) {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (/NUTRITION_VERSION_CONFLICT/i.test(detail)) {
    return fail("NUTRITION_VERSION_CONFLICT", "영양 정보가 먼저 변경됐어요.", 409);
  }
  if (/PRODUCT_DELETED/i.test(detail)) {
    return fail("PRODUCT_DELETED", "삭제된 완제품은 추가할 수 없어요.", 409);
  }
  if (/NUTRITION_BASIS_MISMATCH/i.test(detail)) {
    return fail("NUTRITION_BASIS_MISMATCH", "이 수량 단위로 영양을 계산할 수 없어요.", 422);
  }
  if (/FORBIDDEN/i.test(detail)) {
    return fail("FORBIDDEN", "이 항목을 추가할 수 없어요.", 403);
  }
  if (/RESOURCE_NOT_FOUND/i.test(detail)) {
    return fail("RESOURCE_NOT_FOUND", "완제품 또는 끼니 컬럼을 찾을 수 없어요.", 404);
  }
  if (/VALIDATION_ERROR|22003|23514/i.test(detail)) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해 주세요.", 422);
  }
  return fail("INTERNAL_ERROR", "완제품을 플래너에 추가하지 못했어요.", 500);
}

export async function POST(request: Request) {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해 주세요.", 422, [
      { field: "body", reason: "invalid_json" },
    ]);
  }

  const parsed = parseProductPlannerEntryCreateBody(body);
  if (!parsed.ok) {
    return fail(parsed.code, "요청 값을 확인해 주세요.", 422, parsed.fields);
  }

  const db = (createServiceRoleClient() ?? routeClient) as unknown as
    ProductPlannerEntryCreateDbClient & UserBootstrapDbClient;
  try {
    await ensurePublicUserRow(db, user);
    await ensureUserBootstrapState(db, user.id);
  } catch {
    return fail("INTERNAL_ERROR", "완제품을 플래너에 추가하지 못했어요.", 500);
  }

  const columnResult = await db
    .from("meal_plan_columns")
    .select("id, user_id")
    .eq("id", parsed.value.column_id)
    .maybeSingle();
  if (columnResult.error) return databaseFailure(columnResult.error);
  if (!columnResult.data) {
    return fail("RESOURCE_NOT_FOUND", "끼니 컬럼을 찾을 수 없어요.", 404);
  }
  if (columnResult.data.user_id !== user.id) {
    return fail("FORBIDDEN", "내 끼니 컬럼만 사용할 수 있어요.", 403);
  }

  const productResult = await db
    .from("food_products")
    .select("id, owner_user_id, visibility, deleted_at, current_nutrition_version_id")
    .eq("id", parsed.value.product_id)
    .maybeSingle();
  if (productResult.error) return databaseFailure(productResult.error);
  const product = productResult.data;
  if (!product) {
    return fail("RESOURCE_NOT_FOUND", "완제품을 찾을 수 없어요.", 404);
  }
  if (product.visibility !== "public" && product.owner_user_id !== user.id) {
    return fail("FORBIDDEN", "이 완제품을 추가할 수 없어요.", 403);
  }
  if (product.deleted_at) {
    return fail("PRODUCT_DELETED", "삭제된 완제품은 추가할 수 없어요.", 409);
  }
  if (!product.current_nutrition_version_id) {
    return fail("NUTRITION_VERSION_CONFLICT", "영양 정보가 준비되지 않았어요.", 409);
  }

  const result = await db.rpc("create_product_planner_entry", {
    p_user_id: user.id,
    p_product_id: parsed.value.product_id,
    p_plan_date: parsed.value.plan_date,
    p_column_id: parsed.value.column_id,
    p_quantity_amount: parsed.value.quantity.amount,
    p_quantity_unit: parsed.value.quantity.unit,
    p_expected_current_version_id: product.current_nutrition_version_id,
  });
  if (result.error || !result.data) return databaseFailure(result.error);

  return ok({ entry: result.data as ProductPlannerEntryData }, { status: 201 });
}
