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
  code?: string;
  message: string;
}

interface QueryResult<T> {
  data: T | null;
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

function createSelectQuery<T>(results: Array<QueryResult<T[]>>) {
  const query = {
    eq: vi.fn(() => query),
    ilike: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    then(
      onFulfilled?: (value: QueryResult<T[]>) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(
        results.shift() ?? {
          data: null,
          error: { message: "missing select result" },
        },
      ).then(onFulfilled, onRejected);
    },
  };

  return query;
}

function createInsertQuery<T>(results: Array<QueryResult<T[]>>) {
  const query = {
    select: vi.fn(() =>
      createAwaitableQuery(
        results.shift() ?? {
          data: null,
          error: { message: "missing insert result" },
        },
      ),
    ),
  };

  return query;
}

function createDeleteQuery<T>(results: Array<QueryResult<T[]>>) {
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    select: vi.fn(() =>
      createAwaitableQuery(
        results.shift() ?? {
          data: null,
          error: { message: "missing delete result" },
        },
      ),
    ),
  };

  return query;
}

function createTable<TSelect = unknown, TInsert = unknown, TDelete = unknown>({
  selectResults = [],
  insertResults = [],
  deleteResults = [],
}: {
  selectResults?: Array<QueryResult<TSelect[]>>;
  insertResults?: Array<QueryResult<TInsert[]>>;
  deleteResults?: Array<QueryResult<TDelete[]>>;
}) {
  return {
    select: vi.fn(() => createSelectQuery(selectResults)),
    insert: vi.fn(() => createInsertQuery(insertResults)),
    delete: vi.fn(() => createDeleteQuery(deleteResults)),
  };
}

async function importPantryRoute() {
  return import("@/app/api/v1/pantry/route");
}

async function importPantryBundlesRoute() {
  return import("@/app/api/v1/pantry/bundles/route");
}

describe("13 pantry core backend", () => {
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
  });

  it("GET /pantry returns 401 when the user is not authenticated", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      from: vi.fn(),
    });

    const { GET } = await importPantryRoute();
    const response = await GET(new NextRequest("http://localhost:3000/api/v1/pantry"));
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

  it("GET /pantry lists the current user's pantry ingredients with search and category filters", async () => {
    const pantryItemsTable = createTable({
      selectResults: [
        {
          data: [
            {
              id: "pantry-2",
              ingredient_id: "ing-tofu",
              created_at: "2026-04-28T09:00:00Z",
              ingredients: { standard_name: "두부", category: "단백질" },
            },
            {
              id: "pantry-1",
              ingredient_id: "ing-onion",
              created_at: "2026-04-27T09:00:00Z",
              ingredients: { standard_name: "양파", category: "채소" },
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
        if (table === "pantry_items") return pantryItemsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importPantryRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/pantry?q=%EC%96%91&category=%EC%B1%84%EC%86%8C"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        items: [
          {
            id: "pantry-2",
            ingredient_id: "ing-tofu",
            standard_name: "두부",
            category: "단백질",
            created_at: "2026-04-28T09:00:00Z",
          },
          {
            id: "pantry-1",
            ingredient_id: "ing-onion",
            standard_name: "양파",
            category: "채소",
            created_at: "2026-04-27T09:00:00Z",
          },
        ],
      },
      error: null,
    });
    const selectQuery = pantryItemsTable.select.mock.results[0]?.value;
    expect(selectQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(selectQuery.ilike).toHaveBeenCalledWith("ingredients.standard_name", "%양%");
    expect(selectQuery.eq).toHaveBeenCalledWith("ingredients.category", "채소");
  });

  it("POST /pantry adds only valid new ingredients and silently skips duplicates", async () => {
    const ingredientsTable = createTable({
      selectResults: [
        {
          data: [
            { id: "ing-onion", standard_name: "양파", category: "채소" },
            { id: "ing-tofu", standard_name: "두부", category: "단백질" },
          ],
          error: null,
        },
      ],
    });
    const pantryItemsTable = createTable({
      selectResults: [
        {
          data: [{ ingredient_id: "ing-onion" }],
          error: null,
        },
      ],
      insertResults: [
        {
          data: [
            {
              id: "pantry-tofu",
              ingredient_id: "ing-tofu",
              created_at: "2026-04-28T10:00:00Z",
              ingredients: { standard_name: "두부", category: "단백질" },
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
        if (table === "ingredients") return ingredientsTable;
        if (table === "pantry_items") return pantryItemsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importPantryRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/pantry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ingredient_ids: ["ing-onion", "missing-ing", "ing-tofu", "ing-tofu"],
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      success: true,
      data: {
        added: 1,
        items: [
          {
            id: "pantry-tofu",
            ingredient_id: "ing-tofu",
            standard_name: "두부",
            category: "단백질",
            created_at: "2026-04-28T10:00:00Z",
          },
        ],
      },
      error: null,
    });
    expect(pantryItemsTable.insert).toHaveBeenCalledWith([
      {
        user_id: "user-1",
        ingredient_id: "ing-tofu",
      },
    ]);
  });

  it("POST /pantry returns 422 for empty ingredient_ids", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn(),
    });

    const { POST } = await importPantryRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/pantry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ingredient_ids: [] }),
    }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "ingredient_ids", reason: "required_non_empty" }],
      },
    });
  });

  it("DELETE /pantry removes only the current user's pantry rows and is idempotent", async () => {
    const pantryItemsTable = createTable({
      deleteResults: [
        {
          data: [{ ingredient_id: "ing-onion" }],
          error: null,
        },
      ],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "pantry_items") return pantryItemsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { DELETE } = await importPantryRoute();
    const response = await DELETE(new Request("http://localhost:3000/api/v1/pantry", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ingredient_ids: ["ing-onion", "already-gone"] }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        removed: 1,
      },
      error: null,
    });
    const deleteQuery = pantryItemsTable.delete.mock.results[0]?.value;
    expect(deleteQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(deleteQuery.in).toHaveBeenCalledWith("ingredient_id", ["ing-onion", "already-gone"]);
  });

  it("DELETE /pantry returns 422 for empty ingredient_ids", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn(),
    });

    const { DELETE } = await importPantryRoute();
    const response = await DELETE(new Request("http://localhost:3000/api/v1/pantry", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ingredient_ids: [] }),
    }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "ingredient_ids", reason: "required_non_empty" }],
      },
    });
  });

  it("GET /pantry/bundles marks ingredients already in the current user's pantry", async () => {
    const bundlesTable = createTable({
      selectResults: [
        {
          data: [
            { id: "bundle-veg", name: "야채 모음", display_order: 2 },
            { id: "bundle-seasoning", name: "조미료 모음", display_order: 1 },
          ],
          error: null,
        },
      ],
    });
    const bundleItemsTable = createTable({
      selectResults: [
        {
          data: [
            {
              bundle_id: "bundle-seasoning",
              ingredient_id: "ing-salt",
              ingredients: { standard_name: "소금" },
            },
            {
              bundle_id: "bundle-veg",
              ingredient_id: "ing-onion",
              ingredients: { standard_name: "양파" },
            },
          ],
          error: null,
        },
      ],
    });
    const pantryItemsTable = createTable({
      selectResults: [
        {
          data: [{ ingredient_id: "ing-onion" }],
          error: null,
        },
      ],
    });

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "ingredient_bundles") return bundlesTable;
        if (table === "ingredient_bundle_items") return bundleItemsTable;
        if (table === "pantry_items") return pantryItemsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importPantryBundlesRoute();
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        bundles: [
          {
            id: "bundle-seasoning",
            name: "조미료 모음",
            display_order: 1,
            ingredients: [
              {
                ingredient_id: "ing-salt",
                standard_name: "소금",
                is_in_pantry: false,
              },
            ],
          },
          {
            id: "bundle-veg",
            name: "야채 모음",
            display_order: 2,
            ingredients: [
              {
                ingredient_id: "ing-onion",
                standard_name: "양파",
                is_in_pantry: true,
              },
            ],
          },
        ],
      },
      error: null,
    });
    expect(pantryItemsTable.select.mock.results[0]?.value.eq).toHaveBeenCalledWith("user_id", "user-1");
  });
});
