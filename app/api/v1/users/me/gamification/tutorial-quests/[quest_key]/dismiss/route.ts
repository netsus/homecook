import { fail, ok } from "@/lib/api/response";
import { dismissUserGamificationTutorialQuest } from "@/lib/server/user-gamification";
import type { UserGamificationTutorialDismissData } from "@/types/user-gamification";

import { createAuthedGamificationClient } from "../../../_helpers";

interface RouteContext {
  params: Promise<{
    quest_key: string;
  }>;
}

export async function POST(_request: Request, context: RouteContext) {
  const { quest_key: questKey } = await context.params;
  const { response, dbClient, user } =
    await createAuthedGamificationClient("튜토리얼 퀘스트 상태를 저장하지 못했어요.");

  if (response) {
    return response;
  }

  const dismissResult = await dismissUserGamificationTutorialQuest(dbClient, user.id, questKey);

  if (dismissResult.error?.code === "UNKNOWN_TUTORIAL_QUEST") {
    return fail("RESOURCE_NOT_FOUND", "튜토리얼 퀘스트를 찾을 수 없어요.", 404);
  }

  if (dismissResult.error || !dismissResult.data) {
    return fail("INTERNAL_ERROR", "튜토리얼 퀘스트 상태를 저장하지 못했어요.", 500);
  }

  return ok<UserGamificationTutorialDismissData>(dismissResult.data);
}
