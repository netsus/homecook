#!/usr/bin/env node

import { updatePromotionEvidence } from "./lib/omo-promotion-evidence.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/omo-promotion-update.mjs --section <section> --status <status> [options]",
      "",
      "Sections:",
      "  documentation-gate | operational-gate | pilot-lane | promotion-gate",
      "",
      "Options:",
      "  --section <section>             Target section in .workflow-v2/promotion-evidence.json",
      "  --id <id>                       Required for documentation-gate / operational-gate / pilot-lane",
      "  --status <status>               New status value",
      "  --note <text>                   Replace notes field",
      "  --evidence-ref <path>           Append evidence ref (gate sections only, repeatable)",
      "  --workpack-ref <path>           Append workpack ref (pilot-lane only, repeatable)",
      "  --checkpoint-ref <id>           Append checkpoint ref (pilot-lane only, repeatable)",
      "  --blocker <text>                Replace blockers when used with promotion-gate (repeatable)",
      "  --clear-blockers                Clear existing promotion-gate blockers",
      "  --next-review-trigger <text>    Replace promotion-gate next review trigger",
      "  --now <iso-timestamp>           Override timestamp for deterministic runs/tests",
      "  --json                          Print JSON result",
      "  --help                          Show this help text",
      "",
      "Examples:",
      "  pnpm omo:promotion:update -- --section pilot-lane --id authority-required-ui --status in_progress --checkpoint-ref stage4-ready-for-review --note \"slice06 Stage 4 running\"",
      "  pnpm omo:promotion:update -- --section operational-gate --id live-smoke-standard --status partial --evidence-ref .opencode/README.md --note \"still on-demand\"",
      "  pnpm omo:promotion:update -- --section promotion-gate --status not-ready --blocker \"external-smoke lane evidence missing\" --next-review-trigger \"After slice06 Stage 6\"",
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

function parseArgs(argv) {
  const options = {
    evidenceRefs: [],
    workpackRefs: [],
    checkpointRefs: [],
    blockers: [],
    clearBlockers: false,
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
    if (token === "--clear-blockers") {
      options.clearBlockers = true;
      continue;
    }

    if (
      token === "--section" ||
      token === "--id" ||
      token === "--status" ||
      token === "--note" ||
      token === "--next-review-trigger" ||
      token === "--now"
    ) {
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

    if (token === "--workpack-ref") {
      options.workpackRefs.push(requireValue(argv, index, token));
      index += 1;
      continue;
    }

    if (token === "--checkpoint-ref") {
      options.checkpointRefs.push(requireValue(argv, index, token));
      index += 1;
      continue;
    }

    if (token === "--blocker") {
      options.blockers.push(requireValue(argv, index, token));
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

  const result = updatePromotionEvidence({
    rootDir: process.cwd(),
    section: options.section,
    id: options.id,
    status: options.status,
    note: options.note,
    evidenceRefs: options.evidenceRefs,
    workpackRefs: options.workpackRefs,
    checkpointRefs: options.checkpointRefs,
    blockers: options.blockers,
    clearBlockers: options.clearBlockers,
    nextReviewTrigger: options.nextReviewTrigger,
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
    ].join("\n") + "\n",
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
