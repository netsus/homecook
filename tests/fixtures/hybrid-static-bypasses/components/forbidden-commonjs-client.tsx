/* eslint-disable @typescript-eslint/no-require-imports -- adversarial CommonJS import-gate fixture */
"use client";

export function loadSupabaseRuntime() {
  return require("@supabase/supabase-js");
}
