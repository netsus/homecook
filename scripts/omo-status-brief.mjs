#!/usr/bin/env node

import { readWorkItemSessionStatus } from "./lib/omo-session-orchestrator.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/omo-status-brief.mjs --work-item <id> [options]",
      "",
      "Options:",
      "  --work-item <id>                 Workflow-v2 work item id",
      "  --slice <id>                     Optional slice override for non-product work items",
      "  --help                           Show this help text",
      "",
      "Example:",
      "  pnpm omo:status:brief -- --work-item 05-planner-week-core",
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
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--") continue;
    if (token === "--help") {
      options.help = true;
      continue;
    }

    if (token === "--work-item" || token === "--slice") {
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

function resolveActiveStage(runtime) {
  const waitStage = Number.isInteger(runtime?.wait?.stage) ? runtime.wait.stage : null;
  if (waitStage) {
    return waitStage;
  }

  const activeStage =
    Number.isInteger(runtime?.active_stage) && runtime.active_stage >= 1
      ? runtime.active_stage
      : null;
  if (activeStage) {
    return activeStage;
  }

  const lastCompleted =
    Number.isInteger(runtime?.last_completed_stage) && runtime.last_completed_stage >= 0
      ? runtime.last_completed_stage
      : null;
  const currentStage =
    Number.isInteger(runtime?.current_stage) && runtime.current_stage >= 1
      ? runtime.current_stage
      : null;
  const isRunning = typeof runtime?.lock?.owner === "string" && runtime.lock.owner.trim().length > 0;

  if (isRunning && lastCompleted !== null && lastCompleted >= 0 && lastCompleted < 6) {
    return lastCompleted + 1;
  }

  return currentStage ?? lastCompleted ?? "-";
}

function formatStatus(status) {
  const runtime = status.runtime ?? {};
  const wait = runtime.wait ?? null;
  const phase =
    typeof runtime.phase === "string" && runtime.phase.trim().length > 0
      ? runtime.phase.trim()
      : "-";
  const nextAction =
    typeof runtime.next_action === "string" && runtime.next_action.trim().length > 0
      ? runtime.next_action.trim()
      : "-";
  const mode = wait?.kind ?? (phase === "done" ? "done" : runtime.lock?.owner ? "running" : "idle");

  return [
    `workItem        : ${status.workItemId}`,
    `activeStage     : ${resolveActiveStage(runtime)}`,
    `lastCompleted   : ${runtime.last_completed_stage ?? "-"}`,
    `phase           : ${phase}`,
    `nextAction      : ${nextAction}`,
    `mode            : ${mode}`,
    `branchRole      : ${runtime.workspace?.branch_role ?? "-"}`,
    `backendPr       : ${runtime.prs?.backend?.url ?? "-"}`,
    `frontendPr      : ${runtime.prs?.frontend?.url ?? "-"}`,
    `closeoutPr      : ${runtime.prs?.closeout?.url ?? "-"}`,
    `recovery        : ${runtime.recovery?.kind ?? "-"}`,
    `lockOwner       : ${runtime.lock?.owner ?? "-"}`,
  ].join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  const status = readWorkItemSessionStatus({
    workItemId: options.workItem,
    slice: options.slice,
  });

  process.stdout.write(`${formatStatus(status)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
