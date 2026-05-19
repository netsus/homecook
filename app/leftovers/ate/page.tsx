import { AppShell } from "@/components/layout/app-shell";
import { AteListScreen } from "@/components/leftovers/ate-list-screen";
import { getServerAuthUser } from "@/lib/supabase/server";

export default async function AteListPage() {
  const user = await getServerAuthUser();

  return (
    <AppShell
      className="wave1-leftovers-shell wave1-leftovers-web-shell"
      currentTab="mypage"
      headerMode="hidden"
    >
      <AteListScreen initialAuthenticated={Boolean(user)} />
    </AppShell>
  );
}
