"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getAuthSupabaseEnv } from "@/lib/supabase/auth-env";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (browserClient) {
    return browserClient;
  }

  const { url, publishableKey } = getAuthSupabaseEnv();
  browserClient = createBrowserClient(url, publishableKey);

  return browserClient;
}
