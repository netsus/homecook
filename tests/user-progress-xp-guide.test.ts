import { describe, expect, it } from "vitest";

import {
  USER_PROGRESS_XP_GUIDE_ITEMS,
  USER_PROGRESS_XP_POLICY,
} from "@/lib/user-progress-xp-policy";

describe("user progress XP guide policy", () => {
  it("uses the same XP values as the awarding policy", () => {
    expect(USER_PROGRESS_XP_GUIDE_ITEMS.length).toBeGreaterThan(0);

    for (const item of USER_PROGRESS_XP_GUIDE_ITEMS) {
      expect(item.first).toBe(USER_PROGRESS_XP_POLICY[item.eventType].first);
      expect(item.repeat).toBe(USER_PROGRESS_XP_POLICY[item.eventType].repeat);
    }
  });
});
