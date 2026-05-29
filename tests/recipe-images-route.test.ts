import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

const userId = "550e8400-e29b-41d4-a716-446655440030";

function createStorageClient({
  uploadResult = { data: { path: `${userId}/stored.webp` }, error: null },
}: {
  uploadResult?: { data: { path: string } | null; error: { message: string } | null };
} = {}) {
  const upload = vi.fn(async () => uploadResult);
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

  it("stores a valid image under the current user's recipe-images path", async () => {
    const { storage, upload } = createStorageClient();
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
      },
    });
    createServiceRoleClient.mockReturnValue({ storage });

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
  });

  it("returns 500 when Supabase Storage upload fails", async () => {
    const { getPublicUrl, storage } = createStorageClient({
      uploadResult: { data: null, error: { message: "storage unavailable" } },
    });
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: userId } } })),
      },
    });
    createServiceRoleClient.mockReturnValue({ storage });

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
    expect(getPublicUrl).not.toHaveBeenCalled();
  });
});
