#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

import {
  HYBRID_PUBLIC_ROUTE_CONTRACTS,
} from "../../lib/server/hybrid-auth/public-read-policy-runtime.mjs";

const SKIP_DIRS = new Set([".git", ".next", "coverage", "dist", "node_modules"]);
const SOURCE_FILE_PATTERN = /\.(ts|tsx)$/u;
const SCAN_ROOTS = ["app", "components", "lib"];

const PUBLIC_ALLOWLIST_FILES = new Set([
  "app/api/v1/feedback/404/route.ts",
  ...HYBRID_PUBLIC_ROUTE_CONTRACTS.map((contract) => contract.file),
]);

const ADMIN_ALLOWLIST_FILES = new Set([
  "app/admin/layout.tsx",
]);

const INTERNAL_ALLOWLIST_FILES = new Set([
  "app/auth/callback/route.ts",
  "app/auth/link/callback/route.ts",
  "app/auth/logout/route.ts",
  "lib/server/account-generation/quarantine-gate.ts",
  "lib/server/admin-auth.ts",
  "lib/server/admin-events.ts",
  "lib/server/full-local-auth/local-dev-session-bootstrap.ts",
  "lib/server/recipe-snapshot-entrypoint.ts",
  "lib/supabase/server.ts",
]);

const INTERNAL_OPERATION_ALLOWLIST = new Map([
  [
    "createAuthCallbackOperationsClient",
    new Set(["app/auth/callback/route.ts"]),
  ],
  [
    "createLocalDevSessionBootstrapInternalClient",
    new Set(["lib/server/full-local-auth/local-dev-session-bootstrap.ts"]),
  ],
  [
    "createAdminDataInternalClient",
    new Set([
      "app/admin/layout.tsx",
      "lib/server/admin-auth.ts",
    ]),
  ],
  [
    "createNotFoundFeedbackInternalClient",
    new Set(["app/api/v1/feedback/404/route.ts"]),
  ],
  [
    "createRecipeFuturePropagationInternalClient",
    new Set([
      "app/api/v1/recipes/[id]/future-plan-impact/route.ts",
      "app/api/v1/recipes/[id]/route.ts",
      "lib/server/recipe-snapshot-entrypoint.ts",
    ]),
  ],
  [
    "createSnapshotV2SessionInternalClient",
    new Set([
      "app/api/v1/cooking/session-attempts/route.ts",
      "app/api/v1/cooking/session-attempts/[id]/cook-mode/route.ts",
      "app/api/v1/cooking/session-attempts/[id]/cancel/route.ts",
      "app/api/v1/cooking/sessions/[session_id]/complete/route.ts",
      "app/api/v1/cooking/standalone-complete/route.ts",
    ]),
  ],
  [
    "createFutureMealWriteInternalClient",
    new Set([
      "app/api/v1/meals/route.ts",
      "app/api/v1/meals/[meal_id]/route.ts",
    ]),
  ],
  [
    "createShoppingCreateInternalClient",
    new Set(["app/api/v1/shopping/lists/route.ts"]),
  ],
  [
    "createOperationalEventInternalClient",
    new Set(["lib/server/admin-events.ts"]),
  ],
  [
    "createAuthRefreshInternalDataClient",
    new Set(["lib/supabase/server.ts"]),
  ],
  [
    "createSessionLogoutInternalDataClient",
    new Set(["lib/server/hybrid-auth/logout.ts"]),
  ],
  [
    "createRecipeImageInternalClient",
    new Set([
      "app/api/v1/recipes/images/[image_object_id]/cancel/route.ts",
      "app/api/v1/recipes/images/route.ts",
    ]),
  ],
  [
    "createAccountLifecycleInternalRpcClient",
    new Set([
      "app/api/v1/users/me/cutover-quarantine-resolution/route.ts",
      "app/api/v1/users/me/route.ts",
      "lib/server/account-generation/quarantine-gate.ts",
    ]),
  ],
  [
    "createYoutubeIngredientRegistrationInternalRpcClient",
    new Set(["lib/server/youtube-import.ts"]),
  ],
  [
    "createYoutubeExtractionInternalClient",
    new Set(["lib/server/youtube-import.ts"]),
  ],
]);

const INTERNAL_OPERATION_FUNCTION_ALLOWLIST = new Map([
  [
    "createRecipeFuturePropagationInternalClient",
    new Map([
      [
        "app/api/v1/recipes/[id]/future-plan-impact/route.ts",
        new Set(["POST"]),
      ],
      [
        "app/api/v1/recipes/[id]/route.ts",
        new Set(["DELETE", "PATCH"]),
      ],
      [
        "lib/server/recipe-snapshot-entrypoint.ts",
        new Set([
          "readRecipeSnapshotEntrypointContext",
          "readRecipeSnapshotUiMode",
        ]),
      ],
    ]),
  ],
  [
    "createSnapshotV2SessionInternalClient",
    new Map([
      [
        "app/api/v1/cooking/session-attempts/route.ts",
        new Set(["POST"]),
      ],
      [
        "app/api/v1/cooking/session-attempts/[id]/cook-mode/route.ts",
        new Set(["GET"]),
      ],
      [
        "app/api/v1/cooking/session-attempts/[id]/cancel/route.ts",
        new Set(["POST"]),
      ],
      [
        "app/api/v1/cooking/sessions/[session_id]/complete/route.ts",
        new Set(["POST"]),
      ],
      [
        "app/api/v1/cooking/standalone-complete/route.ts",
        new Set(["POST"]),
      ],
    ]),
  ],
  [
    "createFutureMealWriteInternalClient",
    new Map([
      [
        "app/api/v1/meals/route.ts",
        new Set(["postMeals"]),
      ],
      [
        "app/api/v1/meals/[meal_id]/route.ts",
        new Set(["DELETE", "PATCH"]),
      ],
    ]),
  ],
  [
    "createShoppingCreateInternalClient",
    new Map([
      [
        "app/api/v1/shopping/lists/route.ts",
        new Set(["POST"]),
      ],
    ]),
  ],
  [
    "createYoutubeExtractionInternalClient",
    new Map([
      [
        "lib/server/youtube-import.ts",
        new Set(["handleYoutubeCandidateDraft", "handleYoutubeExtract"]),
      ],
    ]),
  ],
]);

const BROWSER_DIRECT_STORAGE_ALLOWLIST = new Map([
  [
    "components/recipe/manual-recipe-create-screen.tsx",
    {
      reason: "legacy browser Storage mutation path retained as Stage 4 removal evidence",
      stage: 4,
    },
  ],
]);

const BROWSER_DATA_MUTATION_METHODS = new Set([
  "delete",
  "insert",
  "update",
  "upsert",
]);
const BROWSER_CLIENT_FACTORY_NAMES = new Set([
  "createBrowserClient",
  "createClient",
  "getSupabaseBrowserClient",
]);
const SERVICE_ROLE_FACTORY_NAMES = new Set([
  "createServiceRoleClient",
  "createLocalDevSessionBootstrapInternalClient",
  "createFutureMealWriteInternalClient",
  "createShoppingCreateInternalClient",
  "createSnapshotV2SessionInternalClient",
  "createYoutubeExtractionInternalClient",
]);
const REST_MUTATION_METHODS = new Set(["DELETE", "PATCH", "POST", "PUT"]);

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function toRelativeFile(repoRoot, absoluteFile) {
  return normalizePath(path.relative(repoRoot, absoluteFile));
}

function compareEntries(left, right) {
  if (left.file !== right.file) {
    return left.file.localeCompare(right.file);
  }
  if (left.line !== right.line) {
    return left.line - right.line;
  }
  return left.column - right.column;
}

function listSourceFiles(repoRoot) {
  const files = [];

  const walk = (absoluteDir) => {
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          continue;
        }
        walk(path.join(absoluteDir, entry.name));
        continue;
      }

      if (!SOURCE_FILE_PATTERN.test(entry.name)) {
        continue;
      }

      files.push(path.join(absoluteDir, entry.name));
    }
  };

  for (const root of SCAN_ROOTS) {
    const absoluteRoot = path.join(repoRoot, root);
    if (fs.existsSync(absoluteRoot)) {
      walk(absoluteRoot);
    }
  }

  return files.sort();
}

function scriptKindFor(filePath) {
  return filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
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

function isNamedCall(node, name) {
  const expression = unwrapExpression(node);
  return ts.isCallExpression(expression)
    && ts.isIdentifier(expression.expression)
    && expression.expression.text === name;
}

function isRouteClientExpression(node) {
  const expression = unwrapExpression(node);

  return (ts.isIdentifier(expression) && expression.text === "routeClient")
    || isNamedCall(expression, "createRouteHandlerClient");
}

function classifyFile(file) {
  if (PUBLIC_ALLOWLIST_FILES.has(file)) {
    return "public";
  }
  if (ADMIN_ALLOWLIST_FILES.has(file)) {
    return "admin";
  }
  if (INTERNAL_ALLOWLIST_FILES.has(file)) {
    return "internal";
  }
  return "user";
}

function getLineColumn(sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    column: character + 1,
    line: line + 1,
  };
}

function createBaseEntry(relativeFile, sourceFile, node, classification) {
  return {
    classification,
    file: relativeFile,
    ...getLineColumn(sourceFile, node),
  };
}

function getEnclosingFunctionName(node) {
  let current = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) {
      return current.name.text;
    }
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current))
      && ts.isVariableDeclaration(current.parent)
      && ts.isIdentifier(current.parent.name)
    ) {
      return current.parent.name.text;
    }
    if (ts.isMethodDeclaration(current) && current.name) {
      return current.name.getText();
    }
    current = current.parent;
  }
  return null;
}

function isStorageFromCall(node) {
  const expression = unwrapExpression(node);
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)) {
    return false;
  }

  const fromAccess = expression.expression;
  if (fromAccess.name.text !== "from" || !ts.isPropertyAccessExpression(fromAccess.expression)) {
    return false;
  }

  return fromAccess.expression.name.text === "storage";
}

function importModuleName(node) {
  return ts.isStringLiteral(node.moduleSpecifier)
    ? node.moduleSpecifier.text
    : "";
}

function importedBindingName(specifier) {
  return specifier.propertyName?.text ?? specifier.name.text;
}

function collectImportBindings(sourceFile) {
  const browserClientFactories = new Set(["getSupabaseBrowserClient"]);
  const browserClientNamespaces = new Set();
  const serviceRoleFactories = new Set(SERVICE_ROLE_FACTORY_NAMES);
  const serviceRoleNamespaces = new Set();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    const moduleName = importModuleName(statement);
    const namedBindings = statement.importClause.namedBindings;
    const isBrowserModule =
      moduleName === "@/lib/supabase/browser"
      || moduleName === "@supabase/ssr"
      || moduleName === "@supabase/supabase-js";
    const isServerModule = moduleName === "@/lib/supabase/server";
    if (namedBindings && ts.isNamespaceImport(namedBindings)) {
      if (isBrowserModule) browserClientNamespaces.add(namedBindings.name.text);
      if (isServerModule) serviceRoleNamespaces.add(namedBindings.name.text);
      continue;
    }
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;
    for (const specifier of namedBindings.elements) {
      const importedName = importedBindingName(specifier);
      if (
        isBrowserModule
        && BROWSER_CLIENT_FACTORY_NAMES.has(importedName)
      ) {
        browserClientFactories.add(specifier.name.text);
      }
      if (isServerModule && SERVICE_ROLE_FACTORY_NAMES.has(importedName)) {
        serviceRoleFactories.add(specifier.name.text);
      }
    }
  }
  return {
    browserClientFactories,
    browserClientNamespaces,
    serviceRoleFactories,
    serviceRoleNamespaces,
  };
}

function isFactoryCall(node, identifiers, namespaces, memberNames) {
  const expression = unwrapExpression(node);
  if (!ts.isCallExpression(expression)) return false;
  return isFactoryReference(
    expression.expression,
    identifiers,
    namespaces,
    memberNames,
  );
}

function isFactoryReference(node, identifiers, namespaces, memberNames) {
  const expression = unwrapExpression(node);
  if (ts.isIdentifier(expression)) return identifiers.has(expression.text);
  if (ts.isConditionalExpression(expression)) {
    return isFactoryReference(
      expression.whenTrue,
      identifiers,
      namespaces,
      memberNames,
    ) || isFactoryReference(
      expression.whenFalse,
      identifiers,
      namespaces,
      memberNames,
    );
  }
  return ts.isPropertyAccessExpression(expression)
    && ts.isIdentifier(expression.expression)
    && namespaces.has(expression.expression.text)
    && memberNames.has(expression.name.text);
}

function staticString(expression, constants) {
  const value = unwrapExpression(expression);
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) {
    return value.text;
  }
  if (ts.isIdentifier(value)) return constants.get(value.text) ?? null;
  if (
    ts.isBinaryExpression(value)
    && value.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = staticString(value.left, constants);
    const right = staticString(value.right, constants);
    return left === null || right === null ? null : left + right;
  }
  if (ts.isTemplateExpression(value)) {
    let result = value.head.text;
    for (const span of value.templateSpans) {
      const expressionValue = staticString(span.expression, constants);
      if (expressionValue === null) return null;
      result += expressionValue + span.literal.text;
    }
    return result;
  }
  return null;
}

function objectStringProperty(object, name, constants) {
  const value = unwrapExpression(object);
  if (!ts.isObjectLiteralExpression(value)) return null;
  for (const property of value.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const propertyName = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
      ? property.name.text
      : "";
    if (propertyName === name) return staticString(property.initializer, constants);
  }
  return null;
}

function isFetchCall(node) {
  const expression = unwrapExpression(node.expression);
  if (ts.isIdentifier(expression)) return expression.text === "fetch";
  return ts.isPropertyAccessExpression(expression)
    && expression.name.text === "fetch"
    && ts.isIdentifier(expression.expression)
    && ["globalThis", "window"].includes(expression.expression.text);
}

function isClientModule(sourceFile) {
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) {
      return false;
    }

    if (statement.expression.text === "use client") {
      return true;
    }
  }

  return false;
}

function inventoryHybridAuthorityPaths(repoRoot = process.cwd()) {
  const serviceRoleEntries = [];
  const remoteCompatibilityEntries = [];
  const fallbackEntries = [];
  const browserDirectStoragePaths = [];
  const browserDirectDataMutationPaths = [];
  const browserRawRestMutationPaths = [];
  const internalOperationEntries = [];
  const serviceRoleEntryKeys = new Set();
  const fallbackEntryKeys = new Set();
  const storageEntryKeys = new Set();
  const dataMutationEntryKeys = new Set();
  const rawRestMutationEntryKeys = new Set();
  const remoteCompatibilityEntryKeys = new Set();
  const internalOperationEntryKeys = new Set();
  const declaredPublicRouteScopes = new Map();
  const dataRouteResponseBoundaries = [];

  for (const absoluteFile of listSourceFiles(repoRoot)) {
    const relativeFile = toRelativeFile(repoRoot, absoluteFile);
    const source = fs.readFileSync(absoluteFile, "utf8");
    const sourceFile = ts.createSourceFile(
      relativeFile,
      source,
      ts.ScriptTarget.Latest,
      true,
      scriptKindFor(absoluteFile),
    );
    const classification = classifyFile(relativeFile);
    const clientModule = isClientModule(sourceFile);
    const importBindings = collectImportBindings(sourceFile);
    const browserClientVariables = new Set();
    const browserQueryBuilderVariables = new Map();
    const stringConstants = new Map();
    const serviceRoleVariables = new Set();
    let usesDataRouteClient = false;

    const visit = (node) => {
      if (
        ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && node.initializer
      ) {
        const literal = staticString(node.initializer, stringConstants);
        if (literal !== null) stringConstants.set(node.name.text, literal);
        const initializer = unwrapExpression(node.initializer);
        if (
          isFactoryReference(
            initializer,
            importBindings.serviceRoleFactories,
            importBindings.serviceRoleNamespaces,
            SERVICE_ROLE_FACTORY_NAMES,
          )
        ) {
          importBindings.serviceRoleFactories.add(node.name.text);
        }
        if (
          isFactoryCall(
            initializer,
            importBindings.browserClientFactories,
            importBindings.browserClientNamespaces,
            BROWSER_CLIENT_FACTORY_NAMES,
          )
          || (ts.isIdentifier(initializer) && browserClientVariables.has(initializer.text))
        ) {
          browserClientVariables.add(node.name.text);
        }
        if (
          ts.isCallExpression(initializer)
          && ts.isPropertyAccessExpression(initializer.expression)
          && initializer.expression.name.text === "from"
        ) {
          const client = unwrapExpression(initializer.expression.expression);
          const knownClient =
            (ts.isIdentifier(client) && browserClientVariables.has(client.text))
            || isFactoryCall(
              client,
              importBindings.browserClientFactories,
              importBindings.browserClientNamespaces,
              BROWSER_CLIENT_FACTORY_NAMES,
            );
          if (knownClient) {
            browserQueryBuilderVariables.set(
              node.name.text,
              initializer.arguments[0]
                ? staticString(initializer.arguments[0], stringConstants)
                : null,
            );
          }
        } else if (
          ts.isIdentifier(initializer)
          && browserQueryBuilderVariables.has(initializer.text)
        ) {
          browserQueryBuilderVariables.set(
            node.name.text,
            browserQueryBuilderVariables.get(initializer.text),
          );
        }
      }

      if (
        ts.isCallExpression(node)
        && (
          isNamedCall(node, "createRouteHandlerClient")
          || isNamedCall(node, "createDataRouteHandlerClient")
          || isNamedCall(node, "authorizeCookedBatchRequest")
        )
      ) {
        usesDataRouteClient = true;
      }

      if (
        ts.isCallExpression(node)
        && isNamedCall(node, "createRouteHandlerClient")
        && node.arguments.length === 1
      ) {
        const options = unwrapExpression(node.arguments[0]);
        if (ts.isObjectLiteralExpression(options)) {
          const property = options.properties.find(
            (candidate) =>
              ts.isPropertyAssignment(candidate)
              && (
                ts.isIdentifier(candidate.name)
                || ts.isStringLiteral(candidate.name)
              )
              && candidate.name.text === "anonymousPublicReadScope",
          );
          if (property && ts.isPropertyAssignment(property)) {
            const value = unwrapExpression(property.initializer);
            if (ts.isStringLiteral(value)) {
              declaredPublicRouteScopes.set(relativeFile, value.text);
            }
          }
        }
      }

      if (
        ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && node.initializer
        && isFactoryCall(
          node.initializer,
          importBindings.serviceRoleFactories,
          importBindings.serviceRoleNamespaces,
          SERVICE_ROLE_FACTORY_NAMES,
        )
      ) {
        serviceRoleVariables.add(node.name.text);
      }

      if (
        ts.isCallExpression(node)
        && isFactoryCall(
          node,
          importBindings.serviceRoleFactories,
          importBindings.serviceRoleNamespaces,
          SERVICE_ROLE_FACTORY_NAMES,
        )
      ) {
        const entry = {
          ...createBaseEntry(relativeFile, sourceFile, node, classification),
          kind: "service-role-call",
        };
        const key = `${entry.file}:${entry.line}:${entry.column}:${entry.kind}`;
        if (!serviceRoleEntryKeys.has(key)) {
          serviceRoleEntryKeys.add(key);
          serviceRoleEntries.push(entry);
        }
      }

      if (
        ts.isCallExpression(node)
        && isNamedCall(node, "createRemoteCompatibilityServiceRoleClient")
      ) {
        const entry = {
          ...createBaseEntry(relativeFile, sourceFile, node, classification),
          kind: "remote-only-compatibility-call",
        };
        const key = `${entry.file}:${entry.line}:${entry.column}:${entry.kind}`;
        if (!remoteCompatibilityEntryKeys.has(key)) {
          remoteCompatibilityEntryKeys.add(key);
          remoteCompatibilityEntries.push(entry);
        }
      }

      if (ts.isCallExpression(node)) {
        for (const [factory, allowedFiles] of INTERNAL_OPERATION_ALLOWLIST) {
          if (!isNamedCall(node, factory)) {
            continue;
          }
          const functionName = getEnclosingFunctionName(node);
          const allowedFunctionsByFile =
            INTERNAL_OPERATION_FUNCTION_ALLOWLIST.get(factory);
          const allowedFunctions = allowedFunctionsByFile?.get(relativeFile);
          const entry = {
            ...createBaseEntry(relativeFile, sourceFile, node, classification),
            allowed:
              allowedFiles.has(relativeFile)
              && (!allowedFunctionsByFile
                || (functionName !== null && allowedFunctions?.has(functionName) === true)),
            factory,
            functionName,
            kind: "internal-operation-call",
          };
          const key = `${entry.file}:${entry.line}:${entry.column}:${entry.factory}`;
          if (!internalOperationEntryKeys.has(key)) {
            internalOperationEntryKeys.add(key);
            internalOperationEntries.push(entry);
          }
        }
      }

      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
        const left = unwrapExpression(node.left);
        const right = unwrapExpression(node.right);
        let pattern = null;

        if (isNamedCall(left, "createServiceRoleClient") && isRouteClientExpression(right)) {
          pattern = "direct-nullish-fallback";
        } else if (
          ts.isIdentifier(left)
          && serviceRoleVariables.has(left.text)
          && isRouteClientExpression(right)
        ) {
          pattern = "variable-nullish-fallback";
        }

        if (pattern) {
          const entry = {
            ...createBaseEntry(relativeFile, sourceFile, node, classification),
            kind: "service-role-fallback",
            pattern,
          };
          const key = `${entry.file}:${entry.line}:${entry.column}:${entry.pattern}`;
          if (!fallbackEntryKeys.has(key)) {
            fallbackEntryKeys.add(key);
            fallbackEntries.push(entry);
          }
        }
      }

      if (clientModule && ts.isCallExpression(node) && isStorageFromCall(node)) {
        const allowlisted = BROWSER_DIRECT_STORAGE_ALLOWLIST.get(relativeFile);
        const entry = {
          ...createBaseEntry(relativeFile, sourceFile, node, classification),
          reason: allowlisted?.reason ?? "unclassified direct browser Storage usage",
          stage: allowlisted?.stage ?? null,
        };
        const key = `${entry.file}:${entry.line}:${entry.column}`;
        if (!storageEntryKeys.has(key)) {
          storageEntryKeys.add(key);
          browserDirectStoragePaths.push(entry);
        }
      }

      if (
        clientModule
        && ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && BROWSER_DATA_MUTATION_METHODS.has(node.expression.name.text)
      ) {
        const fromCall = unwrapExpression(node.expression.expression);
        const queryBuilder = ts.isIdentifier(fromCall)
          && browserQueryBuilderVariables.has(fromCall.text)
          ? fromCall
          : null;
        if (
          queryBuilder
          || (
            ts.isCallExpression(fromCall)
            && ts.isPropertyAccessExpression(fromCall.expression)
            && fromCall.expression.name.text === "from"
          )
        ) {
          const client = queryBuilder
            ? null
            : unwrapExpression(fromCall.expression.expression);
          const knownClient =
            queryBuilder !== null
            || (ts.isIdentifier(client) && browserClientVariables.has(client.text))
            || isFactoryCall(
              client,
              importBindings.browserClientFactories,
              importBindings.browserClientNamespaces,
              BROWSER_CLIENT_FACTORY_NAMES,
            );
          if (knownClient) {
            const entry = {
              ...createBaseEntry(relativeFile, sourceFile, node, classification),
              method: node.expression.name.text,
              table: queryBuilder
                ? browserQueryBuilderVariables.get(queryBuilder.text)
                : fromCall.arguments[0]
                  ? staticString(fromCall.arguments[0], stringConstants)
                  : null,
            };
            const key = `${entry.file}:${entry.line}:${entry.column}:${entry.method}`;
            if (!dataMutationEntryKeys.has(key)) {
              dataMutationEntryKeys.add(key);
              browserDirectDataMutationPaths.push(entry);
            }
          }
        }
      }

      if (clientModule && ts.isCallExpression(node) && isFetchCall(node)) {
        const url = node.arguments[0]
          ? staticString(node.arguments[0], stringConstants)
          : null;
        if (url?.includes("/rest/v1/")) {
          const configuredMethod = node.arguments[1]
            ? objectStringProperty(node.arguments[1], "method", stringConstants)
            : null;
          const method = configuredMethod?.toUpperCase() ?? "GET";
          const hasDynamicOptions =
            configuredMethod === null && node.arguments.length > 1;
          if (REST_MUTATION_METHODS.has(method) || hasDynamicOptions) {
            const entry = {
              ...createBaseEntry(relativeFile, sourceFile, node, classification),
              method: REST_MUTATION_METHODS.has(method) ? method : "DYNAMIC",
            };
            const key = `${entry.file}:${entry.line}:${entry.column}:${entry.method}`;
            if (!rawRestMutationEntryKeys.has(key)) {
              rawRestMutationEntryKeys.add(key);
              browserRawRestMutationPaths.push(entry);
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    if (relativeFile.startsWith("app/api/") && relativeFile.endsWith("/route.ts")
      && usesDataRouteClient) {
      dataRouteResponseBoundaries.push({
        file: relativeFile,
        importsCommonResponseBoundary:
          source.includes("@/lib/api/response"),
        bypassesCommonResponseBoundary: source.includes("NextResponse.json"),
      });
    }
  }

  const sortedServiceRoleEntries = serviceRoleEntries.sort(compareEntries);
  const sortedFallbackEntries = fallbackEntries.sort(compareEntries);
  const sortedRemoteCompatibilityEntries =
    remoteCompatibilityEntries.sort(compareEntries);
  const sortedBrowserDirectStoragePaths = browserDirectStoragePaths.sort(compareEntries);
  const sortedBrowserDirectDataMutationPaths =
    browserDirectDataMutationPaths.sort(compareEntries);
  const sortedBrowserRawRestMutationPaths =
    browserRawRestMutationPaths.sort(compareEntries);
  const sortedInternalOperationEntries = internalOperationEntries.sort(compareEntries);
  const publicRouteContracts = HYBRID_PUBLIC_ROUTE_CONTRACTS
    .map((contract) => ({ ...contract }))
    .sort((left, right) => left.file.localeCompare(right.file));
  const publicRouteContractViolations = publicRouteContracts
    .filter(
      (contract) =>
        declaredPublicRouteScopes.get(contract.file) !== contract.scope,
    )
    .map((contract) => ({
      actualScope: declaredPublicRouteScopes.get(contract.file) ?? null,
      expectedScope: contract.scope,
      file: contract.file,
    }));

  return {
    adminAllowlistFiles: [...ADMIN_ALLOWLIST_FILES].sort(),
    adminServiceRoleEntries: sortedServiceRoleEntries.filter((entry) => entry.classification === "admin"),
    browserDirectDataMutationPaths: sortedBrowserDirectDataMutationPaths,
    browserDirectStoragePaths: sortedBrowserDirectStoragePaths,
    browserRawRestMutationPaths: sortedBrowserRawRestMutationPaths,
    dataRouteResponseBoundaries:
      dataRouteResponseBoundaries.sort((left, right) =>
        left.file.localeCompare(right.file)),
    dataRouteResponseBoundaryViolations: dataRouteResponseBoundaries.filter(
      (entry) =>
        !entry.importsCommonResponseBoundary
        || entry.bypassesCommonResponseBoundary,
    ),
    internalAllowlistFiles: [...INTERNAL_ALLOWLIST_FILES].sort(),
    internalOperationAllowlist: Object.fromEntries(
      [...INTERNAL_OPERATION_ALLOWLIST].map(([factory, files]) => [
        factory,
        [...files].sort(),
      ]),
    ),
    internalOperationFunctionAllowlist: Object.fromEntries(
      [...INTERNAL_OPERATION_FUNCTION_ALLOWLIST].map(([factory, files]) => [
        factory,
        Object.fromEntries(
          [...files].map(([file, functions]) => [file, [...functions].sort()]),
        ),
      ]),
    ),
    internalOperationEntries: sortedInternalOperationEntries,
    internalOperationViolations: sortedInternalOperationEntries.filter(
      (entry) => !entry.allowed,
    ),
    internalServiceRoleEntries: sortedServiceRoleEntries.filter((entry) => entry.classification === "internal"),
    genericLocalServiceRoleViolations: sortedServiceRoleEntries,
    publicAllowlistFiles: [...PUBLIC_ALLOWLIST_FILES].sort(),
    publicRouteContracts,
    publicRouteContractViolations,
    publicServiceRoleEntries: sortedServiceRoleEntries.filter((entry) => entry.classification === "public"),
    remoteCompatibilityEntries: sortedRemoteCompatibilityEntries,
    serviceRoleFallbackEntries: sortedFallbackEntries,
    serviceRoleEntries: sortedServiceRoleEntries,
    userDirectServiceRoleEntries: sortedServiceRoleEntries.filter((entry) => entry.classification === "user"),
    userServiceRoleViolations: sortedFallbackEntries.filter((entry) => entry.classification === "user"),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const repoRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  process.stdout.write(`${JSON.stringify(inventoryHybridAuthorityPaths(repoRoot), null, 2)}\n`);
}

export {
  inventoryHybridAuthorityPaths,
};
