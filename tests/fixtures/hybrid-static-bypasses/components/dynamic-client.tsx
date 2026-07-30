"use client";

export async function loadUnsafeImageMutation() {
  return import("../lib/api/dynamic-sdk-alias.mjs");
}
