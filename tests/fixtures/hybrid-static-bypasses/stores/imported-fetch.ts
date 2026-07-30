import { sendStorageRequest } from "../lib/api/fetch-barrel";

const STORAGE_OBJECT_URL = "/storage/v1/object/";

export function removeThroughImportedFetch(objectPath: string) {
  return sendStorageRequest(
    `${STORAGE_OBJECT_URL}recipe-images/${objectPath}`,
    { method: "DELETE" },
  );
}
