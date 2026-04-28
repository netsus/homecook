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

function createMaybeSingleQuery<T>(results: Array<QueryResult<T | null>>) {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () =>
      results.shift() ?? {
        data: null,
        error: { message: "missing maybeSingle result" },
      }),
  };

  return query;
}

function createArraySelectQuery<T>(results: Array<QueryResult<T[]>>) {
  const query = {
    eq: vi.fn(() => query),
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

async function importShareTextRoute() {
  return import("@/app/api/v1/shopping/lists/[list_id]/share-text/route");
}

describe("10b shopping share text backend", () => {
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

  it("returns 401 when share text is requested without authentication", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      from: vi.fn(),
    });

    const { GET } = await importShareTextRoute();
    const response = await GET(
      new Request("http://localhost:3000/api/v1/shopping/lists/550e8400-e29b-41d4-a716-446655440001/share-text"),
      {
        params: Promise.resolve({
          list_id: "550e8400-e29b-41d4-a716-446655440001",
        }),
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

  it("returns 404 for invalid list ids before querying the database", async () => {
    const { GET } = await importShareTextRoute();
    const response = await GET(
      new Request("http://localhost:3000/api/v1/shopping/lists/not-a-uuid/share-text"),
      {
        params: Promise.resolve({
          list_id: "not-a-uuid",
        }),
      },
    );
    const body = await response.json();

    expect(createRouteHandlerClient).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "RESOURCE_NOT_FOUND" },
    });
  });

  it("returns share text with only purchase-section items in sorted order", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: "550e8400-e29b-41d4-a716-446655440001",
          user_id: "user-1",
          title: "4/25 장보기",
          date_range_start: "2026-04-25",
          is_completed: false,
        },
        error: null,
      },
    ]);
    const itemsQuery = createArraySelectQuery([
      {
        data: [
          {
            id: "550e8400-e29b-41d4-a716-446655440111",
            display_text: "양파 2개 + 200g",
            is_checked: true,
            is_pantry_excluded: false,
            sort_order: 10,
          },
          {
            id: "550e8400-e29b-41d4-a716-446655440222",
            display_text: "김치 400g",
            is_checked: false,
            is_pantry_excluded: false,
            sort_order: 20,
          },
        ],
        error: null,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") {
          return { select: vi.fn(() => listQuery) };
        }
        if (table === "shopping_list_items") {
          return { select: vi.fn(() => itemsQuery) };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importShareTextRoute();
    const response = await GET(
      new Request("http://localhost:3000/api/v1/shopping/lists/550e8400-e29b-41d4-a716-446655440001/share-text"),
      {
        params: Promise.resolve({
          list_id: "550e8400-e29b-41d4-a716-446655440001",
        }),
      },
    );
    const body = await response.json();

    expect(itemsQuery.eq).toHaveBeenCalledWith("is_pantry_excluded", false);
    expect(itemsQuery.order).toHaveBeenCalledWith("sort_order", { ascending: true });
    expect(itemsQuery.order).toHaveBeenCalledWith("id", { ascending: true });
    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        text: "📋 4/25 장보기\n\n☑ 양파 2개 + 200g\n☐ 김치 400g",
      },
      error: null,
    });
  });

  it("returns the same share text for repeated read-only requests when items are unchanged", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: "550e8400-e29b-41d4-a716-446655440001",
          user_id: "user-1",
          title: "4/25 장보기",
          date_range_start: "2026-04-25",
          is_completed: false,
        },
        error: null,
      },
      {
        data: {
          id: "550e8400-e29b-41d4-a716-446655440001",
          user_id: "user-1",
          title: "4/25 장보기",
          date_range_start: "2026-04-25",
          is_completed: false,
        },
        error: null,
      },
    ]);
    const itemsQuery = createArraySelectQuery([
      {
        data: [
          {
            id: "550e8400-e29b-41d4-a716-446655440111",
            display_text: "양파 2개",
            is_checked: false,
            is_pantry_excluded: false,
            sort_order: 10,
          },
        ],
        error: null,
      },
      {
        data: [
          {
            id: "550e8400-e29b-41d4-a716-446655440111",
            display_text: "양파 2개",
            is_checked: false,
            is_pantry_excluded: false,
            sort_order: 10,
          },
        ],
        error: null,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") {
          return { select: vi.fn(() => listQuery) };
        }
        if (table === "shopping_list_items") {
          return { select: vi.fn(() => itemsQuery) };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importShareTextRoute();
    const context = {
      params: Promise.resolve({
        list_id: "550e8400-e29b-41d4-a716-446655440001",
      }),
    };
    const firstResponse = await GET(
      new Request("http://localhost:3000/api/v1/shopping/lists/550e8400-e29b-41d4-a716-446655440001/share-text"),
      context,
    );
    const secondResponse = await GET(
      new Request("http://localhost:3000/api/v1/shopping/lists/550e8400-e29b-41d4-a716-446655440001/share-text"),
      context,
    );

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(await secondResponse.json()).toEqual(await firstResponse.json());
  });

  it("returns 403 when another user's shopping list is requested", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: "550e8400-e29b-41d4-a716-446655440001",
          user_id: "other-user",
          title: "4/25 장보기",
          date_range_start: "2026-04-25",
          is_completed: false,
        },
        error: null,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") {
          return { select: vi.fn(() => listQuery) };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importShareTextRoute();
    const response = await GET(
      new Request("http://localhost:3000/api/v1/shopping/lists/550e8400-e29b-41d4-a716-446655440001/share-text"),
      {
        params: Promise.resolve({
          list_id: "550e8400-e29b-41d4-a716-446655440001",
        }),
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

  it("allows share text generation for completed read-only lists", async () => {
    const listQuery = createMaybeSingleQuery([
      {
        data: {
          id: "550e8400-e29b-41d4-a716-446655440001",
          user_id: "user-1",
          title: "4/25 장보기",
          date_range_start: "2026-04-25",
          is_completed: true,
        },
        error: null,
      },
    ]);
    const itemsQuery = createArraySelectQuery([
      {
        data: [
          {
            id: "550e8400-e29b-41d4-a716-446655440111",
            display_text: "두부 1모",
            is_checked: true,
            is_pantry_excluded: false,
            sort_order: 10,
          },
        ],
        error: null,
      },
    ]);

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      from: vi.fn((table: string) => {
        if (table === "shopping_lists") {
          return { select: vi.fn(() => listQuery) };
        }
        if (table === "shopping_list_items") {
          return { select: vi.fn(() => itemsQuery) };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { GET } = await importShareTextRoute();
    const response = await GET(
      new Request("http://localhost:3000/api/v1/shopping/lists/550e8400-e29b-41d4-a716-446655440001/share-text"),
      {
        params: Promise.resolve({
          list_id: "550e8400-e29b-41d4-a716-446655440001",
        }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.text).toContain("☑ 두부 1모");
  });
});
