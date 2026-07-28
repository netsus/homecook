import {
  RECIPE_IMAGE_MAX_BYTES,
  type RecipeImageMimeType,
} from "./recipe-media";

const LEGACY_SOURCE_PATH_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/i;
const PRIVATE_TARGET_PATH_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[1-9][0-9]*\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/i;
const PUBLIC_TARGET_PATH_PATTERN
  = /^shared\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$/i;

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

export interface RecipeImageLegacyVisibilityStorageClient {
  storage: {
    from(bucketId: string): StorageBucket;
  };
}

interface AdapterInput {
  client: RecipeImageLegacyVisibilityStorageClient;
  operationTimeoutMs: number;
}

function mimeForPath(objectPath: string): RecipeImageMimeType | null {
  const extension = objectPath.toLowerCase().match(/\.([^.]+)$/u)?.[1];
  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }
  if (extension === "png") {
    return "image/png";
  }
  if (extension === "webp") {
    return "image/webp";
  }
  return null;
}

function validReadTarget(bucketId: string, objectPath: string) {
  return (
    bucketId === "recipe-images"
    && (
      LEGACY_SOURCE_PATH_PATTERN.test(objectPath)
      || PUBLIC_TARGET_PATH_PATTERN.test(objectPath)
    )
  ) || (
    bucketId === "recipe-images-private"
    && PRIVATE_TARGET_PATH_PATTERN.test(objectPath)
  );
}

function validWriteTarget(bucketId: string, objectPath: string) {
  return (
    bucketId === "recipe-images"
    && PUBLIC_TARGET_PATH_PATTERN.test(objectPath)
  ) || (
    bucketId === "recipe-images-private"
    && PRIVATE_TARGET_PATH_PATTERN.test(objectPath)
  );
}

function isNotFound(error: StorageError) {
  return error.status === 404 || error.statusCode === "404";
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

async function readBoundedStream(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
  expectedBytes: number,
) {
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const reader = stream.getReader();
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return totalBytes === expectedBytes
          ? {
            body: new Blob(chunks),
            kind: "found" as const,
          }
          : { kind: "failed" as const };
      }
      if (!(value instanceof Uint8Array)) {
        return { kind: "failed" as const };
      }
      if (value.byteLength > maxBytes - totalBytes) {
        try {
          await reader.cancel();
        } catch {
          // The hard byte bound stays enforced if cancellation fails.
        }
        return { kind: "oversized" as const };
      }
      const ownedChunk = new Uint8Array(value.byteLength);
      ownedChunk.set(value);
      chunks.push(ownedChunk);
      totalBytes += value.byteLength;
    }
  } catch {
    return { kind: "failed" as const };
  } finally {
    reader.releaseLock();
  }
}

export function createRecipeImageLegacyVisibilityStorageAdapter({
  client,
  operationTimeoutMs,
}: AdapterInput) {
  if (
    !Number.isSafeInteger(operationTimeoutMs)
    || operationTimeoutMs <= 0
  ) {
    throw new Error(
      "recipe image legacy visibility Storage configuration is invalid",
    );
  }

  return {
    async readObject({
      bucketId,
      maxBytes,
      objectPath,
    }: {
      bucketId: string;
      maxBytes: number;
      objectPath: string;
    }) {
      if (
        !validReadTarget(bucketId, objectPath)
        || !Number.isSafeInteger(maxBytes)
        || maxBytes <= 0
        || maxBytes > RECIPE_IMAGE_MAX_BYTES
      ) {
        return { kind: "failed" as const };
      }

      const bucket = client.storage.from(bucketId);
      const info = await beforeDeadline(
        () => bucket.info(objectPath),
        operationTimeoutMs,
      );
      if (!info) {
        return { kind: "failed" as const };
      }
      if (info.error) {
        return isNotFound(info.error)
          ? { kind: "absent" as const }
          : { kind: "failed" as const };
      }
      const size = info.data?.size;
      if (!Number.isSafeInteger(size) || Number(size) <= 0) {
        return { kind: "failed" as const };
      }
      if (Number(size) > maxBytes) {
        return { kind: "oversized" as const };
      }

      const controller = new AbortController();
      const result = await beforeDeadline(
        async () => {
          const download = await bucket.download(
            objectPath,
            {},
            { cache: "no-store", signal: controller.signal },
          ).asStream();
          if (download.error) {
            return isNotFound(download.error)
              ? { kind: "absent" as const }
              : { kind: "failed" as const };
          }
          if (!(download.data instanceof ReadableStream)) {
            return { kind: "failed" as const };
          }
          return readBoundedStream(
            download.data,
            maxBytes,
            Number(size),
          );
        },
        operationTimeoutMs,
        () => controller.abort(),
      );
      return result ?? { kind: "failed" as const };
    },

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
        !validWriteTarget(bucketId, objectPath)
        || upsert !== false
        || !(body instanceof Blob)
        || body.size <= 0
        || body.size > RECIPE_IMAGE_MAX_BYTES
        || body.type !== contentType
        || mimeForPath(objectPath) !== contentType
      ) {
        return { kind: "failed" as const };
      }

      const result = await beforeDeadline(
        () => client.storage.from(bucketId).upload(
          objectPath,
          body,
          { contentType, upsert: false },
        ),
        operationTimeoutMs,
      );
      return result
        && !result.error
        && result.data?.path === objectPath
        ? { kind: "uploaded" as const }
        : { kind: "failed" as const };
    },
  };
}
