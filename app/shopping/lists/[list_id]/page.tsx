import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ShoppingDetailScreen } from "@/components/shopping/shopping-detail-screen";
import { resolveNextPath } from "@/lib/auth/callback";
import { readE2EAuthOverrideCookie } from "@/lib/auth/e2e-auth-override";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { getServerAuthUser } from "@/lib/supabase/server";

export const metadata = {
  description: "장보기 항목을 체크하고 팬트리 반영까지 마무리하는 장보기 상세",
  title: "장보기 목록",
};

export default async function ShoppingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ list_id: string }>;
  searchParams?: Promise<{
    returnSurface?: string | string[];
  }>;
}) {
  const { list_id } = await params;
  const query = searchParams ? await searchParams : {};
  const returnSurface = Array.isArray(query.returnSurface)
    ? query.returnSurface[0]
    : query.returnSurface;
  const navActiveId: "planner" | "mypage" =
    returnSurface?.startsWith("mypage.") ? "mypage" : "planner";

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
    const returnPath = resolveNextPath(`/shopping/lists/${list_id}`);
    redirect(`/login?next=${encodeURIComponent(returnPath)}`);
  }

  return (
    <div className="relative min-h-screen">
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 bg-[var(--wave1-surface)]"
      />
      <ShoppingDetailScreen
        listId={list_id}
        initialAuthenticated={initialAuthenticated}
        navActiveId={navActiveId}
      />
    </div>
  );
}
