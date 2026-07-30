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
  "lib/supabase/server.ts",
]);

const INTERNAL_OPERATION_ALLOWLIST = new Map([
  [
    "createAuthCallbackOperationsClient",
    new Set(["app/auth/callback/route.ts"]),
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
  const internalOperationEntries = [];
  const serviceRoleEntryKeys = new Set();
  const fallbackEntryKeys = new Set();
  const storageEntryKeys = new Set();
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
    const serviceRoleVariables = new Set();
    let usesDataRouteClient = false;

    const visit = (node) => {
      if (
        ts.isCallExpression(node)
        && (
          isNamedCall(node, "createRouteHandlerClient")
          || isNamedCall(node, "createDataRouteHandlerClient")
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
        && isNamedCall(node.initializer, "createServiceRoleClient")
      ) {
        serviceRoleVariables.add(node.name.text);
      }

      if (ts.isCallExpression(node) && isNamedCall(node, "createServiceRoleClient")) {
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
          const entry = {
            ...createBaseEntry(relativeFile, sourceFile, node, classification),
            allowed: allowedFiles.has(relativeFile),
            factory,
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
    browserDirectStoragePaths: sortedBrowserDirectStoragePaths,
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
