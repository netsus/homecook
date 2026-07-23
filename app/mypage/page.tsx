import { redirect } from "next/navigation";

import { AccountQuarantineScreen } from
  "@/components/auth/account-quarantine-screen";
import { AppShell } from "@/components/layout/app-shell";
import { MypageScreen } from "@/components/mypage/mypage-screen";
import { getInitialAuthenticatedFromServer } from "@/lib/auth/server-initial-auth";
import {
  resolveMypageLegacyRedirect,
  resolveMypageRestoreState,
} from "@/lib/navigation/mypage-return-state";
import { readAccountQuarantineGate } from
  "@/lib/server/account-generation/quarantine-gate";

export const metadata = {
  description: "저장한 레시피, 레시피북, 장보기 기록, 성장 기록을 모아보는 마이페이지",
  title: "마이페이지",
};

interface MypagePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function buildMypageNextPath(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const allowedParams = new URLSearchParams();

  for (const key of ["restore", "returnSurface"] as const) {
    const value = searchParams[key];
    const scalarValue = Array.isArray(value) ? value[0] : value;
    if (scalarValue) {
      allowedParams.set(key, scalarValue);
    }
  }

  const query = allowedParams.toString();
  return query ? `/mypage?${query}` : "/mypage";
}

export default async function MypagePage({ searchParams }: MypagePageProps) {
  const resolvedSearchParams = await searchParams;
  const legacyRedirect = resolveMypageLegacyRedirect(resolvedSearchParams);

  if (legacyRedirect) {
    redirect(legacyRedirect);
  }

  const quarantineGate = await readAccountQuarantineGate();
  const shouldRenderQuarantine =
    quarantineGate.state !== "not-applicable"
    && !(quarantineGate.state === "unauthorized" && !quarantineGate.hasSession);
  if (shouldRenderQuarantine) {
    return (
      <AccountQuarantineScreen
        gateState={quarantineGate.state}
        nextPath={buildMypageNextPath(resolvedSearchParams)}
      />
    );
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
