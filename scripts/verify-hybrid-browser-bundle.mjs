#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const STORAGE_REST_MUTATION_METHODS = new Set([
  "DELETE",
  "PATCH",
  "POST",
  "PUT",
]);
const STORAGE_REST_PATH = "/storage/v1/object/";
const FETCH_VALUE = Symbol("fetch");
const FUNCTION_VALUE = Symbol("function");
const GLOBAL_OBJECT_VALUE = Symbol("global-object");
const STORAGE_NAMESPACE_VALUE = Symbol("storage-namespace");
const STORAGE_FROM_VALUE = Symbol("storage-from");
const STORAGE_BUCKET_VALUE = Symbol("storage-bucket");
const STORAGE_MUTATOR_VALUE = Symbol("storage-mutator");
const CONTROL_FLOW_TAINT = Symbol("control-flow-taint");
const BINDING_INITIALIZED = "initialized";
const BINDING_UNINITIALIZED = "uninitialized";
const BINDING_UNKNOWN = "unknown";
const VALUE_SET_LIMIT = 32;
const EXCEPTION_OUTCOME_LIMIT = 64;
const SDK_MUTATION_METHODS = new Set([
  "copy",
  "delete",
  "move",
  "remove",
  "update",
  "upload",
  "upsert",
  "write",
]);

// The scanner lattice keeps a bounded set of possible known values plus an
// unknown/tainted bit. Every executable control-flow outcome gets its own
// binding state, then joins by union at the statement exit. Unknown state or
// any mutating call-site value fails closed while confirmed-safe sets remain
// safe.
function valueSet(
  known = [],
  {
    fragments = [],
    initialization = BINDING_INITIALIZED,
    unknown = false,
  } = {},
) {
  return {
    fragments: new Set(fragments),
    initialization,
    known: new Set(known),
    unknown,
  };
}

function unknownValue() {
  return valueSet([], { unknown: true });
}

function uninitializedValue() {
  return valueSet([], { initialization: BINDING_UNINITIALIZED });
}

function unknownBindingValue() {
  return valueSet([], {
    initialization: BINDING_UNKNOWN,
    unknown: true,
  });
}

function knownValue(value) {
  return valueSet(
    [value],
    typeof value === "string" ? { fragments: [value] } : undefined,
  );
}

function mergeValues(...values) {
  const merged = valueSet();
  const initializationStates = new Set();
  for (const value of values) {
    if (!value) {
      merged.unknown = true;
      initializationStates.add(BINDING_UNKNOWN);
      continue;
    }
    initializationStates.add(value.initialization ?? BINDING_INITIALIZED);
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
  merged.initialization = initializationStates.size === 1
    ? [...initializationStates][0]
    : BINDING_UNKNOWN;
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

function taintBindings(bindings) {
  for (const [key, value] of bindings) {
    bindings.set(key, mergeValues(value, unknownBindingValue()));
  }
  bindings.set(CONTROL_FLOW_TAINT, unknownValue());
}

function appendExceptionalOutcome(outcomes, bindings) {
  if (outcomes.length < EXCEPTION_OUTCOME_LIMIT) {
    outcomes.push(cloneBindings(bindings));
    return;
  }

  const overflow = outcomes[EXCEPTION_OUTCOME_LIMIT - 1];
  mergeBindings(overflow, overflow, bindings);
  taintBindings(overflow);
}

function isDefinitelyNonThrowingEvaluation(node, bindings) {
  if (ts.isAwaitExpression(node)) {
    return false;
  }

  const expression = unwrapExpression(node);

  if (
    ts.isStringLiteralLike(expression)
    || ts.isNumericLiteral(expression)
    || ts.isBigIntLiteral(expression)
    || ts.isRegularExpressionLiteral(expression)
    || expression.kind === ts.SyntaxKind.TrueKeyword
    || expression.kind === ts.SyntaxKind.FalseKeyword
    || expression.kind === ts.SyntaxKind.NullKeyword
    || ts.isFunctionExpression(expression)
    || ts.isArrowFunction(expression)
    || ts.isMetaProperty(expression)
    || expression.kind === ts.SyntaxKind.ThisKeyword
  ) {
    return true;
  }

  if (ts.isIdentifier(expression)) {
    return bindings.get(expression.text)?.initialization
      === BINDING_INITIALIZED;
  }

  if (ts.isTypeOfExpression(expression)) {
    const operand = unwrapExpression(expression.expression);
    if (!ts.isIdentifier(operand)) {
      return false;
    }
    if (!bindings.has(operand.text)) {
      return true;
    }
    return bindings.get(operand.text)?.initialization
      === BINDING_INITIALIZED;
  }

  if (ts.isArrayLiteralExpression(expression)) {
    return !expression.elements.some((element) => ts.isSpreadElement(element));
  }

  if (ts.isObjectLiteralExpression(expression)) {
    return !expression.properties.some((property) => (
      ts.isSpreadAssignment(property)
      || (
        "name" in property
        && property.name
        && ts.isComputedPropertyName(property.name)
      )
    ));
  }

  if (ts.isConditionalExpression(expression)) {
    return true;
  }

  if (ts.isPrefixUnaryExpression(expression)) {
    return (
      expression.operator === ts.SyntaxKind.ExclamationToken
      || expression.operator === ts.SyntaxKind.VoidKeyword
      || expression.operator === ts.SyntaxKind.TypeOfKeyword
    );
  }

  if (ts.isBinaryExpression(expression)) {
    const operator = expression.operatorToken.kind;
    if (
      operator === ts.SyntaxKind.AmpersandAmpersandToken
      || operator === ts.SyntaxKind.BarBarToken
      || operator === ts.SyntaxKind.QuestionQuestionToken
      || operator === ts.SyntaxKind.CommaToken
    ) {
      return true;
    }
    return (
      operator === ts.SyntaxKind.EqualsToken
      && ts.isIdentifier(unwrapExpression(expression.left))
    );
  }

  return false;
}

function isRuntimeIdentifierReference(node) {
  const parent = node.parent;
  if (!parent) {
    return true;
  }

  if (
    (ts.isPropertyAccessExpression(parent) && parent.name === node)
    || (ts.isPropertyAssignment(parent) && parent.name === node)
    || (ts.isMethodDeclaration(parent) && parent.name === node)
    || (ts.isPropertyDeclaration(parent) && parent.name === node)
    || (ts.isGetAccessorDeclaration(parent) && parent.name === node)
    || (ts.isSetAccessorDeclaration(parent) && parent.name === node)
    || (ts.isVariableDeclaration(parent) && parent.name === node)
    || (ts.isParameter(parent) && parent.name === node)
    || (ts.isBindingElement(parent) && (
      parent.name === node
      || parent.propertyName === node
    ))
    || (ts.isFunctionDeclaration(parent) && parent.name === node)
    || (ts.isFunctionExpression(parent) && parent.name === node)
    || (ts.isClassDeclaration(parent) && parent.name === node)
    || (ts.isClassExpression(parent) && parent.name === node)
    || (ts.isLabeledStatement(parent) && parent.label === node)
    || (ts.isBreakOrContinueStatement(parent) && parent.label === node)
    || ts.isImportClause(parent)
    || ts.isImportSpecifier(parent)
    || ts.isNamespaceImport(parent)
    || ts.isExportSpecifier(parent)
    || ts.isTypeNode(parent)
  ) {
    return false;
  }

  return true;
}

function mayThrowDuringEvaluation(node, bindings) {
  return (
    ts.isExpressionNode(node)
    && (
      !ts.isIdentifier(node)
      || isRuntimeIdentifierReference(node)
    )
    && !isDefinitelyNonThrowingEvaluation(node, bindings)
  );
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

function resolvePropertyNames(node, bindings) {
  if (ts.isComputedPropertyName(node)) {
    return resolvePropertyNames(node.expression, bindings);
  }
  const direct = getPropertyName(node);
  if (direct !== null) {
    return valueSet([direct]);
  }
  const resolved = resolveStaticValue(node, bindings);
  return valueSet(
    [...resolved.known].filter((value) => typeof value === "string"),
    { unknown: resolved.unknown },
  );
}

function resolveMemberValue(expression, bindings) {
  const owner = resolveStaticValue(expression.expression, bindings);
  const propertyNames = ts.isPropertyAccessExpression(expression)
    ? knownValue(expression.name.text)
    : expression.argumentExpression
      ? resolvePropertyNames(expression.argumentExpression, bindings)
      : unknownValue();
  const values = [];
  let unknown = owner.unknown || propertyNames.unknown;

  for (const propertyName of propertyNames.known) {
    if (typeof propertyName !== "string") {
      unknown = true;
      continue;
    }

    if (
      ts.isIdentifier(expression.expression)
      && (
        expression.expression.text === "window"
        || expression.expression.text === "globalThis"
      )
      && propertyName === "fetch"
    ) {
      values.push(knownValue(FETCH_VALUE));
    }

    if (propertyName === "storage") {
      values.push(knownValue(STORAGE_NAMESPACE_VALUE));
    }

    for (const knownOwner of owner.known) {
      if (knownOwner instanceof Map) {
        if (knownOwner.has(propertyName)) {
          values.push(knownOwner.get(propertyName));
        } else {
          unknown = true;
        }
        continue;
      }
      if (
        knownOwner === GLOBAL_OBJECT_VALUE
        && propertyName === "fetch"
      ) {
        values.push(knownValue(FETCH_VALUE));
        continue;
      }
      if (
        knownOwner === STORAGE_NAMESPACE_VALUE
        && propertyName === "from"
      ) {
        values.push(knownValue(STORAGE_FROM_VALUE));
        continue;
      }
      if (
        knownOwner === STORAGE_BUCKET_VALUE
        && SDK_MUTATION_METHODS.has(propertyName)
      ) {
        values.push(knownValue(STORAGE_MUTATOR_VALUE));
      }
    }
  }

  if (values.length === 0) {
    return valueSet([], { unknown: true });
  }
  return mergeValues(...values, valueSet([], { unknown }));
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
    if (
      expression.text === "window"
      || expression.text === "globalThis"
    ) {
      return knownValue(GLOBAL_OBJECT_VALUE);
    }
    return expression.text === "fetch"
      ? knownValue(FETCH_VALUE)
      : unknownValue();
  }

  if (
    ts.isPropertyAccessExpression(expression)
    || ts.isElementAccessExpression(expression)
  ) {
    return resolveMemberValue(expression, bindings);
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

  if (
    ts.isBinaryExpression(expression)
    && expression.operatorToken.kind === ts.SyntaxKind.CommaToken
  ) {
    return resolveStaticValue(expression.right, bindings);
  }

  if (
    ts.isNewExpression(expression)
    && ts.isIdentifier(expression.expression)
    && expression.expression.text === "URL"
    && expression.arguments?.[0]
  ) {
    return resolveStaticValue(expression.arguments[0], bindings);
  }

  if (ts.isCallExpression(expression)) {
    const calleeValue = resolveStaticValue(expression.expression, bindings);
    if (valueHas(calleeValue, STORAGE_FROM_VALUE)) {
      return knownValue(STORAGE_BUCKET_VALUE);
    }
    const propagated = [];
    const callee = unwrapExpression(expression.expression);
    if (
      ts.isPropertyAccessExpression(callee)
      || ts.isElementAccessExpression(callee)
    ) {
      propagated.push(resolveStaticValue(callee.expression, bindings));
    }
    for (const argument of expression.arguments) {
      propagated.push(resolveStaticValue(argument, bindings));
    }
    propagated.push(calleeValue);
    const escaped = mergeValues(...propagated);
    escaped.unknown = true;
    return escaped;
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
        const names = resolvePropertyNames(property.name, bindings);
        objectUnknown ||= names.unknown;
        for (const name of names.known) {
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
        continue;
      }

      if (
        ts.isMethodDeclaration(property)
        || ts.isGetAccessorDeclaration(property)
        || ts.isSetAccessorDeclaration(property)
      ) {
        const names = resolvePropertyNames(property.name, bindings);
        objectUnknown ||= names.unknown;
        for (const name of names.known) {
          properties.set(name, knownValue(FUNCTION_VALUE));
        }
      }
    }
    return valueSet([properties], { unknown: objectUnknown });
  }

  if (
    ts.isFunctionExpression(expression)
    || ts.isArrowFunction(expression)
  ) {
    return knownValue(FUNCTION_VALUE);
  }

  return unknownValue();
}

function valueForProperty(value, propertyName) {
  const values = [];
  let unknown = value.unknown;
  if (propertyName === "storage") {
    values.push(knownValue(STORAGE_NAMESPACE_VALUE));
  }
  for (const known of value.known) {
    if (known instanceof Map) {
      if (known.has(propertyName)) {
        values.push(known.get(propertyName));
      } else {
        unknown = true;
      }
      continue;
    }
    if (
      known === GLOBAL_OBJECT_VALUE
      && propertyName === "fetch"
    ) {
      values.push(knownValue(FETCH_VALUE));
      continue;
    }
    if (
      known === STORAGE_NAMESPACE_VALUE
      && propertyName === "from"
    ) {
      values.push(knownValue(STORAGE_FROM_VALUE));
      continue;
    }
    if (
      known === STORAGE_BUCKET_VALUE
      && SDK_MUTATION_METHODS.has(propertyName)
    ) {
      values.push(knownValue(STORAGE_MUTATOR_VALUE));
      continue;
    }
    unknown = true;
  }
  return values.length > 0
    ? mergeValues(...values, valueSet([], { unknown }))
    : valueSet([], { unknown: true });
}

function assignBindingPattern(name, value, bindings) {
  if (ts.isIdentifier(name)) {
    bindings.set(name.text, value);
    return;
  }

  if (ts.isObjectBindingPattern(name)) {
    for (const element of name.elements) {
      if (element.dotDotDotToken) {
        assignBindingPattern(element.name, unknownValue(), bindings);
        continue;
      }
      const propertyName = element.propertyName
        ? getPropertyName(element.propertyName)
        : ts.isIdentifier(element.name)
          ? element.name.text
          : null;
      assignBindingPattern(
        element.name,
        propertyName === null
          ? unknownValue()
          : valueForProperty(value, propertyName),
        bindings,
      );
    }
    return;
  }

  if (ts.isArrayBindingPattern(name)) {
    for (let index = 0; index < name.elements.length; index += 1) {
      const element = name.elements[index];
      if (ts.isOmittedExpression(element)) {
        continue;
      }
      assignBindingPattern(
        element.name,
        element.dotDotDotToken
          ? unknownValue()
          : valueForProperty(value, String(index)),
        bindings,
      );
    }
  }
}

function findStorageRestFetches(
  source,
  {
    failClosedUnknownStorageCallee = false,
    fileName = "browser-bundle.js",
    initialBindings = {},
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
  const exceptionCollectors = [];
  let visit;

  const captureExceptionalOutcome = (bindings) => {
    for (const outcomes of exceptionCollectors) {
      appendExceptionalOutcome(outcomes, bindings);
    }
  };

  const collectBindingNames = (name, names) => {
    if (ts.isIdentifier(name)) {
      names.add(name.text);
      return;
    }
    for (const element of name.elements) {
      if (ts.isOmittedExpression(element)) {
        continue;
      }
      collectBindingNames(element.name, names);
    }
  };

  const blockScopedNames = (statements) => {
    const names = new Set();
    for (const statement of statements) {
      if (ts.isClassDeclaration(statement) && statement.name) {
        names.add(statement.name.text);
        continue;
      }
      if (
        !ts.isVariableStatement(statement)
        || !(statement.declarationList.flags & ts.NodeFlags.BlockScoped)
      ) {
        continue;
      }
      for (const declaration of statement.declarationList.declarations) {
        collectBindingNames(declaration.name, names);
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

  // Statements return explicit completion records. Only `normal` records may
  // advance to the next statement; abrupt completions retain their bindings
  // until the construct that owns them consumes or propagates them.
  const compactCompletions = (completions) => {
    const compacted = new Map();
    for (const completion of completions) {
      const key = `${completion.kind}:${completion.label ?? ""}`;
      if (!compacted.has(key)) {
        compacted.set(key, {
          ...completion,
          bindings: cloneBindings(completion.bindings),
        });
        continue;
      }
      const existing = compacted.get(key);
      mergeBindings(
        existing.bindings,
        existing.bindings,
        completion.bindings,
      );
    }
    return [...compacted.values()];
  };

  const normalCompletion = (bindings) => ({
    bindings,
    kind: "normal",
    label: null,
  });

  const initializeHoistedBindings = (statements, bindings) => {
    for (const name of blockScopedNames(statements)) {
      bindings.set(name, uninitializedValue());
    }

    for (const statement of statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name) {
        bindings.set(statement.name.text, knownValue(FUNCTION_VALUE));
        continue;
      }
      if (ts.isImportDeclaration(statement) && statement.importClause) {
        const { importClause } = statement;
        if (importClause.name) {
          if (!bindings.has(importClause.name.text)) {
            bindings.set(importClause.name.text, unknownValue());
          }
        }
        if (
          importClause.namedBindings
          && ts.isNamespaceImport(importClause.namedBindings)
        ) {
          if (!bindings.has(importClause.namedBindings.name.text)) {
            bindings.set(
              importClause.namedBindings.name.text,
              unknownValue(),
            );
          }
        } else if (
          importClause.namedBindings
          && ts.isNamedImports(importClause.namedBindings)
        ) {
          for (const element of importClause.namedBindings.elements) {
            if (!element.isTypeOnly) {
              if (!bindings.has(element.name.text)) {
                bindings.set(element.name.text, unknownValue());
              }
            }
          }
        }
        continue;
      }
      if (
        ts.isVariableStatement(statement)
        && !(statement.declarationList.flags & ts.NodeFlags.BlockScoped)
      ) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) {
            bindings.set(declaration.name.text, unknownValue());
          }
        }
      }
    }
  };

  const executeStatementList = (statements, initialBindings) => {
    const entryBindings = cloneBindings(initialBindings);
    initializeHoistedBindings(statements, entryBindings);
    let completions = [normalCompletion(entryBindings)];
    for (const statement of statements) {
      const nextCompletions = [];
      for (const completion of completions) {
        if (completion.kind !== "normal") {
          nextCompletions.push(completion);
          continue;
        }
        nextCompletions.push(
          ...executeStatement(statement, completion.bindings),
        );
      }
      completions = compactCompletions(nextCompletions);
    }
    return completions;
  };

  const executeBlock = (block, inheritedBindings) => {
    const outerNames = new Set(inheritedBindings.keys());
    const shadowedNames = blockScopedNames(block.statements);
    const completions = executeStatementList(
      block.statements,
      cloneBindings(inheritedBindings),
    );

    return completions.map((completion) => {
      const bindings = cloneBindings(inheritedBindings);
      for (const name of outerNames) {
        if (
          !shadowedNames.has(name)
          && completion.bindings.has(name)
        ) {
          bindings.set(name, completion.bindings.get(name));
        }
      }
      if (completion.bindings.has(CONTROL_FLOW_TAINT)) {
        bindings.set(
          CONTROL_FLOW_TAINT,
          completion.bindings.get(CONTROL_FLOW_TAINT),
        );
      }
      return {
        ...completion,
        bindings,
      };
    });
  };

  const executeSwitch = (node, inheritedBindings) => {
    const outerNames = new Set(inheritedBindings.keys());
    const switchStatements = node.caseBlock.clauses.flatMap(
      (clause) => [...clause.statements],
    );
    const shadowedNames = blockScopedNames(switchStatements);
    const selectorBindings = cloneBindings(inheritedBindings);
    for (const name of shadowedNames) {
      selectorBindings.set(name, uninitializedValue());
    }
    visit(node.expression, selectorBindings);
    const clauses = node.caseBlock.clauses;

    for (const clause of clauses) {
      if (!ts.isCaseClause(clause)) {
        continue;
      }
      const evaluatedBindings = cloneBindings(selectorBindings);
      visit(clause.expression, evaluatedBindings);
      mergeBindings(
        selectorBindings,
        selectorBindings,
        evaluatedBindings,
      );
    }

    const outcomes = [];
    for (let entryIndex = 0; entryIndex < clauses.length; entryIndex += 1) {
      const statements = clauses
        .slice(entryIndex)
        .flatMap((clause) => [...clause.statements]);
      const completions = executeStatementList(
        statements,
        selectorBindings,
      );
      for (const completion of completions) {
        if (completion.kind === "break" && completion.label === null) {
          outcomes.push(normalCompletion(completion.bindings));
        } else {
          outcomes.push(completion);
        }
      }
    }

    if (!clauses.some((clause) => ts.isDefaultClause(clause))) {
      outcomes.push(normalCompletion(cloneBindings(selectorBindings)));
    }
    if (outcomes.length === 0) {
      outcomes.push(normalCompletion(cloneBindings(selectorBindings)));
    }
    return compactCompletions(outcomes).map((completion) => {
      const bindings = cloneBindings(inheritedBindings);
      for (const name of outerNames) {
        if (
          !shadowedNames.has(name)
          && completion.bindings.has(name)
        ) {
          bindings.set(name, completion.bindings.get(name));
        }
      }
      if (completion.bindings.has(CONTROL_FLOW_TAINT)) {
        bindings.set(
          CONTROL_FLOW_TAINT,
          completion.bindings.get(CONTROL_FLOW_TAINT),
        );
      }
      return { ...completion, bindings };
    });
  };

  const executeTry = (node, inheritedBindings) => {
    const tryExceptionalOutcomes = [];
    exceptionCollectors.push(tryExceptionalOutcomes);
    let tryCompletions;
    try {
      tryCompletions = executeBlock(node.tryBlock, inheritedBindings);
    } finally {
      exceptionCollectors.pop();
    }

    tryCompletions.push(
      ...tryExceptionalOutcomes.map((bindings) => ({
        bindings,
        kind: "throw",
        label: null,
      })),
    );
    tryCompletions = compactCompletions(tryCompletions);

    let completions = tryCompletions;
    if (node.catchClause) {
      const thrown = tryCompletions.filter(
        (completion) => completion.kind === "throw",
      );
      const unthrown = tryCompletions.filter(
        (completion) => completion.kind !== "throw",
      );
      if (thrown.length > 0) {
        const catchBindings = cloneBindings(thrown[0].bindings);
        mergeBindings(
          catchBindings,
          ...thrown.map((completion) => completion.bindings),
        );
        if (
          node.catchClause.variableDeclaration
          && ts.isIdentifier(node.catchClause.variableDeclaration.name)
        ) {
          catchBindings.set(
            node.catchClause.variableDeclaration.name.text,
            unknownValue(),
          );
        }
        const catchExceptionalOutcomes = [];
        exceptionCollectors.push(catchExceptionalOutcomes);
        let catchCompletions;
        try {
          catchCompletions = executeBlock(
            node.catchClause.block,
            catchBindings,
          );
        } finally {
          exceptionCollectors.pop();
        }
        catchCompletions.push(
          ...catchExceptionalOutcomes.map((bindings) => ({
            bindings,
            kind: "throw",
            label: null,
          })),
        );
        completions = compactCompletions([
          ...unthrown,
          ...catchCompletions,
        ]);
      } else {
        completions = unthrown;
      }
    }

    if (!node.finallyBlock) {
      return completions;
    }

    const finalized = [];
    for (const completion of completions) {
      const finallyCompletions = executeBlock(
        node.finallyBlock,
        completion.bindings,
      );
      for (const finallyCompletion of finallyCompletions) {
        if (finallyCompletion.kind === "normal") {
          finalized.push({
            ...completion,
            bindings: finallyCompletion.bindings,
          });
        } else {
          finalized.push(finallyCompletion);
        }
      }
    }
    return compactCompletions(finalized);
  };

  const executeLoopBody = (statement, inheritedBindings) => (
    executeStatement(statement, cloneBindings(inheritedBindings))
  );

  const executeStatement = (node, inheritedBindings, ownedLabels = []) => {
    const loopOwns = (completion, kind) => (
      completion.kind === kind
      && (
        completion.label === null
        || ownedLabels.includes(completion.label)
      )
    );

    if (ts.isBlock(node)) {
      return executeBlock(node, inheritedBindings);
    }

    if (ts.isIfStatement(node)) {
      const bindings = cloneBindings(inheritedBindings);
      visit(node.expression, bindings);
      const thenCompletions = executeStatement(
        node.thenStatement,
        cloneBindings(bindings),
      );
      const elseCompletions = node.elseStatement
        ? executeStatement(
            node.elseStatement,
            cloneBindings(bindings),
          )
        : [normalCompletion(cloneBindings(bindings))];
      return compactCompletions([
        ...thenCompletions,
        ...elseCompletions,
      ]);
    }

    if (ts.isSwitchStatement(node)) {
      return executeSwitch(node, inheritedBindings);
    }

    if (ts.isTryStatement(node)) {
      return executeTry(node, inheritedBindings);
    }

    if (ts.isWhileStatement(node)) {
      const bindings = cloneBindings(inheritedBindings);
      visit(node.expression, bindings);
      const outcomes = [normalCompletion(cloneBindings(bindings))];
      for (const completion of executeLoopBody(node.statement, bindings)) {
        if (loopOwns(completion, "break")) {
          outcomes.push(normalCompletion(completion.bindings));
          continue;
        }
        if (completion.kind === "normal" || loopOwns(completion, "continue")) {
          const iterationBindings = cloneBindings(completion.bindings);
          visit(node.expression, iterationBindings);
          outcomes.push(normalCompletion(iterationBindings));
          continue;
        }
        outcomes.push(completion);
      }
      return compactCompletions(outcomes);
    }

    if (ts.isDoStatement(node)) {
      const bodyCompletions = executeLoopBody(
        node.statement,
        inheritedBindings,
      );
      const outcomes = [];
      for (const completion of bodyCompletions) {
        if (loopOwns(completion, "break")) {
          outcomes.push(normalCompletion(completion.bindings));
          continue;
        }
        if (completion.kind === "normal" || loopOwns(completion, "continue")) {
          const bindings = cloneBindings(completion.bindings);
          visit(node.expression, bindings);
          outcomes.push(normalCompletion(bindings));
          continue;
        }
        outcomes.push(completion);
      }
      return compactCompletions(outcomes);
    }

    if (ts.isForStatement(node)) {
      const bindings = cloneBindings(inheritedBindings);
      if (node.initializer) {
        visit(node.initializer, bindings);
      }
      if (node.condition) {
        visit(node.condition, bindings);
      }
      const outcomes = [normalCompletion(cloneBindings(bindings))];
      for (const completion of executeLoopBody(node.statement, bindings)) {
        if (loopOwns(completion, "break")) {
          outcomes.push(normalCompletion(completion.bindings));
          continue;
        }
        if (completion.kind === "normal" || loopOwns(completion, "continue")) {
          if (node.incrementor) {
            visit(node.incrementor, completion.bindings);
          }
          if (node.condition) {
            visit(node.condition, completion.bindings);
          }
          outcomes.push(normalCompletion(completion.bindings));
          continue;
        }
        outcomes.push(completion);
      }
      return compactCompletions(outcomes);
    }

    if (ts.isForInStatement(node) || ts.isForOfStatement(node)) {
      const bindings = cloneBindings(inheritedBindings);
      visit(node.initializer, bindings);
      visit(node.expression, bindings);
      captureExceptionalOutcome(bindings);
      const outcomes = [normalCompletion(cloneBindings(bindings))];
      for (const completion of executeLoopBody(node.statement, bindings)) {
        if (
          loopOwns(completion, "break")
          || completion.kind === "normal"
          || loopOwns(completion, "continue")
        ) {
          outcomes.push(normalCompletion(completion.bindings));
        } else {
          outcomes.push(completion);
        }
      }
      return compactCompletions(outcomes);
    }

    if (ts.isThrowStatement(node)) {
      const bindings = cloneBindings(inheritedBindings);
      if (node.expression) {
        visit(node.expression, bindings);
      }
      return [{
        bindings,
        kind: "throw",
        label: null,
      }];
    }

    if (ts.isReturnStatement(node)) {
      const bindings = cloneBindings(inheritedBindings);
      if (node.expression) {
        visit(node.expression, bindings);
      }
      return [{
        bindings,
        kind: "return",
        label: null,
      }];
    }

    if (ts.isBreakStatement(node) || ts.isContinueStatement(node)) {
      return [{
        bindings: cloneBindings(inheritedBindings),
        kind: ts.isBreakStatement(node) ? "break" : "continue",
        label: node.label?.text ?? null,
      }];
    }

    if (ts.isLabeledStatement(node)) {
      if (
        ts.isDoStatement(node.statement)
        || ts.isWhileStatement(node.statement)
        || ts.isForStatement(node.statement)
        || ts.isForInStatement(node.statement)
        || ts.isForOfStatement(node.statement)
        || ts.isLabeledStatement(node.statement)
      ) {
        return executeStatement(
          node.statement,
          inheritedBindings,
          [...ownedLabels, node.label.text],
        );
      }
      return executeStatement(node.statement, inheritedBindings).map(
        (completion) => (
          completion.kind === "break"
          && completion.label === node.label.text
            ? normalCompletion(completion.bindings)
            : completion
        ),
      );
    }

    if (ts.isClassDeclaration(node)) {
      const bindings = cloneBindings(inheritedBindings);
      captureExceptionalOutcome(bindings);
      visit(node, bindings);
      if (node.name) {
        bindings.set(node.name.text, knownValue(FUNCTION_VALUE));
      }
      captureExceptionalOutcome(bindings);
      return [normalCompletion(bindings)];
    }

    if (ts.isWithStatement(node)) {
      const bindings = cloneBindings(inheritedBindings);
      visit(node.expression, bindings);
      taintBindings(bindings);
      return executeStatement(node.statement, bindings);
    }

    const bindings = cloneBindings(inheritedBindings);
    visit(node, bindings);
    return [normalCompletion(bindings)];
  };

  const mergeNormalCompletions = (inheritedBindings, completions) => {
    const normalBindings = completions
      .filter((completion) => completion.kind === "normal")
      .map((completion) => completion.bindings);
    if (normalBindings.length > 0) {
      mergeBindings(inheritedBindings, ...normalBindings);
    }
  };

  visit = (node, inheritedBindings) => {
    const potentiallyThrowing = mayThrowDuringEvaluation(
      node,
      inheritedBindings,
    );
    if (potentiallyThrowing) {
      captureExceptionalOutcome(inheritedBindings);
    }

    if (ts.isSourceFile(node)) {
      const completions = executeStatementList(
        node.statements,
        inheritedBindings,
      );
      mergeNormalCompletions(inheritedBindings, completions);
      return;
    }

    if (ts.isBlock(node)) {
      const completions = executeBlock(node, inheritedBindings);
      mergeNormalCompletions(inheritedBindings, completions);
      return;
    }

    if (ts.isFunctionLike(node)) {
      const bindings = new Map(inheritedBindings);
      for (const parameter of node.parameters) {
        const parameterNames = new Set();
        collectBindingNames(parameter.name, parameterNames);
        for (const name of parameterNames) {
          bindings.set(name, unknownValue());
        }
      }
      const suspendedCollectors = exceptionCollectors.splice(0);
      try {
        if (node.body) {
          visit(node.body, bindings);
        }
      } finally {
        exceptionCollectors.push(...suspendedCollectors);
      }
      return;
    }

    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (declaration.initializer) {
          visit(declaration.initializer, inheritedBindings);
        }
        if (!ts.isIdentifier(declaration.name)) {
          captureExceptionalOutcome(inheritedBindings);
        }
        const declaredValue = declaration.initializer
          ? resolveStaticValue(declaration.initializer, inheritedBindings)
          : unknownValue();
        assignBindingPattern(
          declaration.name,
          declaredValue,
          inheritedBindings,
        );
      }
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

    if (ts.isTypeOfExpression(node)) {
      return;
    }

    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.kind;
      if (
        operator === ts.SyntaxKind.AmpersandAmpersandToken
        || operator === ts.SyntaxKind.BarBarToken
        || operator === ts.SyntaxKind.QuestionQuestionToken
      ) {
        visit(node.left, inheritedBindings);
        const skippedBindings = cloneBindings(inheritedBindings);
        const evaluatedBindings = cloneBindings(inheritedBindings);
        visit(node.right, evaluatedBindings);
        mergeBindings(
          inheritedBindings,
          skippedBindings,
          evaluatedBindings,
        );
        return;
      }

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
          captureExceptionalOutcome(inheritedBindings);
          const objectValue = inheritedBindings.get(target.expression.text);
          const propertyNames = ts.isPropertyAccessExpression(target)
            ? knownValue(target.name.text)
            : target.argumentExpression
              ? resolvePropertyNames(
                  target.argumentExpression,
                  inheritedBindings,
                )
              : unknownValue();
          if (objectValue && propertyNames.known.size > 0) {
            const nextObjects = [];
            let objectUnknown = objectValue.unknown || propertyNames.unknown;
            for (const knownObject of objectValue.known) {
              if (!(knownObject instanceof Map)) {
                objectUnknown = true;
                continue;
              }
              const nextObject = new Map(knownObject);
              for (const propertyName of propertyNames.known) {
                nextObject.set(propertyName, nextValue);
              }
              nextObjects.push(nextObject);
            }
            if (nextObjects.length === 0 && objectUnknown) {
              const possibleObject = new Map();
              for (const propertyName of propertyNames.known) {
                possibleObject.set(propertyName, nextValue);
              }
              nextObjects.push(possibleObject);
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
      ts.isBreakStatement(node)
      || ts.isContinueStatement(node)
      || ts.isReturnStatement(node)
      || ts.isThrowStatement(node)
      || ts.isLabeledStatement(node)
      || ts.isWithStatement(node)
    ) {
      ts.forEachChild(node, (child) => visit(child, inheritedBindings));
      taintBindings(inheritedBindings);
      return;
    }

    if (ts.isCallExpression(node)) {
      const callee = resolveStaticValue(node.expression, inheritedBindings);
      if (valueHas(callee, STORAGE_MUTATOR_VALUE)) {
        matches.push({
          index: node.getStart(sourceFile),
          kind: "supabase-storage-sdk",
          snippet: node.getText(sourceFile).slice(0, 240),
        });
      }

      const url = node.arguments[0]
        ? resolveStaticValue(node.arguments[0], inheritedBindings)
        : unknownValue();
      const hasOptions = node.arguments.length > 1;
      const options = hasOptions
        ? resolveStaticValue(node.arguments[1], inheritedBindings)
        : valueSet();

      const knownFetch = valueHas(callee, FETCH_VALUE);
      const unknownStorageCallee = (
        failClosedUnknownStorageCallee
        && callee.unknown
      );
      if (
        (knownFetch || unknownStorageCallee)
        &&
        valueMayContain(url, STORAGE_REST_PATH)
        && (
          inheritedBindings.has(CONTROL_FLOW_TAINT)
          || optionsCouldMutate(options, hasOptions)
        )
      ) {
        matches.push({
          index: node.getStart(sourceFile),
          kind: "supabase-storage-rest",
          snippet: node.getText(sourceFile).slice(0, 240),
        });
      }
    }

    ts.forEachChild(node, (child) => visit(child, inheritedBindings));
    if (potentiallyThrowing) {
      captureExceptionalOutcome(inheritedBindings);
    }
  };

  const seededBindings = new Map();
  for (const [name, kind] of Object.entries(initialBindings)) {
    seededBindings.set(
      name,
      kind === "fetch"
        ? knownValue(FETCH_VALUE)
        : kind === "function"
          ? knownValue(FUNCTION_VALUE)
          : unknownValue(),
    );
  }
  visit(sourceFile, seededBindings);
  return matches;
}

export function findBrowserBundleStorageMutations(source, parserOptions) {
  const matches = findStorageRestFetches(source, parserOptions);
  return [
    ...new Map(
      matches.map((match) => [`${match.kind}:${match.index}`, match]),
    ).values(),
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
