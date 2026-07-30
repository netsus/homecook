declare const shouldMutate: boolean;
declare function getStorageClient(): {
  storage: {
    from(bucket: string): {
      remove(paths: string[]): unknown;
    };
  };
};

function safeRemove(_paths: string[]) {
  void _paths;
}

const bucket = getStorageClient().storage.from("recipe-images");

export let remove = safeRemove;
if (shouldMutate) {
  remove = bucket.remove;
}
