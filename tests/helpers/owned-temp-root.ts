import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import type { BigIntStats } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

type OwnedDirectoryIdentity = {
  device: bigint;
  inode: bigint;
  uid: bigint;
};

type OwnedRootIdentity = OwnedDirectoryIdentity & {
  parent: string;
  parentIdentity: OwnedDirectoryIdentity;
};

type OwnedAliasIdentity = {
  device: bigint;
  inode: bigint;
  uid: bigint;
  parent: string;
  parentIdentity: OwnedDirectoryIdentity;
  root: string;
};

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

function makeOwnedTreeDirectoriesWritable(root: string) {
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return;
  chmodSync(root, 0o700);
  for (const name of readdirSync(root)) {
    makeOwnedTreeDirectoriesWritable(join(root, name));
  }
}

export function createOwnedTempRegistry() {
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
    ownedRoots.set(canonicalRoot, {
      ...directoryIdentity(canonicalRoot),
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
    ownedAliases.set(alias, {
      device: stat.dev,
      inode: stat.ino,
      uid: stat.uid,
      parent,
      parentIdentity: rootIdentity.parentIdentity,
      root,
    });
  };

  const cleanupOwnedTempAlias = (alias: string) => {
    const identity = ownedAliases.get(alias);
    if (!identity) return;
    const parentPost = lstatSync(identity.parent, { bigint: true });
    let aliasPost;
    try {
      aliasPost = lstatSync(alias, { bigint: true });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        ownedAliases.delete(alias);
        return;
      }
      throw error;
    }
    if (
      parentPost.isSymbolicLink() || !parentPost.isDirectory()
      || !sameIdentity(parentPost, identity.parentIdentity)
      || !aliasPost.isSymbolicLink()
      || aliasPost.dev !== identity.device || aliasPost.ino !== identity.inode || aliasPost.uid !== identity.uid
    ) throw new Error(`refusing to clean a replaced test temp alias: ${alias}`);
    unlinkSync(alias);
    ownedAliases.delete(alias);
  };

  const cleanupOwnedTempRoot = (root: string) => {
    const identity = ownedRoots.get(root);
    if (!identity) return;
    for (const [alias, aliasIdentity] of [...ownedAliases]) {
      if (aliasIdentity.root === root) cleanupOwnedTempAlias(alias);
    }
    const parentPost = lstatSync(identity.parent, { bigint: true });
    if (
      parentPost.isSymbolicLink() || !parentPost.isDirectory()
      || !sameIdentity(parentPost, identity.parentIdentity)
      || realpathSync(identity.parent) !== identity.parent
    ) throw new Error(`refusing to clean through a replaced test temp parent: ${identity.parent}`);

    const entries = readdirSync(identity.parent).map((name) => join(identity.parent, name));
    const ownedPaths = entries.filter((path) => {
      const stat = lstatIfPresent(path);
      if (!stat) return false;
      return !stat.isSymbolicLink() && stat.isDirectory() && sameIdentity(stat, identity);
    });
    if (ownedPaths.length === 0) {
      ownedRoots.delete(root);
      return;
    }
    if (ownedPaths.length !== 1) {
      throw new Error(`owned test temp inode has multiple directory names: ${root}`);
    }
    const ownedPath = ownedPaths[0];

    makeOwnedTreeDirectoriesWritable(ownedPath);
    const afterChmod = lstatSync(ownedPath, { bigint: true });
    if (!sameIdentity(afterChmod, identity)) {
      throw new Error(`test temp root identity changed before cleanup: ${ownedPath}`);
    }
    rmSync(ownedPath, { recursive: true, force: false, maxRetries: 2, retryDelay: 10 });
    if (existsSync(ownedPath)) throw new Error(`test temp root cleanup remained incomplete: ${ownedPath}`);
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
