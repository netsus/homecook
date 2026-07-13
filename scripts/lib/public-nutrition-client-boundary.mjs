import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SOURCE_EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs"];
const IGNORED_DIRECTORIES = new Set([".git", ".next", "node_modules", "coverage", ".artifacts"]);

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
    return /\.(?:ts|tsx|js|jsx|mjs)$/.test(name) ? [target] : [];
  });
}

function importSpecifiers(text) {
  const values = [];
  const pattern = /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of text.matchAll(pattern)) values.push(match[1] ?? match[2]);
  return values;
}

function resolveLocalImport(root, fromFile, specifier) {
  let candidate;
  if (specifier.startsWith("@/")) candidate = path.join(root, specifier.slice(2));
  else if (specifier.startsWith(".")) candidate = path.resolve(path.dirname(fromFile), specifier);
  else return null;
  for (const extension of SOURCE_EXTENSIONS) {
    const file = `${candidate}${extension}`;
    if (existsSync(file) && !statSync(file).isDirectory()) return file;
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
  const entries = sourceFiles(root).filter((file) => {
    const text = readFileSync(file, "utf8");
    return /^\s*["']use client["'];/m.test(text);
  });

  for (const entry of entries) {
    const queue = [entry];
    const visited = new Set();
    while (queue.length > 0) {
      const file = queue.shift();
      if (visited.has(file)) continue;
      visited.add(file);
      const text = readFileSync(file, "utf8");
      if (isOperatorModule(file) || text.includes("DATA_GO_KR_API_KEY")) {
        throw new ClientBoundaryError("CLIENT_OPERATOR_IMPORT_FORBIDDEN", {
          entry: path.relative(root, entry),
          module: path.relative(root, file),
        });
      }
      for (const specifier of importSpecifiers(text)) {
        const resolved = resolveLocalImport(root, file, specifier);
        if (resolved !== null) queue.push(resolved);
      }
    }
  }
}
