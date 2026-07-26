const MICROSECONDS_PER_MILLISECOND = BigInt(1_000);
const TIMESTAMP_PATTERN
  = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;

export function millisecondsToMicroseconds(milliseconds: number) {
  return BigInt(milliseconds) * MICROSECONDS_PER_MILLISECOND;
}

export function parsePostgresTimestamp(value: unknown): {
  iso: string;
  microseconds: bigint;
  milliseconds: number;
} | null {
  if (typeof value !== "string") return null;
  const match = TIMESTAMP_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const leapYear = year % 4 === 0
    && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31, leapYear ? 29 : 28, 31, 30, 31, 30,
    31, 31, 30, 31, 30, 31,
  ][month - 1];
  const zone = match[8];
  const zoneHours = zone === "Z" ? 0 : Number(zone.slice(1, 3));
  const zoneMinutes = zone === "Z" ? 0 : Number(zone.slice(4, 6));
  if (
    year < 1
    || month < 1 || month > 12 || !daysInMonth
    || day < 1 || day > daysInMonth
    || hour > 23 || minute > 59 || second > 59
    || zoneHours > 14 || zoneMinutes > 59
    || (zoneHours === 14 && zoneMinutes !== 0)
  ) return null;

  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const fractionalMicros = (match[7] ?? "").padEnd(6, "0");
  const subMillisecondMicros = Number(fractionalMicros.slice(3));
  const iso = subMillisecondMicros === 0
    ? new Date(milliseconds).toISOString()
    : new Date(milliseconds).toISOString().replace(
        /\.\d{3}Z$/,
        `.${fractionalMicros}Z`,
      );
  return {
    iso,
    microseconds: millisecondsToMicroseconds(milliseconds)
      + BigInt(subMillisecondMicros),
    milliseconds,
  };
}
