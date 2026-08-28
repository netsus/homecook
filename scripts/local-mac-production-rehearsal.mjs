#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { canonicalizeJcs } from "./lib/rfc8785-jcs.mjs";
import {
  collectReadOnlyProductionInventory,
  createLocalProductionInventoryAdapters,
  readCanonicalInventoryFile,
} from "./lib/local-mac-production-rehearsal-inventory.mjs";
import { classifyProductionInventory } from "./lib/local-mac-production-rehearsal-classifier.mjs";
import { readCanonicalReceiptFile } from "./lib/local-mac-production-rehearsal-receipts.mjs";

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
    rootDir: process.cwd(),
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
  const stats = lstatSync(path);
  return {
    version: "homecook-release-rehearsal-inventory-v1",
    realpath: path,
    device: String(stats.dev),
    inode: String(stats.ino),
    mode: stats.mode & 0o7777,
    ctime: stats.ctime.toISOString(),
    size: stats.size,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
  };
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
    now = new Date(),
  } = dependencies;
  const options = parseArguments(argv);
  if (["help", "--help", "-h"].includes(options.command)) {
    output.write(HELP);
    return;
  }
  if (!["inventory", "classify", "verify"].includes(options.command)) throw new Error(`Unknown rehearsal command: ${options.command}`);
  if (!options.json) throw new Error("Rehearsal commands require --json for non-secret deterministic output.");

  const rootDir = resolve(options.rootDir);
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
