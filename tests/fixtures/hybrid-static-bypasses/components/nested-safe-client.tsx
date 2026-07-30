"use client";

import {
  nestedAliasedSafeNamespace,
  nestedSafeNamespace,
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

export function removeThroughConfirmedSafeNestedNamespaces() {
  localNamespace.tools.remove(["safe-local.png"]);
  nestedSafeNamespace.tools.remove(["safe-imported.png"]);
  aliasedNamespace.tools.remove(["safe-local-alias.png"]);
  nestedAliasedSafeNamespace.tools.remove(["safe-imported-alias.png"]);
}
