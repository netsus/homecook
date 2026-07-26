import {
  getRecipeImageExtension,
  RECIPE_IMAGE_MAX_BYTES,
  type RecipeImageMimeType,
} from "./recipe-media";

const PRIVATE_RECIPE_IMAGE_BUCKET = "recipe-images-private";
const PRIVATE_OBJECT_PATH_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[1-9][0-9]*\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

interface StorageError {
  message: string;
  status?: number;
  statusCode?: string;
}

interface StorageDownloadBuilder {
  asStream(): PromiseLike<{
    data: ReadableStream<Uint8Array> | null;
    error: StorageError | null;
  }>;
}

interface StorageBucket {
  createSignedUrl(
    path: string,
    expiresIn: number,
  ): PromiseLike<{
    data: { signedUrl?: string } | null;
    error: StorageError | null;
  }>;
  download(
    path: string,
    options: Record<string, never>,
    parameters: {
      cache: "no-store";
      signal: AbortSignal;
    },
  ): StorageDownloadBuilder;
  info(path: string): PromiseLike<{
    data: { size?: number } | null;
    error: StorageError | null;
  }>;
  upload(
    path: string,
    body: Blob,
    options: {
      contentType: RecipeImageMimeType;
      upsert: false;
    },
  ): PromiseLike<{
    data: { path?: string } | null;
    error: StorageError | null;
  }>;
}

export interface ManagedRecipeImageStorageClient {
  storage: {
    from(bucketId: string): StorageBucket;
  };
}

interface AdapterInput {
  client: ManagedRecipeImageStorageClient;
  now?: () => Date;
  signedUrlTtlSeconds: number;
  takeoverReadTimeoutMs: number;
}

function validPrivateTarget(bucketId: string, objectPath: string) {
  return bucketId === PRIVATE_RECIPE_IMAGE_BUCKET
    && PRIVATE_OBJECT_PATH_PATTERN.test(objectPath);
}

function isNotFound(error: StorageError) {
  return error.status === 404 || error.statusCode === "404";
}

async function readBoundedStream(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<
  | { kind: "found"; body: Blob }
  | { kind: "oversized" }
  | { kind: "failed" }
> {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const reader = stream.getReader();
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return {
          body: new Blob(chunks),
          kind: "found",
        };
      }
      if (!(value instanceof Uint8Array)) {
        return { kind: "failed" };
      }
      if (value.byteLength > maxBytes - totalBytes) {
        try {
          await reader.cancel();
        } catch {
          // The byte bound remains enforced even if transport cancellation fails.
        }
        return { kind: "oversized" };
      }
      const ownedChunk = new Uint8Array(value.byteLength);
      ownedChunk.set(value);
      chunks.push(ownedChunk);
      totalBytes += value.byteLength;
    }
  } catch {
    return { kind: "failed" };
  } finally {
    reader.releaseLock();
  }
}

async function beforeDeadline<T>(
  operation: () => PromiseLike<T>,
  timeoutMs: number,
  onTimeout?: () => void,
): Promise<T | null> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation()),
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => {
          onTimeout?.();
          resolve(null);
        }, timeoutMs);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function createManagedRecipeImageStorageAdapter({
  client,
  now = () => new Date(),
  signedUrlTtlSeconds,
  takeoverReadTimeoutMs,
}: AdapterInput) {
  if (
    !Number.isSafeInteger(signedUrlTtlSeconds)
    || signedUrlTtlSeconds <= 0
    || !Number.isSafeInteger(takeoverReadTimeoutMs)
    || takeoverReadTimeoutMs <= 0
  ) {
    throw new Error("managed recipe image Storage configuration is invalid");
  }

  return {
    async uploadObject({
      body,
      bucketId,
      contentType,
      objectPath,
      upsert,
    }: {
      body: Blob;
      bucketId: string;
      contentType: RecipeImageMimeType;
      objectPath: string;
      upsert: false;
    }) {
      if (
        !validPrivateTarget(bucketId, objectPath)
        || upsert !== false
        || body.size <= 0
        || body.size > RECIPE_IMAGE_MAX_BYTES
        || body.type !== contentType
        || !objectPath.endsWith(
          `.${getRecipeImageExtension(contentType) ?? "invalid"}`,
        )
      ) {
        throw new Error("managed recipe image upload input is invalid");
      }

      const result = await client.storage.from(bucketId).upload(
        objectPath,
        body,
        { contentType, upsert: false },
      );
      if (
        result.error
        || !result.data
        || result.data.path !== objectPath
      ) {
        throw new Error("managed recipe image upload failed");
      }
    },

    async readTakeoverObject({
      bucketId,
      maxBytes,
      objectPath,
    }: {
      bucketId: string;
      maxBytes: number;
      objectPath: string;
    }): Promise<
      | { kind: "absent" }
      | { kind: "found"; body: Blob }
      | { kind: "oversized" }
      | { kind: "failed" }
    > {
      if (
        !validPrivateTarget(bucketId, objectPath)
        || !Number.isSafeInteger(maxBytes)
        || maxBytes <= 0
        || maxBytes > RECIPE_IMAGE_MAX_BYTES
      ) {
        return { kind: "failed" };
      }

      const bucket = client.storage.from(bucketId);
      const info = await beforeDeadline(
        () => bucket.info(objectPath),
        takeoverReadTimeoutMs,
      );
      if (!info) {
        return { kind: "failed" };
      }
      if (info.error) {
        return isNotFound(info.error)
          ? { kind: "absent" }
          : { kind: "failed" };
      }
      const size = info.data?.size;
      if (!Number.isSafeInteger(size) || Number(size) < 0) {
        return { kind: "failed" };
      }
      if (Number(size) > maxBytes) {
        return { kind: "oversized" };
      }

      const controller = new AbortController();
      const takeover = await beforeDeadline(
        async () => {
          const download = await bucket.download(
            objectPath,
            {},
            { cache: "no-store", signal: controller.signal },
          ).asStream();
          if (download.error) {
            return isNotFound(download.error)
              ? { kind: "absent" } as const
              : { kind: "failed" } as const;
          }
          if (!(download.data instanceof ReadableStream)) {
            return { kind: "failed" } as const;
          }
          return readBoundedStream(download.data, maxBytes);
        },
        takeoverReadTimeoutMs,
        () => controller.abort(),
      );

      return takeover ?? { kind: "failed" };
    },

    async issueReadUrl({
      bucketId,
      objectPath,
    }: {
      bucketId: string;
      objectPath: string;
    }) {
      if (!validPrivateTarget(bucketId, objectPath)) {
        throw new Error("managed recipe image signing input is invalid");
      }

      const result = await client.storage.from(bucketId).createSignedUrl(
        objectPath,
        signedUrlTtlSeconds,
      );
      const readUrl = result.data?.signedUrl;
      const nowMs = now().getTime();
      if (
        result.error
        || typeof readUrl !== "string"
        || readUrl.length === 0
        || !Number.isFinite(nowMs)
      ) {
        throw new Error("managed recipe image signing failed");
      }

      return {
        expiresAt: new Date(
          nowMs + signedUrlTtlSeconds * 1_000,
        ).toISOString(),
        readUrl,
      };
    },
  };
}
