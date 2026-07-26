import { describe, expect, it, vi } from "vitest";

import { RECIPE_IMAGE_MAX_BYTES } from "@/lib/server/recipe-media";
import {
  createManagedRecipeImageStorageAdapter,
  type ManagedRecipeImageStorageClient,
} from "@/lib/server/recipe-image-managed-storage";

const BUCKET_ID = "recipe-images-private";
const OBJECT_PATH
  = "11111111-1111-4111-8111-111111111111/7/33333333-3333-4333-8333-333333333333.png";
const NOW = "2026-07-26T02:00:00.000Z";

function setup(overrides: {
  createSignedUrl?: ReturnType<typeof vi.fn>;
  download?: ReturnType<typeof vi.fn>;
  exists?: ReturnType<typeof vi.fn>;
  info?: ReturnType<typeof vi.fn>;
  upload?: ReturnType<typeof vi.fn>;
} = {}) {
  const bucket = {
    createSignedUrl: overrides.createSignedUrl ?? vi.fn(async () => ({
      data: {
        signedUrl:
          `https://storage.invalid/storage/v1/object/sign/${BUCKET_ID}/${OBJECT_PATH}?token=signed`,
      },
      error: null,
    })),
    download: overrides.download ?? vi.fn(() => ({
      asStream: vi.fn(async () => ({
        data: new Blob([new Uint8Array([1, 2, 3])]).stream(),
        error: null,
      })),
    })),
    exists: overrides.exists ?? vi.fn(async () => ({
      data: true,
      error: null,
    })),
    info: overrides.info ?? vi.fn(async () => ({
      data: { size: 3 },
      error: null,
    })),
    upload: overrides.upload ?? vi.fn(async () => ({
      data: { path: OBJECT_PATH },
      error: null,
    })),
  };
  const client = {
    storage: {
      from: vi.fn(() => bucket),
    },
  } as unknown as ManagedRecipeImageStorageClient;
  const adapter = createManagedRecipeImageStorageAdapter({
    client,
    now: () => new Date(NOW),
    signedUrlTtlSeconds: 300,
    takeoverReadTimeoutMs: 2_000,
  });

  return { adapter, bucket, client };
}

describe("managed recipe image Storage adapter", () => {
  it("uploads only to the exact private path with upsert disabled", async () => {
    const { adapter, bucket, client } = setup();
    const body = new Blob(
      [new Uint8Array([1, 2, 3])],
      { type: "image/png" },
    );

    await expect(adapter.uploadObject({
      body,
      bucketId: BUCKET_ID,
      contentType: "image/png",
      objectPath: OBJECT_PATH,
      upsert: false,
    })).resolves.toBeUndefined();

    expect(client.storage.from).toHaveBeenCalledWith(BUCKET_ID);
    expect(bucket.upload).toHaveBeenCalledWith(OBJECT_PATH, body, {
      contentType: "image/png",
      upsert: false,
    });
  });

  it.each([
    {
      data: null,
      error: { message: "unavailable" },
      label: "Storage error",
    },
    {
      data: { path: "wrong/path.png" },
      error: null,
      label: "wrong returned path",
    },
  ])("fails closed on $label after upload", async ({ data, error }) => {
    const { adapter } = setup({
      upload: vi.fn(async () => ({ data, error })),
    });

    await expect(adapter.uploadObject({
      body: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      bucketId: BUCKET_ID,
      contentType: "image/png",
      objectPath: OBJECT_PATH,
      upsert: false,
    })).rejects.toThrow("managed recipe image upload failed");
  });

  it("maps an info 404 to an absent takeover object", async () => {
    const { adapter, bucket } = setup({
      info: vi.fn(async () => ({
        data: null,
        error: {
          message: "not found",
          status: 404,
          statusCode: "404",
        },
      })),
    });

    await expect(adapter.readTakeoverObject({
      bucketId: BUCKET_ID,
      maxBytes: RECIPE_IMAGE_MAX_BYTES,
      objectPath: OBJECT_PATH,
    })).resolves.toEqual({ kind: "absent" });
    expect(bucket.download).not.toHaveBeenCalled();
  });

  it.each([
    {
      expected: { kind: "present" },
      response: { data: { size: 4 }, error: null },
    },
    {
      expected: { kind: "absent" },
      response: {
        data: null,
        error: {
          message: "not found",
          status: 404,
          statusCode: "404",
        },
      },
    },
    {
      expected: { kind: "failed" },
      response: {
        data: null,
        error: {
          message: "forbidden",
          status: 403,
          statusCode: "403",
        },
      },
    },
  ])(
    "checks exact terminal object presence without listing or downloading: $expected.kind",
    async ({ expected, response }) => {
      const info = vi.fn(async () => response);
      const { adapter, bucket } = setup({ info });

      await expect(adapter.checkObjectPresence({
        bucketId: BUCKET_ID,
        objectPath: OBJECT_PATH,
      })).resolves.toEqual(expected);
      expect(info).toHaveBeenCalledWith(OBJECT_PATH);
      expect(bucket.exists).not.toHaveBeenCalled();
      expect(bucket.download).not.toHaveBeenCalled();
    },
  );

  it("fails closed before Storage for a non-canonical terminal target", async () => {
    const { adapter, bucket } = setup();

    await expect(adapter.checkObjectPresence({
      bucketId: "recipe-images",
      objectPath: OBJECT_PATH,
    })).resolves.toEqual({ kind: "failed" });
    expect(bucket.info).not.toHaveBeenCalled();
  });

  it("maps a download 404 race to an absent takeover object", async () => {
    const { adapter } = setup({
      download: vi.fn(() => ({
        asStream: vi.fn(async () => ({
          data: null,
          error: {
            message: "not found",
            status: 404,
            statusCode: "404",
          },
        })),
      })),
    });

    await expect(adapter.readTakeoverObject({
      bucketId: BUCKET_ID,
      maxBytes: RECIPE_IMAGE_MAX_BYTES,
      objectPath: OBJECT_PATH,
    })).resolves.toEqual({ kind: "absent" });
  });

  it("rejects oversized metadata without downloading object bytes", async () => {
    const { adapter, bucket } = setup({
      info: vi.fn(async () => ({
        data: { size: RECIPE_IMAGE_MAX_BYTES + 1 },
        error: null,
      })),
    });

    await expect(adapter.readTakeoverObject({
      bucketId: BUCKET_ID,
      maxBytes: RECIPE_IMAGE_MAX_BYTES,
      objectPath: OBJECT_PATH,
    })).resolves.toEqual({ kind: "oversized" });
    expect(bucket.download).not.toHaveBeenCalled();
  });

  it("downloads a bounded takeover object without cache", async () => {
    const { adapter, bucket } = setup();

    await expect(adapter.readTakeoverObject({
      bucketId: BUCKET_ID,
      maxBytes: RECIPE_IMAGE_MAX_BYTES,
      objectPath: OBJECT_PATH,
    })).resolves.toMatchObject({
      body: expect.any(Blob),
      kind: "found",
    });
    expect(bucket.download).toHaveBeenCalledWith(
      OBJECT_PATH,
      {},
      {
        cache: "no-store",
        signal: expect.any(AbortSignal),
      },
    );
  });

  it("stops a takeover stream when bytes grow beyond the metadata bound", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      cancel,
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3, 4]));
      },
    });
    const asStream = vi.fn(async () => ({
      data: stream,
      error: null,
    }));
    const { adapter } = setup({
      download: vi.fn(() => ({ asStream })),
      info: vi.fn(async () => ({
        data: { size: 2 },
        error: null,
      })),
    });

    await expect(adapter.readTakeoverObject({
      bucketId: BUCKET_ID,
      maxBytes: 3,
      objectPath: OBJECT_PATH,
    })).resolves.toEqual({ kind: "oversized" });
    expect(asStream).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([
    {
      download: undefined,
      info: vi.fn(async () => ({
        data: null,
        error: { message: "forbidden", status: 403, statusCode: "403" },
      })),
      label: "non-404 info error",
    },
    {
      download: vi.fn(() => ({
        asStream: vi.fn(async () => ({
          data: null,
          error: { message: "download failed" },
        })),
      })),
      info: undefined,
      label: "download error",
    },
  ])("fails closed on $label", async ({ download, info }) => {
    const { adapter } = setup({ download, info });

    await expect(adapter.readTakeoverObject({
      bucketId: BUCKET_ID,
      maxBytes: RECIPE_IMAGE_MAX_BYTES,
      objectPath: OBJECT_PATH,
    })).resolves.toEqual({ kind: "failed" });
  });

  it("aborts a takeover download at the configured deadline", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const { adapter } = setup({
        download: vi.fn((
          _path: string,
          _options: Record<string, never>,
          parameters: { signal: AbortSignal },
        ) => ({
          asStream: () => {
          signal = parameters.signal;
          return new Promise(() => undefined);
          },
        })),
      });
      const result = adapter.readTakeoverObject({
        bucketId: BUCKET_ID,
        maxBytes: RECIPE_IMAGE_MAX_BYTES,
        objectPath: OBJECT_PATH,
      });

      await vi.advanceTimersByTimeAsync(2_000);

      await expect(result).resolves.toEqual({ kind: "failed" });
      expect(signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("issues a signed URL and computes its injected short expiry", async () => {
    const { adapter, bucket } = setup();

    await expect(adapter.issueReadUrl({
      bucketId: BUCKET_ID,
      objectPath: OBJECT_PATH,
    })).resolves.toEqual({
      expiresAt: "2026-07-26T02:05:00.000Z",
      readUrl:
        `https://storage.invalid/storage/v1/object/sign/${BUCKET_ID}/${OBJECT_PATH}?token=signed`,
    });
    expect(bucket.createSignedUrl).toHaveBeenCalledWith(OBJECT_PATH, 300);
  });

  it("fails signed URL issuance on a Storage error or empty result", async () => {
    const { adapter } = setup({
      createSignedUrl: vi.fn(async () => ({
        data: null,
        error: { message: "signing failed" },
      })),
    });

    await expect(adapter.issueReadUrl({
      bucketId: BUCKET_ID,
      objectPath: OBJECT_PATH,
    })).rejects.toThrow("managed recipe image signing failed");
  });
});
