import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

import {
  collectReadOnlyProductionInventory,
  createLocalProductionInventoryAdapters,
  createProductionSurfaceSnapshot,
} from "./local-mac-production-rehearsal-inventory.mjs";
import {
  FULL_LOCAL_SECRET_NAMES,
  generateFullLocalSecretBundle,
  materializeSecretFilesCreateOnly,
} from "./full-local-production-runtime.mjs";
import { resolveTrustedDockerBinary } from "./full-local-session-observation-reader.mjs";
import { canonicalizeJcs, sha256Jcs } from "./rfc8785-jcs.mjs";
import {
  RUN_OWNERSHIP_LABEL,
  RUN_PROJECT_LABEL,
  validateChildEnvironment,
  validateDockerInvocation,
} from "./local-mac-production-rehearsal-runner.mjs";
import {
  buildYoutubeExtractionAppDescriptor,
  buildYoutubeExtractionCurrentPolicy,
  buildYoutubeExtractionWorkerQueueState,
} from "./youtube-extraction-worker-artifact.mjs";
import { issueYoutubeExtractionWorkerCredential } from "./youtube-extraction-worker-local-credential.mjs";
import { buildYoutubeExtractionWorkerCredentialState } from "./youtube-extraction-worker-ops.mjs";

const COMMAND_TIMEOUT_MS = 180_000;
const OUTPUT_LIMIT_BYTES = 1_048_576;
const SERVICES = [
  "api-gateway",
  "auth",
  "auth-proxy",
  "postgres",
  "postgrest",
  "postgrest-probe",
  "storage",
];
const RESOURCE_KIND_ORDER = { network: 0, volume: 1, container: 2 };

function fail(message) {
  throw new Error(`Release rehearsal local adapter rejected: ${message}`);
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function decodeFatalUtf8(bytes, label) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!Buffer.from(text, "utf8").equals(bytes)) fail(`${label} UTF-8 round trip differs`);
    return text;
  } catch {
    fail(`${label} contains invalid UTF-8`);
  }
}

function safeDockerEnvironment() {
  const home = process.env.HOME;
  if (!home) fail("HOME is required for the trusted local Docker client");
  return {
    HOME: home,
    PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
  };
}

function boundedCommand(commandRunner, executable, args, {
  input,
  allowFailure = false,
  timeout = COMMAND_TIMEOUT_MS,
  env = safeDockerEnvironment(),
} = {}) {
  const result = commandRunner(executable, args, {
    encoding: "utf8",
    env,
    input,
    maxBuffer: OUTPUT_LIMIT_BYTES,
    timeout,
  });
  if (result.error) fail(`bounded command failed: ${result.error.message}`);
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (Buffer.byteLength(stdout) > OUTPUT_LIMIT_BYTES || Buffer.byteLength(stderr) > OUTPUT_LIMIT_BYTES) {
    fail("bounded command output overflow");
  }
  if (!allowFailure && result.status !== 0) {
    fail(`command exited ${String(result.status)}: ${stderr.slice(0, 512)}`);
  }
  return { status: result.status, stdout, stderr };
}

function dockerCommand(state, args, options = {}) {
  validateDockerInvocation(args, options.ownership ?? {
    runId: state.runId,
    project: state.namespace?.project,
  });
  return boundedCommand(state.commandRunner, state.dockerBin, args, options);
}

function parseLines(source) {
  return source.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}

function quoteYaml(value) {
  return JSON.stringify(String(value));
}

export function buildFullLocalComposeOverride(namespace, { candidateRoot = null } = {}) {
  const labels = [
    `      ${RUN_OWNERSHIP_LABEL}: ${quoteYaml(namespace.run_id)}`,
    `      ${RUN_PROJECT_LABEL}: ${quoteYaml(namespace.project)}`,
  ];
  const services = SERVICES.flatMap((service) => [
    `  ${service}:`,
    "    pull_policy: never",
    "    labels:",
    ...labels,
    ...(service === "postgres" ? [
      "    ports:",
      `      - ${quoteYaml(`127.0.0.1:${namespace.ports.postgres}:5432`)}`,
    ] : []),
    ...(service === "postgrest-probe" && candidateRoot ? [
      "    volumes:",
      "      - type: bind",
      `        source: ${quoteYaml(candidateRoot)}`,
      "        target: /sealed-candidate",
      "        read_only: true",
    ] : []),
  ]);
  return [
    "services:",
    ...services,
    "networks:",
    "  auth-edge:",
    "    internal: true",
    "    labels:",
    ...labels,
    "  auth-egress:",
    "    internal: true",
    "    labels:",
    ...labels,
    "  data-internal:",
    "    internal: true",
    "    labels:",
    ...labels,
    "volumes:",
    "  postgres-data:",
    `    name: ${quoteYaml(namespace.volume_names[0])}`,
    "    labels:",
    ...labels,
    "  storage-data:",
    `    name: ${quoteYaml(namespace.volume_names[1])}`,
    "    labels:",
    ...labels,
    "",
  ].join("\n");
}

export function buildFullLocalRehearsalEnvironment({ namespace, runRoot, manifest }) {
  const secretRoot = join(runRoot, "secret-fds");
  const stateRoot = join(runRoot, "state");
  const platform = manifest.images[0]?.platform;
  if (!platform || manifest.images.some((image) => image.platform !== platform)) {
    fail("candidate image platforms must be one exact supported platform");
  }
  return Object.freeze({
    FULL_LOCAL_ADDITIONAL_REDIRECT_URLS: `http://127.0.0.1:${namespace.ports.app}/auth/callback,http://127.0.0.1:${namespace.ports.app}/auth/link/callback`,
    FULL_LOCAL_API_EXTERNAL_URL: `http://127.0.0.1:${namespace.ports.auth}/auth/v1`,
    FULL_LOCAL_AUTH_PROXY_PORT: String(namespace.ports.auth),
    FULL_LOCAL_BACKUP_READINESS_PATH: join(stateRoot, "unused-backup-readiness.json"),
    FULL_LOCAL_COMPOSE_PROJECT_NAME: namespace.project,
    FULL_LOCAL_DOCKER_PLATFORM: platform,
    FULL_LOCAL_ENABLE_ANONYMOUS_USERS: "false",
    FULL_LOCAL_ENABLE_EMAIL_AUTOCONFIRM: "true",
    FULL_LOCAL_ENABLE_EMAIL_SIGNUP: "true",
    FULL_LOCAL_ENABLE_PHONE_SIGNUP: "false",
    FULL_LOCAL_ENABLE_SOCIAL_PROVIDERS: "false",
    FULL_LOCAL_INTERNAL_GATEWAY_PORT: String(namespace.ports.storage),
    FULL_LOCAL_INTERNAL_GATEWAY_URL: `http://127.0.0.1:${namespace.ports.storage}`,
    FULL_LOCAL_INTERNAL_S3_URL: `http://127.0.0.1:${namespace.ports.storage}/storage/v1/s3`,
    FULL_LOCAL_KEYCHAIN_SERVICE: `homecook-r2-${namespace.run_id}`,
    FULL_LOCAL_OAUTH_KEYCHAIN_SERVICE: `homecook-r2-oauth-${namespace.run_id}`,
    FULL_LOCAL_POSTGRES_VOLUME_NAME: namespace.volume_names[0],
    FULL_LOCAL_PUBLIC_AUTH_URL: `http://127.0.0.1:${namespace.ports.auth}`,
    FULL_LOCAL_RESTORE_ATTEMPT_TOKEN: namespace.run_id,
    FULL_LOCAL_SECRET_DIR: secretRoot,
    FULL_LOCAL_SITE_URL: `http://127.0.0.1:${namespace.ports.app}`,
    FULL_LOCAL_STORAGE_FILE_SIZE_LIMIT: "52428800",
    FULL_LOCAL_STORAGE_GLOBAL_BUCKET: `homecook-r2-${namespace.run_id}`,
    FULL_LOCAL_STORAGE_REGION: "homecook-rehearsal-1",
    FULL_LOCAL_STORAGE_TENANT_ID: `r2-${namespace.run_id}`,
    FULL_LOCAL_STORAGE_VOLUME_NAME: namespace.volume_names[1],
    FULL_LOCAL_RELEASE_SHA: manifest.release_sha,
    FULL_LOCAL_RELEASE_TREE: manifest.release_tree,
    FULL_LOCAL_RELEASE_BUILD_ID: manifest.build_id,
    FULL_LOCAL_RELEASE_PROMOTION_ID: `rehearsal-${namespace.run_id}`,
  });
}

function writeEnvironmentFile(path, environment) {
  const lines = Object.entries(environment)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value).replaceAll("\n", "")}`);
  writeFileSync(path, `${lines.join("\n")}\n`, { flag: "wx", mode: 0o600 });
}

async function allocatePort() {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer();
    server.unref();
    server.once("error", rejectPromise);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      resolvePromise({ port, server });
    });
  });
}

async function allocatePorts() {
  const reservations = await Promise.all([allocatePort(), allocatePort(), allocatePort(), allocatePort()]);
  const values = reservations.map((entry) => entry.port);
  if (
    values.some((port) => !Number.isInteger(port) || port < 20_000 || port > 60_999)
    || new Set(values).size !== values.length
  ) {
    for (const entry of reservations) entry.server.close();
    fail("OS port reservation produced an invalid or colliding high port; retry is forbidden");
  }
  return {
    ports: { app: values[0], auth: values[1], postgres: values[2], storage: values[3] },
    servers: reservations.map((entry) => entry.server),
  };
}

function closePortReservations(state) {
  for (const server of state.portReservations ?? []) {
    if (!server) continue;
    try { server.close(); } catch { /* Already closed. */ }
  }
  state.portReservations = [];
}

function closePortReservation(state, index) {
  const server = state.portReservations?.[index];
  if (!server) return;
  try { server.close(); } catch { /* Already closed. */ }
  state.portReservations[index] = null;
}

function resourceNameCollision(names, candidateNames) {
  const candidates = new Set(candidateNames);
  return names.filter((name) => candidates.has(name));
}

function dockerList(state, kind, filter = null) {
  let args;
  const filterArgs = filter ? ["--filter", filter] : [];
  if (kind === "container") args = ["ps", "--no-trunc", "--all", ...filterArgs, "--format", "{{.ID}}\t{{.Names}}"];
  else if (kind === "network") args = ["network", "ls", "--no-trunc", ...filterArgs, "--format", "{{.ID}}\t{{.Name}}"];
  else args = ["volume", "ls", ...filterArgs, "--format", "{{.Name}}"];
  const output = dockerCommand(state, args).stdout;
  return parseLines(output).map((line) => {
    const [idOrName, nameMaybe] = line.split("\t");
    return kind === "volume"
      ? { kind, id: idOrName, name: idOrName }
      : { kind, id: idOrName, name: nameMaybe };
  });
}

function inspectResource(state, entry) {
  const type = entry.kind === "container" ? "container" : entry.kind;
  const args = entry.kind === "volume"
    ? ["volume", "inspect", entry.id, "--format", "{{json .Labels}}\t{{.Name}}"]
    : entry.kind === "network"
      ? ["network", "inspect", entry.id, "--format", "{{json .Labels}}\t{{.Name}}"]
      : ["inspect", "--type", type, entry.id, "--format", "{{json .Config.Labels}}\t{{.Name}}"];
  const result = dockerCommand(state, args, { allowFailure: true });
  if (result.status !== 0) return null;
  const [labelsText, rawName] = result.stdout.trim().split("\t");
  return {
    kind: entry.kind,
    id: entry.id,
    name: (rawName ?? entry.name).replace(/^\//u, ""),
    labels: JSON.parse(labelsText),
  };
}

function listOwnedResources(state) {
  if (!state.namespace) return [];
  const filter = `label=${RUN_OWNERSHIP_LABEL}=${state.runId}`;
  const resources = [
    ...dockerList(state, "network", filter),
    ...dockerList(state, "volume", filter),
    ...dockerList(state, "container", filter),
  ];
  return resources.sort((left, right) => RESOURCE_KIND_ORDER[left.kind] - RESOURCE_KIND_ORDER[right.kind]);
}

function removeOwnedResource(state, entry) {
  const args = entry.kind === "container"
    ? ["rm", "--force", entry.id]
    : entry.kind === "network"
      ? ["network", "rm", entry.id]
      : ["volume", "rm", entry.id];
  dockerCommand(state, args, {
    ownership: {
      runId: state.runId,
      project: state.namespace.project,
      verifiedOwnership: true,
      resourceId: entry.id,
    },
  });
}

function findImage(manifest, service) {
  const image = manifest.images.find((entry) => entry.service === service);
  if (!image) fail(`candidate image set is missing ${service}`);
  return image.reference;
}

function postgresContainer(state, resources) {
  const expectedName = `${state.namespace.project}-postgres-1`;
  const value = resources.find((entry) => entry.kind === "container" && entry.name === expectedName);
  if (!value) fail("run-owned PostgreSQL container is missing");
  const observed = inspectResource(state, value);
  if (
    observed?.id !== value.id
    || observed?.name !== expectedName
    || observed?.labels?.[RUN_OWNERSHIP_LABEL] !== state.runId
    || observed?.labels?.[RUN_PROJECT_LABEL] !== state.namespace.project
  ) fail("run-owned PostgreSQL label/name/ID ownership mismatch");
  return value;
}

function executePsql(state, sql, { database = "postgres", tuplesOnly = false } = {}) {
  const resources = listOwnedResources(state);
  const postgres = postgresContainer(state, resources);
  const args = [
    "exec", "--interactive", postgres.id,
    "psql", "--set", "ON_ERROR_STOP=1", "--username", "supabase_admin",
    "--dbname", database,
    ...(tuplesOnly ? ["--tuples-only", "--no-align"] : []),
  ];
  // docker exec is a run-owned mutation/read against an already ownership-verified ID.
  return boundedCommand(state.commandRunner, state.dockerBin, args, {
    input: sql,
    env: safeDockerEnvironment(),
  }).stdout;
}

function waitForContainers(state, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const containers = listOwnedResources(state).filter((entry) => entry.kind === "container" && SERVICES.some((service) => entry.name.includes(service)));
    if (containers.length >= SERVICES.length) {
      const statuses = containers.map((entry) => {
        const output = dockerCommand(state, [
          "inspect", "--type", "container", entry.id,
          "--format", "{{.State.Status}}\t{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}",
        ]).stdout.trim();
        const [status, health] = output.split("\t");
        return { status, health };
      });
      if (statuses.every((entry) => entry.status === "running" && ["healthy", "none"].includes(entry.health))) return;
      if (statuses.some((entry) => entry.status === "exited" || entry.status === "dead")) fail("full-local container exited before readiness");
    }
  }
  fail("full-local container readiness timeout");
}

function materializeWorkerHealthBundle(state, manifest, candidateRoot) {
  const workerRoot = join(candidateRoot, "bundles", "bundle", "worker");
  const artifactPath = join(workerRoot, "artifact.json");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const workerSecretRoot = join(state.runRoot, "worker-secret-fds");
  mkdirSync(workerSecretRoot, { mode: 0o700 });
  const tokenFile = join(workerSecretRoot, "worker.jwt");
  const jwtKeys = JSON.parse(state.secrets.jwt_keys);
  const issued = issueYoutubeExtractionWorkerCredential({
    jwtKeys,
    generation: 1,
    releaseSha: manifest.release_sha,
    schemaIdentity: artifact.schema_identity,
    allowedSnapshotDigest: manifest.migration.ordered_migration_files_digest,
    ttlSeconds: 60 * 60,
  });
  writeFileSync(tokenFile, issued.token, { flag: "wx", mode: 0o600 });
  const hostCredential = buildYoutubeExtractionWorkerCredentialState({
    tokenFile,
    generation: 1,
    jtiHash: issued.jtiHash,
    expiresAt: issued.metadata.expires_at,
    releaseSha: manifest.release_sha,
    schemaIdentity: artifact.schema_identity,
    allowedSnapshotDigest: manifest.migration.ordered_migration_files_digest,
    secretRoot: workerSecretRoot,
  });
  const credential = {
    ...hostCredential,
    token_file: "/run/worker-secrets/worker.jwt",
  };
  const policyDigest = sha256Jcs({
    schema: "homecook.release-rehearsal-synthetic-worker-policy.v1",
    candidate_identity_digest: manifest.candidate_identity_digest,
  });
  const policy = buildYoutubeExtractionCurrentPolicy({
    policyVersion: artifact.policy_version,
    policySnapshotDigest: policyDigest,
    extractorMode: artifact.extractor_mode,
    pipelineIdentity: artifact.pipeline_identity,
    enabled: true,
  });
  const appDescriptor = buildYoutubeExtractionAppDescriptor({
    releaseSha: manifest.release_sha,
    schemaIdentity: artifact.schema_identity,
    expectedPolicyVersion: artifact.policy_version,
    expectedPolicySnapshotDigest: policyDigest,
    artifactSha256: artifact.artifact_sha256,
    expectedSchemaSha256: artifact.expected_schema_sha256,
  });
  const queue = buildYoutubeExtractionWorkerQueueState({
    activeReleaseSha: manifest.release_sha,
    activeSchemaIdentity: artifact.schema_identity,
    activePolicySnapshotDigest: policyDigest,
  });
  const paths = {
    app: join(workerSecretRoot, "app.json"),
    config: join(workerSecretRoot, "worker.env"),
    credential: join(workerSecretRoot, "credential.json"),
    policy: join(workerSecretRoot, "policy.json"),
    queue: join(workerSecretRoot, "queue.json"),
  };
  writeFileSync(paths.config, "HOMECOOK_REHEARSAL_SYNTHETIC=true\n", { flag: "wx", mode: 0o600 });
  for (const [path, value] of [[paths.app, appDescriptor], [paths.credential, credential], [paths.policy, policy], [paths.queue, queue]]) {
    writeFileSync(path, `${JSON.stringify(value)}\n`, { flag: "wx", mode: 0o600 });
  }
  return {
    artifact,
    workerRoot,
    workerSecretRoot,
    containerArgs: [
      "health",
      "--secret-root", "/run/worker-secrets",
      "--config", "/run/worker-secrets/worker.env",
      "--manifest", "/sealed-worker/artifact.json",
      "--credential", "/run/worker-secrets/credential.json",
      "--app-descriptor", "/run/worker-secrets/app.json",
      "--policy", "/run/worker-secrets/policy.json",
      "--queue-state", "/run/worker-secrets/queue.json",
      "--expected-schema", "/sealed-worker/scripts/manifests/youtube-extraction-expected-schema.json",
    ],
  };
}

function runContainer(state, args) {
  validateDockerInvocation(args, { runId: state.runId, project: state.namespace.project });
  return boundedCommand(state.commandRunner, state.dockerBin, args).stdout.trim();
}

function validateReportedIdentity(value, manifest, label) {
  const keys = ["release_sha", "release_tree", "build_id", "sealed_bundle_digest", "migration_head"];
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} child identity report is invalid`);
  if (canonicalizeJcs(Object.keys(value).sort()) !== canonicalizeJcs([...keys].sort())) {
    fail(`${label} child identity report fields are not closed`);
  }
  for (const [field, expected] of [
    ["release_sha", manifest.release_sha],
    ["release_tree", manifest.release_tree],
    ["build_id", manifest.build_id],
    ["sealed_bundle_digest", manifest.sealed_bundle_digest],
    ["migration_head", manifest.migration.migration_head],
  ]) {
    if (value[field] !== expected) fail(`${label} child-reported ${field} mismatch`);
  }
  return value;
}

function runtimeIdentity(component, containerIds, reportedIdentity) {
  return {
    component,
    kind: "container",
    pid: null,
    process_group_id: null,
    container_ids: containerIds,
    release_sha: reportedIdentity.release_sha,
    release_tree: reportedIdentity.release_tree,
    build_id: reportedIdentity.build_id,
    sealed_bundle_digest: reportedIdentity.sealed_bundle_digest,
    migration_head: reportedIdentity.migration_head,
    ready: true,
    exit_code: null,
  };
}

function childIdentitySource({ outputPath = null } = {}) {
  const write = outputPath
    ? `require('node:fs').writeFileSync(${JSON.stringify(outputPath)},canonical,{flag:'wx',mode:0o400});`
    : "process.stdout.write(canonical);";
  return `(async()=>{const c=await import('file:///sealed-candidate/bundles/bundle/app/scripts/lib/local-mac-production-rehearsal-candidate.mjs');const j=await import('file:///sealed-candidate/bundles/bundle/app/scripts/lib/rfc8785-jcs.mjs');const m=c.readCompletedCandidateRoot('/sealed-candidate').manifest;const identity={release_sha:m.release_sha,release_tree:m.release_tree,build_id:m.build_id,sealed_bundle_digest:m.sealed_bundle_digest,migration_head:m.migration.migration_head};const canonical=j.canonicalizeJcs(identity);${write}return identity})()`;
}

function readContainerIdentity(state, entry, manifest, { outputPath = "/tmp/homecook-r2-identity.json" } = {}) {
  const observed = inspectResource(state, entry);
  if (
    observed?.labels?.[RUN_OWNERSHIP_LABEL] !== state.runId
    || observed?.labels?.[RUN_PROJECT_LABEL] !== state.namespace.project
    || observed.name !== entry.name
  ) fail(`${entry.name} identity read ownership mismatch`);
  const args = outputPath
    ? ["exec", entry.id, "node", "-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(outputPath)},'utf8'))`]
    : ["exec", entry.id, "node", "--input-type=module", "-e", `${childIdentitySource()}.catch(()=>process.exit(70))`];
  let output = "";
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const result = boundedCommand(state.commandRunner, state.dockerBin, args, { allowFailure: true });
    if (result.status === 0) {
      output = result.stdout;
      break;
    }
    const status = dockerCommand(state, ["inspect", "--type", "container", entry.id, "--format", "{{.State.Status}}"]).stdout.trim();
    if (status !== "running") fail(`${entry.name} exited before reporting identity`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  if (!output) fail(`${entry.name} child identity report timed out`);
  let parsed;
  try { parsed = JSON.parse(output); } catch { fail(`${entry.name} child identity is not canonical JSON`); }
  if (canonicalizeJcs(parsed) !== output) fail(`${entry.name} child identity JSON is not RFC8785 canonical`);
  return validateReportedIdentity(parsed, manifest, entry.name);
}

function dockerEnvironmentArgs(environment) {
  return Object.entries(environment)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([key, value]) => ["--env", `${key}=${value}`]);
}

export function createLocalReleaseRehearsalRunnerAdapters({
  candidateInput,
  namespaceRoot,
  runId,
  homeDir = process.env.HOME ?? "",
  rootDir = process.cwd(),
  dockerBin = null,
  commandRunner = spawnSync,
} = {}) {
  if (!candidateInput || !namespaceRoot || !runId) fail("adapter factory requires candidate, namespace, and run identity");
  const resolvedHome = resolve(homeDir);
  const resolvedRoot = resolve(rootDir);
  const state = {
    candidateInput,
    namespaceRoot,
    runId,
    homeDir: resolvedHome,
    rootDir: resolvedRoot,
    dockerBin: dockerBin ?? resolveTrustedDockerBinary(),
    commandRunner,
    namespace: null,
    runRoot: null,
    secrets: null,
    worker: null,
    deniedAttempts: 0,
    portReservations: [],
  };

  return Object.freeze({
    async snapshotProduction() {
      const adapters = createLocalProductionInventoryAdapters({
        homeDir: state.homeDir,
        rootDir: state.rootDir,
        approvedMigrationMarkerPath: join(state.homeDir, ".homecook", "rehearsal", "approved-production-migration-marker.json"),
        dockerBin: state.dockerBin,
        commandRunner: state.commandRunner,
      });
      const inventory = await collectReadOnlyProductionInventory({
        adapters,
        probeIdentity: (() => {
          const runnerPath = resolve(state.rootDir, "scripts", "local-mac-production-rehearsal-run.mjs");
          const stats = lstatSync(runnerPath, { bigint: true });
          return {
          version: "homecook-release-rehearsal-runner-v1",
          realpath: runnerPath,
          device: String(stats.dev),
          inode: String(stats.ino),
          mode: Number(stats.mode & 0o7777n),
          ctime: new Date(Number(stats.ctimeMs)).toISOString(),
          size: String(stats.size),
          sha256: sha256Bytes(readFileSync(runnerPath)),
          };
        })(),
        approvedMigrationMarker: true,
      });
      return createProductionSurfaceSnapshot(inventory);
    },

    async reservePorts() {
      const reservation = await allocatePorts();
      state.portReservations = reservation.servers;
      return reservation.ports;
    },

    async inspectCollisions({ namespace, runRoot }) {
      state.namespace = namespace;
      state.runRoot = runRoot;
      const containers = dockerList(state, "container");
      const networks = dockerList(state, "network");
      const volumes = dockerList(state, "volume");
      const collisions = [
        ...resourceNameCollision(containers.map((entry) => entry.name), namespace.container_names),
        ...resourceNameCollision(networks.map((entry) => entry.name), namespace.network_names),
        ...resourceNameCollision(volumes.map((entry) => entry.name), namespace.volume_names),
        ...dockerList(state, "container", `label=${RUN_PROJECT_LABEL}=${namespace.project}`).map((entry) => entry.id),
        ...dockerList(state, "network", `label=${RUN_PROJECT_LABEL}=${namespace.project}`).map((entry) => entry.id),
        ...dockerList(state, "volume", `label=${RUN_PROJECT_LABEL}=${namespace.project}`).map((entry) => entry.id),
      ];
      return { collisions };
    },

    async assertImagesLocal({ manifest }) {
      const imageIds = [];
      for (const image of manifest.images) {
        const result = dockerCommand(state, ["image", "inspect", image.reference, "--format", "{{.Id}}\t{{.Os}}/{{.Architecture}}"]);
        const [imageId, platform] = result.stdout.trim().split("\t");
        if (imageId !== image.image_id || platform !== image.platform) fail(`local image identity mismatch for ${image.service}`);
        imageIds.push(imageId);
      }
      return { verified: true, image_ids: imageIds };
    },

    async createResources({ manifest, candidateRoot, namespace, runRoot }) {
      state.namespace = namespace;
      state.runRoot = runRoot;
      const sealedCompose = join(candidateRoot, "bundles", "bundle", "full_local", "infra", "full-local-supabase", "docker-compose.production.yml");
      if (!existsSync(sealedCompose) || lstatSync(sealedCompose).isSymbolicLink()) fail("sealed full-local Compose authority is missing");
      const overridePath = join(runRoot, "compose.rehearsal.override.yml");
      writeFileSync(overridePath, buildFullLocalComposeOverride(namespace, { candidateRoot }), { flag: "wx", mode: 0o600 });
      const env = buildFullLocalRehearsalEnvironment({ namespace, runRoot, manifest });
      mkdirSync(join(runRoot, "state"), { mode: 0o700 });
      const envPath = join(runRoot, "compose.public.env");
      writeEnvironmentFile(envPath, env);
      state.secrets = generateFullLocalSecretBundle();
      materializeSecretFilesCreateOnly({
        names: FULL_LOCAL_SECRET_NAMES,
        readSecret: (name) => state.secrets[name],
        targetDirectory: env.FULL_LOCAL_SECRET_DIR,
      });
      const args = [
        "compose", "--project-name", namespace.project,
        "--env-file", envPath,
        "--file", sealedCompose,
        "--file", overridePath,
        "up", "--detach", "--wait", "--no-build", "postgres",
      ];
      closePortReservation(state, 2);
      dockerCommand(state, args, {
        timeout: 10 * 60_000,
        ownership: { runId: state.runId, project: namespace.project, pullPolicyNever: true },
      });
      const quotedDb = `"${namespace.db_name.replaceAll('"', '""')}"`;
      const quotedRole = `"${namespace.db_user.replaceAll('"', '""')}"`;
      executePsql(state, `CREATE ROLE ${quotedRole} NOLOGIN;\nCREATE DATABASE ${quotedDb} OWNER ${quotedRole} TEMPLATE postgres;\n`);
      closePortReservations(state);
      dockerCommand(state, args.slice(0, -1), {
        timeout: 10 * 60_000,
        ownership: { runId: state.runId, project: namespace.project, pullPolicyNever: true },
      });
      waitForContainers(state);
      return listOwnedResources(state);
    },

    async listOwnedResources() { return listOwnedResources(state); },

    async applyMigrations({ manifest, candidateRoot, namespace }) {
      executePsql(state, [
        "CREATE TABLE public.homecook_rehearsal_global_migration_ledger (",
        "  sequence bigint PRIMARY KEY, migration_id text UNIQUE NOT NULL, migration_sha256 text NOT NULL",
        ");",
      ].join("\n"), { database: namespace.db_name });
      const ledger = [];
      const ledgerEntries = [];
      for (const [index, relativePath] of manifest.migration.ordered_migration_files.entries()) {
        const path = join(candidateRoot, "bundles", "bundle", "full_local", relativePath);
        const bytes = readFileSync(path);
        const sql = decodeFatalUtf8(bytes, relativePath);
        const migrationId = relativePath.split("/").at(-1).replace(/\.sql$/u, "");
        const migrationSha256 = sha256Bytes(bytes);
        executePsql(state, `BEGIN;\n${sql}\nINSERT INTO public.homecook_rehearsal_global_migration_ledger(sequence,migration_id,migration_sha256) VALUES (${index + 1}, '${migrationId.replaceAll("'", "''")}', '${migrationSha256}');\nCOMMIT;\n`, { database: namespace.db_name });
        ledger.push(migrationId);
        ledgerEntries.push({ sequence: index + 1, migration_id: migrationId, migration_sha256: migrationSha256 });
      }
      const ledgerOutput = executePsql(state, "SELECT sequence || ':' || migration_id || ':' || migration_sha256 FROM public.homecook_rehearsal_global_migration_ledger ORDER BY sequence;\n", { database: namespace.db_name, tuplesOnly: true });
      const observedLedger = parseLines(ledgerOutput).map((line) => {
        const [sequence, migrationId, migrationSha256] = line.split(":");
        return { sequence: Number(sequence), migration_id: migrationId, migration_sha256: migrationSha256 };
      });
      if (canonicalizeJcs(observedLedger) !== canonicalizeJcs(ledgerEntries)) {
        fail("applied global migration ledger readback differs from the sealed order");
      }
      const catalogHead = executePsql(state, "SELECT migration_id FROM public.homecook_rehearsal_global_migration_ledger ORDER BY sequence DESC LIMIT 1;\n", { database: namespace.db_name, tuplesOnly: true }).trim();
      const schemaIdentity = executePsql(state, "SELECT n.nspname || '.' || c.relname || ':' || c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' ORDER BY 1;\n", { database: namespace.db_name, tuplesOnly: true });
      return {
        ordered_migration_files_digest: manifest.migration.ordered_migration_files_digest,
        applied_global_ledger_digest: sha256Jcs(ledgerEntries),
        ordered_global_ledger: ledger,
        migration_head: ledger.at(-1),
        catalog_head: catalogHead,
        schema_identity_digest: sha256Bytes(Buffer.from(schemaIdentity, "utf8")),
      };
    },

    async loadSyntheticFixtures({ namespace }) {
      const fixtureValue = `homecook-r2-${namespace.run_id}`;
      executePsql(state, [
        "CREATE SCHEMA rehearsal_fixture;",
        "CREATE TABLE rehearsal_fixture.identity_canary (id integer PRIMARY KEY, value text NOT NULL);",
        `INSERT INTO rehearsal_fixture.identity_canary(id,value) VALUES (1,'${fixtureValue}');`,
      ].join("\n"), { database: namespace.db_name });
      return {
        fixture_set_id: "homecook-r2-synthetic-v1",
        fixture_set_digest: sha256Jcs({ id: 1, value: fixtureValue }),
        production_derived_row_count: 0,
      };
    },

    async startComponents({ manifest, candidateRoot, namespace }) {
      const nodeImage = findImage(manifest, "auth-proxy");
      const appRoot = join(candidateRoot, "bundles", "bundle", "app");
      const appName = namespace.container_names.find((name) => name.endsWith("-app"));
      const commonLabels = [
        "--label", `${RUN_OWNERSHIP_LABEL}=${state.runId}`,
        "--label", `${RUN_PROJECT_LABEL}=${namespace.project}`,
      ];
      const appEnvironment = validateChildEnvironment({
        NODE_ENV: "production",
        PORT: String(namespace.ports.app),
        HOSTNAME: "0.0.0.0",
        HOMECOOK_REHEARSAL_RUN_ID: state.runId,
        HOMECOOK_RELEASE_SHA: manifest.release_sha,
        HOMECOOK_RELEASE_TREE: manifest.release_tree,
        HOMECOOK_RELEASE_BUILD_ID: manifest.build_id,
        HOMECOOK_SEALED_BUNDLE_DIGEST: manifest.sealed_bundle_digest,
        NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${namespace.ports.app}`,
        NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${namespace.ports.app}`,
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${namespace.ports.auth}`,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: state.secrets.anon_key,
      }, { runId: state.runId, runRoot: state.runRoot });
      const appWrapper = `${childIdentitySource({ outputPath: "/tmp/homecook-r2-identity.json" })}.then(()=>{const{spawn}=require('node:child_process');const c=spawn('node',['node_modules/next/dist/bin/next','start','--hostname','0.0.0.0','--port',process.env.PORT],{stdio:'inherit'});for(const s of ['SIGINT','SIGTERM','SIGHUP'])process.on(s,()=>c.kill(s));c.on('exit',(code,signal)=>{if(signal)process.kill(process.pid,signal);else process.exit(code??1)})}).catch(()=>process.exit(70))`;
      const appArgs = [
        "run", "--detach", "--name", appName,
        ...commonLabels,
        "--network", `${namespace.project}_auth-edge`,
        "--user", `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`,
        "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
        "--tmpfs", "/workspace/.next/cache:rw,noexec,nosuid,size=64m",
        "--mount", `type=bind,src=${appRoot},dst=/workspace,readonly`,
        "--mount", `type=bind,src=${candidateRoot},dst=/sealed-candidate,readonly`,
        "--publish", `127.0.0.1:${namespace.ports.app}:${namespace.ports.app}`,
        ...dockerEnvironmentArgs(appEnvironment),
        "--workdir", "/workspace",
        nodeImage,
        "node", "-e", appWrapper,
      ];
      const appId = runContainer(state, appArgs);
      state.worker = materializeWorkerHealthBundle(state, manifest, candidateRoot);
      const workerName = namespace.container_names.find((name) => name.endsWith("-worker"));
      const wrapper = `${childIdentitySource({ outputPath: "/tmp/homecook-r2-identity.json" })}.then(()=>{const{spawnSync}=require('node:child_process');const a=JSON.parse(process.env.R2_WORKER_ARGS);for(;;){const r=spawnSync('node',['/sealed-worker/scripts/youtube-extraction-worker-runner.mjs',...a],{stdio:'ignore',timeout:30000});if(r.status!==0)process.exit(71);Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10000)}}).catch(()=>process.exit(70))`;
      const workerEnvironment = validateChildEnvironment({
        HOMECOOK_REHEARSAL_RUN_ID: state.runId,
        HOMECOOK_RELEASE_SHA: manifest.release_sha,
        HOMECOOK_RELEASE_TREE: manifest.release_tree,
        HOMECOOK_RELEASE_BUILD_ID: manifest.build_id,
        HOMECOOK_SEALED_BUNDLE_DIGEST: manifest.sealed_bundle_digest,
        R2_WORKER_ARGS: JSON.stringify(state.worker.containerArgs),
      }, { runId: state.runId, runRoot: state.runRoot });
      const workerArgs = [
        "run", "--detach", "--name", workerName,
        ...commonLabels,
        "--network", `${namespace.project}_data-internal`,
        "--user", `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`,
        "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
        "--mount", `type=bind,src=${state.worker.workerRoot},dst=/sealed-worker,readonly`,
        "--mount", `type=bind,src=${state.worker.workerSecretRoot},dst=/run/worker-secrets,readonly`,
        "--mount", `type=bind,src=${candidateRoot},dst=/sealed-candidate,readonly`,
        ...dockerEnvironmentArgs(workerEnvironment),
        nodeImage, "node", "-e", wrapper,
      ];
      const workerId = runContainer(state, workerArgs);
      const sentinelNetworkName = `${namespace.project}_egress-sentinel`;
      runContainer(state, [
        "network", "create", "--internal",
        ...commonLabels,
        sentinelNetworkName,
      ]);
      const sentinelName = `${namespace.project}-egress-sentinel`;
      const sentinelId = runContainer(state, [
        "run", "--detach", "--name", sentinelName,
        ...commonLabels,
        "--network", sentinelNetworkName,
        "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m",
        nodeImage, "node", "-e",
        "require('node:http').createServer((_,r)=>r.end('sentinel')).listen(8080,'0.0.0.0')",
      ]);
      const ownedContainers = listOwnedResources(state)
        .filter((entry) => entry.kind === "container");
      const appResource = ownedContainers.find((entry) => entry.id === appId);
      const workerResource = ownedContainers.find((entry) => entry.id === workerId);
      const probeResource = ownedContainers.find((entry) => entry.name === `${namespace.project}-postgrest-probe-1`);
      if (!appResource || !workerResource || !probeResource) fail("runtime identity probe container set is incomplete");
      const appReported = readContainerIdentity(state, appResource, manifest);
      const workerReported = readContainerIdentity(state, workerResource, manifest);
      const fullLocalReported = readContainerIdentity(state, probeResource, manifest, { outputPath: null });
      const fullLocalIds = ownedContainers
        .filter((entry) => entry.kind === "container" && ![appId, workerId, sentinelId].includes(entry.id))
        .map((entry) => entry.id);
      return [
        runtimeIdentity("app", [appId], appReported),
        runtimeIdentity("full_local", fullLocalIds, fullLocalReported),
        runtimeIdentity("worker", [workerId], workerReported),
      ];
    },

    async waitForReadiness({ namespace, runtime }) {
      waitForContainers(state);
      for (const entry of runtime.flatMap((item) => item.container_ids)) {
        const status = dockerCommand(state, ["inspect", "--type", "container", entry, "--format", "{{.State.Status}}"]).stdout.trim();
        if (status !== "running") fail("runtime container crashed before readiness");
      }
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        try {
          const response = await fetch(`http://127.0.0.1:${namespace.ports.app}/`, { signal: AbortSignal.timeout(2_000) });
          if (response.status < 500) return { ready: true };
        } catch { /* retry bounded */ }
      }
      fail("app readiness timeout");
    },

    async runCanaries({ namespace, fixtures, runtime }) {
      const results = [];
      const appResponse = await fetch(`http://127.0.0.1:${namespace.ports.app}/`, { signal: AbortSignal.timeout(10_000) });
      if (appResponse.status >= 500) fail("app canary failed");
      const appReported = runtime.find((entry) => entry.component === "app");
      const fullLocalReported = runtime.find((entry) => entry.component === "full_local");
      if (!appReported || !fullLocalReported) fail("child-reported app/full-local identity evidence is missing");
      results.push({ canary_id: "app-health", exit_code: 0, normalized_result_digest: sha256Jcs({ status: appResponse.status, reported_identity: appReported }) });
      const dbValue = executePsql(state, "SELECT value FROM rehearsal_fixture.identity_canary WHERE id=1;\n", { database: namespace.db_name, tuplesOnly: true }).trim();
      results.push({ canary_id: "full-local-synthetic-fixture", exit_code: 0, normalized_result_digest: sha256Jcs({ value: dbValue, fixture: fixtures.fixture_set_digest, reported_identity: fullLocalReported }) });
      const workerRuntime = listOwnedResources(state).find((entry) =>
        entry.kind === "container" && entry.name === `${namespace.project}-worker`);
      if (!workerRuntime) fail("exact run-owned worker container is missing");
      const workerHealthArgs = ["exec", workerRuntime.id, "node", "/sealed-worker/scripts/youtube-extraction-worker-runner.mjs", ...state.worker.containerArgs];
      const workerObserved = inspectResource(state, workerRuntime);
      if (
        workerObserved?.id !== workerRuntime.id
        || workerObserved?.name !== `${namespace.project}-worker`
        || workerObserved?.labels?.[RUN_OWNERSHIP_LABEL] !== state.runId
        || workerObserved?.labels?.[RUN_PROJECT_LABEL] !== namespace.project
      ) fail("worker canary ownership mismatch");
      const workerHealth = boundedCommand(state.commandRunner, state.dockerBin, workerHealthArgs);
      const health = JSON.parse(workerHealth.stdout);
      if (health.ok !== true || health.ready !== true) fail("worker health canary did not report ready");
      const workerReported = runtime.find((entry) => entry.component === "worker");
      if (!workerReported) fail("worker child-reported identity evidence is missing");
      results.push({ canary_id: "worker-synthetic-job", exit_code: 0, normalized_result_digest: sha256Jcs({ health_schema: health.schema, ready: health.ready, reported_identity: workerReported }) });
      const sentinelRuntime = listOwnedResources(state).find((entry) =>
        entry.kind === "container" && entry.name === `${namespace.project}-egress-sentinel`);
      if (!sentinelRuntime) fail("deterministic egress sentinel container is missing");
      const sentinelObserved = inspectResource(state, sentinelRuntime);
      if (
        sentinelObserved?.id !== sentinelRuntime.id
        || sentinelObserved?.name !== `${namespace.project}-egress-sentinel`
        || sentinelObserved?.labels?.[RUN_OWNERSHIP_LABEL] !== state.runId
        || sentinelObserved?.labels?.[RUN_PROJECT_LABEL] !== namespace.project
      ) fail("egress sentinel ownership mismatch");
      boundedCommand(state.commandRunner, state.dockerBin, [
        "exec", sentinelRuntime.id, "node", "-e",
        "fetch('http://127.0.0.1:8080',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:41)).catch(()=>process.exit(42))",
      ], { timeout: 10_000 });
      const sentinelIp = boundedCommand(state.commandRunner, state.dockerBin, [
        "inspect", "--type", "container", sentinelRuntime.id,
        "--format", `{{with index .NetworkSettings.Networks "${namespace.project}_egress-sentinel"}}{{.IPAddress}}{{end}}`,
      ]).stdout.trim();
      if (!/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(sentinelIp)) fail("egress sentinel IP readback is invalid");
      const networkProbe = [
        "const net=require('node:net');",
        "const probe=(host,port,expectConnect)=>new Promise((resolve)=>{",
        "let done=false;const finish=(ok)=>{if(done)return;done=true;s.destroy();resolve(ok)};",
        "const s=net.connect({host,port},()=>finish(expectConnect));",
        "s.on('error',()=>finish(!expectConnect));s.setTimeout(2000,()=>finish(!expectConnect));",
        "});",
        `(async()=>{if(!await probe('api-gateway',${namespace.ports.storage},true))process.exit(41);`,
        `if(!await probe('${sentinelIp}',8080,false))process.exit(42);process.exit(0)})().catch(()=>process.exit(43));`,
      ].join("");
      const egressAttempt = boundedCommand(state.commandRunner, state.dockerBin, [
        "exec", workerRuntime.id, "node", "-e", networkProbe,
      ], { allowFailure: true, timeout: 10_000 });
      if (egressAttempt.status === 41) fail("run-owned allowed-network positive control failed");
      if (egressAttempt.status === 42) fail("worker reached the isolated external-network sentinel");
      if (egressAttempt.status !== 0) fail("deterministic network deny probe failed unexpectedly");
      state.deniedAttempts += 1;
      results.push({ canary_id: "external-network-deny", exit_code: 0, normalized_result_digest: sha256Jcs({ denied: true }) });
      results.push({ canary_id: "cross-component-identity", exit_code: 0, normalized_result_digest: sha256Jcs({ runtime, fixture: fixtures.fixture_set_digest }) });
      return results;
    },

    async readNetworkEvidence() {
      const expectedNetworks = new Set(state.namespace.network_names);
      const owned = listOwnedResources(state);
      const networks = [];
      for (const expectedName of [...expectedNetworks].sort()) {
        const entry = owned.find((resource) => resource.kind === "network" && resource.name === expectedName);
        if (!entry) fail(`run-owned network is missing: ${expectedName}`);
        const result = dockerCommand(state, [
          "network", "inspect", entry.id, "--format",
          "{{json .Labels}}\t{{.Name}}\t{{.Internal}}",
        ]).stdout.trim().split("\t");
        if (result.length !== 3) fail("network isolation readback is incomplete");
        const labels = JSON.parse(result[0]);
        if (
          result[1] !== expectedName
          || result[2] !== "true"
          || labels?.[RUN_OWNERSHIP_LABEL] !== state.runId
          || labels?.[RUN_PROJECT_LABEL] !== state.namespace.project
        ) fail(`network is not exact run-owned internal=true: ${expectedName}`);
        networks.push({
          id: entry.id,
          name: expectedName,
          internal: true,
          labels_digest: sha256Jcs(labels),
        });
      }
      const attachments = [];
      for (const entry of owned.filter((resource) => resource.kind === "container")) {
        const raw = dockerCommand(state, [
          "inspect", "--type", "container", entry.id,
          "--format", "{{json .NetworkSettings.Networks}}",
        ]).stdout.trim();
        const attachedNames = Object.keys(JSON.parse(raw)).sort();
        if (attachedNames.length === 0 || attachedNames.some((name) => !expectedNetworks.has(name))) {
          fail(`container has an external or unknown network attachment: ${entry.name}`);
        }
        attachments.push({ container_id: entry.id, network_names: attachedNames });
      }
      return {
        default_deny_policy_digest: sha256Jcs({
          schema: "homecook.release-rehearsal-docker-internal-network-policy.v1",
          networks,
          attachments,
        }),
        allowed_endpoints: ["approved-unix-sockets", "loopback", "run-owned-network"],
        denied_attempt_count: state.deniedAttempts,
        unexpected_successful_egress_count: 0,
      };
    },

    async stopRuntime(entry) {
      for (const id of entry.container_ids ?? []) {
        const resource = listOwnedResources(state).find((value) => value.kind === "container" && value.id === id);
        if (!resource) continue;
        const observed = inspectResource(state, resource);
        if (observed?.labels?.[RUN_OWNERSHIP_LABEL] !== state.runId || observed?.labels?.[RUN_PROJECT_LABEL] !== state.namespace.project) {
          fail("runtime stop ownership mismatch");
        }
        dockerCommand(state, ["stop", "--time", "30", id], {
          allowFailure: true,
          ownership: { runId: state.runId, project: state.namespace.project, verifiedOwnership: true, resourceId: id },
        });
      }
    },

    async inspectResource(entry) { return inspectResource(state, entry); },
    async removeResource(entry) { removeOwnedResource(state, entry); },
    async listResidue() { return listOwnedResources(state); },

    async closeSecretHandles() {
      closePortReservations(state);
      if (!state.runRoot) return;
      for (const path of [join(state.runRoot, "secret-fds"), join(state.runRoot, "worker-secret-fds")]) {
        if (existsSync(path)) rmSync(path, { recursive: true, force: true });
      }
      state.secrets = null;
      state.worker = null;
    },

    async countPersistentSecretFiles() {
      if (!state.runRoot) return 0;
      const secretRoots = [join(state.runRoot, "secret-fds"), join(state.runRoot, "worker-secret-fds")];
      return secretRoots.reduce((count, path) => count + (existsSync(path) ? readdirSync(path).length : 0), 0);
    },
  });
}
