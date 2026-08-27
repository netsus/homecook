import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

import {
  getLocalMacProductionPaths,
  installLocalMacProductionLaunchAgent,
  readLocalMacProductionStatus,
  renderLocalMacProductionPlist,
  waitForLocalMacProductionReady,
} from "./local-mac-production.mjs";
import {
  getFullLocalLaunchAgentPaths,
  installFullLocalLaunchAgent,
  renderFullLocalLaunchAgentPlist,
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
  renderYoutubeExtractionWorkerPlist,
  validateYoutubeExtractionWorkerConfigPath,
  validateYoutubeExtractionWorkerSecretFile,
  validateYoutubeExtractionWorkerSecretRoot,
  YOUTUBE_EXTRACTION_WORKER_INSTALL_CONFIRMATION,
} from "./youtube-extraction-worker-ops.mjs";
import {
  sha256File,
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

function assertSafeAncestors(trustedRoot, targetPath, currentUid, label) {
  const root = resolve(trustedRoot);
  const parent = dirname(resolve(targetPath));
  const relativeParent = relative(root, parent);
  if (relativeParent.startsWith("..") || relativeParent.startsWith(sep)) {
    throw new Error(`${label} escapes the trusted home root.`);
  }
  let cursor = root;
  for (const segment of relativeParent.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, segment);
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`${label} ancestor must be a regular directory.`);
    }
    if (stat.uid !== currentUid || (modeBits(stat.mode) & 0o022) !== 0) {
      throw new Error(`${label} ancestor owner or mode is unsafe.`);
    }
  }
}

function readPlistSnapshot(path, { currentUid, expectedMode, label, trustedRoot }) {
  if (trustedRoot) assertSafeAncestors(trustedRoot, path, currentUid, label);
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
    text,
    workingDirectory,
  };
}

export function assertCanonicalLocalMacProductionPlist({
  actualPath,
  currentUid,
  expectedContent,
  expectedMode,
  label,
  trustedRoot = "",
}) {
  const snapshot = readPlistSnapshot(actualPath, {
    currentUid,
    expectedMode,
    label,
    trustedRoot,
  });
  if (snapshot.text !== expectedContent) {
    throw new Error(`${label} content drifted from the canonical renderer.`);
  }
  return snapshot;
}

export function buildCanonicalCurrentYoutubeWorkerPlist({
  currentDescriptor,
  digestFile = sha256File,
  options,
  renderWorkerPlist = renderYoutubeExtractionWorkerPlist,
  verifyWorkerArtifact = verifyYoutubeExtractionWorkerArtifact,
}) {
  const artifactRoot = currentDescriptor?.worker_artifact_root;
  const manifestPath = currentDescriptor?.worker_manifest_path;
  if (typeof artifactRoot !== "string" || typeof manifestPath !== "string") {
    throw new Error("Current descriptor is missing worker artifact path authority.");
  }
  const authorityRoot = resolve(dirname(artifactRoot), "authority");
  const appDescriptorPath = resolve(authorityRoot, "app-descriptor.json");
  const expectedSchemaPath = resolve(authorityRoot, "expected-schema.json");
  const policyPath = resolve(authorityRoot, "policy.json");
  if (
    verifyWorkerArtifact(manifestPath).artifact_sha256
    !== currentDescriptor.worker_artifact_sha256
  ) {
    throw new Error("Current worker artifact digest drifted.");
  }
  for (const [path, expectedDigest, label] of [
    [appDescriptorPath, currentDescriptor.worker_app_descriptor_sha256, "app descriptor"],
    [options.workerConfigPath, currentDescriptor.worker_config_sha256, "config"],
    [options.workerCredentialPath, currentDescriptor.worker_credential_sha256, "credential"],
    [expectedSchemaPath, currentDescriptor.worker_expected_schema_sha256, "schema"],
    [policyPath, currentDescriptor.worker_policy_sha256, "policy"],
  ]) {
    if (typeof expectedDigest !== "string" || digestFile(path) !== expectedDigest) {
      throw new Error(`Current worker ${label} digest drifted.`);
    }
  }
  return renderWorkerPlist({
    appDescriptorPath,
    configPath: options.workerConfigPath,
    credentialPath: options.workerCredentialPath,
    currentPolicyPath: policyPath,
    expectedSchemaPath,
    homeDir: options.homeDir,
    manifestPath,
    nodeBin: options.nodeBin,
    rootDir: artifactRoot,
    secretRoot: options.workerSecretRoot,
  });
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

function readFullLocalWorkloadDefault({
  context,
  options,
  checkPlist = true,
  allowLegacyBootstrap = false,
  commandRunner = spawnSync,
}) {
  const currentUid = process.getuid?.();
  if (!Number.isInteger(currentUid)) throw new Error("Current user uid is unavailable.");
  if (checkPlist) assertCanonicalLocalMacProductionPlist({
    actualPath: getFullLocalLaunchAgentPaths(context.homeDir).plistPath,
    currentUid,
    expectedContent: renderFullLocalLaunchAgentPlist({
      configPath: options.fullLocalConfigPath,
      homeDir: context.homeDir,
      nodeBin: options.nodeBin,
      releaseIdentityPath: resolve(context.releaseDir, "prepare.json"),
      rootDir: context.releaseDir,
      runtimeCommand: allowLegacyBootstrap ? "start" : "status",
      includeReleaseIdentity: !allowLegacyBootstrap,
    }),
    expectedMode: 0o600,
    label: "Full-local plist",
    trustedRoot: context.homeDir,
  });
  const expectedIdentity = readLocalMacProductionPreparedReleaseIdentity({
    component: "full_local",
    releaseDir: context.releaseDir,
    runCommand: commandRunner,
  });
  const releaseIdentityPath = resolve(context.releaseDir, "prepare.json");
  const runtimeRoot = allowLegacyBootstrap ? context.rootDir : context.releaseDir;
  const runtimeArgs = [
      resolve(runtimeRoot, "scripts", "full-local-production-runtime.mjs"),
      "status",
      "--config",
      options.fullLocalConfigPath,
      "--release-identity",
      releaseIdentityPath,
  ];
  if (allowLegacyBootstrap) runtimeArgs.push("--allow-legacy-release-bootstrap");
  const result = commandRunner(
    options.nodeBin,
    runtimeArgs,
    {
      cwd: runtimeRoot,
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
  const observedIdentity = status.release_identity;
  if (
    !observedIdentity
    || observedIdentity.release_sha !== expectedIdentity.release_sha
    || observedIdentity.release_tree !== expectedIdentity.release_tree
    || observedIdentity.build_id !== expectedIdentity.build_id
    || observedIdentity.promotion_id !== expectedIdentity.promotion_id
  ) {
    throw new Error("Full-local Docker workload release identity mismatch.");
  }
  return {
    ...observedIdentity,
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

async function readI031PreflightDefault(
  options,
  userId,
  preflightVerifier = verifyStandaloneYoutubeI031Preflight,
) {
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
  const result = await preflightVerifier({
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
    || state.promotion_id !== expected.promotion_id
  ) {
    throw new Error(`Current ${component} runtime identity drifted from the current descriptor.`);
  }
}

const WORKER_PATH_AUTHORITY_FIELDS = Object.freeze([
  "artifactRoot",
  "manifestPath",
  "appDescriptorPath",
  "configPath",
  "credentialPath",
  "expectedSchemaPath",
  "policyPath",
  "secretRoot",
  "artifactSha256",
  "appDescriptorSha256",
  "configSha256",
  "credentialSha256",
  "expectedSchemaSha256",
  "policySha256",
]);

function assertWorkerPathAuthority(worker) {
  if (!worker || WORKER_PATH_AUTHORITY_FIELDS.some(
    (field) => typeof worker[field] !== "string" || worker[field].length === 0,
  )) {
    throw new Error("Worker path authority is incomplete.");
  }
  return Object.fromEntries(WORKER_PATH_AUTHORITY_FIELDS.map((field) => [
    field,
    worker[field],
  ]));
}

function verifySealedExecutionContext(context) {
  if (
    typeof context?.verifyExecutionSnapshot !== "function"
    || !context.executionSnapshot
  ) {
    throw new Error("Sealed execution snapshot verifier is not configured.");
  }
  return context.verifyExecutionSnapshot(context.executionSnapshot);
}

function buildDefaultDependencies(
  commandRunner = spawnSync,
  i031PreflightVerifier = verifyStandaloneYoutubeI031Preflight,
  appReadinessWaiter = waitForLocalMacProductionReady,
  platform = process.platform,
) {
  return {
    validateMutationTargets: ({ options }) => {
      const currentUid = process.getuid?.();
      if (!Number.isInteger(currentUid)) throw new Error("Current user uid is unavailable.");
      readPlistSnapshot(getLocalMacProductionPaths(options.homeDir).plistPath, {
        currentUid,
        expectedMode: 0o644,
        label: "App plist target",
        trustedRoot: options.homeDir,
      });
      readPlistSnapshot(getFullLocalLaunchAgentPaths(options.homeDir).plistPath, {
        currentUid,
        expectedMode: 0o600,
        label: "Full-local plist target",
        trustedRoot: options.homeDir,
      });
      readPlistSnapshot(getYoutubeExtractionWorkerPaths(options.homeDir).plistPath, {
        currentUid,
        expectedMode: 0o600,
        label: "YouTube worker plist target",
        trustedRoot: options.homeDir,
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
      const i031Preflight = await readI031PreflightDefault(
        options,
        userId,
        i031PreflightVerifier,
      );
      return {
        artifactRoot,
        manifestPath: realpathSync(options.workerManifestPath),
        appDescriptorPath: realpathSync(options.workerAppDescriptorPath),
        configPath: realpathSync(options.workerConfigPath),
        credentialPath: realpathSync(options.workerCredentialPath),
        expectedSchemaPath: realpathSync(options.workerExpectedSchemaPath),
        policyPath: realpathSync(options.workerPolicyPath),
        secretRoot: realpathSync(options.workerSecretRoot),
        artifactSha256: inputs.workerArtifact.artifact_sha256,
        appDescriptorSha256: sha256File(options.workerAppDescriptorPath),
        configSha256: sha256File(options.workerConfigPath),
        credentialSha256: sha256File(options.workerCredentialPath),
        expectedSchemaSha256: sha256File(options.workerExpectedSchemaPath),
        policySha256: sha256File(options.workerPolicyPath),
        i031Preflight,
        inputs,
        preflight,
        userId,
      };
    },

    readCurrentRuntimeBundle: async ({ context, options }) => {
      const currentUid = process.getuid?.();
      if (!Number.isInteger(currentUid)) throw new Error("Current user uid is unavailable.");
      const currentReleaseDir = realpathSync(context.currentReleaseDir);
      const appPlistPath = getLocalMacProductionPaths(options.homeDir).plistPath;
      const appPlist = assertCanonicalLocalMacProductionPlist({
        actualPath: appPlistPath,
        currentUid,
        expectedContent: renderLocalMacProductionPlist({
          homeDir: options.homeDir,
          nodeBin: options.nodeBin,
          rootDir: currentReleaseDir,
        }),
        expectedMode: 0o644,
        label: "Current app plist",
        trustedRoot: options.homeDir,
      });
      const fullLocalPlistPath = getFullLocalLaunchAgentPaths(options.homeDir).plistPath;
      const fullLocalPlist = assertCanonicalLocalMacProductionPlist({
        actualPath: fullLocalPlistPath,
        currentUid,
        expectedContent: renderFullLocalLaunchAgentPlist({
          configPath: options.fullLocalConfigPath,
          homeDir: options.homeDir,
          includeReleaseIdentity:
            context.currentDescriptor.release_sha
            !== "e02f02a87d1d955dc598728e7029a745a650a5c3",
          nodeBin: options.nodeBin,
          releaseIdentityPath: resolve(currentReleaseDir, "prepare.json"),
          rootDir: currentReleaseDir,
          runtimeCommand:
            context.currentDescriptor.release_sha
            === "e02f02a87d1d955dc598728e7029a745a650a5c3"
              ? "start"
              : "status",
        }),
        expectedMode: 0o600,
        label: "Current full-local plist",
        trustedRoot: options.homeDir,
      });
      const workerPlist = readPlistSnapshot(
        getYoutubeExtractionWorkerPaths(options.homeDir).plistPath,
        {
          currentUid,
          expectedMode: 0o600,
          label: "Current YouTube worker plist",
          trustedRoot: options.homeDir,
        },
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

      const appStatus = readLocalMacProductionStatus({ spawn: commandRunner });
      if (!appStatus.running || !Number.isInteger(appStatus.pid)) {
        throw new Error("Current app runtime is not running.");
      }
      const app = readLocalMacProductionRuntimeIdentity({
        component: "app",
        expectedReleaseDir: currentReleaseDir,
        pid: appStatus.pid,
        runCommand: commandRunner,
      });
      const fullLocal = readFullLocalWorkloadDefault({
        context: { ...context, homeDir: options.homeDir, releaseDir: currentReleaseDir },
        options,
        commandRunner,
        allowLegacyBootstrap:
          context.currentDescriptor.release_sha
          === "e02f02a87d1d955dc598728e7029a745a650a5c3",
      });

      const actualWorkerManifestPath = argumentValue(workerPlist.args, "--manifest");
      if (!actualWorkerManifestPath) {
        throw new Error("Current worker plist manifest path is missing.");
      }
      const legacyBootstrap = context.currentDescriptor.release_sha
        === "e02f02a87d1d955dc598728e7029a745a650a5c3";
      const workerManifestPath = legacyBootstrap
        ? actualWorkerManifestPath
        : context.currentDescriptor.worker_manifest_path;
      const workerArtifactRoot = legacyBootstrap
        ? realpathSync(dirname(actualWorkerManifestPath))
        : context.currentDescriptor.worker_artifact_root;
      if (typeof workerManifestPath !== "string" || typeof workerArtifactRoot !== "string") {
        throw new Error("Current descriptor is missing worker artifact path authority.");
      }
      assertReadOnlyArtifactRoot(workerArtifactRoot);
      if (realpathSync(workerPlist.workingDirectory) !== workerArtifactRoot) {
        throw new Error("Current worker plist artifact root drifted.");
      }
      const serviceTarget = buildYoutubeExtractionWorkerServiceTarget({ userId: currentUid });
      const workerRaw = commandRunner("/bin/launchctl", ["print", serviceTarget], {
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
      if (readProcessCwd({ pid: workerStatus.pid, spawn: commandRunner }) !== workerArtifactRoot) {
        throw new Error("Current worker runtime artifact root drifted.");
      }
      const workerArtifact = verifyYoutubeExtractionWorkerArtifact(workerManifestPath, {
        allowLegacyReleaseSha: legacyBootstrap ? context.currentDescriptor.release_sha : null,
      });
      const currentWorkerPaths = legacyBootstrap ? {
        appDescriptorPath: argumentValue(workerPlist.args, "--app-descriptor"),
        configPath: argumentValue(workerPlist.args, "--config"),
        workerArtifactPath: workerManifestPath,
        currentPolicyPath: argumentValue(workerPlist.args, "--policy"),
        credentialPath: argumentValue(workerPlist.args, "--credential"),
        expectedSchemaPath: argumentValue(workerPlist.args, "--expected-schema"),
        secretRoot: argumentValue(workerPlist.args, "--secret-root"),
      } : {
        appDescriptorPath: resolve(dirname(workerArtifactRoot), "authority", "app-descriptor.json"),
        configPath: argumentValue(workerPlist.args, "--config"),
        workerArtifactPath: workerManifestPath,
        currentPolicyPath: resolve(dirname(workerArtifactRoot), "authority", "policy.json"),
        credentialPath: argumentValue(workerPlist.args, "--credential"),
        expectedSchemaPath: resolve(dirname(workerArtifactRoot), "authority", "expected-schema.json"),
        secretRoot: argumentValue(workerPlist.args, "--secret-root"),
      };
      if (Object.values(currentWorkerPaths).some((value) => !value)) {
        throw new Error("Current worker plist runtime paths are incomplete.");
      }
      const canonicalWorkerPlist = legacyBootstrap
        ? renderYoutubeExtractionWorkerPlist({
          appDescriptorPath: currentWorkerPaths.appDescriptorPath,
          configPath: currentWorkerPaths.configPath,
          credentialPath: currentWorkerPaths.credentialPath,
          currentPolicyPath: currentWorkerPaths.currentPolicyPath,
          expectedSchemaPath: currentWorkerPaths.expectedSchemaPath,
          homeDir: options.homeDir,
          manifestPath: workerManifestPath,
          nodeBin: options.nodeBin,
          rootDir: workerArtifactRoot,
          secretRoot: currentWorkerPaths.secretRoot,
        })
        : buildCanonicalCurrentYoutubeWorkerPlist({
          currentDescriptor: context.currentDescriptor,
          options: {
            ...options,
            workerConfigPath: currentWorkerPaths.configPath,
            workerCredentialPath: currentWorkerPaths.credentialPath,
            workerSecretRoot: currentWorkerPaths.secretRoot,
          },
        });
      assertCanonicalLocalMacProductionPlist({
        actualPath: workerPlist.path,
        currentUid,
        expectedContent: canonicalWorkerPlist,
        expectedMode: 0o600,
        label: "Current YouTube worker plist",
        trustedRoot: options.homeDir,
      });
      const currentWorkerPreflight = legacyBootstrap
        ? {
          ...evaluateYoutubeExtractionWorkerPreflight(
            loadYoutubeExtractionWorkerRuntimeInputs({
              ...currentWorkerPaths,
              expectedSchemaPath: null,
            }),
          ),
          legacy_bootstrap: true,
          legacy_bootstrap_contract: "e02f-worker-v1",
        }
        : evaluateYoutubeExtractionWorkerPreflight(
          loadYoutubeExtractionWorkerRuntimeInputs(currentWorkerPaths),
        );
      if (
        !currentWorkerPreflight.ready
        || currentWorkerPreflight.release_sha !== context.currentDescriptor.release_sha
      ) {
        throw new Error("Current worker runtime preflight drifted.");
      }
      const youtubeWorker = {
        release_sha: workerArtifact.release_sha,
        release_tree: legacyBootstrap
          ? context.currentDescriptor.release_tree
          : workerArtifact.release_tree,
        build_id: legacyBootstrap
          ? context.currentDescriptor.build_id
          : workerArtifact.build_id,
        promotion_id: legacyBootstrap
          ? context.currentDescriptor.promotion_id
          : workerArtifact.promotion_id,
        pid: workerStatus.pid,
        ready: true,
        ...(legacyBootstrap ? { legacy_bootstrap: true } : {}),
        ...(legacyBootstrap
          ? { legacy_bootstrap_contract: "e02f-worker-v1" }
          : {}),
      };
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

    startFullLocal: ({ context, options }) => {
      const result = commandRunner(options.nodeBin, [
        resolve(context.releaseDir, "scripts", "full-local-production-runtime.mjs"),
        "start",
        "--config",
        options.fullLocalConfigPath,
        "--release-identity",
        resolve(context.releaseDir, "prepare.json"),
        "--release-manifest",
        context.manifest.release_manifest_path,
        "--lock-token",
        context.lockToken,
        "--bundle",
        options.bundlePath,
        "--subject-manifest",
        options.subjectManifestPath,
        "--trusted-root",
        options.trustedRootPath,
        "--authority-root",
        context.rootDir,
      ], {
        cwd: context.releaseDir,
        encoding: "utf8",
        env: {
          HOME: context.homeDir,
          PATH: sanitizedPath(options.nodeBin),
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (result.status !== 0) {
        throw new Error("Candidate full-local synchronous start failed.");
      }
      return { started: true };
    },
    confirmFullLocalCandidate: ({ context, options }) =>
      readFullLocalWorkloadDefault({
        context,
        options,
        checkPlist: false,
        commandRunner,
      }),
    installFullLocal: (input) => installFullLocalLaunchAgent({
      ...input,
      platform,
      spawn: commandRunner,
    }),
    installApp: (input) => installLocalMacProductionLaunchAgent({
      ...input,
      platform,
      spawn: commandRunner,
    }),
    installWorker: (input) => installYoutubeExtractionWorkerLaunchAgent({
      ...input,
      spawn: commandRunner,
    }),

    readAppRuntimeIdentity: async ({ context, options }) => {
      const currentUid = process.getuid?.();
      if (!Number.isInteger(currentUid)) throw new Error("Current user uid is unavailable.");
      assertCanonicalLocalMacProductionPlist({
        actualPath: getLocalMacProductionPaths(context.homeDir).plistPath,
        currentUid,
        expectedContent: renderLocalMacProductionPlist({
          homeDir: context.homeDir,
          nodeBin: options.nodeBin,
          rootDir: context.releaseDir,
        }),
        expectedMode: 0o644,
        label: "Promoted app plist",
        trustedRoot: context.homeDir,
      });
      const status = readLocalMacProductionStatus({ spawn: commandRunner });
      if (!status.running || !Number.isInteger(status.pid)) {
        throw new Error("Promoted app runtime is not running.");
      }
      await appReadinessWaiter();
      return readLocalMacProductionRuntimeIdentity({
        component: "app",
        expectedReleaseDir: context.releaseDir,
        pid: status.pid,
        runCommand: commandRunner,
      });
    },

    readFullLocalWorkloadIdentity: (input) => readFullLocalWorkloadDefault({
      ...input,
      commandRunner,
    }),

    readWorkerRuntimeIdentity: async ({
      context,
      options,
      preflight,
      requirePolicyEnabled = false,
    }) => {
      const userId = preflight.worker.userId;
      assertCanonicalLocalMacProductionPlist({
        actualPath: getYoutubeExtractionWorkerPaths(context.homeDir).plistPath,
        currentUid: userId,
        expectedContent: renderYoutubeExtractionWorkerPlist({
          appDescriptorPath: preflight.worker.appDescriptorPath,
          configPath: options.workerConfigPath,
          credentialPath: options.workerCredentialPath,
          currentPolicyPath: preflight.worker.policyPath,
          expectedSchemaPath: preflight.worker.expectedSchemaPath,
          homeDir: context.homeDir,
          manifestPath: preflight.worker.manifestPath,
          nodeBin: options.nodeBin,
          rootDir: preflight.worker.artifactRoot,
          secretRoot: options.workerSecretRoot,
        }),
        expectedMode: 0o600,
        label: "Promoted YouTube worker plist",
        trustedRoot: context.homeDir,
      });
      const serviceTarget = buildYoutubeExtractionWorkerServiceTarget({ userId });
      const raw = commandRunner("/bin/launchctl", ["print", serviceTarget], { encoding: "utf8" });
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
      if (readProcessCwd({ pid: status.pid, spawn: commandRunner }) !== preflight.worker.artifactRoot) {
        throw new Error("Promoted worker runtime artifact root drifted.");
      }
      const finalInputs = loadYoutubeExtractionWorkerRuntimeInputs({
        appDescriptorPath: preflight.worker.appDescriptorPath,
        workerArtifactPath: preflight.worker.manifestPath,
        currentPolicyPath: preflight.worker.policyPath,
        credentialPath: options.workerCredentialPath,
        expectedSchemaPath: preflight.worker.expectedSchemaPath,
        secretRoot: options.workerSecretRoot,
      });
      const finalPreflight = evaluateYoutubeExtractionWorkerPreflight({
        ...finalInputs,
        requirePolicyEnabled,
      });
      if (!finalPreflight.ready) {
        throw new Error("Final worker release preflight failed closed.");
      }
      const finalDigests = {
        artifactSha256: finalInputs.workerArtifact.artifact_sha256,
        appDescriptorSha256: sha256File(preflight.worker.appDescriptorPath),
        configSha256: sha256File(options.workerConfigPath),
        credentialSha256: sha256File(options.workerCredentialPath),
        expectedSchemaSha256: sha256File(preflight.worker.expectedSchemaPath),
        policySha256: sha256File(preflight.worker.policyPath),
      };
      for (const [field, digest] of Object.entries(finalDigests)) {
        if (preflight.worker[field] !== digest) {
          throw new Error(`Final worker ${field} drifted after installation.`);
        }
      }
      const finalI031Preflight = await readI031PreflightDefault(
        options,
        userId,
        i031PreflightVerifier,
      );
      if (finalI031Preflight.ready !== true) {
        throw new Error("Final worker i031 preflight failed.");
      }
      const artifact = verifyYoutubeExtractionWorkerArtifact(preflight.worker.manifestPath);
      return {
        release_sha: artifact.release_sha,
        release_tree: artifact.release_tree,
        build_id: artifact.build_id,
        promotion_id: artifact.promotion_id,
        pid: status.pid,
        ready: true,
        final_preflight: finalPreflight,
        i031_preflight: finalI031Preflight,
        ...finalDigests,
      };
    },
  };
}

export function createLocalMacProductionPromoteAdapters(options, dependencies = {}) {
  const {
    commandRunner = spawnSync,
    i031PreflightVerifier = verifyStandaloneYoutubeI031Preflight,
    appReadinessWaiter = waitForLocalMacProductionReady,
    platform = process.platform,
    ...dependencyOverrides
  } = dependencies;
  const resolvedDependencies = {
    ...buildDefaultDependencies(
      commandRunner,
      i031PreflightVerifier,
      appReadinessWaiter,
      platform,
    ),
    ...dependencyOverrides,
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
  const startFullLocal = requireFunction(resolvedDependencies.startFullLocal, "startFullLocal");
  const confirmFullLocalCandidate = requireFunction(
    resolvedDependencies.confirmFullLocalCandidate,
    "confirmFullLocalCandidate",
  );
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
        || worker.preflight.release_tree !== context.manifest.release_tree
        || worker.preflight.build_id !== context.manifest.build_id
        || worker.preflight.promotion_id !== context.manifest.promotion_id
      ) {
        throw new Error("Worker release preflight does not match the exact promoted release.");
      }
      const workerPathAuthority = assertWorkerPathAuthority(worker);
      const current = await readCurrentRuntimeBundle({ context, options });
      if (!current || typeof current.stable_key !== "string" || current.stable_key.length === 0) {
        throw new Error("Current runtime bundle preflight did not produce stable evidence.");
      }
      for (const component of ["app", "full_local", "youtube_worker"]) {
        assertExactIdentity(component, current[component], context.currentDescriptor);
      }
      const stableKey = sha256Text(JSON.stringify({
        current: current.stable_key,
        worker_path_authority: workerPathAuthority,
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
      assertWorkerPathAuthority(preflight?.worker);
      verifySealedExecutionContext(context);
      startFullLocal({ context, options, preflight });
      verifySealedExecutionContext(context);
      const confirmedFullLocal = await confirmFullLocalCandidate({ context, options, preflight });
      assertExactIdentity("full_local", confirmedFullLocal, context.manifest);
      verifySealedExecutionContext(context);
      const fullLocal = installFullLocal({
        configPath: options.fullLocalConfigPath,
        homeDir: context.homeDir,
        mutationAuthority: context.mutationAuthority,
        nodeBin: options.nodeBin,
        runtimeCommand: "status",
        rootDir: context.releaseDir,
      });
      verifySealedExecutionContext(context);
      const app = installApp({
        homeDir: context.homeDir,
        mutationAuthority: context.mutationAuthority,
        nodeBin: options.nodeBin,
        rootDir: context.releaseDir,
      });
      verifySealedExecutionContext(context);
      const worker = installWorker({
        appDescriptorPath: preflight.worker.appDescriptorPath,
        configPath: options.workerConfigPath,
        confirmation: options.confirmation,
        credentialPath: options.workerCredentialPath,
        currentPolicyPath: preflight.worker.policyPath,
        expectedSchemaPath: preflight.worker.expectedSchemaPath,
        homeDir: context.homeDir,
        i031Preflight: preflight.worker.i031Preflight,
        manifestPath: preflight.worker.manifestPath,
        mutationAuthority: context.mutationAuthority,
        nodeBin: options.nodeBin,
        rootDir: preflight.worker.artifactRoot,
        secretRoot: options.workerSecretRoot,
        userId: preflight.worker.userId,
      });
      return { app, full_local: fullLocal, worker };
    },

    readinessProbe: async ({ preflight, ...context }) => {
      verifySealedExecutionContext(context);
      const app = await readAppRuntimeIdentity({ context, options, preflight });
      verifySealedExecutionContext(context);
      const fullLocal = await readFullLocalWorkloadIdentity({ context, options, preflight });
      verifySealedExecutionContext(context);
      const worker = await readWorkerRuntimeIdentity({
        context,
        options,
        preflight,
        requirePolicyEnabled: false,
      });
      if (
        fullLocal.runtime_present !== true
        || fullLocal.healthy !== true
        || fullLocal.authorization_contract_status !== "PASS"
        || fullLocal.product_catalog_status !== "PASS"
      ) {
        throw new Error("Full-local Docker workload readiness failed.");
      }
      for (const [component, state] of [
        ["app", app],
        ["full_local", fullLocal],
        ["youtube_worker", worker],
      ]) {
        assertExactIdentity(component, state, context.manifest);
      }
      return { app, full_local: fullLocal, youtube_worker: worker };
    },

    finalWorkerProbe: async ({ preflight, ...context }) => {
      verifySealedExecutionContext(context);
      return readWorkerRuntimeIdentity({
        context,
        options,
        preflight,
        requirePolicyEnabled: true,
      });
    },
  };
}
