import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

import {
  getLocalMacProductionPaths,
  installLocalMacProductionLaunchAgent,
  readLocalMacProductionStatus,
  waitForLocalMacProductionReady,
} from "./local-mac-production.mjs";
import {
  getFullLocalLaunchAgentPaths,
  installFullLocalLaunchAgent,
} from "./full-local-launch-agent.mjs";
import {
  readLocalMacProductionPreparedReleaseIdentity,
  readLocalMacProductionRuntimeIdentity,
} from "./local-mac-production-release.mjs";
import {
  buildYoutubeExtractionWorkerServiceTarget,
  evaluateYoutubeExtractionWorkerPreflight,
  getYoutubeExtractionWorkerPaths,
  installYoutubeExtractionWorkerLaunchAgent,
  loadYoutubeExtractionWorkerRuntimeInputs,
  parseLaunchctlPrintStatus,
  validateYoutubeExtractionWorkerConfigPath,
  validateYoutubeExtractionWorkerSecretFile,
  validateYoutubeExtractionWorkerSecretRoot,
  YOUTUBE_EXTRACTION_WORKER_INSTALL_CONFIRMATION,
} from "./youtube-extraction-worker-ops.mjs";
import {
  verifyYoutubeExtractionWorkerArtifact,
} from "./youtube-extraction-worker-artifact.mjs";
import {
  readWorkerEnvironment,
  readWorkerProviderEnvironment,
  sanitizeYoutubeExtractionChildEnvironment,
  verifyStandaloneYoutubeI031Preflight,
} from "./youtube-extraction-worker-runtime.mjs";

function sha256Text(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function modeBits(mode) {
  return Number(mode) & 0o777;
}

function decodeXml(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function readPlistSnapshot(path, { currentUid, expectedMode, label }) {
  if (!existsSync(path)) {
    throw new Error(`${label} is missing: ${path}`);
  }
  const stat = lstatSync(path);
  const parent = lstatSync(dirname(path));
  if (parent.isSymbolicLink() || !parent.isDirectory()) {
    throw new Error(`${label} parent must be a regular directory.`);
  }
  if (parent.uid !== currentUid || (modeBits(parent.mode) & 0o022) !== 0) {
    throw new Error(`${label} parent owner or mode is unsafe.`);
  }
  if (stat.isSymbolicLink()) throw new Error(`${label} must not be a symlink.`);
  if (!stat.isFile()) throw new Error(`${label} must be a regular file.`);
  if (stat.uid !== currentUid) throw new Error(`${label} owner mismatch.`);
  if (modeBits(stat.mode) !== expectedMode) {
    throw new Error(`${label} must use mode 0${expectedMode.toString(8)}.`);
  }
  const bytes = readFileSync(path);
  const text = bytes.toString("utf8");
  const workingDirectory = decodeXml(
    text.match(/<key>WorkingDirectory<\/key>\s*<string>([^<]+)<\/string>/u)?.[1] ?? "",
  );
  const argumentsMatch = text.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/u);
  const args = argumentsMatch
    ? [...argumentsMatch[1].matchAll(/<string>([^<]*)<\/string>/gu)].map((match) =>
      decodeXml(match[1]))
    : [];
  return {
    args,
    digest: sha256Text(bytes),
    path,
    workingDirectory,
  };
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function readProcessCwd({ pid, spawn = spawnSync }) {
  if (!Number.isInteger(pid) || pid < 1) throw new Error("Runtime pid is unavailable.");
  const result = spawn(
    "/usr/sbin/lsof",
    ["-a", "-p", String(pid), "-d", "cwd", "-Fn"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.status !== 0) throw new Error("Runtime cwd could not be resolved.");
  const claims = String(result.stdout ?? "").split(/\r?\n/u)
    .filter((line) => line.startsWith("n") && line.length > 1)
    .map((line) => realpathSync(line.slice(1)));
  if (claims.length !== 1) throw new Error("Runtime cwd evidence is ambiguous.");
  return claims[0];
}

function assertReadOnlyArtifactRoot(rootPath) {
  const root = realpathSync(rootPath);
  const visit = (path) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error("Worker artifact root contains a symlink.");
    if ((modeBits(stat.mode) & 0o222) !== 0) {
      throw new Error("Worker artifact root must be read-only.");
    }
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path)) visit(resolve(path, entry));
    } else if (!stat.isFile()) {
      throw new Error("Worker artifact root contains an unsupported entry.");
    }
  };
  visit(root);
  return root;
}

function sanitizedPath(nodeBin) {
  return [...new Set([
    dirname(resolve(nodeBin)),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ])].join(":");
}

function readFullLocalWorkloadDefault({ context, options }) {
  const identity = readLocalMacProductionPreparedReleaseIdentity({
    component: "full_local",
    releaseDir: context.releaseDir,
  });
  const result = spawnSync(
    options.nodeBin,
    [
      resolve(context.releaseDir, "scripts", "full-local-production-runtime.mjs"),
      "status",
      "--config",
      options.fullLocalConfigPath,
    ],
    {
      cwd: context.releaseDir,
      encoding: "utf8",
      env: {
        HOME: context.homeDir,
        PATH: sanitizedPath(options.nodeBin),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.status !== 0) {
    throw new Error("Full-local Docker workload status failed.");
  }
  let status;
  try {
    status = JSON.parse(String(result.stdout ?? ""));
  } catch {
    throw new Error("Full-local Docker workload status was invalid.");
  }
  return {
    ...identity,
    ready:
      status.healthy === true
      && status.authorization_contract_status === "PASS"
      && status.product_catalog_status === "PASS",
    runtime_present: status.healthy === true,
    healthy: status.healthy === true,
    authorization_contract_status: status.authorization_contract_status,
    product_catalog_status: status.product_catalog_status,
    workload_digest: sha256Text(result.stdout ?? ""),
  };
}

async function readI031PreflightDefault(options, userId) {
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

function requireFunction(value, label) {
  if (typeof value !== "function") {
    throw new Error(`${label} dependency is not configured.`);
  }
  return value;
}

function assertExactIdentity(component, state, expected) {
  if (!state || state.ready !== true) {
    throw new Error(`Current ${component} runtime is not ready.`);
  }
  if (
    state.release_sha !== expected.release_sha
    || state.release_tree !== expected.release_tree
    || state.build_id !== expected.build_id
  ) {
    throw new Error(`Current ${component} runtime identity drifted from the current descriptor.`);
  }
}

function buildDefaultDependencies() {
  return {
    validateMutationTargets: ({ options }) => {
      const currentUid = process.getuid?.();
      if (!Number.isInteger(currentUid)) throw new Error("Current user uid is unavailable.");
      readPlistSnapshot(getLocalMacProductionPaths(options.homeDir).plistPath, {
        currentUid,
        expectedMode: 0o644,
        label: "App plist target",
      });
      readPlistSnapshot(getFullLocalLaunchAgentPaths(options.homeDir).plistPath, {
        currentUid,
        expectedMode: 0o600,
        label: "Full-local plist target",
      });
      readPlistSnapshot(getYoutubeExtractionWorkerPaths(options.homeDir).plistPath, {
        currentUid,
        expectedMode: 0o600,
        label: "YouTube worker plist target",
      });
    },

    readWorkerReleasePreflight: async ({ context, options }) => {
      const userId = process.getuid?.();
      if (!Number.isInteger(userId)) throw new Error("Current user uid is unavailable.");
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
      const artifactRoot = assertReadOnlyArtifactRoot(dirname(options.workerManifestPath));
      if (artifactRoot === realpathSync(context.releaseDir)) {
        throw new Error("Worker artifact root must remain separate from the app release candidate.");
      }
      const i031Preflight = await readI031PreflightDefault(options, userId);
      return { artifactRoot, i031Preflight, inputs, preflight, userId };
    },

    readCurrentRuntimeBundle: async ({ context, options }) => {
      const currentUid = process.getuid?.();
      if (!Number.isInteger(currentUid)) throw new Error("Current user uid is unavailable.");
      const currentReleaseDir = realpathSync(context.currentReleaseDir);
      const appPlist = readPlistSnapshot(getLocalMacProductionPaths(options.homeDir).plistPath, {
        currentUid,
        expectedMode: 0o644,
        label: "Current app plist",
      });
      const fullLocalPlist = readPlistSnapshot(
        getFullLocalLaunchAgentPaths(options.homeDir).plistPath,
        { currentUid, expectedMode: 0o600, label: "Current full-local plist" },
      );
      const workerPlist = readPlistSnapshot(
        getYoutubeExtractionWorkerPaths(options.homeDir).plistPath,
        { currentUid, expectedMode: 0o600, label: "Current YouTube worker plist" },
      );
      if (
        realpathSync(appPlist.workingDirectory) !== currentReleaseDir
        || realpathSync(fullLocalPlist.workingDirectory) !== currentReleaseDir
      ) {
        throw new Error("Current app/full-local plist working directory drifted.");
      }
      const currentFullLocalConfig = argumentValue(fullLocalPlist.args, "--config");
      if (
        !currentFullLocalConfig
        || realpathSync(currentFullLocalConfig) !== realpathSync(options.fullLocalConfigPath)
      ) {
        throw new Error("Current full-local plist config path drifted.");
      }

      const appStatus = readLocalMacProductionStatus({ spawn: spawnSync });
      if (!appStatus.running || !Number.isInteger(appStatus.pid)) {
        throw new Error("Current app runtime is not running.");
      }
      const app = readLocalMacProductionRuntimeIdentity({
        component: "app",
        expectedReleaseDir: currentReleaseDir,
        pid: appStatus.pid,
      });
      const fullLocal = readFullLocalWorkloadDefault({
        context: { ...context, homeDir: options.homeDir, releaseDir: currentReleaseDir },
        options,
      });

      const workerManifestPath = argumentValue(workerPlist.args, "--manifest");
      if (!workerManifestPath) throw new Error("Current worker plist manifest path is missing.");
      const workerArtifactRoot = realpathSync(dirname(workerManifestPath));
      assertReadOnlyArtifactRoot(workerArtifactRoot);
      if (realpathSync(workerPlist.workingDirectory) !== workerArtifactRoot) {
        throw new Error("Current worker plist artifact root drifted.");
      }
      const serviceTarget = buildYoutubeExtractionWorkerServiceTarget({ userId: currentUid });
      const workerRaw = spawnSync("/bin/launchctl", ["print", serviceTarget], {
        encoding: "utf8",
      });
      const workerStatus = parseLaunchctlPrintStatus({
        serviceTarget,
        status: workerRaw.status,
        stderr: workerRaw.stderr,
        stdout: workerRaw.stdout,
      });
      if (
        !workerStatus.loaded
        || !["running", "waiting"].includes(workerStatus.state)
        || !Number.isInteger(workerStatus.pid)
      ) {
        throw new Error("Current worker runtime is not running.");
      }
      if (readProcessCwd({ pid: workerStatus.pid }) !== workerArtifactRoot) {
        throw new Error("Current worker runtime artifact root drifted.");
      }
      const workerArtifact = verifyYoutubeExtractionWorkerArtifact(workerManifestPath);
      const currentWorkerPaths = {
        appDescriptorPath: argumentValue(workerPlist.args, "--app-descriptor"),
        workerArtifactPath: workerManifestPath,
        currentPolicyPath: argumentValue(workerPlist.args, "--policy"),
        credentialPath: argumentValue(workerPlist.args, "--credential"),
        expectedSchemaPath: argumentValue(workerPlist.args, "--expected-schema"),
        secretRoot: argumentValue(workerPlist.args, "--secret-root"),
      };
      if (Object.values(currentWorkerPaths).some((value) => !value)) {
        throw new Error("Current worker plist runtime paths are incomplete.");
      }
      const currentWorkerInputs = loadYoutubeExtractionWorkerRuntimeInputs(currentWorkerPaths);
      const currentWorkerPreflight = evaluateYoutubeExtractionWorkerPreflight(
        currentWorkerInputs,
      );
      if (
        !currentWorkerPreflight.ready
        || currentWorkerPreflight.release_sha !== context.currentDescriptor.release_sha
      ) {
        throw new Error("Current worker runtime preflight drifted.");
      }
      const currentIdentity = readLocalMacProductionPreparedReleaseIdentity({
        component: "youtube_worker",
        releaseDir: currentReleaseDir,
      });
      if (workerArtifact.release_sha !== currentIdentity.release_sha) {
        throw new Error("Current worker artifact release SHA drifted.");
      }
      const youtubeWorker = { ...currentIdentity, pid: workerStatus.pid, ready: true };
      const stableKey = sha256Text(JSON.stringify({
        app_pid: appStatus.pid,
        app_plist: appPlist.digest,
        full_local_plist: fullLocalPlist.digest,
        full_local_workload: fullLocal.workload_digest,
        worker_pid: workerStatus.pid,
        worker_plist: workerPlist.digest,
        worker_artifact: workerArtifact.artifact_sha256,
        worker_preflight: currentWorkerPreflight.checks,
      }));
      return {
        stable_key: stableKey,
        app,
        full_local: fullLocal,
        youtube_worker: youtubeWorker,
      };
    },

    installFullLocal: installFullLocalLaunchAgent,
    installApp: installLocalMacProductionLaunchAgent,
    installWorker: (input) => installYoutubeExtractionWorkerLaunchAgent({
      ...input,
      spawn: spawnSync,
    }),

    readAppRuntimeIdentity: async ({ context }) => {
      const status = readLocalMacProductionStatus({ spawn: spawnSync });
      if (!status.running || !Number.isInteger(status.pid)) {
        throw new Error("Promoted app runtime is not running.");
      }
      await waitForLocalMacProductionReady();
      return readLocalMacProductionRuntimeIdentity({
        component: "app",
        expectedReleaseDir: context.releaseDir,
        pid: status.pid,
      });
    },

    readFullLocalWorkloadIdentity: readFullLocalWorkloadDefault,

    readWorkerRuntimeIdentity: async ({ context, options, preflight }) => {
      const userId = preflight.worker.userId;
      const serviceTarget = buildYoutubeExtractionWorkerServiceTarget({ userId });
      const raw = spawnSync("/bin/launchctl", ["print", serviceTarget], { encoding: "utf8" });
      const status = parseLaunchctlPrintStatus({
        serviceTarget,
        status: raw.status,
        stderr: raw.stderr,
        stdout: raw.stdout,
      });
      if (
        !status.loaded
        || !["running", "waiting"].includes(status.state)
        || !Number.isInteger(status.pid)
      ) {
        throw new Error("Promoted worker runtime is not running.");
      }
      if (readProcessCwd({ pid: status.pid }) !== preflight.worker.artifactRoot) {
        throw new Error("Promoted worker runtime artifact root drifted.");
      }
      const artifact = verifyYoutubeExtractionWorkerArtifact(options.workerManifestPath);
      const identity = readLocalMacProductionPreparedReleaseIdentity({
        component: "youtube_worker",
        releaseDir: context.releaseDir,
      });
      if (artifact.release_sha !== identity.release_sha) {
        throw new Error("Promoted worker artifact release SHA drifted.");
      }
      return { ...identity, pid: status.pid, ready: true };
    },
  };
}

export function createLocalMacProductionPromoteAdapters(options, dependencies = {}) {
  const resolvedDependencies = {
    ...buildDefaultDependencies(),
    ...dependencies,
  };
  const validateMutationTargets = requireFunction(
    resolvedDependencies.validateMutationTargets,
    "validateMutationTargets",
  );
  const readWorkerReleasePreflight = requireFunction(
    resolvedDependencies.readWorkerReleasePreflight,
    "readWorkerReleasePreflight",
  );
  const readCurrentRuntimeBundle = requireFunction(
    resolvedDependencies.readCurrentRuntimeBundle,
    "readCurrentRuntimeBundle",
  );
  const installFullLocal = requireFunction(resolvedDependencies.installFullLocal, "installFullLocal");
  const installApp = requireFunction(resolvedDependencies.installApp, "installApp");
  const installWorker = requireFunction(resolvedDependencies.installWorker, "installWorker");
  const readAppRuntimeIdentity = requireFunction(
    resolvedDependencies.readAppRuntimeIdentity,
    "readAppRuntimeIdentity",
  );
  const readFullLocalWorkloadIdentity = requireFunction(
    resolvedDependencies.readFullLocalWorkloadIdentity,
    "readFullLocalWorkloadIdentity",
  );
  const readWorkerRuntimeIdentity = requireFunction(
    resolvedDependencies.readWorkerRuntimeIdentity,
    "readWorkerRuntimeIdentity",
  );

  return {
    preflightBundle: async (context) => {
      if (options.confirmation !== YOUTUBE_EXTRACTION_WORKER_INSTALL_CONFIRMATION) {
        throw new Error(
          `promote requires exact --confirm-production ${YOUTUBE_EXTRACTION_WORKER_INSTALL_CONFIRMATION}.`,
        );
      }
      validateMutationTargets({ context, options });
      const worker = await readWorkerReleasePreflight({ context, options });
      if (
        !worker
        || typeof worker.artifactRoot !== "string"
        || worker.preflight?.ready !== true
        || worker.preflight.release_sha !== context.manifest.release_sha
      ) {
        throw new Error("Worker release preflight does not match the exact promoted release.");
      }
      const current = await readCurrentRuntimeBundle({ context, options });
      if (!current || typeof current.stable_key !== "string" || current.stable_key.length === 0) {
        throw new Error("Current runtime bundle preflight did not produce stable evidence.");
      }
      for (const component of ["app", "full_local", "youtube_worker"]) {
        assertExactIdentity(component, current[component], context.currentDescriptor);
      }
      const stableKey = sha256Text(JSON.stringify({
        current: current.stable_key,
        worker_artifact_root: worker.artifactRoot,
        worker_artifact_sha256: worker.inputs?.workerArtifact?.artifact_sha256 ?? null,
        worker_preflight: worker.preflight,
        i031_preflight: worker.i031Preflight,
      }));
      return {
        stable_key: stableKey,
        current,
        worker,
      };
    },

    installBundle: async ({ preflight, ...context }) => {
      if (!preflight?.worker?.artifactRoot) {
        throw new Error("Locked promote preflight evidence is required before installation.");
      }
      const fullLocal = installFullLocal({
        configPath: options.fullLocalConfigPath,
        homeDir: context.homeDir,
        mutationAuthority: context.mutationAuthority,
        nodeBin: options.nodeBin,
        rootDir: context.releaseDir,
      });
      const app = installApp({
        homeDir: context.homeDir,
        mutationAuthority: context.mutationAuthority,
        nodeBin: options.nodeBin,
        rootDir: context.releaseDir,
      });
      const worker = installWorker({
        appDescriptorPath: options.workerAppDescriptorPath,
        configPath: options.workerConfigPath,
        confirmation: options.confirmation,
        credentialPath: options.workerCredentialPath,
        currentPolicyPath: options.workerPolicyPath,
        expectedSchemaPath: options.workerExpectedSchemaPath,
        homeDir: context.homeDir,
        i031Preflight: preflight.worker.i031Preflight,
        manifestPath: options.workerManifestPath,
        mutationAuthority: context.mutationAuthority,
        nodeBin: options.nodeBin,
        rootDir: preflight.worker.artifactRoot,
        secretRoot: options.workerSecretRoot,
        userId: preflight.worker.userId,
      });
      return { app, full_local: fullLocal, worker };
    },

    readinessProbe: async ({ preflight, ...context }) => {
      const app = await readAppRuntimeIdentity({ context, options, preflight });
      const fullLocal = await readFullLocalWorkloadIdentity({ context, options, preflight });
      const worker = await readWorkerRuntimeIdentity({ context, options, preflight });
      if (
        fullLocal.runtime_present !== true
        || fullLocal.healthy !== true
        || fullLocal.authorization_contract_status !== "PASS"
        || fullLocal.product_catalog_status !== "PASS"
      ) {
        throw new Error("Full-local Docker workload readiness failed.");
      }
      return { app, full_local: fullLocal, youtube_worker: worker };
    },
  };
}
