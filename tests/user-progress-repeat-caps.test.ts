import { describe, expect, it } from "vitest";
import { isUserProgressRepeatCapExceeded, type UserProgressEventRow } from "@/lib/server/user-progress";

const sourceMeta = { xp_kind: "repeat", cap_day_key: "2026-06-10", cap_week_key: "2026-W24" };
function event(overrides: Partial<UserProgressEventRow> = {}): UserProgressEventRow {
  return {
    event_type: "planner_registered", source_key: "planner_registered:meal",
    xp_delta: 5, occurred_at: "2026-06-09T15:00:00.000Z",
    source_meta_json: { xp_kind: "repeat" }, ...overrides,
  };
}

describe("repeat XP cap period matching", () => {
  it("counts KST date fallback at the exact daily limit", () => {
    expect(isUserProgressRepeatCapExceeded("planner_registered", sourceMeta, [event(), event()])).toBe(false);
    expect(isUserProgressRepeatCapExceeded("planner_registered", sourceMeta, [event(), event(), event()])).toBe(true);
  });

  it("counts either a saved day key or the actual KST day", () => {
    const saved = event({ occurred_at: "2026-06-01T00:00:00Z", source_meta_json: sourceMeta });
    const fallback = event({ source_meta_json: { xp_kind: "repeat", cap_day_key: "old-key" } });
    expect(isUserProgressRepeatCapExceeded("planner_registered", sourceMeta, [saved, fallback, event()])).toBe(true);
  });

  it("ignores other activity types, first awards, and malformed metadata", () => {
    const rows = [
      event({ event_type: "custom_book_created" }),
      event({ source_meta_json: { xp_kind: "first" } }),
      event({ source_meta_json: null, occurred_at: "invalid" }),
      event({ source_meta_json: [sourceMeta], occurred_at: "invalid" }),
      event(), event(),
    ];
    expect(isUserProgressRepeatCapExceeded("planner_registered", sourceMeta, rows)).toBe(false);
  });

  it("uses the weekly threshold and resets at a KST Monday", () => {
    const rows = Array.from({ length: 12 }, () => event());
    const weekOnly = { xp_kind: "repeat", cap_week_key: "2026-W24" };
    expect(isUserProgressRepeatCapExceeded("planner_registered", weekOnly, rows.slice(1))).toBe(false);
    expect(isUserProgressRepeatCapExceeded("planner_registered", weekOnly, rows)).toBe(true);
    expect(isUserProgressRepeatCapExceeded("planner_registered", { ...weekOnly, cap_week_key: "2026-W25" }, rows)).toBe(false);
    const monday = rows.map((row) => ({ ...row, occurred_at: "2026-06-14T15:00:00Z" }));
    expect(isUserProgressRepeatCapExceeded("planner_registered", { ...weekOnly, cap_week_key: "2026-W25" }, monday)).toBe(true);
  });

  it("accepts stored weekly keys even when the event timestamp is outside that week", () => {
    const rows = Array.from({ length: 12 }, () => event({
      occurred_at: "2026-06-01T00:00:00Z", source_meta_json: sourceMeta,
    }));
    expect(isUserProgressRepeatCapExceeded("planner_registered", { xp_kind: "repeat", cap_week_key: "2026-W24" }, rows)).toBe(true);
  });

  it("checks daily completion before a weekly date fallback", () => {
    const rows = Array.from({ length: 3 }, () => event({
      occurred_at: "invalid", source_meta_json: { xp_kind: "repeat", cap_day_key: sourceMeta.cap_day_key },
    }));
    expect(isUserProgressRepeatCapExceeded("planner_registered", sourceMeta, rows)).toBe(true);
  });

  it("preserves custom-book limits and skips uncapped or first awards", () => {
    const rows = [event({ event_type: "custom_book_created" }), event({ event_type: "custom_book_created" })];
    expect(isUserProgressRepeatCapExceeded("custom_book_created", sourceMeta, rows)).toBe(true);
    expect(isUserProgressRepeatCapExceeded("shopping_completed", sourceMeta, rows)).toBe(false);
    expect(isUserProgressRepeatCapExceeded("planner_registered", { ...sourceMeta, xp_kind: "first" }, rows)).toBe(false);
  });
});
