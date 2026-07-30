import { fail } from "@/lib/api/response";
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
  readExpectedRecipeImageStorageOrigin,
} from "@/lib/server/recipe-image-storage-origin";
import {
  createRecipeImageInternalClient,
  createRouteHandlerClient,
} from "@/lib/supabase/server";

const MANAGED_READ_URL_TTL_SECONDS = 300;
const MANAGED_TAKEOVER_READ_TIMEOUT_MS = 10_000;

type ManagedServiceRoleClient = ManagedRecipeImageRpcClient
  & ManagedRecipeImageStorageClient;

function isFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File;
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

  let expectedReadUrlOrigin: string;
  try {
    expectedReadUrlOrigin = readExpectedRecipeImageStorageOrigin();
  } catch {
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

  return createCapabilityUnavailableResponse();
}
