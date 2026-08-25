#!/usr/bin/env node

import {
  installFullLocalLaunchAgent,
  parseFullLocalLaunchAgentArgs,
  readFullLocalLaunchAgentStatus,
  uninstallFullLocalLaunchAgent,
} from "./lib/full-local-launch-agent.mjs";
import { validateLocalMacProductionMutationAuthority } from "./lib/local-mac-production-release.mjs";

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/full-local-launch-agent.mjs install [--config <absolute-path>] [--home-dir <path>] [--node-bin <path>] [--root-dir <path>] [--json]
  node scripts/full-local-launch-agent.mjs status [--home-dir <path>] [--json]
  node scripts/full-local-launch-agent.mjs uninstall [--home-dir <path>] [--json]

The LaunchAgent only manages the macOS login-time full-local start job.
It never stops Docker or deletes Docker named volumes.
`);
}

function printResult(result, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  const lines = [];
  for (const [key, value] of Object.entries(result)) {
    lines.push(`${key}: ${value === null ? "-" : value}`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

try {
  const options = parseFullLocalLaunchAgentArgs(process.argv.slice(2));

  if (!options.command || options.command === "help" || options.command === "--help") {
    printHelp();
    process.exit(0);
  }

  const mutationAuthority = validateLocalMacProductionMutationAuthority({
    command: options.command,
    homeDir: options.homeDir,
    lockToken: options.lockToken ?? null,
    releaseManifestPath: options.releaseManifestPath ?? null,
    rootDir: options.rootDir,
  });

  if (options.command === "install") {
    printResult(
      installFullLocalLaunchAgent({
        configPath: options.configPath,
        homeDir: options.homeDir,
        mutationAuthority,
        nodeBin: options.nodeBin,
        rootDir: options.rootDir,
      }),
      options.json,
    );
    process.exit(0);
  }

  if (options.command === "status") {
    printResult(
      readFullLocalLaunchAgentStatus({
        homeDir: options.homeDir,
      }),
      options.json,
    );
    process.exit(0);
  }

  if (options.command === "uninstall") {
    printResult(
      uninstallFullLocalLaunchAgent({
        homeDir: options.homeDir,
        mutationAuthority,
      }),
      options.json,
    );
    process.exit(0);
  }

  throw new Error(`Unknown command: ${options.command}`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
