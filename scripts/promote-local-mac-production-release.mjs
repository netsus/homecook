#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
import { createProductionPromotionAuthorityVerifier } from "./lib/local-mac-production-promotion-authority.mjs";
import { resolveTrustedDockerBinary } from "./lib/full-local-session-observation-reader.mjs";
import {
  assertTrustedExecutableSnapshotStable,
  resolveTrustedGhExecutable,
  resolveTrustedGitExecutable,
  resolveTrustedNodeExecutable,
  snapshotTrustedExecutables,
} from "./lib/trusted-production-release-tools.mjs";

function printHelp(output = process.stdout) {
  output.write(`Usage:
  node scripts/promote-local-mac-production-release.mjs plan --release-manifest <path> [--home-dir <path>] [--root-dir <path>] [--json]
  node scripts/promote-local-mac-production-release.mjs prepare --release-manifest <path> --bundle <path> --subject-manifest <path> --trusted-root <path> [--home-dir <path>] [--root-dir <path>] [--json]
  node scripts/promote-local-mac-production-release.mjs promote --release-manifest <path> --bundle <path> --subject-manifest <path> --trusted-root <path> --member-receipt <path> --member-receipt <path> --repeatability-receipt <path> --sealed-candidate <path> --production-inventory <path> --full-local-config <path> --worker-config <path> --worker-manifest <path> --worker-credential <path> --worker-app-descriptor <path> --worker-policy <path> --worker-expected-schema <path> --worker-secret-root <path> --confirm-production LOCAL_FULL_PRODUCTION_WORKER_INSTALL [--home-dir <path>] [--root-dir <path>] [--node-bin <path>] [--json]
  node scripts/promote-local-mac-production-release.mjs status [--release-manifest <path>] [--home-dir <path>] [--root-dir <path>] [--json]
  node scripts/promote-local-mac-production-release.mjs verify --release-manifest <path> --bundle <path> --subject-manifest <path> --trusted-root <path> [--home-dir <path>] [--root-dir <path>] [--node-bin <path>] [--json]

Command surface: plan, prepare, promote (activation blocked), status, verify

Prepare creates an immutable candidate directory only; it does not acquire the production lock or change runtime state.
When activated, promote will require exact attestation, repeatability receipt authority, and explicit runtime paths. Verify is read-only and rechecks the exact attested running bundle.

ACTIVATION BLOCKED: promote cannot run until the GitHub-attested repeatability receipt gate is independently reviewed, current-head green, and merged. Plan, prepare, status, and verify remain available within their documented boundaries.
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
    memberReceiptPaths: [],
    repeatabilityReceiptPath: null,
    sealedCandidatePath: null,
    productionInventoryPath: null,
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
    } else if (token === "--member-receipt") {
      options.memberReceiptPaths.push(value);
    } else if (token === "--repeatability-receipt") {
      options.repeatabilityReceiptPath = value;
    } else if (token === "--sealed-candidate") {
      options.sealedCandidatePath = value;
    } else if (token === "--production-inventory") {
      options.productionInventoryPath = value;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
    index += 1;
  }

  return options;
}

function printResult(result, json, output = process.stdout) {
  if (json) {
    output.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (result.manifest) {
    output.write(`release_tag: ${result.manifest.release_tag}\n`);
    output.write(`release_sha: ${result.manifest.release_sha}\n`);
  } else {
    output.write("release_tag: -\n");
    output.write("release_sha: -\n");
  }
  output.write(`current_head_sha: ${result.current_head_sha ?? "-"}\n`);
  if (result.prepared) {
    output.write(`prepared: yes\n`);
    output.write(`release_dir: ${result.release_dir}\n`);
  }
  if (result.verified) {
    output.write("verified: yes\n");
    output.write(
      `migration_head: ${result.runtime?.full_local?.migration_head ?? "-"}\n`,
    );
  }
  if (result.lock) {
    output.write(`lock: ${result.lock.locked ? "held" : "free"}\n`);
    output.write(`stale_candidate: ${result.lock.staleCandidate ? "yes" : "no"}\n`);
  }
}

const RUNTIME_INPUT_FREEZE_PUBLIC_ERROR =
  "runtime_input_freeze_failed: external runtime input authority is invalid.";

export function sanitizeLocalMacProductionReleaseCliError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.startsWith("runtime_input_freeze_failed:")
    ? RUNTIME_INPUT_FREEZE_PUBLIC_ERROR
    : message;
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
    ["--repeatability-receipt", options.repeatabilityReceiptPath],
    ["--sealed-candidate", options.sealedCandidatePath],
    ["--production-inventory", options.productionInventoryPath],
  ];
  if (options.memberReceiptPaths.length !== 2) {
    required.push(["--member-receipt (exactly two)", null]);
  }
  const missing = required.filter(([, value]) => !value).map(([flag]) => flag);
  if (missing.length > 0) {
    throw new Error(`promote requires ${missing.join(", ")}.`);
  }
}

export function assertProductionPromoteActivated(command) {
  if (command === "promote") {
    throw new Error(
      "activation_blocked: production promote requires the GitHub-attested repeatability receipt gate to be independently reviewed, current-head green, and merged before any adapter, lock, Docker, LaunchAgent, database, or runtime mutation setup.",
    );
  }
}

export async function runLocalMacProductionReleaseCli(
  argv,
  {
    createAttestationVerifier = createGitHubProductionReleaseAttestationVerifier,
    createPromoteAdapters = createLocalMacProductionPromoteAdapters,
    createVerifyAdapters = createLocalMacProductionVerifyAdapters,
    createPromotionAuthorityVerifier = createProductionPromotionAuthorityVerifier,
    promoteRelease = promoteLocalMacProductionRelease,
    output = process.stdout,
    parseArguments = parseArgs,
    assertPromoteActivated = assertProductionPromoteActivated,
  } = {},
) {
  assertPromoteActivated(argv[0]);
  const options = parseArguments(argv);

  if (!options.command || options.command === "help" || options.command === "--help") {
    printHelp(output);
    return;
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
    options.gitBin = verifyToolPaths.gitPath;
    options.nodeBin = verifyToolPaths.nodePath;
  }
  const verifyToolSnapshot = verifyToolPaths
    ? snapshotTrustedExecutables(verifyToolPaths)
    : null;

  const attestationVerifier = ["prepare", "promote", "verify"].includes(options.command)
    ? createAttestationVerifier({
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
    const verifyRehearsalAuthority = createPromotionAuthorityVerifier({
      candidatePath: options.sealedCandidatePath,
      inventoryPath: options.productionInventoryPath,
      manifestPath: options.releaseManifestPath,
      memberReceiptPaths: options.memberReceiptPaths,
      repeatabilityReceiptPath: options.repeatabilityReceiptPath,
      repoRoot: options.rootDir,
      verifyAttestation: attestationVerifier,
    });
    const preAdapterAuthority = await verifyRehearsalAuthority({
      phase: "pre-adapter",
      now: new Date(),
    });
    if (!preAdapterAuthority || preAdapterAuthority.verified !== true
      || !/^[0-9a-f]{64}$/u.test(preAdapterAuthority.authority_digest ?? "")) {
      throw new Error("Pre-adapter rehearsal authority is invalid.");
    }
    const adapters = createPromoteAdapters(options);
    result = await promoteRelease({
      ...adapters,
      homeDir: options.homeDir,
      manifestPath: options.releaseManifestPath,
      rootDir: options.rootDir,
      verifyAttestation: attestationVerifier,
      verifyRehearsalAuthority,
      expectedRehearsalAuthorityDigest: preAdapterAuthority.authority_digest,
    });
  } else if (options.command === "verify") {
    const adapters = createVerifyAdapters(options);
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

  printResult(result, options.json, output);
}

function isDirectExecution() {
  if (!process.argv[1]) {
    return false;
  }
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectExecution()) {
  try {
    await runLocalMacProductionReleaseCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${sanitizeLocalMacProductionReleaseCliError(error)}\n`);
    process.exitCode = 1;
  }
}
