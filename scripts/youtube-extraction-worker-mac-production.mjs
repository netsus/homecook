#!/usr/bin/env node

import { readFileSync } from "node:fs";

import {
  buildYoutubeExtractionWorkerCredentialState,
  buildYoutubeExtractionWorkerDrainPlan,
  buildYoutubeExtractionWorkerHealth,
  buildYoutubeExtractionWorkerInstallPlan,
  buildYoutubeExtractionWorkerLifecyclePlan,
  buildYoutubeExtractionWorkerRollbackPlan,
  evaluateYoutubeExtractionWorkerPreflight,
  loadYoutubeExtractionWorkerRuntimeInputs,
  parseLaunchctlPrintStatus,
  rotateYoutubeExtractionWorkerCredential,
  writeCredentialMetadata,
} from "./lib/youtube-extraction-worker-ops.mjs";
import { ensureAbsolutePath } from "./lib/youtube-extraction-worker-artifact.mjs";
import {
  readWorkerEnvironment,
  readWorkerProviderEnvironment,
  verifyStandaloneYoutubeI031Preflight,
} from "./lib/youtube-extraction-worker-runtime.mjs";

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    command,
    dryRun: false,
    json: false,
    homeDir: process.env.HOME ?? "",
    nodeBin: process.execPath,
    userId: process.getuid?.() ?? 0,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--") continue;
    if (token === "--dry-run") {
      options.dryRun = true;
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

    switch (token) {
      case "--config":
        options.configPath = ensureAbsolutePath(value, "configPath");
        break;
      case "--manifest":
        options.workerArtifactPath = ensureAbsolutePath(value, "workerArtifactPath");
        break;
      case "--credential":
      case "--credential-path":
        options.credentialPath = ensureAbsolutePath(value, "credentialPath");
        break;
      case "--app-descriptor":
        options.appDescriptorPath = ensureAbsolutePath(value, "appDescriptorPath");
        break;
      case "--policy":
        options.currentPolicyPath = ensureAbsolutePath(value, "currentPolicyPath");
        break;
      case "--queue-state":
        options.queueStatePath = ensureAbsolutePath(value, "queueStatePath");
        break;
      case "--expected-schema":
        options.expectedSchemaPath = ensureAbsolutePath(value, "expectedSchemaPath");
        break;
      case "--launchctl-output":
        options.launchctlOutputPath = ensureAbsolutePath(value, "launchctlOutputPath");
        break;
      case "--token-file":
        options.tokenFile = ensureAbsolutePath(value, "tokenFile");
        break;
      case "--generation":
        options.generation = Number(value);
        break;
      case "--expected-generation":
        options.expectedGeneration = Number(value);
        break;
      case "--next-generation":
        options.nextGeneration = Number(value);
        break;
      case "--jti-hash":
        options.jtiHash = value;
        break;
      case "--expires-at":
        options.expiresAt = value;
        break;
      case "--release-sha":
        options.releaseSha = value;
        break;
      case "--schema-identity":
        options.schemaIdentity = value;
        break;
      case "--allowed-snapshot-digest":
        options.allowedSnapshotDigest = value;
        break;
      case "--output":
        options.outputPath = ensureAbsolutePath(value, "outputPath");
        break;
      case "--home-dir":
        options.homeDir = ensureAbsolutePath(value, "homeDir");
        break;
      case "--node-bin":
        options.nodeBin = ensureAbsolutePath(value, "nodeBin");
        break;
      case "--root-dir":
        options.rootDir = ensureAbsolutePath(value, "rootDir");
        break;
      case "--user-id":
        options.userId = Number(value);
        break;
      default:
        throw new Error(`Unknown option: ${token}`);
    }
    index += 1;
  }

  return options;
}

function print(result) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

async function runI031Preflight(options) {
  const workerConfig = await readWorkerEnvironment(options.configPath);
  const providerEnvironment = await readWorkerProviderEnvironment(
    workerConfig.HOMECOOK_YOUTUBE_WORKER_PROVIDER_SECRET_FILE,
  );
  const result = await verifyStandaloneYoutubeI031Preflight({
    workerEnv: { ...process.env, ...providerEnvironment },
  });
  return {
    ready: true,
    codexCliVersion: result.codexCliVersion,
    chatGptLogin: true,
    toolsReady: true,
  };
}

async function runInstall(options) {
  const releasePreflight = runReleasePreflight(options);
  if (!releasePreflight.ready) {
    throw new Error(`worker install preflight failed: ${releasePreflight.blockers.join(",")}`);
  }
  const i031Preflight = await runI031Preflight(options);
  return buildYoutubeExtractionWorkerInstallPlan({
    configPath: options.configPath,
    manifestPath: options.workerArtifactPath,
    credentialPath: options.credentialPath,
    appDescriptorPath: options.appDescriptorPath,
    currentPolicyPath: options.currentPolicyPath,
    expectedSchemaPath: options.expectedSchemaPath,
    homeDir: options.homeDir,
    nodeBin: options.nodeBin,
    rootDir: options.rootDir,
    userId: options.userId,
    dryRun: options.dryRun,
    i031Preflight,
  });
}

async function runLifecycle(action, options) {
  let i031Preflight;
  if (action === "start" || action === "restart") {
    const releasePreflight = runReleasePreflight(options);
    if (!releasePreflight.ready) {
      throw new Error(`worker startup preflight failed: ${releasePreflight.blockers.join(",")}`);
    }
    i031Preflight = await runI031Preflight(options);
  }
  return buildYoutubeExtractionWorkerLifecyclePlan({
    action,
    homeDir: options.homeDir,
    userId: options.userId,
    dryRun: options.dryRun,
    i031Preflight,
  });
}

function runReleasePreflight(options) {
  const inputs = loadYoutubeExtractionWorkerRuntimeInputs({
    appDescriptorPath: options.appDescriptorPath,
    workerArtifactPath: options.workerArtifactPath,
    currentPolicyPath: options.currentPolicyPath,
    credentialPath: options.credentialPath,
    expectedSchemaPath: options.expectedSchemaPath,
    queueStatePath: options.queueStatePath ?? null,
  });
  return evaluateYoutubeExtractionWorkerPreflight(inputs);
}

async function runPreflight(options) {
  const preflight = runReleasePreflight(options);
  if (!preflight.ready) return preflight;
  const i031Preflight = await runI031Preflight(options);
  return { ...preflight, i031_preflight: i031Preflight };
}

function runDrain(options) {
  const inputs = loadYoutubeExtractionWorkerRuntimeInputs({
    appDescriptorPath: options.appDescriptorPath,
    workerArtifactPath: options.workerArtifactPath,
    currentPolicyPath: options.currentPolicyPath,
    credentialPath: options.credentialPath,
    queueStatePath: options.queueStatePath,
  });
  return buildYoutubeExtractionWorkerDrainPlan({
    queueState: inputs.queueState,
    workerArtifact: inputs.workerArtifact,
  });
}

function runStatus(options) {
  const rawOutput = options.launchctlOutputPath
    ? {
      status: 0,
      stdout: readFileSync(options.launchctlOutputPath, "utf8"),
      stderr: "",
    }
    : { stdout: "", stderr: "", status: 113 };
  return parseLaunchctlPrintStatus({
    serviceTarget: `gui/${options.userId}/com.homecook.youtube-extraction-worker`,
    status: rawOutput.status ?? 113,
    stdout: rawOutput.stdout ?? "",
    stderr: rawOutput.stderr ?? "",
  });
}

function runRollback(options) {
  const inputs = loadYoutubeExtractionWorkerRuntimeInputs({
    appDescriptorPath: options.appDescriptorPath,
    workerArtifactPath: options.workerArtifactPath,
    currentPolicyPath: options.currentPolicyPath,
    credentialPath: options.credentialPath,
    queueStatePath: options.queueStatePath,
  });
  return buildYoutubeExtractionWorkerRollbackPlan({
    currentArtifact: inputs.workerArtifact,
    previousAppDescriptor: inputs.appDescriptor,
    queueState: inputs.queueState,
    currentPolicy: inputs.currentPolicy,
    credentialState: inputs.credentialState,
    dryRun: options.dryRun,
  });
}

function runCredentialBootstrap(options) {
  if (!options.dryRun) {
    throw new Error("credential-bootstrap is Manual Only. Rehearsal requires --dry-run.");
  }
  const credential = buildYoutubeExtractionWorkerCredentialState({
    tokenFile: options.tokenFile,
    generation: options.generation,
    jtiHash: options.jtiHash,
    expiresAt: options.expiresAt,
    releaseSha: options.releaseSha,
    schemaIdentity: options.schemaIdentity,
    allowedSnapshotDigest: options.allowedSnapshotDigest,
  });
  if (options.outputPath) {
    writeCredentialMetadata(options.outputPath, credential);
  }
  return {
    action: "credential-bootstrap",
    dry_run: options.dryRun,
    manual_only: true,
    credential,
    output_path: options.outputPath ?? null,
  };
}

function runCredentialRotate(options) {
  if (!options.dryRun) {
    throw new Error("credential-rotate is Manual Only. Rehearsal requires --dry-run.");
  }
  const credential = rotateYoutubeExtractionWorkerCredential({
    tokenFile: options.tokenFile,
    expectedGeneration: options.expectedGeneration,
    nextGeneration: options.nextGeneration,
    jtiHash: options.jtiHash,
    expiresAt: options.expiresAt,
    releaseSha: options.releaseSha,
    schemaIdentity: options.schemaIdentity,
    allowedSnapshotDigest: options.allowedSnapshotDigest,
  });
  if (options.outputPath) {
    writeCredentialMetadata(options.outputPath, credential);
  }
  return {
    action: "credential-rotate",
    dry_run: options.dryRun,
    manual_only: true,
    credential,
    output_path: options.outputPath ?? null,
  };
}

async function runHealth(options) {
  const preflight = await runPreflight(options);
  const drain = options.queueStatePath ? runDrain(options) : null;
  const status = options.launchctlOutputPath ? runStatus(options) : null;
  return buildYoutubeExtractionWorkerHealth({
    status,
    preflight,
    drain,
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let result;

  switch (options.command) {
    case "install":
      result = await runInstall(options);
      break;
    case "start":
    case "stop":
    case "restart":
    case "uninstall":
      result = await runLifecycle(options.command, options);
      break;
    case "status":
      result = runStatus(options);
      break;
    case "preflight":
      result = await runPreflight(options);
      break;
    case "drain":
      result = runDrain(options);
      break;
    case "rollback":
      result = runRollback(options);
      break;
    case "credential-bootstrap":
      result = runCredentialBootstrap(options);
      break;
    case "credential-rotate":
      result = runCredentialRotate(options);
      break;
    case "health":
      result = await runHealth(options);
      break;
    default:
      throw new Error(
        "Usage: node scripts/youtube-extraction-worker-mac-production.mjs <install|start|stop|restart|status|preflight|drain|rollback|uninstall|credential-bootstrap|credential-rotate|health> [options]",
      );
  }

  print(result);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
