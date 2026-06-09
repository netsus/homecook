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
  }>;
}

function buildPlannerMealAddModalPath({
  columnId,
  date,
  slot,
  source,
}: Awaited<MenuAddPageProps["searchParams"]>) {
  const params = new URLSearchParams({
    restore: "meal-add-modal",
    returnSurface: "planner.meal-add-modal",
  });

  if (date) params.set("date", date);
  if (columnId) params.set("columnId", columnId);
  if (slot) params.set("slot", slot);
  if (source) params.set("source", source);

  return `/planner?${params.toString()}`;
}

export default async function MenuAddPage({ searchParams }: MenuAddPageProps) {
  redirect(buildPlannerMealAddModalPath(await searchParams));
}
