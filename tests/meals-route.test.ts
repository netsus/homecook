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
  createRouteHandlerClient: async (...args: unknown[]) => {
    const routeClient = await createRouteHandlerClient(...args);
    const createDataClient = createServiceRoleClient.getMockImplementation();
    const dataClient = createDataClient?.();
    return dataClient
      ? { ...routeClient, ...dataClient, auth: routeClient.auth }
      : routeClient;
  },
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

function hybridAuthorityMarker(
  code: "ACCOUNT_LIFECYCLE_MAINTENANCE" | "ACCOUNT_SESSION_STALE",
) {
  return `HOMECOOK_HYBRID_AUTHORITY::${code}::${code === "ACCOUNT_SESSION_STALE" ? "409" : "503"}`;
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
      rpc: vi.fn(async () => ({ data: [], error: null })),
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
      rpc: vi.fn(async () => ({ data: [], error: null })),
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

  it("maps wrapped hybrid authority revokes before planner column lookup to 409", async () => {
    const columnQuery = createMaybeSingleQuery([
      {
        data: null,
        error: {
          message: "TypeError: fetch failed",
          details: hybridAuthorityMarker("ACCOUNT_SESSION_STALE"),
        } as QueryError,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      rpc: vi.fn(async () => ({ data: [], error: null })),
      from: vi.fn((table: string) => {
        if (table === "meal_plan_columns") return { select: vi.fn(() => columnQuery) };
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/meals?plan_date=2026-03-01&column_id=550e8400-e29b-41d4-a716-446655440112"),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("ACCOUNT_SESSION_STALE");
  });

  it("maps wrapped hybrid authority outages during meal list reads to 503", async () => {
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
        data: null,
        error: {
          message: "TypeError: fetch failed",
          details: hybridAuthorityMarker("ACCOUNT_LIFECYCLE_MAINTENANCE"),
        } as QueryError,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      rpc: vi.fn(async () => ({ data: [], error: null })),
      from: vi.fn((table: string) => {
        if (table === "meal_plan_columns") return { select: vi.fn(() => columnQuery) };
        if (table === "meals") return { select: vi.fn(() => mealsQuery) };
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/meals?plan_date=2026-03-01&column_id=550e8400-e29b-41d4-a716-446655440113"),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("ACCOUNT_LIFECYCLE_MAINTENANCE");
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
            revision: 3,
          },
          {
            id: "meal-2",
            recipe_id: "recipe-2",
            planned_servings: 1,
            status: "shopping_done",
            is_leftover: true,
            created_at: "2026-03-01T09:00:00Z",
            revision: 4,
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
      rpc: vi.fn(async () => ({ data: [], error: null })),
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
            revision: 3,
          },
          {
            id: "meal-2",
            recipe_id: "recipe-2",
            recipe_title: "카레",
            recipe_thumbnail_url: null,
            planned_servings: 1,
            status: "shopping_done",
            is_leftover: true,
            revision: 4,
          },
        ],
      },
    });
    expect(mealsQuery.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: true });
    expect(mealsQuery.order).toHaveBeenNthCalledWith(2, "id", { ascending: true });
  });

  it("adds positive revision only to Recipe Meal items and leaves product entries unchanged", async () => {
    const columnQuery = createMaybeSingleQuery([{
      data: { id: "column-1", user_id: "user-1", name: "점심" },
      error: null,
    }]);
    const mealsQuery = createThenableQuery([{
      data: [{
        id: "meal-1",
        recipe_id: "recipe-1",
        planned_servings: 2,
        status: "shopping_done",
        is_leftover: false,
        created_at: "2026-03-01T08:00:00Z",
        revision: 7,
      }],
      error: null,
    }]);
    const recipesQuery = createThenableQuery([{
      data: [{ id: "recipe-1", title: "김치찌개", thumbnail_url: null }],
      error: null,
    }]);
    const productEntry = {
      id: "product-entry-1",
      entry_type: "product",
      product_id: "product-1",
      product_name: "우유",
      brand: null,
      amount: 1,
      unit: "개",
      plan_date: "2026-03-01",
      column_id: "column-1",
      legacy_read_only: true,
    };
    const rpc = vi.fn(async () => ({ data: [productEntry], error: null }));
    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      rpc,
      from: vi.fn((table: string) => {
        if (table === "meal_plan_columns") return { select: vi.fn(() => columnQuery) };
        if (table === "meals") return { select: vi.fn(() => mealsQuery) };
        if (table === "recipes") return { select: vi.fn(() => recipesQuery) };
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importRoute();
    const response = await GET(new NextRequest(
      "http://localhost:3000/api/v1/meals?plan_date=2026-03-01&column_id=550e8400-e29b-41d4-a716-446655440013",
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items[0].revision).toBe(7);
    expect(body.data.product_entries[0]).not.toHaveProperty("revision");
    expect(mealsQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("uses an immutable content title instead of the mutable current recipe title", async () => {
    const columnQuery = createMaybeSingleQuery([
      {
        data: { id: "column-1", user_id: "user-1", name: "점심" },
        error: null,
      },
    ]);
    const mealsQuery = createThenableQuery([
      {
        data: [{
          id: "meal-content",
          recipe_id: "recipe-1",
          planned_servings: 2,
          status: "registered",
          is_leftover: false,
          created_at: "2026-03-01T08:00:00Z",
          recipe_content_snapshot_id: "content-1",
          recipe_content_snapshots: { title: "계획 당시 김치찌개" },
        }],
        error: null,
      },
    ]);
    const recipesQuery = createThenableQuery([
      {
        data: [{
          id: "recipe-1",
          title: "나중에 바뀐 제목",
          thumbnail_url: null,
        }],
        error: null,
      },
    ]);
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      rpc: vi.fn(async () => ({ data: [], error: null })),
      from: vi.fn((table: string) => {
        if (table === "meal_plan_columns") return { select: vi.fn(() => columnQuery) };
        if (table === "meals") return { select: vi.fn(() => mealsQuery) };
        if (table === "recipes") return { select: vi.fn(() => recipesQuery) };
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/v1/meals?plan_date=2026-03-01&column_id=550e8400-e29b-41d4-a716-446655440021",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items[0].recipe_title).toBe("계획 당시 김치찌개");
  });

  it("fails closed when a content-pinned Meal cannot load its immutable content row", async () => {
    const columnQuery = createMaybeSingleQuery([
      {
        data: { id: "column-1", user_id: "user-1", name: "점심" },
        error: null,
      },
    ]);
    const mealsQuery = createThenableQuery([
      {
        data: [{
          id: "meal-broken-content",
          recipe_id: "recipe-1",
          planned_servings: 2,
          status: "registered",
          is_leftover: false,
          created_at: "2026-03-01T08:00:00Z",
          recipe_content_snapshot_id: "missing-content",
          recipe_content_snapshots: null,
        }],
        error: null,
      },
    ]);
    const recipesQuery = createThenableQuery([
      {
        data: [{
          id: "recipe-1",
          title: "현재 제목으로 대체하면 안 됨",
          thumbnail_url: null,
        }],
        error: null,
      },
    ]);
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      rpc: vi.fn(async () => ({ data: [], error: null })),
      from: vi.fn((table: string) => {
        if (table === "meal_plan_columns") return { select: vi.fn(() => columnQuery) };
        if (table === "meals") return { select: vi.fn(() => mealsQuery) };
        if (table === "recipes") return { select: vi.fn(() => recipesQuery) };
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/v1/meals?plan_date=2026-03-01&column_id=550e8400-e29b-41d4-a716-446655440022",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "INTERNAL_ERROR" },
    });
    expect(JSON.stringify(body)).not.toContain("현재 제목으로 대체하면 안 됨");
  });

  it("keeps deleted recipe metadata behind an owned Meal anchor", async () => {
    const routeFrom = vi.fn();
    const columnQuery = createMaybeSingleQuery([
      {
        data: {
          id: "column-1",
          user_id: "user-1",
          name: "저녁",
        },
        error: null,
      },
    ]);
    const mealsQuery = createThenableQuery([
      {
        data: [
          {
            id: "meal-anchored",
            recipe_id: "recipe-deleted",
            planned_servings: 2,
            status: "shopping_done",
            is_leftover: false,
            created_at: "2026-03-01T18:00:00Z",
          },
        ],
        error: null,
      },
    ]);
    const recipesQuery = createThenableQuery([
      {
        data: [
          {
            id: "recipe-deleted",
            title: "삭제 전 된장찌개",
            thumbnail_url: null,
          },
        ],
        error: null,
      },
    ]);
    const serviceFrom = vi.fn((table: string) => {
      if (table === "meal_plan_columns") return { select: vi.fn(() => columnQuery) };
      if (table === "meals") return { select: vi.fn(() => mealsQuery) };
      if (table === "recipes") return { select: vi.fn(() => recipesQuery) };
      throw new Error(`unexpected service table: ${table}`);
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: routeFrom,
    });
    createServiceRoleClient.mockReturnValue({
      rpc: vi.fn(async () => ({ data: [], error: null })),
      from: serviceFrom,
    });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/meals?plan_date=2026-03-01&column_id=550e8400-e29b-41d4-a716-446655440016"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toEqual([
      expect.objectContaining({
        id: "meal-anchored",
        recipe_id: "recipe-deleted",
        recipe_title: "삭제 전 된장찌개",
      }),
    ]);
    expect(routeFrom).not.toHaveBeenCalled();
    expect(mealsQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(recipesQuery.in).toHaveBeenCalledWith("id", ["recipe-deleted"]);
  });

  it("returns meals for an owned custom planner column", async () => {
    const columnQuery = createMaybeSingleQuery([
      {
        data: {
          id: "column-1",
          user_id: "user-1",
          name: "야식",
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
            planned_servings: 1,
            status: "registered",
            is_leftover: false,
            created_at: "2026-03-01T22:00:00Z",
          },
        ],
        error: null,
      },
    ]);
    const recipesQuery = createThenableQuery([
      {
        data: [
          { id: "recipe-1", title: "야식라면", thumbnail_url: null },
        ],
        error: null,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      rpc: vi.fn(async () => ({ data: [], error: null })),
      from: vi.fn((table: string) => {
        if (table === "meal_plan_columns") return { select: vi.fn(() => columnQuery) };
        if (table === "meals") return { select: vi.fn(() => mealsQuery) };
        if (table === "recipes") return { select: vi.fn(() => recipesQuery) };
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/meals?plan_date=2026-03-01&column_id=550e8400-e29b-41d4-a716-446655440015"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        items: [
          {
            id: "meal-1",
            recipe_title: "야식라면",
            planned_servings: 1,
          },
        ],
      },
      error: null,
    });
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
