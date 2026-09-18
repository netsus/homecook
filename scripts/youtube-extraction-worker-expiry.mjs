#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { lstatSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateYoutubeExtractionWorkerPreflight, loadYoutubeExtractionWorkerRuntimeInputs } from "./lib/youtube-extraction-worker-ops.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const output = args.includes("--output") ? option("--output") : null;
const plist = args.includes("--plist") ? option("--plist") : null;

function publish(result) {
  if (!output || !isAbsolute(output)) throw new Error("A private absolute status output path is required");
  const parent = dirname(output);
  const stat = lstatSync(parent);
  const withinRepo = relative(root, output);
  if (
    realpathSync(parent) !== parent || !stat.isDirectory()
    || (stat.mode & 0o777) !== 0o700 || stat.uid !== process.getuid?.()
    || (!withinRepo.startsWith("../") && !isAbsolute(withinRepo))
  ) throw new Error("Status output requires an owner-controlled private directory outside the repository");
  try {
    const previous = lstatSync(output);
    if (!previous.isFile() || previous.isSymbolicLink() || previous.uid !== process.getuid?.()) throw new Error("Unsafe status output");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const staging = `${output}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(staging, `${JSON.stringify(result)}\n`, { mode: 0o600, flag: "wx" });
    renameSync(staging, output);
  } finally {
    rmSync(staging, { force: true });
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

let result;
try {
  if (!plist || !isAbsolute(plist)) throw new Error("A worker plist is required");
  const stat = lstatSync(plist);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o777) !== 0o600) throw new Error("Invalid worker plist");
  const parsed = spawnSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", plist], { encoding: "utf8" });
  if (parsed.status !== 0) throw new Error("Worker plist could not be read");
  const data = JSON.parse(parsed.stdout);
  if (data.Label !== "com.homecook.youtube-extraction-worker") throw new Error("Unexpected worker label");
  const flags = data.ProgramArguments;
  const value = (name) => {
    const index = flags.indexOf(name);
    if (index < 0 || flags.lastIndexOf(name) !== index || !isAbsolute(flags[index + 1] ?? "")) throw new Error("Missing worker input");
    return flags[index + 1];
  };
  const inputs = loadYoutubeExtractionWorkerRuntimeInputs({
    appDescriptorPath: value("--app-descriptor"), workerArtifactPath: value("--manifest"),
    currentPolicyPath: value("--policy"), credentialPath: value("--credential"),
    expectedSchemaPath: value("--expected-schema"), secretRoot: value("--secret-root"),
  });
  const expiry = Date.parse(inputs.credentialState.expires_at);
  if (!Number.isFinite(expiry)) throw new Error("Invalid expiry");
  const ready = evaluateYoutubeExtractionWorkerPreflight({ ...inputs, requirePolicyEnabled: true }).ready;
  result = {
    status: !ready ? "NOT_READY" : expiry <= Date.now() + 48 * 3600_000 ? "RENEWAL_DUE" : "OK",
    expires_at: new Date(expiry).toISOString(),
    renew_before: new Date(expiry - 48 * 3600_000).toISOString(),
    checked_at: new Date().toISOString(),
  };
} catch {
  result = { status: "INVALID_WORKER_INPUT", expires_at: null, renew_before: null, checked_at: new Date().toISOString() };
}
try {
  publish(result);
  if (result.status !== "OK") process.exitCode = 1;
} catch {
  process.stderr.write("Worker expiry check could not publish private status\n");
  process.exitCode = 1;
}
