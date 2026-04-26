#!/usr/bin/env node

import { updateReplayAcceptance } from "./lib/omo-replay-acceptance.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/omo-replay-update.mjs --section <section> --status <status> [options]",
      "",
      "Sections:",
      "  lane | summary",
      "",
      "Options:",
      "  --section <section>             Target section in .workflow-v2/replay-acceptance.json",
      "  --id <id>                       Required for lane",
      "  --status <status>               New status value",
      "  --note <text>                   Replace notes field",
      "  --evidence-ref <path>           Append evidence ref (lane only, repeatable)",
      "  --work-item-ref <path>          Append work item ref (lane only, repeatable)",
      "  --incident-id <id>              Append incident id (lane only, repeatable)",
      "  --blocking-lane-id <id>         Replace summary blocking lanes when used with summary (repeatable)",
      "  --criteria <key>=<true|false>   Update lane criteria (repeatable)",
      "  --sync-promotion-gate           Recalculate promotion gate from replay acceptance after update",
      "  --now <iso-timestamp>           Override timestamp for deterministic runs/tests",
      "  --json                          Print JSON result",
      "  --help                          Show this help text",
      "",
    ].join("\n"),
  );
}

function requireValue(argv, index, token) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${token} requires a value.`);
  }

  return value;
}

function parseCriteriaToken(value) {
  const [rawKey, rawBool] = value.split("=");
  if (!rawKey || !rawBool) {
    throw new Error("--criteria expects <key>=<true|false>.");
  }

  const normalizedBool = rawBool.trim().toLowerCase();
  if (normalizedBool !== "true" && normalizedBool !== "false") {
    throw new Error("--criteria boolean must be true or false.");
  }

  return {
    key: rawKey.trim(),
    value: normalizedBool === "true",
  };
}

function parseArgs(argv) {
  const options = {
    evidenceRefs: [],
    workItemRefs: [],
    incidentIds: [],
    blockingLaneIds: [],
    criteria: {},
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--") continue;
    if (token === "--help") {
      options.help = true;
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--sync-promotion-gate") {
      options.syncPromotionGate = true;
      continue;
    }

    if (token === "--section" || token === "--id" || token === "--status" || token === "--note" || token === "--now") {
      const key = token
        .replace(/^--/, "")
        .replace(/-([a-z])/g, (_, character) => character.toUpperCase());
      options[key] = requireValue(argv, index, token);
      index += 1;
      continue;
    }

    if (token === "--evidence-ref") {
      options.evidenceRefs.push(requireValue(argv, index, token));
      index += 1;
      continue;
    }

    if (token === "--work-item-ref") {
      options.workItemRefs.push(requireValue(argv, index, token));
      index += 1;
      continue;
    }

    if (token === "--incident-id") {
      options.incidentIds.push(requireValue(argv, index, token));
      index += 1;
      continue;
    }

    if (token === "--blocking-lane-id") {
      options.blockingLaneIds.push(requireValue(argv, index, token));
      index += 1;
      continue;
    }

    if (token === "--criteria") {
      const parsed = parseCriteriaToken(requireValue(argv, index, token));
      options.criteria[parsed.key] = parsed.value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  const result = updateReplayAcceptance({
    rootDir: process.cwd(),
    section: options.section,
    id: options.id,
    status: options.status,
    note: options.note,
    evidenceRefs: options.evidenceRefs,
    workItemRefs: options.workItemRefs,
    incidentIds: options.incidentIds,
    blockingLaneIds: options.blockingLaneIds,
    criteria: options.criteria,
    syncPromotionGate: options.syncPromotionGate,
    now: options.now,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(
    [
      `Section: ${result.section}`,
      `ID: ${result.id ?? "-"}`,
      `File: ${result.filePath}`,
      `Status: ${result.updatedEntry.status ?? "-"}`,
      `Promotion sync: ${result.promotionSync?.updated ? "updated" : result.promotionSync ? "unchanged" : "skipped"}`,
    ].join("\n") + "\n",
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
