import { beforeEach, describe, expect, it, vi } from "vitest";

const { createRouteHandlerClient, createRecipeImageInternalClient } = vi.hoisted(() => ({
  createRouteHandlerClient: vi.fn(), createRecipeImageInternalClient: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient, createRecipeImageInternalClient }));
import { GET } from "@/app/api/v1/recipe-books/[book_id]/image/route";
import { normalizeRecipeBookCoverImageUrl } from "@/lib/recipebook-cover";
import { RECIPE_IMAGE_MAX_BYTES } from "@/lib/server/recipe-media";

const bookId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const objectId = "33333333-3333-4333-8333-333333333333";
const otherId = "44444444-4444-4444-8444-444444444444";
const read = () => GET(new Request(`http://localhost/api/v1/recipe-books/${bookId}/image`), { params: Promise.resolve({ book_id: bookId }) });

function setup(scenario = "owned") {
  const query = {
    select: vi.fn(() => query), eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data: scenario === "missing" || scenario === "denied" ? null : { id: bookId },
      error: scenario === "denied" ? { code: "42501", message: "permission denied" }
        : scenario === "stale" ? { message: "HOMECOOK_HYBRID_AUTHORITY::ACCOUNT_SESSION_STALE::409" }
          : scenario === "maintenance" ? { message: "HOMECOOK_HYBRID_AUTHORITY::ACCOUNT_LIFECYCLE_MAINTENANCE::503" } : null,
    })),
  };
  const from = vi.fn(() => query);
  createRouteHandlerClient.mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: scenario === "unauthenticated" ? null : { id: ownerId } } })) }, from,
  });
  const projection = {
    book_id: scenario === "foreign_book" ? otherId : bookId,
    legacy_cover_image_url: null,
    image_object_id: objectId,
    bucket_id: scenario === "public_shared" ? "recipe-images" : "recipe-images-private",
    object_path: scenario === "public_shared" ? `shared/${objectId}.webp` : `${scenario === "foreign_path" ? otherId : ownerId}/1/${objectId}.webp`,
    owner_uuid: scenario === "public_shared" ? null : scenario === "foreign_owner" ? otherId : ownerId,
    account_generation: scenario === "public_shared" ? null : 1,
    visibility: scenario === "public_shared" ? "public_shared" : "private",
    state: scenario === "detached" ? "quarantined" : scenario === "public_shared" ? "attached_public_shared" : "attached_private",
    reference_type: scenario === "wrong_reference" ? "recipe_thumbnail" : "recipe_book_cover",
  };
  const rpc = vi.fn(async () => ({ data: scenario === "projection_missing" ? null : [projection],
    error: scenario === "projection_missing" ? { code: "PGRST202" } : null }));
  const image = new Blob([scenario === "oversized" ? new Uint8Array(RECIPE_IMAGE_MAX_BYTES + 1) : new Uint8Array([1, 2, 3])], {
    type: scenario === "invalid_mime" ? "text/html" : "image/webp",
  });
  const download = vi.fn(async () => ({ data: image, error: scenario === "download_error" ? { message: "unavailable" } : null }));
  const storageFrom = vi.fn(() => ({ download }));
  createRecipeImageInternalClient.mockImplementation(() => {
    expect(query.maybeSingle).toHaveBeenCalled();
    return scenario === "no_internal" ? null : { rpc, storage: { from: storageFrom } };
  });
  return { query, from, rpc, download, storageFrom };
}

beforeEach(() => vi.clearAllMocks());

describe("owned recipe-book image proxy", () => {
  it("keeps the exact app image path through reader cover normalization", () => {
    const imagePath = `/api/v1/recipe-books/${bookId}/image`;
    expect(normalizeRecipeBookCoverImageUrl(imagePath)).toBe(imagePath);
    for (const unsafe of ["//foreign.example/image", `/api/v1/recipe-books/${bookId}/image/../other`, `${imagePath}?redirect=foreign`, "/api/v1/recipe-books/not-an-id/image"]) {
      expect(normalizeRecipeBookCoverImageUrl(unsafe)).toBeNull();
    }
  });

  it("reauthorizes each read and returns bounded bytes without a Storage URL", async () => {
    const { query, rpc, storageFrom, download } = setup();
    for (let i = 0; i < 2; i += 1) {
      const response = await read();
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/webp");
      expect(response.headers.get("content-length")).toBe("3");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([1, 2, 3]);
    }
    expect(query.maybeSingle).toHaveBeenCalledTimes(2);
    expect(query.eq).toHaveBeenCalledWith("id", bookId);
    expect(query.eq).toHaveBeenCalledWith("user_id", ownerId);
    expect(rpc).toHaveBeenCalledWith("read_recipe_book_image_projections", { p_book_ids: [bookId] });
    expect(storageFrom).toHaveBeenCalledWith("recipe-images-private");
    expect(download).toHaveBeenCalledWith(`${ownerId}/1/${objectId}.webp`);
  });

  it.each(["unauthenticated", "missing", "denied", "stale", "maintenance"])("rejects %s before creating internal authority", async scenario => {
    const { download } = setup(scenario);
    const response = await read();
    expect(response.status).toBe(scenario === "unauthenticated" ? 401 : scenario === "missing" ? 404 : scenario === "stale" ? 409 : scenario === "maintenance" ? 503 : 500);
    expect((await response.json()).success).toBe(false);
    expect(createRecipeImageInternalClient).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it.each(["foreign_book", "foreign_owner", "foreign_path", "wrong_reference", "detached", "no_internal"])("rejects %s before Storage access", async scenario => {
    const { download } = setup(scenario);
    const response = await read();
    expect(response.status).toBe(500);
    expect((await response.json()).success).toBe(false);
    expect(download).not.toHaveBeenCalled();
  });

  it("serves a validated shared cover only after authorizing its book", async () => {
    const { storageFrom, download } = setup("public_shared");
    expect((await read()).status).toBe(200);
    expect(storageFrom).toHaveBeenCalledWith("recipe-images");
    expect(download).toHaveBeenCalledWith(`shared/${objectId}.webp`);
  });

  it("returns404 without download when the projection capability is unavailable", async () => {
    const { download } = setup("projection_missing");
    const response = await read();
    expect(response.status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });

  it.each(["download_error", "oversized", "invalid_mime"])("does not serve %s content", async scenario => {
    setup(scenario);
    const response = await read();
    expect(response.status).toBe(scenario === "download_error" ? 404 : 500);
    expect((await response.json()).success).toBe(false);
  });
});
