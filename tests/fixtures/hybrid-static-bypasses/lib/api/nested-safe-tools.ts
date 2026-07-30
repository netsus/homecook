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

export const nestedAliasedSafeNamespace = {
  tools: {
    remove: safeRemove,
  },
};
const aliasedTools = nestedAliasedSafeNamespace.tools;
aliasedTools.remove = replacementSafeRemove;
