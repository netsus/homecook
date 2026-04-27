import { beforeEach, describe, expect, it, vi } from "vitest";

import { completeShoppingList, isShoppingApiError } from "@/lib/api/shopping";

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

function createUpdateMaybeSingleQuery<T>(results: Array<QueryResult<T | null>>) {
  const query = {
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    maybeSingle: vi.fn(async () =>
      results.shift() ?? {
        data: null,
        error: { message: "missing update result" },
      }),
  };

  return query;
}

function createArrayUpdateQuery<T>(results: Array<QueryResult<T[]>>) {
  const query = {
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    then(
      onFulfilled?: (value: QueryResult<T[]>) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(
        results.shift() ?? {
          data: null,
          error: { message: "missing update result" },
        },
      ).then(onFulfilled, onRejected);
    },
  };

  return query;
}

async function importCompleteRoute() {
  return import("@/app/api/v1/shopping/lists/[list_id]/complete/route");
}

const listId = "550e8400-e29b-41d4-a716-446655440001";

function createCompleteRequest(id = listId) {
  return new Request(`http://localhost:3000/api/v1/shopping/lists/${id}/complete`, {
    method: "POST",
  });
}

function createContext(id = listId) {
  return {
    params: Promise.resolve({
      list_id: id,
    }),
  };
}

describe("12a shopping complete backend", () => {
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

  it("returns 401 when completion is requested without authentication", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      from: vi.fn(),
    });

    const { POST } = await importCompleteRoute();
    const response = await POST(createCompleteRequest(), createContext());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("returns 404 for invalid list ids before querying the database", async () => {
    const { POST } = await importCompleteRoute();
    const response = await POST(createCompleteRequest("not-a-uuid"), createContext("not-a-uuid"));
    const body = await response.json();

    expect(createRouteHandlerClient).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "RESOURCE_NOT_FOUND" },
    });
  });

  it("marks the shopping list complete and transitions only registered linked meals", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: listId,
          user_id: "user-1",
          is_completed: false,
          completed_at: null,
        },
        error: null,
      },
    ]);
    const listUpdateQuery = createUpdateMaybeSingleQuery([
      {
        data: {
          id: listId,
          is_completed: true,
          completed_at: "2026-04-27T11:20:00.000Z",
        },
        error: null,
      },
    ]);
    const mealsUpdateQuery = createArrayUpdateQuery([
      {
        data: [{ id: "meal-1" }, { id: "meal-2" }],
        error: null,
      },
    ]);
    const updateList = vi.fn((values: { is_completed: true; completed_at: string }) => {
      void values;
      return listUpdateQuery;
    });
    const updateMeals = vi.fn(() => mealsUpdateQuery);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") {
          return {
            select: vi.fn(() => listQuery),
            update: updateList,
          };
        }
        if (table === "meals") {
          return {
            update: updateMeals,
          };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importCompleteRoute();
    const response = await POST(createCompleteRequest(), createContext());
    const body = await response.json();

    expect(updateList).toHaveBeenCalledWith(
      expect.objectContaining({
        is_completed: true,
      }),
    );
    expect(updateList.mock.calls[0][0].completed_at).toEqual(expect.any(String));
    expect(listUpdateQuery.eq).toHaveBeenCalledWith("id", listId);
    expect(listUpdateQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(updateMeals).toHaveBeenCalledWith({ status: "shopping_done" });
    expect(mealsUpdateQuery.eq).toHaveBeenCalledWith("shopping_list_id", listId);
    expect(mealsUpdateQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(mealsUpdateQuery.eq).toHaveBeenCalledWith("status", "registered");
    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { completed: true, meals_updated: 2 },
      error: null,
    });
  });

  it("returns 200 with no meal changes when the completed list has no registered meals", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: listId,
          user_id: "user-1",
          is_completed: true,
          completed_at: "2026-04-27T10:20:00.000Z",
        },
        error: null,
      },
    ]);
    const mealsUpdateQuery = createArrayUpdateQuery([
      {
        data: [],
        error: null,
      },
    ]);
    const updateList = vi.fn();
    const updateMeals = vi.fn(() => mealsUpdateQuery);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") {
          return {
            select: vi.fn(() => listQuery),
            update: updateList,
          };
        }
        if (table === "meals") {
          return {
            update: updateMeals,
          };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importCompleteRoute();
    const response = await POST(createCompleteRequest(), createContext());
    const body = await response.json();

    expect(updateList).not.toHaveBeenCalled();
    expect(updateMeals).toHaveBeenCalledWith({ status: "shopping_done" });
    expect(mealsUpdateQuery.eq).toHaveBeenCalledWith("shopping_list_id", listId);
    expect(mealsUpdateQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(mealsUpdateQuery.eq).toHaveBeenCalledWith("status", "registered");
    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { completed: true, meals_updated: 0 },
      error: null,
    });
  });

  it("recovers registered meal transitions when the list was already marked complete", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: listId,
          user_id: "user-1",
          is_completed: true,
          completed_at: "2026-04-27T10:20:00.000Z",
        },
        error: null,
      },
    ]);
    const mealsUpdateQuery = createArrayUpdateQuery([
      {
        data: [{ id: "meal-recovered" }],
        error: null,
      },
    ]);
    const updateList = vi.fn();
    const updateMeals = vi.fn(() => mealsUpdateQuery);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") {
          return {
            select: vi.fn(() => listQuery),
            update: updateList,
          };
        }
        if (table === "meals") {
          return {
            update: updateMeals,
          };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importCompleteRoute();
    const response = await POST(createCompleteRequest(), createContext());
    const body = await response.json();

    expect(updateList).not.toHaveBeenCalled();
    expect(updateMeals).toHaveBeenCalledWith({ status: "shopping_done" });
    expect(mealsUpdateQuery.eq).toHaveBeenCalledWith("shopping_list_id", listId);
    expect(mealsUpdateQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(mealsUpdateQuery.eq).toHaveBeenCalledWith("status", "registered");
    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { completed: true, meals_updated: 1 },
      error: null,
    });
  });

  it("returns 403 when another user's shopping list is completed", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: listId,
          user_id: "other-user",
          is_completed: false,
          completed_at: null,
        },
        error: null,
      },
    ]);
    const updateList = vi.fn();

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") {
          return {
            select: vi.fn(() => listQuery),
            update: updateList,
          };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importCompleteRoute();
    const response = await POST(createCompleteRequest(), createContext());
    const body = await response.json();

    expect(updateList).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "FORBIDDEN" },
    });
  });

  it("returns 404 when the shopping list does not exist", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: null,
        error: null,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") {
          return { select: vi.fn(() => listQuery) };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importCompleteRoute();
    const response = await POST(createCompleteRequest(), createContext());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "RESOURCE_NOT_FOUND" },
    });
  });

  it("completeShoppingList helper returns completion summary when envelope is valid", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: { completed: true, meals_updated: 2 },
          error: null,
        }),
        { status: 200 },
      ));
    vi.stubGlobal("fetch", fetchMock);

    const data = await completeShoppingList("list-1");

    expect(data).toEqual({ completed: true, meals_updated: 2 });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/shopping/lists/list-1/complete",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("completeShoppingList helper throws structured error on API failure", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: false,
          data: null,
          error: {
            code: "CONFLICT",
            message: "완료된 장보기 기록은 수정할 수 없어요.",
            fields: [],
          },
        }),
        { status: 409 },
      ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeShoppingList("list-1")).rejects.toSatisfy((error: unknown) => {
      expect(isShoppingApiError(error)).toBe(true);

      if (!isShoppingApiError(error)) {
        return false;
      }

      expect(error.status).toBe(409);
      expect(error.code).toBe("CONFLICT");
      return true;
    });
  });
});
