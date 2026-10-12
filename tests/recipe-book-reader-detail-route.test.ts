import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const createRecipeFuturePropagationInternalClient = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();
const formatBootstrapErrorMessage = vi.fn((_error: unknown, fallbackMessage: string) =>
  fallbackMessage,
);
const handleGetYoutubeSavedRecipe = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRecipeImageInternalClient: () => null,
  createRecipeFuturePropagationInternalClient,
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

vi.mock("@/lib/server/youtube-saved-recipes", () => ({
  handleGetYoutubeSavedRecipe,
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
    createRecipeFuturePropagationInternalClient.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    formatBootstrapErrorMessage.mockClear();
    handleGetYoutubeSavedRecipe.mockReset();
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
      from: vi.fn((table: string) => {
        if (table === "recipe_books" || table === "recipe_book_items") {
          return serviceFrom(table);
        }
        return routeFrom(table);
      }),
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

  it("GET projects bridged YouTube content without inventing canonical ingredient rows", async () => {
    const bookId = "11111111-1111-4111-8111-111111111111";
    const recipeId = "22222222-2222-4222-8222-222222222222";
    const draftId = "33333333-3333-4333-8333-333333333333";
    const ingredientRowId = "44444444-4444-4444-8444-444444444444";
    const stepRowId = "55555555-5555-4555-8555-555555555555";
    const recipeIngredientsTable = createArrayTable([]);
    const recipeStepsTable = createArrayTable([]);
    const recipesTable = createMaybeSingleTable([{
      data: {
        id: recipeId,
        title: "유튜브 김치찌개",
        thumbnail_url: null,
        tags: ["찌개"],
        view_count: 0,
        base_servings: 2,
        created_by: "user-1",
        source_type: "youtube",
        recipe_sources: {
          extraction_meta_json: { youtube_saved_canonical_bridge: true },
        },
      },
      error: null,
    }]);
    const dbClient = {
      from: vi.fn((table: string) => {
        if (table === "recipe_books") {
          return createMaybeSingleTable([{
            data: { id: bookId, user_id: "user-1", book_type: "my_added" },
            error: null,
          }]);
        }
        if (table === "recipes") return recipesTable;
        if (table === "recipe_ingredients") return recipeIngredientsTable;
        if (table === "recipe_steps") return recipeStepsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    };
    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from: dbClient.from,
    });
    handleGetYoutubeSavedRecipe.mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: {
        draft_id: draftId,
        recipe_id: recipeId,
        revision: 1,
        created_at: "2026-10-12T08:00:00.000Z",
        updated_at: "2026-10-12T08:00:00.000Z",
        content: {
          title: "유튜브 김치찌개",
          base_servings: 2,
          tags: ["찌개"],
          ingredients: [{
            row_id: ingredientRowId,
            source_draft_ingredient_id: null,
            standard_name: "김치",
            quantity_mode: "unknown",
            amount: null,
            unit: null,
            display_text: "김치 적당량",
            component_label: null,
          }],
          steps: [{
            row_id: stepRowId,
            source_step_index: 0,
            instruction: "끓인다",
            component_label: null,
            duration_text: "10분",
          }],
        },
        ingredient_links: {
          [ingredientRowId]: {
            ingredient_id: null,
            resolution_status: "unresolved",
            candidates: [],
          },
        },
        source: {
          extraction_id: "66666666-6666-4666-8666-666666666666",
          youtube_url: "https://www.youtube.com/watch?v=abcdefghijk",
          youtube_video_id: "abcdefghijk",
          thumbnail_url: null,
        },
      },
      error: null,
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const { GET } = await importRoute();
    const response = await GET(
      new Request(`http://localhost:3000/api/v1/recipe-books/${bookId}/recipes/${recipeId}`),
      { params: Promise.resolve({ book_id: bookId, recipe_id: recipeId }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      recipe_id: recipeId,
      detail_href: `/recipes/youtube/saved/${draftId}`,
      title: "유튜브 김치찌개",
      ingredients: [{
        id: ingredientRowId,
        ingredient_id: ingredientRowId,
        standard_name: "김치",
      }],
      steps: [{ id: stepRowId, instruction: "끓인다" }],
    });
    expect(handleGetYoutubeSavedRecipe).toHaveBeenCalledWith(recipeId);
    expect(recipeIngredientsTable.select).not.toHaveBeenCalled();
    expect(recipeStepsTable.select).not.toHaveBeenCalled();
  });

  it("GET keeps another owner's bridged recipe read-only and uses the public projection", async () => {
    const bookId = "11111111-1111-4111-8111-111111111111";
    const recipeId = "22222222-2222-4222-8222-222222222222";
    const ingredientRowId = "44444444-4444-4444-8444-444444444444";
    const recipeIngredientsTable = createArrayTable([]);
    const recipeStepsTable = createArrayTable([]);
    const recipesTable = createMaybeSingleTable([{
      data: {
        id: recipeId,
        title: "공개 유튜브 김치찌개",
        thumbnail_url: null,
        tags: ["찌개"],
        view_count: 2,
        base_servings: 2,
        created_by: "user-2",
        source_type: "youtube",
        recipe_sources: {
          extraction_meta_json: { youtube_saved_canonical_bridge: true },
        },
      },
      error: null,
    }]);
    const dbClient = {
      from: vi.fn((table: string) => {
        if (table === "recipe_books") {
          return createMaybeSingleTable([{
            data: { id: bookId, user_id: "user-1", book_type: "saved" },
            error: null,
          }]);
        }
        if (table === "recipe_book_items") {
          return createMaybeSingleTable([{
            data: { id: "item-1", added_at: "2026-10-12T09:00:00.000Z" },
            error: null,
          }]);
        }
        if (table === "recipes") return recipesTable;
        if (table === "recipe_ingredients") return recipeIngredientsTable;
        if (table === "recipe_steps") return recipeStepsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    };
    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from: dbClient.from,
    });
    const rpc = vi.fn(async () => ({
      data: {
        ingredients: [{
          id: ingredientRowId,
          ingredient_id: ingredientRowId,
          standard_name: "김치",
          amount: null,
          unit: null,
          ingredient_type: "QUANT",
          display_text: "김치 적당량",
          component_label: null,
          scalable: false,
          sort_order: 0,
        }],
        steps: [],
      },
      error: null,
    }));
    createRecipeFuturePropagationInternalClient.mockReturnValue({ rpc });

    const { GET } = await importRoute();
    const response = await GET(
      new Request(`http://localhost:3000/api/v1/recipe-books/${bookId}/recipes/${recipeId}`),
      { params: Promise.resolve({ book_id: bookId, recipe_id: recipeId }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      recipe_id: recipeId,
      title: "공개 유튜브 김치찌개",
      ingredients: [{ id: ingredientRowId, standard_name: "김치" }],
    });
    expect(body.data).not.toHaveProperty("detail_href");
    expect(handleGetYoutubeSavedRecipe).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "read_public_youtube_saved_recipe_detail",
      { p_recipe_id: recipeId },
    );
    expect(recipeIngredientsTable.select).not.toHaveBeenCalled();
    expect(recipeStepsTable.select).not.toHaveBeenCalled();
  });
});
