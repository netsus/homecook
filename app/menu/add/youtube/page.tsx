import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { YoutubeImportScreen } from "@/components/recipe/youtube-import-screen";
import { resolveNextPath } from "@/lib/auth/callback";
import { readE2EAuthOverrideCookie } from "@/lib/auth/e2e-auth-override";
import { isYoutubeImportEnabled } from "@/lib/feature-flags";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { getServerAuthUser } from "@/lib/supabase/server";

export const metadata = {
  title: "유튜브 레시피 가져오기 · 집밥",
};

export const dynamic = "force-dynamic";

interface YoutubeImportPageProps {
  searchParams: Promise<{
    columnId?: string;
    date?: string;
    restore?: string;
    returnSurface?: string;
    returnTo?: string;
    slot?: string;
    youtubeUrl?: string;
  }>;
}

export default async function YoutubeImportPage({ searchParams }: YoutubeImportPageProps) {
  if (!isYoutubeImportEnabled()) {
    notFound();
  }

  const { date, columnId, restore, returnSurface, returnTo, slot, youtubeUrl } =
    await searchParams;
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

  if (hasSupabasePublicEnv() && !initialAuthenticated) {
    const queryParts: string[] = [];
    if (date) queryParts.push(`date=${encodeURIComponent(date)}`);
    if (columnId) queryParts.push(`columnId=${encodeURIComponent(columnId)}`);
    if (slot) queryParts.push(`slot=${encodeURIComponent(slot)}`);
    if (youtubeUrl) queryParts.push(`youtubeUrl=${encodeURIComponent(youtubeUrl)}`);
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
        initialYoutubeUrl={youtubeUrl ?? ""}
        planDate={date ?? ""}
        columnId={columnId ?? ""}
        presentation={date || columnId || slot ? "screen" : undefined}
        slotName={slot ?? ""}
      />
    </main>
  );
}
