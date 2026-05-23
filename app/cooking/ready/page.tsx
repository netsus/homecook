import { AppShell } from "@/components/layout/app-shell";
import { CookReadyListScreen } from "@/components/cooking/cook-ready-list-screen";
import { getInitialAuthenticatedFromServer } from "@/lib/auth/server-initial-auth";

export default async function CookingReadyPage() {
  const initialAuthenticated = await getInitialAuthenticatedFromServer();

  return (
    <AppShell
      className="wave1-planner-shell wave1-planner-web-shell"
      currentTab="planner"
      headerMode="hidden"
    >
      <CookReadyListScreen initialAuthenticated={initialAuthenticated} />
    </AppShell>
  );
}
