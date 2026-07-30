"use client";

const safeLoader = (specifier: string) => specifier;

export function loadThroughLocalConst() {
  const require = safeLoader;
  const loader = require;
  return loader("@supabase/supabase-js");
}

export function loadThroughLocalFunction() {
  function require(specifier: string) {
    return specifier;
  }
  const loader = require;
  return loader("@supabase/storage-js");
}
