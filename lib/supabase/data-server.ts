import { createClient } from "@supabase/supabase-js";

import { getDataSupabaseEnv } from "./data-env";

export function createUserDataClient({
  accessToken,
  fetch,
}: {
  accessToken: string;
  fetch?: typeof globalThis.fetch;
}) {
  const normalizedAccessToken = accessToken.trim();
  if (!normalizedAccessToken) {
    throw new Error("verified remote user JWT가 필요해요.");
  }

  const { url, publishableKey } = getDataSupabaseEnv();
  return createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      fetch,
      headers: {
        Authorization: `Bearer ${normalizedAccessToken}`,
      },
    },
  });
}
