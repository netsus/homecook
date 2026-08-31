#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { TextDecoder } from "node:util";

import { canonicalizeJcs } from "./lib/rfc8785-jcs.mjs";
import { verifyRehearsalReceiptBundleAuthority } from "./lib/local-mac-production-rehearsal-receipts.mjs";
import {
  emptyRehearsalSelectionAuthority,
  projectRehearsalSelectionAuthority,
  readRehearsalSelectionArtifact,
  resolveCandidateRehearsalSourceAuthority,
  resolveRehearsalSelectionSource,
} from "./lib/local-mac-production-rehearsal-selection.mjs";

function parseArgs(argv) {
  const options = {
    memberReceiptPaths: [],
    repeatabilityReceiptPath: null,
    releaseSha: null,
    releaseTree: null,
    minimumRemainingSeconds: null,
    currentMasterSha: null,
    repositoryRoot: null,
    selectionPath: null,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") continue;
    if (token === "--json") { options.json = true; continue; }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${token} requires a value.`);
    index += 1;
    if (token === "--member-receipt") options.memberReceiptPaths.push(value);
    else if (token === "--repeatability-receipt") options.repeatabilityReceiptPath = value;
    else if (token === "--release-sha") options.releaseSha = value;
    else if (token === "--release-tree") options.releaseTree = value;
    else if (token === "--minimum-remaining-seconds") options.minimumRemainingSeconds = Number(value);
    else if (token === "--current-master-sha") options.currentMasterSha = value;
    else if (token === "--repository-root") options.repositoryRoot = value;
    else if (token === "--selection") options.selectionPath = value;
    else throw new Error(`Unknown rehearsal authority option: ${token}`);
  }
  return options;
}

/** @param {{validUntil: string, now?: Date, minimumRemainingSeconds?: number}} options */
export function assertRehearsalAuthorityFreshForTagPush({
  validUntil,
  now = new Date(),
  minimumRemainingSeconds = 900,
} = {}) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("Tag-push rehearsal authority clock is invalid.");
  }
  if (!Number.isSafeInteger(minimumRemainingSeconds) || minimumRemainingSeconds < 1) {
    throw new Error("Tag-push completion safety margin is invalid.");
  }
  const validUntilMs = Date.parse(validUntil);
  if (!Number.isFinite(validUntilMs) || new Date(validUntilMs).toISOString() !== validUntil) {
    throw new Error("Tag-push rehearsal valid_until is invalid.");
  }
  if (now.getTime() + minimumRemainingSeconds * 1000 >= validUntilMs) {
    throw new Error("Tag-push rehearsal authority lacks the required attestation completion safety margin before expiry.");
  }
  return Object.freeze({
    valid_until: validUntil,
    checked_at: now.toISOString(),
    minimum_remaining_seconds: minimumRemainingSeconds,
  });
}

function readFatalUtf8(path) {
  return new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path));
}

export function runProductionReleaseRehearsalAuthorityCli(argv, dependencies = {}) {
  const {
    output = process.stdout,
    now = new Date(),
    readSource = readFatalUtf8,
    verifyAuthority = verifyRehearsalReceiptBundleAuthority,
    readSelection = readRehearsalSelectionArtifact,
    resolveSelectionAuthority = resolveCandidateRehearsalSourceAuthority,
    resolveCurrentTipAuthority = resolveRehearsalSelectionSource,
  } = dependencies;
  const options = parseArgs(argv);
  if (!options.json) throw new Error("Rehearsal authority verification requires --json.");
  if (options.memberReceiptPaths.length !== 2) throw new Error("Exactly two --member-receipt paths are required.");
  if (!options.repeatabilityReceiptPath) throw new Error("--repeatability-receipt is required.");
  if (!/^[0-9a-f]{40}$/u.test(options.releaseSha ?? "")) throw new Error("--release-sha must be exact lowercase 40-hex.");
  if (!/^[0-9a-f]{40}$/u.test(options.releaseTree ?? "")) throw new Error("--release-tree must be exact lowercase 40-hex.");
  if (!/^[0-9a-f]{40}$/u.test(options.currentMasterSha ?? "")) throw new Error("--current-master-sha must be exact lowercase 40-hex.");
  if (!options.repositoryRoot || !isAbsolute(options.repositoryRoot)) throw new Error("--repository-root must be an absolute trusted current-master checkout.");
  const repositoryRoot = resolve(options.repositoryRoot);
  const receiptAuthority = verifyAuthority({
    memberSources: options.memberReceiptPaths.map(readSource),
    repeatabilitySource: readSource(options.repeatabilityReceiptPath),
    now,
  });
  if (receiptAuthority.release_sha !== options.releaseSha || receiptAuthority.release_tree !== options.releaseTree) {
    throw new Error("Rehearsal receipt SHA/tree does not match the exact release authority.");
  }
  let selectionAuthority;
  if (receiptAuthority.selection_digest === null) {
    if (options.selectionPath !== null) {
      throw new Error("Current-tip rehearsal authority must not supply a selection artifact.");
    }
    const currentTip = resolveCurrentTipAuthority({
      releaseSha: options.releaseSha,
      rootDir: repositoryRoot,
    });
    if (
      currentTip.observed_master_sha !== options.currentMasterSha
      || currentTip.selected_sha !== options.releaseSha
      || currentTip.selected_tree !== options.releaseTree
      || currentTip.observed_master_tree !== options.releaseTree
    ) {
      throw new Error("Current-tip rehearsal authority does not match the complete current master history.");
    }
    selectionAuthority = emptyRehearsalSelectionAuthority();
  } else {
    if (!options.selectionPath || !isAbsolute(options.selectionPath)) {
      throw new Error("Selected-ancestor rehearsal authority requires an absolute selection artifact path.");
    }
    const selection = readSelection(options.selectionPath, {
      repoRoot: repositoryRoot,
      now,
    });
    if (selection.selection_digest !== receiptAuthority.selection_digest) {
      throw new Error("Selection artifact digest does not match the repeatability authority.");
    }
    const lineage = resolveSelectionAuthority({
      releaseSha: options.releaseSha,
      rootDir: repositoryRoot,
      selection,
      now,
    });
    if (
      lineage.current_master_sha !== options.currentMasterSha
      || lineage.release_sha !== options.releaseSha
      || lineage.release_tree !== options.releaseTree
      || lineage.selection_digest !== receiptAuthority.selection_digest
    ) {
      throw new Error("Selection artifact lineage does not match the current trusted master authority.");
    }
    selectionAuthority = projectRehearsalSelectionAuthority(selection, {
      now,
      requireFresh: true,
    });
  }
  const authority = Object.freeze({
    ...receiptAuthority,
    ...selectionAuthority,
  });
  if (options.minimumRemainingSeconds !== null) {
    assertRehearsalAuthorityFreshForTagPush({
      validUntil: authority.rehearsal_receipt_valid_until,
      now,
      minimumRemainingSeconds: options.minimumRemainingSeconds,
    });
  }
  output.write(`${canonicalizeJcs(authority)}\n`);
  return authority;
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  try {
    runProductionReleaseRehearsalAuthorityCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
