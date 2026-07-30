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

export const logicalOrSdkNamespace = {
  tools: {
    remove: safeRemove,
  },
};
const logicalOrTools =
  logicalOrSdkNamespace.tools || logicalOrSdkNamespace.tools;
logicalOrTools.remove = bucket.remove;

export const nullishSdkNamespace = {
  tools: {
    remove: safeRemove,
  },
};
const nullishTools =
  nullishSdkNamespace.tools ?? nullishSdkNamespace.tools;
nullishTools.remove = bucket.remove;

export const logicalAndSdkNamespace = {
  tools: {
    remove: safeRemove,
  },
};
const logicalAndTools =
  logicalAndSdkNamespace.tools && logicalAndSdkNamespace.tools;
logicalAndTools.remove = bucket.remove;

export const spreadSdkNamespace = {
  tools: {
    remove: safeRemove,
  },
};
const spreadSdkAliases = [...[spreadSdkNamespace.tools]];
spreadSdkAliases[0].remove = bucket.remove;
