import { describe, expect, it } from "vitest";

import { compactGrowthNotificationsForDisplay } from "@/lib/gamification-notifications";
import type { UserGamificationNotificationData } from "@/types/user-gamification";

function makeNotification(
  overrides: Partial<UserGamificationNotificationData> & {
    id: string;
    notification_type: UserGamificationNotificationData["notification_type"];
  },
): UserGamificationNotificationData {
  const { id, notification_type: notificationType, ...rest } = overrides;

  return {
    category: "tutorial",
    body: "알림",
    created_at: "2026-06-14T10:00:00.000Z",
    delivery_channel: "toast",
    group_key: "progress-event:recipebook",
    id,
    notification_type: notificationType,
    payload: {},
    priority: 2,
    seen_at: null,
    title: "업적 달성!",
    toast_eligible: true,
    ...rest,
  };
}

describe("compactGrowthNotificationsForDisplay", () => {
  it("keeps distinct achievements from the same source action while merging XP only once", () => {
    const items = [
      makeNotification({
        id: "achievement-recipebook",
        notification_type: "achievement_unlocked",
        body: "첫 레시피북 생성 배지를 획득했어요.",
        payload: {
          achievement_key: "tutorial_recipebook_created",
          badge_key: "tutorial_recipebook_created",
        },
      }),
      makeNotification({
        id: "achievement-complete",
        notification_type: "achievement_unlocked",
        body: "튜토리얼 완료 배지를 획득했어요.",
        payload: {
          achievement_key: "tutorial_complete",
          badge_key: "tutorial_complete",
        },
      }),
      makeNotification({
        id: "xp-recipebook",
        notification_type: "xp_awarded",
        body: "레시피북 생성 XP",
        payload: { event_type: "custom_book_created", xp_delta: 30 },
        priority: 4,
        title: "+30 XP 획득",
      }),
    ];

    const compacted = compactGrowthNotificationsForDisplay(items);

    expect(compacted.map((item) => item.id)).toEqual([
      "achievement-recipebook",
      "achievement-complete",
    ]);
    expect(compacted[0]?.body).toContain("+30 XP");
    expect(compacted[1]?.body).not.toContain("+30 XP");
    expect(compacted[0]?.payload.merged_notification_ids).toEqual([
      "achievement-recipebook",
      "xp-recipebook",
    ]);
    expect(compacted[1]?.payload.merged_notification_ids).toEqual([
      "achievement-complete",
    ]);
  });
});
