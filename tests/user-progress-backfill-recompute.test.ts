import { describe, expect, it } from "vitest";

import {
  buildPlannerRegisteredBackfillEvents,
  dryRunUserProgressBackfill,
} from "@/lib/server/user-progress-backfill";

describe("user progress v2 backfill/recompute", () => {
  it("builds planner_registered backfill rows in deterministic meal order", () => {
    const events = buildPlannerRegisteredBackfillEvents({
      userId: "user-1",
      meals: [
        { id: "meal-b", created_at: "2026-06-10T10:00:00.000Z" },
        { id: "meal-a", created_at: "2026-06-10T09:00:00.000Z" },
      ],
    });

    expect(events.map((event) => event.source_id)).toEqual(["meal-a", "meal-b"]);
    expect(events[0]).toMatchObject({
      source_key: "planner_registered:first:user-1",
      xp_delta: 25,
      source_meta_json: { xp_kind: "first", level_curve_version: "v2", backfill: true },
    });
    expect(events[1]).toMatchObject({
      source_key: "planner_registered:meal-b",
      xp_delta: 5,
      source_meta_json: {
        xp_kind: "repeat",
        level_curve_version: "v2",
        backfill: true,
        cap_day_key: "2026-06-10",
      },
    });
  });

  it("dry-run recompute never creates notification or archive rows", () => {
    const result = dryRunUserProgressBackfill({
      userId: "user-1",
      existingEvents: [],
      plannerMeals: [{ id: "meal-a", created_at: "2026-06-10T09:00:00.000Z" }],
    });

    expect(result.would_insert_progress_events).toBe(1);
    expect(result.would_insert_notifications).toBe(0);
    expect(result.summary.level_curve_version).toBe("v2");
  });

  it("does not backfill repeat XP for the meal that already created the planner first event", () => {
    const result = dryRunUserProgressBackfill({
      userId: "user-1",
      existingEvents: [
        {
          event_type: "planner_registered",
          source_id: "meal-a",
          source_key: "planner_registered:first:user-1",
          xp_delta: 25,
          occurred_at: "2026-06-10T09:00:00.000Z",
          source_meta_json: { xp_kind: "first", level_curve_version: "v2" },
        },
      ],
      plannerMeals: [{ id: "meal-a", created_at: "2026-06-10T09:00:00.000Z" }],
    });

    expect(result.would_insert_progress_events).toBe(0);
    expect(result.summary.total_xp).toBe(25);
    expect(result.summary.event_counts).toMatchObject({
      planner_registered_first: 1,
      planner_registered_repeat: 0,
    });
  });

  it("applies the planner daily repeat cap during backfill", () => {
    const events = buildPlannerRegisteredBackfillEvents({
      userId: "user-1",
      meals: Array.from({ length: 5 }, (_, index) => ({
        id: `meal-day-${index + 1}`,
        created_at: `2026-06-10T0${index}:00:00.000Z`,
      })),
    });

    expect(events.map((event) => event.source_id)).toEqual([
      "meal-day-1",
      "meal-day-2",
      "meal-day-3",
      "meal-day-4",
    ]);
    expect(events.map((event) => event.xp_delta)).toEqual([25, 5, 5, 5]);
    expect(events.every((event) => event.source_meta_json.backfill === true)).toBe(true);
  });

  it("applies the planner weekly repeat cap during backfill", () => {
    const meals = Array.from({ length: 15 }, (_, index) => {
      const dayOffset = Math.floor(index / 3);
      const slot = index % 3;

      return {
        id: `meal-week-${index + 1}`,
        created_at: `2026-06-${String(8 + dayOffset).padStart(2, "0")}T0${slot}:00:00.000Z`,
      };
    });

    const events = buildPlannerRegisteredBackfillEvents({
      userId: "user-1",
      meals,
    });

    expect(events).toHaveLength(13);
    expect(events.map((event) => event.xp_delta)).toEqual([
      25,
      ...Array.from({ length: 12 }, () => 5),
    ]);
    expect(events.at(-1)?.source_id).toBe("meal-week-13");
  });
});
