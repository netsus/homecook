import { constants as fsConstants, closeSync, fstatSync, lstatSync, openSync, readFileSync, realpathSync, writeSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, resolve } from "node:path";

import { canonicalizeJcs, parseCanonicalJcs, sha256Jcs } from "./rfc8785-jcs.mjs";

export const REHEARSAL_SELECTION_SCHEMA =
  "homecook.local-mac-production-rehearsal-selection.v1";
export const REHEARSAL_SELECTION_CONFIRMATION =
  "APPROVE_RELEASE_REHEARSAL_SELECTION";

const CANONICALIZATION = "RFC8785-JCS+SHA256";
const REPOSITORY = "netsus/homecook";
const SOURCE_REF = "refs/heads/master";
const LOCAL_AUTHORITY = "rehearsal-selection-only";
const MAX_SELECTION_LIFETIME_MS = 24 * 60 * 60 * 1000;
const MAX_SELECTION_BYTES = 32 * 1024;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const SELECTION_KEYS = [
  "schema",
  "canonicalization",
  "repository",
  "source_ref",
  "selected_release_sha",
  "selected_release_tree",
  "observed_master_sha",
  "observed_master_tree",
  "selected_at",
  "valid_until",
  "local_authority",
  "approval",
  "approval_digest",
  "selection_digest",
];
const APPROVAL_KEYS = [
  "approved_by",
  "approval_id",
  "issuer_task_id",
  "confirmation_digest",
];
const FILE_IDENTITY_FIELDS = [
  "dev", "ino", "mode", "uid", "gid", "nlink", "size", "ctimeNs", "mtimeNs",
];
const DIRECTORY_IDENTITY_FIELDS = ["dev", "ino", "mode", "uid", "gid"];

function reject(message) {
  throw new Error(`Release rehearsal selection rejected: ${message}`);
}

function exactObject(value, label, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    reject(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  const unknown = actual.filter((key) => !expected.includes(key));
  const missing = expected.filter((key) => !actual.includes(key));
  if (unknown.length > 0) reject(`${label} contains unknown fields: ${unknown.join(", ")}`);
  if (missing.length > 0) reject(`${label} is missing required fields: ${missing.join(", ")}`);
  return value;
}

function exactSha(value, label) {
  if (!SHA_PATTERN.test(value ?? "")) reject(`${label} must be exact lowercase 40-hex`);
  return value;
}

function exactDigest(value, label) {
  if (!DIGEST_PATTERN.test(value ?? "")) reject(`${label} must be lowercase SHA-256`);
  return value;
}

function safeMetadata(value, label) {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 200
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) reject(`${label} must be a bounded nonempty metadata string`);
  return value;
}

function exactInstant(value, label) {
  if (typeof value !== "string") reject(`${label} must be a UTC RFC3339 instant`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) {
    reject(`${label} must use exact UTC RFC3339 millisecond form`);
  }
  return date;
}

function confirmationDigest() {
  return sha256Jcs({ confirmation: REHEARSAL_SELECTION_CONFIRMATION });
}

function selectionDigestInput(selection) {
  const { selection_digest: _selectionDigest, ...input } = selection;
  return input;
}

/** @param {any} options */
export function buildRehearsalSelection({
  repository = REPOSITORY,
  source_ref: sourceRef = SOURCE_REF,
  selected_release_sha: selectedReleaseSha,
  selected_release_tree: selectedReleaseTree,
  observed_master_sha: observedMasterSha,
  observed_master_tree: observedMasterTree,
  selected_at: selectedAt,
  valid_until: validUntil,
  approval,
  confirmation,
} = {}) {
  if (confirmation !== REHEARSAL_SELECTION_CONFIRMATION) {
    reject(`explicit confirmation must equal ${REHEARSAL_SELECTION_CONFIRMATION}`);
  }
  if (repository !== REPOSITORY || sourceRef !== SOURCE_REF) {
    reject("repository and source ref are fixed");
  }
  exactSha(selectedReleaseSha, "selected_release_sha");
  exactSha(selectedReleaseTree, "selected_release_tree");
  exactSha(observedMasterSha, "observed_master_sha");
  exactSha(observedMasterTree, "observed_master_tree");
  const selectedDate = exactInstant(selectedAt, "selected_at");
  const validUntilDate = exactInstant(validUntil, "valid_until");
  if (validUntilDate <= selectedDate) reject("valid_until must be later than selected_at");
  if (validUntilDate.getTime() - selectedDate.getTime() > MAX_SELECTION_LIFETIME_MS) {
    reject("valid_until may not extend more than 24 hours after selected_at");
  }
  if (!approval || typeof approval !== "object" || Array.isArray(approval)) reject("approval must be an object");
  const approvalUnknown = Object.keys(approval).filter((key) => !APPROVAL_KEYS.includes(key));
  if (approvalUnknown.length > 0) reject(`approval contains unknown fields: ${approvalUnknown.join(", ")}`);
  for (const key of ["approved_by", "approval_id", "issuer_task_id"]) {
    if (!Object.hasOwn(approval, key)) reject(`approval is missing required field: ${key}`);
  }
  const normalizedApproval = {
    approved_by: safeMetadata(approval.approved_by, "approval.approved_by"),
    approval_id: safeMetadata(approval.approval_id, "approval.approval_id"),
    issuer_task_id: safeMetadata(approval.issuer_task_id, "approval.issuer_task_id"),
    confirmation_digest: confirmationDigest(),
  };
  const approvalDigest = sha256Jcs(normalizedApproval);
  const selection = {
    schema: REHEARSAL_SELECTION_SCHEMA,
    canonicalization: CANONICALIZATION,
    repository: REPOSITORY,
    source_ref: SOURCE_REF,
    selected_release_sha: selectedReleaseSha,
    selected_release_tree: selectedReleaseTree,
    observed_master_sha: observedMasterSha,
    observed_master_tree: observedMasterTree,
    selected_at: selectedAt,
    valid_until: validUntil,
    local_authority: LOCAL_AUTHORITY,
    approval: normalizedApproval,
    approval_digest: approvalDigest,
  };
  return Object.freeze({
    ...selection,
    selection_digest: sha256Jcs(selection),
  });
}

export function parseAndValidateRehearsalSelection(source, { now = new Date() } = {}) {
  const selection = parseCanonicalJcs(source);
  exactObject(selection, "selection", SELECTION_KEYS);
  if (selection.schema !== REHEARSAL_SELECTION_SCHEMA) reject("schema is invalid");
  if (selection.canonicalization !== CANONICALIZATION) reject("canonicalization is invalid");
  if (selection.repository !== REPOSITORY || selection.source_ref !== SOURCE_REF) {
    reject("repository and source ref are invalid");
  }
  if (selection.local_authority !== LOCAL_AUTHORITY) {
    reject("local selection must not claim production authority");
  }
  exactSha(selection.selected_release_sha, "selected_release_sha");
  exactSha(selection.selected_release_tree, "selected_release_tree");
  exactSha(selection.observed_master_sha, "observed_master_sha");
  exactSha(selection.observed_master_tree, "observed_master_tree");
  const selectedAt = exactInstant(selection.selected_at, "selected_at");
  const validUntil = exactInstant(selection.valid_until, "valid_until");
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) reject("validation clock is invalid");
  if (selectedAt > now) reject("selection timestamp is in the future");
  if (validUntil <= now) reject("selection is expired");
  if (validUntil <= selectedAt) reject("selection expiry is not later than selection timestamp");
  if (validUntil.getTime() - selectedAt.getTime() > MAX_SELECTION_LIFETIME_MS) {
    reject("selection expiry exceeds the 24-hour maximum");
  }
  exactObject(selection.approval, "approval", APPROVAL_KEYS);
  safeMetadata(selection.approval.approved_by, "approval.approved_by");
  safeMetadata(selection.approval.approval_id, "approval.approval_id");
  safeMetadata(selection.approval.issuer_task_id, "approval.issuer_task_id");
  if (selection.approval.confirmation_digest !== confirmationDigest()) {
    reject("approval confirmation digest is invalid");
  }
  exactDigest(selection.approval_digest, "approval_digest");
  if (selection.approval_digest !== sha256Jcs(selection.approval)) {
    reject("approval digest mismatch");
  }
  exactDigest(selection.selection_digest, "selection_digest");
  if (selection.selection_digest !== sha256Jcs(selectionDigestInput(selection))) {
    reject("selection digest mismatch");
  }
  return selection;
}

function modeBits(mode) {
  return Number(mode & 0o7777n);
}

function assertPrivateParent(path, currentUid) {
  const parent = resolve(dirname(path));
  const stat = lstatSync(parent, { bigint: true });
  if (
    stat.isSymbolicLink()
    || !stat.isDirectory()
    || stat.uid !== BigInt(currentUid)
    || modeBits(stat.mode) !== 0o700
    || realpathSync(parent) !== parent
  ) reject("selection parent must be a private current-user-owned mode 0700 real directory");
  return {
    path: parent,
    identity: Object.fromEntries(DIRECTORY_IDENTITY_FIELDS.map((field) => [field, String(stat[field])])),
  };
}

function snapshotSelectionFile(path, currentUid) {
  const stat = lstatSync(path, { bigint: true });
  if (
    stat.isSymbolicLink()
    || !stat.isFile()
    || stat.uid !== BigInt(currentUid)
    || modeBits(stat.mode) !== 0o600
    || stat.nlink !== 1n
    || stat.size > BigInt(MAX_SELECTION_BYTES)
  ) reject("selection file must be a current-user-owned mode 0600 nlink-1 regular file without symlinks or hardlinks");
  return Object.fromEntries(FILE_IDENTITY_FIELDS.map((field) => [field, String(stat[field])]));
}

function snapshotOpenedSelectionFile(descriptor, currentUid) {
  const stat = fstatSync(descriptor, { bigint: true });
  if (
    !stat.isFile()
    || stat.uid !== BigInt(currentUid)
    || modeBits(stat.mode) !== 0o600
    || stat.nlink !== 1n
    || stat.size > BigInt(MAX_SELECTION_BYTES)
  ) reject("opened selection FD must remain a current-user-owned mode 0600 nlink-1 bounded regular file");
  return Object.fromEntries(FILE_IDENTITY_FIELDS.map((field) => [field, String(stat[field])]));
}

function sameIdentity(left, right) {
  return FILE_IDENTITY_FIELDS.every((field) => left[field] === right[field]);
}

function stableReadSelectionFile(path, { currentUid = process.getuid?.(), afterOpen = null } = {}) {
  if (!Number.isInteger(currentUid) || currentUid < 0) reject("current uid is unavailable");
  if (!isAbsolute(path ?? "") || resolve(path) !== path) reject("selection path must be an absolute normalized path");
  const parent = assertPrivateParent(path, currentUid);
  const before = snapshotSelectionFile(path, currentUid);
  let descriptor;
  try {
    descriptor = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch {
    reject("selection file O_NOFOLLOW open failed");
  }
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    const openedIdentity = Object.fromEntries(FILE_IDENTITY_FIELDS.map((field) => [field, String(opened[field])]));
    if (!sameIdentity(before, openedIdentity)) reject("selection file identity changed before read");
    if (typeof afterOpen === "function") afterOpen();
    const bytes = readFileSync(descriptor);
    const afterFd = fstatSync(descriptor, { bigint: true });
    const afterFdIdentity = Object.fromEntries(FILE_IDENTITY_FIELDS.map((field) => [field, String(afterFd[field])]));
    const afterPath = snapshotSelectionFile(path, currentUid);
    const parentAfter = assertPrivateParent(path, currentUid);
    if (
      !sameIdentity(before, afterFdIdentity)
      || !sameIdentity(before, afterPath)
      || JSON.stringify(parent) !== JSON.stringify(parentAfter)
    ) reject("selection file or private parent identity changed during read");
    return { bytes, file_identity: before, parent_identity: parent.identity };
  } finally {
    closeSync(descriptor);
  }
}

function fatalUtf8(bytes) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!Buffer.from(text, "utf8").equals(bytes)) reject("selection UTF-8 bytes are not stable");
    return text;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Release rehearsal selection rejected:")) throw error;
    reject("selection contains invalid UTF-8");
  }
}

export function readRehearsalSelectionAuthority(path, options = {}) {
  const snapshot = stableReadSelectionFile(path, options);
  const selection = parseAndValidateRehearsalSelection(fatalUtf8(snapshot.bytes), options);
  const authorityDigest = sha256Jcs({
    file_identity: snapshot.file_identity,
    parent_identity: snapshot.parent_identity,
    selection_digest: selection.selection_digest,
  });
  return Object.freeze({
    selection,
    authority_digest: authorityDigest,
    revalidate(overrides = {}) {
      const validationOptions = { ...options, ...overrides };
      const current = stableReadSelectionFile(path, validationOptions);
      const currentSelection = parseAndValidateRehearsalSelection(fatalUtf8(current.bytes), validationOptions);
      const currentDigest = sha256Jcs({
        file_identity: current.file_identity,
        parent_identity: current.parent_identity,
        selection_digest: currentSelection.selection_digest,
      });
      if (currentDigest !== authorityDigest) reject("selection path identity changed after candidate authorization began");
      return true;
    },
  });
}

function runGit(gitPath, repositoryRoot, homeDir, args) {
  const result = spawnSync(gitPath, ["--no-replace-objects", "-C", repositoryRoot, ...args], {
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
  if (result.error || result.signal) reject("trusted Git history command failed");
  if (result.status !== 0) reject("trusted Git history command failed");
  return { status: result.status, stdout: result.stdout.trim() };
}

function assertGitInputs({ repositoryRoot, homeDir }) {
  if (![repositoryRoot, homeDir].every((value) => isAbsolute(value ?? ""))) reject("trusted Git authority paths must be absolute");
  const gitPath = realpathSync("/usr/bin/git");
  if (gitPath !== "/usr/bin/git") reject("trusted Git path is invalid");
  return gitPath;
}

function resolveCommitTree(gitPath, repositoryRoot, homeDir, sha, label) {
  const type = runGit(gitPath, repositoryRoot, homeDir, ["cat-file", "-t", sha]).stdout;
  if (type !== "commit") reject(`${label} is not an exact commit object`);
  const resolved = runGit(gitPath, repositoryRoot, homeDir, ["rev-parse", "--verify", `${sha}^{commit}`]).stdout;
  if (resolved !== sha) reject(`${label} commit resolution is ambiguous`);
  return runGit(gitPath, repositoryRoot, homeDir, ["rev-parse", `${sha}^{tree}`]).stdout;
}

function isAncestor(gitPath, repositoryRoot, homeDir, ancestor, descendant) {
  const result = spawnSync(gitPath, [
    "--no-replace-objects", "-C", repositoryRoot, "merge-base", "--is-ancestor", ancestor, descendant,
  ], {
    encoding: "utf8",
    env: {
      GIT_ATTR_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_OPTIONAL_LOCKS: "0",
      HOME: homeDir,
      PATH: "/usr/bin:/bin",
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  });
  if (result.error || result.signal || ![0, 1].includes(result.status)) reject("Git ancestor history is ambiguous");
  return result.status === 0;
}

/** @param {any} options */
export async function resolveRehearsalSelectionGitAuthority({ releaseSha, repositoryRoot, homeDir } = {}) {
  exactSha(releaseSha, "selection release SHA");
  const gitPath = assertGitInputs({ repositoryRoot, homeDir });
  runGit(gitPath, repositoryRoot, homeDir, ["fetch", "--no-tags", "origin", "master"]);
  const shallow = runGit(gitPath, repositoryRoot, homeDir, ["rev-parse", "--is-shallow-repository"]).stdout;
  if (shallow !== "false") reject("selection requires complete non-shallow Git history");
  const observedMasterSha = runGit(gitPath, repositoryRoot, homeDir, ["rev-parse", "--verify", "origin/master^{commit}"]).stdout;
  exactSha(observedMasterSha, "observed origin/master SHA");
  const selectedTree = resolveCommitTree(gitPath, repositoryRoot, homeDir, releaseSha, "selected release");
  const observedMasterTree = resolveCommitTree(gitPath, repositoryRoot, homeDir, observedMasterSha, "observed master");
  if (!isAncestor(gitPath, repositoryRoot, homeDir, releaseSha, observedMasterSha)) {
    reject("selected release is not an ancestor of observed origin/master");
  }
  const mergeBase = runGit(gitPath, repositoryRoot, homeDir, ["merge-base", releaseSha, observedMasterSha]).stdout;
  if (mergeBase !== releaseSha) reject("selected release ancestry is ambiguous");
  return Object.freeze({
    selected_release_tree: selectedTree,
    observed_master_sha: observedMasterSha,
    observed_master_tree: observedMasterTree,
  });
}

/** @param {any} options */
export async function resolveRehearsalCandidateGitHistory({
  selectedSha,
  observedMasterSha,
  selectionObservedMasterSha = observedMasterSha,
  repositoryRoot,
  homeDir,
} = {}) {
  exactSha(selectedSha, "selected release SHA");
  exactSha(observedMasterSha, "candidate-start observed master SHA");
  exactSha(selectionObservedMasterSha, "selection observed master SHA");
  const gitPath = assertGitInputs({ repositoryRoot, homeDir });
  const shallow = runGit(gitPath, repositoryRoot, homeDir, ["rev-parse", "--is-shallow-repository"]).stdout !== "false";
  if (shallow) return { shallow: true };
  const selectedTree = resolveCommitTree(gitPath, repositoryRoot, homeDir, selectedSha, "selected release");
  const observedMasterTree = resolveCommitTree(gitPath, repositoryRoot, homeDir, observedMasterSha, "candidate-start master");
  const selectionObservedMasterTree = resolveCommitTree(
    gitPath, repositoryRoot, homeDir, selectionObservedMasterSha, "selection observed master",
  );
  return Object.freeze({
    shallow: false,
    selected_commit_exists: true,
    observed_master_commit_exists: true,
    selection_observed_master_commit_exists: true,
    selected_tree: selectedTree,
    observed_master_tree: observedMasterTree,
    selection_observed_master_tree: selectionObservedMasterTree,
    selected_is_ancestor_of_observed_master: isAncestor(
      gitPath, repositoryRoot, homeDir, selectedSha, observedMasterSha,
    ),
    selected_is_ancestor_of_selection_observed_master: isAncestor(
      gitPath, repositoryRoot, homeDir, selectedSha, selectionObservedMasterSha,
    ),
    selection_observed_master_is_ancestor_of_current: isAncestor(
      gitPath, repositoryRoot, homeDir, selectionObservedMasterSha, observedMasterSha,
    ),
    merge_base_sha: runGit(
      gitPath, repositoryRoot, homeDir, ["merge-base", selectedSha, observedMasterSha],
    ).stdout,
    selection_observed_master_merge_base_sha: runGit(
      gitPath, repositoryRoot, homeDir, ["merge-base", selectionObservedMasterSha, observedMasterSha],
    ).stdout,
  });
}

/** @param {any} options */
export function writeRehearsalSelectionCreateOnly({
  path,
  selection,
  currentUid = process.getuid?.(),
  now = new Date(),
  afterOpen = null,
} = {}) {
  if (!isAbsolute(path ?? "") || resolve(path) !== path) reject("selection path must be an absolute normalized path");
  const parentBefore = assertPrivateParent(path, currentUid);
  const bytes = Buffer.from(canonicalizeJcs(selection), "utf8");
  parseAndValidateRehearsalSelection(bytes.toString("utf8"), { now });
  let descriptor;
  try {
    descriptor = openSync(
      path,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
      0o600,
    );
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      reject("selection artifact already exists; create-only no-overwrite is required");
    }
    reject("selection artifact create-only O_NOFOLLOW open failed");
  }
  try {
    const openedIdentity = snapshotOpenedSelectionFile(descriptor, currentUid);
    if (typeof afterOpen === "function") afterOpen();
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(descriptor, bytes, offset);
      if (!Number.isInteger(written) || written <= 0) reject("selection create-only write made no progress");
      offset += written;
    }
    const finalFdIdentity = snapshotOpenedSelectionFile(descriptor, currentUid);
    for (const field of ["dev", "ino", "mode", "uid", "gid", "nlink"]) {
      if (openedIdentity[field] !== finalFdIdentity[field]) {
        reject("selection opened FD identity changed during create-only write");
      }
    }
    const finalPathIdentity = snapshotSelectionFile(path, currentUid);
    if (!sameIdentity(finalFdIdentity, finalPathIdentity)) {
      reject("selection final path was replaced after create-only O_NOFOLLOW open");
    }
    const parentAfter = assertPrivateParent(path, currentUid);
    if (JSON.stringify(parentBefore) !== JSON.stringify(parentAfter)) {
      reject("selection private parent identity changed during create-only write");
    }
  } finally {
    closeSync(descriptor);
  }
  return path;
}

/** @param {any} options */
export async function authorizeRehearsalCandidateSource({
  releaseSha,
  observedMasterSha,
  observedMasterTree,
  selectionAuthority = null,
  now = new Date(),
  resolveHistory,
} = {}) {
  exactSha(releaseSha, "candidate release SHA");
  exactSha(observedMasterSha, "candidate-start observed master SHA");
  exactSha(observedMasterTree, "candidate-start observed master tree");
  if (releaseSha === observedMasterSha && selectionAuthority === null) {
    return Object.freeze({
      mode: "current-tip",
      release_sha: releaseSha,
      release_tree: observedMasterTree,
      observed_master_sha: observedMasterSha,
      observed_master_tree: observedMasterTree,
      selection_digest: null,
      selection_valid_until: null,
    });
  }
  if (!selectionAuthority?.selection) {
    reject("raw ancestor candidate is forbidden; an explicit rehearsal selection is required");
  }
  const selection = selectionAuthority.selection;
  parseAndValidateRehearsalSelection(canonicalizeJcs(selection), { now });
  if (selection.selected_release_sha !== releaseSha) reject("selection release SHA differs from candidate request");
  if (typeof resolveHistory !== "function") reject("trusted complete-history resolver is required");
  const resolved = await resolveHistory({ selectedSha: releaseSha, observedMasterSha });
  if (resolved.shallow !== false) reject("Git history is shallow or completeness is ambiguous");
  if (resolved.selected_commit_exists !== true || resolved.observed_master_commit_exists !== true) {
    reject("selected or observed master commit is missing from complete history");
  }
  if (resolved.selected_tree !== selection.selected_release_tree) reject("selected release tree differs from selection");
  if (resolved.observed_master_tree !== observedMasterTree) reject("candidate-start observed master tree differs from Git history");
  if (
    resolved.selected_is_ancestor_of_observed_master !== true
    || resolved.merge_base_sha !== releaseSha
  ) reject("selected release is not an unambiguous ancestor of candidate-start master");
  if (selection.observed_master_sha === observedMasterSha) {
    if (selection.observed_master_tree !== observedMasterTree) reject("selection observed master tree differs from candidate-start master");
  } else {
    if (
      resolved.selection_observed_master_commit_exists !== true
      || resolved.selection_observed_master_tree !== selection.observed_master_tree
      || resolved.selected_is_ancestor_of_selection_observed_master !== true
      || resolved.selection_observed_master_is_ancestor_of_current !== true
      || resolved.selection_observed_master_merge_base_sha !== selection.observed_master_sha
    ) reject("selection observed master history was rewritten or is ambiguous");
  }
  return Object.freeze({
    mode: releaseSha === observedMasterSha ? "approved-current-tip" : "approved-ancestor",
    release_sha: releaseSha,
    release_tree: selection.selected_release_tree,
    observed_master_sha: observedMasterSha,
    observed_master_tree: observedMasterTree,
    selection_digest: selection.selection_digest,
    selection_valid_until: selection.valid_until,
  });
}
