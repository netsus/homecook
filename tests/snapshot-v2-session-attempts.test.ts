import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const readAccountGenerationCapability = vi.fn();
const readVerifiedAccountGenerationSession = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createAccountLifecycleInternalRpcClient: createServiceRoleClient,
  createRemoteCompatibilityServiceRoleClient: createServiceRoleClient,
  createRouteHandlerClient,
  createServiceRoleClient,
}));

vi.mock("@/app/api/v1/users/me/_account-generation", () => ({
  readAccountGenerationCapability,
}));

vi.mock("@/lib/server/account-generation/session-authority", () => ({
  readVerifiedAccountGenerationSession,
}));

const migrationsDir = join(process.cwd(), "supabase/migrations");
const startRoutePath = join(process.cwd(), "app/api/v1/cooking/session-attempts/route.ts");
const cookModeRoutePath = join(
  process.cwd(),
  "app/api/v1/cooking/session-attempts/[id]/cook-mode/route.ts",
);
const cancelRoutePath = join(
  process.cwd(),
  "app/api/v1/cooking/session-attempts/[id]/cancel/route.ts",
);
const legacyRoutePath = join(
  process.cwd(),
  "app/api/v1/cooking/sessions/[session_id]/cook-mode/route.ts",
);

const ownerId = "550e8400-e29b-41d4-a716-446655440201";
const sessionId = "550e8400-e29b-41d4-a716-446655440202";
const recipeId = "550e8400-e29b-41d4-a716-446655440203";
const mealId = "550e8400-e29b-41d4-a716-446655440204";
const idempotencyKey = "550e8400-e29b-41d4-a716-446655440205";
const pantryItemId = "550e8400-e29b-41d4-a716-446655440206";
const ingredientId = "550e8400-e29b-41d4-a716-446655440207";
const productId = "550e8400-e29b-41d4-a716-446655440208";
const productVersionId = "550e8400-e29b-41d4-a716-446655440209";

function readFuturePropagationMigration() {
  const candidates = readdirSync(migrationsDir)
    .filter((name) => name.endsWith("_recipe_content_snapshot_future_propagation.sql"))
    .sort();

  expect(
    candidates.length,
    "recipe content snapshot future propagation migration is missing",
  ).toBeGreaterThan(0);

  return readFileSync(join(migrationsDir, candidates.at(-1)!), "utf8");
}

function requireRoute(path: string, message: string) {
  expect(existsSync(path), message).toBe(true);
}

function context(id = sessionId) {
  return { params: Promise.resolve({ id }) };
}

function startRequest(body: Record<string, unknown>, key: string | null = idempotencyKey) {
  const headers = new Headers({ "content-type": "application/json" });
  if (key !== null) headers.set("Idempotency-Key", key);
  return new Request("http://localhost:3000/api/v1/cooking/session-attempts", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function cancelRequest(key: string | null = idempotencyKey) {
  const headers = new Headers();
  if (key !== null) headers.set("Idempotency-Key", key);
  return new Request(
    `http://localhost:3000/api/v1/cooking/session-attempts/${sessionId}/cancel`,
    { method: "POST", headers },
  );
}

function setupAuthorizedRpc(result: {
  data: Record<string, unknown> | null;
  error: { code?: string; message: string } | null;
}) {
  const rpc = vi.fn(async (name: string) => {
    if (/capability/i.test(name)) {
      return { data: { state: "generation_active", revision: 4 }, error: null };
    }
    return result;
  });
  const from = vi.fn(() => {
    throw new Error("snapshot-v2 routes must use server RPC authority only");
  });
  const routeClient = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: ownerId } } })) },
    from,
    rpc,
  };
  createRouteHandlerClient.mockResolvedValue(routeClient);
  createServiceRoleClient.mockReturnValue({ from, rpc });
  readAccountGenerationCapability.mockResolvedValue({
    ok: true,
    revision: 4,
    state: "generation_active",
  });
  readVerifiedAccountGenerationSession.mockResolvedValue({
    ok: true,
    sessionAuthority: {
      authIdentityCreatedAt: "2026-08-02T00:00:00.000Z",
      hmacKeyVersion: 1,
      ownerUuid: ownerId,
      sessionIssuedAt: "2026-08-02T00:00:00.000Z",
      sessionKeyHash: "a".repeat(64),
    },
  });
  return { from, rpc };
}

function setupUnauthenticated() {
  const rpc = vi.fn(async () => ({ data: null, error: null }));
  const from = vi.fn(() => {
    throw new Error("unauthenticated snapshot-v2 requests must not read privileged tables");
  });
  createRouteHandlerClient.mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
    from,
    rpc,
  });
  createServiceRoleClient.mockReturnValue({ from, rpc });
  return { from, rpc };
}

async function importStartRoute() {
  requireRoute(startRoutePath, "snapshot-v2 start route is missing");
  return import("@/app/api/v1/cooking/session-attempts/route");
}

async function importCookModeRoute() {
  requireRoute(cookModeRoutePath, "snapshot-v2 cook-mode route is missing");
  return import("@/app/api/v1/cooking/session-attempts/[id]/cook-mode/route");
}

async function importCancelRoute() {
  requireRoute(cancelRoutePath, "snapshot-v2 cancel route is missing");
  return import("@/app/api/v1/cooking/session-attempts/[id]/cancel/route");
}

describe("snapshot-v2 session attempts public contract", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    readAccountGenerationCapability.mockReset();
    readVerifiedAccountGenerationSession.mockReset();
  });

  it("returns start success as the exact five-field projection with pinned content_summary", async () => {
    const { from } = setupAuthorizedRpc({
      data: {
        session_id: sessionId,
        contract_version: "snapshot_v2",
        mode: "planner",
        status: "in_progress",
        content_summary: {
          recipe_id: recipeId,
          title: "김치찌개",
          cooking_servings: 4,
          content_snapshot_id: "private",
        },
        owner_uuid: ownerId,
        account_generation: 8,
        claim_ids: ["private"],
        recipe_content_snapshot_id: "private",
      },
      error: null,
    });

    const { POST } = await importStartRoute();
    const response = await POST(startRequest({
      mode: "planner",
      meal_ids: [mealId],
      expected_meal_revisions: { [mealId]: 3 },
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        session_id: sessionId,
        contract_version: "snapshot_v2",
        mode: "planner",
        status: "in_progress",
        content_summary: {
          recipe_id: recipeId,
          title: "김치찌개",
          cooking_servings: 4,
        },
      },
      error: null,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("returns cook-mode from immutable session content with exact eight-field product provenance", async () => {
    const recipe = {
      id: recipeId,
      title: "세션에 고정된 제목",
      cooking_servings: 4,
      ingredients: [{ ingredient_id: ingredientId, standard_name: "두부" }],
      steps: [{ step_number: 1, instruction: "끓인다" }],
    };
    const pantryCandidate = {
      pantry_item_id: pantryItemId,
      ingredient_id: ingredientId,
      item_type: "food_product",
      standard_name: "두부",
      food_product_id: productId,
      food_product_nutrition_version_id: productVersionId,
      name: "국산 부침두부",
      brand: "집밥식품",
    };
    const { from, rpc } = setupAuthorizedRpc({
      data: {
        session_id: sessionId,
        contract_version: "snapshot_v2",
        mode: "planner",
        status: "in_progress",
        recipe,
        pantry_candidates: [
          {
            ...pantryCandidate,
            current_food_product_nutrition_version_id: "must-not-leak",
            is_selected: true,
          },
        ],
        mutable_recipe_revision: 99,
        recipe_content_snapshot_id: "private",
      },
      error: null,
    });

    const { GET } = await importCookModeRoute();
    const response = await GET(
      new Request(
        `http://localhost:3000/api/v1/cooking/session-attempts/${sessionId}/cook-mode`,
      ),
      context(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        session_id: sessionId,
        contract_version: "snapshot_v2",
        mode: "planner",
        status: "in_progress",
        recipe,
        pantry_candidates: [pantryCandidate],
      },
      error: null,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns cancel and replay as the exact stored four-field data without reopening terminal state", async () => {
    const { rpc } = setupAuthorizedRpc({
      data: {
        session_id: sessionId,
        contract_version: "snapshot_v2",
        mode: "planner",
        status: "cancelled",
        released_claim_ids: ["private"],
        cancelled_at: "private",
        replayed: true,
      },
      error: null,
    });

    const { POST } = await importCancelRoute();
    const first = await POST(cancelRequest(), context());
    const replay = await POST(cancelRequest(), context());

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    const expected = {
      success: true,
      data: {
        session_id: sessionId,
        contract_version: "snapshot_v2",
        mode: "planner",
        status: "cancelled",
      },
      error: null,
    };
    await expect(first.json()).resolves.toEqual(expected);
    await expect(replay.json()).resolves.toEqual(expected);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it.each(["start", "read", "cancel"] as const)(
    "rejects unauthenticated snapshot-v2 %s before malformed key/body/id handling or privileged reads",
    async (operation) => {
      const { from, rpc } = setupUnauthenticated();
      createServiceRoleClient.mockClear();
      let response: Response;

      if (operation === "start") {
        const { POST } = await importStartRoute();
        response = await POST(new Request(
          "http://localhost:3000/api/v1/cooking/session-attempts",
          { method: "POST", body: "{" },
        ));
      } else if (operation === "read") {
        const { GET } = await importCookModeRoute();
        response = await GET(
          new Request(
            "http://localhost:3000/api/v1/cooking/session-attempts/not-a-uuid/cook-mode",
          ),
          context("not-a-uuid"),
        );
      } else {
        const { POST } = await importCancelRoute();
        response = await POST(
          new Request(
            "http://localhost:3000/api/v1/cooking/session-attempts/not-a-uuid/cancel",
            { method: "POST" },
          ),
          context("not-a-uuid"),
        );
      }

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        success: false,
        data: null,
        error: {
          code: "UNAUTHORIZED",
          message: expect.any(String),
          fields: [],
        },
      });
      expect(createServiceRoleClient).not.toHaveBeenCalled();
      expect(readVerifiedAccountGenerationSession).not.toHaveBeenCalled();
      expect(from).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it.each([
    [null, 428, "IDEMPOTENCY_KEY_REQUIRED"],
    ["not-a-uuid", 400, "INVALID_IDEMPOTENCY_KEY"],
  ] as const)("rejects start idempotency key %s before any session or claim RPC", async (key, status, code) => {
    const { rpc } = setupAuthorizedRpc({
      data: {
        session_id: sessionId,
        contract_version: "snapshot_v2",
        mode: "planner",
        status: "in_progress",
        content_summary: { recipe_id: recipeId, title: "김치찌개", cooking_servings: 2 },
      },
      error: null,
    });

    const { POST } = await importStartRoute();
    const response = await POST(startRequest({
      mode: "planner",
      meal_ids: [mealId],
      expected_meal_revisions: { [mealId]: 3 },
    }, key));

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({
      success: false,
      data: null,
      error: { code, fields: [{ field: "Idempotency-Key" }] },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps capability-off start mutation-free with exact SNAPSHOT_V2_CREATION_DISABLED", async () => {
    const { from, rpc } = setupAuthorizedRpc({
      data: null,
      error: { code: "P0001", message: "SNAPSHOT_V2_CREATION_DISABLED" },
    });

    const { POST } = await importStartRoute();
    const response = await POST(startRequest({
      mode: "planner",
      meal_ids: [mealId],
      expected_meal_revisions: { [mealId]: 3 },
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      success: false,
      data: null,
      error: {
        code: "SNAPSHOT_V2_CREATION_DISABLED",
        message: expect.any(String),
        fields: [],
      },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    {
      mode: "planner",
      meal_ids: [mealId],
      expected_meal_revisions: { [mealId]: 3 },
      recipe_id: recipeId,
    },
    {
      mode: "standalone",
      recipe_id: recipeId,
      expected_recipe_revision: 12,
      cooking_servings: 2,
      meal_ids: [mealId],
    },
  ])("rejects mixed planner/standalone parser bodies before RPC: $mode", async (body) => {
    const { rpc } = setupAuthorizedRpc({ data: null, error: null });

    const { POST } = await importStartRoute();
    const response = await POST(startRequest(body));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      success: false,
      data: null,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps legacy-v1 and snapshot-v2 namespaces, parsers, and readers isolated", () => {
    const sql = readFuturePropagationMigration();
    const legacyRoute = readFileSync(legacyRoutePath, "utf8");

    expect(sql).toContain("legacy_v1");
    expect(sql).toContain("snapshot_v2");
    expect(sql).toMatch(/session_kind[\s\S]*(check|constraint)[\s\S]*legacy_v1[\s\S]*snapshot_v2/i);
    expect(legacyRoute).not.toContain("session-attempts");
    expect(legacyRoute).not.toMatch(/body[\s\S]*(infer|guess)[\s\S]*contract_version/i);
  });
});
