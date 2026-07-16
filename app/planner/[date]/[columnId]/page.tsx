import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { MealScreen } from "@/components/planner/meal-screen";
import { resolveNextPath } from "@/lib/auth/callback";
import { readE2EAuthOverrideCookie } from "@/lib/auth/e2e-auth-override";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { getServerAuthUser } from "@/lib/supabase/server";

export async function generateMetadata({ params, searchParams }: MealScreenPageProps) {
  const { date } = await params;
  const { slot } = await searchParams;
  const slotLabel = slot?.trim() ? ` ${slot.trim()}` : "";

  return {
    description: `${date}${slotLabel}에 등록된 식사를 확인하고 요리 완료까지 관리하는 플래너 상세`,
    title: `${date}${slotLabel} 식사`,
  };
}

interface MealScreenPageProps {
  params: Promise<{ date: string; columnId: string }>;
  searchParams: Promise<{
    slot?: string;
    productAction?: string;
    productEntryId?: string;
    productAmount?: string;
    productUnit?: string;
  }>;
}

export default async function MealScreenPage({
  params,
  searchParams,
}: MealScreenPageProps) {
  const { date, columnId } = await params;
  const pageSearchParams = await searchParams;
  const { slot } = pageSearchParams;
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
    const returnParams = new URLSearchParams();
    if (slot) returnParams.set("slot", slot);
    if (pageSearchParams.productAction === "edit" || pageSearchParams.productAction === "delete") {
      returnParams.set("productAction", pageSearchParams.productAction);
    }
    if (pageSearchParams.productEntryId) returnParams.set("productEntryId", pageSearchParams.productEntryId);
    if (pageSearchParams.productAmount) returnParams.set("productAmount", pageSearchParams.productAmount);
    if (pageSearchParams.productUnit) returnParams.set("productUnit", pageSearchParams.productUnit);
    const suffix = returnParams.size ? `?${returnParams.toString()}` : "";
    const returnPath = resolveNextPath(`/planner/${date}/${columnId}${suffix}`);
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
