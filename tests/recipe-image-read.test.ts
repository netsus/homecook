import { describe, expect, it, vi } from "vitest";

import {
  normalizeExpectedRecipeImageStorageOrigin,
  readRecipeImageProjection,
  resolveRecipeImageReadUrl,
  type RecipeImageReadRpcClient,
  type RecipeImageReadProjection,
  type RecipeImageReadStorageClient,
} from "@/lib/server/recipe-image-read";

const RECIPE_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";
const OBJECT_ID = "33333333-3333-4333-8333-333333333333";
const STORAGE_ORIGIN = "https://project.supabase.co";

function projection(
  overrides: Partial<RecipeImageReadProjection> = {},
): RecipeImageReadProjection {
  return {
    recipe_id: RECIPE_ID,
    legacy_thumbnail_url: "https://legacy.example/recipe.jpg",
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

function storageClient(overrides: {
  createSignedUrl?: ReturnType<typeof vi.fn>;
  getPublicUrl?: ReturnType<typeof vi.fn>;
} = {}) {
  const bucket = {
    createSignedUrl: overrides.createSignedUrl ?? vi.fn(async () => ({
      data: {
        signedUrl:
          `${STORAGE_ORIGIN}/storage/v1/object/sign/recipe-images-private/path?token=short`,
      },
      error: null,
    })),
    getPublicUrl: overrides.getPublicUrl ?? vi.fn(() => ({
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

describe("recipe image registry-aware read adapter", () => {
  it("allows HTTP only for loopback local Supabase origins", () => {
    expect(normalizeExpectedRecipeImageStorageOrigin(
      "http://127.0.0.1:54321",
    )).toBe("http://127.0.0.1:54321");
    expect(normalizeExpectedRecipeImageStorageOrigin(
      "http://localhost:54321",
    )).toBe("http://localhost:54321");
    expect(normalizeExpectedRecipeImageStorageOrigin(
      "http://[::1]:54321",
    )).toBe("http://[::1]:54321");
    expect(() => normalizeExpectedRecipeImageStorageOrigin(
      "http://supabase.internal:54321",
    )).toThrow("managed recipe image read configuration is invalid");
  });

  it("uses the compatibility path only while the projection authority is not deployed", async () => {
    const client = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: "PGRST202", message: "function not found" },
      })),
    } as unknown as RecipeImageReadRpcClient;

    await expect(readRecipeImageProjection({
      client,
      recipeId: RECIPE_ID,
    })).resolves.toBeNull();
  });

  it("fails closed on projection errors other than an undeployed authority", async () => {
    const client = {
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: "57014", message: "query cancelled" },
      })),
    } as unknown as RecipeImageReadRpcClient;

    await expect(readRecipeImageProjection({
      client,
      recipeId: RECIPE_ID,
    })).rejects.toThrow("managed recipe image projection is unavailable");
  });

  it("keeps the legacy URL when no managed reference exists", async () => {
    const { client } = storageClient();

    await expect(resolveRecipeImageReadUrl({
      client,
      expectedStorageOrigin: STORAGE_ORIGIN,
      projection: projection(),
      signedUrlTtlSeconds: 300,
    })).resolves.toBe("https://legacy.example/recipe.jpg");

    expect(client.storage.from).not.toHaveBeenCalled();
  });

  it("issues a fresh private signed URL for an attached private object", async () => {
    const objectPath = `${OWNER_ID}/7/${OBJECT_ID}.webp`;
    const { bucket, client } = storageClient();

    await expect(resolveRecipeImageReadUrl({
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
        reference_type: "recipe_thumbnail",
      } as Partial<RecipeImageReadProjection>),
      signedUrlTtlSeconds: 300,
    })).resolves.toContain("/storage/v1/object/sign/");

    expect(client.storage.from).toHaveBeenCalledWith("recipe-images-private");
    expect(bucket.createSignedUrl).toHaveBeenCalledWith(objectPath, 300);
  });

  it("fails closed when a private object owner does not match the authorized recipe owner", async () => {
    const otherOwnerId = "44444444-4444-4444-8444-444444444444";
    const { client } = storageClient();

    await expect(resolveRecipeImageReadUrl({
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
        reference_type: "recipe_thumbnail",
      } as Partial<RecipeImageReadProjection>),
      signedUrlTtlSeconds: 300,
    })).rejects.toThrow("managed recipe image read evidence is invalid");
  });

  it("fails closed when a private object path generation differs from registry authority", async () => {
    const { client } = storageClient();

    await expect(resolveRecipeImageReadUrl({
      client,
      expectedOwnerUuid: OWNER_ID,
      expectedStorageOrigin: STORAGE_ORIGIN,
      projection: projection({
        image_object_id: OBJECT_ID,
        bucket_id: "recipe-images-private",
        object_path: `${OWNER_ID}/8/${OBJECT_ID}.webp`,
        owner_uuid: OWNER_ID,
        account_generation: 7,
        visibility: "private",
        state: "attached_private",
        reference_type: "recipe_thumbnail",
      } as Partial<RecipeImageReadProjection>),
      signedUrlTtlSeconds: 300,
    })).rejects.toThrow("managed recipe image read evidence is invalid");
  });

  it("derives a public URL for an attached owner-neutral shared object", async () => {
    const objectPath = `shared/${OBJECT_ID}.webp`;
    const { bucket, client } = storageClient();

    await expect(resolveRecipeImageReadUrl({
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
        reference_type: "recipe_thumbnail",
      } as Partial<RecipeImageReadProjection>),
      signedUrlTtlSeconds: 300,
    })).resolves.toContain("/storage/v1/object/public/");

    expect(client.storage.from).toHaveBeenCalledWith("recipe-images");
    expect(bucket.getPublicUrl).toHaveBeenCalledWith(objectPath);
  });

  it("accepts an exact loopback public URL for local Supabase", async () => {
    const objectPath = `shared/${OBJECT_ID}.webp`;
    const localOrigin = "http://127.0.0.1:54321";
    const { client } = storageClient({
      getPublicUrl: vi.fn(() => ({
        data: {
          publicUrl:
            `${localOrigin}/storage/v1/object/public/recipe-images/${objectPath}`,
        },
      })),
    });

    await expect(resolveRecipeImageReadUrl({
      client,
      expectedStorageOrigin: localOrigin,
      projection: projection({
        image_object_id: OBJECT_ID,
        bucket_id: "recipe-images",
        object_path: objectPath,
        visibility: "public_shared",
        state: "attached_public_shared",
        reference_type: "recipe_thumbnail",
      }),
      signedUrlTtlSeconds: 300,
    })).resolves.toContain("/storage/v1/object/public/");
  });

  it("fails closed instead of using legacy URL for malformed managed evidence", async () => {
    const { client } = storageClient();

    await expect(resolveRecipeImageReadUrl({
      client,
      expectedStorageOrigin: STORAGE_ORIGIN,
      projection: projection({
        image_object_id: OBJECT_ID,
        bucket_id: "recipe-images-private",
        object_path: `wrong/${OBJECT_ID}.webp`,
        visibility: "private",
        state: "attached_private",
        reference_type: "recipe_thumbnail",
      }),
      signedUrlTtlSeconds: 300,
    })).rejects.toThrow("managed recipe image read evidence is invalid");
  });

  it("fails closed when Storage cannot issue the managed URL", async () => {
    const { client } = storageClient({
      createSignedUrl: vi.fn(async () => ({
        data: null,
        error: { message: "unavailable" },
      })),
    });

    await expect(resolveRecipeImageReadUrl({
      client,
      expectedOwnerUuid: OWNER_ID,
      expectedStorageOrigin: STORAGE_ORIGIN,
      projection: projection({
        image_object_id: OBJECT_ID,
        bucket_id: "recipe-images-private",
        object_path: `${OWNER_ID}/7/${OBJECT_ID}.webp`,
        owner_uuid: OWNER_ID,
        account_generation: 7,
        visibility: "private",
        state: "attached_private",
        reference_type: "recipe_thumbnail",
      }),
      signedUrlTtlSeconds: 300,
    })).rejects.toThrow("managed recipe image read URL is unavailable");
  });
});
