"use client";

const loader = (specifier: string) => specifier;

export function callConfirmedSafeLoader() {
  return loader("@supabase/supabase-js");
}
