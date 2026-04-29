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

function createArraySelectQuery<T>(results: Array<QueryResult<T[]>>) {
  const query = {
    eq: vi.fn(() => query),
    gte: vi.fn(() => query),
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

function createInsertMaybeSingleQuery<T>(results: Array<QueryResult<T | null>>) {
  const query = {
    select: vi.fn(() => query),
    maybeSingle: vi.fn(async () =>
      results.shift() ?? {
        data: null,
        error: { message: "missing insert result" },
      }),
  };

  return query;
}

function createInsertSelectQuery<T>(results: Array<QueryResult<T[]>>) {
  const query = {
    select: vi.fn(() =>
      createArraySelectQuery(
        results.length > 0
          ? results
          : [
              {
                data: [],
                error: null,
              },
            ],
      ),
    ),
  };

  return query;
}

async function importReadyRoute() {
  return import("@/app/api/v1/cooking/ready/route");
}

async function importSessionsRoute() {
  return import("@/app/api/v1/cooking/sessions/route");
}

async function importCancelRoute() {
  return import("@/app/api/v1/cooking/sessions/[session_id]/cancel/route");
}

async function importCookModeRoute() {
  return import("@/app/api/v1/cooking/sessions/[session_id]/cook-mode/route");
}

const recipeId = "550e8400-e29b-41d4-a716-446655440101";
const otherRecipeId = "550e8400-e29b-41d4-a716-446655440102";
const mealId1 = "550e8400-e29b-41d4-a716-446655440201";
const mealId2 = "550e8400-e29b-41d4-a716-446655440202";
const sessionId = "550e8400-e29b-41d4-a716-446655440301";

function createJsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createSessionContext(id = sessionId) {
  return {
    params: Promise.resolve({
      session_id: id,
    }),
  };
}

describe("14 cook session start backend", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useRealTimers();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    formatBootstrapErrorMessage.mockClear();
    createServiceRoleClient.mockReturnValue(null);
    ensurePublicUserRow.mockResolvedValue({});
    ensureUserBootstrapState.mockResolvedValue(undefined);
  });

  it("GET /cooking/ready returns 401 when the user is not authenticated", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      from: vi.fn(),
    });

    const { GET } = await importReadyRoute();
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("GET /cooking/ready groups shopping_done meals by recipe for the current user", async () => {
    vi.setSystemTime(new Date("2026-04-29T03:00:00.000Z"));

    const mealsQuery = createArraySelectQuery([
      {
        data: [
          {
            id: mealId1,
            recipe_id: recipeId,
            plan_date: "2026-04-29",
            planned_servings: 2,
          },
          {
            id: mealId2,
            recipe_id: recipeId,
            plan_date: "2026-05-01",
            planned_servings: 3,
          },
        ],
        error: null,
      },
    ]);
    const recipesQuery = createArraySelectQuery([
      {
        data: [
          {
            id: recipeId,
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
        if (table === "meals") return { select: vi.fn(() => mealsQuery) };
        if (table === "recipes") return { select: vi.fn(() => recipesQuery) };
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importReadyRoute();
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        date_range: {
          start: "2026-04-29",
          end: "2026-05-01",
        },
        recipes: [
          {
            recipe_id: recipeId,
            recipe_title: "김치찌개",
            recipe_thumbnail_url: "https://example.com/kimchi.jpg",
            meal_ids: [mealId1, mealId2],
            total_servings: 5,
          },
        ],
      },
      error: null,
    });
    expect(mealsQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(mealsQuery.eq).toHaveBeenCalledWith("status", "shopping_done");
    expect(mealsQuery.gte).toHaveBeenCalledWith("plan_date", "2026-04-29");
  });

  it("POST /cooking/sessions creates a session and snapshot meals without mutating meal status", async () => {
    const recipesQuery = createMaybeSingleQuery([
      {
        data: { id: recipeId },
        error: null,
      },
    ]);
    const mealsQuery = createArraySelectQuery([
      {
        data: [
          { id: mealId1, user_id: "user-1", recipe_id: recipeId, status: "shopping_done" },
          { id: mealId2, user_id: "user-1", recipe_id: recipeId, status: "shopping_done" },
        ],
        error: null,
      },
    ]);
    const sessionInsert = vi.fn(() =>
      createInsertMaybeSingleQuery([
        {
          data: { id: sessionId, status: "in_progress" },
          error: null,
        },
      ]),
    );
    const sessionMealInsert = vi.fn(() =>
      createInsertSelectQuery([
        {
          data: [
            { meal_id: mealId1, is_cooked: false },
            { meal_id: mealId2, is_cooked: false },
          ],
          error: null,
        },
      ]),
    );
    const mealsUpdate = vi.fn();

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "recipes") return { select: vi.fn(() => recipesQuery) };
        if (table === "meals") return { select: vi.fn(() => mealsQuery), update: mealsUpdate };
        if (table === "cooking_sessions") return { insert: sessionInsert };
        if (table === "cooking_session_meals") return { insert: sessionMealInsert };
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importSessionsRoute();
    const response = await POST(
      createJsonRequest("http://localhost:3000/api/v1/cooking/sessions", {
        recipe_id: recipeId,
        meal_ids: [mealId1, mealId2],
        cooking_servings: 5,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      success: true,
      data: {
        session_id: sessionId,
        recipe_id: recipeId,
        status: "in_progress",
        cooking_servings: 5,
        meals: [
          { meal_id: mealId1, is_cooked: false },
          { meal_id: mealId2, is_cooked: false },
        ],
      },
      error: null,
    });
    expect(sessionInsert).toHaveBeenCalledWith({
      user_id: "user-1",
      status: "in_progress",
    });
    expect(sessionMealInsert).toHaveBeenCalledWith([
      {
        session_id: sessionId,
        meal_id: mealId1,
        recipe_id: recipeId,
        cooking_servings: 5,
        is_cooked: false,
      },
      {
        session_id: sessionId,
        meal_id: mealId2,
        recipe_id: recipeId,
        cooking_servings: 5,
        is_cooked: false,
      },
    ]);
    expect(mealsUpdate).not.toHaveBeenCalled();
  });

  it("POST /cooking/sessions rejects meals that are not shopping_done", async () => {
    const recipesQuery = createMaybeSingleQuery([{ data: { id: recipeId }, error: null }]);
    const mealsQuery = createArraySelectQuery([
      {
        data: [{ id: mealId1, user_id: "user-1", recipe_id: recipeId, status: "registered" }],
        error: null,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "recipes") return { select: vi.fn(() => recipesQuery) };
        if (table === "meals") return { select: vi.fn(() => mealsQuery) };
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importSessionsRoute();
    const response = await POST(
      createJsonRequest("http://localhost:3000/api/v1/cooking/sessions", {
        recipe_id: recipeId,
        meal_ids: [mealId1],
        cooking_servings: 1,
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

  it("POST /cooking/sessions rejects meals owned by another user", async () => {
    const recipesQuery = createMaybeSingleQuery([{ data: { id: recipeId }, error: null }]);
    const mealsQuery = createArraySelectQuery([
      {
        data: [{ id: mealId1, user_id: "other-user", recipe_id: recipeId, status: "shopping_done" }],
        error: null,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "recipes") return { select: vi.fn(() => recipesQuery) };
        if (table === "meals") return { select: vi.fn(() => mealsQuery) };
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importSessionsRoute();
    const response = await POST(
      createJsonRequest("http://localhost:3000/api/v1/cooking/sessions", {
        recipe_id: recipeId,
        meal_ids: [mealId1],
        cooking_servings: 1,
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

  it("POST /cooking/sessions rejects recipe mismatches", async () => {
    const recipesQuery = createMaybeSingleQuery([{ data: { id: recipeId }, error: null }]);
    const mealsQuery = createArraySelectQuery([
      {
        data: [{ id: mealId1, user_id: "user-1", recipe_id: otherRecipeId, status: "shopping_done" }],
        error: null,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "recipes") return { select: vi.fn(() => recipesQuery) };
        if (table === "meals") return { select: vi.fn(() => mealsQuery) };
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importSessionsRoute();
    const response = await POST(
      createJsonRequest("http://localhost:3000/api/v1/cooking/sessions", {
        recipe_id: recipeId,
        meal_ids: [mealId1],
        cooking_servings: 1,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "meal_ids", reason: "recipe_mismatch" }],
      },
    });
  });

  it("POST /cooking/sessions/{id}/cancel is idempotent for already cancelled sessions", async () => {
    const sessionQuery = createMaybeSingleQuery([
      {
        data: { id: sessionId, user_id: "user-1", status: "cancelled" },
        error: null,
      },
    ]);
    const updateSession = vi.fn();

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "cooking_sessions") {
          return {
            select: vi.fn(() => sessionQuery),
            update: updateSession,
          };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importCancelRoute();
    const response = await POST(
      new Request(`http://localhost:3000/api/v1/cooking/sessions/${sessionId}/cancel`, {
        method: "POST",
      }),
      createSessionContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { session_id: sessionId, status: "cancelled" },
      error: null,
    });
    expect(updateSession).not.toHaveBeenCalled();
  });

  it("POST /cooking/sessions/{id}/cancel rejects completed sessions", async () => {
    const sessionQuery = createMaybeSingleQuery([
      {
        data: { id: sessionId, user_id: "user-1", status: "completed" },
        error: null,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "cooking_sessions") return { select: vi.fn(() => sessionQuery) };
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importCancelRoute();
    const response = await POST(
      new Request(`http://localhost:3000/api/v1/cooking/sessions/${sessionId}/cancel`, {
        method: "POST",
      }),
      createSessionContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "CONFLICT" },
    });
  });

  it("GET /cooking/sessions/{id}/cook-mode returns session recipe ingredients and steps", async () => {
    const sessionQuery = createMaybeSingleQuery([
      {
        data: { id: sessionId, user_id: "user-1", status: "in_progress" },
        error: null,
      },
    ]);
    const sessionMealsQuery = createArraySelectQuery([
      {
        data: [{ meal_id: mealId1, recipe_id: recipeId, cooking_servings: 4 }],
        error: null,
      },
    ]);
    const recipeQuery = createMaybeSingleQuery([
      {
        data: { id: recipeId, title: "김치찌개", base_servings: 2 },
        error: null,
      },
    ]);
    const ingredientsQuery = createArraySelectQuery([
      {
        data: [
          {
            ingredient_id: "ing-kimchi",
            amount: 200,
            unit: "g",
            display_text: "김치 200g",
            ingredient_type: "QUANT",
            scalable: true,
            sort_order: 1,
            ingredients: { standard_name: "김치" },
          },
        ],
        error: null,
      },
    ]);
    const stepsQuery = createArraySelectQuery([
      {
        data: [
          {
            step_number: 1,
            instruction: "김치를 썬다",
            ingredients_used: ["김치"],
            heat_level: null,
            duration_seconds: null,
            duration_text: null,
            cooking_methods: { code: "prep", label: "손질", color_key: "gray" },
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
        if (table === "cooking_sessions") return { select: vi.fn(() => sessionQuery) };
        if (table === "cooking_session_meals") return { select: vi.fn(() => sessionMealsQuery) };
        if (table === "recipes") return { select: vi.fn(() => recipeQuery) };
        if (table === "recipe_ingredients") return { select: vi.fn(() => ingredientsQuery) };
        if (table === "recipe_steps") return { select: vi.fn(() => stepsQuery) };
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importCookModeRoute();
    const response = await GET(
      new NextRequest(`http://localhost:3000/api/v1/cooking/sessions/${sessionId}/cook-mode`),
      createSessionContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        session_id: sessionId,
        recipe: {
          id: recipeId,
          title: "김치찌개",
          cooking_servings: 4,
          ingredients: [
            {
              ingredient_id: "ing-kimchi",
              standard_name: "김치",
              amount: 400,
              unit: "g",
              display_text: "김치 400g",
              ingredient_type: "QUANT",
              scalable: true,
            },
          ],
          steps: [
            {
              step_number: 1,
              instruction: "김치를 썬다",
              cooking_method: { code: "prep", label: "손질", color_key: "gray" },
              ingredients_used: ["김치"],
              heat_level: null,
              duration_seconds: null,
              duration_text: null,
            },
          ],
        },
      },
      error: null,
    });
  });
});
