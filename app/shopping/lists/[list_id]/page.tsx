import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ShoppingDetailScreen } from "@/components/shopping/shopping-detail-screen";
import { resolveNextPath } from "@/lib/auth/callback";
import { readE2EAuthOverrideCookie } from "@/lib/auth/e2e-auth-override";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { getServerAuthUser } from "@/lib/supabase/server";

export default async function ShoppingDetailPage({
  params,
}: {
  params: Promise<{ list_id: string }>;
}) {
  const { list_id } = await params;

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
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 bg-[var(--background)]"
      />
      <ShoppingDetailScreen
        listId={list_id}
        initialAuthenticated={initialAuthenticated}
      />
    </>
  );
}
