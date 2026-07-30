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

export const logicalOrSafeNamespace = {
  tools: {
    remove: safeRemove,
  },
};
const logicalOrTools =
  logicalOrSafeNamespace.tools || logicalOrSafeNamespace.tools;
logicalOrTools.remove = replacementSafeRemove;

export const nullishSafeNamespace = {
  tools: {
    remove: safeRemove,
  },
};
const nullishTools =
  nullishSafeNamespace.tools ?? nullishSafeNamespace.tools;
nullishTools.remove = replacementSafeRemove;

export const logicalAndSafeNamespace = {
  tools: {
    remove: safeRemove,
  },
};
const logicalAndTools =
  logicalAndSafeNamespace.tools && logicalAndSafeNamespace.tools;
logicalAndTools.remove = replacementSafeRemove;

export const spreadSafeNamespace = {
  tools: {
    remove: safeRemove,
  },
};
const spreadSafeAliases = [...[spreadSafeNamespace.tools]];
spreadSafeAliases[0].remove = replacementSafeRemove;
