#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import {
  DEFAULT_TICK_INTERVAL_SECONDS,
  formatLaunchAgentSnapshot,
  readLaunchAgentSnapshot,
  renderLaunchAgentPlist,
  resolveLaunchAgentLabel,
  resolveLaunchAgentPlistPath,
  resolveSchedulerBins,
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

function runLaunchctl(args) {
  const result = spawnSync("launchctl", args, {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    throw new Error(stderr.length > 0 ? stderr : `launchctl ${args.join(" ")} failed.`);
  }
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
  const plistPath = resolveLaunchAgentPlistPath(options.workItem, homeDir);
  const bins = resolveSchedulerBins({
    rootDir: process.cwd(),
    pnpmBin: options.pnpmBin,
    ghBin: options.ghBin,
    claudeBin: options.claudeBin,
    opencodeBin: options.opencodeBin,
    homeDir,
  });
  const plist = renderLaunchAgentPlist({
    rootDir: process.cwd(),
    workItemId: options.workItem,
    homeDir,
    intervalSeconds: options.intervalSeconds,
    bins,
  });
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (!Number.isInteger(uid)) {
    throw new Error("Current platform does not support launchctl gui user installation.");
  }

  mkdirSync(plistPath.replace(/\/[^/]+$/, ""), { recursive: true });
  mkdirSync(`${homeDir}/Library/Logs/homecook`, { recursive: true });
  writeFileSync(plistPath, plist);

  const label = resolveLaunchAgentLabel(options.workItem);
  spawnSync("launchctl", ["bootout", `gui/${uid}`, plistPath], {
    encoding: "utf8",
  });
  runLaunchctl(["bootstrap", `gui/${uid}`, plistPath]);
  runLaunchctl(["kickstart", "-k", `gui/${uid}/${label}`]);

  const snapshot = readLaunchAgentSnapshot({
    workItemId: options.workItem,
    homeDir,
  });
  const result = {
    installed: true,
    label,
    plistPath,
    intervalSeconds: options.intervalSeconds,
    bins,
    snapshot,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(
    [`Installed ${label}`, `plist: ${plistPath}`, "", formatLaunchAgentSnapshot(snapshot)].join("\n") + "\n",
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
