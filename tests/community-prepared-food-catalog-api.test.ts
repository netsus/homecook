import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
}));

const USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_USER_ID = "550e8400-e29b-41d4-a716-446655440009";
const PRODUCT_ID = "550e8400-e29b-41d4-a716-446655440001";
const VERSION_ID = "550e8400-e29b-41d4-a716-446655440002";
const COLUMN_ID = "550e8400-e29b-41d4-a716-446655440003";

const sharedManualProduct = {
  id: PRODUCT_ID,
  name: "공동 요거트",
  brand: "브랜드",
  visibility: "public",
  source_type: "manual",
  editable: true,
  nutrition_version_id: VERSION_ID,
  basis_relations: [],
  nutrition: {
    basis: { amount: 150, unit: "g" },
    label_basis_text: "1회(150g)",
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

function createStateQuery(state: Record<string, unknown> | null) {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: state, error: null })),
  };
  return query;
}

function serviceClient(options: {
  rpcResults?: Record<string, { data: unknown; error: { message: string; code?: string } | null }>;
  productState?: Record<string, unknown> | null;
  columnState?: Record<string, unknown> | null;
} = {}) {
  return {
    rpc: vi.fn(async (name: string) => options.rpcResults?.[name] ?? { data: null, error: null }),
    from: vi.fn((table: string) => ({
      select: vi.fn(() => {
        if (table === "food_products") return createStateQuery(options.productState ?? null);
        if (table === "meal_plan_columns") return createStateQuery(options.columnState ?? null);
        return createStateQuery(null);
      }),
    })),
  };
}

async function importCollectionRoute() {
  return import("@/app/api/v1/food-products/route").catch(() => null);
}

async function importItemRoute() {
  return import("@/app/api/v1/food-products/[product_id]/route").catch(() => null);
}

async function importReportRoute() {
  return import("@/app/api/v1/food-products/[product_id]/report/route").catch(() => null);
}

async function importPlannerRoute() {
  return import("@/app/api/v1/product-planner-entries/route").catch(() => null);
}

beforeEach(() => {
  vi.resetModules();
  createRouteHandlerClient.mockReset();
  createServiceRoleClient.mockReset();
  ensurePublicUserRow.mockReset().mockResolvedValue({});
  ensureUserBootstrapState.mockReset().mockResolvedValue({});
});

describe("community prepared food catalog API contract", () => {
  it("forwards the exact source filter to the catalog RPC", async () => {
    const db = serviceClient({
      rpcResults: {
        list_food_products: {
          data: { items: [sharedManualProduct], next_cursor: null, has_next: false },
          error: null,
        },
      },
    });
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: USER_ID }));
    createServiceRoleClient.mockReturnValue(db);
    const route = await importCollectionRoute();
    expect(route, "food-products collection route must exist").not.toBeNull();
    if (!route) return;

    const response = await route.GET(new Request("http://localhost/api/v1/food-products?source=manual"));
    expect(response.status).toBe(200);
    expect(db.rpc).toHaveBeenCalledWith("list_food_products", expect.objectContaining({
      p_user_id: USER_ID,
      p_source: "manual",
    }));
  });

  it("creates a shared public/manual product with label_basis_text", async () => {
    const db = serviceClient({
      rpcResults: {
        create_manual_food_product: {
          data: sharedManualProduct,
          error: null,
        },
      },
    });
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: USER_ID }));
    createServiceRoleClient.mockReturnValue(db);
    const route = await importCollectionRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const response = await route.POST(new Request("http://localhost/api/v1/food-products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "공동 요거트",
        brand: "브랜드",
        nutrition: {
          basis: { amount: 150, unit: "g" },
          label_basis_text: "1회(150g)",
          values: { energy_kcal: 120, sodium_mg: null },
        },
      }),
    }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      success: true,
      data: { product: sharedManualProduct },
      error: null,
    });
    expect(db.rpc).toHaveBeenCalledWith("create_manual_food_product", expect.objectContaining({
      p_user_id: USER_ID,
      p_nutrition: {
        basis: { amount: 150, unit: "g" },
        label_basis_text: "1회(150g)",
        values: { energy_kcal: 120, sodium_mg: null },
      },
    }));
  });

  it("returns 422 UNSUPPORTED_FIELD for authority injection attempts", async () => {
    const db = serviceClient();
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: USER_ID }));
    createServiceRoleClient.mockReturnValue(db);
    const route = await importCollectionRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const response = await route.POST(new Request("http://localhost/api/v1/food-products", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "금지 제품",
        visibility: "public",
        nutrition: {
          basis: { amount: 150, unit: "g" },
          values: { energy_kcal: 120 },
        },
      }),
    }));

    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("UNSUPPORTED_FIELD");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("allows visible owner shared manual updates and locks hidden shared manual updates", async () => {
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: USER_ID }));
    const visibleDb = serviceClient({
      productState: {
        id: PRODUCT_ID,
        owner_user_id: USER_ID,
        visibility: "public",
        source_type: "manual",
        moderation_status: "visible",
        deleted_at: null,
        current_nutrition_version_id: VERSION_ID,
      },
      rpcResults: {
        update_manual_food_product: { data: sharedManualProduct, error: null },
      },
    });
    createServiceRoleClient.mockReturnValue(visibleDb);
    const route = await importItemRoute();
    expect(route, "food-products item route must exist").not.toBeNull();
    if (!route) return;

    const visibleResponse = await route.PATCH(new Request("http://localhost", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brand: "새 브랜드" }),
    }), { params: Promise.resolve({ product_id: PRODUCT_ID }) });
    expect(visibleResponse.status).toBe(200);

    const hiddenDb = serviceClient({
      productState: {
        id: PRODUCT_ID,
        owner_user_id: USER_ID,
        visibility: "public",
        source_type: "manual",
        moderation_status: "hidden_by_report",
        deleted_at: null,
        current_nutrition_version_id: VERSION_ID,
      },
    });
    createServiceRoleClient.mockReturnValue(hiddenDb);
    const hiddenResponse = await route.PATCH(new Request("http://localhost", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brand: "잠금 브랜드" }),
    }), { params: Promise.resolve({ product_id: PRODUCT_ID }) });
    expect(hiddenResponse.status).toBe(409);
    expect((await hiddenResponse.json()).error.code).toBe("PRODUCT_MODERATION_LOCKED");
    expect(hiddenDb.rpc).not.toHaveBeenCalled();
  });

  it("exposes the shared manual report route", async () => {
    const route = await importReportRoute();
    expect(route, "food-products report route must exist").not.toBeNull();
    if (!route) return;
    expect(typeof route.POST).toBe("function");
  });

  it("creates one append-only report and maps a duplicate to the official conflict", async () => {
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: USER_ID }));
    const acceptedDb = serviceClient({
      rpcResults: {
        report_food_product: { data: { reported: true }, error: null },
      },
    });
    createServiceRoleClient.mockReturnValue(acceptedDb);
    const route = await importReportRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const accepted = await route.POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason_code: "incorrect_nutrition", detail_text: "열량 확인" }),
    }), { params: Promise.resolve({ product_id: PRODUCT_ID }) });
    expect(accepted.status).toBe(201);
    expect(ensurePublicUserRow).toHaveBeenCalledWith(expect.anything(), { id: USER_ID });
    expect(acceptedDb.rpc).toHaveBeenCalledWith("report_food_product", {
      p_user_id: USER_ID,
      p_product_id: PRODUCT_ID,
      p_reason_code: "incorrect_nutrition",
      p_detail_text: "열량 확인",
    });

    const duplicateDb = serviceClient({
      rpcResults: {
        report_food_product: {
          data: null,
          error: { message: "PRODUCT_ALREADY_REPORTED" },
        },
      },
    });
    createServiceRoleClient.mockReturnValue(duplicateDb);
    const duplicate = await route.POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason_code: "spam" }),
    }), { params: Promise.resolve({ product_id: PRODUCT_ID }) });
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).error.code).toBe("PRODUCT_ALREADY_REPORTED");
  });

  it("does not call the report RPC when the authenticated user bootstrap fails", async () => {
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: USER_ID }));
    const db = serviceClient();
    createServiceRoleClient.mockReturnValue(db);
    ensurePublicUserRow.mockRejectedValueOnce(new Error("bootstrap failed"));
    const route = await importReportRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const response = await route.POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason_code: "spam" }),
    }), { params: Promise.resolve({ product_id: PRODUCT_ID }) });

    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("INTERNAL_ERROR");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("locks hidden owner deletes before the mutation RPC", async () => {
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: USER_ID }));
    const hiddenDb = serviceClient({
      productState: {
        id: PRODUCT_ID,
        owner_user_id: USER_ID,
        visibility: "public",
        source_type: "manual",
        moderation_status: "hidden_by_report",
        deleted_at: null,
        current_nutrition_version_id: VERSION_ID,
      },
    });
    createServiceRoleClient.mockReturnValue(hiddenDb);
    const route = await importItemRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const response = await route.DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ product_id: PRODUCT_ID }),
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("PRODUCT_MODERATION_LOCKED");
    expect(hiddenDb.rpc).not.toHaveBeenCalled();
  });

  it("does not let a different user treat another owner's deleted public product as an idempotent delete", async () => {
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: USER_ID }));
    const deletedDb = serviceClient({
      productState: {
        id: PRODUCT_ID,
        owner_user_id: OTHER_USER_ID,
        visibility: "public",
        source_type: "manual",
        moderation_status: "visible",
        deleted_at: "2026-07-18T00:00:00.000Z",
        current_nutrition_version_id: VERSION_ID,
      },
    });
    createServiceRoleClient.mockReturnValue(deletedDb);
    const route = await importItemRoute();
    expect(route).not.toBeNull();
    if (!route) return;

    const response = await route.DELETE(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ product_id: PRODUCT_ID }),
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN");
    expect(deletedDb.rpc).not.toHaveBeenCalled();
  });

  it("blocks hidden products from new planner entry creation", async () => {
    const db = serviceClient({
      columnState: { id: COLUMN_ID, user_id: USER_ID },
      productState: {
        id: PRODUCT_ID,
        owner_user_id: OTHER_USER_ID,
        visibility: "public",
        moderation_status: "hidden_by_operator",
        deleted_at: null,
        current_nutrition_version_id: VERSION_ID,
      },
    });
    createRouteHandlerClient.mockResolvedValue(routeClient({ id: USER_ID }));
    createServiceRoleClient.mockReturnValue(db);
    const route = await importPlannerRoute();
    expect(route, "product-planner-entries collection route must exist").not.toBeNull();
    if (!route) return;

    const response = await route.POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        product_id: PRODUCT_ID,
        plan_date: "2026-07-18",
        column_id: COLUMN_ID,
        quantity: { amount: 100, unit: "g" },
      }),
    }));

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("PRODUCT_HIDDEN");
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
