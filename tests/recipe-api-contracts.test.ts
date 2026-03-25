import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
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

function createQuery<T>(result: QueryResult<T>) {
  const query = {
    update: vi.fn(() => query),
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

describe("recipe API contracts", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    createServiceRoleClient.mockReturnValue(null);
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

  it("returns a wrapped ingredient list for standard-name matches", async () => {
    const ingredientsQuery = createQuery({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440010",
          standard_name: "양파",
          category: "채소",
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
          },
        ],
      },
    });
    expect(ingredientsQuery.eq).toHaveBeenCalledWith("category", "채소");
    expect(ingredientsQuery.ilike).toHaveBeenCalledWith("standard_name", "%양파%");
    expect(synonymsQuery.eq).toHaveBeenCalledWith("ingredients.category", "채소");
    expect(synonymsQuery.ilike).toHaveBeenCalledWith("synonym", "%양파%");
  });

  it("returns ingredient matches from synonyms without duplicating the same ingredient", async () => {
    const ingredientsQuery = createQuery({
      data: [
        {
          id: "550e8400-e29b-41d4-a716-446655440010",
          standard_name: "양파",
          category: "채소",
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
          },
        },
        {
          ingredient_id: "550e8400-e29b-41d4-a716-446655440011",
          ingredients: {
            id: "550e8400-e29b-41d4-a716-446655440011",
            standard_name: "대파",
            category: "채소",
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
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440011",
        standard_name: "대파",
        category: "채소",
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

  it("applies ingredient_ids as an AND filter before loading recipe cards", async () => {
    const ingredientRowsQuery = createQuery({
      data: [
        {
          recipe_id: "recipe-1",
          count: 2,
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
    expect(ingredientRowsQuery.select).toHaveBeenCalledWith("recipe_id, ingredient_id.count()");
    expect(ingredientRowsQuery.eq).toHaveBeenCalledWith("ingredient_id.count()", 2);
    expect(listQuery.in).toHaveBeenCalledWith("id", ["recipe-1"]);
    expect(listQuery.ilike).toHaveBeenCalledWith("title", "%김치%");
  });

  it("returns themed recipe sections in the API envelope", async () => {
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
      from: vi.fn(() => listQuery),
    });

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
            title: "이번 주 인기 레시피",
            recipes: [
              {
                id: "recipe-1",
              },
            ],
          },
        ],
      },
    });
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

  it("rejects unsupported auth providers with a wrapped 400 error", async () => {
    const { POST } = await import("@/app/api/v1/auth/login/route");
    const response = await POST(
      new Request("http://localhost:3000/api/v1/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          provider: "github",
          access_token: "provider-token",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "INVALID_REQUEST",
        fields: [
          {
            field: "provider",
          },
        ],
      },
    });
  });

  it("exchanges the social token and returns a wrapped login payload", async () => {
    const signInWithIdToken = vi.fn(async () => ({
      data: {
        session: {
          access_token: "supabase-access-token",
          refresh_token: "supabase-refresh-token",
        },
        user: {
          id: "user-1",
          email: "cook@example.com",
          user_metadata: {
            avatar_url: "https://example.com/profile.png",
          },
        },
      },
      error: null,
    }));

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        signInWithIdToken,
      },
    });

    const { POST } = await import("@/app/api/v1/auth/login/route");
    const response = await POST(
      new Request("http://localhost:3000/api/v1/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          provider: "google",
          access_token: "google-id-token",
        }),
      }),
    );
    const body = await response.json();

    expect(signInWithIdToken).toHaveBeenCalledWith({
      provider: "google",
      token: "google-id-token",
      access_token: "google-id-token",
    });
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      error: null,
      data: {
        token: "supabase-access-token",
        refresh_token: "supabase-refresh-token",
        user: {
          id: "user-1",
          email: "cook@example.com",
          profile_image_url: "https://example.com/profile.png",
          is_new_user: true,
        },
      },
    });
  });

  it("requires authentication before updating the profile", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
        })),
      },
      from: vi.fn(),
    });

    const { PATCH } = await import("@/app/api/v1/auth/profile/route");
    const response = await PATCH(
      new Request("http://localhost:3000/api/v1/auth/profile", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          nickname: "집밥러",
        }),
      }),
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

  it("updates the nickname and returns the wrapped user payload", async () => {
    const usersQuery = createQuery({
      data: {
        id: "user-1",
        nickname: "새집밥러",
        email: "cook@example.com",
        profile_image_url: "https://example.com/profile.png",
      },
      error: null,
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "users") return usersQuery;

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { PATCH } = await import("@/app/api/v1/auth/profile/route");
    const response = await PATCH(
      new Request("http://localhost:3000/api/v1/auth/profile", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          nickname: "새집밥러",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      error: null,
      data: {
        id: "user-1",
        nickname: "새집밥러",
        email: "cook@example.com",
        profile_image_url: "https://example.com/profile.png",
        is_new_user: false,
      },
    });
  });
});
