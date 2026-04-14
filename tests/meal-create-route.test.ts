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
const createQaFixtureMeal = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
}));

vi.mock("@/lib/mock/recipes", () => ({
  MOCK_RECIPE_ID: "mock-kimchi-jjigae",
  createQaFixtureMeal,
  isQaFixtureModeEnabled: () => process.env.HOMECOOK_ENABLE_QA_FIXTURES === "1",
}));

interface QueryError {
  code?: string;
  message: string;
}

interface QueryResult<T> {
  data: T;
  error: QueryError | null;
}

function createAwaitableQuery<T>(result: QueryResult<T>) {
  return {
    then(
      onFulfilled?: (value: QueryResult<T>) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
}

function createRecipesTable({
  selectResults,
}: {
  selectResults: Array<QueryResult<{ id: string } | null>>;
}) {
  const selectQuery = {
    eq: vi.fn(() => selectQuery),
    maybeSingle: vi.fn(() => createAwaitableQuery(
      selectResults.shift() ?? {
        data: null,
        error: { message: "missing recipes select result" },
      },
    )),
  };

  return {
    select: vi.fn(() => selectQuery),
  };
}

function createMealPlanColumnsTable({
  selectResults,
}: {
  selectResults: Array<QueryResult<{ id: string; user_id: string; name: string } | null>>;
}) {
  const selectQuery = {
    eq: vi.fn(() => selectQuery),
    maybeSingle: vi.fn(() => createAwaitableQuery(
      selectResults.shift() ?? {
        data: null,
        error: { message: "missing meal_plan_columns select result" },
      },
    )),
  };

  return {
    select: vi.fn(() => selectQuery),
  };
}

function createMealsTable({
  insertResults,
}: {
  insertResults: Array<QueryResult<{
    id: string;
    recipe_id: string;
    plan_date: string;
    column_id: string;
    planned_servings: number;
    status: "registered";
    is_leftover: boolean;
    leftover_dish_id: string | null;
  } | null>>;
}) {
  const insertQuery = {
    select: vi.fn(() => insertQuery),
    maybeSingle: vi.fn(() => createAwaitableQuery(
      insertResults.shift() ?? {
        data: null,
        error: { message: "missing meals insert result" },
      },
    )),
  };

  return {
    insert: vi.fn(() => insertQuery),
  };
}

async function importRoute() {
  return import("@/app/api/v1/meals/route");
}

describe("POST /api/v1/meals", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    formatBootstrapErrorMessage.mockClear();
    createQaFixtureMeal.mockReset();
    createServiceRoleClient.mockReturnValue(null);
    ensurePublicUserRow.mockResolvedValue({});
    ensureUserBootstrapState.mockResolvedValue(undefined);
    delete process.env.HOMECOOK_ENABLE_QA_FIXTURES;
  });

  it("returns 401 before validating request body when user is not authenticated", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      from: vi.fn(),
    });

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/meals", {
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

  it("returns 422 when planned_servings is invalid", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn(),
    });

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/meals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipe_id: "550e8400-e29b-41d4-a716-446655440001",
        plan_date: "2026-03-01",
        column_id: "550e8400-e29b-41d4-a716-446655440002",
        planned_servings: 0,
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "planned_servings", reason: "min_value" }],
      },
    });
  });

  it("returns 404 when recipe does not exist", async () => {
    const recipesTable = createRecipesTable({
      selectResults: [{ data: null, error: null }],
    });
    const mealPlanColumnsTable = createMealPlanColumnsTable({ selectResults: [] });
    const mealsTable = createMealsTable({ insertResults: [] });

    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from: vi.fn((table: string) => {
        if (table === "recipes") return recipesTable;
        if (table === "meal_plan_columns") return mealPlanColumnsTable;
        if (table === "meals") return mealsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/meals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipe_id: "550e8400-e29b-41d4-a716-446655440011",
        plan_date: "2026-03-01",
        column_id: "550e8400-e29b-41d4-a716-446655440012",
        planned_servings: 2,
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "RESOURCE_NOT_FOUND" },
    });
  });

  it("returns 403 when the planner column belongs to another user", async () => {
    const recipesTable = createRecipesTable({
      selectResults: [{ data: { id: "recipe-1" }, error: null }],
    });
    const mealPlanColumnsTable = createMealPlanColumnsTable({
      selectResults: [
        {
          data: { id: "column-1", user_id: "other-user", name: "아침" },
          error: null,
        },
      ],
    });
    const mealsTable = createMealsTable({ insertResults: [] });

    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from: vi.fn((table: string) => {
        if (table === "recipes") return recipesTable;
        if (table === "meal_plan_columns") return mealPlanColumnsTable;
        if (table === "meals") return mealsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/meals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipe_id: "550e8400-e29b-41d4-a716-446655440021",
        plan_date: "2026-03-01",
        column_id: "550e8400-e29b-41d4-a716-446655440022",
        planned_servings: 2,
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "FORBIDDEN" },
    });
  });

  it("creates a registered meal and returns 201", async () => {
    const recipesTable = createRecipesTable({
      selectResults: [{ data: { id: "recipe-1" }, error: null }],
    });
    const mealPlanColumnsTable = createMealPlanColumnsTable({
      selectResults: [
        {
          data: { id: "column-1", user_id: "user-1", name: "점심" },
          error: null,
        },
      ],
    });
    const mealsTable = createMealsTable({
      insertResults: [
        {
          data: {
            id: "meal-1",
            recipe_id: "recipe-1",
            plan_date: "2026-03-02",
            column_id: "column-1",
            planned_servings: 2,
            status: "registered",
            is_leftover: false,
            leftover_dish_id: null,
          },
          error: null,
        },
      ],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from: vi.fn((table: string) => {
        if (table === "recipes") return recipesTable;
        if (table === "meal_plan_columns") return mealPlanColumnsTable;
        if (table === "meals") return mealsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/meals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipe_id: "550e8400-e29b-41d4-a716-446655440031",
        plan_date: "2026-03-02",
        column_id: "550e8400-e29b-41d4-a716-446655440032",
        planned_servings: 2,
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      success: true,
      data: {
        id: "meal-1",
        recipe_id: "recipe-1",
        plan_date: "2026-03-02",
        column_id: "column-1",
        planned_servings: 2,
        status: "registered",
        is_leftover: false,
        leftover_dish_id: null,
      },
      error: null,
    });
    expect(mealsTable.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      recipe_id: "550e8400-e29b-41d4-a716-446655440031",
      plan_date: "2026-03-02",
      column_id: "550e8400-e29b-41d4-a716-446655440032",
      planned_servings: 2,
      status: "registered",
      is_leftover: false,
      leftover_dish_id: null,
      shopping_list_id: null,
      cooked_at: null,
    });
  });
});
