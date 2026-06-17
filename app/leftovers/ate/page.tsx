import { AppShell } from "@/components/layout/app-shell";
import { AteListScreen } from "@/components/leftovers/ate-list-screen";
import { getInitialAuthenticatedFromServer } from "@/lib/auth/server-initial-auth";

export const metadata = {
  description: "다 먹은 남은 요리 기록을 확인하고 필요하면 다시 남은 요리로 옮기는 화면",
  title: "다먹은 요리",
};

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
