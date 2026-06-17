import { AppShell } from "@/components/layout/app-shell";
import { LeftoversScreen } from "@/components/leftovers/leftovers-screen";
import { getInitialAuthenticatedFromServer } from "@/lib/auth/server-initial-auth";

export const metadata = {
  description: "요리 후 남은 음식을 확인하고 다음 끼니에 다시 추가하는 남은 요리 관리",
  title: "남은 요리",
};

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
