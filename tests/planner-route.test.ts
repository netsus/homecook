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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function deferredQuery<T>() {
  const result = deferred<QueryResult<T>>();
  const started = deferred<void>();
  const query = {
    eq: vi.fn(() => query), gte: vi.fn(() => query), lte: vi.fn(() => query),
    in: vi.fn(() => query), order: vi.fn(() => query),
    then: vi.fn((success?: (value: QueryResult<T>) => unknown, failure?: (reason: unknown) => unknown) => {
      started.resolve();
      return result.promise.then(success, failure);
    }),
  };
  return { query, started: started.promise, resolve: result.resolve };
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
    const client = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      from: vi.fn(),
      rpc: vi.fn(),
    };
    createRouteHandlerClient.mockResolvedValue(client);

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
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
    expect(ensurePublicUserRow).not.toHaveBeenCalled();
    expect(ensureUserBootstrapState).not.toHaveBeenCalled();
  });

  it("starts each independent read group together only after bootstrap, without waiting for a sibling result", async () => {
    const bootstrap = deferred<void>();
    const bootstrapStarted = deferred<void>();
    ensureUserBootstrapState.mockImplementation(() => {
      bootstrapStarted.resolve();
      return bootstrap.promise;
    });
    const columns = deferredQuery<unknown[]>();
    const meals = deferredQuery<unknown[]>();
    const products = deferredQuery<unknown[]>();
    const recipes = deferredQuery<unknown[]>();
    const shopping = deferredQuery<unknown[]>();
    const queries = new Map([
      ["meal_plan_columns", columns], ["meals", meals],
      ["recipes", recipes], ["shopping_lists", shopping],
    ]);
    const from = vi.fn((table: string) => ({ select: () => queries.get(table)!.query }));
    const rpc = vi.fn(() => products.query);
    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) }, from, rpc,
    });
    const { GET } = await importRoute();
    const responsePromise = GET(new NextRequest("http://localhost/api/v1/planner?start_date=2026-03-01&end_date=2026-03-07"));
    await bootstrapStarted.promise;
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    bootstrap.resolve();
    await columns.started;
    expect(meals.query.then).toHaveBeenCalledOnce();
    expect(products.query.then).toHaveBeenCalledOnce();
    expect(recipes.query.then).not.toHaveBeenCalled();
    expect(shopping.query.then).not.toHaveBeenCalled();
    expect(columns.query.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(meals.query.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(rpc).toHaveBeenCalledWith("list_product_planner_entries", expect.objectContaining({ p_user_id: "user-1" }));
    columns.resolve({ data: [{ id: "column-1", name: "아침", sort_order: 0 }], error: null });
    meals.resolve({ data: [{ id: "meal-1", recipe_id: "recipe-1", shopping_list_id: "shopping-1", plan_date: "2026-03-01", column_id: "column-1", planned_servings: 1, status: "registered", is_leftover: false }], error: null });
    products.resolve({ data: [], error: null });
    await recipes.started;
    expect(shopping.query.then).toHaveBeenCalledOnce();
    expect(recipes.query.in).toHaveBeenCalledWith("id", ["recipe-1"]);
    expect(shopping.query.in).toHaveBeenCalledWith("id", ["shopping-1"]);
    recipes.resolve({ data: [{ id: "recipe-1", title: "레시피", thumbnail_url: null }], error: null });
    shopping.resolve({ data: [{ id: "shopping-1", title: "장보기" }], error: null });
    const response = await responsePromise;
    expect(response.status).toBe(200);
    expect((await response.json()).data.meals[0]).toMatchObject({ recipe_title: "레시피", shopping_list_title: "장보기" });
  });

  it.each(["meal_plan_columns", "meals", "products", "recipes", "shopping_lists"])("preserves the wrapped failure when the parallel %s read fails", async (failed) => {
    const rows: Record<string, unknown[]> = {
      meal_plan_columns: [],
      meals: [{ id: "meal-1", recipe_id: "recipe-1", shopping_list_id: "shopping-1" }],
      recipes: [], shopping_lists: [], products: [],
    };
    const result = (key: string) => ({ data: failed === key ? null : rows[key], error: failed === key ? { message: "read failed" } : null });
    const from = vi.fn((table: string) => ({ select: () => createThenableQuery([result(table)]) }));
    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
      from, rpc: async () => result("products"),
    });
    const { GET } = await importRoute();
    const response = await GET(new NextRequest("http://localhost/api/v1/planner?start_date=2026-03-01&end_date=2026-03-07"));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ success: false, data: null, error: { code: "INTERNAL_ERROR", fields: [] } });
    if (["meal_plan_columns", "meals", "products"].includes(failed)) {
      expect(from.mock.calls.map(([table]) => table)).not.toContain("recipes");
      expect(from.mock.calls.map(([table]) => table)).not.toContain("shopping_lists");
    }
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

  it("returns the user's dynamic planner columns without adding the old snack slot", async () => {
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
      rpc: vi.fn(async () => ({ data: [], error: null })),
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
    expect(body.data.columns).toHaveLength(3);
    expect(body.data.columns.map((column: { name: string }) => column.name)).toEqual([
      "아침",
      "점심",
      "저녁",
    ]);
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

  it("uses an immutable content title instead of the mutable current recipe title", async () => {
    const mealPlanColumnsQuery = createThenableQuery([
      {
        data: [{ id: "column-dinner", name: "저녁", sort_order: 0 }],
        error: null,
      },
    ]);
    const mealsQuery = createThenableQuery([
      {
        data: [
          {
            id: "meal-pinned",
            recipe_id: "recipe-1",
            recipe_content_snapshot_id: "content-1",
            recipe_content_snapshots: { title: "계획 당시 된장찌개" },
            plan_date: "2026-03-01",
            column_id: "column-dinner",
            planned_servings: 2,
            status: "registered",
            is_leftover: false,
            shopping_list_id: null,
            created_at: "2026-03-01T08:00:00Z",
          },
        ],
        error: null,
      },
    ]);
    const recipesQuery = createThenableQuery([
      {
        data: [
          { id: "recipe-1", title: "수정된 된장찌개", thumbnail_url: null },
        ],
        error: null,
      },
    ]);
    const mealsSelect = vi.fn(() => mealsQuery);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      rpc: vi.fn(async () => ({ data: [], error: null })),
      from: vi.fn((table: string) => {
        if (table === "meal_plan_columns") return { select: vi.fn(() => mealPlanColumnsQuery) };
        if (table === "meals") return { select: mealsSelect };
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
    expect(body.data.meals[0].recipe_title).toBe("계획 당시 된장찌개");
    expect(mealsSelect).toHaveBeenCalledWith(
      expect.stringContaining("recipe_content_snapshot_id, recipe_content_snapshots(title)"),
    );
  });

  it("fails closed when a content-pinned planner Meal cannot load its immutable content row", async () => {
    const mealPlanColumnsQuery = createThenableQuery([
      {
        data: [{ id: "column-dinner", name: "저녁", sort_order: 0 }],
        error: null,
      },
    ]);
    const mealsQuery = createThenableQuery([
      {
        data: [
          {
            id: "meal-broken-pin",
            recipe_id: "recipe-1",
            recipe_content_snapshot_id: "missing-content",
            recipe_content_snapshots: null,
            plan_date: "2026-03-01",
            column_id: "column-dinner",
            planned_servings: 2,
            status: "registered",
            is_leftover: false,
            shopping_list_id: null,
            created_at: "2026-03-01T08:00:00Z",
          },
        ],
        error: null,
      },
    ]);
    const recipesQuery = createThenableQuery([
      {
        data: [
          { id: "recipe-1", title: "현재 된장찌개", thumbnail_url: null },
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

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      error: { code: "INTERNAL_ERROR" },
    });
  });

  it("includes shopping list metadata so planner can reopen created lists", async () => {
    const mealPlanColumnsQuery = createThenableQuery([
      {
        data: [
          { id: "column-breakfast", name: "아침", sort_order: 0 },
          { id: "column-lunch", name: "점심", sort_order: 1 },
          { id: "column-snack", name: "간식", sort_order: 2 },
          { id: "column-dinner", name: "저녁", sort_order: 3 },
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
            plan_date: "2026-04-28",
            column_id: "column-breakfast",
            planned_servings: 3,
            status: "registered",
            is_leftover: false,
            shopping_list_id: "shopping-list-1",
            created_at: "2026-04-28T08:00:00Z",
          },
        ],
        error: null,
      },
    ]);
    const recipesQuery = createThenableQuery([
      {
        data: [
          { id: "recipe-1", title: "김치찌개", thumbnail_url: null },
        ],
        error: null,
      },
    ]);
    const shoppingListsQuery = createThenableQuery([
      {
        data: [
          { id: "shopping-list-1", title: "4/28 장보기" },
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
        if (table === "meal_plan_columns") return { select: vi.fn(() => mealPlanColumnsQuery) };
        if (table === "meals") return { select: vi.fn(() => mealsQuery) };
        if (table === "recipes") return { select: vi.fn(() => recipesQuery) };
        if (table === "shopping_lists") return { select: vi.fn(() => shoppingListsQuery) };

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/planner?start_date=2026-04-28&end_date=2026-05-04"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.meals[0]).toMatchObject({
      id: "meal-1",
      shopping_list_id: "shopping-list-1",
      shopping_list_title: "4/28 장보기",
    });
    expect(shoppingListsQuery.in).toHaveBeenCalledWith("id", ["shopping-list-1"]);
  });

  it("preserves legacy custom columns and meal column ids in the planner response", async () => {
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
      rpc: vi.fn(async () => ({ data: [], error: null })),
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
      "브런치",
      "점심",
      "저녁",
      "야식",
    ]);

    expect(body.data.meals).toMatchObject([
      {
        id: "meal-1",
        recipe_title: "오믈렛",
        column_id: "column-brunch",
      },
      {
        id: "meal-2",
        recipe_title: "과일볼",
        column_id: "column-night",
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
