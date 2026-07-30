"use client";

const safeLoader = (specifier: string) => specifier;

export function loadThroughParameter(
  require: (specifier: string) => string = safeLoader,
) {
  const loader = require;
  return loader("@supabase/supabase-js");
}
