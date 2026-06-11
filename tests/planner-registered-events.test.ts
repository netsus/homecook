import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();
const awardUserProgressEvent = vi.fn();
const recordUserGrowthActivityEvent = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage: (_error: unknown, fallbackMessage: string) => fallbackMessage,
}));

vi.mock("@/lib/server/user-progress", () => ({
  awardUserProgressEvent,
}));

vi.mock("@/lib/server/user-growth-activity", () => ({
  buildMealAddPathSourceKey: (userId: string, path: string) => `meal_add_path:${userId}:${path}`,
  MEAL_ADD_PATHS: new Set(["search", "recipebook", "pantry", "leftover", "youtube", "manual"]),
  recordUserGrowthActivityEvent,
}));

vi.mock("@/lib/mock/recipes", () => ({
  MOCK_RECIPE_ID: "mock-kimchi-jjigae",
  createQaFixtureMeal: vi.fn(),
  getQaFixtureMealsBySlot: vi.fn(),
  isQaFixtureModeEnabled: () => false,
}));

function createAwaitableQuery<T>(result: { data: T; error: null }) {
  return {
    then(onFulfilled?: (value: { data: T; error: null }) => unknown) {
      return Promise.resolve(result).then(onFulfilled);
    },
  };
}

function createSelectMaybeSingleQuery<T>(result: { data: T; error: null }) {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(() => createAwaitableQuery(result)),
  };

  return query;
}

async function importRoute() {
  return import("@/app/api/v1/meals/route");
}

describe("planner registered progress source", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    ensurePublicUserRow.mockReset().mockResolvedValue({});
    ensureUserBootstrapState.mockReset().mockResolvedValue(undefined);
    awardUserProgressEvent.mockReset().mockResolvedValue({ awarded: true, error: null });
    recordUserGrowthActivityEvent.mockReset().mockResolvedValue({ recorded: true, duplicate: false, error: null });
  });

  it("awards planner_registered XP after a meal insert succeeds", async () => {
    const recipesTable = { select: vi.fn(() => createSelectMaybeSingleQuery({ data: { id: "recipe-1" }, error: null })) };
    const columnsTable = {
      select: vi.fn(() =>
        createSelectMaybeSingleQuery({
          data: { id: "column-1", user_id: "user-1", name: "아침" },
          error: null,
        }),
      ),
    };
    const mealsTable = {
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          maybeSingle: vi.fn(() =>
            createAwaitableQuery({
              data: {
                id: "550e8400-e29b-41d4-a716-446655440901",
                recipe_id: "550e8400-e29b-41d4-a716-446655440031",
                plan_date: "2026-06-10",
                column_id: "550e8400-e29b-41d4-a716-446655440032",
                planned_servings: 2,
                status: "registered",
                is_leftover: false,
                leftover_dish_id: null,
              },
              error: null,
            }),
          ),
        })),
      })),
    };
    const dbClient = {
      from: vi.fn((table: string) => {
        if (table === "recipes") return recipesTable;
        if (table === "meal_plan_columns") return columnsTable;
        if (table === "meals") return mealsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    };
    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from: dbClient.from,
    });
    createServiceRoleClient.mockReturnValue(dbClient);

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost/api/v1/meals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipe_id: "550e8400-e29b-41d4-a716-446655440031",
        plan_date: "2026-06-10",
        column_id: "550e8400-e29b-41d4-a716-446655440032",
        planned_servings: 2,
      }),
    }));

    expect(response.status).toBe(201);
    expect(awardUserProgressEvent).toHaveBeenCalledWith(dbClient, {
      userId: "user-1",
      eventType: "planner_registered",
      sourceTable: "meals",
      sourceId: "550e8400-e29b-41d4-a716-446655440901",
      occurredAt: expect.any(String),
    });
  });

  it("records a distinct planner add path when source_path is known", async () => {
    const recipesTable = { select: vi.fn(() => createSelectMaybeSingleQuery({ data: { id: "recipe-1" }, error: null })) };
    const columnsTable = {
      select: vi.fn(() =>
        createSelectMaybeSingleQuery({
          data: { id: "column-1", user_id: "user-1", name: "아침" },
          error: null,
        }),
      ),
    };
    const mealsTable = {
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          maybeSingle: vi.fn(() =>
            createAwaitableQuery({
              data: {
                id: "550e8400-e29b-41d4-a716-446655440902",
                recipe_id: "550e8400-e29b-41d4-a716-446655440031",
                plan_date: "2026-06-10",
                column_id: "550e8400-e29b-41d4-a716-446655440032",
                planned_servings: 2,
                status: "registered",
                is_leftover: false,
                leftover_dish_id: null,
              },
              error: null,
            }),
          ),
        })),
      })),
    };
    const dbClient = {
      from: vi.fn((table: string) => {
        if (table === "recipes") return recipesTable;
        if (table === "meal_plan_columns") return columnsTable;
        if (table === "meals") return mealsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    };
    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from: dbClient.from,
    });
    createServiceRoleClient.mockReturnValue(dbClient);

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost/api/v1/meals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipe_id: "550e8400-e29b-41d4-a716-446655440031",
        plan_date: "2026-06-10",
        column_id: "550e8400-e29b-41d4-a716-446655440032",
        planned_servings: 2,
        source_path: "recipebook",
      }),
    }));

    expect(response.status).toBe(201);
    expect(recordUserGrowthActivityEvent).toHaveBeenCalledWith(dbClient, {
      userId: "user-1",
      activityType: "meal_add_path_used",
      category: "planner",
      sourceKey: "meal_add_path:user-1:recipebook",
      sourceTable: "meals",
      sourceId: "550e8400-e29b-41d4-a716-446655440902",
      sourceMeta: { source_path: "recipebook" },
      occurredAt: expect.any(String),
    });
  });

  it("keeps meal creation successful when planner add path activity recording fails", async () => {
    recordUserGrowthActivityEvent.mockRejectedValue(new Error("activity unavailable"));

    const recipesTable = { select: vi.fn(() => createSelectMaybeSingleQuery({ data: { id: "recipe-1" }, error: null })) };
    const columnsTable = {
      select: vi.fn(() =>
        createSelectMaybeSingleQuery({
          data: { id: "column-1", user_id: "user-1", name: "아침" },
          error: null,
        }),
      ),
    };
    const mealsTable = {
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          maybeSingle: vi.fn(() =>
            createAwaitableQuery({
              data: {
                id: "550e8400-e29b-41d4-a716-446655440903",
                recipe_id: "550e8400-e29b-41d4-a716-446655440031",
                plan_date: "2026-06-10",
                column_id: "550e8400-e29b-41d4-a716-446655440032",
                planned_servings: 2,
                status: "registered",
                is_leftover: false,
                leftover_dish_id: null,
              },
              error: null,
            }),
          ),
        })),
      })),
    };
    const dbClient = {
      from: vi.fn((table: string) => {
        if (table === "recipes") return recipesTable;
        if (table === "meal_plan_columns") return columnsTable;
        if (table === "meals") return mealsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    };
    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })) },
      from: dbClient.from,
    });
    createServiceRoleClient.mockReturnValue(dbClient);

    const { POST } = await importRoute();
    const response = await POST(new Request("http://localhost/api/v1/meals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipe_id: "550e8400-e29b-41d4-a716-446655440031",
        plan_date: "2026-06-10",
        column_id: "550e8400-e29b-41d4-a716-446655440032",
        planned_servings: 2,
        source_path: "recipebook",
      }),
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ success: true });
    expect(recordUserGrowthActivityEvent).toHaveBeenCalled();
  });
});
