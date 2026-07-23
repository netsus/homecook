import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

const userId = "550e8400-e29b-41d4-a716-446655440030";
const attemptId = "550e8400-e29b-41d4-a716-446655440032";
const attemptToken = "test-attempt-token";
const deadlineAt = "2026-07-23T07:32:00.000Z";
const leaseExpiresAt = "2026-07-23T07:32:00.000Z";

function createStorageClient({
  uploadResult = { data: { path: `${userId}/stored.webp` }, error: null },
}: {
  uploadResult?: { data: { path: string } | null; error: { message: string } | null };
} = {}) {
  const upload = vi.fn<(
    path: string,
    file: File,
    options: { contentType: string; upsert: false },
  ) => Promise<typeof uploadResult>>(async () => uploadResult);
  const getPublicUrl = vi.fn((path: string) => ({
    data: {
      publicUrl: `https://project.supabase.co/storage/v1/object/public/recipe-images/${path}`,
    },
  }));
  const bucket = {
    upload,
    getPublicUrl,
  };
  const storage = {
    from: vi.fn(() => bucket),
  };

  return { bucket, getPublicUrl, storage, upload };
}

function createExternalWriteServiceClient({
  finalizeResult,
  startResult = {
    data: {
      attempt_id: attemptId,
      attempt_token: attemptToken,
      deadline_at: deadlineAt,
      lease_expires_at: leaseExpiresAt,
      state: "started",
    },
    error: null,
  },
  uploadResult,
}: {
  finalizeResult?: {
    data: {
      attempt_id: string;
      deadline_at: string;
      state: string;
    } | null;
    error: { message: string } | null;
  };
  startResult?: {
    data: {
      attempt_id: string;
      attempt_token: string;
      deadline_at: string;
      lease_expires_at: string;
      state: string;
    } | null;
    error: { message: string } | null;
  };
  uploadResult?: { data: { path: string } | null; error: { message: string } | null };
} = {}) {
  const storageClient = createStorageClient({ uploadResult });
  const rpc = vi.fn(async (
    name: string,
    params: Record<string, unknown>,
  ) => {
    if (name === "start_legacy_external_write_attempt") {
      return startResult;
    }

    if (name === "finalize_legacy_external_write_attempt") {
      return finalizeResult ?? {
        data: {
          attempt_id: attemptId,
          deadline_at: deadlineAt,
          state: params.p_outcome === "succeeded"
            ? "finalized"
            : "cleanup_pending",
        },
        error: null,
      };
    }

    throw new Error(`Unexpected RPC: ${name}`);
  });

  return { ...storageClient, rpc };
}

async function importImageRoute() {
  return import("@/app/api/v1/recipes/images/route");
}

describe("POST /api/v1/recipes/images", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
  });

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

  it("rejects unsupported image mime types", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
      },
    });

    const formData = new FormData();
    formData.set("image", new File(["not an image"], "recipe.txt", { type: "text/plain" }));

    const { POST } = await importImageRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/images", {
      method: "POST",
      body: formData,
    }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "image", reason: "unsupported_type" }],
      },
    });
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("rejects images over 5MB", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
      },
    });

    const formData = new FormData();
    formData.set("image", new File(
      [new Uint8Array(5 * 1024 * 1024 + 1)],
      "recipe.webp",
      { type: "image/webp" },
    ));

    const { POST } = await importImageRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/images", {
      method: "POST",
      body: formData,
    }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "image", reason: "max_size" }],
      },
    });
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("fences a service-role upload before storing a valid image", async () => {
    const {
      rpc,
      storage,
      upload,
    } = createExternalWriteServiceClient();
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
      },
    });
    createServiceRoleClient.mockReturnValue({ rpc, storage });

    const formData = new FormData();
    formData.set("image", new File([new Uint8Array([1, 2, 3])], "recipe.webp", {
      type: "image/webp",
    }));

    const { POST } = await importImageRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/images", {
      method: "POST",
      body: formData,
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      success: true,
      data: {
        thumbnail_url: expect.stringMatching(
          new RegExp(`^https://project\\.supabase\\.co/storage/v1/object/public/recipe-images/${userId}/[0-9a-f-]+\\.webp$`),
        ),
        storage_path: expect.stringMatching(
          new RegExp(`^recipe-images/${userId}/[0-9a-f-]+\\.webp$`),
        ),
      },
      error: null,
    });
    expect(storage.from).toHaveBeenCalledWith("recipe-images");
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^${userId}/[0-9a-f-]+\\.webp$`)),
      expect.any(File),
      { contentType: "image/webp", upsert: false },
    );
    const objectPath = upload.mock.calls[0]?.[0];
    expect(rpc).toHaveBeenNthCalledWith(1, "start_legacy_external_write_attempt", {
      p_object_path: objectPath,
      p_owner_uuid: userId,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "finalize_legacy_external_write_attempt", {
      p_attempt_token: attemptToken,
      p_outcome: "succeeded",
    });
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(upload.mock.invocationCallOrder[0]);
    expect(upload.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[1]);
  });

  it("preserves authenticated Storage fallback when no service-role client exists", async () => {
    const { storage, upload } = createStorageClient();
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
      },
      storage,
    });
    createServiceRoleClient.mockReturnValue(null);

    const formData = new FormData();
    formData.set("image", new File([new Uint8Array([1, 2, 3])], "recipe.webp", {
      type: "image/webp",
    }));

    const { POST } = await importImageRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/images", {
      method: "POST",
      body: formData,
    }));

    expect(response.status).toBe(201);
    expect(upload).toHaveBeenCalledOnce();
  });

  it("does not upload or fall back when the service-role start fence fails", async () => {
    const fallbackStorage = createStorageClient();
    const serviceStorage = createExternalWriteServiceClient({
      startResult: {
        data: null,
        error: { message: "maintenance" },
      },
    });
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
      },
      storage: fallbackStorage.storage,
    });
    createServiceRoleClient.mockReturnValue({
      rpc: serviceStorage.rpc,
      storage: serviceStorage.storage,
    });

    const formData = new FormData();
    formData.set("image", new File([new Uint8Array([1, 2, 3])], "recipe.webp", {
      type: "image/webp",
    }));

    const { POST } = await importImageRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/images", {
      method: "POST",
      body: formData,
    }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "INTERNAL_ERROR" },
    });
    expect(serviceStorage.upload).not.toHaveBeenCalled();
    expect(fallbackStorage.upload).not.toHaveBeenCalled();
  });

  it("marks a failed service-role upload for cleanup", async () => {
    const {
      getPublicUrl,
      rpc,
      storage,
    } = createExternalWriteServiceClient({
      uploadResult: { data: null, error: { message: "storage unavailable" } },
    });
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
      },
    });
    createServiceRoleClient.mockReturnValue({ rpc, storage });

    const formData = new FormData();
    formData.set("image", new File([new Uint8Array([1, 2, 3])], "recipe.webp", {
      type: "image/webp",
    }));

    const { POST } = await importImageRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/images", {
      method: "POST",
      body: formData,
    }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "INTERNAL_ERROR" },
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "finalize_legacy_external_write_attempt", {
      p_attempt_token: attemptToken,
      p_outcome: "failed",
    });
    expect(getPublicUrl).not.toHaveBeenCalled();
  });

  it("does not attach a late service-role upload marked cleanup_pending", async () => {
    const {
      getPublicUrl,
      rpc,
      storage,
      upload,
    } = createExternalWriteServiceClient({
      finalizeResult: {
        data: {
          attempt_id: attemptId,
          deadline_at: deadlineAt,
          state: "cleanup_pending",
        },
        error: null,
      },
    });
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
      },
    });
    createServiceRoleClient.mockReturnValue({ rpc, storage });

    const formData = new FormData();
    formData.set("image", new File([new Uint8Array([1, 2, 3])], "recipe.webp", {
      type: "image/webp",
    }));

    const { POST } = await importImageRoute();
    const response = await POST(new Request("http://localhost:3000/api/v1/recipes/images", {
      method: "POST",
      body: formData,
    }));

    expect(response.status).toBe(500);
    expect(upload).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenNthCalledWith(2, "finalize_legacy_external_write_attempt", {
      p_attempt_token: attemptToken,
      p_outcome: "succeeded",
    });
    expect(getPublicUrl).not.toHaveBeenCalled();
  });
});
