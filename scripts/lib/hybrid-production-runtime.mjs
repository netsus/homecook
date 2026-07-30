import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import {
  chmodSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";

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
const RUNTIME_IMAGE_REFERENCES = Object.freeze({
  "linux/amd64": Object.freeze({
    node:
      "docker.io/library/node@sha256:aa83e8f13963f17f7f6bd497085112bf12ea6f20b4b826d9b33f2d99594325b6",
    postgres:
      "public.ecr.aws/supabase/postgres@sha256:5a4314708484bec672de2c09653a5c01fb1c84a998564ac231b0325e2238ed5b",
    postgrest:
      "postgrest/postgrest@sha256:560895fc1f6cb78f36ae64682c85bfc923c73da2d3a473ae2f55755fd7991ad1",
    storage:
      "supabase/storage-api@sha256:6f706c1184d97b081446527bb62a3193d3d47ad0daafcf738fd5c3e5a62aed97",
  }),
  "linux/arm64": Object.freeze({
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
const RUNTIME_IMAGE_CONFIG_KEYS = Object.freeze({
  node: "HYBRID_NODE_IMAGE",
  postgres: "HYBRID_POSTGRES_IMAGE",
  postgrest: "HYBRID_POSTGREST_IMAGE",
  storage: "HYBRID_STORAGE_IMAGE",
});
const CATALOG_SECTIONS = Object.freeze([
  "dependencies",
  "extensions",
  "guard_functions",
  "memberships",
  "object_owners_acls",
  "private_data",
  "rls_policies",
  "roles",
  "triggers",
]);
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

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function runtimeImageRefsForPlatform(platform) {
  const references = RUNTIME_IMAGE_REFERENCES[platform];
  if (!references) {
    throw new Error(`Unsupported runtime image platform: ${platform}.`);
  }
  return references;
}

export function assertPinnedImageInspection({
  actualPlatform,
  configuredPlatform,
  expectedReference,
  repoDigests,
}) {
  if (actualPlatform !== configuredPlatform) {
    throw new Error(
      `Docker image platform mismatch; expected ${configuredPlatform}, received ${actualPlatform}.`,
    );
  }
  if (
    typeof expectedReference !== "string"
    || !/@sha256:[0-9a-f]{64}$/u.test(expectedReference)
    || !Array.isArray(repoDigests)
    || !repoDigests.some((repoDigest) =>
      repoDigest.endsWith(`@${expectedReference.split("@").at(-1)}`))
  ) {
    throw new Error("Docker image RepoDigest does not match the pinned digest.");
  }
  return true;
}

function canonicalRemoteKey(key) {
  if (
    !key
    || typeof key !== "object"
    || typeof key.kid !== "string"
    || key.kid.length === 0
    || key.use !== "sig"
    || key.d !== undefined
  ) {
    throw new Error("Remote JWKS contains an invalid verify key.");
  }
  if (
    key.kty === "EC"
    && key.alg === "ES256"
    && key.crv === "P-256"
    && typeof key.x === "string"
    && key.x.length > 0
    && typeof key.y === "string"
    && key.y.length > 0
  ) {
    return stableValue({
      alg: key.alg,
      crv: key.crv,
      kid: key.kid,
      kty: key.kty,
      use: key.use,
      x: key.x,
      y: key.y,
    });
  }
  if (
    key.kty === "RSA"
    && key.alg === "RS256"
    && typeof key.n === "string"
    && key.n.length > 0
    && typeof key.e === "string"
    && key.e.length > 0
  ) {
    return stableValue({
      alg: key.alg,
      e: key.e,
      kid: key.kid,
      kty: key.kty,
      n: key.n,
      use: key.use,
    });
  }
  throw new Error("Remote JWKS contains an unsupported verify key.");
}

function canonicalRemoteKeys(jwks) {
  if (!jwks || typeof jwks !== "object" || !Array.isArray(jwks.keys)) {
    throw new Error("Remote JWKS response is invalid.");
  }
  const keys = jwks.keys.map(canonicalRemoteKey)
    .sort((a, b) => a.kid.localeCompare(b.kid));
  if (
    keys.length === 0
    || new Set(keys.map((key) => key.kid)).size !== keys.length
  ) {
    throw new Error("Remote JWKS must contain unique verify keys.");
  }
  return keys;
}

export async function synchronizeRemoteJwks({
  allowInsecureLoopback = false,
  cachePath,
  combinedJwks,
  fetchImpl = globalThis.fetch,
  url,
}) {
  const endpoint = new URL(url);
  const insecureAllowed = allowInsecureLoopback
    && endpoint.protocol === "http:"
    && ["127.0.0.1", "localhost", "host.docker.internal"].includes(
      endpoint.hostname,
    );
  if (endpoint.protocol !== "https:" && !insecureAllowed) {
    throw new Error("Remote JWKS fetch requires HTTPS.");
  }
  if (typeof cachePath !== "string" || cachePath.length === 0) {
    throw new Error("Remote JWKS cache path is required.");
  }
  let response;
  try {
    response = await fetchImpl(endpoint, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new Error("Remote JWKS network fetch failed closed.");
  }
  if (!response.ok) {
    throw new Error("Remote JWKS endpoint did not return success.");
  }
  const body = await response.text();
  if (body.length === 0 || Buffer.byteLength(body, "utf8") > 1_048_576) {
    throw new Error("Remote JWKS response size is invalid.");
  }
  let remoteJwks;
  let combined;
  try {
    remoteJwks = JSON.parse(body);
    combined = JSON.parse(combinedJwks);
  } catch {
    throw new Error("Remote or combined JWKS JSON is invalid.");
  }
  const remoteKeys = canonicalRemoteKeys(remoteJwks);
  const combinedRemoteKeys = canonicalRemoteKeys({
    keys: Array.isArray(combined?.keys)
      ? combined.keys.filter((key) => key?.kty !== "oct")
      : [],
  });
  if (stableJson(remoteKeys) !== stableJson(combinedRemoteKeys)) {
    throw new Error(
      "Remote JWKS rotation mismatch; combined JWKS update is required.",
    );
  }
  const canonical = `${JSON.stringify({ keys: remoteKeys }, null, 2)}\n`;
  const temporary = `${cachePath}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, canonical, { mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, cachePath);
    chmodSync(cachePath, 0o600);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
  return Object.freeze({
    cachePath,
    digest: sha256Text(stableJson(remoteKeys)),
    keyCount: remoteKeys.length,
  });
}

function exactRemoteAuthConfig(config, allowInsecureLoopback = false) {
  const authUrl = new URL(requiredValue(config, "AUTH_SUPABASE_URL"));
  const issuer = new URL(
    requiredValue(config, "AUTH_SUPABASE_EXPECTED_ISSUER"),
  );
  const jwks = new URL(requiredValue(config, "AUTH_SUPABASE_JWKS_URL"));

  const insecureFixture = allowInsecureLoopback
    && authUrl.protocol === "http:"
    && ["127.0.0.1", "localhost", "host.docker.internal"].includes(
      authUrl.hostname,
    );
  if (
    (authUrl.protocol !== "https:" && !insecureFixture)
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
  allowInsecureLoopback = false,
}) {
  if ((Number(configFileMode) & 0o777) !== 0o600) {
    throw new Error("Hybrid production config file mode must be exactly 0600.");
  }
  exactRemoteAuthConfig(config, allowInsecureLoopback);
  const dockerPlatform = requiredValue(
    config,
    "HYBRID_DOCKER_PLATFORM",
  );
  if (!SUPPORTED_DOCKER_PLATFORMS.has(dockerPlatform)) {
    throw new Error(
      "HYBRID_DOCKER_PLATFORM must be linux/arm64 or linux/amd64.",
    );
  }
  const expectedImages = runtimeImageRefsForPlatform(dockerPlatform);
  for (const [imageName, configKey] of Object.entries(
    RUNTIME_IMAGE_CONFIG_KEYS,
  )) {
    if (requiredValue(config, configKey) !== expectedImages[imageName]) {
      throw new Error(
        `${configKey} must match the reviewed ${dockerPlatform} RepoDigest.`,
      );
    }
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
  preRestoreBackupAbsent,
  preRestoreBackupPath,
}) {
  if (destructive !== true) {
    throw new Error("Restore requires the explicit --destructive flag.");
  }
  if (
    typeof preRestoreBackupPath !== "string"
    || preRestoreBackupPath.length === 0
    || preRestoreBackupAbsent !== true
  ) {
    throw new Error(
      "Restore requires a new path for the immediate pre-restore backup.",
    );
  }
  return true;
}

export function assertPreRestoreBackupBinding({ expected, metadata }) {
  const createdAt = Date.parse(metadata?.created_at);
  if (
    !Number.isFinite(createdAt)
    || createdAt < expected?.createdAfterMs
    || (
      Number.isFinite(expected?.createdBeforeMs)
      && createdAt > expected.createdBeforeMs
    )
    || metadata?.runtime?.compose_project !== expected?.project
    || metadata?.runtime?.postgres_volume !== expected?.postgresVolume
    || metadata?.runtime?.storage_volume !== expected?.storageVolume
    || metadata?.manifest?.database?.digest !== expected?.databaseDigest
    || metadata?.manifest?.storage?.digest !== expected?.storageDigest
    || metadata?.manifest?.catalog?.digest !== expected?.catalogDigest
  ) {
    throw new Error(
      "Pre-restore backup is not bound to the exact current runtime manifest and timestamp.",
    );
  }
  return true;
}

export function assertBackupMatchesCurrent({ current, metadata, runtime }) {
  if (
    metadata?.runtime?.compose_project !== runtime?.project
    || metadata?.runtime?.postgres_volume !== runtime?.postgresVolume
    || metadata?.runtime?.storage_volume !== runtime?.storageVolume
    || metadata?.manifest?.database?.digest !== current?.database?.digest
    || metadata?.manifest?.storage?.digest !== current?.storage?.digest
    || metadata?.manifest?.catalog?.digest !== current?.catalog?.digest
  ) {
    throw new Error(
      "Backup archive does not match the exact current runtime.",
    );
  }
  return true;
}

export function canonicalCatalogManifest(sections) {
  const canonicalSections = {};
  for (const section of CATALOG_SECTIONS) {
    if (!Array.isArray(sections?.[section])) {
      throw new Error(`Catalog section ${section} must be an array.`);
    }
    const items = sections[section].map(stableValue)
      .sort((a, b) => stableJson(a).localeCompare(stableJson(b)));
    canonicalSections[section] = Object.freeze({
      count: items.length,
      digest: sha256Text(stableJson(items)),
      items,
    });
  }
  return Object.freeze({
    digest: sha256Text(stableJson(
      Object.fromEntries(
        CATALOG_SECTIONS.map((section) => [
          section,
          canonicalSections[section].digest,
        ]),
      ),
    )),
    sections: Object.freeze(canonicalSections),
  });
}

export function compareCatalogManifests(source, target) {
  const mismatched = CATALOG_SECTIONS.filter((section) =>
      typeof source?.sections?.[section]?.digest !== "string"
      || source.sections[section].digest
        !== target?.sections?.[section]?.digest);
  if (mismatched.length > 0) {
    if (process.env.HYBRID_PRODUCTION_DEBUG === "1") {
      const diagnostics = mismatched.map((section) => {
        const sourceItems = source?.sections?.[section]?.items ?? [];
        const targetItems = target?.sections?.[section]?.items ?? [];
        const sourceSet = new Set(sourceItems.map(stableJson));
        const targetSet = new Set(targetItems.map(stableJson));
        const missing = sourceItems
          .filter((item) => !targetSet.has(stableJson(item)))
          .slice(0, 2);
        const unexpected = targetItems
          .filter((item) => !sourceSet.has(stableJson(item)))
          .slice(0, 2);
        const redactDefinition = (item) =>
          section === "guard_functions" && typeof item.definition === "string"
            ? {
                ...item,
                definition: `sha256:${sha256Text(item.definition)}`,
              }
            : item;
        return {
          missing: missing.map(redactDefinition),
          section,
          unexpected: unexpected.map(redactDefinition),
        };
      });
      throw new Error(
        `Catalog manifest mismatch; diagnostics=${JSON.stringify(diagnostics)}.`,
      );
    }
    throw new Error(`Catalog manifest mismatch in ${mismatched.join(", ")}.`);
  }
  if (source.digest !== target.digest) {
    throw new Error("Catalog manifest aggregate mismatch.");
  }
  return true;
}

export function runRestorePublicationGate({
  forcePrivate,
  publish,
  verify,
}) {
  let published = false;
  try {
    const evidence = verify();
    publish();
    published = true;
    return evidence;
  } finally {
    if (!published) {
      forcePrivate();
    }
  }
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
      || normalized.startsWith("-")
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

export function buildAclRestoreList(restoreList) {
  if (typeof restoreList !== "string") {
    throw new Error("ACL restore list must be text.");
  }
  return restoreList
    .split("\n")
    .map((line) =>
      line.startsWith(";")
      || line.length === 0
      || /\s(?:DEFAULT )?ACL\s/u.test(line)
        ? line
        : `;${line}`)
    .join("\n");
}

export function validateInstalledSemanticState(
  state,
  expectedMigrationCount,
) {
  if (
    !Number.isSafeInteger(expectedMigrationCount)
    || expectedMigrationCount <= 0
  ) {
    throw new Error("Expected migration count must be a positive integer.");
  }
  if (state?.migration_count !== expectedMigrationCount) {
    throw new Error("Installed schema migration count does not match the restore authority.");
  }
  if (
    state.auth_users !== 0
    || state.auth_users_residual !== 0
    || state.invalid_constraints !== 0
    || state.runtime_ready !== true
  ) {
    throw new Error("Installed schema failed the semantic readiness gate.");
  }
  return true;
}

function normalizedArchivePath(value) {
  return typeof value === "string"
    ? value.replace(/^\.\//u, "")
    : "";
}

export function validateStoragePayloadInventory({
  entries,
  metadataPath,
  storageFiles,
}) {
  const normalizedMetadataPath = normalizedArchivePath(metadataPath);
  if (
    !Array.isArray(entries)
    || !Array.isArray(storageFiles)
    || !normalizedMetadataPath
  ) {
    throw new Error("Storage payload inventory is malformed.");
  }
  const normalizedEntries = entries.map((entry) => {
    const path = normalizedArchivePath(entry?.path);
    if (
      (entry?.type !== "file" && entry?.type !== "directory")
      || path.startsWith("/")
      || path.startsWith("-")
      || path.includes("\\")
      || path.split("/").includes("..")
      || (entry.type === "file" && !path)
    ) {
      throw new Error(
        "Storage archive paths and types must be regular files or directories.",
      );
    }
    if (
      entry.type === "file"
      && (
        !Number.isSafeInteger(entry.bytes)
        || entry.bytes < 0
        || !/^[0-9a-f]{64}$/u.test(entry.sha256)
      )
    ) {
      throw new Error("Storage payload size or SHA-256 is invalid.");
    }
    return { ...entry, path };
  });
  const normalizedPaths = normalizedEntries.map((entry) => entry.path);
  if (new Set(normalizedPaths).size !== normalizedPaths.length) {
    throw new Error("Storage payload archive contains a duplicate path.");
  }
  const metadataEntries = normalizedEntries.filter((entry) =>
    entry.type === "file" && entry.path === normalizedMetadataPath);
  if (metadataEntries.length !== 1) {
    throw new Error("Storage payload metadata entry is missing or duplicated.");
  }
  const expected = storageFiles.map((file) => {
    const path = normalizedArchivePath(file?.path);
    if (
      !path
      || path.startsWith("/")
      || path.startsWith("-")
      || path.includes("\\")
      || path.split("/").includes("..")
      || !Number.isSafeInteger(file?.bytes)
      || file.bytes < 0
      || !/^[0-9a-f]{64}$/u.test(file?.sha256)
      || path === normalizedMetadataPath
    ) {
      throw new Error("Outer Storage file manifest is malformed.");
    }
    return {
      bytes: file.bytes,
      path,
      sha256: file.sha256,
    };
  }).sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(expected.map((file) => file.path)).size !== expected.length) {
    throw new Error("Outer Storage file manifest contains a duplicate path.");
  }
  const actual = normalizedEntries
    .filter((entry) =>
      entry.type === "file" && entry.path !== normalizedMetadataPath)
    .sort((left, right) => left.path.localeCompare(right.path));
  if (
    actual.length !== expected.length
    || actual.some((file, index) =>
      file.path !== expected[index].path
      || file.bytes !== expected[index].bytes
      || file.sha256 !== expected[index].sha256)
  ) {
    throw new Error(
      "Storage payload entries do not exactly match path, size, and SHA-256.",
    );
  }
  return actual;
}

export function validateStorageXattrManifest({
  manifest,
  storageFiles,
}) {
  const allowedAttributes = [
    "user.supabase.cache-control",
    "user.supabase.content-type",
  ];
  if (
    !manifest
    || manifest.format !== "homecook-storage-xattrs-v1"
    || !Array.isArray(manifest.files)
    || Object.keys(manifest).sort().join(",") !== "files,format"
    || !Array.isArray(storageFiles)
  ) {
    throw new Error("Storage xattr manifest is malformed.");
  }
  const expectedPaths = storageFiles.map((file) => file?.path).sort();
  const actualPaths = manifest.files.map((file) => file?.path).sort();
  if (
    expectedPaths.some((path) => typeof path !== "string")
    || actualPaths.some((path) => typeof path !== "string")
    || expectedPaths.length !== actualPaths.length
    || expectedPaths.some((path, index) => path !== actualPaths[index])
    || new Set(actualPaths).size !== actualPaths.length
  ) {
    throw new Error("Storage xattr file manifest does not match persisted files.");
  }
  for (const file of manifest.files) {
    const path = file.path;
    if (
      path.startsWith("/")
      || path.includes("\\")
      || path.split("/").includes("..")
      || Object.keys(file).sort().join(",") !== "attributes,path"
      || !file.attributes
      || typeof file.attributes !== "object"
      || Object.keys(file.attributes).sort().join(",")
        !== allowedAttributes.join(",")
    ) {
      throw new Error("Storage xattr allowlist validation failed.");
    }
    for (const attribute of allowedAttributes) {
      const encoded = file.attributes[attribute];
      if (
        typeof encoded !== "string"
        || encoded.length === 0
        || encoded.length > 1_368
        || !/^[A-Za-z0-9+/]+={0,2}$/u.test(encoded)
      ) {
        throw new Error("Storage xattr value is invalid.");
      }
      const decoded = Buffer.from(encoded, "base64");
      if (
        decoded.length === 0
        || decoded.length > 1_024
        || decoded.toString("base64") !== encoded
      ) {
        throw new Error("Storage xattr value is invalid.");
      }
    }
  }
  return manifest;
}

export function planPostRestoreMigrationAdvance({
  archiveMigrationCount,
  currentMigrationCount,
}) {
  if (
    !Number.isSafeInteger(archiveMigrationCount)
    || archiveMigrationCount <= 0
    || !Number.isSafeInteger(currentMigrationCount)
    || currentMigrationCount <= 0
  ) {
    throw new Error("Restore migration counts must be positive integers.");
  }
  if (archiveMigrationCount > currentMigrationCount) {
    throw new Error(
      "The restored archive is newer than the current repo migration set.",
    );
  }
  return Object.freeze({
    archiveMigrationCount,
    currentMigrationCount,
    forwardMigrationCount:
      currentMigrationCount - archiveMigrationCount,
  });
}

export function validateSemanticRestoreEvidence({
  phases,
  authUsers,
  authUsersResidual,
  catalogManifest,
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
    ["catalog", catalogManifest],
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

export function evaluateRuntimeStatus(
  services,
  { gatewayReady = false } = {},
) {
  const required = [
    "gateway",
    "postgres",
    "postgrest",
    "postgrest-probe",
    "storage",
  ];
  const items = Array.isArray(services) ? services : [];
  const byService = new Map(items.map((item) => [item.service, item]));
  const present = required.map((service) => byService.get(service))
    .filter(Boolean);
  const stopped = present.length === 0
    || present.every((item) =>
      !["running", "restarting"].includes(String(item.state).toLowerCase()));
  if (stopped) {
    return Object.freeze({
      blockers: required,
      pass: false,
      runtimeState: "STOPPED",
      status: "BLOCKED",
    });
  }

  const blockers = [];
  for (const service of required) {
    const item = byService.get(service);
    if (!item || String(item.state).toLowerCase() !== "running") {
      blockers.push(`${service}:not-running`);
      continue;
    }
    if (
      service !== "postgrest"
      && String(item.health).toLowerCase() !== "healthy"
    ) {
      blockers.push(`${service}:not-healthy`);
    }
  }
  if (!gatewayReady) {
    blockers.push("gateway:not-ready");
  }
  return Object.freeze({
    blockers,
    pass: blockers.length === 0,
    runtimeState: blockers.length === 0 ? "READY" : "DEGRADED",
    status: blockers.length === 0 ? "PASS" : "BLOCKED",
  });
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
