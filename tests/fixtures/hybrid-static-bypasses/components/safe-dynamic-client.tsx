"use client";

const STORAGE_OBJECT_URL = "/storage/v1/object/recipe-images/safe.png";

export async function inspectThroughSafeDynamicHelper() {
  const { inspectStorageRequest } = await import(
    "../lib/api/safe-dynamic-helper"
  );
  inspectStorageRequest(STORAGE_OBJECT_URL, { method: "DELETE" });
}

export function removeThroughSafeDynamicHelper() {
  return import("../lib/api/safe-dynamic-helper").then(
    (loaded) => loaded.remove(["safe.png"]),
  );
}
