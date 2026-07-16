import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ShoppingFlowScreen } from "@/components/shopping/shopping-flow-screen";
import { resolveNextPath } from "@/lib/auth/callback";
import { readE2EAuthOverrideCookie } from "@/lib/auth/e2e-auth-override";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { getServerAuthUser } from "@/lib/supabase/server";

export const metadata = {
  description: "플래너의 끼니를 골라 필요한 재료를 합산하는 장보기 준비",
  title: "장보기 준비",
};

export default async function ShoppingFlowPage() {
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
    const returnPath = resolveNextPath("/shopping/flow");
    redirect(`/login?next=${encodeURIComponent(returnPath)}`);
  }

  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 bg-[var(--wave1-surface)]"
      />
      <ShoppingFlowScreen initialAuthenticated={initialAuthenticated} />
    </div>
  );
}
