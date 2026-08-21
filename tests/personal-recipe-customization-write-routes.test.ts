import { beforeEach, describe, expect, it, vi } from "vitest";

import { fail } from "@/lib/api/response";

const createRouteHandlerClient = vi.fn();
const createRecipeFuturePropagationInternalClient = vi.fn();
const readVerifiedAccountGenerationSession = vi.fn();
const readAccountGenerationCapability = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();
const formatBootstrapErrorMessage = vi.fn((_error: unknown, fallbackMessage: string) => fallbackMessage);
const recordUserGrowthActivityEvent = vi.fn();
const calculateRecipeDraftNutrition = vi.fn();
const callFuturePropagationRpc = vi.fn();
const recalculateRecipeNutritionSnapshot = vi.fn();
const recordOperationalEventFromServiceRole = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRecipeFuturePropagationInternalClient,
  createRemoteCompatibilityServiceRoleClient: vi.fn(),
  createRouteHandlerClient,
}));

vi.mock("@/lib/server/account-generation/session-authority", () => ({
  readVerifiedAccountGenerationSession,
}));

vi.mock("@/app/api/v1/users/me/_account-generation", () => ({
  readAccountGenerationCapability,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
}));

vi.mock("@/lib/server/user-growth-activity", () => ({
  recordUserGrowthActivityEvent,
}));

vi.mock("@/lib/server/recipe-nutrition-service", () => ({
  recalculateRecipeNutritionSnapshot,
}));

vi.mock("@/lib/server/admin-events", () => ({
  recordOperationalEventFromServiceRole,
}));

vi.mock(
  "@/lib/server/recipe-content-snapshot-future-propagation",
  async (importOriginal) => {
    const actual = await importOriginal<
      typeof import("@/lib/server/recipe-content-snapshot-future-propagation")
    >();

    return {
      ...actual,
      calculateRecipeDraftNutrition,
      callFuturePropagationRpc,
    };
  },
);

const user = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  created_at: "2026-08-01T00:00:00.000Z",
};

const sessionAuthority = {
  authIdentityCreatedAt: "2026-08-01T00:00:00.000Z",
  hmacKeyVersion: 7,
  ownerUuid: user.id,
  sessionIssuedAt: "2026-08-21T09:00:00.000Z",
  sessionKeyHash: "a".repeat(64),
};

const managedImageObjectId = "550e8400-e29b-41d4-a716-446655440090";
const recipeId = "550e8400-e29b-41d4-a716-446655440091";
const originRecipeId = "550e8400-e29b-41d4-a716-446655440092";
const idempotencyKey = "550e8400-e29b-41d4-a716-446655440093";

interface QueryResult<T> {
  data: T;
  error: { code?: string; message: string } | null;
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

function buildManualCreateBody() {
  return {
    title: "개인 레시피 초안",
    base_servings: 2,
    image_object_id: managedImageObjectId,
    ingredients: [
      {
        ingredient_id: "550e8400-e29b-41d4-a716-446655440101",
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
        cooking_method_id: "550e8400-e29b-41d4-a716-446655440201",
        ingredients_used: [],
        heat_level: "medium",
        duration_seconds: 60,
        duration_text: "1분",
      },
    ],
  };
}

function setupCreateRouteClient({
  rpc,
}: {
  rpc: ReturnType<typeof vi.fn>;
}) {
  createRouteHandlerClient.mockResolvedValue({
    auth: {
      getUser: vi.fn(async () => ({ data: { user } })),
    },
    rpc,
    from: vi.fn((table: string) => {
      if (table === "ingredients") {
        return createLookupTable([
          { id: "550e8400-e29b-41d4-a716-446655440101" },
        ]);
      }

      if (table === "cooking_methods") {
        return createLookupTable([
          { id: "550e8400-e29b-41d4-a716-446655440201", label: "볶기" },
        ]);
      }

      throw new Error(`unexpected table: ${table}`);
    }),
  });
}

async function importCreateRoute() {
  return import("@/app/api/v1/recipes/route");
}

async function importRecipeDetailRoute() {
  return import("@/app/api/v1/recipes/[id]/route");
}

function recipeContext(id = recipeId) {
  return { params: Promise.resolve({ id }) };
}

function buildPatchRequest(body: Record<string, unknown>, key = idempotencyKey) {
  return new Request(`http://localhost:3000/api/v1/recipes/${recipeId}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    body: JSON.stringify(body),
  });
}

function buildDeleteRequest(key = idempotencyKey) {
  return new Request(`http://localhost:3000/api/v1/recipes/${recipeId}`, {
    method: "DELETE",
    headers: key ? { "Idempotency-Key": key } : undefined,
  });
}

describe("personal recipe customization write routes", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createRecipeFuturePropagationInternalClient.mockReset();
    readVerifiedAccountGenerationSession.mockReset();
    readAccountGenerationCapability.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    formatBootstrapErrorMessage.mockClear();
    recordUserGrowthActivityEvent.mockReset();
    calculateRecipeDraftNutrition.mockReset();
    callFuturePropagationRpc.mockReset();
    recalculateRecipeNutritionSnapshot.mockReset();
    recordOperationalEventFromServiceRole.mockReset();

    ensurePublicUserRow.mockResolvedValue({});
    ensureUserBootstrapState.mockResolvedValue(undefined);
    recordUserGrowthActivityEvent.mockResolvedValue({
      duplicate: false,
      error: null,
      recorded: true,
    });
    recalculateRecipeNutritionSnapshot.mockResolvedValue({
      created: true,
      is_current: true,
      snapshot_id: "snapshot-1",
    });
    readAccountGenerationCapability.mockResolvedValue({
      ok: true,
      revision: 9,
      state: "generation_active",
    });
    readVerifiedAccountGenerationSession.mockResolvedValue({
      ok: true,
      sessionAuthority,
    });
  });

  it("keeps dormant personal create, public fork, and save-as-new markers out of POST /recipes RPC payloads", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        id: recipeId,
        title: "개인 레시피 초안",
        source_type: "manual",
        created_by: user.id,
        base_servings: 2,
      },
      error: null,
    }));
    setupCreateRouteClient({ rpc });

    const { POST } = await importCreateRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/recipes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...buildManualCreateBody(),
          origin_recipe_id: originRecipeId,
          save_as_new: true,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      success: true,
      data: {
        id: recipeId,
        title: "개인 레시피 초안",
        source_type: "manual",
        created_by: user.id,
        base_servings: 2,
      },
      error: null,
    });
    expect(readVerifiedAccountGenerationSession).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "create_manual_recipe_with_managed_image",
      expect.objectContaining({
        p_owner_uuid: user.id,
        p_image_object_id: managedImageObjectId,
        p_title: "개인 레시피 초안",
      }),
    );

    const firstCall = rpc.mock.calls[0] as unknown as
      [string, unknown] | undefined;
    const payloadArg = firstCall?.[1];
    expect(payloadArg).toBeDefined();
    const payload = (payloadArg ?? {}) as Record<string, unknown>;
    expect(payload).not.toHaveProperty("p_origin_recipe_id");
    expect(payload).not.toHaveProperty("p_save_as_new");
    expect(payload).not.toHaveProperty("p_operation");
    expect(payload).not.toHaveProperty("p_source_recipe_id");
  });

  it("returns ACCOUNT_SESSION_STALE before POST /recipes mutation when verified session ownership drifts", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: null,
    }));
    setupCreateRouteClient({ rpc });
    readVerifiedAccountGenerationSession.mockResolvedValue({
      ok: true,
      sessionAuthority: {
        ...sessionAuthority,
        ownerUuid: "550e8400-e29b-41d4-a716-446655449999",
      },
    });

    const { POST } = await importCreateRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/recipes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildManualCreateBody()),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      success: false,
      data: null,
      error: {
        code: "ACCOUNT_SESSION_STALE",
        message: "세션을 다시 확인해 주세요.",
        fields: [],
      },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects PATCH without Idempotency-Key before session, nutrition, or delegated mutation", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user } })),
      },
    });

    const { PATCH } = await importRecipeDetailRoute();
    const response = await PATCH(
      buildPatchRequest({
        base_recipe_revision: 12,
        draft: {
          title: "새 제목",
          description: null,
          base_servings: 2,
          ingredients: [],
          steps: [],
        },
        future_plan_strategy: "keep",
        impact_token: "opaque-token",
      }, ""),
      recipeContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(428);
    expect(body).toEqual({
      success: false,
      data: null,
      error: {
        code: "IDEMPOTENCY_KEY_REQUIRED",
        message: "요청 키가 필요해요.",
        fields: [{ field: "Idempotency-Key", reason: "required" }],
      },
    });
    expect(readVerifiedAccountGenerationSession).not.toHaveBeenCalled();
    expect(calculateRecipeDraftNutrition).not.toHaveBeenCalled();
    expect(callFuturePropagationRpc).not.toHaveBeenCalled();
  });

  it("delegates owner PATCH through nutrition then future-plan RPC with the official payload", async () => {
    const order: string[] = [];
    const serviceClient = { from: vi.fn() };
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user } })),
      },
    });
    createRecipeFuturePropagationInternalClient.mockReturnValue(serviceClient);
    readVerifiedAccountGenerationSession.mockImplementation(async () => {
      order.push("session");
      return { ok: true, sessionAuthority };
    });
    calculateRecipeDraftNutrition.mockImplementation(async () => {
      order.push("nutrition");
      return {
        nutritionSnapshot: { calculation_version: "v1" },
        predecessorGuard: { recipe_ingredients: [] },
      };
    });
    callFuturePropagationRpc.mockImplementation(async () => {
      order.push("rpc");
      return {
        ok: true,
        data: {
          id: recipeId,
          revision: 13,
        },
      };
    });

    const body = {
      base_recipe_revision: 12,
      draft: {
        title: "수정된 제목",
        description: "설명",
        base_servings: 2,
        ingredients: [],
        steps: [],
      },
      future_plan_strategy: "replace_all",
      impact_token: "opaque-token",
      image_object_id: managedImageObjectId,
    };

    const { PATCH } = await importRecipeDetailRoute();
    const response = await PATCH(buildPatchRequest(body), recipeContext());

    expect(order).toEqual(["session", "nutrition", "rpc"]);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        id: recipeId,
        revision: 13,
      },
      error: null,
    });
    expect(callFuturePropagationRpc).toHaveBeenCalledWith(
      serviceClient,
      "write_recipe_future_plan_change",
      {
        p_owner_uuid: user.id,
        p_auth_identity_created_at_snapshot: sessionAuthority.authIdentityCreatedAt,
        p_session_key_hash: sessionAuthority.sessionKeyHash,
        p_hmac_key_version: sessionAuthority.hmacKeyVersion,
        p_session_issued_at: sessionAuthority.sessionIssuedAt,
        p_recipe_id: recipeId,
        p_base_recipe_revision: 12,
        p_draft: body.draft,
        p_nutrition_snapshot: { calculation_version: "v1" },
        p_nutrition_predecessor_guard: { recipe_ingredients: [] },
        p_future_plan_strategy: "replace_all",
        p_impact_token: "opaque-token",
        p_image_object_id: managedImageObjectId,
        p_idempotency_key: idempotencyKey,
      },
    );
  });

  it("passes through PATCH hidden-resource failures without invoking downstream mutation work twice", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user } })),
      },
    });
    createRecipeFuturePropagationInternalClient.mockReturnValue({ from: vi.fn() });
    calculateRecipeDraftNutrition.mockResolvedValue({
      nutritionSnapshot: { calculation_version: "v1" },
      predecessorGuard: { recipe_ingredients: [] },
    });
    callFuturePropagationRpc.mockResolvedValue({
      ok: false,
      response: fail("RESOURCE_NOT_FOUND", "요청한 항목을 찾을 수 없어요.", 404),
    });

    const { PATCH } = await importRecipeDetailRoute();
    const response = await PATCH(
      buildPatchRequest({
        base_recipe_revision: 12,
        draft: {
          title: "새 제목",
          description: null,
          base_servings: 2,
          ingredients: [],
          steps: [],
        },
        future_plan_strategy: "keep",
        impact_token: "opaque-token",
      }),
      recipeContext(),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      data: null,
      error: {
        code: "RESOURCE_NOT_FOUND",
        message: "요청한 항목을 찾을 수 없어요.",
        fields: [],
      },
    });
    expect(callFuturePropagationRpc).toHaveBeenCalledTimes(1);
  });

  it("rejects DELETE with a malformed Idempotency-Key before session or delegated mutation", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user } })),
      },
    });

    const { DELETE } = await importRecipeDetailRoute();
    const response = await DELETE(
      buildDeleteRequest("not-a-uuid"),
      recipeContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      data: null,
      error: {
        code: "INVALID_IDEMPOTENCY_KEY",
        message: "요청 키 형식을 확인해 주세요.",
        fields: [{ field: "Idempotency-Key", reason: "invalid_uuid" }],
      },
    });
    expect(readVerifiedAccountGenerationSession).not.toHaveBeenCalled();
    expect(callFuturePropagationRpc).not.toHaveBeenCalled();
  });

  it("delegates owner DELETE to write_personal_recipe_core with the exact tombstone payload", async () => {
    const order: string[] = [];
    const serviceClient = {};
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user } })),
      },
    });
    createRecipeFuturePropagationInternalClient.mockReturnValue(serviceClient);
    readVerifiedAccountGenerationSession.mockImplementation(async () => {
      order.push("session");
      return { ok: true, sessionAuthority };
    });
    callFuturePropagationRpc.mockImplementation(async () => {
      order.push("rpc");
      return {
        ok: true,
        data: {
          id: recipeId,
          revision: 14,
          deleted_at: "2026-08-21T10:00:00.000Z",
        },
      };
    });

    const { DELETE } = await importRecipeDetailRoute();
    const response = await DELETE(buildDeleteRequest(), recipeContext());

    expect(order).toEqual(["session", "rpc"]);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        id: recipeId,
        revision: 14,
        deleted_at: "2026-08-21T10:00:00.000Z",
      },
      error: null,
    });
    expect(callFuturePropagationRpc).toHaveBeenCalledWith(
      serviceClient,
      "write_personal_recipe_core",
      {
        p_owner_uuid: user.id,
        p_auth_identity_created_at_snapshot: sessionAuthority.authIdentityCreatedAt,
        p_session_key_hash: sessionAuthority.sessionKeyHash,
        p_hmac_key_version: sessionAuthority.hmacKeyVersion,
        p_session_issued_at: sessionAuthority.sessionIssuedAt,
        p_operation: "delete",
        p_recipe_id: recipeId,
        p_source_recipe_id: null,
        p_base_recipe_revision: null,
        p_draft: null,
        p_nutrition_snapshot: null,
        p_tags: null,
        p_image_object_id: null,
        p_expected_cleanup_generation: null,
        p_idempotency_key: idempotencyKey,
      },
    );
  });

  it("passes through delegated capability failures on DELETE without mutating route state", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user } })),
      },
    });
    createRecipeFuturePropagationInternalClient.mockReturnValue({});
    callFuturePropagationRpc.mockResolvedValue({
      ok: false,
      response: fail("ACCOUNT_GENERATION_STALE", "계정 상태를 다시 확인해 주세요.", 409),
    });

    const { DELETE } = await importRecipeDetailRoute();
    const response = await DELETE(buildDeleteRequest(), recipeContext());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      success: false,
      data: null,
      error: {
        code: "ACCOUNT_GENERATION_STALE",
        message: "계정 상태를 다시 확인해 주세요.",
        fields: [],
      },
    });
    expect(callFuturePropagationRpc).toHaveBeenCalledTimes(1);
  });
});
