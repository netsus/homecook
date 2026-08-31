import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants as FS_CONSTANTS,
  fchmodSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { TextDecoder } from "node:util";

import { canonicalizeJcs, parseCanonicalJcs, sha256Jcs } from "./rfc8785-jcs.mjs";

export const REHEARSAL_SELECTION_SCHEMA = "homecook.local-mac-production-rehearsal-selection.v1";

const CANONICALIZATION = "RFC8785-JCS+SHA256";
const REPOSITORY = "netsus/homecook";
const SOURCE_REF = "refs/heads/master";
const HEX_40 = /^[0-9a-f]{40}$/u;
const HEX_64 = /^[0-9a-f]{64}$/u;
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const UNSIGNED_KEYS = [
  "schema", "canonicalization", "repository", "source_ref", "selected_sha", "selected_tree",
  "observed_master_sha", "observed_master_tree", "selected_at", "expires_at", "approver_role",
  "approver_id", "approval_digest",
];

function reject(message) {
  throw new Error(`Release rehearsal selection rejected: ${message}`);
}

function assertExactObject(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) reject("selection must be an object");
  const actual = Object.keys(value);
  const missing = keys.find((key) => !Object.hasOwn(value, key));
  const unknown = actual.find((key) => !keys.includes(key));
  if (missing) reject(`selection is missing ${missing}`);
  if (unknown) reject(`selection contains unknown field ${unknown}`);
  return value;
}

function assertTimestamp(value, label) {
  if (typeof value !== "string" || !RFC3339_UTC.test(value)) reject(`${label} must be exact UTC RFC3339`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) reject(`${label} is invalid`);
  return milliseconds;
}

/** @param {unknown} value @param {{now?: Date | null, requireFresh?: boolean}} [options] */
export function validateRehearsalSelection(value, { now = null, requireFresh = false } = {}) {
  const selection = assertExactObject(value, [...UNSIGNED_KEYS, "selection_digest"]);
  if (selection.schema !== REHEARSAL_SELECTION_SCHEMA) reject("schema mismatch");
  if (selection.canonicalization !== CANONICALIZATION) reject("canonicalization mismatch");
  if (selection.repository !== REPOSITORY || selection.source_ref !== SOURCE_REF) reject("repository or source_ref mismatch");
  for (const key of ["selected_sha", "selected_tree", "observed_master_sha", "observed_master_tree"]) {
    if (!HEX_40.test(selection[key] ?? "")) reject(`${key} must be lowercase 40-hex`);
  }
  if (selection.approver_role !== "human-release-approver") reject("approver_role is not authorized for selection");
  if (typeof selection.approver_id !== "string" || selection.approver_id.length === 0 || selection.approver_id.length > 256) reject("approver_id is invalid");
  if (!HEX_64.test(selection.approval_digest ?? "")) reject("approval_digest must be lowercase SHA-256");
  const selectedAt = assertTimestamp(selection.selected_at, "selected_at");
  const expiresAt = assertTimestamp(selection.expires_at, "expires_at");
  if (expiresAt <= selectedAt || expiresAt - selectedAt > 24 * 60 * 60 * 1000) reject("selection expiry must be after selected_at and within 24 hours");
  const { selection_digest: digest, ...unsigned } = selection;
  if (!HEX_64.test(digest ?? "") || sha256Jcs(unsigned) !== digest) reject("selection_digest mismatch");
  if (requireFresh) {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) reject("fresh validation requires a valid current instant");
    if (now.getTime() < selectedAt || now.getTime() >= expiresAt) reject("selection is not currently valid");
  }
  return Object.freeze(selection);
}

/** @param {Record<string, unknown>} value @param {{now?: Date}} [options] */
export function buildRehearsalSelection(value, { now = new Date(value?.selected_at ?? Number.NaN) } = {}) {
  const unsigned = assertExactObject(value, UNSIGNED_KEYS);
  const selection = { ...unsigned, selection_digest: sha256Jcs(unsigned) };
  return validateRehearsalSelection(selection, { now, requireFresh: true });
}

function assertPrivateRoot(path, { repoRoot, expectedUid }) {
  if (!isAbsolute(path) || resolve(path) !== path) reject("selection root must be an absolute canonical path");
  const before = lstatSync(path, { bigint: true });
  if (!before.isDirectory() || before.isSymbolicLink() || before.uid !== BigInt(expectedUid)
    || (before.mode & 0o777n) !== 0o700n || realpathSync(path) !== path) {
    reject("selection root must be a current-user-owned private mode-0700 directory");
  }
  const canonicalRepo = realpathSync(resolve(repoRoot));
  const repoRelative = relative(canonicalRepo, path);
  if (repoRelative === "" || (!repoRelative.startsWith("..") && !isAbsolute(repoRelative))) {
    reject("selection root must remain outside the repository");
  }
  return before;
}

function sameRootIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.uid === right.uid
    && left.gid === right.gid && (left.mode & 0o7777n) === (right.mode & 0o7777n);
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.uid === right.uid
    && left.gid === right.gid && left.nlink === right.nlink && left.size === right.size
    && left.ctimeNs === right.ctimeNs && left.mtimeNs === right.mtimeNs
    && (left.mode & 0o7777n) === (right.mode & 0o7777n);
}

function sameReadParentIdentity(left, right) {
  return sameRootIdentity(left, right) && left.nlink === right.nlink
    && left.ctimeNs === right.ctimeNs && left.mtimeNs === right.mtimeNs;
}

/**
 * @param {{selection: Record<string, unknown>, selectionRoot: string, repoRoot: string, expectedUid?: number, now?: Date}} options
 */
export function writeRehearsalSelectionCreateOnly({
  selection,
  selectionRoot,
  repoRoot,
  expectedUid = process.getuid?.(),
  now = new Date(),
} = {}) {
  if (!Number.isSafeInteger(expectedUid) || expectedUid < 0) reject("current uid is unavailable");
  const normalized = validateRehearsalSelection(selection, { now, requireFresh: true });
  const rootBefore = assertPrivateRoot(selectionRoot, { repoRoot, expectedUid });
  const rootFd = openSync(selectionRoot, FS_CONSTANTS.O_RDONLY | FS_CONSTANTS.O_DIRECTORY | (FS_CONSTANTS.O_NOFOLLOW ?? 0));
  const temporary = resolve(selectionRoot, `.${randomUUID()}.selection.tmp`);
  const destination = resolve(selectionRoot, `${normalized.selection_digest}.selection.json`);
  const bytes = Buffer.from(canonicalizeJcs(normalized), "utf8");
  let descriptor;
  let temporaryExists = false;
  try {
    if (!sameRootIdentity(rootBefore, fstatSync(rootFd, { bigint: true }))) reject("selection root identity changed before create");
    descriptor = openSync(temporary, FS_CONSTANTS.O_WRONLY | FS_CONSTANTS.O_CREAT | FS_CONSTANTS.O_EXCL | (FS_CONSTANTS.O_NOFOLLOW ?? 0), 0o600);
    temporaryExists = true;
    fchmodSync(descriptor, 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    const opened = fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || opened.uid !== BigInt(expectedUid) || opened.nlink !== 1n
      || (opened.mode & 0o777n) !== 0o600n || opened.size !== BigInt(bytes.length)) {
      reject("temporary selection identity is invalid");
    }
    closeSync(descriptor);
    descriptor = undefined;
    linkSync(temporary, destination);
    unlinkSync(temporary);
    temporaryExists = false;
    const created = lstatSync(destination, { bigint: true });
    if (!created.isFile() || created.isSymbolicLink() || created.uid !== BigInt(expectedUid)
      || created.nlink !== 1n || (created.mode & 0o777n) !== 0o600n
      || !readFileSync(destination).equals(bytes)) reject("created selection identity is invalid");
    if (!sameRootIdentity(rootBefore, lstatSync(selectionRoot, { bigint: true }))) reject("selection root identity changed during create");
    return destination;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (temporaryExists) {
      try { unlinkSync(temporary); } catch { /* create-only cleanup is best effort */ }
    }
    closeSync(rootFd);
  }
}

/**
 * @param {string} path
 * @param {{repoRoot: string, expectedUid?: number, now?: Date, afterOpen?: (() => void) | null}} options
 */
export function readRehearsalSelectionArtifact(path, {
  repoRoot,
  expectedUid = process.getuid?.(),
  now = new Date(),
  afterOpen = null,
} = {}) {
  if (!Number.isSafeInteger(expectedUid) || expectedUid < 0) reject("current uid is unavailable");
  if (!isAbsolute(path) || resolve(path) !== path) reject("selection path must be absolute and canonical");
  const parent = dirname(path);
  const parentBefore = assertPrivateRoot(parent, { repoRoot, expectedUid });
  const before = lstatSync(path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.uid !== BigInt(expectedUid)
    || before.nlink !== 1n || (before.mode & 0o777n) !== 0o600n || realpathSync(path) !== path) {
    reject("selection artifact must be a current-user-owned mode-0600 single-link regular file");
  }
  if (before.size > 64n * 1024n) reject("selection artifact is too large");
  const parentFd = openSync(parent, FS_CONSTANTS.O_RDONLY | FS_CONSTANTS.O_DIRECTORY | (FS_CONSTANTS.O_NOFOLLOW ?? 0));
  let descriptor;
  try {
    if (!sameReadParentIdentity(parentBefore, fstatSync(parentFd, { bigint: true }))) reject("selection parent identity changed before read");
    descriptor = openSync(path, FS_CONSTANTS.O_RDONLY | (FS_CONSTANTS.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor, { bigint: true });
    if (!sameFileIdentity(before, opened)) reject("selection artifact identity changed before read");
    afterOpen?.();
    const bytes = readFileSync(descriptor);
    let source;
    try {
      source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      reject("selection artifact contains invalid UTF-8");
    }
    if (!Buffer.from(source, "utf8").equals(bytes)) reject("selection artifact UTF-8 does not round-trip");
    const openedAfter = fstatSync(descriptor, { bigint: true });
    const after = lstatSync(path, { bigint: true });
    const parentAfter = lstatSync(parent, { bigint: true });
    const parentOpenedAfter = fstatSync(parentFd, { bigint: true });
    if (!sameFileIdentity(opened, openedAfter) || !sameFileIdentity(opened, after)) reject("selection artifact changed during read");
    if (!sameReadParentIdentity(parentBefore, parentAfter) || !sameReadParentIdentity(parentBefore, parentOpenedAfter)) {
      reject("selection parent changed during read");
    }
    let parsed;
    try {
      parsed = parseCanonicalJcs(source);
    } catch {
      reject("selection artifact is not canonical RFC8785 JCS");
    }
    return validateRehearsalSelection(parsed, { now, requireFresh: true });
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    closeSync(parentFd);
  }
}

function runGit(gitPath, args, { cwd, homeDir, allowStatusOne = false } = {}) {
  const result = spawnSync(gitPath, args, {
    cwd,
    encoding: "utf8",
    env: {
      GIT_ATTR_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_OPTIONAL_LOCKS: "0",
      HOME: homeDir,
      PATH: "/usr/bin:/bin",
    },
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  });
  if (result.error || result.signal || (result.status !== 0 && !(allowStatusOne && result.status === 1))) {
    reject("trusted full-history Git authority command failed");
  }
  return { status: result.status, stdout: String(result.stdout ?? "").trim() };
}

/** @param {{releaseSha: string, rootDir: string, homeDir?: string, gitPath?: string}} options */
export function resolveRehearsalSelectionSource({
  releaseSha,
  rootDir,
  homeDir = process.env.HOME ?? "",
  gitPath = "/usr/bin/git",
} = {}) {
  if (!HEX_40.test(releaseSha ?? "")) reject("selected release SHA must be lowercase 40-hex");
  const repositoryRoot = realpathSync(resolve(rootDir));
  const trustedGit = realpathSync(gitPath);
  if (trustedGit !== "/usr/bin/git") reject("selection resolver requires the trusted system Git");
  runGit(trustedGit, ["-C", repositoryRoot, "fetch", "--no-tags", "origin", "master"], {
    cwd: repositoryRoot,
    homeDir,
  });
  const shallow = runGit(trustedGit, ["--no-replace-objects", "-C", repositoryRoot, "rev-parse", "--is-shallow-repository"], {
    cwd: repositoryRoot,
    homeDir,
  }).stdout;
  if (shallow !== "false") reject("shallow or ambiguous origin/master history is forbidden");
  const observedMasterSha = runGit(trustedGit, ["--no-replace-objects", "-C", repositoryRoot, "rev-parse", "refs/remotes/origin/master^{commit}"], {
    cwd: repositoryRoot,
    homeDir,
  }).stdout;
  if (!HEX_40.test(observedMasterSha)) reject("observed origin/master SHA is invalid");
  const ancestry = runGit(trustedGit, ["--no-replace-objects", "-C", repositoryRoot, "merge-base", "--is-ancestor", releaseSha, observedMasterSha], {
    cwd: repositoryRoot,
    homeDir,
    allowStatusOne: true,
  });
  if (ancestry.status !== 0) reject("selected SHA is not an ancestor of fetched origin/master");
  const mergeBase = runGit(trustedGit, ["--no-replace-objects", "-C", repositoryRoot, "merge-base", releaseSha, observedMasterSha], {
    cwd: repositoryRoot,
    homeDir,
  }).stdout;
  if (mergeBase !== releaseSha) reject("selected history is ambiguous or divergent");
  const selectedTree = runGit(trustedGit, ["--no-replace-objects", "-C", repositoryRoot, "rev-parse", `${releaseSha}^{tree}`], {
    cwd: repositoryRoot,
    homeDir,
  }).stdout;
  const observedMasterTree = runGit(trustedGit, ["--no-replace-objects", "-C", repositoryRoot, "rev-parse", `${observedMasterSha}^{tree}`], {
    cwd: repositoryRoot,
    homeDir,
  }).stdout;
  if (!HEX_40.test(selectedTree) || !HEX_40.test(observedMasterTree)) reject("selected or observed tree is invalid");
  return Object.freeze({
    selected_sha: releaseSha,
    selected_tree: selectedTree,
    observed_master_sha: observedMasterSha,
    observed_master_tree: observedMasterTree,
  });
}

/** @param {{releaseSha: string, rootDir: string, selection: Record<string, unknown>, now?: Date, homeDir?: string, gitPath?: string}} options */
export function resolveCandidateRehearsalSourceAuthority({
  releaseSha,
  rootDir,
  selection,
  now = new Date(),
  homeDir = process.env.HOME ?? "",
  gitPath = "/usr/bin/git",
} = {}) {
  const normalizedSelection = validateRehearsalSelection(selection, { now, requireFresh: true });
  if (releaseSha !== normalizedSelection.selected_sha) reject("candidate release SHA differs from selected_sha");
  const repositoryRoot = realpathSync(resolve(rootDir));
  const trustedGit = realpathSync(gitPath);
  if (trustedGit !== "/usr/bin/git") reject("candidate selection resolver requires the trusted system Git");
  runGit(trustedGit, ["-C", repositoryRoot, "fetch", "--no-tags", "origin", "master"], {
    cwd: repositoryRoot,
    homeDir,
  });
  const shallow = runGit(trustedGit, ["--no-replace-objects", "-C", repositoryRoot, "rev-parse", "--is-shallow-repository"], {
    cwd: repositoryRoot,
    homeDir,
  }).stdout;
  if (shallow !== "false") reject("shallow or ambiguous origin/master history is forbidden");
  const currentMasterSha = runGit(trustedGit, ["--no-replace-objects", "-C", repositoryRoot, "rev-parse", "refs/remotes/origin/master^{commit}"], {
    cwd: repositoryRoot,
    homeDir,
  }).stdout;
  const currentMasterTree = runGit(trustedGit, ["--no-replace-objects", "-C", repositoryRoot, "rev-parse", `${currentMasterSha}^{tree}`], {
    cwd: repositoryRoot,
    homeDir,
  }).stdout;
  const selectedTree = runGit(trustedGit, ["--no-replace-objects", "-C", repositoryRoot, "rev-parse", `${releaseSha}^{tree}`], {
    cwd: repositoryRoot,
    homeDir,
  }).stdout;
  const observedMasterTree = runGit(trustedGit, ["--no-replace-objects", "-C", repositoryRoot, "rev-parse", `${normalizedSelection.observed_master_sha}^{tree}`], {
    cwd: repositoryRoot,
    homeDir,
  }).stdout;
  if (!HEX_40.test(currentMasterSha) || !HEX_40.test(currentMasterTree)
    || selectedTree !== normalizedSelection.selected_tree
    || observedMasterTree !== normalizedSelection.observed_master_tree) {
    reject("selected, observed, or current master tree authority mismatch");
  }
  for (const [ancestor, descendant, label] of [
    [releaseSha, normalizedSelection.observed_master_sha, "selected-to-observed ancestry"],
    [normalizedSelection.observed_master_sha, currentMasterSha, "force-push divergence from observed master"],
    [releaseSha, currentMasterSha, "selected-to-current ancestry"],
  ]) {
    const result = runGit(trustedGit, ["--no-replace-objects", "-C", repositoryRoot, "merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: repositoryRoot,
      homeDir,
      allowStatusOne: true,
    });
    if (result.status !== 0) reject(`${label} is invalid`);
  }
  return Object.freeze({
    mode: "approved_ancestor",
    release_sha: releaseSha,
    release_tree: selectedTree,
    selection_digest: normalizedSelection.selection_digest,
    observed_master_sha: normalizedSelection.observed_master_sha,
    observed_master_tree: normalizedSelection.observed_master_tree,
    current_master_sha: currentMasterSha,
    current_master_tree: currentMasterTree,
  });
}
