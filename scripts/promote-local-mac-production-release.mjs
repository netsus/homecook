#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";

import {
  getLocalMacProductionReleaseStatus,
  prepareLocalMacProductionRelease,
  promoteLocalMacProductionRelease,
  readLocalMacProductionGitReleaseEvidence,
  readLocalMacProductionRepoHeadSha,
  verifyLocalMacProductionRelease,
} from "./lib/local-mac-production-release.mjs";
import {
  createGitHubProductionReleaseAttestationVerifier,
} from "./lib/github-production-release-attestation.mjs";
import {
  createLocalMacProductionPromoteAdapters,
  createLocalMacProductionVerifyAdapters,
} from "./lib/local-mac-production-promote-adapters.mjs";
import { resolveTrustedDockerBinary } from "./lib/full-local-session-observation-reader.mjs";
import {
  assertTrustedExecutableSnapshotStable,
  resolveTrustedGhExecutable,
  resolveTrustedGitExecutable,
  resolveTrustedNodeExecutable,
  snapshotTrustedExecutables,
} from "./lib/trusted-production-release-tools.mjs";

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/promote-local-mac-production-release.mjs plan --release-manifest <path> [--home-dir <path>] [--root-dir <path>] [--json]
  node scripts/promote-local-mac-production-release.mjs prepare --release-manifest <path> --bundle <path> --subject-manifest <path> --trusted-root <path> [--home-dir <path>] [--root-dir <path>] [--json]
  node scripts/promote-local-mac-production-release.mjs promote --release-manifest <path> --bundle <path> --subject-manifest <path> --trusted-root <path> --full-local-config <path> --worker-config <path> --worker-manifest <path> --worker-credential <path> --worker-app-descriptor <path> --worker-policy <path> --worker-expected-schema <path> --worker-secret-root <path> --confirm-production LOCAL_FULL_PRODUCTION_WORKER_INSTALL [--home-dir <path>] [--root-dir <path>] [--node-bin <path>] [--json]
  node scripts/promote-local-mac-production-release.mjs status [--release-manifest <path>] [--home-dir <path>] [--root-dir <path>] [--json]
  node scripts/promote-local-mac-production-release.mjs verify --release-manifest <path> --bundle <path> --subject-manifest <path> --trusted-root <path> [--home-dir <path>] [--root-dir <path>] [--node-bin <path>] [--json]

Currently implemented: plan, prepare, promote, status, verify

Prepare creates an immutable candidate directory only; it does not acquire the production lock or change runtime state.
Promote requires exact attestation and explicit runtime paths; verify is read-only and rechecks the exact attested running bundle.
`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    command,
    bundlePath: null,
    confirmation: null,
    fullLocalConfigPath: null,
    homeDir: process.env.HOME ?? "",
    json: false,
    nodeBin: process.execPath,
    releaseManifestPath: null,
    rootDir: process.cwd(),
    subjectManifestPath: null,
    trustedRootPath: null,
    workerAppDescriptorPath: null,
    workerConfigPath: null,
    workerCredentialPath: null,
    workerExpectedSchemaPath: null,
    workerManifestPath: null,
    workerPolicyPath: null,
    workerSecretRoot: null,
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
    } else if (token === "--confirm-production") {
      options.confirmation = value;
    } else if (token === "--full-local-config") {
      options.fullLocalConfigPath = value;
    } else if (token === "--release-manifest") {
      options.releaseManifestPath = value;
    } else if (token === "--home-dir") {
      options.homeDir = value;
    } else if (token === "--root-dir") {
      options.rootDir = value;
    } else if (token === "--node-bin") {
      options.nodeBin = value;
    } else if (token === "--subject-manifest") {
      options.subjectManifestPath = value;
    } else if (token === "--trusted-root") {
      options.trustedRootPath = value;
    } else if (token === "--worker-app-descriptor") {
      options.workerAppDescriptorPath = value;
    } else if (token === "--worker-config") {
      options.workerConfigPath = value;
    } else if (token === "--worker-credential") {
      options.workerCredentialPath = value;
    } else if (token === "--worker-expected-schema") {
      options.workerExpectedSchemaPath = value;
    } else if (token === "--worker-manifest") {
      options.workerManifestPath = value;
    } else if (token === "--worker-policy") {
      options.workerPolicyPath = value;
    } else if (token === "--worker-secret-root") {
      options.workerSecretRoot = value;
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
  if (result.verified) {
    process.stdout.write("verified: yes\n");
    process.stdout.write(
      `migration_head: ${result.runtime?.full_local?.migration_head ?? "-"}\n`,
    );
  }
  if (result.lock) {
    process.stdout.write(`lock: ${result.lock.locked ? "held" : "free"}\n`);
    process.stdout.write(`stale_candidate: ${result.lock.staleCandidate ? "yes" : "no"}\n`);
  }
}

function requirePromoteRuntimeInputs(options) {
  const required = [
    ["--bundle", options.bundlePath],
    ["--subject-manifest", options.subjectManifestPath],
    ["--trusted-root", options.trustedRootPath],
    ["--full-local-config", options.fullLocalConfigPath],
    ["--worker-config", options.workerConfigPath],
    ["--worker-manifest", options.workerManifestPath],
    ["--worker-credential", options.workerCredentialPath],
    ["--worker-app-descriptor", options.workerAppDescriptorPath],
    ["--worker-policy", options.workerPolicyPath],
    ["--worker-expected-schema", options.workerExpectedSchemaPath],
    ["--worker-secret-root", options.workerSecretRoot],
    ["--confirm-production", options.confirmation],
  ];
  const missing = required.filter(([, value]) => !value).map(([flag]) => flag);
  if (missing.length > 0) {
    throw new Error(`promote requires ${missing.join(", ")}.`);
  }
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
  if (options.command === "prepare" && !options.releaseManifestPath) {
    throw new Error("prepare requires --release-manifest <path>.");
  }
  if (options.command === "promote" && !options.releaseManifestPath) {
    throw new Error("promote requires --release-manifest <path>.");
  }
  if (options.command === "verify" && !options.releaseManifestPath) {
    throw new Error("verify requires --release-manifest <path>.");
  }
  if (
    options.command === "prepare"
    && (!options.bundlePath || !options.subjectManifestPath || !options.trustedRootPath)
  ) {
    throw new Error(
      "prepare requires --bundle <path>, --subject-manifest <path>, and --trusted-root <path>.",
    );
  }
  if (options.command === "promote") {
    requirePromoteRuntimeInputs(options);
  }
  if (
    options.command === "verify"
    && (!options.bundlePath || !options.subjectManifestPath || !options.trustedRootPath)
  ) {
    throw new Error(
      "verify requires --bundle <path>, --subject-manifest <path>, and --trusted-root <path>.",
    );
  }

  if (!["plan", "prepare", "promote", "status", "verify"].includes(options.command)) {
    throw new Error(`Unknown command: ${options.command}`);
  }

  const verifyToolPaths = options.command === "verify"
    ? Object.freeze({
        dockerPath: resolveTrustedDockerBinary(),
        ghPath: resolveTrustedGhExecutable(),
        gitPath: resolveTrustedGitExecutable(),
        nodePath: resolveTrustedNodeExecutable(),
      })
    : null;
  if (verifyToolPaths) {
    if (realpathSync(options.nodeBin) !== verifyToolPaths.nodePath) {
      throw new Error("verify --node-bin must equal the trusted current Node.js executable.");
    }
    options.dockerBin = verifyToolPaths.dockerPath;
    options.nodeBin = verifyToolPaths.nodePath;
  }
  const verifyToolSnapshot = verifyToolPaths
    ? snapshotTrustedExecutables(verifyToolPaths)
    : null;

  const attestationVerifier = ["prepare", "promote", "verify"].includes(options.command)
    ? createGitHubProductionReleaseAttestationVerifier({
      bundlePath: options.bundlePath,
      ...(verifyToolPaths ? { ghExecutable: verifyToolPaths.ghPath } : {}),
      repository: "netsus/homecook",
      signerWorkflow: "netsus/homecook/.github/workflows/production-release-attestation.yml",
      sourceRef: "refs/heads/master",
      subjectManifestPath: options.subjectManifestPath,
      trustedRootPath: options.trustedRootPath,
    })
    : null;
  let result;
  if (options.command === "prepare") {
    result = prepareLocalMacProductionRelease({
      homeDir: options.homeDir,
      manifestPath: options.releaseManifestPath,
      rootDir: options.rootDir,
      verifyAttestation: attestationVerifier,
    });
  } else if (options.command === "promote") {
    const adapters = createLocalMacProductionPromoteAdapters(options);
    result = await promoteLocalMacProductionRelease({
      ...adapters,
      homeDir: options.homeDir,
      manifestPath: options.releaseManifestPath,
      rootDir: options.rootDir,
      verifyAttestation: attestationVerifier,
    });
  } else if (options.command === "verify") {
    const adapters = createLocalMacProductionVerifyAdapters(options);
    const runTrustedGit = (_command, args, commandOptions) => spawnSync(
      verifyToolPaths.gitPath,
      args,
      {
        ...commandOptions,
        env: { PATH: "/usr/bin:/bin" },
      },
    );
    result = await verifyLocalMacProductionRelease({
      ...adapters,
      homeDir: options.homeDir,
      manifestPath: options.releaseManifestPath,
      readGitEvidence: (input) => readLocalMacProductionGitReleaseEvidence({
        ...input,
        runCommand: runTrustedGit,
      }),
      rootDir: options.rootDir,
      verifyAttestation: attestationVerifier,
    });
    assertTrustedExecutableSnapshotStable(verifyToolSnapshot, verifyToolPaths);
  } else {
    result = getLocalMacProductionReleaseStatus({
      currentHeadSha: readLocalMacProductionRepoHeadSha({ rootDir: options.rootDir }),
      homeDir: options.homeDir,
      manifestPath: options.releaseManifestPath,
    });
  }

  printResult(result, options.json);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
