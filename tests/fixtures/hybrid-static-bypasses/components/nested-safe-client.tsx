"use client";

import {
  logicalAndSafeNamespace,
  logicalOrSafeNamespace,
  nestedAliasedSafeNamespace,
  nestedSafeNamespace,
  nullishSafeNamespace,
  spreadSafeNamespace,
} from "../lib/api/nested-safe-tools";

function safeRemove(_paths: string[]) {
  void _paths;
}

function replacementSafeRemove(paths: string[]) {
  return paths.length;
}

const localNamespace = {
  tools: {
    remove: safeRemove,
  },
};

localNamespace.tools.remove = replacementSafeRemove;

const aliasedNamespace = {
  tools: {
    remove: safeRemove,
  },
};
const aliasedTools = aliasedNamespace.tools;
aliasedTools.remove = replacementSafeRemove;

const logicalOrNamespace = {
  tools: {
    remove: safeRemove,
  },
};
const logicalOrTools =
  logicalOrNamespace.tools || logicalOrNamespace.tools;
logicalOrTools.remove = replacementSafeRemove;

const nullishNamespace = {
  tools: {
    remove: safeRemove,
  },
};
const nullishTools =
  nullishNamespace.tools ?? nullishNamespace.tools;
nullishTools.remove = replacementSafeRemove;

const logicalAndNamespace = {
  tools: {
    remove: safeRemove,
  },
};
const logicalAndTools =
  logicalAndNamespace.tools && logicalAndNamespace.tools;
logicalAndTools.remove = replacementSafeRemove;

const spreadNamespace = {
  tools: {
    remove: safeRemove,
  },
};
const spreadAliases = [...[spreadNamespace.tools]];
spreadAliases[0].remove = replacementSafeRemove;

export function removeThroughConfirmedSafeNestedNamespaces() {
  localNamespace.tools.remove(["safe-local.png"]);
  nestedSafeNamespace.tools.remove(["safe-imported.png"]);
  aliasedNamespace.tools.remove(["safe-local-alias.png"]);
  nestedAliasedSafeNamespace.tools.remove(["safe-imported-alias.png"]);
  logicalOrNamespace.tools.remove(["safe-local-or.png"]);
  logicalOrSafeNamespace.tools.remove(["safe-imported-or.png"]);
  nullishNamespace.tools.remove(["safe-local-nullish.png"]);
  nullishSafeNamespace.tools.remove(["safe-imported-nullish.png"]);
  logicalAndNamespace.tools.remove(["safe-local-and.png"]);
  logicalAndSafeNamespace.tools.remove(["safe-imported-and.png"]);
  spreadNamespace.tools.remove(["safe-local-spread.png"]);
  spreadSafeNamespace.tools.remove(["safe-imported-spread.png"]);
}
