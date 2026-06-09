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

export function formatShoppingHistoryCompletionDate(value: string | null) {
  if (!value) {
    return "미완료";
  }

  const parts = getKoreaDateTimeParts(value);

  if (!parts) {
    return value;
  }

  return `${Number(parts.month)}/${Number(parts.day)}`;
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

export function getLatestShoppingHistoryDateKey(
  months: ShoppingHistoryCalendarMonth[],
) {
  for (const month of months) {
    const dateKey = getLatestShoppingHistoryDateKeyInMonth(month);
    if (dateKey) return dateKey;
  }

  return "";
}

export function getLatestShoppingHistoryDateKeyInMonth(
  month: ShoppingHistoryCalendarMonth | null | undefined,
) {
  if (!month) return "";

  for (const day of [...month.days].reverse()) {
    if (day.items.length > 0) {
      return day.dateKey;
    }
  }

  return "";
}

export function getShoppingHistoryMonthIndexForDateKey(
  months: ShoppingHistoryCalendarMonth[],
  dateKey: string,
) {
  if (!dateKey) return -1;

  const monthKey = dateKey.slice(0, 7);
  return months.findIndex((month) => month.monthKey === monthKey);
}

export function findShoppingHistoryDay(
  months: ShoppingHistoryCalendarMonth[],
  dateKey: string,
) {
  if (!dateKey) return null;

  for (const month of months) {
    const day = month.days.find(
      (candidate) => candidate.dateKey === dateKey && candidate.items.length > 0,
    );

    if (day) return day;
  }

  return null;
}

export function sortShoppingHistoryItemsForDisplay(
  items: ShoppingListHistoryItem[],
) {
  return [...items].sort((left, right) => {
    const byCreatedAt = right.created_at.localeCompare(left.created_at);
    if (byCreatedAt !== 0) return byCreatedAt;

    return right.id.localeCompare(left.id);
  });
}

export function formatShoppingDateKeyLong(dateKey: string) {
  const [, month, day] = dateKey.split("-").map(Number);

  if (!month || !day) {
    return dateKey;
  }

  return `${month}월 ${day}일`;
}

export function buildShoppingDayAriaLabel(day: ShoppingHistoryCalendarDay) {
  const completedCount = day.items.filter((item) => item.is_completed).length;
  const activeCount = day.items.length - completedCount;
  const statusParts = [
    activeCount > 0 ? `진행 중 ${activeCount}개` : "",
    completedCount > 0 ? `완료 ${completedCount}개` : "",
  ].filter(Boolean);

  return `${formatShoppingDateKeyLong(day.dateKey)} 만든 장보기 ${day.items.length}개, ${statusParts.join(", ")}`;
}
