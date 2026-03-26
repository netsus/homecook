#!/usr/bin/env node

import { buildStageDispatch } from "./lib/omo-lite-supervisor.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/omo-lite-dispatch-stage.mjs --slice <id> --stage <1-6> [options]",
      "",
      "Options:",
      "  --slice <id>                      Product slice id, e.g. 02-discovery-filter",
      "  --stage <1-6>                     Slice workflow stage number",
      "  --claude-budget-state <state>     available | constrained | unavailable",
      "  --json                            Print JSON instead of markdown",
      "  --help                            Show this help text",
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
    claudeBudgetState: "available",
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
    if (token === "--slice" || token === "--stage" || token === "--claude-budget-state") {
      const key = token
        .replace(/^--/, "")
        .replace(/-([a-z])/g, (_, character) => character.toUpperCase());
      options[key] = requireValue(argv, index, token);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  return options;
}

function formatMarkdown(dispatch) {
  const lines = [
    `- Stage: ${dispatch.stage}`,
    `- Actor: ${dispatch.actor}`,
    `- Goal: ${dispatch.goal}`,
    `- Claude Budget State: ${dispatch.claudeBudgetState}`,
    "- Required Reads:",
    ...dispatch.requiredReads.map((value) => `  - ${value}`),
    "- Deliverables:",
    ...dispatch.deliverables.map((value) => `  - ${value}`),
    "- Verify Commands:",
    ...(dispatch.verifyCommands.length > 0
      ? dispatch.verifyCommands.map((value) => `  - ${value}`)
      : ["  - none"]),
    "- Status Patch:",
    `  - branch: ${dispatch.statusPatch.branch ?? "N/A"}`,
    `  - lifecycle: ${dispatch.statusPatch.lifecycle}`,
    `  - approval_state: ${dispatch.statusPatch.approval_state}`,
    `  - verification_status: ${dispatch.statusPatch.verification_status}`,
    `- Success Condition: ${dispatch.successCondition}`,
    `- Escalation If Blocked: ${dispatch.escalationIfBlocked}`,
  ];

  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  const dispatch = buildStageDispatch({
    slice: options.slice,
    stage: options.stage,
    claudeBudgetState: options.claudeBudgetState,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(dispatch, null, 2)}\n`);
    return;
  }

  process.stdout.write(formatMarkdown(dispatch));
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
