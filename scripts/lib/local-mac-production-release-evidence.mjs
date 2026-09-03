import { createHash } from "node:crypto";

import { canonicalizeJcs } from "./rfc8785-jcs.mjs";

export const RELEASE_EVIDENCE_NOTE_REF = "refs/notes/homecook-release-evidence";
export const RELEASE_EVIDENCE_COMMANDS = Object.freeze(new Map([
  ["release-suite", ["pnpm", "test:local-mac-production-release"]],
  ["actual-build", [
    "env", "HOMECOOK_RUN_ACTUAL_RELEASE_BUILD=1", "pnpm", "exec", "vitest", "run",
    "tests/local-mac-production-rehearsal-candidate.test.ts", "-t",
    "runs offline pnpm install and a real Next production build inside the exact macOS build-work sandbox",
  ]],
]));

const keys = (value) => Object.keys(value).sort().join(",");

export function assertExactKeys(value, expected, label) {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || keys(value) !== [...expected].sort().join(",")
  ) throw new Error(`${label} shape is invalid`);
}

export function sha256Jcs(value) {
  return createHash("sha256").update(canonicalizeJcs(value)).digest("hex");
}

function stripAnsi(value) {
  return value.replace(/[\u001b\u009b][[\]()#;?]*(?:(?:(?:[\dA-PR-TZcf-nq-uy=><~]|[\dA-PR-TZcf-nq-uy=><~](?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/gu, "");
}

function parseVitestSummary(source) {
  const text = stripAnsi(source);
  const lines = text.split(/\r?\n/u);
  const fileLines = lines.filter((line) => /^\s*Test Files\s+/u.test(line));
  const testLines = lines.filter((line) => /^\s*Tests\s+/u.test(line));
  if (fileLines.length !== 1 || testLines.length !== 1) {
    throw new Error("release command output must contain one Vitest summary");
  }
  const parseLine = (line, label) => {
    const totalMatch = line.match(/\((\d+)\)\s*$/u);
    if (!totalMatch) throw new Error(`${label} Vitest total is missing`);
    const count = (status) => {
      const match = line.match(new RegExp(`(?:^|\\s)(\\d+)\\s+${status}(?:\\s|$)`, "u"));
      return match ? Number(match[1]) : 0;
    };
    const total = Number(totalMatch[1]);
    const passed = count("passed");
    const skipped = count("skipped");
    const failed = count("failed");
    if (![total, passed, skipped, failed].every(Number.isSafeInteger)
      || total !== passed + skipped + failed) {
      throw new Error(`${label} Vitest summary is inconsistent`);
    }
    return { total, passed, skipped, failed };
  };
  return {
    files: parseLine(fileLines[0], "test files"),
    tests: parseLine(testLines[0], "tests"),
    text,
  };
}

export function parseReleaseSuiteOutput(source) {
  const summary = parseVitestSummary(source);
  const header = (name) => {
    const matches = [...summary.text.matchAll(new RegExp(`^${name}=([^\\r\\n]+)$`, "gmu"))];
    if (matches.length !== 1) throw new Error(`release suite ${name} header is invalid`);
    return matches[0][1];
  };
  const fileCount = Number(header("RELEASE_TEST_FILES"));
  const testCount = Number(header("RELEASE_TEST_CASES"));
  const inventorySha256 = header("RELEASE_TEST_INVENTORY_SHA256");
  if (
    !Number.isSafeInteger(fileCount)
    || fileCount <= 0
    || !Number.isSafeInteger(testCount)
    || testCount <= 0
    || !/^[0-9a-f]{64}$/u.test(inventorySha256)
  ) throw new Error("release suite inventory header is invalid");
  return Object.freeze({
    schema: "homecook.local-mac-production-release-stdout-projection.v1",
    kind: "release-suite",
    release_test_files: fileCount,
    release_test_cases: testCount,
    release_test_inventory_sha256: inventorySha256,
    vitest_test_files: summary.files.total,
    vitest_test_files_passed: summary.files.passed,
    vitest_test_files_failed: summary.files.failed,
    vitest_tests: summary.tests.total,
    vitest_passed: summary.tests.passed,
    vitest_skipped: summary.tests.skipped,
    vitest_failed: summary.tests.failed,
  });
}

export function parseActualBuildOutput(source) {
  const summary = parseVitestSummary(source);
  const selectedTestFile = "tests/local-mac-production-rehearsal-candidate.test.ts";
  const selectedTestName = RELEASE_EVIDENCE_COMMANDS.get("actual-build").at(-1);
  if (!summary.text.includes(selectedTestFile) || !summary.text.includes(selectedTestName)) {
    throw new Error("actual build output does not identify the selected test");
  }
  return Object.freeze({
    schema: "homecook.local-mac-production-release-stdout-projection.v1",
    kind: "actual-build",
    selected_test_file: selectedTestFile,
    selected_test_name: selectedTestName,
    vitest_test_files: summary.files.total,
    vitest_test_files_passed: summary.files.passed,
    vitest_test_files_failed: summary.files.failed,
    vitest_tests: summary.tests.total,
    vitest_passed: summary.tests.passed,
    vitest_skipped: summary.tests.skipped,
    vitest_failed: summary.tests.failed,
  });
}

export function buildLocalMacProductionReleaseEvidence({
  headSha,
  treeSha,
  platform,
  inventory,
  releaseSuite,
  actualBuild,
  residue,
}) {
  if (!/^[0-9a-f]{40}$/u.test(headSha) || !/^[0-9a-f]{40}$/u.test(treeSha)) {
    throw new Error("release evidence Git identity is invalid");
  }
  if (platform !== "darwin-arm64") throw new Error("release evidence platform is invalid");
  const executions = new Map([
    ["release-suite", { execution: releaseSuite, parse: parseReleaseSuiteOutput }],
    ["actual-build", { execution: actualBuild, parse: parseActualBuildOutput }],
  ]);
  const commands = [];
  for (const [id, { execution, parse }] of executions) {
    if (
      typeof execution?.stdout !== "string"
      || execution.stderr !== ""
      || execution.status !== 0
      || execution.signal !== null
      || !Number.isSafeInteger(execution.durationMs)
      || execution.durationMs <= 0
    ) throw new Error(`${id} execution did not produce clean successful evidence`);
    const stdoutProjection = parse(execution.stdout);
    const stderrProjection = Object.freeze({
      schema: "homecook.local-mac-production-release-stderr-projection.v1",
      kind: id,
      empty: true,
    });
    commands.push(Object.freeze({
      id,
      argv: RELEASE_EVIDENCE_COMMANDS.get(id),
      cwd: "<repository>",
      status: execution.status,
      signal: execution.signal,
      duration_ms: execution.durationMs,
      stdout_projection: stdoutProjection,
      stderr_projection: stderrProjection,
      stdout_sha256: sha256Jcs(stdoutProjection),
      stderr_sha256: sha256Jcs(stderrProjection),
    }));
  }
  const releaseProjection = commands[0].stdout_projection;
  const unsigned = {
    schema: "homecook.local-mac-production-release-evidence.v2",
    repository: "netsus/homecook",
    head_sha: headSha,
    tree_sha: treeSha,
    platform,
    commands,
    release_suite: {
      file_count: releaseProjection.release_test_files,
      test_count: releaseProjection.release_test_cases,
      passed: releaseProjection.vitest_passed,
      skipped: releaseProjection.vitest_skipped,
      failed: releaseProjection.vitest_failed,
      inventory_sha256: releaseProjection.release_test_inventory_sha256,
    },
    residue,
    secrets_redacted: true,
  };
  const evidence = Object.freeze({ ...unsigned, evidence_digest: sha256Jcs(unsigned) });
  validateLocalMacProductionReleaseEvidence(evidence, {
    expectedHeadSha: headSha,
    expectedTreeSha: treeSha,
    inventory,
  });
  return evidence;
}

export function validateLocalMacProductionReleaseEvidence(evidence, {
  expectedHeadSha,
  expectedTreeSha,
  inventory,
}) {
  assertExactKeys(evidence, [
    "schema", "repository", "head_sha", "tree_sha", "platform", "commands",
    "release_suite", "residue", "secrets_redacted", "evidence_digest",
  ], "release evidence");
  const serialized = canonicalizeJcs(evidence);
  if (/(authorization|bearer|cookie|password|secret|service_role|token)[=:]/iu.test(serialized)) {
    throw new Error("release evidence contains a secret-shaped value");
  }
  if (
    evidence.schema !== "homecook.local-mac-production-release-evidence.v2"
    || evidence.repository !== "netsus/homecook"
    || evidence.head_sha !== expectedHeadSha
    || evidence.tree_sha !== expectedTreeSha
    || evidence.platform !== "darwin-arm64"
    || evidence.secrets_redacted !== true
  ) throw new Error("release evidence authority does not match the current macOS head");
  if (!Array.isArray(evidence.commands) || evidence.commands.length !== 2) {
    throw new Error("release evidence must contain the suite and actual build commands");
  }
  if (new Set(evidence.commands.map((command) => command.id)).size !== RELEASE_EVIDENCE_COMMANDS.size) {
    throw new Error("release evidence command identities are duplicated");
  }
  for (const command of evidence.commands) {
    assertExactKeys(command, [
      "id", "argv", "cwd", "status", "signal", "duration_ms",
      "stdout_projection", "stderr_projection", "stdout_sha256", "stderr_sha256",
    ], "release command");
    if (
      !RELEASE_EVIDENCE_COMMANDS.has(command.id)
      || !Array.isArray(command.argv)
      || command.argv.some((value) => typeof value !== "string")
      || canonicalizeJcs(command.argv) !== canonicalizeJcs(RELEASE_EVIDENCE_COMMANDS.get(command.id))
      || command.cwd !== "<repository>"
      || command.status !== 0
      || command.signal !== null
      || !Number.isSafeInteger(command.duration_ms)
      || command.duration_ms <= 0
      || !/^[0-9a-f]{64}$/u.test(command.stdout_sha256)
      || !/^[0-9a-f]{64}$/u.test(command.stderr_sha256)
    ) throw new Error("release command evidence is invalid");
    if (command.stdout_sha256 !== sha256Jcs(command.stdout_projection)) {
      throw new Error(`${command.id} stdout projection digest is invalid`);
    }
    if (command.stderr_sha256 !== sha256Jcs(command.stderr_projection)) {
      throw new Error(`${command.id} stderr projection digest is invalid`);
    }
    assertExactKeys(command.stderr_projection, ["schema", "kind", "empty"], "stderr projection");
    if (
      command.stderr_projection.schema
        !== "homecook.local-mac-production-release-stderr-projection.v1"
      || command.stderr_projection.kind !== command.id
      || command.stderr_projection.empty !== true
    ) throw new Error(`${command.id} stderr projection is invalid`);
  }
  assertExactKeys(evidence.release_suite, [
    "file_count", "test_count", "passed", "skipped", "failed", "inventory_sha256",
  ], "release suite");
  if (
    evidence.release_suite.file_count !== inventory.fileCount
    || evidence.release_suite.test_count !== evidence.release_suite.passed + evidence.release_suite.skipped
    || evidence.release_suite.failed !== 0
    || evidence.release_suite.inventory_sha256 !== inventory.inventorySha256
  ) throw new Error("release suite inventory evidence is invalid");
  if (
    evidence.release_suite.test_count !== inventory.testCount
    || evidence.release_suite.passed + evidence.release_suite.skipped !== inventory.testCount
  ) throw new Error("release suite totals do not match the exact repaired inventory");
  const commands = new Map(evidence.commands.map((command) => [command.id, command]));
  const releaseProjection = commands.get("release-suite").stdout_projection;
  assertExactKeys(releaseProjection, [
    "schema", "kind", "release_test_files", "release_test_cases",
    "release_test_inventory_sha256", "vitest_test_files", "vitest_test_files_passed",
    "vitest_test_files_failed", "vitest_tests", "vitest_passed", "vitest_skipped",
    "vitest_failed",
  ], "release suite stdout projection");
  if (
    releaseProjection.schema !== "homecook.local-mac-production-release-stdout-projection.v1"
    || releaseProjection.kind !== "release-suite"
    || releaseProjection.release_test_files !== evidence.release_suite.file_count
    || releaseProjection.release_test_cases !== evidence.release_suite.test_count
    || releaseProjection.release_test_inventory_sha256 !== evidence.release_suite.inventory_sha256
    || releaseProjection.vitest_test_files !== evidence.release_suite.file_count
    || releaseProjection.vitest_test_files_passed !== evidence.release_suite.file_count
    || releaseProjection.vitest_test_files_failed !== 0
    || releaseProjection.vitest_tests !== evidence.release_suite.test_count
    || releaseProjection.vitest_passed !== evidence.release_suite.passed
    || releaseProjection.vitest_skipped !== evidence.release_suite.skipped
    || releaseProjection.vitest_failed !== evidence.release_suite.failed
  ) throw new Error("release suite stdout projection does not match release evidence");
  const actualProjection = commands.get("actual-build").stdout_projection;
  assertExactKeys(actualProjection, [
    "schema", "kind", "selected_test_file", "selected_test_name", "vitest_test_files",
    "vitest_test_files_passed", "vitest_test_files_failed", "vitest_tests", "vitest_passed",
    "vitest_skipped", "vitest_failed",
  ], "actual build stdout projection");
  if (
    actualProjection.schema !== "homecook.local-mac-production-release-stdout-projection.v1"
    || actualProjection.kind !== "actual-build"
    || actualProjection.selected_test_file !== "tests/local-mac-production-rehearsal-candidate.test.ts"
    || actualProjection.selected_test_name !== RELEASE_EVIDENCE_COMMANDS.get("actual-build").at(-1)
    || actualProjection.vitest_test_files !== 1
    || actualProjection.vitest_test_files_passed !== 1
    || actualProjection.vitest_test_files_failed !== 0
    || actualProjection.vitest_tests !== 1
    || actualProjection.vitest_passed !== 1
    || actualProjection.vitest_skipped !== 0
    || actualProjection.vitest_failed !== 0
  ) throw new Error("actual build stdout projection does not prove the selected build test");
  assertExactKeys(evidence.residue, [
    "suite_roots", "homecook_system_temp", "hcv_run_roots", "actual_root_exists",
  ], "release residue");
  if (
    evidence.residue.suite_roots !== 0
    || evidence.residue.homecook_system_temp !== 0
    || evidence.residue.hcv_run_roots !== 0
    || evidence.residue.actual_root_exists !== false
  ) throw new Error("release evidence contains cleanup residue");
  const { evidence_digest: claimedDigest, ...unsigned } = evidence;
  if (claimedDigest !== sha256Jcs(unsigned)) throw new Error("release evidence digest mismatch");
  return evidence;
}
