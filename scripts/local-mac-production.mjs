#!/usr/bin/env node

import {
  activateLocalMacProduction,
  getLocalMacProductionPublicOrigin,
  LOCAL_MAC_PRODUCTION_READINESS_HOST,
  parseLocalMacProductionArgs,
  prepareProductionEnvFile,
  readLocalMacProductionStatus,
  restartLocalMacProductionLaunchAgent,
  uninstallLocalMacProductionLaunchAgent,
  waitForLocalMacProductionReady,
} from "./lib/local-mac-production.mjs";

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/local-mac-production.mjs prepare-env [--source-env <path>] [--port <port>] [--force]
  node scripts/local-mac-production.mjs install [--node-bin <path>] [--port <port>]
  node scripts/local-mac-production.mjs status
  node scripts/local-mac-production.mjs restart
  node scripts/local-mac-production.mjs uninstall

The service is bound to 0.0.0.0 for trusted LAN access. Do not expose port 3100 to the internet.
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

  if (options.command === "prepare-env") {
    const origin = getLocalMacProductionPublicOrigin({ port: options.port });
    const result = prepareProductionEnvFile({
      rootDir: options.rootDir,
      sourcePath: options.sourcePath,
      origin,
      force: options.force,
    });
    process.stdout.write(`Prepared ${result.targetPath} with mode 600.\n`);
    process.stdout.write(`Copied ${result.copiedKeyCount} production keys.\n`);
    process.stdout.write(`Omitted ${result.omittedKeys.length} development or unrelated keys.\n`);
    process.stdout.write(`Phone URL: ${result.publicOrigin}\n`);
    process.exit(0);
  }

  if (options.command === "install") {
    const result = await activateLocalMacProduction({
      rootDir: options.rootDir,
      nodeBin: options.nodeBin,
      host: options.host,
      port: options.port,
    });
    process.stdout.write(`Installed ${result.label}.\n`);
    process.stdout.write(`Bind: ${result.host}:${result.port}\n`);
    process.stdout.write(
      `Local URL: http://${LOCAL_MAC_PRODUCTION_READINESS_HOST}:${result.port}\n`,
    );
    process.stdout.write(
      `Phone URL: ${getLocalMacProductionPublicOrigin({ port: result.port })}\n`,
    );
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
    restartLocalMacProductionLaunchAgent();
    const ready = await waitForLocalMacProductionReady({
      origin: `http://${LOCAL_MAC_PRODUCTION_READINESS_HOST}:${options.port}`,
    });
    process.stdout.write(`ready: HTTP ${ready.status} after ${ready.attempts} check(s)\n`);
    printStatus(readLocalMacProductionStatus());
    process.exit(0);
  }

  if (options.command === "uninstall") {
    const result = uninstallLocalMacProductionLaunchAgent();
    process.stdout.write(`Removed ${result.plistPath}.\n`);
    process.exit(0);
  }

  throw new Error(`Unknown command: ${options.command}`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
