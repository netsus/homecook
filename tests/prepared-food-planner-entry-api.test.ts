import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient, createServiceRoleClient }));
vi.mock("@/lib/server/user-bootstrap", () => ({ ensurePublicUserRow, ensureUserBootstrapState }));

const USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_USER_ID = "550e8400-e29b-41d4-a716-446655440009";
const PRODUCT_ID = "550e8400-e29b-41d4-a716-446655440001";
const VERSION_ID = "550e8400-e29b-41d4-a716-446655440002";
const COLUMN_ID = "550e8400-e29b-41d4-a716-446655440003";
const ENTRY_ID = "550e8400-e29b-41d4-a716-446655440004";

const entry = {
  entry_type: "product",
  id: ENTRY_ID,
  product_id: PRODUCT_ID,
  product_name: "플레인 요거트",
  product_brand: "브랜드",
  plan_date: "2026-07-16",
  column_id: COLUMN_ID,
  quantity: { amount: 1, unit: "serving" },
  workflow_status: null,
  product_nutrition_version_id: VERSION_ID,
  basis_relations: [],
  nutrition: {
    basis: { amount: 1, unit: "serving" },
    values: {
      energy_kcal: { amount: 105, known_amount: null, status: "complete", display_mode: "total" },
    },
    calculation_status: "complete",
    calculation_quality: "direct",
    warnings: [],
    sources: [],
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
  columnState?: Record<string, unknown> | null;
  productState?: Record<string, unknown> | null;
  entryState?: Record<string, unknown> | null;
  rpcResults?: Record<string, { data: unknown; error: { code?: string; message: string } | null }>;
} = {}) {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => {
        const query = {
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => {
            if (table === "meal_plan_columns") {
              return { data: options.columnState ?? null, error: null };
            }
            if (table === "food_products") {
              return { data: options.productState ?? null, error: null };
            }
            return { data: options.entryState ?? null, error: null };
          }),
        };
        return query;
      }),
    })),
    rpc: vi.fn(async (name: string) => options.rpcResults?.[name] ?? { data: null, error: null }),
  };
}

function activeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_ID,
    owner_user_id: USER_ID,
    visibility: "private",
    deleted_at: null,
    current_nutrition_version_id: VERSION_ID,
    ...overrides,
  };
}

function ownedColumn(overrides: Record<string, unknown> = {}) {
  return { id: COLUMN_ID, user_id: USER_ID, ...overrides };
}

function ownedEntry(overrides: Record<string, unknown> = {}) {
  return { id: ENTRY_ID, user_id: USER_ID, ...overrides };
}

async function importCollectionRoute() {
  return import("@/app/api/v1/product-planner-entries/route").catch(() => null);
}

async function importItemRoute() {
  return import("@/app/api/v1/product-planner-entries/[entry_id]/route").catch(() => null);
}

beforeEach(() => {
  vi.resetModules();
  createRouteHandlerClient.mockReset();
  createServiceRoleClient.mockReset();
  ensurePublicUserRow.mockReset().mockResolvedValue({});
  ensureUserBootstrapState.mockReset().mockResolvedValue({});
});

describe("prepared food planner entry API contract", () => {
  it("authenticates before parsing an invalid create body", async () => {
    createRouteHandlerClient.mockResolvedValue(routeClient(null));
    createServiceRoleClient.mockReturnValue(null);
    const route = await importCollectionRoute();
    expect(route, "product-planner-entries collection route must exist").not.toBeNull();
    if (!route) return;

    const response = await route.POST(new Request("http://localhost/api/v1/product-planner-entries", {
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

  it("rejects unexpected create fields before any database lookup", async () => {
    const db = serviceClient();
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: USER_ID }));
    createServiceRoleClient.mockReturnValue(db);
    const route = await importCollectionRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const response = await route.POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        product_id: PRODUCT_ID,
        plan_date: "2026-07-16",
        column_id: COLUMN_ID,
        quantity: { amount: 1, unit: "serving" },
        status: "registered",
      }),
    }));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: "VALIDATION_ERROR", fields: [{ field: "status", reason: "unexpected" }] },
    });
    expect(db.from).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["owned private", activeProduct()],
    ["public", activeProduct({ owner_user_id: null, visibility: "public" })],
  ])("creates an entry from an active %s product through the atomic RPC", async (_label, productState) => {
    const db = serviceClient({
      columnState: ownedColumn(),
      productState,
      rpcResults: { create_product_planner_entry: { data: entry, error: null } },
    });
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: USER_ID }));
    createServiceRoleClient.mockReturnValue(db);
    const route = await importCollectionRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const response = await route.POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        product_id: PRODUCT_ID,
        plan_date: "2026-07-16",
        column_id: COLUMN_ID,
        quantity: { amount: 1, unit: "serving" },
      }),
    }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ success: true, data: { entry }, error: null });
    expect(db.rpc).toHaveBeenCalledWith("create_product_planner_entry", {
      p_user_id: USER_ID,
      p_product_id: PRODUCT_ID,
      p_plan_date: "2026-07-16",
      p_column_id: COLUMN_ID,
      p_quantity_amount: 1,
      p_quantity_unit: "serving",
      p_expected_current_version_id: VERSION_ID,
    });
  });

  it("rejects another user's column or private product before create", async () => {
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: USER_ID }));
    const otherColumnDb = serviceClient({
      columnState: ownedColumn({ user_id: OTHER_USER_ID }),
      productState: activeProduct(),
    });
    createServiceRoleClient.mockReturnValue(otherColumnDb);
    const route = await importCollectionRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const request = () => new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        product_id: PRODUCT_ID,
        plan_date: "2026-07-16",
        column_id: COLUMN_ID,
        quantity: { amount: 1, unit: "serving" },
      }),
    });
    expect((await route.POST(request())).status).toBe(403);
    expect(otherColumnDb.rpc).not.toHaveBeenCalled();

    const otherProductDb = serviceClient({
      columnState: ownedColumn(),
      productState: activeProduct({ owner_user_id: OTHER_USER_ID }),
    });
    createServiceRoleClient.mockReturnValue(otherProductDb);
    const response = await route.POST(request());
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN");
    expect(otherProductDb.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["deleted product", activeProduct({ deleted_at: "2026-07-16T00:00:00Z" }), 409, "PRODUCT_DELETED"],
    ["missing current version", activeProduct({ current_nutrition_version_id: null }), 409, "NUTRITION_VERSION_CONFLICT"],
  ])("fails closed for %s", async (_label, productState, status, code) => {
    const db = serviceClient({ columnState: ownedColumn(), productState });
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: USER_ID }));
    createServiceRoleClient.mockReturnValue(db);
    const route = await importCollectionRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const response = await route.POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        product_id: PRODUCT_ID,
        plan_date: "2026-07-16",
        column_id: COLUMN_ID,
        quantity: { amount: 1, unit: "serving" },
      }),
    }));
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("fails closed for hidden public products before calling the atomic RPC", async () => {
    const db = serviceClient({
      columnState: ownedColumn(),
      productState: activeProduct({
        owner_user_id: OTHER_USER_ID,
        visibility: "public",
        moderation_status: "hidden_by_report",
      }),
    });
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: USER_ID }));
    createServiceRoleClient.mockReturnValue(db);
    const route = await importCollectionRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const response = await route.POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        product_id: PRODUCT_ID,
        plan_date: "2026-07-16",
        column_id: COLUMN_ID,
        quantity: { amount: 100, unit: "g" },
      }),
    }));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("PRODUCT_HIDDEN");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["NUTRITION_VERSION_CONFLICT", 409],
    ["PRODUCT_DELETED", 409],
    ["NUTRITION_BASIS_MISMATCH", 422],
  ])("maps atomic create failure %s", async (code, status) => {
    const db = serviceClient({
      columnState: ownedColumn(),
      productState: activeProduct(),
      rpcResults: {
        create_product_planner_entry: { data: null, error: { message: code } },
      },
    });
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: USER_ID }));
    createServiceRoleClient.mockReturnValue(db);
    const route = await importCollectionRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const response = await route.POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        product_id: PRODUCT_ID,
        plan_date: "2026-07-16",
        column_id: COLUMN_ID,
        quantity: { amount: 1, unit: "serving" },
      }),
    }));
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
  });

  it("maps the numeric(12,4) round-to-zero database check to 422 VALIDATION_ERROR", async () => {
    const db = serviceClient({
      columnState: ownedColumn(),
      productState: activeProduct(),
      rpcResults: {
        create_product_planner_entry: {
          data: null,
          error: { code: "23514", message: "quantity_amount check constraint" },
        },
      },
    });
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: USER_ID }));
    createServiceRoleClient.mockReturnValue(db);
    const route = await importCollectionRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const response = await route.POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        product_id: PRODUCT_ID,
        plan_date: "2026-07-16",
        column_id: COLUMN_ID,
        quantity: { amount: 0.0001, unit: "g" },
      }),
    }));
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("exposes exactly PATCH and DELETE on the item route", async () => {
    const route = await importItemRoute();
    expect(route, "product-planner-entry item route must exist").not.toBeNull();
    if (!route) return;
    expect(typeof route.PATCH).toBe("function");
    expect(typeof route.DELETE).toBe("function");
    expect("GET" in route).toBe(false);
    expect("POST" in route).toBe(false);
  });

  it.each(["PATCH", "DELETE"])("returns 422 VALIDATION_ERROR for an invalid %s entry UUID", async (method) => {
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: USER_ID }));
    createServiceRoleClient.mockReturnValue(serviceClient());
    const route = await importItemRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const context = { params: Promise.resolve({ entry_id: "not-a-uuid" }) };
    const response = method === "PATCH"
      ? await route.PATCH(new Request("http://localhost", {
        method,
        body: JSON.stringify({ quantity: { amount: 1, unit: "serving" } }),
      }), context)
      : await route.DELETE(new Request("http://localhost", { method }), context);

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "entry_id", reason: "invalid_uuid" }],
      },
    });
  });

  it("keeps PATCH quantity-only and preserves the pinned entry after product changes", async () => {
    const updatedEntry = { ...entry, quantity: { amount: 0.5, unit: "serving" } };
    const db = serviceClient({
      entryState: ownedEntry(),
      rpcResults: { update_product_planner_entry_quantity: { data: updatedEntry, error: null } },
    });
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: USER_ID }));
    createServiceRoleClient.mockReturnValue(db);
    const route = await importItemRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const invalidResponse = await route.PATCH(new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({
        quantity: { amount: 0.5, unit: "serving" },
        product_nutrition_version_id: "550e8400-e29b-41d4-a716-446655440099",
      }),
    }), { params: Promise.resolve({ entry_id: ENTRY_ID }) });
    expect(invalidResponse.status).toBe(422);
    expect(db.rpc).not.toHaveBeenCalled();

    const response = await route.PATCH(new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ quantity: { amount: 0.5, unit: "serving" } }),
    }), { params: Promise.resolve({ entry_id: ENTRY_ID }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { entry: updatedEntry }, error: null });
    expect(db.from).toHaveBeenCalledWith("product_planner_entries");
    expect(db.from).not.toHaveBeenCalledWith("food_products");
    expect(db.rpc).toHaveBeenCalledWith("update_product_planner_entry_quantity", {
      p_user_id: USER_ID,
      p_entry_id: ENTRY_ID,
      p_quantity_amount: 0.5,
      p_quantity_unit: "serving",
    });
  });

  it("denies a cross-owner PATCH and maps pinned basis mismatch", async () => {
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: USER_ID }));
    const otherDb = serviceClient({ entryState: ownedEntry({ user_id: OTHER_USER_ID }) });
    createServiceRoleClient.mockReturnValue(otherDb);
    const route = await importItemRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const request = () => new Request("http://localhost", {
      method: "PATCH",
      body: JSON.stringify({ quantity: { amount: 100, unit: "g" } }),
    });
    expect((await route.PATCH(request(), { params: Promise.resolve({ entry_id: ENTRY_ID }) })).status).toBe(403);

    const mismatchDb = serviceClient({
      entryState: ownedEntry(),
      rpcResults: {
        update_product_planner_entry_quantity: {
          data: null,
          error: { message: "NUTRITION_BASIS_MISMATCH" },
        },
      },
    });
    createServiceRoleClient.mockReturnValue(mismatchDb);
    const response = await route.PATCH(request(), { params: Promise.resolve({ entry_id: ENTRY_ID }) });
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("NUTRITION_BASIS_MISMATCH");
  });

  it("deletes once with the exact payload and returns 404 on replay", async () => {
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: USER_ID }));
    const db = serviceClient({
      entryState: ownedEntry(),
      rpcResults: { delete_product_planner_entry: { data: { deleted: true }, error: null } },
    });
    createServiceRoleClient.mockReturnValue(db);
    const route = await importItemRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const first = await route.DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ entry_id: ENTRY_ID }),
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      success: true,
      data: { deleted: true, entry_id: ENTRY_ID },
      error: null,
    });

    const replayDb = serviceClient({ entryState: null });
    createServiceRoleClient.mockReturnValue(replayDb);
    const replay = await route.DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ entry_id: ENTRY_ID }),
    });
    expect(replay.status).toBe(404);
    expect((await replay.json()).error.code).toBe("RESOURCE_NOT_FOUND");
    expect(replayDb.rpc).not.toHaveBeenCalled();
  });
});
