import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  aggregateShoppingIngredients,
  isMealEligibleForShopping,
  parseShoppingMealConfigs,
  parseShoppingRecipeConfigs,
} from "@/lib/server/shopping";
import { createShoppingList, fetchShoppingPreview, isShoppingApiError } from "@/lib/api/shopping";

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

function createArraySelectQuery<T>(results: Array<QueryResult<T[]>>) {
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    is: vi.fn(() => query),
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

function createInsertMaybeSingleQuery<T>(results: Array<QueryResult<T | null>>) {
  const query = {
    select: vi.fn(() => query),
    maybeSingle: vi.fn(async () =>
      results.shift() ?? {
        data: null,
        error: { message: "missing maybeSingle result" },
      }),
  };

  return query;
}

function createAwaitInsertQuery(results: Array<QueryResult<unknown[] | null>>) {
  return {
    then(
      onFulfilled?: (value: QueryResult<unknown[] | null>) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(
        results.shift() ?? {
          data: [],
          error: null,
        },
      ).then(onFulfilled, onRejected);
    },
  };
}

function createMealsUpdateQuery(results: Array<QueryResult<unknown[] | null>>) {
  const query = {
    in: vi.fn(() => query),
    eq: vi.fn(() => query),
    then(
      onFulfilled?: (value: QueryResult<unknown[] | null>) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(
        results.shift() ?? {
          data: [],
          error: null,
        },
      ).then(onFulfilled, onRejected);
    },
  };

  return query;
}

async function importPreviewRoute() {
  return import("@/app/api/v1/shopping/preview/route");
}

async function importListsRoute() {
  return import("@/app/api/v1/shopping/lists/route");
}

describe("shopping stage2 backend", () => {
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

  it("marks only registered meals without shopping list as eligible", () => {
    expect(isMealEligibleForShopping({ id: "m1", status: "registered", shopping_list_id: null })).toBe(true);
    expect(
      isMealEligibleForShopping({
        id: "m2",
        status: "shopping_done",
        shopping_list_id: null,
      }),
    ).toBe(false);
    expect(
      isMealEligibleForShopping({
        id: "m3",
        status: "registered",
        shopping_list_id: "list-1",
      }),
    ).toBe(false);
  });

  it("parses meal configs by validating servings and ignoring invalid meal ids", () => {
    const parsed = parseShoppingMealConfigs({
      meal_configs: [
        {
          meal_id: "550e8400-e29b-41d4-a716-446655440001",
          shopping_servings: 3,
        },
        {
          meal_id: "invalid-id",
          shopping_servings: 2,
        },
        {
          meal_id: "550e8400-e29b-41d4-a716-446655440001",
          shopping_servings: 4,
        },
      ],
    });

    expect(parsed.fields).toEqual([]);
    expect(parsed.valid_configs).toEqual([
      {
        meal_id: "550e8400-e29b-41d4-a716-446655440001",
        shopping_servings: 4,
      },
    ]);
  });

  it("parses recipe configs for recipe-level shopping serving totals", () => {
    const parsed = parseShoppingRecipeConfigs({
      recipes: [
        {
          recipe_id: "550e8400-e29b-41d4-a716-446655440011",
          meal_ids: [
            "550e8400-e29b-41d4-a716-446655440001",
            "550e8400-e29b-41d4-a716-446655440002",
            "not-a-uuid",
          ],
          shopping_servings: 6,
        },
      ],
    });

    expect(parsed.fields).toEqual([]);
    expect(parsed.valid_configs).toEqual([
      {
        recipe_id: "550e8400-e29b-41d4-a716-446655440011",
        meal_ids: [
          "550e8400-e29b-41d4-a716-446655440001",
          "550e8400-e29b-41d4-a716-446655440002",
        ],
        shopping_servings: 6,
      },
    ]);
  });

  it("merges convertable units and keeps mixed units in display text", () => {
    const merged = aggregateShoppingIngredients([
      {
        ingredient_id: "ing-onion",
        standard_name: "양파",
        ingredient_type: "QUANT",
        amount: 1,
        unit: "kg",
        display_text: null,
        planned_servings: 2,
        shopping_servings: 2,
      },
      {
        ingredient_id: "ing-onion",
        standard_name: "양파",
        ingredient_type: "QUANT",
        amount: 200,
        unit: "g",
        display_text: null,
        planned_servings: 2,
        shopping_servings: 2,
      },
      {
        ingredient_id: "ing-onion",
        standard_name: "양파",
        ingredient_type: "QUANT",
        amount: 2,
        unit: "개",
        display_text: null,
        planned_servings: 2,
        shopping_servings: 2,
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual({
      ingredient_id: "ing-onion",
      standard_name: "양파",
      display_text: "양파 2개 + 1200g",
      amounts_json: [
        { amount: 2, unit: "개" },
        { amount: 1200, unit: "g" },
      ],
    });
  });

  it("returns 401 for shopping preview when user is not authenticated", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      from: vi.fn(),
    });

    const { GET } = await importPreviewRoute();
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("returns eligible shopping preview meals in envelope", async () => {
    const mealsQuery = createArraySelectQuery([
      {
        data: [
          {
            id: "550e8400-e29b-41d4-a716-446655440001",
            recipe_id: "recipe-1",
            plan_date: "2026-04-25",
            planned_servings: 2,
            status: "registered",
            shopping_list_id: null,
            created_at: "2026-04-25T00:00:00.000Z",
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
            title: "김치찌개",
            thumbnail_url: "https://example.com/kimchi.jpg",
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
        if (table === "meals") {
          return { select: vi.fn(() => mealsQuery) };
        }
        if (table === "recipes") {
          return { select: vi.fn(() => recipesQuery) };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importPreviewRoute();
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        eligible_meals: [
          {
            id: "550e8400-e29b-41d4-a716-446655440001",
            recipe_id: "recipe-1",
            recipe_name: "김치찌개",
            recipe_thumbnail: "https://example.com/kimchi.jpg",
            planned_servings: 2,
            created_at: "2026-04-25T00:00:00.000Z",
          },
        ],
        recipes: [
          {
            recipe_id: "recipe-1",
            recipe_name: "김치찌개",
            recipe_thumbnail: "https://example.com/kimchi.jpg",
            meal_ids: ["550e8400-e29b-41d4-a716-446655440001"],
            planned_servings_total: 2,
            shopping_servings: 2,
            is_selected: true,
          },
        ],
      },
      error: null,
    });
    expect(mealsQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(mealsQuery.eq).toHaveBeenCalledWith("status", "registered");
    expect(mealsQuery.is).toHaveBeenCalledWith("shopping_list_id", null);
  });

  it("returns 422 when shopping list create body has empty meal_configs", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn(),
    });

    const { POST } = await importListsRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/shopping/lists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ meal_configs: [] }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "meal_configs", reason: "required_non_empty" }],
      },
    });
  });

  it("returns 422 when shopping_servings is below 1", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn(),
    });

    const { POST } = await importListsRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/shopping/lists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          meal_configs: [
            {
              meal_id: "550e8400-e29b-41d4-a716-446655440001",
              shopping_servings: 0,
            },
          ],
        }),
      }),
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
    expect(body.error.fields[0].field).toContain("shopping_servings");
  });

  it("returns 403 when meal owner does not match", async () => {
    const mealsQuery = createArraySelectQuery([
      {
        data: [
          {
            id: "meal-1",
            user_id: "other-user",
            recipe_id: "recipe-1",
            plan_date: "2026-04-25",
            planned_servings: 2,
            status: "registered",
            shopping_list_id: null,
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
        if (table === "meals") {
          return {
            select: vi.fn(() => mealsQuery),
          };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importListsRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/shopping/lists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          meal_configs: [
            {
              meal_id: "550e8400-e29b-41d4-a716-446655440001",
              shopping_servings: 2,
            },
          ],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "FORBIDDEN" },
    });
  });

  it("returns 409 when selected meal already belongs to another shopping list", async () => {
    const mealsQuery = createArraySelectQuery([
      {
        data: [
          {
            id: "550e8400-e29b-41d4-a716-446655440001",
            user_id: "user-1",
            recipe_id: "recipe-1",
            plan_date: "2026-04-25",
            planned_servings: 2,
            status: "registered",
            shopping_list_id: "shopping-list-existing",
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
        if (table === "meals") {
          return {
            select: vi.fn(() => mealsQuery),
          };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importListsRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/shopping/lists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          meal_configs: [
            {
              meal_id: "550e8400-e29b-41d4-a716-446655440001",
              shopping_servings: 2,
            },
          ],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "CONFLICT" },
    });
  });

  it("creates shopping list, recipe rows, item rows, and updates meal shopping_list_id", async () => {
    const mealsQuery = createArraySelectQuery([
      {
        data: [
          {
            id: "550e8400-e29b-41d4-a716-446655440001",
            user_id: "user-1",
            recipe_id: "recipe-1",
            plan_date: "2026-04-25",
            planned_servings: 2,
            status: "registered",
            shopping_list_id: null,
          },
          {
            id: "550e8400-e29b-41d4-a716-446655440002",
            user_id: "user-1",
            recipe_id: "recipe-2",
            plan_date: "2026-04-27",
            planned_servings: 2,
            status: "registered",
            shopping_list_id: null,
          },
          {
            id: "550e8400-e29b-41d4-a716-446655440003",
            user_id: "user-1",
            recipe_id: "recipe-1",
            plan_date: "2026-04-28",
            planned_servings: 2,
            status: "shopping_done",
            shopping_list_id: null,
          },
        ],
        error: null,
      },
    ]);
    const shoppingListInsertQuery = createInsertMaybeSingleQuery([
      {
        data: {
          id: "shopping-list-1",
          title: "4/25 장보기",
          is_completed: false,
          created_at: "2026-04-25T09:00:00.000Z",
        },
        error: null,
      },
    ]);
    const shoppingListRecipesInsert = vi.fn((values: Array<Record<string, unknown>>) => {
      void values;
      return createAwaitInsertQuery([
        {
          data: [],
          error: null,
        },
      ]);
    });
    const recipeRowsQuery = createArraySelectQuery([
      {
        data: [
          { id: "recipe-1", base_servings: 2 },
          { id: "recipe-2", base_servings: 2 },
        ],
        error: null,
      },
    ]);
    const recipeIngredientsQuery = createArraySelectQuery([
      {
        data: [
          {
            recipe_id: "recipe-1",
            ingredient_id: "ing-onion",
            amount: 1,
            unit: "kg",
            ingredient_type: "QUANT",
            display_text: "양파 1kg",
          },
          {
            recipe_id: "recipe-2",
            ingredient_id: "ing-onion",
            amount: 200,
            unit: "g",
            ingredient_type: "QUANT",
            display_text: "양파 200g",
          },
          {
            recipe_id: "recipe-2",
            ingredient_id: "ing-salt",
            amount: 1,
            unit: "개",
            ingredient_type: "QUANT",
            display_text: "소금 1개",
          },
          {
            recipe_id: "recipe-1",
            ingredient_id: "ing-to-taste",
            amount: null,
            unit: null,
            ingredient_type: "TO_TASTE",
            display_text: "고추 약간",
          },
        ],
        error: null,
      },
    ]);
    const ingredientsQuery = createArraySelectQuery([
      {
        data: [
          { id: "ing-onion", standard_name: "양파" },
          { id: "ing-salt", standard_name: "소금" },
          { id: "ing-to-taste", standard_name: "고추" },
        ],
        error: null,
      },
    ]);
    const pantryQuery = createArraySelectQuery([
      {
        data: [{ ingredient_id: "ing-onion" }],
        error: null,
      },
    ]);
    const shoppingListItemsInsert = vi.fn((values: Array<Record<string, unknown>>) => {
      void values;
      return createAwaitInsertQuery([
        {
          data: [],
          error: null,
        },
      ]);
    });
    const mealsUpdateQuery = createMealsUpdateQuery([
      {
        data: [],
        error: null,
      },
    ]);

    const shoppingListItemsTable = {
      insert: shoppingListItemsInsert,
    };

    const mealsTable = {
      select: vi.fn(() => mealsQuery),
      update: vi.fn(() => mealsUpdateQuery),
    };

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "meals") {
          return mealsTable;
        }
        if (table === "shopping_lists") {
          return { insert: vi.fn(() => shoppingListInsertQuery) };
        }
        if (table === "shopping_list_recipes") {
          return { insert: shoppingListRecipesInsert };
        }
        if (table === "recipes") {
          return { select: vi.fn(() => recipeRowsQuery) };
        }
        if (table === "recipe_ingredients") {
          return { select: vi.fn(() => recipeIngredientsQuery) };
        }
        if (table === "ingredients") {
          return { select: vi.fn(() => ingredientsQuery) };
        }
        if (table === "pantry_items") {
          return { select: vi.fn(() => pantryQuery) };
        }
        if (table === "shopping_list_items") {
          return shoppingListItemsTable;
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importListsRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/shopping/lists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          meal_configs: [
            { meal_id: "550e8400-e29b-41d4-a716-446655440001", shopping_servings: 4 },
            { meal_id: "550e8400-e29b-41d4-a716-446655440002", shopping_servings: 2 },
            { meal_id: "550e8400-e29b-41d4-a716-446655440003", shopping_servings: 3 },
            { meal_id: "not-a-uuid", shopping_servings: 2 },
          ],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      success: true,
      data: {
        id: "shopping-list-1",
        title: "4/25 장보기",
        is_completed: false,
        created_at: "2026-04-25T09:00:00.000Z",
      },
      error: null,
    });

    expect(shoppingListRecipesInsert).toHaveBeenCalledWith([
      {
        shopping_list_id: "shopping-list-1",
        recipe_id: "recipe-1",
        shopping_servings: 4,
        planned_servings_total: 2,
      },
      {
        shopping_list_id: "shopping-list-1",
        recipe_id: "recipe-2",
        shopping_servings: 2,
        planned_servings_total: 2,
      },
    ]);

    expect(shoppingListItemsInsert).toHaveBeenCalledTimes(1);
    const shoppingListItemsPayload = shoppingListItemsInsert.mock.calls[0]?.[0] ?? [];
    expect(shoppingListItemsPayload).toHaveLength(3);
    expect(shoppingListItemsPayload).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ingredient_id: "ing-to-taste",
        is_pantry_excluded: false,
        display_text: "고추 약간",
        sort_order: 0,
      }),
      expect.objectContaining({
        ingredient_id: "ing-onion",
        is_pantry_excluded: true,
        display_text: "양파 2200g",
        sort_order: 2,
      }),
      expect.objectContaining({
        ingredient_id: "ing-salt",
        is_pantry_excluded: false,
        display_text: "소금 1개",
        sort_order: 1,
      }),
    ]));

    expect(mealsTable.update).toHaveBeenCalledWith({
      shopping_list_id: "shopping-list-1",
    });
    expect(mealsUpdateQuery.in).toHaveBeenCalledWith("id", [
      "550e8400-e29b-41d4-a716-446655440001",
      "550e8400-e29b-41d4-a716-446655440002",
    ]);
    expect(mealsUpdateQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("creates one recipe-level shopping row and scales duplicate recipe meals from base servings", async () => {
    const firstMealId = "550e8400-e29b-41d4-a716-446655440011";
    const secondMealId = "550e8400-e29b-41d4-a716-446655440012";
    const recipeId = "550e8400-e29b-41d4-a716-446655440101";

    const mealsQuery = createArraySelectQuery([
      {
        data: [
          {
            id: firstMealId,
            user_id: "user-1",
            recipe_id: recipeId,
            plan_date: "2026-04-28",
            planned_servings: 3,
            status: "registered",
            shopping_list_id: null,
          },
          {
            id: secondMealId,
            user_id: "user-1",
            recipe_id: recipeId,
            plan_date: "2026-04-29",
            planned_servings: 3,
            status: "registered",
            shopping_list_id: null,
          },
        ],
        error: null,
      },
    ]);
    const shoppingListInsertQuery = createInsertMaybeSingleQuery([
      {
        data: {
          id: "shopping-list-1",
          title: "4/28 장보기",
          is_completed: false,
          created_at: "2026-04-28T09:00:00.000Z",
        },
        error: null,
      },
    ]);
    const shoppingListRecipesInsert = vi.fn(() =>
      createAwaitInsertQuery([
        {
          data: [],
          error: null,
        },
      ]),
    );
    const recipeRowsQuery = createArraySelectQuery([
      {
        data: [{ id: recipeId, base_servings: 2 }],
        error: null,
      },
    ]);
    const recipeIngredientsQuery = createArraySelectQuery([
      {
        data: [
          {
            recipe_id: recipeId,
            ingredient_id: "ing-kimchi",
            amount: 300,
            unit: "g",
            ingredient_type: "QUANT",
            display_text: "김치 300g",
          },
        ],
        error: null,
      },
    ]);
    const ingredientsQuery = createArraySelectQuery([
      {
        data: [{ id: "ing-kimchi", standard_name: "김치" }],
        error: null,
      },
    ]);
    const pantryQuery = createArraySelectQuery([
      {
        data: [],
        error: null,
      },
    ]);
    const shoppingListItemsInsert = vi.fn(() =>
      createAwaitInsertQuery([
        {
          data: [],
          error: null,
        },
      ]),
    );
    const mealsUpdateQuery = createMealsUpdateQuery([
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
        if (table === "meals") {
          return {
            select: vi.fn(() => mealsQuery),
            update: vi.fn(() => mealsUpdateQuery),
          };
        }
        if (table === "shopping_lists") {
          return { insert: vi.fn(() => shoppingListInsertQuery) };
        }
        if (table === "shopping_list_recipes") {
          return { insert: shoppingListRecipesInsert };
        }
        if (table === "recipes") {
          return { select: vi.fn(() => recipeRowsQuery) };
        }
        if (table === "recipe_ingredients") {
          return { select: vi.fn(() => recipeIngredientsQuery) };
        }
        if (table === "ingredients") {
          return { select: vi.fn(() => ingredientsQuery) };
        }
        if (table === "pantry_items") {
          return { select: vi.fn(() => pantryQuery) };
        }
        if (table === "shopping_list_items") {
          return { insert: shoppingListItemsInsert };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importListsRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/shopping/lists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipes: [
            {
              recipe_id: recipeId,
              meal_ids: [firstMealId, secondMealId],
              shopping_servings: 6,
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(shoppingListRecipesInsert).toHaveBeenCalledWith([
      {
        shopping_list_id: "shopping-list-1",
        recipe_id: recipeId,
        shopping_servings: 6,
        planned_servings_total: 6,
      },
    ]);
    expect(shoppingListItemsInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        ingredient_id: "ing-kimchi",
        display_text: "김치 900g",
        amounts_json: [{ amount: 900, unit: "g" }],
      }),
    ]);
    expect(mealsUpdateQuery.in).toHaveBeenCalledWith("id", [firstMealId, secondMealId]);
  });

  it("fetchShoppingPreview helper returns data when envelope is valid", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: {
            eligible_meals: [
              {
                id: "meal-1",
                recipe_id: "recipe-1",
                recipe_name: "김치찌개",
                recipe_thumbnail: null,
                planned_servings: 2,
                created_at: "2026-04-25T00:00:00.000Z",
              },
            ],
          },
          error: null,
        }),
        { status: 200 },
      ));
    vi.stubGlobal("fetch", fetchMock);

    const data = await fetchShoppingPreview();

    expect(data.eligible_meals).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/shopping/preview", expect.any(Object));
  });

  it("createShoppingList helper throws structured error on API failure", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: false,
          data: null,
          error: {
            code: "VALIDATION_ERROR",
            message: "선택된 식사가 없어요.",
            fields: [{ field: "meal_configs", reason: "required_non_empty" }],
          },
        }),
        { status: 422 },
      ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createShoppingList({
        meal_configs: [],
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(isShoppingApiError(error)).toBe(true);

      if (!isShoppingApiError(error)) {
        return false;
      }

      expect(error.status).toBe(422);
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.fields).toEqual([{ field: "meal_configs", reason: "required_non_empty" }]);

      return true;
    });
  });
});
