#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { TextDecoder } from "node:util";

import { canonicalizeJcs } from "./lib/rfc8785-jcs.mjs";
import { verifyRehearsalReceiptBundleAuthority } from "./lib/local-mac-production-rehearsal-receipts.mjs";

function parseArgs(argv) {
  const options = {
    memberReceiptPaths: [],
    repeatabilityReceiptPath: null,
    releaseSha: null,
    releaseTree: null,
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
    else throw new Error(`Unknown rehearsal authority option: ${token}`);
  }
  return options;
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
  } = dependencies;
  const options = parseArgs(argv);
  if (!options.json) throw new Error("Rehearsal authority verification requires --json.");
  if (options.memberReceiptPaths.length !== 2) throw new Error("Exactly two --member-receipt paths are required.");
  if (!options.repeatabilityReceiptPath) throw new Error("--repeatability-receipt is required.");
  if (!/^[0-9a-f]{40}$/u.test(options.releaseSha ?? "")) throw new Error("--release-sha must be exact lowercase 40-hex.");
  if (!/^[0-9a-f]{40}$/u.test(options.releaseTree ?? "")) throw new Error("--release-tree must be exact lowercase 40-hex.");
  const authority = verifyAuthority({
    memberSources: options.memberReceiptPaths.map(readSource),
    repeatabilitySource: readSource(options.repeatabilityReceiptPath),
    now,
  });
  if (authority.release_sha !== options.releaseSha || authority.release_tree !== options.releaseTree) {
    throw new Error("Rehearsal receipt SHA/tree does not match the exact release authority.");
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
