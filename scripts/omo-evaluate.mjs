#!/usr/bin/env node

import { evaluateWorkItemStage } from "./lib/omo-evaluator.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/omo-evaluate.mjs --work-item <id> --stage <backend|frontend> [options]",
      "",
      "Options:",
      "  --work-item <id>                 Workflow-v2 work item id",
      "  --stage <backend|frontend>       Evaluator stage label or 2|4",
      "  --slice <id>                     Optional slice override",
      "  --artifact-dir <path>            Optional execution artifact directory override",
      "  --now <iso-timestamp>            Override timestamp for deterministic runs/tests",
      "  --json                           Print JSON output",
      "  --help                           Show this help text",
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

    if (
      token === "--work-item" ||
      token === "--stage" ||
      token === "--slice" ||
      token === "--artifact-dir" ||
      token === "--now"
    ) {
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

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  const result = evaluateWorkItemStage({
    workItemId: options.workItem,
    stage: options.stage,
    slice: options.slice,
    artifactDir: options.artifactDir,
    now: options.now,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(
    [
      `Work item: ${result.workItemId}`,
      `Slice: ${result.slice}`,
      `Stage: ${result.stage}`,
      `Outcome: ${result.outcome}`,
      `Merge eligible: ${result.mergeEligible}`,
      `Artifact dir: ${result.artifactDir}`,
      `Findings: ${result.findings.length}`,
    ].join("\n") + "\n",
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
