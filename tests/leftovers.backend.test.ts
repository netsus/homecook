import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

interface LeftoverRow {
  id: string;
  user_id: string;
  recipe_id: string;
  status: "leftover" | "eaten";
  cooked_at: string;
  eaten_at: string | null;
  auto_hide_at: string | null;
}

interface RecipeRow {
  id: string;
  title: string;
  thumbnail_url: string | null;
}

const leftoverId = "550e8400-e29b-41d4-a716-446655440201";
const otherLeftoverId = "550e8400-e29b-41d4-a716-446655440202";
const recipeId = "550e8400-e29b-41d4-a716-446655440301";
const otherRecipeId = "550e8400-e29b-41d4-a716-446655440302";
const nowIso = "2026-04-29T12:00:00.000Z";
const autoHideIso = "2026-05-29T12:00:00.000Z";
const authHeaders = { "x-homecook-e2e-auth": "authenticated" };

function createThenableQuery<T>(results: Array<QueryResult<T>>) {
  const query = {
    eq: vi.fn(() => query),
    gt: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    then(onFulfilled?: (value: QueryResult<T>) => unknown, onRejected?: (reason: unknown) => unknown) {
      const fallback: QueryResult<T> = {
        data: undefined as T,
        error: { message: "missing select result" },
      };

      return Promise.resolve(results.shift() ?? fallback).then(onFulfilled, onRejected);
    },
  };

  return query;
}

function createMaybeSingleQuery<T>(results: Array<QueryResult<T | null>>) {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(() =>
      Promise.resolve(
        results.shift() ?? {
          data: null,
          error: { message: "missing maybeSingle result" },
        },
      ),
    ),
  };

  return query;
}

function createUpdateQuery<T>(results: Array<QueryResult<T | null>>) {
  const query = {
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    maybeSingle: vi.fn(() =>
      Promise.resolve(
        results.shift() ?? {
          data: null,
          error: { message: "missing update result" },
        },
      ),
    ),
  };

  return query;
}

function createLeftoverListDb({
  leftovers,
  recipes,
}: {
  leftovers: LeftoverRow[];
  recipes: RecipeRow[];
}) {
  const leftoversQuery = createThenableQuery([{ data: leftovers, error: null }]);
  const recipesQuery = createThenableQuery([{ data: recipes, error: null }]);

  return {
    leftoversQuery,
    recipesQuery,
    db: {
      from: vi.fn((table: string) => {
        if (table === "leftover_dishes") {
          return { select: vi.fn(() => leftoversQuery) };
        }

        if (table === "recipes") {
          return { select: vi.fn(() => recipesQuery) };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    },
  };
}

function createLeftoverMutationDb({
  selectRows,
  updateRows = [],
}: {
  selectRows: Array<LeftoverRow | null>;
  updateRows?: Array<Pick<LeftoverRow, "id" | "status" | "eaten_at" | "auto_hide_at"> | null>;
}) {
  const selectQuery = createMaybeSingleQuery(
    selectRows.map((row) => ({ data: row, error: null })),
  );
  const updateQuery = createUpdateQuery(
    updateRows.map((row) => ({ data: row, error: null })),
  );
  const update = vi.fn(() => updateQuery);

  return {
    selectQuery,
    update,
    updateQuery,
    db: {
      from: vi.fn((table: string) => {
        if (table === "leftover_dishes") {
          return {
            select: vi.fn(() => selectQuery),
            update,
          };
        }

        throw new Error(`unexpected table: ${table}`);
      }),
    },
  };
}

function setupAuthenticatedDb(db: unknown, userId = "user-1") {
  createRouteHandlerClient.mockResolvedValue({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
    },
    from: vi.fn(),
  });
  createServiceRoleClient.mockReturnValue(db);
}

async function importListRoute() {
  return import("@/app/api/v1/leftovers/route");
}

async function importEatRoute() {
  return import("@/app/api/v1/leftovers/[leftover_id]/eat/route");
}

async function importUneatRoute() {
  return import("@/app/api/v1/leftovers/[leftover_id]/uneat/route");
}

describe("GET /api/v1/leftovers", () => {
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
  });

  it("returns 401 when the user is not authenticated", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      from: vi.fn(),
    });

    const { GET } = await importListRoute();
    const response = await GET(new NextRequest("http://localhost:3000/api/v1/leftovers"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("returns 422 when status is not leftover or eaten", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from: vi.fn(),
    });

    const { GET } = await importListRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/leftovers?status=archived"),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "status", reason: "invalid_value" }],
      },
    });
  });

  it("returns current leftovers with recipe metadata in the API envelope", async () => {
    const { db, leftoversQuery, recipesQuery } = createLeftoverListDb({
      leftovers: [
        {
          id: leftoverId,
          user_id: "user-1",
          recipe_id: recipeId,
          status: "leftover",
          cooked_at: "2026-04-28T10:00:00.000Z",
          eaten_at: null,
          auto_hide_at: null,
        },
        {
          id: otherLeftoverId,
          user_id: "user-1",
          recipe_id: otherRecipeId,
          status: "leftover",
          cooked_at: "2026-04-27T10:00:00.000Z",
          eaten_at: null,
          auto_hide_at: null,
        },
      ],
      recipes: [
        { id: recipeId, title: "김치찌개", thumbnail_url: "https://example.com/kimchi.png" },
        { id: otherRecipeId, title: "된장찌개", thumbnail_url: null },
      ],
    });
    setupAuthenticatedDb(db);

    const { GET } = await importListRoute();
    const response = await GET(new NextRequest("http://localhost:3000/api/v1/leftovers"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(leftoversQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(leftoversQuery.eq).toHaveBeenCalledWith("status", "leftover");
    expect(leftoversQuery.order).toHaveBeenCalledWith("cooked_at", { ascending: false });
    expect(recipesQuery.in).toHaveBeenCalledWith("id", [recipeId, otherRecipeId]);
    expect(body).toEqual({
      success: true,
      data: {
        items: [
          {
            id: leftoverId,
            recipe_id: recipeId,
            recipe_title: "김치찌개",
            recipe_thumbnail_url: "https://example.com/kimchi.png",
            status: "leftover",
            cooked_at: "2026-04-28T10:00:00.000Z",
            eaten_at: null,
          },
          {
            id: otherLeftoverId,
            recipe_id: otherRecipeId,
            recipe_title: "된장찌개",
            recipe_thumbnail_url: null,
            status: "leftover",
            cooked_at: "2026-04-27T10:00:00.000Z",
            eaten_at: null,
          },
        ],
      },
      error: null,
    });
  });

  it("filters eaten leftovers by auto_hide_at and sorts by eaten_at", async () => {
    const { db, leftoversQuery } = createLeftoverListDb({
      leftovers: [],
      recipes: [],
    });
    setupAuthenticatedDb(db);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(nowIso));

    const { GET } = await importListRoute();
    const response = await GET(
      new NextRequest("http://localhost:3000/api/v1/leftovers?status=eaten"),
    );

    expect(response.status).toBe(200);
    expect(leftoversQuery.eq).toHaveBeenCalledWith("status", "eaten");
    expect(leftoversQuery.gt).toHaveBeenCalledWith("auto_hide_at", nowIso);
    expect(leftoversQuery.order).toHaveBeenCalledWith("eaten_at", { ascending: false });
    vi.useRealTimers();
  });
});

describe("POST /api/v1/leftovers/{id}/eat", () => {
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date(nowIso));
  });

  it("returns 401 when the user is not authenticated", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      from: vi.fn(),
    });

    const { POST } = await importEatRoute();
    const response = await POST(new Request("http://localhost:3000"), {
      params: Promise.resolve({ leftover_id: leftoverId }),
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("updates a leftover dish to eaten and sets auto_hide_at 30 days later", async () => {
    const { db, update, updateQuery } = createLeftoverMutationDb({
      selectRows: [
        {
          id: leftoverId,
          user_id: "user-1",
          recipe_id: recipeId,
          status: "leftover",
          cooked_at: "2026-04-28T10:00:00.000Z",
          eaten_at: null,
          auto_hide_at: null,
        },
      ],
      updateRows: [
        {
          id: leftoverId,
          status: "eaten",
          eaten_at: nowIso,
          auto_hide_at: autoHideIso,
        },
      ],
    });
    setupAuthenticatedDb(db);

    const { POST } = await importEatRoute();
    const response = await POST(new Request("http://localhost:3000"), {
      params: Promise.resolve({ leftover_id: leftoverId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      status: "eaten",
      eaten_at: nowIso,
      auto_hide_at: autoHideIso,
    });
    expect(updateQuery.eq).toHaveBeenCalledWith("id", leftoverId);
    expect(updateQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(body).toEqual({
      success: true,
      data: {
        id: leftoverId,
        status: "eaten",
        eaten_at: nowIso,
        auto_hide_at: autoHideIso,
      },
      error: null,
    });
  });

  it("returns the same result without updating when the dish is already eaten", async () => {
    const { db, update } = createLeftoverMutationDb({
      selectRows: [
        {
          id: leftoverId,
          user_id: "user-1",
          recipe_id: recipeId,
          status: "eaten",
          cooked_at: "2026-04-28T10:00:00.000Z",
          eaten_at: "2026-04-28T12:00:00.000Z",
          auto_hide_at: "2026-05-28T12:00:00.000Z",
        },
      ],
    });
    setupAuthenticatedDb(db);

    const { POST } = await importEatRoute();
    const response = await POST(new Request("http://localhost:3000"), {
      params: Promise.resolve({ leftover_id: leftoverId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
    expect(body.data).toEqual({
      id: leftoverId,
      status: "eaten",
      eaten_at: "2026-04-28T12:00:00.000Z",
      auto_hide_at: "2026-05-28T12:00:00.000Z",
    });
  });

  it("returns 403 for another user's leftover", async () => {
    const { db, update } = createLeftoverMutationDb({
      selectRows: [
        {
          id: leftoverId,
          user_id: "other-user",
          recipe_id: recipeId,
          status: "leftover",
          cooked_at: "2026-04-28T10:00:00.000Z",
          eaten_at: null,
          auto_hide_at: null,
        },
      ],
    });
    setupAuthenticatedDb(db);

    const { POST } = await importEatRoute();
    const response = await POST(new Request("http://localhost:3000"), {
      params: Promise.resolve({ leftover_id: leftoverId }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 404 when the leftover does not exist", async () => {
    const { db } = createLeftoverMutationDb({ selectRows: [null] });
    setupAuthenticatedDb(db);

    const { POST } = await importEatRoute();
    const response = await POST(new Request("http://localhost:3000"), {
      params: Promise.resolve({ leftover_id: leftoverId }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
  });
});

describe("POST /api/v1/leftovers/{id}/uneat", () => {
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
  });

  it("returns 401 when the user is not authenticated", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
      from: vi.fn(),
    });

    const { POST } = await importUneatRoute();
    const response = await POST(new Request("http://localhost:3000"), {
      params: Promise.resolve({ leftover_id: leftoverId }),
    });
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("updates an eaten dish back to leftover and clears eaten fields", async () => {
    const { db, update } = createLeftoverMutationDb({
      selectRows: [
        {
          id: leftoverId,
          user_id: "user-1",
          recipe_id: recipeId,
          status: "eaten",
          cooked_at: "2026-04-28T10:00:00.000Z",
          eaten_at: nowIso,
          auto_hide_at: autoHideIso,
        },
      ],
      updateRows: [
        {
          id: leftoverId,
          status: "leftover",
          eaten_at: null,
          auto_hide_at: null,
        },
      ],
    });
    setupAuthenticatedDb(db);

    const { POST } = await importUneatRoute();
    const response = await POST(new Request("http://localhost:3000"), {
      params: Promise.resolve({ leftover_id: leftoverId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      status: "leftover",
      eaten_at: null,
      auto_hide_at: null,
    });
    expect(body.data).toEqual({
      id: leftoverId,
      status: "leftover",
      eaten_at: null,
      auto_hide_at: null,
    });
  });

  it("returns 403 for another user's leftover", async () => {
    const { db, update } = createLeftoverMutationDb({
      selectRows: [
        {
          id: leftoverId,
          user_id: "other-user",
          recipe_id: recipeId,
          status: "eaten",
          cooked_at: "2026-04-28T10:00:00.000Z",
          eaten_at: nowIso,
          auto_hide_at: autoHideIso,
        },
      ],
    });
    setupAuthenticatedDb(db);

    const { POST } = await importUneatRoute();
    const response = await POST(new Request("http://localhost:3000"), {
      params: Promise.resolve({ leftover_id: leftoverId }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 404 when the leftover does not exist", async () => {
    const { db } = createLeftoverMutationDb({ selectRows: [null] });
    setupAuthenticatedDb(db);

    const { POST } = await importUneatRoute();
    const response = await POST(new Request("http://localhost:3000"), {
      params: Promise.resolve({ leftover_id: leftoverId }),
    });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("returns the same result without updating when the dish is already leftover", async () => {
    const { db, update } = createLeftoverMutationDb({
      selectRows: [
        {
          id: leftoverId,
          user_id: "user-1",
          recipe_id: recipeId,
          status: "leftover",
          cooked_at: "2026-04-28T10:00:00.000Z",
          eaten_at: null,
          auto_hide_at: null,
        },
      ],
    });
    setupAuthenticatedDb(db);

    const { POST } = await importUneatRoute();
    const response = await POST(new Request("http://localhost:3000"), {
      params: Promise.resolve({ leftover_id: leftoverId }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
    expect(body.data).toEqual({
      id: leftoverId,
      status: "leftover",
      eaten_at: null,
      auto_hide_at: null,
    });
  });
});

describe("leftovers QA fixture baseline", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.HOMECOOK_ENABLE_QA_FIXTURES = "1";
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(nowIso));
  });

  afterEach(() => {
    delete process.env.HOMECOOK_ENABLE_QA_FIXTURES;
    vi.useRealTimers();
  });

  it("serves leftover and eaten fixture rows without expired eaten items", async () => {
    const { resetQaFixtureState } = await import("@/lib/mock/recipes");
    resetQaFixtureState();

    const { GET } = await importListRoute();
    const leftoversResponse = await GET(
      new NextRequest("http://localhost:3000/api/v1/leftovers", {
        headers: authHeaders,
      }),
    );
    const eatenResponse = await GET(
      new NextRequest("http://localhost:3000/api/v1/leftovers?status=eaten", {
        headers: authHeaders,
      }),
    );
    const leftoversBody = await leftoversResponse.json();
    const eatenBody = await eatenResponse.json();

    expect(leftoversResponse.status).toBe(200);
    expect(eatenResponse.status).toBe(200);
    expect(leftoversBody.data.items.map((item: { id: string }) => item.id)).toEqual([
      leftoverId,
      "550e8400-e29b-41d4-a716-446655440204",
    ]);
    expect(eatenBody.data.items.map((item: { id: string }) => item.id)).toEqual([
      "550e8400-e29b-41d4-a716-446655440203",
    ]);
    expect(createRouteHandlerClient).not.toHaveBeenCalled();
  });

  it("mutates fixture leftovers through eat and uneat routes", async () => {
    const { resetQaFixtureState } = await import("@/lib/mock/recipes");
    resetQaFixtureState();

    const { POST: eatPost } = await importEatRoute();
    const eatResponse = await eatPost(new Request("http://localhost:3000", {
      headers: authHeaders,
    }), {
      params: Promise.resolve({ leftover_id: leftoverId }),
    });
    const eatBody = await eatResponse.json();

    const { POST: uneatPost } = await importUneatRoute();
    const uneatResponse = await uneatPost(new Request("http://localhost:3000", {
      headers: authHeaders,
    }), {
      params: Promise.resolve({ leftover_id: "550e8400-e29b-41d4-a716-446655440203" }),
    });
    const uneatBody = await uneatResponse.json();

    expect(eatResponse.status).toBe(200);
    expect(eatBody.data).toEqual({
      id: leftoverId,
      status: "eaten",
      eaten_at: nowIso,
      auto_hide_at: autoHideIso,
    });
    expect(uneatResponse.status).toBe(200);
    expect(uneatBody.data).toEqual({
      id: "550e8400-e29b-41d4-a716-446655440203",
      status: "leftover",
      eaten_at: null,
      auto_hide_at: null,
    });
    expect(createRouteHandlerClient).not.toHaveBeenCalled();
  });

  it("rejects another user's fixture leftover", async () => {
    const { resetQaFixtureState } = await import("@/lib/mock/recipes");
    resetQaFixtureState();

    const { POST } = await importEatRoute();
    const response = await POST(new Request("http://localhost:3000", {
      headers: authHeaders,
    }), {
      params: Promise.resolve({ leftover_id: otherLeftoverId }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(createRouteHandlerClient).not.toHaveBeenCalled();
  });
});
