import { lstatSync, mkdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { createOwnedTempRegistry } from "./owned-temp-root";

const SIGNALS = ["SIGHUP", "SIGINT", "SIGTERM"] as const;
const ownerState = globalThis as typeof globalThis & {
  __homecookVitestSuiteTempOwner?: boolean;
};

export function establishOwnedVitestSuiteTemp() {
  if (ownerState.__homecookVitestSuiteTempOwner) return;
  if (process.env.HOMECOOK_VITEST_SUITE_TEMP_ROOT !== undefined) {
    throw new Error("refusing a pre-existing Vitest suite temp authority");
  }
  const originalTmpdir = process.env.TMPDIR;
  const registry = createOwnedTempRegistry();
  const suiteParent = join(realpathSync(homedir()), ".cache", "hcv");
  mkdirSync(suiteParent, { recursive: true, mode: 0o700 });
  const canonicalSuiteParent = realpathSync(suiteParent);
  const parentStat = lstatSync(canonicalSuiteParent);
  if (
    parentStat.isSymbolicLink() || !parentStat.isDirectory()
    || parentStat.uid !== process.getuid?.() || (parentStat.mode & 0o777) !== 0o700
  ) throw new Error("Vitest suite temp parent is not a private current-user directory");
  const suiteRoot = registry.createOwnedTempRoot("r-", canonicalSuiteParent);
  let cleaned = false;

  process.env.TMPDIR = suiteRoot;
  process.env.HOMECOOK_VITEST_SUITE_TEMP_ROOT = suiteRoot;
  ownerState.__homecookVitestSuiteTempOwner = true;
  process.stdout.write(`VITEST_SUITE_TEMP_ROOT=${suiteRoot}\n`);

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    registry.cleanupOwnedTempRoot(suiteRoot);
    delete ownerState.__homecookVitestSuiteTempOwner;
    delete process.env.HOMECOOK_VITEST_SUITE_TEMP_ROOT;
    if (originalTmpdir === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = originalTmpdir;
  };
  process.once("exit", cleanup);
  for (const signal of SIGNALS) {
    const handler = () => {
      try {
        cleanup();
      } finally {
        process.removeAllListeners(signal);
        process.kill(process.pid, signal);
      }
    };
    process.prependOnceListener(signal, handler);
  }
}
