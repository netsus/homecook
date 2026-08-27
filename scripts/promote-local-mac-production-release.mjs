#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import {
  getLocalMacProductionReleaseStatus,
  prepareLocalMacProductionRelease,
  promoteLocalMacProductionRelease,
  readLocalMacProductionRuntimeIdentity,
  readLocalMacProductionRepoHeadSha,
} from "./lib/local-mac-production-release.mjs";
import {
  createGitHubProductionReleaseAttestationVerifier,
} from "./lib/github-production-release-attestation.mjs";
import {
  installLocalMacProductionLaunchAgent,
  readLocalMacProductionStatus,
  waitForLocalMacProductionReady,
} from "./lib/local-mac-production.mjs";
import {
  installFullLocalLaunchAgent,
  readFullLocalLaunchAgentStatus,
} from "./lib/full-local-launch-agent.mjs";
import {
  buildYoutubeExtractionWorkerServiceTarget,
  evaluateYoutubeExtractionWorkerPreflight,
  installYoutubeExtractionWorkerLaunchAgent,
  loadYoutubeExtractionWorkerRuntimeInputs,
  parseLaunchctlPrintStatus,
  validateYoutubeExtractionWorkerConfigPath,
  validateYoutubeExtractionWorkerSecretFile,
  validateYoutubeExtractionWorkerSecretRoot,
} from "./lib/youtube-extraction-worker-ops.mjs";
import {
  readWorkerEnvironment,
  readWorkerProviderEnvironment,
  sanitizeYoutubeExtractionChildEnvironment,
  verifyStandaloneYoutubeI031Preflight,
} from "./lib/youtube-extraction-worker-runtime.mjs";

function printHelp() {
  process.stdout.write(`Usage:
  node scripts/promote-local-mac-production-release.mjs plan --release-manifest <path> [--home-dir <path>] [--root-dir <path>] [--json]
  node scripts/promote-local-mac-production-release.mjs prepare --release-manifest <path> --bundle <path> --subject-manifest <path> --trusted-root <path> [--home-dir <path>] [--root-dir <path>] [--json]
  node scripts/promote-local-mac-production-release.mjs promote --release-manifest <path> --bundle <path> --subject-manifest <path> --trusted-root <path> --full-local-config <path> --worker-config <path> --worker-manifest <path> --worker-credential <path> --worker-app-descriptor <path> --worker-policy <path> --worker-expected-schema <path> --worker-secret-root <path> --confirm-production LOCAL_FULL_PRODUCTION_WORKER_INSTALL [--home-dir <path>] [--root-dir <path>] [--node-bin <path>] [--json]
  node scripts/promote-local-mac-production-release.mjs status [--release-manifest <path>] [--home-dir <path>] [--root-dir <path>] [--json]
  node scripts/promote-local-mac-production-release.mjs verify --release-manifest <path> [--home-dir <path>] [--root-dir <path>] [--json]

Currently implemented in this stage: plan, prepare, promote, status
Currently blocked fail-closed in this stage: verify

Prepare creates an immutable candidate directory only; it does not acquire the production lock or change runtime state.
Promote requires exact attestation and explicit runtime paths; verify remains blocked fail-closed.
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
  if (result.lock) {
    process.stdout.write(`lock: ${result.lock.locked ? "held" : "free"}\n`);
    process.stdout.write(`stale_candidate: ${result.lock.staleCandidate ? "yes" : "no"}\n`);
  }
}

function isBlockedStageCommand(command) {
  return command === "verify";
}

function assertSupportedStageCommand(command) {
  if (isBlockedStageCommand(command)) {
    throw new Error(
      `Command "${command}" is currently blocked fail-closed in this stage. `
      + "Use plan/prepare/promote/status only until verify is implemented.",
    );
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

async function readI031Preflight(options) {
  const userId = process.getuid?.();
  if (!Number.isInteger(userId)) {
    throw new Error("Unable to resolve the current macOS user id.");
  }
  validateYoutubeExtractionWorkerSecretRoot(options.workerSecretRoot, {
    expectedUserId: userId,
  });
  const configPath = validateYoutubeExtractionWorkerConfigPath(options.workerConfigPath, {
    expectedUserId: userId,
    secretRoot: options.workerSecretRoot,
  });
  const workerConfig = await readWorkerEnvironment(configPath);
  const providerSecretPath = validateYoutubeExtractionWorkerSecretFile(
    workerConfig.HOMECOOK_YOUTUBE_WORKER_PROVIDER_SECRET_FILE,
    { expectedUserId: userId, secretRoot: options.workerSecretRoot },
  );
  const providerEnvironment = await readWorkerProviderEnvironment(providerSecretPath);
  const result = await verifyStandaloneYoutubeI031Preflight({
    workerEnv: sanitizeYoutubeExtractionChildEnvironment(
      { ...process.env, ...providerEnvironment },
      { HOME: options.homeDir },
    ),
    expectedUserId: userId,
  });
  return {
    ready: true,
    codexCliVersion: result.codexCliVersion,
    chatGptLogin: true,
    toolsReady: true,
  };
}

function readWorkerPreflight(options) {
  const userId = process.getuid?.();
  if (!Number.isInteger(userId)) {
    throw new Error("Unable to resolve the current macOS user id.");
  }
  validateYoutubeExtractionWorkerSecretRoot(options.workerSecretRoot, {
    expectedUserId: userId,
  });
  validateYoutubeExtractionWorkerSecretFile(options.workerCredentialPath, {
    expectedUserId: userId,
    secretRoot: options.workerSecretRoot,
  });
  const inputs = loadYoutubeExtractionWorkerRuntimeInputs({
    appDescriptorPath: options.workerAppDescriptorPath,
    workerArtifactPath: options.workerManifestPath,
    currentPolicyPath: options.workerPolicyPath,
    credentialPath: options.workerCredentialPath,
    expectedSchemaPath: options.workerExpectedSchemaPath,
    secretRoot: options.workerSecretRoot,
  });
  const preflight = evaluateYoutubeExtractionWorkerPreflight(inputs);
  if (!preflight.ready) {
    throw new Error(`worker install preflight failed: ${preflight.blockers.join(",")}`);
  }
  return { inputs, preflight, userId };
}

function createPromoteBundleAdapters(options) {
  let workerServiceTarget = null;
  return {
    installBundle: async ({ manifest, mutationAuthority, releaseDir }) => {
      const { preflight, userId } = readWorkerPreflight(options);
      if (preflight.release_sha !== manifest.release_sha) {
        throw new Error("worker preflight release SHA does not match the promoted release SHA");
      }
      const i031Preflight = await readI031Preflight(options);
      const fullLocal = installFullLocalLaunchAgent({
        configPath: options.fullLocalConfigPath,
        homeDir: options.homeDir,
        mutationAuthority,
        nodeBin: options.nodeBin,
        rootDir: releaseDir,
      });
      const app = installLocalMacProductionLaunchAgent({
        homeDir: options.homeDir,
        mutationAuthority,
        nodeBin: options.nodeBin,
        rootDir: releaseDir,
      });
      const worker = installYoutubeExtractionWorkerLaunchAgent({
        appDescriptorPath: options.workerAppDescriptorPath,
        configPath: options.workerConfigPath,
        confirmation: options.confirmation,
        credentialPath: options.workerCredentialPath,
        currentPolicyPath: options.workerPolicyPath,
        expectedSchemaPath: options.workerExpectedSchemaPath,
        homeDir: options.homeDir,
        i031Preflight,
        manifestPath: options.workerManifestPath,
        mutationAuthority,
        nodeBin: options.nodeBin,
        rootDir: releaseDir,
        secretRoot: options.workerSecretRoot,
        spawn: spawnSync,
        userId,
      });
      workerServiceTarget = worker.service_target;
      return { app, full_local: fullLocal, worker, release_sha: manifest.release_sha };
    },
    readinessProbe: async ({ manifest, releaseDir }) => {
      const appStatus = readLocalMacProductionStatus({ spawn: spawnSync });
      const appHttp = await waitForLocalMacProductionReady();
      const fullLocalStatus = readFullLocalLaunchAgentStatus({
        homeDir: options.homeDir,
        spawn: spawnSync,
      });
      const { preflight } = readWorkerPreflight(options);
      const serviceTarget = workerServiceTarget
        ?? buildYoutubeExtractionWorkerServiceTarget({ userId: process.getuid?.() ?? 0 });
      const workerRawStatus = spawnSync("/bin/launchctl", ["print", serviceTarget], {
        encoding: "utf8",
      });
      const workerStatus = parseLaunchctlPrintStatus({
        serviceTarget,
        status: workerRawStatus.status,
        stderr: workerRawStatus.stderr,
        stdout: workerRawStatus.stdout,
      });
      const appReady = appStatus.running
        && appHttp.status >= 200
        && appHttp.status < 400;
      const fullLocalReady = fullLocalStatus.state === "running";
      const workerReady = workerStatus.loaded
        && ["running", "waiting"].includes(workerStatus.state)
        && preflight.ready
        && preflight.release_sha === manifest.release_sha;
      const unavailable = { ready: false };
      return {
        app: appReady
          ? readLocalMacProductionRuntimeIdentity({
            component: "app",
            expectedReleaseDir: releaseDir,
            pid: appStatus.pid,
          })
          : unavailable,
        full_local: fullLocalReady
          ? readLocalMacProductionRuntimeIdentity({
            component: "full_local",
            expectedReleaseDir: releaseDir,
            pid: fullLocalStatus.pid,
          })
          : unavailable,
        youtube_worker: workerReady
          ? readLocalMacProductionRuntimeIdentity({
            component: "youtube_worker",
            expectedReleaseDir: releaseDir,
            pid: workerStatus.pid,
          })
          : unavailable,
      };
    },
  };
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
  if (options.command === "promote" && !options.releaseManifestPath) {
    throw new Error("promote requires --release-manifest <path>.");
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

  if (!["plan", "prepare", "promote", "status", "verify"].includes(options.command)) {
    throw new Error(`Unknown command: ${options.command}`);
  }

  const attestationVerifier = ["prepare", "promote"].includes(options.command)
    ? createGitHubProductionReleaseAttestationVerifier({
      bundlePath: options.bundlePath,
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
    const adapters = createPromoteBundleAdapters(options);
    result = await promoteLocalMacProductionRelease({
      ...adapters,
      homeDir: options.homeDir,
      manifestPath: options.releaseManifestPath,
      rootDir: options.rootDir,
      verifyAttestation: attestationVerifier,
    });
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
