import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchShoppingListDetail, isShoppingApiError, updateShoppingListItem } from "@/lib/api/shopping";

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

interface QueryResult<T> {
  data: T | null;
  error: QueryError | null;
}

function createArraySelectQuery<T>(results: Array<QueryResult<T[]>>) {
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
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

function createUpdateMaybeSingleQuery<T>(results: Array<QueryResult<T | null>>) {
  const query = {
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    maybeSingle: vi.fn(async () =>
      results.shift() ?? {
        data: null,
        error: { message: "missing update result" },
      }),
  };

  return query;
}

function createArrayUpdateQuery<T>(results: Array<QueryResult<T[]>>) {
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    select: vi.fn(() => query),
    then(
      onFulfilled?: (value: QueryResult<T[]>) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(
        results.shift() ?? {
          data: null,
          error: { message: "missing update result" },
        },
      ).then(onFulfilled, onRejected);
    },
  };

  return query;
}

async function importListDetailRoute() {
  return import("@/app/api/v1/shopping/lists/[list_id]/route");
}

async function importItemPatchRoute() {
  return import("@/app/api/v1/shopping/lists/[list_id]/items/[item_id]/route");
}

async function importBulkItemPatchRoute() {
  return import("@/app/api/v1/shopping/lists/[list_id]/items/bulk/route");
}

describe("10a shopping detail backend", () => {
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

  it("returns shopping list detail in envelope with sorted items", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: "550e8400-e29b-41d4-a716-446655440001",
          user_id: "user-1",
          title: "4/25 장보기",
          date_range_start: "2026-04-25",
          date_range_end: "2026-04-27",
          is_completed: false,
          completed_at: null,
          created_at: "2026-04-25T09:00:00.000Z",
          updated_at: "2026-04-25T09:10:00.000Z",
        },
        error: null,
      },
    ]);
    const listRecipesQuery = createArraySelectQuery([
      {
        data: [
          {
            recipe_id: "recipe-2",
            shopping_servings: 2,
            planned_servings_total: 2,
          },
          {
            recipe_id: "recipe-1",
            shopping_servings: 4,
            planned_servings_total: 4,
          },
        ],
        error: null,
      },
    ]);
    const mealsQuery = createArraySelectQuery([{ data: [], error: null }]);
    const recipesQuery = createArraySelectQuery([
      {
        data: [
          { id: "recipe-1", title: "김치찌개", thumbnail_url: "https://example.com/kimchi.jpg" },
          { id: "recipe-2", title: "된장찌개", thumbnail_url: null },
        ],
        error: null,
      },
    ]);
    const itemsQuery = createArraySelectQuery([
      {
        data: [
          {
            id: "item-1",
            ingredient_id: "ing-1",
            source_type: "ingredient",
            food_product_id: null,
            food_product_nutrition_version_id: null,
            display_text: "양파 1개",
            amounts_json: [{ amount: 1, unit: "개" }],
            is_checked: false,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 0,
          },
          {
            id: "item-2",
            ingredient_id: "ing-2",
            source_type: "ingredient",
            food_product_id: null,
            food_product_nutrition_version_id: null,
            display_text: "소금 1작은술",
            amounts_json: [{ amount: 1, unit: "작은술" }],
            is_checked: false,
            is_pantry_excluded: true,
            added_to_pantry: false,
            sort_order: 100,
          },
          {
            id: "item-3",
            ingredient_id: null,
            food_product_id: "product-1",
            food_product_nutrition_version_id: "version-1",
            display_text: "고정 상품",
            amounts_json: [{ amount: 100, unit: "g" }],
            is_checked: true,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 200,
          },
          {
            id: "item-4",
            ingredient_id: null,
            food_product_id: null,
            food_product_nutrition_version_id: null,
            display_text: "과거 표시 스냅샷",
            amounts_json: [],
            is_checked: false,
            is_pantry_excluded: true,
            added_to_pantry: false,
            sort_order: 300,
          },
        ],
        error: null,
      },
    ]);
    const ingredientsQuery = createArraySelectQuery([
      {
        data: [
          { id: "ing-1", category: "채소" },
          { id: "ing-2", category: "양념" },
        ],
        error: null,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") {
          return { select: vi.fn(() => listQuery) };
        }
        if (table === "shopping_list_recipes") {
          return { select: vi.fn(() => listRecipesQuery) };
        }
        if (table === "meals") {
          return { select: vi.fn(() => mealsQuery) };
        }
        if (table === "recipes") {
          return { select: vi.fn(() => recipesQuery) };
        }
        if (table === "shopping_list_items") {
          return { select: vi.fn(() => itemsQuery) };
        }
        if (table === "ingredients") {
          return { select: vi.fn(() => ingredientsQuery) };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importListDetailRoute();
    const response = await GET(new Request("http://localhost:3000/api/v1/shopping/lists/550e8400-e29b-41d4-a716-446655440001"), {
      params: Promise.resolve({
        list_id: "550e8400-e29b-41d4-a716-446655440001",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        id: "550e8400-e29b-41d4-a716-446655440001",
        title: "4/25 장보기",
        date_range_start: "2026-04-25",
        date_range_end: "2026-04-27",
        is_completed: false,
        completed_at: null,
        created_at: "2026-04-25T09:00:00.000Z",
        updated_at: "2026-04-25T09:10:00.000Z",
        recipes: [
          {
            recipe_id: "recipe-1",
            recipe_name: "김치찌개",
            recipe_thumbnail: "https://example.com/kimchi.jpg",
            shopping_servings: 4,
            planned_servings_total: 4,
          },
          {
            recipe_id: "recipe-2",
            recipe_name: "된장찌개",
            recipe_thumbnail: null,
            shopping_servings: 2,
            planned_servings_total: 2,
          },
        ],
        items: [
          {
            id: "item-1",
            ingredient_id: "ing-1",
            source_type: "ingredient",
            food_product_id: null,
            food_product_nutrition_version_id: null,
            category: "채소",
            display_text: "양파 1개",
            amounts_json: [{ amount: 1, unit: "개" }],
            is_checked: false,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 0,
          },
          {
            id: "item-2",
            ingredient_id: "ing-2",
            source_type: "ingredient",
            food_product_id: null,
            food_product_nutrition_version_id: null,
            category: "양념",
            display_text: "소금 1작은술",
            amounts_json: [{ amount: 1, unit: "작은술" }],
            is_checked: false,
            is_pantry_excluded: true,
            added_to_pantry: false,
            sort_order: 100,
          },
          {
            id: "item-3",
            ingredient_id: null,
            source_type: "food_product",
            food_product_id: "product-1",
            food_product_nutrition_version_id: "version-1",
            category: null,
            display_text: "고정 상품",
            amounts_json: [{ amount: 100, unit: "g" }],
            is_checked: true,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 200,
          },
          {
            id: "item-4",
            ingredient_id: null,
            source_type: null,
            food_product_id: null,
            food_product_nutrition_version_id: null,
            category: null,
            display_text: "과거 표시 스냅샷",
            amounts_json: [],
            is_checked: false,
            is_pantry_excluded: true,
            added_to_pantry: false,
            sort_order: 300,
          },
        ],
      },
      error: null,
    });
    expect(itemsQuery.order).toHaveBeenCalledWith("sort_order", { ascending: true });
    expect(itemsQuery.order).toHaveBeenCalledWith("id", { ascending: true });
  });

  it("uses the content-pinned Meal title for shopping list detail", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: "550e8400-e29b-41d4-a716-446655440001",
          user_id: "user-1",
          title: "4/25 장보기",
          date_range_start: "2026-04-25",
          date_range_end: "2026-04-25",
          is_completed: false,
          completed_at: null,
          created_at: "2026-04-25T09:00:00.000Z",
        },
        error: null,
      },
    ]);
    const listRecipesQuery = createArraySelectQuery([
      {
        data: [
          {
            recipe_id: "recipe-1",
            shopping_servings: 2,
            planned_servings_total: 2,
          },
        ],
        error: null,
      },
    ]);
    const mealsQuery = createArraySelectQuery([
      {
        data: [
          {
            recipe_id: "recipe-1",
            recipe_content_snapshot_id: "snapshot-1",
            recipe_content_snapshots: {
              title: "장보기 생성 당시 김치찌개",
            },
          },
        ],
        error: null,
      },
    ]);
    const recipesQuery = createArraySelectQuery([
      {
        data: [
          {
            id: "recipe-1",
            title: "편집된 현재 김치찌개",
            thumbnail_url: null,
          },
        ],
        error: null,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") {
          return { select: vi.fn(() => listQuery) };
        }
        if (table === "shopping_list_recipes") {
          return { select: vi.fn(() => listRecipesQuery) };
        }
        if (table === "meals") {
          return { select: vi.fn(() => mealsQuery) };
        }
        if (table === "recipes") {
          return { select: vi.fn(() => recipesQuery) };
        }
        if (table === "shopping_list_items") {
          return {
            select: vi.fn(() => createArraySelectQuery([{ data: [], error: null }])),
          };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importListDetailRoute();
    const response = await GET(
      new Request(
        "http://localhost:3000/api/v1/shopping/lists/550e8400-e29b-41d4-a716-446655440001",
      ),
      {
        params: Promise.resolve({
          list_id: "550e8400-e29b-41d4-a716-446655440001",
        }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.recipes[0].recipe_name).toBe("장보기 생성 당시 김치찌개");
  });

  it("fails closed when shopping list detail finds a broken Meal content pin relation", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: "550e8400-e29b-41d4-a716-446655440001",
          user_id: "user-1",
          title: "4/25 장보기",
          date_range_start: "2026-04-25",
          date_range_end: "2026-04-25",
          is_completed: false,
          completed_at: null,
          created_at: "2026-04-25T09:00:00.000Z",
        },
        error: null,
      },
    ]);
    const listRecipesQuery = createArraySelectQuery([
      {
        data: [
          {
            recipe_id: "recipe-1",
            shopping_servings: 2,
            planned_servings_total: 2,
          },
        ],
        error: null,
      },
    ]);
    const mealsQuery = createArraySelectQuery([
      {
        data: [
          {
            recipe_id: "recipe-1",
            recipe_content_snapshot_id: "snapshot-1",
            recipe_content_snapshots: null,
          },
        ],
        error: null,
      },
    ]);
    const recipesQuery = createArraySelectQuery([
      {
        data: [
          {
            id: "recipe-1",
            title: "노출되면 안 되는 현재 제목",
            thumbnail_url: null,
          },
        ],
        error: null,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") {
          return { select: vi.fn(() => listQuery) };
        }
        if (table === "shopping_list_recipes") {
          return { select: vi.fn(() => listRecipesQuery) };
        }
        if (table === "meals") {
          return { select: vi.fn(() => mealsQuery) };
        }
        if (table === "recipes") {
          return { select: vi.fn(() => recipesQuery) };
        }
        if (table === "shopping_list_items") {
          return {
            select: vi.fn(() => createArraySelectQuery([{ data: [], error: null }])),
          };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importListDetailRoute();
    const response = await GET(
      new Request(
        "http://localhost:3000/api/v1/shopping/lists/550e8400-e29b-41d4-a716-446655440001",
      ),
      {
        params: Promise.resolve({
          list_id: "550e8400-e29b-41d4-a716-446655440001",
        }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "INTERNAL_ERROR" },
    });
    expect(JSON.stringify(body)).not.toContain("노출되면 안 되는 현재 제목");
  });

  it("fails closed when the shopping list Meal content authority query throws", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: "550e8400-e29b-41d4-a716-446655440001",
          user_id: "user-1",
          title: "4/25 장보기",
          date_range_start: "2026-04-25",
          date_range_end: "2026-04-25",
          is_completed: false,
          completed_at: null,
          created_at: "2026-04-25T09:00:00.000Z",
        },
        error: null,
      },
    ]);
    const listRecipesQuery = createArraySelectQuery([
      {
        data: [
          {
            recipe_id: "recipe-1",
            shopping_servings: 2,
            planned_servings_total: 2,
          },
        ],
        error: null,
      },
    ]);
    const recipesQuery = createArraySelectQuery([
      {
        data: [
          {
            id: "recipe-1",
            title: "노출되면 안 되는 현재 제목",
            thumbnail_url: null,
          },
        ],
        error: null,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") {
          return { select: vi.fn(() => listQuery) };
        }
        if (table === "shopping_list_recipes") {
          return { select: vi.fn(() => listRecipesQuery) };
        }
        if (table === "meals") {
          return {
            select: vi.fn(() => {
              throw new Error("Meal content authority unavailable");
            }),
          };
        }
        if (table === "recipes") {
          return { select: vi.fn(() => recipesQuery) };
        }
        if (table === "shopping_list_items") {
          return {
            select: vi.fn(() => createArraySelectQuery([{ data: [], error: null }])),
          };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importListDetailRoute();
    const response = await GET(
      new Request(
        "http://localhost:3000/api/v1/shopping/lists/550e8400-e29b-41d4-a716-446655440001",
      ),
      {
        params: Promise.resolve({
          list_id: "550e8400-e29b-41d4-a716-446655440001",
        }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "INTERNAL_ERROR" },
    });
    expect(JSON.stringify(body)).not.toContain("노출되면 안 되는 현재 제목");
  });

  it("returns detail when shopping_lists does not expose updated_at", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: "550e8400-e29b-41d4-a716-446655440001",
          user_id: "user-1",
          title: "4/25 장보기",
          date_range_start: "2026-04-25",
          date_range_end: "2026-04-27",
          is_completed: false,
          completed_at: null,
          created_at: "2026-04-25T09:00:00.000Z",
        },
        error: null,
      },
    ]);
    const listRecipesQuery = createArraySelectQuery([{ data: [], error: null }]);
    const mealsQuery = createArraySelectQuery([{ data: [], error: null }]);
    const itemsQuery = createArraySelectQuery([{ data: [], error: null }]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") {
          return { select: vi.fn(() => listQuery) };
        }
        if (table === "shopping_list_recipes") {
          return { select: vi.fn(() => listRecipesQuery) };
        }
        if (table === "meals") {
          return { select: vi.fn(() => mealsQuery) };
        }
        if (table === "shopping_list_items") {
          return { select: vi.fn(() => itemsQuery) };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importListDetailRoute();
    const response = await GET(new Request("http://localhost:3000/api/v1/shopping/lists/550e8400-e29b-41d4-a716-446655440001"), {
      params: Promise.resolve({
        list_id: "550e8400-e29b-41d4-a716-446655440001",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.updated_at).toBe("2026-04-25T09:00:00.000Z");
  });

  it("returns detail without categories when ingredient category lookup fails", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: "550e8400-e29b-41d4-a716-446655440001",
          user_id: "user-1",
          title: "4/25 장보기",
          date_range_start: "2026-04-25",
          date_range_end: "2026-04-27",
          is_completed: false,
          completed_at: null,
          created_at: "2026-04-25T09:00:00.000Z",
          updated_at: "2026-04-25T09:10:00.000Z",
        },
        error: null,
      },
    ]);
    const listRecipesQuery = createArraySelectQuery([{ data: [], error: null }]);
    const mealsQuery = createArraySelectQuery([{ data: [], error: null }]);
    const itemsQuery = createArraySelectQuery([
      {
        data: [
          {
            id: "item-1",
            ingredient_id: "ing-1",
            display_text: "양파 1개",
            amounts_json: [{ amount: 1, unit: "개" }],
            is_checked: false,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 0,
          },
        ],
        error: null,
      },
    ]);
    const ingredientsQuery = createArraySelectQuery([
      {
        data: null,
        error: { message: "category lookup unavailable" },
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") {
          return { select: vi.fn(() => listQuery) };
        }
        if (table === "shopping_list_recipes") {
          return { select: vi.fn(() => listRecipesQuery) };
        }
        if (table === "meals") {
          return { select: vi.fn(() => mealsQuery) };
        }
        if (table === "shopping_list_items") {
          return { select: vi.fn(() => itemsQuery) };
        }
        if (table === "ingredients") {
          return { select: vi.fn(() => ingredientsQuery) };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importListDetailRoute();
    const response = await GET(new Request("http://localhost:3000/api/v1/shopping/lists/550e8400-e29b-41d4-a716-446655440001"), {
      params: Promise.resolve({
        list_id: "550e8400-e29b-41d4-a716-446655440001",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items[0].category).toBeNull();
  });

  it("returns 403 when shopping detail list owner mismatches", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: "550e8400-e29b-41d4-a716-446655440001",
          user_id: "other-user",
          title: "4/25 장보기",
          date_range_start: "2026-04-25",
          date_range_end: "2026-04-27",
          is_completed: false,
          completed_at: null,
          created_at: "2026-04-25T09:00:00.000Z",
          updated_at: "2026-04-25T09:10:00.000Z",
        },
        error: null,
      },
    ]);
    const serviceFrom = vi.fn((table: string) => {
      if (table === "shopping_lists") return { select: vi.fn(() => listQuery) };
      throw new Error(`unexpected service table: ${table}`);
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        throw new Error(`unexpected route table: ${table}`);
      }),
    });
    createServiceRoleClient.mockReturnValue({
      from: serviceFrom,
    });

    const { GET } = await importListDetailRoute();
    const response = await GET(new Request("http://localhost:3000/api/v1/shopping/lists/550e8400-e29b-41d4-a716-446655440001"), {
      params: Promise.resolve({
        list_id: "550e8400-e29b-41d4-a716-446655440001",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "FORBIDDEN" },
    });
    expect(serviceFrom).toHaveBeenCalledWith("shopping_lists");
    expect(serviceFrom).not.toHaveBeenCalledWith("shopping_list_recipes");
    expect(serviceFrom).not.toHaveBeenCalledWith("recipes");
  });

  it("reads anchored deleted recipe metadata through service role for the list owner", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: "550e8400-e29b-41d4-a716-446655440001",
          user_id: "user-1",
          title: "삭제 레시피 장보기",
          date_range_start: "2026-04-25",
          date_range_end: "2026-04-27",
          is_completed: false,
          completed_at: null,
          created_at: "2026-04-25T09:00:00.000Z",
          updated_at: "2026-04-25T09:10:00.000Z",
        },
        error: null,
      },
    ]);
    const listRecipesQuery = createArraySelectQuery([
      {
        data: [
          {
            recipe_id: "recipe-deleted",
            shopping_servings: 2,
            planned_servings_total: 2,
          },
        ],
        error: null,
      },
    ]);
    const recipesQuery = createArraySelectQuery([
      {
        data: [
          {
            id: "recipe-deleted",
            title: "숨김 처리된 레시피",
            thumbnail_url: "https://example.com/deleted.jpg",
          },
        ],
        error: null,
      },
    ]);
    const mealsQuery = createArraySelectQuery([{ data: [], error: null }]);
    const itemsQuery = createArraySelectQuery([{ data: [], error: null }]);
    const serviceFrom = vi.fn((table: string) => {
      if (table === "shopping_lists") return { select: vi.fn(() => listQuery) };
      if (table === "shopping_list_recipes") return { select: vi.fn(() => listRecipesQuery) };
      if (table === "meals") return { select: vi.fn(() => mealsQuery) };
      if (table === "recipes") return { select: vi.fn(() => recipesQuery) };
      if (table === "shopping_list_items") return { select: vi.fn(() => itemsQuery) };
      throw new Error(`unexpected service table: ${table}`);
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        throw new Error(`unexpected route table: ${table}`);
      }),
    });
    createServiceRoleClient.mockReturnValue({
      from: serviceFrom,
    });

    const { GET } = await importListDetailRoute();
    const response = await GET(new Request("http://localhost:3000/api/v1/shopping/lists/550e8400-e29b-41d4-a716-446655440001"), {
      params: Promise.resolve({
        list_id: "550e8400-e29b-41d4-a716-446655440001",
      }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.recipes).toEqual([
      {
        recipe_id: "recipe-deleted",
        recipe_name: "숨김 처리된 레시피",
        recipe_thumbnail: "https://example.com/deleted.jpg",
        shopping_servings: 2,
        planned_servings_total: 2,
      },
    ]);
    expect(serviceFrom).toHaveBeenCalledWith("recipes");
    expect(recipesQuery.in).toHaveBeenCalledWith("id", ["recipe-deleted"]);
  });

  it("returns 422 when item patch body is empty", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn(),
    });

    const { PATCH } = await importItemPatchRoute();
    const response = await PATCH(
      new Request("http://localhost:3000/api/v1/shopping/lists/550e8400-e29b-41d4-a716-446655440001/items/550e8400-e29b-41d4-a716-446655440111", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      {
        params: Promise.resolve({
          list_id: "550e8400-e29b-41d4-a716-446655440001",
          item_id: "550e8400-e29b-41d4-a716-446655440111",
        }),
      },
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

  it("returns 409 when updating item of completed shopping list", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: "550e8400-e29b-41d4-a716-446655440001",
          user_id: "user-1",
          is_completed: true,
        },
        error: null,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") {
          return { select: vi.fn(() => listQuery) };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { PATCH } = await importItemPatchRoute();
    const response = await PATCH(
      new Request("http://localhost:3000/api/v1/shopping/lists/550e8400-e29b-41d4-a716-446655440001/items/550e8400-e29b-41d4-a716-446655440111", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_checked: true }),
      }),
      {
        params: Promise.resolve({
          list_id: "550e8400-e29b-41d4-a716-446655440001",
          item_id: "550e8400-e29b-41d4-a716-446655440111",
        }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "CONFLICT" },
    });
  });

  it("returns 409 before bulk item storage update for a completed shopping list", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: "550e8400-e29b-41d4-a716-446655440001",
          user_id: "user-1",
          is_completed: true,
        },
        error: null,
      },
    ]);
    const update = vi.fn();

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") {
          return { select: vi.fn(() => listQuery) };
        }
        if (table === "shopping_list_items") {
          return { update };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { PATCH } = await importBulkItemPatchRoute();
    const response = await PATCH(
      new Request("http://localhost:3000/api/v1/shopping/lists/550e8400-e29b-41d4-a716-446655440001/items/bulk", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          item_ids: ["550e8400-e29b-41d4-a716-446655440111"],
          is_checked: true,
        }),
      }),
      {
        params: Promise.resolve({
          list_id: "550e8400-e29b-41d4-a716-446655440001",
        }),
      },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      data: null,
      error: { code: "CONFLICT" },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("forces is_checked=false when item is moved to pantry excluded section", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: "550e8400-e29b-41d4-a716-446655440001",
          user_id: "user-1",
          is_completed: false,
        },
        error: null,
      },
    ]);
    const itemQuery = createMaybeSingleQuery([
      {
        data: {
          id: "550e8400-e29b-41d4-a716-446655440111",
          shopping_list_id: "550e8400-e29b-41d4-a716-446655440001",
          ingredient_id: "ing-1",
          display_text: "양파 1개",
          amounts_json: [{ amount: 1, unit: "개" }],
          is_checked: true,
          is_pantry_excluded: false,
          added_to_pantry: false,
          sort_order: 0,
        },
        error: null,
      },
    ]);
    const updateQuery = createUpdateMaybeSingleQuery([
      {
        data: {
          id: "550e8400-e29b-41d4-a716-446655440111",
          shopping_list_id: "550e8400-e29b-41d4-a716-446655440001",
          ingredient_id: "ing-1",
          display_text: "양파 1개",
          amounts_json: [{ amount: 1, unit: "개" }],
          is_checked: false,
          is_pantry_excluded: true,
          added_to_pantry: false,
          sort_order: 0,
        },
        error: null,
      },
    ]);
    const update = vi.fn(() => updateQuery);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") {
          return { select: vi.fn(() => listQuery) };
        }
        if (table === "shopping_list_items") {
          return {
            select: vi.fn(() => itemQuery),
            update,
          };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { PATCH } = await importItemPatchRoute();
    const response = await PATCH(
      new Request("http://localhost:3000/api/v1/shopping/lists/550e8400-e29b-41d4-a716-446655440001/items/550e8400-e29b-41d4-a716-446655440111", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_checked: true, is_pantry_excluded: true }),
      }),
      {
        params: Promise.resolve({
          list_id: "550e8400-e29b-41d4-a716-446655440001",
          item_id: "550e8400-e29b-41d4-a716-446655440111",
        }),
      },
    );
    const body = await response.json();

    expect(update).toHaveBeenCalledWith({
      is_checked: false,
      is_pantry_excluded: true,
    });
    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        id: "550e8400-e29b-41d4-a716-446655440111",
        ingredient_id: "ing-1",
        display_text: "양파 1개",
        amounts_json: [{ amount: 1, unit: "개" }],
        is_checked: false,
        is_pantry_excluded: true,
        added_to_pantry: false,
        sort_order: 0,
      },
      error: null,
    });
  });

  it("returns 200 with unchanged item for idempotent patch", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: "550e8400-e29b-41d4-a716-446655440001",
          user_id: "user-1",
          is_completed: false,
        },
        error: null,
      },
    ]);
    const itemQuery = createMaybeSingleQuery([
      {
        data: {
          id: "550e8400-e29b-41d4-a716-446655440111",
          shopping_list_id: "550e8400-e29b-41d4-a716-446655440001",
          ingredient_id: "ing-1",
          display_text: "양파 1개",
          amounts_json: [{ amount: 1, unit: "개" }],
          is_checked: false,
          is_pantry_excluded: true,
          added_to_pantry: false,
          sort_order: 0,
        },
        error: null,
      },
    ]);
    const update = vi.fn();

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") {
          return { select: vi.fn(() => listQuery) };
        }
        if (table === "shopping_list_items") {
          return {
            select: vi.fn(() => itemQuery),
            update,
          };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { PATCH } = await importItemPatchRoute();
    const response = await PATCH(
      new Request("http://localhost:3000/api/v1/shopping/lists/550e8400-e29b-41d4-a716-446655440001/items/550e8400-e29b-41d4-a716-446655440111", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_checked: false, is_pantry_excluded: true }),
      }),
      {
        params: Promise.resolve({
          list_id: "550e8400-e29b-41d4-a716-446655440001",
          item_id: "550e8400-e29b-41d4-a716-446655440111",
        }),
      },
    );
    const body = await response.json();

    expect(update).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.is_checked).toBe(false);
    expect(body.data.is_pantry_excluded).toBe(true);
  });

  it("bulk-checks purchase items with one update scoped to the owned incomplete list", async () => {
    const firstItemId = "550e8400-e29b-41d4-a716-446655440111";
    const secondItemId = "550e8400-e29b-41d4-a716-446655440112";
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: "550e8400-e29b-41d4-a716-446655440001",
          user_id: "user-1",
          is_completed: false,
        },
        error: null,
      },
    ]);
    const updateQuery = createArrayUpdateQuery([
      {
        data: [
          {
            id: firstItemId,
            shopping_list_id: "550e8400-e29b-41d4-a716-446655440001",
            ingredient_id: "ing-1",
            display_text: "양파 1개",
            amounts_json: [{ amount: 1, unit: "개" }],
            is_checked: true,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 0,
          },
          {
            id: secondItemId,
            shopping_list_id: "550e8400-e29b-41d4-a716-446655440001",
            ingredient_id: "ing-2",
            display_text: "대파 1단",
            amounts_json: [{ amount: 1, unit: "단" }],
            is_checked: true,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 100,
          },
        ],
        error: null,
      },
    ]);
    const update = vi.fn(() => updateQuery);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") {
          return { select: vi.fn(() => listQuery) };
        }
        if (table === "shopping_list_items") {
          return { update };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { PATCH } = await importBulkItemPatchRoute();
    const response = await PATCH(
      new Request("http://localhost:3000/api/v1/shopping/lists/550e8400-e29b-41d4-a716-446655440001/items/bulk", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          item_ids: [firstItemId, secondItemId],
          is_checked: true,
        }),
      }),
      {
        params: Promise.resolve({
          list_id: "550e8400-e29b-41d4-a716-446655440001",
        }),
      },
    );
    const body = await response.json();

    expect(update).toHaveBeenCalledWith({ is_checked: true });
    expect(updateQuery.eq).toHaveBeenCalledWith("shopping_list_id", "550e8400-e29b-41d4-a716-446655440001");
    expect(updateQuery.eq).toHaveBeenCalledWith("is_pantry_excluded", false);
    expect(updateQuery.in).toHaveBeenCalledWith("id", [firstItemId, secondItemId]);
    expect(response.status).toBe(200);
    expect(body.data.items.map((item: { id: string }) => item.id)).toEqual([firstItemId, secondItemId]);
  });

  it("fetchShoppingListDetail helper returns data when envelope is valid", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: {
            id: "list-1",
            title: "4/25 장보기",
            date_range_start: "2026-04-25",
            date_range_end: "2026-04-27",
            is_completed: false,
            completed_at: null,
            created_at: "2026-04-25T00:00:00.000Z",
            updated_at: "2026-04-25T00:00:00.000Z",
            recipes: [],
            items: [],
          },
          error: null,
        }),
        { status: 200 },
      ));
    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchShoppingListDetail("list-1");

    expect(data.id).toBe("list-1");
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/shopping/lists/list-1", expect.any(Object));
  });

  it("updateShoppingListItem helper throws structured error on API failure", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: false,
          data: null,
          error: {
            code: "CONFLICT",
            message: "완료된 장보기 기록은 수정할 수 없어요.",
            fields: [],
          },
        }),
        { status: 409 },
      ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateShoppingListItem("list-1", "item-1", {
        is_checked: true,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(isShoppingApiError(error)).toBe(true);

      if (!isShoppingApiError(error)) {
        return false;
      }

      expect(error.status).toBe(409);
      expect(error.code).toBe("CONFLICT");

      return true;
    });
  });
});
