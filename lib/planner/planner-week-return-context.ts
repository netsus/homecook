export const PLANNER_WEEK_RETURN_CONTEXT_KEY =
  "homecook.planner-week-return-context.v1";

export interface PlannerWeekReturnContext {
  version: 1;
  startDate: string;
  endDate: string;
  selectedDate: string;
  columnId: string | null;
  slotName: string | null;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>) {
  const expected = [
    "columnId",
    "endDate",
    "selectedDate",
    "slotName",
    "startDate",
    "version",
  ];
  const actual = Object.keys(value).sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function inclusiveDayCount(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
  return Math.floor((end - start) / 86_400_000) + 1;
}

function isSafeOptionalText(value: unknown, max: number): value is string | null {
  return value === null ||
    (typeof value === "string" && value.length > 0 && value.length <= max);
}

function parseContext(value: unknown): PlannerWeekReturnContext | null {
  if (!isPlainRecord(value) || !hasExactKeys(value) || value.version !== 1) return null;
  if (
    !isValidDate(value.startDate) ||
    !isValidDate(value.endDate) ||
    value.startDate > value.endDate ||
    inclusiveDayCount(value.startDate, value.endDate) > 7 ||
    !isValidDate(value.selectedDate) ||
    value.selectedDate < value.startDate ||
    value.selectedDate > value.endDate ||
    !isSafeOptionalText(value.columnId, 160) ||
    !isSafeOptionalText(value.slotName, 80) ||
    (value.columnId === null) !== (value.slotName === null)
  ) {
    return null;
  }

  return value as unknown as PlannerWeekReturnContext;
}

export function clearPlannerWeekReturnContext() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PLANNER_WEEK_RETURN_CONTEXT_KEY);
  } catch {
    // Storage is an optional local return aid.
  }
}

export function readPlannerWeekReturnContext() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PLANNER_WEEK_RETURN_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = parseContext(JSON.parse(raw));
    if (!parsed) clearPlannerWeekReturnContext();
    return parsed;
  } catch {
    clearPlannerWeekReturnContext();
    return null;
  }
}

export function savePlannerWeekReturnContext(context: PlannerWeekReturnContext) {
  if (typeof window === "undefined") return;
  const safe = parseContext(context);
  if (!safe) {
    clearPlannerWeekReturnContext();
    return;
  }
  try {
    window.sessionStorage.setItem(
      PLANNER_WEEK_RETURN_CONTEXT_KEY,
      JSON.stringify(safe),
    );
  } catch {
    // The unchanged /planner URL remains a safe fallback.
  }
}
