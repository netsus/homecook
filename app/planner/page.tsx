import { AppShell } from "@/components/layout/app-shell";
import { PlannerWeekScreen } from "@/components/planner/planner-week-screen";
import { getInitialAuthenticatedFromServer } from "@/lib/auth/server-initial-auth";

export const metadata = {
  description: "이번 주 끼니를 등록하고 장보기와 요리 완료까지 관리하는 주간 플래너",
  title: "주간 플래너",
};

export default async function PlannerPage() {
  const initialAuthenticated = await getInitialAuthenticatedFromServer();

  return (
    <AppShell
      bottomTabsMode="hidden"
      className="wave1-planner-shell wave1-planner-web-shell"
      currentTab="planner"
      headerMode="hidden"
    >
      <PlannerWeekScreen initialAuthenticated={initialAuthenticated} />
    </AppShell>
  );
}
