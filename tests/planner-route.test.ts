import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

interface QueryError {
  code?: string;
  message: string;
}

interface QueryResult<T> {
  data: T;
  error: QueryError | null;
}

function createThenableQuery<T>(results: Array<QueryResult<T>>) {
  const query = {
    eq: vi.fn(() => query),
    gte: vi.fn(() => query),
    lte: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    then(onFulfilled?: (value: QueryResult<T>) => unknown, onRejected?: (reason: unknown) => unknown) {
      const fallback: QueryResult<T> = {
        data: undefined as unknown as T,
        error: { message: "missing select result" },
      };

      return Promise.resolve(
        results.shift() ?? fallback,
      ).then(onFulfilled, onRejected);
    },
  };

  return query;
}

async function importRoute() {
  return import("@/app/api/v1/planner/route");
}

describe("GET /api/v1/planner", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    createServiceRoleClient.mockReturnValue(null);
  });

  it("returns 401 when user is not authenticated", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      from: vi.fn(),
    });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/planner?start_date=2026-03-01&end_date=2026-03-07"),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "UNAUTHORIZED",
      },
    });
  });

  it("returns 422 when date range is invalid", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn(),
    });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/planner?start_date=2026-03-08&end_date=2026-03-07"),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
      },
    });
  });

  it("returns planner columns and meals in wrapped response", async () => {
    const mealPlanColumnsQuery = createThenableQuery([
      {
        data: [
          { id: "column-1", name: "아침", sort_order: 0 },
          { id: "column-2", name: "점심", sort_order: 1 },
          { id: "column-3", name: "저녁", sort_order: 2 },
        ],
        error: null,
      },
    ]);
    const mealsQuery = createThenableQuery([
      {
        data: [
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            plan_date: "2026-03-01",
            column_id: "column-1",
            planned_servings: 2,
            status: "registered",
            is_leftover: false,
            created_at: "2026-03-01T08:00:00Z",
          },
          {
            id: "meal-2",
            recipe_id: "recipe-2",
            plan_date: "2026-03-01",
            column_id: "column-2",
            planned_servings: 1,
            status: "shopping_done",
            is_leftover: false,
            created_at: "2026-03-01T09:00:00Z",
          },
        ],
        error: null,
      },
    ]);
    const recipesQuery = createThenableQuery([
      {
        data: [
          { id: "recipe-1", title: "김치찌개", thumbnail_url: "https://example.com/kimchi.jpg" },
          { id: "recipe-2", title: "된장찌개", thumbnail_url: null },
        ],
        error: null,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "meal_plan_columns") return { select: vi.fn(() => mealPlanColumnsQuery) };
        if (table === "meals") return { select: vi.fn(() => mealsQuery) };
        if (table === "recipes") return { select: vi.fn(() => recipesQuery) };

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/planner?start_date=2026-03-01&end_date=2026-03-07"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        columns: [
          { id: "column-1", name: "아침", sort_order: 0 },
          { id: "column-2", name: "점심", sort_order: 1 },
          { id: "column-3", name: "저녁", sort_order: 2 },
        ],
        meals: [
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_title: "김치찌개",
            recipe_thumbnail_url: "https://example.com/kimchi.jpg",
            plan_date: "2026-03-01",
            column_id: "column-1",
            planned_servings: 2,
            status: "registered",
            is_leftover: false,
          },
          {
            id: "meal-2",
            recipe_id: "recipe-2",
            recipe_title: "된장찌개",
            recipe_thumbnail_url: null,
            plan_date: "2026-03-01",
            column_id: "column-2",
            planned_servings: 1,
            status: "shopping_done",
            is_leftover: false,
          },
        ],
      },
      error: null,
    });
    expect(mealsQuery.order).toHaveBeenNthCalledWith(1, "plan_date", { ascending: true });
    expect(mealsQuery.order).toHaveBeenNthCalledWith(2, "column_id", { ascending: true });
    expect(mealsQuery.order).toHaveBeenNthCalledWith(3, "created_at", { ascending: true });
  });
});
