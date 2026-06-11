import { requestMypage } from "@/lib/api/mypage";
import type {
  UserGamificationArchiveData,
  UserGamificationData,
  UserGamificationSeenData,
  UserGamificationTutorialDismissData,
} from "@/types/user-gamification";

export async function fetchUserGamification() {
  return requestMypage<UserGamificationData>("/api/v1/users/me/gamification");
}

export async function fetchUserGamificationArchive(
  options: { limit?: number; cursor?: string | null } = {},
) {
  const params = new URLSearchParams();

  if (typeof options.limit === "number" && Number.isFinite(options.limit)) {
    params.set("limit", String(options.limit));
  }

  if (options.cursor) {
    params.set("cursor", options.cursor);
  }

  const query = params.toString();

  return requestMypage<UserGamificationArchiveData>(
    `/api/v1/users/me/gamification/archive${query ? `?${query}` : ""}`,
  );
}

export async function markUserGamificationNotificationsSeen(
  notificationIds: string[],
) {
  return requestMypage<UserGamificationSeenData>(
    "/api/v1/users/me/gamification/notifications/seen",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ notification_ids: notificationIds }),
    },
  );
}

export async function dismissUserGamificationTutorialQuest(questKey: string) {
  return requestMypage<UserGamificationTutorialDismissData>(
    `/api/v1/users/me/gamification/tutorial-quests/${encodeURIComponent(questKey)}/dismiss`,
    {
      method: "POST",
    },
  );
}
