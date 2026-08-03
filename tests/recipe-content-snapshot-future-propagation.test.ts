import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const readAccountGenerationCapability = vi.fn();
const readVerifiedAccountGenerationSession = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createAccountLifecycleInternalRpcClient: createServiceRoleClient,
  createRecipeFuturePropagationInternalClient: createServiceRoleClient,
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
const previewRoutePath = join(
  process.cwd(),
  "app/api/v1/recipes/[id]/future-plan-impact/route.ts",
);
const recipeRoutePath = join(process.cwd(), "app/api/v1/recipes/[id]/route.ts");
const recipeId = "550e8400-e29b-41d4-a716-446655440101";
const idempotencyKey = "550e8400-e29b-41d4-a716-446655440102";
const deletedAt = "2026-08-02T13:00:00.000Z";

const draft = {
  title: "미래 계획용 김치찌개",
  base_servings: 2,
  ingredients: [],
  steps: [],
};

function readFuturePropagationMigration() {
  const candidates = readdirSync(migrationsDir)
    .filter((name) => name.endsWith("_recipe_content_snapshot_future_propagation.sql"))
    .sort();

  expect(
    candidates.length,
    "recipe content snapshot future propagation migration is missing",
  ).toBeGreaterThan(0);

  return candidates
    .map((name) => readFileSync(join(migrationsDir, name), "utf8"))
    .join("\n\n");
}

function requireRoute(path: string, message: string) {
  expect(existsSync(path), message).toBe(true);
}

function context(id = recipeId) {
  return { params: Promise.resolve({ id }) };
}

function previewRequest(body: unknown = { base_recipe_revision: 12, draft }) {
  return new Request(
    `http://localhost:3000/api/v1/recipes/${recipeId}/future-plan-impact`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function patchRequest(body: Record<string, unknown> = {}) {
  return new Request(`http://localhost:3000/api/v1/recipes/${recipeId}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify({
      base_recipe_revision: 12,
      draft,
      future_plan_strategy: "replace_all",
      impact_token: "opaque-impact-token",
      ...body,
    }),
  });
}

function deleteRequest(key: string | null = idempotencyKey) {
  const headers = new Headers();
  if (key !== null) headers.set("Idempotency-Key", key);
  return new Request(`http://localhost:3000/api/v1/recipes/${recipeId}`, {
    method: "DELETE",
    headers,
  });
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
    throw new Error("future propagation routes must not authorize or mutate via REST tables");
  });
  const routeClient = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: recipeId } } })),
    },
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
      ownerUuid: recipeId,
      sessionIssuedAt: "2026-08-02T00:00:00.000Z",
      sessionKeyHash: "a".repeat(64),
    },
  });

  return { from, rpc };
}

async function importPreviewRoute() {
  requireRoute(previewRoutePath, "future impact preview route is missing");
  return import("@/app/api/v1/recipes/[id]/future-plan-impact/route");
}

async function importRecipeRoute() {
  requireRoute(recipeRoutePath, "recipe detail route is missing");
  return import("@/app/api/v1/recipes/[id]/route");
}

describe("recipe content snapshot future propagation public contract", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    readAccountGenerationCapability.mockReset();
    readVerifiedAccountGenerationSession.mockReset();
  });

  it("returns only the exact public impact preview fields and never exposes server authority", async () => {
    const proposedContentHash = "b".repeat(64);
    const { from, rpc } = setupAuthorizedRpc({
      data: {
        impact_token: "opaque-impact-token",
        expires_at: "2026-08-02T13:05:00.000Z",
        proposed_content_hash: proposedContentHash,
        future_meal_count: 3,
        date_range: { from: "2026-08-03", to: "2026-08-08" },
        incomplete_shopping_list_count: 1,
        completed_shopping_list_count: 2,
        active_cooking_claim_count: 0,
        replace_all_allowed: true,
        owner_uuid: recipeId,
        account_generation: 7,
        session_key_hash: "secret",
        token_hash: "secret",
        target_set_revision_hash: "secret",
        claim_session_tuple: ["secret"],
      },
      error: null,
    });

    const { POST } = await importPreviewRoute();
    const response = await POST(previewRequest(), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        impact_token: "opaque-impact-token",
        expires_at: "2026-08-02T13:05:00.000Z",
        proposed_content_hash: proposedContentHash,
        future_meal_count: 3,
        date_range: { from: "2026-08-03", to: "2026-08-08" },
        incomplete_shopping_list_count: 1,
        completed_shopping_list_count: 2,
        active_cooking_claim_count: 0,
        replace_all_allowed: true,
      },
      error: null,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      expect.stringMatching(/preview|future.*impact/i),
      expect.objectContaining({
        p_base_recipe_revision: 12,
        p_draft: draft,
        p_recipe_id: recipeId,
      }),
    );
    expect(from).not.toHaveBeenCalled();
  });

  it("returns PATCH success as exactly {id,revision} even when the durable RPC stores internal evidence", async () => {
    const { from } = setupAuthorizedRpc({
      data: {
        id: recipeId,
        revision: 13,
        content_snapshot_id: "550e8400-e29b-41d4-a716-446655440103",
        recipe_nutrition_snapshot_id: "550e8400-e29b-41d4-a716-446655440104",
        account_generation: 7,
        target_meal_ids: ["550e8400-e29b-41d4-a716-446655440105"],
        reconcile_result: { changed: true },
      },
      error: null,
    });

    const { PATCH } = await importRecipeRoute();
    expect(PATCH, "PATCH /recipes/{id} is missing").toBeTypeOf("function");
    const response = await PATCH(patchRequest(), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { id: recipeId, revision: 13 },
      error: null,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("returns DELETE and same-key replay as the first exact id/revision/deleted_at projection", async () => {
    const durable = {
      id: recipeId,
      revision: 14,
      deleted_at: deletedAt,
      account_generation: 7,
      replayed: false,
    };
    const { rpc } = setupAuthorizedRpc({ data: durable, error: null });

    const { DELETE } = await importRecipeRoute();
    expect(DELETE, "DELETE /recipes/{id} is missing").toBeTypeOf("function");
    const first = await DELETE(deleteRequest(), context());
    const replay = await DELETE(deleteRequest(), context());

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    await expect(first.json()).resolves.toEqual({
      success: true,
      data: { id: recipeId, revision: 14, deleted_at: deletedAt },
      error: null,
    });
    await expect(replay.json()).resolves.toEqual({
      success: true,
      data: { id: recipeId, revision: 14, deleted_at: deletedAt },
      error: null,
    });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("pins the requested exact product/version pair in the nutrition predecessor guard", async () => {
    const ingredientId = "550e8400-e29b-41d4-a716-446655440106";
    const productId = "550e8400-e29b-41d4-a716-446655440107";
    const selectedVersionId = "550e8400-e29b-41d4-a716-446655440108";
    const query = {
      select: vi.fn(() => query),
      in: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn(() => query),
      range: vi.fn(async () => ({ data: [], error: null })),
    };
    const client = { from: vi.fn(() => query) };
    const { calculateRecipeDraftNutrition } = await import(
      "@/lib/server/recipe-content-snapshot-future-propagation"
    );

    const result = await calculateRecipeDraftNutrition(client, {
      recipeId,
      baseRecipeRevision: 12,
      draft: {
        title: "선택 버전 고정",
        base_servings: 2,
        ingredients: [{
          ingredient_id: ingredientId,
          amount: 100,
          unit: "g",
          ingredient_type: "QUANT",
          scalable: true,
          food_product_id: productId,
          food_product_nutrition_version_id: selectedVersionId,
        }],
        steps: [],
      },
    });

    expect(result.predecessorGuard.recipe_ingredients).toEqual([
      expect.objectContaining({
        ingredient_id: ingredientId,
        food_product_id: productId,
        food_product_nutrition_version_id: selectedVersionId,
      }),
    ]);
    expect(result.predecessorGuard.recipe_ingredients[0]).not.toMatchObject({
      food_product_id: null,
      food_product_nutrition_version_id: null,
    });
  });

  it("keeps preview and PATCH on one shared canonicalizer and one-RPC final authority", () => {
    const sql = readFuturePropagationMigration();
    const canonicalizerCalls = sql.match(/canonicaliz[a-z_]*recipe[a-z_]*draft/gi) ?? [];

    expect(
      new Set(canonicalizerCalls.map((value) => value.toLowerCase())).size,
      "preview and PATCH must name one shared recipe-draft canonicalizer",
    ).toBe(1);
    expect(canonicalizerCalls.length).toBeGreaterThanOrEqual(2);
    expect(sql).toMatch(/create\s+or\s+replace\s+function[\s\S]*future[\s\S]*impact/i);
    expect(sql).toMatch(/create\s+or\s+replace\s+function[\s\S]*patch|update[\s\S]*recipe/i);
  });
});
