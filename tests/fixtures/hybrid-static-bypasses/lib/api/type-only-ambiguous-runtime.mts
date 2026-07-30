import { createClient } from "@supabase/supabase-js";

export type TypeOnlyMarker = {
  readonly client: ReturnType<typeof createClient>;
};
