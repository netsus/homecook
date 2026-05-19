import { AppShell } from "@/components/layout/app-shell";
import { LeftoversScreen } from "@/components/leftovers/leftovers-screen";
import { getServerAuthUser } from "@/lib/supabase/server";

export default async function LeftoversPage() {
  const user = await getServerAuthUser();

  return (
    <AppShell
      className="wave1-leftovers-shell wave1-leftovers-web-shell"
      currentTab="mypage"
      headerMode="hidden"
    >
      <LeftoversScreen initialAuthenticated={Boolean(user)} />
    </AppShell>
  );
}
