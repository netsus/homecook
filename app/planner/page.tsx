import { AppShell } from "@/components/layout/app-shell";
import { PlannerWeekScreen } from "@/components/planner/planner-week-screen";
import { getServerAuthUser } from "@/lib/supabase/server";

export default async function PlannerPage() {
  const user = await getServerAuthUser();

  return (
    <AppShell currentTab="planner">
      <PlannerWeekScreen initialAuthenticated={Boolean(user)} />
    </AppShell>
  );
}
