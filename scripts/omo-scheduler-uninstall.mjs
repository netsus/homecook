#!/usr/bin/env node

import { existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

import {
  resolveLaunchAgentLabel,
  resolveLaunchAgentPlistPath,
} from "./lib/omo-scheduler.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/omo-scheduler-uninstall.mjs --work-item <id> [options]",
      "",
      "Options:",
      "  --work-item <id>                 Workflow-v2 work item id",
      "  --home-dir <path>                Override HOME used for plist lookup",
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
    if (token === "--work-item" || token === "--home-dir") {
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

  if (!options.workItem) {
    throw new Error("--work-item is required.");
  }

  const homeDir = options.homeDir ?? process.env.HOME;
  const plistPath = resolveLaunchAgentPlistPath(options.workItem, homeDir);
  const label = resolveLaunchAgentLabel(options.workItem);
  const uid = typeof process.getuid === "function" ? process.getuid() : null;
  if (!Number.isInteger(uid)) {
    throw new Error("Current platform does not support launchctl gui user removal.");
  }

  spawnSync("launchctl", ["bootout", `gui/${uid}`, plistPath], {
    encoding: "utf8",
  });
  if (existsSync(plistPath)) {
    rmSync(plistPath, { force: true });
  }

  const result = {
    uninstalled: true,
    label,
    plistPath,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(`Removed ${label}\nplist: ${plistPath}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
