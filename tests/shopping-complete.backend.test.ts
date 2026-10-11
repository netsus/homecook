import { beforeEach, describe, expect, it, vi } from "vitest";

import { completeShoppingList, isShoppingApiError } from "@/lib/api/shopping";

const createRouteHandlerClient = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();
const formatBootstrapErrorMessage = vi.fn((error: unknown, fallbackMessage: string) => {
  if (error instanceof Error) {
    return `formatted: ${error.message}`;
  }

  return fallbackMessage;
});
const awardUserProgressEvent = vi.fn();
const recordUserGrowthActivityEvent = vi.fn();
const buildShoppingBundlePreparedSourceKey = vi.fn(() => "shopping_bundle_prepared:test-key");

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
}));

vi.mock("@/lib/server/user-progress", () => ({
  awardUserProgressEvent,
}));

vi.mock("@/lib/server/user-growth-activity", () => ({
  buildShoppingBundlePreparedSourceKey,
  recordUserGrowthActivityEvent,
}));

async function importCompleteRoute() {
  return import("@/app/api/v1/shopping/lists/[list_id]/complete/route");
}

const listId = "550e8400-e29b-41d4-a716-446655440001";

function createCompleteRequest(id = listId, body?: unknown) {
  return new Request(`http://localhost:3000/api/v1/shopping/lists/${id}/complete`, {
    method: "POST",
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
}

function createContext(id = listId) {
  return {
    params: Promise.resolve({
      list_id: id,
    }),
  };
}

function authenticatedClient(rpc?: ReturnType<typeof vi.fn>) {
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
    },
    from: vi.fn(),
    ...(rpc ? { rpc } : {}),
  };
}

describe("12a shopping complete backend", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    formatBootstrapErrorMessage.mockClear();
    awardUserProgressEvent.mockReset();
    buildShoppingBundlePreparedSourceKey.mockClear();
    recordUserGrowthActivityEvent.mockReset();
    ensurePublicUserRow.mockResolvedValue({});
    ensureUserBootstrapState.mockResolvedValue(undefined);
    awardUserProgressEvent.mockResolvedValue({
      awarded: false,
      duplicate: false,
      error: null,
      summary: null,
    });
    recordUserGrowthActivityEvent.mockResolvedValue({ recorded: true, duplicate: false, error: null });
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

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("returns 404 for invalid list ids before querying the database", async () => {
    const { POST } = await importCompleteRoute();
    const response = await POST(createCompleteRequest("not-a-uuid"), createContext("not-a-uuid"));

    expect(createRouteHandlerClient).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      data: null,
      error: { code: "RESOURCE_NOT_FOUND" },
    });
  });

  it("uses only the atomic complete_shopping_list RPC and records new-completion rewards", async () => {
    const reflectedItemId = "550e8400-e29b-41d4-a716-446655440301";
    const rpc = vi.fn(async () => ({
      data: {
        completed: true,
        meals_updated: 2,
        pantry_added: 1,
        pantry_added_item_ids: [reflectedItemId],
        completed_at: "2026-04-27T11:20:00.000Z",
        meal_ids: ["meal-1", "meal-2"],
        newly_completed: true,
      },
      error: null,
    }));
    const client = authenticatedClient(rpc);
    createRouteHandlerClient.mockResolvedValue(client);

    const { POST } = await importCompleteRoute();
    const response = await POST(
      createCompleteRequest(listId, { add_to_pantry_item_ids: [reflectedItemId] }),
      createContext(),
    );

    expect(rpc).toHaveBeenCalledWith("complete_shopping_list", {
      p_list_id: listId,
      p_user_id: "user-1",
      p_add_to_pantry_item_ids: [reflectedItemId],
    });
    expect(client.from).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        completed: true,
        meals_updated: 2,
        pantry_added: 1,
        pantry_added_item_ids: [reflectedItemId],
      },
      error: null,
    });
    expect(awardUserProgressEvent).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-1",
      eventType: "shopping_completed",
      sourceTable: "shopping_lists",
      sourceId: listId,
      occurredAt: "2026-04-27T11:20:00.000Z",
    });
    expect(buildShoppingBundlePreparedSourceKey).toHaveBeenCalledWith({
      actionKind: "shopping_list",
      mealIds: ["meal-1", "meal-2"],
    });
    expect(recordUserGrowthActivityEvent).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-1",
      activityType: "shopping_bundle_prepared",
      category: "shopping",
      sourceKey: "shopping_bundle_prepared:test-key",
      sourceTable: "shopping_lists",
      sourceId: listId,
      sourceMeta: {
        action_kind: "shopping_list",
        meal_ids: ["meal-1", "meal-2"],
        shopping_list_id: listId,
      },
      occurredAt: "2026-04-27T11:20:00.000Z",
    });
  });

  it("fails closed without direct table writes when the atomic RPC is unavailable", async () => {
    const client = authenticatedClient();
    createRouteHandlerClient.mockResolvedValue(client);

    const { POST } = await importCompleteRoute();
    const response = await POST(createCompleteRequest(), createContext());

    expect(client.from).not.toHaveBeenCalled();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      data: null,
      error: { code: "INTERNAL_ERROR" },
    });
  });

  it("keeps the atomic completion successful when secondary reward writers fail", async () => {
    awardUserProgressEvent.mockRejectedValue(new Error("progress unavailable"));
    recordUserGrowthActivityEvent.mockRejectedValue(new Error("activity unavailable"));
    const rpc = vi.fn(async () => ({
      data: {
        completed: true,
        meals_updated: 0,
        pantry_added: 0,
        pantry_added_item_ids: [],
        completed_at: "2026-04-27T11:20:00.000Z",
        meal_ids: ["meal-1"],
        newly_completed: true,
      },
      error: null,
    }));
    createRouteHandlerClient.mockResolvedValue(authenticatedClient(rpc));

    const { POST } = await importCompleteRoute();
    const response = await POST(createCompleteRequest(listId, { add_to_pantry_item_ids: [] }), createContext());

    expect(rpc).toHaveBeenCalledWith("complete_shopping_list", expect.objectContaining({
      p_add_to_pantry_item_ids: [],
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { completed: true, meals_updated: 0, pantry_added: 0, pantry_added_item_ids: [] },
    });
  });

  it("does not duplicate rewards when the RPC reports an already completed list", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        completed: true,
        meals_updated: 1,
        pantry_added: 1,
        pantry_added_item_ids: ["item-1"],
        completed_at: "2026-04-27T11:20:00.000Z",
        meal_ids: ["meal-recovered"],
        newly_completed: false,
      },
      error: null,
    }));
    createRouteHandlerClient.mockResolvedValue(authenticatedClient(rpc));

    const { POST } = await importCompleteRoute();
    const response = await POST(createCompleteRequest(), createContext());

    expect(rpc).toHaveBeenCalledWith("complete_shopping_list", expect.objectContaining({
      p_add_to_pantry_item_ids: null,
    }));
    expect(response.status).toBe(200);
    expect(awardUserProgressEvent).not.toHaveBeenCalled();
    expect(recordUserGrowthActivityEvent).not.toHaveBeenCalled();
  });

  it.each([
    ["VALIDATION_ERROR", 422],
    ["RESOURCE_NOT_FOUND", 404],
    ["FORBIDDEN", 403],
    ["CONFLICT", 409],
    ["UNKNOWN", 500],
  ])("maps RPC error %s to HTTP %i", async (errorCode, expectedStatus) => {
    const rpc = vi.fn(async () => ({
      data: { error_code: errorCode, message: "rpc rejected" },
      error: null,
    }));
    createRouteHandlerClient.mockResolvedValue(authenticatedClient(rpc));

    const { POST } = await importCompleteRoute();
    const response = await POST(createCompleteRequest(), createContext());

    expect(response.status).toBe(expectedStatus);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: errorCode, message: "rpc rejected" },
    });
  });

  it.each([
    [{ data: null, error: { message: "transport failed" } }],
    [{ data: null, error: null }],
  ])("returns 500 when the RPC result is unavailable", async (rpcResult) => {
    const rpc = vi.fn(async () => rpcResult);
    createRouteHandlerClient.mockResolvedValue(authenticatedClient(rpc));

    const { POST } = await importCompleteRoute();
    const response = await POST(createCompleteRequest(), createContext());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "INTERNAL_ERROR" },
    });
  });

  it("rejects an invalid pantry reflection body before calling the RPC", async () => {
    const rpc = vi.fn();
    createRouteHandlerClient.mockResolvedValue(authenticatedClient(rpc));

    const { POST } = await importCompleteRoute();
    const response = await POST(
      new Request(`http://localhost:3000/api/v1/shopping/lists/${listId}/complete`, {
        method: "POST",
        body: JSON.stringify({ add_to_pantry_item_ids: "not-an-array" }),
      }),
      createContext(),
    );

    expect(response.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns the formatted bootstrap error before calling the RPC", async () => {
    ensureUserBootstrapState.mockRejectedValue(new Error("bootstrap failed"));
    const rpc = vi.fn();
    createRouteHandlerClient.mockResolvedValue(authenticatedClient(rpc));

    const { POST } = await importCompleteRoute();
    const response = await POST(createCompleteRequest(), createContext());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { message: "formatted: bootstrap failed" },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("completeShoppingList helper returns completion summary when envelope is valid", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: { completed: true, meals_updated: 2, pantry_added: 1, pantry_added_item_ids: ["item-1"] },
          error: null,
        }),
        { status: 200 },
      ));
    vi.stubGlobal("fetch", fetchMock);

    const data = await completeShoppingList("list-1");

    expect(data).toEqual({ completed: true, meals_updated: 2, pantry_added: 1, pantry_added_item_ids: ["item-1"] });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/shopping/lists/list-1/complete",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("completeShoppingList helper sends selected pantry item ids when provided", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: { completed: true, meals_updated: 0, pantry_added: 2, pantry_added_item_ids: ["item-1", "item-2"] },
          error: null,
        }),
        { status: 200 },
      ));
    vi.stubGlobal("fetch", fetchMock);

    await completeShoppingList("list-1", { add_to_pantry_item_ids: ["item-1", "item-2"] });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/shopping/lists/list-1/complete",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "content-type": "application/json" }),
        body: JSON.stringify({ add_to_pantry_item_ids: ["item-1", "item-2"] }),
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
