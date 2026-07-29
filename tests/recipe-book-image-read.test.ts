import { describe, expect, it, vi } from "vitest";

import {
  readRecipeBookImageProjections,
  resolveRecipeBookImageReadUrl,
  type RecipeBookImageReadProjection,
  type RecipeBookImageReadRpcClient,
} from "@/lib/server/recipe-book-image-read";
import type { RecipeImageReadStorageClient } from "@/lib/server/recipe-image-read";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const OBJECT_ID = "33333333-3333-4333-8333-333333333333";
const STORAGE_ORIGIN = "https://project.supabase.co";

function projection(
  overrides: Partial<RecipeBookImageReadProjection> = {},
): RecipeBookImageReadProjection {
  return {
    book_id: BOOK_ID,
    legacy_cover_image_url: "https://legacy.example/book.jpg",
    image_object_id: null,
    bucket_id: null,
    object_path: null,
    owner_uuid: null,
    account_generation: null,
    visibility: null,
    state: null,
    reference_type: null,
    ...overrides,
  };
}

function storageClient() {
  const bucket = {
    createSignedUrl: vi.fn(async () => ({
      data: {
        signedUrl:
          `${STORAGE_ORIGIN}/storage/v1/object/sign/recipe-images-private/path?token=short`,
      },
      error: null,
    })),
    getPublicUrl: vi.fn(() => ({
      data: {
        publicUrl:
          `${STORAGE_ORIGIN}/storage/v1/object/public/recipe-images/shared/${OBJECT_ID}.webp`,
      },
    })),
  };
  const client = {
    storage: {
      from: vi.fn(() => bucket),
    },
  } as unknown as RecipeImageReadStorageClient;

  return { bucket, client };
}

describe("recipe book image registry-aware read adapter", () => {
  it("uses legacy compatibility only while the projection authority is undeployed", async () => {
    const client = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: "PGRST202", message: "function not found" },
      })),
    } as unknown as RecipeBookImageReadRpcClient;

    await expect(readRecipeBookImageProjections({
      client,
      bookIds: [BOOK_ID],
    })).resolves.toBeNull();
  });

  it("preserves exact input order and rejects ambiguous authority output", async () => {
    const secondBookId = "44444444-4444-4444-8444-444444444444";
    const client = {
      rpc: vi.fn(async () => ({
        data: [
          projection(),
          projection({ book_id: secondBookId }),
        ],
        error: null,
      })),
    } as unknown as RecipeBookImageReadRpcClient;

    await expect(readRecipeBookImageProjections({
      client,
      bookIds: [BOOK_ID, secondBookId],
    })).resolves.toHaveLength(2);

    await expect(readRecipeBookImageProjections({
      client,
      bookIds: [BOOK_ID, BOOK_ID],
    })).rejects.toThrow("managed recipe book image projection input is invalid");

    const reversedClient = {
      rpc: vi.fn(async () => ({
        data: [
          projection({ book_id: secondBookId }),
          projection(),
        ],
        error: null,
      })),
    } as unknown as RecipeBookImageReadRpcClient;

    await expect(readRecipeBookImageProjections({
      client: reversedClient,
      bookIds: [BOOK_ID, secondBookId],
    })).rejects.toThrow("managed recipe book image read evidence is invalid");
  });

  it("keeps an unmanaged legacy cover URL", async () => {
    const { client } = storageClient();

    await expect(resolveRecipeBookImageReadUrl({
      client,
      expectedOwnerUuid: OWNER_ID,
      expectedStorageOrigin: STORAGE_ORIGIN,
      projection: projection(),
      signedUrlTtlSeconds: 300,
    })).resolves.toBe("https://legacy.example/book.jpg");
  });

  it("issues a fresh private signed URL for an attached cover", async () => {
    const objectPath = `${OWNER_ID}/7/${OBJECT_ID}.webp`;
    const { bucket, client } = storageClient();

    await expect(resolveRecipeBookImageReadUrl({
      client,
      expectedOwnerUuid: OWNER_ID,
      expectedStorageOrigin: STORAGE_ORIGIN,
      projection: projection({
        image_object_id: OBJECT_ID,
        bucket_id: "recipe-images-private",
        object_path: objectPath,
        owner_uuid: OWNER_ID,
        account_generation: 7,
        visibility: "private",
        state: "attached_private",
        reference_type: "recipe_book_cover",
      } as Partial<RecipeBookImageReadProjection>),
      signedUrlTtlSeconds: 300,
    })).resolves.toContain("/storage/v1/object/sign/");

    expect(bucket.createSignedUrl).toHaveBeenCalledWith(objectPath, 300);
  });

  it("fails closed when a private cover owner differs from the authorized book owner", async () => {
    const otherOwnerId = "44444444-4444-4444-8444-444444444444";
    const { client } = storageClient();

    await expect(resolveRecipeBookImageReadUrl({
      client,
      expectedOwnerUuid: OWNER_ID,
      expectedStorageOrigin: STORAGE_ORIGIN,
      projection: projection({
        image_object_id: OBJECT_ID,
        bucket_id: "recipe-images-private",
        object_path: `${otherOwnerId}/7/${OBJECT_ID}.webp`,
        owner_uuid: otherOwnerId,
        account_generation: 7,
        visibility: "private",
        state: "attached_private",
        reference_type: "recipe_book_cover",
      } as Partial<RecipeBookImageReadProjection>),
      signedUrlTtlSeconds: 300,
    })).rejects.toThrow("managed recipe image read evidence is invalid");
  });

  it("derives a public URL for an attached owner-neutral shared cover", async () => {
    const objectPath = `shared/${OBJECT_ID}.webp`;
    const { bucket, client } = storageClient();

    await expect(resolveRecipeBookImageReadUrl({
      client,
      expectedOwnerUuid: OWNER_ID,
      expectedStorageOrigin: STORAGE_ORIGIN,
      projection: projection({
        image_object_id: OBJECT_ID,
        bucket_id: "recipe-images",
        object_path: objectPath,
        owner_uuid: null,
        account_generation: null,
        visibility: "public_shared",
        state: "attached_public_shared",
        reference_type: "recipe_book_cover",
      } as Partial<RecipeBookImageReadProjection>),
      signedUrlTtlSeconds: 300,
    })).resolves.toContain("/storage/v1/object/public/");

    expect(bucket.getPublicUrl).toHaveBeenCalledWith(objectPath);
  });

  it("fails closed on a wrong reference type instead of using the legacy cover", async () => {
    const { client } = storageClient();

    await expect(resolveRecipeBookImageReadUrl({
      client,
      expectedOwnerUuid: OWNER_ID,
      expectedStorageOrigin: STORAGE_ORIGIN,
      projection: projection({
        image_object_id: OBJECT_ID,
        bucket_id: "recipe-images-private",
        object_path: `${OWNER_ID}/7/${OBJECT_ID}.webp`,
        visibility: "private",
        state: "attached_private",
        reference_type: "recipe_thumbnail",
      }),
      signedUrlTtlSeconds: 300,
    })).rejects.toThrow("managed recipe image read evidence is invalid");
  });
});
