"use client";

const STORAGE_OBJECT_URL = "/storage/v1/object/recipe-images/unsafe.png";
declare function readMethod(): string;

export async function removeThroughDynamicSdkBarrel() {
  const {
    removeStoredImage,
    storedSdkTools,
    storedSdkTuple,
  } = await import("../lib/api/sdk-dynamic-barrel");

  removeStoredImage(["unsafe.png"]);
  storedSdkTools.remove(["unsafe.png"]);
  storedSdkTuple[0](["unsafe.png"]);

  const sdkNamespace = await import("../lib/api/sdk-dynamic-barrel");
  sdkNamespace.removeStoredNamespaceImage(["unsafe.png"]);
}

export async function inspectThroughUnknownDynamicModule(specifier: string) {
  const { inspectStorageRequest } = await import(specifier);
  inspectStorageRequest(STORAGE_OBJECT_URL, { method: readMethod() });
}

export async function inspectThroughRecursiveDynamicModule() {
  const { remove } = await import("../lib/api/cycle-a");
  remove(["unsafe.png"]);
}
