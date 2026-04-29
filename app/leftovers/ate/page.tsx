import { AppShell } from "@/components/layout/app-shell";
import { AteListScreen } from "@/components/leftovers/ate-list-screen";
import { getServerAuthUser } from "@/lib/supabase/server";

export default async function AteListPage() {
  const user = await getServerAuthUser();

  return (
    <AppShell currentTab="planner" headerMode="hidden">
      <AteListScreen initialAuthenticated={Boolean(user)} />
    </AppShell>
  );
}
