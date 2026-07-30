const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVATE_OBJECT_PATH_PATTERN
  = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([1-9][0-9]*)\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|jpeg|png|webp)$/i;
const PUBLIC_OBJECT_PATH_PATTERN
  = /^shared\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|jpeg|png|webp)$/i;

export interface ManagedRecipeImageReadProjection {
  image_object_id: string | null;
  bucket_id: string | null;
  object_path: string | null;
  owner_uuid: string | null;
  account_generation: number | null;
  visibility: string | null;
  state: string | null;
  reference_type: string | null;
}

export interface RecipeImageReadProjection extends ManagedRecipeImageReadProjection {
  recipe_id: string;
  legacy_thumbnail_url: string | null;
}

interface RecipeImageReadStorageBucket {
  createSignedUrl(
    path: string,
    expiresIn: number,
  ): PromiseLike<{
    data: { signedUrl?: string } | null;
    error: { message: string } | null;
  }>;
  getPublicUrl(path: string): {
    data: { publicUrl?: string } | null;
  };
}

export interface RecipeImageReadStorageClient {
  storage: {
    from(bucketId: string): RecipeImageReadStorageBucket;
  };
}

export interface RecipeImageReadRpcClient {
  rpc(
    functionName: "read_recipe_image_projections",
    input: { p_recipe_ids: string[] },
  ): PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
}

const PROJECTION_KEYS = [
  "account_generation",
  "bucket_id",
  "image_object_id",
  "legacy_thumbnail_url",
  "object_path",
  "owner_uuid",
  "recipe_id",
  "reference_type",
  "state",
  "visibility",
].sort();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactProjectionKeys(value: Record<string, unknown>) {
  return Object.keys(value).sort().join(",") === PROJECTION_KEYS.join(",");
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function nullablePositiveSafeInteger(value: unknown): value is number | null {
  return value === null
    || (Number.isSafeInteger(value) && typeof value === "number" && value > 0);
}

export function isRecipeImageProjectionAuthorityMissing(error: unknown) {
  return isRecord(error)
    && (error.code === "PGRST202" || error.code === "42883");
}

function parseProjection(value: unknown): RecipeImageReadProjection {
  if (
    !isRecord(value)
    || !hasExactProjectionKeys(value)
    || typeof value.recipe_id !== "string"
    || !UUID_PATTERN.test(value.recipe_id)
    || !nullableString(value.legacy_thumbnail_url)
    || !nullableString(value.image_object_id)
    || !nullableString(value.bucket_id)
    || !nullableString(value.object_path)
    || !nullableString(value.owner_uuid)
    || !nullablePositiveSafeInteger(value.account_generation)
    || !nullableString(value.visibility)
    || !nullableString(value.state)
    || !nullableString(value.reference_type)
  ) {
    throw new Error("managed recipe image read evidence is invalid");
  }

  return value as unknown as RecipeImageReadProjection;
}

export function normalizeExpectedRecipeImageStorageOrigin(value: string) {
  try {
    const url = new URL(value);
    const isLoopbackHttp = url.protocol === "http:"
      && (
        url.hostname === "127.0.0.1"
        || url.hostname === "localhost"
        || url.hostname === "[::1]"
      );
    if (
      (url.protocol !== "https:" && !isLoopbackHttp)
      || url.origin !== value
    ) {
      throw new Error();
    }
    return url.origin;
  } catch {
    throw new Error("managed recipe image read configuration is invalid");
  }
}

function assertExpectedReadUrl(value: unknown, expectedOrigin: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("managed recipe image read URL is unavailable");
  }

  try {
    const url = new URL(value);
    const expectedUrl = new URL(expectedOrigin);
    if (
      url.protocol !== expectedUrl.protocol
      || url.origin !== expectedOrigin
    ) {
      throw new Error();
    }
    return url.toString();
  } catch {
    throw new Error("managed recipe image read URL is unavailable");
  }
}

function legacyUrl(projection: RecipeImageReadProjection) {
  const managedValues = [
    projection.image_object_id,
    projection.bucket_id,
    projection.object_path,
    projection.owner_uuid,
    projection.account_generation,
    projection.visibility,
    projection.state,
    projection.reference_type,
  ];
  if (managedValues.some((value) => value !== null)) {
    throw new Error("managed recipe image read evidence is invalid");
  }

  if (projection.legacy_thumbnail_url === null) {
    return null;
  }
  const normalized = projection.legacy_thumbnail_url.trim();
  return normalized.length > 0 ? normalized : null;
}

export async function readRecipeImageProjection({
  client,
  recipeId,
}: {
  client: RecipeImageReadRpcClient;
  recipeId: string;
}) {
  if (!UUID_PATTERN.test(recipeId)) {
    throw new Error("managed recipe image projection input is invalid");
  }

  const result = await client.rpc("read_recipe_image_projections", {
    p_recipe_ids: [recipeId],
  });
  if (isRecipeImageProjectionAuthorityMissing(result.error)) {
    return null;
  }
  if (
    result.error
    || !Array.isArray(result.data)
    || result.data.length !== 1
  ) {
    throw new Error("managed recipe image projection is unavailable");
  }

  const projection = parseProjection(result.data[0]);
  if (projection.recipe_id !== recipeId) {
    throw new Error("managed recipe image read evidence is invalid");
  }
  return projection;
}

export async function resolveRecipeImageReadUrl({
  client,
  expectedOwnerUuid,
  expectedStorageOrigin,
  projection: rawProjection,
  signedUrlTtlSeconds,
}: {
  client: RecipeImageReadStorageClient;
  expectedOwnerUuid?: string | null;
  expectedStorageOrigin: string;
  projection: RecipeImageReadProjection;
  signedUrlTtlSeconds: number;
}) {
  const projection = parseProjection(rawProjection);

  if (projection.image_object_id === null) {
    return legacyUrl(projection);
  }

  return resolveManagedRecipeImageReadUrl({
    client,
    expectedOwnerUuid,
    expectedReferenceType: "recipe_thumbnail",
    expectedStorageOrigin,
    projection,
    signedUrlTtlSeconds,
  });
}

export async function resolveManagedRecipeImageReadUrl({
  client,
  expectedOwnerUuid,
  expectedReferenceType,
  expectedStorageOrigin,
  projection,
  signedUrlTtlSeconds,
}: {
  client: RecipeImageReadStorageClient;
  expectedOwnerUuid?: string | null;
  expectedReferenceType: "recipe_thumbnail" | "recipe_book_cover";
  expectedStorageOrigin: string;
  projection: ManagedRecipeImageReadProjection;
  signedUrlTtlSeconds: number;
}) {
  const expectedOrigin =
    normalizeExpectedRecipeImageStorageOrigin(expectedStorageOrigin);
  if (
    !Number.isSafeInteger(signedUrlTtlSeconds)
    || signedUrlTtlSeconds <= 0
  ) {
    throw new Error("managed recipe image read configuration is invalid");
  }
  if (
    typeof projection.image_object_id !== "string"
    || !UUID_PATTERN.test(projection.image_object_id)
    || !nullableString(projection.bucket_id)
    || !nullableString(projection.object_path)
    || !nullableString(projection.owner_uuid)
    || !nullablePositiveSafeInteger(projection.account_generation)
    || !nullableString(projection.visibility)
    || !nullableString(projection.state)
    || !nullableString(projection.reference_type)
    || projection.reference_type !== expectedReferenceType
  ) {
    throw new Error("managed recipe image read evidence is invalid");
  }

  if (
    projection.visibility === "private"
    && projection.state === "attached_private"
    && projection.bucket_id === "recipe-images-private"
    && typeof projection.object_path === "string"
    && typeof projection.owner_uuid === "string"
    && UUID_PATTERN.test(projection.owner_uuid)
    && typeof projection.account_generation === "number"
    && typeof expectedOwnerUuid === "string"
    && UUID_PATTERN.test(expectedOwnerUuid)
    && projection.owner_uuid.toLowerCase() === expectedOwnerUuid.toLowerCase()
  ) {
    const pathMatch = PRIVATE_OBJECT_PATH_PATTERN.exec(projection.object_path);
    if (
      pathMatch?.[1].toLowerCase() !== projection.owner_uuid.toLowerCase()
      || Number(pathMatch?.[2]) !== projection.account_generation
      || pathMatch?.[3].toLowerCase() !== projection.image_object_id.toLowerCase()
    ) {
      throw new Error("managed recipe image read evidence is invalid");
    }

    try {
      const result = await client.storage
        .from(projection.bucket_id)
        .createSignedUrl(projection.object_path, signedUrlTtlSeconds);
      if (result.error) {
        throw new Error();
      }
      return assertExpectedReadUrl(result.data?.signedUrl, expectedOrigin);
    } catch {
      throw new Error("managed recipe image read URL is unavailable");
    }
  }

  if (
    projection.visibility === "public_shared"
    && projection.state === "attached_public_shared"
    && projection.bucket_id === "recipe-images"
    && typeof projection.object_path === "string"
    && projection.owner_uuid === null
    && projection.account_generation === null
  ) {
    const pathMatch = PUBLIC_OBJECT_PATH_PATTERN.exec(projection.object_path);
    if (pathMatch?.[1].toLowerCase() !== projection.image_object_id.toLowerCase()) {
      throw new Error("managed recipe image read evidence is invalid");
    }

    try {
      const result = client.storage
        .from(projection.bucket_id)
        .getPublicUrl(projection.object_path);
      return assertExpectedReadUrl(result.data?.publicUrl, expectedOrigin);
    } catch {
      throw new Error("managed recipe image read URL is unavailable");
    }
  }

  throw new Error("managed recipe image read evidence is invalid");
}
