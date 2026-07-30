function safeRemove(_paths: string[]) {
  void _paths;
}

function replacementSafeRemove(paths: string[]) {
  return paths.length;
}

export const nestedSafeNamespace = {
  tools: {
    remove: safeRemove,
  },
};

nestedSafeNamespace.tools.remove = replacementSafeRemove;
