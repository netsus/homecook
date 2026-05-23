import { AppShell } from "@/components/layout/app-shell";
import { LeftoversScreen } from "@/components/leftovers/leftovers-screen";
import { getInitialAuthenticatedFromServer } from "@/lib/auth/server-initial-auth";

export default async function LeftoversPage() {
  const initialAuthenticated = await getInitialAuthenticatedFromServer();

  return (
    <AppShell
      className="wave1-leftovers-shell wave1-leftovers-web-shell"
      currentTab="mypage"
      headerMode="hidden"
    >
      <LeftoversScreen initialAuthenticated={initialAuthenticated} />
    </AppShell>
  );
}
