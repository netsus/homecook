import type { ShoppingListHistoryItem } from "@/types/shopping";

export interface ShoppingHistoryCalendarDay {
  dateKey: string;
  dayNumber: number | null;
  items: ShoppingListHistoryItem[];
}

export interface ShoppingHistoryCalendarMonth {
  days: ShoppingHistoryCalendarDay[];
  monthKey: string;
  title: string;
}

function getCreatedDateKey(item: ShoppingListHistoryItem) {
  return item.created_at.slice(0, 10);
}

function getMonthKey(dateKey: string) {
  return dateKey.slice(0, 7);
}

function formatMonthTitle(monthKey: string) {
  const [year, month] = monthKey.split("-");
  return `${year}년 ${Number(month)}월`;
}

function getMonthDayCount(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function buildMonthDays(
  monthKey: string,
  itemsByDate: Map<string, ShoppingListHistoryItem[]>,
) {
  const [year, month] = monthKey.split("-").map(Number);
  const monthIndex = month - 1;
  const firstDay = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const dayCount = getMonthDayCount(year, monthIndex);
  const days: ShoppingHistoryCalendarDay[] = [];

  for (let index = 0; index < firstDay; index += 1) {
    days.push({
      dateKey: `${monthKey}-blank-${index}`,
      dayNumber: null,
      items: [],
    });
  }

  for (let day = 1; day <= dayCount; day += 1) {
    const dateKey = `${monthKey}-${String(day).padStart(2, "0")}`;
    days.push({
      dateKey,
      dayNumber: day,
      items: itemsByDate.get(dateKey) ?? [],
    });
  }

  return days;
}

export function buildShoppingHistoryCalendarMonths(
  items: ShoppingListHistoryItem[],
): ShoppingHistoryCalendarMonth[] {
  const itemsByDate = new Map<string, ShoppingListHistoryItem[]>();
  const monthKeys = new Set<string>();

  items.forEach((item) => {
    const dateKey = getCreatedDateKey(item);
    const current = itemsByDate.get(dateKey) ?? [];
    itemsByDate.set(dateKey, [...current, item]);
    monthKeys.add(getMonthKey(dateKey));
  });

  return [...monthKeys]
    .sort((a, b) => b.localeCompare(a))
    .map((monthKey) => ({
      days: buildMonthDays(monthKey, itemsByDate),
      monthKey,
      title: formatMonthTitle(monthKey),
    }));
}
