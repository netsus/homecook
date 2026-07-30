"use client";

declare const require: (specifier: string) => unknown;

export const supabaseRuntime = require("@supabase/supabase-js");
