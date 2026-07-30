import { fail, ok } from "@/lib/api/response";
import {
  createAccountLifecycleMaintenanceResponse,
  createCapabilityUnavailableResponse,
  readAccountGenerationCapability,
  readRequiredIdempotencyKey,
} from "@/app/api/v1/users/me/_account-generation";
import {
  readVerifiedAccountGenerationSession,
} from "@/lib/server/account-generation/session-authority";
import {
  getRecipeImageExtension,
  isAllowedRecipeImageType,
  RECIPE_IMAGE_BUCKET,
  RECIPE_IMAGE_MAX_BYTES,
} from "@/lib/server/recipe-media";
import {
  createManagedRecipeImageUploadResponse,
} from "@/lib/server/recipe-image-managed-response";
import {
  createManagedRecipeImageStorageAdapter,
  type ManagedRecipeImageStorageClient,
} from "@/lib/server/recipe-image-managed-storage";
import {
  runManagedRecipeImageUpload,
  type ManagedRecipeImageRpcClient,
} from "@/lib/server/recipe-image-managed-upload";
import {
  inspectRecipeImageUpload,
} from "@/lib/server/recipe-image-upload";
import {
  runLegacyExternalWrite,
  type ExternalWriteRpcClient,
} from "@/lib/server/account-generation/external-write";
import {
  createRecipeImageInternalClient,
  createRouteHandlerClient,
} from "@/lib/supabase/server";

const MANAGED_READ_URL_TTL_SECONDS = 300;
const MANAGED_TAKEOVER_READ_TIMEOUT_MS = 10_000;

interface StorageBucket {
  upload(
    path: string,
    file: File,
    options: { contentType: string; upsert: false },
  ): PromiseLike<{
    data: { path?: string } | null;
    error: { message: string } | null;
  }>;
  getPublicUrl(path: string): { data: { publicUrl: string } };
}

interface StorageClient {
  storage: {
    from(bucket: typeof RECIPE_IMAGE_BUCKET): StorageBucket;
  };
}

type ServiceRoleStorageClient = StorageClient & ExternalWriteRpcClient;
type ManagedServiceRoleClient = ManagedRecipeImageRpcClient
  & ManagedRecipeImageStorageClient;

function isFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File;
}

function readExpectedStorageOrigin() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!configuredUrl) {
    return null;
  }

  try {
    const url = new URL(configuredUrl);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

async function runManagedUpload({
  request,
  routeClient,
  serviceRoleClient,
  userId,
}: {
  request: Request;
  routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>>;
  serviceRoleClient: ManagedServiceRoleClient;
  userId: string;
}) {
  const idempotencyKey = readRequiredIdempotencyKey(request);
  if (!idempotencyKey.ok) {
    return idempotencyKey.response;
  }

  const verifiedSession =
    await readVerifiedAccountGenerationSession(routeClient);
  if (
    !verifiedSession.ok
    || verifiedSession.sessionAuthority.ownerUuid !== userId
  ) {
    return fail("INTERNAL_ERROR", "계정 상태를 확인하지 못했어요.", 500);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail("VALIDATION_ERROR", "이미지 파일을 확인해 주세요.", 422, [
      { field: "image", reason: "invalid_multipart" },
    ]);
  }

  const image = formData.get("image");
  if (!isFile(image)) {
    return fail("VALIDATION_ERROR", "이미지 파일을 선택해 주세요.", 422, [
      { field: "image", reason: "required" },
    ]);
  }

  let inspection: Awaited<ReturnType<typeof inspectRecipeImageUpload>>;
  try {
    inspection = await inspectRecipeImageUpload(image);
  } catch {
    return fail("INTERNAL_ERROR", "이미지를 업로드하지 못했어요.", 500);
  }

  if (!inspection.ok) {
    if (inspection.reason === "too_large") {
      return fail(
        "IMAGE_TOO_LARGE",
        "이미지는 5MB 이하로 업로드해 주세요.",
        413,
        [{ field: "image", reason: "max_size" }],
      );
    }

    return fail(
      "IMAGE_MIME_MISMATCH",
      "이미지 파일 형식을 확인해 주세요.",
      422,
      [{ field: "image", reason: inspection.reason }],
    );
  }

  const expectedReadUrlOrigin = readExpectedStorageOrigin();
  if (!expectedReadUrlOrigin) {
    return fail("INTERNAL_ERROR", "이미지를 업로드하지 못했어요.", 500);
  }

  let storageAdapter: ReturnType<
    typeof createManagedRecipeImageStorageAdapter
  >;
  try {
    storageAdapter = createManagedRecipeImageStorageAdapter({
      client: serviceRoleClient,
      signedUrlTtlSeconds: MANAGED_READ_URL_TTL_SECONDS,
      takeoverReadTimeoutMs: MANAGED_TAKEOVER_READ_TIMEOUT_MS,
    });
  } catch {
    return fail("INTERNAL_ERROR", "이미지를 업로드하지 못했어요.", 500);
  }

  const result = await runManagedRecipeImageUpload({
    body: image,
    dbClient: serviceRoleClient,
    expectedReadUrlOrigin,
    idempotencyKey: idempotencyKey.idempotencyKey,
    inspection: inspection.value,
    issueReadUrl: storageAdapter.issueReadUrl,
    maxReadUrlTtlMs: MANAGED_READ_URL_TTL_SECONDS * 1_000,
    readTakeoverObject: storageAdapter.readTakeoverObject,
    sessionAuthority: verifiedSession.sessionAuthority,
    uploadObject: storageAdapter.uploadObject,
  });

  return createManagedRecipeImageUploadResponse(result);
}

export async function POST(request: Request) {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const serviceRoleClient = createRecipeImageInternalClient();
  if (!serviceRoleClient) {
    return fail("INTERNAL_ERROR", "이미지를 업로드하지 못했어요.", 500);
  }

  const capability = await readAccountGenerationCapability(
    serviceRoleClient,
  );
  if (!capability.ok) {
    return createCapabilityUnavailableResponse();
  }
  if (capability.state === "cutover_maintenance") {
    return createAccountLifecycleMaintenanceResponse();
  }
  if (capability.state === "generation_active") {
    return runManagedUpload({
      request,
      routeClient,
      serviceRoleClient:
        serviceRoleClient as unknown as ManagedServiceRoleClient,
      userId: user.id,
    });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail("VALIDATION_ERROR", "이미지 파일을 확인해 주세요.", 422, [
      { field: "image", reason: "invalid_multipart" },
    ]);
  }

  const image = formData.get("image");
  if (!isFile(image)) {
    return fail("VALIDATION_ERROR", "이미지 파일을 선택해 주세요.", 422, [
      { field: "image", reason: "required" },
    ]);
  }

  if (!isAllowedRecipeImageType(image.type)) {
    return fail("VALIDATION_ERROR", "jpeg, png, webp 이미지만 업로드할 수 있어요.", 422, [
      { field: "image", reason: "unsupported_type" },
    ]);
  }

  if (image.size > RECIPE_IMAGE_MAX_BYTES) {
    return fail("VALIDATION_ERROR", "이미지는 5MB 이하로 업로드해 주세요.", 422, [
      { field: "image", reason: "max_size" },
    ]);
  }

  const extension = getRecipeImageExtension(image.type);
  if (!extension) {
    return fail("VALIDATION_ERROR", "이미지 파일을 확인해 주세요.", 422, [
      { field: "image", reason: "unsupported_type" },
    ]);
  }

  const objectPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const legacyServiceRoleClient =
    serviceRoleClient as unknown as ServiceRoleStorageClient;
  const bucket = legacyServiceRoleClient.storage.from(RECIPE_IMAGE_BUCKET);
  const upload = async () => {
    const uploadResult = await bucket.upload(objectPath, image, {
      contentType: image.type,
      upsert: false,
    });

    if (uploadResult.error) {
      throw new Error("recipe image external write failed");
    }

    return uploadResult;
  };

  const guardedWrite = await runLegacyExternalWrite({
    client: legacyServiceRoleClient,
    objectPath,
    ownerUuid: user.id,
    write: upload,
  });

  if (!guardedWrite.ok) {
    return fail("INTERNAL_ERROR", "이미지를 업로드하지 못했어요.", 500);
  }

  const publicUrl = bucket.getPublicUrl(objectPath).data.publicUrl;

  return ok({
    thumbnail_url: publicUrl,
    storage_path: `${RECIPE_IMAGE_BUCKET}/${objectPath}`,
  }, { status: 201 });
}
