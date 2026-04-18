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
  code?: string;
  message: string;
}

interface QueryResult<T> {
  data: T;
  error: QueryError | null;
}

function createMaybeSingleQuery<T>(results: Array<QueryResult<T | null>>) {
  const query = {
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    maybeSingle: vi.fn(() =>
      Promise.resolve(
        results.shift() ?? {
          data: null,
          error: { message: "missing maybeSingle result" },
        },
      ),
    ),
  };

  return query;
}

function createMealsTable({
  selectResults,
  updateResults = [],
  deleteResults = [],
}: {
  selectResults: Array<QueryResult<{
    id: string;
    user_id: string;
    planned_servings: number;
    status: string;
  } | null>>;
  updateResults?: Array<QueryResult<{
    id: string;
    user_id: string;
    planned_servings: number;
    status: string;
  } | null>>;
  deleteResults?: Array<QueryResult<{ id: string } | null>>;
}) {
  const selectQuery = createMaybeSingleQuery(selectResults);
  const updateQuery = createMaybeSingleQuery(updateResults);
  const deleteQuery = createMaybeSingleQuery(deleteResults);

  return {
    select: vi.fn(() => selectQuery),
    update: vi.fn(() => updateQuery),
    delete: vi.fn(() => deleteQuery),
  };
}

async function importRoute() {
  return import("@/app/api/v1/meals/[meal_id]/route");
}

describe("/api/v1/meals/[meal_id]", () => {
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

  it("returns 401 when the user is not authenticated for PATCH", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      from: vi.fn(),
    });

    const { PATCH } = await importRoute();
    const response = await PATCH(
      new Request("http://localhost:3000/api/v1/meals/550e8400-e29b-41d4-a716-446655440001", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planned_servings: 2 }),
      }),
      {
        params: Promise.resolve({ meal_id: "550e8400-e29b-41d4-a716-446655440001" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("returns 422 when planned_servings is invalid for PATCH", async () => {
    const { PATCH } = await importRoute();
    const response = await PATCH(
      new Request("http://localhost:3000/api/v1/meals/550e8400-e29b-41d4-a716-446655440002", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planned_servings: 0 }),
      }),
      {
        params: Promise.resolve({ meal_id: "550e8400-e29b-41d4-a716-446655440002" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "planned_servings", reason: "min_value" }],
      },
    });
  });

  it("returns 404 when the meal does not exist for PATCH", async () => {
    const mealsTable = createMealsTable({
      selectResults: [{ data: null, error: null }],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from: vi.fn((table: string) => {
        if (table === "meals") return mealsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { PATCH } = await importRoute();
    const response = await PATCH(
      new Request("http://localhost:3000/api/v1/meals/550e8400-e29b-41d4-a716-446655440003", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planned_servings: 2 }),
      }),
      {
        params: Promise.resolve({ meal_id: "550e8400-e29b-41d4-a716-446655440003" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      error: { code: "RESOURCE_NOT_FOUND" },
    });
  });

  it("returns 403 when another user's meal is patched", async () => {
    const mealsTable = createMealsTable({
      selectResults: [
        {
          data: {
            id: "meal-1",
            user_id: "other-user",
            planned_servings: 2,
            status: "registered",
          },
          error: null,
        },
      ],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from: vi.fn((table: string) => {
        if (table === "meals") return mealsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { PATCH } = await importRoute();
    const response = await PATCH(
      new Request("http://localhost:3000/api/v1/meals/550e8400-e29b-41d4-a716-446655440004", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planned_servings: 3 }),
      }),
      {
        params: Promise.resolve({ meal_id: "550e8400-e29b-41d4-a716-446655440004" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      success: false,
      error: { code: "FORBIDDEN" },
    });
  });

  it("returns 409 when PATCH hits a conflict", async () => {
    const mealsTable = createMealsTable({
      selectResults: [
        {
          data: {
            id: "meal-1",
            user_id: "user-1",
            planned_servings: 2,
            status: "shopping_done",
          },
          error: null,
        },
      ],
      updateResults: [
        {
          data: null,
          error: { code: "409", message: "status conflict" },
        },
      ],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from: vi.fn((table: string) => {
        if (table === "meals") return mealsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { PATCH } = await importRoute();
    const response = await PATCH(
      new Request("http://localhost:3000/api/v1/meals/550e8400-e29b-41d4-a716-446655440005", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planned_servings: 4 }),
      }),
      {
        params: Promise.resolve({ meal_id: "550e8400-e29b-41d4-a716-446655440005" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      error: { code: "CONFLICT" },
    });
  });

  it("updates planned_servings without changing status", async () => {
    const mealsTable = createMealsTable({
      selectResults: [
        {
          data: {
            id: "meal-1",
            user_id: "user-1",
            planned_servings: 2,
            status: "cook_done",
          },
          error: null,
        },
      ],
      updateResults: [
        {
          data: {
            id: "meal-1",
            user_id: "user-1",
            planned_servings: 3,
            status: "cook_done",
          },
          error: null,
        },
      ],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from: vi.fn((table: string) => {
        if (table === "meals") return mealsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { PATCH } = await importRoute();
    const response = await PATCH(
      new Request("http://localhost:3000/api/v1/meals/550e8400-e29b-41d4-a716-446655440006", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planned_servings: 3 }),
      }),
      {
        params: Promise.resolve({ meal_id: "550e8400-e29b-41d4-a716-446655440006" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      error: null,
      data: {
        id: "meal-1",
        planned_servings: 3,
        status: "cook_done",
      },
    });
  });

  it("returns 404 when the meal does not exist for DELETE", async () => {
    const mealsTable = createMealsTable({
      selectResults: [{ data: null, error: null }],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from: vi.fn((table: string) => {
        if (table === "meals") return mealsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { DELETE } = await importRoute();
    const response = await DELETE(
      new Request("http://localhost:3000/api/v1/meals/550e8400-e29b-41d4-a716-446655440007", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({ meal_id: "550e8400-e29b-41d4-a716-446655440007" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      error: { code: "RESOURCE_NOT_FOUND" },
    });
  });

  it("returns 409 when DELETE hits a conflict", async () => {
    const mealsTable = createMealsTable({
      selectResults: [
        {
          data: {
            id: "meal-1",
            user_id: "user-1",
            planned_servings: 2,
            status: "shopping_done",
          },
          error: null,
        },
      ],
      deleteResults: [
        {
          data: null,
          error: { code: "409", message: "downstream conflict" },
        },
      ],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from: vi.fn((table: string) => {
        if (table === "meals") return mealsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { DELETE } = await importRoute();
    const response = await DELETE(
      new Request("http://localhost:3000/api/v1/meals/550e8400-e29b-41d4-a716-446655440008", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({ meal_id: "550e8400-e29b-41d4-a716-446655440008" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      error: { code: "CONFLICT" },
    });
  });

  it("deletes the meal and returns 204", async () => {
    const mealsTable = createMealsTable({
      selectResults: [
        {
          data: {
            id: "meal-1",
            user_id: "user-1",
            planned_servings: 2,
            status: "registered",
          },
          error: null,
        },
      ],
      deleteResults: [
        {
          data: { id: "meal-1" },
          error: null,
        },
      ],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from: vi.fn((table: string) => {
        if (table === "meals") return mealsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { DELETE } = await importRoute();
    const response = await DELETE(
      new Request("http://localhost:3000/api/v1/meals/550e8400-e29b-41d4-a716-446655440009", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({ meal_id: "550e8400-e29b-41d4-a716-446655440009" }),
      },
    );

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });
});
