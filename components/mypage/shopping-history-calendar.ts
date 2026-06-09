import type { ShoppingListHistoryItem } from "@/types/shopping";

const KOREA_TIME_ZONE = "Asia/Seoul";

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

function getKoreaDateTimeParts(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("ko-KR", {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "numeric",
    timeZone: KOREA_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  const hour = getPart("hour");
  const minute = getPart("minute");

  if (!year || !month || !day) {
    return null;
  }

  return {
    dateKey: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
    day,
    hour,
    minute,
    month,
    year,
  };
}

export function getShoppingHistoryCreatedDateKey(item: ShoppingListHistoryItem) {
  return getKoreaDateTimeParts(item.created_at)?.dateKey ?? item.created_at.slice(0, 10);
}

export function formatShoppingHistoryDateTime(value: string | null) {
  if (!value) {
    return "미완료";
  }

  const parts = getKoreaDateTimeParts(value);

  if (!parts) {
    return value;
  }

  return `${parts.year}. ${Number(parts.month)}. ${Number(parts.day)}. ${parts.hour}:${parts.minute}`;
}

function formatDateOnlyLabel(dateKey: string) {
  const [month, day] = dateKey.split("-").slice(1).map(Number);

  if (!month || !day) {
    return dateKey;
  }

  return `${month}월 ${day}일`;
}

export function formatShoppingHistoryMealRange(item: ShoppingListHistoryItem) {
  const startLabel = formatDateOnlyLabel(item.date_range_start);
  const endLabel = formatDateOnlyLabel(item.date_range_end);

  return item.date_range_start === item.date_range_end
    ? startLabel
    : `${startLabel} ~ ${endLabel}`;
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
    const dateKey = getShoppingHistoryCreatedDateKey(item);
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
