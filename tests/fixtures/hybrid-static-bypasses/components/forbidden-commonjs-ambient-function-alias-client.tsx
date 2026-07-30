"use client";

declare function require(specifier: string): unknown;

const loader = require;

export function loadStorageRuntimeThroughAmbientAlias() {
  return loader("@supabase/storage-js");
}
