import { readFile } from "node:fs/promises";

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

const sessionId = "550e8400-e29b-41d4-a716-446655440301";
const ingredientId1 = "550e8400-e29b-41d4-a716-446655440401";
const ingredientId2 = "550e8400-e29b-41d4-a716-446655440402";
const leftoverDishId = "550e8400-e29b-41d4-a716-446655440501";

async function importCompleteRoute() {
  return import("@/app/api/v1/cooking/sessions/[session_id]/complete/route");
}

function createSessionContext(id = sessionId) {
  return {
    params: Promise.resolve({
      session_id: id,
    }),
  };
}

function createJsonRequest(body: unknown) {
  return new Request(`http://localhost:3000/api/v1/cooking/sessions/${sessionId}/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("15a cook planner complete backend", () => {
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

  it("POST /cooking/sessions/{id}/complete returns 401 when the user is not authenticated", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      rpc: vi.fn(),
    });

    const { POST } = await importCompleteRoute();
    const response = await POST(createJsonRequest({ consumed_ingredient_ids: [] }), createSessionContext());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("POST /cooking/sessions/{id}/complete validates consumed ingredient ids", async () => {
    const { POST } = await importCompleteRoute();
    const response = await POST(
      createJsonRequest({ consumed_ingredient_ids: [ingredientId1, "not-a-uuid"] }),
      createSessionContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "consumed_ingredient_ids", reason: "invalid_uuid" }],
      },
    });
  });

  it("POST /cooking/sessions/{id}/complete delegates the atomic completion to the database function", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        session_id: sessionId,
        status: "completed",
        meals_updated: 2,
        leftover_dish_id: leftoverDishId,
        pantry_removed: 2,
        cook_count: 90,
      },
      error: null,
    }));

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      rpc,
    });

    const { POST } = await importCompleteRoute();
    const response = await POST(
      createJsonRequest({ consumed_ingredient_ids: [ingredientId1, ingredientId1, ingredientId2] }),
      createSessionContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        session_id: sessionId,
        status: "completed",
        meals_updated: 2,
        leftover_dish_id: leftoverDishId,
        pantry_removed: 2,
        cook_count: 90,
      },
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith("complete_cooking_session", {
      p_session_id: sessionId,
      p_user_id: "user-1",
      p_consumed_ingredient_ids: [ingredientId1, ingredientId2],
    });
  });

  it("POST /cooking/sessions/{id}/complete allows first-time completion without consumed ingredients", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        session_id: sessionId,
        status: "completed",
        meals_updated: 1,
        leftover_dish_id: leftoverDishId,
        pantry_removed: 0,
        cook_count: 1,
      },
      error: null,
    }));

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      rpc,
    });

    const { POST } = await importCompleteRoute();
    const response = await POST(createJsonRequest({ consumed_ingredient_ids: [] }), createSessionContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        session_id: sessionId,
        status: "completed",
        pantry_removed: 0,
      },
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith("complete_cooking_session", {
      p_session_id: sessionId,
      p_user_id: "user-1",
      p_consumed_ingredient_ids: [],
    });
  });

  it("POST /cooking/sessions/{id}/complete is idempotent for already completed sessions", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      rpc: vi.fn(async () => ({
        data: {
          session_id: sessionId,
          status: "completed",
          meals_updated: 2,
          leftover_dish_id: leftoverDishId,
          pantry_removed: 0,
          cook_count: 90,
        },
        error: null,
      })),
    });

    const { POST } = await importCompleteRoute();
    const response = await POST(createJsonRequest({ consumed_ingredient_ids: [] }), createSessionContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        session_id: sessionId,
        status: "completed",
      },
      error: null,
    });
  });

  it.each([
    {
      errorCode: "RESOURCE_NOT_FOUND",
      message: "요리 세션을 찾을 수 없어요.",
      status: 404,
    },
    {
      errorCode: "FORBIDDEN",
      message: "내 요리 세션만 완료할 수 있어요.",
      status: 403,
    },
    {
      errorCode: "CONFLICT",
      message: "취소된 요리 세션은 완료할 수 없어요.",
      status: 409,
    },
  ])(
    "POST /cooking/sessions/{id}/complete maps $errorCode database policy errors to API errors",
    async ({ errorCode, message, status }) => {
      createRouteHandlerClient.mockResolvedValue({
        auth: {
          getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
        },
        rpc: vi.fn(async () => ({
          data: {
            error_code: errorCode,
            message,
          },
          error: null,
        })),
      });

      const { POST } = await importCompleteRoute();
      const response = await POST(createJsonRequest({ consumed_ingredient_ids: [] }), createSessionContext());
      const body = await response.json();

      expect(response.status).toBe(status);
      expect(body).toMatchObject({
        success: false,
        data: null,
        error: { code: errorCode },
      });
    },
  );

  it("adds the leftover_dishes schema and atomic completion function migration", async () => {
    const migration = await readFile(
      "supabase/migrations/20260429080000_15a_cook_planner_complete.sql",
      "utf8",
    );

    expect(migration).toContain("create type public.leftover_dish_status_type");
    expect(migration).toContain("create table if not exists public.leftover_dishes");
    expect(migration).toContain("alter table public.meals");
    expect(migration).toContain("public.complete_cooking_session");
    expect(migration).toContain("auth.uid()");
    expect(migration).toContain("from public.recipe_ingredients");
    expect(migration).toContain("for update");
  });
});
