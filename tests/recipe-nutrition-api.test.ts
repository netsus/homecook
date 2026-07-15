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

function queryResult<T>(data: T, error: unknown = null, count?: number) {
  let result = { data, error, count };
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    in: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    setResult(nextData: T, nextError: unknown = null, nextCount?: number) {
      result = { data: nextData, error: nextError, count: nextCount };
    },
    then(
      onFulfilled?: (value: typeof result) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
  return query;
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

  it("projects one current immutable snapshot without rebuilding live nutrition relations", async () => {
    const recipeQuery = queryResult({
      id: "recipe-1",
      title: "영양 레시피",
      description: null,
      thumbnail_url: null,
      base_servings: 2,
      tags: [],
      source_type: "system",
      view_count: 1,
      like_count: 0,
      save_count: 0,
      plan_count: 0,
      cook_count: 0,
    });
    const sourceQuery = queryResult(null);
    const ingredientsQuery = queryResult([]);
    const stepsQuery = queryResult([]);
    const mealsQuery = queryResult([], null, 0);
    const values = {
      energy_kcal: { amount: 100, known_amount: null, status: "complete", display_mode: "total" },
      carbohydrate_g: { amount: 20, known_amount: null, status: "complete", display_mode: "total" },
      protein_g: { amount: 10, known_amount: null, status: "complete", display_mode: "total" },
      fat_g: { amount: 5, known_amount: null, status: "complete", display_mode: "total" },
      sodium_mg: { amount: 50, known_amount: null, status: "complete", display_mode: "total" },
    };
    const snapshotRow = {
      id: "snapshot-1",
      base_servings: 2,
      scalable_values_json: {
        energy_kcal: 80,
        carbohydrate_g: 20,
        protein_g: 10,
        fat_g: 5,
        sodium_mg: 50,
      },
      fixed_values_json: {
        energy_kcal: 20,
        carbohydrate_g: 0,
        protein_g: 0,
        fat_g: 0,
        sodium_mg: 0,
      },
      nutrient_status_json: values,
      calculation_status: "complete",
      calculation_quality: "direct",
      reflected_ingredient_count: 1,
      target_ingredient_count: 1,
      warnings_json: [],
      sources_json: [{
        provider: "MFDS",
        dataset: "공식 fixture",
        source_version: "2026-07-01",
        data_basis_date: null,
        license: "test-only",
        source_url: "https://example.test/nutrition",
      }],
      calculated_at: "2026-07-16T00:00:00.000Z",
    };
    const snapshotQuery = queryResult<Record<string, unknown> | null>(snapshotRow);
    const from = vi.fn((table: string) => {
      if (table === "recipes") return recipeQuery;
      if (table === "recipe_sources") return sourceQuery;
      if (table === "recipe_ingredients") return ingredientsQuery;
      if (table === "recipe_steps") return stepsQuery;
      if (table === "meals") return mealsQuery;
      if (table === "recipe_nutrition_snapshots") return snapshotQuery;
      throw new Error(`unexpected table: ${table}`);
    });
    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    });
    createServiceRoleClient.mockReturnValue({
      from,
      rpc: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: { id: "recipe-1", view_count: 2 }, error: null })),
      })),
    });

    const { GET } = await import("@/app/api/v1/recipes/[id]/route");
    const response = await GET(
      new Request("http://localhost:3000/api/v1/recipes/recipe-1"),
      { params: Promise.resolve({ id: "recipe-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.nutrition).toEqual({
      basis: { amount: 2, unit: "serving" },
      base_servings: 2,
      values,
      scalable_values: {
        energy_kcal: 80,
        carbohydrate_g: 20,
        protein_g: 10,
        fat_g: 5,
        sodium_mg: 50,
      },
      fixed_values: {
        energy_kcal: 20,
        carbohydrate_g: 0,
        protein_g: 0,
        fat_g: 0,
        sodium_mg: 0,
      },
      calculation_status: "complete",
      calculation_quality: "direct",
      reflected_ingredient_count: 1,
      target_ingredient_count: 1,
      warnings: [],
      sources: expect.arrayContaining([expect.objectContaining({ provider: "MFDS" })]),
      snapshot_id: "snapshot-1",
      calculated_at: "2026-07-16T00:00:00.000Z",
    });
    expect(snapshotQuery.eq).toHaveBeenCalledWith("recipe_id", "recipe-1");
    expect(snapshotQuery.eq).toHaveBeenCalledWith("is_current", true);
    expect(from.mock.calls.map(([table]) => table)).not.toContain("nutrition_values");
    expect(from.mock.calls.map(([table]) => table)).not.toContain("ingredient_nutrition_profiles");

    snapshotQuery.setResult({
      ...snapshotRow,
      nutrient_status_json: {
        ...values,
        energy_kcal: {
          amount: null,
          known_amount: 80,
          status: "partial",
          display_mode: "minimum",
        },
      },
      calculation_status: "partial",
      calculation_quality: "mixed",
      reflected_ingredient_count: 1,
      target_ingredient_count: 2,
      warnings_json: ["MISSING_INGREDIENT_NUTRITION"],
    });

    const partialResponse = await GET(
      new Request("http://localhost:3000/api/v1/recipes/recipe-1"),
      { params: Promise.resolve({ id: "recipe-1" }) },
    );
    const partialBody = await partialResponse.json();
    expect(partialResponse.status).toBe(200);
    expect(partialBody.data.nutrition.calculation_status).toBe("partial");
    expect(partialBody.data.nutrition.values.energy_kcal).toEqual({
      amount: null,
      known_amount: 80,
      status: "partial",
      display_mode: "minimum",
    });

    snapshotQuery.setResult(null, { code: "SNAPSHOT_READ_FAILED" });
    const readErrorResponse = await GET(
      new Request("http://localhost:3000/api/v1/recipes/recipe-1"),
      { params: Promise.resolve({ id: "recipe-1" }) },
    );
    const readErrorBody = await readErrorResponse.json();
    expect(readErrorResponse.status).toBe(200);
    expect(readErrorBody.data.nutrition.calculation_status).toBe("unavailable");
    expect(readErrorBody.data.nutrition.warnings).toEqual([
      "RECIPE_NUTRITION_SNAPSHOT_MISSING",
    ]);
  });
});
