import { fail } from "@/lib/api/response";
import {
  createAccountLifecycleMaintenanceResponse,
  createCapabilityUnavailableResponse,
  createLegacyHiddenResponse,
  readAccountGenerationCapability,
  readRequiredIdempotencyKey,
} from "@/app/api/v1/users/me/_account-generation";
import {
  readVerifiedAccountGenerationSession,
} from "@/lib/server/account-generation/session-authority";
import {
  runManagedRecipeImageCancel,
  type ManagedRecipeImageCancelRpcClient,
} from "@/lib/server/recipe-image-managed-cancel";
import {
  createManagedRecipeImageCancelResponse,
} from "@/lib/server/recipe-image-managed-response";
import {
  createRouteHandlerClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{
    image_object_id: string;
  }>;
}

const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request, context: RouteContext) {
  const routeClient = await createRouteHandlerClient();
  const authResult = await routeClient.auth.getUser();
  const user = authResult.data.user;

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const serviceRoleClient = createServiceRoleClient();
  if (!serviceRoleClient) {
    return fail("INTERNAL_ERROR", "이미지 업로드를 취소하지 못했어요.", 500);
  }

  const capability = await readAccountGenerationCapability(
    serviceRoleClient,
  );
  if (!capability.ok) {
    return createCapabilityUnavailableResponse();
  }
  if (capability.state === "legacy") {
    return createLegacyHiddenResponse();
  }
  if (capability.state === "cutover_maintenance") {
    return createAccountLifecycleMaintenanceResponse();
  }

  const { image_object_id: imageObjectId } = await context.params;
  if (!UUID_PATTERN.test(imageObjectId)) {
    return fail("IMAGE_NOT_FOUND", "이미지를 찾을 수 없어요.", 404);
  }

  const idempotencyKey = readRequiredIdempotencyKey(request);
  if (!idempotencyKey.ok) {
    return idempotencyKey.response;
  }

  const verifiedSession =
    await readVerifiedAccountGenerationSession(routeClient);
  if (
    !verifiedSession.ok
    || verifiedSession.sessionAuthority.ownerUuid !== user.id
  ) {
    return fail("INTERNAL_ERROR", "계정 상태를 확인하지 못했어요.", 500);
  }

  const result = await runManagedRecipeImageCancel({
    dbClient:
      serviceRoleClient as unknown as ManagedRecipeImageCancelRpcClient,
    idempotencyKey: idempotencyKey.idempotencyKey,
    imageObjectId,
    sessionAuthority: verifiedSession.sessionAuthority,
  });

  return createManagedRecipeImageCancelResponse(result);
}
