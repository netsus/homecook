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

      return Promise.resolve(results.shift() ?? fallback).then(onFulfilled, onRejected);
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
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    formatBootstrapErrorMessage.mockClear();
    createServiceRoleClient.mockReturnValue(null);
    ensurePublicUserRow.mockResolvedValue({});
    ensureUserBootstrapState.mockResolvedValue(undefined);
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

  it("returns fixed four planner slots even when legacy users only have three columns", async () => {
    const mealPlanColumnsQuery = createThenableQuery([
      {
        data: [
          { id: "column-breakfast", name: "아침", sort_order: 0 },
          { id: "column-lunch", name: "점심", sort_order: 1 },
          { id: "column-dinner", name: "저녁", sort_order: 2 },
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
            column_id: "column-breakfast",
            planned_servings: 2,
            status: "registered",
            is_leftover: false,
            created_at: "2026-03-01T08:00:00Z",
          },
          {
            id: "meal-2",
            recipe_id: "recipe-2",
            plan_date: "2026-03-01",
            column_id: "column-lunch",
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
    expect(body.success).toBe(true);
    expect(body.data.columns).toHaveLength(4);
    expect(body.data.columns.map((column: { name: string }) => column.name)).toEqual([
      "아침",
      "점심",
      "간식",
      "저녁",
    ]);
    expect(body.data.columns[2]).toMatchObject({
      name: "간식",
      sort_order: 2,
      id: expect.any(String),
    });
    expect(body.data.meals).toMatchObject([
      {
        id: "meal-1",
        recipe_title: "김치찌개",
        column_id: "column-breakfast",
      },
      {
        id: "meal-2",
        recipe_title: "된장찌개",
        column_id: "column-lunch",
      },
    ]);
    expect(mealsQuery.order).toHaveBeenNthCalledWith(1, "plan_date", { ascending: true });
    expect(mealsQuery.order).toHaveBeenNthCalledWith(2, "column_id", { ascending: true });
    expect(mealsQuery.order).toHaveBeenNthCalledWith(3, "created_at", { ascending: true });
  });

  it("normalizes legacy custom columns into the fixed four-slot response", async () => {
    const mealPlanColumnsQuery = createThenableQuery([
      {
        data: [
          { id: "column-brunch", name: "브런치", sort_order: 0 },
          { id: "column-lunch", name: "점심", sort_order: 1 },
          { id: "column-dinner", name: "저녁", sort_order: 2 },
          { id: "column-night", name: "야식", sort_order: 3 },
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
            plan_date: "2026-03-02",
            column_id: "column-brunch",
            planned_servings: 2,
            status: "registered",
            is_leftover: false,
            created_at: "2026-03-02T08:00:00Z",
          },
          {
            id: "meal-2",
            recipe_id: "recipe-2",
            plan_date: "2026-03-02",
            column_id: "column-night",
            planned_servings: 1,
            status: "cook_done",
            is_leftover: false,
            created_at: "2026-03-02T09:00:00Z",
          },
        ],
        error: null,
      },
    ]);
    const recipesQuery = createThenableQuery([
      {
        data: [
          { id: "recipe-1", title: "오믈렛", thumbnail_url: null },
          { id: "recipe-2", title: "과일볼", thumbnail_url: null },
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
    expect(body.data.columns.map((column: { name: string }) => column.name)).toEqual([
      "아침",
      "점심",
      "간식",
      "저녁",
    ]);

    const breakfastSlot = body.data.columns.find((column: { name: string }) => column.name === "아침");
    const snackSlot = body.data.columns.find((column: { name: string }) => column.name === "간식");

    expect(body.data.meals).toMatchObject([
      {
        id: "meal-1",
        recipe_title: "오믈렛",
        column_id: breakfastSlot?.id,
      },
      {
        id: "meal-2",
        recipe_title: "과일볼",
        column_id: snackSlot?.id,
      },
    ]);
  });

  it("returns schema guidance when bootstrap fails before reading planner data", async () => {
    ensurePublicUserRow.mockRejectedValue(
      new Error("Could not find the table 'public.meal_plan_columns' in the schema cache"),
    );

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn(),
    });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/planner?start_date=2026-03-01&end_date=2026-03-07"),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "formatted: Could not find the table 'public.meal_plan_columns' in the schema cache",
      },
    });
    expect(formatBootstrapErrorMessage).toHaveBeenCalled();
  });
});
