import { cookies } from "next/headers";

import { readE2EAuthOverrideCookie } from "@/lib/auth/e2e-auth-override";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { getServerAuthUser } from "@/lib/supabase/server";

export async function getInitialAuthenticatedFromServer() {
  const cookieStore = await cookies();
  const authOverride = readE2EAuthOverrideCookie(cookieStore);

  if (authOverride === "authenticated") {
    return true;
  }

  if (authOverride === "guest") {
    return false;
  }

  if (!hasSupabasePublicEnv()) {
    return false;
  }

  const user = await getServerAuthUser();
  return Boolean(user);
}
