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
  selectResults: Array<QueryResult<{ id: string; save_count: number } | null>>;
  updateResults?: Array<QueryResult<{ id: string; save_count: number } | null>>;
}) {
  const selectQuery = {
    eq: vi.fn(() => selectQuery),
    maybeSingle: vi.fn(() => createAwaitableQuery(
      selectResults.shift() ?? {
        data: null,
        error: { message: "missing recipes select result" },
      },
    )),
  };

  const updateQuery = {
    eq: vi.fn(() => updateQuery),
    select: vi.fn(() => updateQuery),
    maybeSingle: vi.fn(() => createAwaitableQuery(
      updateResults.shift() ?? {
        data: null,
        error: { message: "missing recipes update result" },
      },
    )),
  };

  return {
    select: vi.fn(() => selectQuery),
    update: vi.fn(() => updateQuery),
    __selectQuery: selectQuery,
    __updateQuery: updateQuery,
  };
}

function createRecipeBooksTable({
  selectResults,
}: {
  selectResults: Array<QueryResult<{ id: string; user_id: string; book_type: string } | null>>;
}) {
  const selectQuery = {
    eq: vi.fn(() => selectQuery),
    maybeSingle: vi.fn(() => createAwaitableQuery(
      selectResults.shift() ?? {
        data: null,
        error: { message: "missing recipe_books select result" },
      },
    )),
  };

  return {
    select: vi.fn(() => selectQuery),
  };
}

function createRecipeBookItemsTable({
  selectResults = [],
  insertResults,
  deleteResults = [],
}: {
  selectResults?: Array<QueryResult<{ id: string }[]>>;
  insertResults: Array<QueryResult<{ id: string } | null>>;
  deleteResults?: Array<QueryResult<{ id: string } | null>>;
}) {
  const insertQuery = {
    select: vi.fn(() => insertQuery),
    maybeSingle: vi.fn(() => createAwaitableQuery(
      insertResults.shift() ?? {
        data: null,
        error: { message: "missing recipe_book_items insert result" },
      },
    )),
  };

  const selectQuery = {
    eq: vi.fn(() => selectQuery),
    then(
      onFulfilled?: (value: QueryResult<{ id: string }[]>) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(
        selectResults.shift() ?? {
          data: [],
          error: { message: "missing recipe_book_items select result" },
        },
      ).then(onFulfilled, onRejected);
    },
  };

  const deleteQuery = {
    eq: vi.fn(() => deleteQuery),
    select: vi.fn(() => deleteQuery),
    maybeSingle: vi.fn(() => createAwaitableQuery(
      deleteResults.shift() ?? {
        data: { id: "deleted-item" },
        error: null,
      },
    )),
  };

  return {
    insert: vi.fn(() => insertQuery),
    select: vi.fn(() => selectQuery),
    delete: vi.fn(() => deleteQuery),
    __selectQuery: selectQuery,
    __deleteQuery: deleteQuery,
  };
}

async function importRoute() {
  return import("@/app/api/v1/recipes/[id]/save/route");
}

describe("POST /api/v1/recipes/[id]/save", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    createServiceRoleClient.mockReturnValue(null);
  });

  it("returns 401 when the user is not authenticated", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      from: vi.fn(),
    });

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/recipe-1/save", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ book_id: "550e8400-e29b-41d4-a716-446655440010" }),
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
    const recipeBooksTable = createRecipeBooksTable({
      selectResults: [],
    });
    const recipeBookItemsTable = createRecipeBookItemsTable({
      insertResults: [],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "recipes") return recipesTable;
        if (table === "recipe_books") return recipeBooksTable;
        if (table === "recipe_book_items") return recipeBookItemsTable;

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/missing/save", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ book_id: "550e8400-e29b-41d4-a716-446655440010" }),
    }), {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440021" }),
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

  it("returns 403 when trying to save into another user's recipe book", async () => {
    const recipesTable = createRecipesTable({
      selectResults: [
        {
          data: { id: "recipe-1", save_count: 3 },
          error: null,
        },
      ],
    });
    const recipeBooksTable = createRecipeBooksTable({
      selectResults: [
        {
          data: {
            id: "book-1",
            user_id: "other-user",
            book_type: "custom",
          },
          error: null,
        },
      ],
    });
    const recipeBookItemsTable = createRecipeBookItemsTable({
      insertResults: [],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "recipes") return recipesTable;
        if (table === "recipe_books") return recipeBooksTable;
        if (table === "recipe_book_items") return recipeBookItemsTable;

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/recipe-1/save", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ book_id: "550e8400-e29b-41d4-a716-446655440010" }),
    }), {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440022" }),
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

  it("returns 409 when the target book type is not saved/custom", async () => {
    const recipesTable = createRecipesTable({
      selectResults: [
        {
          data: { id: "recipe-1", save_count: 3 },
          error: null,
        },
      ],
    });
    const recipeBooksTable = createRecipeBooksTable({
      selectResults: [
        {
          data: {
            id: "book-1",
            user_id: "user-1",
            book_type: "liked",
          },
          error: null,
        },
      ],
    });
    const recipeBookItemsTable = createRecipeBookItemsTable({
      insertResults: [],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "recipes") return recipesTable;
        if (table === "recipe_books") return recipeBooksTable;
        if (table === "recipe_book_items") return recipeBookItemsTable;

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/recipe-1/save", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ book_id: "550e8400-e29b-41d4-a716-446655440010" }),
    }), {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440023" }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "CONFLICT",
      },
    });
  });

  it("returns 409 when duplicate save is attempted", async () => {
    const recipesTable = createRecipesTable({
      selectResults: [
        {
          data: { id: "recipe-1", save_count: 3 },
          error: null,
        },
      ],
    });
    const recipeBooksTable = createRecipeBooksTable({
      selectResults: [
        {
          data: {
            id: "book-1",
            user_id: "user-1",
            book_type: "saved",
          },
          error: null,
        },
      ],
    });
    const recipeBookItemsTable = createRecipeBookItemsTable({
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
        if (table === "recipe_books") return recipeBooksTable;
        if (table === "recipe_book_items") return recipeBookItemsTable;

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/recipe-1/save", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ book_id: "550e8400-e29b-41d4-a716-446655440010" }),
    }), {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440024" }),
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "CONFLICT",
      },
    });
  });

  it("saves the recipe and returns the updated save_count", async () => {
    const recipesTable = createRecipesTable({
      selectResults: [
        {
          data: { id: "recipe-1", save_count: 3 },
          error: null,
        },
      ],
      updateResults: [
        {
          data: { id: "recipe-1", save_count: 4 },
          error: null,
        },
      ],
    });
    const recipeBooksTable = createRecipeBooksTable({
      selectResults: [
        {
          data: {
            id: "book-1",
            user_id: "user-1",
            book_type: "custom",
          },
          error: null,
        },
      ],
    });
    const recipeBookItemsTable = createRecipeBookItemsTable({
      selectResults: [
        {
          data: [
            { id: "existing-1" },
            { id: "existing-2" },
            { id: "existing-3" },
            { id: "item-1" },
          ],
          error: null,
        },
      ],
      insertResults: [
        {
          data: { id: "item-1" },
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
        if (table === "recipe_books") return recipeBooksTable;
        if (table === "recipe_book_items") return recipeBookItemsTable;

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/recipe-1/save", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ book_id: "550e8400-e29b-41d4-a716-446655440010" }),
    }), {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440025" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        saved: true,
        save_count: 4,
        book_id: "550e8400-e29b-41d4-a716-446655440010",
      },
      error: null,
    });
    expect(recipeBookItemsTable.insert).toHaveBeenCalledWith({
      book_id: "550e8400-e29b-41d4-a716-446655440010",
      recipe_id: "550e8400-e29b-41d4-a716-446655440025",
    });
    expect(recipesTable.update).toHaveBeenCalledWith({
      save_count: 4,
    });
  });

  it("returns 404 when the recipe book does not exist", async () => {
    const recipesTable = createRecipesTable({
      selectResults: [
        {
          data: { id: "recipe-1", save_count: 3 },
          error: null,
        },
      ],
    });
    const recipeBooksTable = createRecipeBooksTable({
      selectResults: [
        {
          data: null,
          error: null,
        },
      ],
    });
    const recipeBookItemsTable = createRecipeBookItemsTable({
      insertResults: [],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "recipes") return recipesTable;
        if (table === "recipe_books") return recipeBooksTable;
        if (table === "recipe_book_items") return recipeBookItemsTable;

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/recipe-1/save", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ book_id: "550e8400-e29b-41d4-a716-446655440010" }),
    }), {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440026" }),
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

  it("rolls back saved item and returns 500 when save_count update fails", async () => {
    const recipesTable = createRecipesTable({
      selectResults: [
        {
          data: { id: "recipe-1", save_count: 3 },
          error: null,
        },
      ],
      updateResults: [
        {
          data: null,
          error: { message: "update failed" },
        },
      ],
    });
    const recipeBooksTable = createRecipeBooksTable({
      selectResults: [
        {
          data: {
            id: "book-1",
            user_id: "user-1",
            book_type: "saved",
          },
          error: null,
        },
      ],
    });
    const recipeBookItemsTable = createRecipeBookItemsTable({
      selectResults: [
        {
          data: [
            { id: "existing-1" },
            { id: "existing-2" },
            { id: "existing-3" },
            { id: "item-1" },
          ],
          error: null,
        },
      ],
      insertResults: [
        {
          data: { id: "item-1" },
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
        if (table === "recipe_books") return recipeBooksTable;
        if (table === "recipe_book_items") return recipeBookItemsTable;

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/recipe-1/save", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ book_id: "550e8400-e29b-41d4-a716-446655440010" }),
    }), {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440027" }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "INTERNAL_ERROR",
      },
    });
    expect(recipeBookItemsTable.delete).toHaveBeenCalled();
    expect(recipeBookItemsTable.__deleteQuery.eq).toHaveBeenNthCalledWith(1, "id", "item-1");
    expect(recipeBookItemsTable.__deleteQuery.eq).toHaveBeenNthCalledWith(2, "recipe_id", "550e8400-e29b-41d4-a716-446655440027");
  });

  it("returns 401 before validating body when user is not authenticated", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: null },
        })),
      },
      from: vi.fn(),
    });

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/recipe-1/save", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{",
    }), {
      params: Promise.resolve({ id: "not-a-uuid" }),
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
});
