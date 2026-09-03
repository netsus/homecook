import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { canonicalizeJcs, parseCanonicalJcs } from "./lib/rfc8785-jcs.mjs";

const NOTE_REF = "refs/notes/homecook-release-evidence";
const keys = (value) => Object.keys(value).sort().join(",");
const exactKeys = (value, expected, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value) || keys(value) !== [...expected].sort().join(",")) {
    throw new Error(`${label} shape is invalid`);
  }
};
const digest = (value) => createHash("sha256").update(canonicalizeJcs(value)).digest("hex");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

const fileIndex = process.argv.indexOf("--file");
const source = fileIndex >= 0
  ? readFileSync(process.argv[fileIndex + 1], "utf8")
  : execFileSync("git", ["notes", `--ref=${NOTE_REF}`, "show", "HEAD"], { encoding: "utf8" });
const evidence = parseCanonicalJcs(source.trim());
exactKeys(evidence, [
  "schema", "repository", "head_sha", "tree_sha", "platform", "commands",
  "release_suite", "residue", "secrets_redacted", "evidence_digest",
], "release evidence");
if (
  evidence.schema !== "homecook.local-mac-production-release-evidence.v1"
  || evidence.repository !== "netsus/homecook"
  || evidence.head_sha !== git("rev-parse", "HEAD")
  || evidence.tree_sha !== git("rev-parse", "HEAD^{tree}")
  || evidence.platform !== "darwin-arm64"
  || evidence.secrets_redacted !== true
) throw new Error("release evidence authority does not match the current macOS head");
if (!Array.isArray(evidence.commands) || evidence.commands.length !== 2) {
  throw new Error("release evidence must contain the suite and actual build commands");
}
const expectedCommands = new Map([
  ["release-suite", ["pnpm", "test:local-mac-production-release"]],
  ["actual-build", [
    "env", "HOMECOOK_RUN_ACTUAL_RELEASE_BUILD=1", "pnpm", "exec", "vitest", "run",
    "tests/local-mac-production-rehearsal-candidate.test.ts", "-t",
    "runs offline pnpm install and a real Next production build inside the exact macOS build-work sandbox",
  ]],
]);
if (new Set(evidence.commands.map((command) => command.id)).size !== expectedCommands.size) {
  throw new Error("release evidence command identities are duplicated");
}
for (const command of evidence.commands) {
  exactKeys(command, ["id", "argv", "cwd", "status", "signal", "duration_ms", "stdout_sha256", "stderr_sha256"], "release command");
  if (
    !expectedCommands.has(command.id)
    || !Array.isArray(command.argv) || command.argv.some((value) => typeof value !== "string")
    || canonicalizeJcs(command.argv) !== canonicalizeJcs(expectedCommands.get(command.id))
    || command.cwd !== "<repository>" || command.status !== 0 || command.signal !== null
    || !Number.isSafeInteger(command.duration_ms) || command.duration_ms <= 0
    || !/^[0-9a-f]{64}$/u.test(command.stdout_sha256)
    || !/^[0-9a-f]{64}$/u.test(command.stderr_sha256)
  ) throw new Error("release command evidence is invalid");
}
exactKeys(evidence.release_suite, ["file_count", "test_count", "passed", "skipped", "failed", "inventory_sha256"], "release suite");
if (
  evidence.release_suite.file_count !== 28
  || evidence.release_suite.test_count !== evidence.release_suite.passed + evidence.release_suite.skipped
  || evidence.release_suite.failed !== 0
  || !/^[0-9a-f]{64}$/u.test(evidence.release_suite.inventory_sha256)
) throw new Error("release suite evidence is invalid");
if (
  evidence.release_suite.test_count !== 787
  || evidence.release_suite.passed !== 785
  || evidence.release_suite.skipped !== 2
) throw new Error("release suite totals do not match the exact repaired inventory");
exactKeys(evidence.residue, ["suite_roots", "homecook_system_temp", "hcv_run_roots", "actual_root_exists"], "release residue");
if (
  evidence.residue.suite_roots !== 0 || evidence.residue.homecook_system_temp !== 0
  || evidence.residue.hcv_run_roots !== 0 || evidence.residue.actual_root_exists !== false
) throw new Error("release evidence contains cleanup residue");
const { evidence_digest: claimedDigest, ...unsigned } = evidence;
if (claimedDigest !== digest(unsigned)) throw new Error("release evidence digest mismatch");
const serialized = canonicalizeJcs(evidence);
if (/(authorization|bearer|cookie|password|secret|service_role|token)[=:]/iu.test(serialized)) {
  throw new Error("release evidence contains a secret-shaped value");
}
process.stdout.write(`${canonicalizeJcs({
  evidence_digest: evidence.evidence_digest,
  head_sha: evidence.head_sha,
  note_ref: NOTE_REF,
  test_count: evidence.release_suite.test_count,
  valid: true,
})}\n`);
