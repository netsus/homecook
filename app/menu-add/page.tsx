import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { MenuAddScreen } from "@/components/planner/menu-add-screen";
import { resolveNextPath } from "@/lib/auth/callback";
import { readE2EAuthOverrideCookie } from "@/lib/auth/e2e-auth-override";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { getServerAuthUser } from "@/lib/supabase/server";

interface MenuAddPageProps {
  searchParams: Promise<{ date?: string; columnId?: string; slot?: string }>;
}

export default async function MenuAddPage({ searchParams }: MenuAddPageProps) {
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
    const returnPath = resolveNextPath(`/menu-add${queryString}`);
    redirect(`/login?next=${encodeURIComponent(returnPath)}`);
  }

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 bg-[var(--background)]"
      />
      <MenuAddScreen
        columnId={columnId ?? ""}
        initialAuthenticated={initialAuthenticated}
        planDate={date ?? ""}
        slotName={slot ?? ""}
      />
    </>
  );
}
