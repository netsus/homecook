import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  aggregateShoppingIngredients,
  isMealEligibleForShopping,
  parseShoppingMealConfigs,
  parseShoppingRecipeConfigs,
} from "@/lib/server/shopping";
import { buildShoppingBundlePreparedSourceKey } from "@/lib/server/user-growth-activity";
import { createShoppingList, fetchShoppingPreview, isShoppingApiError } from "@/lib/api/shopping";

const recordUserGrowthActivityEvent = vi.hoisted(() => vi.fn());
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
const readVerifiedAccountGenerationSession = vi.hoisted(() => vi.fn());

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

vi.mock("@/lib/server/account-generation/session-authority", () => ({
  readVerifiedAccountGenerationSession,
}));

vi.mock("@/lib/server/user-growth-activity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/user-growth-activity")>();

  return {
    ...actual,
    recordUserGrowthActivityEvent,
  };
});

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
    or: vi.fn(() => query),
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
  const query = {
    select: vi.fn(() => query),
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
    readVerifiedAccountGenerationSession.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    formatBootstrapErrorMessage.mockClear();
    createServiceRoleClient.mockReturnValue({
      rpc: vi.fn(async (_name: string, args: Record<string, unknown>) => ({
        data: args.p_complete_without_list
          ? {
              id: null,
              title: args.p_title,
              date_range_start: args.p_date_range_start,
              date_range_end: args.p_date_range_end,
              is_completed: true,
              completed_without_list: true,
              completed_at: "2026-04-25T09:00:00.000Z",
              meals_updated: Array.isArray(args.p_shopping_meal_ids)
                ? args.p_shopping_meal_ids.length
                : 0,
              pantry_item_count: args.p_pantry_item_count ?? 0,
              created_at: "2026-04-25T09:00:00.000Z",
            }
          : {
              id: "shopping-list-default",
              title: args.p_title,
              is_completed: false,
              created_at: "2026-04-25T09:00:00.000Z",
              items: Array.isArray(args.p_item_rows)
                ? args.p_item_rows.map((item, index) => ({
                    id: `shopping-item-${index + 1}`,
                    ...item,
                    is_checked: false,
                    added_to_pantry: false,
                  }))
                : [],
            },
        error: null,
      })),
    });
    ensurePublicUserRow.mockResolvedValue({});
    ensureUserBootstrapState.mockResolvedValue(undefined);
    readVerifiedAccountGenerationSession.mockResolvedValue({
      ok: true,
      sessionAuthority: {
        ownerUuid: "user-1",
        authIdentityCreatedAt: "2026-08-01T00:00:00.000Z",
        sessionIssuedAt: "2026-08-02T00:00:00.000Z",
        sessionKeyHash: "a".repeat(64),
        hmacKeyVersion: 1,
      },
    });
    recordUserGrowthActivityEvent.mockReset();
    recordUserGrowthActivityEvent.mockResolvedValue({ recorded: true, duplicate: false, error: null });
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

  it("returns 401 before body validation when shopping creation is unauthenticated", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      from: vi.fn(),
    });

    const { POST } = await importListsRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/shopping/lists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
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
            column_id: "column-breakfast",
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
    const columnsQuery = createArraySelectQuery([
      {
        data: [{ id: "column-breakfast", name: "아침" }],
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
        if (table === "meal_plan_columns") {
          return { select: vi.fn(() => columnsQuery) };
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
            column_id: "column-breakfast",
            column_name: "아침",
            plan_date: "2026-04-25",
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

  it("uses a content-pinned Meal title instead of the mutable current recipe title", async () => {
    const mealsQuery = createArraySelectQuery([
      {
        data: [
          {
            id: "550e8400-e29b-41d4-a716-446655440001",
            recipe_id: "recipe-1",
            recipe_content_snapshot_id: "snapshot-1",
            recipe_content_snapshots: {
              title: "계획 당시 김치찌개",
            },
            column_id: "column-breakfast",
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
            title: "편집된 현재 김치찌개",
            thumbnail_url: "https://example.com/kimchi.jpg",
          },
        ],
        error: null,
      },
    ]);
    const columnsQuery = createArraySelectQuery([
      {
        data: [{ id: "column-breakfast", name: "아침" }],
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
        if (table === "meal_plan_columns") {
          return { select: vi.fn(() => columnsQuery) };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importPreviewRoute();
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.eligible_meals[0].recipe_name).toBe("계획 당시 김치찌개");
    expect(body.data.recipes[0].recipe_name).toBe("계획 당시 김치찌개");
  });

  it("fails closed when a shopping preview Meal has a broken content pin relation", async () => {
    const mealsQuery = createArraySelectQuery([
      {
        data: [
          {
            id: "550e8400-e29b-41d4-a716-446655440001",
            recipe_id: "recipe-1",
            recipe_content_snapshot_id: "snapshot-1",
            recipe_content_snapshots: null,
            column_id: "column-breakfast",
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
        if (table === "meals") {
          return { select: vi.fn(() => mealsQuery) };
        }
        if (table === "recipes") {
          return { select: vi.fn(() => recipesQuery) };
        }
        if (table === "meal_plan_columns") {
          return { select: vi.fn(() => createArraySelectQuery([{ data: [], error: null }])) };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importPreviewRoute();
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "INTERNAL_ERROR" },
    });
    expect(JSON.stringify(body)).not.toContain("노출되면 안 되는 현재 제목");
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
      return createAwaitInsertQuery([
        {
          data: values.map((value, index) => ({
            id: `shopping-item-${index + 1}`,
            ...value,
          })),
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
    const rpc = vi.fn(async () => ({
      data: {
        id: "shopping-list-1",
        title: "4/25 장보기",
        is_completed: false,
        created_at: "2026-04-25T09:00:00.000Z",
        items: [
          {
            id: "shopping-item-1",
            ingredient_id: "ing-to-taste",
            food_product_id: null,
            food_product_nutrition_version_id: null,
            display_text: "고추 약간",
            amounts_json: [],
            is_checked: false,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 0,
          },
          {
            id: "shopping-item-2",
            ingredient_id: "ing-salt",
            food_product_id: null,
            food_product_nutrition_version_id: null,
            display_text: "소금 1개",
            amounts_json: [{ amount: 1, unit: "개" }],
            is_checked: false,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 1,
          },
          {
            id: "shopping-item-3",
            ingredient_id: "ing-onion",
            food_product_id: null,
            food_product_nutrition_version_id: null,
            display_text: "양파 2200g",
            amounts_json: [{ amount: 2200, unit: "g" }],
            is_checked: false,
            is_pantry_excluded: true,
            added_to_pantry: false,
            sort_order: 2,
          },
        ],
      },
      error: null,
    }));

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
    createServiceRoleClient.mockReturnValue({ rpc });

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
    expect(body).toMatchObject({
      success: true,
      data: {
        id: "shopping-list-1",
        title: "4/25 장보기",
        is_completed: false,
        created_at: "2026-04-25T09:00:00.000Z",
        items: expect.arrayContaining([
          expect.objectContaining({
            source_type: "ingredient",
            ingredient_id: "ing-onion",
            food_product_id: null,
            food_product_nutrition_version_id: null,
          }),
        ]),
      },
      error: null,
    });

    expect(rpc).toHaveBeenCalledWith(
      "create_shopping_list_with_snapshot_authority",
      expect.objectContaining({
        p_user_id: "user-1",
        p_shopping_meal_ids: [
          "550e8400-e29b-41d4-a716-446655440001",
          "550e8400-e29b-41d4-a716-446655440002",
        ],
        p_recipe_rows: [
          {
            recipe_id: "recipe-1",
            recipe_content_snapshot_id: undefined,
            shopping_servings: 4,
            planned_servings_total: 2,
          },
          {
            recipe_id: "recipe-2",
            recipe_content_snapshot_id: undefined,
            shopping_servings: 2,
            planned_servings_total: 2,
          },
        ],
        p_item_rows: [
          expect.objectContaining({
            ingredient_id: "ing-to-taste",
            is_pantry_excluded: false,
            display_text: "고추 약간",
            sort_order: 0,
          }),
          expect.objectContaining({
            ingredient_id: "ing-salt",
            is_pantry_excluded: false,
            display_text: "소금 1개",
            sort_order: 1,
          }),
          expect.objectContaining({
            ingredient_id: "ing-onion",
            is_pantry_excluded: true,
            display_text: "양파 2200g",
            sort_order: 2,
          }),
        ],
      }),
    );
    expect(recordUserGrowthActivityEvent).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-1",
      activityType: "shopping_bundle_prepared",
      category: "shopping",
      sourceKey: buildShoppingBundlePreparedSourceKey({
        actionKind: "shopping_list",
        mealIds: [
          "550e8400-e29b-41d4-a716-446655440001",
          "550e8400-e29b-41d4-a716-446655440002",
        ],
      }),
      sourceTable: "shopping_lists",
      sourceId: "shopping-list-1",
      sourceMeta: {
        action_kind: "shopping_list",
        meal_ids: [
          "550e8400-e29b-41d4-a716-446655440001",
          "550e8400-e29b-41d4-a716-446655440002",
        ],
        pantry_item_count: 1,
      },
      occurredAt: "2026-04-25T09:00:00.000Z",
    });
  });

  it("uses the atomic create_shopping_list_from_payload RPC for the mutation phase when available", async () => {
    const mealId = "550e8400-e29b-41d4-a716-446655440001";
    const rpc = vi.fn(async () => ({
      data: {
        id: "shopping-list-rpc",
        title: "4/25 장보기",
        is_completed: false,
        created_at: "2026-04-25T09:00:00.000Z",
        items: [
          {
            id: "item-generic",
            ingredient_id: "ing-onion",
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
            id: "item-product",
            ingredient_id: null,
            food_product_id: "product-1",
            food_product_nutrition_version_id: "version-1",
            display_text: "두부 1개",
            amounts_json: [{ amount: 1, unit: "개" }],
            is_checked: false,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 1,
          },
          {
            id: "item-legacy-snapshot",
            ingredient_id: null,
            food_product_id: null,
            food_product_nutrition_version_id: null,
            display_text: "과거 표시 스냅샷",
            amounts_json: [],
            is_checked: false,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 2,
          },
        ],
      },
      error: null,
    }));
    const mealsQuery = createArraySelectQuery([
      {
        data: [
          {
            id: mealId,
            user_id: "user-1",
            recipe_id: "recipe-1",
            plan_date: "2026-04-25",
            column_id: "column-dinner",
            planned_servings: 2,
            status: "registered",
            is_leftover: false,
            leftover_dish_id: null,
            shopping_list_id: null,
          },
        ],
        error: null,
      },
    ]);
    const recipeRowsQuery = createArraySelectQuery([
      {
        data: [{ id: "recipe-1", base_servings: 2 }],
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
            unit: "개",
            ingredient_type: "QUANT",
            display_text: "양파 1개",
          },
        ],
        error: null,
      },
    ]);
    const ingredientsQuery = createArraySelectQuery([
      {
        data: [{ id: "ing-onion", standard_name: "양파" }],
        error: null,
      },
    ]);
    const pantryQuery = createArraySelectQuery([{ data: [], error: null }]);
    const insertShoppingList = vi.fn();
    const insertShoppingListRecipes = vi.fn();
    const insertShoppingListItems = vi.fn();
    const updateMeals = vi.fn();

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
    });
    createServiceRoleClient.mockReturnValue({
      rpc,
      from: vi.fn((table: string) => {
        if (table === "meals") {
          return {
            select: vi.fn(() => mealsQuery),
            update: updateMeals,
          };
        }
        if (table === "shopping_lists") {
          return { insert: insertShoppingList };
        }
        if (table === "shopping_list_recipes") {
          return { insert: insertShoppingListRecipes };
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
          return { insert: insertShoppingListItems };
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
          meal_configs: [{ meal_id: mealId, shopping_servings: 2 }],
        }),
      }),
    );
    const body = await response.json();

    expect(rpc).toHaveBeenCalledWith("create_shopping_list_with_snapshot_authority", expect.objectContaining({
      p_user_id: "user-1",
      p_title: "4/25 장보기",
      p_date_range_start: "2026-04-25",
      p_date_range_end: "2026-04-25",
      p_complete_without_list: false,
      p_shopping_meal_ids: [mealId],
      p_split_remainders: [],
      p_split_originals: [],
      p_recipe_rows: [
        {
          recipe_id: "recipe-1",
          recipe_content_snapshot_id: undefined,
          shopping_servings: 2,
          planned_servings_total: 2,
        },
      ],
      p_item_rows: [
        {
          ingredient_id: "ing-onion",
          food_product_id: null,
          food_product_nutrition_version_id: null,
          display_text: "양파 1개",
          amounts_json: [{ amount: 1, unit: "개" }],
          is_pantry_excluded: false,
          sort_order: 0,
        },
      ],
    }));
    expect(insertShoppingList).not.toHaveBeenCalled();
    expect(insertShoppingListRecipes).not.toHaveBeenCalled();
    expect(insertShoppingListItems).not.toHaveBeenCalled();
    expect(updateMeals).not.toHaveBeenCalled();
    expect(response.status).toBe(201);
    expect(body.data).toMatchObject({
      id: "shopping-list-rpc",
      title: "4/25 장보기",
      is_completed: false,
      created_at: "2026-04-25T09:00:00.000Z",
      items: [
        expect.objectContaining({
          id: "item-generic",
          source_type: "ingredient",
          ingredient_id: "ing-onion",
          food_product_id: null,
          food_product_nutrition_version_id: null,
        }),
        expect.objectContaining({
          id: "item-product",
          source_type: "food_product",
          ingredient_id: null,
          food_product_id: "product-1",
          food_product_nutrition_version_id: "version-1",
        }),
        expect.objectContaining({
          id: "item-legacy-snapshot",
          source_type: null,
          ingredient_id: null,
          food_product_id: null,
          food_product_nutrition_version_id: null,
        }),
      ],
    });
  });

  it("uses an exact pantry product/version pair for product-only completion", async () => {
    const mealId = "550e8400-e29b-41d4-a716-446655440201";
    const productId = "550e8400-e29b-41d4-a716-446655440301";
    const versionId = "550e8400-e29b-41d4-a716-446655440302";
    const pantryQuery = createArraySelectQuery([
      {
        data: [
          {
            ingredient_id: null,
            food_product_id: productId,
            food_product_nutrition_version_id: versionId,
          },
        ],
        error: null,
      },
    ]);
    const rpc = vi.fn(async () => ({
      data: {
        id: null,
        title: "4/25 장보기",
        date_range_start: "2026-04-25",
        date_range_end: "2026-04-25",
        is_completed: true,
        completed_at: "2026-04-25T09:00:00.000Z",
        completed_without_list: true,
        meals_updated: 1,
        pantry_item_count: 1,
        created_at: "2026-04-25T09:00:00.000Z",
      },
      error: null,
    }));
    const mealsQuery = createArraySelectQuery([
      {
        data: [
          {
            id: mealId,
            user_id: "user-1",
            recipe_id: "recipe-product",
            recipe_content_snapshot_id: "snapshot-product",
            recipe_content_snapshots: {
              base_servings: 2,
              ingredients_json: [
                {
                  ingredient_id: null,
                  food_product_id: productId,
                  food_product_nutrition_version_id: versionId,
                  amount: 1,
                  unit: "개",
                  ingredient_type: "QUANT",
                  display_text: "두부 1개",
                  scalable: true,
                  sort_order: 0,
                },
              ],
            },
            plan_date: "2026-04-25",
            column_id: "column-dinner",
            planned_servings: 2,
            status: "registered",
            is_leftover: false,
            leftover_dish_id: null,
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
    });
    createServiceRoleClient.mockReturnValue({
      rpc,
      from: vi.fn((table: string) => {
        if (table === "meals") {
          return { select: vi.fn(() => mealsQuery) };
        }
        if (table === "pantry_items") {
          return { select: vi.fn(() => pantryQuery) };
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
          meal_configs: [{ meal_id: mealId, shopping_servings: 2 }],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(pantryQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(pantryQuery.or).toHaveBeenCalledWith(
      `and(food_product_id.eq.${productId},food_product_nutrition_version_id.eq.${versionId})`,
    );
    expect(rpc).toHaveBeenCalledWith(
      "create_shopping_list_with_snapshot_authority",
      expect.objectContaining({
        p_complete_without_list: true,
        p_pantry_item_count: 1,
        p_recipe_rows: [
          expect.objectContaining({
            recipe_id: "recipe-product",
            recipe_content_snapshot_id: "snapshot-product",
          }),
        ],
        p_item_rows: [
          expect.objectContaining({
            ingredient_id: null,
            food_product_id: productId,
            food_product_nutrition_version_id: versionId,
            is_pantry_excluded: true,
          }),
        ],
      }),
    );
    expect(body.data).toMatchObject({
      id: null,
      completed_without_list: true,
      pantry_item_count: 1,
    });
  });

  it("returns pinned product provenance from the product-only fallback create path", async () => {
    const mealId = "550e8400-e29b-41d4-a716-446655440211";
    const productId = "550e8400-e29b-41d4-a716-446655440311";
    const versionId = "550e8400-e29b-41d4-a716-446655440312";
    const mealsQuery = createArraySelectQuery([
      {
        data: [
          {
            id: mealId,
            user_id: "user-1",
            recipe_id: "recipe-product-fallback",
            recipe_content_snapshot_id: "snapshot-product-fallback",
            recipe_content_snapshots: {
              base_servings: 2,
              ingredients_json: [
                {
                  ingredient_id: null,
                  food_product_id: productId,
                  food_product_nutrition_version_id: versionId,
                  amount: 1,
                  unit: "개",
                  ingredient_type: "QUANT",
                  display_text: "고정 두부 1개",
                  scalable: true,
                  sort_order: 0,
                },
              ],
            },
            plan_date: "2026-04-25",
            column_id: "column-dinner",
            planned_servings: 2,
            status: "registered",
            is_leftover: false,
            leftover_dish_id: null,
            shopping_list_id: null,
          },
        ],
        error: null,
      },
    ]);
    const pantryQuery = createArraySelectQuery([{ data: [], error: null }]);
    const shoppingListInsertQuery = createInsertMaybeSingleQuery([
      {
        data: {
          id: "shopping-list-product-fallback",
          title: "4/25 장보기",
          is_completed: false,
          created_at: "2026-04-25T09:00:00.000Z",
        },
        error: null,
      },
    ]);
    const shoppingListRecipesInsert = vi.fn(() =>
      createAwaitInsertQuery([{ data: [], error: null }]),
    );
    const shoppingListItemsInsert = vi.fn((values: Array<Record<string, unknown>>) =>
      createAwaitInsertQuery([
        {
          data: values.map((value) => ({
            id: "shopping-item-product-fallback",
            ...value,
          })),
          error: null,
        },
      ]),
    );
    const mealsUpdateQuery = createMealsUpdateQuery([{ data: [], error: null }]);
    const rpc = vi.fn(async () => ({
      data: {
        id: "shopping-list-product-fallback",
        title: "4/25 장보기",
        is_completed: false,
        created_at: "2026-04-25T09:00:00.000Z",
        items: [
          {
            id: "shopping-item-product-fallback",
            ingredient_id: null,
            food_product_id: productId,
            food_product_nutrition_version_id: versionId,
            display_text: "고정 두부 1개",
            amounts_json: [{ amount: 1, unit: "개" }],
            is_checked: false,
            is_pantry_excluded: false,
            added_to_pantry: false,
            sort_order: 0,
          },
        ],
      },
      error: null,
    }));

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
    });
    createServiceRoleClient.mockReturnValue({
      rpc,
      from: vi.fn((table: string) => {
        if (table === "meals") {
          return {
            select: vi.fn(() => mealsQuery),
            update: vi.fn(() => mealsUpdateQuery),
          };
        }
        if (table === "pantry_items") {
          return { select: vi.fn(() => pantryQuery) };
        }
        if (table === "shopping_lists") {
          return { insert: vi.fn(() => shoppingListInsertQuery) };
        }
        if (table === "shopping_list_recipes") {
          return { insert: shoppingListRecipesInsert };
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
          meal_configs: [{ meal_id: mealId, shopping_servings: 2 }],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith(
      "create_shopping_list_with_snapshot_authority",
      expect.objectContaining({
        p_recipe_rows: [
          expect.objectContaining({
            recipe_id: "recipe-product-fallback",
            recipe_content_snapshot_id: "snapshot-product-fallback",
          }),
        ],
        p_item_rows: [
          expect.objectContaining({
            ingredient_id: null,
            food_product_id: productId,
            food_product_nutrition_version_id: versionId,
            is_pantry_excluded: false,
          }),
        ],
      }),
    );
    expect(body.data.items).toEqual([
      expect.objectContaining({
        id: "shopping-item-product-fallback",
        source_type: "food_product",
        ingredient_id: null,
        food_product_id: productId,
        food_product_nutrition_version_id: versionId,
      }),
    ]);
  });

  it("requires both generic and exact product pantry identities for mixed completion", async () => {
    const mealId = "550e8400-e29b-41d4-a716-446655440211";
    const ingredientId = "550e8400-e29b-41d4-a716-446655440212";
    const productId = "550e8400-e29b-41d4-a716-446655440311";
    const versionId = "550e8400-e29b-41d4-a716-446655440312";
    const mealsQuery = createArraySelectQuery([
      {
        data: [
          {
            id: mealId,
            user_id: "user-1",
            recipe_id: "recipe-mixed",
            recipe_content_snapshot_id: "snapshot-mixed",
            recipe_content_snapshots: {
              base_servings: 2,
              ingredients_json: [
                {
                  ingredient_id: ingredientId,
                  amount: 1,
                  unit: "개",
                  ingredient_type: "QUANT",
                  display_text: "양파 1개",
                },
                {
                  ingredient_id: null,
                  food_product_id: productId,
                  food_product_nutrition_version_id: versionId,
                  amount: 1,
                  unit: "개",
                  ingredient_type: "QUANT",
                  display_text: "두부 1개",
                },
              ],
            },
            plan_date: "2026-04-25",
            column_id: "column-dinner",
            planned_servings: 2,
            status: "registered",
            is_leftover: false,
            leftover_dish_id: null,
            shopping_list_id: null,
          },
        ],
        error: null,
      },
    ]);
    const ingredientsQuery = createArraySelectQuery([
      {
        data: [{ id: ingredientId, standard_name: "양파" }],
        error: null,
      },
    ]);
    const pantryQuery = createArraySelectQuery([
      {
        data: [
          {
            ingredient_id: ingredientId,
            food_product_id: null,
            food_product_nutrition_version_id: null,
          },
          {
            ingredient_id: null,
            food_product_id: productId,
            food_product_nutrition_version_id: versionId,
          },
        ],
        error: null,
      },
    ]);
    const rpc = vi.fn(async () => ({
      data: {
        id: null,
        title: "4/25 장보기",
        date_range_start: "2026-04-25",
        date_range_end: "2026-04-25",
        is_completed: true,
        completed_at: "2026-04-25T09:00:00.000Z",
        completed_without_list: true,
        meals_updated: 1,
        pantry_item_count: 2,
        created_at: "2026-04-25T09:00:00.000Z",
      },
      error: null,
    }));

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
    });
    createServiceRoleClient.mockReturnValue({
      rpc,
      from: vi.fn((table: string) => {
        if (table === "meals") {
          return { select: vi.fn(() => mealsQuery) };
        }
        if (table === "ingredients") {
          return { select: vi.fn(() => ingredientsQuery) };
        }
        if (table === "pantry_items") {
          return { select: vi.fn(() => pantryQuery) };
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
          meal_configs: [{ meal_id: mealId, shopping_servings: 2 }],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(pantryQuery.or).toHaveBeenCalledWith(
      `ingredient_id.in.(${ingredientId}),and(food_product_id.eq.${productId},food_product_nutrition_version_id.eq.${versionId})`,
    );
    expect(rpc).toHaveBeenCalledWith(
      "create_shopping_list_with_snapshot_authority",
      expect.objectContaining({
        p_complete_without_list: true,
        p_pantry_item_count: 2,
        p_recipe_rows: [
          expect.objectContaining({
            recipe_id: "recipe-mixed",
            recipe_content_snapshot_id: "snapshot-mixed",
          }),
        ],
        p_item_rows: expect.arrayContaining([
          expect.objectContaining({
            ingredient_id: ingredientId,
            is_pantry_excluded: true,
          }),
          expect.objectContaining({
            ingredient_id: null,
            food_product_id: productId,
            food_product_nutrition_version_id: versionId,
            is_pantry_excluded: true,
          }),
        ]),
      }),
    );
  });

  it("splits one recipe across content snapshots with deterministic integer servings", async () => {
    const firstMealId = "550e8400-e29b-41d4-a716-446655440001";
    const secondMealId = "550e8400-e29b-41d4-a716-446655440002";
    const recipeId = "550e8400-e29b-41d4-a716-446655440101";
    const rpc = vi.fn(async () => ({
      data: {
        id: "shopping-list-rpc",
        title: "4/25 장보기",
        is_completed: false,
        created_at: "2026-04-25T09:00:00.000Z",
      },
      error: null,
    }));
    const mealsQuery = createArraySelectQuery([
      {
        data: [
          {
            id: firstMealId,
            user_id: "user-1",
            recipe_id: recipeId,
            recipe_content_snapshot_id: "snapshot-2",
            recipe_content_snapshots: {
              base_servings: 2,
              ingredients_json: [
                {
                  ingredient_id: "ing-onion",
                  amount: 200,
                  unit: "g",
                  ingredient_type: "QUANT",
                  display_text: "양파 200g",
                  scalable: true,
                  sort_order: 1,
                },
              ],
            },
            plan_date: "2026-04-25",
            column_id: "column-dinner",
            planned_servings: 2,
            status: "registered",
            is_leftover: false,
            leftover_dish_id: null,
            shopping_list_id: null,
          },
          {
            id: secondMealId,
            user_id: "user-1",
            recipe_id: recipeId,
            recipe_content_snapshot_id: "snapshot-1",
            recipe_content_snapshots: {
              base_servings: 2,
              ingredients_json: [
                {
                  ingredient_id: "ing-onion",
                  amount: 200,
                  unit: "g",
                  ingredient_type: "QUANT",
                  display_text: "양파 200g",
                  scalable: true,
                  sort_order: 1,
                },
              ],
            },
            plan_date: "2026-04-26",
            column_id: "column-dinner",
            planned_servings: 4,
            status: "registered",
            is_leftover: false,
            leftover_dish_id: null,
            shopping_list_id: null,
          },
        ],
        error: null,
      },
    ]);
    const recipeRowsQuery = createArraySelectQuery([
      {
        data: [{ id: recipeId, base_servings: 100 }],
        error: null,
      },
    ]);
    const recipeIngredientsQuery = createArraySelectQuery([
      {
        data: [
          {
            recipe_id: recipeId,
            ingredient_id: "ing-onion",
            amount: 1000,
            unit: "g",
            ingredient_type: "QUANT",
            display_text: "편집된 양파 1000g",
          },
        ],
        error: null,
      },
    ]);
    const ingredientsQuery = createArraySelectQuery([
      {
        data: [{ id: "ing-onion", standard_name: "양파" }],
        error: null,
      },
    ]);
    const pantryQuery = createArraySelectQuery([{ data: [], error: null }]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
    });
    createServiceRoleClient.mockReturnValue({
      rpc,
      from: vi.fn((table: string) => {
        if (table === "meals") {
          return { select: vi.fn(() => mealsQuery) };
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
              shopping_servings: 7,
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith(
      "create_shopping_list_with_snapshot_authority",
      expect.objectContaining({
        p_item_rows: [
          {
            ingredient_id: "ing-onion",
            food_product_id: null,
            food_product_nutrition_version_id: null,
            display_text: "양파 700g",
            amounts_json: [{ amount: 700, unit: "g" }],
            is_pantry_excluded: false,
            sort_order: 0,
          },
        ],
        p_recipe_rows: [
          {
            recipe_id: recipeId,
            recipe_content_snapshot_id: "snapshot-1",
            shopping_servings: 5,
            planned_servings_total: 4,
          },
          {
            recipe_id: recipeId,
            recipe_content_snapshot_id: "snapshot-2",
            shopping_servings: 2,
            planned_servings_total: 2,
          },
        ],
      }),
    );
  });

  it("marks selected meals shopping_done without creating a list when every needed ingredient is already in pantry", async () => {
    const mealId = "550e8400-e29b-41d4-a716-446655440111";
    const recipeId = "recipe-all-pantry";
    const mealsQuery = createArraySelectQuery([
      {
        data: [
          {
            id: mealId,
            user_id: "user-1",
            recipe_id: recipeId,
            plan_date: "2026-04-25",
            column_id: "column-dinner",
            planned_servings: 2,
            status: "registered",
            is_leftover: false,
            leftover_dish_id: null,
            shopping_list_id: null,
          },
        ],
        error: null,
      },
    ]);
    const shoppingListInsertQuery = createInsertMaybeSingleQuery([
      {
        data: {
          id: "shopping-list-should-not-exist",
          title: "4/25 장보기",
          is_completed: false,
          created_at: "2026-04-25T09:00:00.000Z",
        },
        error: null,
      },
    ]);
    const shoppingListsInsert = vi.fn(() => shoppingListInsertQuery);
    const shoppingListRecipesInsert = vi.fn(() =>
      createAwaitInsertQuery([{ data: [], error: null }]),
    );
    const shoppingListItemsInsert = vi.fn(() =>
      createAwaitInsertQuery([{ data: [], error: null }]),
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
            ingredient_id: "ing-onion",
            amount: 1,
            unit: "개",
            ingredient_type: "QUANT",
            display_text: "양파 1개",
          },
        ],
        error: null,
      },
    ]);
    const ingredientsQuery = createArraySelectQuery([
      {
        data: [{ id: "ing-onion", standard_name: "양파" }],
        error: null,
      },
    ]);
    const pantryQuery = createArraySelectQuery([
      {
        data: [{ ingredient_id: "ing-onion" }],
        error: null,
      },
    ]);
    const mealsDoneUpdateQuery = createMealsUpdateQuery([
      {
        data: [],
        error: null,
      },
    ]);
    const mealsUpdate = vi.fn(() => mealsDoneUpdateQuery);
    const activityInsert = vi.fn(() =>
      createInsertMaybeSingleQuery([{ data: { id: "activity-1" }, error: null }]),
    );

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "meals") {
          return {
            select: vi.fn(() => mealsQuery),
            update: mealsUpdate,
          };
        }
        if (table === "shopping_lists") {
          return { insert: shoppingListsInsert };
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
        if (table === "user_growth_activity_events") {
          return { insert: activityInsert };
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
          meal_configs: [{ meal_id: mealId, shopping_servings: 2 }],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: expect.objectContaining({
        id: null,
        is_completed: true,
        completed_without_list: true,
        meals_updated: 1,
        pantry_item_count: 1,
      }),
      error: null,
    });
    expect(shoppingListsInsert).not.toHaveBeenCalled();
    expect(shoppingListRecipesInsert).not.toHaveBeenCalled();
    expect(shoppingListItemsInsert).not.toHaveBeenCalled();
    expect(createServiceRoleClient).toHaveBeenCalled();
    expect(activityInsert).not.toHaveBeenCalled();
    expect(recordUserGrowthActivityEvent).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-1",
      activityType: "shopping_bundle_prepared",
      category: "shopping",
      sourceKey: buildShoppingBundlePreparedSourceKey({
        actionKind: "completed_without_list",
        mealIds: [mealId],
      }),
      sourceTable: "meals",
      sourceId: mealId,
      sourceMeta: {
        action_kind: "completed_without_list",
        meal_ids: [mealId],
        pantry_item_count: 1,
      },
      occurredAt: expect.any(String),
    });
  });

  it("creates a shopping list for all-pantry meals when completion without list is disabled", async () => {
    const mealId = "550e8400-e29b-41d4-a716-446655440111";
    const recipeId = "recipe-all-pantry";
    const rpc = vi.fn(async () => ({
      data: {
        id: "shopping-list-all-pantry",
        title: "4/25 장보기",
        is_completed: false,
        created_at: "2026-04-25T09:00:00.000Z",
      },
      error: null,
    }));
    const mealsQuery = createArraySelectQuery([
      {
        data: [
          {
            id: mealId,
            user_id: "user-1",
            recipe_id: recipeId,
            plan_date: "2026-04-25",
            column_id: "column-dinner",
            planned_servings: 2,
            status: "registered",
            is_leftover: false,
            leftover_dish_id: null,
            shopping_list_id: null,
          },
        ],
        error: null,
      },
    ]);
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
            ingredient_id: "ing-onion",
            amount: 1,
            unit: "개",
            ingredient_type: "QUANT",
            display_text: "양파 1개",
          },
        ],
        error: null,
      },
    ]);
    const ingredientsQuery = createArraySelectQuery([
      {
        data: [{ id: "ing-onion", standard_name: "양파" }],
        error: null,
      },
    ]);
    const pantryQuery = createArraySelectQuery([
      {
        data: [{ ingredient_id: "ing-onion" }],
        error: null,
      },
    ]);
    const insertShoppingList = vi.fn();
    const insertShoppingListRecipes = vi.fn();
    const insertShoppingListItems = vi.fn();
    const updateMeals = vi.fn();

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
    });
    createServiceRoleClient.mockReturnValue({
      rpc,
      from: vi.fn((table: string) => {
        if (table === "meals") {
          return {
            select: vi.fn(() => mealsQuery),
            update: updateMeals,
          };
        }
        if (table === "shopping_lists") {
          return { insert: insertShoppingList };
        }
        if (table === "shopping_list_recipes") {
          return { insert: insertShoppingListRecipes };
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
          return { insert: insertShoppingListItems };
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
          complete_without_list: false,
          meal_configs: [{ meal_id: mealId, shopping_servings: 2 }],
        }),
      }),
    );
    const body = await response.json();

    expect(rpc).toHaveBeenCalledWith("create_shopping_list_with_snapshot_authority", expect.objectContaining({
      p_complete_without_list: false,
      p_item_rows: [
        {
          ingredient_id: "ing-onion",
          food_product_id: null,
          food_product_nutrition_version_id: null,
          display_text: "양파 1개",
          amounts_json: [{ amount: 1, unit: "개" }],
          is_pantry_excluded: true,
          sort_order: 0,
        },
      ],
      p_recipe_rows: [
        expect.objectContaining({
          recipe_id: recipeId,
          recipe_content_snapshot_id: undefined,
        }),
      ],
    }));
    expect(updateMeals).not.toHaveBeenCalled();
    expect(response.status).toBe(201);
    expect(body.data).toMatchObject({
      id: "shopping-list-all-pantry",
      is_completed: false,
      all_items_in_pantry: true,
      pantry_item_count: 1,
    });
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
    const rpc = vi.fn(async () => ({
      data: {
        id: "shopping-list-1",
        title: "4/28 장보기",
        is_completed: false,
        created_at: "2026-04-28T09:00:00.000Z",
        items: [],
      },
      error: null,
    }));

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
    createServiceRoleClient.mockReturnValue({ rpc });

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
    expect(rpc).toHaveBeenCalledWith(
      "create_shopping_list_with_snapshot_authority",
      expect.objectContaining({
        p_shopping_meal_ids: [firstMealId, secondMealId],
        p_recipe_rows: [
          {
            recipe_id: recipeId,
            recipe_content_snapshot_id: undefined,
            shopping_servings: 6,
            planned_servings_total: 6,
          },
        ],
        p_item_rows: [
          expect.objectContaining({
            ingredient_id: "ing-kimchi",
            display_text: "김치 900g",
            amounts_json: [{ amount: 900, unit: "g" }],
          }),
        ],
      }),
    );
  });

  it("splits one oversized registered meal so only requested servings are attached to the shopping list", async () => {
    const mealId = "550e8400-e29b-41d4-a716-446655440021";
    const recipeId = "550e8400-e29b-41d4-a716-446655440102";
    const columnId = "550e8400-e29b-41d4-a716-446655440202";

    const mealsQuery = createArraySelectQuery([
      {
        data: [
          {
            id: mealId,
            user_id: "user-1",
            recipe_id: recipeId,
            plan_date: "2026-04-30",
            column_id: columnId,
            planned_servings: 13,
            status: "registered",
            is_leftover: false,
            leftover_dish_id: null,
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
          title: "4/30 장보기",
          is_completed: false,
          created_at: "2026-04-30T09:00:00.000Z",
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
    const mealsInsert = vi.fn(() =>
      createAwaitInsertQuery([
        {
          data: [],
          error: null,
        },
      ]),
    );
    const splitUpdateQuery = createMealsUpdateQuery([
      {
        data: [],
        error: null,
      },
    ]);
    const listLinkUpdateQuery = createMealsUpdateQuery([
      {
        data: [],
        error: null,
      },
    ]);
    const mealsUpdate = vi.fn()
      .mockReturnValueOnce(splitUpdateQuery)
      .mockReturnValueOnce(listLinkUpdateQuery);
    const rpc = vi.fn(async () => ({
      data: {
        id: "shopping-list-1",
        title: "4/30 장보기",
        is_completed: false,
        created_at: "2026-04-30T09:00:00.000Z",
        items: [],
      },
      error: null,
    }));

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "meals") {
          return {
            select: vi.fn(() => mealsQuery),
            insert: mealsInsert,
            update: mealsUpdate,
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
    createServiceRoleClient.mockReturnValue({ rpc });

    const { POST } = await importListsRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/shopping/lists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipes: [
            {
              recipe_id: recipeId,
              meal_ids: [mealId],
              shopping_servings: 5,
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith(
      "create_shopping_list_with_snapshot_authority",
      expect.objectContaining({
        p_split_remainders: [
          expect.objectContaining({
            user_id: "user-1",
            recipe_id: recipeId,
            recipe_content_snapshot_id: undefined,
            plan_date: "2026-04-30",
            column_id: columnId,
            planned_servings: 8,
          }),
        ],
        p_split_originals: [
          {
            meal_id: mealId,
            planned_servings: 5,
          },
        ],
        p_recipe_rows: [
          {
            recipe_id: recipeId,
            recipe_content_snapshot_id: undefined,
            shopping_servings: 5,
            planned_servings_total: 5,
          },
        ],
      }),
    );
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
