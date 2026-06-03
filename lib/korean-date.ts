export const KOREA_TIME_ZONE = "Asia/Seoul";

type DateInput = Date | string;

function parseDate(input: DateInput): Date | null {
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatKoreaDate(
  input: DateInput,
  options: Intl.DateTimeFormatOptions,
): string {
  const date = parseDate(input);
  if (!date) return "";

  return new Intl.DateTimeFormat("ko-KR", {
    ...options,
    timeZone: KOREA_TIME_ZONE,
  }).format(date);
}

export function formatKoreaWeekday(
  input: DateInput,
  weekday: "long" | "short" = "short",
): string {
  return formatKoreaDate(input, { weekday });
}

export function formatKoreaCompactDate(input: DateInput): string {
  const date = parseDate(input);
  if (!date) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "numeric",
    timeZone: KOREA_TIME_ZONE,
  }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return month && day ? `${month}/${day}` : "";
}
