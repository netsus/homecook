import { createClient } from "@supabase/supabase-js";

export const forbiddenCtsClient = createClient(
  "https://example.supabase.co",
  "fixture-key",
);
