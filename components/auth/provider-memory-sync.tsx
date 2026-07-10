"use client";

import { useEffect } from "react";
import { syncLastAuthProviderFromCookie } from "@/lib/auth/provider-memory";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";

export function ProviderMemorySync() {
  useEffect(() => {
    if (!hasSupabasePublicEnv()) return;
    let mounted = true;
    void getSupabaseBrowserClient().auth.getSession().then(({ data }: { data: { session: unknown | null } }) => {
      if (mounted && data.session) syncLastAuthProviderFromCookie();
    });
    return () => { mounted = false; };
  }, []);
  return null;
}
