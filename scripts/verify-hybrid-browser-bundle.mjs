#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const SDK_MUTATION_PATTERN =
  /(?:\.storage|\[\s*["']storage["']\s*\])[\s\S]{0,80}(?:\.from|\[\s*["']from["']\s*\])\s*\([^)]{0,160}\)[\s\S]{0,80}(?:\.(?:copy|delete|move|remove|update|upload|upsert|write)|\[\s*["'](?:copy|delete|move|remove|update|upload|upsert|write)["']\s*\])\s*\(/giu;
const STORAGE_REST_MUTATION_METHODS = new Set([
  "DELETE",
  "PATCH",
  "POST",
  "PUT",
]);
const STORAGE_REST_PATH = "/storage/v1/object/";
const FETCH_VALUE = Symbol("fetch");
const UNKNOWN_VALUE = Symbol("unknown");

function findPatternMatches(source, kind, pattern) {
  return [...source.matchAll(pattern)].map((match) => ({
    index: match.index ?? 0,
    kind,
    snippet: match[0].slice(0, 240),
  }));
}

function unwrapExpression(node) {
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

function getPropertyName(node) {
  if (
    ts.isIdentifier(node)
    || ts.isStringLiteral(node)
    || ts.isNumericLiteral(node)
    || ts.isNoSubstitutionTemplateLiteral(node)
  ) {
    return String(node.text);
  }
  return null;
}

function stringValue(value) {
  return typeof value === "string" ? value : null;
}

function resolveStaticValue(node, bindings) {
  const expression = unwrapExpression(node);

  if (
    ts.isStringLiteralLike(expression)
    || ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text;
  }

  if (ts.isIdentifier(expression)) {
    if (bindings.has(expression.text)) {
      return bindings.get(expression.text);
    }
    return expression.text === "fetch" ? FETCH_VALUE : UNKNOWN_VALUE;
  }

  if (
    ts.isPropertyAccessExpression(expression)
    && ts.isIdentifier(expression.expression)
    && (
      expression.expression.text === "window"
      || expression.expression.text === "globalThis"
    )
    && expression.name.text === "fetch"
  ) {
    return FETCH_VALUE;
  }

  if (
    ts.isElementAccessExpression(expression)
    && ts.isIdentifier(expression.expression)
    && (
      expression.expression.text === "window"
      || expression.expression.text === "globalThis"
    )
    && expression.argumentExpression
    && getPropertyName(expression.argumentExpression) === "fetch"
  ) {
    return FETCH_VALUE;
  }

  if (
    ts.isBinaryExpression(expression)
    && expression.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = stringValue(resolveStaticValue(expression.left, bindings));
    const right = stringValue(resolveStaticValue(expression.right, bindings));
    return left !== null && right !== null ? `${left}${right}` : null;
  }

  if (ts.isObjectLiteralExpression(expression)) {
    const properties = new Map();
    for (const property of expression.properties) {
      if (ts.isSpreadAssignment(property)) {
        const spread = resolveStaticValue(property.expression, bindings);
        if (spread instanceof Map) {
          for (const [key, value] of spread) {
            properties.set(key, value);
          }
        }
        continue;
      }

      if (ts.isPropertyAssignment(property)) {
        const name = getPropertyName(property.name);
        if (name !== null) {
          properties.set(
            name,
            resolveStaticValue(property.initializer, bindings),
          );
        }
        continue;
      }

      if (ts.isShorthandPropertyAssignment(property)) {
        properties.set(
          property.name.text,
          bindings.has(property.name.text)
            ? bindings.get(property.name.text)
            : null,
        );
      }
    }
    return properties;
  }

  return UNKNOWN_VALUE;
}

function findStorageRestFetches(source) {
  const sourceFile = ts.createSourceFile(
    "browser-bundle.js",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const matches = [];

  const visit = (node, inheritedBindings) => {
    if (ts.isSourceFile(node) || ts.isBlock(node)) {
      const bindings = new Map(inheritedBindings);
      for (const statement of node.statements) {
        visit(statement, bindings);
      }
      return;
    }

    if (ts.isFunctionLike(node)) {
      const bindings = new Map(inheritedBindings);
      for (const parameter of node.parameters) {
        if (ts.isIdentifier(parameter.name)) {
          bindings.set(parameter.name.text, UNKNOWN_VALUE);
        }
      }
      if (node.body) {
        visit(node.body, bindings);
      }
      return;
    }

    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (declaration.initializer) {
          visit(declaration.initializer, inheritedBindings);
        }
        if (ts.isIdentifier(declaration.name)) {
          inheritedBindings.set(
            declaration.name.text,
            declaration.initializer
              ? resolveStaticValue(declaration.initializer, inheritedBindings)
              : UNKNOWN_VALUE,
          );
        }
      }
      return;
    }

    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.kind;
      const isAssignment = (
        operator >= ts.SyntaxKind.FirstAssignment
        && operator <= ts.SyntaxKind.LastAssignment
      );
      if (isAssignment) {
        visit(node.right, inheritedBindings);
        const nextValue = operator === ts.SyntaxKind.EqualsToken
          ? resolveStaticValue(node.right, inheritedBindings)
          : UNKNOWN_VALUE;
        const target = unwrapExpression(node.left);
        if (ts.isIdentifier(target)) {
          inheritedBindings.set(target.text, nextValue);
        } else if (
          (
            ts.isPropertyAccessExpression(target)
            || ts.isElementAccessExpression(target)
          )
          && ts.isIdentifier(target.expression)
        ) {
          const objectValue = inheritedBindings.get(target.expression.text);
          const propertyName = ts.isPropertyAccessExpression(target)
            ? target.name.text
            : target.argumentExpression
              ? getPropertyName(target.argumentExpression)
              : null;
          if (objectValue instanceof Map && propertyName !== null) {
            objectValue.set(propertyName, nextValue);
          }
        }
        return;
      }
    }

    if (
      ts.isCallExpression(node)
      && resolveStaticValue(node.expression, inheritedBindings) === FETCH_VALUE
    ) {
      const url = node.arguments[0]
        ? stringValue(resolveStaticValue(node.arguments[0], inheritedBindings))
        : null;
      const hasOptions = node.arguments.length > 1;
      const options = hasOptions
        ? resolveStaticValue(node.arguments[1], inheritedBindings)
        : null;
      const hasMethod = options instanceof Map && options.has("method");
      const methodValue = hasMethod ? options.get("method") : null;
      const method = stringValue(methodValue);
      const couldMutate = hasOptions && (
        !(options instanceof Map)
        || (
          hasMethod
          && (
            method === null
            || STORAGE_REST_MUTATION_METHODS.has(method.toUpperCase())
          )
        )
      );

      if (
        url?.includes(STORAGE_REST_PATH)
        && couldMutate
      ) {
        matches.push({
          index: node.getStart(sourceFile),
          kind: "supabase-storage-rest",
          snippet: node.getText(sourceFile).slice(0, 240),
        });
      }
    }

    ts.forEachChild(node, (child) => visit(child, inheritedBindings));
  };

  visit(sourceFile, new Map());
  return matches;
}

export function findBrowserBundleStorageMutations(source) {
  const executableSource = source.replace(/\/\*\*[\s\S]*?\*\//gu, " ");
  return [
    ...findPatternMatches(
      executableSource,
      "supabase-storage-sdk",
      SDK_MUTATION_PATTERN,
    ),
    ...findStorageRestFetches(executableSource),
  ].sort((left, right) => left.index - right.index);
}

function listBundleFiles(root) {
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
      } else if (/\.(?:js|mjs)$/u.test(entry.name)) {
        files.push(absolutePath);
      }
    }
  };

  if (fs.existsSync(root)) {
    walk(root);
  }
  return files.sort();
}

export function inspectBrowserBundle(root) {
  return listBundleFiles(root).flatMap((file) => (
    findBrowserBundleStorageMutations(fs.readFileSync(file, "utf8")).map(
      (entry) => ({
        ...entry,
        file: path.relative(root, file).split(path.sep).join("/"),
      }),
    )
  ));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const bundleRoot = path.resolve(process.argv[2] ?? ".next/static");
  if (!fs.existsSync(bundleRoot)) {
    process.stderr.write(`Browser bundle directory does not exist: ${bundleRoot}\n`);
    process.exitCode = 1;
  } else {
    const violations = inspectBrowserBundle(bundleRoot);
    if (violations.length > 0) {
      process.stderr.write(
        `Browser direct Storage mutations found:\n${JSON.stringify(violations, null, 2)}\n`,
      );
      process.exitCode = 1;
    } else {
      process.stdout.write("Browser direct Storage mutation count: 0\n");
    }
  }
}
