import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createRecipeFuturePropagationInternalClient = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();
const recalculateRecipeNutritionSnapshot = vi.fn();
const readAccountGenerationCapability = vi.fn();
const readVerifiedAccountGenerationSession = vi.fn();
const recordUserGrowthActivityEvent = vi.fn();
const calculateRecipeDraftNutrition = vi.fn();
const callFuturePropagationRpc = vi.fn();
const formatBootstrapErrorMessage = vi.fn((error: unknown, fallbackMessage: string) => {
  if (error instanceof Error) {
    return `formatted: ${error.message}`;
  }

  return fallbackMessage;
});

vi.mock("@/lib/supabase/server", () => ({
  createRecipeFuturePropagationInternalClient,
  createRouteHandlerClient,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
}));

vi.mock("@/lib/server/recipe-nutrition-service", () => ({
  recalculateRecipeNutritionSnapshot,
}));

vi.mock("@/app/api/v1/users/me/_account-generation", () => ({
  readAccountGenerationCapability,
}));

vi.mock("@/lib/server/account-generation/session-authority", () => ({
  readVerifiedAccountGenerationSession,
}));

vi.mock("@/lib/server/admin-events", () => ({
  recordOperationalEventFromServiceRole: vi.fn(),
}));

vi.mock("@/lib/server/user-growth-activity", () => ({
  recordUserGrowthActivityEvent,
}));

vi.mock(
  "@/lib/server/recipe-content-snapshot-future-propagation",
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import("@/lib/server/recipe-content-snapshot-future-propagation")
    >();

    return {
      ...actual,
      calculateRecipeDraftNutrition,
      callFuturePropagationRpc,
    };
  },
);

interface QueryResult<T> {
  data: T;
  error: { message: string } | null;
}

function createAwaitableQuery<T>(result: QueryResult<T>) {
  return {
    then(onFulfilled?: (value: QueryResult<T>) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
}

function createLookupTable(rows: Array<{ id: string; label?: string }>) {
  const query = {
    in: vi.fn(() => query),
    then: createAwaitableQuery({
      data: rows,
      error: null,
    }).then,
  };

  return {
    select: vi.fn(() => query),
  };
}

function buildValidBody() {
  return {
    title: "개인 수정용 수동 레시피",
    base_servings: 2,
    ingredients: [
      {
        ingredient_id: "550e8400-e29b-41d4-a716-446655440201",
        standard_name: "양파",
        amount: 1,
        unit: "개",
        ingredient_type: "QUANT",
        display_text: "양파 1개",
        scalable: true,
        sort_order: 0,
      },
    ],
    steps: [
      {
        step_number: 1,
        instruction: "볶아주세요.",
        cooking_method_id: "550e8400-e29b-41d4-a716-446655440301",
        ingredients_used: [],
        heat_level: "medium",
        duration_seconds: 60,
        duration_text: "1분",
      },
    ],
  };
}

function buildDerivedBody() {
  return {
    origin_recipe_id: "550e8400-e29b-41d4-a716-446655440999",
    base_recipe_revision: 12,
    draft: {
      title: "공개 레시피 개인 저장본",
      description: "내 입맛대로 수정",
      base_servings: 2,
      ingredients: [
        {
          ingredient_id: "550e8400-e29b-41d4-a716-446655440201",
          amount: 1,
          unit: "개",
          ingredient_type: "QUANT",
          display_text: "양파 1개",
          component_label: null,
          scalable: true,
          food_product_id: null,
          food_product_nutrition_version_id: null,
        },
      ],
      steps: [
        {
          step_number: 1,
          instruction: "볶아주세요.",
          cooking_method_id: "550e8400-e29b-41d4-a716-446655440301",
          cooking_method_ids: ["550e8400-e29b-41d4-a716-446655440301"],
          ingredients_used: [],
          component_label: null,
          heat_level: "medium",
          duration_seconds: 60,
          duration_text: "1분",
        },
      ],
    },
    image_object_id: "550e8400-e29b-41d4-a716-446655440998",
  };
}

async function importRecipesRoute() {
  return import("@/app/api/v1/recipes/route");
}

describe("personal recipe editor endpoint contract boundaries", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createRecipeFuturePropagationInternalClient.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    recalculateRecipeNutritionSnapshot.mockReset();
    readAccountGenerationCapability.mockReset();
    readVerifiedAccountGenerationSession.mockReset();
    recordUserGrowthActivityEvent.mockReset();
    calculateRecipeDraftNutrition.mockReset();
    callFuturePropagationRpc.mockReset();
    formatBootstrapErrorMessage.mockClear();

    ensurePublicUserRow.mockResolvedValue({});
    ensureUserBootstrapState.mockResolvedValue(undefined);
    recalculateRecipeNutritionSnapshot.mockResolvedValue({
      snapshot_id: "snapshot-1",
      created: true,
      is_current: true,
    });
    readAccountGenerationCapability.mockResolvedValue({
      ok: true,
      revision: 3,
      state: "legacy",
    });
    readVerifiedAccountGenerationSession.mockResolvedValue({
      ok: true,
      sessionAuthority: {
        authIdentityCreatedAt: "2026-07-30T00:00:00.000Z",
        hmacKeyVersion: 1,
        ownerUuid: "user-1",
        sessionIssuedAt: "2026-07-30T00:00:00.000Z",
        sessionKeyHash: "a".repeat(64),
      },
    });
    recordUserGrowthActivityEvent.mockResolvedValue({
      recorded: true,
      duplicate: false,
      error: null,
    });
    calculateRecipeDraftNutrition.mockResolvedValue({
      nutritionSnapshot: { calculation_version: "v1" },
      predecessorGuard: { recipe_ingredients: [] },
    });
    callFuturePropagationRpc.mockResolvedValue({
      ok: true,
      data: {
        id: "550e8400-e29b-41d4-a716-446655440997",
        revision: 7,
      },
    });
  });

  it("keeps legacy manual POST on the official manual payload only", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        id: "recipe-private-1",
        title: "개인 수정용 수동 레시피",
        source_type: "manual",
        created_by: "user-1",
        base_servings: 2,
        visibility: "private",
      },
      error: null,
    }));

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      rpc,
      from: vi.fn((table: string) => {
        if (table === "ingredients") {
          return createLookupTable([
            { id: "550e8400-e29b-41d4-a716-446655440201" },
          ]);
        }
        if (table === "cooking_methods") {
          return createLookupTable([
            { id: "550e8400-e29b-41d4-a716-446655440301", label: "볶기" },
          ]);
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importRecipesRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildValidBody()),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      success: true,
      data: {
        id: "recipe-private-1",
        title: "개인 수정용 수동 레시피",
        source_type: "manual",
        created_by: "user-1",
        base_servings: 2,
      },
      error: null,
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "create_manual_recipe",
      expect.objectContaining({
        p_user_id: "user-1",
        p_title: "개인 수정용 수동 레시피",
        p_base_servings: 2,
      }),
    );

    const firstCall = rpc.mock.calls[0] as unknown as
      [string, Record<string, unknown>] |
      undefined;
    expect(firstCall).toBeDefined();
    const payload = firstCall?.[1] ?? {};
    expect(payload).not.toHaveProperty("p_visibility");
    expect(payload).not.toHaveProperty("p_created_by");
    expect(payload).not.toHaveProperty("p_origin_recipe_id");
  });

  it("rejects mixed create modes and allows the strict personal-derived payload only", async () => {
    const mixedRpc = vi.fn();
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      rpc: mixedRpc,
      from: vi.fn((table: string) => {
        if (table === "ingredients") {
          return createLookupTable([
            { id: "550e8400-e29b-41d4-a716-446655440201" },
          ]);
        }
        if (table === "cooking_methods") {
          return createLookupTable([
            { id: "550e8400-e29b-41d4-a716-446655440301", label: "볶기" },
          ]);
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    });
    createRecipeFuturePropagationInternalClient.mockReturnValue({});

    const { POST } = await importRecipesRoute();
    const mixedResponse = await POST(new Request("http://localhost:3000/api/v1/recipes", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": "550e8400-e29b-41d4-a716-446655440997",
      },
      body: JSON.stringify({
        ...buildValidBody(),
        origin_recipe_id: "550e8400-e29b-41d4-a716-446655440999",
      }),
    }));

    expect(mixedResponse.status).toBe(422);
    await expect(mixedResponse.json()).resolves.toEqual({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        message: "요청 값을 확인해 주세요.",
        fields: [{ field: "body", reason: "mixed_create_modes" }],
      },
    });
    expect(mixedRpc).not.toHaveBeenCalled();
    expect(calculateRecipeDraftNutrition).not.toHaveBeenCalled();
    expect(callFuturePropagationRpc).not.toHaveBeenCalled();

    const derivedResponse = await POST(new Request("http://localhost:3000/api/v1/recipes", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": "550e8400-e29b-41d4-a716-446655440997",
      },
      body: JSON.stringify(buildDerivedBody()),
    }));

    expect(derivedResponse.status).toBe(201);
    await expect(derivedResponse.json()).resolves.toEqual({
      success: true,
      data: {
        id: "550e8400-e29b-41d4-a716-446655440997",
        revision: 7,
      },
      error: null,
    });
    expect(callFuturePropagationRpc).toHaveBeenCalledWith(
      {},
      "write_personal_recipe_core",
      expect.objectContaining({
        p_operation: "fork",
        p_recipe_id: null,
        p_source_recipe_id: "550e8400-e29b-41d4-a716-446655440999",
        p_base_recipe_revision: 12,
        p_draft: buildDerivedBody().draft,
        p_image_object_id: "550e8400-e29b-41d4-a716-446655440998",
        p_idempotency_key: "550e8400-e29b-41d4-a716-446655440997",
      }),
    );
  });

  it("keeps the strict create-mode union and delegated derived writer on the official fields only", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("app/api/v1/recipes/route.ts", "utf8");

    const manualParseSection = source.slice(
      source.indexOf("function parseManualRecipeCreateBody"),
      source.indexOf("function parseDerivedRecipeCreateBody"),
    );
    const derivedParseSection = source.slice(
      source.indexOf("function parseDerivedRecipeCreateBody"),
      source.indexOf("function buildManualRecipeRpcPayload"),
    );
    const payloadSection = source.slice(
      source.indexOf("function buildManualRecipeRpcPayload"),
      source.indexOf("async function requireUser"),
    );
    const delegatedCreateSection = source.slice(
      source.indexOf("async function postRecipe"),
      source.indexOf("export async function PATCH"),
    );

    expect(manualParseSection).not.toContain("rawBody.visibility");
    expect(manualParseSection).not.toContain("rawBody.created_by");
    expect(derivedParseSection).toContain('field: "body", reason: "mixed_create_modes"');
    expect(derivedParseSection).toContain("rawBody.origin_recipe_id");
    expect(derivedParseSection).toContain("rawBody.base_recipe_revision");
    expect(derivedParseSection).toContain("rawBody.image_object_id");
    expect(payloadSection).toContain("p_title");
    expect(payloadSection).toContain("p_base_servings");
    expect(payloadSection).toContain("p_ingredients");
    expect(payloadSection).toContain("p_steps");
    expect(payloadSection).not.toContain("visibility");
    expect(payloadSection).not.toContain("created_by");
    expect(delegatedCreateSection).toContain('"write_personal_recipe_core"');
    expect(delegatedCreateSection).toContain("p_source_recipe_id");
    expect(delegatedCreateSection).toContain("p_base_recipe_revision");
    expect(delegatedCreateSection).toContain("p_idempotency_key");
  });
});
