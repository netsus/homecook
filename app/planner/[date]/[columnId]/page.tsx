import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { MealScreen } from "@/components/planner/meal-screen";
import { resolveNextPath } from "@/lib/auth/callback";
import { readE2EAuthOverrideCookie } from "@/lib/auth/e2e-auth-override";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { getServerAuthUser } from "@/lib/supabase/server";

interface MealScreenPageProps {
  params: Promise<{ date: string; columnId: string }>;
  searchParams: Promise<{ slot?: string }>;
}

export default async function MealScreenPage({
  params,
  searchParams,
}: MealScreenPageProps) {
  const { date, columnId } = await params;
  const { slot } = await searchParams;
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
    const slotSuffix = slot ? `?slot=${encodeURIComponent(slot)}` : "";
    const returnPath = resolveNextPath(`/planner/${date}/${columnId}${slotSuffix}`);
    redirect(`/login?next=${encodeURIComponent(returnPath)}`);
  }

  return (
    <AppShell
      bottomTabsMode="hidden"
      className="wave1-planner-shell wave1-meal-shell"
      currentTab="planner"
      headerMode="hidden"
    >
      <MealScreen
        columnId={columnId}
        initialAuthenticated={initialAuthenticated}
        planDate={date}
        slotName={slot ?? ""}
      />
    </AppShell>
  );
}
