#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_TICK_INTERVAL_SECONDS,
  formatLaunchAgentSnapshot,
  readLaunchAgentSnapshot,
  verifyLaunchAgentAlignment,
} from "./lib/omo-scheduler.mjs";
import { listRuntimeStates } from "./lib/omo-session-runtime.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/omo-scheduler-verify.mjs [--work-item <id>] [options]",
      "",
      "Options:",
      "  --work-item <id>                 Workflow-v2 work item id",
      "  --all                            Verify scheduler state for every repo-local runtime state",
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
    if (token === "--all") {
      options.all = true;
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
  const tickWatchScriptPath = resolve(dirname(fileURLToPath(import.meta.url)), "omo-tick-watch.mjs");
  const result = spawnSync(
    process.execPath,
    [tickWatchScriptPath, "--work-item", workItemId, "--json"],
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

function isDefaultSchedulerVerificationTarget(workItemId) {
  if (typeof workItemId !== "string" || workItemId.trim().length === 0) {
    return false;
  }

  return !workItemId.startsWith("omo-provider-smoke-") && workItemId !== "99-omo-control-plane-smoke";
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    process.exit(0);
  }

  const workItems = options.workItem
    ? [options.workItem]
    : listRuntimeStates(process.cwd())
        .map(({ state }) => state.work_item_id)
        .filter((workItemId) => typeof workItemId === "string" && workItemId.trim().length > 0)
        .filter(isDefaultSchedulerVerificationTarget)
        .sort();

  if (workItems.length === 0) {
    const result = {
      ok: true,
      skipped: true,
      reason: "no runtime states found",
      workItems: [],
    };
    process.stdout.write(
      options.json
        ? `${JSON.stringify(result, null, 2)}\n`
        : "Scheduler verify: skipped\n\n- no runtime states found; pass --work-item <id> to verify a specific launchd job\n",
    );
    return;
  }

  const homeDir = options.homeDir ?? process.env.HOME;
  const results = workItems.map((workItemId) => {
    const launchSnapshot = readLaunchAgentSnapshot({
      workItemId,
      homeDir,
    });
    const tickWatchSnapshot = runTickWatch(workItemId);
    const verification = verifyLaunchAgentAlignment({
      workItemId,
      expectedIntervalSeconds: options.intervalSeconds,
      homeDir,
      launchSnapshot,
      tickWatchSnapshot,
    });

    return {
      workItemId,
      ...verification,
      launchSnapshot,
      tickWatchSnapshot,
    };
  });
  const result = options.workItem
    ? results[0]
    : {
        ok: results.every((entry) => entry.ok),
        skipped: false,
        workItems: results,
      };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    if (options.workItem) {
      process.stdout.write(
        [
          `Scheduler verify: ${result.ok ? "pass" : "fail"}`,
          "",
          formatLaunchAgentSnapshot(readLaunchAgentSnapshot({
            workItemId: options.workItem,
            homeDir,
          })),
          "",
          result.errors.length > 0 ? result.errors.map((error) => `- ${error}`).join("\n") : "- aligned",
        ].join("\n") + "\n",
      );
    } else {
      process.stdout.write(
        [
          `Scheduler verify: ${result.ok ? "pass" : "fail"}`,
          "",
          ...results.flatMap((entry) => [
            `## ${entry.workItemId}`,
            formatLaunchAgentSnapshot(entry.launchSnapshot),
            entry.errors.length > 0 ? entry.errors.map((error) => `- ${error}`).join("\n") : "- aligned",
            "",
          ]),
        ].join("\n") + "\n",
      );
    }
  }

  if (!result.ok) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
