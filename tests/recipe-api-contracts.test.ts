import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const hasSupabasePublicEnv = vi.fn();
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

vi.mock("@/lib/supabase/env", () => ({
  hasSupabasePublicEnv: () => hasSupabasePublicEnv(),
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
}));

interface QueryResult<T> {
  data: T;
  error: { message: string } | null;
  count?: number | null;
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
    update: vi.fn(() => query),
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    or: vi.fn(() => query),
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

describe("recipe API contracts", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    hasSupabasePublicEnv.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    formatBootstrapErrorMessage.mockClear();
    createServiceRoleClient.mockReturnValue(null);
    hasSupabasePublicEnv.mockReturnValue(true);
    ensurePublicUserRow.mockResolvedValue({});
    ensureUserBootstrapState.mockResolvedValue(undefined);
    delete process.env.HOMECOOK_ENABLE_DISCOVERY_FILTER_MOCK;
  });

  it("wraps recipe list responses in the API envelope", async () => {
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
          source_type: "system",
        },
      ],
      error: null,
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
        })),
      },
      rpc: vi.fn(async () => ({
        data: [],
        error: null,
      })),
      from: vi.fn(() => listQuery),
    });

    const { GET } = await import("@/app/api/v1/recipes/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/recipes?q=%EA%B9%80%EC%B9%98&sort=view_count"),
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
  });

  it("hydrates authenticated recipe list cards with saved book status", async () => {
    const listQuery = createQuery({
      data: [
        {
          id: "recipe-1",
          title: "실패 없는 기본 김치찌개",
          thumbnail_url: "https://example.com/kimchi.jpg",
          tags: ["한식", "간단"],
          base_servings: 2,
          view_count: 10,
          like_count: 4,
          save_count: 2,
          source_type: "system",
        },
        {
          id: "recipe-2",
          title: "딸기 푸딩",
          thumbnail_url: "https://example.com/pudding.jpg",
          tags: ["딸기푸딩"],
          base_servings: 4,
          view_count: 8,
          like_count: 1,
          save_count: 0,
          source_type: "youtube",
        },
      ],
      error: null,
    });
    const savedItemsQuery = createQuery({
      data: [
        {
          recipe_id: "recipe-1",
          book_id: "book-saved",
        },
      ],
      error: null,
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "recipes") return listQuery;
        if (table === "recipe_book_items") return savedItemsQuery;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await import("@/app/api/v1/recipes/route");
    const response = await GET(new NextRequest("http://localhost:3000/api/v1/recipes"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toMatchObject([
      {
        id: "recipe-1",
        user_status: {
          is_saved: true,
          saved_book_ids: ["book-saved"],
        },
      },
      {
        id: "recipe-2",
        user_status: {
          is_saved: false,
          saved_book_ids: [],
        },
      },
    ]);
    expect(savedItemsQuery.in).toHaveBeenCalledWith("recipe_id", ["recipe-1", "recipe-2"]);
    expect(savedItemsQuery.eq).toHaveBeenCalledWith("recipe_books.user_id", "user-1");
    expect(savedItemsQuery.in).toHaveBeenCalledWith("recipe_books.book_type", ["saved", "custom"]);
  });

  it("maps latest sort to created_at descending with deterministic id tie-break", async () => {
    const listQuery = createQuery({
      data: [],
      error: null,
    });

    createRouteHandlerClient.mockResolvedValue({
      from: vi.fn(() => listQuery),
    });

    const { GET } = await import("@/app/api/v1/recipes/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/recipes?sort=latest"),
    );

    expect(response.status).toBe(200);
    expect(listQuery.order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
    expect(listQuery.order).toHaveBeenNthCalledWith(2, "id", { ascending: false });
  });

  it("maps cook_count sort to completed-cooking count descending", async () => {
    const listQuery = createQuery({
      data: [],
      error: null,
    });

    createRouteHandlerClient.mockResolvedValue({
      from: vi.fn(() => listQuery),
    });

    const { GET } = await import("@/app/api/v1/recipes/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/recipes?sort=cook_count"),
    );

    expect(response.status).toBe(200);
    expect(listQuery.order).toHaveBeenNthCalledWith(1, "cook_count", { ascending: false });
    expect(listQuery.order).toHaveBeenNthCalledWith(2, "id", { ascending: true });
  });

  it("returns a wrapped ingredient list for standard-name matches", async () => {
    const ingredientsQuery = createQuery({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440010",
          standard_name: "양파",
          category: "채소",
          category_code: "root_stem",
        },
      ],
      error: null,
    });
    const synonymsQuery = createQuery({
      data: [],
      error: null,
    });

    createRouteHandlerClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "ingredients") return ingredientsQuery;
        if (table === "ingredient_synonyms") return synonymsQuery;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await import("@/app/api/v1/ingredients/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/ingredients?q=%EC%96%91%ED%8C%8C&category=%EC%B1%84%EC%86%8C"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      error: null,
      data: {
        items: [
          {
            id: "550e8400-e29b-41d4-a716-446655440010",
            standard_name: "양파",
            category: "채소",
            category_group_code: "vegetable_mushroom",
            category_code: "root_stem",
            category_label: "뿌리/줄기채소",
          },
        ],
      },
    });
    expect(ingredientsQuery.select).toHaveBeenCalledWith("id, standard_name, category, category_code");
    expect(ingredientsQuery.eq).toHaveBeenCalledWith("category", "채소");
    expect(ingredientsQuery.ilike).toHaveBeenCalledWith("standard_name", "%양파%");
    expect(synonymsQuery.select).toHaveBeenCalledWith(
      "ingredient_id, ingredients!inner(id, standard_name, category, category_code)",
    );
    expect(synonymsQuery.eq).toHaveBeenCalledWith("ingredients.category", "채소");
    expect(synonymsQuery.ilike).toHaveBeenCalledWith("synonym", "%양파%");
  });

  it("filters ingredient list by v2 category code without applying the v1 category query", async () => {
    const ingredientsQuery = createQuery({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440010",
          standard_name: "양파",
          category: "채소",
          category_code: "root_stem",
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440020",
          standard_name: "딸기",
          category: "과일",
          category_code: "fruit",
        },
      ],
      error: null,
    });
    const synonymsQuery = createQuery({
      data: [],
      error: null,
    });

    createRouteHandlerClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "ingredients") return ingredientsQuery;
        if (table === "ingredient_synonyms") return synonymsQuery;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await import("@/app/api/v1/ingredients/route");
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/v1/ingredients?category=%EC%B1%84%EC%86%8C&category_code=fruit",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toEqual([
      {
        id: "550e8400-e29b-41d4-a716-446655440020",
        standard_name: "딸기",
        category: "과일",
        category_group_code: "fruit_nut",
        category_code: "fruit",
        category_label: "과일",
      },
    ]);
    expect(ingredientsQuery.eq).not.toHaveBeenCalledWith("category", "채소");
    expect(synonymsQuery.eq).not.toHaveBeenCalledWith("ingredients.category", "채소");
  });

  it("filters ingredient list by v2 group code with v1 fallback metadata", async () => {
    const ingredientsQuery = createQuery({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440020",
          standard_name: "딸기",
          category: "과일",
          category_code: null,
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440030",
          standard_name: "소금",
          category: "양념",
          category_code: null,
        },
      ],
      error: null,
    });
    const synonymsQuery = createQuery({
      data: [],
      error: null,
    });

    createRouteHandlerClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "ingredients") return ingredientsQuery;
        if (table === "ingredient_synonyms") return synonymsQuery;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await import("@/app/api/v1/ingredients/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/ingredients?category_group_code=fruit_nut"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toEqual([
      {
        id: "550e8400-e29b-41d4-a716-446655440020",
        standard_name: "딸기",
        category: "과일",
        category_group_code: "fruit_nut",
        category_code: null,
        category_label: "과일",
      },
    ]);
  });

  it("returns an empty ingredient list for non-canonical category labels", async () => {
    const { GET } = await import("@/app/api/v1/ingredients/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/ingredients?category=%EB%8B%A8%EB%B0%B1%EC%A7%88"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { items: [] },
      error: null,
    });
    expect(createRouteHandlerClient).not.toHaveBeenCalled();
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("returns an empty ingredient list for unknown v2 taxonomy codes", async () => {
    const { GET } = await import("@/app/api/v1/ingredients/route");

    const [categoryCodeResponse, groupCodeResponse] = await Promise.all([
      GET(new NextRequest("http://localhost:3000/api/v1/ingredients?category_code=unknown")),
      GET(new NextRequest("http://localhost:3000/api/v1/ingredients?category_group_code=unknown")),
    ]);

    await expect(categoryCodeResponse.json()).resolves.toEqual({
      success: true,
      data: { items: [] },
      error: null,
    });
    await expect(groupCodeResponse.json()).resolves.toEqual({
      success: true,
      data: { items: [] },
      error: null,
    });
    expect(createRouteHandlerClient).not.toHaveBeenCalled();
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("returns mock ingredients for manual browser testing when discovery-filter mock mode is enabled", async () => {
    process.env.HOMECOOK_ENABLE_DISCOVERY_FILTER_MOCK = "1";

    const { GET } = await import("@/app/api/v1/ingredients/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/ingredients?q=%ED%8C%8C&category=%EC%B1%84%EC%86%8C"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toEqual([
      {
        id: "550e8400-e29b-41d4-a716-446655440010",
        standard_name: "양파",
        category: "채소",
        category_group_code: "vegetable_mushroom",
        category_code: null,
        category_label: "채소",
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440011",
        standard_name: "대파",
        category: "채소",
        category_group_code: "vegetable_mushroom",
        category_code: null,
        category_label: "채소",
      },
    ]);
    expect(createRouteHandlerClient).not.toHaveBeenCalled();
  });

  it("returns ingredient matches from synonyms without duplicating the same ingredient", async () => {
    const ingredientsQuery = createQuery({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440010",
          standard_name: "양파",
          category: "채소",
          category_code: null,
        },
      ],
      error: null,
    });
    const synonymsQuery = createQuery({
      data: [
        {
          ingredient_id: "550e8400-e29b-41d4-a716-446655440010",
          ingredients: {
            id: "550e8400-e29b-41d4-a716-446655440010",
            standard_name: "양파",
            category: "채소",
            category_code: null,
          },
        },
        {
          ingredient_id: "550e8400-e29b-41d4-a716-446655440011",
          ingredients: {
            id: "550e8400-e29b-41d4-a716-446655440011",
            standard_name: "대파",
            category: "채소",
            category_code: "root_stem",
          },
        },
      ],
      error: null,
    });

    createRouteHandlerClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "ingredients") return ingredientsQuery;
        if (table === "ingredient_synonyms") return synonymsQuery;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await import("@/app/api/v1/ingredients/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/ingredients?q=%ED%8C%8C"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toEqual([
      {
        id: "550e8400-e29b-41d4-a716-446655440010",
        standard_name: "양파",
        category: "채소",
        category_group_code: "vegetable_mushroom",
        category_code: null,
        category_label: "채소",
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440011",
        standard_name: "대파",
        category: "채소",
        category_group_code: "vegetable_mushroom",
        category_code: "root_stem",
        category_label: "뿌리/줄기채소",
      },
    ]);
  });

  it.each([
    ["청도반시", "연시", "과일", "550e8400-e29b-41d4-a716-446655440101"],
    ["국수", "소면", "곡류", "550e8400-e29b-41d4-a716-446655440102"],
    ["레몬착즙", "레몬즙", "과일", "550e8400-e29b-41d4-a716-446655440103"],
    ["멥쌀밥", "쌀밥", "곡류", "550e8400-e29b-41d4-a716-446655440104"],
  ])("searches reviewed synonym %s as canonical ingredient %s", async (
    synonym,
    canonicalName,
    category,
    ingredientId,
  ) => {
    const ingredientsQuery = createQuery({
      data: [],
      error: null,
    });
    const synonymsQuery = createQuery({
      data: [
        {
          ingredient_id: ingredientId,
          ingredients: {
            id: ingredientId,
            standard_name: canonicalName,
            category,
            category_code: null,
          },
        },
      ],
      error: null,
    });

    createRouteHandlerClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "ingredients") return ingredientsQuery;
        if (table === "ingredient_synonyms") return synonymsQuery;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await import("@/app/api/v1/ingredients/route");
    const response = await GET(
      new NextRequest(`http://localhost:3000/api/v1/ingredients?q=${encodeURIComponent(synonym)}`),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toEqual([
      expect.objectContaining({
        id: ingredientId,
        standard_name: canonicalName,
        category,
      }),
    ]);
    expect(body.data.items).not.toEqual([
      expect.objectContaining({
        standard_name: synonym,
      }),
    ]);
    expect(ingredientsQuery.ilike).toHaveBeenCalledWith("standard_name", `%${synonym}%`);
    expect(synonymsQuery.ilike).toHaveBeenCalledWith("synonym", `%${synonym}%`);
  });

  it("falls back to standard-name matches when the synonym query fails", async () => {
    const ingredientsQuery = createQuery({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440010",
          standard_name: "양파",
          category: "채소",
          category_code: null,
        },
      ],
      error: null,
    });
    const synonymsQuery = createQuery({
      data: null,
      error: { message: "boom" },
    });

    createRouteHandlerClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "ingredients") return ingredientsQuery;
        if (table === "ingredient_synonyms") return synonymsQuery;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await import("@/app/api/v1/ingredients/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/ingredients?q=%EC%96%91%ED%8C%8C"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toEqual([
      {
        id: "550e8400-e29b-41d4-a716-446655440010",
        standard_name: "양파",
        category: "채소",
        category_group_code: "vegetable_mushroom",
        category_code: null,
        category_label: "채소",
      },
    ]);
  });

  it("returns an empty wrapped recipe list when ingredient_ids contains no valid UUIDs", async () => {
    const { GET } = await import("@/app/api/v1/recipes/route");
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/recipes?ingredient_ids=bad,,123"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        items: [],
        next_cursor: null,
        has_next: false,
      },
      error: null,
    });
    expect(createRouteHandlerClient).not.toHaveBeenCalled();
  });

  it("returns a mock filtered recipe list for manual browser testing when discovery-filter mock mode is enabled", async () => {
    process.env.HOMECOOK_ENABLE_DISCOVERY_FILTER_MOCK = "1";

    const { GET } = await import("@/app/api/v1/recipes/route");
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/v1/recipes?ingredient_ids=550e8400-e29b-41d4-a716-446655440010,550e8400-e29b-41d4-a716-446655440011",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toEqual([
      expect.objectContaining({
        id: "mock-kimchi-jjigae",
        title: "집밥 김치찌개",
      }),
    ]);
    expect(createRouteHandlerClient).not.toHaveBeenCalled();
  });

  it("returns a server error instead of mock recipes when the real recipe query fails", async () => {
    const listQuery = createQuery({
      data: null,
      error: { message: "database unavailable" },
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
        })),
      },
      from: vi.fn(() => listQuery),
    });

    const { GET } = await import("@/app/api/v1/recipes/route");
    const response = await GET(new NextRequest("http://localhost:3000/api/v1/recipes?q=%EA%B9%80%EC%B9%98"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "INTERNAL_ERROR",
      },
    });
  });

  it("returns an empty real recipe list instead of mock recipes when the database has no matches", async () => {
    const listQuery = createQuery({
      data: [],
      error: null,
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
        })),
      },
      from: vi.fn(() => listQuery),
    });

    const { GET } = await import("@/app/api/v1/recipes/route");
    const response = await GET(new NextRequest("http://localhost:3000/api/v1/recipes"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      items: [],
      next_cursor: null,
      has_next: false,
    });
  });

  it("returns a next cursor when the recipe list has more rows than the requested limit", async () => {
    const listQuery = createQuery({
      data: [
        {
          id: "recipe-3",
          title: "새 레시피",
          thumbnail_url: null,
          tags: ["한식"],
          base_servings: 2,
          view_count: 30,
          like_count: 0,
          save_count: 0,
          plan_count: 0,
          cook_count: 0,
          created_at: "2026-06-16T10:00:00.000Z",
          source_type: "system",
        },
        {
          id: "recipe-2",
          title: "중간 레시피",
          thumbnail_url: null,
          tags: ["한식"],
          base_servings: 2,
          view_count: 20,
          like_count: 0,
          save_count: 0,
          plan_count: 0,
          cook_count: 0,
          created_at: "2026-06-15T10:00:00.000Z",
          source_type: "system",
        },
        {
          id: "recipe-1",
          title: "오래된 레시피",
          thumbnail_url: null,
          tags: ["한식"],
          base_servings: 2,
          view_count: 10,
          like_count: 0,
          save_count: 0,
          plan_count: 0,
          cook_count: 0,
          created_at: "2026-06-14T10:00:00.000Z",
          source_type: "system",
        },
      ],
      error: null,
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
        })),
      },
      from: vi.fn(() => listQuery),
    });

    const { GET } = await import("@/app/api/v1/recipes/route");
    const response = await GET(new NextRequest("http://localhost:3000/api/v1/recipes?sort=latest&limit=2"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(listQuery.limit).toHaveBeenCalledWith(3);
    expect(body.data.items.map((item: { id: string }) => item.id)).toEqual(["recipe-3", "recipe-2"]);
    expect(body.data.has_next).toBe(true);
    expect(typeof body.data.next_cursor).toBe("string");
  });

  it("applies ingredient_ids as an AND filter before loading recipe cards", async () => {
    const ingredientRowsQuery = createQuery({
      data: [
        {
          recipe_id: "recipe-1",
          ingredient_id: "550e8400-e29b-41d4-a716-446655440000",
        },
        {
          recipe_id: "recipe-1",
          ingredient_id: "550e8400-e29b-41d4-a716-446655440001",
        },
        {
          recipe_id: "recipe-1",
          ingredient_id: "550e8400-e29b-41d4-a716-446655440000",
        },
        {
          recipe_id: "recipe-2",
          ingredient_id: "550e8400-e29b-41d4-a716-446655440000",
        },
      ],
      error: null,
    });
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
          source_type: "system",
        },
      ],
      error: null,
    });

    createRouteHandlerClient.mockResolvedValue({
      rpc: vi.fn(async () => ({
        data: [],
        error: null,
      })),
      from: vi.fn((table: string) => {
        if (table === "recipe_ingredients") return ingredientRowsQuery;
        if (table === "recipes") return listQuery;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await import("@/app/api/v1/recipes/route");
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/v1/recipes?q=%EA%B9%80%EC%B9%98&ingredient_ids=550e8400-e29b-41d4-a716-446655440000,550e8400-e29b-41d4-a716-446655440001",
      ),
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
    expect(ingredientRowsQuery.in).toHaveBeenCalledWith("ingredient_id", [
      "550e8400-e29b-41d4-a716-446655440000",
      "550e8400-e29b-41d4-a716-446655440001",
    ]);
    expect(ingredientRowsQuery.select).toHaveBeenCalledWith("recipe_id, ingredient_id");
    expect(listQuery.in).toHaveBeenCalledWith("id", ["recipe-1"]);
    expect(listQuery.ilike).toHaveBeenCalledWith("title", "%김치%");
  });

  it("returns tag-classified themed recipe sections in the API envelope", async () => {
    const listQuery = createQuery({
      data: [
        {
          id: "recipe-1",
          title: "실패 없는 기본 김치찌개",
          thumbnail_url: "https://example.com/kimchi.jpg",
          tags: ["한식", "간단"],
          base_servings: 2,
          view_count: 10,
          like_count: 4,
          save_count: 2,
          source_type: "system",
        },
        {
          id: "recipe-2",
          title: "불 없이 딸기 우유 푸딩",
          thumbnail_url: "https://example.com/pudding.jpg",
          tags: ["딸기푸딩", "디저트"],
          base_servings: 4,
          view_count: 8,
          like_count: 1,
          save_count: 0,
          source_type: "youtube",
        },
      ],
      error: null,
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
        })),
      },
      rpc: vi.fn(async (functionName: string) => {
        expect(functionName).toBe("list_home_theme_recipes");

        return {
          data: [
            {
              tag_normalized_key: "한식",
              tag_label: "한식",
              tag_slug: "korean",
              theme_rank: 1,
              recipe_rank: 1,
              id: "recipe-1",
              title: "실패 없는 기본 김치찌개",
              thumbnail_url: "https://example.com/kimchi.jpg",
              tags: ["한식", "간단"],
              base_servings: 2,
              view_count: 10,
              like_count: 4,
              save_count: 2,
              source_type: "system",
            },
            {
              tag_normalized_key: "디저트",
              tag_label: "디저트",
              tag_slug: "dessert",
              theme_rank: 2,
              recipe_rank: 1,
              id: "recipe-2",
              title: "불 없이 딸기 우유 푸딩",
              thumbnail_url: "https://example.com/pudding.jpg",
              tags: ["딸기푸딩", "디저트"],
              base_servings: 4,
              view_count: 8,
              like_count: 1,
              save_count: 0,
              source_type: "youtube",
            },
          ],
          error: null,
        };
      }),
      from: vi.fn(() => listQuery),
    });

    const { GET } = await import("@/app/api/v1/recipes/themes/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.error).toBeNull();
    const themeIds = body.data.themes.map((theme: { id: string }) => theme.id);
    expect(themeIds).toContain("popular");
    expect(themeIds).toContain("youtube");
    expect(themeIds).toContain("fail-safe");
    expect(themeIds).toContain("no-cook-sweet");
    expect(themeIds).toContain("korean");
    expect(themeIds).toContain("dessert");
    expect(themeIds).not.toContain("saved-favorites");
    const popularTheme = body.data.themes.find((theme: { id: string }) => theme.id === "popular");
    expect(popularTheme.title).toBe("조회 많은 레시피");
    expect(popularTheme.recipes[0]).toMatchObject({ id: "recipe-1" });
    expect(body.data.themes.find((theme: { id: string }) => theme.id === "youtube")).toMatchObject({
      title: "유튜브에서 가져온 레시피",
      recipes: [
        {
          id: "recipe-2",
        },
      ],
    });
    expect(body.data.themes.find((theme: { id: string }) => theme.id === "fail-safe")).toMatchObject({
      title: "실패 걱정 없는 메뉴",
      recipes: [
        {
          id: "recipe-1",
        },
      ],
    });
    expect(body.data.themes.find((theme: { id: string }) => theme.id === "no-cook-sweet")).toMatchObject({
      title: "불 없이 달달하게",
      recipes: [
        {
          id: "recipe-2",
        },
      ],
    });
    expect(body.data.themes.find((theme: { id: string }) => theme.id === "dessert")).toMatchObject({
      title: "디저트",
      tag_key: "디저트",
      tag_label: "디저트",
      recipes: [
        {
          id: "recipe-2",
        },
      ],
    });
  });

  it("returns mock themed recipe sections for manual browser testing when discovery-filter mock mode is enabled", async () => {
    process.env.HOMECOOK_ENABLE_DISCOVERY_FILTER_MOCK = "1";

    const { GET } = await import("@/app/api/v1/recipes/themes/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      error: null,
      data: {
        themes: [
          {
            id: "popular",
            recipes: [
              {
                id: "mock-kimchi-jjigae",
              },
            ],
          },
        ],
      },
    });
    expect(createRouteHandlerClient).not.toHaveBeenCalled();
  });

  it("returns a wrapped 404 when the recipe does not exist", async () => {
    const recipeQuery = createQuery({
      data: null,
      error: null,
    });
    const sourceQuery = createQuery({
      data: null,
      error: null,
    });
    const ingredientsQuery = createQuery({
      data: [],
      error: null,
    });
    const stepsQuery = createQuery({
      data: [],
      error: null,
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "recipes") return recipeQuery;
        if (table === "recipe_sources") return sourceQuery;
        if (table === "recipe_ingredients") return ingredientsQuery;
        if (table === "recipe_steps") return stepsQuery;

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await import("@/app/api/v1/recipes/[id]/route");
    const response = await GET(new Request("http://localhost:3000/api/v1/recipes/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "RESOURCE_NOT_FOUND",
        fields: [],
      },
    });
  });

  it("awaits the recipe detail view-count persistence when service role is available", async () => {
    const recipeReadQuery = createQuery({
      data: {
        id: "recipe-1",
        title: "김치찌개",
        description: null,
        thumbnail_url: null,
        base_servings: 2,
        tags: ["한식"],
        source_type: "system",
        view_count: 10,
        like_count: 0,
        save_count: 0,
        plan_count: 0,
        cook_count: 0,
      },
      error: null,
    });
    const viewCountRpcQuery = createQuery({
      data: {
        id: "recipe-1",
        view_count: 11,
      },
      error: null,
    });
    const sourceQuery = createQuery({
      data: null,
      error: null,
    });
    const ingredientsQuery = createQuery({
      data: [],
      error: null,
    });
    const stepsQuery = createQuery({
      data: [],
      error: null,
    });
    const recipesTable = {
      select: vi.fn(() => recipeReadQuery),
    };
    const rpc = vi.fn(() => viewCountRpcQuery);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
        })),
      },
    });
    createServiceRoleClient.mockReturnValue({
      rpc,
      from: vi.fn((table: string) => {
        if (table === "recipes") return recipesTable;
        if (table === "recipe_sources") return sourceQuery;
        if (table === "recipe_ingredients") return ingredientsQuery;
        if (table === "recipe_steps") return stepsQuery;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await import("@/app/api/v1/recipes/[id]/route");
    const response = await GET(new Request("http://localhost:3000/api/v1/recipes/recipe-1"), {
      params: Promise.resolve({ id: "recipe-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("increment_recipe_view_count", {
      p_recipe_id: "recipe-1",
    });
    expect(viewCountRpcQuery.maybeSingle).toHaveBeenCalled();
    expect(body.data.view_count).toBe(11);
  });

  it("uses actual planner meal count for recipe detail plan_count", async () => {
    const recipeReadQuery = createQuery({
      data: {
        id: "recipe-1",
        title: "김치찌개",
        description: null,
        thumbnail_url: null,
        base_servings: 2,
        tags: ["한식"],
        source_type: "system",
        view_count: 10,
        like_count: 0,
        save_count: 0,
        plan_count: 0,
        cook_count: 0,
      },
      error: null,
    });
    const viewCountRpcQuery = createQuery({
      data: {
        id: "recipe-1",
        view_count: 11,
      },
      error: null,
    });
    const sourceQuery = createQuery({
      data: null,
      error: null,
    });
    const ingredientsQuery = createQuery({
      data: [],
      error: null,
    });
    const stepsQuery = createQuery({
      data: [],
      error: null,
    });
    const mealsCountQuery = createQuery({
      data: null,
      error: null,
      count: 3,
    });
    const recipesTable = {
      select: vi.fn(() => recipeReadQuery),
    };
    const mealsTable = {
      select: vi.fn(() => mealsCountQuery),
    };
    const rpc = vi.fn(() => viewCountRpcQuery);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
        })),
      },
    });
    createServiceRoleClient.mockReturnValue({
      rpc,
      from: vi.fn((table: string) => {
        if (table === "recipes") return recipesTable;
        if (table === "recipe_sources") return sourceQuery;
        if (table === "recipe_ingredients") return ingredientsQuery;
        if (table === "recipe_steps") return stepsQuery;
        if (table === "meals") return mealsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await import("@/app/api/v1/recipes/[id]/route");
    const response = await GET(new Request("http://localhost:3000/api/v1/recipes/recipe-1"), {
      params: Promise.resolve({ id: "recipe-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mealsTable.select).toHaveBeenCalledWith("id", {
      count: "exact",
      head: true,
    });
    expect(mealsCountQuery.eq).toHaveBeenCalledWith("recipe_id", "recipe-1");
    expect(body.data.plan_count).toBe(3);
  });

  it("returns deduped public recipe image candidates for the detail gallery", async () => {
    const recipeReadQuery = createQuery({
      data: {
        id: "recipe-1",
        title: "석류 보쌈김치",
        description: null,
        thumbnail_url: "https://cdn.example.com/primary.png",
        base_servings: 1,
        tags: ["한식"],
        source_type: "system",
        view_count: 10,
        like_count: 0,
        save_count: 0,
        plan_count: 0,
        cook_count: 0,
      },
      error: null,
    });
    const sourceQuery = createQuery({
      data: {
        youtube_url: null,
        youtube_video_id: null,
        extraction_meta_json: {
          image_candidates: [
            {
              url: "https://cdn.example.com/primary.png",
              role: "primary",
              width: 320,
              height: 321,
            },
            {
              url: "https://cdn.example.com/alternate.png",
              role: "alternate",
              width: 552,
              height: 534,
            },
            {
              url: "https://cdn.example.com/step.png",
              role: "step",
              width: 119,
              height: 80,
            },
          ],
        },
      },
      error: null,
    });
    const ingredientsQuery = createQuery({
      data: [],
      error: null,
    });
    const stepsQuery = createQuery({
      data: [],
      error: null,
    });
    const mealsCountQuery = createQuery({
      data: null,
      error: null,
      count: 0,
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "recipes") return recipeReadQuery;
        if (table === "recipe_sources") return sourceQuery;
        if (table === "recipe_ingredients") return ingredientsQuery;
        if (table === "recipe_steps") return stepsQuery;
        if (table === "meals") return mealsCountQuery;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await import("@/app/api/v1/recipes/[id]/route");
    const response = await GET(new Request("http://localhost:3000/api/v1/recipes/recipe-1"), {
      params: Promise.resolve({ id: "recipe-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(sourceQuery.select).toHaveBeenCalledWith(
      "youtube_url, youtube_video_id, extraction_meta_json",
    );
    expect(body.data.photos).toEqual([
      {
        url: "https://cdn.example.com/primary.png",
        role: "primary",
        label: null,
        width: 320,
        height: 321,
      },
      {
        url: "https://cdn.example.com/alternate.png",
        role: "alternate",
        label: null,
        width: 552,
        height: 534,
      },
      {
        url: "https://cdn.example.com/step.png",
        role: "step",
        label: null,
        width: 119,
        height: 80,
      },
    ]);
  });

  it("falls back to a direct recipe update when the view-count RPC is unavailable", async () => {
    const recipeReadQuery = createQuery({
      data: {
        id: "recipe-1",
        title: "김치찌개",
        description: null,
        thumbnail_url: null,
        base_servings: 2,
        tags: ["한식"],
        source_type: "system",
        view_count: 10,
        like_count: 0,
        save_count: 0,
        plan_count: 0,
        cook_count: 0,
      },
      error: null,
    });
    const viewCountRpcQuery = createQuery({
      data: null,
      error: { message: "function public.increment_recipe_view_count does not exist" },
    });
    const viewCountUpdateQuery = createQuery({
      data: {
        id: "recipe-1",
        view_count: 11,
      },
      error: null,
    });
    const sourceQuery = createQuery({
      data: null,
      error: null,
    });
    const ingredientsQuery = createQuery({
      data: [],
      error: null,
    });
    const stepsQuery = createQuery({
      data: [],
      error: null,
    });
    const recipesTable = {
      select: vi.fn(() => recipeReadQuery),
      update: vi.fn(() => viewCountUpdateQuery),
    };
    const rpc = vi.fn(() => viewCountRpcQuery);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
        })),
      },
    });
    createServiceRoleClient.mockReturnValue({
      rpc,
      from: vi.fn((table: string) => {
        if (table === "recipes") return recipesTable;
        if (table === "recipe_sources") return sourceQuery;
        if (table === "recipe_ingredients") return ingredientsQuery;
        if (table === "recipe_steps") return stepsQuery;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await import("@/app/api/v1/recipes/[id]/route");
    const response = await GET(new Request("http://localhost:3000/api/v1/recipes/recipe-1"), {
      params: Promise.resolve({ id: "recipe-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("increment_recipe_view_count", {
      p_recipe_id: "recipe-1",
    });
    expect(recipesTable.update).toHaveBeenCalledWith({ view_count: 11 });
    expect(viewCountUpdateQuery.eq).toHaveBeenCalledWith("id", "recipe-1");
    expect(viewCountUpdateQuery.eq).toHaveBeenCalledWith("view_count", 10);
    expect(viewCountUpdateQuery.maybeSingle).toHaveBeenCalled();
    expect(body.data.view_count).toBe(11);
  });

  it("retries the direct view-count fallback when a concurrent update wins first", async () => {
    const recipeReadQuery = createQuery({
      data: {
        id: "recipe-1",
        title: "김치찌개",
        description: null,
        thumbnail_url: null,
        base_servings: 2,
        tags: ["한식"],
        source_type: "system",
        view_count: 10,
        like_count: 0,
        save_count: 0,
        plan_count: 0,
        cook_count: 0,
      },
      error: null,
    });
    const viewCountRpcQuery = createQuery({
      data: null,
      error: { message: "function public.increment_recipe_view_count does not exist" },
    });
    const missedUpdateQuery = createQuery({
      data: null,
      error: null,
    });
    const refreshedViewCountQuery = createQuery({
      data: {
        id: "recipe-1",
        view_count: 11,
      },
      error: null,
    });
    const retryUpdateQuery = createQuery({
      data: {
        id: "recipe-1",
        view_count: 12,
      },
      error: null,
    });
    const sourceQuery = createQuery({
      data: null,
      error: null,
    });
    const ingredientsQuery = createQuery({
      data: [],
      error: null,
    });
    const stepsQuery = createQuery({
      data: [],
      error: null,
    });
    const recipesTable = {
      select: vi
        .fn()
        .mockImplementationOnce(() => recipeReadQuery)
        .mockImplementationOnce(() => refreshedViewCountQuery),
      update: vi
        .fn()
        .mockImplementationOnce(() => missedUpdateQuery)
        .mockImplementationOnce(() => retryUpdateQuery),
    };
    const rpc = vi.fn(() => viewCountRpcQuery);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
        })),
      },
    });
    createServiceRoleClient.mockReturnValue({
      rpc,
      from: vi.fn((table: string) => {
        if (table === "recipes") return recipesTable;
        if (table === "recipe_sources") return sourceQuery;
        if (table === "recipe_ingredients") return ingredientsQuery;
        if (table === "recipe_steps") return stepsQuery;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await import("@/app/api/v1/recipes/[id]/route");
    const response = await GET(new Request("http://localhost:3000/api/v1/recipes/recipe-1"), {
      params: Promise.resolve({ id: "recipe-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(recipesTable.update).toHaveBeenNthCalledWith(1, { view_count: 11 });
    expect(missedUpdateQuery.eq).toHaveBeenCalledWith("view_count", 10);
    expect(refreshedViewCountQuery.eq).toHaveBeenCalledWith("id", "recipe-1");
    expect(recipesTable.update).toHaveBeenNthCalledWith(2, { view_count: 12 });
    expect(retryUpdateQuery.eq).toHaveBeenCalledWith("view_count", 11);
    expect(body.data.view_count).toBe(12);
  });

  it("does not serve the QA mock recipe from the real DB route when fixture mode is off", async () => {
    const recipeQuery = createQuery({
      data: null,
      error: null,
    });
    const sourceQuery = createQuery({
      data: null,
      error: null,
    });
    const ingredientsQuery = createQuery({
      data: [],
      error: null,
    });
    const stepsQuery = createQuery({
      data: [],
      error: null,
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "recipes") return recipeQuery;
        if (table === "recipe_sources") return sourceQuery;
        if (table === "recipe_ingredients") return ingredientsQuery;
        if (table === "recipe_steps") return stepsQuery;

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await import("@/app/api/v1/recipes/[id]/route");
    const response = await GET(new Request("http://localhost:3000/api/v1/recipes/mock-kimchi-jjigae"), {
      params: Promise.resolve({ id: "mock-kimchi-jjigae" }),
    });
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

  it("uses the atomic create_manual_recipe RPC for manual recipe creation when available", async () => {
    const ingredientId = "550e8400-e29b-41d4-a716-446655440010";
    const methodId = "550e8400-e29b-41d4-a716-446655440020";
    const ingredientLookupQuery = createQuery({
      data: [{ id: ingredientId }],
      error: null,
    });
    const cookingMethodLookupQuery = createQuery({
      data: [{ id: methodId, label: "끓이기" }],
      error: null,
    });
    const rpc = vi.fn(async () => ({
      data: {
        id: "recipe-rpc",
        title: "직접 등록 레시피",
        source_type: "manual",
        created_by: "user-1",
        base_servings: 2,
      },
      error: null,
    }));
    const recipesInsert = vi.fn();
    const ingredientInsert = vi.fn();
    const stepInsert = vi.fn();

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
        })),
      },
    });
    createServiceRoleClient.mockReturnValue({
      rpc,
      from: vi.fn((table: string) => {
        if (table === "ingredients") return { select: vi.fn(() => ingredientLookupQuery) };
        if (table === "cooking_methods") return { select: vi.fn(() => cookingMethodLookupQuery) };
        if (table === "recipes") return { insert: recipesInsert };
        if (table === "recipe_ingredients") return { insert: ingredientInsert };
        if (table === "recipe_steps") return { insert: stepInsert };
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await import("@/app/api/v1/recipes/route");
    const response = await POST(
      new Request("http://localhost:3000/api/v1/recipes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "직접 등록 레시피",
          base_servings: 2,
          ingredients: [
            {
              ingredient_id: ingredientId,
              standard_name: "양파",
              amount: 1,
              unit: "개",
              ingredient_type: "QUANT",
              display_text: "양파 1개",
              sort_order: 0,
              scalable: true,
            },
          ],
          steps: [
            {
              step_number: 1,
              instruction: "끓입니다.",
              cooking_method_id: methodId,
              ingredients_used: [{ ingredient_id: ingredientId, amount: 1, unit: "개" }],
              heat_level: "중",
              duration_seconds: 60,
              duration_text: "1분",
            },
          ],
        }),
      }),
    );
    const body = await response.json();

    expect(rpc).toHaveBeenCalledWith("create_manual_recipe", expect.objectContaining({
      p_user_id: "user-1",
      p_title: "직접 등록 레시피",
      p_base_servings: 2,
      p_thumbnail_url: null,
      p_tags: expect.any(Array),
      p_ingredients: [
        {
          ingredient_id: ingredientId,
          amount: 1,
          unit: "개",
          ingredient_type: "QUANT",
          display_text: "양파 1개",
          scalable: true,
          sort_order: 0,
        },
      ],
      p_steps: [
        {
          step_number: 1,
          instruction: "끓입니다.",
          cooking_method_id: methodId,
          ingredients_used: [{ ingredient_id: ingredientId, amount: 1, unit: "개", cut_size: null }],
          heat_level: "중",
          duration_seconds: 60,
          duration_text: "1분",
        },
      ],
    }));
    expect(recipesInsert).not.toHaveBeenCalled();
    expect(ingredientInsert).not.toHaveBeenCalled();
    expect(stepInsert).not.toHaveBeenCalled();
    expect(response.status).toBe(201);
    expect(body.data).toEqual({
      id: "recipe-rpc",
      title: "직접 등록 레시피",
      source_type: "manual",
      created_by: "user-1",
      base_servings: 2,
    });
  });

});
