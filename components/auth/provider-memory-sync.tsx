"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { syncLastAuthProviderFromCookie } from "@/lib/auth/provider-memory";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";

export function ProviderMemorySync() {
  const pathname = usePathname();
  const round2 = /^\/beta\/r2(?:\/|$)/.test(pathname ?? "");
  useEffect(() => {
    if (round2) return;
    if (!hasSupabasePublicEnv()) return;
    let mounted = true;
    void getSupabaseBrowserClient().auth.getSession().then(({ data }: { data: { session: unknown | null } }) => {
      if (mounted && data.session) syncLastAuthProviderFromCookie();
    });
    return () => { mounted = false; };
  }, [round2]);
  return null;
}
