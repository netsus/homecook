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
import {
  buildRepeatabilityReceipt,
  buildRunReceiptFromEvidenceAuthority,
  readCanonicalReceiptFile,
  writeCanonicalReceiptCreateOnly,
} from "./lib/local-mac-production-rehearsal-receipts.mjs";
import { readCompletedCandidateRoot } from "./lib/local-mac-production-rehearsal-candidate.mjs";
import { readCompletedRunEvidenceRoot } from "./lib/local-mac-production-rehearsal-runner.mjs";

const MODULE_REPOSITORY_ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));

const HELP = `Homecook local Mac production rehearsal candidate and receipt foundation

PRODUCTION MUTATION: 0 (read-only/offline commands only)

Usage:
  pnpm release:rehearsal:inventory -- --json [--home-dir <absolute>] [--root-dir <absolute>] [--approved-migration-marker <absolute>] [--production-env-authority <absolute-private-file>]
  pnpm release:rehearsal:select -- --release-sha <approved-origin-master-ancestor-sha> --selection-root <absolute-private-root> --expires-at <UTC-RFC3339> --approver-role human-release-approver --approver-id <id> --approval-digest <sha256> --confirm CREATE_REHEARSAL_SELECTION --json
  pnpm release:rehearsal:candidate -- --release-sha <exact-40hex-origin-master-sha> --production-env-authority <absolute-private-file> --json
  pnpm release:rehearsal:classify -- --inventory <absolute-private-inventory> --json [--root-dir <absolute>]
  pnpm release:rehearsal:receipt -- --candidate <absolute-sealed-candidate> --run-evidence <absolute-completed-run> --receipt-root <absolute-private-root> --issuer-task-id <task-id> --json
  pnpm release:rehearsal:repeatability -- --member-receipt <absolute-run-receipt> --member-receipt <absolute-run-receipt> --receipt-root <absolute-private-root> --issuer-task-id <task-id> --json
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
    productionEnvAuthorityPath: null,
    releaseSha: null,
    candidateInput: null,
    runEvidencePath: null,
    receiptRoot: null,
    issuerTaskId: null,
    selectionRoot: null,
    expiresAt: null,
    approverRole: null,
    approverId: null,
    approvalDigest: null,
    confirmation: null,
    selectionPath: null,
  };
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") continue;
    if (token === "--json") {
      result.json = true;
      continue;
    }
    const value = argv[index + 1];
    if (["--root-dir", "--home-dir", "--inventory", "--receipt", "--member-receipt", "--approved-migration-marker", "--production-env-authority", "--release-sha", "--candidate", "--run-evidence", "--receipt-root", "--issuer-task-id", "--selection-root", "--selection", "--expires-at", "--approver-role", "--approver-id", "--approval-digest", "--confirm"].includes(token)) {
      if (!value || value.startsWith("--")) throw new Error(`${token} requires a value.`);
      index += 1;
      if (token === "--root-dir") result.rootDir = value;
      if (token === "--home-dir") result.homeDir = value;
      if (token === "--inventory") result.inventoryPath = value;
      if (token === "--receipt") result.receiptPath = value;
      if (token === "--member-receipt") result.memberReceiptPaths.push(value);
      if (token === "--approved-migration-marker") result.approvedMigrationMarkerPath = value;
      if (token === "--production-env-authority") result.productionEnvAuthorityPath = value;
      if (token === "--release-sha") result.releaseSha = value;
      if (token === "--candidate") result.candidateInput = value;
      if (token === "--run-evidence") result.runEvidencePath = value;
      if (token === "--receipt-root") result.receiptRoot = value;
      if (token === "--issuer-task-id") result.issuerTaskId = value;
      if (token === "--selection-root") result.selectionRoot = value;
      if (token === "--expires-at") result.expiresAt = value;
      if (token === "--approver-role") result.approverRole = value;
      if (token === "--approver-id") result.approverId = value;
      if (token === "--approval-digest") result.approvalDigest = value;
      if (token === "--confirm") result.confirmation = value;
      if (token === "--selection") result.selectionPath = value;
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
    readCandidate = readCompletedCandidateRoot,
    readRunEvidence = readCompletedRunEvidenceRoot,
    buildRunReceiptFromEvidence = buildRunReceiptFromEvidenceAuthority,
    buildRepeatability = buildRepeatabilityReceipt,
    writeReceipt = writeCanonicalReceiptCreateOnly,
    probeIdentity = defaultProbeIdentity,
    repositoryRootResolver = defaultRepositoryRootResolver,
    now = new Date(),
    buildCandidate = null,
    createCandidateAdapters = null,
    immutableBuilderInputDigest = null,
    immutableBuilderInputEntries = null,
    immutableBootstrapVerified = false,
    beforeCandidateComplete = null,
    candidateNamespaceResolver = defaultCandidateNamespaceResolver,
    runIdFactory = () => randomUUID(),
    resolveSelectionSource = null,
    buildSelection = null,
    writeSelection = null,
    readSelection = null,
  } = dependencies;
  const options = parseArguments(argv);
  if (["help", "--help", "-h"].includes(options.command)) {
    output.write(HELP);
    return;
  }
  if (!["inventory", "select", "candidate", "classify", "receipt", "repeatability", "verify"].includes(options.command)) throw new Error(`Unknown rehearsal command: ${options.command}`);
  if (!options.json) throw new Error("Rehearsal commands require --json for non-secret deterministic output.");

  const actualRepositoryRoot = repositoryRootResolver();
  const rootDir = options.rootDir === null ? actualRepositoryRoot : realpathSync(resolve(options.rootDir));
  if (rootDir !== actualRepositoryRoot) throw new Error("--root-dir must exactly match the verified Git repository root.");
  if (options.command === "select") {
    if (!/^[0-9a-f]{40}$/u.test(options.releaseSha ?? "")) throw new Error("select --release-sha requires an exact lowercase 40-character SHA.");
    const selectionRoot = requireAbsolute(options.selectionRoot, "selection root");
    if (options.confirmation !== "CREATE_REHEARSAL_SELECTION") throw new Error("select requires exact --confirm CREATE_REHEARSAL_SELECTION.");
    if (options.approverRole !== "human-release-approver") throw new Error("select requires --approver-role human-release-approver.");
    if (!options.approverId) throw new Error("select --approver-id is required.");
    if (!/^[0-9a-f]{64}$/u.test(options.approvalDigest ?? "")) throw new Error("select --approval-digest requires lowercase SHA-256.");
    if (!options.expiresAt) throw new Error("select --expires-at is required.");
    const selectionModule = [resolveSelectionSource, buildSelection, writeSelection].every((value) => typeof value === "function")
      ? null
      : await import("./lib/local-mac-production-rehearsal-selection.mjs");
    const sourceResolver = resolveSelectionSource ?? selectionModule.resolveRehearsalSelectionSource;
    const selectionBuilder = buildSelection ?? selectionModule.buildRehearsalSelection;
    const selectionWriter = writeSelection ?? selectionModule.writeRehearsalSelectionCreateOnly;
    const source = await sourceResolver({ releaseSha: options.releaseSha, rootDir });
    const selection = selectionBuilder({
      schema: "homecook.local-mac-production-rehearsal-selection.v1",
      canonicalization: "RFC8785-JCS+SHA256",
      repository: "netsus/homecook",
      source_ref: "refs/heads/master",
      ...source,
      selected_at: now.toISOString(),
      expires_at: options.expiresAt,
      approver_role: options.approverRole,
      approver_id: options.approverId,
      approval_digest: options.approvalDigest,
    });
    const selectionPath = selectionWriter({ selection, selectionRoot, repoRoot: rootDir, now });
    writeResult(output, { status: "created", selection_path: selectionPath, selection });
    return;
  }
  if (options.command === "candidate") {
    if (!/^[0-9a-f]{40}$/u.test(options.releaseSha ?? "")) {
      throw new Error("candidate --release-sha requires an exact lowercase 40-character SHA.");
    }
    if (!immutableBootstrapVerified) {
      throw new Error("candidate execution requires the verified immutable Git bootstrap authority.");
    }
    if (!/^[0-9a-f]{64}$/u.test(immutableBuilderInputDigest ?? "") || !Array.isArray(immutableBuilderInputEntries) || immutableBuilderInputEntries.length === 0) {
      throw new Error("candidate execution requires the verified immutable builder module graph authority.");
    }
    if (typeof beforeCandidateComplete !== "function") {
      throw new Error("candidate execution requires an immutable before-complete finalization guard.");
    }
    requireAbsolute(options.productionEnvAuthorityPath, "production env authority");
    let selection = null;
    if (options.selectionPath !== null) {
      const selectionPath = requireAbsolute(options.selectionPath, "selection path");
      const selectionModule = readSelection
        ? null
        : await import("./lib/local-mac-production-rehearsal-selection.mjs");
      const selectionReader = readSelection ?? selectionModule.readRehearsalSelectionArtifact;
      selection = selectionReader(selectionPath, { repoRoot: rootDir, now });
      if (selection.selected_sha !== options.releaseSha) {
        throw new Error("candidate --release-sha must equal the approved selection selected_sha.");
      }
    }
    const candidateModule = buildCandidate && createCandidateAdapters
      ? null
      : await import("./lib/local-mac-production-rehearsal-candidate.mjs");
    const candidateBuilder = buildCandidate ?? candidateModule.buildReleaseRehearsalCandidate;
    const candidateAdapterFactory = createCandidateAdapters ?? candidateModule.createReleaseRehearsalCandidateAdapters;
    const namespaceRoot = candidateNamespaceResolver({
      homeDir: resolve(options.homeDir),
      rootDir,
    });
    const adapters = candidateAdapterFactory({
      builderInputDigest: immutableBuilderInputDigest,
      builderInputEntries: immutableBuilderInputEntries,
      homeDir: resolve(options.homeDir),
      namespaceRoot,
      productionEnvAuthorityPath: options.productionEnvAuthorityPath,
      rootDir,
      selection,
    });
    let sourceAuthority = null;
    if (selection !== null) {
      if (typeof adapters.resolveSourceAuthority !== "function") {
        throw new Error("candidate selection requires pre-build full-history source authority validation.");
      }
      sourceAuthority = await adapters.resolveSourceAuthority({
        releaseSha: options.releaseSha,
        selection,
      });
    }
    let completionGuardCalled = false;
    const guardedBeforeComplete = async (authority) => {
      if (completionGuardCalled) throw new Error("candidate immutable finalization guard may run only once.");
      const result = await beforeCandidateComplete(authority);
      if (
        result?.verified !== true
        || result?.builder_input_digest !== immutableBuilderInputDigest
        || authority?.builder_input_digest !== immutableBuilderInputDigest
      ) throw new Error("candidate immutable finalization authority is invalid.");
      completionGuardCalled = true;
      return result;
    };
    const candidateResult = await candidateBuilder({
      adapters,
      beforeComplete: guardedBeforeComplete,
      namespaceRoot,
      releaseSha: options.releaseSha,
      selectionDigest: selection?.selection_digest ?? null,
      sourceAuthority,
      runId: runIdFactory(),
    });
    if (!completionGuardCalled) throw new Error("candidate builder returned before immutable finalization.");
    writeResult(output, candidateResult);
    return;
  }
  if (options.command === "inventory") {
    if (options.approvedMigrationMarkerPath) requireAbsolute(options.approvedMigrationMarkerPath, "approved migration marker");
    if (options.productionEnvAuthorityPath) requireAbsolute(options.productionEnvAuthorityPath, "production env authority");
    const adapters = createInventoryAdapters({
      homeDir: resolve(options.homeDir),
      rootDir,
      approvedMigrationMarkerPath: options.approvedMigrationMarkerPath,
      productionEnvAuthorityPath: options.productionEnvAuthorityPath,
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
  if (options.command === "receipt") {
    const candidateInput = requireAbsolute(options.candidateInput, "candidate input");
    const runEvidencePath = requireAbsolute(options.runEvidencePath, "run evidence path");
    const receiptRoot = requireAbsolute(options.receiptRoot, "receipt root");
    if (!options.issuerTaskId) throw new Error("receipt --issuer-task-id is required.");
    const candidate = readCandidate(candidateInput);
    const run = readRunEvidence(runEvidencePath, { now });
    const receipt = buildRunReceiptFromEvidence({
      candidateManifest: candidate.manifest,
      runEvidence: run.evidence,
      issuerTaskId: options.issuerTaskId,
      now,
    });
    const receiptPath = writeReceipt({ receipt, receiptRoot, repoRoot: rootDir, now });
    writeResult(output, { status: "created", receipt_path: receiptPath, receipt });
    return;
  }
  if (options.command === "repeatability") {
    const receiptRoot = requireAbsolute(options.receiptRoot, "receipt root");
    if (!options.issuerTaskId) throw new Error("repeatability --issuer-task-id is required.");
    if (options.memberReceiptPaths.length !== 2) throw new Error("repeatability requires exactly two --member-receipt paths.");
    const memberReceipts = options.memberReceiptPaths.map((path) => readReceipt(
      requireAbsolute(path, "member receipt path"),
      { repoRoot: rootDir, now },
    ));
    const receipt = buildRepeatability({ memberReceipts, issuerTaskId: options.issuerTaskId, now });
    const receiptPath = writeReceipt({ receipt, receiptRoot, repoRoot: rootDir, memberReceipts, now });
    writeResult(output, { status: "created", receipt_path: receiptPath, receipt });
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
