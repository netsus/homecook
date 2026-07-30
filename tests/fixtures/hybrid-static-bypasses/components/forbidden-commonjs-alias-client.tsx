"use client";

const loader = require;
let assignedLoader = (specifier: string) => specifier;

assignedLoader = loader;

export function loadSupabaseRuntimeThroughAlias() {
  return loader("@supabase/supabase-js");
}

export function loadStorageRuntimeThroughAssignedNestedAlias() {
  const nestedLoader = assignedLoader;
  return nestedLoader("@supabase/storage-js");
}
