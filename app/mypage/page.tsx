import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { MypageScreen } from "@/components/mypage/mypage-screen";
import { getInitialAuthenticatedFromServer } from "@/lib/auth/server-initial-auth";
import {
  resolveMypageLegacyRedirect,
  resolveMypageRestoreState,
} from "@/lib/navigation/mypage-return-state";

export const metadata = {
  description: "저장한 레시피, 레시피북, 장보기 기록, 성장 기록을 모아보는 마이페이지",
  title: "마이페이지",
};

interface MypagePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MypagePage({ searchParams }: MypagePageProps) {
  const resolvedSearchParams = await searchParams;
  const legacyRedirect = resolveMypageLegacyRedirect(resolvedSearchParams);

  if (legacyRedirect) {
    redirect(legacyRedirect);
  }

  const initialAuthenticated = await getInitialAuthenticatedFromServer();
  const initialView = resolveMypageRestoreState(resolvedSearchParams);

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
