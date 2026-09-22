import { fail, ok } from "@/lib/api/response";
import {
  encodeFoodCatalogSearchCursor,
  parseFoodCatalogSearchQuery,
  parseFoodCatalogSearchTuple,
} from "@/lib/server/food-catalog-search";
import { encodeProductCursor } from "@/lib/server/prepared-food-catalog";
import {
  createRouteHandlerClient,
} from "@/lib/supabase/server";

interface RpcError {
  code?: string;
  message: string;
}

interface FoodCatalogSearchDb {
  rpc(
    name: "search_food_catalog_ranked" | "read_food_catalog_source",
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RpcError | null }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(request: Request) {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);

  const params = new URL(request.url).searchParams;
  const db = routeClient as unknown as FoodCatalogSearchDb;
  if (params.has("source_type") || params.has("source_id")) {
    const sourceType = params.get("source_type");
    const sourceId = params.get("source_id")?.trim().toLowerCase();
    const fields: Array<{ field: string; reason: string }> = [];
    for (const key of new Set(params.keys())) {
      if (key !== "source_type" && key !== "source_id") {
        fields.push({ field: key, reason: "unsupported_filter" });
      }
      if (params.getAll(key).length !== 1) {
        fields.push({ field: key, reason: "duplicate_filter" });
      }
    }
    if (sourceType !== "ingredient" && sourceType !== "food_product") {
      fields.push({ field: "source_type", reason: "unsupported_type" });
    }
    if (!sourceId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(sourceId)) {
      fields.push({ field: "source_id", reason: "invalid_uuid" });
    }
    if (fields.length > 0) {
      return fail("INVALID_SEARCH_FILTER", "검색 조건을 확인해 주세요.", 400, fields);
    }
    const result = await db.rpc("read_food_catalog_source", {
      p_actor_id: user.id, p_source_type: sourceType, p_source_id: sourceId,
    });
    if (result.error || (result.data !== null && (
      !isRecord(result.data) || result.data.type !== sourceType || result.data.id !== sourceId
    ))) {
      return fail("INTERNAL_ERROR", "음식 정보를 불러오지 못했어요. 다시 시도해 주세요.", 500);
    }
    return ok({ items: result.data ? [result.data] : [], next_cursor: null, has_next: false });
  }

  const parsed = parseFoodCatalogSearchQuery(params);
  if (!parsed.ok) {
    return fail(
      parsed.code,
      "검색 조건을 확인해 주세요.",
      400,
      parsed.fields,
    );
  }

  const cursor = parsed.value.cursor;
  const result = await db.rpc("search_food_catalog_ranked", {
    p_actor_id: user.id,
    p_query: parsed.value.q || null,
    p_types: parsed.value.types,
    p_source: parsed.value.source,
    p_cursor_version: cursor?.version ?? null,
    p_cursor: cursor?.version === 2
      ? cursor.tuple
      : cursor
        ? {
            created_at: cursor.created_at,
            stable_id: cursor.stable_id,
          }
        : null,
    p_query_fingerprint: parsed.value.fingerprint,
    p_limit: parsed.value.limit,
  });

  if (result.error) {
    const detail = `${result.error.code ?? ""} ${result.error.message}`;
    if (/INVALID_SEARCH_FILTER/i.test(detail)) {
      return fail(
        "INVALID_SEARCH_FILTER",
        "검색 조건을 확인해 주세요.",
        400,
      );
    }
    return fail("INTERNAL_ERROR", "검색 결과를 불러오지 못했어요.", 500);
  }
  if (
    !isRecord(result.data)
    || !Array.isArray(result.data.items)
    || typeof result.data.has_next !== "boolean"
  ) {
    return fail("INTERNAL_ERROR", "검색 결과를 불러오지 못했어요.", 500);
  }

  let nextCursor: string | null = null;
  if (result.data.has_next) {
    const tuple = parseFoodCatalogSearchTuple(result.data.next_cursor_tuple);
    if (!tuple) {
      return fail("INTERNAL_ERROR", "검색 결과를 불러오지 못했어요.", 500);
    }
    nextCursor = cursor?.version === 1
      ? encodeProductCursor({
          createdAt: tuple.created_at,
          id: tuple.stable_id,
        })
      : encodeFoodCatalogSearchCursor({
          version: 2,
          fingerprint: parsed.value.fingerprint,
          tuple,
        });
  }

  return ok({
    items: result.data.items,
    next_cursor: nextCursor,
    has_next: result.data.has_next,
  });
}
