export interface ServerOnlyStoreContract {
  objectPath: string;
}

export function serverOnlyStoreWrite(client: {
  storage: {
    from(bucket: string): {
      remove(paths: string[]): Promise<void>;
    };
  };
}) {
  return client.storage.from("recipe-images").remove(["server-only-store.png"]);
}
