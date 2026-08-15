import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createSnapshotV2SessionInternalClient = vi.fn();
const readVerifiedAccountGenerationSession = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();
const awardUserProgressEvent = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createSnapshotV2SessionInternalClient,
}));

vi.mock("@/lib/server/account-generation/session-authority", () => ({
  readVerifiedAccountGenerationSession,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage: vi.fn(),
}));

vi.mock("@/lib/server/user-progress", () => ({
  awardUserProgressEvent,
}));

const OWNER_ID = "550e8400-e29b-41d4-a716-446655440101";
const SESSION_ID = "550e8400-e29b-41d4-a716-446655440102";
const RECIPE_ID = "550e8400-e29b-41d4-a716-446655440103";
const INGREDIENT_ID = "550e8400-e29b-41d4-a716-446655440104";
const IDEMPOTENCY_KEY = "550e8400-e29b-41d4-a716-446655440105";
const IDENTITY_EPOCH = "2026-08-01T00:00:00.000Z";
const SESSION_ISSUED_AT = "2026-08-15T00:00:00.000Z";
const SESSION_KEY_HASH = "a".repeat(64);

const authorityArgs = {
  p_owner_uuid: OWNER_ID,
  p_auth_identity_created_at_snapshot: IDENTITY_EPOCH,
  p_session_key_hash: SESSION_KEY_HASH,
  p_hmac_key_version: 1,
  p_session_issued_at: SESSION_ISSUED_AT,
};

type RouteCase = {
  name: string;
  functionName: "complete_cooking_session" | "complete_standalone_cooking";
  request(key?: string | null): Request;
  invoke(request: Request): Promise<Response>;
  expectedArgs(key: string | null): Record<string, unknown>;
  successData: Record<string, unknown>;
};

function request(url: string, body: Record<string, unknown>, key?: string | null) {
  const headers = new Headers({ "content-type": "application/json" });
  if (key !== null && key !== undefined) {
    headers.set("Idempotency-Key", key);
  }
  return new Request(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const cases: RouteCase[] = [
  {
    name: "planner",
    functionName: "complete_cooking_session",
    request(key) {
      return request(
        `http://localhost:3000/api/v1/cooking/sessions/${SESSION_ID}/complete`,
        { consumed_ingredient_ids: [INGREDIENT_ID, INGREDIENT_ID] },
        key,
      );
    },
    async invoke(routeRequest) {
      const { POST } = await import(
        "@/app/api/v1/cooking/sessions/[session_id]/complete/route"
      );
      return POST(routeRequest, {
        params: Promise.resolve({ session_id: SESSION_ID }),
      });
    },
    expectedArgs(key) {
      return {
        ...authorityArgs,
        p_session_id: SESSION_ID,
        p_consumed_ingredient_ids: [INGREDIENT_ID],
        p_idempotency_key: key,
      };
    },
    successData: {
      session_id: SESSION_ID,
      status: "completed",
      meals_updated: 1,
      leftover_dish_id: SESSION_ID,
      pantry_removed: 1,
      cook_count: 7,
    },
  },
  {
    name: "standalone",
    functionName: "complete_standalone_cooking",
    request(key) {
      return request(
        "http://localhost:3000/api/v1/cooking/standalone-complete",
        {
          recipe_id: RECIPE_ID,
          cooking_servings: 2,
          consumed_ingredient_ids: [INGREDIENT_ID, INGREDIENT_ID],
        },
        key,
      );
    },
    async invoke(routeRequest) {
      const { POST } = await import(
        "@/app/api/v1/cooking/standalone-complete/route"
      );
      return POST(routeRequest);
    },
    expectedArgs(key) {
      return {
        ...authorityArgs,
        p_recipe_id: RECIPE_ID,
        p_cooking_servings: 2,
        p_consumed_ingredient_ids: [INGREDIENT_ID],
        p_idempotency_key: key,
      };
    },
    successData: {
      leftover_dish_id: SESSION_ID,
      pantry_removed: 1,
      cook_count: 7,
    },
  },
];

function setup({ data, error }: { data?: unknown; error?: unknown } = {}) {
  const rpc = vi.fn(async () => ({ data: data ?? null, error: error ?? null }));
  createRouteHandlerClient.mockResolvedValue({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: OWNER_ID } } })),
    },
  });
  createSnapshotV2SessionInternalClient.mockReturnValue({ rpc });
  readVerifiedAccountGenerationSession.mockResolvedValue({
    ok: true,
    sessionAuthority: {
      ownerUuid: OWNER_ID,
      authIdentityCreatedAt: IDENTITY_EPOCH,
      sessionKeyHash: SESSION_KEY_HASH,
      hmacKeyVersion: 1,
      sessionIssuedAt: SESSION_ISSUED_AT,
    },
  });
  return rpc;
}

describe.each(cases)("legacy $name cooking completion route", (routeCase) => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createSnapshotV2SessionInternalClient.mockReset();
    readVerifiedAccountGenerationSession.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    awardUserProgressEvent.mockReset();
  });

  it("uses the exact service-only RPC with verified session authority", async () => {
    const rpc = setup({ data: routeCase.successData });

    const response = await routeCase.invoke(routeCase.request(IDEMPOTENCY_KEY));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: routeCase.successData,
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith(
      routeCase.functionName,
      routeCase.expectedArgs(IDEMPOTENCY_KEY),
    );
    expect(ensurePublicUserRow).not.toHaveBeenCalled();
    expect(ensureUserBootstrapState).not.toHaveBeenCalled();
    expect(awardUserProgressEvent).not.toHaveBeenCalled();
  });

  it("keeps missing-key compatibility before separately approved activation", async () => {
    const rpc = setup({ data: routeCase.successData });

    const response = await routeCase.invoke(routeCase.request(null));

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      routeCase.functionName,
      routeCase.expectedArgs(null),
    );
  });

  it("rejects a malformed Idempotency-Key before session or database work", async () => {
    setup({ data: routeCase.successData });

    const response = await routeCase.invoke(routeCase.request("not-a-uuid"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      success: false,
      data: null,
      error: {
        code: "INVALID_IDEMPOTENCY_KEY",
        message: "요청 키를 확인해 주세요.",
        fields: [{ field: "Idempotency-Key", reason: "invalid_uuid" }],
      },
    });
    expect(readVerifiedAccountGenerationSession).not.toHaveBeenCalled();
    expect(createSnapshotV2SessionInternalClient).not.toHaveBeenCalled();
  });

  it("rejects an unverified session before creating the internal client", async () => {
    setup({ data: routeCase.successData });
    readVerifiedAccountGenerationSession.mockResolvedValue({ ok: false });

    const response = await routeCase.invoke(routeCase.request(IDEMPOTENCY_KEY));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      success: false,
      data: null,
      error: { code: "ACCOUNT_SESSION_STALE", fields: [] },
    });
    expect(createSnapshotV2SessionInternalClient).not.toHaveBeenCalled();
  });

  it.each([
    ["ACCOUNT_LIFECYCLE_MAINTENANCE", 503, "계정 정비 작업 중이에요. 잠시 후 다시 시도해 주세요."],
    ["ACCOUNT_CUTOVER_QUARANTINED", 409, "계정 복구가 필요해요."],
    ["ACCOUNT_DELETING", 409, "계정 삭제가 진행 중이에요."],
    ["IDEMPOTENCY_KEY_REUSED", 409, "이미 다른 요청에 사용된 요청 키예요."],
  ])("maps %s without a secondary writer", async (code, status, message) => {
    setup({ error: { code, message: code } });

    const response = await routeCase.invoke(routeCase.request(IDEMPOTENCY_KEY));

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({
      success: false,
      data: null,
      error: { code, message, fields: [] },
    });
    expect(ensurePublicUserRow).not.toHaveBeenCalled();
    expect(ensureUserBootstrapState).not.toHaveBeenCalled();
    expect(awardUserProgressEvent).not.toHaveBeenCalled();
  });
});
