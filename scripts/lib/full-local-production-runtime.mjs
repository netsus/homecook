import {
  createHash,
  createHmac,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
  timingSafeEqual,
} from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

export {
  buildFullLocalProductCatalogSql,
  FULL_LOCAL_REQUIRED_PRODUCT_COLUMNS,
  FULL_LOCAL_REQUIRED_PRODUCT_FUNCTIONS,
  FULL_LOCAL_REQUIRED_PRODUCT_RELATIONS,
  parseFullLocalProductCatalogSqlOutput,
} from "./full-local-product-catalog.mjs";

const IMAGE_REFERENCES = Object.freeze({
  "linux/arm64": Object.freeze({
    auth:
      "supabase/gotrue@sha256:385184459f57569c54c25209f51f3b2be99ddd7c4ce9e3555b5d3eea8447b7cf",
    kong:
      "kong/kong@sha256:6addf50e6bd8d578314cb9ce4f2d2d1e3781d2edecef59f707e00c6e05d384f5",
    node:
      "docker.io/library/node@sha256:74e144386aaec923ce092c3371b351d96c4f977a4ac3f58431fa9164b9399534",
    postgres:
      "public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a",
    postgrest:
      "postgrest/postgrest@sha256:844785450d6b046ee97f1c67ea37e3ff6b4ed7ee3570b1b91c03f66f032c4805",
    storage:
      "supabase/storage-api@sha256:9326eb9c6b74c0a5ba393ab46a08a51d16bc5ea5f2978fc5b0f17fc67c64a4de",
  }),
});

const IMAGE_CONFIG_KEYS = Object.freeze({
  auth: "FULL_LOCAL_AUTH_IMAGE",
  kong: "FULL_LOCAL_KONG_IMAGE",
  node: "FULL_LOCAL_NODE_IMAGE",
  postgres: "FULL_LOCAL_POSTGRES_IMAGE",
  postgrest: "FULL_LOCAL_POSTGREST_IMAGE",
  storage: "FULL_LOCAL_STORAGE_IMAGE",
});

const SOCIAL_ONLY_FLAGS = Object.freeze([
  "FULL_LOCAL_ENABLE_EMAIL_SIGNUP",
  "FULL_LOCAL_ENABLE_EMAIL_AUTOCONFIRM",
  "FULL_LOCAL_ENABLE_PHONE_SIGNUP",
  "FULL_LOCAL_ENABLE_ANONYMOUS_USERS",
]);

const PLACEHOLDER_PATTERN =
  /(?:change[-_ ]?me|example|placeholder|replace[-_ ]?me|test[-_ ]?only|your[-_ ]?|<[^>]+>)/iu;
const VOLUME_NAME_PATTERN = /^[a-z0-9][a-z0-9_.-]{2,127}$/u;

export const FULL_LOCAL_SECRET_NAMES = Object.freeze([
  "postgres_password",
  "jwt_secret",
  "jwt_keys",
  "jwt_jwks",
  "anon_key",
  "service_role_key",
  "publishable_key",
  "secret_key",
  "anon_key_asymmetric",
  "service_role_key_asymmetric",
  "storage_s3_access_key_id",
  "storage_s3_access_key_secret",
  "auth_flow_hmac_key",
  "session_attestation_hmac_key_v1",
  "session_generation_hmac_key_v2",
]);

export function renderFullLocalProductionConfigTemplate(template, homeDirectory) {
  return template.replaceAll(
    "/Users/REPLACE_ME",
    () => homeDirectory,
  );
}

function canonicalPath(path) {
  const suffix = [];
  let ancestor = resolve(path);
  while (!existsSync(ancestor)) {
    suffix.unshift(basename(ancestor));
    const parent = dirname(ancestor);
    if (parent === ancestor) {
      break;
    }
    ancestor = parent;
  }
  return resolve(realpathSync(ancestor), ...suffix);
}

export function validateExternalSecretDirectory({
  repositoryRoot,
  secretDirectory,
}) {
  const repository = canonicalPath(repositoryRoot);
  const target = canonicalPath(secretDirectory);
  const repositoryRelativeTarget = relative(repository, target);
  if (
    repositoryRelativeTarget === ""
    || (!repositoryRelativeTarget.startsWith("..")
      && !isAbsolute(repositoryRelativeTarget))
  ) {
    throw new Error("The full-local secret directory must stay outside the repository.");
  }
  return target;
}

export function assertSecretRotationAllowed({
  postgresVolumeExists,
  replace,
}) {
  if (replace && postgresVolumeExists) {
    throw new Error(
      "Secret replacement is blocked while the persistent PostgreSQL volume exists; use the audited live-rotation runbook.",
    );
  }
  return true;
}

export function summarizeFullLocalRuntimeStates(states) {
  const exited = states.some((state) => state?.Status === "exited");
  const healthy = states.length === 7 && states.every((state) =>
    state?.Status === "running"
    && (!state.Health || state.Health.Status === "healthy"));
  return Object.freeze({
    container_count: states.length,
    exited,
    healthy,
  });
}

/**
 * @param {{release_sha:string, release_tree:string, build_id:string, promotion_id:string, sealed_bundle_digest:string, repeatability_receipt_digest:string}} identity
 */
export function buildFullLocalReleaseContainerLabels(identity) {
  return {
    "homecook.release.sha": identity.release_sha,
    "homecook.release.tree": identity.release_tree,
    "homecook.release.build-id": identity.build_id,
    "homecook.release.promotion-id": identity.promotion_id,
    "homecook.release.sealed-bundle-digest": identity.sealed_bundle_digest,
    "homecook.release.repeatability-receipt-digest": identity.repeatability_receipt_digest,
  };
}

/**
 * @param {Array<Record<string, any>>} containers
 * @param {{expected?: {release_sha:string, release_tree:string, build_id:string, promotion_id:string} | null, allowLegacyBootstrap?: boolean}} [options]
 */
export function readFullLocalReleaseIdentityFromContainers(
  containers,
  { expected = null, expectedServices = null, allowLegacyBootstrap = false } = {},
) {
  const serviceSet = expectedServices === null ? null : new Set(expectedServices);
  const expectedContainerCount = serviceSet?.size ?? 7;
  if (!Array.isArray(containers) || containers.length !== expectedContainerCount) {
    throw new Error(
      `Full-local release identity requires exactly ${expectedContainerCount} containers.`,
    );
  }
  if (serviceSet) {
    const observedServices = containers.map((container) =>
      container?.Config?.Labels?.["com.docker.compose.service"]);
    if (
      observedServices.some((service) => !serviceSet.has(service))
      || new Set(observedServices).size !== serviceSet.size
    ) {
      throw new Error("Full-local containers do not match the authoritative Compose service set.");
    }
  }
  const labelNames = [
    "homecook.release.sha",
    "homecook.release.tree",
    "homecook.release.build-id",
    "homecook.release.promotion-id",
    "homecook.release.sealed-bundle-digest",
    "homecook.release.repeatability-receipt-digest",
  ];
  const presentCount = containers.reduce((count, container) =>
    count + labelNames.filter((name) =>
      typeof container?.Config?.Labels?.[name] === "string").length, 0);
  if (presentCount === 0) {
    if (
      allowLegacyBootstrap
      && expected?.release_sha === "e02f02a87d1d955dc598728e7029a745a650a5c3"
    ) {
      return Object.freeze({
        ...expected,
        legacy_bootstrap: true,
        legacy_bootstrap_contract: "e02f-full-local-v1",
      });
    }
    throw new Error("Unlabeled full-local workload is not an approved legacy bootstrap.");
  }
  if (presentCount !== containers.length * labelNames.length) {
    throw new Error("Full-local containers report partial release labels.");
  }
  const identities = containers.map((container, index) => {
    const labels = container?.Config?.Labels;
    const identity = {
      release_sha: labels?.["homecook.release.sha"],
      release_tree: labels?.["homecook.release.tree"],
      build_id: labels?.["homecook.release.build-id"],
      promotion_id: labels?.["homecook.release.promotion-id"],
      sealed_bundle_digest: labels?.["homecook.release.sealed-bundle-digest"],
      repeatability_receipt_digest: labels?.["homecook.release.repeatability-receipt-digest"],
    };
    if (
      !/^[0-9a-f]{40}$/u.test(identity.release_sha ?? "")
      || !/^[0-9a-f]{40}$/u.test(identity.release_tree ?? "")
      || typeof identity.build_id !== "string"
      || identity.build_id.length === 0
      || typeof identity.promotion_id !== "string"
      || identity.promotion_id.length === 0
      || !/^[0-9a-f]{64}$/u.test(identity.sealed_bundle_digest ?? "")
      || !/^[0-9a-f]{64}$/u.test(identity.repeatability_receipt_digest ?? "")
    ) {
      throw new Error(`Full-local container ${index} release labels are missing or invalid.`);
    }
    return identity;
  });
  const [identity] = identities;
  if (identities.some((candidate) =>
    JSON.stringify(candidate) !== JSON.stringify(identity))) {
    throw new Error("Full-local containers report mixed release identities.");
  }
  if (expected && JSON.stringify(identity) !== JSON.stringify(expected)) {
    throw new Error("Full-local Docker release identity mismatch.");
  }
  return Object.freeze(identity);
}

const FULL_LOCAL_WRITER_SERVICES = Object.freeze([
  "api-gateway",
  "auth",
  "postgrest",
  "realtime",
  "storage",
]);

function runningWriterServices(containers, composeProject) {
  return new Set(containers
    .filter((container) =>
      container?.State?.Running === true
      && container?.Config?.Labels?.["com.docker.compose.project"] === composeProject
      && FULL_LOCAL_WRITER_SERVICES.includes(
        container?.Config?.Labels?.["com.docker.compose.service"],
      ))
    .map((container) =>
      container.Config.Labels["com.docker.compose.service"]));
}

export function selectNewlyStartedFullLocalWriterServices({
  after,
  before,
  composeProject,
}) {
  const beforeServices = runningWriterServices(before, composeProject);
  const afterServices = runningWriterServices(after, composeProject);
  return FULL_LOCAL_WRITER_SERVICES.filter((service) =>
    afterServices.has(service) && !beforeServices.has(service));
}

export function parseFullLocalComposeServiceNames(output) {
  const services = String(output)
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    services.length === 0
    || services.some((service) => !/^[a-z0-9][a-z0-9-]*$/u.test(service))
    || new Set(services).size !== services.length
  ) {
    throw new Error("Full-local Compose service inventory is invalid.");
  }
  return Object.freeze([...services].sort());
}

export function selectFullLocalResumeCleanupContainers({
  after,
  before,
  composeProject,
  expectedServices,
}) {
  const expectedServiceSet = new Set(expectedServices);
  if (expectedServiceSet.size === 0) {
    throw new Error("Full-local resume cleanup requires authoritative Compose services.");
  }
  const scoped = (containers) => containers.filter((container) =>
    typeof container?.Id === "string"
    && container.Id.length > 0
    && container?.Config?.Labels?.["com.docker.compose.project"] === composeProject
    && expectedServiceSet.has(
      container?.Config?.Labels?.["com.docker.compose.service"],
    ));
  const beforeById = new Map(scoped(before).map((container) => [container.Id, container]));
  const afterScoped = scoped(after);
  const removeIds = afterScoped
    .filter((container) => !beforeById.has(container.Id))
    .map((container) => container.Id)
    .sort();
  const stopIds = afterScoped
    .filter((container) => {
      const previous = beforeById.get(container.Id);
      return !previous || (
        previous.State?.Running !== true
        && container.State?.Running === true
      );
    })
    .map((container) => container.Id)
    .sort();
  return Object.freeze({
    removeIds: Object.freeze(removeIds),
    stopIds: Object.freeze(stopIds),
  });
}

export function collectFullLocalResumeSecretEvidence({
  coreSecrets,
  directory,
  expectedUid,
  oauthEnabled = false,
  oauthSecrets = {},
}) {
  const normalizedDirectory = resolve(directory);
  const directoryStat = lstatSync(normalizedDirectory);
  if (
    directoryStat.isSymbolicLink()
    || !directoryStat.isDirectory()
    || directoryStat.uid !== expectedUid
    || (directoryStat.mode & 0o777) !== 0o700
  ) {
    throw new Error("Full-local resume secret directory owner, mode, or type is unsafe.");
  }
  const expected = {
    ...Object.fromEntries(FULL_LOCAL_SECRET_NAMES.map((name) => [name, coreSecrets?.[name]])),
    ...(oauthEnabled ? oauthSecrets : {}),
  };
  const expectedNames = Object.keys(expected).sort();
  const actualNames = readdirSync(normalizedDirectory).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error("Full-local resume secret files are missing or unexpected.");
  }
  const evidence = expectedNames.map((name) => {
    const path = join(normalizedDirectory, name);
    const stat = lstatSync(path);
    if (
      stat.isSymbolicLink()
      || !stat.isFile()
      || stat.uid !== expectedUid
      || (stat.mode & 0o777) !== 0o600
    ) {
      throw new Error(`Full-local resume secret ${name} owner, mode, or type is unsafe.`);
    }
    const bytes = readFileSync(path);
    if (bytes.toString("utf8") !== expected[name]) {
      throw new Error(`Full-local resume secret ${name} does not match Keychain authority.`);
    }
    return Object.freeze({
      dev: stat.dev,
      digest: createHash("sha256").update(bytes).digest("hex"),
      ino: stat.ino,
      name,
      path,
    });
  });
  return Object.freeze(evidence);
}

function requiredValue(record, name) {
  const value = record?.[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function exactMode(actual, expected, label) {
  if ((Number(actual) & 0o777) !== expected) {
    throw new Error(`${label} must use mode 0${expected.toString(8)}.`);
  }
}

function exactHttpsUrl(value, { path = "/", label }) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an exact HTTPS URL.`);
  }
  if (
    url.protocol !== "https:"
    || url.pathname !== path
    || url.search.length > 0
    || url.hash.length > 0
    || url.username.length > 0
    || url.password.length > 0
  ) {
    throw new Error(`${label} must be an exact HTTPS URL with path ${path}.`);
  }
  return url;
}

function validateSecretValues(secrets) {
  const values = new Map();
  for (const name of FULL_LOCAL_SECRET_NAMES) {
    const value = requiredValue(secrets, name);
    if (PLACEHOLDER_PATTERN.test(value)) {
      throw new Error(`${name} contains placeholder secret material.`);
    }
    if (name === "jwt_keys" || name === "jwt_jwks") {
      let parsed;
      try {
        parsed = JSON.parse(value);
      } catch {
        throw new Error(`${name} must contain valid JSON secret material.`);
      }
      const keys = Array.isArray(parsed) ? parsed : parsed?.keys;
      if (!Array.isArray(keys) || keys.length === 0) {
        throw new Error(`${name} must contain at least one key.`);
      }
      continue;
    }
    if (Buffer.byteLength(value, "utf8") < 32) {
      throw new Error(`${name} secret must contain at least 32 bytes.`);
    }
    const reusedBy = values.get(value);
    if (reusedBy) {
      throw new Error(`${name} secret must be unique; it reuses ${reusedBy}.`);
    }
    values.set(value, name);
  }
  return FULL_LOCAL_SECRET_NAMES.length;
}

export function fullLocalImageRefsForPlatform(platform) {
  const references = IMAGE_REFERENCES[platform];
  if (!references) {
    throw new Error(`Unsupported full-local Docker platform: ${platform}.`);
  }
  return references;
}

function encodedJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signedJwt({ algorithm, key, kid, payload }) {
  const header = encodedJson({ alg: algorithm, ...(kid ? { kid } : {}), typ: "JWT" });
  const body = encodedJson(payload);
  const signingInput = `${header}.${body}`;
  const signature = algorithm === "ES256"
    ? sign("SHA256", Buffer.from(signingInput), {
        dsaEncoding: "ieee-p1363",
        key,
      }).toString("base64url")
    : createHmac("sha256", key).update(signingInput, "utf8").digest("base64url");
  return `${signingInput}.${signature}`;
}

function opaqueApiKey(prefix) {
  const projectRef = "supabase-self-hosted";
  const random = randomBytes(17).toString("base64url").slice(0, 22);
  const intermediate = `${prefix}${random}`;
  const checksum = createHash("sha256")
    .update(`${projectRef}|${intermediate}`, "utf8")
    .digest("base64url")
    .slice(0, 8);
  return `${intermediate}_${checksum}`;
}

export function generateFullLocalSecretBundle() {
  const jwtSecret = randomBytes(48).toString("base64url");
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const privateJwk = privateKey.export({ format: "jwk" });
  const kid = randomUUID();
  const privateSigningKey = {
    alg: "ES256",
    crv: privateJwk.crv,
    d: privateJwk.d,
    ext: true,
    key_ops: ["sign", "verify"],
    kid,
    kty: "EC",
    use: "sig",
    x: privateJwk.x,
    y: privateJwk.y,
  };
  const publicVerifyKey = {
    alg: "ES256",
    crv: privateJwk.crv,
    ext: true,
    key_ops: ["verify"],
    kid,
    kty: "EC",
    use: "sig",
    x: privateJwk.x,
    y: privateJwk.y,
  };
  const symmetricKey = {
    alg: "HS256",
    k: Buffer.from(jwtSecret, "utf8").toString("base64url"),
    kty: "oct",
  };
  const issuedAt = Math.floor(Date.now() / 1_000);
  const expiresAt = issuedAt + 5 * 365 * 24 * 60 * 60;
  const payload = (role) => ({
    exp: expiresAt,
    iat: issuedAt,
    iss: "supabase",
    role,
  });
  const databaseCredential = [
    "postgres",
    randomBytes(32).toString("base64url"),
  ].join("-");

  return Object.freeze({
    postgres_password: databaseCredential,
    jwt_secret: jwtSecret,
    jwt_keys: JSON.stringify([privateSigningKey, symmetricKey]),
    jwt_jwks: JSON.stringify({ keys: [publicVerifyKey, symmetricKey] }),
    anon_key: signedJwt({
      algorithm: "HS256",
      key: jwtSecret,
      payload: payload("anon"),
    }),
    service_role_key: signedJwt({
      algorithm: "HS256",
      key: jwtSecret,
      payload: payload("service_role"),
    }),
    publishable_key: opaqueApiKey("sb_publishable_"),
    secret_key: opaqueApiKey("sb_secret_"),
    anon_key_asymmetric: signedJwt({
      algorithm: "ES256",
      key: privateKey,
      kid,
      payload: payload("anon"),
    }),
    service_role_key_asymmetric: signedJwt({
      algorithm: "ES256",
      key: privateKey,
      kid,
      payload: payload("service_role"),
    }),
    storage_s3_access_key_id: randomBytes(16).toString("hex"),
    storage_s3_access_key_secret: randomBytes(32).toString("hex"),
    auth_flow_hmac_key: randomBytes(32).toString("hex"),
    session_attestation_hmac_key_v1: randomBytes(32).toString("hex"),
    session_generation_hmac_key_v2: randomBytes(32).toString("hex"),
  });
}

function publishedPorts(service) {
  return Array.isArray(service?.ports) ? service.ports : [];
}

function portHostIp(port) {
  if (typeof port === "string") {
    return port.split(":").length === 3 ? port.split(":")[0] : "";
  }
  return String(port?.host_ip ?? port?.hostIp ?? "");
}

export function assertFullLocalComposeModel(model) {
  const services = model?.services;
  if (!services || typeof services !== "object") {
    throw new Error("Full-local production Compose model has no services.");
  }
  const requiredServices = [
    "postgres",
    "auth",
    "postgrest",
    "storage",
    "api-gateway",
    "auth-proxy",
  ];
  for (const serviceName of requiredServices) {
    if (!services[serviceName]) {
      throw new Error(`Full-local Compose is missing ${serviceName}.`);
    }
  }
  for (const [serviceName, service] of Object.entries(services)) {
    const ports = publishedPorts(service);
    if (!["api-gateway", "auth-proxy"].includes(serviceName) && ports.length > 0) {
      throw new Error(`A raw service must not publish ports: ${serviceName}.`);
    }
    for (const port of ports) {
      if (portHostIp(port) !== "127.0.0.1") {
        throw new Error(`${serviceName} publication must be loopback-only.`);
      }
    }
    if (JSON.stringify(service?.volumes ?? []).includes("/var/run/docker.sock")) {
      throw new Error("Full-local Compose must not mount the Docker socket.");
    }
  }
  if (publishedPorts(services["api-gateway"]).length !== 1) {
    throw new Error("The internal API gateway must publish one loopback port.");
  }
  if (publishedPorts(services["auth-proxy"]).length !== 1) {
    throw new Error("The Auth proxy must publish one loopback port.");
  }
  return true;
}

export function validateLoopbackS3Endpoint(value, expectedPort) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("The internal S3 endpoint must be a loopback URL.");
  }
  if (
    url.protocol !== "http:"
    || url.hostname !== "127.0.0.1"
    || Number(url.port) !== expectedPort
    || url.pathname !== "/storage/v1/s3"
    || url.search.length > 0
    || url.hash.length > 0
  ) {
    throw new Error(
      "The internal S3 endpoint must use the exact loopback /storage/v1/s3 URL.",
    );
  }
  return url.href;
}

function validateInternalGateway(value, expectedPort) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("The internal gateway must be a loopback URL.");
  }
  if (
    url.protocol !== "http:"
    || url.hostname !== "127.0.0.1"
    || Number(url.port) !== expectedPort
    || url.pathname !== "/"
    || url.search.length > 0
    || url.hash.length > 0
  ) {
    throw new Error("The internal gateway must use its exact loopback URL.");
  }
  return url;
}

function parsePort(config, name) {
  const value = Number(requiredValue(config, name));
  if (!Number.isSafeInteger(value) || value < 1024 || value > 65535) {
    throw new Error(`${name} must be a valid unprivileged TCP port.`);
  }
  return value;
}

export function validateFullLocalProductionConfig({
  config,
  configFileMode,
  secretDirectoryMode,
  secrets,
}) {
  exactMode(configFileMode, 0o600, "Full-local config file");
  exactMode(secretDirectoryMode, 0o700, "Full-local secret directory");

  const dockerPlatform = requiredValue(config, "FULL_LOCAL_DOCKER_PLATFORM");
  const images = fullLocalImageRefsForPlatform(dockerPlatform);
  for (const [name, expected] of Object.entries(images)) {
    if (requiredValue(config, IMAGE_CONFIG_KEYS[name]) !== expected) {
      throw new Error(`${IMAGE_CONFIG_KEYS[name]} must use the reviewed RepoDigest.`);
    }
  }

  const internalGatewayPort = parsePort(
    config,
    "FULL_LOCAL_INTERNAL_GATEWAY_PORT",
  );
  const authProxyPort = parsePort(config, "FULL_LOCAL_AUTH_PROXY_PORT");
  if (internalGatewayPort === authProxyPort) {
    throw new Error("The internal gateway and Auth proxy ports must be distinct.");
  }

  const publicAuth = exactHttpsUrl(
    requiredValue(config, "FULL_LOCAL_PUBLIC_AUTH_URL"),
    { label: "Public Auth URL" },
  );
  const apiExternal = exactHttpsUrl(
    requiredValue(config, "FULL_LOCAL_API_EXTERNAL_URL"),
    { label: "Auth API external URL", path: "/auth/v1" },
  );
  if (apiExternal.origin !== publicAuth.origin) {
    throw new Error("Public Auth and /auth/v1 URLs must use one HTTPS origin.");
  }
  const site = exactHttpsUrl(requiredValue(config, "FULL_LOCAL_SITE_URL"), {
    label: "Application site URL",
  });
  const expectedRedirects = [
    `${site.origin}/auth/callback`,
    `${site.origin}/auth/link/callback`,
  ];
  const redirects = requiredValue(
    config,
    "FULL_LOCAL_ADDITIONAL_REDIRECT_URLS",
  ).split(",").map((value) => value.trim()).filter(Boolean);
  if (
    redirects.length !== expectedRedirects.length
    || redirects.some((value, index) => value !== expectedRedirects[index])
  ) {
    throw new Error("Additional redirect URLs must match the exact HTTPS app callbacks.");
  }

  validateInternalGateway(
    requiredValue(config, "FULL_LOCAL_INTERNAL_GATEWAY_URL"),
    internalGatewayPort,
  );
  validateLoopbackS3Endpoint(
    requiredValue(config, "FULL_LOCAL_INTERNAL_S3_URL"),
    internalGatewayPort,
  );
  for (const name of SOCIAL_ONLY_FLAGS) {
    if (requiredValue(config, name) !== "false") {
      throw new Error(`${name} must stay disabled for social-only Auth.`);
    }
  }
  for (const name of [
    "FULL_LOCAL_COMPOSE_PROJECT_NAME",
    "FULL_LOCAL_POSTGRES_VOLUME_NAME",
    "FULL_LOCAL_STORAGE_VOLUME_NAME",
  ]) {
    if (!VOLUME_NAME_PATTERN.test(requiredValue(config, name))) {
      throw new Error(`${name} is not a safe Docker resource name.`);
    }
  }
  const readinessPath = requiredValue(config, "FULL_LOCAL_BACKUP_READINESS_PATH");
  if (!isAbsolute(readinessPath) || !readinessPath.endsWith(".json")) {
    throw new Error("FULL_LOCAL_BACKUP_READINESS_PATH must be an absolute JSON path.");
  }

  const secretCount = validateSecretValues(secrets);
  return Object.freeze({
    authProxyPort,
    dockerPlatform,
    internalGatewayPort,
    publicAuthOrigin: publicAuth.origin,
    secretCount,
  });
}

export function materializeSecretFilesCreateOnly({
  names,
  allowedNames = names,
  readSecret,
  targetDirectory,
}) {
  if (typeof readSecret !== "function") {
    throw new Error("A Keychain secret reader is required.");
  }
  if (!Array.isArray(names) || names.length === 0) {
    throw new Error("At least one secret name is required.");
  }
  if (!Array.isArray(allowedNames) || allowedNames.length < names.length) {
    throw new Error("Allowed secret names must include every materialized secret.");
  }
  mkdirSync(targetDirectory, { mode: 0o700, recursive: true });
  chmodSync(targetDirectory, 0o700);
  const allowedNameSet = new Set(allowedNames);
  if (readdirSync(targetDirectory).some((name) => !allowedNameSet.has(name))) {
    throw new Error("The full-local secret directory has missing or unexpected files.");
  }
  const missingSecrets = [];
  for (const name of names) {
    const value = readSecret(name);
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Keychain secret ${name} is missing.`);
    }
    const path = join(targetDirectory, name);
    if (!existsSync(path)) {
      missingSecrets.push({ name, path, value });
      continue;
    }
    const fileStat = lstatSync(path);
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
      throw new Error(`Existing secret ${name} must be a regular file.`);
    }
    exactMode(fileStat.mode, 0o600, `Existing secret ${name}`);
    const existing = Buffer.from(readFileSync(path));
    const expected = Buffer.from(value, "utf8");
    if (
      existing.length !== expected.length
      || !timingSafeEqual(existing, expected)
    ) {
      throw new Error(`Existing secret ${name} does not match Keychain.`);
    }
  }
  for (const { path, value } of missingSecrets) {
    writeFileSync(path, value, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    chmodSync(path, 0o600);
  }
  return names.length;
}

export function materializeFullLocalSecrets({
  additionalExpectedNames = [],
  readSecret,
  targetDirectory,
}) {
  materializeSecretFilesCreateOnly({
    allowedNames: [...FULL_LOCAL_SECRET_NAMES, ...additionalExpectedNames],
    names: FULL_LOCAL_SECRET_NAMES,
    readSecret,
    targetDirectory,
  });
  validateFullLocalSecretFiles({
    directory: targetDirectory,
    expectedNames: [...FULL_LOCAL_SECRET_NAMES, ...additionalExpectedNames],
  });
  return Object.freeze({ secretCount: FULL_LOCAL_SECRET_NAMES.length });
}

export function materializeFullLocalRuntimeSecrets({
  coreSecrets,
  oauthSecrets = {},
  targetDirectory,
}) {
  const oauthNames = Object.keys(oauthSecrets);
  const names = [...FULL_LOCAL_SECRET_NAMES, ...oauthNames];
  if (new Set(names).size !== names.length) {
    throw new Error("Core and OAuth secret names must not overlap.");
  }
  materializeSecretFilesCreateOnly({
    names,
    readSecret: (name) =>
      Object.hasOwn(oauthSecrets, name) ? oauthSecrets[name] : coreSecrets?.[name],
    targetDirectory,
  });
  validateFullLocalSecretFiles({ directory: targetDirectory, expectedNames: names });
  return Object.freeze({
    coreSecretCount: FULL_LOCAL_SECRET_NAMES.length,
    oauthSecretCount: oauthNames.length,
  });
}

export function validateFullLocalSecretFiles({ directory, expectedNames }) {
  exactMode(statSync(directory).mode, 0o700, "Full-local secret directory");
  const actualNames = readdirSync(directory).sort();
  const requiredNames = [...expectedNames].sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(requiredNames)) {
    throw new Error("The full-local secret directory has missing or unexpected files.");
  }
  for (const name of requiredNames) {
    const path = join(directory, name);
    const stat = statSync(path);
    if (!stat.isFile()) {
      throw new Error(`${name} must be a regular secret file.`);
    }
    exactMode(stat.mode, 0o600, `Secret file ${name}`);
    if (readFileSync(path, "utf8").length === 0) {
      throw new Error(`Secret file ${name} must not be empty.`);
    }
  }
  return true;
}

export function assertNoSecretLeakage({ artifacts, secrets }) {
  for (const secret of secrets) {
    if (typeof secret !== "string" || secret.length === 0) {
      continue;
    }
    const representations = new Set([
      secret,
      Buffer.from(secret, "utf8").toString("base64"),
      encodeURIComponent(secret),
    ]);
    for (const artifact of artifacts) {
      const text = String(artifact);
      if ([...representations].some((value) => text.includes(value))) {
        throw new Error("Secret leakage detected in a runtime artifact.");
      }
    }
  }
  return true;
}
