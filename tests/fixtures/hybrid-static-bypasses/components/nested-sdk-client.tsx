"use client";

import {
  logicalAndSdkNamespace,
  logicalOrSdkNamespace,
  nestedAliasedSdkNamespace,
  nestedSdkNamespace,
  nullishSdkNamespace,
  spreadSdkNamespace,
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

const logicalOrNamespace = {
  tools: {
    remove: safeRemove,
  },
};
const logicalOrTools =
  logicalOrNamespace.tools || logicalOrNamespace.tools;
logicalOrTools.remove = bucket.remove;

const nullishNamespace = {
  tools: {
    remove: safeRemove,
  },
};
const nullishTools =
  nullishNamespace.tools ?? nullishNamespace.tools;
nullishTools.remove = bucket.remove;

const logicalAndNamespace = {
  tools: {
    remove: safeRemove,
  },
};
const logicalAndTools =
  logicalAndNamespace.tools && logicalAndNamespace.tools;
logicalAndTools.remove = bucket.remove;

const spreadNamespace = {
  tools: {
    remove: safeRemove,
  },
};
const spreadAliases = [...[spreadNamespace.tools]];
spreadAliases[0].remove = bucket.remove;

export function removeThroughNestedNamespaces() {
  localNamespace.tools.remove(["unsafe-local.png"]);
  nestedSdkNamespace.tools.remove(["unsafe-imported.png"]);
  aliasedNamespace.tools.remove(["unsafe-local-alias.png"]);
  nestedAliasedSdkNamespace.tools.remove(["unsafe-imported-alias.png"]);
  logicalOrNamespace.tools.remove(["unsafe-local-or.png"]);
  logicalOrSdkNamespace.tools.remove(["unsafe-imported-or.png"]);
  nullishNamespace.tools.remove(["unsafe-local-nullish.png"]);
  nullishSdkNamespace.tools.remove(["unsafe-imported-nullish.png"]);
  logicalAndNamespace.tools.remove(["unsafe-local-and.png"]);
  logicalAndSdkNamespace.tools.remove(["unsafe-imported-and.png"]);
  spreadNamespace.tools.remove(["unsafe-local-spread.png"]);
  spreadSdkNamespace.tools.remove(["unsafe-imported-spread.png"]);
}
