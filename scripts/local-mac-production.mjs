#!/usr/bin/env node

import {
  activateLocalMacProduction,
  parseLocalMacProductionArgs,
  prepareProductionEnvFile,
  readLocalMacProductionStatus,
  restartLocalMacProductionLaunchAgent,
  uninstallLocalMacProductionLaunchAgent,
  waitForLocalMacProductionReady,
} from "./lib/local-mac-production.mjs";
import { validateLocalMacProductionMutationAuthority } from "./lib/local-mac-production-release.mjs";

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/local-mac-production.mjs prepare-env [--source-env <path>] [--port <port>] [--force]
  node scripts/local-mac-production.mjs install [--node-bin <path>] [--port <port>]
  node scripts/local-mac-production.mjs status
  node scripts/local-mac-production.mjs restart
  node scripts/local-mac-production.mjs uninstall

The service is intentionally bound to 127.0.0.1 and is not exposed to the LAN or internet.
`);
}

function printStatus(status) {
  process.stdout.write(
    [
      `loaded: ${status.loaded ? "yes" : "no"}`,
      `running: ${status.running ? "yes" : "no"}`,
      `state: ${status.state}`,
      `pid: ${status.pid ?? "-"}`,
    ].join("\n") + "\n",
  );
}

try {
  const options = parseLocalMacProductionArgs(process.argv.slice(2));

  if (!options.command || options.command === "--help" || options.command === "help") {
    printHelp();
    process.exit(0);
  }

  const mutationAuthority = validateLocalMacProductionMutationAuthority({
    command: options.command,
    homeDir: process.env.HOME ?? "",
    lockToken: options.lockToken ?? null,
    releaseManifestPath: options.releaseManifestPath ?? null,
    rootDir: options.rootDir,
  });

  if (options.command === "prepare-env") {
    const origin = `http://${options.host}:${options.port}`;
    const result = prepareProductionEnvFile({
      rootDir: options.rootDir,
      sourcePath: options.sourcePath,
      origin,
      force: options.force,
    });
    process.stdout.write(`Prepared ${result.targetPath} with mode 600.\n`);
    process.stdout.write(`Copied ${result.copiedKeyCount} production keys.\n`);
    process.stdout.write(`Omitted ${result.omittedKeys.length} development or unrelated keys.\n`);
    process.exit(0);
  }

  if (options.command === "install") {
    const result = await activateLocalMacProduction({
      mutationAuthority,
      rootDir: options.rootDir,
      nodeBin: options.nodeBin,
      host: options.host,
      port: options.port,
    });
    process.stdout.write(`Installed ${result.label}.\n`);
    process.stdout.write(`URL: http://${result.host}:${result.port}\n`);
    process.stdout.write(`plist: ${result.plistPath}\n`);
    process.stdout.write(`stderr: ${result.stderrPath}\n`);
    process.stdout.write(
      `ready: HTTP ${result.ready.status} after ${result.ready.attempts} check(s)\n`,
    );
    process.exit(0);
  }

  if (options.command === "status") {
    printStatus(readLocalMacProductionStatus());
    process.exit(0);
  }

  if (options.command === "restart") {
    restartLocalMacProductionLaunchAgent({ mutationAuthority });
    const ready = await waitForLocalMacProductionReady({
      origin: `http://${options.host}:${options.port}`,
    });
    process.stdout.write(`ready: HTTP ${ready.status} after ${ready.attempts} check(s)\n`);
    printStatus(readLocalMacProductionStatus());
    process.exit(0);
  }

  if (options.command === "uninstall") {
    const result = uninstallLocalMacProductionLaunchAgent({ mutationAuthority });
    process.stdout.write(`Removed ${result.plistPath}.\n`);
    process.exit(0);
  }

  throw new Error(`Unknown command: ${options.command}`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
