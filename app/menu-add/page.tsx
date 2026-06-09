import { redirect } from "next/navigation";

interface MenuAddPageProps {
  searchParams: Promise<{
    columnId?: string;
    date?: string;
    restore?: string;
    returnSurface?: string;
    returnTo?: string;
    slot?: string;
    source?: string;
    youtubeUrl?: string;
  }>;
}

type MenuAddSearchParams = Awaited<MenuAddPageProps["searchParams"]>;

function appendOptionalParam(
  params: URLSearchParams,
  key: string,
  value: string | undefined,
) {
  if (value) {
    params.set(key, value);
  }
}

function buildDirectMealAddPath(
  target: "manual" | "youtube",
  {
    columnId,
    date,
    restore,
    returnSurface,
    returnTo,
    slot,
    youtubeUrl,
  }: MenuAddSearchParams,
) {
  const params = new URLSearchParams();

  appendOptionalParam(params, "date", date);
  appendOptionalParam(params, "columnId", columnId);
  appendOptionalParam(params, "slot", slot);
  appendOptionalParam(params, "returnTo", returnTo);
  appendOptionalParam(params, "returnSurface", returnSurface);
  appendOptionalParam(params, "restore", restore);

  if (target === "youtube") {
    appendOptionalParam(params, "youtubeUrl", youtubeUrl);
  }

  const queryString = params.toString();
  return queryString
    ? `/menu/add/${target}?${queryString}`
    : `/menu/add/${target}`;
}

function buildPlannerMealAddModalPath({
  columnId,
  date,
  slot,
  source,
  ...remainingParams
}: MenuAddSearchParams) {
  if (source === "manual" || source === "youtube") {
    return buildDirectMealAddPath(source, {
      columnId,
      date,
      slot,
      source,
      ...remainingParams,
    });
  }

  const plannerParams = new URLSearchParams({
    restore: "meal-add-modal",
    returnSurface: "planner.meal-add-modal",
  });

  if (date) plannerParams.set("date", date);
  if (columnId) plannerParams.set("columnId", columnId);
  if (slot) plannerParams.set("slot", slot);
  if (source) plannerParams.set("source", source);

  return `/planner?${plannerParams.toString()}`;
}

export default async function MenuAddPage({ searchParams }: MenuAddPageProps) {
  redirect(buildPlannerMealAddModalPath(await searchParams));
}
