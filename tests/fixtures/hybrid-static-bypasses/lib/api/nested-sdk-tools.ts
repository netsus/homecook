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

export const nestedSdkNamespace = {
  tools: {
    remove: safeRemove,
  },
};

nestedSdkNamespace.tools.remove = bucket.remove;

export const nestedAliasedSdkNamespace = {
  tools: {
    remove: safeRemove,
  },
};
const aliasedTools = nestedAliasedSdkNamespace.tools;
aliasedTools.remove = bucket.remove;
