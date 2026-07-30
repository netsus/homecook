declare function getStorageClient(): {
  storage: {
    from(bucket: string): {
      remove(paths: string[]): unknown;
    };
  };
};

export const storageNamespace = getStorageClient().storage;
export const recipeBucket = storageNamespace.from("recipe-images");
export const removeImage = recipeBucket.remove;
export const sdkTools = { remove: removeImage };
export const sdkTuple = [removeImage];
