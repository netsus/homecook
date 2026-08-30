import { createHash, randomBytes } from "node:crypto";
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
  FULL_LOCAL_SECRET_NAMES,
  generateFullLocalSecretBundle,
  materializeSecretFilesCreateOnly,
} from "./full-local-production-runtime.mjs";
import {
  collectReadOnlyProductionInventory,
  createLocalProductionInventoryAdapters,
  createProductionSurfaceSnapshot,
} from "./local-mac-production-rehearsal-inventory.mjs";
import { resolveTrustedDockerBinary } from "./full-local-session-observation-reader.mjs";
import { canonicalizeJcs, sha256Jcs } from "./rfc8785-jcs.mjs";
import { createTrustedMacOsIndependentObserver } from "./local-mac-production-rehearsal-macos-observer.mjs";
import { buildIsolatedYoutubeWorkerSyntheticFixtureSql } from "./youtube-extraction-isolated-fixture-sql.mjs";
import { buildPostgrestFixtureReadbackProbe, parseAndValidatePostgrestFixtureReadback } from "./local-mac-production-rehearsal-postgrest-probe.mjs";
import { resolveSafeRealExecutable, snapshotToolFile } from "./local-mac-production-rehearsal-candidate.mjs";
import {
  RUN_OWNERSHIP_LABEL,
  RUN_PROJECT_LABEL,
  validateChildEnvironment,
  validateDockerInvocation,
  validateSealedWorkerSyntheticResult,
} from "./local-mac-production-rehearsal-runner.mjs";
import {
  buildYoutubeExtractionWorkerPolicySnapshotDigest,
  buildYoutubeExtractionAppDescriptor,
  buildYoutubeExtractionCurrentPolicy,
  buildYoutubeExtractionWorkerQueueState,
  DEFAULT_YOUTUBE_EXTRACTION_WORKER_FINGERPRINT_KEY_VERSION,
  DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS,
} from "./youtube-extraction-worker-artifact.mjs";
import { issueYoutubeExtractionWorkerCredential } from "./youtube-extraction-worker-local-credential.mjs";
import { buildYoutubeExtractionWorkerCredentialState } from "./youtube-extraction-worker-ops.mjs";
import {
  buildDockerDaemonSnapshot,
  buildPinnedDockerArgs,
  buildPrivateDockerEnvironment,
  createImmutableCreationLedger,
  resolveTrustedLocalDockerEndpoint,
  runAbortableCommand,
  readExactPrivateRegularFile,
  validateDockerDaemonSnapshots,
} from "./local-mac-production-rehearsal-runner-safety.mjs";

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
const RUN_IMAGE_SERVICE_LABEL = "com.homecook.release-rehearsal.image-service";
const RUN_CREATION_NONCE_LABEL = "com.homecook.release-rehearsal.creation-nonce";

const RESOLVED_COMPOSE_TOP_LEVEL_KEYS = ["name", "networks", "secrets", "services", "volumes"];
const FIXTURE_CREDENTIAL_KEY = /(?:^|[_-])(access[_-]?token|api[_-]?key|password|private[_-]?key|secret)(?:$|[_-])/iu;
const SERVICE_RUNTIME_CONTRACT = Object.freeze({
  postgres: Object.freeze({ dependsOn: {}, health: true, networks: ["data-internal"], ports: [{ key: "postgres", target: 5432 }], secrets: ["postgres_password"], tmpfs: [], volumeTargets: ["/var/lib/postgresql/data", "/homecook/secret-entrypoint.sh", "/docker-entrypoint-initdb.d/zz-homecook-role-passwords.sh"] }),
  auth: Object.freeze({ dependsOn: { postgres: "service_healthy" }, health: true, networks: ["auth-egress", "data-internal"], ports: [], secrets: ["jwt_keys", "jwt_secret", "postgres_password"], tmpfs: [], volumeTargets: ["/homecook/secret-entrypoint.sh", "/homecook/start-auth.sh"] }),
  postgrest: Object.freeze({ dependsOn: { auth: "service_healthy", postgres: "service_healthy" }, health: false, networks: ["data-internal"], ports: [], secrets: ["jwt_jwks", "postgres_password"], tmpfs: [], volumeTargets: ["/homecook/secret-entrypoint.sh", "/homecook/start-postgrest.sh"] }),
  "postgrest-probe": Object.freeze({ dependsOn: { postgrest: "service_started" }, health: true, networks: ["data-internal"], ports: [], secrets: [], tmpfs: [], volumeTargets: ["/sealed-candidate"] }),
  storage: Object.freeze({ dependsOn: { auth: "service_healthy", "postgrest-probe": "service_healthy" }, health: true, networks: ["data-internal"], ports: [], secrets: ["anon_key", "jwt_jwks", "jwt_secret", "postgres_password", "service_role_key", "storage_s3_access_key_id", "storage_s3_access_key_secret"], tmpfs: [], volumeTargets: ["/homecook/secret-entrypoint.sh", "/homecook/start-storage.sh", "/var/lib/storage"] }),
  "api-gateway": Object.freeze({ dependsOn: { storage: "service_healthy" }, health: true, networks: ["auth-edge", "data-internal"], ports: [{ key: "storage", target: "storage" }], secrets: ["anon_key", "anon_key_asymmetric", "publishable_key", "secret_key", "service_role_key", "service_role_key_asymmetric", "session_attestation_hmac_key_v1"], tmpfs: ["/tmp"], volumeTargets: ["/homecook/kong-entrypoint.sh", "/homecook/kong.yml", "/homecook/secret-entrypoint.sh", "/usr/local/share/lua/5.1/kong/plugins/homecook-attestation"] }),
  "auth-proxy": Object.freeze({ dependsOn: { "api-gateway": "service_healthy" }, health: true, networks: ["auth-edge"], ports: [{ key: "auth", target: 8080 }], secrets: [], tmpfs: [], volumeTargets: ["/homecook/auth-only-proxy.mjs"] }),
});
const SERVICE_DEPENDENCY_ORDER = Object.freeze([
  "postgres", "auth", "postgrest", "postgrest-probe", "storage", "api-gateway", "auth-proxy",
]);

function sortedStrings(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function normalizeDependsOn(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("resolved Compose depends_on is invalid");
  return Object.fromEntries(Object.entries(value).map(([name, entry]) => [
    name,
    typeof entry === "string" ? entry : entry?.condition,
  ]));
}

function normalizeServiceSecrets(serviceName, value, topLevelSecrets) {
  const entries = value ?? [];
  if (!Array.isArray(entries)) fail(`resolved Compose secrets are invalid: ${serviceName}`);
  return entries.map((entry) => {
    const source = typeof entry === "string" ? entry : entry?.source;
    const target = typeof entry === "string" ? entry : (entry?.target ?? source);
    const file = topLevelSecrets?.[source]?.file;
    if (typeof source !== "string" || typeof target !== "string" || typeof file !== "string" || !file.startsWith("/")) {
      fail(`resolved Compose secret authority is invalid: ${serviceName}`);
    }
    return Object.freeze({ source, target, file });
  });
}

function normalizeServicePorts(serviceName, value, namespacePorts) {
  const entries = value ?? [];
  if (!Array.isArray(entries)) fail(`resolved Compose ports are invalid: ${serviceName}`);
  return entries.map((entry) => {
    if (typeof entry === "string") {
      const match = /^(127\.0\.0\.1):([0-9]+):([0-9]+)(?:\/(tcp|udp))?$/u.exec(entry);
      if (!match) fail(`resolved Compose port is invalid: ${serviceName}`);
      return Object.freeze({ host_ip: match[1], published: Number(match[2]), target: Number(match[3]), protocol: match[4] ?? "tcp" });
    }
    const published = Number(entry?.published);
    const target = Number(entry?.target);
    if (entry?.host_ip !== "127.0.0.1" || !Number.isSafeInteger(published) || !Number.isSafeInteger(target) || !["tcp", undefined].includes(entry?.protocol)) {
      fail(`resolved Compose port is invalid: ${serviceName}`);
    }
    return Object.freeze({ host_ip: entry.host_ip, published, target, protocol: entry.protocol ?? "tcp" });
  }).map((entry) => {
    if (Object.values(namespacePorts).includes(entry.published) !== true) fail(`resolved Compose published port escapes namespace: ${serviceName}`);
    return entry;
  });
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function normalizeHealthcheck(serviceName, value) {
  if (!value || !Array.isArray(value.test) || value.test.length < 2) fail(`resolved Compose healthcheck is invalid: ${serviceName}`);
  const [kind, ...command] = value.test;
  if (!command.every((entry) => typeof entry === "string") || !["CMD", "CMD-SHELL"].includes(kind)) fail(`resolved Compose healthcheck command is invalid: ${serviceName}`);
  const commandText = kind === "CMD-SHELL" ? command.join(" ") : `exec ${command.map(shellQuote).join(" ")}`;
  return Object.freeze({ command: commandText, interval: value.interval, timeout: value.timeout, retries: value.retries, start_period: value.start_period });
}

function durationNanoseconds(value, label) {
  if (value === undefined) return 0;
  const match = /^(\d+(?:\.\d+)?)(ns|us|ms|s|m|h)$/u.exec(String(value));
  if (!match) fail(`${label} duration is invalid`);
  const multiplier = { ns: 1, us: 1_000, ms: 1_000_000, s: 1_000_000_000, m: 60_000_000_000, h: 3_600_000_000_000 }[match[2]];
  const result = Number(match[1]) * multiplier;
  if (!Number.isSafeInteger(result) || result < 0) fail(`${label} duration exceeds bound`);
  return result;
}

/**
 * Produces a commit-safe golden input from a locally resolved Compose document.
 * The raw resolver output never becomes an artifact: absolute local values are
 * replaced in encounter order and credential-shaped scalar fields are rejected.
 */
export function normalizeResolvedComposeFixture(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("resolved Compose fixture is invalid");
  if (canonicalizeJcs(Object.keys(input).sort()) !== canonicalizeJcs(RESOLVED_COMPOSE_TOP_LEVEL_KEYS)) {
    fail("resolved Compose fixture top-level fields are not closed");
  }
  let pathIndex = 0;
  const visit = (value, key = "") => {
    if (typeof value === "string") {
      if (FIXTURE_CREDENTIAL_KEY.test(key)) fail(`resolved Compose fixture contains credential-shaped scalar: ${key}`);
      if (key === "name" && value === input.name) return "__HOMECOOK_PROJECT__";
      if (value.startsWith("/")) return `__HOMECOOK_PATH_${String(++pathIndex).padStart(2, "0")}__`;
      return value;
    }
    if (Array.isArray(value)) return value.map((entry) => visit(entry));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, visit(childValue, childKey)]));
  };
  return Object.freeze(visit(input));
}

/** A structural, non-executable golden authority for regression tests. */
export function buildSafeResolvedComposeGoldenFixture() {
  const service = (name) => Object.freeze({
    image: `registry.invalid/homecook/${name}@sha256:${"0".repeat(64)}`,
    command: ["__HOMECOOK_COMMAND__"],
    entrypoint: ["__HOMECOOK_PATH__"],
    environment: { HOMECOOK_PUBLIC_VALUE: "__HOMECOOK_VALUE__" },
    labels: { "com.homecook.fixture": "true" },
    networks: { "data-internal": { aliases: [name] } },
    restart: "unless-stopped",
    security_opt: ["no-new-privileges:true"],
    volumes: [{ type: "bind", source: "__HOMECOOK_PATH__", target: "__HOMECOOK_PATH__", read_only: true }],
  });
  const fixture = Object.freeze({
    name: "__HOMECOOK_PROJECT__",
    services: Object.freeze(Object.fromEntries(SERVICES.map((name) => [name, service(name)]))),
    networks: Object.freeze(Object.fromEntries(["auth-edge", "auth-egress", "data-internal"].map((name) => [name, Object.freeze({ name: `__HOMECOOK_NETWORK_${name.toUpperCase().replaceAll("-", "_")}__`, internal: true, external: false, ipam: {} })]))),
    volumes: Object.freeze(Object.fromEntries(["postgres-data", "storage-data"].map((name) => [name, Object.freeze({ name: `__HOMECOOK_VOLUME_${name.toUpperCase().replaceAll("-", "_")}__`, external: false, labels: {} })]))),
    secrets: Object.freeze({}),
  });
  return Object.freeze({
    schema: "homecook.r2-resolved-compose-golden.v1",
    fixture,
    digest: sha256Jcs(fixture),
  });
}

/** Compile read-only `docker compose config --format json` output into a closed R2 plan. */
export function compileClosedPrimitivePlan(config, { project, ports } = {}) {
  if (!config || typeof config !== "object" || Array.isArray(config)) fail("resolved Compose config is invalid");
  const keys = Object.keys(config).sort();
  if (canonicalizeJcs(keys) !== canonicalizeJcs(RESOLVED_COMPOSE_TOP_LEVEL_KEYS)) fail("resolved Compose top-level fields are not closed");
  if (!project || !ports || !config.services || typeof config.services !== "object") fail("primitive plan authority is incomplete");
  const names = Object.keys(config.services).sort();
  if (canonicalizeJcs(names) !== canonicalizeJcs([...SERVICES].sort())) fail("resolved Compose service set is not exact");
  const compiledServices = new Map();
  for (const service of SERVICES) {
    const value = config.services[service];
    const contract = SERVICE_RUNTIME_CONTRACT[service];
    if (!value || typeof value !== "object" || typeof value.image !== "string" || !value.image.includes("@sha256:") || typeof value.platform !== "string" || !value.platform.includes("/")) fail(`resolved Compose image authority is invalid: ${service}`);
    if (value.build || value.pull_policy && value.pull_policy !== "never") fail(`resolved Compose mutation authority is invalid: ${service}`);
    const networkNames = Array.isArray(value.networks) ? value.networks : Object.keys(value.networks ?? {});
    if (networkNames.length < 1 || !value.restart || !Array.isArray(value.security_opt) || !value.security_opt.includes("no-new-privileges:true")) fail(`resolved Compose runtime contract is invalid: ${service}`);
    if (canonicalizeJcs(sortedStrings(networkNames)) !== canonicalizeJcs(sortedStrings(contract.networks))) fail(`resolved Compose network contract differs: ${service}`);
    const dependsOn = normalizeDependsOn(value.depends_on);
    if (canonicalizeJcs(dependsOn) !== canonicalizeJcs(contract.dependsOn)) fail(`resolved Compose dependency contract differs: ${service}`);
    const secretMounts = normalizeServiceSecrets(service, value.secrets, config.secrets);
    if (canonicalizeJcs(sortedStrings(secretMounts.map((entry) => entry.source))) !== canonicalizeJcs(contract.secrets)) fail(`resolved Compose secret set differs: ${service}`);
    const volumeTargets = sortedStrings((value.volumes ?? []).map((entry) => entry?.target));
    if (canonicalizeJcs(volumeTargets) !== canonicalizeJcs(sortedStrings(contract.volumeTargets))) fail(`resolved Compose volume set differs: ${service}`);
    const tmpfs = value.tmpfs ?? [];
    if (!Array.isArray(tmpfs) || canonicalizeJcs(sortedStrings(tmpfs.map((entry) => String(entry).split(":", 1)[0]))) !== canonicalizeJcs(contract.tmpfs)) fail(`resolved Compose tmpfs contract differs: ${service}`);
    const servicePorts = normalizeServicePorts(service, value.ports, ports);
    if (servicePorts.length !== contract.ports.length) fail(`resolved Compose port count differs: ${service}`);
    for (const expectedPort of contract.ports) {
      const expectedPublished = ports[expectedPort.key];
      const expectedTarget = expectedPort.target === "storage" ? ports.storage : expectedPort.target;
      if (!servicePorts.some((entry) => entry.published === expectedPublished && entry.target === expectedTarget)) fail(`resolved Compose port contract differs: ${service}`);
    }
    if ((value.healthcheck !== undefined) !== contract.health) fail(`resolved Compose healthcheck presence differs: ${service}`);
    const healthcheck = contract.health ? normalizeHealthcheck(service, value.healthcheck) : null;
    compiledServices.set(service, Object.freeze({ name: service, ...value, depends_on: dependsOn, healthcheck, ports: servicePorts, secret_mounts: secretMounts }));
  }
  for (const network of ["auth-edge", "auth-egress", "data-internal"]) if (config.networks?.[network]?.internal !== true) fail(`resolved Compose network is not internal: ${network}`);
  for (const volume of ["postgres-data", "storage-data"]) if (!config.volumes?.[volume]) fail(`resolved Compose volume is missing: ${volume}`);
  return Object.freeze({ schema: "homecook.r2-primitive-plan.v1", project, ports: { ...ports }, networks: ["auth-edge", "auth-egress", "data-internal"], volumes: ["postgres-data", "storage-data"], services: SERVICE_DEPENDENCY_ORDER.map((name) => compiledServices.get(name)) });
}

export function primitiveServiceArgs(service, namespace, labels) {
  const networkEntries = Array.isArray(service.networks)
    ? service.networks.map((name) => [name, { aliases: [service.name] }])
    : Object.entries(service.networks ?? {});
  const networks = networkEntries.map(([name]) => name);
  const firstNetwork = networks[0];
  if (!firstNetwork) fail(`primitive service has no network: ${service.name}`);
  const args = ["create", "--name", `${namespace.project}-${service.name}-1`, "--pull=never", "--platform", service.platform, ...labels];
  for (const [key, value] of Object.entries(service.labels ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    if (!labels.includes(`${key}=${value}`)) args.push("--label", `${key}=${value}`);
  }
  args.push("--network", `${namespace.project}_${firstNetwork}`);
  for (const alias of networkEntries[0]?.[1]?.aliases ?? [service.name]) args.push("--network-alias", alias);
  for (const [key, value] of Object.entries(service.environment ?? {})) args.push("--env", `${key}=${value}`);
  for (const option of service.security_opt ?? []) args.push("--security-opt", option);
  if (service.restart) args.push("--restart", service.restart);
  if (service.read_only === true) args.push("--read-only");
  for (const mount of service.volumes ?? []) {
    if (!mount?.type || !mount.source || !mount.target) fail(`primitive mount is incomplete: ${service.name}`);
    args.push("--mount", `type=${mount.type},src=${mount.source},dst=${mount.target}${mount.read_only ? ",readonly" : ""}`);
  }
  for (const secret of service.secret_mounts ?? []) args.push("--mount", `type=bind,src=${secret.file},dst=/run/secrets/${secret.target},readonly`);
  for (const tmpfs of service.tmpfs ?? []) args.push("--tmpfs", tmpfs);
  for (const port of service.ports ?? []) args.push("--publish", `${port.host_ip}:${port.published}:${port.target}/${port.protocol}`);
  if (service.logging?.driver) args.push("--log-driver", service.logging.driver);
  for (const [key, value] of Object.entries(service.logging?.options ?? {}).sort(([left], [right]) => left.localeCompare(right))) args.push("--log-opt", `${key}=${value}`);
  if (service.healthcheck) {
    args.push("--health-cmd", service.healthcheck.command);
    if (service.healthcheck.interval) args.push("--health-interval", String(service.healthcheck.interval));
    if (service.healthcheck.timeout) args.push("--health-timeout", String(service.healthcheck.timeout));
    if (service.healthcheck.retries !== undefined) args.push("--health-retries", String(service.healthcheck.retries));
    if (service.healthcheck.start_period) args.push("--health-start-period", String(service.healthcheck.start_period));
  }
  if (service.entrypoint) args.push("--entrypoint", Array.isArray(service.entrypoint) ? service.entrypoint[0] : service.entrypoint);
  args.push(service.image, ...(Array.isArray(service.command) ? service.command : service.command ? [service.command] : []));
  return { args, additionalNetworks: networkEntries.slice(1).map(([name, entry]) => ({ name, aliases: entry?.aliases ?? [service.name] })) };
}

export function validatePrimitiveContainerInspection(observed, service, namespace) {
  if (!observed?.Config || !observed?.HostConfig || !observed?.NetworkSettings) fail(`primitive inspect is incomplete: ${service.name}`);
  const expectedEntrypoint = service.entrypoint === undefined
    ? null
    : (Array.isArray(service.entrypoint) ? service.entrypoint : [service.entrypoint]);
  const expectedCommand = service.command === undefined
    ? null
    : (Array.isArray(service.command) ? service.command : [service.command]);
  if (
    observed.Config.Image !== service.image
    || canonicalizeJcs(observed.Config.Entrypoint ?? null) !== canonicalizeJcs(expectedEntrypoint)
    || canonicalizeJcs(observed.Config.Cmd ?? null) !== canonicalizeJcs(expectedCommand)
    || observed.HostConfig.ReadonlyRootfs !== (service.read_only === true)
    || observed.HostConfig.RestartPolicy?.Name !== service.restart
  ) fail(`primitive inspect config differs: ${service.name}`);
  const observedEnvironment = new Set(observed.Config.Env ?? []);
  for (const [key, value] of Object.entries(service.environment ?? {})) if (!observedEnvironment.has(`${key}=${value}`)) fail(`primitive inspect environment differs: ${service.name}`);
  for (const option of service.security_opt ?? []) if (!(observed.HostConfig.SecurityOpt ?? []).includes(option)) fail(`primitive inspect security options differ: ${service.name}`);
  const expectedMounts = [
    ...(service.volumes ?? []).map((entry) => ({ ...entry, secret: false })),
    ...(service.secret_mounts ?? []).map((entry) => ({ type: "bind", source: entry.file, target: `/run/secrets/${entry.target}`, read_only: true, secret: true })),
  ];
  for (const expected of expectedMounts) {
    const mount = (observed.Mounts ?? []).find((entry) => entry.Destination === expected.target);
    if (!mount || mount.Type !== expected.type || mount.RW === expected.read_only) fail(`primitive inspect mount differs: ${service.name}`);
    if (expected.type === "bind" && mount.Source !== expected.source) fail(`primitive inspect bind source differs: ${service.name}`);
    if (expected.type === "volume" && mount.Name !== expected.source) fail(`primitive inspect volume source differs: ${service.name}`);
  }
  const observedTmpfs = Object.keys(observed.HostConfig.Tmpfs ?? {}).sort();
  const expectedTmpfs = sortedStrings((service.tmpfs ?? []).map((entry) => String(entry).split(":", 1)[0]));
  if (canonicalizeJcs(observedTmpfs) !== canonicalizeJcs(expectedTmpfs)) fail(`primitive inspect tmpfs differs: ${service.name}`);
  for (const port of service.ports ?? []) {
    const binding = observed.HostConfig.PortBindings?.[`${port.target}/${port.protocol}`]?.[0];
    if (binding?.HostIp !== port.host_ip || Number(binding?.HostPort) !== port.published) fail(`primitive inspect port binding differs: ${service.name}`);
  }
  if (service.healthcheck) {
    if (
      canonicalizeJcs(observed.Config.Healthcheck?.Test) !== canonicalizeJcs(["CMD-SHELL", service.healthcheck.command])
      || observed.Config.Healthcheck?.Retries !== service.healthcheck.retries
      || observed.Config.Healthcheck?.Interval !== durationNanoseconds(service.healthcheck.interval, `${service.name} health interval`)
      || observed.Config.Healthcheck?.Timeout !== durationNanoseconds(service.healthcheck.timeout, `${service.name} health timeout`)
      || observed.Config.Healthcheck?.StartPeriod !== durationNanoseconds(service.healthcheck.start_period, `${service.name} health start period`)
    ) fail(`primitive inspect healthcheck differs: ${service.name}`);
  } else if (observed.Config.Healthcheck !== null && observed.Config.Healthcheck !== undefined) fail(`primitive inspect unexpected healthcheck: ${service.name}`);
  if (observed.HostConfig.LogConfig?.Type !== service.logging?.driver) fail(`primitive inspect logging driver differs: ${service.name}`);
  for (const [key, value] of Object.entries(service.logging?.options ?? {})) if (observed.HostConfig.LogConfig?.Config?.[key] !== String(value)) fail(`primitive inspect logging options differ: ${service.name}`);
  const networkEntries = Array.isArray(service.networks)
    ? service.networks.map((name) => [name, { aliases: [service.name] }])
    : Object.entries(service.networks ?? {});
  for (const [network, contract] of networkEntries) {
    const attachment = observed.NetworkSettings.Networks?.[`${namespace.project}_${network}`];
    if (!attachment) fail(`primitive inspect network attachment differs: ${service.name}`);
    for (const alias of contract?.aliases ?? [service.name]) if (!(attachment.Aliases ?? []).includes(alias)) fail(`primitive inspect network alias differs: ${service.name}`);
  }
  return service;
}

/** Narrow test seam for the exact service create/connect/start order used by createResources. */
export function compilePrimitiveServiceOperations(plan, namespace, labels) {
  if (plan?.schema !== "homecook.r2-primitive-plan.v1") fail("primitive operation plan is invalid");
  return Object.freeze(plan.services.flatMap((service) => {
    const primitive = primitiveServiceArgs(service, namespace, labels);
    return [
      Object.freeze({ kind: "create", service: service.name, argv: primitive.args }),
      ...primitive.additionalNetworks.map((network) => Object.freeze({ kind: "connect", service: service.name, network: network.name, aliases: network.aliases })),
      Object.freeze({ kind: "start", service: service.name }),
      ...(service.healthcheck ? [Object.freeze({ kind: "readiness", service: service.name })] : []),
    ];
  }));
}

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

function ensureDockerCommandEnvironment(state) {
  if (!state.commandEnvironment) {
    state.commandEnvironment = buildPrivateDockerEnvironment({ runRoot: state.runtimeRoot });
  }
  return state.commandEnvironment;
}

async function dockerCommand(state, args, options = {}) {
  const endpointNow = resolveTrustedLocalDockerEndpoint({
    explicitSocketPath: state.dockerEndpoint.realpath,
    homeDir: state.homeDir,
    ambient: {},
  });
  if (endpointNow.identity_digest !== state.dockerEndpoint.identity_digest) {
    fail("local Docker endpoint identity drifted before command execution");
  }
  const pinnedArgs = buildPinnedDockerArgs(args, state.dockerEndpoint);
  const ownership = {
    dockerHost: state.dockerEndpoint.url,
    runId: state.runId,
    project: state.namespace?.project,
    ...(options.ownership ?? {}),
  };
  validateDockerInvocation(pinnedArgs, ownership);
  const result = await state.runCommand({
    command: state.dockerBin,
    args: pinnedArgs,
    env: ensureDockerCommandEnvironment(state),
    input: options.input,
    signal: options.signal ?? state.activeSignal,
    timeoutMs: options.timeout ?? COMMAND_TIMEOUT_MS,
    maxOutputBytes: OUTPUT_LIMIT_BYTES,
  });
  state.commandTelemetry.push(Object.freeze({
    argv_digest: sha256Jcs(pinnedArgs),
    mode: ownership.verifiedOwnership === true ? "owned" : "bounded",
    production_target: false,
  }));
  if (!options.allowFailure && result.status !== 0) {
    fail(`command exited ${String(result.status)}: ${result.stderr.slice(0, 512)}`);
  }
  return result;
}

function parseLines(source) {
  return source.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}

function abortableDelay(milliseconds, signal) {
  return new Promise((resolvePromise, rejectPromise) => {
    const onAbort = () => {
      clearTimeout(timer);
      rejectPromise(signal.reason ?? new Error("operation aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolvePromise();
    }, milliseconds);
    timer.unref?.();
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

function quoteYaml(value) {
  return JSON.stringify(String(value));
}

export function buildFullLocalComposeOverride(namespace, { candidateRoot = null, creationNonce = null } = {}) {
  const labels = [
    `      ${RUN_OWNERSHIP_LABEL}: ${quoteYaml(namespace.run_id)}`,
    `      ${RUN_PROJECT_LABEL}: ${quoteYaml(namespace.project)}`,
    ...(creationNonce ? [`      ${RUN_CREATION_NONCE_LABEL}: ${quoteYaml(creationNonce)}`] : []),
  ];
  const services = SERVICES.flatMap((service) => [
    `  ${service}:`,
    "    pull_policy: never",
    "    logging:",
    "      driver: local",
    "      options:",
    "        max-size: \"1m\"",
    "        max-file: \"1\"",
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
    ...(["auth", "postgrest", "storage"].includes(service) ? [
      "    environment:",
      `      HOMECOOK_REHEARSAL_DB_NAME: ${quoteYaml(namespace.db_name)}`,
      `      HOMECOOK_REHEARSAL_RUN_ID: ${quoteYaml(namespace.run_id)}`,
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

function resourceNameCollision(names, candidateNames) {
  const candidates = new Set(candidateNames);
  return names.filter((name) => candidates.has(name));
}

async function dockerList(state, kind, filter = null, options = {}) {
  let args;
  const filterArgs = filter ? ["--filter", filter] : [];
  if (kind === "container") args = ["ps", "--no-trunc", "--all", ...filterArgs, "--format", "{{.ID}}\t{{.Names}}"];
  else if (kind === "network") args = ["network", "ls", "--no-trunc", ...filterArgs, "--format", "{{.ID}}\t{{.Name}}"];
  else args = ["volume", "ls", ...filterArgs, "--format", "{{.Name}}"];
  const output = (await dockerCommand(state, args, options)).stdout;
  return parseLines(output).map((line) => {
    const [idOrName, nameMaybe] = line.split("\t");
    return kind === "volume"
      ? { kind, id: idOrName, name: idOrName }
      : { kind, id: idOrName, name: nameMaybe };
  });
}

async function inspectResource(state, entry, options = {}) {
  const type = entry.kind === "container" ? "container" : entry.kind;
  const args = entry.kind === "volume"
    ? ["volume", "inspect", entry.id, "--format", "{{json .Labels}}\t{{.Name}}"]
    : entry.kind === "network"
      ? ["network", "inspect", entry.id, "--format", "{{json .Labels}}\t{{.Name}}"]
      : ["inspect", "--type", type, entry.id, "--format", "{{json .Config.Labels}}\t{{.Name}}"];
  const result = await dockerCommand(state, args, { ...options, allowFailure: true });
  if (result.status !== 0) return null;
  const [labelsText, rawName] = result.stdout.trim().split("\t");
  return {
    kind: entry.kind,
    id: entry.id,
    name: (rawName ?? entry.name).replace(/^\//u, ""),
    labels: JSON.parse(labelsText),
  };
}

/** Read a container's host-process identity without trusting container output. */
export async function readContainerObserverSubject(state, { containerId, component, signal }) {
  const inspected = await dockerCommand(state, ["inspect", "--type", "container", containerId, "--format", "{{.Id}}\t{{.State.Pid}}\t{{.State.StartedAt}}\t{{.State.Running}}\t{{.Image}}\t{{json .Config}}"], { signal });
  const [id, pidText, startedAt, running, image, configText] = inspected.stdout.trim().split("\t");
  const pid = Number(pidText);
  if (id !== containerId || !Number.isSafeInteger(pid) || pid <= 0 || running !== "true" || !/^\d{4}-\d{2}-\d{2}T/u.test(startedAt) || !image || !configText) fail("container observer inspect identity is incomplete");
  const ps = await state.runCommand({ command: "/bin/ps", args: ["-o", "pid=,pgid=,comm=", "-p", String(pid)], cwd: state.runtimeRoot, env: {}, signal, timeoutMs: COMMAND_TIMEOUT_MS, maxOutputBytes: OUTPUT_LIMIT_BYTES });
  if (ps.error || ps.signal || ps.status !== 0) fail("container observer trusted ps is unavailable");
  const [hostPid, hostPgid, executable] = ps.stdout.trim().split(/\s+/, 3);
  if (Number(hostPid) !== pid || !Number.isSafeInteger(Number(hostPgid)) || Number(hostPgid) <= 0 || !executable) fail("container observer host PID/PGID identity is invalid");
  return Object.freeze({ container_id: id, host_pid: pid, host_pgid: Number(hostPgid), component, started_at: startedAt, image_digest: sha256Jcs(image), config_digest: sha256Jcs(JSON.parse(configText)), executable_identity_digest: sha256Jcs(executable) });
}

async function listDiscoveredResources(state, options = {}) {
  if (!state.namespace) return [];
  const filter = `label=${RUN_OWNERSHIP_LABEL}=${state.runId}`;
  const resources = [
    ...await dockerList(state, "network", filter, options),
    ...await dockerList(state, "volume", filter, options),
    ...await dockerList(state, "container", filter, options),
  ];
  return resources.sort((left, right) => RESOURCE_KIND_ORDER[left.kind] - RESOURCE_KIND_ORDER[right.kind]);
}

export function assertDiscoveredResourcesRemainUnowned(ledger, discovered) {
  if (!ledger || typeof ledger.contains !== "function" || !Array.isArray(discovered)) {
    fail("creation discovery ownership check requires an immutable ledger");
  }
  for (const entry of discovered) {
    if (!ledger.contains(entry)) {
      fail(`discovered resource is not an exact successful-create ledger entry: ${entry.name}`);
    }
  }
  return Object.freeze([...discovered]);
}

export function recordPrimitiveCreateResult(ledger, expected, stdout, inspected) {
  const match = /^([0-9a-f]{64})\n?$/u.exec(stdout ?? "");
  if (!match) fail("primitive create stdout must contain exactly one 64-hex ID");
  const entry = { kind: expected.kind, id: match[1], name: expected.name };
  if (!inspected || inspected.kind !== entry.kind || inspected.id !== entry.id || inspected.name !== entry.name) fail("primitive create inspect identity mismatch");
  for (const [key, value] of Object.entries(expected.labels ?? {})) if (inspected.labels?.[key] !== value) fail("primitive create inspect labels mismatch");
  ledger.record(entry);
  return Object.freeze(entry);
}

async function assertExpectedCreatedResources(state, expectedNames, { signal, requireAll = false } = {}) {
  const expected = new Set(expectedNames);
  const discovered = await listDiscoveredResources(state, { signal });
  const matches = discovered.filter((entry) => expected.has(entry.name));
  for (const entry of matches) {
    const observed = await inspectResource(state, entry, { signal });
    if (
      observed?.id !== entry.id
      || observed?.name !== entry.name
      || observed?.kind !== entry.kind
      || observed?.labels?.[RUN_OWNERSHIP_LABEL] !== state.runId
      || observed?.labels?.[RUN_PROJECT_LABEL] !== state.namespace.project
      || observed?.labels?.[RUN_CREATION_NONCE_LABEL] !== state.creationNonce
    ) fail(`created resource identity/labels differ: ${entry.name}`);
    assertDiscoveredResourcesRemainUnowned(state.creationLedger, [entry]);
  }
  if (requireAll) {
    const recordedNames = new Set(state.creationLedger.snapshot().map((entry) => entry.name));
    const missing = [...expected].filter((name) => !recordedNames.has(name));
    if (missing.length > 0) fail(`created resource ledger is missing: ${missing.join(", ")}`);
  }
  return state.creationLedger.snapshot();
}

async function removeOwnedResource(state, entry, options = {}) {
  const args = entry.kind === "container"
    ? ["rm", "--force", entry.id]
    : entry.kind === "network"
      ? ["network", "rm", entry.id]
      : ["volume", "rm", entry.id];
  await dockerCommand(state, args, {
    signal: options.signal,
    ownership: {
      dockerHost: state.dockerEndpoint.url,
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

export function validateContainerImageAuthority({ authority, observed }) {
  if (
    !authority
    || !observed
    || observed.container_image_id !== authority.image_id
    || observed.configured_reference !== authority.reference
    || observed.local_image_id !== authority.image_id
    || observed.platform !== authority.platform
    || !Array.isArray(observed.repo_digests)
    || !observed.repo_digests.some((value) => value.endsWith(`@${authority.digest}`))
  ) fail("container/local image ID, digest reference, repo digest, or platform mismatch");
  return authority;
}

async function verifyCreatedContainerImages(state, { signal } = {}) {
  for (const entry of state.creationLedger.snapshot().filter((resource) => resource.kind === "container")) {
    const result = await dockerCommand(state, [
      "inspect", "--type", "container", entry.id,
      "--format", "{{.Image}}\t{{.Config.Image}}\t{{json .Config.Labels}}",
    ], { signal });
    const [imageId, configuredReference, labelsText] = result.stdout.trim().split("\t");
    const labels = JSON.parse(labelsText);
    const service = labels?.[RUN_IMAGE_SERVICE_LABEL] ?? labels?.["com.docker.compose.service"];
    const authority = state.imageAuthorities?.get(service);
    if (!authority) fail(`container image service authority is missing: ${entry.name}`);
    const image = await dockerCommand(state, [
      "image", "inspect", authority.reference,
      "--format", "{{.Id}}\t{{.Os}}/{{.Architecture}}\t{{json .RepoDigests}}",
    ], { signal });
    const [readbackId, platform, repoDigestsText] = image.stdout.trim().split("\t");
    const repoDigests = JSON.parse(repoDigestsText);
    validateContainerImageAuthority({
      authority,
      observed: {
        configured_reference: configuredReference,
        container_image_id: imageId,
        local_image_id: readbackId,
        platform,
        repo_digests: repoDigests,
      },
    });
  }
}

async function postgresContainer(state, resources, options = {}) {
  const expectedName = `${state.namespace.project}-postgres-1`;
  const value = resources.find((entry) => entry.kind === "container" && entry.name === expectedName);
  if (!value) fail("run-owned PostgreSQL container is missing");
  const observed = await inspectResource(state, value, options);
  if (
    observed?.id !== value.id
    || observed?.name !== expectedName
    || observed?.labels?.[RUN_OWNERSHIP_LABEL] !== state.runId
    || observed?.labels?.[RUN_PROJECT_LABEL] !== state.namespace.project
    || observed?.labels?.[RUN_CREATION_NONCE_LABEL] !== state.creationNonce
    || !state.creationLedger.contains(value)
  ) fail("run-owned PostgreSQL label/name/ID ownership mismatch");
  return value;
}

export function buildPsqlVariableArgs(variables = {}, allowedVariableNames = new Set()) {
  if (!variables || typeof variables !== "object" || Array.isArray(variables) || !(allowedVariableNames instanceof Set)) fail("psql variables policy is invalid");
  const variableArgs = [];
  for (const name of Object.keys(variables).sort()) {
    const value = variables[name];
    if (!allowedVariableNames.has(name) || !/^[a-z][a-z0-9_]{0,63}$/u.test(name) || typeof value !== "string" || value.length === 0 || value.length > 512 || /[^\x20-\x7e]|^[\-]/u.test(value)) fail("psql variable is unsafe or not allowlisted");
    variableArgs.push(`--set=${name}=${value}`);
  }
  return Object.freeze(variableArgs);
}

async function executePsql(state, sql, { database = "postgres", tuplesOnly = false, signal, variables = {}, allowedVariableNames = new Set() } = {}) {
  const variableArgs = buildPsqlVariableArgs(variables, allowedVariableNames);
  const resources = await listDiscoveredResources(state, { signal });
  const postgres = await postgresContainer(state, resources, { signal });
  const args = [
    "exec", "--interactive", postgres.id,
    "psql", "--set", "ON_ERROR_STOP=1", "--username", "supabase_admin",
    "--dbname", database,
    ...variableArgs,
    ...(tuplesOnly ? ["--tuples-only", "--no-align"] : []),
  ];
  // docker exec is a run-owned mutation/read against an already ownership-verified ID.
  return (await dockerCommand(state, args, {
    input: sql,
    signal,
    ownership: {
      dockerHost: state.dockerEndpoint.url,
      runId: state.runId,
      project: state.namespace.project,
      verifiedOwnership: true,
      resourceId: postgres.id,
    },
  })).stdout;
}

export async function runOwnedPostgrestFixtureProbe(state, { namespace, jobId, userId, token, expected, signal = undefined }, { inspectResourceImpl = inspectResource, dockerCommandImpl = dockerCommand } = {}) {
  const probeEntry = state.creationLedger.snapshot().find((entry) => entry.kind === "container" && entry.name === `${namespace.project}-postgrest-probe-1`);
  if (!probeEntry) fail("run-owned PostgREST probe container is missing");
  const probeObserved = await inspectResourceImpl(state, probeEntry, { signal });
  if (probeObserved?.id !== probeEntry.id || probeObserved?.name !== probeEntry.name || probeObserved?.labels?.[RUN_OWNERSHIP_LABEL] !== state.runId) fail("PostgREST probe ownership mismatch");
  const probe = buildPostgrestFixtureReadbackProbe({ jobId, userId, token });
  const probeOutput = await dockerCommandImpl(state, probe.argv.map((value) => value === "<postgrest-probe-id>" ? probeEntry.id : value), { input: probe.stdin, signal, timeout: 10_000, ownership: { verifiedOwnership: true, resourceId: probeEntry.id } });
  const row = parseAndValidatePostgrestFixtureReadback(probeOutput.stdout, expected);
  return Object.freeze({ row, redacted: probe.redacted, response_digest: sha256Jcs({ redacted: probe.redacted, row }) });
}

export function parseAndValidateWorkerFixtureReadback(output, expected) {
  const lines = String(output ?? "").trim().split(/\r?\n/u).filter(Boolean);
  if (lines.length !== 1) fail("worker fixture readback must contain exactly one row");
  let readback; try { readback = JSON.parse(lines[0]); } catch { fail("worker fixture readback is malformed JSON"); }
  const keys = ["user_id", "job_id", "job_status", "attempt_count", "policy_snapshot_digest", "computed_policy_snapshot_digest", "credential_jti_hash", "credential_generation", "credential_release_sha", "credential_schema_identity", "credential_snapshot_digest", "permit_generation"].sort();
  if (!readback || typeof readback !== "object" || Array.isArray(readback) || canonicalizeJcs(Object.keys(readback).sort()) !== canonicalizeJcs(keys) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(readback.user_id ?? "") || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(readback.job_id ?? "") || !Number.isSafeInteger(readback.attempt_count) || !Number.isSafeInteger(readback.credential_generation) || !Number.isSafeInteger(readback.permit_generation)) fail("worker fixture readback has an invalid closed shape");
  for (const [key, value] of Object.entries(expected)) if (readback[key] !== value) fail("worker fixture readback differs from issued authority");
  return Object.freeze(readback);
}

async function waitForContainers(state, { signal, timeoutMs = 180_000, expectedNames = null } = {}) {
  const expected = new Set(expectedNames ?? SERVICES.map((service) => `${state.namespace.project}-${service}-1`));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw signal.reason ?? new Error("readiness aborted");
    const containers = (await listDiscoveredResources(state, { signal })).filter((entry) => entry.kind === "container" && expected.has(entry.name));
    if (containers.length === expected.size) {
      const statuses = await Promise.all(containers.map(async (entry) => {
        const output = (await dockerCommand(state, [
          "inspect", "--type", "container", entry.id,
          "--format", "{{.State.Status}}\t{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}",
        ], { signal })).stdout.trim();
        const [status, health] = output.split("\t");
        return { status, health };
      }));
      if (statuses.every((entry) => entry.status === "running" && ["healthy", "none"].includes(entry.health))) return;
      if (statuses.some((entry) => entry.status === "exited" || entry.status === "dead")) fail("full-local container exited before readiness");
    }
    await abortableDelay(100, signal);
  }
  fail("full-local container readiness timeout");
}

export function ensureIssuedWorkerCredential(state, manifest, artifact) {
  if (!/^[0-9a-f]{64}$/u.test(artifact?.allowed_snapshot_digest ?? "")) {
    fail("sealed worker allowed snapshot authority is invalid");
  }
  const issuanceInput = { run_id: state.runId, release_sha: manifest.release_sha, schema_identity: artifact.schema_identity, allowed_snapshot_digest: artifact.allowed_snapshot_digest, ttl_seconds: 3600, jwt_keys_digest: sha256Jcs(JSON.parse(state.secrets.jwt_keys)) };
  const issuanceInputDigest = sha256Jcs(issuanceInput);
  if (state.issuedWorkerCredential) {
    if (state.issuedWorkerCredential.issuance_input_digest !== issuanceInputDigest) fail("worker credential issuance input conflicts with existing credential");
    return state.issuedWorkerCredential;
  }
  const issue = state.credentialIssuer ?? issueYoutubeExtractionWorkerCredential;
  const issued = issue({ jwtKeys: JSON.parse(state.secrets.jwt_keys), generation: 1, releaseSha: manifest.release_sha, schemaIdentity: artifact.schema_identity, allowedSnapshotDigest: artifact.allowed_snapshot_digest, ttlSeconds: 60 * 60 });
  state.issuedWorkerCredential = Object.freeze({ ...issued, issuance_input_digest: issuanceInputDigest });
  return state.issuedWorkerCredential;
}

function materializeWorkerHealthBundle(state, manifest, candidateRoot) {
  const workerRoot = join(candidateRoot, "bundles", "bundle", "worker");
  const artifactPath = join(workerRoot, "artifact.json");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  const workerSecretRoot = join(state.runtimeRoot, "worker-secret-fds");
  mkdirSync(workerSecretRoot, { mode: 0o700 });
  const tokenFile = join(workerSecretRoot, "worker.jwt");
  const rehearsalTokenFile = join(workerSecretRoot, "rehearsal-worker.jwt");
  const issued = ensureIssuedWorkerCredential(state, manifest, artifact);
  writeFileSync(tokenFile, issued.token, { flag: "wx", mode: 0o600 });
  writeFileSync(rehearsalTokenFile, issued.token, { flag: "wx", mode: 0o400 });
  const hostCredential = buildYoutubeExtractionWorkerCredentialState({
    tokenFile,
    generation: 1,
    jtiHash: issued.jtiHash,
    expiresAt: issued.metadata.expires_at,
    releaseSha: manifest.release_sha,
    schemaIdentity: artifact.schema_identity,
    allowedSnapshotDigest: artifact.allowed_snapshot_digest,
    secretRoot: workerSecretRoot,
  });
  const credential = {
    ...hostCredential,
    token_file: "/run/worker-secrets/worker.jwt",
  };
  const policyDigest = buildYoutubeExtractionWorkerPolicySnapshotDigest({
    extractorMode: artifact.extractor_mode,
    pipelineIdentity: artifact.pipeline_identity,
    policyVersion: artifact.policy_version,
    resultAffectingOptions: DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS,
  });
  if (artifact.allowed_snapshot_digest !== policyDigest) fail("sealed worker policy snapshot authority mismatch");
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
    rehearsalRpc: join(workerSecretRoot, "rehearsal-rpc-config.json"),
  };
  writeFileSync(paths.config, "# isolated rehearsal worker\n", { flag: "wx", mode: 0o600 });
  for (const [path, value] of [[paths.app, appDescriptor], [paths.credential, credential], [paths.policy, policy], [paths.queue, queue]]) {
    writeFileSync(path, `${JSON.stringify(value)}\n`, { flag: "wx", mode: 0o600 });
  }
  const rehearsalRpc = {
    schema: "homecook.rehearsal-worker-rpc-config.v1",
    base_url: `http://postgrest:3000`, token_file: "rehearsal-worker.jwt", fixture_identity: state.runId,
    creation_nonce: state.creationNonce, policy_snapshot_digest: policyDigest,
    schema_identity: artifact.schema_identity, allowed_snapshot_digest: artifact.allowed_snapshot_digest,
    lifecycle_version: "youtube-extraction-rpc-v1",
  };
  writeFileSync(paths.rehearsalRpc, `${JSON.stringify(rehearsalRpc)}\n`, { flag: "wx", mode: 0o400 });
  const verifiedRpc = readExactPrivateRegularFile(paths.rehearsalRpc, { label: "worker rehearsal RPC config", maxBytes: 65_536, acceptedFileModes: [0o400] });
  const rehearsalRpcIdentity = Object.freeze({
    path: "rehearsal-rpc-config.json",
    sha256: sha256Bytes(readFileSync(paths.rehearsalRpc)),
    token_reference: "rehearsal-worker.jwt",
  });
  const rehearsalRpcExpectedAuthority = Object.freeze({
    config_digest: sha256Bytes(verifiedRpc.bytes),
    config_file_identity_digest: sha256Jcs(verifiedRpc.identity),
    token_reference_digest: sha256Jcs(rehearsalRpc.token_file),
    lifecycle_version_digest: sha256Jcs(rehearsalRpc.lifecycle_version),
    fixture_identity_digest: sha256Jcs(rehearsalRpc.fixture_identity),
  });
  return {
    artifact,
    workerRoot,
    workerSecretRoot,
    rehearsalRpcIdentity,
    rehearsalRpcExpectedAuthority,
    containerArgs: [
      "--secret-root", "/run/worker-secrets",
      "--config", "/run/worker-secrets/worker.env",
      "--manifest", "/sealed-worker/artifact.json",
      "--credential", "/run/worker-secrets/credential.json",
      "--app-descriptor", "/run/worker-secrets/app.json",
      "--policy", "/run/worker-secrets/policy.json",
      "--queue-state", "/run/worker-secrets/queue.json",
      "--expected-schema", "/sealed-worker/scripts/manifests/youtube-extraction-expected-schema.json",
      "--rehearsal-rpc-config", "/run/worker-secrets/rehearsal-rpc-config.json",
      "--rehearsal-rpc-config-digest", rehearsalRpcExpectedAuthority.config_digest,
    ],
  };
}

async function runContainer(state, args, { signal } = {}) {
  const nameIndex = args.indexOf("--name");
  const expectedName = nameIndex >= 0 ? args[nameIndex + 1] : null;
  try {
    if (args[0] !== "run" || !args.includes("--detach")) fail("primitive container creation requires a detached run template");
    const createArgs = ["create", ...args.slice(1).filter((token) => token !== "--detach")];
    const stdout = (await dockerCommand(state, createArgs, { signal })).stdout;
    const id = /^([0-9a-f]{64})\n?$/u.exec(stdout)?.[1];
    if (!id || !expectedName) fail("docker create did not return exact container identity");
    const entry = { kind: "container", id, name: expectedName };
    const observed = await inspectResource(state, entry, { signal });
    recordPrimitiveCreateResult(state.creationLedger, {
      ...entry,
      labels: {
        [RUN_OWNERSHIP_LABEL]: state.runId,
        [RUN_PROJECT_LABEL]: state.namespace.project,
        [RUN_CREATION_NONCE_LABEL]: state.creationNonce,
      },
    }, stdout, observed);
    await dockerCommand(state, ["start", id], {
      signal,
      ownership: { verifiedOwnership: true, resourceId: id },
    });
    return id;
  } catch (error) {
    if (expectedName) {
      await assertExpectedCreatedResources(state, [expectedName], { signal: state.cleanupSignal });
    }
    throw error;
  }
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

function runtimeIdentity(component, containerIds, reportedIdentity, workerRpcIdentity = null) {
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
    ...(component === "worker" ? { worker_rehearsal_rpc_config_digest: workerRpcIdentity?.sha256, worker_rehearsal_rpc_config_identity_digest: sha256Jcs(workerRpcIdentity) } : {}),
  };
}

function childIdentitySource({ outputPath = null } = {}) {
  const write = outputPath
    ? `require('node:fs').writeFileSync(${JSON.stringify(outputPath)},canonical,{flag:'wx',mode:0o400});`
    : "process.stdout.write(canonical);";
  return `(async()=>{const c=await import('file:///sealed-candidate/bundles/bundle/app/scripts/lib/local-mac-production-rehearsal-candidate.mjs');const j=await import('file:///sealed-candidate/bundles/bundle/app/scripts/lib/rfc8785-jcs.mjs');const m=c.readCompletedCandidateRoot('/sealed-candidate').manifest;const identity={release_sha:m.release_sha,release_tree:m.release_tree,build_id:m.build_id,sealed_bundle_digest:m.sealed_bundle_digest,migration_head:m.migration.migration_head};const canonical=j.canonicalizeJcs(identity);${write}return identity})()`;
}

async function readContainerIdentity(state, entry, manifest, { outputPath = "/tmp/homecook-r2-identity.json", signal } = {}) {
  const observed = await inspectResource(state, entry, { signal });
  if (
    observed?.labels?.[RUN_OWNERSHIP_LABEL] !== state.runId
    || observed?.labels?.[RUN_PROJECT_LABEL] !== state.namespace.project
    || observed?.labels?.[RUN_CREATION_NONCE_LABEL] !== state.creationNonce
    || observed.name !== entry.name
    || !state.creationLedger.contains(entry)
  ) fail(`${entry.name} identity read ownership mismatch`);
  const args = outputPath
    ? ["exec", entry.id, "node", "-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(outputPath)},'utf8'))`]
    : ["exec", entry.id, "node", "--input-type=module", "-e", `${childIdentitySource()}.catch(()=>process.exit(70))`];
  let output = "";
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const result = await dockerCommand(state, args, {
      allowFailure: true,
      signal,
      ownership: {
        dockerHost: state.dockerEndpoint.url,
        runId: state.runId,
        project: state.namespace.project,
        verifiedOwnership: true,
        resourceId: entry.id,
      },
    });
    if (result.status === 0) {
      output = result.stdout;
      break;
    }
    const status = (await dockerCommand(state, ["inspect", "--type", "container", entry.id, "--format", "{{.State.Status}}"], { signal })).stdout.trim();
    if (status !== "running") fail(`${entry.name} exited before reporting identity`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
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

async function snapshotDockerDaemon(state, signal) {
  const version = await dockerCommand(state, ["version", "--format", "{{json .}}"], { signal });
  const info = await dockerCommand(state, ["info", "--format", "{{json .}}"], { signal });
  let parsedVersion;
  let parsedInfo;
  try {
    parsedVersion = JSON.parse(version.stdout);
    parsedInfo = JSON.parse(info.stdout);
  } catch {
    fail("local Docker daemon identity output is not JSON");
  }
  const endpointNow = resolveTrustedLocalDockerEndpoint({
    explicitSocketPath: state.dockerEndpoint.realpath,
    homeDir: state.homeDir,
    ambient: {},
  });
  if (endpointNow.identity_digest !== state.dockerEndpoint.identity_digest) {
    fail("local Docker endpoint identity drifted");
  }
  const securityOptions = Array.isArray(parsedInfo.SecurityOptions)
    ? [...parsedInfo.SecurityOptions].sort()
    : [];
  const snapshot = buildDockerDaemonSnapshot({
    endpoint_digest: endpointNow.identity_digest,
    daemon_id: String(parsedInfo.ID ?? ""),
    server_version: String(parsedVersion.Server?.Version ?? parsedInfo.ServerVersion ?? ""),
    operating_system: String(parsedInfo.OperatingSystem ?? ""),
    os_type: String(parsedInfo.OSType ?? ""),
    architecture: String(parsedInfo.Architecture ?? ""),
    docker_root_dir_digest: sha256Jcs(String(parsedInfo.DockerRootDir ?? "")),
    rootless: securityOptions.some((value) => /rootless/iu.test(value)),
    security_options_digest: sha256Jcs(securityOptions),
  });
  return validateDockerDaemonSnapshots(snapshot, snapshot);
}

async function collectProductionSnapshot(state, signal) {
  const commandRunner = async (command, args, spawnOptions = {}) => {
    const docker = command === state.dockerBin;
    const commandArgs = docker ? buildPinnedDockerArgs(args, state.dockerEndpoint) : args;
    if (docker) {
      validateDockerInvocation(commandArgs, {
        dockerHost: state.dockerEndpoint.url,
        runId: state.runId,
        project: state.namespace?.project,
      });
    }
    const result = await state.runCommand({
      command,
      args: commandArgs,
      env: docker
        ? ensureDockerCommandEnvironment(state)
        : { LC_ALL: "C", PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
      signal,
      timeoutMs: spawnOptions.timeout ?? 30_000,
      maxOutputBytes: Math.min(spawnOptions.maxBuffer ?? OUTPUT_LIMIT_BYTES, OUTPUT_LIMIT_BYTES),
    });
    state.commandTelemetry.push(Object.freeze({
      argv_digest: sha256Jcs(commandArgs),
      mode: docker ? "inventory-docker-read" : "inventory-local-read",
      production_target: false,
    }));
    return result;
  };
  const markerPath = join(state.homeDir, ".homecook", "rehearsal", "approved-production-migration-marker.json");
  const adapters = createLocalProductionInventoryAdapters({
    homeDir: state.homeDir,
    rootDir: state.rootDir,
    approvedMigrationMarkerPath: markerPath,
    dockerBin: state.dockerBin,
    commandRunner,
  });
  const runnerPath = resolve(state.rootDir, "scripts", "local-mac-production-rehearsal-run.mjs");
  const stats = lstatSync(runnerPath, { bigint: true });
  const inventory = await collectReadOnlyProductionInventory({
    adapters,
    approvedMigrationMarker: true,
    probeIdentity: {
      version: "homecook-release-rehearsal-runner-v1",
      realpath: runnerPath,
      device: String(stats.dev),
      inode: String(stats.ino),
      mode: Number(stats.mode & 0o7777n),
      ctime: new Date(Number(stats.ctimeMs)).toISOString(),
      size: String(stats.size),
      sha256: sha256Bytes(readFileSync(runnerPath)),
    },
  });
  state.commandTelemetry.push(Object.freeze({
    argv_digest: sha256Jcs({ marker_path_digest: sha256Jcs(markerPath), surface: inventory.surface_digest }),
    mode: "inventory-complete",
    production_target: false,
  }));
  return createProductionSurfaceSnapshot(inventory);
}

/**
 * @param {{candidateInput:string, namespaceRoot:string, runId:string, homeDir?:string, rootDir?:string, dockerBin?:string|null, dockerSocketPath?:string|null, runCommand?:Function, productionSnapshotReader?:Function|null, daemonSnapshotReader?:Function|null, dockerEndpointResolver?:Function, trustedToolResolver?:Record<string, any>|null, platform?:string, clock?:Function, sleep?:Function}} options
 */
export function createLocalReleaseRehearsalRunnerAdapters({
  candidateInput,
  namespaceRoot,
  runId,
  homeDir = process.env.HOME ?? "",
  rootDir = process.cwd(),
  dockerBin = null,
  dockerSocketPath = null,
  runCommand = runAbortableCommand,
  productionSnapshotReader = null,
  daemonSnapshotReader = null,
  dockerEndpointResolver = resolveTrustedLocalDockerEndpoint,
  trustedToolResolver = null,
  platform = process.platform,
  clock = () => Date.now(),
  sleep = async () => {},
} = {}) {
  if (!candidateInput || !namespaceRoot || !runId) fail("adapter factory requires candidate, namespace, and run identity");
  const resolvedHome = resolve(homeDir);
  const resolvedRoot = resolve(rootDir);
  if ([dockerEndpointResolver, runCommand, clock, sleep].some((value) => typeof value !== "function")) fail("adapter trusted dependencies must be functions");
  if (productionSnapshotReader !== null && typeof productionSnapshotReader !== "function") fail("production snapshot reader is invalid");
  if (daemonSnapshotReader !== null && typeof daemonSnapshotReader !== "function") fail("daemon snapshot reader is invalid");
  if (trustedToolResolver !== null && typeof trustedToolResolver !== "object") fail("trusted tool resolver is invalid");
  const dockerEndpoint = dockerEndpointResolver({
    explicitSocketPath: dockerSocketPath,
    homeDir: resolvedHome,
    ambient: process.env,
  });
  const state = {
    candidateInput,
    namespaceRoot,
    runId,
    homeDir: resolvedHome,
    rootDir: resolvedRoot,
    runRoot: join(resolve(namespaceRoot), runId),
    runtimeRoot: join(resolve(namespaceRoot), runId, "runtime-state"),
    dockerBin: dockerBin ?? resolveTrustedDockerBinary(),
    dockerEndpoint,
    runCommand,
    commandEnvironment: null,
    activeSignal: new AbortController().signal,
    cleanupSignal: new AbortController().signal,
    commandTelemetry: [],
    creationLedger: createImmutableCreationLedger(),
    creationNonce: randomBytes(32).toString("hex"),
    daemonPre: null,
    namespace: null,
    secrets: null,
    worker: null,
    deniedAttempts: 0,
    portReservations: [],
  };
  const observerTools = trustedToolResolver ?? Object.fromEntries([
    ["log", ["/usr/bin/log"]], ["lsof", ["/usr/sbin/lsof"]], ["ps", ["/bin/ps"]],
  ].map(([name, candidates]) => {
    const path = resolveSafeRealExecutable(candidates, `R2 observer ${name}`);
    return [name, { path, identity: snapshotToolFile(path, "r2-observer") }];
  }));
  const observerToolMap = observerTools;
  const independentObserver = createTrustedMacOsIndependentObserver({
    runCommand,
    clock, sleep, platform,
    collectProductionSnapshot: () => productionSnapshotReader ? productionSnapshotReader(state) : collectProductionSnapshot(state, state.activeSignal),
    snapshotDockerDaemon: () => daemonSnapshotReader ? daemonSnapshotReader(state) : snapshotDockerDaemon(state, state.activeSignal),
    toolResolver: { ...observerToolMap, fixture: platform === "darwin" ? undefined : false, logPath: observerToolMap.log.path, lsofPath: observerToolMap.lsof.path, psPath: observerToolMap.ps.path, logDigest: observerToolMap.logDigest ?? sha256Jcs(observerToolMap.log.identity), lsofDigest: observerToolMap.lsofDigest ?? sha256Jcs(observerToolMap.lsof.identity), psDigest: observerToolMap.psDigest ?? sha256Jcs(observerToolMap.ps.identity) },
  });

  return Object.freeze({
    independentObserver,
    async snapshotProduction(label, { signal } = {}) {
      state.activeSignal = signal ?? state.activeSignal;
      const daemon = await snapshotDockerDaemon(state, state.activeSignal);
      if (label === "pre") state.daemonPre = daemon;
      else validateDockerDaemonSnapshots(state.daemonPre, daemon);
      return collectProductionSnapshot(state, state.activeSignal);
    },

    async reservePorts() {
      const reservation = await allocatePorts();
      state.portReservations = reservation.servers;
      return reservation.ports;
    },

    async inspectCollisions({ namespace, runRoot, signal }) {
      state.activeSignal = signal ?? state.activeSignal;
      state.namespace = namespace;
      state.runRoot = runRoot;
      const containers = await dockerList(state, "container", null, { signal: state.activeSignal });
      const networks = await dockerList(state, "network", null, { signal: state.activeSignal });
      const volumes = await dockerList(state, "volume", null, { signal: state.activeSignal });
      const collisions = [
        ...resourceNameCollision(containers.map((entry) => entry.name), namespace.container_names),
        ...resourceNameCollision(networks.map((entry) => entry.name), namespace.network_names),
        ...resourceNameCollision(volumes.map((entry) => entry.name), namespace.volume_names),
        ...(await dockerList(state, "container", `label=${RUN_PROJECT_LABEL}=${namespace.project}`, { signal: state.activeSignal })).map((entry) => entry.id),
        ...(await dockerList(state, "network", `label=${RUN_PROJECT_LABEL}=${namespace.project}`, { signal: state.activeSignal })).map((entry) => entry.id),
        ...(await dockerList(state, "volume", `label=${RUN_PROJECT_LABEL}=${namespace.project}`, { signal: state.activeSignal })).map((entry) => entry.id),
      ];
      return { collisions };
    },

    async assertImagesLocal({ manifest, signal }) {
      state.activeSignal = signal ?? state.activeSignal;
      const imageIds = [];
      for (const image of manifest.images) {
        const result = await dockerCommand(state, ["image", "inspect", image.reference, "--format", "{{.Id}}\t{{.Os}}/{{.Architecture}}"], { signal: state.activeSignal });
        const [imageId, platform] = result.stdout.trim().split("\t");
        if (imageId !== image.image_id || platform !== image.platform) fail(`local image identity mismatch for ${image.service}`);
        imageIds.push(imageId);
        state.imageAuthorities ??= new Map();
        state.imageAuthorities.set(image.service, Object.freeze({ ...image }));
      }
      return { verified: true, image_ids: imageIds };
    },

    async createResources({ manifest, candidateRoot, namespace, runRoot, signal, independentObserver = null }) {
      state.activeSignal = signal ?? state.activeSignal;
      state.namespace = namespace;
      state.runRoot = runRoot;
      state.candidateRoot = candidateRoot;
      state.independentObserver = independentObserver;
      const sealedCompose = join(candidateRoot, "bundles", "bundle", "full_local", "infra", "full-local-supabase", "docker-compose.production.yml");
      if (!existsSync(sealedCompose) || lstatSync(sealedCompose).isSymbolicLink()) fail("sealed full-local Compose authority is missing");
      state.runtimeRoot = join(runRoot, "runtime-state");
      const overridePath = join(state.runtimeRoot, "compose.rehearsal.override.yml");
      writeFileSync(overridePath, buildFullLocalComposeOverride(namespace, {
        candidateRoot,
        creationNonce: state.creationNonce,
      }), { flag: "wx", mode: 0o600 });
      const env = buildFullLocalRehearsalEnvironment({ namespace, runRoot: state.runtimeRoot, manifest });
      mkdirSync(join(state.runtimeRoot, "state"), { mode: 0o700 });
      const envPath = join(state.runtimeRoot, "compose.public.env");
      writeEnvironmentFile(envPath, env);
      state.secrets = generateFullLocalSecretBundle();
      materializeSecretFilesCreateOnly({
        names: FULL_LOCAL_SECRET_NAMES,
        readSecret: (name) => state.secrets[name],
        targetDirectory: env.FULL_LOCAL_SECRET_DIR,
      });
      // Compose is configuration authority only.  Primitive resources return IDs directly.
      const primitiveLabels = [
        "--label", `${RUN_OWNERSHIP_LABEL}=${state.runId}`,
        "--label", `${RUN_PROJECT_LABEL}=${namespace.project}`,
        "--label", `${RUN_CREATION_NONCE_LABEL}=${state.creationNonce}`,
      ];
      for (const name of namespace.network_names.slice(0, 3)) {
        const stdout = (await dockerCommand(state, ["network", "create", "--internal", ...primitiveLabels, name], { signal: state.activeSignal })).stdout;
        const id = /^([0-9a-f]{64})\n?$/u.exec(stdout)?.[1];
        if (!id) fail("primitive network create did not return one exact ID");
        const entry = { kind: "network", id, name };
        const observed = await inspectResource(state, entry, { signal: state.activeSignal });
        recordPrimitiveCreateResult(state.creationLedger, { ...entry, labels: { [RUN_OWNERSHIP_LABEL]: state.runId, [RUN_PROJECT_LABEL]: namespace.project, [RUN_CREATION_NONCE_LABEL]: state.creationNonce } }, stdout, observed);
      }
      for (const name of namespace.volume_names) {
        const stdout = (await dockerCommand(state, ["volume", "create", "--name", name, ...primitiveLabels], { signal: state.activeSignal })).stdout;
        const id = /^([0-9a-f]{64})\n?$/u.exec(stdout)?.[1];
        if (!id) fail("primitive volume create did not return one exact ID");
        const entry = { kind: "volume", id, name };
        const observed = await inspectResource(state, entry, { signal: state.activeSignal });
        recordPrimitiveCreateResult(state.creationLedger, { ...entry, labels: { [RUN_OWNERSHIP_LABEL]: state.runId, [RUN_PROJECT_LABEL]: namespace.project, [RUN_CREATION_NONCE_LABEL]: state.creationNonce } }, stdout, observed);
      }
      const resolved = await dockerCommand(state, [
        "compose", "--project-name", namespace.project, "--env-file", envPath,
        "-f", sealedCompose, "-f", overridePath, "config", "--format", "json",
      ], { signal: state.activeSignal });
      let config;
      try { config = JSON.parse(resolved.stdout); } catch { fail("read-only Compose config output is invalid JSON"); }
      const plan = compileClosedPrimitivePlan(config, { project: namespace.project, ports: namespace.ports });
      state.primitivePlan = Object.freeze({ plan, digest: sha256Jcs(plan) });
      state.primitiveOperations = compilePrimitiveServiceOperations(plan, namespace, primitiveLabels);
      for (const service of plan.services) {
        const primitive = primitiveServiceArgs(service, namespace, primitiveLabels);
        const stdout = (await dockerCommand(state, primitive.args, { signal: state.activeSignal })).stdout;
        const id = /^([0-9a-f]{64})\n?$/u.exec(stdout)?.[1];
        const entry = { kind: "container", id, name: `${namespace.project}-${service.name}-1` };
        const observed = await inspectResource(state, entry, { signal: state.activeSignal });
        recordPrimitiveCreateResult(state.creationLedger, { ...entry, labels: { [RUN_OWNERSHIP_LABEL]: state.runId, [RUN_PROJECT_LABEL]: namespace.project, [RUN_CREATION_NONCE_LABEL]: state.creationNonce } }, stdout, observed);
        for (const network of primitive.additionalNetworks) {
          await dockerCommand(state, ["network", "connect", ...network.aliases.flatMap((alias) => ["--alias", alias]), `${namespace.project}_${network.name}`, id], { signal: state.activeSignal, ownership: { verifiedOwnership: true, resourceId: id } });
        }
        const contractInspection = await dockerCommand(state, ["inspect", "--type", "container", id, "--format", "{{json .}}"], { signal: state.activeSignal });
        let observedContract;
        try { observedContract = JSON.parse(contractInspection.stdout); } catch { fail(`primitive inspect JSON is invalid: ${service.name}`); }
        validatePrimitiveContainerInspection(observedContract, service, namespace);
        await dockerCommand(state, ["start", id], { signal: state.activeSignal, ownership: { verifiedOwnership: true, resourceId: id } });
        if (service.healthcheck) await waitForContainers(state, { signal: state.activeSignal, expectedNames: [entry.name] });
        if (independentObserver?.registerChild) {
          const subject = await readContainerObserverSubject(state, { containerId: id, component: service.name, signal: state.activeSignal });
          await independentObserver.registerChild(subject);
          state.observerSubjects ??= [];
          state.observerSubjects.push(subject);
        }
      }
      return state.creationLedger.snapshot();
    },

    getCreationLedger() { return state.creationLedger.snapshot(); },

    async applyMigrations({ manifest, namespace, migrationInputs, signal }) {
      state.activeSignal = signal ?? state.activeSignal;
      await executePsql(state, [
        "CREATE TABLE public.homecook_rehearsal_global_migration_ledger (",
        "  sequence bigint PRIMARY KEY, migration_id text UNIQUE NOT NULL, migration_sha256 text NOT NULL",
        ");",
      ].join("\n"), { database: namespace.db_name, signal: state.activeSignal });
      const ledger = [];
      const ledgerEntries = [];
      if (!Array.isArray(migrationInputs) || migrationInputs.length !== manifest.migration.ordered_migration_files.length) {
        fail("verified migration Buffer inputs are required");
      }
      for (const [index, input] of migrationInputs.entries()) {
        const relativePath = input.path;
        const sql = decodeFatalUtf8(input.bytes, relativePath);
        const migrationId = relativePath.split("/").at(-1).replace(/\.sql$/u, "");
        const migrationSha256 = sha256Bytes(input.bytes);
        if (migrationSha256 !== input.sha256) fail("verified migration Buffer digest drifted");
        await executePsql(state, `BEGIN;\n${sql}\nINSERT INTO public.homecook_rehearsal_global_migration_ledger(sequence,migration_id,migration_sha256) VALUES (${index + 1}, '${migrationId.replaceAll("'", "''")}', '${migrationSha256}');\nCOMMIT;\n`, { database: namespace.db_name, signal: state.activeSignal });
        ledger.push(migrationId);
        ledgerEntries.push({ sequence: index + 1, migration_id: migrationId, migration_sha256: migrationSha256 });
      }
      const ledgerOutput = await executePsql(state, "SELECT sequence || ':' || migration_id || ':' || migration_sha256 FROM public.homecook_rehearsal_global_migration_ledger ORDER BY sequence;\n", { database: namespace.db_name, tuplesOnly: true, signal: state.activeSignal });
      const observedLedger = parseLines(ledgerOutput).map((line) => {
        const [sequence, migrationId, migrationSha256] = line.split(":");
        return { sequence: Number(sequence), migration_id: migrationId, migration_sha256: migrationSha256 };
      });
      if (canonicalizeJcs(observedLedger) !== canonicalizeJcs(ledgerEntries)) {
        fail("applied global migration ledger readback differs from the sealed order");
      }
      const catalogHead = (await executePsql(state, "SELECT migration_id FROM public.homecook_rehearsal_global_migration_ledger ORDER BY sequence DESC LIMIT 1;\n", { database: namespace.db_name, tuplesOnly: true, signal: state.activeSignal })).trim();
      const schemaIdentity = await executePsql(state, "SELECT n.nspname || '.' || c.relname || ':' || c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' ORDER BY 1;\n", { database: namespace.db_name, tuplesOnly: true, signal: state.activeSignal });
      return {
        ordered_migration_files_digest: manifest.migration.ordered_migration_files_digest,
        applied_global_ledger_digest: sha256Jcs(ledgerEntries),
        global_ledger_entries: ledgerEntries,
        ordered_global_ledger: ledger,
        migration_head: ledger.at(-1),
        catalog_head: catalogHead,
        schema_identity_digest: sha256Bytes(Buffer.from(schemaIdentity, "utf8")),
      };
    },

    async loadSyntheticFixtures({ namespace, signal }) {
      state.activeSignal = signal ?? state.activeSignal;
      const fixtureValue = `homecook-r2-${namespace.run_id}`;
      await executePsql(state, [
        "CREATE TABLE public.homecook_rehearsal_fixture (id integer PRIMARY KEY, value text NOT NULL, database_name text NOT NULL DEFAULT current_database());",
        "GRANT SELECT ON public.homecook_rehearsal_fixture TO anon, authenticated;",
        `INSERT INTO public.homecook_rehearsal_fixture(id,value) VALUES (1,'${fixtureValue}');`,
        "NOTIFY pgrst, 'reload schema';",
      ].join("\n"), { database: namespace.db_name, signal: state.activeSignal });
      return {
        fixture_set_id: "homecook-r2-synthetic-v1",
        fixture_set_digest: sha256Jcs({ id: 1, value: fixtureValue }),
        production_derived_row_count: 0,
      };
    },

    async prepareYoutubeWorkerSyntheticFixture({ manifest, namespace, signal }) {
      state.activeSignal = signal ?? state.activeSignal;
      const artifact = JSON.parse(readFileSync(join(state.candidateRoot, "bundles", "bundle", "worker", "artifact.json"), "utf8"));
      const issued = ensureIssuedWorkerCredential(state, manifest, artifact);
      const fixture = buildIsolatedYoutubeWorkerSyntheticFixtureSql({ runIdentity: namespace.run_id, userId: crypto.randomUUID(), jobId: crypto.randomUUID(), releaseSha: manifest.release_sha, schemaIdentity: artifact.schema_identity, allowedSnapshotDigest: artifact.allowed_snapshot_digest, extractorMode: artifact.extractor_mode, pipelineIdentity: artifact.pipeline_identity, policyVersion: artifact.policy_version, resultAffectingOptions: DEFAULT_YOUTUBE_EXTRACTION_WORKER_POLICY_OPTIONS, fingerprintKeyVersion: DEFAULT_YOUTUBE_EXTRACTION_WORKER_FINGERPRINT_KEY_VERSION, jtiHash: issued.jtiHash, nowEpoch: Math.floor(new Date(issued.metadata.issued_at).getTime() / 1000) });
      await executePsql(state, fixture.sql, { database: namespace.db_name, variables: fixture.variables, allowedVariableNames: new Set(fixture.allowedVariableNames), signal: state.activeSignal });
      const readbackSql = "select json_build_object('user_id',u.id,'job_id',j.id,'job_status',j.status,'attempt_count',j.attempt_count,'policy_snapshot_digest',j.policy_snapshot_digest,'computed_policy_snapshot_digest',private.youtube_extraction_policy_snapshot_digest(cp.extractor_mode,cp.pipeline_identity,cp.result_affecting_options,cp.policy_version),'credential_jti_hash',c.current_jti_hash,'credential_generation',c.current_generation,'credential_release_sha',c.release_sha,'credential_schema_identity',c.schema_identity,'credential_snapshot_digest',c.allowed_snapshot_digest,'permit_generation',p.permit_generation) from public.users u join public.youtube_extraction_jobs j on j.user_id=u.id join private.youtube_extraction_worker_credentials c on c.credential_name='primary' join public.youtube_extractor_permits p on p.permit_key='primary' join private.youtube_extraction_current_policy cp on cp.policy_key='primary' where u.id=:'user_id' and j.id=:'job_id';\n";
      const output = await executePsql(state, readbackSql, { database: namespace.db_name, tuplesOnly: true, variables: { user_id: fixture.variables.user_id, job_id: fixture.variables.job_id }, allowedVariableNames: new Set(["user_id", "job_id"]), signal: state.activeSignal });
      parseAndValidateWorkerFixtureReadback(output, { user_id: fixture.variables.user_id, job_id: fixture.variables.job_id, job_status: "queued", attempt_count: 0, policy_snapshot_digest: artifact.allowed_snapshot_digest, computed_policy_snapshot_digest: artifact.allowed_snapshot_digest, credential_jti_hash: issued.jtiHash, credential_generation: 1, credential_release_sha: manifest.release_sha, credential_schema_identity: artifact.schema_identity, credential_snapshot_digest: artifact.allowed_snapshot_digest, permit_generation: 0 });
      const probeResult = await runOwnedPostgrestFixtureProbe(state, { namespace, jobId: fixture.variables.job_id, userId: fixture.variables.user_id, token: state.secrets.service_role_key, expected: { job_id: fixture.variables.job_id, user_id: fixture.variables.user_id, policy_snapshot_digest: artifact.allowed_snapshot_digest }, signal: state.activeSignal });
      state.workerFixtureAuthority = Object.freeze({
        fixture_sql_digest: sha256Jcs(fixture),
        credential_jti_hash: issued.jtiHash,
        credential_generation: 1,
        release_sha: manifest.release_sha,
        schema_identity: artifact.schema_identity,
        allowed_snapshot_digest: artifact.allowed_snapshot_digest,
        token_reference_digest: sha256Jcs("rehearsal-worker.jwt"),
        user_id: fixture.variables.user_id,
        job_id: fixture.variables.job_id,
        postgrest_probe_response_digest: probeResult.response_digest,
        production_derived_row_count: 0,
      });
      return state.workerFixtureAuthority;
    },

    async startComponents({ manifest, candidateRoot, namespace, signal }) {
      state.activeSignal = signal ?? state.activeSignal;
      const nodeImage = findImage(manifest, "auth-proxy");
      const appRoot = join(candidateRoot, "bundles", "bundle", "app");
      const appName = namespace.container_names.find((name) => name.endsWith("-app"));
      const commonLabels = [
        "--label", `${RUN_OWNERSHIP_LABEL}=${state.runId}`,
        "--label", `${RUN_PROJECT_LABEL}=${namespace.project}`,
        "--label", `${RUN_CREATION_NONCE_LABEL}=${state.creationNonce}`,
        "--label", `${RUN_IMAGE_SERVICE_LABEL}=auth-proxy`,
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
        DATA_SUPABASE_URL: `http://127.0.0.1:${namespace.ports.storage}`,
        DATA_SUPABASE_PUBLISHABLE_KEY: state.secrets.publishable_key,
        LOCAL_SUPABASE_INTERNAL_URL: `http://127.0.0.1:${namespace.ports.storage}`,
        HOMECOOK_FULL_LOCAL_SECRET_DIR: "/run/app-secrets",
      }, { runId: state.runId, runRoot: state.runRoot });
      const appWrapper = `${childIdentitySource({ outputPath: "/tmp/homecook-r2-identity.json" })}.then(()=>{const net=require('node:net');const proxy=net.createServer(i=>{const o=net.connect(${namespace.ports.storage},'api-gateway');i.pipe(o);o.pipe(i)});proxy.listen(${namespace.ports.storage},'127.0.0.1',()=>{const{spawn}=require('node:child_process');const c=spawn('node',['scripts/start-production.mjs','--hostname','0.0.0.0','--port',process.env.PORT],{stdio:['ignore','pipe','pipe']});let bytes=0;const bounded=d=>{bytes+=d.length;if(bytes>1048576){c.kill('SIGTERM');process.exit(72)}};c.stdout.on('data',bounded);c.stderr.on('data',bounded);for(const s of ['SIGINT','SIGTERM','SIGHUP'])process.on(s,()=>c.kill(s));c.on('exit',(code,signal)=>{proxy.close();if(signal)process.kill(process.pid,signal);else process.exit(code??1)})})}).catch(()=>process.exit(70))`;
      const appArgs = [
        "run", "--detach", "--name", appName,
        "--pull=never",
        ...commonLabels,
        "--network", `${namespace.project}_data-internal`,
        "--user", `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`,
        "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
        "--log-driver", "local", "--log-opt", "max-size=1m", "--log-opt", "max-file=1",
        "--tmpfs", "/workspace/.next/cache:rw,noexec,nosuid,size=64m",
        "--mount", `type=bind,src=${appRoot},dst=/workspace,readonly`,
        "--mount", `type=bind,src=${candidateRoot},dst=/sealed-candidate,readonly`,
        "--mount", `type=bind,src=${join(state.runtimeRoot, "secret-fds")},dst=/run/app-secrets,readonly`,
        "--publish", `127.0.0.1:${namespace.ports.app}:${namespace.ports.app}`,
        ...dockerEnvironmentArgs(appEnvironment),
        "--workdir", "/workspace",
        nodeImage,
        "node", "-e", appWrapper,
      ];
      const appId = await runContainer(state, appArgs, { signal: state.activeSignal });
      if (state.independentObserver?.registerChild) {
        const subject = await readContainerObserverSubject(state, { containerId: appId, component: "app", signal: state.activeSignal });
        await state.independentObserver.registerChild(subject);
        state.observerSubjects ??= [];
        state.observerSubjects.push(subject);
      }
      state.worker = materializeWorkerHealthBundle(state, manifest, candidateRoot);
      const workerName = namespace.container_names.find((name) => name.endsWith("-worker"));
      const wrapper = `${childIdentitySource({ outputPath: "/tmp/homecook-r2-identity.json" })}.then(()=>{const{spawn}=require('node:child_process');const{writeFileSync}=require('node:fs');const a=JSON.parse(process.env.R2_WORKER_ARGS);const c=spawn('node',['/sealed-worker/scripts/youtube-extraction-worker-runner.mjs','rehearsal-synthetic',...a],{stdio:['ignore','pipe','pipe']});let out='';let bytes=0;const bounded=d=>{bytes+=d.length;if(bytes>1048576){c.kill('SIGTERM');process.exit(72)}};c.stdout.on('data',d=>{bounded(d);out+=d});c.stderr.on('data',bounded);for(const s of ['SIGINT','SIGTERM','SIGHUP'])process.on(s,()=>{if(c.exitCode===null)c.kill(s);else process.exit(0)});c.on('exit',(code)=>{if(code!==0)process.exit(71);writeFileSync('/tmp/homecook-r2-worker-result.json',out,{flag:'wx',mode:0o400});setInterval(()=>{},2147483647)})}).catch(()=>process.exit(70))`;
      const workerEnvironment = validateChildEnvironment({
        HOMECOOK_REHEARSAL_RUN_ID: state.runId,
        HOMECOOK_REHEARSAL_MODE: "isolated-r2",
        HOMECOOK_RELEASE_SHA: manifest.release_sha,
        HOMECOOK_RELEASE_TREE: manifest.release_tree,
        HOMECOOK_RELEASE_BUILD_ID: manifest.build_id,
        HOMECOOK_SEALED_BUNDLE_DIGEST: manifest.sealed_bundle_digest,
        R2_WORKER_ARGS: JSON.stringify(state.worker.containerArgs),
      }, { runId: state.runId, runRoot: state.runRoot });
      const workerArgs = [
        "run", "--detach", "--name", workerName,
        "--pull=never",
        ...commonLabels,
        "--network", `${namespace.project}_data-internal`,
        "--user", `${process.getuid?.() ?? 0}:${process.getgid?.() ?? 0}`,
        "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
        "--log-driver", "local", "--log-opt", "max-size=1m", "--log-opt", "max-file=1",
        "--mount", `type=bind,src=${state.worker.workerRoot},dst=/sealed-worker,readonly`,
        "--mount", `type=bind,src=${state.worker.workerSecretRoot},dst=/run/worker-secrets,readonly`,
        "--mount", `type=bind,src=${candidateRoot},dst=/sealed-candidate,readonly`,
        ...dockerEnvironmentArgs(workerEnvironment),
        nodeImage, "node", "-e", wrapper,
      ];
      const workerId = await runContainer(state, workerArgs, { signal: state.activeSignal });
      if (state.independentObserver?.registerChild) {
        const subject = await readContainerObserverSubject(state, { containerId: workerId, component: "worker", signal: state.activeSignal });
        await state.independentObserver.registerChild(subject);
        state.observerSubjects ??= [];
        state.observerSubjects.push(subject);
      }
      const sentinelNetworkName = `${namespace.project}_egress-sentinel`;
      let sentinelNetworkId;
      try {
        const sentinelStdout = (await dockerCommand(state, [
          "network", "create", "--internal",
          ...commonLabels,
          sentinelNetworkName,
        ], { signal: state.activeSignal })).stdout;
        sentinelNetworkId = /^([0-9a-f]{64})\n?$/u.exec(sentinelStdout)?.[1];
        if (!sentinelNetworkId) fail("sentinel network create did not return one exact ID");
        const sentinelNetworkEntry = { kind: "network", id: sentinelNetworkId, name: sentinelNetworkName };
        const sentinelNetworkObserved = await inspectResource(state, sentinelNetworkEntry, { signal: state.activeSignal });
        recordPrimitiveCreateResult(state.creationLedger, { ...sentinelNetworkEntry, labels: { [RUN_OWNERSHIP_LABEL]: state.runId, [RUN_PROJECT_LABEL]: namespace.project, [RUN_CREATION_NONCE_LABEL]: state.creationNonce } }, sentinelStdout, sentinelNetworkObserved);
      } catch (error) {
        await assertExpectedCreatedResources(state, [sentinelNetworkName], { signal: state.cleanupSignal });
        throw error;
      }
      const sentinelName = `${namespace.project}-egress-sentinel`;
      const sentinelId = await runContainer(state, [
        "run", "--detach", "--name", sentinelName,
        "--pull=never",
        ...commonLabels,
        "--network", sentinelNetworkName,
        "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=16m",
        "--log-driver", "local", "--log-opt", "max-size=1m", "--log-opt", "max-file=1",
        nodeImage, "node", "-e",
        "require('node:http').createServer((_,r)=>r.end('sentinel')).listen(8080,'0.0.0.0')",
      ], { signal: state.activeSignal });
      await verifyCreatedContainerImages(state, { signal: state.activeSignal });
      const ownedContainers = (await listDiscoveredResources(state, { signal: state.activeSignal }))
        .filter((entry) => entry.kind === "container");
      const appResource = ownedContainers.find((entry) => entry.id === appId);
      const workerResource = ownedContainers.find((entry) => entry.id === workerId);
      const probeResource = ownedContainers.find((entry) => entry.name === `${namespace.project}-postgrest-probe-1`);
      if (!appResource || !workerResource || !probeResource) fail("runtime identity probe container set is incomplete");
      const appReported = await readContainerIdentity(state, appResource, manifest, { signal: state.activeSignal });
      const workerReported = await readContainerIdentity(state, workerResource, manifest, { signal: state.activeSignal });
      const fullLocalReported = await readContainerIdentity(state, probeResource, manifest, { outputPath: null, signal: state.activeSignal });
      const fullLocalIds = ownedContainers
        .filter((entry) => entry.kind === "container" && ![appId, workerId, sentinelId].includes(entry.id))
        .map((entry) => entry.id);
      state.creationLedger.close();
      return [
        runtimeIdentity("app", [appId], appReported),
        runtimeIdentity("full_local", fullLocalIds, fullLocalReported),
        runtimeIdentity("worker", [workerId], workerReported, state.worker.rehearsalRpcIdentity),
      ];
    },

    async waitForReadiness({ namespace, runtime, signal }) {
      state.activeSignal = signal ?? state.activeSignal;
      await waitForContainers(state, { signal: state.activeSignal });
      for (const entry of runtime.flatMap((item) => item.container_ids)) {
        const status = (await dockerCommand(state, ["inspect", "--type", "container", entry, "--format", "{{.State.Status}}"], { signal: state.activeSignal })).stdout.trim();
        if (status !== "running") fail("runtime container crashed before readiness");
      }
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        if (state.activeSignal.aborted) throw state.activeSignal.reason ?? new Error("readiness aborted");
        try {
          const response = await fetch(`http://127.0.0.1:${namespace.ports.app}/`, { signal: AbortSignal.any([state.activeSignal, AbortSignal.timeout(2_000)]) });
          if (response.status < 500) return { ready: true };
        } catch { /* retry bounded */ }
        await abortableDelay(100, state.activeSignal);
      }
      fail("app readiness timeout");
    },

    async runCanaries({ namespace, fixtures, runtime, signal }) {
      state.activeSignal = signal ?? state.activeSignal;
      const results = [];
      const appResponse = await fetch(`http://127.0.0.1:${namespace.ports.app}/`, {
        signal: AbortSignal.any([state.activeSignal, AbortSignal.timeout(10_000)]),
      });
      const appDataResponse = await fetch(`http://127.0.0.1:${namespace.ports.app}/api/v1/recipes?limit=1`, {
        signal: AbortSignal.any([state.activeSignal, AbortSignal.timeout(10_000)]),
      });
      if (appResponse.status >= 500 || appDataResponse.status >= 500) {
        fail("actual production app/data route canary failed");
      }
      const appReported = runtime.find((entry) => entry.component === "app");
      const fullLocalReported = runtime.find((entry) => entry.component === "full_local");
      const workerReported = runtime.find((entry) => entry.component === "worker");
      if (!appReported || !fullLocalReported || !workerReported) {
        fail("child-reported component identity evidence is missing");
      }
      results.push({
        canary_id: "app-production-route",
        exit_code: 0,
        normalized_result_digest: sha256Jcs({
          home_status: appResponse.status,
          data_status: appDataResponse.status,
          reported_identity: appReported,
        }),
      });

      const discovered = await listDiscoveredResources(state, { signal: state.activeSignal });
      const probeRuntime = discovered.find((entry) =>
        entry.kind === "container" && entry.name === `${namespace.project}-postgrest-probe-1`);
      const workerRuntime = discovered.find((entry) =>
        entry.kind === "container" && entry.name === `${namespace.project}-worker`);
      const sentinelRuntime = discovered.find((entry) =>
        entry.kind === "container" && entry.name === `${namespace.project}-egress-sentinel`);
      if (!probeRuntime || !workerRuntime || !sentinelRuntime) fail("canary container set is incomplete");
      for (const entry of [probeRuntime, workerRuntime, sentinelRuntime]) {
        const observed = await inspectResource(state, entry, { signal: state.activeSignal });
        if (
          observed?.id !== entry.id
          || observed?.name !== entry.name
          || observed?.labels?.[RUN_OWNERSHIP_LABEL] !== state.runId
          || observed?.labels?.[RUN_PROJECT_LABEL] !== namespace.project
          || observed?.labels?.[RUN_CREATION_NONCE_LABEL] !== state.creationNonce
          || !state.creationLedger.contains(entry)
        ) fail(`canary ownership mismatch: ${entry.name}`);
      }

      const serviceProbeSource = [
        "const get=async(url,json=false)=>{const r=await fetch(url,{signal:AbortSignal.timeout(5000)});",
        "if(!r.ok)throw new Error('status '+r.status);return json?await r.json():r.status};",
        "(async()=>{const auth=await get('http://auth:9999/health');",
        "const storage=await get('http://storage:5000/status');",
        `const gateway=await get('http://api-gateway:${namespace.ports.storage}/auth/v1/health');`,
        "const fixture=await get('http://postgrest:3000/homecook_rehearsal_fixture?id=eq.1&select=id,value,database_name',true);",
        "process.stdout.write(JSON.stringify({auth,storage,gateway,fixture}))})().catch(()=>process.exit(70));",
      ].join("");
      const serviceProbe = await dockerCommand(state, [
        "exec", probeRuntime.id, "node", "-e", serviceProbeSource,
      ], {
        signal: state.activeSignal,
        ownership: { verifiedOwnership: true, resourceId: probeRuntime.id },
      });
      let serviceResult;
      try { serviceResult = JSON.parse(serviceProbe.stdout); }
      catch { fail("full-local service route canary output is invalid"); }
      if (
        !Array.isArray(serviceResult.fixture)
        || serviceResult.fixture.length !== 1
        || serviceResult.fixture[0]?.value !== `homecook-r2-${namespace.run_id}`
        || serviceResult.fixture[0]?.database_name !== namespace.db_name
      ) fail("PostgREST did not serve the namespaced synthetic fixture");
      for (const [canaryId, key] of [
        ["full-local-auth-route", "auth"],
        ["full-local-storage-route", "storage"],
        ["full-local-api-gateway-route", "gateway"],
      ]) {
        results.push({ canary_id: canaryId, exit_code: 0, normalized_result_digest: sha256Jcs({ status: serviceResult[key], reported_identity: fullLocalReported }) });
      }
      results.push({
        canary_id: "full-local-postgrest-fixture",
        exit_code: 0,
        normalized_result_digest: sha256Jcs({ fixture: serviceResult.fixture, fixture_digest: fixtures.fixture_set_digest, reported_identity: fullLocalReported }),
      });

      let workerResult = null;
      const workerDeadline = Date.now() + 120_000;
      while (Date.now() < workerDeadline && !workerResult) {
        const result = await dockerCommand(state, [
          "exec", workerRuntime.id, "node", "-e",
          "const f=require('node:fs');const p='/tmp/homecook-r2-worker-result.json';if(!f.existsSync(p))process.exit(44);process.stdout.write(f.readFileSync(p,'utf8'))",
        ], {
          allowFailure: true,
          signal: state.activeSignal,
          ownership: { verifiedOwnership: true, resourceId: workerRuntime.id },
        });
        if (result.status === 0) {
          try { workerResult = JSON.parse(result.stdout); }
          catch { fail("worker synthetic result is invalid JSON"); }
          break;
        }
        if (result.status !== 44) fail("worker synthetic runtime exited without evidence");
        await abortableDelay(100, state.activeSignal);
      }
      try { validateSealedWorkerSyntheticResult(workerResult); }
      catch { fail("actual sealed worker fenced lifecycle did not complete end-to-end"); }
      results.push({
        canary_id: "worker-synthetic-job",
        exit_code: 0,
        normalized_result_digest: sha256Jcs({ result: workerResult, reported_identity: workerReported }),
      });

      await dockerCommand(state, [
        "exec", sentinelRuntime.id, "node", "-e",
        "fetch('http://127.0.0.1:8080',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:41)).catch(()=>process.exit(42))",
      ], {
        signal: state.activeSignal,
        timeout: 10_000,
        ownership: { verifiedOwnership: true, resourceId: sentinelRuntime.id },
      });
      const sentinelIp = (await dockerCommand(state, [
        "inspect", "--type", "container", sentinelRuntime.id,
        "--format", `{{with index .NetworkSettings.Networks "${namespace.project}_egress-sentinel"}}{{.IPAddress}}{{end}}`,
      ], { signal: state.activeSignal })).stdout.trim();
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
      const egressAttempt = await dockerCommand(state, [
        "exec", workerRuntime.id, "node", "-e", networkProbe,
      ], {
        allowFailure: true,
        signal: state.activeSignal,
        timeout: 10_000,
        ownership: { verifiedOwnership: true, resourceId: workerRuntime.id },
      });
      if (egressAttempt.status === 41) fail("run-owned allowed-network positive control failed");
      if (egressAttempt.status === 42) fail("worker reached the isolated forbidden sentinel");
      if (egressAttempt.status !== 0) fail("deterministic network deny probe failed unexpectedly");
      state.deniedAttempts += 1;
      state.networkTelemetry = Object.freeze({
        attempted_forbidden_endpoint_count: 1,
        successful_forbidden_endpoint_count: 0,
      });
      results.push({ canary_id: "external-network-deny", exit_code: 0, normalized_result_digest: sha256Jcs({ denied: true, sentinel_id: sentinelRuntime.id }) });
      results.push({ canary_id: "cross-component-identity", exit_code: 0, normalized_result_digest: sha256Jcs({ runtime, fixture: fixtures.fixture_set_digest }) });
      return results;
    },

    async readNetworkEvidence({ signal } = {}) {
      state.activeSignal = signal ?? state.activeSignal;
      const expectedNetworks = new Set(state.namespace.network_names);
      const owned = await listDiscoveredResources(state, { signal: state.activeSignal });
      const networks = [];
      for (const expectedName of [...expectedNetworks].sort()) {
        const entry = owned.find((resource) => resource.kind === "network" && resource.name === expectedName);
        if (!entry) fail(`run-owned network is missing: ${expectedName}`);
        const result = (await dockerCommand(state, [
          "network", "inspect", entry.id, "--format",
          "{{json .Labels}}\t{{.Name}}\t{{.Internal}}",
        ], { signal: state.activeSignal })).stdout.trim().split("\t");
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
        const raw = (await dockerCommand(state, [
          "inspect", "--type", "container", entry.id,
          "--format", "{{json .NetworkSettings.Networks}}",
        ], { signal: state.activeSignal })).stdout.trim();
        const attachedNames = Object.keys(JSON.parse(raw)).sort();
        if (attachedNames.length === 0 || attachedNames.some((name) => !expectedNetworks.has(name))) {
          fail(`container has an external or unknown network attachment: ${entry.name}`);
        }
        attachments.push({ container_id: entry.id, network_names: attachedNames });
      }
      const evidence = {
        default_deny_policy_digest: sha256Jcs({
          schema: "homecook.release-rehearsal-docker-internal-network-policy.v1",
          networks,
          attachments,
        }),
        allowed_endpoints: ["approved-unix-sockets", "loopback", "run-owned-network"],
        denied_attempt_count: state.deniedAttempts,
        unexpected_successful_egress_count: state.networkTelemetry?.successful_forbidden_endpoint_count ?? -1,
      };
      state.networkEvidence = Object.freeze(evidence);
      return evidence;
    },

    async readIsolationTelemetry({ signal } = {}) {
      state.activeSignal = signal ?? state.activeSignal;
      if (
        state.networkEvidence?.denied_attempt_count < 1
        || state.networkEvidence?.unexpected_successful_egress_count !== 0
      ) fail("network enforcement evidence is unavailable");
      const containers = state.creationLedger.snapshot().filter((entry) => entry.kind === "container");
      const volumeNames = new Set(state.creationLedger.snapshot()
        .filter((entry) => entry.kind === "volume")
        .map((entry) => entry.name));
      const projections = [];
      let forbiddenEnvironmentCount = 0;
      let forbiddenMountCount = 0;
      for (const entry of containers) {
        const result = await dockerCommand(state, [
          "inspect", "--type", "container", entry.id,
          "--format", "{{json .Config.Env}}\t{{json .Mounts}}",
        ], { signal: state.activeSignal });
        const [environmentText, mountsText] = result.stdout.trim().split("\t");
        const environment = JSON.parse(environmentText);
        const mounts = JSON.parse(mountsText);
        const forbiddenEnvironment = environment.filter((assignment) => {
          const separator = assignment.indexOf("=");
          const key = separator >= 0 ? assignment.slice(0, separator) : assignment;
          const value = separator >= 0 ? assignment.slice(separator + 1) : "";
          return ["DOCKER_HOST", "DOCKER_CONTEXT"].includes(key)
            || /(?:\.supabase\.co|mumeok\.kr|ssh:\/\/|tcp:\/\/|\/\.homecook\/releases\/)/iu.test(value);
        });
        forbiddenEnvironmentCount += forbiddenEnvironment.length;
        const forbiddenMounts = mounts.filter((mount) => {
          if (mount.Type === "volume") return !volumeNames.has(mount.Name);
          if (mount.Type !== "bind") return false;
          const source = resolve(mount.Source ?? "");
          return !source.startsWith(`${state.candidateRoot}/`)
            && source !== state.candidateRoot
            && !source.startsWith(`${state.runtimeRoot}/`)
            && source !== state.runtimeRoot;
        });
        forbiddenMountCount += forbiddenMounts.length;
        projections.push({
          container_id: entry.id,
          environment_keys: environment.map((assignment) => assignment.split("=", 1)[0]).sort(),
          mount_projection: mounts.map((mount) => ({
            type: mount.Type,
            name: mount.Name ?? "",
            destination: mount.Destination ?? "",
            read_only: mount.RW === false,
          })).sort((left, right) => left.destination.localeCompare(right.destination)),
        });
      }
      const measurement = {
        schema: "homecook.release-rehearsal-production-isolation-telemetry.v1",
        production_db_connection_count: forbiddenEnvironmentCount + forbiddenMountCount,
        production_db_write_count: forbiddenEnvironmentCount + forbiddenMountCount,
        mutation_attempt_count: state.commandTelemetry.filter((entry) => entry.production_target).length,
        forbidden_mount_count: forbiddenMountCount,
        forbidden_environment_count: forbiddenEnvironmentCount,
        observed_container_count: containers.length,
        container_policy_digest: sha256Jcs(projections),
        command_policy_digest: sha256Jcs(state.commandTelemetry),
        network_policy_digest: state.networkEvidence.default_deny_policy_digest,
        external_attempt_count: state.networkTelemetry.attempted_forbidden_endpoint_count,
        successful_egress_count: state.networkTelemetry.successful_forbidden_endpoint_count,
        docker_endpoint_identity_digest: state.dockerEndpoint.identity_digest,
        docker_daemon_identity_digest: state.daemonPre.snapshot_digest,
      };
      if (forbiddenEnvironmentCount !== 0 || forbiddenMountCount !== 0) {
        fail("production credential/socket/mount enforcement detected a forbidden surface");
      }
      return Object.freeze(measurement);
    },

    async stopRuntime(entry) {
      for (const id of entry.container_ids ?? []) {
        const resource = state.creationLedger.snapshot().find((value) => value.kind === "container" && value.id === id);
        if (!resource) continue;
        const observed = await inspectResource(state, resource, { signal: state.cleanupSignal });
        if (observed?.labels?.[RUN_OWNERSHIP_LABEL] !== state.runId || observed?.labels?.[RUN_PROJECT_LABEL] !== state.namespace.project) {
          fail("runtime stop ownership mismatch");
        }
        await dockerCommand(state, ["stop", "--time", "30", id], {
          allowFailure: true,
          signal: state.cleanupSignal,
          ownership: { verifiedOwnership: true, resourceId: id },
        });
      }
    },

    async inspectResource(entry) { return inspectResource(state, entry, { signal: state.cleanupSignal }); },
    async reinspectObserverSubjects({ signal } = {}) {
      const subjects = state.observerSubjects ?? [];
      if (subjects.length === 0) fail("observer subjects are missing");
      for (const subject of subjects) {
        const current = await readContainerObserverSubject(state, { containerId: subject.container_id, component: subject.component, signal: signal ?? state.cleanupSignal });
        if (canonicalizeJcs(current) !== canonicalizeJcs(subject)) fail("observer container subject restarted or identity drifted");
      }
      return Object.freeze(subjects.map((subject) => ({ ...subject })));
    },
    async readWorkerRehearsalRpcAuthority() {
      if (!state.worker?.rehearsalRpcExpectedAuthority) fail("worker rehearsal RPC authority is unavailable");
      const configPath = join(state.worker.workerSecretRoot, "rehearsal-rpc-config.json");
      const read = readExactPrivateRegularFile(configPath, { label: "worker rehearsal RPC config", maxBytes: 65_536, acceptedFileModes: [0o400] });
      const expected = state.worker.rehearsalRpcExpectedAuthority;
      if (sha256Bytes(read.bytes) !== expected.config_digest || sha256Jcs(read.identity) !== expected.config_file_identity_digest) fail("worker rehearsal RPC config authority drifted");
      return expected;
    },
    async removeResource(entry) {
      if (!state.creationLedger.contains(entry)) fail("cleanup target is absent from immutable creation ledger");
      await removeOwnedResource(state, entry, { signal: state.cleanupSignal });
    },
    async listResidue() {
      const discovered = await listDiscoveredResources(state, { signal: state.cleanupSignal });
      return discovered.filter((entry) => !state.creationLedger.contains(entry));
    },

    async closeSecretHandles() {
      closePortReservations(state);
      if (!state.runRoot) return;
      for (const path of [join(state.runtimeRoot, "secret-fds"), join(state.runtimeRoot, "worker-secret-fds")]) {
        if (existsSync(path)) rmSync(path, { recursive: true, force: true });
      }
      state.secrets = null;
      state.worker = null;
    },

    async countPersistentSecretFiles() {
      if (!state.runRoot) return 0;
      const secretRoots = [join(state.runtimeRoot, "secret-fds"), join(state.runtimeRoot, "worker-secret-fds")];
      return secretRoots.reduce((count, path) => count + (existsSync(path) ? readdirSync(path).length : 0), 0);
    },
  });
}
