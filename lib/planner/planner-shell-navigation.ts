export type PlannerShellSegment = "plan" | "log";

export interface PlannerShellLocation {
  date: string;
  segment: PlannerShellSegment;
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateKey(value: string | null): value is string {
  if (!value || !DATE_KEY_PATTERN.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function readPlannerShellLocation(
  searchParams: Pick<URLSearchParams, "get">,
  fallbackDate: string,
): PlannerShellLocation {
  return {
    date: isValidDateKey(searchParams.get("date"))
      ? searchParams.get("date")!
      : fallbackDate,
    segment: searchParams.get("segment") === "log" ? "log" : "plan",
  };
}

export function buildPlannerShellHref(
  searchParams: URLSearchParams,
  location: PlannerShellLocation,
) {
  const next = new URLSearchParams(searchParams.toString());

  if (location.segment === "plan") {
    next.delete("segment");
  } else {
    next.set("segment", location.segment);
  }
  next.set("date", location.date);

  const query = next.toString();
  return query ? `/planner?${query}` : "/planner";
}
