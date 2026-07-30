#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const STORAGE_OBJECT_PATH = "/storage/v1/object/";
const STORAGE_MUTATION_METHODS = new Set([
  "DELETE",
  "PATCH",
  "POST",
  "PUT",
]);
const STORAGE_SDK_MUTATORS = new Set([
  "copy",
  "createSignedUploadUrl",
  "delete",
  "move",
  "remove",
  "update",
  "upload",
  "upsert",
  "write",
]);

function unwrap(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current)
    || ts.isAsExpression(current)
    || ts.isSatisfiesExpression(current)
    || ts.isNonNullExpression(current)
    || ts.isAwaitExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function staticString(node) {
  const expression = unwrap(node);
  if (
    ts.isStringLiteralLike(expression)
    || ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text;
  }
  if (
    ts.isBinaryExpression(expression)
    && expression.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = staticString(expression.left);
    const right = staticString(expression.right);
    return left === null || right === null ? null : `${left}${right}`;
  }
  if (ts.isTemplateExpression(expression)) {
    let value = expression.head.text;
    for (const span of expression.templateSpans) {
      const substitution = staticString(span.expression);
      if (substitution === null) {
        return null;
      }
      value += substitution;
      value += span.literal.text;
    }
    return value;
  }
  return null;
}

function propertyName(node) {
  const expression = unwrap(node);
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }
  if (
    ts.isElementAccessExpression(expression)
    && expression.argumentExpression
  ) {
    return staticString(expression.argumentExpression);
  }
  return null;
}

function containsStorageNamespace(node) {
  let found = false;
  const visit = (candidate) => {
    if (found) {
      return;
    }
    if (
      (
        ts.isPropertyAccessExpression(candidate)
        || ts.isElementAccessExpression(candidate)
      )
      && propertyName(candidate) === "storage"
    ) {
      found = true;
      return;
    }
    ts.forEachChild(candidate, visit);
  };
  visit(node);
  return found;
}

function isDirectFetch(node) {
  const expression = unwrap(node);
  if (ts.isIdentifier(expression)) {
    return expression.text === "fetch";
  }
  if (
    (
      ts.isPropertyAccessExpression(expression)
      || ts.isElementAccessExpression(expression)
    )
    && propertyName(expression) === "fetch"
  ) {
    const owner = unwrap(expression.expression);
    return ts.isIdentifier(owner)
      && (owner.text === "window" || owner.text === "globalThis");
  }
  return false;
}

function requestMethod(node) {
  if (!node) {
    return "GET";
  }
  const expression = unwrap(node);
  if (!ts.isObjectLiteralExpression(expression)) {
    return null;
  }
  for (const property of expression.properties) {
    if (
      ts.isPropertyAssignment(property)
      && (
        (
          ts.isIdentifier(property.name)
          && property.name.text === "method"
        )
        || staticString(property.name) === "method"
      )
    ) {
      return staticString(property.initializer)?.toUpperCase() ?? null;
    }
  }
  return "GET";
}

function snippet(sourceFile, node) {
  return node.getText(sourceFile).slice(0, 240);
}

export function findBrowserBundleStorageMutations(
  source,
  {
    fileName = "browser-bundle.js",
    scriptKind = ts.ScriptKind.JS,
  } = {},
) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const matches = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      const mutator = (
        ts.isPropertyAccessExpression(callee)
        || ts.isElementAccessExpression(callee)
      ) ? propertyName(callee) : null;
      if (
        mutator
        && STORAGE_SDK_MUTATORS.has(mutator)
        && containsStorageNamespace(callee.expression)
      ) {
        matches.push({
          index: node.getStart(sourceFile),
          kind: "supabase-storage-sdk",
          snippet: snippet(sourceFile, node),
        });
      } else if (isDirectFetch(callee)) {
        const url = node.arguments[0]
          ? staticString(node.arguments[0])
          : null;
        const method = requestMethod(node.arguments[1]);
        if (
          url?.includes(STORAGE_OBJECT_PATH)
          && (
            method === null
            || STORAGE_MUTATION_METHODS.has(method)
          )
        ) {
          matches.push({
            index: node.getStart(sourceFile),
            kind: "supabase-storage-rest",
            snippet: snippet(sourceFile, node),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return matches;
}

function listBundleFiles(rootDir) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(target);
      } else if (/\.(js|mjs)$/u.test(entry.name)) {
        files.push(target);
      }
    }
  };
  walk(rootDir);
  return files.sort();
}

export function inspectBrowserBundle(rootDir) {
  return listBundleFiles(rootDir).flatMap((file) => {
    const source = fs.readFileSync(file, "utf8");
    return findBrowserBundleStorageMutations(source, {
      fileName: file,
    }).map((match) => ({
      ...match,
      file: path.relative(rootDir, file).split(path.sep).join("/"),
    }));
  });
}

function runCli() {
  const rootDir = path.resolve(process.argv[2] ?? ".next/static");
  if (!fs.existsSync(rootDir)) {
    console.error(`Browser bundle directory not found: ${rootDir}`);
    process.exitCode = 1;
    return;
  }
  const matches = inspectBrowserBundle(rootDir);
  process.stdout.write(
    `Browser direct Storage mutation count: ${matches.length}\n`,
  );
  for (const match of matches) {
    console.error(`${match.file}:${match.index} ${match.snippet}`);
  }
  if (matches.length > 0) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  runCli();
}
