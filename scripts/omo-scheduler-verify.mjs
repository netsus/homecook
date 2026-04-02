#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import {
  DEFAULT_TICK_INTERVAL_SECONDS,
  formatLaunchAgentSnapshot,
  readLaunchAgentSnapshot,
  toSerializableLaunchAgentSnapshot,
  verifyLaunchAgentAlignment,
} from "./lib/omo-scheduler.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/omo-scheduler-verify.mjs --work-item <id> [options]",
      "",
      "Options:",
      "  --work-item <id>                 Workflow-v2 work item id",
      "  --interval-seconds <seconds>     Expected launchd StartInterval (default: 600)",
      "  --home-dir <path>                Override HOME used for plist/log paths",
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
    intervalSeconds: DEFAULT_TICK_INTERVAL_SECONDS,
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
    if (token === "--work-item" || token === "--interval-seconds" || token === "--home-dir") {
      const key = token
        .replace(/^--/, "")
        .replace(/-([a-z])/g, (_, character) => character.toUpperCase());
      options[key] = requireValue(argv, index, token);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  options.intervalSeconds = Number.parseInt(String(options.intervalSeconds), 10);
  if (!Number.isInteger(options.intervalSeconds) || options.intervalSeconds < 60) {
    throw new Error("--interval-seconds must be an integer >= 60.");
  }

  return options;
}

function runTickWatch(workItemId) {
  const result = spawnSync(
    "pnpm",
    ["omo:tick:watch", "--", "--work-item", workItemId, "--json"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || result.stdout?.trim() || "omo:tick:watch failed.");
  }

  return JSON.parse(result.stdout);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    process.exit(0);
  }

  if (!options.workItem) {
    throw new Error("--work-item is required.");
  }

  const homeDir = options.homeDir ?? process.env.HOME;
  const launchSnapshot = readLaunchAgentSnapshot({
    workItemId: options.workItem,
    homeDir,
  });
  const tickWatchSnapshot = runTickWatch(options.workItem);
  const verification = verifyLaunchAgentAlignment({
    workItemId: options.workItem,
    expectedIntervalSeconds: options.intervalSeconds,
    homeDir,
    launchSnapshot,
    tickWatchSnapshot,
  });
  const result = {
    ...verification,
    launchSnapshot: toSerializableLaunchAgentSnapshot(launchSnapshot),
    tickWatchSnapshot,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(
      [
        `Scheduler verify: ${verification.ok ? "pass" : "fail"}`,
        "",
        formatLaunchAgentSnapshot(launchSnapshot),
        "",
        verification.errors.length > 0 ? verification.errors.map((error) => `- ${error}`).join("\n") : "- aligned",
      ].join("\n") + "\n",
    );
  }

  if (!verification.ok) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
