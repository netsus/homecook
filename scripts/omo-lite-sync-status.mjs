#!/usr/bin/env node

import { syncWorkflowV2Status } from "./lib/omo-lite-supervisor.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/omo-lite-sync-status.mjs --work-item <id> [options]",
      "",
      "Options:",
      "  --work-item <id>                 Workflow v2 work item id",
      "  --branch <name>                  Branch name to record",
      "  --pr-path <url>                  PR URL or pending marker",
      "  --lifecycle <state>              planned | in_progress | ready_for_review | blocked | merged | archived",
      "  --approval-state <state>         not_started | needs_revision | claude_approved | codex_approved | awaiting_claude_or_human | dual_approved | human_escalation",
      "  --verification-status <state>    pending | passed | failed | skipped",
      "  --notes <text>                   Notes string to record",
      "  --updated-at <timestamp>         Override updated_at timestamp",
      "  --json                           Print the resulting status item as JSON",
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
      token === "--branch" ||
      token === "--pr-path" ||
      token === "--lifecycle" ||
      token === "--approval-state" ||
      token === "--verification-status" ||
      token === "--notes" ||
      token === "--updated-at"
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

function buildPatch(options) {
  return {
    ...(options.branch !== undefined ? { branch: options.branch } : {}),
    ...(options.prPath !== undefined ? { pr_path: options.prPath } : {}),
    ...(options.lifecycle !== undefined ? { lifecycle: options.lifecycle } : {}),
    ...(options.approvalState !== undefined
      ? { approval_state: options.approvalState }
      : {}),
    ...(options.verificationStatus !== undefined
      ? { verification_status: options.verificationStatus }
      : {}),
    ...(options.notes !== undefined ? { notes: options.notes } : {}),
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  const result = syncWorkflowV2Status({
    workItemId: options.workItem,
    updatedAt: options.updatedAt,
    patch: buildPatch(options),
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result.statusItem, null, 2)}\n`);
    return;
  }

  process.stdout.write(`Synced workflow v2 status for ${result.statusItem.id}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
