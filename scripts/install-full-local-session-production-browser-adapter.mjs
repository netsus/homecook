#!/usr/bin/env node

import {
  closeSync,
  chmodSync,
  existsSync,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeSync,
  constants as FS_CONSTANTS,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PRODUCTION_BROWSER_MANUAL_ACTION,
  validateConfiguredPublicAnonKey,
} from "./lib/full-local-session-production-browser-adapter.mjs";

const FAIL_OUTPUT = "install-full-local-session-production-browser-adapter: FAIL (redacted)\n";

function fail(message) {
  throw new Error(message);
}

function isMain(importMetaUrl) {
  const current = realpathSync(fileURLToPath(importMetaUrl));
  const entry = process.argv[1] ? realpathSync(process.argv[1]) : "";
  return current === entry;
}

function currentUid() {
  const uid = process.getuid?.();
  if (!Number.isSafeInteger(uid) || uid < 0) {
    fail("Current user is unavailable.");
  }
  return uid;
}

function assertAbsolute(candidate, label) {
  if (typeof candidate !== "string" || !path.isAbsolute(candidate)) {
    fail(`${label} must be an absolute path.`);
  }
  return path.resolve(candidate);
}

function assertOutsideRepo(candidate, repoRoot) {
  const relative = path.relative(repoRoot, candidate);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    fail("Production browser canary wrapper must live outside the repository.");
  }
}

function assertCanonicalOwnedPrivateDirectory(directoryPath, uid) {
  const stats = lstatSync(directoryPath);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    fail("Production browser canary wrapper parent must be a canonical directory.");
  }
  if ((stats.mode & 0o777) !== 0o700) {
    fail("Production browser canary wrapper parent must have exact mode 0700.");
  }
  if (stats.uid !== uid) {
    fail("Production browser canary wrapper parent must belong to the current user.");
  }
  if (realpathSync(directoryPath) !== directoryPath) {
    fail("Production browser canary wrapper parent must use its canonical path.");
  }
}

function ensurePrivateDirectory(directoryPath, uid) {
  if (existsSync(directoryPath)) {
    assertCanonicalOwnedPrivateDirectory(directoryPath, uid);
    return directoryPath;
  }

  const parent = assertAbsolute(path.dirname(directoryPath), "Production browser canary wrapper ancestor");
  const parentStats = lstatSync(parent);
  if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) {
    fail("Production browser canary wrapper ancestor must be a canonical directory.");
  }
  if (parentStats.uid !== uid) {
    fail("Production browser canary wrapper ancestor must belong to the current user.");
  }
  if (realpathSync(parent) !== parent) {
    fail("Production browser canary wrapper ancestor must use its canonical path.");
  }

  mkdirSync(directoryPath, { mode: 0o700 });
  chmodSync(directoryPath, 0o700);
  assertCanonicalOwnedPrivateDirectory(directoryPath, uid);
  return directoryPath;
}

function readConfiguredPublicAnonKey(repoRoot) {
  const envPath = path.join(repoRoot, ".env.production.local");
  const source = readFileSync(envPath, "utf8");
  let found = null;
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const match = line.match(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)$/u);
    if (!match) continue;
    if (found !== null) fail("Production browser canary anon key is invalid.");
    const rawValue = match[1]?.trim() ?? "";
    const value = rawValue.replace(/^(['"])(.*)\1$/u, "$2");
    try {
      found = validateConfiguredPublicAnonKey(value);
    } catch {
      fail("Production browser canary anon key is invalid.");
    }
  }
  if (found === null) {
    fail("Production browser canary anon key is invalid.");
  }
  return found;
}

export function buildProductionBrowserAdapterWrapperSource({
  adapterModulePath,
  configuredPublicAnonKey,
}) {
  const absoluteModulePath = assertAbsolute(
    adapterModulePath,
    "Production browser canary adapter module",
  );
  const source = readFileSync(absoluteModulePath, "utf8");
  const replacements = [
    [
      'from "@supabase/ssr"',
      `from ${JSON.stringify(import.meta.resolve("@supabase/ssr"))}`,
    ],
    [
      'import("@playwright/test")',
      `import(${JSON.stringify(import.meta.resolve("@playwright/test"))})`,
    ],
  ];
  let standaloneSource = source;
  for (const [expected, replacement] of replacements) {
    if (standaloneSource.indexOf(expected) < 0
      || standaloneSource.indexOf(expected) !== standaloneSource.lastIndexOf(expected)) {
      fail("Production browser canary adapter dependency boundary drifted.");
    }
    standaloneSource = standaloneSource.replace(expected, replacement);
  }
  if (standaloneSource.includes(absoluteModulePath)
    || standaloneSource.includes('from "@supabase/ssr"')
    || standaloneSource.includes('import("@playwright/test")')) {
    fail("Production browser canary adapter must be standalone.");
  }
  let validatedConfiguredPublicAnonKey;
  try {
    validatedConfiguredPublicAnonKey = validateConfiguredPublicAnonKey(configuredPublicAnonKey);
  } catch {
    fail("Production browser canary anon key is invalid.");
  }
  if (typeof validatedConfiguredPublicAnonKey !== "string" || validatedConfiguredPublicAnonKey.length === 0) {
    fail("Production browser canary anon key is invalid.");
  }
  return `${standaloneSource.trimEnd()}

export const REVIEWABLE_PRODUCTION_CANARY_GAPS = Object.freeze([
]);

export const REVIEWABLE_PRODUCTION_CANARY_MANUAL_ACTION = ${JSON.stringify(PRODUCTION_BROWSER_MANUAL_ACTION)};

const CONFIGURED_PUBLIC_ANON_KEY = ${JSON.stringify(validatedConfiguredPublicAnonKey)};

export async function createProductionCanaryAdapter({ phase } = {}) {
  return createProductionBrowserCanaryAdapter({
    configuredPublicAnonKey: CONFIGURED_PUBLIC_ANON_KEY,
    phase,
  });
}
`;
}

function writeNewPrivateFile(targetPath, source, uid) {
  const noFollowFlag = typeof FS_CONSTANTS.O_NOFOLLOW === "number" ? FS_CONSTANTS.O_NOFOLLOW : 0;
  const flags = FS_CONSTANTS.O_CREAT | FS_CONSTANTS.O_EXCL | FS_CONSTANTS.O_WRONLY | noFollowFlag;
  let descriptor;
  try {
    descriptor = openSync(targetPath, flags, 0o600);
    fchmodSync(descriptor, 0o600);
    writeSync(descriptor, source, undefined, "utf8");
    const fileStats = fstatSync(descriptor);
    if (!fileStats.isFile() || (fileStats.mode & 0o777) !== 0o600 || fileStats.uid !== uid) {
      fail("Production browser canary wrapper must be a current-user-owned mode 0600 file.");
    }
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Keep the original error.
      }
      try {
        unlinkSync(targetPath);
      } catch {
        // Best-effort cleanup only.
      }
    }
    throw error;
  }
  closeSync(descriptor);
}

/**
 * @param {{ outputPath?: string; repoRoot?: string }} [options]
 */
export function installProductionBrowserAdapterWrapper({
  outputPath,
  repoRoot = process.cwd(),
} = {}) {
  const uid = currentUid();
  const canonicalRepoRoot = realpathSync(assertAbsolute(repoRoot, "Repository root"));
  const targetPath = assertAbsolute(outputPath, "Production browser canary wrapper path");
  assertOutsideRepo(targetPath, canonicalRepoRoot);

  const operatorDirectory = ensurePrivateDirectory(path.dirname(targetPath), uid);
  const existing = existsSync(targetPath) ? lstatSync(targetPath) : null;
  if (existing) {
    if (!existing.isFile() || existing.isSymbolicLink()) fail("Production browser canary wrapper must be a regular file.");
    fail("Production browser canary wrapper already exists and must not be overwritten.");
  }
  const configuredPublicAnonKey = readConfiguredPublicAnonKey(canonicalRepoRoot);

  const source = buildProductionBrowserAdapterWrapperSource({
    adapterModulePath: path.join(
      canonicalRepoRoot,
      "scripts/lib/full-local-session-production-browser-adapter.mjs",
    ),
    configuredPublicAnonKey,
  });
  writeNewPrivateFile(targetPath, source, uid);
  chmodSync(targetPath, 0o600);

  return {
    adapterPath: targetPath,
    adapterPathMode: "0600",
    manualUserAction: PRODUCTION_BROWSER_MANUAL_ACTION,
    operatorDirectory,
    operatorDirectoryMode: "0700",
    unresolvedGaps: [],
  };
}

function parseArgs(argv) {
  const args = argv.filter((argument) => argument !== "--");
  let outputPath;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--output" && args[index + 1]) {
      outputPath = args[index + 1];
      index += 1;
      continue;
    }
    fail("Production browser canary wrapper arguments are invalid.");
  }
  if (!outputPath) {
    fail("Production browser canary wrapper requires --output.");
  }
  return { outputPath };
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = installProductionBrowserAdapterWrapper(args);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stderr.write(FAIL_OUTPUT);
    process.exitCode = 1;
  }
}

if (isMain(import.meta.url)) {
  await main();
}
