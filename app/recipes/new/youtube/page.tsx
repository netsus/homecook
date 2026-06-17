import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { RecipioYoutubeImportScreen } from "@/components/recipe/recipio-youtube-import-screen";
import { resolveNextPath } from "@/lib/auth/callback";
import { readE2EAuthOverrideCookie } from "@/lib/auth/e2e-auth-override";
import { isYoutubeImportEnabled } from "@/lib/feature-flags";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { getServerAuthUser } from "@/lib/supabase/server";

export const metadata = {
  description: "유튜브 링크를 분석해 집밥 레시피로 등록하는 화면",
  title: "유튜브 레시피 가져오기 · 집밥",
};

export const dynamic = "force-dynamic";

interface RecipioYoutubeImportPageProps {
  searchParams: Promise<{
    youtubeUrl?: string;
  }>;
}

export default async function RecipioYoutubeImportPage({
  searchParams,
}: RecipioYoutubeImportPageProps) {
  if (!isYoutubeImportEnabled()) {
    notFound();
  }

  const { youtubeUrl } = await searchParams;
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
    const queryString = youtubeUrl ? `?youtubeUrl=${encodeURIComponent(youtubeUrl)}` : "";
    const returnPath = resolveNextPath(`/recipes/new/youtube${queryString}`);
    redirect(`/login?next=${encodeURIComponent(returnPath)}`);
  }

  return <RecipioYoutubeImportScreen initialYoutubeUrl={youtubeUrl ?? ""} />;
}
