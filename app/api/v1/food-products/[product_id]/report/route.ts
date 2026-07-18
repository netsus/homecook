import { fail, ok } from "@/lib/api/response";
import { parseFoodProductReportBody } from "@/lib/server/prepared-food-catalog";
import { ensurePublicUserRow, type UserBootstrapDbClient } from "@/lib/server/user-bootstrap";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{ product_id: string }>;
}

interface RpcError {
  code?: string;
  message: string;
}

interface ReportDbClient {
  rpc(
    name: "report_food_product",
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RpcError | null }>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapDatabaseError(error: RpcError | null) {
  const detail = `${error?.code ?? ""} ${error?.message ?? ""}`;
  if (/PRODUCT_ALREADY_REPORTED/i.test(detail)) {
    return fail("PRODUCT_ALREADY_REPORTED", "이미 신고한 완제품이에요.", 409);
  }
  if (/PRODUCT_REPORT_NOT_ALLOWED/i.test(detail)) {
    return fail("PRODUCT_REPORT_NOT_ALLOWED", "이 완제품은 신고할 수 없어요.", 409);
  }
  if (/FORBIDDEN/i.test(detail)) {
    return fail("FORBIDDEN", "내가 등록한 완제품은 신고할 수 없어요.", 403);
  }
  if (/RESOURCE_NOT_FOUND/i.test(detail)) {
    return fail("RESOURCE_NOT_FOUND", "완제품을 찾을 수 없어요.", 404);
  }
  if (/VALIDATION_ERROR|22003/i.test(detail)) {
    return fail("VALIDATION_ERROR", "요청 값을 확인해 주세요.", 422);
  }
  return fail("INTERNAL_ERROR", "완제품 신고를 접수하지 못했어요.", 500);
}

export async function POST(request: Request, context: RouteContext) {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;
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

  const parsed = parseFoodProductReportBody(body);
  if (!parsed.ok) {
    return fail(parsed.code, "요청 값을 확인해 주세요.", 422, parsed.fields);
  }

  const db = (createServiceRoleClient() ?? routeClient) as unknown as ReportDbClient & UserBootstrapDbClient;
  try {
    await ensurePublicUserRow(db, user);
  } catch {
    return fail("INTERNAL_ERROR", "완제품 신고를 접수하지 못했어요.", 500);
  }

  const result = await db.rpc("report_food_product", {
    p_user_id: user.id,
    p_product_id: productId,
    p_reason_code: parsed.value.reason_code,
    p_detail_text: parsed.value.detail_text,
  });
  if (result.error) {
    return mapDatabaseError(result.error);
  }

  return ok({ reported: true }, { status: 201 });
}
