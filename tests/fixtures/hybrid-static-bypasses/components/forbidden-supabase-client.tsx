"use client";

import { createBrowserClient } from "@supabase/ssr";

import { forbiddenSupabaseFactory } from "../stores/forbidden-supabase-barrel";

export async function loadForbiddenSupabaseRuntime() {
  // @ts-expect-error adversarial fixture references a forbidden runtime package
  const storageModule = await import("@supabase/storage-js");
  return {
    createBrowserClient,
    forbiddenSupabaseFactory,
    storageModule,
  };
}
