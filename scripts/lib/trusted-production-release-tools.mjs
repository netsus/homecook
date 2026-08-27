import {
  accessSync,
  constants,
  realpathSync,
  statSync,
} from "node:fs";
import { isAbsolute } from "node:path";

const GIT_CANDIDATES = ["/usr/bin/git"];
const TAR_CANDIDATES = ["/usr/bin/tar"];
const GH_CANDIDATES = [
  "/opt/homebrew/bin/gh",
  "/usr/local/bin/gh",
  "/usr/bin/gh",
];
const GH_ALLOWED_REALPATHS = [
  "/opt/homebrew/bin/gh",
  "/opt/homebrew/Cellar/gh/",
  "/usr/local/bin/gh",
  "/usr/local/Cellar/gh/",
  "/usr/bin/gh",
];

function realpathAllowed(realpath, allowedRealpaths) {
  return allowedRealpaths.some((allowed) =>
    realpath === allowed || (allowed.endsWith("/") && realpath.startsWith(allowed)));
}

export function verifyTrustedExecutable(
  candidate,
  { allowedRealpaths, currentUid = process.getuid?.(), label },
) {
  if (!isAbsolute(candidate)) throw new Error(`${label} path must be absolute.`);
  let realpath;
  let stat;
  try {
    realpath = realpathSync(candidate);
    stat = statSync(realpath);
    accessSync(realpath, constants.X_OK);
  } catch {
    throw new Error(`${label} executable is unavailable.`);
  }
  if (
    !stat.isFile()
    || ![0, currentUid].includes(stat.uid)
    || (stat.mode & 0o111) === 0
    || (stat.mode & 0o022) !== 0
    || !realpathAllowed(realpath, allowedRealpaths)
  ) {
    throw new Error(`${label} executable failed trusted realpath or safe mode verification.`);
  }
  return realpath;
}

function resolveFirst(candidates, options) {
  for (const candidate of candidates) {
    try {
      return verifyTrustedExecutable(candidate, options);
    } catch {
      // Continue only through the fixed absolute candidate allowlist.
    }
  }
  throw new Error(`${options.label} trusted executable is unavailable.`);
}

export function resolveTrustedGitExecutable() {
  return resolveFirst(GIT_CANDIDATES, {
    allowedRealpaths: ["/usr/bin/git"],
    label: "Git",
  });
}

export function resolveTrustedTarExecutable() {
  return resolveFirst(TAR_CANDIDATES, {
    allowedRealpaths: ["/usr/bin/tar", "/usr/bin/bsdtar"],
    label: "tar",
  });
}

/**
 * @param {{
 *   allowedRealpaths?: string[],
 *   candidates?: string[],
 *   currentUid?: number,
 *   pathEnvironment?: string,
 * }} [options]
 */
export function resolveTrustedGhExecutable({
  allowedRealpaths = GH_ALLOWED_REALPATHS,
  candidates = GH_CANDIDATES,
  currentUid = process.getuid?.(),
  pathEnvironment = undefined,
} = {}) {
  void pathEnvironment;
  return resolveFirst(candidates, {
    allowedRealpaths,
    currentUid,
    label: "GitHub CLI",
  });
}

export function resolveTrustedNodeExecutable() {
  const executable = process.execPath;
  const realpath = realpathSync(executable);
  return verifyTrustedExecutable(executable, {
    allowedRealpaths: [realpath],
    label: "Node.js",
  });
}

export function resolveTrustedProductionReleaseToolPaths() {
  return Object.freeze({
    ghPath: resolveTrustedGhExecutable(),
    gitPath: resolveTrustedGitExecutable(),
    nodePath: resolveTrustedNodeExecutable(),
    tarPath: resolveTrustedTarExecutable(),
  });
}
