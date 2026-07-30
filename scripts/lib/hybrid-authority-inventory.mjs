#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

import {
  HYBRID_PUBLIC_ROUTE_CONTRACTS,
} from "../../lib/server/hybrid-auth/public-read-policy-runtime.mjs";
import {
  findBrowserBundleStorageMutations,
} from "../verify-hybrid-browser-bundle.mjs";

const SKIP_DIRS = new Set([".git", ".next", "coverage", "dist", "node_modules"]);
const CLIENT_GRAPH_SKIP_DIRS = new Set([
  ...SKIP_DIRS,
  ".agents",
  ".omx",
  "docs",
  "scripts",
  "tests",
]);
const SOURCE_FILE_PATTERN = /\.(ts|tsx|js|mjs|jsx)$/u;
const DEFAULT_SCAN_ROOTS = ["app", "components", "lib"];
const FILE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".jsx",
  "/index.ts",
  "/index.tsx",
  "/index.js",
  "/index.mjs",
  "/index.jsx",
];

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

function listSourceFiles(repoRoot, scanRoots = DEFAULT_SCAN_ROOTS) {
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

  for (const root of scanRoots) {
    const absoluteRoot = path.join(repoRoot, root);
    if (fs.existsSync(absoluteRoot)) {
      walk(absoluteRoot);
    }
  }

  return files.sort();
}

function scriptKindFor(filePath) {
  return filePath.endsWith(".tsx") || filePath.endsWith(".jsx")
    ? ts.ScriptKind.TSX
    : ts.ScriptKind.TS;
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

function isClientModule(sourceFile) {
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) {
      continue;
    }

    if (statement.expression.text === "use client") {
      return true;
    }
  }

  return false;
}

function resolveImportSource(repoRoot, importerDir, rawSpecifier) {
  if (!rawSpecifier) {
    return null;
  }

  if (rawSpecifier.startsWith("@/")) {
    const aliased = path.join(repoRoot, rawSpecifier.slice(2));
    return tryResolveModulePath(aliased);
  }

  if (rawSpecifier.startsWith("./") || rawSpecifier.startsWith("../") || rawSpecifier === ".") {
    const absolute = path.resolve(importerDir, rawSpecifier);
    return tryResolveModulePath(absolute);
  }

  return null;
}

function tryResolveModulePath(basePath) {
  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
    return basePath;
  }

  for (const extension of FILE_EXTENSIONS) {
    const withExt = `${basePath}${extension}`;
    if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
      return withExt;
    }
  }

  const indexPath = path.join(basePath, "index");
  for (const extension of [".ts", ".tsx", ".js", ".mjs", ".jsx"]) {
    const indexed = `${indexPath}${extension}`;
    if (fs.existsSync(indexed) && fs.statSync(indexed).isFile()) {
      return indexed;
    }
  }

  return null;
}

function readSourceFile(repoRoot, absoluteFile) {
  const source = fs.readFileSync(absoluteFile, "utf8");
  const sourceFile = ts.createSourceFile(
    toRelativeFile(repoRoot, absoluteFile),
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(absoluteFile),
  );

  return { source, sourceFile };
}

function isRepoLocalRuntimeSource(repoRoot, absoluteFile) {
  const relativeFile = path.relative(repoRoot, absoluteFile);
  if (
    relativeFile.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativeFile)
    || !SOURCE_FILE_PATTERN.test(absoluteFile)
  ) {
    return false;
  }

  return !relativeFile
    .split(path.sep)
    .some((segment) => CLIENT_GRAPH_SKIP_DIRS.has(segment));
}

function collectClientImportGraph(repoRoot, files) {
  const fileByRelative = new Map(
    files.map((absoluteFile) => [
      toRelativeFile(repoRoot, absoluteFile),
      absoluteFile,
    ]),
  );
  const importEdges = new Map();
  const clientRoots = new Set();
  const inspectedFiles = new Set();

  const inspectFile = (absoluteFile, { detectClientRoot = false } = {}) => {
    const relativeFile = toRelativeFile(repoRoot, absoluteFile);
    if (inspectedFiles.has(relativeFile)) {
      return;
    }
    inspectedFiles.add(relativeFile);
    const importerDir = path.dirname(absoluteFile);
    const { sourceFile } = readSourceFile(repoRoot, absoluteFile);
    const imports = new Set();

    if (detectClientRoot && isClientModule(sourceFile)) {
      clientRoots.add(relativeFile);
    }

    const addRuntimeEdge = (rawSpecifier) => {
      const resolved = resolveImportSource(
        repoRoot,
        importerDir,
        rawSpecifier,
      );
      if (resolved && isRepoLocalRuntimeSource(repoRoot, resolved)) {
        const target = toRelativeFile(repoRoot, resolved);
        fileByRelative.set(target, resolved);
        imports.add(target);
      }
    };

    const importHasRuntimeEdge = (node) => {
      const clause = node.importClause;
      if (!clause) {
        return true;
      }
      if (clause.isTypeOnly || clause.name) {
        return !clause.isTypeOnly;
      }
      if (ts.isNamespaceImport(clause.namedBindings)) {
        return true;
      }
      if (ts.isNamedImports(clause.namedBindings)) {
        return clause.namedBindings.elements.length === 0
          || clause.namedBindings.elements.some((element) => !element.isTypeOnly);
      }
      return false;
    };

    const exportHasRuntimeEdge = (node) => {
      if (node.isTypeOnly) {
        return false;
      }
      if (!node.exportClause || ts.isNamespaceExport(node.exportClause)) {
        return true;
      }
      if (ts.isNamedExports(node.exportClause)) {
        return node.exportClause.elements.length === 0
          || node.exportClause.elements.some((element) => !element.isTypeOnly);
      }
      return false;
    };

    const visitImportEdges = (node) => {
      if (
        ts.isImportDeclaration(node)
        && node.moduleSpecifier
        && ts.isStringLiteral(node.moduleSpecifier)
        && importHasRuntimeEdge(node)
      ) {
        addRuntimeEdge(node.moduleSpecifier.text);
      } else if (
        ts.isExportDeclaration(node)
        && node.moduleSpecifier
        && ts.isStringLiteral(node.moduleSpecifier)
        && exportHasRuntimeEdge(node)
      ) {
        addRuntimeEdge(node.moduleSpecifier.text);
      } else if (
        ts.isCallExpression(node)
        && ts.isImportCall(node)
        && node.arguments.length === 1
      ) {
        const specifier = unwrapExpression(node.arguments[0]);
        if (ts.isStringLiteralLike(specifier)) {
          addRuntimeEdge(specifier.text);
        }
      }

      ts.forEachChild(node, visitImportEdges);
    };

    visitImportEdges(sourceFile);

    importEdges.set(relativeFile, imports);
  };

  for (const absoluteFile of files) {
    inspectFile(absoluteFile, { detectClientRoot: true });
  }

  const reachable = new Set(clientRoots);
  const stack = [...clientRoots];

  while (stack.length > 0) {
    const current = stack.pop();
    const absoluteFile = fileByRelative.get(current);
    if (absoluteFile) {
      inspectFile(absoluteFile);
    }
    const neighbors = importEdges.get(current);
    if (!neighbors) {
      continue;
    }

    for (const next of neighbors) {
      if (reachable.has(next)) {
        continue;
      }
      reachable.add(next);
      stack.push(next);
    }
  }

  return {
    files: [...reachable]
      .map((relativeFile) => fileByRelative.get(relativeFile))
      .filter(Boolean),
    reachable,
  };
}

function hasExportModifier(node) {
  return ts.canHaveModifiers(node)
    && ts.getModifiers(node)?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
}

function buildClientBindingSeeds(repoRoot, files) {
  const records = new Map();

  for (const absoluteFile of files) {
    const relativeFile = toRelativeFile(repoRoot, absoluteFile);
    const importerDir = path.dirname(absoluteFile);
    const { sourceFile } = readSourceFile(repoRoot, absoluteFile);
    const record = {
      exports: new Map(),
      imports: new Map(),
      locals: new Map(),
      stars: new Set(),
    };
    const resolveTarget = (specifier) => {
      const resolved = resolveImportSource(repoRoot, importerDir, specifier);
      return resolved && isRepoLocalRuntimeSource(repoRoot, resolved)
        ? toRelativeFile(repoRoot, resolved)
        : null;
    };

    for (const statement of sourceFile.statements) {
      if (
        ts.isImportDeclaration(statement)
        && statement.importClause
        && ts.isStringLiteral(statement.moduleSpecifier)
        && !statement.importClause.isTypeOnly
      ) {
        const target = resolveTarget(statement.moduleSpecifier.text);
        if (!target) {
          continue;
        }
        if (statement.importClause.name) {
          record.imports.set(
            statement.importClause.name.text,
            { exportName: "default", target },
          );
        }
        const namedBindings = statement.importClause.namedBindings;
        if (namedBindings && ts.isNamedImports(namedBindings)) {
          for (const element of namedBindings.elements) {
            if (!element.isTypeOnly) {
              record.imports.set(element.name.text, {
                exportName: element.propertyName?.text ?? element.name.text,
                target,
              });
            }
          }
        }
        continue;
      }

      if (ts.isFunctionDeclaration(statement) && statement.name) {
        record.locals.set(statement.name.text, { kind: "function" });
        if (hasExportModifier(statement)) {
          record.exports.set(statement.name.text, {
            localName: statement.name.text,
          });
        }
        continue;
      }

      if (ts.isClassDeclaration(statement) && statement.name) {
        record.locals.set(statement.name.text, { kind: "function" });
        if (hasExportModifier(statement)) {
          record.exports.set(statement.name.text, {
            localName: statement.name.text,
          });
        }
        continue;
      }

      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name)) {
            continue;
          }
          const initializer = declaration.initializer
            ? unwrapExpression(declaration.initializer)
            : null;
          if (
            initializer
            && ts.isIdentifier(initializer)
            && initializer.text === "fetch"
          ) {
            record.locals.set(declaration.name.text, { kind: "fetch" });
          } else if (
            initializer
            && (
              ts.isFunctionExpression(initializer)
              || ts.isArrowFunction(initializer)
            )
          ) {
            record.locals.set(declaration.name.text, { kind: "function" });
          } else if (initializer && ts.isIdentifier(initializer)) {
            record.locals.set(declaration.name.text, {
              localName: initializer.text,
            });
          } else {
            record.locals.set(declaration.name.text, { kind: "unknown" });
          }
          if (hasExportModifier(statement)) {
            record.exports.set(declaration.name.text, {
              localName: declaration.name.text,
            });
          }
        }
        continue;
      }

      if (
        ts.isExportDeclaration(statement)
        && !statement.isTypeOnly
      ) {
        const target = (
          statement.moduleSpecifier
          && ts.isStringLiteral(statement.moduleSpecifier)
        )
          ? resolveTarget(statement.moduleSpecifier.text)
          : null;
        if (!statement.exportClause) {
          if (target) {
            record.stars.add(target);
          }
          continue;
        }
        if (!ts.isNamedExports(statement.exportClause)) {
          continue;
        }
        for (const element of statement.exportClause.elements) {
          if (element.isTypeOnly) {
            continue;
          }
          const exportName = element.name.text;
          const importedName = element.propertyName?.text ?? exportName;
          record.exports.set(
            exportName,
            target
              ? { exportName: importedName, target }
              : { localName: importedName },
          );
        }
      }
    }

    records.set(relativeFile, record);
  }

  const summaries = new Map(
    [...records.keys()].map((file) => [file, new Map()]),
  );
  const resolveLocalKind = (record, localName, seen = new Set()) => {
    if (seen.has(localName)) {
      return "unknown";
    }
    seen.add(localName);
    const imported = record.imports.get(localName);
    if (imported) {
      return summaries.get(imported.target)?.get(imported.exportName)
        ?? "unknown";
    }
    const local = record.locals.get(localName);
    if (!local) {
      return "unknown";
    }
    if (local.kind) {
      return local.kind;
    }
    return resolveLocalKind(record, local.localName, seen);
  };

  for (let pass = 0; pass < records.size + 1; pass += 1) {
    let changed = false;
    for (const [file, record] of records) {
      const next = new Map();
      for (const [exportName, descriptor] of record.exports) {
        const kind = descriptor.target
          ? summaries.get(descriptor.target)?.get(descriptor.exportName)
            ?? "unknown"
          : resolveLocalKind(record, descriptor.localName);
        next.set(exportName, kind);
      }
      for (const target of record.stars) {
        for (const [exportName, kind] of summaries.get(target) ?? []) {
          if (exportName !== "default" && !next.has(exportName)) {
            next.set(exportName, kind);
          }
        }
      }
      const previous = summaries.get(file);
      if (
        previous.size !== next.size
        || [...next].some(([name, kind]) => previous.get(name) !== kind)
      ) {
        summaries.set(file, next);
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }

  return new Map(
    [...records].map(([file, record]) => [
      file,
      Object.fromEntries(
        [...record.imports].map(([localName, imported]) => [
          localName,
          summaries.get(imported.target)?.get(imported.exportName)
            ?? "unknown",
        ]),
      ),
    ]),
  );
}

function extractStorageMutationCalls(fileState) {
  const {
    relativeFile,
    source,
    sourceFile,
    classification,
    isClientReachable,
    initialBindings,
  } = fileState;

  const entries = [];
  if (isClientReachable) {
    for (const match of findBrowserBundleStorageMutations(source, {
      failClosedUnknownStorageCallee: true,
      fileName: relativeFile,
      initialBindings,
      scriptKind: scriptKindFor(relativeFile),
    })) {
      const location = sourceFile.getLineAndCharacterOfPosition(match.index);
      entries.push({
        classification,
        column: location.character + 1,
        file: relativeFile,
        line: location.line + 1,
        method: match.kind === "supabase-storage-rest" ? "fetch" : "sdk",
        reason: match.kind === "supabase-storage-rest"
          ? "client direct Storage REST fetch"
          : "client direct Storage SDK mutation",
      });
    }
  }

  return {
    entries,
    hasStorageFrom: entries.length > 0,
    uploadCandidate: entries.length > 0 ? source : null,
  };
}

function inventoryHybridAuthorityPaths(repoRoot = process.cwd(), { scanRoots = DEFAULT_SCAN_ROOTS } = {}) {
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

  const entryFiles = listSourceFiles(repoRoot, scanRoots);
  const {
    files: clientReachableAbsoluteFiles,
    reachable: clientReachableFiles,
  } = collectClientImportGraph(repoRoot, entryFiles);
  const files = [
    ...new Set([
      ...entryFiles,
      ...clientReachableAbsoluteFiles,
    ]),
  ].sort();
  const clientBindingSeeds = buildClientBindingSeeds(
    repoRoot,
    clientReachableAbsoluteFiles,
  );

  for (const absoluteFile of files) {
    const relativeFile = toRelativeFile(repoRoot, absoluteFile);
    const { source, sourceFile } = readSourceFile(repoRoot, absoluteFile);
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

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    const shouldInspect = clientModule || clientReachableFiles.has(relativeFile);
    if (shouldInspect) {
      const storageState = {
        relativeFile,
        source,
        sourceFile,
        classification,
        initialBindings: clientBindingSeeds.get(relativeFile) ?? {},
        isClientReachable: clientReachableFiles.has(relativeFile),
      };
      const { entries } = extractStorageMutationCalls(storageState);

      for (const entry of entries) {
        const key = `${entry.file}:${entry.line}:${entry.column}`;
        if (!storageEntryKeys.has(key)) {
          storageEntryKeys.add(key);
          browserDirectStoragePaths.push(entry);
        }
      }
    }

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
    clientReachableFiles: [...clientReachableFiles],
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const repoRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  process.stdout.write(`${JSON.stringify(inventoryHybridAuthorityPaths(repoRoot), null, 2)}\n`);
}

export {
  inventoryHybridAuthorityPaths,
};
