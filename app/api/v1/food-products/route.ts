import { fail, ok } from "@/lib/api/response";
import {
  parseProductCreateBody,
  parseProductListQuery,
} from "@/lib/server/prepared-food-catalog";
import { ensurePublicUserRow, type UserBootstrapDbClient } from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { FoodProductData, FoodProductListData } from "@/types/food-product";

interface RpcError {
  code?: string;
  message: string;
}

interface CatalogDbClient {
  rpc(
    name: "list_food_products" | "create_manual_food_product",
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RpcError | null }>;
}

function mapDatabaseError(error: RpcError | null, fallbackMessage: string) {
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
  if (/VALIDATION_ERROR|22003/i.test(detail)) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해 주세요.", 422);
  }
  return fail("INTERNAL_ERROR", fallbackMessage, 500);
}

async function requireUser() {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  return { routeClient, user: authResult.data.user };
}

export async function GET(request: Request) {
  const { routeClient, user } = await requireUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);

  const parsed = parseProductListQuery(new URL(request.url).searchParams);
  if (!parsed.ok) {
    return fail(parsed.code, "검색 조건을 확인해 주세요.", 422, parsed.fields);
  }

  const db = (createServiceRoleClient() ?? routeClient) as unknown as CatalogDbClient;
  const result = await db.rpc("list_food_products", {
    p_user_id: user.id,
    p_query: parsed.value.q || null,
    p_source: parsed.value.source,
    p_cursor_created_at: parsed.value.cursor?.createdAt ?? null,
    p_cursor_id: parsed.value.cursor?.id ?? null,
    p_limit: parsed.value.limit,
  });
  if (result.error || !result.data) {
    return mapDatabaseError(result.error, "완제품을 불러오지 못했어요.");
  }

  return ok(result.data as FoodProductListData);
}

export async function POST(request: Request) {
  const { routeClient, user } = await requireUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("VALIDATION_ERROR", "요청 본문을 확인해 주세요.", 422, [
      { field: "body", reason: "invalid_json" },
    ]);
  }

  const parsed = parseProductCreateBody(body);
  if (!parsed.ok) {
    return fail(parsed.code, "요청 값을 확인해 주세요.", 422, parsed.fields);
  }

  const db = (createServiceRoleClient() ?? routeClient) as unknown as CatalogDbClient & UserBootstrapDbClient;
  try {
    await ensurePublicUserRow(db, user);
  } catch {
    return fail("INTERNAL_ERROR", "완제품을 등록하지 못했어요.", 500);
  }

  const result = await db.rpc("create_manual_food_product", {
    p_user_id: user.id,
    p_name: parsed.value.name,
    p_brand: parsed.value.brand,
    p_nutrition: parsed.value.nutrition,
  });
  if (result.error || !result.data) {
    return mapDatabaseError(result.error, "완제품을 등록하지 못했어요.");
  }

  return ok({ product: result.data as FoodProductData }, { status: 201 });
}
