import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import fixtureData from "@/qa/fixtures/slices-01-05.json";

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

function createMaybeSingleQuery<T>(results: Array<QueryResult<T | null>>) {
  const query = {
    select: vi.fn(() => query),
    maybeSingle: vi.fn(() =>
      createAwaitableQuery(results.shift() ?? {
        data: null,
        error: { message: "missing maybeSingle result" },
      }),
    ),
  };

  return query;
}

function createArrayQuery<T>(result: QueryResult<T[]>) {
  const query = {
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    then: createAwaitableQuery(result).then,
  };

  return query;
}

function createLookupTable<T>(result: QueryResult<T[]>) {
  const query = createArrayQuery(result);

  return {
    __query: query,
    select: vi.fn(() => query),
  };
}

function createInsertTable<TInsert, TResult>({
  insertResult,
}: {
  insertResult: QueryResult<TResult | null>;
}) {
  const insertQuery = createMaybeSingleQuery<TResult>([insertResult]);

  return {
    insert: vi.fn((values: TInsert | TInsert[]) => {
      void values;
      return insertQuery;
    }),
  };
}

function createBulkInsertTable<TInsert>({
  insertResult,
}: {
  insertResult: QueryResult<null>;
}) {
  return {
    insert: vi.fn((values: TInsert | TInsert[]) => {
      void values;
      return createAwaitableQuery(insertResult);
    }),
  };
}

const recipeId = "550e8400-e29b-41d4-a716-446655440101";
const ingredientId = "550e8400-e29b-41d4-a716-446655440201";
const toTasteIngredientId = "550e8400-e29b-41d4-a716-446655440202";
const cookingMethodId = "550e8400-e29b-41d4-a716-446655440301";

function buildValidBody() {
  return {
    title: "직접 김치찌개",
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
        ingredient_id: toTasteIngredientId,
        standard_name: "소금",
        amount: null,
        unit: null,
        ingredient_type: "TO_TASTE",
        display_text: "소금 약간",
        scalable: false,
        sort_order: 2,
      },
    ],
    steps: [
      {
        step_number: 1,
        instruction: "김치를 볶아주세요.",
        cooking_method_id: cookingMethodId,
        ingredients_used: [
          {
            ingredient_id: ingredientId,
            amount: 200,
            unit: "g",
            cut_size: "한입 크기",
          },
        ],
        heat_level: "medium",
        duration_seconds: 300,
        duration_text: null,
      },
    ],
  };
}

async function importRecipesRoute() {
  return import("@/app/api/v1/recipes/route");
}

async function importCookingMethodsRoute() {
  return import("@/app/api/v1/cooking-methods/route");
}

describe("18 manual recipe create backend", () => {
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

  it("GET /api/v1/cooking-methods returns methods in the API envelope", async () => {
    const cookingMethodsTable = createLookupTable({
      data: [
        {
          id: cookingMethodId,
          code: "stir_fry",
          label: "볶기",
          color_key: "orange",
          is_system: true,
        },
      ],
      error: null,
    });

    createRouteHandlerClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "cooking_methods") return cookingMethodsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importCookingMethodsRoute();
    const response = await GET(new NextRequest("http://localhost:3000/api/v1/cooking-methods"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        methods: [
          {
            id: cookingMethodId,
            code: "stir_fry",
            label: "볶기",
            color_key: "orange",
            is_system: true,
          },
        ],
      },
      error: null,
    });
    expect(cookingMethodsTable.select).toHaveBeenCalledWith("id, code, label, color_key, is_system");
    expect(cookingMethodsTable.__query.order).toHaveBeenCalledWith("display_order", { ascending: true });
    expect(cookingMethodsTable.__query.order).toHaveBeenCalledWith("created_at", { ascending: true });
  });

  it("fixture baseline includes manual recipe ingredient and cooking method choices", () => {
    const methodCodes = fixtureData.cookingMethods.map((method) => method.code);

    expect(methodCodes).toEqual(expect.arrayContaining([
      "stir_fry",
      "boil",
      "deep_fry",
      "steam",
      "grill",
      "blanch",
      "mix",
      "prep",
    ]));
    expect(fixtureData.ingredients.length).toBeGreaterThanOrEqual(10);
  });

  it("POST /api/v1/recipes returns 401 before validating an invalid body", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      from: vi.fn(),
    });

    const { POST } = await importRecipesRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("POST /api/v1/recipes rejects invalid ingredient type constraints", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn(),
    });

    const body = buildValidBody();
    body.ingredients[1] = {
      ...body.ingredients[1],
      amount: 1,
      unit: "꼬집",
      scalable: true,
    };

    const { POST } = await importRecipesRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
    const responseBody = await response.json();

    expect(response.status).toBe(422);
    expect(responseBody).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [
          { field: "ingredients[1].amount", reason: "must_be_null" },
          { field: "ingredients[1].unit", reason: "must_be_null" },
          { field: "ingredients[1].scalable", reason: "must_be_false" },
        ],
      },
    });
  });

  it("POST /api/v1/recipes rejects unknown ingredient types before database writes", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn(),
    });

    const body = buildValidBody();
    body.ingredients[0] = {
      ...body.ingredients[0],
      ingredient_type: "UNKNOWN" as "QUANT",
    };

    const { POST } = await importRecipesRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
    const responseBody = await response.json();

    expect(response.status).toBe(422);
    expect(responseBody).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "ingredients[0].ingredient_type", reason: "invalid_enum" }],
      },
    });
  });

  it("POST /api/v1/recipes rejects base_servings less than 1", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn(),
    });

    const body = {
      ...buildValidBody(),
      base_servings: 0,
    };

    const { POST } = await importRecipesRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
    const responseBody = await response.json();

    expect(response.status).toBe(422);
    expect(responseBody).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "base_servings", reason: "positive_integer_required" }],
      },
    });
  });

  it("POST /api/v1/recipes rejects step numbers that do not start at 1", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn(),
    });

    const body = buildValidBody();
    body.steps[0] = {
      ...body.steps[0],
      step_number: 2,
    };

    const { POST } = await importRecipesRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
    const responseBody = await response.json();

    expect(response.status).toBe(422);
    expect(responseBody).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "steps[0].step_number", reason: "must_start_at_1" }],
      },
    });
  });

  it("POST /api/v1/recipes rejects duplicate ingredient sort and step numbers", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn(),
    });

    const body = buildValidBody();
    body.ingredients[1] = {
      ...body.ingredients[1],
      sort_order: 1,
    };
    body.steps.push({
      ...body.steps[0],
      step_number: 1,
      instruction: "중복 스텝입니다.",
    });

    const { POST } = await importRecipesRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }));
    const responseBody = await response.json();

    expect(response.status).toBe(422);
    expect(responseBody).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [
          { field: "ingredients[1].sort_order", reason: "duplicate" },
          { field: "steps[1].step_number", reason: "duplicate" },
        ],
      },
    });
  });

  it("POST /api/v1/recipes returns 422 when a cooking method id does not exist", async () => {
    const ingredientsTable = createLookupTable({
      data: [{ id: ingredientId }, { id: toTasteIngredientId }],
      error: null,
    });
    const cookingMethodsTable = createLookupTable({
      data: [],
      error: null,
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "ingredients") return ingredientsTable;
        if (table === "cooking_methods") return cookingMethodsTable;
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

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "steps[0].cooking_method_id", reason: "not_found" }],
      },
    });
  });

  it("POST /api/v1/recipes returns 422 when an ingredient id does not exist", async () => {
    const ingredientsTable = createLookupTable({
      data: [{ id: ingredientId }],
      error: null,
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "ingredients") return ingredientsTable;
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

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "ingredients[1].ingredient_id", reason: "not_found" }],
      },
    });
  });

  it("POST /api/v1/recipes creates a manual recipe without recipe_book_items membership", async () => {
    const ingredientsTable = createLookupTable({
      data: [{ id: ingredientId }, { id: toTasteIngredientId }],
      error: null,
    });
    const cookingMethodsTable = createLookupTable({
      data: [{ id: cookingMethodId }],
      error: null,
    });
    const recipesTable = createInsertTable({
      insertResult: {
        data: {
          id: recipeId,
          title: "직접 김치찌개",
          source_type: "manual",
          created_by: "user-1",
          base_servings: 2,
        },
        error: null,
      },
    });
    const recipeIngredientsTable = createBulkInsertTable({
      insertResult: { data: null, error: null },
    });
    const recipeStepsTable = createBulkInsertTable({
      insertResult: { data: null, error: null },
    });
    const from = vi.fn((table: string) => {
      if (table === "ingredients") return ingredientsTable;
      if (table === "cooking_methods") return cookingMethodsTable;
      if (table === "recipes") return recipesTable;
      if (table === "recipe_ingredients") return recipeIngredientsTable;
      if (table === "recipe_steps") return recipeStepsTable;
      throw new Error(`unexpected table: ${table}`);
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from,
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
        id: recipeId,
        title: "직접 김치찌개",
        source_type: "manual",
        created_by: "user-1",
        base_servings: 2,
      },
      error: null,
    });
    expect(ensurePublicUserRow).toHaveBeenCalled();
    expect(ensureUserBootstrapState).toHaveBeenCalledWith(expect.anything(), "user-1");
    expect(recipesTable.insert).toHaveBeenCalledWith({
      title: "직접 김치찌개",
      base_servings: 2,
      source_type: "manual",
      created_by: "user-1",
    });
    expect(recipeIngredientsTable.insert).toHaveBeenCalledWith([
      {
        recipe_id: recipeId,
        ingredient_id: ingredientId,
        amount: 200,
        unit: "g",
        ingredient_type: "QUANT",
        display_text: "김치 200g",
        scalable: true,
        sort_order: 1,
      },
      {
        recipe_id: recipeId,
        ingredient_id: toTasteIngredientId,
        amount: null,
        unit: null,
        ingredient_type: "TO_TASTE",
        display_text: "소금 약간",
        scalable: false,
        sort_order: 2,
      },
    ]);
    expect(recipeStepsTable.insert).toHaveBeenCalledWith([
      {
        recipe_id: recipeId,
        step_number: 1,
        instruction: "김치를 볶아주세요.",
        cooking_method_id: cookingMethodId,
        ingredients_used: [
          {
            ingredient_id: ingredientId,
            amount: 200,
            unit: "g",
            cut_size: "한입 크기",
          },
        ],
        heat_level: "medium",
        duration_seconds: 300,
        duration_text: null,
      },
    ]);
    expect(from).not.toHaveBeenCalledWith("recipe_book_items");
  });
});
