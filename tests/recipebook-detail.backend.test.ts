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
const recordUserGrowthActivityEvent = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
}));

vi.mock("@/lib/server/user-growth-activity", () => ({
  recordUserGrowthActivityEvent,
}));

interface QueryError {
  message: string;
}

interface QueryResult<T> {
  data: T | null;
  error: QueryError | null;
}

function createQuery<T>(results: Array<QueryResult<T>>) {
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    limit: vi.fn(() => query),
    order: vi.fn(() => query),
    select: vi.fn(() => query),
    update: vi.fn(() => query),
    delete: vi.fn(() => query),
    maybeSingle: vi.fn(() =>
      Promise.resolve(
        results.shift() ?? {
          data: null,
          error: { message: "missing maybeSingle result" },
        },
      )),
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
  const query = createQuery(results);

  return {
    select: vi.fn(() => query),
    delete: vi.fn(() => query),
    update: vi.fn(() => query),
    __query: query,
  };
}

function setupAuthedClient(dbClient: { from: ReturnType<typeof vi.fn> }) {
  createRouteHandlerClient.mockResolvedValue({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
    },
    from: dbClient.from,
  });
  createServiceRoleClient.mockReturnValue(null);
}

async function importRoute() {
  return import("@/app/api/v1/recipe-books/[book_id]/recipes/route");
}

async function importRemoveRoute() {
  return import("@/app/api/v1/recipe-books/[book_id]/recipes/[recipe_id]/route");
}

function createContext(bookId = "550e8400-e29b-41d4-a716-446655440041") {
  return {
    params: Promise.resolve({ book_id: bookId }),
  };
}

const BOOK_ID = "550e8400-e29b-41d4-a716-446655440041";
const RECIPE_ID = "550e8400-e29b-41d4-a716-446655440051";

describe("17b recipebook detail backend", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    formatBootstrapErrorMessage.mockClear();
    recordUserGrowthActivityEvent.mockReset();
    ensurePublicUserRow.mockResolvedValue({});
    ensureUserBootstrapState.mockResolvedValue(undefined);
    recordUserGrowthActivityEvent.mockResolvedValue({ recorded: true, duplicate: false, error: null });
    createServiceRoleClient.mockReturnValue(null);
    delete process.env.HOMECOOK_ENABLE_QA_FIXTURES;
  });

  it("GET /recipe-books/{book_id}/recipes reads liked books from recipe_likes", async () => {
    const recipeBooksTable = createTable([
      { data: { id: BOOK_ID, user_id: "user-1", book_type: "liked" }, error: null },
    ]);
    const recipeLikesTable = createTable([
      {
        data: [
          {
            id: "like-1",
            recipe_id: RECIPE_ID,
            created_at: "2026-04-30T09:00:00.000Z",
          },
        ],
        error: null,
      },
    ]);
    const recipesTable = createTable([
      {
        data: [
          {
            id: RECIPE_ID,
            title: "된장찌개",
            thumbnail_url: null,
            tags: ["한식"],
            view_count: 120,
            base_servings: 2,
          },
        ],
        error: null,
      },
    ]);
    const recipeStepsTable = createTable([
      {
        data: [
          { recipe_id: RECIPE_ID, duration_seconds: 300 },
          { recipe_id: RECIPE_ID, duration_seconds: 120 },
          { recipe_id: RECIPE_ID, duration_seconds: null },
        ],
        error: null,
      },
    ]);
    setupAuthedClient({
      from: vi.fn((table: string) => {
        if (table === "recipe_books") return recipeBooksTable;
        if (table === "recipe_likes") return recipeLikesTable;
        if (table === "recipes") return recipesTable;
        if (table === "recipe_steps") return recipeStepsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest(`http://localhost:3000/api/v1/recipe-books/${BOOK_ID}/recipes`),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      items: [
        {
          recipe_id: RECIPE_ID,
          title: "된장찌개",
          thumbnail_url: null,
          tags: ["한식"],
          view_count: 120,
          total_duration_seconds: 420,
          total_duration_text: "7분",
          base_servings: 2,
          added_at: "2026-04-30T09:00:00.000Z",
        },
      ],
      next_cursor: null,
      has_next: false,
    });
    expect(recipeLikesTable.select).toHaveBeenCalledWith(
      "id, recipe_id, created_at, recipes!inner(id)",
    );
    expect(recipeLikesTable.__query.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(recipeLikesTable.__query.limit).toHaveBeenCalledWith(21);
  });

  it("GET /recipe-books/{book_id}/recipes hides service-only recipes from current books", async () => {
    const routeRecipeBookItemsTable = createTable([
      { data: [], error: null },
    ]);
    const routeRecipesTable = createTable([
      { data: [], error: null },
    ]);
    const serviceRecipeBooksTable = createTable([
      { data: { id: BOOK_ID, user_id: "user-1", book_type: "saved" }, error: null },
    ]);
    const serviceRecipeBookItemsTable = createTable([
      {
        data: [
          {
            id: "item-hidden",
            recipe_id: RECIPE_ID,
            added_at: "2026-04-30T09:00:00.000Z",
          },
        ],
        error: null,
      },
    ]);
    const serviceRecipesTable = createTable([
      {
        data: [
          {
            id: RECIPE_ID,
            title: "삭제된 레시피",
            thumbnail_url: null,
            tags: [],
            view_count: 0,
            base_servings: 2,
          },
        ],
        error: null,
      },
    ]);
    const serviceRecipeStepsTable = createTable([
      { data: [], error: null },
    ]);
    const routeFrom = vi.fn((table: string) => {
      if (table === "recipe_book_items") return routeRecipeBookItemsTable;
      if (table === "recipes") return routeRecipesTable;
      throw new Error(`unexpected route table: ${table}`);
    });
    const serviceFrom = vi.fn((table: string) => {
      if (table === "recipe_books") return serviceRecipeBooksTable;
      if (table === "recipe_book_items") return serviceRecipeBookItemsTable;
      if (table === "recipes") return serviceRecipesTable;
      if (table === "recipe_steps") return serviceRecipeStepsTable;
      throw new Error(`unexpected service table: ${table}`);
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: routeFrom,
    });
    createServiceRoleClient.mockReturnValue({ from: serviceFrom });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest(`http://localhost:3000/api/v1/recipe-books/${BOOK_ID}/recipes`),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      items: [],
      next_cursor: null,
      has_next: false,
    });
    expect(routeFrom).toHaveBeenCalledWith("recipe_book_items");
    expect(serviceRecipeBookItemsTable.select).not.toHaveBeenCalled();
    expect(serviceRecipesTable.select).not.toHaveBeenCalled();
  });

  it("GET /recipe-books/{book_id}/recipes derives pagination only from RLS-visible rows", async () => {
    const visibleRecipeId = "550e8400-e29b-41d4-a716-446655440052";
    const routeRecipeBookItemsTable = createTable([
      {
        data: [
          {
            id: "item-visible",
            recipe_id: visibleRecipeId,
            added_at: "2026-04-30T08:00:00.000Z",
          },
        ],
        error: null,
      },
    ]);
    const routeRecipesTable = createTable([
      {
        data: [
          {
            id: visibleRecipeId,
            title: "보이는 레시피",
            thumbnail_url: null,
            tags: ["한식"],
            view_count: 5,
            base_servings: 2,
          },
        ],
        error: null,
      },
    ]);
    const routeRecipeStepsTable = createTable([
      { data: [], error: null },
    ]);
    const serviceRecipeBooksTable = createTable([
      { data: { id: BOOK_ID, user_id: "user-1", book_type: "saved" }, error: null },
    ]);
    const serviceRecipeBookItemsTable = createTable([
      {
        data: [
          {
            id: "item-hidden",
            recipe_id: RECIPE_ID,
            added_at: "2026-04-30T09:00:00.000Z",
          },
          {
            id: "item-visible",
            recipe_id: visibleRecipeId,
            added_at: "2026-04-30T08:00:00.000Z",
          },
        ],
        error: null,
      },
    ]);
    const routeFrom = vi.fn((table: string) => {
      if (table === "recipe_book_items") return routeRecipeBookItemsTable;
      if (table === "recipes") return routeRecipesTable;
      if (table === "recipe_steps") return routeRecipeStepsTable;
      throw new Error(`unexpected route table: ${table}`);
    });
    const serviceFrom = vi.fn((table: string) => {
      if (table === "recipe_books") return serviceRecipeBooksTable;
      if (table === "recipe_book_items") return serviceRecipeBookItemsTable;
      throw new Error(`unexpected service table: ${table}`);
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: routeFrom,
    });
    createServiceRoleClient.mockReturnValue({ from: serviceFrom });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest(`http://localhost:3000/api/v1/recipe-books/${BOOK_ID}/recipes?limit=1`),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      items: [
        {
          recipe_id: visibleRecipeId,
          title: "보이는 레시피",
          thumbnail_url: null,
          tags: ["한식"],
          view_count: 5,
          total_duration_seconds: null,
          total_duration_text: null,
          base_servings: 2,
          added_at: "2026-04-30T08:00:00.000Z",
        },
      ],
      next_cursor: null,
      has_next: false,
    });
    expect(routeRecipeBookItemsTable.select).toHaveBeenCalledWith(
      "id, recipe_id, added_at, recipes!inner(id)",
    );
    expect(serviceRecipeBookItemsTable.select).not.toHaveBeenCalled();
  });

  it("GET /recipe-books/{book_id}/recipes filters my_added books to manual and youtube recipes", async () => {
    const recipeBooksTable = createTable([
      { data: { id: BOOK_ID, user_id: "user-1", book_type: "my_added" }, error: null },
    ]);
    const recipesTable = createTable([
      {
        data: [
          {
            id: RECIPE_ID,
            title: "직접 등록 찌개",
            thumbnail_url: "https://example.com/manual.jpg",
            tags: ["직접등록"],
            view_count: 7,
            base_servings: 3,
            created_at: "2026-04-30T08:00:00.000Z",
          },
        ],
        error: null,
      },
    ]);
    const recipeStepsTable = createTable([
      {
        data: [
          { recipe_id: RECIPE_ID, duration_seconds: 180 },
        ],
        error: null,
      },
    ]);
    setupAuthedClient({
      from: vi.fn((table: string) => {
        if (table === "recipe_books") return recipeBooksTable;
        if (table === "recipes") return recipesTable;
        if (table === "recipe_steps") return recipeStepsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importRoute();
    const response = await GET(
      new NextRequest(`http://localhost:3000/api/v1/recipe-books/${BOOK_ID}/recipes`),
      createContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.items).toEqual([
      {
        recipe_id: RECIPE_ID,
        title: "직접 등록 찌개",
        thumbnail_url: "https://example.com/manual.jpg",
        tags: ["직접등록"],
        view_count: 7,
        total_duration_seconds: 180,
        total_duration_text: "3분",
        base_servings: 3,
        added_at: "2026-04-30T08:00:00.000Z",
      },
    ]);
    expect(recipesTable.select).toHaveBeenCalledWith(
      "id, title, thumbnail_url, tags, view_count, base_servings, created_at",
    );
    expect(recipesTable.__query.eq).toHaveBeenCalledWith("created_by", "user-1");
    expect(recipesTable.__query.in).toHaveBeenCalledWith("source_type", ["youtube", "manual"]);
    expect(recipesTable.__query.limit).toHaveBeenCalledWith(21);
  });

  it("DELETE /recipe-books/{book_id}/recipes/{recipe_id} removes saved/custom items and syncs save_count", async () => {
    const recipeBooksTable = createTable([
      { data: { id: BOOK_ID, user_id: "user-1", book_type: "saved" }, error: null },
    ]);
    const recipeBookItemsTable = createTable([
      { data: { id: "item-1" }, error: null },
      { data: { id: "item-1" }, error: null },
      { data: [{ id: "remaining-item" }], error: null },
    ]);
    const recipesTable = createTable([
      { data: { id: RECIPE_ID }, error: null },
      { data: { id: RECIPE_ID, save_count: 1 }, error: null },
    ]);
    setupAuthedClient({
      from: vi.fn((table: string) => {
        if (table === "recipe_books") return recipeBooksTable;
        if (table === "recipe_book_items") return recipeBookItemsTable;
        if (table === "recipes") return recipesTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { DELETE } = await importRemoveRoute();
    const response = await DELETE(
      new Request(`http://localhost:3000/api/v1/recipe-books/${BOOK_ID}/recipes/${RECIPE_ID}`, {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({ book_id: BOOK_ID, recipe_id: RECIPE_ID }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { deleted: true },
      error: null,
    });
    expect(recipeBookItemsTable.__query.eq).toHaveBeenCalledWith("book_id", BOOK_ID);
    expect(recipeBookItemsTable.__query.eq).toHaveBeenCalledWith("recipe_id", RECIPE_ID);
    expect(recipesTable.update).toHaveBeenCalledWith({ save_count: 1 });
    expect(recordUserGrowthActivityEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      userId: "user-1",
      activityType: "recipebook_recipe_removed",
      category: "recipebook",
      sourceKey: expect.stringMatching(
        new RegExp(`^recipebook_recipe_removed:user-1:${BOOK_ID}:${RECIPE_ID}:\\d+$`),
      ),
      sourceTable: "recipe_book_items",
      sourceId: "item-1",
      sourceMeta: {
        book_id: BOOK_ID,
        recipe_id: RECIPE_ID,
        removed_item_id: "item-1",
      },
      occurredAt: expect.any(String),
    }));
  });

  it("DELETE /recipe-books/{book_id}/recipes/{recipe_id} unlikes liked books and syncs like_count", async () => {
    const recipeBooksTable = createTable([
      { data: { id: BOOK_ID, user_id: "user-1", book_type: "liked" }, error: null },
    ]);
    const recipeLikesTable = createTable([
      { data: { id: "like-1" }, error: null },
      { data: { id: "like-1" }, error: null },
      { data: [], error: null },
    ]);
    const recipesTable = createTable([
      { data: { id: RECIPE_ID }, error: null },
      { data: { id: RECIPE_ID, like_count: 0 }, error: null },
    ]);
    setupAuthedClient({
      from: vi.fn((table: string) => {
        if (table === "recipe_books") return recipeBooksTable;
        if (table === "recipe_likes") return recipeLikesTable;
        if (table === "recipes") return recipesTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { DELETE } = await importRemoveRoute();
    const response = await DELETE(
      new Request(`http://localhost:3000/api/v1/recipe-books/${BOOK_ID}/recipes/${RECIPE_ID}`, {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({ book_id: BOOK_ID, recipe_id: RECIPE_ID }),
      },
    );

    expect(response.status).toBe(200);
    expect(recipeLikesTable.__query.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(recipeLikesTable.__query.eq).toHaveBeenCalledWith("recipe_id", RECIPE_ID);
    expect(recipesTable.update).toHaveBeenCalledWith({ like_count: 0 });
  });

  it("DELETE /recipe-books/{book_id}/recipes/{recipe_id} cannot mutate an RLS-hidden recipe", async () => {
    const routeRecipesTable = createTable([
      { data: null, error: null },
    ]);
    const serviceRecipeBooksTable = createTable([
      { data: { id: BOOK_ID, user_id: "user-1", book_type: "saved" }, error: null },
    ]);
    const serviceRecipeBookItemsTable = createTable([
      { data: { id: "item-hidden" }, error: null },
      { data: { id: "item-hidden" }, error: null },
      { data: [], error: null },
    ]);
    const serviceRecipesTable = createTable([
      { data: { id: RECIPE_ID, save_count: 0 }, error: null },
    ]);
    const routeFrom = vi.fn((table: string) => {
      if (table === "recipes") return routeRecipesTable;
      throw new Error(`unexpected route table: ${table}`);
    });
    const serviceFrom = vi.fn((table: string) => {
      if (table === "recipe_books") return serviceRecipeBooksTable;
      if (table === "recipe_book_items") return serviceRecipeBookItemsTable;
      if (table === "recipes") return serviceRecipesTable;
      throw new Error(`unexpected service table: ${table}`);
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: routeFrom,
    });
    createServiceRoleClient.mockReturnValue({ from: serviceFrom });

    const { DELETE } = await importRemoveRoute();
    const response = await DELETE(
      new Request(`http://localhost:3000/api/v1/recipe-books/${BOOK_ID}/recipes/${RECIPE_ID}`, {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({ book_id: BOOK_ID, recipe_id: RECIPE_ID }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "RESOURCE_NOT_FOUND" },
    });
    expect(routeFrom).toHaveBeenCalledWith("recipes");
    expect(serviceRecipeBookItemsTable.select).not.toHaveBeenCalled();
    expect(serviceRecipeBookItemsTable.delete).not.toHaveBeenCalled();
    expect(serviceRecipesTable.update).not.toHaveBeenCalled();
    expect(recordUserGrowthActivityEvent).not.toHaveBeenCalled();
  });

  it("DELETE /recipe-books/{book_id}/recipes/{recipe_id} returns 404 for an already removed saved item", async () => {
    const recipeBooksTable = createTable([
      { data: { id: BOOK_ID, user_id: "user-1", book_type: "saved" }, error: null },
    ]);
    const recipeBookItemsTable = createTable([
      { data: null, error: null },
    ]);
    const recipesTable = createTable([
      { data: { id: RECIPE_ID }, error: null },
    ]);
    setupAuthedClient({
      from: vi.fn((table: string) => {
        if (table === "recipe_books") return recipeBooksTable;
        if (table === "recipe_book_items") return recipeBookItemsTable;
        if (table === "recipes") return recipesTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { DELETE } = await importRemoveRoute();
    const response = await DELETE(
      new Request(`http://localhost:3000/api/v1/recipe-books/${BOOK_ID}/recipes/${RECIPE_ID}`, {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({ book_id: BOOK_ID, recipe_id: RECIPE_ID }),
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

  it("DELETE /recipe-books/{book_id}/recipes/{recipe_id} rejects my_added books", async () => {
    const recipeBooksTable = createTable([
      { data: { id: BOOK_ID, user_id: "user-1", book_type: "my_added" }, error: null },
    ]);
    const recipesTable = createTable([
      { data: { id: RECIPE_ID }, error: null },
    ]);
    setupAuthedClient({
      from: vi.fn((table: string) => {
        if (table === "recipe_books") return recipeBooksTable;
        if (table === "recipes") return recipesTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { DELETE } = await importRemoveRoute();
    const response = await DELETE(
      new Request(`http://localhost:3000/api/v1/recipe-books/${BOOK_ID}/recipes/${RECIPE_ID}`, {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({ book_id: BOOK_ID, recipe_id: RECIPE_ID }),
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
});
