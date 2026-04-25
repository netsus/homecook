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
  message: string;
}

interface QueryResult<T> {
  data: T | null;
  error: QueryError | null;
}

function createSelectQuery<T>(results: Array<QueryResult<T>>) {
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    then(
      onFulfilled?: (value: QueryResult<T>) => unknown,
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

function createSimpleSelectTable<T>(results: Array<QueryResult<T>>) {
  return {
    select: vi.fn(() => createSelectQuery(results)),
  };
}

async function importRoute() {
  return import("@/app/api/v1/recipes/pantry-match/route");
}

describe("08b pantry match backend", () => {
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

  it("returns 401 when user is not authenticated", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      from: vi.fn(),
    });

    const { GET } = await importRoute();
    const response = await GET(new NextRequest("http://localhost:3000/api/v1/recipes/pantry-match"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("returns empty items when pantry has no ingredients", async () => {
    const pantryItemsTable = createSimpleSelectTable([
      {
        data: [],
        error: null,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "pantry_items") return pantryItemsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importRoute();
    const response = await GET(new NextRequest("http://localhost:3000/api/v1/recipes/pantry-match"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        items: [],
      },
      error: null,
    });
  });

  it("returns sorted pantry match recipes with missing ingredients", async () => {
    const pantryItemsTable = createSimpleSelectTable([
      {
        data: [
          { ingredient_id: "ing-a" },
          { ingredient_id: "ing-b" },
        ],
        error: null,
      },
    ]);
    const recipeIngredientsTable = createSimpleSelectTable([
      {
        data: [
          { recipe_id: "recipe-1", ingredient_id: "ing-a" },
          { recipe_id: "recipe-1", ingredient_id: "ing-b" },
          { recipe_id: "recipe-2", ingredient_id: "ing-a" },
        ],
        error: null,
      },
      {
        data: [
          { recipe_id: "recipe-1", ingredient_id: "ing-a" },
          { recipe_id: "recipe-1", ingredient_id: "ing-b" },
          { recipe_id: "recipe-1", ingredient_id: "ing-c" },
          { recipe_id: "recipe-2", ingredient_id: "ing-a" },
          { recipe_id: "recipe-2", ingredient_id: "ing-d" },
        ],
        error: null,
      },
    ]);
    const ingredientsTable = createSimpleSelectTable([
      {
        data: [
          { id: "ing-c", standard_name: "두부" },
          { id: "ing-d", standard_name: "애호박" },
        ],
        error: null,
      },
    ]);
    const recipesTable = createSimpleSelectTable([
      {
        data: [
          { id: "recipe-1", title: "김치찌개", thumbnail_url: "https://example.com/kimchi.jpg" },
          { id: "recipe-2", title: "된장찌개", thumbnail_url: "https://example.com/doenjang.jpg" },
        ],
        error: null,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "pantry_items") return pantryItemsTable;
        if (table === "recipe_ingredients") return recipeIngredientsTable;
        if (table === "ingredients") return ingredientsTable;
        if (table === "recipes") return recipesTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importRoute();
    const response = await GET(new NextRequest("http://localhost:3000/api/v1/recipes/pantry-match"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        items: [
          {
            id: "recipe-1",
            title: "김치찌개",
            thumbnail_url: "https://example.com/kimchi.jpg",
            match_score: 0.67,
            matched_ingredients: 2,
            total_ingredients: 3,
            missing_ingredients: [
              {
                id: "ing-c",
                standard_name: "두부",
              },
            ],
          },
          {
            id: "recipe-2",
            title: "된장찌개",
            thumbnail_url: "https://example.com/doenjang.jpg",
            match_score: 0.5,
            matched_ingredients: 1,
            total_ingredients: 2,
            missing_ingredients: [
              {
                id: "ing-d",
                standard_name: "애호박",
              },
            ],
          },
        ],
      },
      error: null,
    });
    expect(ensurePublicUserRow).toHaveBeenCalledWith(expect.anything(), { id: "user-1" });
    expect(ensureUserBootstrapState).toHaveBeenCalledWith(expect.anything(), "user-1");
  });

  it("applies cursor and limit for pantry-match list", async () => {
    const pantryItemsTable = createSimpleSelectTable([
      {
        data: [
          { ingredient_id: "ing-a" },
          { ingredient_id: "ing-b" },
        ],
        error: null,
      },
    ]);
    const recipeIngredientsTable = createSimpleSelectTable([
      {
        data: [
          { recipe_id: "recipe-1", ingredient_id: "ing-a" },
          { recipe_id: "recipe-1", ingredient_id: "ing-b" },
          { recipe_id: "recipe-2", ingredient_id: "ing-a" },
        ],
        error: null,
      },
      {
        data: [
          { recipe_id: "recipe-1", ingredient_id: "ing-a" },
          { recipe_id: "recipe-1", ingredient_id: "ing-b" },
          { recipe_id: "recipe-1", ingredient_id: "ing-c" },
          { recipe_id: "recipe-2", ingredient_id: "ing-a" },
          { recipe_id: "recipe-2", ingredient_id: "ing-d" },
        ],
        error: null,
      },
    ]);
    const ingredientsTable = createSimpleSelectTable([
      {
        data: [
          { id: "ing-c", standard_name: "두부" },
          { id: "ing-d", standard_name: "애호박" },
        ],
        error: null,
      },
    ]);
    const recipesTable = createSimpleSelectTable([
      {
        data: [
          { id: "recipe-1", title: "김치찌개", thumbnail_url: "https://example.com/kimchi.jpg" },
          { id: "recipe-2", title: "된장찌개", thumbnail_url: "https://example.com/doenjang.jpg" },
        ],
        error: null,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "pantry_items") return pantryItemsTable;
        if (table === "recipe_ingredients") return recipeIngredientsTable;
        if (table === "ingredients") return ingredientsTable;
        if (table === "recipes") return recipesTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/recipes/pantry-match?limit=1&cursor=recipe-1"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        items: [
          {
            id: "recipe-2",
            title: "된장찌개",
            thumbnail_url: "https://example.com/doenjang.jpg",
            match_score: 0.5,
            matched_ingredients: 1,
            total_ingredients: 2,
            missing_ingredients: [
              {
                id: "ing-d",
                standard_name: "애호박",
              },
            ],
          },
        ],
      },
      error: null,
    });
  });
});
