import { AppShell } from "@/components/layout/app-shell";
import { MypageScreen } from "@/components/mypage/mypage-screen";
import { getInitialAuthenticatedFromServer } from "@/lib/auth/server-initial-auth";
import { resolveMypageRestoreState } from "@/lib/navigation/mypage-return-state";

interface MypagePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MypagePage({ searchParams }: MypagePageProps) {
  const initialAuthenticated = await getInitialAuthenticatedFromServer();
  const initialView = resolveMypageRestoreState(await searchParams);

  return (
    <AppShell
      bottomTabsMode="hidden"
      className="wave1-mypage-shell"
      currentTab="mypage"
      headerMode="hidden"
    >
      <MypageScreen
        initialActiveTab={initialView.activeTab}
        initialAuthenticated={initialAuthenticated}
        initialMobileSurface={initialView.mobileSurface}
      />
    </AppShell>
  );
}
