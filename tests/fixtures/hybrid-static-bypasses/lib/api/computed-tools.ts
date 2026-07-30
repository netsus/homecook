declare function getStorageClient(): {
  storage: {
    from(bucket: string): {
      remove(paths: string[]): unknown;
    };
  };
};

const bucket = getStorageClient().storage.from("recipe-images");
const key = "remove";
const remove = "safe-property-name-shadow";

export const tools = {
  [key]: bucket.remove,
};

export const directTools = {
  remove: bucket.remove,
};

void remove;
