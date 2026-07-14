import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const SOURCE_EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];
const IGNORED_DIRECTORIES = new Set([".git", ".next", "node_modules", "coverage", ".artifacts"]);
const SOURCE_FILE_PATTERN = /\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;

class ClientBoundaryError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = "ClientBoundaryError";
    this.code = code;
    this.details = details;
  }
}

function sourceFiles(root) {
  return readdirSync(root).flatMap((name) => {
    if (IGNORED_DIRECTORIES.has(name)) return [];
    const target = path.join(root, name);
    if (statSync(target).isDirectory()) return sourceFiles(target);
    return SOURCE_FILE_PATTERN.test(name) ? [target] : [];
  });
}

function scriptKind(file) {
  const extension = path.extname(file);
  if (extension === ".tsx") return ts.ScriptKind.TSX;
  if (extension === ".jsx") return ts.ScriptKind.JSX;
  if ([".js", ".mjs", ".cjs"].includes(extension)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function parseSource(file, text) {
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file),
  );
}

function isClientEntry(sourceFile) {
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) {
      return false;
    }
    if (statement.expression.text === "use client") return true;
  }
  return false;
}

function assertParseable(sourceFile, root) {
  if (sourceFile.parseDiagnostics.length > 0) {
    throw new ClientBoundaryError("CLIENT_GRAPH_PARSE_FAILED", {
      module: path.relative(root, sourceFile.fileName),
    });
  }
}

function importSpecifiers(sourceFile) {
  const values = new Set();
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      values.add(node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      values.add(node.moduleReference.expression.text);
    } else if (ts.isCallExpression(node) && node.arguments.length === 1) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      const [argument] = node.arguments;
      if ((isDynamicImport || isRequire) && ts.isStringLiteralLike(argument)) {
        values.add(argument.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...values];
}

function resolveLocalImport(root, fromFile, specifier) {
  let candidate;
  if (specifier.startsWith("@/")) candidate = path.join(root, specifier.slice(2));
  else if (specifier.startsWith(".")) candidate = path.resolve(path.dirname(fromFile), specifier);
  else return null;
  for (const extension of SOURCE_EXTENSIONS) {
    const file = `${candidate}${extension}`;
    if (SOURCE_FILE_PATTERN.test(file) && existsSync(file) && !statSync(file).isDirectory()) return file;
  }
  for (const extension of SOURCE_EXTENSIONS.slice(1)) {
    const file = path.join(candidate, `index${extension}`);
    if (existsSync(file) && !statSync(file).isDirectory()) return file;
  }
  return null;
}

function isOperatorModule(file) {
  const normalized = file.split(path.sep).join("/");
  return /\/scripts\/(?:lib\/public-nutrition-|public-nutrition-source-cli)/.test(normalized);
}

export function assertNoClientNutritionImports(root) {
  const parsed = new Map();
  const texts = new Map();
  const textFor = (file) => {
    if (!texts.has(file)) texts.set(file, readFileSync(file, "utf8"));
    return texts.get(file);
  };
  const sourceFor = (file) => {
    if (!parsed.has(file)) parsed.set(file, parseSource(file, textFor(file)));
    return parsed.get(file);
  };
  const entries = sourceFiles(root).filter((file) => {
    if (!textFor(file).includes("use client")) return false;
    const sourceFile = sourceFor(file);
    const clientEntry = isClientEntry(sourceFile);
    if (clientEntry) assertParseable(sourceFile, root);
    return clientEntry;
  });

  for (const entry of entries) {
    const queue = [entry];
    const visited = new Set();
    while (queue.length > 0) {
      const file = queue.shift();
      if (visited.has(file)) continue;
      visited.add(file);
      const sourceFile = sourceFor(file);
      assertParseable(sourceFile, root);
      const text = sourceFile.text;
      if (isOperatorModule(file) || text.includes("DATA_GO_KR_API_KEY")) {
        throw new ClientBoundaryError("CLIENT_OPERATOR_IMPORT_FORBIDDEN", {
          entry: path.relative(root, entry),
          module: path.relative(root, file),
        });
      }
      for (const specifier of importSpecifiers(sourceFile)) {
        const resolved = resolveLocalImport(root, file, specifier);
        if (resolved !== null) queue.push(resolved);
      }
    }
  }
}
