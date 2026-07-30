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

export async function removeThroughComputedSafeDynamicHelper() {
  const loaded = await import("../lib/api/safe-dynamic-helper");
  const key = "remove";
  const computedRemove = loaded[key];
  const { [key]: destructuredRemove } = loaded;
  computedRemove(["safe-computed.png"]);
  destructuredRemove(["safe-destructured.png"]);

  await import("../lib/api/safe-dynamic-helper").then((safeModule) => {
    const thenKey = "remove";
    const thenRemove = safeModule[thenKey];
    thenRemove(["safe-then.png"]);
  });
}
