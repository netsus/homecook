import { describe, expect, it } from "vitest";

import {
  buildShoppingHistoryCalendarMonths,
  formatShoppingHistoryCompletionDate,
  formatShoppingHistoryMealRange,
} from "@/components/mypage/shopping-history-calendar";
import type { ShoppingListHistoryItem } from "@/types/shopping";

function createHistoryItem(
  overrides: Partial<ShoppingListHistoryItem>,
): ShoppingListHistoryItem {
  return {
    completed_at: null,
    created_at: "2026-04-30T15:10:00Z",
    date_range_end: "2026-05-06",
    date_range_start: "2026-04-30",
    id: "list-1",
    is_completed: false,
    item_count: 3,
    title: "4/30~5/6",
    ...overrides,
  };
}

describe("shopping history calendar", () => {
  it("places shopping cards by the created date in Korea time", () => {
    const item = createHistoryItem({});
    const months = buildShoppingHistoryCalendarMonths([item]);

    expect(months[0]?.monthKey).toBe("2026-05");
    expect(months[0]?.title).toBe("2026년 5월");
    const createdDay = months[0]?.days.find((day) => day.dayNumber === 1);
    expect(createdDay?.items).toEqual([item]);
  });

  it("shows newer months before older months when history spans many months", () => {
    const months = buildShoppingHistoryCalendarMonths([
      createHistoryItem({
        id: "list-april",
        created_at: "2026-04-23T00:00:00Z",
      }),
      createHistoryItem({
        id: "list-june",
        created_at: "2026-06-03T00:00:00Z",
      }),
      createHistoryItem({
        id: "list-may",
        created_at: "2026-05-01T00:00:00Z",
      }),
    ]);

    expect(months.map((month) => month.monthKey)).toEqual([
      "2026-06",
      "2026-05",
      "2026-04",
    ]);
  });

  it("formats completed dates and meal-range labels in compact display styles", () => {
    expect(formatShoppingHistoryCompletionDate("2026-04-30T15:10:00Z")).toBe(
      "5/1",
    );
    expect(formatShoppingHistoryCompletionDate(null)).toBe("미완료");
    expect(formatShoppingHistoryMealRange(createHistoryItem({}))).toBe(
      "4월 30일 ~ 5월 6일",
    );
    expect(
      formatShoppingHistoryMealRange(
        createHistoryItem({
          date_range_end: "2026-04-30",
        }),
      ),
    ).toBe("4월 30일");
  });
});
