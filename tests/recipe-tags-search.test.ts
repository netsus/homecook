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

function createChainQuery<T>(result: QueryResult<T>) {
  const query = {
    select: vi.fn(() => query),
    limit: vi.fn(() => query),
    order: vi.fn(() => query),
    in: vi.fn(() => query),
    ilike: vi.fn(() => query),
    is: vi.fn(() => query),
    eq: vi.fn(() => query),
    or: vi.fn(() => query),
    then: createAwaitableQuery(result).then,
  };

  return query;
}

const recipeTagId = "550e8400-e29b-41d4-a716-446655440101";
const recipeTitleId = "550e8400-e29b-41d4-a716-446655440102";

function createRecipeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: recipeTagId,
    title: "태그로 찾은 브라우니",
    thumbnail_url: null,
    tags: ["디저트"],
    base_servings: 2,
    view_count: 100,
    like_count: 0,
    save_count: 0,
    plan_count: 0,
    cook_count: 0,
    created_at: "2026-06-17T00:00:00.000Z",
    source_type: "manual",
    ...overrides,
  };
}

async function importRecipesRoute() {
  return import("@/app/api/v1/recipes/route");
}

describe("36c recipe tag search route", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
    });
  });

  it("filters by exact Korean normalized tag key through a deduped recipe id lookup", async () => {
    const recipeQuery = createChainQuery({
      data: [
        createRecipeRow({ id: recipeTagId, title: "한식 김치찌개", tags: ["한식"], view_count: 25 }),
      ],
      error: null,
    });
    const savedItemsQuery = createChainQuery({ data: [], error: null });
    const dbClient = {
      rpc: vi.fn(async (functionName: string, args: Record<string, unknown>) => {
        expect(functionName).toBe("find_recipe_ids_by_public_tags");
        expect(args).toEqual({
          p_q: null,
          p_tag: "한식",
        });

        return {
          data: [{ recipe_id: recipeTagId }, { recipe_id: recipeTagId }],
          error: null,
        };
      }),
      from: vi.fn((table: string) => {
        if (table === "recipes") return recipeQuery;
        if (table === "recipe_book_items") return savedItemsQuery;
        throw new Error(`unexpected table: ${table}`);
      }),
    };
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      ...dbClient,
    });

    const { GET } = await importRecipesRoute();
    const response = await GET(new NextRequest(
      "http://localhost:3000/api/v1/recipes?tag=%ED%95%9C%EC%8B%9D&limit=1",
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(recipeQuery.in).toHaveBeenCalledWith("id", [recipeTagId]);
    expect(body).toMatchObject({
      success: true,
      data: {
        items: [
          {
            id: recipeTagId,
            title: "한식 김치찌개",
            tags: ["한식"],
          },
        ],
        has_next: false,
      },
      error: null,
    });
  });

  it("searches title and public approved tag labels without joining recipe rows", async () => {
    const titleQuery = createChainQuery({
      data: [
        createRecipeRow({
          id: recipeTitleId,
          title: "디저트 없는 제목 매치",
          tags: [],
          view_count: 10,
        }),
      ],
      error: null,
    });
    const tagRecipeQuery = createChainQuery({
      data: [
        createRecipeRow({
          id: recipeTagId,
          title: "초코 브라우니",
          tags: ["디저트"],
          view_count: 80,
        }),
      ],
      error: null,
    });
    const savedItemsQuery = createChainQuery({ data: [], error: null });
    const recipeQueries = [titleQuery, tagRecipeQuery];
    const dbClient = {
      rpc: vi.fn(async (functionName: string, args: Record<string, unknown>) => {
        expect(functionName).toBe("find_recipe_ids_by_public_tags");
        expect(args).toEqual({
          p_q: "디저트",
          p_tag: null,
        });

        return {
          data: [{ recipe_id: recipeTagId }, { recipe_id: recipeTagId }],
          error: null,
        };
      }),
      from: vi.fn((table: string) => {
        if (table === "recipes") {
          const query = recipeQueries.shift();
          if (!query) throw new Error("unexpected extra recipes query");
          return query;
        }
        if (table === "recipe_book_items") return savedItemsQuery;
        throw new Error(`unexpected table: ${table}`);
      }),
    };
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      ...dbClient,
    });

    const { GET } = await importRecipesRoute();
    const response = await GET(new NextRequest(
      "http://localhost:3000/api/v1/recipes?q=%EB%94%94%EC%A0%80%ED%8A%B8&limit=2",
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(titleQuery.ilike).toHaveBeenCalledWith("title", "%디저트%");
    expect(tagRecipeQuery.in).toHaveBeenCalledWith("id", [recipeTagId]);
    expect(titleQuery.or).not.toHaveBeenCalled();
    expect(tagRecipeQuery.or).not.toHaveBeenCalled();
    expect(body.data.items.map((item: { id: string }) => item.id)).toEqual([
      recipeTagId,
      recipeTitleId,
    ]);
  });
});
