import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ownedRoots = new Map<string, { device: bigint; inode: bigint }>();

export function createOwnedTempRoot(prefix: string, parent = tmpdir()) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*-$/u.test(prefix)) {
    throw new Error(`invalid owned test temp prefix: ${prefix}`);
  }
  const canonicalParent = realpathSync(parent);
  const root = mkdtempSync(join(canonicalParent, prefix));
  chmodSync(root, 0o700);
  const canonicalRoot = realpathSync(root);
  const stat = lstatSync(canonicalRoot, { bigint: true });
  ownedRoots.set(canonicalRoot, { device: stat.dev, inode: stat.ino });
  return canonicalRoot;
}

function makeOwnedTreeDirectoriesWritable(root: string) {
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return;
  chmodSync(root, 0o700);
  for (const name of readdirSync(root)) {
    makeOwnedTreeDirectoriesWritable(join(root, name));
  }
}

export function cleanupOwnedTempRoot(root: string) {
  const identity = ownedRoots.get(root);
  if (!identity) return;
  if (!existsSync(root)) {
    ownedRoots.delete(root);
    return;
  }
  const before = lstatSync(root, { bigint: true });
  if (
    before.isSymbolicLink() || !before.isDirectory()
    || before.dev !== identity.device || before.ino !== identity.inode
    || realpathSync(root) !== root
  ) throw new Error(`refusing to clean replaced test temp root: ${root}`);
  makeOwnedTreeDirectoriesWritable(root);
  const afterChmod = lstatSync(root, { bigint: true });
  if (afterChmod.dev !== identity.device || afterChmod.ino !== identity.inode) {
    throw new Error(`test temp root identity changed before cleanup: ${root}`);
  }
  rmSync(root, { recursive: true, force: false, maxRetries: 2, retryDelay: 10 });
  if (existsSync(root)) throw new Error(`test temp root cleanup remained incomplete: ${root}`);
  ownedRoots.delete(root);
}

export function cleanupOwnedTempRoots() {
  for (const root of [...ownedRoots.keys()].reverse()) cleanupOwnedTempRoot(root);
}

export async function withOwnedTempRoot<T>(
  prefix: string,
  callback: (root: string) => T | Promise<T>,
  parent = tmpdir(),
) {
  const root = createOwnedTempRoot(prefix, parent);
  try {
    return await callback(root);
  } finally {
    cleanupOwnedTempRoot(root);
  }
}
