"use client";

const runtimeSpecifier = window.name;

export const loadForbiddenWithOptions = () =>
  import("@supabase/supabase-js", { with: {} });
export const loadUnknownWithOptions = () =>
  import(runtimeSpecifier, { with: {} });
export const loadSafeWithOptions = () =>
  import("../lib/api/safe-import-options.mjs", { with: {} });
