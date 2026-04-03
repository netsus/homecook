import { cookies } from "next/headers";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

import { getServiceRoleKey, getSupabaseEnv } from "@/lib/supabase/env";

export async function createRouteHandlerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}

export function createServiceRoleClient() {
  const { url } = getSupabaseEnv();
  const serviceRoleKey = getServiceRoleKey();

  if (!serviceRoleKey) {
    return null;
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function getServerAuthUser() {
  const supabase = await createRouteHandlerClient();
  const authResult = await supabase.auth.getUser();

  return authResult.data.user ?? null;
}
