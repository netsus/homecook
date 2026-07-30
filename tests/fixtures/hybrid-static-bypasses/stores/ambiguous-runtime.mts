import { createClient } from "@supabase/supabase-js";

export const selectedRuntime = createClient(
  "https://example.supabase.co",
  "fixture-key",
);
