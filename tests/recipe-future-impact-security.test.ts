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
const ownerId = "550e8400-e29b-41d4-a716-446655440301";
const recipeId = "550e8400-e29b-41d4-a716-446655440302";
const key = "550e8400-e29b-41d4-a716-446655440303";
const draft = { title: "권한 테스트", base_servings: 2, ingredients: [], steps: [] };

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

function context() {
  return { params: Promise.resolve({ id: recipeId }) };
}

function previewRequest() {
  return new Request(
    `http://localhost:3000/api/v1/recipes/${recipeId}/future-plan-impact`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ base_recipe_revision: 12, draft }),
    },
  );
}

function patchRequest({
  idempotencyKey = key,
  strategy = "replace_all",
  body = {},
}: {
  idempotencyKey?: string | null;
  strategy?: string;
  body?: Record<string, unknown>;
} = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (idempotencyKey !== null) headers.set("Idempotency-Key", idempotencyKey);
  return new Request(`http://localhost:3000/api/v1/recipes/${recipeId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      base_recipe_revision: 12,
      draft,
      future_plan_strategy: strategy,
      impact_token: "opaque-token",
      ...body,
    }),
  });
}

function setupUser(
  rpcResult: { data: Record<string, unknown> | null; error: { code?: string; message: string } | null },
  user: { id: string } | null = { id: ownerId },
) {
  const rpc = vi.fn(async (name: string) => {
    if (/capability/i.test(name)) {
      return { data: { state: "generation_active", revision: 4 }, error: null };
    }
    return rpcResult;
  });
  const from = vi.fn(() => {
    throw new Error("direct table access is forbidden for future propagation routes");
  });
  createRouteHandlerClient.mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
    from,
    rpc,
  });
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

async function importPreviewRoute() {
  requireRoute(previewRoutePath, "future impact preview route is missing");
  return import("@/app/api/v1/recipes/[id]/future-plan-impact/route");
}

async function importRecipeRoute() {
  requireRoute(recipeRoutePath, "recipe detail route is missing");
  return import("@/app/api/v1/recipes/[id]/route");
}

function expectPublicError(body: unknown, code: string) {
  expect(body).toEqual({
    success: false,
    data: null,
    error: { code, message: expect.any(String), fields: [] },
  });
}

describe("recipe future impact security", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    readAccountGenerationCapability.mockReset();
    readVerifiedAccountGenerationSession.mockReset();
  });

  it("rejects unauthenticated preview before malformed body parsing or privileged reads", async () => {
    const { from, rpc } = setupUser({ data: null, error: null }, null);
    createServiceRoleClient.mockClear();

    const { POST } = await importPreviewRoute();
    const response = await POST(new Request(
      `http://localhost:3000/api/v1/recipes/${recipeId}/future-plan-impact`,
      { method: "POST", body: "{" },
    ), context());

    expect(response.status).toBe(401);
    expectPublicError(await response.json(), "UNAUTHORIZED");
    expect(createServiceRoleClient).not.toHaveBeenCalled();
    expect(readVerifiedAccountGenerationSession).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each(["PATCH", "DELETE"] as const)(
    "rejects unauthenticated %s before malformed key/body validation and all privileged reads",
    async (method) => {
      const { from, rpc } = setupUser({ data: null, error: null }, null);
      createServiceRoleClient.mockClear();
      const request = new Request(
        `http://localhost:3000/api/v1/recipes/${recipeId}`,
        method === "PATCH"
          ? {
              method,
              headers: { "content-type": "application/json" },
              body: "{",
            }
          : { method },
      );

      const route = await importRecipeRoute();
      const response = method === "PATCH"
        ? await route.PATCH(request, context())
        : await route.DELETE(request, context());

      expect(response.status).toBe(401);
      expectPublicError(await response.json(), "UNAUTHORIZED");
      expect(createServiceRoleClient).not.toHaveBeenCalled();
      expect(readVerifiedAccountGenerationSession).not.toHaveBeenCalled();
      expect(from).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("fails trusted nutrition predecessor read errors closed as server errors, not draft 422", async () => {
    const { from, rpc } = setupUser({
      data: { id: recipeId, revision: 13 },
      error: null,
    });
    const ingredientId = "550e8400-e29b-41d4-a716-446655440304";

    const { PATCH } = await importRecipeRoute();
    const failed = await PATCH(patchRequest({
      body: {
        draft: {
          title: "영양 predecessor 조회 실패",
          base_servings: 2,
          ingredients: [{
            ingredient_id: ingredientId,
            amount: 100,
            unit: "g",
            ingredient_type: "QUANT",
            scalable: true,
          }],
          steps: [],
        },
      },
    }), context());

    expect(failed.status).toBe(500);
    expectPublicError(await failed.json(), "INTERNAL_ERROR");
    expect(readVerifiedAccountGenerationSession).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps missing and other-owner preview results to the same non-disclosing 404 wrapper", async () => {
    const { rpc } = setupUser({
      data: null,
      error: { code: "P0001", message: "RESOURCE_NOT_FOUND" },
    });

    const { POST } = await importPreviewRoute();
    const missing = await POST(previewRequest(), context());
    const otherOwner = await POST(previewRequest(), context());

    expect(missing.status).toBe(404);
    expect(otherOwner.status).toBe(404);
    expectPublicError(await missing.json(), "RESOURCE_NOT_FOUND");
    expectPublicError(await otherOwner.json(), "RESOURCE_NOT_FOUND");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["RECIPE_IMPACT_STALE", 409],
    ["MEAL_COOKING_ALREADY_STARTED", 409],
    ["ACCOUNT_SESSION_STALE", 409],
    ["ACCOUNT_GENERATION_STALE", 409],
    ["ACCOUNT_LIFECYCLE_MAINTENANCE", 503],
  ] as const)("maps DB authority failure %s to its exact public status/code", async (code, status) => {
    setupUser({ data: null, error: { code: "P0001", message: code } });

    const { PATCH } = await importRecipeRoute();
    expect(PATCH, "PATCH /recipes/{id} is missing").toBeTypeOf("function");
    const response = await PATCH(patchRequest(), context());

    expect(response.status).toBe(status);
    expectPublicError(await response.json(), code);
  });

  it.each([
    [null, 428, "IDEMPOTENCY_KEY_REQUIRED"],
    ["not-a-uuid", 400, "INVALID_IDEMPOTENCY_KEY"],
  ] as const)("rejects PATCH idempotency key %s before invoking its writer", async (idempotencyKey, status, code) => {
    const { rpc } = setupUser({ data: { id: recipeId, revision: 13 }, error: null });

    const { PATCH } = await importRecipeRoute();
    expect(PATCH, "PATCH /recipes/{id} is missing").toBeTypeOf("function");
    const response = await PATCH(patchRequest({ idempotencyKey }), context());

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({
      success: false,
      data: null,
      error: { code, fields: [{ field: "Idempotency-Key" }] },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("replays same key+canonical payload and rejects key reuse with a different payload without a second success", async () => {
    let mutationCount = 0;
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (/capability/i.test(name)) {
        return { data: { state: "generation_active", revision: 4 }, error: null };
      }
      if (args.p_future_plan_strategy === "keep") {
        return { data: null, error: { code: "P0001", message: "IDEMPOTENCY_KEY_REUSED" } };
      }
      mutationCount += mutationCount === 0 ? 1 : 0;
      return { data: { id: recipeId, revision: 13 }, error: null };
    });
    setupUser({ data: null, error: null });
    createServiceRoleClient.mockReturnValue({ rpc });
    createRouteHandlerClient.mockResolvedValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: ownerId } } })) },
      rpc,
    });

    const { PATCH } = await importRecipeRoute();
    expect(PATCH, "PATCH /recipes/{id} is missing").toBeTypeOf("function");
    const first = await PATCH(patchRequest(), context());
    const replay = await PATCH(patchRequest(), context());
    const reused = await PATCH(patchRequest({ strategy: "keep" }), context());

    expect(await first.json()).toEqual({
      success: true,
      data: { id: recipeId, revision: 13 },
      error: null,
    });
    expect(await replay.json()).toEqual({
      success: true,
      data: { id: recipeId, revision: 13 },
      error: null,
    });
    expect(reused.status).toBe(409);
    expectPublicError(await reused.json(), "IDEMPOTENCY_KEY_REUSED");
    expect(mutationCount).toBe(1);
  });

  it("locks preview ACL/RLS and all final writers behind SECURITY DEFINER service-role routines", () => {
    const sql = readFuturePropagationMigration();

    expect(sql).toMatch(/alter\s+table\s+(public\.)?recipe_change_previews\s+enable\s+row\s+level\s+security/i);
    expect(sql).toMatch(/revoke[\s\S]*(insert|update|delete)[\s\S]*recipe_change_previews[\s\S]*(anon|authenticated)/i);
    expect(sql).toMatch(/security\s+definer/gi);
    expect(sql).toMatch(/set\s+search_path\s*=\s*pg_catalog\s*,\s*public\s*,\s*private/i);
    expect(sql).toMatch(/revoke\s+all\s+on\s+function[\s\S]*from\s+public\s*,\s*anon\s*,\s*authenticated/i);
    expect(sql).toMatch(/grant\s+execute\s+on\s+function[\s\S]*to\s+service_role/i);
  });
});
