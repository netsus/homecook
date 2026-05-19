import { AppShell } from "@/components/layout/app-shell";
import { MypageScreen } from "@/components/mypage/mypage-screen";
import { resolveMypageRestoreState } from "@/lib/navigation/mypage-return-state";
import { getServerAuthUser } from "@/lib/supabase/server";

interface MypagePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MypagePage({ searchParams }: MypagePageProps) {
  const user = await getServerAuthUser();
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
        initialAuthenticated={Boolean(user)}
        initialMobileSurface={initialView.mobileSurface}
      />
    </AppShell>
  );
}
