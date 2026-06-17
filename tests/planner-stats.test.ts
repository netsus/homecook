import { describe, expect, it } from "vitest";

import {
  buildMypageRecordStats,
  buildPlannerMealStatusStats,
} from "@/lib/planner-stats";

describe("planner stats", () => {
  it("counts planner meal statuses from the same source for planner and mypage", () => {
    const statusStats = buildPlannerMealStatusStats([
      { status: "registered" },
      { status: "registered" },
      { status: "shopping_done" },
      { status: "cook_done" },
    ]);

    expect(statusStats).toEqual({
      cookDone: 1,
      registered: 2,
      shoppingDone: 1,
      total: 4,
    });

    expect(buildMypageRecordStats(statusStats)).toEqual({
      cooking: 1,
      planner: 4,
      shopping: 1,
    });
  });
});
