#!/usr/bin/env node

import {
  getLocalMacProductionReleaseStatus,
  prepareLocalMacProductionRelease,
  readLocalMacProductionRepoHeadSha,
} from "./lib/local-mac-production-release.mjs";
import {
  createGitHubProductionReleaseAttestationVerifier,
} from "./lib/github-production-release-attestation.mjs";

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/promote-local-mac-production-release.mjs plan --release-manifest <path> [--home-dir <path>] [--root-dir <path>] [--json]
  node scripts/promote-local-mac-production-release.mjs prepare --release-manifest <path> --bundle <path> --subject-manifest <path> --trusted-root <path> [--home-dir <path>] [--root-dir <path>] [--json]
  node scripts/promote-local-mac-production-release.mjs promote --release-manifest <path> [--home-dir <path>] [--root-dir <path>] [--json]
  node scripts/promote-local-mac-production-release.mjs status [--release-manifest <path>] [--home-dir <path>] [--root-dir <path>] [--json]
  node scripts/promote-local-mac-production-release.mjs verify --release-manifest <path> [--home-dir <path>] [--root-dir <path>] [--json]

Currently implemented in this stage: plan, prepare, status
Currently blocked fail-closed in this stage: promote, verify

Prepare creates an immutable candidate directory only; it does not acquire the production lock or change runtime state.
The blocked commands intentionally refuse to run until the production mutation path is implemented.
`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    command,
    bundlePath: null,
    homeDir: process.env.HOME ?? "",
    json: false,
    releaseManifestPath: null,
    rootDir: process.cwd(),
    subjectManifestPath: null,
    trustedRootPath: null,
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

    if (token === "--bundle") {
      options.bundlePath = value;
    } else if (token === "--release-manifest") {
      options.releaseManifestPath = value;
    } else if (token === "--home-dir") {
      options.homeDir = value;
    } else if (token === "--root-dir") {
      options.rootDir = value;
    } else if (token === "--subject-manifest") {
      options.subjectManifestPath = value;
    } else if (token === "--trusted-root") {
      options.trustedRootPath = value;
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
  if (result.prepared) {
    process.stdout.write(`prepared: yes\n`);
    process.stdout.write(`release_dir: ${result.release_dir}\n`);
  }
  if (result.lock) {
    process.stdout.write(`lock: ${result.lock.locked ? "held" : "free"}\n`);
    process.stdout.write(`stale_candidate: ${result.lock.staleCandidate ? "yes" : "no"}\n`);
  }
}

function isBlockedStageCommand(command) {
  return ["promote", "verify"].includes(command);
}

function assertSupportedStageCommand(command) {
  if (isBlockedStageCommand(command)) {
    throw new Error(
      `Command "${command}" is currently blocked fail-closed in this stage. `
      + "Use plan/prepare/status only until the production mutation path is implemented.",
    );
  }
}

try {
  const options = parseArgs(process.argv.slice(2));

  if (!options.command || options.command === "help" || options.command === "--help") {
    printHelp();
    process.exit(0);
  }

  if (isBlockedStageCommand(options.command)) {
    assertSupportedStageCommand(options.command);
  }

  if (options.command === "plan" && !options.releaseManifestPath) {
    throw new Error("plan requires --release-manifest <path>.");
  }
  if (options.command === "prepare" && !options.releaseManifestPath) {
    throw new Error("prepare requires --release-manifest <path>.");
  }
  if (
    options.command === "prepare"
    && (!options.bundlePath || !options.subjectManifestPath || !options.trustedRootPath)
  ) {
    throw new Error(
      "prepare requires --bundle <path>, --subject-manifest <path>, and --trusted-root <path>.",
    );
  }

  if (!["plan", "prepare", "promote", "status", "verify"].includes(options.command)) {
    throw new Error(`Unknown command: ${options.command}`);
  }

  const result = options.command === "prepare"
    ? prepareLocalMacProductionRelease({
      homeDir: options.homeDir,
      manifestPath: options.releaseManifestPath,
      rootDir: options.rootDir,
      verifyAttestation: createGitHubProductionReleaseAttestationVerifier({
        bundlePath: options.bundlePath,
        repository: "netsus/homecook",
        signerWorkflow: "netsus/homecook/.github/workflows/production-release-attestation.yml",
        sourceRef: "refs/heads/master",
        subjectManifestPath: options.subjectManifestPath,
        trustedRootPath: options.trustedRootPath,
      }),
    })
    : getLocalMacProductionReleaseStatus({
      currentHeadSha: readLocalMacProductionRepoHeadSha({ rootDir: options.rootDir }),
      homeDir: options.homeDir,
      manifestPath: options.releaseManifestPath,
    });

  printResult(result, options.json);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
