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
const CONTROL_FLOW_TAINT = Symbol("control-flow-taint");
const VALUE_SET_LIMIT = 32;
const EXCEPTION_OUTCOME_LIMIT = 64;

// The scanner lattice keeps a bounded set of possible known values plus an
// unknown/tainted bit. Every executable control-flow outcome gets its own
// binding state, then joins by union at the statement exit. Unknown state or
// any mutating call-site value fails closed while confirmed-safe sets remain
// safe.
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

function taintBindings(bindings) {
  for (const [key, value] of bindings) {
    bindings.set(key, mergeValues(value, unknownValue()));
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

function isDefinitelyNonThrowingEvaluation(node) {
  const expression = unwrapExpression(node);

  if (
    ts.isIdentifier(expression)
    || ts.isStringLiteralLike(expression)
    || ts.isNumericLiteral(expression)
    || ts.isBigIntLiteral(expression)
    || ts.isRegularExpressionLiteral(expression)
    || expression.kind === ts.SyntaxKind.TrueKeyword
    || expression.kind === ts.SyntaxKind.FalseKeyword
    || expression.kind === ts.SyntaxKind.NullKeyword
    || expression.kind === ts.SyntaxKind.ThisKeyword
    || ts.isFunctionExpression(expression)
    || ts.isArrowFunction(expression)
    || ts.isMetaProperty(expression)
  ) {
    return true;
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

function mayThrowDuringEvaluation(node) {
  return (
    ts.isExpressionNode(node)
    && !isDefinitelyNonThrowingEvaluation(node)
  );
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
  const exceptionCollectors = [];
  let visit;

  const captureExceptionalOutcome = (bindings) => {
    for (const outcomes of exceptionCollectors) {
      appendExceptionalOutcome(outcomes, bindings);
    }
  };

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

  const executeStatementList = (statements, initialBindings) => {
    let completions = [normalCompletion(cloneBindings(initialBindings))];
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
    const shadowedNames = blockScopedNames(block);
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
    const selectorBindings = cloneBindings(inheritedBindings);
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
    return compactCompletions(outcomes);
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
      .map((completion) => {
        if (
          (completion.kind === "break" || completion.kind === "continue")
          && completion.label === null
        ) {
          return normalCompletion(completion.bindings);
        }
        return completion;
      })
  );

  const executeStatement = (node, inheritedBindings) => {
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
      return compactCompletions([
        normalCompletion(cloneBindings(bindings)),
        ...executeLoopBody(node.statement, bindings),
      ]);
    }

    if (ts.isDoStatement(node)) {
      const bodyCompletions = executeLoopBody(
        node.statement,
        inheritedBindings,
      );
      const outcomes = [];
      for (const completion of bodyCompletions) {
        if (completion.kind !== "normal") {
          outcomes.push(completion);
          continue;
        }
        const bindings = cloneBindings(completion.bindings);
        visit(node.expression, bindings);
        outcomes.push(normalCompletion(bindings));
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
        if (
          completion.kind === "normal"
          && node.incrementor
        ) {
          visit(node.incrementor, completion.bindings);
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
      return compactCompletions([
        normalCompletion(cloneBindings(bindings)),
        ...executeLoopBody(node.statement, bindings),
      ]);
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
      return executeStatement(node.statement, inheritedBindings).map(
        (completion) => (
          completion.kind === "break"
          && completion.label === node.label.text
            ? normalCompletion(completion.bindings)
            : completion
        ),
      );
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
    const potentiallyThrowing = mayThrowDuringEvaluation(node);
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
        if (ts.isIdentifier(parameter.name)) {
          bindings.set(parameter.name.text, unknownValue());
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

    if (ts.isConditionalExpression(node)) {
      visit(node.condition, inheritedBindings);
      const trueBindings = cloneBindings(inheritedBindings);
      const falseBindings = cloneBindings(inheritedBindings);
      visit(node.whenTrue, trueBindings);
      visit(node.whenFalse, falseBindings);
      mergeBindings(inheritedBindings, trueBindings, falseBindings);
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
