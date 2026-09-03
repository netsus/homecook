import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  fchmodSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import type { BigIntStats } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

type OwnedDirectoryIdentity = {
  device: bigint;
  inode: bigint;
  uid: bigint;
};

type OwnedRootIdentity = OwnedDirectoryIdentity & {
  fd: number;
  parent: string;
  parentIdentity: OwnedDirectoryIdentity;
};

type OwnedAliasIdentity = {
  device: bigint;
  fd: number | null;
  inode: bigint;
  uid: bigint;
  parent: string;
  parentIdentity: OwnedDirectoryIdentity;
  root: string;
};

type AtomicClaimHook = (value: {
  kind: "alias" | "root" | "entry";
  path: string;
}) => void;

function directoryIdentity(path: string): OwnedDirectoryIdentity {
  const stat = lstatSync(path, { bigint: true });
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`owned test temp directory is unsafe: ${path}`);
  }
  return { device: stat.dev, inode: stat.ino, uid: stat.uid };
}

function sameIdentity(
  stat: BigIntStats,
  identity: OwnedDirectoryIdentity,
) {
  return stat.dev === identity.device && stat.ino === identity.inode && stat.uid === identity.uid;
}

function lstatIfPresent(path: string) {
  try {
    return lstatSync(path, { bigint: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

export function normalizeOwnedTempDescriptorTarget(target: string) {
  const normalized = target.replace(/ \(deleted\)$/u, "");
  if (!normalized.startsWith("/")) {
    throw new Error("owned test temp descriptor path is not absolute");
  }
  return normalized;
}

function currentDescriptorPath(fd: number) {
  if (process.platform === "linux") {
    return normalizeOwnedTempDescriptorTarget(readlinkSync(`/proc/self/fd/${fd}`));
  }
  if (process.platform !== "darwin") {
    throw new Error("owned test temp descriptor paths are unsupported on this platform");
  }
  const result = spawnSync("/usr/sbin/lsof", [
    "-a", "-p", String(process.pid), "-d", String(fd), "-Fn",
  ], { encoding: "utf8" });
  if (result.error || result.signal || result.status !== 0) {
    throw new Error("owned test temp descriptor path lookup failed closed");
  }
  const paths = result.stdout.split("\n")
    .filter((line) => line.startsWith("n/"))
    .map((line) => line.slice(1));
  if (paths.length !== 1) throw new Error("owned test temp descriptor path is ambiguous");
  return paths[0];
}

const OWNED_TREE_CLEANUP_SCRIPT = String.raw`
import os, secrets, stat, sys

root_fd = 3
expected_uid = int(sys.argv[1])
records = {}
children = {}

def kind(value):
    if stat.S_ISDIR(value.st_mode): return "directory"
    if stat.S_ISREG(value.st_mode): return "file"
    if stat.S_ISLNK(value.st_mode): return "symlink"
    raise RuntimeError("unsupported owned temp entry")

def identity(value):
    return (value.st_dev, value.st_ino, value.st_uid, kind(value))

def inventory(parent, relative):
    parent_pre = os.fstat(parent)
    if parent_pre.st_uid != expected_uid or not stat.S_ISDIR(parent_pre.st_mode):
        raise RuntimeError("unsafe owned temp directory")
    names = sorted(os.listdir(parent))
    children[relative] = names
    for name in names:
        child_relative = name if not relative else relative + "/" + name
        child = os.stat(name, dir_fd=parent, follow_symlinks=False)
        if child.st_uid != expected_uid or child.st_dev != parent_pre.st_dev:
            raise RuntimeError("owned temp entry escaped owner or device")
        records[child_relative] = identity(child)
        if stat.S_ISDIR(child.st_mode):
            fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
            try: inventory(fd, child_relative)
            finally: os.close(fd)
    if identity(os.fstat(parent)) != identity(parent_pre) or sorted(os.listdir(parent)) != names:
        raise RuntimeError("owned temp inventory changed")

def restore(parent, claimed, original):
    try: os.stat(original, dir_fd=parent, follow_symlinks=False)
    except FileNotFoundError: os.rename(claimed, original, src_dir_fd=parent, dst_dir_fd=parent)

def remove(parent, relative):
    name = relative.rsplit("/", 1)[-1]
    expected = records[relative]
    current = os.stat(name, dir_fd=parent, follow_symlinks=False)
    if identity(current) != expected:
        raise RuntimeError("owned temp entry changed before claim")
    claimed = ".homecook-owned-entry-" + secrets.token_hex(16) + ".tombstone"
    os.rename(name, claimed, src_dir_fd=parent, dst_dir_fd=parent)
    try:
        if identity(os.stat(claimed, dir_fd=parent, follow_symlinks=False)) != expected:
            raise RuntimeError("owned temp claimed entry identity mismatch")
    except BaseException:
        restore(parent, claimed, name)
        raise
    if expected[3] == "directory":
        fd = os.open(claimed, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
        try:
            os.fchmod(fd, 0o700)
            child_names = children[relative]
            if sorted(os.listdir(fd)) != child_names:
                raise RuntimeError("owned temp child set changed")
            for child_name in child_names:
                child = child_name if not relative else relative + "/" + child_name
                remove(fd, child)
            if os.listdir(fd): raise RuntimeError("owned temp cleanup residue")
        finally: os.close(fd)
        os.rmdir(claimed, dir_fd=parent)
    else:
        os.unlink(claimed, dir_fd=parent)

inventory(root_fd, "")
roots = sorted(path for path in records if "/" not in path)
for entry in roots: remove(root_fd, entry)
if os.listdir(root_fd): raise RuntimeError("owned temp root cleanup residue")
`;

const OWNED_TREE_CLEANUP_PYTHON = process.platform === "darwin"
  ? "/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/Resources/Python.app/Contents/MacOS/Python"
  : realpathSync("/usr/bin/python3");

export function createOwnedTempRegistry(options: {
  beforeAtomicClaim?: AtomicClaimHook;
} = {}) {
  const hasAtomicClaimHook = options.beforeAtomicClaim !== undefined;
  const beforeAtomicClaim = options.beforeAtomicClaim ?? (() => undefined);
  const ownedRoots = new Map<string, OwnedRootIdentity>();
  const ownedAliases = new Map<string, OwnedAliasIdentity>();

  const createOwnedTempRoot = (prefix: string, parent = tmpdir()) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*-$/u.test(prefix)) {
      throw new Error(`invalid owned test temp prefix: ${prefix}`);
    }
    const canonicalParent = realpathSync(parent);
    const root = mkdtempSync(join(canonicalParent, prefix));
    chmodSync(root, 0o700);
    const canonicalRoot = realpathSync(root);
    const parentIdentity = directoryIdentity(canonicalParent);
    const fd = openSync(
      canonicalRoot,
      fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
    );
    const opened = fstatSync(fd, { bigint: true });
    if (!opened.isDirectory() || !sameIdentity(opened, directoryIdentity(canonicalRoot))) {
      closeSync(fd);
      throw new Error(`owned test temp root descriptor is unsafe: ${canonicalRoot}`);
    }
    ownedRoots.set(canonicalRoot, {
      ...directoryIdentity(canonicalRoot),
      fd,
      parent: canonicalParent,
      parentIdentity,
    });
    return canonicalRoot;
  };

  const registerOwnedTempAlias = (alias: string, root: string) => {
    const rootIdentity = ownedRoots.get(root);
    if (!rootIdentity) throw new Error(`owned test temp root is not registered: ${root}`);
    const parent = realpathSync(dirname(alias));
    if (parent !== rootIdentity.parent) {
      throw new Error(`owned test temp alias must be a sibling of its root: ${alias}`);
    }
    const stat = lstatSync(alias, { bigint: true });
    if (!stat.isSymbolicLink() || stat.uid !== rootIdentity.uid) {
      throw new Error(`owned test temp alias is unsafe: ${alias}`);
    }
    const target = lstatSync(realpathSync(alias), { bigint: true });
    if (!sameIdentity(target, rootIdentity)) {
      throw new Error(`owned test temp alias target is not the registered root: ${alias}`);
    }
    let fd: number | null = null;
    if (process.platform === "darwin") {
      fd = openSync(alias, fsConstants.O_RDONLY | fsConstants.O_SYMLINK);
      const opened = fstatSync(fd, { bigint: true });
      if (!opened.isSymbolicLink() || opened.dev !== stat.dev || opened.ino !== stat.ino) {
        closeSync(fd);
        throw new Error(`owned test temp alias descriptor is unsafe: ${alias}`);
      }
    }
    ownedAliases.set(alias, {
      device: stat.dev,
      fd,
      inode: stat.ino,
      uid: stat.uid,
      parent,
      parentIdentity: rootIdentity.parentIdentity,
      root,
    });
  };

  const atomicClaim = (
    kind: "alias" | "root",
    registeredPath: string,
    identity: (OwnedAliasIdentity | OwnedRootIdentity),
  ) => {
    beforeAtomicClaim({ kind, path: registeredPath });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const registeredStat = lstatIfPresent(registeredPath);
      const livePath = registeredStat && sameIdentity(registeredStat, identity)
        ? registeredPath
        : identity.fd === null
          ? registeredPath
          : currentDescriptorPath(identity.fd);
      if (dirname(livePath) !== identity.parent) {
        throw new Error(`refusing to clean an owned test temp outside its parent: ${livePath}`);
      }
      const parentPost = lstatSync(identity.parent, { bigint: true });
      if (
        parentPost.isSymbolicLink() || !parentPost.isDirectory()
        || !sameIdentity(parentPost, identity.parentIdentity)
        || realpathSync(identity.parent) !== identity.parent
      ) throw new Error(`refusing to clean through a replaced test temp parent: ${identity.parent}`);
      const liveStat = lstatIfPresent(livePath);
      if (!liveStat) {
        if (identity.fd !== null) {
          const descriptor = fstatSync(identity.fd, { bigint: true });
          if (
            sameIdentity(descriptor, identity)
            && (descriptor.nlink === BigInt(0) || livePath === registeredPath)
          ) return null;
        }
        continue;
      }
      if (!sameIdentity(liveStat, identity)) continue;
      const tombstone = join(
        identity.parent,
        `.homecook-owned-${kind}-${randomUUID()}.tombstone`,
      );
      renameSync(livePath, tombstone);
      const claimed = lstatSync(tombstone, { bigint: true });
      if (sameIdentity(claimed, identity)) return tombstone;
      if (lstatIfPresent(livePath)) {
        throw new Error(`refusing to overwrite a concurrent test temp replacement: ${livePath}`);
      }
      renameSync(tombstone, livePath);
    }
    throw new Error(`refusing to clean a replaced test temp ${kind}: ${registeredPath}`);
  };

  const cleanupOwnedTempAlias = (alias: string) => {
    const identity = ownedAliases.get(alias);
    if (!identity) return;
    const claimed = atomicClaim("alias", alias, identity);
    if (claimed) unlinkSync(claimed);
    if (identity.fd !== null) closeSync(identity.fd);
    ownedAliases.delete(alias);
  };

  const claimNestedEntry = (path: string, owner: OwnedDirectoryIdentity) => {
    const identity = lstatSync(path, { bigint: true });
    if (identity.dev !== owner.device || identity.uid !== owner.uid) {
      throw new Error(`owned test temp nested entry escaped its device or owner: ${path}`);
    }
    beforeAtomicClaim({ kind: "entry", path });
    const tombstone = join(dirname(path), `.homecook-owned-entry-${randomUUID()}.tombstone`);
    renameSync(path, tombstone);
    const claimed = lstatSync(tombstone, { bigint: true });
    if (
      claimed.dev !== identity.dev || claimed.ino !== identity.ino
      || claimed.uid !== identity.uid || claimed.mode !== identity.mode
    ) {
      if (lstatIfPresent(path)) {
        throw new Error(`refusing to overwrite a concurrent nested replacement: ${path}`);
      }
      renameSync(tombstone, path);
      throw new Error(`refusing to clean a replaced nested temp entry: ${path}`);
    }
    return { identity, tombstone };
  };

  const removeClaimedTree = (path: string, owner: OwnedDirectoryIdentity): void => {
    const claimed = lstatSync(path, { bigint: true });
    if (claimed.dev !== owner.device || claimed.uid !== owner.uid) {
      throw new Error(`owned test temp claimed entry escaped its device or owner: ${path}`);
    }
    if (claimed.isSymbolicLink() || !claimed.isDirectory()) {
      unlinkSync(path);
      return;
    }
    const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
    try {
      const opened = fstatSync(fd, { bigint: true });
      if (!sameIdentity(opened, { device: claimed.dev, inode: claimed.ino, uid: claimed.uid })) {
        throw new Error(`owned test temp nested directory descriptor is unsafe: ${path}`);
      }
      fchmodSync(fd, 0o700);
      const descriptorPath = path;
      for (const name of readdirSync(descriptorPath)) {
        const entry = claimNestedEntry(join(descriptorPath, name), owner);
        removeClaimedTree(entry.tombstone, owner);
      }
      const after = fstatSync(fd, { bigint: true });
      if (!sameIdentity(after, { device: claimed.dev, inode: claimed.ino, uid: claimed.uid })) {
        throw new Error(`owned test temp nested directory changed during cleanup: ${path}`);
      }
    } finally {
      closeSync(fd);
    }
    rmdirSync(path);
  };

  const cleanupOwnedTempRoot = (root: string) => {
    const identity = ownedRoots.get(root);
    if (!identity) return;
    for (const [alias, aliasIdentity] of [...ownedAliases]) {
      if (aliasIdentity.root === root) cleanupOwnedTempAlias(alias);
    }
    const claimed = atomicClaim("root", root, identity);
    if (!claimed) {
      closeSync(identity.fd);
      ownedRoots.delete(root);
      return;
    }
    try {
      fchmodSync(identity.fd, 0o700);
      if (!hasAtomicClaimHook) {
        const cleanup = spawnSync(OWNED_TREE_CLEANUP_PYTHON, [
          "-I", "-c", OWNED_TREE_CLEANUP_SCRIPT, String(identity.uid),
        ], {
          encoding: "utf8",
          env: { NODE_ENV: "test", PATH: "/usr/bin:/bin" },
          shell: false,
          stdio: ["ignore", "pipe", "pipe", identity.fd],
          timeout: 60_000,
        });
        if (cleanup.error || cleanup.signal || cleanup.status !== 0) {
          throw new Error("owned test temp descriptor cleanup failed closed");
        }
      } else {
        for (const name of readdirSync(currentDescriptorPath(identity.fd))) {
          const entry = claimNestedEntry(join(claimed, name), identity);
          removeClaimedTree(entry.tombstone, identity);
        }
      }
      rmdirSync(claimed);
    } catch (error) {
      if (!lstatIfPresent(root) && lstatIfPresent(claimed)) renameSync(claimed, root);
      throw error;
    }
    if (existsSync(claimed)) throw new Error(`test temp root cleanup remained incomplete: ${claimed}`);
    closeSync(identity.fd);
    ownedRoots.delete(root);
  };

  const cleanupOwnedTempRoots = () => {
    for (const alias of [...ownedAliases.keys()].reverse()) cleanupOwnedTempAlias(alias);
    for (const root of [...ownedRoots.keys()].reverse()) cleanupOwnedTempRoot(root);
  };

  const withOwnedTempRoot = async <T>(
    prefix: string,
    callback: (root: string) => T | Promise<T>,
    parent = tmpdir(),
  ) => {
    const root = createOwnedTempRoot(prefix, parent);
    try {
      return await callback(root);
    } finally {
      cleanupOwnedTempRoot(root);
    }
  };

  return Object.freeze({
    cleanupOwnedTempRoot,
    cleanupOwnedTempRoots,
    createOwnedTempRoot,
    registerOwnedTempAlias,
    withOwnedTempRoot,
  });
}

export type OwnedTempRegistry = ReturnType<typeof createOwnedTempRegistry>;
