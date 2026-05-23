import { AppShell } from "@/components/layout/app-shell";
import { AteListScreen } from "@/components/leftovers/ate-list-screen";
import { getInitialAuthenticatedFromServer } from "@/lib/auth/server-initial-auth";

export default async function AteListPage() {
  const initialAuthenticated = await getInitialAuthenticatedFromServer();

  return (
    <AppShell
      className="wave1-leftovers-shell wave1-leftovers-web-shell"
      currentTab="mypage"
      headerMode="hidden"
    >
      <AteListScreen initialAuthenticated={initialAuthenticated} />
    </AppShell>
  );
}
