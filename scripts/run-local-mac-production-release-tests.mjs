import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { collectReleaseTestInventory } from "./lib/local-mac-production-release-test-inventory.mjs";

const inventory = collectReleaseTestInventory();
const vitest = resolve("node_modules/vitest/vitest.mjs");
process.stdout.write(`RELEASE_TEST_FILES=${inventory.fileCount}\n`);
process.stdout.write(`RELEASE_TEST_CASES=${inventory.testCount}\n`);
process.stdout.write(`RELEASE_TEST_INVENTORY_SHA256=${inventory.inventorySha256}\n`);
if (process.argv.slice(2).length > 0) {
  if (process.argv.length === 3 && process.argv[2] === "--list-only") process.exit(0);
  throw new Error("unknown local Mac production release test runner argument");
}

const run = spawnSync(process.execPath, [vitest, "run", ...inventory.files], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});
if (run.error || run.signal || run.status !== 0) process.exit(run.status ?? 1);
