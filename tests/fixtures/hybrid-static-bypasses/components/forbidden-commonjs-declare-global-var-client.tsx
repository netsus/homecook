/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/ban-ts-comment -- standalone global-augmentation import-gate fixture */
// @ts-nocheck -- isolates the standalone augmentation from the repo's Node require declaration
"use client";

export {};

declare global {
  var require: (specifier: string) => unknown;
}

export const supabaseRuntime = require("@supabase/supabase-js");

const loader = require;

export function loadStorageRuntimeThroughGlobalVarAlias() {
  return loader("@supabase/storage-js");
}
