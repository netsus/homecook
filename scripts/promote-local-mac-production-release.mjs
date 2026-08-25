#!/usr/bin/env node

import {
  getLocalMacProductionReleaseStatus,
  readLocalMacProductionRepoHeadSha,
} from "./lib/local-mac-production-release.mjs";

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/promote-local-mac-production-release.mjs plan --release-manifest <path> [--home-dir <path>] [--root-dir <path>] [--json]
  node scripts/promote-local-mac-production-release.mjs status [--release-manifest <path>] [--home-dir <path>] [--root-dir <path>] [--json]

Both commands are read-only. They validate the exact approved release identity and report the current production promotion lock.
`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    command,
    homeDir: process.env.HOME ?? "",
    json: false,
    releaseManifestPath: null,
    rootDir: process.cwd(),
  };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--") {
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }

    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${token} requires a value.`);
    }

    if (token === "--release-manifest") {
      options.releaseManifestPath = value;
    } else if (token === "--home-dir") {
      options.homeDir = value;
    } else if (token === "--root-dir") {
      options.rootDir = value;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
    index += 1;
  }

  return options;
}

function printResult(result, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (result.manifest) {
    process.stdout.write(`release_tag: ${result.manifest.release_tag}\n`);
    process.stdout.write(`release_sha: ${result.manifest.release_sha}\n`);
  } else {
    process.stdout.write("release_tag: -\n");
    process.stdout.write("release_sha: -\n");
  }
  process.stdout.write(`current_head_sha: ${result.current_head_sha ?? "-"}\n`);
  process.stdout.write(`lock: ${result.lock.locked ? "held" : "free"}\n`);
  process.stdout.write(`stale_candidate: ${result.lock.staleCandidate ? "yes" : "no"}\n`);
}

try {
  const options = parseArgs(process.argv.slice(2));

  if (!options.command || options.command === "help" || options.command === "--help") {
    printHelp();
    process.exit(0);
  }

  if (options.command === "plan" && !options.releaseManifestPath) {
    throw new Error("plan requires --release-manifest <path>.");
  }

  if (!["plan", "status"].includes(options.command)) {
    throw new Error(`Unknown command: ${options.command}`);
  }

  const result = getLocalMacProductionReleaseStatus({
    currentHeadSha: readLocalMacProductionRepoHeadSha({ rootDir: options.rootDir }),
    homeDir: options.homeDir,
    manifestPath: options.releaseManifestPath,
  });

  printResult(result, options.json);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
