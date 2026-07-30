import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const createManagedRecipeImageStorageAdapter = vi.fn();
const inspectRecipeImageUpload = vi.fn();
const readVerifiedAccountGenerationSession = vi.fn();
const runManagedRecipeImageUpload = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRecipeImageInternalClient: createServiceRoleClient,
  createRemoteCompatibilityServiceRoleClient: createServiceRoleClient,
  createRouteHandlerClient,
  createServiceRoleClient,
}));

vi.mock("@/lib/server/account-generation/session-authority", () => ({
  readVerifiedAccountGenerationSession,
}));

vi.mock("@/lib/server/recipe-image-managed-storage", () => ({
  createManagedRecipeImageStorageAdapter,
}));

vi.mock("@/lib/server/recipe-image-managed-upload", () => ({
  runManagedRecipeImageUpload,
}));

vi.mock("@/lib/server/recipe-image-upload", () => ({
  inspectRecipeImageUpload,
}));

const userId = "550e8400-e29b-41d4-a716-446655440030";
const imageObjectId = "550e8400-e29b-41d4-a716-446655440031";
const idempotencyKey = "550e8400-e29b-41d4-a716-446655440033";

function createLegacyCapabilityClient() {
  const storage = {
    from: vi.fn(),
  };
  const rpc = vi.fn(async (name: string) => {
    if (name === "get_account_generation_capability") {
      return {
        data: { revision: 1, state: "legacy" },
        error: null,
      };
    }

    throw new Error(`Unexpected RPC: ${name}`);
  });

  return { rpc, storage };
}

async function importImageRoute() {
  return import("@/app/api/v1/recipes/images/route");
}

describe("POST /api/v1/recipes/images", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    createManagedRecipeImageStorageAdapter.mockReset();
    inspectRecipeImageUpload.mockReset();
    readVerifiedAccountGenerationSession.mockReset();
    runManagedRecipeImageUpload.mockReset();
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

    const { POST } = await importImageRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/images", {
      method: "POST",
      body: new FormData(),
    }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      error: { code: "INTERNAL_ERROR" },
    });
    expect(rpc).toHaveBeenCalledWith("get_account_generation_capability");
    expect(inspectRecipeImageUpload).not.toHaveBeenCalled();
  });

  it("blocks both upload paths during cutover maintenance before reading the file", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "get_account_generation_capability") {
        return {
          data: { revision: 2, state: "cutover_maintenance" },
          error: null,
        };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
      },
    });
    createServiceRoleClient.mockReturnValue({ rpc });

    const { POST } = await importImageRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/images", {
      method: "POST",
      body: new FormData(),
    }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      success: false,
      error: { code: "ACCOUNT_LIFECYCLE_MAINTENANCE" },
    });
    expect(inspectRecipeImageUpload).not.toHaveBeenCalled();
    expect(runManagedRecipeImageUpload).not.toHaveBeenCalled();
  });

  it("fails closed on legacy capability before starting an uncancellable Storage write", async () => {
    const legacyClient = createLegacyCapabilityClient();
    const formData = vi.fn(() => {
      throw new Error("legacy capability must not read multipart data");
    });
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
      },
    });
    createServiceRoleClient.mockReturnValue(legacyClient);

    const { POST } = await importImageRoute();
    const response = await POST({
      formData,
      headers: new Headers({
        "Idempotency-Key": idempotencyKey,
      }),
    } as unknown as Request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      data: null,
      error: {
        code: "INTERNAL_ERROR",
        message: "계정 상태를 확인하지 못했어요.",
        fields: [],
      },
    });
    expect(formData).not.toHaveBeenCalled();
    expect(legacyClient.storage.from).not.toHaveBeenCalled();
    expect(runManagedRecipeImageUpload).not.toHaveBeenCalled();
  });

  it("requires an idempotency key before managed upload work", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "get_account_generation_capability") {
        return {
          data: { revision: 3, state: "generation_active" },
          error: null,
        };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
      },
    });
    createServiceRoleClient.mockReturnValue({ rpc });

    const { POST } = await importImageRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/images", {
      method: "POST",
      body: new FormData(),
    }));
    const body = await response.json();

    expect(response.status).toBe(428);
    expect(body).toMatchObject({
      success: false,
      error: { code: "IDEMPOTENCY_KEY_REQUIRED" },
    });
    expect(readVerifiedAccountGenerationSession).not.toHaveBeenCalled();
    expect(inspectRecipeImageUpload).not.toHaveBeenCalled();
  });

  it("dispatches generation-active uploads through the managed authority", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "get_account_generation_capability") {
        return {
          data: { revision: 3, state: "generation_active" },
          error: null,
        };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });
    const routeClient = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
      },
    };
    const storageAdapter = {
      issueReadUrl: vi.fn(),
      readTakeoverObject: vi.fn(),
      uploadObject: vi.fn(),
    };
    createRouteHandlerClient.mockResolvedValue(routeClient);
    createServiceRoleClient.mockReturnValue({ rpc, storage: { from: vi.fn() } });
    readVerifiedAccountGenerationSession.mockResolvedValue({
      ok: true,
      sessionAuthority: {
        authIdentityCreatedAt: "2026-07-23T00:00:00.000Z",
        hmacKeyVersion: 1,
        ownerUuid: userId,
        sessionIssuedAt: "2026-07-26T00:00:00.000Z",
        sessionKeyHash: "a".repeat(64),
      },
    });
    inspectRecipeImageUpload.mockResolvedValue({
      ok: true,
      value: {
        actualMimeType: "image/png",
        byteSize: 3,
        extension: "png",
        rawSha256: "b".repeat(64),
      },
    });
    createManagedRecipeImageStorageAdapter.mockReturnValue(storageAdapter);
    runManagedRecipeImageUpload.mockResolvedValue({
      kind: "succeeded",
      objectId: imageObjectId,
      readUrl:
        "https://project.supabase.co/storage/v1/object/sign/recipe-images-private/path?token=signed",
      readUrlExpiresAt: "2026-07-26T03:30:00.000Z",
      state: "uploaded_unlinked",
    });
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");

    const formData = new FormData();
    const image = new File([new Uint8Array([1, 2, 3])], "recipe.png", {
      type: "image/png",
    });
    formData.set("image", image);
    formData.set("visibility", "public");
    formData.set("bucket_id", "recipe-images");
    formData.set("object_path", "attacker-controlled/path.png");
    formData.set("owner_uuid", "550e8400-e29b-41d4-a716-446655440099");
    formData.set("cleanup_generation", "999");
    formData.set("moderation_status", "approved");

    const { POST } = await importImageRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/images", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: formData,
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      success: true,
      data: {
        image_object_id: imageObjectId,
        read_url:
          "https://project.supabase.co/storage/v1/object/sign/recipe-images-private/path?token=signed",
        read_url_expires_at: "2026-07-26T03:30:00.000Z",
        state: "uploaded_unlinked",
      },
      error: null,
    });
    expect(readVerifiedAccountGenerationSession).toHaveBeenCalledWith(routeClient);
    expect(inspectRecipeImageUpload).toHaveBeenCalledWith(expect.any(File));
    expect(runManagedRecipeImageUpload).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.any(File),
      dbClient: expect.objectContaining({ rpc }),
      idempotencyKey,
      inspection: expect.objectContaining({ actualMimeType: "image/png" }),
      issueReadUrl: storageAdapter.issueReadUrl,
      readTakeoverObject: storageAdapter.readTakeoverObject,
      sessionAuthority: expect.objectContaining({ ownerUuid: userId }),
      uploadObject: storageAdapter.uploadObject,
    }));
    const managedInput = runManagedRecipeImageUpload.mock.calls[0]?.[0];
    expect(Object.keys(managedInput).sort()).toEqual([
      "body",
      "dbClient",
      "expectedReadUrlOrigin",
      "idempotencyKey",
      "inspection",
      "issueReadUrl",
      "maxReadUrlTtlMs",
      "readTakeoverObject",
      "sessionAuthority",
      "uploadObject",
    ]);
    for (const forbiddenField of [
      "visibility",
      "bucket_id",
      "object_path",
      "owner_uuid",
      "cleanup_generation",
      "moderation_status",
    ]) {
      expect(managedInput).not.toHaveProperty(forbiddenField);
    }
    expect(managedInput.sessionAuthority.ownerUuid).toBe(userId);
  });

  it("returns one opaque limited response with a positive Retry-After", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "get_account_generation_capability") {
        return {
          data: { revision: 3, state: "generation_active" },
          error: null,
        };
      }
      throw new Error(`Unexpected RPC: ${name}`);
    });
    const routeClient = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
      },
    };
    const storageAdapter = {
      issueReadUrl: vi.fn(),
      readTakeoverObject: vi.fn(),
      uploadObject: vi.fn(),
    };
    createRouteHandlerClient.mockResolvedValue(routeClient);
    createServiceRoleClient.mockReturnValue({ rpc, storage: { from: vi.fn() } });
    readVerifiedAccountGenerationSession.mockResolvedValue({
      ok: true,
      sessionAuthority: {
        authIdentityCreatedAt: "2026-07-23T00:00:00.000Z",
        hmacKeyVersion: 1,
        ownerUuid: userId,
        sessionIssuedAt: "2026-07-26T00:00:00.000Z",
        sessionKeyHash: "a".repeat(64),
      },
    });
    inspectRecipeImageUpload.mockResolvedValue({
      ok: true,
      value: {
        actualMimeType: "image/png",
        byteSize: 3,
        extension: "png",
        rawSha256: "b".repeat(64),
      },
    });
    createManagedRecipeImageStorageAdapter.mockReturnValue(storageAdapter);
    runManagedRecipeImageUpload.mockResolvedValue({
      kind: "limited",
      retryAfterSeconds: 61,
    });
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");

    const formData = new FormData();
    formData.set("image", new File([new Uint8Array([1, 2, 3])], "recipe.png", {
      type: "image/png",
    }));

    const { POST } = await importImageRoute();
    const response = await POST(new Request(
      "http://localhost:3000/api/v1/recipes/images",
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: formData,
      },
    ));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("61");
    expect(body).toEqual({
      success: false,
      data: null,
      error: {
        code: "IMAGE_UPLOAD_LIMITED",
        message: "잠시 후 이미지 업로드를 다시 시도해 주세요.",
        fields: [],
      },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /quota|backlog|reservation|pending|dead.?letter/i,
    );
    expect(runManagedRecipeImageUpload).toHaveBeenCalledOnce();
  });

  it("fails closed when the verified session belongs to a different owner", async () => {
    const rpc = vi.fn(async () => ({
      data: { revision: 3, state: "generation_active" },
      error: null,
    }));
    const routeClient = {
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
      },
    };
    createRouteHandlerClient.mockResolvedValue(routeClient);
    createServiceRoleClient.mockReturnValue({ rpc });
    readVerifiedAccountGenerationSession.mockResolvedValue({
      ok: true,
      sessionAuthority: {
        authIdentityCreatedAt: "2026-07-23T00:00:00.000Z",
        hmacKeyVersion: 1,
        ownerUuid: "550e8400-e29b-41d4-a716-446655440099",
        sessionIssuedAt: "2026-07-26T00:00:00.000Z",
        sessionKeyHash: "a".repeat(64),
      },
    });

    const { POST } = await importImageRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/images", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: new FormData(),
    }));

    expect(response.status).toBe(500);
    expect(inspectRecipeImageUpload).not.toHaveBeenCalled();
    expect(runManagedRecipeImageUpload).not.toHaveBeenCalled();
  });

  it("returns the official internal error wrapper when image inspection throws", async () => {
    const rpc = vi.fn(async () => ({
      data: { revision: 3, state: "generation_active" },
      error: null,
    }));
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
      },
    });
    createServiceRoleClient.mockReturnValue({ rpc });
    readVerifiedAccountGenerationSession.mockResolvedValue({
      ok: true,
      sessionAuthority: {
        authIdentityCreatedAt: "2026-07-23T00:00:00.000Z",
        hmacKeyVersion: 1,
        ownerUuid: userId,
        sessionIssuedAt: "2026-07-26T00:00:00.000Z",
        sessionKeyHash: "a".repeat(64),
      },
    });
    inspectRecipeImageUpload.mockRejectedValue(new Error("file read failed"));

    const formData = new FormData();
    formData.set("image", new File([new Uint8Array([1, 2, 3])], "recipe.png", {
      type: "image/png",
    }));

    const { POST } = await importImageRoute();
    const response = await POST(new Request(
      "http://localhost:3000/api/v1/recipes/images",
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: formData,
      },
    ));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      success: false,
      data: null,
      error: {
        code: "INTERNAL_ERROR",
        message: "이미지를 업로드하지 못했어요.",
        fields: [],
      },
    });
    expect(runManagedRecipeImageUpload).not.toHaveBeenCalled();
  });

  it.each([
    {
      expectedCode: "IMAGE_TOO_LARGE",
      expectedStatus: 413,
      reason: "too_large",
    },
    {
      expectedCode: "IMAGE_MIME_MISMATCH",
      expectedStatus: 422,
      reason: "declared_type_mismatch",
    },
    {
      expectedCode: "IMAGE_MIME_MISMATCH",
      expectedStatus: 422,
      reason: "unsupported_actual_type",
    },
  ])(
    "maps managed inspection $reason to $expectedCode",
    async ({ expectedCode, expectedStatus, reason }) => {
      const rpc = vi.fn(async () => ({
        data: { revision: 3, state: "generation_active" },
        error: null,
      }));
      createRouteHandlerClient.mockResolvedValue({
        auth: {
          getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
        },
      });
      createServiceRoleClient.mockReturnValue({ rpc });
      readVerifiedAccountGenerationSession.mockResolvedValue({
        ok: true,
        sessionAuthority: {
          authIdentityCreatedAt: "2026-07-23T00:00:00.000Z",
          hmacKeyVersion: 1,
          ownerUuid: userId,
          sessionIssuedAt: "2026-07-26T00:00:00.000Z",
          sessionKeyHash: "a".repeat(64),
        },
      });
      inspectRecipeImageUpload.mockResolvedValue({ ok: false, reason });

      const formData = new FormData();
      formData.set("image", new File([new Uint8Array([1, 2, 3])], "recipe.png", {
        type: "image/png",
      }));

      const { POST } = await importImageRoute();
      const response = await POST(new Request(
        "http://localhost:3000/api/v1/recipes/images",
        {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: formData,
        },
      ));
      const body = await response.json();

      expect(response.status).toBe(expectedStatus);
      expect(body).toMatchObject({
        success: false,
        error: { code: expectedCode },
      });
      expect(runManagedRecipeImageUpload).not.toHaveBeenCalled();
    },
  );

  it("returns 401 before reading multipart data when unauthenticated", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
    });

    const { POST } = await importImageRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/images", {
      method: "POST",
      body: new FormData(),
    }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED" },
    });
  });

});
