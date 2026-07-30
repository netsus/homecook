import { inspectStorageRequest } from "../lib/api/non-fetch-helper";

const STORAGE_OBJECT_URL = "/storage/v1/object/";

export function inspectThroughImportedHelper(objectPath: string) {
  return inspectStorageRequest(
    `${STORAGE_OBJECT_URL}recipe-images/${objectPath}`,
    { method: "DELETE" },
  );
}

export function readThroughImportedHelper(objectPath: string) {
  return fetch(
    `${STORAGE_OBJECT_URL}recipe-images/${objectPath}`,
    { method: "GET" },
  );
}
