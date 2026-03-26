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
    then(
      onFulfilled?: (value: QueryResult<T>) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
}

function createRecipesTable({
  selectResults,
  updateResults = [],
}: {
  selectResults: Array<QueryResult<{ id: string; like_count: number } | null>>;
  updateResults?: Array<QueryResult<{ like_count: number } | null>>;
}) {
  const selectQuery = {
    eq: vi.fn(() => selectQuery),
    maybeSingle: vi.fn(() => createAwaitableQuery(selectResults.shift() ?? {
      data: null,
      error: { message: "missing select result" },
    })),
  };

  const updateQuery = {
    eq: vi.fn(() => updateQuery),
    select: vi.fn(() => updateQuery),
    maybeSingle: vi.fn(() => createAwaitableQuery(updateResults.shift() ?? {
      data: null,
      error: { message: "missing update result" },
    })),
  };

  return {
    select: vi.fn(() => selectQuery),
    update: vi.fn(() => updateQuery),
    __selectQuery: selectQuery,
    __updateQuery: updateQuery,
  };
}

function createRecipeLikesTable({
  selectResults,
  insertResults = [],
  deleteResults = [],
}: {
  selectResults: Array<QueryResult<{ id: string } | null>>;
  insertResults?: Array<QueryResult<{ id: string } | null>>;
  deleteResults?: Array<QueryResult<{ id: string } | null>>;
}) {
  const selectQuery = {
    eq: vi.fn(() => selectQuery),
    maybeSingle: vi.fn(() => createAwaitableQuery(selectResults.shift() ?? {
      data: null,
      error: { message: "missing like select result" },
    })),
  };

  const insertQuery = {
    select: vi.fn(() => insertQuery),
    maybeSingle: vi.fn(() => createAwaitableQuery(insertResults.shift() ?? {
      data: null,
      error: { message: "missing like insert result" },
    })),
  };

  const deleteQuery = {
    eq: vi.fn(() => deleteQuery),
    select: vi.fn(() => deleteQuery),
    maybeSingle: vi.fn(() => createAwaitableQuery(deleteResults.shift() ?? {
      data: null,
      error: { message: "missing like delete result" },
    })),
  };

  return {
    select: vi.fn(() => selectQuery),
    insert: vi.fn(() => insertQuery),
    delete: vi.fn(() => deleteQuery),
    __selectQuery: selectQuery,
    __insertQuery: insertQuery,
    __deleteQuery: deleteQuery,
  };
}

async function importRoute() {
  return import("@/app/api/v1/recipes/[id]/like/route");
}

describe("POST /api/v1/recipes/[id]/like", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    createServiceRoleClient.mockReturnValue(null);
  });

  it("returns 401 when the user is not authenticated", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
        })),
      },
      from: vi.fn(),
    });

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/recipe-1/like", {
      method: "POST",
    }), {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440020" }),
    });
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

  it("returns 404 when the recipe does not exist", async () => {
    const recipesTable = createRecipesTable({
      selectResults: [
        {
          data: null,
          error: null,
        },
      ],
    });
    const recipeLikesTable = createRecipeLikesTable({
      selectResults: [],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "recipes") return recipesTable;
        if (table === "recipe_likes") return recipeLikesTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/missing/like", {
      method: "POST",
    }), {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440021" }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "NOT_FOUND",
      },
    });
  });

  it("inserts a like and increments the denormalized count", async () => {
    const recipesTable = createRecipesTable({
      selectResults: [
        {
          data: { id: "recipe-1", like_count: 3 },
          error: null,
        },
      ],
      updateResults: [
        {
          data: { like_count: 4 },
          error: null,
        },
      ],
    });
    const recipeLikesTable = createRecipeLikesTable({
      selectResults: [
        {
          data: null,
          error: null,
        },
      ],
      insertResults: [
        {
          data: { id: "like-1" },
          error: null,
        },
      ],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "recipes") return recipesTable;
        if (table === "recipe_likes") return recipeLikesTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/recipe-1/like", {
      method: "POST",
    }), {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440022" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      error: null,
      data: {
        is_liked: true,
        like_count: 4,
      },
    });
    expect(recipeLikesTable.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      recipe_id: "550e8400-e29b-41d4-a716-446655440022",
    });
    expect(recipesTable.update).toHaveBeenCalledWith({ like_count: 4 });
  });

  it("deletes only the authenticated user's like and never lets like_count go below zero", async () => {
    const recipesTable = createRecipesTable({
      selectResults: [
        {
          data: { id: "recipe-1", like_count: 0 },
          error: null,
        },
      ],
      updateResults: [
        {
          data: { like_count: 0 },
          error: null,
        },
      ],
    });
    const recipeLikesTable = createRecipeLikesTable({
      selectResults: [
        {
          data: { id: "like-1" },
          error: null,
        },
      ],
      deleteResults: [
        {
          data: { id: "like-1" },
          error: null,
        },
      ],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "recipes") return recipesTable;
        if (table === "recipe_likes") return recipeLikesTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/recipe-1/like", {
      method: "POST",
    }), {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440023" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      error: null,
      data: {
        is_liked: false,
        like_count: 0,
      },
    });
    expect(recipeLikesTable.delete).toHaveBeenCalled();
    expect(recipeLikesTable.__deleteQuery.eq).toHaveBeenNthCalledWith(1, "id", "like-1");
    expect(recipeLikesTable.__deleteQuery.eq).toHaveBeenNthCalledWith(2, "user_id", "user-1");
    expect(recipesTable.update).toHaveBeenCalledWith({ like_count: 0 });
  });

  it("handles UNIQUE conflicts by returning the final liked state", async () => {
    const recipesTable = createRecipesTable({
      selectResults: [
        {
          data: { id: "recipe-1", like_count: 3 },
          error: null,
        },
        {
          data: { id: "recipe-1", like_count: 4 },
          error: null,
        },
      ],
    });
    const recipeLikesTable = createRecipeLikesTable({
      selectResults: [
        {
          data: null,
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
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "recipes") return recipesTable;
        if (table === "recipe_likes") return recipeLikesTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/recipe-1/like", {
      method: "POST",
    }), {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440024" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      error: null,
      data: {
        is_liked: true,
        like_count: 4,
      },
    });
    expect(recipesTable.select).toHaveBeenCalledTimes(2);
  });
});
