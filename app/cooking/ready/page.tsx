import { AppShell } from "@/components/layout/app-shell";
import { CookReadyListScreen } from "@/components/cooking/cook-ready-list-screen";
import { getServerAuthUser } from "@/lib/supabase/server";

export default async function CookingReadyPage() {
  const user = await getServerAuthUser();

  return (
    <AppShell
      className="wave1-planner-shell wave1-planner-web-shell"
      currentTab="planner"
      headerMode="hidden"
    >
      <CookReadyListScreen initialAuthenticated={Boolean(user)} />
    </AppShell>
  );
}
