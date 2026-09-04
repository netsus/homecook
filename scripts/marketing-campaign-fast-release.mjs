#!/usr/bin/env node

import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import {
  assertCampaignCommandAllowed,
  validateCampaignManifest,
  verifyCampaignActiveTransaction,
} from "./lib/marketing-campaign-fast-release.mjs";
import { createDefaultCampaignReleaseOperations } from "./lib/marketing-campaign-fast-release-operations.mjs";

export const CAMPAIGN_PROMOTION_ACTIVATION_BLOCKED = true;

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const options = {
    command, json: false, manifestPath: null, authorityRoot: null, activeTransaction: null,
    releaseSha: null, productionEnvAuthority: null, candidate: null, homeDir: null, rawArgs: rest,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--") continue;
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (["--manifest", "--authority-root", "--active-transaction", "--release-sha", "--production-env-authority", "--candidate", "--home-dir"].includes(token)) {
      const value = rest[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${token} requires a value.`);
      if (token === "--manifest") options.manifestPath = value;
      if (token === "--authority-root") options.authorityRoot = value;
      if (token === "--active-transaction") options.activeTransaction = value;
      if (token === "--release-sha") options.releaseSha = value;
      if (token === "--production-env-authority") options.productionEnvAuthority = value;
      if (token === "--candidate") options.candidate = value;
      if (token === "--home-dir") options.homeDir = value;
      index += 1;
      continue;
    }
    if (token.startsWith("--")) {
      const value = rest[index + 1];
      if (value && !value.startsWith("--")) index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return options;
}

function printHelp(output) {
  output.write("Usage: marketing-campaign-fast-release <plan|prepare|rehearse|promote|status|verify|rollback> [--manifest path] [--json]\n");
}

function readActiveTransaction(path) {
  if (!isAbsolute(path)) throw new Error("--active-transaction must be absolute.");
  const absolute = resolve(path);
  const stat = lstatSync(absolute);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1
    || stat.uid !== process.getuid?.() || ![0o400, 0o600].includes(stat.mode & 0o777)
    || stat.size > 1024 * 1024 || realpathSync(absolute) !== absolute) {
    throw new Error("--active-transaction must be a private current-user single-link file.");
  }
  return verifyCampaignActiveTransaction(JSON.parse(readFileSync(absolute, "utf8")));
}

/**
 * @param {string[]} argv
 * @param {{
 *   clock?: () => Date,
 *   output?: { write: Function },
 *   createProductionAdapters?: ((input: { manifest: Record<string, any> }) => Record<string, Function>) | null,
 *   operations?: Record<string, Function>,
 *   activationBlocked?: boolean,
 * }} dependencies
 */
export async function runMarketingCampaignFastReleaseCli(
  argv,
  {
    clock = () => new Date(),
    output = process.stdout,
    createProductionAdapters = null,
    operations = createDefaultCampaignReleaseOperations(),
    activationBlocked = CAMPAIGN_PROMOTION_ACTIVATION_BLOCKED,
  } = {},
) {
  const options = parseArgs(argv);
  if (options.command === "help" || options.command === "--help") {
    printHelp(output);
    return { help: true };
  }
  const activeTransaction = options.command === "rollback" && options.activeTransaction
    ? readActiveTransaction(options.activeTransaction)
    : null;
  assertCampaignCommandAllowed({ command: options.command, now: clock(), activeTransaction });
  if (options.command === "promote" && activationBlocked) {
    throw new Error(
      "activation_blocked: campaign promote requires independent review, current-head green checks, and release-promoter activation before production adapters are created.",
    );
  }
  if (["plan", "prepare", "rehearse", "rollback"].includes(options.command)) {
    const operation = operations[options.command];
    if (typeof operation !== "function") throw new Error(`${options.command} operation is unavailable.`);
    const result = await operation(options, { clock });
    output.write(`${JSON.stringify(result, null, options.json ? 2 : 0)}\n`);
    return result;
  }
  if (!options.manifestPath) throw new Error(`${options.command} requires --manifest <path>.`);
  const manifest = validateCampaignManifest(
    JSON.parse(readFileSync(options.manifestPath, "utf8")),
    { now: clock(), requireFresh: !["status", "verify"].includes(options.command) },
  );
  if (options.command === "status" || options.command === "verify") {
    const result = { command: options.command, manifest, read_only: true };
    output.write(`${JSON.stringify(result, null, options.json ? 2 : 0)}\n`);
    return result;
  }
  if (options.command === "promote") {
    if (typeof createProductionAdapters !== "function") {
      throw new Error("Campaign production adapter factory is unavailable.");
    }
    throw new Error("activation_blocked: promote requires the complete downloaded authority bundle, not a manifest-only adapter path.");
  }
  throw new Error(`Unknown campaign command: ${options.command}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMarketingCampaignFastReleaseCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
