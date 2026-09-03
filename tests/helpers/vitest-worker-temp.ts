import { chmodSync, lstatSync, mkdtempSync, realpathSync } from "node:fs";
import { join } from "node:path";

const suiteRoot = process.env.HOMECOOK_VITEST_SUITE_TEMP_ROOT;
const workerId = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID;
if (!suiteRoot || realpathSync(suiteRoot) !== suiteRoot) {
  throw new Error("Vitest worker received no canonical suite temp root");
}
if (!workerId || !/^\d+$/u.test(workerId)) {
  throw new Error("Vitest worker identity is unavailable");
}

const suiteStat = lstatSync(suiteRoot, { bigint: true });
const workerRoot = realpathSync(mkdtempSync(join(suiteRoot, `w${workerId}-`)));
chmodSync(workerRoot, 0o700);
const workerStat = lstatSync(workerRoot, { bigint: true });
if (
  workerStat.isSymbolicLink() || !workerStat.isDirectory()
  || workerStat.uid !== BigInt(process.getuid?.() ?? -1)
  || workerStat.dev !== suiteStat.dev
  || Number(workerStat.mode & BigInt(0o777)) !== 0o700
) throw new Error("Vitest worker temp root is not private and suite-owned");

process.env.TMPDIR = workerRoot;
process.env.HOMECOOK_VITEST_WORKER_TEMP_ROOT = workerRoot;
