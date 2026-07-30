"use client";

const safeLoader = (specifier: string) => specifier;
const loader = require;

export function loadThroughNestedShadow() {
  const loader = safeLoader;
  return loader("@supabase/supabase-js");
}

export function loadThroughNestedRequireShadow() {
  const require = safeLoader;
  const nestedLoader = require;
  return nestedLoader("@supabase/storage-js");
}

void loader;
