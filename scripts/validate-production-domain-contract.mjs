import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";

export const PRODUCTION_DOMAIN_TUPLE = Object.freeze({
  appOrigin: "https://app.mumeok.kr",
  authOrigin: "https://auth.mumeok.kr",
  callback: "https://app.mumeok.kr/auth/callback",
  linkCallback: "https://app.mumeok.kr/auth/link/callback",
});

const ACTIVE_SCAN_DIRECTORIES = Object.freeze([
  "app",
  "components",
  "lib",
  "infra",
  "scripts",
  "tests",
  "docs/engineering",
]);

const ACTIVE_SCAN_FILES = Object.freeze([
  "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
  "docs/workpacks/full-local-supabase-production/README.md",
  "docs/workpacks/full-local-supabase-production/acceptance.md",
  "infra/full-local-supabase/.env.production.example",
  "infra/full-local-supabase/docker-compose.production.yml",
]);

const IGNORED_DIRECTORIES = Object.freeze([
  ".git",
  ".next",
  "coverage",
  "dist",
  "node_modules",
]);

const BANNED_PATTERN = /\bmumeok\.com\b/giu;
const SOURCE_OF_TRUTH_NOTE_FRAGMENTS = Object.freeze([
  PRODUCTION_DOMAIN_TUPLE.appOrigin,
  PRODUCTION_DOMAIN_TUPLE.authOrigin,
  "/auth/callback",
  "/auth/link/callback",
]);

function createError(code, filePath, message) {
  return { code, path: filePath, message };
}

function normalizeRelativePath(filePath) {
  return filePath.replace(/\\/gu, "/").trim();
}

function canonicalRootDir(rootDir) {
  return existsSync(rootDir) ? realpathSync(rootDir) : path.resolve(rootDir);
}

function isInsideRoot(rootDir, candidatePath) {
  const canonicalRoot = canonicalRootDir(rootDir);
  const canonicalCandidate = existsSync(candidatePath)
    ? realpathSync(candidatePath)
    : path.resolve(candidatePath);
  const relativePath = path.relative(canonicalRoot, canonicalCandidate);
  return relativePath === ""
    || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function isLikelyTextBuffer(buffer) {
  return !buffer.includes(0);
}

function readTextFile(filePath) {
  const buffer = readFileSync(filePath);
  if (!isLikelyTextBuffer(buffer)) {
    return null;
  }
  return buffer.toString("utf8");
}

function validateReadableRepoFile({
  allowBinary = false,
  codePrefix,
  filePath,
  requireDocsPrefix = false,
  rootDir,
}) {
  const canonicalRoot = canonicalRootDir(rootDir);
  const normalizedPath = normalizeRelativePath(filePath);
  if (
    normalizedPath.length === 0
    || path.isAbsolute(normalizedPath)
    || normalizedPath.startsWith("../")
    || normalizedPath.includes("/../")
    || normalizedPath !== path.posix.normalize(normalizedPath)
  ) {
    return {
      error: createError(
        `INVALID_${codePrefix}_PATH`,
        normalizedPath || filePath,
        `${normalizedPath || filePath} must be a normalized repo-relative path.`,
      ),
      relativePath: null,
    };
  }

  if (requireDocsPrefix && !normalizedPath.startsWith("docs/")) {
    return {
      error: createError(
        `INVALID_${codePrefix}_PATH`,
        normalizedPath,
        `${normalizedPath} must stay under docs/.`,
      ),
      relativePath: null,
    };
  }

  const resolvedPath = path.resolve(canonicalRoot, normalizedPath);
  if (!isInsideRoot(rootDir, resolvedPath)) {
    return {
      error: createError(
        `INVALID_${codePrefix}_PATH`,
        normalizedPath,
        `${normalizedPath} resolves outside the repository root.`,
      ),
      relativePath: null,
    };
  }

  if (!existsSync(resolvedPath)) {
    return {
      error: createError(
        `MISSING_${codePrefix}_FILE`,
        normalizedPath,
        `${normalizedPath} is required but missing.`,
      ),
      relativePath: null,
    };
  }

  const realPath = realpathSync(resolvedPath);
  if (!isInsideRoot(rootDir, realPath)) {
    return {
      error: createError(
        `INVALID_${codePrefix}_PATH`,
        normalizedPath,
        `${normalizedPath} points outside the repository root.`,
      ),
      relativePath: null,
    };
  }

  const stats = statSync(realPath);
  if (!stats.isFile()) {
    return {
      error: createError(
        `INVALID_${codePrefix}_FILE`,
        normalizedPath,
        `${normalizedPath} must be a regular UTF-8 text file.`,
      ),
      relativePath: null,
    };
  }

  const contents = readTextFile(realPath);
  if (contents === null) {
    if (allowBinary) {
      return {
        contents: null,
        error: null,
        relativePath: normalizedPath,
      };
    }
    return {
      error: createError(
        `INVALID_${codePrefix}_FILE`,
        normalizedPath,
        `${normalizedPath} must be a regular UTF-8 text file.`,
      ),
      relativePath: null,
    };
  }

  return {
    contents,
    error: null,
    relativePath: normalizedPath,
  };
}

function walkFiles(targetPath) {
  if (!existsSync(targetPath)) {
    return [];
  }

  const stats = lstatSync(targetPath);
  if (stats.isSymbolicLink()) {
    return [targetPath];
  }
  if (stats.isFile()) {
    return readTextFile(targetPath) === null ? [] : [targetPath];
  }
  if (!stats.isDirectory()) {
    return [];
  }

  return readdirSync(targetPath, { withFileTypes: true }).flatMap((entry) => {
    const childPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.includes(entry.name)) {
        return [];
      }
      return walkFiles(childPath);
    }
    if (entry.isSymbolicLink()) {
      return [childPath];
    }
    return readTextFile(childPath) === null ? [] : [childPath];
  });
}

export function readCurrentSourceOfTruth({ rootDir = process.cwd() } = {}) {
  const sourceRelativePath = "docs/sync/CURRENT_SOURCE_OF_TRUTH.md";
  const validatedSource = validateReadableRepoFile({
    codePrefix: "SOURCE_OF_TRUTH",
    filePath: sourceRelativePath,
    requireDocsPrefix: true,
    rootDir,
  });
  if (validatedSource.error || validatedSource.contents === null) {
    return {
      contents: "",
      errors: validatedSource.error ? [validatedSource.error] : [],
      officialPaths: [],
    };
  }

  const contents = validatedSource.contents;
  const lines = contents.split(/\r?\n/u);
  const startIndex = lines.findIndex((line) => line.trim() === "## Official Files");
  const officialLines = [];
  if (startIndex !== -1) {
    for (const line of lines.slice(startIndex + 1)) {
      if (line.startsWith("## ")) {
        break;
      }
      officialLines.push(line);
    }
  }

  const officialPaths = officialLines
    .map((line) => line.match(/^\s*-\s*`([^`]+)`\s*$/u)?.[1] ?? null)
    .filter(Boolean);

  if (officialPaths.length !== 5) {
    return {
      contents,
      errors: [
        createError(
          "INVALID_SOURCE_OF_TRUTH_OFFICIAL_FILES",
          "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
          "Expected exactly five official files in CURRENT_SOURCE_OF_TRUTH.md.",
        ),
      ],
      officialPaths,
    };
  }

  return { contents, errors: [], officialPaths };
}

function listTrackedFiles({ rootDir, targets }) {
  const candidates = (() => {
    try {
      const output = execFileSync("git", ["ls-files", "--", ...targets], {
        cwd: rootDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      return output
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean);
    } catch {
      return targets.flatMap((target) => walkFiles(path.join(rootDir, target)))
        .map((absolutePath) => path.relative(rootDir, absolutePath));
    }
  })();

  const errors = [];
  const files = [];
  for (const candidate of candidates) {
    const validated = validateReadableRepoFile({
      allowBinary: true,
      codePrefix: "TRACKED_SCAN",
      filePath: candidate,
      rootDir,
    });
    if (validated.error) {
      errors.push(validated.error);
      continue;
    }
    if (validated.contents === null || validated.relativePath === null) {
      continue;
    }
    files.push(validated.relativePath);
  }

  return { errors, files };
}

function readValidatedFile(rootDir, filePath, errors, codePrefix) {
  const validated = validateReadableRepoFile({
    codePrefix,
    filePath,
    rootDir,
  });
  if (validated.error) {
    errors.push(validated.error);
    return null;
  }
  return validated.contents;
}

function assertCanonicalSourceOfTruthNote(contents, errors) {
  const missing = SOURCE_OF_TRUTH_NOTE_FRAGMENTS.filter((fragment) => !contents.includes(fragment));
  if (missing.length > 0) {
    errors.push(createError(
      "MISSING_CANONICAL_SOURCE_OF_TRUTH_NOTE",
      "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
      `CURRENT_SOURCE_OF_TRUTH.md must note the canonical production-domain fragments: ${missing.join(", ")}.`,
    ));
  }
}

function assertCanonicalWorkpackReadme(contents, errors) {
  const missing = Object.values(PRODUCTION_DOMAIN_TUPLE).filter((value) => !contents.includes(value));
  if (missing.length > 0) {
    errors.push(createError(
      "MISSING_CANONICAL_WORKPACK_README_TUPLE",
      "docs/workpacks/full-local-supabase-production/README.md",
      `full-local README must contain the exact production-domain tuple: ${missing.join(", ")}.`,
    ));
  }
}

function assertCanonicalAcceptance(contents, errors) {
  const missing = [
    PRODUCTION_DOMAIN_TUPLE.appOrigin,
    PRODUCTION_DOMAIN_TUPLE.authOrigin,
    PRODUCTION_DOMAIN_TUPLE.callback,
    PRODUCTION_DOMAIN_TUPLE.linkCallback,
  ].filter((value) => !contents.includes(value));
  if (missing.length > 0) {
    errors.push(createError(
      "MISSING_CANONICAL_ACCEPTANCE_TUPLE",
      "docs/workpacks/full-local-supabase-production/acceptance.md",
      `full-local acceptance must contain the exact production-domain tuple: ${missing.join(", ")}.`,
    ));
  }
}

function validateCanonicalFiles({ rootDir, errors, sourceOfTruthContents }) {
  assertCanonicalSourceOfTruthNote(sourceOfTruthContents, errors);

  const readmeContents = readValidatedFile(
    rootDir,
    "docs/workpacks/full-local-supabase-production/README.md",
    errors,
    "ACTIVE_SCAN",
  );
  if (readmeContents !== null) {
    assertCanonicalWorkpackReadme(readmeContents, errors);
  }

  const acceptanceContents = readValidatedFile(
    rootDir,
    "docs/workpacks/full-local-supabase-production/acceptance.md",
    errors,
    "ACTIVE_SCAN",
  );
  if (acceptanceContents !== null) {
    assertCanonicalAcceptance(acceptanceContents, errors);
  }
}

export function collectProductionDomainContractTargets({ rootDir = process.cwd() } = {}) {
  const sourceOfTruth = readCurrentSourceOfTruth({ rootDir });
  const errors = [...sourceOfTruth.errors];
  const targets = new Set();

  for (const activeFile of ACTIVE_SCAN_FILES) {
    const validated = validateReadableRepoFile({
      codePrefix: "ACTIVE_SCAN",
      filePath: activeFile,
      rootDir,
    });
    if (validated.error) {
      errors.push(validated.error);
      continue;
    }
    targets.add(validated.relativePath);
  }

  for (const officialPath of sourceOfTruth.officialPaths) {
    const validated = validateReadableRepoFile({
      codePrefix: "OFFICIAL",
      filePath: officialPath,
      requireDocsPrefix: true,
      rootDir,
    });
    if (validated.error) {
      errors.push(validated.error);
      continue;
    }
    targets.add(validated.relativePath);
  }

  const tracked = listTrackedFiles({
    rootDir,
    targets: ACTIVE_SCAN_DIRECTORIES.filter((target) => existsSync(path.join(rootDir, target))),
  });
  for (const error of tracked.errors) {
    errors.push(error);
  }
  for (const filePath of tracked.files) {
    targets.add(filePath);
  }

  return {
    errors,
    files: [...targets].sort(),
    sourceOfTruthContents: sourceOfTruth.contents,
  };
}

function validateProductionEnvExample({ rootDir, errors }) {
  const envPath = "infra/full-local-supabase/.env.production.example";
  const contents = readValidatedFile(rootDir, envPath, errors, "ACTIVE_SCAN");
  if (contents === null) {
    return;
  }

  const env = new Map();
  for (const line of contents.split(/\r?\n/u)) {
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    env.set(line.slice(0, separatorIndex), line.slice(separatorIndex + 1));
  }

  const expected = new Map([
    [
      "FULL_LOCAL_ADDITIONAL_REDIRECT_URLS",
      `${PRODUCTION_DOMAIN_TUPLE.callback},${PRODUCTION_DOMAIN_TUPLE.linkCallback}`,
    ],
    ["FULL_LOCAL_API_EXTERNAL_URL", `${PRODUCTION_DOMAIN_TUPLE.authOrigin}/auth/v1`],
    ["FULL_LOCAL_PUBLIC_AUTH_URL", PRODUCTION_DOMAIN_TUPLE.authOrigin],
    ["FULL_LOCAL_SITE_URL", PRODUCTION_DOMAIN_TUPLE.appOrigin],
  ]);

  for (const [name, value] of expected) {
    if (env.get(name) !== value) {
      errors.push(createError(
        "INVALID_ENV_TUPLE",
        envPath,
        `${name} must exactly equal ${value}.`,
      ));
    }
  }
}

export function validateProductionDomainContract({ rootDir = process.cwd() } = {}) {
  const {
    errors: collectionErrors,
    files,
    sourceOfTruthContents,
  } = collectProductionDomainContractTargets({ rootDir });
  const errors = [...collectionErrors];

  validateCanonicalFiles({ rootDir, errors, sourceOfTruthContents });

  for (const relativePath of files) {
    const contents = readValidatedFile(rootDir, relativePath, errors, "TRACKED_SCAN");
    if (contents === null) {
      continue;
    }
    const lines = contents.split(/\r?\n/u);
    lines.forEach((line, index) => {
      for (const match of line.matchAll(BANNED_PATTERN)) {
        errors.push(createError(
          "BANNED_PRODUCTION_DOMAIN",
          `${relativePath}:${index + 1}`,
          `Active production domain contract still references '${match[0]}'. Use the exact .kr tuple.`,
        ));
      }
    });
  }

  validateProductionEnvExample({ rootDir, errors });

  return [
    {
      errors,
      files,
      name: "production-domain-contract",
    },
  ];
}

function main() {
  const [result] = validateProductionDomainContract();
  if (result.errors.length > 0) {
    console.error("production-domain-contract: fail");
    for (const error of result.errors) {
      console.error(`- ${error.path}: [${error.code}] ${error.message}`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write("production-domain-contract: pass\n");
  process.stdout.write(`- scanned files: ${result.files.length}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
