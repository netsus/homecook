#!/usr/bin/env node

import {
  DEFAULT_TICK_INTERVAL_SECONDS,
  ensureLaunchAgentInstalled,
  formatLaunchAgentSnapshot,
} from "./lib/omo-scheduler.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/omo-scheduler-install.mjs --work-item <id> [options]",
      "",
      "Options:",
      "  --work-item <id>                 Workflow-v2 work item id",
      "  --interval-seconds <seconds>     launchd StartInterval override (default: 600)",
      "  --pnpm-bin <path>                Override pnpm binary path",
      "  --gh-bin <path>                  Override gh binary path",
      "  --claude-bin <path>              Override claude binary path",
      "  --opencode-bin <path>            Override opencode binary path",
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
    if (
      token === "--work-item" ||
      token === "--interval-seconds" ||
      token === "--pnpm-bin" ||
      token === "--gh-bin" ||
      token === "--claude-bin" ||
      token === "--opencode-bin" ||
      token === "--home-dir"
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

  options.intervalSeconds = Number.parseInt(String(options.intervalSeconds), 10);
  if (!Number.isInteger(options.intervalSeconds) || options.intervalSeconds < 60) {
    throw new Error("--interval-seconds must be an integer >= 60.");
  }

  return options;
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

  const result = ensureLaunchAgentInstalled({
    rootDir: process.cwd(),
    workItemId: options.workItem,
    intervalSeconds: options.intervalSeconds,
    pnpmBin: options.pnpmBin,
    ghBin: options.ghBin,
    claudeBin: options.claudeBin,
    opencodeBin: options.opencodeBin,
    homeDir: options.homeDir ?? process.env.HOME,
  });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(
    [`Installed ${result.label}`, `plist: ${result.plistPath}`, "", formatLaunchAgentSnapshot(result.snapshot)].join("\n") + "\n",
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
