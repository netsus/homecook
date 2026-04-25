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
}: {
  selectResults: Array<QueryResult<{ id: string; user_id: string } | null>>;
}) {
  const selectQuery = {
    eq: vi.fn(() => selectQuery),
    maybeSingle: vi.fn(() =>
      createAwaitableQuery(
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
  selectResults,
}: {
  selectResults: Array<QueryResult<Array<{ id: string; recipe_id: string; added_at: string }> | null>>;
}) {
  const selectQuery = {
    eq: vi.fn(() => selectQuery),
    order: vi.fn(() => selectQuery),
    then(
      onFulfilled?: (value: QueryResult<Array<{ id: string; recipe_id: string; added_at: string }> | null>) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(
        selectResults.shift() ?? {
          data: null,
          error: { message: "missing recipe_book_items select result" },
        },
      ).then(onFulfilled, onRejected);
    },
  };

  return {
    select: vi.fn(() => selectQuery),
  };
}

function createRecipesTable({
  selectResults,
}: {
  selectResults: Array<QueryResult<Array<{ id: string; title: string; thumbnail_url: string | null; tags: string[] | null }> | null>>;
}) {
  const selectQuery = {
    in: vi.fn(() => selectQuery),
    then(
      onFulfilled?: (value: QueryResult<Array<{ id: string; title: string; thumbnail_url: string | null; tags: string[] | null }> | null>) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(
        selectResults.shift() ?? {
          data: null,
          error: { message: "missing recipes select result" },
        },
      ).then(onFulfilled, onRejected);
    },
  };

  return {
    select: vi.fn(() => selectQuery),
  };
}

async function importRoute() {
  return import("@/app/api/v1/recipe-books/[book_id]/recipes/route");
}

const BOOK_ID = "550e8400-e29b-41d4-a716-446655440041";

describe("08b recipe book detail picker backend", () => {
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

  it("returns 401 when the user is not authenticated", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      from: vi.fn(),
    });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/recipe-books/550e8400-e29b-41d4-a716-446655440041/recipes"),
      {
        params: Promise.resolve({ book_id: BOOK_ID }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("returns 404 when recipe book does not exist", async () => {
    const recipeBooksTable = createRecipeBooksTable({
      selectResults: [{ data: null, error: null }],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "recipe_books") return recipeBooksTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/recipe-books/550e8400-e29b-41d4-a716-446655440041/recipes"),
      {
        params: Promise.resolve({ book_id: BOOK_ID }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "RESOURCE_NOT_FOUND" },
    });
  });

  it("returns 403 when recipe book belongs to another user", async () => {
    const recipeBooksTable = createRecipeBooksTable({
      selectResults: [{ data: { id: BOOK_ID, user_id: "other-user" }, error: null }],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "recipe_books") return recipeBooksTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/recipe-books/550e8400-e29b-41d4-a716-446655440041/recipes"),
      {
        params: Promise.resolve({ book_id: BOOK_ID }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "FORBIDDEN" },
    });
  });

  it("returns paginated recipe items with next_cursor and has_next", async () => {
    const recipeBooksTable = createRecipeBooksTable({
      selectResults: [{ data: { id: BOOK_ID, user_id: "user-1" }, error: null }],
    });
    const recipeBookItemsTable = createRecipeBookItemsTable({
      selectResults: [
        {
          data: [
            {
              id: "item-2",
              recipe_id: "recipe-2",
              added_at: "2026-04-24T10:00:00.000Z",
            },
            {
              id: "item-1",
              recipe_id: "recipe-1",
              added_at: "2026-04-24T09:00:00.000Z",
            },
          ],
          error: null,
        },
      ],
    });
    const recipesTable = createRecipesTable({
      selectResults: [
        {
          data: [
            {
              id: "recipe-1",
              title: "김치찌개",
              thumbnail_url: "https://example.com/kimchi.jpg",
              tags: ["한식", "찌개"],
            },
            {
              id: "recipe-2",
              title: "된장찌개",
              thumbnail_url: "https://example.com/doenjang.jpg",
              tags: ["한식"],
            },
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
        if (table === "recipe_books") return recipeBooksTable;
        if (table === "recipe_book_items") return recipeBookItemsTable;
        if (table === "recipes") return recipesTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/v1/recipe-books/550e8400-e29b-41d4-a716-446655440041/recipes?limit=1",
      ),
      {
        params: Promise.resolve({ book_id: BOOK_ID }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        items: [
          {
            recipe_id: "recipe-2",
            title: "된장찌개",
            thumbnail_url: "https://example.com/doenjang.jpg",
            tags: ["한식"],
            added_at: "2026-04-24T10:00:00.000Z",
          },
        ],
        next_cursor: "item-2",
        has_next: true,
      },
      error: null,
    });
    expect(ensurePublicUserRow).toHaveBeenCalledWith(expect.anything(), { id: "user-1" });
    expect(ensureUserBootstrapState).toHaveBeenCalledWith(expect.anything(), "user-1");
  });
});
