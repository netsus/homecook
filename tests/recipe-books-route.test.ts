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

function createRecipeBooksTable({
  selectResults,
  insertResults = [],
}: {
  selectResults: Array<QueryResult<unknown[]>>;
  insertResults?: Array<QueryResult<unknown>>;
}) {
  const selectQuery = {
    eq: vi.fn(() => selectQuery),
    in: vi.fn(() => selectQuery),
    order: vi.fn(() => selectQuery),
    limit: vi.fn(() => selectQuery),
    then(
      onFulfilled?: (value: QueryResult<unknown[]>) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(
        selectResults.shift() ?? {
          data: [],
          error: { message: "missing recipe_books select result" },
        },
      ).then(onFulfilled, onRejected);
    },
  };

  const insertQuery = {
    select: vi.fn(() => insertQuery),
    maybeSingle: vi.fn(() => createAwaitableQuery(
      insertResults.shift() ?? {
        data: null,
        error: { message: "missing recipe_books insert result" },
      },
    )),
  };

  return {
    select: vi.fn(() => selectQuery),
    insert: vi.fn(() => insertQuery),
    __selectQuery: selectQuery,
  };
}

function createRecipeBookItemsTable({
  selectResults,
}: {
  selectResults: Array<QueryResult<unknown[]>>;
}) {
  const selectQuery = {
    in: vi.fn(() => selectQuery),
    then(
      onFulfilled?: (value: QueryResult<unknown[]>) => unknown,
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

  return {
    select: vi.fn(() => selectQuery),
    __selectQuery: selectQuery,
  };
}

async function importRoute() {
  return import("@/app/api/v1/recipe-books/route");
}

describe("/api/v1/recipe-books", () => {
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

  it("GET returns 401 when the user is not authenticated", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      from: vi.fn(),
    });

    const { GET } = await importRoute();
    const response = await GET(new Request("http://localhost:3000/api/v1/recipe-books"));
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

  it("GET returns only saved/custom books with recipe_count", async () => {
    const recipeBooksTable = createRecipeBooksTable({
      selectResults: [
        {
          data: [
            {
              id: "book-saved",
              name: "저장한 레시피",
              book_type: "saved",
              sort_order: 1,
            },
            {
              id: "book-custom",
              name: "주말 파티",
              book_type: "custom",
              sort_order: 3,
            },
          ],
          error: null,
        },
      ],
    });
    const recipeBookItemsTable = createRecipeBookItemsTable({
      selectResults: [
        {
          data: [
            { book_id: "book-saved" },
            { book_id: "book-saved" },
            { book_id: "book-custom" },
          ],
          error: null,
        },
      ],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: { id: "user-1" },
          },
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "recipe_books") return recipeBooksTable;
        if (table === "recipe_book_items") return recipeBookItemsTable;

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importRoute();
    const response = await GET(new Request("http://localhost:3000/api/v1/recipe-books"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        books: [
          {
            id: "book-saved",
            name: "저장한 레시피",
            book_type: "saved",
            recipe_count: 2,
            sort_order: 1,
          },
          {
            id: "book-custom",
            name: "주말 파티",
            book_type: "custom",
            recipe_count: 1,
            sort_order: 3,
          },
        ],
      },
      error: null,
    });
    expect(ensurePublicUserRow).toHaveBeenCalledWith(expect.anything(), { id: "user-1" });
    expect(ensureUserBootstrapState).toHaveBeenCalledWith(expect.anything(), "user-1");
    expect(recipeBooksTable.__selectQuery.in).toHaveBeenCalledWith("book_type", ["saved", "custom"]);
    expect(recipeBookItemsTable.__selectQuery.in).toHaveBeenCalledWith("book_id", ["book-saved", "book-custom"]);
  });

  it("GET returns schema guidance when bootstrap fails before listing books", async () => {
    ensurePublicUserRow.mockRejectedValue(
      new Error("Could not find the table 'public.recipe_books' in the schema cache"),
    );

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: { id: "user-1" },
          },
        })),
      },
      from: vi.fn(),
    });

    const { GET } = await importRoute();
    const response = await GET(new Request("http://localhost:3000/api/v1/recipe-books"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "formatted: Could not find the table 'public.recipe_books' in the schema cache",
      },
    });
    expect(formatBootstrapErrorMessage).toHaveBeenCalled();
  });

  it("GET returns 500 in fixture mode when recipe book list fault is injected", async () => {
    process.env.HOMECOOK_ENABLE_QA_FIXTURES = "1";

    const { GET } = await importRoute();
    const response = await GET(new Request("http://localhost:3000/api/v1/recipe-books", {
      headers: {
        "x-homecook-e2e-auth": "authenticated",
        "x-homecook-qa-fixture-faults": JSON.stringify({
          recipe_books_list: "internal_error",
        }),
      },
    }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "INTERNAL_ERROR",
      },
    });
  });

  it("POST returns 422 when name is missing", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: { id: "user-1" },
          },
        })),
      },
      from: vi.fn(),
    });

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipe-books", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({}),
    }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "name", reason: "required" }],
      },
    });
  });

  it("POST returns 401 before validating request body when user is not authenticated", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: null,
          },
        })),
      },
      from: vi.fn(),
    });

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipe-books", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: "{",
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

  it("POST returns 422 when name exceeds 50 characters", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: { id: "user-1" },
          },
        })),
      },
      from: vi.fn(),
    });

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipe-books", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "a".repeat(51) }),
    }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "name", reason: "max_length" }],
      },
    });
  });

  it("POST creates a custom recipe book and returns 201", async () => {
    const recipeBooksTable = createRecipeBooksTable({
      selectResults: [
        {
          data: [{ sort_order: 3 }],
          error: null,
        },
      ],
      insertResults: [
        {
          data: {
            id: "book-new",
            name: "주말 브런치",
            book_type: "custom",
            recipe_count: 0,
            sort_order: 4,
            created_at: "2026-03-27T10:00:00Z",
            updated_at: "2026-03-27T10:00:00Z",
          },
          error: null,
        },
      ],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: {
            user: { id: "user-1" },
          },
        })),
      },
      from: vi.fn((table: string) => {
        if (table === "recipe_books") return recipeBooksTable;

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipe-books", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "주말 브런치" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      success: true,
      data: {
        id: "book-new",
        name: "주말 브런치",
        book_type: "custom",
        recipe_count: 0,
        sort_order: 4,
        created_at: "2026-03-27T10:00:00Z",
        updated_at: "2026-03-27T10:00:00Z",
      },
      error: null,
    });
    expect(recipeBooksTable.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      name: "주말 브런치",
      book_type: "custom",
      sort_order: 4,
    });
  });

  it("POST returns 500 in fixture mode when recipe book create fault is injected", async () => {
    process.env.HOMECOOK_ENABLE_QA_FIXTURES = "1";

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipe-books", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-homecook-e2e-auth": "authenticated",
        "x-homecook-qa-fixture-faults": JSON.stringify({
          recipe_books_create: "internal_error",
        }),
      },
      body: JSON.stringify({ name: "주말 브런치" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "INTERNAL_ERROR",
      },
    });
  });
});
