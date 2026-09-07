import { YoutubePreparationNotice } from "@/components/shared/prelaunch-notice";
import { isPrelaunchFeatureLocked } from "@/lib/prelaunch";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { YoutubeImportScreen } from "@/components/recipe/youtube-import-screen";
import { resolveNextPath } from "@/lib/auth/callback";
import { readE2EAuthOverrideCookie } from "@/lib/auth/e2e-auth-override";
import { isYoutubeImportEnabled } from "@/lib/feature-flags";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { getServerAuthUser } from "@/lib/supabase/server";

export const metadata = {
  description: "유튜브 링크에서 레시피 정보를 가져와 플래너나 레시피북에 저장하는 화면",
  title: "유튜브 레시피 가져오기 · 무엇을 먹든",
};

export const dynamic = "force-dynamic";

interface YoutubeImportPageProps {
  searchParams: Promise<{
    columnId?: string;
    date?: string;
    extractionId?: string;
    restore?: string;
    returnSurface?: string;
    returnTo?: string;
    slot?: string;
    youtubeUrl?: string;
  }>;
}

export default async function YoutubeImportPage({ searchParams }: YoutubeImportPageProps) {
  const { date, columnId, extractionId, restore, returnSurface, returnTo, slot, youtubeUrl } =
    await searchParams;

  if (isPrelaunchFeatureLocked() && !extractionId) {
    return <main><YoutubePreparationNotice backHref={date ? `/planner?date=${encodeURIComponent(date)}` : "/planner"} /></main>;
  }

  if (!isYoutubeImportEnabled()) {
    notFound();
  }


  const cookieStore = await cookies();
  const authOverride = readE2EAuthOverrideCookie(cookieStore);
  const user =
    hasSupabasePublicEnv() && authOverride !== "authenticated"
      ? await getServerAuthUser()
      : null;
  const initialAuthenticated =
    authOverride === "authenticated"
      ? true
      : authOverride === "guest"
        ? false
        : Boolean(user);

  if (
    authOverride === "guest"
    || (hasSupabasePublicEnv() && !initialAuthenticated)
  ) {
    const queryParts: string[] = [];
    if (date) queryParts.push(`date=${encodeURIComponent(date)}`);
    if (columnId) queryParts.push(`columnId=${encodeURIComponent(columnId)}`);
    if (slot) queryParts.push(`slot=${encodeURIComponent(slot)}`);
    if (youtubeUrl) queryParts.push(`youtubeUrl=${encodeURIComponent(youtubeUrl)}`);
    if (extractionId) queryParts.push(`extractionId=${encodeURIComponent(extractionId)}`);
    if (returnTo) queryParts.push(`returnTo=${encodeURIComponent(returnTo)}`);
    if (returnSurface) {
      queryParts.push(`returnSurface=${encodeURIComponent(returnSurface)}`);
    }
    if (restore) queryParts.push(`restore=${encodeURIComponent(restore)}`);
    const queryString = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
    const returnPath = resolveNextPath(`/menu/add/youtube${queryString}`);
    redirect(`/login?next=${encodeURIComponent(returnPath)}`);
  }

  return (
    <main>
      <YoutubeImportScreen
        initialExtractionId={extractionId ?? ""}
        initialYoutubeUrl={youtubeUrl ?? ""}
        planDate={date ?? ""}
        columnId={columnId ?? ""}
        presentation={date || columnId || slot ? "screen" : undefined}
        slotName={slot ?? ""}
      />
    </main>
  );
}
