import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  rmSync,
  renameSync,
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
  kind: "alias" | "root";
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

function makeOwnedTreeDirectoriesWritable(
  root: string,
  identity: OwnedDirectoryIdentity,
) {
  const stat = lstatSync(root, { bigint: true });
  if (stat.dev !== identity.device || stat.uid !== identity.uid) {
    throw new Error(`owned test temp child escaped its device or owner: ${root}`);
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) return;
  chmodSync(root, 0o700);
  for (const name of readdirSync(root)) {
    makeOwnedTreeDirectoriesWritable(join(root, name), identity);
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

export function createOwnedTempRegistry({
  beforeAtomicClaim = () => undefined,
}: {
  beforeAtomicClaim?: AtomicClaimHook;
} = {}) {
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
    makeOwnedTreeDirectoriesWritable(claimed, identity);
    const afterChmod = lstatSync(claimed, { bigint: true });
    if (!sameIdentity(afterChmod, identity)) {
      throw new Error(`test temp root identity changed before cleanup: ${claimed}`);
    }
    rmSync(claimed, { recursive: true, force: false, maxRetries: 2, retryDelay: 10 });
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
