import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();
const formatBootstrapErrorMessage = vi.fn((_error: unknown, fallbackMessage: string) =>
  fallbackMessage,
);

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
}));

vi.mock("@/lib/mock/recipes", () => ({
  getQaFixtureRecipeBooks: vi.fn(() => ({ books: [] })),
  getQaFixtureRecipeDetail: vi.fn(),
  isQaFixtureModeEnabled: vi.fn(() => false),
}));

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  readE2EAuthOverrideHeader: vi.fn(() => null),
}));

interface QueryError {
  message: string;
}

interface QueryResult<T> {
  data: T;
  error: QueryError | null;
}

function createMaybeSingleTable(results: Array<QueryResult<unknown | null>>) {
  return {
    select: vi.fn(() => {
      const result = results.shift() ?? {
        data: null,
        error: { message: "missing maybeSingle result" },
      };
      const query = {
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => result),
      };

      return query;
    }),
  };
}

function createArrayTable(results: Array<QueryResult<unknown[]>>) {
  return {
    select: vi.fn(() => {
      const result = results.shift() ?? {
        data: [],
        error: { message: "missing array result" },
      };
      const query = {
        eq: vi.fn(() => query),
        order: vi.fn(() => query),
        then(
          onFulfilled?: (value: QueryResult<unknown[]>) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) {
          return Promise.resolve(result).then(onFulfilled, onRejected);
        },
      };

      return query;
    }),
  };
}

async function importRoute() {
  return import("@/app/api/v1/recipe-books/[book_id]/recipes/[recipe_id]/route");
}

describe("/api/v1/recipe-books/[book_id]/recipes/[recipe_id]", () => {
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

  it("GET returns read-only recipebook reader details with ingredients and steps", async () => {
    const bookId = "11111111-1111-4111-8111-111111111111";
    const recipeId = "22222222-2222-4222-8222-222222222222";
    const recipesTable = createMaybeSingleTable([
      {
        data: {
          id: recipeId,
          title: "된장찌개",
          thumbnail_url: "https://example.com/doenjang.jpg",
          tags: ["한식", "찌개"],
          view_count: 12,
          base_servings: 2,
          created_by: null,
          source_type: "system",
        },
        error: null,
      },
    ]);
    const recipeStepsTable = createArrayTable([
      {
        data: [
          {
            id: "step-1",
            step_number: 1,
            instruction: "냄비에 물과 된장을 넣고 끓인다.",
            component_label: null,
            cooking_methods: null,
            ingredients_used: [],
            heat_level: null,
            duration_seconds: 90,
            duration_text: "1분 30초",
          },
        ],
        error: null,
      },
    ]);
    const rpc = vi.fn();
    const dbClient = {
      rpc,
      from: vi.fn((table: string) => {
        if (table === "recipe_books") {
          return createMaybeSingleTable([
            {
              data: {
                id: bookId,
                user_id: "user-1",
                book_type: "saved",
              },
              error: null,
            },
          ]);
        }
        if (table === "recipe_book_items") {
          return createMaybeSingleTable([
            {
              data: {
                id: "item-1",
                added_at: "2026-06-10T09:00:00.000Z",
              },
              error: null,
            },
          ]);
        }
        if (table === "recipes") return recipesTable;
        if (table === "recipe_ingredients") {
          return createArrayTable([
            {
              data: [
                {
                  id: "ingredient-row-1",
                  ingredient_id: "ingredient-1",
                  amount: "1",
                  unit: "모",
                  ingredient_type: "QUANT",
                  display_text: "두부 1모",
                  component_label: null,
                  scalable: true,
                  sort_order: 0,
                  ingredients: { standard_name: "두부" },
                },
              ],
              error: null,
            },
          ]);
        }
        if (table === "recipe_steps") {
          return recipeStepsTable;
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    };

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: { id: "user-1" },
          },
        })),
      },
      from: dbClient.from,
      rpc,
    });

    const { GET } = await importRoute();
    const response = await GET(
      new Request(`http://localhost:3000/api/v1/recipe-books/${bookId}/recipes/${recipeId}`),
      {
        params: Promise.resolve({
          book_id: bookId,
          recipe_id: recipeId,
        }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        recipe_id: recipeId,
        title: "된장찌개",
        thumbnail_url: "https://example.com/doenjang.jpg",
        tags: ["한식", "찌개"],
        view_count: 12,
        total_duration_seconds: 90,
        total_duration_text: "2분",
        base_servings: 2,
        added_at: "2026-06-10T09:00:00.000Z",
        ingredients: [
          {
            id: "ingredient-row-1",
            ingredient_id: "ingredient-1",
            standard_name: "두부",
            amount: 1,
            unit: "모",
            ingredient_type: "QUANT",
            display_text: "두부 1모",
            component_label: null,
            scalable: true,
            sort_order: 0,
          },
        ],
        steps: [
          {
            id: "step-1",
            step_number: 1,
            instruction: "냄비에 물과 된장을 넣고 끓인다.",
            component_label: null,
            cooking_method: null,
            cooking_methods: [],
            ingredients_used: [],
            heat_level: null,
            duration_seconds: 90,
            duration_text: "1분 30초",
          },
        ],
      },
      error: null,
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(recipeStepsTable.select).toHaveBeenCalledWith(
      "id, step_number, instruction, component_label, ingredients_used, heat_level, duration_seconds, duration_text, cooking_methods(id, code, label, color_key, category_code), recipe_step_cooking_methods(position, cooking_methods(id, code, label, color_key, category_code))",
    );
  });

  it("GET does not treat recipe-book membership as a deleted-recipe history anchor", async () => {
    const bookId = "11111111-1111-4111-8111-111111111111";
    const recipeId = "22222222-2222-4222-8222-222222222222";
    const routeRecipesTable = createMaybeSingleTable([
      { data: null, error: null },
    ]);
    const serviceRecipesTable = createMaybeSingleTable([
      {
        data: {
          id: recipeId,
          title: "삭제된 레시피",
          thumbnail_url: null,
          tags: [],
          view_count: 0,
          base_servings: 2,
          created_by: "user-1",
          source_type: "manual",
        },
        error: null,
      },
    ]);
    const serviceIngredientsTable = createArrayTable([
      { data: [], error: null },
    ]);
    const serviceStepsTable = createArrayTable([
      { data: [], error: null },
    ]);
    const routeFrom = vi.fn((table: string) => {
      if (table === "recipes") return routeRecipesTable;
      throw new Error(`unexpected route table: ${table}`);
    });
    const serviceFrom = vi.fn((table: string) => {
      if (table === "recipe_books") {
        return createMaybeSingleTable([
          {
            data: {
              id: bookId,
              user_id: "user-1",
              book_type: "saved",
            },
            error: null,
          },
        ]);
      }
      if (table === "recipe_book_items") {
        return createMaybeSingleTable([
          {
            data: {
              id: "item-1",
              added_at: "2026-06-10T09:00:00.000Z",
            },
            error: null,
          },
        ]);
      }
      if (table === "recipes") return serviceRecipesTable;
      if (table === "recipe_ingredients") return serviceIngredientsTable;
      if (table === "recipe_steps") return serviceStepsTable;
      throw new Error(`unexpected service table: ${table}`);
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: { id: "user-1" },
          },
        })),
      },
      from: routeFrom,
    });
    createServiceRoleClient.mockReturnValue({ from: serviceFrom });

    const { GET } = await importRoute();
    const response = await GET(
      new Request(`http://localhost:3000/api/v1/recipe-books/${bookId}/recipes/${recipeId}`),
      {
        params: Promise.resolve({
          book_id: bookId,
          recipe_id: recipeId,
        }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "RESOURCE_NOT_FOUND" },
    });
    expect(routeFrom).toHaveBeenCalledWith("recipes");
    expect(serviceRecipesTable.select).not.toHaveBeenCalled();
    expect(serviceIngredientsTable.select).not.toHaveBeenCalled();
    expect(serviceStepsTable.select).not.toHaveBeenCalled();
  });
});
