"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getAuthSupabaseEnv } from "@/lib/supabase/auth-env";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;
const FORBIDDEN_BROWSER_MEMBERS = new Set<PropertyKey>([
  "from",
  "functions",
  "realtime",
  "rpc",
  "schema",
  "storage",
]);

export function getSupabaseBrowserClient() {
  if (browserClient) {
    return browserClient;
  }

  const { url, publishableKey } = getAuthSupabaseEnv();
  const authClient = createBrowserClient(url, publishableKey);
  browserClient = new Proxy(authClient, {
    get(target, property) {
      if (FORBIDDEN_BROWSER_MEMBERS.has(property)) {
        throw new Error("Browser Supabase client는 Auth-only로 제한돼요.");
      }
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  return browserClient;
}
