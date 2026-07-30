declare function getStorageClient(): {
  storage: {
    from(bucket: string): {
      remove(paths: string[]): unknown;
    };
  };
};

const bucket = getStorageClient().storage.from("recipe-images");

let destructuredRemove: (paths: string[]) => unknown = (paths) => {
  void paths;
};
({ remove: destructuredRemove } = bucket);
destructuredRemove(["unsafe.png"]);

let arrayRemove: (paths: string[]) => unknown = (paths) => {
  void paths;
};
[arrayRemove] = [bucket.remove];
arrayRemove(["unsafe.png"]);

const methods = [bucket.remove];
methods[0](["unsafe.png"]);

export {};
