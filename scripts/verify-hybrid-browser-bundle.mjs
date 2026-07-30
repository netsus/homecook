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
const VALUE_SET_LIMIT = 32;

// The scanner lattice keeps a bounded set of possible known values plus an
// unknown/tainted bit. Branches union their value sets, so any mutating or
// unresolved call-site path fails closed without treating all safe branches
// as mutations.
function valueSet(known = [], { fragments = [], unknown = false } = {}) {
  return {
    fragments: new Set(fragments),
    known: new Set(known),
    unknown,
  };
}

function unknownValue() {
  return valueSet([], { unknown: true });
}

function knownValue(value) {
  return valueSet(
    [value],
    typeof value === "string" ? { fragments: [value] } : undefined,
  );
}

function mergeValues(...values) {
  const merged = valueSet();
  for (const value of values) {
    if (!value) {
      merged.unknown = true;
      continue;
    }
    merged.unknown ||= value.unknown;
    for (const known of value.known) {
      if (merged.known.size >= VALUE_SET_LIMIT) {
        merged.unknown = true;
        break;
      }
      merged.known.add(known);
    }
    for (const fragment of value.fragments) {
      if (merged.fragments.size >= VALUE_SET_LIMIT) {
        merged.unknown = true;
        break;
      }
      merged.fragments.add(fragment);
    }
  }
  return merged;
}

function combineStringValues(left, right) {
  const combined = valueSet([], {
    unknown: left.unknown || right.unknown,
  });
  const leftStrings = [...left.known].filter(
    (value) => typeof value === "string",
  );
  const rightStrings = [...right.known].filter(
    (value) => typeof value === "string",
  );

  for (const leftString of leftStrings) {
    for (const rightString of rightStrings) {
      if (combined.known.size >= VALUE_SET_LIMIT) {
        combined.unknown = true;
        break;
      }
      const joined = `${leftString}${rightString}`;
      combined.known.add(joined);
      combined.fragments.add(joined);
    }
  }

  for (const fragment of left.fragments) {
    combined.fragments.add(fragment);
  }
  for (const fragment of right.fragments) {
    combined.fragments.add(fragment);
  }

  if (leftStrings.length === 0 || rightStrings.length === 0) {
    combined.unknown = true;
  }
  return combined;
}

function cloneBindings(bindings) {
  return new Map(bindings);
}

function mergeBindings(target, ...branches) {
  const keys = new Set(branches.flatMap((branch) => [...branch.keys()]));
  for (const key of keys) {
    target.set(
      key,
      mergeValues(...branches.map((branch) => branch.get(key))),
    );
  }
}

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

function valueMayContain(value, text) {
  return [...value.known, ...value.fragments].some(
    (entry) => typeof entry === "string" && entry.includes(text),
  );
}

function valueHas(value, expected) {
  return value.known.has(expected);
}

function resolveStaticValue(node, bindings) {
  const expression = unwrapExpression(node);

  if (
    ts.isStringLiteralLike(expression)
    || ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return knownValue(expression.text);
  }

  if (ts.isIdentifier(expression)) {
    if (bindings.has(expression.text)) {
      return bindings.get(expression.text);
    }
    return expression.text === "fetch"
      ? knownValue(FETCH_VALUE)
      : unknownValue();
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
    return knownValue(FETCH_VALUE);
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
    return knownValue(FETCH_VALUE);
  }

  if (
    ts.isBinaryExpression(expression)
    && expression.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    return combineStringValues(
      resolveStaticValue(expression.left, bindings),
      resolveStaticValue(expression.right, bindings),
    );
  }

  if (ts.isTemplateExpression(expression)) {
    let resolved = knownValue(expression.head.text);
    for (const span of expression.templateSpans) {
      resolved = combineStringValues(
        resolved,
        resolveStaticValue(span.expression, bindings),
      );
      resolved = combineStringValues(
        resolved,
        knownValue(span.literal.text),
      );
    }
    return resolved;
  }

  if (ts.isConditionalExpression(expression)) {
    return mergeValues(
      resolveStaticValue(expression.whenTrue, bindings),
      resolveStaticValue(expression.whenFalse, bindings),
    );
  }

  if (ts.isObjectLiteralExpression(expression)) {
    const properties = new Map();
    let objectUnknown = false;
    for (const property of expression.properties) {
      if (ts.isSpreadAssignment(property)) {
        const spread = resolveStaticValue(property.expression, bindings);
        objectUnknown ||= spread.unknown;
        for (const spreadValue of spread.known) {
          if (spreadValue instanceof Map) {
            for (const [key, value] of spreadValue) {
              properties.set(key, value);
            }
          } else {
            objectUnknown = true;
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
            : unknownValue(),
        );
      }
    }
    return valueSet([properties], { unknown: objectUnknown });
  }

  return unknownValue();
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

  const blockScopedNames = (block) => {
    const names = new Set();
    for (const statement of block.statements) {
      if (
        !ts.isVariableStatement(statement)
        || !(statement.declarationList.flags & ts.NodeFlags.BlockScoped)
      ) {
        continue;
      }
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          names.add(declaration.name.text);
        }
      }
    }
    return names;
  };

  const optionsCouldMutate = (options, hasOptions) => {
    if (!hasOptions) {
      return false;
    }
    if (options.unknown) {
      return true;
    }

    for (const optionValue of options.known) {
      if (!(optionValue instanceof Map)) {
        return true;
      }
      if (!optionValue.has("method")) {
        continue;
      }

      const methodValue = optionValue.get("method");
      if (!methodValue || methodValue.unknown) {
        return true;
      }
      for (const method of methodValue.known) {
        if (
          typeof method !== "string"
          || STORAGE_REST_MUTATION_METHODS.has(method.toUpperCase())
        ) {
          return true;
        }
      }
    }
    return false;
  };

  const visit = (node, inheritedBindings) => {
    if (ts.isSourceFile(node)) {
      for (const statement of node.statements) {
        visit(statement, inheritedBindings);
      }
      return;
    }

    if (ts.isBlock(node)) {
      const outerNames = new Set(inheritedBindings.keys());
      const shadowedNames = blockScopedNames(node);
      const bindings = cloneBindings(inheritedBindings);
      for (const statement of node.statements) {
        visit(statement, bindings);
      }
      for (const name of outerNames) {
        if (!shadowedNames.has(name) && bindings.has(name)) {
          inheritedBindings.set(name, bindings.get(name));
        }
      }
      return;
    }

    if (ts.isFunctionLike(node)) {
      const bindings = new Map(inheritedBindings);
      for (const parameter of node.parameters) {
        if (ts.isIdentifier(parameter.name)) {
          bindings.set(parameter.name.text, unknownValue());
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
              : unknownValue(),
          );
        }
      }
      return;
    }

    if (ts.isIfStatement(node)) {
      visit(node.expression, inheritedBindings);
      const thenBindings = cloneBindings(inheritedBindings);
      const elseBindings = cloneBindings(inheritedBindings);
      visit(node.thenStatement, thenBindings);
      if (node.elseStatement) {
        visit(node.elseStatement, elseBindings);
      }
      mergeBindings(inheritedBindings, thenBindings, elseBindings);
      return;
    }

    if (ts.isConditionalExpression(node)) {
      visit(node.condition, inheritedBindings);
      const trueBindings = cloneBindings(inheritedBindings);
      const falseBindings = cloneBindings(inheritedBindings);
      visit(node.whenTrue, trueBindings);
      visit(node.whenFalse, falseBindings);
      mergeBindings(inheritedBindings, trueBindings, falseBindings);
      return;
    }

    if (
      ts.isWhileStatement(node)
      || ts.isDoStatement(node)
    ) {
      visit(node.expression, inheritedBindings);
      const noIterationBindings = cloneBindings(inheritedBindings);
      const iterationBindings = cloneBindings(inheritedBindings);
      visit(node.statement, iterationBindings);
      mergeBindings(
        inheritedBindings,
        noIterationBindings,
        iterationBindings,
      );
      return;
    }

    if (ts.isForStatement(node)) {
      if (node.initializer) {
        visit(node.initializer, inheritedBindings);
      }
      if (node.condition) {
        visit(node.condition, inheritedBindings);
      }
      const noIterationBindings = cloneBindings(inheritedBindings);
      const iterationBindings = cloneBindings(inheritedBindings);
      visit(node.statement, iterationBindings);
      if (node.incrementor) {
        visit(node.incrementor, iterationBindings);
      }
      mergeBindings(
        inheritedBindings,
        noIterationBindings,
        iterationBindings,
      );
      return;
    }

    if (ts.isForInStatement(node) || ts.isForOfStatement(node)) {
      visit(node.initializer, inheritedBindings);
      visit(node.expression, inheritedBindings);
      const noIterationBindings = cloneBindings(inheritedBindings);
      const iterationBindings = cloneBindings(inheritedBindings);
      visit(node.statement, iterationBindings);
      mergeBindings(
        inheritedBindings,
        noIterationBindings,
        iterationBindings,
      );
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
          : unknownValue();
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
          if (objectValue && propertyName !== null) {
            const nextObjects = [];
            let objectUnknown = objectValue.unknown;
            for (const knownObject of objectValue.known) {
              if (!(knownObject instanceof Map)) {
                objectUnknown = true;
                continue;
              }
              const nextObject = new Map(knownObject);
              nextObject.set(propertyName, nextValue);
              nextObjects.push(nextObject);
            }
            inheritedBindings.set(
              target.expression.text,
              valueSet(nextObjects, { unknown: objectUnknown }),
            );
          }
        }
        return;
      }
    }

    if (
      ts.isCallExpression(node)
      && valueHas(
        resolveStaticValue(node.expression, inheritedBindings),
        FETCH_VALUE,
      )
    ) {
      const url = node.arguments[0]
        ? resolveStaticValue(node.arguments[0], inheritedBindings)
        : unknownValue();
      const hasOptions = node.arguments.length > 1;
      const options = hasOptions
        ? resolveStaticValue(node.arguments[1], inheritedBindings)
        : valueSet();

      if (
        valueMayContain(url, STORAGE_REST_PATH)
        && optionsCouldMutate(options, hasOptions)
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
