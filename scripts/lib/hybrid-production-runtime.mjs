import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

const GIB = 1024 ** 3;
const SUPPORTED_DOCKER_PLATFORMS = new Set([
  "linux/amd64",
  "linux/arm64",
]);
const CAPACITY_SERVICES = Object.freeze([
  "gateway",
  "postgres",
  "postgrest",
  "storage",
]);
const RESTORE_PHASES = Object.freeze([
  "pre-data-schema",
  "hybrid-compatibility-fk-replacement",
  "application-data",
  "post-data-validation",
]);
const AUTHORITY_MODES = new Set(["remote", "local-shadow", "local"]);
const PLACEHOLDER_PATTERN =
  /(?:change[-_ ]?me|example|placeholder|replace[-_ ]?me|test[-_ ]?only|your[-_ ]?|<[^>]+>)/iu;
const VOLUME_NAME_PATTERN = /^[a-z0-9][a-z0-9_.-]{2,127}$/u;
const LEGACY_AUTH_FK_NAMES = Object.freeze([
  "admin_members_user_id_fkey",
  "admin_members_granted_by_fkey",
  "admin_audit_logs_actor_admin_user_id_fkey",
]);
const SECRET_RULES = Object.freeze({
  AUTH_SUPABASE_PUBLISHABLE_KEY: 32,
  DATA_SUPABASE_PUBLISHABLE_KEY: 32,
  DATA_SUPABASE_SECRET_KEY: 32,
  HOMECOOK_SESSION_ATTESTATION_HMAC_KEY_V1: 32,
  HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1: 32,
  HYBRID_COMBINED_JWKS: 32,
  HYBRID_POSTGRES_PASSWORD: 32,
  HYBRID_STORAGE_LEGACY_JWT_SECRET: 32,
});

function requiredValue(record, name) {
  const value = record?.[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value.trim();
}

function exactRemoteAuthConfig(config) {
  const authUrl = new URL(requiredValue(config, "AUTH_SUPABASE_URL"));
  const issuer = new URL(
    requiredValue(config, "AUTH_SUPABASE_EXPECTED_ISSUER"),
  );
  const jwks = new URL(requiredValue(config, "AUTH_SUPABASE_JWKS_URL"));

  if (
    authUrl.protocol !== "https:"
    || authUrl.pathname !== "/"
    || authUrl.search
    || authUrl.hash
    || issuer.origin !== authUrl.origin
    || issuer.pathname !== "/auth/v1"
    || issuer.search
    || issuer.hash
    || jwks.origin !== authUrl.origin
    || jwks.pathname !== "/auth/v1/.well-known/jwks.json"
    || jwks.search
    || jwks.hash
  ) {
    throw new Error(
      "Remote Auth URL, issuer, and JWKS URL must use one exact HTTPS origin.",
    );
  }
}

function validateCombinedJwks(value, legacySecret) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("HYBRID_COMBINED_JWKS must be valid JSON.");
  }
  if (
    !parsed
    || typeof parsed !== "object"
    || !Array.isArray(parsed.keys)
    || parsed.keys.length === 0
  ) {
    throw new Error("HYBRID_COMBINED_JWKS must contain at least one key.");
  }
  const keyIds = new Set();
  let remoteVerifyKeyCount = 0;
  let matchingLocalHmacKeyCount = 0;
  for (const key of parsed.keys) {
    if (
      !key
      || typeof key !== "object"
      || typeof key.kid !== "string"
      || key.kid.length === 0
      || keyIds.has(key.kid)
      || key.d !== undefined
      || (key.use !== undefined && key.use !== "sig")
    ) {
      throw new Error(
        "HYBRID_COMBINED_JWKS must contain unique verify keys.",
      );
    }
    if (
      (
        key.kty === "EC"
        && key.alg === "ES256"
        && key.crv === "P-256"
        && typeof key.x === "string"
        && key.x.length > 0
        && typeof key.y === "string"
        && key.y.length > 0
      )
      || (
        key.kty === "RSA"
        && key.alg === "RS256"
        && typeof key.n === "string"
        && key.n.length > 0
        && typeof key.e === "string"
        && key.e.length > 0
      )
    ) {
      remoteVerifyKeyCount += 1;
    } else if (
      key.kty === "oct"
      && key.alg === "HS256"
      && typeof key.k === "string"
      && key.k === Buffer.from(legacySecret, "utf8").toString("base64url")
    ) {
      matchingLocalHmacKeyCount += 1;
    } else {
      throw new Error(
        "HYBRID_COMBINED_JWKS contains an unsupported or mismatched key.",
      );
    }
    keyIds.add(key.kid);
  }
  if (remoteVerifyKeyCount === 0 || matchingLocalHmacKeyCount !== 1) {
    throw new Error(
      "HYBRID_COMBINED_JWKS requires remote public keys and one matching local HS256 key.",
    );
  }
}

function decodeJwtPart(value, label) {
  try {
    const decoded = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
      throw new Error();
    }
    return decoded;
  } catch {
    throw new Error(`${label} JWT is malformed.`);
  }
}

function validateLegacyJwt(value, expectedRole, legacySecret, label) {
  const parts = value.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    throw new Error(`${label} must be a valid local legacy JWT.`);
  }
  const header = decodeJwtPart(parts[0], label);
  const payload = decodeJwtPart(parts[1], label);
  if (header.alg !== "HS256" || header.typ !== "JWT") {
    throw new Error(`${label} JWT must use HS256.`);
  }
  const expectedSignature = createHmac("sha256", legacySecret)
    .update(`${parts[0]}.${parts[1]}`, "utf8")
    .digest();
  let actualSignature;
  try {
    actualSignature = Buffer.from(parts[2], "base64url");
  } catch {
    throw new Error(`${label} JWT signature is malformed.`);
  }
  if (
    actualSignature.length !== expectedSignature.length
    || !timingSafeEqual(actualSignature, expectedSignature)
  ) {
    throw new Error(`${label} JWT signature does not match the local secret.`);
  }
  const now = Math.floor(Date.now() / 1_000);
  if (
    payload.aud !== "authenticated"
    || payload.role !== expectedRole
    || typeof payload.iss !== "string"
    || payload.iss.length === 0
    || !Number.isSafeInteger(payload.iat)
    || !Number.isSafeInteger(payload.exp)
    || payload.iat > now + 60
    || payload.exp <= now
    || payload.iat >= payload.exp
  ) {
    throw new Error(
      `${label} JWT must contain the authenticated audience, ${expectedRole} role, and valid time claims.`,
    );
  }
}

export function validateHybridProductionConfig({
  config,
  secrets,
  configFileMode,
}) {
  if ((Number(configFileMode) & 0o777) !== 0o600) {
    throw new Error("Hybrid production config file mode must be exactly 0600.");
  }
  exactRemoteAuthConfig(config);
  const dockerPlatform = requiredValue(
    config,
    "HYBRID_DOCKER_PLATFORM",
  );
  if (!SUPPORTED_DOCKER_PLATFORMS.has(dockerPlatform)) {
    throw new Error(
      "HYBRID_DOCKER_PLATFORM must be linux/arm64 or linux/amd64.",
    );
  }

  const authority = requiredValue(config, "HOMECOOK_DATA_AUTHORITY");
  if (!AUTHORITY_MODES.has(authority)) {
    throw new Error(
      "HOMECOOK_DATA_AUTHORITY must be remote, local-shadow, or local.",
    );
  }
  const gatewayPort = Number(
    requiredValue(config, "HOMECOOK_HYBRID_GATEWAY_PORT"),
  );
  if (
    !Number.isInteger(gatewayPort)
    || gatewayPort < 1024
    || gatewayPort > 65_535
    || gatewayPort === 3100
  ) {
    throw new Error(
      "HOMECOOK_HYBRID_GATEWAY_PORT must be a non-3100 user port.",
    );
  }
  const secretSource = requiredValue(
    config,
    "HOMECOOK_HYBRID_SECRET_SOURCE",
  );
  if (!["keychain", "process-env"].includes(secretSource)) {
    throw new Error(
      "HOMECOOK_HYBRID_SECRET_SOURCE must be keychain or process-env.",
    );
  }
  requiredValue(config, "HOMECOOK_HYBRID_BACKUP_KEY_ID");

  for (const volumeKey of [
    "HYBRID_POSTGRES_VOLUME_NAME",
    "HYBRID_STORAGE_VOLUME_NAME",
  ]) {
    if (!VOLUME_NAME_PATTERN.test(requiredValue(config, volumeKey))) {
      throw new Error(`${volumeKey} is not a safe Docker volume name.`);
    }
  }

  const normalizedSecrets = [];
  for (const [name, minimumLength] of Object.entries(SECRET_RULES)) {
    const value = requiredValue(secrets, name);
    if (
      Buffer.byteLength(value, "utf8") < minimumLength
      || PLACEHOLDER_PATTERN.test(value)
    ) {
      throw new Error(`${name} is too short or contains a placeholder.`);
    }
    normalizedSecrets.push([name, value]);
  }
  const legacySecret = requiredValue(
    secrets,
    "HYBRID_STORAGE_LEGACY_JWT_SECRET",
  );
  if (
    !/^[A-Za-z0-9._~-]+$/u.test(
      requiredValue(secrets, "HYBRID_POSTGRES_PASSWORD"),
    )
  ) {
    throw new Error(
      "HYBRID_POSTGRES_PASSWORD must contain only URI-safe unreserved characters.",
    );
  }
  validateLegacyJwt(
    requiredValue(secrets, "DATA_SUPABASE_PUBLISHABLE_KEY"),
    "anon",
    legacySecret,
    "DATA_SUPABASE_PUBLISHABLE_KEY",
  );
  validateLegacyJwt(
    requiredValue(secrets, "DATA_SUPABASE_SECRET_KEY"),
    "service_role",
    legacySecret,
    "DATA_SUPABASE_SECRET_KEY",
  );
  validateCombinedJwks(
    requiredValue(secrets, "HYBRID_COMBINED_JWKS"),
    legacySecret,
  );

  const exactSecretValues = new Map();
  for (const [name, value] of normalizedSecrets) {
    if (name === "HYBRID_COMBINED_JWKS") {
      continue;
    }
    const previous = exactSecretValues.get(value);
    if (previous) {
      throw new Error(`${name} must not reuse the ${previous} value.`);
    }
    exactSecretValues.set(value, name);
  }

  return Object.freeze({
    authority,
    dockerPlatform,
    gatewayPort,
    secretCount: normalizedSecrets.length,
    secretSource,
  });
}

export function assertDockerEnginePlatform({
  configuredPlatform,
  engineArchitecture,
  engineOs,
}) {
  const architecture = String(engineArchitecture).trim().toLowerCase();
  const os = String(engineOs).trim().toLowerCase();
  const normalizedArchitecture = ["aarch64", "arm64"].includes(architecture)
    ? "arm64"
    : ["amd64", "x86_64"].includes(architecture)
      ? "amd64"
      : null;
  if (!normalizedArchitecture || os !== "linux") {
    throw new Error(
      `Unsupported Docker engine platform: ${os}/${architecture}.`,
    );
  }
  const nativePlatform = `${os}/${normalizedArchitecture}`;
  if (configuredPlatform !== nativePlatform) {
    throw new Error(
      `HYBRID_DOCKER_PLATFORM must match the native Docker engine platform ${nativePlatform}.`,
    );
  }
  return nativePlatform;
}

function publishedPorts(service) {
  return Array.isArray(service?.ports) ? service.ports : [];
}

function portHostIp(port) {
  return String(port?.host_ip ?? port?.hostIp ?? port?.host_ip_address ?? "");
}

export function assertProductionComposeModel(model) {
  const services = model?.services;
  if (!services || typeof services !== "object") {
    throw new Error("Production Compose model has no services.");
  }
  for (const requiredService of [
    "postgres",
    "postgrest",
    "storage",
    "gateway",
  ]) {
    if (!services[requiredService]) {
      throw new Error(`Production Compose is missing ${requiredService}.`);
    }
  }
  if (services["auth-stub"]) {
    throw new Error("Production Compose must not include auth-stub.");
  }

  for (const [serviceName, service] of Object.entries(services)) {
    const ports = publishedPorts(service);
    if (serviceName !== "gateway" && ports.length > 0) {
      throw new Error(
        `Only the loopback gateway may publish ports; found ${serviceName}.`,
      );
    }
    for (const port of ports) {
      if (portHostIp(port) !== "127.0.0.1") {
        throw new Error("Production gateway publication must be loopback-only.");
      }
    }
    const volumes = Array.isArray(service?.volumes) ? service.volumes : [];
    if (
      volumes.some((volume) =>
        JSON.stringify(volume).includes("/var/run/docker.sock"),
      )
    ) {
      throw new Error("Production Compose must not mount the Docker socket.");
    }
  }
  if (publishedPorts(services.gateway).length !== 1) {
    throw new Error("Production gateway must publish exactly one loopback port.");
  }
  return true;
}

export function assertRestoreAllowed({
  destructive,
  preRestoreBackupPath,
  preRestoreBackupVerified,
}) {
  if (destructive !== true) {
    throw new Error("Restore requires the explicit --destructive flag.");
  }
  if (
    typeof preRestoreBackupPath !== "string"
    || preRestoreBackupPath.length === 0
    || preRestoreBackupVerified !== true
  ) {
    throw new Error("Restore requires a verified pre-restore backup.");
  }
  return true;
}

/**
 * @param {{
 *   exactEntries?: string[];
 *   names: string;
 *   verbose: string;
 * }} archive
 */
export function assertSafeTarArchive({
  exactEntries = null,
  names,
  verbose,
}) {
  if (typeof names !== "string" || typeof verbose !== "string") {
    throw new Error("Tar archive listings must be text.");
  }
  const entries = names.split(/\r?\n/u).filter(Boolean);
  if (entries.length === 0) {
    throw new Error("Tar archive must not be empty.");
  }
  for (const entry of entries) {
    const normalized = entry.replace(/^\.\//u, "");
    if (
      normalized.startsWith("/")
      || normalized.split("/").includes("..")
      || normalized.includes("\\")
    ) {
      throw new Error(`Tar archive contains an unsafe archive path: ${entry}.`);
    }
  }
  const verboseEntries = verbose.split(/\r?\n/u).filter(Boolean);
  if (
    verboseEntries.length !== entries.length
    || verboseEntries.some((entry) => !["-", "d"].includes(entry[0]))
  ) {
    throw new Error(
      "Tar archive may contain only regular files and directories.",
    );
  }
  if (exactEntries) {
    const actual = [...entries].sort();
    const expected = [...exactEntries].sort();
    if (
      actual.length !== expected.length
      || actual.some((entry, index) => entry !== expected[index])
    ) {
      throw new Error("Tar archive contains unexpected entries.");
    }
  }
  return entries;
}

export function buildPostDataRestoreList(
  restoreList,
  dropLegacyAuthEntries,
) {
  if (typeof restoreList !== "string") {
    throw new Error("Post-data restore list must be text.");
  }
  if (!dropLegacyAuthEntries) {
    return restoreList;
  }
  return restoreList
    .split("\n")
    .map((line) =>
      LEGACY_AUTH_FK_NAMES.some((name) => line.includes(` ${name} `))
        ? `;${line}`
        : line)
    .join("\n");
}

export function validateSemanticRestoreEvidence({
  phases,
  authUsers,
  authUsersResidual,
  publicManifest,
  storageManifest,
}) {
  if (
    !Array.isArray(phases)
    || phases.length !== RESTORE_PHASES.length
    || phases.some((phase, index) => phase !== RESTORE_PHASES[index])
  ) {
    throw new Error(`Invalid restore order; expected ${RESTORE_PHASES.join(" -> ")}.`);
  }
  if (authUsers !== 0 || authUsersResidual !== 0) {
    throw new Error(
      "Semantic restore requires auth.users=0 and auth.users residual=0.",
    );
  }
  for (const [name, manifest] of [
    ["public", publicManifest],
    ["storage", storageManifest],
  ]) {
    if (
      typeof manifest?.source !== "string"
      || manifest.source.length === 0
      || manifest.source !== manifest.target
    ) {
      throw new Error(`${name} manifest mismatch.`);
    }
  }
  return true;
}

export function planOrderedRecovery(statuses) {
  const postgres = statuses?.postgres;
  if (postgres === "unhealthy") {
    throw new Error("postgres is unhealthy; ordered recovery stopped.");
  }
  if (postgres !== "healthy") {
    return ["start:postgres", "wait:postgres"];
  }

  for (const service of ["postgrest", "storage"]) {
    if (statuses?.[service] === "unhealthy") {
      throw new Error(`${service} is unhealthy; ordered recovery stopped.`);
    }
  }
  const upstreamPlan = [];
  for (const service of ["postgrest", "storage"]) {
    if (statuses?.[service] !== "healthy") {
      upstreamPlan.push(`start:${service}`, `wait:${service}`);
    }
  }
  if (upstreamPlan.length > 0) {
    return upstreamPlan;
  }

  if (statuses?.gateway === "unhealthy") {
    throw new Error("gateway is unhealthy; ordered recovery stopped.");
  }
  if (statuses?.gateway !== "healthy") {
    return ["start:gateway", "wait:gateway"];
  }
  return [];
}

export function evaluateCapacityPreflight({ dataBytes, freeBytes }) {
  if (
    !Number.isFinite(dataBytes)
    || dataBytes < 0
    || !Number.isFinite(freeBytes)
    || freeBytes < 0
  ) {
    throw new Error("Capacity values must be non-negative finite numbers.");
  }
  const requiredBytes = Math.max(80 * GIB, dataBytes * 3);
  return Object.freeze({
    dataBytes,
    freeBytes,
    pass: freeBytes >= requiredBytes,
    requiredBytes,
  });
}

export function evaluateMemoryCapacityPreflight({
  dockerMemoryLimitBytes,
  macAvailableBytes,
  services,
  swapFreeBytes,
  swapTotalBytes,
}) {
  for (const [name, value] of Object.entries({
    dockerMemoryLimitBytes,
    macAvailableBytes,
    swapFreeBytes,
    swapTotalBytes,
  })) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${name} must be a non-negative finite number.`);
    }
  }

  let totalCurrentBytes = 0;
  let totalPeakBytes = 0;
  for (const service of CAPACITY_SERVICES) {
    const currentBytes = services?.[service]?.currentBytes;
    const peakBytes = services?.[service]?.peakBytes;
    if (
      !Number.isFinite(currentBytes)
      || currentBytes < 0
      || !Number.isFinite(peakBytes)
      || peakBytes < currentBytes
    ) {
      throw new Error(
        `${service} memory current/peak measurements are required.`,
      );
    }
    totalCurrentBytes += currentBytes;
    totalPeakBytes += peakBytes;
  }

  const dockerRequiredBytes = Math.max(
    totalPeakBytes + GIB,
    Math.ceil(totalPeakBytes * 1.5),
  );
  const macRequiredBytes = Math.max(
    4 * GIB,
    totalPeakBytes * (swapTotalBytes === 0 ? 3 : 2),
  );
  const swapRequiredBytes = swapTotalBytes === 0
    ? 0
    : Math.min(2 * GIB, totalPeakBytes);
  const dockerPass = dockerMemoryLimitBytes >= dockerRequiredBytes;
  const macRamPass = macAvailableBytes >= macRequiredBytes;
  const swapPass = swapFreeBytes >= swapRequiredBytes;

  return Object.freeze({
    dockerMemoryLimitBytes,
    dockerPass,
    dockerRequiredBytes,
    macAvailableBytes,
    macRamPass,
    macRequiredBytes,
    pass: dockerPass && macRamPass && swapPass,
    services,
    swapFreeBytes,
    swapPass,
    swapRequiredBytes,
    swapTotalBytes,
    totalCurrentBytes,
    totalPeakBytes,
  });
}

export const HYBRID_SEMANTIC_RESTORE_PHASES = RESTORE_PHASES;
