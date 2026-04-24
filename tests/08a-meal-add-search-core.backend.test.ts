import { NextRequest } from "next/server";
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

vi.mock("@/lib/mock/recipes", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mock/recipes")>("@/lib/mock/recipes");

  return {
    ...actual,
    createQaFixtureMeal,
  };
});

interface QueryResult<T> {
  data: T;
  error: { message: string; code?: string } | null;
}

function createAwaitableQuery<T>(result: QueryResult<T>) {
  return {
    then(onFulfilled?: (value: QueryResult<T>) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
}

function createQuery<T>(result: QueryResult<T>) {
  const query = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    ilike: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    maybeSingle: vi.fn(() => createAwaitableQuery(result)),
    then(onFulfilled?: (value: QueryResult<T>) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };

  return query;
}

function createRecipesTable({
  selectResults,
}: {
  selectResults: Array<QueryResult<{ id: string } | null>>;
}) {
  const selectQuery = {
    eq: vi.fn(() => selectQuery),
    maybeSingle: vi.fn(() =>
      createAwaitableQuery(
        selectResults.shift() ?? {
          data: null,
          error: { message: "missing recipes select result" },
        },
      ),
    ),
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
    maybeSingle: vi.fn(() =>
      createAwaitableQuery(
        selectResults.shift() ?? {
          data: null,
          error: { message: "missing meal_plan_columns select result" },
        },
      ),
    ),
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
    maybeSingle: vi.fn(() =>
      createAwaitableQuery(
        insertResults.shift() ?? {
          data: null,
          error: { message: "missing meals insert result" },
        },
      ),
    ),
  };

  return {
    insert: vi.fn(() => insertQuery),
  };
}

describe("08a meal add search backend target", () => {
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
    delete process.env.HOMECOOK_ENABLE_DISCOVERY_FILTER_MOCK;
  });

  it("reuses GET /api/v1/recipes with q search in the API envelope", async () => {
    const listQuery = createQuery({
      data: [
        {
          id: "recipe-1",
          title: "김치찌개",
          thumbnail_url: "https://example.com/kimchi.jpg",
          tags: ["한식"],
          base_servings: 2,
          view_count: 10,
          like_count: 4,
          save_count: 2,
          source_type: "system" as const,
        },
      ],
      error: null,
    });

    createRouteHandlerClient.mockResolvedValue({
      from: vi.fn(() => listQuery),
    });

    const { GET } = await import("@/app/api/v1/recipes/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/recipes?q=%EA%B9%80%EC%B9%98&limit=20"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      error: null,
      data: {
        items: [
          {
            id: "recipe-1",
            title: "김치찌개",
          },
        ],
      },
    });
    expect(listQuery.ilike).toHaveBeenCalledWith("title", "%김치%");
    expect(listQuery.limit).toHaveBeenCalledWith(20);
  });

  it("returns 401 for unauthenticated POST /api/v1/meals", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      from: vi.fn(),
    });

    const { POST } = await import("@/app/api/v1/meals/route");
    const response = await POST(
      new Request("http://localhost:3000/api/v1/meals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipe_id: "550e8400-e29b-41d4-a716-446655440041",
          plan_date: "2026-03-02",
          column_id: "550e8400-e29b-41d4-a716-446655440042",
          planned_servings: 2,
        }),
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

  it("creates a registered meal after bootstrap and owner validation", async () => {
    const recipesTable = createRecipesTable({
      selectResults: [{ data: { id: "recipe-1" }, error: null }],
    });
    const mealPlanColumnsTable = createMealPlanColumnsTable({
      selectResults: [{ data: { id: "column-1", user_id: "user-1", name: "점심" }, error: null }],
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

    const { POST } = await import("@/app/api/v1/meals/route");
    const response = await POST(
      new Request("http://localhost:3000/api/v1/meals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipe_id: "550e8400-e29b-41d4-a716-446655440051",
          plan_date: "2026-03-02",
          column_id: "550e8400-e29b-41d4-a716-446655440052",
          planned_servings: 2,
        }),
      }),
    );
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
    expect(ensurePublicUserRow).toHaveBeenCalledWith(expect.anything(), { id: "user-1" });
    expect(ensureUserBootstrapState).toHaveBeenCalledWith(expect.anything(), "user-1");
    expect(mealsTable.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      recipe_id: "550e8400-e29b-41d4-a716-446655440051",
      plan_date: "2026-03-02",
      column_id: "550e8400-e29b-41d4-a716-446655440052",
      planned_servings: 2,
      status: "registered",
      is_leftover: false,
      leftover_dish_id: null,
      shopping_list_id: null,
      cooked_at: null,
    });
  });
});
