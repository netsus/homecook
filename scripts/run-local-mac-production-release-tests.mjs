import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const scopePath = resolve("scripts/config/local-mac-production-release-test-scope.json");
const scope = JSON.parse(readFileSync(scopePath, "utf8"));
if (
  scope?.schema !== "homecook.local-mac-production-release-test-scope.v1"
  || scope.original_file_count !== 26
  || !Array.isArray(scope.files) || scope.files.length !== 28
  || new Set(scope.files).size !== scope.files.length
  || scope.files.some((file) => typeof file !== "string" || !file.startsWith("tests/") || !existsSync(file))
) throw new Error("local Mac production release test scope is invalid");

const vitest = resolve("node_modules/vitest/vitest.mjs");
const collect = (env) => {
  const list = spawnSync(process.execPath, [vitest, "list", ...scope.files, "--json"], {
    cwd: process.cwd(), encoding: "utf8", env, maxBuffer: 16 * 1024 * 1024,
  });
  if (list.error || list.signal || list.status !== 0) {
    throw new Error("local Mac production release test inventory failed");
  }
  const jsonStart = list.stdout.indexOf("[");
  if (jsonStart < 0) throw new Error("local Mac production release test inventory was malformed");
  return JSON.parse(list.stdout.slice(jsonStart));
};
const withOccurrence = (tests) => {
  const counts = new Map();
  return tests.map((test) => {
    const key = `${test.file}\0${test.name}`;
    const occurrence = counts.get(key) ?? 0;
    counts.set(key, occurrence + 1);
    return { ...test, occurrence };
  });
};
const tests = [
  ...withOccurrence(collect({ ...process.env, HOMECOOK_VITEST_TEARDOWN_FIXTURE_MODE: "inventory" })),
  ...withOccurrence(collect({ ...process.env, HOMECOOK_RUN_ACTUAL_RELEASE_BUILD: "1" })),
].filter((test, index, all) => all.findIndex((candidate) => (
  candidate.file === test.file && candidate.name === test.name && candidate.occurrence === test.occurrence
)) === index);
const root = `${process.cwd()}/`;
const normalized = tests.map((test) => ({
  file: String(test.file).startsWith(root) ? String(test.file).slice(root.length) : null,
  name: test.name,
  occurrence: test.occurrence,
}));
if (
  normalized.length === 0
  || normalized.some((test) => !scope.files.includes(test.file) || typeof test.name !== "string")
  || new Set(normalized.map((test) => test.file)).size !== scope.files.length
) throw new Error("local Mac production release test inventory did not cover the exact scope");
const inventoryDigest = createHash("sha256")
  .update(JSON.stringify(normalized.map((test) => `${test.file}\0${test.name}\0${test.occurrence}`).sort()))
  .digest("hex");
process.stdout.write(`RELEASE_TEST_FILES=${scope.files.length}\n`);
process.stdout.write(`RELEASE_TEST_CASES=${normalized.length}\n`);
process.stdout.write(`RELEASE_TEST_INVENTORY_SHA256=${inventoryDigest}\n`);
if (process.argv.slice(2).length > 0) {
  if (process.argv.length === 3 && process.argv[2] === "--list-only") process.exit(0);
  throw new Error("unknown local Mac production release test runner argument");
}

const run = spawnSync(process.execPath, [vitest, "run", ...scope.files], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});
if (run.error || run.signal || run.status !== 0) process.exit(run.status ?? 1);
