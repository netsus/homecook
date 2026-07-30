"use client";

export {};

// @ts-expect-error -- standalone overload fixture intentionally has no implementation
function require(specifier: string): unknown;

export const supabaseRuntime = require("@supabase/supabase-js");

const loader = require;

export function loadStorageRuntimeThroughErasedOverloadAlias() {
  return loader("@supabase/storage-js");
}
