import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();
const recalculateRecipeNutritionSnapshot = vi.fn();
const readAccountGenerationCapability = vi.fn();
const readVerifiedAccountGenerationSession = vi.fn();
const recordUserGrowthActivityEvent = vi.fn();
const formatBootstrapErrorMessage = vi.fn((error: unknown, fallbackMessage: string) => {
  if (error instanceof Error) {
    return `formatted: ${error.message}`;
  }

  return fallbackMessage;
});

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
}));

vi.mock("@/lib/server/recipe-nutrition-service", () => ({
  recalculateRecipeNutritionSnapshot,
}));

vi.mock("@/app/api/v1/users/me/_account-generation", () => ({
  readAccountGenerationCapability,
}));

vi.mock("@/lib/server/account-generation/session-authority", () => ({
  readVerifiedAccountGenerationSession,
}));

vi.mock("@/lib/server/admin-events", () => ({
  recordOperationalEventFromServiceRole: vi.fn(),
}));

vi.mock("@/lib/server/user-growth-activity", () => ({
  recordUserGrowthActivityEvent,
}));

interface QueryResult<T> {
  data: T;
  error: { message: string } | null;
}

function createAwaitableQuery<T>(result: QueryResult<T>) {
  return {
    then(onFulfilled?: (value: QueryResult<T>) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
}

function createLookupTable(rows: Array<{ id: string; label?: string }>) {
  const query = {
    in: vi.fn(() => query),
    then: createAwaitableQuery({
      data: rows,
      error: null,
    }).then,
  };

  return {
    select: vi.fn(() => query),
  };
}

function buildValidBody() {
  return {
    title: "개인 수정용 수동 레시피",
    base_servings: 2,
    ingredients: [
      {
        ingredient_id: "550e8400-e29b-41d4-a716-446655440201",
        standard_name: "양파",
        amount: 1,
        unit: "개",
        ingredient_type: "QUANT",
        display_text: "양파 1개",
        scalable: true,
        sort_order: 0,
      },
    ],
    steps: [
      {
        step_number: 1,
        instruction: "볶아주세요.",
        cooking_method_id: "550e8400-e29b-41d4-a716-446655440301",
        ingredients_used: [],
        heat_level: "medium",
        duration_seconds: 60,
        duration_text: "1분",
      },
    ],
  };
}

async function importRecipesRoute() {
  return import("@/app/api/v1/recipes/route");
}

describe("personal recipe editor endpoint contract boundaries", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    recalculateRecipeNutritionSnapshot.mockReset();
    readAccountGenerationCapability.mockReset();
    readVerifiedAccountGenerationSession.mockReset();
    recordUserGrowthActivityEvent.mockReset();
    formatBootstrapErrorMessage.mockClear();

    ensurePublicUserRow.mockResolvedValue({});
    ensureUserBootstrapState.mockResolvedValue(undefined);
    recalculateRecipeNutritionSnapshot.mockResolvedValue({
      snapshot_id: "snapshot-1",
      created: true,
      is_current: true,
    });
    readAccountGenerationCapability.mockResolvedValue({
      ok: true,
      revision: 3,
      state: "legacy",
    });
    readVerifiedAccountGenerationSession.mockResolvedValue({
      ok: true,
      sessionAuthority: {
        authIdentityCreatedAt: "2026-07-30T00:00:00.000Z",
        hmacKeyVersion: 1,
        ownerUuid: "user-1",
        sessionIssuedAt: "2026-07-30T00:00:00.000Z",
        sessionKeyHash: "a".repeat(64),
      },
    });
    recordUserGrowthActivityEvent.mockResolvedValue({
      recorded: true,
      duplicate: false,
      error: null,
    });
  });

  it("ignores client-supplied owner, visibility, and origin fields when POST /recipes builds the official payload", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        id: "recipe-private-1",
        title: "개인 수정용 수동 레시피",
        source_type: "manual",
        created_by: "user-1",
        base_servings: 2,
        visibility: "private",
      },
      error: null,
    }));

    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      },
      rpc,
      from: vi.fn((table: string) => {
        if (table === "ingredients") {
          return createLookupTable([
            { id: "550e8400-e29b-41d4-a716-446655440201" },
          ]);
        }
        if (table === "cooking_methods") {
          return createLookupTable([
            { id: "550e8400-e29b-41d4-a716-446655440301", label: "볶기" },
          ]);
        }
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { POST } = await importRecipesRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...buildValidBody(),
        visibility: "public",
        created_by: "user-2",
        origin_recipe_id: "550e8400-e29b-41d4-a716-446655440999",
      }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      success: true,
      data: {
        id: "recipe-private-1",
        title: "개인 수정용 수동 레시피",
        source_type: "manual",
        created_by: "user-1",
        base_servings: 2,
      },
      error: null,
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "create_manual_recipe",
      expect.objectContaining({
        p_user_id: "user-1",
        p_title: "개인 수정용 수동 레시피",
        p_base_servings: 2,
      }),
    );

    const firstCall = rpc.mock.calls[0] as unknown as
      [string, Record<string, unknown>] |
      undefined;
    expect(firstCall).toBeDefined();
    const payload = firstCall?.[1] ?? {};
    expect(payload).not.toHaveProperty("p_visibility");
    expect(payload).not.toHaveProperty("p_created_by");
    expect(payload).not.toHaveProperty("p_origin_recipe_id");
  });

  it("keeps parser and RPC payload builders on the official create fields only", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("app/api/v1/recipes/route.ts", "utf8");

    const parseSection = source.slice(
      source.indexOf("function parseManualRecipeCreateBody"),
      source.indexOf("function toManualRecipeCreateData"),
    );
    const payloadSection = source.slice(
      source.indexOf("function buildManualRecipeRpcPayload"),
      source.indexOf("async function requireUser"),
    );

    expect(parseSection).not.toContain("rawBody.visibility");
    expect(parseSection).not.toContain("rawBody.created_by");
    expect(parseSection).not.toContain("rawBody.origin_recipe_id");
    expect(payloadSection).toContain("p_title");
    expect(payloadSection).toContain("p_base_servings");
    expect(payloadSection).toContain("p_ingredients");
    expect(payloadSection).toContain("p_steps");
    expect(payloadSection).not.toContain("origin_recipe_id");
    expect(payloadSection).not.toContain("visibility");
    expect(payloadSection).not.toContain("created_by");
  });
});
