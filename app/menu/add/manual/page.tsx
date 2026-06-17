import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ManualRecipeCreateScreen } from "@/components/recipe/manual-recipe-create-screen";
import { resolveNextPath } from "@/lib/auth/callback";
import { readE2EAuthOverrideCookie } from "@/lib/auth/e2e-auth-override";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { getServerAuthUser } from "@/lib/supabase/server";

export const metadata = {
  description: "직접 입력한 재료와 조리 과정을 저장해 내 레시피로 등록하는 화면",
  title: "직접 레시피 등록 · 집밥",
};

interface ManualRecipeCreatePageProps {
  searchParams: Promise<{
    columnId?: string;
    date?: string;
    restore?: string;
    returnSurface?: string;
    returnTo?: string;
    slot?: string;
  }>;
}

export default async function ManualRecipeCreatePage({ searchParams }: ManualRecipeCreatePageProps) {
  const { date, columnId, restore, returnSurface, returnTo, slot } =
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
    if (returnTo) queryParts.push(`returnTo=${encodeURIComponent(returnTo)}`);
    if (returnSurface) {
      queryParts.push(`returnSurface=${encodeURIComponent(returnSurface)}`);
    }
    if (restore) queryParts.push(`restore=${encodeURIComponent(restore)}`);
    const queryString = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
    const returnPath = resolveNextPath(`/menu/add/manual${queryString}`);
    redirect(`/login?next=${encodeURIComponent(returnPath)}`);
  }

  return (
    <main>
      <ManualRecipeCreateScreen
        initialAuthenticated={initialAuthenticated}
        planDate={date ?? ""}
        columnId={columnId ?? ""}
        slotName={slot ?? ""}
      />
    </main>
  );
}
