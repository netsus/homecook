import { createClient } from "@supabase/ssr";

export const forbiddenJsxClient = createClient(
  "https://example.supabase.co",
  "fixture-key",
);
