import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  createManagedRecipeImageStorageAdapter,
  type ManagedRecipeImageStorageClient,
} from "@/lib/server/recipe-image-managed-storage";
import { isLocalStorageLiveEnvAvailable } from
  "./recipe-image-storage-live-guard";

const storageUrl = process.env.HOMECOOK_STORAGE_LIVE_URL;
const serviceRoleKey =
  process.env.HOMECOOK_STORAGE_LIVE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.HOMECOOK_STORAGE_LIVE_DB_URL;
const liveStorageAvailable = isLocalStorageLiveEnvAvailable({
  databaseUrl,
  serviceRoleKey,
  storageUrl,
});

describe.skipIf(!liveStorageAvailable)(
  "recipe image terminal tombstone local Storage",
  () => {
    it("observes an exact private object before and after removal", async () => {
      const ownerUuid = randomUUID();
      const objectId = randomUUID();
      const bucketId = "recipe-images-private";
      const objectPath = `${ownerUuid}/1/${objectId}.png`;
      const client = createClient(storageUrl!, serviceRoleKey!, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });
      const existingBucket = await client.storage.getBucket(bucketId);
      if (existingBucket.error) {
        const creation = await client.storage.createBucket(bucketId, {
          public: false,
        });
        expect(creation.error).toBeNull();
      }
      const bucket = client.storage.from(bucketId);
      const adapter = createManagedRecipeImageStorageAdapter({
        client: client as unknown as ManagedRecipeImageStorageClient,
        signedUrlTtlSeconds: 300,
        takeoverReadTimeoutMs: 2_000,
      });

      try {
        const upload = await bucket.upload(
          objectPath,
          new Blob([new Uint8Array([137, 80, 78, 71])], {
            type: "image/png",
          }),
          { contentType: "image/png", upsert: false },
        );
        expect(upload.error).toBeNull();

        await expect(adapter.checkObjectPresence({
          bucketId,
          objectPath,
        })).resolves.toEqual({ kind: "present" });

        await expect(adapter.deleteObject({
          bucketId,
          objectPath,
        })).resolves.toEqual({ kind: "deleted" });

        await expect(adapter.checkObjectPresence({
          bucketId,
          objectPath,
        })).resolves.toEqual({ kind: "absent" });
      } finally {
        const removal = await bucket.remove([objectPath]);
        expect(removal.error).toBeNull();
      }
    });
  },
);
