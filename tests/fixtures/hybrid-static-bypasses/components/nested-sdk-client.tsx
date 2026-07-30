"use client";

import {
  nestedAliasedSdkNamespace,
  nestedSdkNamespace,
} from "../lib/api/nested-sdk-tools";

declare const client: {
  storage: {
    from(bucket: string): {
      remove(paths: string[]): unknown;
    };
  };
};

function safeRemove(_paths: string[]) {
  void _paths;
}

const bucket = client.storage.from("recipe-images");
const localNamespace = {
  tools: {
    remove: safeRemove,
  },
};

localNamespace.tools.remove = bucket.remove;

const aliasedNamespace = {
  tools: {
    remove: safeRemove,
  },
};
const aliasedTools = aliasedNamespace.tools;
aliasedTools.remove = bucket.remove;

export function removeThroughNestedNamespaces() {
  localNamespace.tools.remove(["unsafe-local.png"]);
  nestedSdkNamespace.tools.remove(["unsafe-imported.png"]);
  aliasedNamespace.tools.remove(["unsafe-local-alias.png"]);
  nestedAliasedSdkNamespace.tools.remove(["unsafe-imported-alias.png"]);
}
