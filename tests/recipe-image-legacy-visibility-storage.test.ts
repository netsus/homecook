import { describe, expect, it, vi } from "vitest";

import { RECIPE_IMAGE_MAX_BYTES } from "@/lib/server/recipe-media";
import {
  createRecipeImageLegacyVisibilityStorageAdapter,
  type RecipeImageLegacyVisibilityStorageClient,
} from "@/lib/server/recipe-image-legacy-visibility-storage";

const OWNER_UUID = "11111111-1111-4111-8111-111111111111";
const SOURCE_OBJECT_ID = "22222222-2222-4222-8222-222222222222";
const TARGET_OBJECT_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE_PATH = `${OWNER_UUID}/${SOURCE_OBJECT_ID}.png`;
const PRIVATE_TARGET_PATH = `${OWNER_UUID}/7/${TARGET_OBJECT_ID}.png`;
const PUBLIC_TARGET_PATH = `shared/${TARGET_OBJECT_ID}.jpg`;

function setup(overrides: {
  download?: ReturnType<typeof vi.fn>;
  info?: ReturnType<typeof vi.fn>;
  upload?: ReturnType<typeof vi.fn>;
} = {}) {
  const bucket = {
    download: overrides.download ?? vi.fn(() => ({
      asStream: vi.fn(async () => ({
        data: new Blob([new Uint8Array([1, 2, 3])]).stream(),
        error: null,
      })),
    })),
    info: overrides.info ?? vi.fn(async () => ({
      data: { size: 3 },
      error: null,
    })),
    upload: overrides.upload ?? vi.fn(async (path: string) => ({
      data: { path },
      error: null,
    })),
  };
  const client = {
    storage: {
      from: vi.fn(() => bucket),
    },
  } as unknown as RecipeImageLegacyVisibilityStorageClient;
  const adapter = createRecipeImageLegacyVisibilityStorageAdapter({
    client,
    operationTimeoutMs: 2_000,
  });
  return { adapter, bucket, client };
}

describe("recipe image legacy visibility Storage adapter", () => {
  it.each([
    ["recipe-images", SOURCE_PATH],
    ["recipe-images-private", PRIVATE_TARGET_PATH],
    ["recipe-images", PUBLIC_TARGET_PATH],
  ])("reads the exact allowlisted %s object path", async (
    bucketId,
    objectPath,
  ) => {
    const { adapter, bucket, client } = setup();

    await expect(adapter.readObject({
      bucketId,
      maxBytes: RECIPE_IMAGE_MAX_BYTES,
      objectPath,
    })).resolves.toMatchObject({
      body: expect.any(Blob),
      kind: "found",
    });
    expect(client.storage.from).toHaveBeenCalledWith(bucketId);
    expect(bucket.download).toHaveBeenCalledWith(
      objectPath,
      {},
      {
        cache: "no-store",
        signal: expect.any(AbortSignal),
      },
    );
  });

  it("uploads private and public/shared targets with upsert disabled", async () => {
    const { adapter, bucket } = setup();
    const privateBody = new Blob(
      [new Uint8Array([1, 2, 3])],
      { type: "image/png" },
    );
    const publicBody = new Blob(
      [new Uint8Array([4, 5, 6])],
      { type: "image/jpeg" },
    );

    await expect(adapter.uploadObject({
      body: privateBody,
      bucketId: "recipe-images-private",
      contentType: "image/png",
      objectPath: PRIVATE_TARGET_PATH,
      upsert: false,
    })).resolves.toEqual({ kind: "uploaded" });
    await expect(adapter.uploadObject({
      body: publicBody,
      bucketId: "recipe-images",
      contentType: "image/jpeg",
      objectPath: PUBLIC_TARGET_PATH,
      upsert: false,
    })).resolves.toEqual({ kind: "uploaded" });
    expect(bucket.upload).toHaveBeenNthCalledWith(
      1,
      PRIVATE_TARGET_PATH,
      privateBody,
      { contentType: "image/png", upsert: false },
    );
    expect(bucket.upload).toHaveBeenNthCalledWith(
      2,
      PUBLIC_TARGET_PATH,
      publicBody,
      { contentType: "image/jpeg", upsert: false },
    );
  });

  it("rejects cross-bucket, owner-scoped public and mismatched MIME writes", async () => {
    const { adapter, bucket } = setup();

    await expect(adapter.uploadObject({
      body: new Blob([new Uint8Array([1])], { type: "image/png" }),
      bucketId: "recipe-images",
      contentType: "image/png",
      objectPath: PRIVATE_TARGET_PATH,
      upsert: false,
    })).resolves.toEqual({ kind: "failed" });
    await expect(adapter.uploadObject({
      body: new Blob([new Uint8Array([1])], { type: "image/jpeg" }),
      bucketId: "recipe-images",
      contentType: "image/jpeg",
      objectPath: `${OWNER_UUID}/${TARGET_OBJECT_ID}.jpg`,
      upsert: false,
    })).resolves.toEqual({ kind: "failed" });
    await expect(adapter.uploadObject({
      body: new Blob([new Uint8Array([1])], { type: "image/jpeg" }),
      bucketId: "recipe-images-private",
      contentType: "image/jpeg",
      objectPath: PRIVATE_TARGET_PATH,
      upsert: false,
    })).resolves.toEqual({ kind: "failed" });
    expect(bucket.upload).not.toHaveBeenCalled();
  });

  it("maps 404 to absent and fails closed on oversized or transport errors", async () => {
    const absent = setup({
      info: vi.fn(async () => ({
        data: null,
        error: { message: "missing", status: 404, statusCode: "404" },
      })),
    });
    await expect(absent.adapter.readObject({
      bucketId: "recipe-images",
      maxBytes: RECIPE_IMAGE_MAX_BYTES,
      objectPath: SOURCE_PATH,
    })).resolves.toEqual({ kind: "absent" });

    const oversized = setup({
      info: vi.fn(async () => ({
        data: { size: RECIPE_IMAGE_MAX_BYTES + 1 },
        error: null,
      })),
    });
    await expect(oversized.adapter.readObject({
      bucketId: "recipe-images",
      maxBytes: RECIPE_IMAGE_MAX_BYTES,
      objectPath: SOURCE_PATH,
    })).resolves.toEqual({ kind: "oversized" });
    expect(oversized.bucket.download).not.toHaveBeenCalled();

    const failed = setup({
      info: vi.fn(async () => ({
        data: null,
        error: { message: "forbidden", status: 403, statusCode: "403" },
      })),
    });
    await expect(failed.adapter.readObject({
      bucketId: "recipe-images",
      maxBytes: RECIPE_IMAGE_MAX_BYTES,
      objectPath: SOURCE_PATH,
    })).resolves.toEqual({ kind: "failed" });
  });

  it("fails closed when downloaded bytes are shorter than Storage metadata", async () => {
    const { adapter } = setup({
      info: vi.fn(async () => ({
        data: { size: 4 },
        error: null,
      })),
    });

    await expect(adapter.readObject({
      bucketId: "recipe-images",
      maxBytes: RECIPE_IMAGE_MAX_BYTES,
      objectPath: SOURCE_PATH,
    })).resolves.toEqual({ kind: "failed" });
  });

  it("never exposes a delete operation", () => {
    const { adapter } = setup();

    expect(adapter).not.toHaveProperty("deleteObject");
  });
});
