import { AppShell } from "@/components/layout/app-shell";
import { PlannerWeekScreen } from "@/components/planner/planner-week-screen";
import { getInitialAuthenticatedFromServer } from "@/lib/auth/server-initial-auth";
import { readPlannerShellLocation } from "@/lib/planner/planner-shell-navigation";
import { loadPlannerMealNutritionForServer } from "@/lib/server/planner-meal-nutrition-view";

export const metadata = {
  description: "이번 주 끼니를 등록하고 장보기와 요리 완료까지 관리하는 주간 플래너",
  title: "주간 플래너",
};

export default async function PlannerPage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string | string[] }>;
}) {
  const initialAuthenticated = await getInitialAuthenticatedFromServer();
  const query = await searchParams;
  const dateParam = Array.isArray(query?.date) ? query.date[0] : query?.date;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  const location = readPlannerShellLocation(new URLSearchParams(
    dateParam ? { date: dateParam } : {},
  ), today);
  const start = new Date(`${location.date}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const initialMealNutrition = initialAuthenticated
    ? await loadPlannerMealNutritionForServer({
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    })
    : {};

  return (
    <AppShell
      bottomTabsMode="hidden"
      className="wave1-planner-shell wave1-planner-web-shell"
      currentTab="planner"
      headerMode="hidden"
    >
      <PlannerWeekScreen
        initialAuthenticated={initialAuthenticated}
        initialMealNutrition={initialMealNutrition}
      />
    </AppShell>
  );
}
