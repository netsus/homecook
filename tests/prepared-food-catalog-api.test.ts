import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const ensurePublicUserRow = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
}));

const product = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  name: "내 요거트",
  brand: null,
  visibility: "private",
  source_type: "manual",
  editable: true,
  nutrition_version_id: "550e8400-e29b-41d4-a716-446655440002",
  basis_relations: [],
  nutrition: {
    basis: { amount: 1, unit: "serving" },
    values: {
      energy_kcal: { amount: 120, known_amount: null, status: "complete", display_mode: "total" },
      carbohydrate_g: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
      protein_g: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
      fat_g: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
      sodium_mg: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
    },
    calculation_status: "partial",
    calculation_quality: "direct",
    warnings: [],
    sources: [{
      provider: "user_label",
      dataset: null,
      source_version: null,
      data_basis_date: null,
      license: null,
      source_url: null,
    }],
  },
};

function routeClient(user: { id: string } | null) {
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
    rpc: vi.fn(),
    from: vi.fn(),
  };
}

function serviceClient(options: {
  rpcResults?: Record<string, { data: unknown; error: { message: string; code?: string } | null }>;
  productState?: Record<string, unknown> | null;
} = {}) {
  const stateQuery = {
    eq: vi.fn(() => stateQuery),
    maybeSingle: vi.fn(async () => ({ data: options.productState ?? null, error: null })),
  };
  return {
    rpc: vi.fn(async (name: string) => options.rpcResults?.[name] ?? { data: null, error: null }),
    from: vi.fn(() => ({ select: vi.fn(() => stateQuery) })),
  };
}

async function importCollectionRoute() {
  return import("@/app/api/v1/food-products/route").catch(() => null);
}

async function importItemRoute() {
  return import("@/app/api/v1/food-products/[product_id]/route").catch(() => null);
}

beforeEach(() => {
  vi.resetModules();
  createRouteHandlerClient.mockReset();
  createServiceRoleClient.mockReset();
  ensurePublicUserRow.mockReset();
  ensurePublicUserRow.mockResolvedValue({});
});

describe("prepared food catalog API contract", () => {
  it("returns 401 before parsing an invalid create body", async () => {
    createRouteHandlerClient.mockResolvedValue(routeClient(null));
    createServiceRoleClient.mockReturnValue(null);
    const route = await importCollectionRoute();
    expect(route, "food-products collection route must exist").not.toBeNull();
    if (!route) return;

    const response = await route.POST(new Request("http://localhost/api/v1/food-products", {
      method: "POST",
      body: "{",
    }));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED", fields: [] },
    });
  });

  it("returns the official 422 unsupported nutrient envelope without calling the database", async () => {
    const routeDb = routeClient({ id: "user-1" });
    const serviceDb = serviceClient();
    createRouteHandlerClient.mockResolvedValue(routeDb);
    createServiceRoleClient.mockReturnValue(serviceDb);
    const route = await importCollectionRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const response = await route.POST(new Request("http://localhost/api/v1/food-products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "제품",
        nutrition: {
          basis: { amount: 1, unit: "serving" },
          values: { energy_kcal: 100, cholesterol_mg: 2 },
        },
      }),
    }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "UNSUPPORTED_NUTRIENT",
        fields: [{ field: "nutrition.values.cholesterol_mg" }],
      },
    });
    expect(serviceDb.rpc).not.toHaveBeenCalled();
  });

  it("creates one private manual product through the atomic RPC and preserves the wrapper", async () => {
    const serviceDb = serviceClient({
      rpcResults: { create_manual_food_product: { data: product, error: null } },
    });
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: "user-1" }));
    createServiceRoleClient.mockReturnValue(serviceDb);
    const route = await importCollectionRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const response = await route.POST(new Request("http://localhost/api/v1/food-products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "내 요거트",
        brand: null,
        nutrition: {
          basis: { amount: 1, unit: "serving" },
          values: { energy_kcal: 120 },
        },
      }),
    }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ success: true, data: { product }, error: null });
    expect(serviceDb.rpc).toHaveBeenCalledWith("create_manual_food_product", expect.objectContaining({
      p_user_id: "user-1",
      p_name: "내 요거트",
      p_brand: null,
    }));
  });

  it("lists only the bounded RPC projection and returns stable pagination fields", async () => {
    const serviceDb = serviceClient({
      rpcResults: {
        list_food_products: {
          data: { items: [product], next_cursor: null, has_next: false },
          error: null,
        },
      },
    });
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: "user-1" }));
    createServiceRoleClient.mockReturnValue(serviceDb);
    const route = await importCollectionRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const response = await route.GET(new Request("http://localhost/api/v1/food-products?q=%EC%9A%94%EA%B1%B0%ED%8A%B8&limit=20"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { items: [product], next_cursor: null, has_next: false },
      error: null,
    });
    expect(serviceDb.rpc).toHaveBeenCalledTimes(1);
  });

  it("returns 403 for public mutation and scope-filtered 404 for another owner", async () => {
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: "user-1" }));
    const publicDb = serviceClient({
      productState: {
        id: product.id,
        owner_user_id: null,
        visibility: "public",
        source_type: "public_dataset",
        deleted_at: null,
        current_nutrition_version_id: product.nutrition_version_id,
      },
    });
    createServiceRoleClient.mockReturnValue(publicDb);
    const route = await importItemRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const publicResponse = await route.PATCH(new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ name: "변경" }),
    }), { params: Promise.resolve({ product_id: product.id }) });
    expect(publicResponse.status).toBe(403);

    const otherDb = serviceClient({
      productState: {
        id: product.id,
        owner_user_id: "other-user",
        visibility: "private",
        source_type: "manual",
        deleted_at: null,
        current_nutrition_version_id: product.nutrition_version_id,
      },
    });
    createServiceRoleClient.mockReturnValue(otherDb);
    const hiddenResponse = await route.DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ product_id: product.id }),
    });
    expect(hiddenResponse.status).toBe(404);
    expect((await hiddenResponse.json()).error.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("maps a compare-and-switch loser to 409 NUTRITION_VERSION_CONFLICT", async () => {
    const serviceDb = serviceClient({
      productState: {
        id: product.id,
        owner_user_id: "user-1",
        visibility: "private",
        source_type: "manual",
        deleted_at: null,
        current_nutrition_version_id: product.nutrition_version_id,
      },
      rpcResults: {
        update_manual_food_product: {
          data: null,
          error: { message: "NUTRITION_VERSION_CONFLICT" },
        },
      },
    });
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: "user-1" }));
    createServiceRoleClient.mockReturnValue(serviceDb);
    const route = await importItemRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const response = await route.PATCH(new Request("http://localhost", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nutrition: {
          basis: { amount: 1, unit: "serving" },
          values: { energy_kcal: 130 },
        },
      }),
    }), { params: Promise.resolve({ product_id: product.id }) });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("NUTRITION_VERSION_CONFLICT");
  });

  it("keeps delete idempotent for an already deleted owned private product", async () => {
    const serviceDb = serviceClient({
      productState: {
        id: product.id,
        owner_user_id: "user-1",
        visibility: "private",
        source_type: "manual",
        deleted_at: "2026-07-16T00:00:00.000Z",
        current_nutrition_version_id: product.nutrition_version_id,
      },
    });
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: "user-1" }));
    createServiceRoleClient.mockReturnValue(serviceDb);
    const route = await importItemRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const response = await route.DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ product_id: product.id }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { deleted: true },
      error: null,
    });
    expect(serviceDb.rpc).not.toHaveBeenCalled();
  });
});
