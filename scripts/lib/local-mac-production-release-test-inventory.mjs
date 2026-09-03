import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";

export const RELEASE_TEST_SCOPE_PATH = "scripts/config/local-mac-production-release-test-scope.json";

function readScope(rootDir, scopePath) {
  const scope = JSON.parse(readFileSync(resolve(rootDir, scopePath), "utf8"));
  if (
    scope?.schema !== "homecook.local-mac-production-release-test-scope.v1"
    || scope.original_file_count !== 26
    || !Array.isArray(scope.files)
    || scope.files.length !== 28
    || new Set(scope.files).size !== scope.files.length
    || scope.files.some((file) => (
      typeof file !== "string"
      || !file.startsWith("tests/")
      || !existsSync(resolve(rootDir, file))
    ))
  ) throw new Error("local Mac production release test scope is invalid");
  return scope;
}

function withOccurrence(tests) {
  const counts = new Map();
  return tests.map((test) => {
    const key = `${test.file}\0${test.name}`;
    const occurrence = counts.get(key) ?? 0;
    counts.set(key, occurrence + 1);
    return { ...test, occurrence };
  });
}

function collect(rootDir, files, env) {
  const vitest = resolve(rootDir, "node_modules/vitest/vitest.mjs");
  const list = spawnSync(process.execPath, [vitest, "list", ...files, "--json"], {
    cwd: rootDir,
    encoding: "utf8",
    env,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (list.error || list.signal || list.status !== 0) {
    throw new Error("local Mac production release test inventory failed");
  }
  const jsonStart = list.stdout.indexOf("[");
  if (jsonStart < 0) throw new Error("local Mac production release test inventory was malformed");
  return JSON.parse(list.stdout.slice(jsonStart));
}

export function digestReleaseTestInventory(normalizedTests) {
  return createHash("sha256")
    .update(JSON.stringify(normalizedTests.map(
      (test) => `${test.file}\0${test.name}\0${test.occurrence}`,
    ).sort()))
    .digest("hex");
}

export function normalizeReleaseTestInventory(tests) {
  return [...tests].sort((left, right) => (
    String(left.file).localeCompare(String(right.file))
    || String(left.name).localeCompare(String(right.name))
    || left.occurrence - right.occurrence
  ));
}

export function collectReleaseTestInventory({
  rootDir = process.cwd(),
  scopePath = RELEASE_TEST_SCOPE_PATH,
  env = process.env,
} = {}) {
  const scope = readScope(rootDir, scopePath);
  const tests = [
    ...withOccurrence(collect(rootDir, scope.files, {
      ...env,
      HOMECOOK_VITEST_TEARDOWN_FIXTURE_MODE: "inventory",
    })),
    ...withOccurrence(collect(rootDir, scope.files, {
      ...env,
      HOMECOOK_RUN_ACTUAL_RELEASE_BUILD: "1",
    })),
  ].filter((test, index, all) => all.findIndex((candidate) => (
    candidate.file === test.file
    && candidate.name === test.name
    && candidate.occurrence === test.occurrence
  )) === index);
  const rootPrefix = `${resolve(rootDir)}${sep}`;
  const normalizedTests = normalizeReleaseTestInventory(tests.map((test) => ({
    file: String(test.file).startsWith(rootPrefix)
      ? String(test.file).slice(rootPrefix.length).split(sep).join("/")
      : null,
    name: test.name,
    occurrence: test.occurrence,
  })));
  if (
    normalizedTests.length === 0
    || normalizedTests.some((test) => (
      !scope.files.includes(test.file)
      || typeof test.name !== "string"
      || !Number.isSafeInteger(test.occurrence)
      || test.occurrence < 0
    ))
    || new Set(normalizedTests.map((test) => test.file)).size !== scope.files.length
  ) throw new Error("local Mac production release test inventory did not cover the exact scope");
  return Object.freeze({
    fileCount: scope.files.length,
    files: Object.freeze([...scope.files]),
    inventorySha256: digestReleaseTestInventory(normalizedTests),
    testCount: normalizedTests.length,
    tests: Object.freeze(normalizedTests),
  });
}
