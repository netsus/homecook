#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  readCompletedCandidateRoot,
  snapshotToolFile,
} from "./lib/local-mac-production-rehearsal-candidate.mjs";
import { canonicalizeJcs } from "./lib/rfc8785-jcs.mjs";
import {
  runIsolatedReleaseRehearsal,
  validateRunnerIdentity,
} from "./lib/local-mac-production-rehearsal-runner.mjs";

const HELP = `Homecook isolated local Mac production release rehearsal runner

PRODUCTION MUTATION: 0
PRODUCTION DB CONNECTION/WRITE: 0
TRUST: run evidence is NOT a production receipt

Usage:
  pnpm release:rehearsal:run -- --candidate <absolute-completed-candidate-root-or-candidate.json> --production-env-authority <absolute-private-file> --json

The runner consumes sealed candidate bytes only. It does not checkout, rebuild,
install dependencies, pull/build images, use launchd, issue receipts/attestations,
unlock production promotion, or diagnose/recover production drift.
`;

function parseArguments(argv) {
  const result = { candidateInput: null, productionEnvAuthorityPath: null, json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") continue;
    if (["--help", "-h"].includes(token)) { result.help = true; continue; }
    if (token === "--json") { result.json = true; continue; }
    if (token === "--candidate") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--candidate requires a value.");
      result.candidateInput = value;
      index += 1;
      continue;
    }
    if (token === "--production-env-authority") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--production-env-authority requires a value.");
      result.productionEnvAuthorityPath = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown rehearsal run option: ${token}`);
  }
  return result;
}

function ensurePrivateDirectory(path) {
  const absolute = resolve(path);
  try { mkdirSync(absolute, { recursive: true, mode: 0o700 }); }
  catch (error) { throw new Error(`Unable to reserve rehearsal namespace: ${error instanceof Error ? error.message : String(error)}`); }
  const stat = lstatSync(absolute, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077n) !== 0n) {
    throw new Error("Rehearsal namespace must be a private current-user directory.");
  }
  realpathSync(absolute);
  return absolute;
}

function defaultNamespaceResolver() {
  const home = process.env.HOME;
  if (!home || !isAbsolute(home)) throw new Error("HOME must be an absolute path.");
  return ensurePrivateDirectory(join(home, ".homecook", "rehearsal", "runs"));
}

async function defaultAdapterFactory(options) {
  const adapterModule = await import("./lib/local-mac-production-rehearsal-runner-adapters.mjs");
  return adapterModule.createLocalReleaseRehearsalRunnerAdapters(options);
}

export function readDefaultRehearsalRunnerIdentity() {
  return snapshotToolFile(
    realpathSync(fileURLToPath(import.meta.url)),
    "homecook-release-rehearsal-runner-v1",
    { requireExecutable: false },
  );
}

export async function runLocalMacProductionRehearsalRunnerCli(argv, dependencies = {}) {
  const {
    output = process.stdout,
    run = runIsolatedReleaseRehearsal,
    readCandidate = readCompletedCandidateRoot,
    createAdapters = defaultAdapterFactory,
    namespaceResolver = defaultNamespaceResolver,
    runIdFactory = () => randomUUID(),
    runnerIdentity = readDefaultRehearsalRunnerIdentity,
  } = dependencies;
  const options = parseArguments(argv);
  if (options.help) { output.write(HELP); return; }
  if (!options.json) throw new Error("release:rehearsal:run requires --json.");
  if (!options.candidateInput || !isAbsolute(options.candidateInput)) {
    throw new Error("--candidate must be an absolute completed candidate root or candidate.json.");
  }
  if (options.productionEnvAuthorityPath !== null && !isAbsolute(options.productionEnvAuthorityPath)) {
    throw new Error("--production-env-authority must be an absolute private file path.");
  }
  const resolvedRunnerIdentity = validateRunnerIdentity(runnerIdentity());
  if (options.productionEnvAuthorityPath === null) {
    throw new Error("release:rehearsal:run requires --production-env-authority.");
  }
  const namespaceRoot = namespaceResolver();
  const runId = runIdFactory();
  const adapters = await createAdapters({
    candidateInput: options.candidateInput,
    namespaceRoot,
    productionEnvAuthorityPath: options.productionEnvAuthorityPath,
    runId,
  });
  const abortController = new AbortController();
  const signalHandlers = new Map([
    ["SIGINT", () => abortController.abort("SIGINT")],
    ["SIGTERM", () => abortController.abort("SIGTERM")],
    ["SIGHUP", () => abortController.abort("SIGHUP")],
  ]);
  for (const [signalName, handler] of signalHandlers) process.once(signalName, handler);
  let result;
  try {
    result = await run({
      candidateInput: options.candidateInput,
      namespaceRoot,
      runId,
      readCandidate,
      adapters,
      runnerIdentity: resolvedRunnerIdentity,
      signal: abortController.signal,
    });
  } finally {
    for (const [signalName, handler] of signalHandlers) process.removeListener(signalName, handler);
  }
  output.write(`${canonicalizeJcs(result)}\n`);
}

const isMain = process.argv[1]
  && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;

if (isMain) {
  runLocalMacProductionRehearsalRunnerCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
