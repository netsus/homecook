import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  isShoppingApiError,
  reorderShoppingListItems,
} from "@/lib/api/shopping";

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

function createArraySelectQuery<T>(results: Array<QueryResult<T[]>>) {
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
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

function createUpdateQuery(results: Array<QueryResult<null>>) {
  const query = {
    eq: vi.fn(() => query),
    then(
      onFulfilled?: (value: QueryResult<null>) => unknown,
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

async function importReorderRoute() {
  return import("@/app/api/v1/shopping/lists/[list_id]/items/reorder/route");
}

const listId = "550e8400-e29b-41d4-a716-446655440001";
const itemOneId = "550e8400-e29b-41d4-a716-446655440111";
const itemTwoId = "550e8400-e29b-41d4-a716-446655440222";
const foreignItemId = "550e8400-e29b-41d4-a716-446655440333";

function createReorderRequest(body: unknown) {
  return new Request(`http://localhost:3000/api/v1/shopping/lists/${listId}/items/reorder`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createContext(id = listId) {
  return {
    params: Promise.resolve({
      list_id: id,
    }),
  };
}

describe("11 shopping reorder backend", () => {
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

  it("returns 401 when reorder is requested without authentication", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      from: vi.fn(),
    });

    const { PATCH } = await importReorderRoute();
    const response = await PATCH(
      createReorderRequest({
        orders: [{ item_id: itemOneId, sort_order: 10 }],
      }),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("returns 404 for invalid list ids before querying the database", async () => {
    const { PATCH } = await importReorderRoute();
    const response = await PATCH(
      new Request("http://localhost:3000/api/v1/shopping/lists/not-a-uuid/items/reorder", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orders: [{ item_id: itemOneId, sort_order: 10 }],
        }),
      }),
      createContext("not-a-uuid"),
    );
    const body = await response.json();

    expect(createRouteHandlerClient).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "RESOURCE_NOT_FOUND" },
    });
  });

  it("returns 422 when orders are missing or empty", async () => {
    const { PATCH } = await importReorderRoute();
    const missingResponse = await PATCH(createReorderRequest({}), createContext());
    const emptyResponse = await PATCH(createReorderRequest({ orders: [] }), createContext());

    expect(missingResponse.status).toBe(422);
    expect(await missingResponse.json()).toMatchObject({
      success: false,
      data: null,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(emptyResponse.status).toBe(422);
  });

  it("updates only items that belong to the list and ignores unknown item ids", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: listId,
          user_id: "user-1",
          is_completed: false,
        },
        error: null,
      },
    ]);
    const itemsQuery = createArraySelectQuery([
      {
        data: [{ id: itemOneId }, { id: itemTwoId }],
        error: null,
      },
    ]);
    const updateResults: Array<QueryResult<null>> = [
      { data: null, error: null },
      { data: null, error: null },
    ];
    const updateQueries: Array<ReturnType<typeof createUpdateQuery>> = [];
    const update = vi.fn(() => {
      const query = createUpdateQuery(updateResults);
      updateQueries.push(query);
      return query;
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") {
          return { select: vi.fn(() => listQuery) };
        }
        if (table === "shopping_list_items") {
          return {
            select: vi.fn(() => itemsQuery),
            update,
          };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { PATCH } = await importReorderRoute();
    const response = await PATCH(
      createReorderRequest({
        orders: [
          { item_id: itemOneId, sort_order: 30 },
          { item_id: foreignItemId, sort_order: 10 },
          { item_id: itemTwoId, sort_order: 20 },
        ],
      }),
      createContext(),
    );
    const body = await response.json();

    expect(itemsQuery.in).toHaveBeenCalledWith("id", [itemOneId, foreignItemId, itemTwoId]);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(1, { sort_order: 30 });
    expect(update).toHaveBeenNthCalledWith(2, { sort_order: 20 });
    expect(updateQueries[0].eq).toHaveBeenCalledWith("id", itemOneId);
    expect(updateQueries[0].eq).toHaveBeenCalledWith("shopping_list_id", listId);
    expect(updateQueries[1].eq).toHaveBeenCalledWith("id", itemTwoId);
    expect(updateQueries[1].eq).toHaveBeenCalledWith("shopping_list_id", listId);
    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { updated: 2 },
      error: null,
    });
  });

  it("returns 403 when another user's shopping list is requested", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: listId,
          user_id: "other-user",
          is_completed: false,
        },
        error: null,
      },
    ]);
    const update = vi.fn();

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") {
          return { select: vi.fn(() => listQuery) };
        }
        if (table === "shopping_list_items") {
          return { update };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { PATCH } = await importReorderRoute();
    const response = await PATCH(
      createReorderRequest({
        orders: [{ item_id: itemOneId, sort_order: 10 }],
      }),
      createContext(),
    );
    const body = await response.json();

    expect(update).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "FORBIDDEN" },
    });
  });

  it("returns 409 when reordering a completed shopping list", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: listId,
          user_id: "user-1",
          is_completed: true,
        },
        error: null,
      },
    ]);
    const update = vi.fn();

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") {
          return { select: vi.fn(() => listQuery) };
        }
        if (table === "shopping_list_items") {
          return { update };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { PATCH } = await importReorderRoute();
    const response = await PATCH(
      createReorderRequest({
        orders: [{ item_id: itemOneId, sort_order: 10 }],
      }),
      createContext(),
    );
    const body = await response.json();

    expect(update).not.toHaveBeenCalled();
    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "CONFLICT" },
    });
  });

  it("returns the same result for repeated idempotent reorder requests", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: listId,
          user_id: "user-1",
          is_completed: false,
        },
        error: null,
      },
      {
        data: {
          id: listId,
          user_id: "user-1",
          is_completed: false,
        },
        error: null,
      },
    ]);
    const itemsQuery = createArraySelectQuery([
      {
        data: [{ id: itemOneId }, { id: itemTwoId }],
        error: null,
      },
      {
        data: [{ id: itemOneId }, { id: itemTwoId }],
        error: null,
      },
    ]);
    const updateResults: Array<QueryResult<null>> = [
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ];
    const update = vi.fn(() => createUpdateQuery(updateResults));

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") {
          return { select: vi.fn(() => listQuery) };
        }
        if (table === "shopping_list_items") {
          return {
            select: vi.fn(() => itemsQuery),
            update,
          };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { PATCH } = await importReorderRoute();
    const context = createContext();
    const requestBody = {
      orders: [
        { item_id: itemOneId, sort_order: 10 },
        { item_id: itemTwoId, sort_order: 20 },
      ],
    };
    const firstResponse = await PATCH(createReorderRequest(requestBody), context);
    const secondResponse = await PATCH(createReorderRequest(requestBody), context);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(await secondResponse.json()).toEqual(await firstResponse.json());
  });

  it("reorderShoppingListItems helper returns updated count when envelope is valid", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: { updated: 2 },
          error: null,
        }),
        { status: 200 },
      ));
    vi.stubGlobal("fetch", fetchMock);

    const data = await reorderShoppingListItems("list-1", {
      orders: [
        { item_id: "item-1", sort_order: 10 },
        { item_id: "item-2", sort_order: 20 },
      ],
    });

    expect(data.updated).toBe(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/shopping/lists/list-1/items/reorder",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          orders: [
            { item_id: "item-1", sort_order: 10 },
            { item_id: "item-2", sort_order: 20 },
          ],
        }),
      }),
    );
  });

  it("reorderShoppingListItems helper throws structured error on API failure", async () => {
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

    await expect(
      reorderShoppingListItems("list-1", {
        orders: [{ item_id: "item-1", sort_order: 10 }],
      }),
    ).rejects.toSatisfy((error: unknown) => {
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
