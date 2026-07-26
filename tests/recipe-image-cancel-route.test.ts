import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const readVerifiedAccountGenerationSession = vi.fn();
const runManagedRecipeImageCancel = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

vi.mock("@/lib/server/account-generation/session-authority", () => ({
  readVerifiedAccountGenerationSession,
}));

vi.mock("@/lib/server/recipe-image-managed-cancel", () => ({
  runManagedRecipeImageCancel,
}));

const userId = "550e8400-e29b-41d4-a716-446655440030";
const imageObjectId = "550e8400-e29b-41d4-a716-446655440031";
const idempotencyKey = "550e8400-e29b-41d4-a716-446655440032";
const sessionAuthority = {
  authIdentityCreatedAt: "2026-07-24T01:00:00.000Z",
  hmacKeyVersion: 1,
  ownerUuid: userId,
  sessionKeyHash: "a".repeat(64),
};

function request(key = idempotencyKey) {
  return new Request(
    `http://localhost:3000/api/v1/recipes/images/${imageObjectId}/cancel`,
    {
      headers: { "Idempotency-Key": key },
      method: "POST",
    },
  );
}

function context(id = imageObjectId) {
  return { params: Promise.resolve({ image_object_id: id }) };
}

function setupCapability(state: string) {
  const rpc = vi.fn(async (name: string) => {
    if (name === "get_account_generation_capability") {
      return { data: { revision: 3, state }, error: null };
    }
    throw new Error(`Unexpected RPC: ${name}`);
  });
  const routeClient = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
    },
  };
  const serviceRoleClient = { rpc };
  createRouteHandlerClient.mockResolvedValue(routeClient);
  createServiceRoleClient.mockReturnValue(serviceRoleClient);
  return { routeClient, serviceRoleClient };
}

async function importRoute() {
  return import(
    "@/app/api/v1/recipes/images/[image_object_id]/cancel/route"
  );
}

describe("POST /api/v1/recipes/images/{image_object_id}/cancel", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    readVerifiedAccountGenerationSession.mockReset();
    runManagedRecipeImageCancel.mockReset();
  });

  it("rejects unauthenticated callers before creating privileged clients", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
    });

    const { POST } = await importRoute();
    const response = await POST(request(), context());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED" },
    });
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("fails closed when the privileged client is unavailable", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
      },
    });
    createServiceRoleClient.mockReturnValue(null);

    const { POST } = await importRoute();
    const response = await POST(request(), context());

    expect(response.status).toBe(500);
    expect(runManagedRecipeImageCancel).not.toHaveBeenCalled();
  });

  it("fails closed when the capability authority cannot be read", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "capability unavailable" },
    }));
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
      },
    });
    createServiceRoleClient.mockReturnValue({ rpc });

    const { POST } = await importRoute();
    const response = await POST(request(), context());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "INTERNAL_ERROR" },
    });
    expect(runManagedRecipeImageCancel).not.toHaveBeenCalled();
  });

  it("hides the dark-shipped route in legacy capability state", async () => {
    setupCapability("legacy");

    const { POST } = await importRoute();
    const response = await POST(request(), context());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "RESOURCE_NOT_FOUND" },
    });
    expect(readVerifiedAccountGenerationSession).not.toHaveBeenCalled();
  });

  it("blocks cancellation during account cutover maintenance", async () => {
    setupCapability("cutover_maintenance");

    const { POST } = await importRoute();
    const response = await POST(request(), context());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "ACCOUNT_LIFECYCLE_MAINTENANCE" },
    });
  });

  it("returns IMAGE_NOT_FOUND for an invalid object ID without mutation", async () => {
    setupCapability("generation_active");

    const { POST } = await importRoute();
    const response = await POST(request(), context("not-a-uuid"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "IMAGE_NOT_FOUND" },
    });
    expect(readVerifiedAccountGenerationSession).not.toHaveBeenCalled();
    expect(runManagedRecipeImageCancel).not.toHaveBeenCalled();
  });

  it("requires the official idempotency key before session or DB mutation", async () => {
    setupCapability("generation_active");

    const { POST } = await importRoute();
    const response = await POST(
      new Request(
        `http://localhost:3000/api/v1/recipes/images/${imageObjectId}/cancel`,
        { method: "POST" },
      ),
      context(),
    );

    expect(response.status).toBe(428);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "IDEMPOTENCY_KEY_REQUIRED" },
    });
    expect(readVerifiedAccountGenerationSession).not.toHaveBeenCalled();
    expect(runManagedRecipeImageCancel).not.toHaveBeenCalled();
  });

  it("fails closed when the verified session owner differs from auth", async () => {
    setupCapability("generation_active");
    readVerifiedAccountGenerationSession.mockResolvedValue({
      ok: true,
      sessionAuthority: {
        ...sessionAuthority,
        ownerUuid: "550e8400-e29b-41d4-a716-446655440099",
      },
    });

    const { POST } = await importRoute();
    const response = await POST(request(), context());

    expect(response.status).toBe(500);
    expect(runManagedRecipeImageCancel).not.toHaveBeenCalled();
  });

  it("fails closed when verified session authority is unavailable", async () => {
    setupCapability("generation_active");
    readVerifiedAccountGenerationSession.mockResolvedValue({ ok: false });

    const { POST } = await importRoute();
    const response = await POST(request(), context());

    expect(response.status).toBe(500);
    expect(runManagedRecipeImageCancel).not.toHaveBeenCalled();
  });

  it("returns only the public object identity and cleanup state on success", async () => {
    const { serviceRoleClient } = setupCapability("generation_active");
    readVerifiedAccountGenerationSession.mockResolvedValue({
      ok: true,
      sessionAuthority,
    });
    runManagedRecipeImageCancel.mockResolvedValue({
      kind: "succeeded",
      objectId: imageObjectId,
      state: "cleanup_pending",
    });

    const { POST } = await importRoute();
    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        image_object_id: imageObjectId,
        state: "cleanup_pending",
      },
      error: null,
    });
    expect(runManagedRecipeImageCancel).toHaveBeenCalledWith({
      dbClient: serviceRoleClient,
      idempotencyKey,
      imageObjectId,
      sessionAuthority,
    });
  });

  it.each([
    ["IMAGE_NOT_FOUND", 404],
    ["ACCOUNT_CUTOVER_UNCLASSIFIED", 409],
    ["ACCOUNT_CUTOVER_QUARANTINED", 409],
    ["ACCOUNT_DELETING", 409],
    ["IDEMPOTENCY_KEY_REUSED", 409],
    ["ACCOUNT_GENERATION_STALE", 409],
    ["ACCOUNT_SESSION_STALE", 409],
    ["IMAGE_EXPIRED", 409],
  ] as const)("maps %s to status %i without leaking object details", async (
    code,
    status,
  ) => {
    setupCapability("generation_active");
    readVerifiedAccountGenerationSession.mockResolvedValue({
      ok: true,
      sessionAuthority,
    });
    runManagedRecipeImageCancel.mockResolvedValue({
      code,
      kind: "rejected",
    });

    const { POST } = await importRoute();
    const response = await POST(request(), context());
    const body = await response.json();

    expect(response.status).toBe(status);
    expect(body).toMatchObject({
      success: false,
      error: { code },
    });
    expect(JSON.stringify(body)).not.toContain(imageObjectId);
  });

  it("fails closed on an unknown or malformed cancel result", async () => {
    setupCapability("generation_active");
    readVerifiedAccountGenerationSession.mockResolvedValue({
      ok: true,
      sessionAuthority,
    });
    runManagedRecipeImageCancel.mockResolvedValue({ kind: "failed" });

    const { POST } = await importRoute();
    const response = await POST(request(), context());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "INTERNAL_ERROR" },
    });
  });
});
