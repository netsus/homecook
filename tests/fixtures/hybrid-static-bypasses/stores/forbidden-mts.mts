import { createClient } from "@supabase/supabase-js";

export const forbiddenMtsClient = createClient(
  "https://example.supabase.co",
  "fixture-key",
);
