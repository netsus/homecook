import { describe, expect, it } from "vitest";

import {
  buildShoppingHistoryCalendarMonths,
  formatShoppingHistoryDateTime,
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
    title: "4월 30일 ~ 5월 6일 끼니",
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

  it("formats created, completed, and meal-range labels in the same display style", () => {
    expect(formatShoppingHistoryDateTime("2026-04-30T15:10:00Z")).toBe(
      "2026. 5. 1. 00:10",
    );
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
