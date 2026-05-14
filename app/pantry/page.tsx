import { AppShell } from "@/components/layout/app-shell";
import { PantryScreen } from "@/components/pantry/pantry-screen";
import { getServerAuthUser } from "@/lib/supabase/server";

export default async function PantryPage() {
  const user = await getServerAuthUser();

  return (
    <AppShell
      bottomTabsMode="hidden"
      className="wave1-pantry-shell"
      currentTab="pantry"
    >
      <PantryScreen initialAuthenticated={Boolean(user)} />
    </AppShell>
  );
}
