import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();
const formatBootstrapErrorMessage = vi.fn((_: unknown, fallbackMessage: string) => fallbackMessage);
const recordUserGrowthActivityEvent = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
}));

vi.mock("@/lib/server/user-growth-activity", () => ({
  recordUserGrowthActivityEvent,
}));

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

function createLookupTable<T>(result: QueryResult<T[]>) {
  const query = {
    in: vi.fn(() => query),
    then: createAwaitableQuery(result).then,
  };

  return {
    select: vi.fn(() => query),
  };
}

const userId = "550e8400-e29b-41d4-a716-446655440001";
const recipeId = "550e8400-e29b-41d4-a716-446655440101";
const ingredientId = "550e8400-e29b-41d4-a716-446655440201";
const saltIngredientId = "550e8400-e29b-41d4-a716-446655440202";
const cookingMethodId = "550e8400-e29b-41d4-a716-446655440301";

function buildBody() {
  return {
    title: "초보도 쉬운 매콤 김치찌개",
    base_servings: 2,
    ingredients: [
      {
        ingredient_id: ingredientId,
        standard_name: "김치",
        amount: 200,
        unit: "g",
        ingredient_type: "QUANT",
        display_text: "김치 200g",
        scalable: true,
        sort_order: 1,
      },
      {
        ingredient_id: saltIngredientId,
        standard_name: "돼지고기",
        amount: 100,
        unit: "g",
        ingredient_type: "QUANT",
        display_text: "돼지고기 100g",
        scalable: true,
        sort_order: 2,
      },
    ],
    steps: [
      {
        step_number: 1,
        instruction: "냄비에 김치를 넣고 볶아요.",
        cooking_method_id: cookingMethodId,
        ingredients_used: [],
        heat_level: "medium",
        duration_seconds: 300,
        duration_text: null,
      },
      {
        step_number: 2,
        instruction: "물을 붓고 보글보글 끓여요.",
        cooking_method_id: cookingMethodId,
        ingredients_used: [],
        heat_level: "medium",
        duration_seconds: 600,
        duration_text: null,
      },
    ],
  };
}

function createDbClient() {
  const ingredientsTable = createLookupTable({
    data: [{ id: ingredientId }, { id: saltIngredientId }],
    error: null,
  });
  const cookingMethodsTable = createLookupTable({
    data: [{ id: cookingMethodId, label: "끓이기" }],
    error: null,
  });
  const rpc = vi.fn(async () => ({
    data: {
      id: recipeId,
      title: "초보도 쉬운 매콤 김치찌개",
      source_type: "manual",
      created_by: userId,
      base_servings: 2,
    },
    error: null,
  }));
  const from = vi.fn((table: string) => {
    if (table === "ingredients") return ingredientsTable;
    if (table === "cooking_methods") return cookingMethodsTable;
    throw new Error(`unexpected table: ${table}`);
  });

  return { from, rpc };
}

async function importRecipesRoute() {
  return import("@/app/api/v1/recipes/route");
}

describe("36b manual recipe tag write path", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    formatBootstrapErrorMessage.mockClear();
    recordUserGrowthActivityEvent.mockReset();
    ensurePublicUserRow.mockResolvedValue({});
    ensureUserBootstrapState.mockResolvedValue(undefined);
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
      },
    });
  });

  it("accepts reviewed tags and delegates them to the atomic recipe tag writer RPC", async () => {
    const dbClient = createDbClient();
    createServiceRoleClient.mockReturnValue(dbClient);

    const { POST } = await importRecipesRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...buildBody(),
        tags: ["#한식", "내메모"],
      }),
    }));

    expect(response.status).toBe(201);
    expect(dbClient.rpc).toHaveBeenCalledWith("create_manual_recipe", expect.objectContaining({
      p_tags: ["한식", "내메모"],
      p_tag_source: "user_reviewed",
    }));
  });

  it("falls back to server semantic suggestions when reviewed tags are absent", async () => {
    const dbClient = createDbClient();
    createServiceRoleClient.mockReturnValue(dbClient);

    const { POST } = await importRecipesRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildBody()),
    }));

    expect(response.status).toBe(201);
    expect(dbClient.rpc).toHaveBeenCalledWith("create_manual_recipe", expect.objectContaining({
      p_tags: ["자취요리", "30분이내", "한식", "국물요리", "매콤", "초보가능"],
      p_tag_source: "system_suggested",
    }));
  });

  it("rejects invalid reviewed tags before database writes", async () => {
    const { POST } = await importRecipesRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...buildBody(),
        tags: ["한식", "한식"],
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "tags", reason: "duplicate" }],
      },
    });
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });
});
