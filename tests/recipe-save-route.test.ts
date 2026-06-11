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
const awardUserProgressEvent = vi.fn();
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

vi.mock("@/lib/server/user-progress", () => ({
  awardUserProgressEvent,
}));

vi.mock("@/lib/server/user-growth-activity", () => ({
  recordUserGrowthActivityEvent,
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

interface RecipeBookRow {
  id: string;
  user_id: string;
  book_type: string;
}

function createRecipeBooksTable({
  selectResults,
}: {
  selectResults: Array<QueryResult<RecipeBookRow | RecipeBookRow[] | null>>;
}) {
  const selectQuery = {
    eq: vi.fn(() => selectQuery),
    in: vi.fn(() => selectQuery),
    maybeSingle: vi.fn(() => createAwaitableQuery(
      (selectResults.shift() as QueryResult<RecipeBookRow | null> | undefined) ?? {
        data: null,
        error: { message: "missing recipe_books select result" },
      },
    )),
    then(
      onFulfilled?: (value: QueryResult<RecipeBookRow[]>) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      const result = (selectResults.shift() as QueryResult<RecipeBookRow[] | RecipeBookRow | null> | undefined) ?? {
        data: [],
        error: { message: "missing recipe_books select result" },
      };
      const normalizedResult: QueryResult<RecipeBookRow[]> = {
        data: Array.isArray(result.data)
          ? result.data
          : result.data
            ? [result.data]
            : [],
        error: result.error,
      };

      return Promise.resolve(
        normalizedResult,
      ).then(onFulfilled, onRejected);
    },
  };

  return {
    select: vi.fn(() => selectQuery),
    __selectQuery: selectQuery,
  };
}

function createRecipeBookItemsTable({
  selectResults = [],
  insertResults,
  deleteResults = [],
}: {
  selectResults?: Array<QueryResult<Array<{ id: string; book_id?: string }>>>;
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
    in: vi.fn(() => selectQuery),
    then(
      onFulfilled?: (value: QueryResult<Array<{ id: string; book_id?: string }>>) => unknown,
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
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    formatBootstrapErrorMessage.mockClear();
    awardUserProgressEvent.mockReset();
    recordUserGrowthActivityEvent.mockReset();
    createServiceRoleClient.mockReturnValue(null);
    ensurePublicUserRow.mockResolvedValue({});
    ensureUserBootstrapState.mockResolvedValue(undefined);
    awardUserProgressEvent.mockResolvedValue({
      awarded: false,
      duplicate: false,
      error: null,
      summary: null,
    });
    recordUserGrowthActivityEvent.mockResolvedValue({ recorded: true, duplicate: false, error: null });
    delete process.env.HOMECOOK_ENABLE_QA_FIXTURES;
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
      updateResults: [
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
      updateResults: [
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

  it("reports an already-saved book without failing", async () => {
    const bookId = "550e8400-e29b-41d4-a716-446655440010";
    const recipeId = "550e8400-e29b-41d4-a716-446655440024";
    const recipesTable = createRecipesTable({
      selectResults: [
        {
          data: { id: "recipe-1", save_count: 3 },
          error: null,
        },
      ],
      updateResults: [
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
        {
          data: [
            {
              id: bookId,
              user_id: "user-1",
              book_type: "saved",
            },
          ],
          error: null,
        },
      ],
    });
    const recipeBookItemsTable = createRecipeBookItemsTable({
      selectResults: [
        {
          data: [{ id: "existing-item", book_id: bookId }],
          error: null,
        },
        {
          data: [
            { id: "existing-item", book_id: bookId },
            { id: "second-item" },
            { id: "third-item" },
          ],
          error: null,
        },
      ],
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
      body: JSON.stringify({ book_ids: [bookId] }),
    }), {
      params: Promise.resolve({ id: recipeId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        saved: true,
        save_count: 3,
        book_ids: [bookId],
        created_book_ids: [],
        already_saved_book_ids: [bookId],
      },
      error: null,
    });
    expect(recipeBookItemsTable.insert).not.toHaveBeenCalled();
    expect(awardUserProgressEvent).not.toHaveBeenCalled();
  });

  it("multi-saves into selected books and reports already-saved books without failing", async () => {
    const firstBookId = "550e8400-e29b-41d4-a716-446655440010";
    const secondBookId = "550e8400-e29b-41d4-a716-446655440011";
    const recipeId = "550e8400-e29b-41d4-a716-446655440025";
    const recipesTable = createRecipesTable({
      selectResults: [
        {
          data: { id: "recipe-1", save_count: 3 },
          error: null,
        },
      ],
      updateResults: [
        {
          data: { id: "recipe-1", save_count: 5 },
          error: null,
        },
      ],
    });
    const recipeBooksTable = createRecipeBooksTable({
      selectResults: [
        {
          data: [
            { id: firstBookId, user_id: "user-1", book_type: "saved" },
            { id: secondBookId, user_id: "user-1", book_type: "custom" },
          ],
          error: null,
        },
        {
          data: [
            { id: firstBookId, user_id: "user-1", book_type: "saved" },
            { id: secondBookId, user_id: "user-1", book_type: "custom" },
          ],
          error: null,
        },
      ],
    });
    const recipeBookItemsTable = createRecipeBookItemsTable({
      selectResults: [
        {
          data: [{ id: "existing-item", book_id: firstBookId }],
          error: null,
        },
        {
          data: [
            { id: "existing-item", book_id: firstBookId },
            { id: "another-item" },
            { id: "third-item" },
            { id: "fourth-item" },
            { id: "new-item", book_id: secondBookId },
          ],
          error: null,
        },
      ],
      insertResults: [
        {
          data: { id: "new-item" },
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
      body: JSON.stringify({ book_ids: [firstBookId, secondBookId, secondBookId] }),
    }), {
      params: Promise.resolve({ id: recipeId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        saved: true,
        save_count: 5,
        book_ids: [firstBookId, secondBookId],
        created_book_ids: [secondBookId],
        already_saved_book_ids: [firstBookId],
      },
      error: null,
    });
    expect(recipeBooksTable.__selectQuery.in).toHaveBeenCalledWith("id", [firstBookId, secondBookId]);
    expect(recipeBookItemsTable.__selectQuery.in).toHaveBeenCalledWith("book_id", [firstBookId, secondBookId]);
    expect(recipeBookItemsTable.insert).toHaveBeenCalledWith({
      book_id: secondBookId,
      recipe_id: recipeId,
    });
    expect(recipesTable.update).toHaveBeenCalledWith({
      save_count: 5,
    });
    expect(awardUserProgressEvent).not.toHaveBeenCalled();
  });

  it("does not award recipe_saved when the user already had another savable membership", async () => {
    const savedBookId = "550e8400-e29b-41d4-a716-446655440012";
    const customBookId = "550e8400-e29b-41d4-a716-446655440013";
    const recipeId = "550e8400-e29b-41d4-a716-446655440026";
    const recipesTable = createRecipesTable({
      selectResults: [
        {
          data: { id: "recipe-1", save_count: 1 },
          error: null,
        },
      ],
      updateResults: [
        {
          data: { id: "recipe-1", save_count: 2 },
          error: null,
        },
      ],
    });
    const recipeBooksTable = createRecipeBooksTable({
      selectResults: [
        {
          data: [{ id: customBookId, user_id: "user-1", book_type: "custom" }],
          error: null,
        },
        {
          data: [
            { id: savedBookId, user_id: "user-1", book_type: "saved" },
            { id: customBookId, user_id: "user-1", book_type: "custom" },
          ],
          error: null,
        },
      ],
    });
    const recipeBookItemsTable = createRecipeBookItemsTable({
      selectResults: [
        {
          data: [{ id: "existing-saved-item", book_id: savedBookId }],
          error: null,
        },
        {
          data: [
            { id: "existing-saved-item", book_id: savedBookId },
            { id: "new-custom-item", book_id: customBookId },
          ],
          error: null,
        },
      ],
      insertResults: [
        {
          data: { id: "new-custom-item" },
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
      body: JSON.stringify({ book_ids: [customBookId] }),
    }), {
      params: Promise.resolve({ id: recipeId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.created_book_ids).toEqual([customBookId]);
    expect(awardUserProgressEvent).not.toHaveBeenCalled();
  });

  it("returns 404 in fixture mode when save route injects missing recipe fault", async () => {
    process.env.HOMECOOK_ENABLE_QA_FIXTURES = "1";

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/mock-kimchi-jjigae/save", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-homecook-e2e-auth": "authenticated",
        "x-homecook-qa-fixture-faults": JSON.stringify({
          recipe_save: "missing_recipe",
        }),
      },
      body: JSON.stringify({ book_id: "550e8400-e29b-41d4-a716-446655440040" }),
    }), {
      params: Promise.resolve({ id: "mock-kimchi-jjigae" }),
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

  it("returns 403 in fixture mode when save route injects forbidden book fault", async () => {
    process.env.HOMECOOK_ENABLE_QA_FIXTURES = "1";

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/mock-kimchi-jjigae/save", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-homecook-e2e-auth": "authenticated",
        "x-homecook-qa-fixture-faults": JSON.stringify({
          recipe_save: "forbidden_book",
        }),
      },
      body: JSON.stringify({ book_id: "550e8400-e29b-41d4-a716-446655440040" }),
    }), {
      params: Promise.resolve({ id: "mock-kimchi-jjigae" }),
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

  it("returns 409 in fixture mode when save route injects duplicate save fault", async () => {
    process.env.HOMECOOK_ENABLE_QA_FIXTURES = "1";

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/mock-kimchi-jjigae/save", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-homecook-e2e-auth": "authenticated",
        "x-homecook-qa-fixture-faults": JSON.stringify({
          recipe_save: "duplicate_save",
        }),
      },
      body: JSON.stringify({ book_id: "550e8400-e29b-41d4-a716-446655440040" }),
    }), {
      params: Promise.resolve({ id: "mock-kimchi-jjigae" }),
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

  it("returns 404 in fixture mode when save route injects missing book fault", async () => {
    process.env.HOMECOOK_ENABLE_QA_FIXTURES = "1";

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/mock-kimchi-jjigae/save", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-homecook-e2e-auth": "authenticated",
        "x-homecook-qa-fixture-faults": JSON.stringify({
          recipe_save: "missing_book",
        }),
      },
      body: JSON.stringify({ book_id: "550e8400-e29b-41d4-a716-446655440040" }),
    }), {
      params: Promise.resolve({ id: "mock-kimchi-jjigae" }),
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

  it("returns 409 in fixture mode when save route injects invalid book type fault", async () => {
    process.env.HOMECOOK_ENABLE_QA_FIXTURES = "1";

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/mock-kimchi-jjigae/save", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-homecook-e2e-auth": "authenticated",
        "x-homecook-qa-fixture-faults": JSON.stringify({
          recipe_save: "invalid_book_type",
        }),
      },
      body: JSON.stringify({ book_id: "550e8400-e29b-41d4-a716-446655440040" }),
    }), {
      params: Promise.resolve({ id: "mock-kimchi-jjigae" }),
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

  it("returns 500 in fixture mode when save route injects internal error fault", async () => {
    process.env.HOMECOOK_ENABLE_QA_FIXTURES = "1";

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/mock-kimchi-jjigae/save", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-homecook-e2e-auth": "authenticated",
        "x-homecook-qa-fixture-faults": JSON.stringify({
          recipe_save: "internal_error",
        }),
      },
      body: JSON.stringify({ book_id: "550e8400-e29b-41d4-a716-446655440040" }),
    }), {
      params: Promise.resolve({ id: "mock-kimchi-jjigae" }),
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
  });

  it("saves the recipe and returns the updated save_count", async () => {
    const bookId = "550e8400-e29b-41d4-a716-446655440010";
    const recipeId = "550e8400-e29b-41d4-a716-446655440025";
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
        {
          data: [
            {
              id: bookId,
              user_id: "user-1",
              book_type: "custom",
            },
          ],
          error: null,
        },
      ],
    });
    const recipeBookItemsTable = createRecipeBookItemsTable({
      selectResults: [
        {
          data: [],
          error: null,
        },
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
      body: JSON.stringify({ book_ids: [bookId] }),
    }), {
      params: Promise.resolve({ id: recipeId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        saved: true,
        save_count: 4,
        book_ids: [bookId],
        created_book_ids: [bookId],
        already_saved_book_ids: [],
      },
      error: null,
    });
    expect(ensurePublicUserRow).toHaveBeenCalledWith(expect.anything(), { id: "user-1" });
    expect(ensureUserBootstrapState).toHaveBeenCalledWith(expect.anything(), "user-1");
    expect(recipeBookItemsTable.insert).toHaveBeenCalledWith({
      book_id: bookId,
      recipe_id: recipeId,
    });
    expect(recipesTable.update).toHaveBeenCalledWith({
      save_count: 4,
    });
    expect(awardUserProgressEvent).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-1",
      eventType: "recipe_saved",
      sourceTable: "recipe_book_items",
      sourceId: "item-1",
      recipeId,
    });
    expect(recordUserGrowthActivityEvent).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-1",
      activityType: "recipebook_recipe_added",
      category: "recipebook",
      sourceKey: "recipebook_recipe_added:item-1",
      sourceTable: "recipe_book_items",
      sourceId: "item-1",
      sourceMeta: {
        book_id: bookId,
        recipe_id: recipeId,
        distinct_book_recipe_key: `${bookId}:${recipeId}`,
      },
    });
  });

  it("keeps recipe save successful when progress writer fails", async () => {
    awardUserProgressEvent.mockRejectedValue(new Error("progress unavailable"));

    const bookId = "550e8400-e29b-41d4-a716-446655440014";
    const recipeId = "550e8400-e29b-41d4-a716-446655440028";
    const recipesTable = createRecipesTable({
      selectResults: [
        {
          data: { id: "recipe-1", save_count: 0 },
          error: null,
        },
      ],
      updateResults: [
        {
          data: { id: "recipe-1", save_count: 1 },
          error: null,
        },
      ],
    });
    const recipeBooksTable = createRecipeBooksTable({
      selectResults: [
        {
          data: {
            id: bookId,
            user_id: "user-1",
            book_type: "saved",
          },
          error: null,
        },
        {
          data: [
            {
              id: bookId,
              user_id: "user-1",
              book_type: "saved",
            },
          ],
          error: null,
        },
      ],
    });
    const recipeBookItemsTable = createRecipeBookItemsTable({
      selectResults: [
        {
          data: [],
          error: null,
        },
        {
          data: [{ id: "item-1", book_id: bookId }],
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
      body: JSON.stringify({ book_ids: [bookId] }),
    }), {
      params: Promise.resolve({ id: recipeId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.created_book_ids).toEqual([bookId]);
  });

  it("returns schema guidance when bootstrap fails before saving", async () => {
    ensurePublicUserRow.mockRejectedValue(
      new Error("Could not find the table 'public.recipe_books' in the schema cache"),
    );

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: "user-1" } },
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
      body: JSON.stringify({ book_id: "550e8400-e29b-41d4-a716-446655440010" }),
    }), {
      params: Promise.resolve({ id: "550e8400-e29b-41d4-a716-446655440025" }),
    });
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
        {
          data: [
            {
              id: "550e8400-e29b-41d4-a716-446655440010",
              user_id: "user-1",
              book_type: "saved",
            },
          ],
          error: null,
        },
      ],
    });
    const recipeBookItemsTable = createRecipeBookItemsTable({
      selectResults: [
        {
          data: [],
          error: null,
        },
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
