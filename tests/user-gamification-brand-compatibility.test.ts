import { describe, expect, it } from "vitest";

import {
  toNotificationData,
  type UserProgressNotificationRow,
} from "@/lib/server/user-gamification";

function buildNotificationRow(
  notificationType: UserProgressNotificationRow["notification_type"],
  payload: Record<string, unknown>,
): UserProgressNotificationRow {
  return {
    id: "550e8400-e29b-41d4-a716-446655440001",
    notification_type: notificationType,
    priority: 4,
    delivery_channel: "toast",
    toast_eligible: true,
    group_key: null,
    payload_json: payload,
    created_at: "2026-07-13T00:00:00.000Z",
    seen_at: null,
  };
}

describe("system notification brand compatibility", () => {
  it.each([
    ["집밥 기록", "끼니 기록"],
    ["집밥 활동", "끼니 활동"],
    ["집밥 성장", "끼니 성장"],
  ])("canonicalizes the exact legacy label %s at read time", (legacyCopy, canonicalCopy) => {
    const row = buildNotificationRow("xp_awarded", {
      event_type: "cooking_completed",
      label: legacyCopy,
      xp_delta: 10,
    });

    const result = toNotificationData(row);

    expect(result.body).toBe(`${canonicalCopy} XP`);
    expect(result.payload.label).toBe(canonicalCopy);
  });

  it("canonicalizes the legacy first-cook badge row without rewriting stored payload", () => {
    const payload = {
      badge_key: "first_cook_done",
      label: "첫 집밥 완성",
    };
    const row = buildNotificationRow("badge_unlocked", payload);

    const first = toNotificationData(row);
    const second = toNotificationData(row);

    expect(first).toEqual(second);
    expect(first.payload.label).toBe("첫 요리 완성");
    expect(first.body).toBe("마이페이지에서 새 배지를 확인해 보세요.");
    expect(row.payload_json).toBe(payload);
    expect(payload).toEqual({
      badge_key: "first_cook_done",
      label: "첫 집밥 완성",
    });
  });

  it("preserves substrings, unmapped copy, and the stored payload across repeated reads", () => {
    const payload = {
      event_type: "cooking_completed",
      label: "사용자가 남긴 집밥 기록 이야기",
      xp_delta: 10,
    };
    const row = buildNotificationRow("xp_awarded", payload);

    const first = toNotificationData(row);
    const second = toNotificationData(row);

    expect(first).toEqual(second);
    expect(first.body).toBe("사용자가 남긴 집밥 기록 이야기 XP");
    expect(first.payload.label).toBe("사용자가 남긴 집밥 기록 이야기");
    expect(row.payload_json).toBe(payload);
    expect(payload).toEqual({
      event_type: "cooking_completed",
      label: "사용자가 남긴 집밥 기록 이야기",
      xp_delta: 10,
    });
  });
});
