#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
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
import { resolveTrustedGitExecutable } from "./lib/trusted-production-release-tools.mjs";

const MODULE_REPOSITORY_ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));

const HELP = `Homecook local Mac production rehearsal receipt foundation

PRODUCTION MUTATION: 0 (read-only/offline commands only)

Usage:
  pnpm release:rehearsal:inventory -- --json [--home-dir <absolute>] [--root-dir <absolute>] [--approved-migration-marker <absolute>]
  pnpm release:rehearsal:classify -- --inventory <absolute-private-inventory> --json [--root-dir <absolute>]
  pnpm release:rehearsal:verify -- --receipt <absolute-private-receipt> [--member-receipt <absolute-run-receipt>]... --json [--root-dir <absolute>]

Excluded from this split: candidate build/seal, Docker rehearsal runner, foreground supervisor,
secret materialization, production attestation/promotion unlock, and recovery execution.
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
  };
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") continue;
    if (token === "--json") {
      result.json = true;
      continue;
    }
    const value = argv[index + 1];
    if (["--root-dir", "--home-dir", "--inventory", "--receipt", "--member-receipt", "--approved-migration-marker"].includes(token)) {
      if (!value || value.startsWith("--")) throw new Error(`${token} requires a value.`);
      index += 1;
      if (token === "--root-dir") result.rootDir = value;
      if (token === "--home-dir") result.homeDir = value;
      if (token === "--inventory") result.inventoryPath = value;
      if (token === "--receipt") result.receiptPath = value;
      if (token === "--member-receipt") result.memberReceiptPaths.push(value);
      if (token === "--approved-migration-marker") result.approvedMigrationMarkerPath = value;
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
  const gitBin = resolveTrustedGitExecutable();
  const result = spawnSync(gitBin, ["-C", MODULE_REPOSITORY_ROOT, "rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    env: { PATH: "/usr/bin:/bin" },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5_000,
  });
  if (result.status !== 0) throw new Error("Actual Git repository root could not be verified.");
  const gitRoot = realpathSync(String(result.stdout ?? "").trim());
  if (gitRoot !== MODULE_REPOSITORY_ROOT) throw new Error("Module repository identity does not match the actual Git root.");
  return gitRoot;
}

function writeResult(output, result) {
  output.write(`${canonicalizeJcs(result)}\n`);
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
  } = dependencies;
  const options = parseArguments(argv);
  if (["help", "--help", "-h"].includes(options.command)) {
    output.write(HELP);
    return;
  }
  if (!["inventory", "classify", "verify"].includes(options.command)) throw new Error(`Unknown rehearsal command: ${options.command}`);
  if (!options.json) throw new Error("Rehearsal commands require --json for non-secret deterministic output.");

  const actualRepositoryRoot = repositoryRootResolver();
  const rootDir = options.rootDir === null ? actualRepositoryRoot : realpathSync(resolve(options.rootDir));
  if (rootDir !== actualRepositoryRoot) throw new Error("--root-dir must exactly match the verified Git repository root.");
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
