#!/usr/bin/env node

import {
  buildYoutubeExtractionWorkerHealth,
  buildYoutubeExtractionWorkerDrainPlan,
  evaluateYoutubeExtractionWorkerPreflight,
  readYoutubeExtractionWorkerCredential,
  validateYoutubeExtractionWorkerConfigPath,
} from "./lib/youtube-extraction-worker-ops.mjs";
import {
  ensureAbsolutePath,
  readYoutubeExtractionAppDescriptor,
  readYoutubeExtractionCurrentPolicy,
  readYoutubeExtractionWorkerArtifact,
  readYoutubeExtractionWorkerQueueState,
} from "./lib/youtube-extraction-worker-artifact.mjs";

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    command,
    dryRun: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--") continue;
    if (token === "--dry-run") {
      options.dryRun = true;
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

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command !== "run" && options.command !== "health") {
    throw new Error(
      "Usage: node scripts/youtube-extraction-worker-runner.mjs <run|health> --config <env> --manifest <artifact.json> --credential <credential.json> --app-descriptor <app.json> --policy <policy.json> [--queue-state <queue.json>] [--dry-run]",
    );
  }

  validateYoutubeExtractionWorkerConfigPath(options.configPath);
  const workerArtifact = readYoutubeExtractionWorkerArtifact(
    options.workerArtifactPath,
  );
  const credentialState = readYoutubeExtractionWorkerCredential(
    options.credentialPath,
  );
  const appDescriptor = options.appDescriptorPath
    ? readYoutubeExtractionAppDescriptor(options.appDescriptorPath)
    : null;
  const currentPolicy = options.currentPolicyPath
    ? readYoutubeExtractionCurrentPolicy(options.currentPolicyPath)
    : null;
  const queueState = options.queueStatePath
    ? readYoutubeExtractionWorkerQueueState(options.queueStatePath)
    : null;
  const preflight =
    appDescriptor && currentPolicy
      ? evaluateYoutubeExtractionWorkerPreflight({
        appDescriptor,
        workerArtifact,
        currentPolicy,
        credentialState,
        queueState,
      })
      : {
        ready:
          workerArtifact.release_sha === credentialState.release_sha
          && workerArtifact.schema_identity === credentialState.schema_identity
          && workerArtifact.allowed_snapshot_digest
            === credentialState.allowed_snapshot_digest,
        blockers:
          workerArtifact.release_sha === credentialState.release_sha
          && workerArtifact.schema_identity === credentialState.schema_identity
          && workerArtifact.allowed_snapshot_digest
            === credentialState.allowed_snapshot_digest
            ? []
            : ["runner_attestation_mismatch"],
      };

  if (options.command === "health") {
    print(buildYoutubeExtractionWorkerHealth({
      status: {
        loaded: true,
        state: "waiting",
        pid: null,
      },
      preflight,
      drain: queueState
        ? buildYoutubeExtractionWorkerDrainPlan({
          queueState,
          workerArtifact,
        })
        : null,
    }));
    return;
  }

  if (!options.dryRun) {
    throw new Error(
      "Worker runtime activation is Manual Only. Use the dry-run runner and launchd rehearsal until the runtime gate is explicitly approved.",
    );
  }

  print({
    action: "run",
    dry_run: true,
    manual_only: true,
    ready: preflight.ready,
    blockers: preflight.blockers,
    release_sha: workerArtifact.release_sha,
    schema_identity: workerArtifact.schema_identity,
    allowed_snapshot_digest: workerArtifact.allowed_snapshot_digest,
  });
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
