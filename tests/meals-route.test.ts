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

function createMaybeSingleQuery<T>(results: Array<QueryResult<T | null>>) {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(() =>
      Promise.resolve(
        results.shift() ?? {
          data: null,
          error: { message: "missing maybeSingle result" },
        },
      ),
    ),
  };

  return query;
}

async function importRoute() {
  return import("@/app/api/v1/meals/route");
}

describe("GET /api/v1/meals", () => {
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
    delete process.env.HOMECOOK_ENABLE_QA_FIXTURES;
  });

  it("returns 401 when the user is not authenticated", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      from: vi.fn(),
    });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/meals?plan_date=2026-03-01&column_id=550e8400-e29b-41d4-a716-446655440001"),
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

  it("returns 422 when the query is invalid", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn(),
    });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/meals?plan_date=not-a-date&column_id=bad"),
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

  it("returns 403 when the requested planner column belongs to another user", async () => {
    const columnQuery = createMaybeSingleQuery([
      {
        data: {
          id: "column-1",
          user_id: "other-user",
          name: "점심",
        },
        error: null,
      },
    ]);
    const mealsQuery = createThenableQuery([]);
    const recipesQuery = createThenableQuery([]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "meal_plan_columns") return { select: vi.fn(() => columnQuery) };
        if (table === "meals") return { select: vi.fn(() => mealsQuery) };
        if (table === "recipes") return { select: vi.fn(() => recipesQuery) };
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/meals?plan_date=2026-03-01&column_id=550e8400-e29b-41d4-a716-446655440011"),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
      },
    });
  });

  it("returns 404 when the planner column does not exist", async () => {
    const columnQuery = createMaybeSingleQuery([
      {
        data: null,
        error: null,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "meal_plan_columns") return { select: vi.fn(() => columnQuery) };
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/meals?plan_date=2026-03-01&column_id=550e8400-e29b-41d4-a716-446655440012"),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "RESOURCE_NOT_FOUND",
      },
    });
  });

  it("returns the meals for the requested slot with recipe metadata", async () => {
    const columnQuery = createMaybeSingleQuery([
      {
        data: {
          id: "column-1",
          user_id: "user-1",
          name: "점심",
        },
        error: null,
      },
    ]);
    const mealsQuery = createThenableQuery([
      {
        data: [
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            planned_servings: 2,
            status: "registered",
            is_leftover: false,
            created_at: "2026-03-01T08:00:00Z",
          },
          {
            id: "meal-2",
            recipe_id: "recipe-2",
            planned_servings: 1,
            status: "shopping_done",
            is_leftover: true,
            created_at: "2026-03-01T09:00:00Z",
          },
        ],
        error: null,
      },
    ]);
    const recipesQuery = createThenableQuery([
      {
        data: [
          { id: "recipe-1", title: "김치찌개", thumbnail_url: "https://example.com/kimchi.png" },
          { id: "recipe-2", title: "카레", thumbnail_url: null },
        ],
        error: null,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "meal_plan_columns") return { select: vi.fn(() => columnQuery) };
        if (table === "meals") return { select: vi.fn(() => mealsQuery) };
        if (table === "recipes") return { select: vi.fn(() => recipesQuery) };
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/meals?plan_date=2026-03-01&column_id=550e8400-e29b-41d4-a716-446655440013"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      error: null,
      data: {
        items: [
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_title: "김치찌개",
            recipe_thumbnail_url: "https://example.com/kimchi.png",
            planned_servings: 2,
            status: "registered",
            is_leftover: false,
          },
          {
            id: "meal-2",
            recipe_id: "recipe-2",
            recipe_title: "카레",
            recipe_thumbnail_url: null,
            planned_servings: 1,
            status: "shopping_done",
            is_leftover: true,
          },
        ],
      },
    });
    expect(mealsQuery.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: true });
    expect(mealsQuery.order).toHaveBeenNthCalledWith(2, "id", { ascending: true });
  });

  it("returns formatted bootstrap errors before loading meals", async () => {
    ensurePublicUserRow.mockRejectedValue(new Error("Could not find the table 'public.meals' in the schema cache"));

    const columnQuery = createMaybeSingleQuery([]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "meal_plan_columns") return { select: vi.fn(() => columnQuery) };
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/meals?plan_date=2026-03-01&column_id=550e8400-e29b-41d4-a716-446655440014"),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "INTERNAL_ERROR",
        message: "formatted: Could not find the table 'public.meals' in the schema cache",
      },
    });
  });
});
