import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow: vi.fn(),
  ensureUserBootstrapState: vi.fn(),
  formatBootstrapErrorMessage: vi.fn((_: unknown, fallback: string) => fallback),
}));

const validMealBody = {
  recipe_id: "550e8400-e29b-41d4-a716-446655440001",
  plan_date: "2026-07-15",
  column_id: "550e8400-e29b-41d4-a716-446655440002",
  planned_servings: 2,
};

async function postMeal(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/v1/meals/route");
  const response = await POST(new Request("http://localhost:3000/api/v1/meals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));

  return { response, body: await response.json() };
}

describe("recipe nutrition API boundaries", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    createServiceRoleClient.mockReturnValue(null);
    delete process.env.HOMECOOK_ENABLE_QA_FIXTURES;
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn(),
    });
  });

  it.each([
    "product_id",
    "product_nutrition_version_id",
    "quantity",
    "recipe_nutrition_snapshot_id",
    "nutrition_snapshot_origin",
  ])("rejects client-controlled %s instead of silently ignoring it", async (field) => {
    const result = await postMeal({
      ...validMealBody,
      [field]: "550e8400-e29b-41d4-a716-446655440099",
    });

    expect(result.response.status).toBe(422);
    expect(result.body).toEqual({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        message: "요청 값을 확인해 주세요.",
        fields: [{ field, reason: "unexpected" }],
      },
    });
  }, 15_000);

  it("keeps legacy unknown-field compatibility outside the explicit nutrition denylist", async () => {
    const result = await postMeal({
      ...validMealBody,
      planned_servings: 0,
      legacy_client_metadata: "ignored",
    });

    expect(result.response.status).toBe(422);
    expect(result.body.error.fields).toEqual([
      { field: "planned_servings", reason: "min_value" },
    ]);
  });

  it("returns a non-null unavailable nutrition object when a recipe has no snapshot", async () => {
    process.env.HOMECOOK_ENABLE_QA_FIXTURES = "1";
    const { MOCK_RECIPE_ID } = await import("@/lib/mock/recipes");
    const { GET } = await import("@/app/api/v1/recipes/[id]/route");
    const response = await GET(
      new Request(`http://localhost:3000/api/v1/recipes/${MOCK_RECIPE_ID}`),
      { params: Promise.resolve({ id: MOCK_RECIPE_ID }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.nutrition).toEqual({
      basis: { amount: 1, unit: "serving" },
      values: {
        energy_kcal: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
        carbohydrate_g: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
        protein_g: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
        fat_g: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
        sodium_mg: { amount: null, known_amount: null, status: "unavailable", display_mode: null },
      },
      calculation_status: "unavailable",
      calculation_quality: null,
      warnings: ["RECIPE_NUTRITION_SNAPSHOT_MISSING"],
      sources: [],
    });
  }, 15_000);
});
