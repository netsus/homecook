import { readVerifiedAccountGenerationSession } from "@/lib/server/account-generation/session-authority";
import { createUserGamificationProjectionWriter } from "@/lib/server/user-gamification-projection";
import { createGamificationProjectionInternalClient } from "@/lib/supabase/server";
import { fail, ok } from "@/lib/api/response";
import { readUserGamification } from "@/lib/server/user-gamification";
import type { UserGamificationData } from "@/types/user-gamification";

import { createAuthedGamificationClient } from "./_helpers";

export async function GET() {
  const { response, routeClient, dbClient, user } =
    await createAuthedGamificationClient("사용자 성장 정보를 불러오지 못했어요.");

  if (response) {
    return response;
  }

  let projectionWriter;
  try {
    const verified = await readVerifiedAccountGenerationSession(routeClient);
    if (!verified.ok || verified.sessionAuthority.ownerUuid !== user.id) {
      return fail("ACCOUNT_SESSION_STALE", "세션을 다시 확인해 주세요.", 409);
    }
    const client = createGamificationProjectionInternalClient();
    if (!client) {
      return fail("INTERNAL_ERROR", "사용자 성장 정보를 불러오지 못했어요.", 500);
    }
    projectionWriter = createUserGamificationProjectionWriter(client, verified.sessionAuthority);
  } catch {
    return fail("INTERNAL_ERROR", "사용자 성장 정보를 불러오지 못했어요.", 500);
  }

  const gamificationResult = await readUserGamification(dbClient, user.id, projectionWriter);

  if (gamificationResult.error || !gamificationResult.data) {
    return fail("INTERNAL_ERROR", "사용자 성장 정보를 불러오지 못했어요.", 500);
  }

  return ok<UserGamificationData>(gamificationResult.data);
}
