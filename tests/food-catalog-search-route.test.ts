import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

const USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const ITEM_ID = "550e8400-e29b-41d4-a716-446655440001";

function routeClient(user: { id: string } | null) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
    rpc: vi.fn(),
  };
}

function serviceClient(result: { data: unknown; error: { code?: string; message: string } | null }) {
  return { rpc: vi.fn(async () => result) };
}

async function importRoute() {
  return import("@/app/api/v1/food-catalog/search/route").catch(() => null);
}

beforeEach(() => {
  vi.resetModules();
  createRouteHandlerClient.mockReset();
  createServiceRoleClient.mockReset();
});

describe("GET /api/v1/food-catalog/search", () => {
  it("requires authentication before parsing filters", async () => {
    createRouteHandlerClient.mockResolvedValue(routeClient(null));
    createServiceRoleClient.mockReturnValue(null);
    const route = await importRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const response = await route.GET(new Request(
      "http://localhost/api/v1/food-catalog/search?visibility=public",
    ));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED", fields: [] },
    });
  });

  it("returns the official 400 envelope without DB work for client visibility", async () => {
    const db = serviceClient({ data: null, error: null });
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: USER_ID }));
    createServiceRoleClient.mockReturnValue(db);
    const route = await importRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const response = await route.GET(new Request(
      "http://localhost/api/v1/food-catalog/search?types=ingredient,food_product&visibility=public",
    ));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "INVALID_SEARCH_FILTER",
        fields: [{ field: "visibility", reason: "unsupported_filter" }],
      },
    });
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("returns one typed union page and encodes the DB tuple as one opaque cursor", async () => {
    const db = serviceClient({
      data: {
        items: [{
          type: "ingredient",
          id: ITEM_ID,
          standard_name: "연세 크림",
          category: "기타",
        }],
        next_cursor_tuple: {
          algorithm_version: 2,
          match_bucket: 1,
          coverage_bucket: 0,
          quantized_score: 900_000,
          source_partition: 0,
          type_partition: 0,
          created_at: "2026-07-25T12:00:00.123456Z",
          stable_id: ITEM_ID,
        },
        has_next: true,
      },
      error: null,
    });
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: USER_ID }));
    createServiceRoleClient.mockReturnValue(db);
    const route = await importRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const response = await route.GET(new Request(
      "http://localhost/api/v1/food-catalog/search?q=%EC%97%B0%EC%84%B8%ED%81%AC%EB%A6%BC%EB%B9%B5&types=ingredient,food_product&source=public&limit=20",
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        items: [{ type: "ingredient", id: ITEM_ID }],
        has_next: true,
      },
      error: null,
    });
    expect(body.data.next_cursor).toEqual(expect.any(String));
    expect(body.data).not.toHaveProperty("next_cursor_tuple");
    expect(db.rpc).toHaveBeenCalledWith("search_food_catalog_ranked", expect.objectContaining({
      p_actor_id: USER_ID,
      p_query: "연세크림빵",
      p_types: ["ingredient", "food_product"],
      p_source: "public",
      p_limit: 20,
      p_cursor_version: null,
      p_cursor: null,
    }));
  });

  it("fails closed when the ranked RPC rejects the cursor or scope", async () => {
    const db = serviceClient({
      data: null,
      error: { code: "P0001", message: "INVALID_SEARCH_FILTER" },
    });
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: USER_ID }));
    createServiceRoleClient.mockReturnValue(db);
    const route = await importRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const response = await route.GET(new Request(
      "http://localhost/api/v1/food-catalog/search?types=ingredient,food_product",
    ));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      data: null,
      error: { code: "INVALID_SEARCH_FILTER", fields: [] },
    });
  });

  it("finishes a legacy product cursor page with a legacy cursor", async () => {
    const legacyCursor = Buffer.from(JSON.stringify({
      created_at: "2026-07-25T12:00:01.123456Z",
      id: ITEM_ID,
    }), "utf8").toString("base64url");
    const db = serviceClient({
      data: {
        items: [],
        next_cursor_tuple: {
          algorithm_version: 2,
          match_bucket: 4,
          coverage_bucket: 0,
          quantized_score: 0,
          source_partition: 0,
          type_partition: 1,
          created_at: "2026-07-25T12:00:00.123456Z",
          stable_id: ITEM_ID,
        },
        has_next: true,
      },
      error: null,
    });
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: USER_ID }));
    createServiceRoleClient.mockReturnValue(db);
    const route = await importRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const response = await route.GET(new Request(
      `http://localhost/api/v1/food-catalog/search?types=food_product&cursor=${legacyCursor}`,
    ));
    const body = await response.json();
    const decoded = JSON.parse(
      Buffer.from(body.data.next_cursor, "base64url").toString("utf8"),
    );

    expect(response.status).toBe(200);
    expect(decoded).toEqual({
      created_at: "2026-07-25T12:00:00.123456Z",
      id: ITEM_ID,
    });
    expect(db.rpc).toHaveBeenCalledWith(
      "search_food_catalog_ranked",
      expect.objectContaining({ p_cursor_version: 1 }),
    );
  });
});
