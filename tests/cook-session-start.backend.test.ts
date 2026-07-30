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

  it("does not let service role widen new cooking-session recipe selection", async () => {
    const routeRecipeQuery = createMaybeSingleQuery([{ data: null, error: null }]);
    const serviceRecipeQuery = createMaybeSingleQuery([
      {
        data: { id: recipeId },
        error: null,
      },
    ]);
    const mealsQuery = createArraySelectQuery([
      {
        data: [
          { id: mealId1, user_id: "user-1", recipe_id: recipeId, status: "shopping_done" },
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
          data: [{ meal_id: mealId1, is_cooked: false }],
          error: null,
        },
      ]),
    );
    const routeFrom = vi.fn((table: string) => {
      if (table === "recipes") return { select: vi.fn(() => routeRecipeQuery) };
      throw new Error(`unexpected route table: ${table}`);
    });
    const serviceFrom = vi.fn((table: string) => {
      if (table === "recipes") return { select: vi.fn(() => serviceRecipeQuery) };
      if (table === "meals") return { select: vi.fn(() => mealsQuery) };
      if (table === "cooking_sessions") return { insert: sessionInsert };
      if (table === "cooking_session_meals") return { insert: sessionMealInsert };
      throw new Error(`unexpected service table: ${table}`);
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: routeFrom,
    });
    createServiceRoleClient.mockReturnValue({ from: serviceFrom });

    const { POST } = await importSessionsRoute();
    const response = await POST(
      createJsonRequest("http://localhost:3000/api/v1/cooking/sessions", {
        recipe_id: recipeId,
        meal_ids: [mealId1],
        cooking_servings: 2,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "RESOURCE_NOT_FOUND" },
    });
    expect(routeFrom).toHaveBeenCalledWith("recipes");
    expect(serviceRecipeQuery.maybeSingle).not.toHaveBeenCalled();
    expect(sessionInsert).not.toHaveBeenCalled();
    expect(sessionMealInsert).not.toHaveBeenCalled();
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
            display_text: "[찌개 재료] 김치 200g",
            component_label: "찌개 재료",
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
            instruction: "[찌개 재료] 김치를 썬다",
            component_label: "찌개 재료",
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
              component_label: "찌개 재료",
              ingredient_type: "QUANT",
              scalable: true,
            },
          ],
          steps: [
            {
              step_number: 1,
              instruction: "김치를 썬다",
              component_label: "찌개 재료",
              cooking_method: { code: "prep", label: "손질", color_key: "gray" },
              cooking_methods: [
                { code: "prep", label: "손질", color_key: "gray" },
              ],
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

  it("GET /cooking/sessions/{id}/cook-mode uses snapshot-v2 pinned title, servings base, ingredients, and steps", async () => {
    const contentSnapshot = {
      id: "550e8400-e29b-41d4-a716-446655440099",
      recipe_id: recipeId,
      title: "요리 시작 당시 김치찌개",
      base_servings: 2,
      ingredients_json: [
        {
          ingredient_id: "ing-kimchi",
          amount: 200,
          unit: "g",
          display_text: "김치 200g",
          ingredient_type: "QUANT",
          scalable: true,
          sort_order: 1,
          component_label: "찌개 재료",
        },
      ],
      steps_json: [
        {
          step_number: 1,
          instruction: "당시 조리법으로 끓인다",
          component_label: "찌개 단계",
          ingredients_used: ["김치"],
          heat_level: "중불",
          duration_seconds: 600,
          duration_text: "10분",
          cooking_methods: [
            {
              code: "boil",
              label: "끓이기",
              color_key: "red",
              category_code: "wet_heat",
            },
          ],
        },
      ],
    };
    const sessionQuery = createMaybeSingleQuery([
      {
        data: {
          id: sessionId,
          user_id: "user-1",
          status: "in_progress",
          contract_version: "snapshot_v2",
          session_kind: "planner",
          recipe_id: recipeId,
          recipe_content_snapshot_id: contentSnapshot.id,
          cooking_servings: 4,
          recipe_content_snapshots: contentSnapshot,
        },
        error: null,
      },
    ]);
    const sessionMealsQuery = createArraySelectQuery([
      {
        data: [
          {
            meal_id: mealId1,
            recipe_id: recipeId,
            recipe_content_snapshot_id: contentSnapshot.id,
            cooking_servings: 4,
          },
        ],
        error: null,
      },
    ]);
    const recipeQuery = createMaybeSingleQuery([
      {
        data: { id: recipeId, title: "편집된 현재 김치찌개", base_servings: 100 },
        error: null,
      },
    ]);
    const contentSnapshotQuery = createMaybeSingleQuery([
      {
        data: contentSnapshot,
        error: null,
      },
    ]);
    const ingredientsQuery = createArraySelectQuery([
      {
        data: [
          {
            ingredient_id: "ing-kimchi",
            amount: 1000,
            unit: "g",
            display_text: "편집된 김치 1000g",
            component_label: null,
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
            instruction: "편집된 현재 조리법",
            component_label: null,
            ingredients_used: ["김치"],
            heat_level: null,
            duration_seconds: null,
            duration_text: null,
            cooking_methods: null,
          },
        ],
        error: null,
      },
    ]);
    const ingredientNamesQuery = createArraySelectQuery([
      {
        data: [{ id: "ing-kimchi", standard_name: "김치" }],
        error: null,
      },
    ]);
    const serviceFrom = vi.fn((table: string) => {
      if (table === "cooking_sessions") return { select: vi.fn(() => sessionQuery) };
      if (table === "cooking_session_meals") {
        return { select: vi.fn(() => sessionMealsQuery) };
      }
      if (table === "recipe_content_snapshots") {
        return { select: vi.fn(() => contentSnapshotQuery) };
      }
      if (table === "recipes") return { select: vi.fn(() => recipeQuery) };
      if (table === "recipe_ingredients") {
        return { select: vi.fn(() => ingredientsQuery) };
      }
      if (table === "recipe_steps") return { select: vi.fn(() => stepsQuery) };
      if (table === "ingredients") {
        return { select: vi.fn(() => ingredientNamesQuery) };
      }
      throw new Error(`unexpected service table: ${table}`);
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: serviceFrom,
    });
    createServiceRoleClient.mockReturnValue({ from: serviceFrom });

    const { GET } = await importCookModeRoute();
    const response = await GET(
      new NextRequest(`http://localhost:3000/api/v1/cooking/sessions/${sessionId}/cook-mode`),
      createSessionContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.recipe).toMatchObject({
      id: recipeId,
      title: "요리 시작 당시 김치찌개",
      cooking_servings: 4,
      ingredients: [
        expect.objectContaining({
          ingredient_id: "ing-kimchi",
          amount: 400,
          unit: "g",
          component_label: "찌개 재료",
        }),
      ],
      steps: [
        expect.objectContaining({
          step_number: 1,
          instruction: "당시 조리법으로 끓인다",
          component_label: "찌개 단계",
          heat_level: "중불",
          duration_seconds: 600,
          duration_text: "10분",
          cooking_methods: [
            {
              code: "boil",
              label: "끓이기",
              color_key: "red",
              category_code: "wet_heat",
            },
          ],
        }),
      ],
    });
  });

  it("GET /cooking/sessions/{id}/cook-mode fails closed when a snapshot-v2 content relation is broken", async () => {
    const contentSnapshotId = "550e8400-e29b-41d4-a716-446655440099";
    const sessionQuery = createMaybeSingleQuery([
      {
        data: {
          id: sessionId,
          user_id: "user-1",
          status: "in_progress",
          contract_version: "snapshot_v2",
          session_kind: "planner",
          recipe_id: recipeId,
          recipe_content_snapshot_id: contentSnapshotId,
          cooking_servings: 4,
          recipe_content_snapshots: null,
        },
        error: null,
      },
    ]);
    const sessionMealsQuery = createArraySelectQuery([
      {
        data: [
          {
            meal_id: mealId1,
            recipe_id: recipeId,
            recipe_content_snapshot_id: contentSnapshotId,
            cooking_servings: 4,
          },
        ],
        error: null,
      },
    ]);
    const recipeQuery = createMaybeSingleQuery([
      {
        data: { id: recipeId, title: "노출되면 안 되는 현재 제목", base_servings: 2 },
        error: null,
      },
    ]);
    const serviceFrom = vi.fn((table: string) => {
      if (table === "cooking_sessions") return { select: vi.fn(() => sessionQuery) };
      if (table === "cooking_session_meals") {
        return { select: vi.fn(() => sessionMealsQuery) };
      }
      if (table === "recipe_content_snapshots") {
        return {
          select: vi.fn(() =>
            createMaybeSingleQuery([{ data: null, error: null }]),
          ),
        };
      }
      if (table === "recipes") return { select: vi.fn(() => recipeQuery) };
      if (table === "recipe_ingredients" || table === "recipe_steps") {
        return { select: vi.fn(() => createArraySelectQuery([{ data: [], error: null }])) };
      }
      throw new Error(`unexpected service table: ${table}`);
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: serviceFrom,
    });
    createServiceRoleClient.mockReturnValue({ from: serviceFrom });

    const { GET } = await importCookModeRoute();
    const response = await GET(
      new NextRequest(`http://localhost:3000/api/v1/cooking/sessions/${sessionId}/cook-mode`),
      createSessionContext(),
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

  it("GET /cooking/sessions/{id}/cook-mode reads anchored deleted recipe content through service role for the owner", async () => {
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
        data: { id: recipeId, title: "숨김 처리된 레시피", base_servings: 2 },
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
            display_text: "[찌개 재료] 김치 200g",
            component_label: "찌개 재료",
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
            instruction: "[찌개 재료] 김치를 썬다",
            component_label: "찌개 재료",
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
    const serviceFrom = vi.fn((table: string) => {
      if (table === "cooking_sessions") return { select: vi.fn(() => sessionQuery) };
      if (table === "cooking_session_meals") return { select: vi.fn(() => sessionMealsQuery) };
      if (table === "recipes") return { select: vi.fn(() => recipeQuery) };
      if (table === "recipe_ingredients") return { select: vi.fn(() => ingredientsQuery) };
      if (table === "recipe_steps") return { select: vi.fn(() => stepsQuery) };
      throw new Error(`unexpected service table: ${table}`);
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: serviceFrom,
    });
    createServiceRoleClient.mockReturnValue({ from: serviceFrom });

    const { GET } = await importCookModeRoute();
    const response = await GET(
      new NextRequest(`http://localhost:3000/api/v1/cooking/sessions/${sessionId}/cook-mode`),
      createSessionContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.recipe.title).toBe("숨김 처리된 레시피");
    expect(body.data.recipe.ingredients).toHaveLength(1);
    expect(body.data.recipe.steps).toHaveLength(1);
    expect(serviceFrom).toHaveBeenCalledWith("recipes");
    expect(serviceFrom).toHaveBeenCalledWith("recipe_ingredients");
    expect(serviceFrom).toHaveBeenCalledWith("recipe_steps");
    expect(recipeQuery.eq).toHaveBeenCalledWith("id", recipeId);
    expect(ingredientsQuery.eq).toHaveBeenCalledWith("recipe_id", recipeId);
    expect(stepsQuery.eq).toHaveBeenCalledWith("recipe_id", recipeId);
  });

  it("GET /cooking/sessions/{id}/cook-mode stops before deleted recipe-content reads when session owner mismatches", async () => {
    const sessionQuery = createMaybeSingleQuery([
      {
        data: { id: sessionId, user_id: "other-user", status: "in_progress" },
        error: null,
      },
    ]);
    const serviceFrom = vi.fn((table: string) => {
      if (table === "cooking_sessions") return { select: vi.fn(() => sessionQuery) };
      throw new Error(`unexpected service table: ${table}`);
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: serviceFrom,
    });
    createServiceRoleClient.mockReturnValue({ from: serviceFrom });

    const { GET } = await importCookModeRoute();
    const response = await GET(
      new NextRequest(`http://localhost:3000/api/v1/cooking/sessions/${sessionId}/cook-mode`),
      createSessionContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "FORBIDDEN" },
    });
    expect(serviceFrom).toHaveBeenCalledWith("cooking_sessions");
    expect(serviceFrom).not.toHaveBeenCalledWith("cooking_session_meals");
    expect(serviceFrom).not.toHaveBeenCalledWith("recipes");
    expect(serviceFrom).not.toHaveBeenCalledWith("recipe_ingredients");
    expect(serviceFrom).not.toHaveBeenCalledWith("recipe_steps");
  });

  it("GET /cooking/sessions/{id}/cook-mode rejects completed sessions before loading snapshots", async () => {
    const sessionQuery = createMaybeSingleQuery([
      {
        data: { id: sessionId, user_id: "user-1", status: "completed" },
        error: null,
      },
    ]);
    const sessionMealsSelect = vi.fn(() =>
      createArraySelectQuery([
        {
          data: [{ meal_id: mealId1, recipe_id: recipeId, cooking_servings: 4 }],
          error: null,
        },
      ]),
    );

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "cooking_sessions") return { select: vi.fn(() => sessionQuery) };
        if (table === "cooking_session_meals") return { select: sessionMealsSelect };
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importCookModeRoute();
    const response = await GET(
      new NextRequest(`http://localhost:3000/api/v1/cooking/sessions/${sessionId}/cook-mode`),
      createSessionContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "CONFLICT" },
    });
    expect(sessionMealsSelect).not.toHaveBeenCalled();
  });
});
