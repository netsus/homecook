export interface StorageWriteContract {
  objectPath: string;
}

export function serverOnlyStorageWrite(client: {
  storage: {
    from(bucket: string): {
      remove(paths: string[]): Promise<void>;
    };
  };
}) {
  return client.storage.from("recipe-images").remove(["server-only.png"]);
}
