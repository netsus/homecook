#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  buildYoutubeExtractionWorkerHealth,
  buildYoutubeExtractionWorkerDrainPlan,
  evaluateYoutubeExtractionWorkerPreflight,
  readYoutubeExtractionWorkerCredential,
  validateYoutubeExtractionWorkerConfigPath,
  validateYoutubeExtractionWorkerSecretFile,
  validateYoutubeExtractionWorkerSecretRoot,
} from "./lib/youtube-extraction-worker-ops.mjs";
import {
  ensureAbsolutePath,
  readYoutubeExtractionAppDescriptor,
  readYoutubeExtractionCurrentPolicy,
  readYoutubeExtractionExpectedSchema,
  verifyYoutubeExtractionWorkerArtifact,
  readYoutubeExtractionWorkerQueueState,
} from "./lib/youtube-extraction-worker-artifact.mjs";
import {
  buildYoutubeExtractionRuntimeEnvironment,
  createRestrictedPostgrestRpcClient,
  createStandaloneYoutubeI031Extractor,
  createYoutubeExtractionWorkerRuntime,
  readWorkerEnvironment,
  readWorkerProviderEnvironment,
  resolveYoutubeExtractionTempRoot,
  runYoutubeExtractionWorkerPollLoop,
  runSyntheticYoutubeExtractionWorkerJob,
  verifyStandaloneYoutubeI031Preflight,
} from "./lib/youtube-extraction-worker-runtime.mjs";

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
      case "--expected-schema":
        options.expectedSchemaPath = ensureAbsolutePath(value, "expectedSchemaPath");
        break;
      case "--secret-root":
        options.secretRoot = ensureAbsolutePath(value, "secretRoot");
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!["run", "health", "rehearsal-synthetic"].includes(options.command)) {
    throw new Error(
      "Usage: node scripts/youtube-extraction-worker-runner.mjs <run|health|rehearsal-synthetic> --secret-root <directory> --config <env> --manifest <artifact.json> --credential <credential.json> --app-descriptor <app.json> --policy <policy.json> --expected-schema <schema.json> [--queue-state <queue.json>] [--dry-run]",
    );
  }

  validateYoutubeExtractionWorkerSecretRoot(options.secretRoot);
  const secretRoot = options.secretRoot;
  validateYoutubeExtractionWorkerConfigPath(options.configPath, { secretRoot });
  const workerArtifact = verifyYoutubeExtractionWorkerArtifact(
    options.workerArtifactPath,
  );
  const credentialState = readYoutubeExtractionWorkerCredential(
    options.credentialPath,
    { secretRoot },
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
  const expectedSchema = options.expectedSchemaPath
    ? readYoutubeExtractionExpectedSchema(options.expectedSchemaPath)
    : null;
  if (!appDescriptor || !currentPolicy || !expectedSchema) {
    throw new Error("runner requires app descriptor, current policy, and expected schema");
  }
  const preflight = evaluateYoutubeExtractionWorkerPreflight({
    appDescriptor,
    workerArtifact,
    currentPolicy,
    credentialState,
    expectedSchema,
    queueState,
    requirePolicyEnabled: true,
  });

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

  if (options.command === "rehearsal-synthetic") {
    if (
      process.env.HOMECOOK_REHEARSAL_MODE !== "isolated-r2"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
        .test(process.env.HOMECOOK_REHEARSAL_RUN_ID ?? "")
    ) {
      throw new Error("rehearsal synthetic worker mode requires exact isolated R2 authority");
    }
    if (!preflight.ready) {
      throw new Error(`worker preflight failed: ${preflight.blockers.join(",")}`);
    }
    print(await runSyntheticYoutubeExtractionWorkerJob({
      allowedSnapshotDigest: workerArtifact.allowed_snapshot_digest,
      runId: process.env.HOMECOOK_REHEARSAL_RUN_ID,
    }));
    return;
  }

  if (options.dryRun) {
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
    return;
  }
  if (!preflight.ready) {
    throw new Error(`worker preflight failed: ${preflight.blockers.join(",")}`);
  }
  const workerEnvironment = await readWorkerEnvironment(options.configPath);
  const providerSecretFile = validateYoutubeExtractionWorkerSecretFile(
    workerEnvironment.HOMECOOK_YOUTUBE_WORKER_PROVIDER_SECRET_FILE,
    { secretRoot },
  );
  const dataApiKeyFile = validateYoutubeExtractionWorkerSecretFile(
    workerEnvironment.HOMECOOK_YOUTUBE_WORKER_DATA_API_KEY_FILE,
    { secretRoot },
  );
  const providerEnvironment = await readWorkerProviderEnvironment(providerSecretFile);
  validateYoutubeExtractionWorkerSecretRoot(
    workerEnvironment.HOMECOOK_YOUTUBE_WORKER_RUNTIME_ROOT,
  );
  const tempRoot = await resolveYoutubeExtractionTempRoot();
  const runtimeEnvironment = buildYoutubeExtractionRuntimeEnvironment({
    processEnvironment: process.env,
    providerEnvironment,
    tempRoot,
  });
  const i031Preflight = await verifyStandaloneYoutubeI031Preflight({
    workerEnv: runtimeEnvironment,
  });
  if (Date.parse(credentialState.expires_at) <= Date.now() + (30 * 60 * 1000)) {
    throw new Error("worker credential expires within the required 30 minute window");
  }
  const token = readFile(credentialState.token_file, "utf8")
    .then((value) => value.trim());
  const dataApiKey = readFile(dataApiKeyFile, "utf8")
    .then((value) => value.trim());
  const restrictedClient = createRestrictedPostgrestRpcClient({
    dataApiUrl: workerEnvironment.HOMECOOK_YOUTUBE_WORKER_DATA_API_URL,
    apiKey: await dataApiKey,
    token: await token,
  });
  const runtime = createYoutubeExtractionWorkerRuntime({
    workerId: workerEnvironment.HOMECOOK_YOUTUBE_WORKER_ID
      ?? `mac-${process.pid}`,
    allowedSnapshotDigest: workerArtifact.allowed_snapshot_digest,
    rpc: restrictedClient.rpc,
    extractor: createStandaloneYoutubeI031Extractor({
      artifactRoot: dirname(options.workerArtifactPath),
      workerEnv: runtimeEnvironment,
      verifyPreflight: async () => i031Preflight,
    }),
  });
  const shutdown = new AbortController();
  for (const signalName of ["SIGTERM", "SIGINT"]) {
    process.once(signalName, () => shutdown.abort(new Error(signalName)));
  }
  await runYoutubeExtractionWorkerPollLoop({
    runOnce: runtime.runOnce,
    signal: shutdown.signal,
    pollIntervalMs: Number(workerEnvironment.HOMECOOK_YOUTUBE_WORKER_POLL_INTERVAL_MS ?? 1_000),
  });
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
