const STORAGE_OBJECT_URL = "https://project.supabase.co/storage/v1/object/";

export function removeFromUnsafeStore(objectPath: string) {
  return fetch(
    `${STORAGE_OBJECT_URL}recipe-images/${objectPath}`,
    { method: "DELETE" },
  );
}
