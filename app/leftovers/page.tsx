import { AppShell } from "@/components/layout/app-shell";
import { LeftoversScreen } from "@/components/leftovers/leftovers-screen";
import { getServerAuthUser } from "@/lib/supabase/server";

export default async function LeftoversPage() {
  const user = await getServerAuthUser();

  return (
    <AppShell currentTab="planner" headerMode="hidden">
      <LeftoversScreen initialAuthenticated={Boolean(user)} />
    </AppShell>
  );
}
