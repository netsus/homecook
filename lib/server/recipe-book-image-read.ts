import {
  isRecipeImageProjectionAuthorityMissing,
  resolveManagedRecipeImageReadUrl,
  type RecipeImageReadStorageClient,
} from "@/lib/server/recipe-image-read";

const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RecipeBookImageReadProjection {
  book_id: string;
  legacy_cover_image_url: string | null;
  image_object_id: string | null;
  bucket_id: string | null;
  object_path: string | null;
  owner_uuid: string | null;
  account_generation: number | null;
  visibility: string | null;
  state: string | null;
  reference_type: string | null;
}

export interface RecipeBookImageReadRpcClient {
  rpc(
    functionName: "read_recipe_book_image_projections",
    input: { p_book_ids: string[] },
  ): PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
}

const PROJECTION_KEYS = [
  "account_generation",
  "book_id",
  "bucket_id",
  "image_object_id",
  "legacy_cover_image_url",
  "object_path",
  "owner_uuid",
  "reference_type",
  "state",
  "visibility",
].sort();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function nullablePositiveSafeInteger(value: unknown): value is number | null {
  return value === null
    || (Number.isSafeInteger(value) && typeof value === "number" && value > 0);
}

function parseProjection(value: unknown): RecipeBookImageReadProjection {
  if (
    !isRecord(value)
    || Object.keys(value).sort().join(",") !== PROJECTION_KEYS.join(",")
    || typeof value.book_id !== "string"
    || !UUID_PATTERN.test(value.book_id)
    || !nullableString(value.legacy_cover_image_url)
    || !nullableString(value.image_object_id)
    || !nullableString(value.bucket_id)
    || !nullableString(value.object_path)
    || !nullableString(value.owner_uuid)
    || !nullablePositiveSafeInteger(value.account_generation)
    || !nullableString(value.visibility)
    || !nullableString(value.state)
    || !nullableString(value.reference_type)
  ) {
    throw new Error("managed recipe book image read evidence is invalid");
  }

  return value as unknown as RecipeBookImageReadProjection;
}

export async function readRecipeBookImageProjections({
  bookIds,
  client,
}: {
  bookIds: string[];
  client: RecipeBookImageReadRpcClient;
}) {
  if (
    bookIds.length < 1
    || bookIds.length > 100
    || bookIds.some((bookId) => !UUID_PATTERN.test(bookId))
    || new Set(bookIds).size !== bookIds.length
  ) {
    throw new Error("managed recipe book image projection input is invalid");
  }

  const result = await client.rpc("read_recipe_book_image_projections", {
    p_book_ids: bookIds,
  });
  if (isRecipeImageProjectionAuthorityMissing(result.error)) {
    return null;
  }
  if (
    result.error
    || !Array.isArray(result.data)
    || result.data.length !== bookIds.length
  ) {
    throw new Error("managed recipe book image projection is unavailable");
  }

  return result.data.map((value, index) => {
    const projection = parseProjection(value);
    if (projection.book_id !== bookIds[index]) {
      throw new Error("managed recipe book image read evidence is invalid");
    }
    return projection;
  });
}

export async function resolveRecipeBookImageReadUrl({
  client,
  expectedOwnerUuid,
  expectedStorageOrigin,
  projection: rawProjection,
  signedUrlTtlSeconds,
}: {
  client: RecipeImageReadStorageClient;
  expectedOwnerUuid: string;
  expectedStorageOrigin: string;
  projection: RecipeBookImageReadProjection;
  signedUrlTtlSeconds: number;
}) {
  const projection = parseProjection(rawProjection);
  if (projection.image_object_id === null) {
    if (
      projection.bucket_id !== null
      || projection.object_path !== null
      || projection.owner_uuid !== null
      || projection.account_generation !== null
      || projection.visibility !== null
      || projection.state !== null
      || projection.reference_type !== null
    ) {
      throw new Error("managed recipe book image read evidence is invalid");
    }

    const legacyUrl = projection.legacy_cover_image_url?.trim();
    return legacyUrl ? legacyUrl : null;
  }

  return resolveManagedRecipeImageReadUrl({
    client,
    expectedOwnerUuid,
    expectedReferenceType: "recipe_book_cover",
    expectedStorageOrigin,
    projection,
    signedUrlTtlSeconds,
  });
}
