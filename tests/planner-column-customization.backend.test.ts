import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();
const formatBootstrapErrorMessage = vi.fn((_error: unknown, fallbackMessage: string) => fallbackMessage);

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
}));

interface MemoryPlannerColumnRow {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

interface MemoryMealRow {
  id: string;
  user_id: string;
  column_id: string;
}

const COLUMN_IDS = {
  breakfast: "550e8400-e29b-41d4-a716-446655440101",
  lunch: "550e8400-e29b-41d4-a716-446655440102",
  dinner: "550e8400-e29b-41d4-a716-446655440103",
  snack: "550e8400-e29b-41d4-a716-446655440104",
  night: "550e8400-e29b-41d4-a716-446655440105",
  other: "550e8400-e29b-41d4-a716-446655440106",
} as const;

function createMemoryPlannerColumnsClient({
  columns = [],
  meals = [],
}: {
  columns?: MemoryPlannerColumnRow[];
  meals?: MemoryMealRow[];
}) {
  const state = {
    columns: [...columns],
    meals: [...meals],
  };

  function createSelectQuery<T extends MemoryPlannerColumnRow | MemoryMealRow>(rows: T[]) {
    const query = {
      filters: {} as Record<string, string>,
      orders: [] as Array<{ column: keyof T; ascending: boolean }>,
      limitCount: null as number | null,
      eq(column: string, value: string) {
        this.filters[column] = value;
        return this;
      },
      order(column: keyof T, options: { ascending: boolean }) {
        this.orders.push({ column, ascending: options.ascending });
        return this;
      },
      limit(count: number) {
        this.limitCount = count;
        return this;
      },
      getRows() {
        const filtered = rows
          .filter((candidate) =>
            Object.entries(this.filters).every(([column, value]) => {
              return String(candidate[column as keyof T]) === value;
            }))
          .sort((left, right) => {
            for (const order of this.orders) {
              const leftValue = left[order.column];
              const rightValue = right[order.column];

              if (leftValue === rightValue) {
                continue;
              }

              const comparison = leftValue < rightValue ? -1 : 1;
              return order.ascending ? comparison : comparison * -1;
            }

            return 0;
          });

        return this.limitCount === null ? filtered : filtered.slice(0, this.limitCount);
      },
      maybeSingle() {
        return Promise.resolve({
          data: this.getRows()[0] ?? null,
          error: null,
        });
      },
      then(onFulfilled?: (value: { data: T[]; error: null }) => unknown) {
        return Promise.resolve({
          data: this.getRows(),
          error: null,
        }).then(onFulfilled);
      },
    };

    return query;
  }

  function createMutationQuery({
    run,
  }: {
    run(filters: Record<string, string>): MemoryPlannerColumnRow | null;
  }) {
    const query = {
      filters: {} as Record<string, string>,
      eq(column: string, value: string) {
        this.filters[column] = value;
        return this;
      },
      select() {
        return this;
      },
      maybeSingle() {
        return Promise.resolve({
          data: run(this.filters),
          error: null,
        });
      },
      then(onFulfilled?: (value: { data: null; error: null }) => unknown) {
        run(this.filters);
        return Promise.resolve({
          data: null,
          error: null,
        }).then(onFulfilled);
      },
    };

    return query;
  }

  return {
    state,
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
    },
    from(table: "meal_plan_columns" | "meals") {
      if (table === "meals") {
        return {
          select: vi.fn(() => createSelectQuery(state.meals)),
        };
      }

      return {
        select: vi.fn(() => createSelectQuery(state.columns)),
        insert: vi.fn((value: MemoryPlannerColumnRow) => {
          state.columns.push(value);

          return {
            select() {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({
                data: value,
                error: null,
              });
            },
          };
        }),
        update: vi.fn((patch: Partial<MemoryPlannerColumnRow>) =>
          createMutationQuery({
            run(filters) {
              const row = state.columns.find((candidate) =>
                Object.entries(filters).every(([column, value]) => {
                  return String(candidate[column as keyof MemoryPlannerColumnRow]) === value;
                }));

              if (!row) {
                return null;
              }

              Object.assign(row, patch);
              return row;
            },
          })),
        delete: vi.fn(() =>
          createMutationQuery({
            run(filters) {
              const index = state.columns.findIndex((candidate) =>
                Object.entries(filters).every(([column, value]) => {
                  return String(candidate[column as keyof MemoryPlannerColumnRow]) === value;
                }));

              if (index === -1) {
                return null;
              }

              const [deleted] = state.columns.splice(index, 1);
              return deleted ?? null;
            },
          })),
      };
    },
  };
}

function createColumn(
  id: string,
  name: string,
  sortOrder: number,
  userId = "user-1",
): MemoryPlannerColumnRow {
  return {
    id,
    user_id: userId,
    name,
    sort_order: sortOrder,
    created_at: "2026-05-01T00:00:00.000Z",
  };
}

async function importCollectionRoute() {
  return import("@/app/api/v1/planner/columns/route");
}

async function importMemberRoute() {
  return import("@/app/api/v1/planner/columns/[column_id]/route");
}

function createJsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function routeContext(columnId: string) {
  return {
    params: Promise.resolve({ column_id: columnId }),
  };
}

describe("planner column customization backend", () => {
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

  it("returns 401 when listing columns without authentication", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      from: vi.fn(),
    });

    const { GET } = await importCollectionRoute();
    const response = await GET(new NextRequest("http://localhost:3000/api/v1/planner/columns"));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED" },
    });
  });

  it("lists owned columns in sort order with the standard response envelope", async () => {
    const dbClient = createMemoryPlannerColumnsClient({
      columns: [
        createColumn(COLUMN_IDS.dinner, "저녁", 2),
        createColumn(COLUMN_IDS.breakfast, "아침", 0),
        createColumn(COLUMN_IDS.lunch, "점심", 1),
        createColumn(COLUMN_IDS.other, "타인컬럼", 0, "other-user"),
      ],
    });
    createRouteHandlerClient.mockResolvedValue(dbClient);

    const { GET } = await importCollectionRoute();
    const response = await GET(new NextRequest("http://localhost:3000/api/v1/planner/columns"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        columns: [
          { id: COLUMN_IDS.breakfast, name: "아침", sort_order: 0 },
          { id: COLUMN_IDS.lunch, name: "점심", sort_order: 1 },
          { id: COLUMN_IDS.dinner, name: "저녁", sort_order: 2 },
        ],
      },
      error: null,
    });
  });

  it("creates a trimmed column at the last sort order plus one", async () => {
    const dbClient = createMemoryPlannerColumnsClient({
      columns: [
        createColumn(COLUMN_IDS.breakfast, "아침", 0),
        createColumn(COLUMN_IDS.lunch, "점심", 1),
        createColumn(COLUMN_IDS.dinner, "저녁", 2),
      ],
    });
    createRouteHandlerClient.mockResolvedValue(dbClient);

    const { POST } = await importCollectionRoute();
    const response = await POST(createJsonRequest(
      "http://localhost:3000/api/v1/planner/columns",
      { name: "  간식  " },
    ));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      success: true,
      data: {
        column: {
          name: "간식",
          sort_order: 3,
        },
      },
      error: null,
    });
    expect(dbClient.state.columns.map((column) => column.name)).toContain("간식");
  });

  it("rejects empty and over-length names", async () => {
    const dbClient = createMemoryPlannerColumnsClient({
      columns: [createColumn(COLUMN_IDS.breakfast, "아침", 0)],
    });
    createRouteHandlerClient.mockResolvedValue(dbClient);

    const { POST } = await importCollectionRoute();
    const blankResponse = await POST(createJsonRequest(
      "http://localhost:3000/api/v1/planner/columns",
      { name: "   " },
    ));
    const longResponse = await POST(createJsonRequest(
      "http://localhost:3000/api/v1/planner/columns",
      { name: "가".repeat(31) },
    ));

    expect(blankResponse.status).toBe(422);
    expect((await blankResponse.json()).error.fields).toEqual([
      { field: "name", reason: "required" },
    ]);
    expect(longResponse.status).toBe(422);
    expect((await longResponse.json()).error.fields).toEqual([
      { field: "name", reason: "max_length" },
    ]);
  });

  it("rejects duplicate names after trimming", async () => {
    const dbClient = createMemoryPlannerColumnsClient({
      columns: [
        createColumn(COLUMN_IDS.breakfast, "아침", 0),
        createColumn(COLUMN_IDS.lunch, "점심", 1),
      ],
    });
    createRouteHandlerClient.mockResolvedValue(dbClient);

    const { POST } = await importCollectionRoute();
    const response = await POST(createJsonRequest(
      "http://localhost:3000/api/v1/planner/columns",
      { name: " 점심 " },
    ));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("COLUMN_NAME_DUPLICATE");
  });

  it("rejects creating more than five columns", async () => {
    const dbClient = createMemoryPlannerColumnsClient({
      columns: [
        createColumn(COLUMN_IDS.breakfast, "아침", 0),
        createColumn(COLUMN_IDS.lunch, "점심", 1),
        createColumn(COLUMN_IDS.dinner, "저녁", 2),
        createColumn(COLUMN_IDS.snack, "간식", 3),
        createColumn(COLUMN_IDS.night, "야식", 4),
      ],
    });
    createRouteHandlerClient.mockResolvedValue(dbClient);

    const { POST } = await importCollectionRoute();
    const response = await POST(createJsonRequest(
      "http://localhost:3000/api/v1/planner/columns",
      { name: "브런치" },
    ));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("COLUMN_LIMIT_REACHED");
  });

  it("renames an owned column and rejects duplicate names", async () => {
    const dbClient = createMemoryPlannerColumnsClient({
      columns: [
        createColumn(COLUMN_IDS.breakfast, "아침", 0),
        createColumn(COLUMN_IDS.lunch, "점심", 1),
      ],
    });
    createRouteHandlerClient.mockResolvedValue(dbClient);

    const { PATCH } = await importMemberRoute();
    const duplicateResponse = await PATCH(
      createJsonRequest(`http://localhost:3000/api/v1/planner/columns/${COLUMN_IDS.lunch}`, {
        name: " 아침 ",
      }),
      routeContext(COLUMN_IDS.lunch),
    );
    expect(duplicateResponse.status).toBe(409);
    expect((await duplicateResponse.json()).error.code).toBe("COLUMN_NAME_DUPLICATE");

    const renameResponse = await PATCH(
      createJsonRequest(`http://localhost:3000/api/v1/planner/columns/${COLUMN_IDS.lunch}`, {
        name: " 브런치 ",
      }),
      routeContext(COLUMN_IDS.lunch),
    );
    const body = await renameResponse.json();

    expect(renameResponse.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        column: {
          id: COLUMN_IDS.lunch,
          name: "브런치",
          sort_order: 1,
        },
      },
      error: null,
    });
  });

  it("returns 422 when renaming a column with an invalid name", async () => {
    const dbClient = createMemoryPlannerColumnsClient({
      columns: [
        createColumn(COLUMN_IDS.breakfast, "아침", 0),
      ],
    });
    createRouteHandlerClient.mockResolvedValue(dbClient);

    const { PATCH } = await importMemberRoute();
    const response = await PATCH(
      createJsonRequest(`http://localhost:3000/api/v1/planner/columns/${COLUMN_IDS.breakfast}`, {
        name: "가".repeat(31),
      }),
      routeContext(COLUMN_IDS.breakfast),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.fields).toEqual([{ field: "name", reason: "max_length" }]);
  });

  it("blocks updates to another user's column", async () => {
    const dbClient = createMemoryPlannerColumnsClient({
      columns: [
        createColumn(COLUMN_IDS.other, "타인컬럼", 0, "other-user"),
      ],
    });
    createRouteHandlerClient.mockResolvedValue(dbClient);

    const { PATCH } = await importMemberRoute();
    const response = await PATCH(
      createJsonRequest(`http://localhost:3000/api/v1/planner/columns/${COLUMN_IDS.other}`, {
        name: "브런치",
      }),
      routeContext(COLUMN_IDS.other),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 404 when updating a missing column", async () => {
    const dbClient = createMemoryPlannerColumnsClient({
      columns: [
        createColumn(COLUMN_IDS.breakfast, "아침", 0),
      ],
    });
    createRouteHandlerClient.mockResolvedValue(dbClient);

    const { PATCH } = await importMemberRoute();
    const response = await PATCH(
      createJsonRequest(`http://localhost:3000/api/v1/planner/columns/${COLUMN_IDS.night}`, {
        name: "야식",
      }),
      routeContext(COLUMN_IDS.night),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("RESOURCE_NOT_FOUND");
  });

  it("blocks deleting the last column", async () => {
    const dbClient = createMemoryPlannerColumnsClient({
      columns: [createColumn(COLUMN_IDS.breakfast, "아침", 0)],
    });
    createRouteHandlerClient.mockResolvedValue(dbClient);

    const { DELETE } = await importMemberRoute();
    const response = await DELETE(
      new Request(`http://localhost:3000/api/v1/planner/columns/${COLUMN_IDS.breakfast}`),
      routeContext(COLUMN_IDS.breakfast),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("MIN_COLUMN_REQUIRED");
  });

  it("blocks deleting a column that still has meals", async () => {
    const dbClient = createMemoryPlannerColumnsClient({
      columns: [
        createColumn(COLUMN_IDS.breakfast, "아침", 0),
        createColumn(COLUMN_IDS.lunch, "점심", 1),
      ],
      meals: [
        { id: "meal-1", user_id: "user-1", column_id: COLUMN_IDS.lunch },
      ],
    });
    createRouteHandlerClient.mockResolvedValue(dbClient);

    const { DELETE } = await importMemberRoute();
    const response = await DELETE(
      new Request(`http://localhost:3000/api/v1/planner/columns/${COLUMN_IDS.lunch}`),
      routeContext(COLUMN_IDS.lunch),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("COLUMN_HAS_MEALS");
  });

  it("blocks deleting another user's column", async () => {
    const dbClient = createMemoryPlannerColumnsClient({
      columns: [
        createColumn(COLUMN_IDS.breakfast, "아침", 0),
        createColumn(COLUMN_IDS.other, "타인컬럼", 1, "other-user"),
      ],
    });
    createRouteHandlerClient.mockResolvedValue(dbClient);

    const { DELETE } = await importMemberRoute();
    const response = await DELETE(
      new Request(`http://localhost:3000/api/v1/planner/columns/${COLUMN_IDS.other}`),
      routeContext(COLUMN_IDS.other),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("deletes an empty column and compacts remaining sort order from zero", async () => {
    const dbClient = createMemoryPlannerColumnsClient({
      columns: [
        createColumn(COLUMN_IDS.breakfast, "아침", 0),
        createColumn(COLUMN_IDS.lunch, "점심", 1),
        createColumn(COLUMN_IDS.dinner, "저녁", 2),
      ],
    });
    createRouteHandlerClient.mockResolvedValue(dbClient);

    const { DELETE } = await importMemberRoute();
    const response = await DELETE(
      new Request(`http://localhost:3000/api/v1/planner/columns/${COLUMN_IDS.lunch}`),
      routeContext(COLUMN_IDS.lunch),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { deleted: true },
      error: null,
    });
    expect(dbClient.state.columns.map((column) => ({
      id: column.id,
      sort_order: column.sort_order,
    }))).toEqual([
      { id: COLUMN_IDS.breakfast, sort_order: 0 },
      { id: COLUMN_IDS.dinner, sort_order: 1 },
    ]);
  });
});
