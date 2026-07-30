import { createClient } from "@supabase/supabase-js";

export const forbiddenIndexClient = createClient(
  "https://example.supabase.co",
  "fixture-key",
);
