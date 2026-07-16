import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { MenuAddScreen } from "@/components/planner/menu-add-screen";
import { resolveNextPath } from "@/lib/auth/callback";
import { readE2EAuthOverrideCookie } from "@/lib/auth/e2e-auth-override";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { getServerAuthUser } from "@/lib/supabase/server";

export const metadata = {
  description: "검색, 레시피북, 팬트리 추천, 남은 요리에서 플래너 식사를 추가하는 화면",
  title: "식사 추가",
};

interface MenuAddPageProps {
  searchParams: Promise<{
    columnId?: string;
    date?: string;
    restore?: string;
    productAmount?: string;
    productId?: string;
    productQuery?: string;
    productUnit?: string;
    returnSurface?: string;
    returnTo?: string;
    slot?: string;
    source?: string;
  }>;
}

export default async function MenuAddPage({ searchParams }: MenuAddPageProps) {
  const params = await searchParams;
  const { date, columnId, restore, returnSurface, returnTo, slot, source } = params;
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
    const menuAddParams = new URLSearchParams();
    if (date) menuAddParams.set("date", date);
    if (columnId) menuAddParams.set("columnId", columnId);
    if (slot) menuAddParams.set("slot", slot);
    if (source) menuAddParams.set("source", source);
    if (returnTo) menuAddParams.set("returnTo", returnTo);
    if (returnSurface) menuAddParams.set("returnSurface", returnSurface);
    if (restore) menuAddParams.set("restore", restore);
    if (params.productQuery) menuAddParams.set("productQuery", params.productQuery);
    if (params.productId) menuAddParams.set("productId", params.productId);
    if (params.productAmount) menuAddParams.set("productAmount", params.productAmount);
    if (params.productUnit) menuAddParams.set("productUnit", params.productUnit);
    const queryString = menuAddParams.toString();
    const returnPath = resolveNextPath(
      queryString ? `/menu-add?${queryString}` : "/menu-add",
    );
    redirect(`/login?next=${encodeURIComponent(returnPath)}`);
  }

  return (
    <main className="relative min-h-screen">
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 bg-[var(--background)]"
      />
      <MenuAddScreen
        columnId={columnId ?? ""}
        initialSource={source ?? ""}
        planDate={date ?? ""}
        slotName={slot ?? ""}
      />
    </main>
  );
}
