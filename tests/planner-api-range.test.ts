import { describe, expect, it } from "vitest";

import { createDefaultPlannerRange, shiftPlannerRange } from "@/lib/api/planner";

describe("planner range helpers", () => {
  it("creates a seven-day inclusive default range anchored to the base date", () => {
    const range = createDefaultPlannerRange(new Date("2026-04-10T12:00:00.000Z"));

    expect(range).toEqual({
      startDate: "2026-04-10",
      endDate: "2026-04-16",
    });
  });

  it("preserves the same seven-day span when shifting by a week", () => {
    const range = shiftPlannerRange(
      {
        startDate: "2026-04-10",
        endDate: "2026-04-16",
      },
      7,
    );

    expect(range).toEqual({
      startDate: "2026-04-17",
      endDate: "2026-04-23",
    });
  });
});
