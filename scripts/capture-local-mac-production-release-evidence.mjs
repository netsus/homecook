import { spawn, execFileSync } from "node:child_process";
import { existsSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";

import { canonicalizeJcs } from "./lib/rfc8785-jcs.mjs";
import { collectReleaseTestInventory } from "./lib/local-mac-production-release-test-inventory.mjs";
import {
  RELEASE_EVIDENCE_COMMANDS,
  buildReleaseEvidenceCommandEnv,
  buildLocalMacProductionReleaseEvidence,
} from "./lib/local-mac-production-release-evidence.mjs";

const args = process.argv.slice(2);
const outputIndex = args.indexOf("--output");
if (outputIndex < 0 || outputIndex !== args.length - 2 || !isAbsolute(args[outputIndex + 1])) {
  throw new Error("usage: capture-local-mac-production-release-evidence --output <absolute-new-file>");
}
const outputPath = args[outputIndex + 1];
if (existsSync(outputPath)) throw new Error("release evidence output must be create-only");
if (process.platform !== "darwin" || process.arch !== "arm64") {
  throw new Error("release evidence capture requires darwin-arm64");
}

const git = (...gitArgs) => execFileSync("git", gitArgs, { encoding: "utf8" }).trim();
const headSha = git("rev-parse", "HEAD");
const treeSha = git("rev-parse", "HEAD^{tree}");
if (git("status", "--porcelain") !== "") {
  throw new Error("release evidence capture requires a clean worktree");
}

const run = (commandId) => new Promise((resolveRun, rejectRun) => {
  const argv = RELEASE_EVIDENCE_COMMANDS.get(commandId);
  const startedAt = process.hrtime.bigint();
  const child = spawn(argv[0], argv.slice(1), {
    cwd: process.cwd(),
    env: buildReleaseEvidenceCommandEnv(commandId, process.env),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => {
    stdout.push(chunk);
    process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr.push(chunk);
    process.stderr.write(chunk);
  });
  child.once("error", rejectRun);
  child.once("close", (status, signal) => resolveRun({
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
    status,
    signal,
    durationMs: Math.max(1, Number((process.hrtime.bigint() - startedAt) / 1_000_000n)),
  }));
});

const inventoryBefore = collectReleaseTestInventory();
const releaseSuite = await run("release-suite");
if (releaseSuite.status !== 0 || releaseSuite.signal !== null) {
  throw new Error("release suite failed; evidence was not created");
}
const actualBuild = await run("actual-build");
if (actualBuild.status !== 0 || actualBuild.signal !== null) {
  throw new Error("actual build failed; evidence was not created");
}
if (headSha !== git("rev-parse", "HEAD") || treeSha !== git("rev-parse", "HEAD^{tree}")) {
  throw new Error("release evidence Git identity changed during capture");
}
if (git("status", "--porcelain") !== "") {
  throw new Error("release evidence capture changed the worktree");
}
const inventoryAfter = collectReleaseTestInventory();
if (canonicalizeJcs(inventoryBefore.tests) !== canonicalizeJcs(inventoryAfter.tests)) {
  throw new Error("release test inventory changed during evidence capture");
}

const output = `${releaseSuite.stdout}\n${actualBuild.stdout}`;
const suiteRoots = [...output.matchAll(/^VITEST_SUITE_TEMP_ROOT=(.+)$/gmu)]
  .map((match) => match[1].trim());
if (suiteRoots.length !== 2 || new Set(suiteRoots).size !== suiteRoots.length) {
  throw new Error("release evidence did not identify both isolated suite roots");
}
const hcvRoot = join(realpathSync(homedir()), ".cache", "hcv");
const hcvRunRoots = existsSync(hcvRoot)
  ? readdirSync(hcvRoot).filter((name) => name.startsWith("r-")).length
  : 0;
const systemTemp = realpathSync(tmpdir());
const homecookSystemTemp = readdirSync(systemTemp)
  .filter((name) => name.startsWith("homecook-")).length;
const residue = {
  suite_roots: suiteRoots.filter((root) => existsSync(root)).length,
  homecook_system_temp: homecookSystemTemp,
  hcv_run_roots: hcvRunRoots,
  actual_root_exists: suiteRoots.some((root) => existsSync(root)),
};

const evidence = buildLocalMacProductionReleaseEvidence({
  headSha,
  treeSha,
  platform: "darwin-arm64",
  inventory: inventoryAfter,
  releaseSuite,
  actualBuild,
  residue,
});
writeFileSync(outputPath, `${canonicalizeJcs(evidence)}\n`, { flag: "wx", mode: 0o600 });
process.stdout.write(`${canonicalizeJcs({
  evidence_digest: evidence.evidence_digest,
  head_sha: evidence.head_sha,
  output: outputPath,
  valid: true,
})}\n`);
