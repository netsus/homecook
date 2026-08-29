#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { canonicalizeJcs } from "./lib/rfc8785-jcs.mjs";
import {
  collectReadOnlyProductionInventory,
  createLocalProductionInventoryAdapters,
  readCanonicalInventoryFile,
} from "./lib/local-mac-production-rehearsal-inventory.mjs";
import { classifyProductionInventory } from "./lib/local-mac-production-rehearsal-classifier.mjs";
import { readCanonicalReceiptFile } from "./lib/local-mac-production-rehearsal-receipts.mjs";
import {
  buildReleaseRehearsalCandidate,
  createReleaseRehearsalCandidateAdapters,
} from "./lib/local-mac-production-rehearsal-candidate.mjs";

const MODULE_REPOSITORY_ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));

const HELP = `Homecook local Mac production rehearsal candidate and receipt foundation

PRODUCTION MUTATION: 0 (read-only/offline commands only)

Usage:
  pnpm release:rehearsal:inventory -- --json [--home-dir <absolute>] [--root-dir <absolute>] [--approved-migration-marker <absolute>]
  pnpm release:rehearsal:candidate -- --release-sha <exact-40hex-origin-master-sha> --json
  pnpm release:rehearsal:classify -- --inventory <absolute-private-inventory> --json [--root-dir <absolute>]
  pnpm release:rehearsal:verify -- --receipt <absolute-private-receipt> [--member-receipt <absolute-run-receipt>]... --json [--root-dir <absolute>]

Excluded from this split: Docker rehearsal runner, foreground supervisor, synthetic DB/canary,
repeatability attestation, production attestation/promotion unlock, and recovery execution.
`;

function parseArguments(argv) {
  const result = {
    command: argv[0] ?? "help",
    json: false,
    rootDir: null,
    homeDir: process.env.HOME ?? "",
    inventoryPath: null,
    receiptPath: null,
    memberReceiptPaths: [],
    approvedMigrationMarkerPath: null,
    releaseSha: null,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") continue;
    if (token === "--json") {
      result.json = true;
      continue;
    }
    const value = argv[index + 1];
    if (["--root-dir", "--home-dir", "--inventory", "--receipt", "--member-receipt", "--approved-migration-marker", "--release-sha"].includes(token)) {
      if (!value || value.startsWith("--")) throw new Error(`${token} requires a value.`);
      index += 1;
      if (token === "--root-dir") result.rootDir = value;
      if (token === "--home-dir") result.homeDir = value;
      if (token === "--inventory") result.inventoryPath = value;
      if (token === "--receipt") result.receiptPath = value;
      if (token === "--member-receipt") result.memberReceiptPaths.push(value);
      if (token === "--approved-migration-marker") result.approvedMigrationMarkerPath = value;
      if (token === "--release-sha") result.releaseSha = value;
      continue;
    }
    throw new Error(`Unknown rehearsal option: ${token}`);
  }
  return result;
}

function requireAbsolute(path, label) {
  if (!path || !isAbsolute(path)) throw new Error(`${label} must be an absolute path.`);
  return path;
}

function defaultProbeIdentity() {
  const path = realpathSync(fileURLToPath(import.meta.url));
  const stats = lstatSync(path, { bigint: true });
  return {
    version: "homecook-release-rehearsal-inventory-v1",
    realpath: path,
    device: String(stats.dev),
    inode: String(stats.ino),
    mode: Number(stats.mode & 0o7777n),
    ctime: new Date(Number(stats.ctimeMs)).toISOString(),
    size: stats.size.toString(),
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
  };
}

function defaultRepositoryRootResolver() {
  const stat = lstatSync(MODULE_REPOSITORY_ROOT);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("Module repository root is not a real directory.");
  }
  return MODULE_REPOSITORY_ROOT;
}

function writeResult(output, result) {
  output.write(`${canonicalizeJcs(result)}\n`);
}

function defaultCandidateNamespaceResolver({ homeDir }) {
  return resolve(homeDir, ".homecook", "rehearsal");
}

/**
 * @param {string[]} argv
 * @param {Record<string, any>} [dependencies]
 */
export async function runLocalMacProductionRehearsalCli(argv, dependencies = {}) {
  const {
    output = process.stdout,
    createInventoryAdapters = createLocalProductionInventoryAdapters,
    collectInventory = collectReadOnlyProductionInventory,
    readInventory = readCanonicalInventoryFile,
    classify = classifyProductionInventory,
    readReceipt = readCanonicalReceiptFile,
    probeIdentity = defaultProbeIdentity,
    repositoryRootResolver = defaultRepositoryRootResolver,
    now = new Date(),
    buildCandidate = buildReleaseRehearsalCandidate,
    createCandidateAdapters = createReleaseRehearsalCandidateAdapters,
    candidateNamespaceResolver = defaultCandidateNamespaceResolver,
    runIdFactory = () => randomUUID(),
  } = dependencies;
  const options = parseArguments(argv);
  if (["help", "--help", "-h"].includes(options.command)) {
    output.write(HELP);
    return;
  }
  if (!["inventory", "candidate", "classify", "verify"].includes(options.command)) throw new Error(`Unknown rehearsal command: ${options.command}`);
  if (!options.json) throw new Error("Rehearsal commands require --json for non-secret deterministic output.");

  const actualRepositoryRoot = repositoryRootResolver();
  const rootDir = options.rootDir === null ? actualRepositoryRoot : realpathSync(resolve(options.rootDir));
  if (rootDir !== actualRepositoryRoot) throw new Error("--root-dir must exactly match the verified Git repository root.");
  if (options.command === "candidate") {
    if (!/^[0-9a-f]{40}$/u.test(options.releaseSha ?? "")) {
      throw new Error("candidate --release-sha requires an exact lowercase 40-character SHA.");
    }
    const namespaceRoot = candidateNamespaceResolver({
      homeDir: resolve(options.homeDir),
      rootDir,
    });
    const adapters = createCandidateAdapters({
      homeDir: resolve(options.homeDir),
      namespaceRoot,
      rootDir,
    });
    writeResult(output, await buildCandidate({
      adapters,
      namespaceRoot,
      releaseSha: options.releaseSha,
      runId: runIdFactory(),
    }));
    return;
  }
  if (options.command === "inventory") {
    if (options.approvedMigrationMarkerPath) requireAbsolute(options.approvedMigrationMarkerPath, "approved migration marker");
    const adapters = createInventoryAdapters({
      homeDir: resolve(options.homeDir),
      rootDir,
      approvedMigrationMarkerPath: options.approvedMigrationMarkerPath,
    });
    const inventory = await collectInventory({
      adapters,
      probeIdentity: probeIdentity(),
      approvedMigrationMarker: Boolean(options.approvedMigrationMarkerPath),
    });
    writeResult(output, inventory);
    return;
  }
  if (options.command === "classify") {
    const inventoryPath = requireAbsolute(options.inventoryPath, "inventory path");
    const inventory = readInventory(inventoryPath, { repoRoot: rootDir });
    writeResult(output, classify(inventory));
    return;
  }
  const receiptPath = requireAbsolute(options.receiptPath, "receipt path");
  const memberReceipts = options.memberReceiptPaths.map((path) => readReceipt(
    requireAbsolute(path, "member receipt path"),
    { repoRoot: rootDir, now },
  ));
  const receipt = readReceipt(receiptPath, {
    repoRoot: rootDir,
    memberReceipts: memberReceipts.length > 0 ? memberReceipts : undefined,
    now,
  });
  writeResult(output, { status: "valid", receipt });
}

const isMain = process.argv[1]
  && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;

if (isMain) {
  runLocalMacProductionRehearsalCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
