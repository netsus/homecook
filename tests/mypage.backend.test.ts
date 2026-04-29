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
  data: T | null;
  error: QueryError | null;
}

function createAwaitableQuery<T>(results: Array<QueryResult<T>>) {
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    range: vi.fn(() => query),
    delete: vi.fn(() => query),
    update: vi.fn(() => query),
    select: vi.fn(() => query),
    maybeSingle: vi.fn(() =>
      Promise.resolve(
        results.shift() ?? {
          data: null,
          error: { message: "missing maybeSingle result" },
        },
      ),
    ),
    then(
      onFulfilled?: (value: QueryResult<T>) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(
        results.shift() ?? {
          data: null,
          error: { message: "missing query result" },
        },
      ).then(onFulfilled, onRejected);
    },
  };

  return query;
}

function createTable(results: Array<QueryResult<unknown>>) {
  const query = createAwaitableQuery(results);

  return {
    select: vi.fn(() => query),
    insert: vi.fn(() => query),
    update: vi.fn(() => query),
    delete: vi.fn(() => query),
    __query: query,
  };
}

function setupAuthedClient(dbClient: { from: ReturnType<typeof vi.fn> }, user = { id: "user-1" }) {
  const routeClient = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user } })),
    },
    from: dbClient.from,
  };

  createRouteHandlerClient.mockResolvedValue(routeClient);
  createServiceRoleClient.mockReturnValue(null);

  return routeClient;
}

async function importRecipeBooksRoute() {
  return import("@/app/api/v1/recipe-books/route");
}

async function importRecipeBookDetailRoute() {
  return import("@/app/api/v1/recipe-books/[book_id]/route");
}

async function importShoppingListsRoute() {
  return import("@/app/api/v1/shopping/lists/route");
}

async function importUsersMeRoute() {
  return import("@/app/api/v1/users/me/route");
}

function createBookContext(bookId = "550e8400-e29b-41d4-a716-446655440001") {
  return {
    params: Promise.resolve({ book_id: bookId }),
  };
}

describe("17a mypage backend", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    formatBootstrapErrorMessage.mockClear();
    ensurePublicUserRow.mockResolvedValue({});
    ensureUserBootstrapState.mockResolvedValue(undefined);
    createServiceRoleClient.mockReturnValue(null);
    delete process.env.HOMECOOK_ENABLE_QA_FIXTURES;
  });

  it("GET /users/me returns the current user profile and settings", async () => {
    const usersTable = createTable([
      {
        data: {
          id: "user-1",
          nickname: "집밥러",
          email: "user@example.com",
          profile_image_url: "https://example.com/profile.png",
          social_provider: "google",
          settings_json: { screen_wake_lock: true },
        },
        error: null,
      },
    ]);
    setupAuthedClient({
      from: vi.fn((table: string) => {
        if (table === "users") return usersTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importUsersMeRoute();
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        id: "user-1",
        nickname: "집밥러",
        email: "user@example.com",
        profile_image_url: "https://example.com/profile.png",
        social_provider: "google",
        settings: {
          screen_wake_lock: true,
        },
      },
      error: null,
    });
    expect(usersTable.__query.eq).toHaveBeenCalledWith("id", "user-1");
  });

  it("GET /recipe-books returns system and custom books with type-specific counts", async () => {
    const recipeBooksTable = createTable([
      {
        data: [
          { id: "book-my", name: "내가 추가한 레시피", book_type: "my_added", sort_order: 0 },
          { id: "book-saved", name: "저장한 레시피", book_type: "saved", sort_order: 1 },
          { id: "book-liked", name: "좋아요한 레시피", book_type: "liked", sort_order: 2 },
          { id: "book-custom", name: "주말 파티", book_type: "custom", sort_order: 3 },
        ],
        error: null,
      },
    ]);
    const recipeBookItemsTable = createTable([
      {
        data: [
          { book_id: "book-saved" },
          { book_id: "book-saved" },
          { book_id: "book-custom" },
        ],
        error: null,
      },
    ]);
    const recipeLikesTable = createTable([{ data: [{ recipe_id: "recipe-1" }, { recipe_id: "recipe-2" }], error: null }]);
    const recipesTable = createTable([{ data: [{ id: "recipe-3" }], error: null }]);
    setupAuthedClient({
      from: vi.fn((table: string) => {
        if (table === "recipe_books") return recipeBooksTable;
        if (table === "recipe_book_items") return recipeBookItemsTable;
        if (table === "recipe_likes") return recipeLikesTable;
        if (table === "recipes") return recipesTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importRecipeBooksRoute();
    const response = await GET(new Request("http://localhost:3000/api/v1/recipe-books"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.books).toEqual([
      { id: "book-my", name: "내가 추가한 레시피", book_type: "my_added", recipe_count: 1, sort_order: 0 },
      { id: "book-saved", name: "저장한 레시피", book_type: "saved", recipe_count: 2, sort_order: 1 },
      { id: "book-liked", name: "좋아요한 레시피", book_type: "liked", recipe_count: 2, sort_order: 2 },
      { id: "book-custom", name: "주말 파티", book_type: "custom", recipe_count: 1, sort_order: 3 },
    ]);
  });

  it("PATCH /recipe-books/{book_id} renames only custom books", async () => {
    const recipeBooksTable = createTable([
      {
        data: { id: "book-custom", user_id: "user-1", book_type: "custom" },
        error: null,
      },
      {
        data: {
          id: "book-custom",
          name: "저녁 모임",
          book_type: "custom",
          sort_order: 3,
          updated_at: "2026-04-30T00:00:00Z",
        },
        error: null,
      },
    ]);
    const recipeBookItemsTable = createTable([
      {
        data: [{ book_id: "book-custom" }, { book_id: "book-custom" }],
        error: null,
      },
    ]);
    setupAuthedClient({
      from: vi.fn((table: string) => {
        if (table === "recipe_books") return recipeBooksTable;
        if (table === "recipe_book_items") return recipeBookItemsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { PATCH } = await importRecipeBookDetailRoute();
    const response = await PATCH(
      new Request("http://localhost:3000/api/v1/recipe-books/book-custom", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "저녁 모임" }),
      }),
      createBookContext("550e8400-e29b-41d4-a716-446655440001"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      id: "book-custom",
      name: "저녁 모임",
      book_type: "custom",
      recipe_count: 2,
    });
    expect(recipeBookItemsTable.__query.eq).toHaveBeenCalledWith("book_id", "550e8400-e29b-41d4-a716-446655440001");
  });

  it("DELETE /recipe-books/{book_id} rejects system books and deletes custom books", async () => {
    const systemBooksTable = createTable([
      {
        data: { id: "book-saved", user_id: "user-1", book_type: "saved" },
        error: null,
      },
    ]);
    setupAuthedClient({
      from: vi.fn((table: string) => {
        if (table === "recipe_books") return systemBooksTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { DELETE } = await importRecipeBookDetailRoute();
    const systemResponse = await DELETE(
      new Request("http://localhost:3000/api/v1/recipe-books/book-saved", { method: "DELETE" }),
      createBookContext("550e8400-e29b-41d4-a716-446655440002"),
    );

    expect(systemResponse.status).toBe(403);

    const customBooksTable = createTable([
      {
        data: { id: "book-custom", user_id: "user-1", book_type: "custom" },
        error: null,
      },
      { data: [], error: null },
      { data: null, error: null },
    ]);
    setupAuthedClient({
      from: vi.fn((table: string) => {
        if (table === "recipe_books") return customBooksTable;
        if (table === "recipe_book_items") return createTable([{ data: null, error: null }]);
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const customResponse = await DELETE(
      new Request("http://localhost:3000/api/v1/recipe-books/book-custom", { method: "DELETE" }),
      createBookContext("550e8400-e29b-41d4-a716-446655440001"),
    );
    const body = await customResponse.json();

    expect(customResponse.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: { deleted: true },
      error: null,
    });
  });

  it("GET /shopping/lists returns owned shopping history with item counts and cursor pagination", async () => {
    const shoppingListsTable = createTable([
      {
        data: [
          {
            id: "list-1",
            title: "4/30 장보기",
            date_range_start: "2026-04-30",
            date_range_end: "2026-05-06",
            is_completed: true,
            created_at: "2026-04-30T00:00:00Z",
          },
          {
            id: "list-2",
            title: "4/23 장보기",
            date_range_start: "2026-04-23",
            date_range_end: "2026-04-29",
            is_completed: false,
            created_at: "2026-04-23T00:00:00Z",
          },
        ],
        error: null,
      },
    ]);
    const shoppingListItemsTable = createTable([
      {
        data: [
          { shopping_list_id: "list-1" },
          { shopping_list_id: "list-1" },
          { shopping_list_id: "list-2" },
        ],
        error: null,
      },
    ]);
    setupAuthedClient({
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") return shoppingListsTable;
        if (table === "shopping_list_items") return shoppingListItemsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importShoppingListsRoute();
    const response = await GET(new Request("http://localhost:3000/api/v1/shopping/lists?limit=1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      items: [
        {
          id: "list-1",
          title: "4/30 장보기",
          date_range_start: "2026-04-30",
          date_range_end: "2026-05-06",
          is_completed: true,
          item_count: 2,
          created_at: "2026-04-30T00:00:00Z",
        },
      ],
      next_cursor: "2026-04-30T00:00:00Z|list-1",
      has_next: true,
    });
    expect(shoppingListsTable.__query.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(shoppingListItemsTable.__query.in).toHaveBeenCalledWith("shopping_list_id", ["list-1", "list-2"]);
  });
});
