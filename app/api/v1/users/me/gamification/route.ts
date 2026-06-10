import { fail, ok } from "@/lib/api/response";
import { readUserGamification } from "@/lib/server/user-gamification";
import type { UserGamificationData } from "@/types/user-gamification";

import { createAuthedGamificationClient } from "./_helpers";

export async function GET() {
  const { response, dbClient, user } =
    await createAuthedGamificationClient("사용자 성장 정보를 불러오지 못했어요.");

  if (response) {
    return response;
  }

  const gamificationResult = await readUserGamification(dbClient, user.id);

  if (gamificationResult.error || !gamificationResult.data) {
    return fail("INTERNAL_ERROR", "사용자 성장 정보를 불러오지 못했어요.", 500);
  }

  return ok<UserGamificationData>(gamificationResult.data);
}
