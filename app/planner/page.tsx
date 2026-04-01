import { AppShell } from "@/components/layout/app-shell";
import { PlannerWeekScreen } from "@/components/planner/planner-week-screen";

export default function PlannerPage() {
  return (
    <AppShell currentTab="planner">
      <PlannerWeekScreen />
    </AppShell>
  );
}
