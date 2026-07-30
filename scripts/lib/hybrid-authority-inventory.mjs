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
const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];
const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]s|[jt]sx)$/u;
const DEFAULT_SCAN_ROOTS = ["app", "components", "lib"];
const EXPLICIT_RUNTIME_EXTENSION_SUBSTITUTIONS = new Map([
  [".js", [".ts", ".tsx", ".js", ".jsx"]],
  [".jsx", [".tsx", ".jsx"]],
  [".mjs", [".mts", ".mjs"]],
  [".cjs", [".cts", ".cjs"]],
  [".ts", [".ts"]],
  [".tsx", [".tsx"]],
  [".mts", [".mts"]],
  [".cts", [".cts"]],
]);
const BROWSER_SUPABASE_RUNTIME_PACKAGES = new Set([
  "@supabase/ssr",
  "@supabase/storage-js",
  "@supabase/supabase-js",
]);
const BROWSER_SUPABASE_AUTH_ADAPTER = "lib/supabase/browser.ts";

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
    "createGamificationProjectionInternalClient",
    new Set(["app/api/v1/users/me/gamification/_helpers.ts"]),
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
      "app/api/v1/recipe-books/route.ts",
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
  if (filePath.endsWith(".tsx")) {
    return ts.ScriptKind.TSX;
  }
  if (filePath.endsWith(".jsx")) {
    return ts.ScriptKind.JSX;
  }
  if (
    filePath.endsWith(".js")
    || filePath.endsWith(".mjs")
    || filePath.endsWith(".cjs")
  ) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
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

function collectCommonJsRequireCalls(sourceFile) {
  const compilerOptions = {
    allowJs: true,
    noLib: true,
    noResolve: true,
  };
  const fileName = sourceFile.fileName;
  const compilerHost = ts.createCompilerHost(compilerOptions, true);
  compilerHost.fileExists = (candidate) => candidate === fileName;
  compilerHost.getSourceFile = (candidate) => (
    candidate === fileName ? sourceFile : undefined
  );
  compilerHost.readFile = (candidate) => (
    candidate === fileName ? sourceFile.text : undefined
  );
  compilerHost.writeFile = () => {};
  const checker = ts.createProgram({
    host: compilerHost,
    options: compilerOptions,
    rootNames: [fileName],
  }).getTypeChecker();
  const freeRequire = Symbol("free-commonjs-require");
  const isRuntimeDeclaration = (declaration) => {
    if (
      declaration.getSourceFile().isDeclarationFile
      || ts.isFunctionDeclaration(declaration) && !declaration.body
    ) {
      return false;
    }
    for (let current = declaration; current; current = current.parent) {
      if (
        current.flags & ts.NodeFlags.Ambient
        || (
          ts.canHaveModifiers(current)
          && ts.getCombinedModifierFlags(current) & ts.ModifierFlags.Ambient
        )
        || ts.isTypeOnlyImportOrExportDeclaration(current)
        || (
          ts.isModuleDeclaration(current)
          && ts.isGlobalScopeAugmentation(current)
        )
      ) {
        return false;
      }
    }
    return true;
  };
  const hasRuntimeDeclaration = (symbol) => symbol?.declarations?.some(
    isRuntimeDeclaration,
  );
  const resolveIdentifier = (identifier) => {
    const symbol = checker.getSymbolAtLocation(identifier);
    if (
      identifier.text === "require"
      && !hasRuntimeDeclaration(symbol)
    ) {
      return freeRequire;
    }
    return symbol ?? null;
  };

  const aliasEdges = [];
  const collectAliasEdges = (node) => {
    let target = null;
    let source = null;
    if (
      ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.initializer
    ) {
      target = checker.getSymbolAtLocation(node.name) ?? null;
      const value = unwrapExpression(node.initializer);
      source = ts.isIdentifier(value) ? resolveIdentifier(value) : null;
    } else if (
      ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isIdentifier(unwrapExpression(node.left))
    ) {
      target = resolveIdentifier(unwrapExpression(node.left));
      const value = unwrapExpression(node.right);
      source = ts.isIdentifier(value) ? resolveIdentifier(value) : null;
    }
    if (target && source && target !== freeRequire) {
      aliasEdges.push({ source, target });
    }
    ts.forEachChild(node, collectAliasEdges);
  };
  collectAliasEdges(sourceFile);

  const aliases = new Set([freeRequire]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const { source, target } of aliasEdges) {
      if (
        aliases.has(source)
        && !aliases.has(target)
      ) {
        aliases.add(target);
        changed = true;
      }
    }
  }

  const calls = new WeakSet();
  const collectCalls = (node) => {
    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(unwrapExpression(node.expression))
      && aliases.has(resolveIdentifier(unwrapExpression(node.expression)))
      && node.arguments.length === 1
    ) {
      calls.add(node);
    }
    ts.forEachChild(node, collectCalls);
  };
  collectCalls(sourceFile);
  return calls;
}

function isCommonJsRequireCall(node, requireCalls) {
  return ts.isCallExpression(node) && requireCalls.has(node);
}

function staticModuleSpecifier(node) {
  const specifier = unwrapExpression(node);
  return ts.isStringLiteralLike(specifier) ? specifier.text : null;
}

function resolveImportSources(repoRoot, importerDir, rawSpecifier) {
  if (!rawSpecifier) {
    return [];
  }

  if (rawSpecifier.startsWith("@/")) {
    const aliased = path.join(repoRoot, rawSpecifier.slice(2));
    return tryResolveModulePaths(aliased);
  }

  if (rawSpecifier.startsWith("./") || rawSpecifier.startsWith("../") || rawSpecifier === ".") {
    const absolute = path.resolve(importerDir, rawSpecifier);
    return tryResolveModulePaths(absolute);
  }

  return [];
}

function tryResolveModulePaths(basePath) {
  const candidates = [];
  const explicitExtension = path.extname(basePath);
  const substitutions = EXPLICIT_RUNTIME_EXTENSION_SUBSTITUTIONS.get(
    explicitExtension,
  );
  const stem = substitutions
    ? basePath.slice(0, -explicitExtension.length)
    : basePath;
  const extensionCandidates = substitutions ?? SOURCE_EXTENSIONS;

  for (const extension of extensionCandidates) {
    const withExt = `${stem}${extension}`;
    if (fs.existsSync(withExt) && fs.statSync(withExt).isFile()) {
      candidates.push(withExt);
    }
  }

  if (!explicitExtension) {
    if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
      candidates.push(basePath);
    }

    const indexPath = path.join(basePath, "index");
    for (const extension of SOURCE_EXTENSIONS) {
      const indexed = `${indexPath}${extension}`;
      if (fs.existsSync(indexed) && fs.statSync(indexed).isFile()) {
        candidates.push(indexed);
      }
    }
  }

  // TypeScript and Next can substitute a source extension for an explicit
  // runtime extension. Inspect every viable repo-local candidate so an
  // ambiguous basename cannot hide a forbidden runtime capability.
  return [...new Set(candidates)];
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
    const requireCalls = collectCommonJsRequireCalls(sourceFile);
    const imports = new Set();

    if (detectClientRoot && isClientModule(sourceFile)) {
      clientRoots.add(relativeFile);
    }

    const addRuntimeEdge = (rawSpecifier) => {
      const resolvedSources = resolveImportSources(
        repoRoot,
        importerDir,
        rawSpecifier,
      );
      for (const resolved of resolvedSources) {
        if (!isRepoLocalRuntimeSource(repoRoot, resolved)) {
          continue;
        }
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
        ts.isImportEqualsDeclaration(node)
        && !node.isTypeOnly
        && ts.isExternalModuleReference(node.moduleReference)
        && node.moduleReference.expression
      ) {
        const specifier = staticModuleSpecifier(
          node.moduleReference.expression,
        );
        if (specifier !== null) {
          addRuntimeEdge(specifier);
        }
      } else if (
        ts.isCallExpression(node)
        && ts.isImportCall(node)
        && node.arguments.length >= 1
      ) {
        const specifier = unwrapExpression(node.arguments[0]);
        if (ts.isStringLiteralLike(specifier)) {
          addRuntimeEdge(specifier.text);
        }
      } else if (isCommonJsRequireCall(node, requireCalls)) {
        const specifier = staticModuleSpecifier(node.arguments[0]);
        if (specifier !== null) {
          addRuntimeEdge(specifier);
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

function browserSupabaseRuntimeImportViolations(
  repoRoot,
  clientReachableAbsoluteFiles,
) {
  const violations = [];
  const isForbiddenPackage = (specifier) => (
    [...BROWSER_SUPABASE_RUNTIME_PACKAGES].some((packageName) => (
      specifier === packageName || specifier.startsWith(`${packageName}/`)
    ))
  );

  for (const absoluteFile of clientReachableAbsoluteFiles) {
    const relativeFile = toRelativeFile(repoRoot, absoluteFile);
    if (relativeFile === BROWSER_SUPABASE_AUTH_ADAPTER) {
      continue;
    }
    const { sourceFile } = readSourceFile(repoRoot, absoluteFile);
    const requireCalls = collectCommonJsRequireCalls(sourceFile);
    const record = (node, packageName, kind) => {
      violations.push({
        file: relativeFile,
        kind,
        package: packageName,
        ...getLineColumn(sourceFile, node),
      });
    };
    const visit = (node) => {
      if (
        ts.isImportDeclaration(node)
        && ts.isStringLiteral(node.moduleSpecifier)
        && !node.importClause?.isTypeOnly
        && (
          !node.importClause
          || !node.importClause.namedBindings
          || !ts.isNamedImports(node.importClause.namedBindings)
          || node.importClause.namedBindings.elements.length === 0
          || node.importClause.namedBindings.elements.some(
            (element) => !element.isTypeOnly,
          )
        )
        && isForbiddenPackage(node.moduleSpecifier.text)
      ) {
        record(node, node.moduleSpecifier.text, "runtime-import");
      } else if (
        ts.isExportDeclaration(node)
        && node.moduleSpecifier
        && ts.isStringLiteral(node.moduleSpecifier)
        && !node.isTypeOnly
        && (
          !node.exportClause
          || !ts.isNamedExports(node.exportClause)
          || node.exportClause.elements.length === 0
          || node.exportClause.elements.some((element) => !element.isTypeOnly)
        )
        && isForbiddenPackage(node.moduleSpecifier.text)
      ) {
        record(node, node.moduleSpecifier.text, "runtime-re-export");
      } else if (
        ts.isImportEqualsDeclaration(node)
        && !node.isTypeOnly
        && ts.isExternalModuleReference(node.moduleReference)
        && node.moduleReference.expression
      ) {
        const specifier = staticModuleSpecifier(
          node.moduleReference.expression,
        );
        if (
          specifier !== null
          && isForbiddenPackage(specifier)
        ) {
          record(node, specifier, "runtime-import-equals");
        }
      } else if (
        ts.isCallExpression(node)
        && ts.isImportCall(node)
        && node.arguments.length >= 1
      ) {
        const specifier = staticModuleSpecifier(node.arguments[0]);
        if (specifier === null) {
          record(node, "<dynamic>", "unknown-runtime-dynamic-import");
        } else if (isForbiddenPackage(specifier)) {
          record(node, specifier, "runtime-dynamic-import");
        }
      } else if (isCommonJsRequireCall(node, requireCalls)) {
        const specifier = staticModuleSpecifier(node.arguments[0]);
        if (specifier === null) {
          record(node, "<dynamic>", "unknown-runtime-require");
        } else if (isForbiddenPackage(specifier)) {
          record(node, specifier, "runtime-require");
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return violations.sort(compareEntries);
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
  const browserSupabaseRuntimeImportEntries =
    browserSupabaseRuntimeImportViolations(
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
      for (const match of findBrowserBundleStorageMutations(source, {
        fileName: relativeFile,
        scriptKind: scriptKindFor(relativeFile),
      })) {
        const location = sourceFile.getLineAndCharacterOfPosition(match.index);
        const entry = {
          classification,
          column: location.character + 1,
          file: relativeFile,
          line: location.line + 1,
          method: match.kind === "supabase-storage-rest" ? "fetch" : "sdk",
          reason: match.kind === "supabase-storage-rest"
            ? "direct executable Storage REST canary"
            : "direct executable Storage SDK canary",
        };
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
    browserSupabaseRuntimeImportViolations:
      browserSupabaseRuntimeImportEntries,
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
