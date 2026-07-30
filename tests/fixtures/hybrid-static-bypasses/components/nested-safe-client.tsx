"use client";

import { nestedSafeNamespace } from "../lib/api/nested-safe-tools";

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

export function removeThroughConfirmedSafeNestedNamespaces() {
  localNamespace.tools.remove(["safe-local.png"]);
  nestedSafeNamespace.tools.remove(["safe-imported.png"]);
}
