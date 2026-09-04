#!/usr/bin/env node

import { readFileSync } from "node:fs";

import {
  assertCampaignCommandAllowed,
  runCampaignPromotionTransaction,
  validateCampaignManifest,
} from "./lib/marketing-campaign-fast-release.mjs";

export const CAMPAIGN_PROMOTION_ACTIVATION_BLOCKED = true;

function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const options = { command, json: false, manifestPath: null };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--") continue;
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--manifest") {
      const value = rest[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--manifest requires a value.");
      options.manifestPath = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return options;
}

function printHelp(output) {
  output.write("Usage: marketing-campaign-fast-release <plan|prepare|rehearse|promote|status|verify|rollback> [--manifest path] [--json]\n");
}

/**
 * @param {string[]} argv
 * @param {{
 *   now?: () => Date,
 *   output?: NodeJS.WritableStream,
 *   createProductionAdapters?: ((input: { manifest: Record<string, any> }) => Record<string, Function>) | null,
 *   activationBlocked?: boolean,
 * }} dependencies
 */
export async function runMarketingCampaignFastReleaseCli(
  argv,
  {
    now = () => new Date(),
    output = process.stdout,
    createProductionAdapters = null,
    activationBlocked = CAMPAIGN_PROMOTION_ACTIVATION_BLOCKED,
  } = {},
) {
  const options = parseArgs(argv);
  if (options.command === "help" || options.command === "--help") {
    printHelp(output);
    return { help: true };
  }
  assertCampaignCommandAllowed({ command: options.command, now: now() });
  if (options.command === "promote" && activationBlocked) {
    throw new Error(
      "activation_blocked: campaign promote requires independent review, current-head green checks, and release-promoter activation before production adapters are created.",
    );
  }
  if (!options.manifestPath) throw new Error(`${options.command} requires --manifest <path>.`);
  const manifest = validateCampaignManifest(
    JSON.parse(readFileSync(options.manifestPath, "utf8")),
    { now: now(), requireFresh: !["status", "verify", "rollback"].includes(options.command) },
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
    return runCampaignPromotionTransaction({
      manifest,
      now: now(),
      adapters: createProductionAdapters({ manifest }),
    });
  }
  const result = { command: options.command, manifest, planned: true };
  output.write(`${JSON.stringify(result, null, options.json ? 2 : 0)}\n`);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMarketingCampaignFastReleaseCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
