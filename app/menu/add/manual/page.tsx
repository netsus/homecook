import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ManualRecipeCreateScreen } from "@/components/recipe/manual-recipe-create-screen";
import { resolveNextPath } from "@/lib/auth/callback";
import { readE2EAuthOverrideCookie } from "@/lib/auth/e2e-auth-override";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { getServerAuthUser } from "@/lib/supabase/server";

export const metadata = {
  title: "직접 레시피 등록 · 집밥",
};

interface ManualRecipeCreatePageProps {
  searchParams: Promise<{ date?: string; columnId?: string; slot?: string }>;
}

export default async function ManualRecipeCreatePage({ searchParams }: ManualRecipeCreatePageProps) {
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
    const returnPath = resolveNextPath(`/menu/add/manual${queryString}`);
    redirect(`/login?next=${encodeURIComponent(returnPath)}`);
  }

  return (
    <ManualRecipeCreateScreen
      initialAuthenticated={initialAuthenticated}
      planDate={date ?? ""}
      columnId={columnId ?? ""}
      slotName={slot ?? ""}
    />
  );
}
