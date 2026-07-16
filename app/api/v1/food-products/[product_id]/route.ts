import { fail, ok } from "@/lib/api/response";
import { parseProductPatchBody } from "@/lib/server/prepared-food-catalog";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { FoodProductData } from "@/types/food-product";

interface RouteContext {
  params: Promise<{ product_id: string }>;
}

interface RpcError {
  code?: string;
  message: string;
}

interface ProductState {
  id: string;
  owner_user_id: string | null;
  visibility: "public" | "private";
  source_type: "public_dataset" | "manual";
  deleted_at: string | null;
  current_nutrition_version_id: string;
}

type MaybeSingleResult<T> = PromiseLike<{ data: T | null; error: RpcError | null }>;

interface StateQuery {
  eq(column: string, value: string): StateQuery;
  maybeSingle(): MaybeSingleResult<ProductState>;
}

interface ProductTable {
  select(columns: string): StateQuery;
}

interface CatalogMutationDbClient {
  from(table: "food_products"): ProductTable;
  rpc(
    name: "update_manual_food_product" | "delete_manual_food_product",
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RpcError | null }>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function databaseFailure(error: RpcError | null, fallback: string) {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (/NUTRITION_VERSION_CONFLICT/i.test(detail)) {
    return fail("NUTRITION_VERSION_CONFLICT", "영양 정보가 먼저 변경됐어요.", 409);
  }
  if (/RESOURCE_NOT_FOUND/i.test(detail)) {
    return fail("RESOURCE_NOT_FOUND", "완제품을 찾을 수 없어요.", 404);
  }
  if (/FORBIDDEN/i.test(detail)) {
    return fail("FORBIDDEN", "이 완제품을 변경할 수 없어요.", 403);
  }
  return fail("INTERNAL_ERROR", fallback, 500);
}

async function requireUser() {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  return { routeClient, user: authResult.data.user };
}

async function readProductState(db: CatalogMutationDbClient, productId: string) {
  return db
    .from("food_products")
    .select("id, owner_user_id, visibility, source_type, deleted_at, current_nutrition_version_id")
    .eq("id", productId)
    .maybeSingle();
}

function authorizePrivateOwner(state: ProductState | null, userId: string) {
  if (!state) return "not_found" as const;
  if (state.visibility === "public") return "forbidden" as const;
  if (state.owner_user_id !== userId) return "not_found" as const;
  return "allowed" as const;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { routeClient, user } = await requireUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);

  const { product_id: productId } = await context.params;
  if (!UUID_PATTERN.test(productId)) {
    return fail("RESOURCE_NOT_FOUND", "완제품을 찾을 수 없어요.", 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해 주세요.", 422, [
      { field: "body", reason: "invalid_json" },
    ]);
  }
  const parsed = parseProductPatchBody(body);
  if (!parsed.ok) {
    return fail(parsed.code, "요청 값을 확인해 주세요.", 422, parsed.fields);
  }

  const db = (createServiceRoleClient() ?? routeClient) as unknown as CatalogMutationDbClient;
  const stateResult = await readProductState(db, productId);
  if (stateResult.error) return fail("INTERNAL_ERROR", "완제품을 수정하지 못했어요.", 500);
  const state = stateResult.data;
  const authorization = authorizePrivateOwner(state, user.id);
  if (authorization === "forbidden") {
    return fail("FORBIDDEN", "공개 완제품은 수정할 수 없어요.", 403);
  }
  if (authorization === "not_found" || !state || state.deleted_at) {
    return fail("RESOURCE_NOT_FOUND", "완제품을 찾을 수 없어요.", 404);
  }

  const result = await db.rpc("update_manual_food_product", {
    p_user_id: user.id,
    p_product_id: productId,
    p_patch: parsed.value,
    p_expected_current_version_id: state.current_nutrition_version_id,
  });
  if (result.error || !result.data) {
    return databaseFailure(result.error, "완제품을 수정하지 못했어요.");
  }
  return ok({ product: result.data as FoodProductData });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { routeClient, user } = await requireUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);

  const { product_id: productId } = await context.params;
  if (!UUID_PATTERN.test(productId)) {
    return fail("RESOURCE_NOT_FOUND", "완제품을 찾을 수 없어요.", 404);
  }

  const db = (createServiceRoleClient() ?? routeClient) as unknown as CatalogMutationDbClient;
  const stateResult = await readProductState(db, productId);
  if (stateResult.error) return fail("INTERNAL_ERROR", "완제품을 삭제하지 못했어요.", 500);
  const authorization = authorizePrivateOwner(stateResult.data, user.id);
  if (authorization === "forbidden") {
    return fail("FORBIDDEN", "공개 완제품은 삭제할 수 없어요.", 403);
  }
  if (authorization === "not_found") {
    return fail("RESOURCE_NOT_FOUND", "완제품을 찾을 수 없어요.", 404);
  }
  if (stateResult.data?.deleted_at) return ok({ deleted: true });

  const result = await db.rpc("delete_manual_food_product", {
    p_user_id: user.id,
    p_product_id: productId,
  });
  if (result.error) return databaseFailure(result.error, "완제품을 삭제하지 못했어요.");
  return ok({ deleted: true });
}
