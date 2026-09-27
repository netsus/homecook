import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { publishManualRecipe } from "@/lib/server/manual-recipe-publication";
const owner = "11111111-1111-4111-8111-111111111111";
const source = "22222222-2222-4222-8222-222222222222";
const target = "33333333-3333-4333-8333-333333333333";
const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const body = new Blob([bytes], { type: "image/png" });
const plan = { phase: "prepare", status: "copy_required", source_object_id: source, source_bucket_id: "recipe-images-private", source_object_path: `${owner}/1/${source}.png`, target_object_id: target, target_bucket_id: "recipe-images", target_object_path: `shared/${target}.png`, byte_size: bytes.length, raw_sha256: createHash("sha256").update(bytes).digest("hex"), actual_mime_type: "image/png" };
function setup() {
  const rpc = vi.fn().mockResolvedValueOnce({ data: plan, error: null }).mockResolvedValueOnce({ data: { ...plan, phase: "upload" }, error: null }).mockResolvedValue({ data: { status: "published", recipe: { id: source, visibility: "public" } }, error: null });
  const download = vi.fn().mockResolvedValue({ data: body, error: null });
  const upload = vi.fn().mockResolvedValue({ data: {}, error: null });
  const input = { rpcClient: { rpc }, storageClient: { storage: { from: vi.fn(() => ({ download, upload })) } }, authorityParams: { p_owner_uuid: owner }, idempotencyKey: target, recipeId: source, expectedUpdatedAt: "2026-09-27T00:00:00Z", nutritionSnapshot: {}, inputGuard: [] };
  return { input, rpc, download, upload };
}
describe("manual recipe image publication", () => {
  it("commits the public asset before PUT and acknowledges only after byte verification", async () => {
    const { input, rpc, upload, download } = setup();
    expect(await publishManualRecipe(input)).toEqual({ id: source, visibility: "public" });
    expect(upload).toHaveBeenCalledWith(`shared/${target}.png`, body, { contentType: "image/png", upsert: false });
    expect(download).toHaveBeenCalledTimes(2);
    expect(rpc.mock.invocationCallOrder[1]).toBeLessThan(upload.mock.invocationCallOrder[0]);
    expect(rpc.mock.calls[2][1].p_verified_image.copy_verified).toBe(true);
    expect(rpc.mock.calls[1][1].p_verified_image).toEqual({ target_object_id: target, raw_sha256: plan.raw_sha256, byte_size: bytes.length, actual_mime_type: "image/png" });
  });
  it("accepts an interrupted upload only after verifying the existing bytes", async () => {
    const { input, upload } = setup();
    upload.mockResolvedValue({ data: null, error: { message: "already exists" } });
    expect((await publishManualRecipe(input)).visibility).toBe("public");
  });
  it("never acknowledges readiness when the public copy differs", async () => {
    const { input, rpc, download } = setup();
    download.mockResolvedValueOnce({ data: body, error: null }).mockResolvedValueOnce({ data: new Blob(["bad"]), error: null });
    await expect(publishManualRecipe(input)).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("does not read storage for an already-published replay", async () => {
    const { input, rpc, download } = setup();
    rpc.mockReset().mockResolvedValue({ data: { status: "published", recipe: { id: source, visibility: "public" } }, error: null });
    expect(await publishManualRecipe(input)).toEqual({ id: source, visibility: "public" });
    expect(download).not.toHaveBeenCalled();
  });
  it("never writes a public blob if the runtime transaction fails", async () => {
    const { input, rpc, upload } = setup();
    rpc.mockReset().mockResolvedValueOnce({ data: plan, error: null }).mockResolvedValueOnce({ data: null, error: new Error("nutrition failed") });
    await expect(publishManualRecipe(input)).rejects.toThrow("nutrition failed");
    expect(upload).not.toHaveBeenCalled();
  });
  it("recovers a verified public PUT after a lost acknowledgement without reading the private original", async () => {
    const { input, rpc, upload } = setup();
    rpc.mockReset().mockResolvedValueOnce({ data: { ...plan, phase: "upload" }, error: null }).mockResolvedValue({ data: { status: "published", recipe: { id: source, visibility: "public" } }, error: null });
    expect((await publishManualRecipe(input)).visibility).toBe("public");
    expect(input.storageClient.storage.from).toHaveBeenCalledWith("recipe-images");
    expect(input.storageClient.storage.from).not.toHaveBeenCalledWith("recipe-images-private");
    expect(upload).not.toHaveBeenCalled();
  });
  it("does not acknowledge readiness after upload failure and never deletes a concurrent success", async () => {
    const { input, rpc, upload, download } = setup();
    upload.mockResolvedValue({ data: null, error: new Error("upload failed") });
    download.mockResolvedValueOnce({ data: body, error: null }).mockResolvedValueOnce({ data: null, error: new Error("missing") });
    await expect(publishManualRecipe(input)).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it.each([{ source_object_path: `${target}/1/${source}.png` }, { target_object_path: "other/image.png" }, { raw_sha256: "bad" }, { target_bucket_id: "private" }])("rejects unsafe copy evidence %j", async change => {
    const { input, rpc, download } = setup();
    rpc.mockReset().mockResolvedValue({ data: { ...plan, ...change }, error: null });
    await expect(publishManualRecipe(input)).rejects.toThrow();
    expect(download).not.toHaveBeenCalled();
  });
});
