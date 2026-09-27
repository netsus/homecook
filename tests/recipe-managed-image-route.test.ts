import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ route: vi.fn(), image: vi.fn(), projection: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.route, createRecipeImageInternalClient: mocks.image }));
vi.mock("@/lib/server/hybrid-auth/route-error", () => ({ createHybridAuthorityRouteError: () => null }));
vi.mock("@/lib/server/recipe-image-read", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/server/recipe-image-read")>(),
  readRecipeImageProjection: mocks.projection,
}));
import { GET } from "@/app/api/v1/recipes/[id]/image/route";

const id = "11111111-1111-4111-8111-111111111111";
const owner = "22222222-2222-4222-8222-222222222222";
const object = "33333333-3333-4333-8333-333333333333";
const path = `${owner}/2/${object}.webp`;
const projection = {
  recipe_id: id, legacy_thumbnail_url: null, image_object_id: object,
  bucket_id: "recipe-images-private", object_path: path, owner_uuid: owner,
  account_generation: 2, visibility: "private", state: "attached_private", reference_type: "recipe_thumbnail",
};
let download: ReturnType<typeof vi.fn>;
let maybeSingle: ReturnType<typeof vi.fn>;
const request = () => GET(new Request(`https://app.mumeok.kr/api/v1/recipes/${id}/image`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  download = vi.fn(async () => ({ data: new Blob(["image"], { type: "image/webp" }), error: null }));
  maybeSingle = vi.fn(async () => ({ data: { id, created_by: owner, deleted_at: null, visibility: "private" }, error: null }));
  mocks.route.mockResolvedValue({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) });
  mocks.image.mockReturnValue({ storage: { from: () => ({ download }) } });
  mocks.projection.mockResolvedValue(projection);
});

describe("same-origin managed recipe images", () => {
  it("rechecks recipe access and serves bounded private image bytes without a browser storage URL", async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("image");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(maybeSingle.mock.invocationCallOrder[0]).toBeLessThan(mocks.projection.mock.invocationCallOrder[0]);
    expect(download).toHaveBeenCalledWith(path);
  });

  it("does not publish private image bytes through a public recipe", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { id, created_by: owner, deleted_at: null, visibility: "public" }, error: null });
    expect((await request()).status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });

  it("does not consult privileged storage for a recipe hidden by RLS", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect((await request()).status).toBe(404);
    expect(mocks.image).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });

  it("rejects a foreign private image even when its recipe row was visible", async () => {
    mocks.projection.mockResolvedValueOnce({ ...projection, owner_uuid: id, object_path: `${id}/2/${object}.webp` });
    expect((await request()).status).toBe(500);
    expect(download).not.toHaveBeenCalled();
  });

  it("serves an attached shared public object through the same authenticated read boundary", async () => {
    mocks.projection.mockResolvedValueOnce({ ...projection, owner_uuid: null, account_generation: null, bucket_id: "recipe-images", object_path: `shared/${object}.webp`, visibility: "public_shared", state: "attached_public_shared" });
    expect((await request()).status).toBe(200);
    expect(download).toHaveBeenCalledWith(`shared/${object}.webp`);
  });

  it.each(["cleanup_pending", "uploaded_unlinked"])("rejects lifecycle state %s", async state => {
    mocks.projection.mockResolvedValueOnce({ ...projection, state });
    expect((await request()).status).toBe(500);
    expect(download).not.toHaveBeenCalled();
  });

  it.each([
    { object_path: "https://attacker.example/private-image" },
    { object_path: `../${owner}/2/${object}.webp` },
    { bucket_id: "other-users-private" },
    { object_path: `${owner}/3/${object}.webp` },
  ])("refuses arbitrary URLs, buckets, paths, or a mismatched generation: %j", async overrides => {
    mocks.projection.mockResolvedValueOnce({ ...projection, ...overrides });
    expect((await request()).status).toBe(500);
    expect(download).not.toHaveBeenCalled();
  });

  it("does not redirect to a legacy URL or accept an SVG as a managed upload", async () => {
    mocks.projection.mockResolvedValueOnce({ ...projection, image_object_id: null });
    expect((await request()).status).toBe(404);
    expect(download).not.toHaveBeenCalled();
    download.mockResolvedValueOnce({ data: new Blob(["<svg/>"], { type: "image/svg+xml" }), error: null });
    expect((await request()).status).toBe(500);
  });
});
