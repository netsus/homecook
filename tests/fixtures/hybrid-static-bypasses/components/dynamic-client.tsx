"use client";

export async function loadUnsafeImageMutation() {
  return Promise.all([
    import("../lib/api/dynamic-sdk-alias.mjs"),
    import("../lib/api/complex"),
  ]);
}
