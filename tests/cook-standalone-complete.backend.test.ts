import { readFile } from "node:fs/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();
const formatBootstrapErrorMessage = vi.fn((error: unknown, fallbackMessage: string) => {
  if (error instanceof Error) {
    return `formatted: ${error.message}`;
  }

  return fallbackMessage;
});

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
}));

interface QueryError {
  message: string;
}

interface QueryResult<T> {
  data: T | null;
  error: QueryError | null;
}

function createArraySelectQuery<T>(results: Array<QueryResult<T[]>>) {
  const query = {
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    then(
      onFulfilled?: (value: QueryResult<T[]>) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(
        results.shift() ?? {
          data: null,
          error: { message: "missing select result" },
        },
      ).then(onFulfilled, onRejected);
    },
  };

  return query;
}

function createMaybeSingleQuery<T>(results: Array<QueryResult<T | null>>) {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () =>
      results.shift() ?? {
        data: null,
        error: { message: "missing maybeSingle result" },
      }),
  };

  return query;
}

const recipeId = "550e8400-e29b-41d4-a716-446655440101";
const ingredientId1 = "550e8400-e29b-41d4-a716-446655440401";
const ingredientId2 = "550e8400-e29b-41d4-a716-446655440402";
const leftoverDishId = "550e8400-e29b-41d4-a716-446655440501";

function createRecipeContext(id = recipeId) {
  return {
    params: Promise.resolve({
      id,
    }),
  };
}

function createJsonRequest(body: unknown) {
  return new Request("http://localhost:3000/api/v1/cooking/standalone-complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function importRecipeCookModeRoute() {
  return import("@/app/api/v1/recipes/[id]/cook-mode/route");
}

async function importStandaloneCompleteRoute() {
  return import("@/app/api/v1/cooking/standalone-complete/route");
}

describe("15b cook standalone complete backend", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    formatBootstrapErrorMessage.mockClear();
    createServiceRoleClient.mockReturnValue(null);
    ensurePublicUserRow.mockResolvedValue({});
    ensureUserBootstrapState.mockResolvedValue(undefined);
  });

  it("GET /recipes/{id}/cook-mode returns scaled recipe data without requiring authentication", async () => {
    const recipesQuery = createMaybeSingleQuery([
      {
        data: { id: recipeId, title: "김치찌개", base_servings: 2 },
        error: null,
      },
    ]);
    const ingredientsQuery = createArraySelectQuery([
      {
        data: [
          {
            ingredient_id: ingredientId1,
            amount: 100,
            unit: "g",
            display_text: "김치 100g",
            ingredient_type: "QUANT",
            scalable: true,
            sort_order: 1,
            ingredients: { standard_name: "김치" },
          },
          {
            ingredient_id: ingredientId2,
            amount: 1,
            unit: "큰술",
            display_text: "고춧가루 1큰술",
            ingredient_type: "QUANT",
            scalable: true,
            sort_order: 2,
            ingredients: { standard_name: "고춧가루" },
          },
        ],
        error: null,
      },
    ]);
    const stepsQuery = createArraySelectQuery([
      {
        data: [
          {
            step_number: 1,
            instruction: "김치를 볶아주세요.",
            ingredients_used: [],
            heat_level: "medium",
            duration_seconds: 300,
            duration_text: null,
            cooking_methods: { code: "stir_fry", label: "볶기", color_key: "stir_fry" },
          },
        ],
        error: null,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn((table: string) => {
        if (table === "recipes") return { select: vi.fn(() => recipesQuery) };
        if (table === "recipe_ingredients") return { select: vi.fn(() => ingredientsQuery) };
        if (table === "recipe_steps") return { select: vi.fn(() => stepsQuery) };
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importRecipeCookModeRoute();
    const response = await GET(
      new Request(`http://localhost:3000/api/v1/recipes/${recipeId}/cook-mode?servings=4`),
      createRecipeContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        recipe: {
          id: recipeId,
          title: "김치찌개",
          cooking_servings: 4,
          ingredients: [
            {
              ingredient_id: ingredientId1,
              standard_name: "김치",
              amount: 200,
              unit: "g",
              display_text: "김치 200g",
              ingredient_type: "QUANT",
              scalable: true,
            },
            {
              ingredient_id: ingredientId2,
              standard_name: "고춧가루",
              amount: 2,
              unit: "큰술",
              display_text: "고춧가루 2큰술",
              ingredient_type: "QUANT",
              scalable: true,
            },
          ],
          steps: [
            {
              step_number: 1,
              instruction: "김치를 볶아주세요.",
              cooking_method: {
                code: "stir_fry",
                label: "볶기",
                color_key: "stir_fry",
              },
              ingredients_used: [],
              heat_level: "medium",
              duration_seconds: 300,
              duration_text: null,
            },
          ],
        },
      },
      error: null,
    });
  });

  it("GET /recipes/{id}/cook-mode rejects invalid servings", async () => {
    const { GET } = await importRecipeCookModeRoute();
    const response = await GET(
      new Request(`http://localhost:3000/api/v1/recipes/${recipeId}/cook-mode?servings=0`),
      createRecipeContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "servings", reason: "min_value" }],
      },
    });
  });

  it("GET /recipes/{id}/cook-mode returns 404 for missing recipes", async () => {
    const recipesQuery = createMaybeSingleQuery([
      {
        data: null,
        error: null,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "recipes") return { select: vi.fn(() => recipesQuery) };
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importRecipeCookModeRoute();
    const response = await GET(
      new Request(`http://localhost:3000/api/v1/recipes/${recipeId}/cook-mode?servings=2`),
      createRecipeContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "RESOURCE_NOT_FOUND" },
    });
  });

  it("POST /cooking/standalone-complete returns 401 when the user is not authenticated", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      rpc: vi.fn(),
    });

    const { POST } = await importStandaloneCompleteRoute();
    const response = await POST(
      createJsonRequest({
        recipe_id: recipeId,
        cooking_servings: 2,
        consumed_ingredient_ids: [],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("POST /cooking/standalone-complete validates request body", async () => {
    const { POST } = await importStandaloneCompleteRoute();
    const response = await POST(
      createJsonRequest({
        recipe_id: "not-a-uuid",
        cooking_servings: 0,
        consumed_ingredient_ids: [ingredientId1, "not-a-uuid"],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: expect.arrayContaining([
          { field: "recipe_id", reason: "invalid_uuid" },
          { field: "cooking_servings", reason: "min_value" },
          { field: "consumed_ingredient_ids", reason: "invalid_uuid" },
        ]),
      },
    });
  });

  it("POST /cooking/standalone-complete delegates atomic completion to the database function", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        leftover_dish_id: leftoverDishId,
        pantry_removed: 2,
        cook_count: 91,
      },
      error: null,
    }));

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      rpc,
    });

    const { POST } = await importStandaloneCompleteRoute();
    const response = await POST(
      createJsonRequest({
        recipe_id: recipeId,
        cooking_servings: 4,
        consumed_ingredient_ids: [ingredientId1, ingredientId1, ingredientId2],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        leftover_dish_id: leftoverDishId,
        pantry_removed: 2,
        cook_count: 91,
      },
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith("complete_standalone_cooking", {
      p_recipe_id: recipeId,
      p_user_id: "user-1",
      p_cooking_servings: 4,
      p_consumed_ingredient_ids: [ingredientId1, ingredientId2],
    });
  });

  it.each([
    {
      errorCode: "RESOURCE_NOT_FOUND",
      status: 404,
    },
    {
      errorCode: "FORBIDDEN",
      status: 403,
    },
    {
      errorCode: "VALIDATION_ERROR",
      status: 422,
    },
  ])(
    "POST /cooking/standalone-complete maps $errorCode database errors",
    async ({ errorCode, status }) => {
      createRouteHandlerClient.mockResolvedValue({
        auth: {
          getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
        },
        rpc: vi.fn(async () => ({
          data: {
            error_code: errorCode,
            message: "처리할 수 없어요.",
          },
          error: null,
        })),
      });

      const { POST } = await importStandaloneCompleteRoute();
      const response = await POST(
        createJsonRequest({
          recipe_id: recipeId,
          cooking_servings: 2,
          consumed_ingredient_ids: [],
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(status);
      expect(body).toMatchObject({
        success: false,
        data: null,
        error: { code: errorCode },
      });
    },
  );

  it("adds an atomic standalone completion function without planner-session side effects", async () => {
    const migration = await readFile(
      "supabase/migrations/20260429103000_15b_cook_standalone_complete.sql",
      "utf8",
    );

    expect(migration).toContain("public.complete_standalone_cooking");
    expect(migration).toContain("insert into public.leftover_dishes");
    expect(migration).toContain("delete from public.pantry_items");
    expect(migration).toContain("set cook_count = coalesce(cook_count, 0) + 1");
    expect(migration).not.toContain("public.cooking_sessions");
    expect(migration).not.toContain("public.cooking_session_meals");
    expect(migration).not.toContain("update public.meals");
  });
});
