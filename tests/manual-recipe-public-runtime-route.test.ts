import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  route: vi.fn(), rpc: vi.fn(), prepare: vi.fn(), publish: vi.fn(), recalculate: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient: mocks.route,
  createRecipeFuturePropagationInternalClient: () => ({ rpc: mocks.rpc }),
  createRecipeImageInternalClient: () => ({ storage: {} }),
}));
vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow: vi.fn(), ensureUserBootstrapState: vi.fn(),
  formatBootstrapErrorMessage: (_error: unknown, fallback: string) => fallback,
}));
vi.mock("@/app/api/v1/users/me/_account-generation", () => ({
  readAccountGenerationCapability: async () => ({ ok: true, state: "generation_active", revision: 1 }),
}));
vi.mock("@/lib/server/account-generation/session-authority", () => ({
  readVerifiedAccountGenerationSession: async () => ({ ok: true, sessionAuthority: {
    ownerUuid: "550e8400-e29b-41d4-a716-446655440001", authIdentityCreatedAt: "2026-09-01T00:00:00Z",
    sessionIssuedAt: "2026-09-27T00:00:00Z", sessionKeyHash: "a".repeat(64), hmacKeyVersion: 1,
  } }),
}));
vi.mock("@/lib/server/recipe-nutrition-service", () => ({
  prepareRecipeNutritionSnapshot: mocks.prepare, recalculateRecipeNutritionSnapshot: mocks.recalculate,
}));
vi.mock("@/lib/server/recipe-nutrition-snapshot", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/server/recipe-nutrition-snapshot")>(),
  createRecipeNutritionSnapshotPayload: (calculation: unknown) => calculation,
}));
vi.mock("@/lib/server/manual-recipe-publication", () => ({ publishManualRecipe: mocks.publish }));
vi.mock("@/lib/server/user-growth-activity", () => ({ recordUserGrowthActivityEvent: vi.fn() }));

const owner = "550e8400-e29b-41d4-a716-446655440001";
const key = "550e8400-e29b-41d4-a716-446655440002";
const recipeId = "550e8400-e29b-41d4-a716-446655440003";
const ingredientId = "550e8400-e29b-41d4-a716-446655440004";
const methodId = "550e8400-e29b-41d4-a716-446655440005";
const row = { id: recipeId, title: "직접 만든 요리", source_type: "manual", created_by: owner, base_servings: 2, visibility: "private" };
const body = { title: row.title, base_servings: 2,
  ingredients: [{ ingredient_id: ingredientId, standard_name: "감자", amount: 100, unit: "g", ingredient_type: "QUANT", display_text: "감자 100g", scalable: true, sort_order: 1 }],
  steps: [{ step_number: 1, instruction: "끓여요", cooking_method_id: methodId, ingredients_used: [] }],
};
const headers = { "content-type": "application/json", "Idempotency-Key": key, "X-Homecook-Draft-Owner": owner };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.route.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: owner } } }) },
    from: (table: string) => ({ select: () => ({ in: async () => ({
      data: table === "ingredients" ? [{ id: ingredientId }] : [{ id: methodId, label: "끓이기" }], error: null,
    }) }) }),
  });
  mocks.rpc.mockResolvedValue({ data: row, error: null });
  mocks.prepare.mockResolvedValue({ calculation: { calculation_status: "unavailable" }, expectedRecipeVersion: "2026-09-27T00:00:00Z", inputGuard: {} });
  mocks.publish.mockResolvedValue({ ...row, visibility: "public" });
});

describe("manual publication readiness", () => {
  it.each([false, true])("rejects an unsupported new ingredient unit before writing, product=%s", async (product) => {
    const ingredient = { ...body.ingredients[0], unit: "임의단위", ...(product ? {
      food_product_id: "550e8400-e29b-41d4-a716-446655440006",
      food_product_nutrition_version_id: "550e8400-e29b-41d4-a716-446655440007",
    } : {}) };
    const { POST } = await import("@/app/api/v1/recipes/route");
    const response = await POST(new Request("http://localhost/api/v1/recipes", { method: "POST", headers, body: JSON.stringify({ ...body, ingredients: [ingredient] }) }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR", fields: [{ field: "ingredients[0].unit", reason: "unsupported_unit" }] } });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it.each(["g", "ml", "개", "큰술"])("accepts the supported new ingredient unit %s", async (unit) => {
    const { POST } = await import("@/app/api/v1/recipes/route");
    const response = await POST(new Request("http://localhost/api/v1/recipes", { method: "POST", headers, body: JSON.stringify({ ...body, ingredients: [{ ...body.ingredients[0], unit }] }) }));
    expect(response.status).toBe(201);
  });

  it("returns creation success only after nutrition preparation and atomic public publication", async () => {
    const { POST } = await import("@/app/api/v1/recipes/route");
    const response = await POST(new Request("http://localhost/api/v1/recipes", { method: "POST", headers, body: JSON.stringify(body) }));
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith("create_manual_recipe_recoverable", expect.objectContaining({ p_idempotency_key: key }));
    expect(mocks.publish).toHaveBeenCalledWith(expect.objectContaining({ recipeId, idempotencyKey: key, nutritionSnapshot: { calculation_status: "unavailable" } }));
    expect(mocks.prepare.mock.invocationCallOrder[0]).toBeLessThan(mocks.publish.mock.invocationCallOrder[0]);
    expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({ auth: expect.any(Object) }), recipeId, expect.objectContaining({ rpc: mocks.rpc }));
    expect(mocks.recalculate).not.toHaveBeenCalled();
  });

  it("does not mistake an infrastructure failure for unavailable nutrition or successful publication", async () => {
    mocks.prepare.mockRejectedValueOnce(new Error("read failed"));
    const { POST } = await import("@/app/api/v1/recipes/route");
    const response = await POST(new Request("http://localhost/api/v1/recipes", { method: "POST", headers, body: JSON.stringify(body) }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ success: false, error: { code: "RECIPE_PREPARATION_PENDING" } });
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it.each(["private", "public-not-ready", "public-ready"])("keeps result lookup read-only for %s", async (state) => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "read_manual_recipe_create_result"
      ? { recipe: { ...row, visibility: state === "private" ? "private" : "public" } }
      : { runtime_ready: state === "public-ready" }, error: null }));
    const { GET } = await import("@/app/api/v1/recipes/route");
    const response = await GET(new NextRequest(`http://localhost/api/v1/recipes?manual_create_key=${key}`, { headers }));
    expect(response.status).toBe(state === "public-ready" ? 200 : 503);
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
