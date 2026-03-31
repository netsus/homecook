import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

interface QueryError {
  code?: string;
  message: string;
}

interface QueryResult<T> {
  data: T;
  error: QueryError | null;
}

function createAwaitableQuery<T>(result: QueryResult<T>) {
  return {
    then(onFulfilled?: (value: QueryResult<T>) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
}

function nextResult<T>(results: Array<QueryResult<T>>, fallbackMessage: string) {
  const fallback: QueryResult<T> = {
    data: undefined as unknown as T,
    error: { message: fallbackMessage },
  };

  return results.shift() ?? fallback;
}

function createMealPlanColumnsTable({
  selectResults = [],
  maybeSingleResults = [],
  insertResults = [],
  updateResults = [],
  deleteResults = [],
}: {
  selectResults?: Array<QueryResult<unknown[]>>;
  maybeSingleResults?: Array<QueryResult<unknown | null>>;
  insertResults?: Array<QueryResult<unknown | null>>;
  updateResults?: Array<QueryResult<unknown | null>>;
  deleteResults?: Array<QueryResult<unknown | null>>;
}) {
  const selectQuery = {
    eq: vi.fn(() => selectQuery),
    order: vi.fn(() => selectQuery),
    limit: vi.fn(() => selectQuery),
    maybeSingle: vi.fn(() => createAwaitableQuery(nextResult(maybeSingleResults, "missing maybeSingle result"))),
    then(
      onFulfilled?: (value: QueryResult<unknown[]>) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(
        selectResults.shift() ?? {
          data: [],
          error: { message: "missing select result" },
        },
      ).then(onFulfilled, onRejected);
    },
  };

  const insertQuery = {
    select: vi.fn(() => insertQuery),
    maybeSingle: vi.fn(() => createAwaitableQuery(nextResult(insertResults, "missing insert result"))),
  };

  const updateQuery = {
    eq: vi.fn(() => updateQuery),
    select: vi.fn(() => updateQuery),
    maybeSingle: vi.fn(() => createAwaitableQuery(nextResult(updateResults, "missing update result"))),
  };

  const deleteQuery = {
    eq: vi.fn(() => deleteQuery),
    select: vi.fn(() => deleteQuery),
    maybeSingle: vi.fn(() => createAwaitableQuery(nextResult(deleteResults, "missing delete result"))),
  };

  return {
    select: vi.fn(() => selectQuery),
    insert: vi.fn(() => insertQuery),
    update: vi.fn(() => updateQuery),
    delete: vi.fn(() => deleteQuery),
    __selectQuery: selectQuery,
    __updateQuery: updateQuery,
    __deleteQuery: deleteQuery,
  };
}

function createMealsTable({
  selectResults,
}: {
  selectResults: Array<QueryResult<unknown[]>>;
}) {
  const selectQuery = {
    eq: vi.fn(() => selectQuery),
    limit: vi.fn(() => selectQuery),
    then(onFulfilled?: (value: QueryResult<unknown[]>) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(
        selectResults.shift() ?? {
          data: [],
          error: { message: "missing meals select result" },
        },
      ).then(onFulfilled, onRejected);
    },
  };

  return {
    select: vi.fn(() => selectQuery),
    __selectQuery: selectQuery,
  };
}

async function importColumnsRoute() {
  return import("@/app/api/v1/planner/columns/route");
}

async function importColumnDetailRoute() {
  return import("@/app/api/v1/planner/columns/[column_id]/route");
}

describe("planner column routes", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    createServiceRoleClient.mockReturnValue(null);
  });

  it("POST /api/v1/planner/columns returns 401 when user is not authenticated", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      from: vi.fn(),
    });

    const { POST } = await importColumnsRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/planner/columns", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "간식" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "UNAUTHORIZED",
      },
    });
  });

  it("POST /api/v1/planner/columns returns 422 for null body", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn(),
    });

    const { POST } = await importColumnsRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/planner/columns", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "null",
    }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
      },
    });
  });

  it("POST /api/v1/planner/columns returns 409 when max column count is reached", async () => {
    const columnsTable = createMealPlanColumnsTable({
      selectResults: [
        {
          data: [
            { id: "c1", sort_order: 0 },
            { id: "c2", sort_order: 1 },
            { id: "c3", sort_order: 2 },
            { id: "c4", sort_order: 3 },
            { id: "c5", sort_order: 4 },
          ],
          error: null,
        },
      ],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "meal_plan_columns") return columnsTable;

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importColumnsRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/planner/columns", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "간식" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "MAX_COLUMNS_REACHED",
      },
    });
  });

  it("POST /api/v1/planner/columns creates a column with next sort_order", async () => {
    const columnsTable = createMealPlanColumnsTable({
      selectResults: [
        {
          data: [
            { id: "c1", sort_order: 0 },
            { id: "c2", sort_order: 1 },
            { id: "c3", sort_order: 2 },
          ],
          error: null,
        },
      ],
      insertResults: [
        {
          data: { id: "c4", name: "간식", sort_order: 3 },
          error: null,
        },
      ],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "meal_plan_columns") return columnsTable;

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importColumnsRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/planner/columns", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "간식" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      success: true,
      data: {
        id: "c4",
        name: "간식",
        sort_order: 3,
      },
      error: null,
    });
    expect(columnsTable.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      name: "간식",
      sort_order: 3,
    });
  });

  it("POST /api/v1/planner/columns returns 409 when insert hits duplicate key", async () => {
    const columnsTable = createMealPlanColumnsTable({
      selectResults: [
        {
          data: [
            { id: "c1", sort_order: 0 },
            { id: "c2", sort_order: 1 },
          ],
          error: null,
        },
      ],
      insertResults: [
        {
          data: null,
          error: {
            code: "23505",
            message: "duplicate key value violates unique constraint",
          },
        },
      ],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "meal_plan_columns") return columnsTable;

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importColumnsRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/planner/columns", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "간식" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "MAX_COLUMNS_REACHED",
      },
    });
  });

  it("PATCH /api/v1/planner/columns/{id} returns 403 for another user's column", async () => {
    const columnsTable = createMealPlanColumnsTable({
      maybeSingleResults: [
        {
          data: {
            id: "column-1",
            user_id: "other-user",
            name: "점심",
            sort_order: 1,
          },
          error: null,
        },
      ],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "meal_plan_columns") return columnsTable;

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { PATCH } = await importColumnDetailRoute();
    const response = await PATCH(new Request("http://localhost:3000/api/v1/planner/columns/column-1", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "브런치" }),
    }), {
      params: Promise.resolve({ column_id: "550e8400-e29b-41d4-a716-446655440010" }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
      },
    });
  });

  it("PATCH /api/v1/planner/columns/{id} returns 422 for invalid sort_order", async () => {
    const columnsTable = createMealPlanColumnsTable({
      maybeSingleResults: [
        {
          data: {
            id: "column-1",
            user_id: "user-1",
            name: "점심",
            sort_order: 1,
          },
          error: null,
        },
      ],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "meal_plan_columns") return columnsTable;

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { PATCH } = await importColumnDetailRoute();
    const response = await PATCH(new Request("http://localhost:3000/api/v1/planner/columns/column-1", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ sort_order: -1 }),
    }), {
      params: Promise.resolve({ column_id: "550e8400-e29b-41d4-a716-446655440011" }),
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
      },
    });
  });

  it("PATCH /api/v1/planner/columns/{id} returns 422 for null body", async () => {
    const columnsTable = createMealPlanColumnsTable({
      maybeSingleResults: [
        {
          data: {
            id: "column-1",
            user_id: "user-1",
            name: "점심",
            sort_order: 1,
          },
          error: null,
        },
      ],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "meal_plan_columns") return columnsTable;

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { PATCH } = await importColumnDetailRoute();
    const response = await PATCH(new Request("http://localhost:3000/api/v1/planner/columns/column-1", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: "null",
    }), {
      params: Promise.resolve({ column_id: "550e8400-e29b-41d4-a716-446655440015" }),
    });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
      },
    });
  });

  it("PATCH /api/v1/planner/columns/{id} updates name and sort_order", async () => {
    const targetColumnId = "550e8400-e29b-41d4-a716-446655440012";
    const leftColumnId = "550e8400-e29b-41d4-a716-446655440112";
    const rightColumnId = "550e8400-e29b-41d4-a716-446655440212";

    const columnsTable = createMealPlanColumnsTable({
      selectResults: [
        {
          data: [
            { id: leftColumnId, sort_order: 0 },
            { id: targetColumnId, sort_order: 1 },
            { id: rightColumnId, sort_order: 2 },
          ],
          error: null,
        },
      ],
      maybeSingleResults: [
        {
          data: {
            id: targetColumnId,
            user_id: "user-1",
            name: "점심",
            sort_order: 1,
          },
          error: null,
        },
      ],
      updateResults: [
        {
          data: {
            id: targetColumnId,
            name: "점심",
            sort_order: 1000,
          },
          error: null,
        },
        {
          data: {
            id: leftColumnId,
            name: "아침",
            sort_order: 1001,
          },
          error: null,
        },
        {
          data: {
            id: rightColumnId,
            name: "저녁",
            sort_order: 1002,
          },
          error: null,
        },
        {
          data: {
            id: targetColumnId,
            name: "브런치",
            sort_order: 0,
          },
          error: null,
        },
        {
          data: {
            id: leftColumnId,
            name: "아침",
            sort_order: 1,
          },
          error: null,
        },
        {
          data: {
            id: rightColumnId,
            name: "저녁",
            sort_order: 2,
          },
          error: null,
        },
      ],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "meal_plan_columns") return columnsTable;

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { PATCH } = await importColumnDetailRoute();
    const response = await PATCH(new Request("http://localhost:3000/api/v1/planner/columns/column-1", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "브런치", sort_order: 0 }),
    }), {
      params: Promise.resolve({ column_id: targetColumnId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        id: targetColumnId,
        name: "브런치",
        sort_order: 0,
      },
      error: null,
    });
    expect(columnsTable.update).toHaveBeenCalledTimes(6);
  });

  it("DELETE /api/v1/planner/columns/{id} returns 404 when column does not exist", async () => {
    const columnsTable = createMealPlanColumnsTable({
      maybeSingleResults: [
        {
          data: null,
          error: null,
        },
      ],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "meal_plan_columns") return columnsTable;

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { DELETE } = await importColumnDetailRoute();
    const response = await DELETE(new Request("http://localhost:3000/api/v1/planner/columns/column-1", {
      method: "DELETE",
    }), {
      params: Promise.resolve({ column_id: "550e8400-e29b-41d4-a716-446655440016" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "RESOURCE_NOT_FOUND",
      },
    });
  });

  it("DELETE /api/v1/planner/columns/{id} returns 403 for another user's column", async () => {
    const columnsTable = createMealPlanColumnsTable({
      maybeSingleResults: [
        {
          data: {
            id: "column-1",
            user_id: "other-user",
            name: "점심",
            sort_order: 1,
          },
          error: null,
        },
      ],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "meal_plan_columns") return columnsTable;

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { DELETE } = await importColumnDetailRoute();
    const response = await DELETE(new Request("http://localhost:3000/api/v1/planner/columns/column-1", {
      method: "DELETE",
    }), {
      params: Promise.resolve({ column_id: "550e8400-e29b-41d4-a716-446655440017" }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
      },
    });
  });

  it("DELETE /api/v1/planner/columns/{id} returns 409 when meals exist", async () => {
    const columnsTable = createMealPlanColumnsTable({
      maybeSingleResults: [
        {
          data: {
            id: "column-1",
            user_id: "user-1",
            name: "점심",
            sort_order: 1,
          },
          error: null,
        },
      ],
    });
    const mealsTable = createMealsTable({
      selectResults: [
        {
          data: [{ id: "meal-1" }],
          error: null,
        },
      ],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "meal_plan_columns") return columnsTable;
        if (table === "meals") return mealsTable;

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { DELETE } = await importColumnDetailRoute();
    const response = await DELETE(new Request("http://localhost:3000/api/v1/planner/columns/column-1", {
      method: "DELETE",
    }), {
      params: Promise.resolve({ column_id: "550e8400-e29b-41d4-a716-446655440013" }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "COLUMN_HAS_MEALS",
      },
    });
  });

  it("DELETE /api/v1/planner/columns/{id} returns 204 on success", async () => {
    const columnsTable = createMealPlanColumnsTable({
      maybeSingleResults: [
        {
          data: {
            id: "column-1",
            user_id: "user-1",
            name: "점심",
            sort_order: 1,
          },
          error: null,
        },
      ],
      deleteResults: [
        {
          data: { id: "column-1" },
          error: null,
        },
      ],
    });
    const mealsTable = createMealsTable({
      selectResults: [
        {
          data: [],
          error: null,
        },
      ],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "meal_plan_columns") return columnsTable;
        if (table === "meals") return mealsTable;

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { DELETE } = await importColumnDetailRoute();
    const response = await DELETE(new Request("http://localhost:3000/api/v1/planner/columns/column-1", {
      method: "DELETE",
    }), {
      params: Promise.resolve({ column_id: "550e8400-e29b-41d4-a716-446655440014" }),
    });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
  });

  it("DELETE /api/v1/planner/columns/{id} maps foreign key conflict to 409", async () => {
    const columnsTable = createMealPlanColumnsTable({
      maybeSingleResults: [
        {
          data: {
            id: "column-1",
            user_id: "user-1",
            name: "점심",
            sort_order: 1,
          },
          error: null,
        },
      ],
      deleteResults: [
        {
          data: null,
          error: {
            code: "23503",
            message: "insert or update on table violates foreign key constraint",
          },
        },
      ],
    });
    const mealsTable = createMealsTable({
      selectResults: [
        {
          data: [],
          error: null,
        },
      ],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "meal_plan_columns") return columnsTable;
        if (table === "meals") return mealsTable;

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { DELETE } = await importColumnDetailRoute();
    const response = await DELETE(new Request("http://localhost:3000/api/v1/planner/columns/column-1", {
      method: "DELETE",
    }), {
      params: Promise.resolve({ column_id: "550e8400-e29b-41d4-a716-446655440018" }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "COLUMN_HAS_MEALS",
      },
    });
  });
});
