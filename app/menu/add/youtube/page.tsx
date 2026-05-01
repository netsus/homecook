import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { YoutubeImportScreen } from "@/components/recipe/youtube-import-screen";
import { resolveNextPath } from "@/lib/auth/callback";
import { readE2EAuthOverrideCookie } from "@/lib/auth/e2e-auth-override";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { getServerAuthUser } from "@/lib/supabase/server";

export const metadata = {
  title: "유튜브 레시피 가져오기 · 집밥",
};

interface YoutubeImportPageProps {
  searchParams: Promise<{ date?: string; columnId?: string; slot?: string }>;
}

export default async function YoutubeImportPage({ searchParams }: YoutubeImportPageProps) {
  const { date, columnId, slot } = await searchParams;
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
    const queryString = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
    const returnPath = resolveNextPath(`/menu/add/youtube${queryString}`);
    redirect(`/login?next=${encodeURIComponent(returnPath)}`);
  }

  return (
    <YoutubeImportScreen
      initialAuthenticated={initialAuthenticated}
      planDate={date ?? ""}
      columnId={columnId ?? ""}
      slotName={slot ?? ""}
    />
  );
}
