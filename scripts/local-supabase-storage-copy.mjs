#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateExternalSecretDirectory } from "./lib/full-local-production-runtime.mjs";

export const RCLONE_IMAGE =
  "docker.io/rclone/rclone:1.69.3@sha256:1f497a86a6466395e62a5886613a14b7b18809543566ef9fa35fa1371a7ecc0f";
export const RCLONE_CONFIG_BASENAME = "rclone.conf";
export const RCLONE_CONFIG_MOUNT_PATH = "/run/secrets/homecook-rclone.conf";
export const SOURCE_REMOTE_NAME = "source";
export const DESTINATION_REMOTE_NAME = "destination";

const HOSTED_SUPABASE_HOST = /^[a-z0-9-]+\.(?:storage\.)?supabase\.co$/u;
const BUCKET_NAME = /^[a-z0-9][a-z0-9._-]{0,62}$/u;
const PINNED_RCLONE_IMAGE =
  /^docker\.io\/rclone\/rclone:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/u;
const CREDENTIAL_ARG =
  /^--(?:.*(?:access[-_]?key|secret(?:[-_]|$)|password|token|credential).*)$/iu;
const DIRECT_COPY_ARG =
  /^--(?:source|destination|from|to|file|source-path|destination-path)$/u;
const SAFE_COMMANDS = new Set(["copy", "plan", "verify"]);
const VERIFY_MANIFEST_FORMAT = "homecook-local-supabase-storage-verify-v1";

const DEFAULT_REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function requiredValue(record, name, { fallback } = {}) {
  const value = record?.[name];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof fallback === "string" && fallback.trim().length > 0) {
    return fallback.trim();
  }
  throw new Error(`${name} is required.`);
}

function exactMode(actual, expected, label) {
  if ((Number(actual) & 0o777) !== expected) {
    throw new Error(`${label} must use mode 0${expected.toString(8)}.`);
  }
}

function sanitizeConfigValue(value, label) {
  const text = requiredValue({ value }, "value");
  if (/[\r\n]/u.test(text)) {
    throw new Error(`${label} must be a single-line value.`);
  }
  return text;
}

function normalizeUrl(input, label) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must not contain embedded credentials or query data.`);
  }
  return url;
}

function stripTrailingSlash(url) {
  return url.toString().replace(/\/$/u, "");
}

function expandSecretRepresentations(secret) {
  if (typeof secret !== "string" || secret.length === 0) {
    return [];
  }
  const encoded = encodeURIComponent(secret);
  return [
    secret,
    Buffer.from(secret, "utf8").toString("base64"),
    encoded,
    encodeURIComponent(encoded),
  ];
}

export function normalizeHostedSupabaseS3Endpoint(input) {
  const url = normalizeUrl(input, "Hosted Supabase S3 endpoint");
  if (url.protocol !== "https:") {
    throw new Error("Hosted Supabase S3 endpoint must use HTTPS.");
  }
  if (
    !HOSTED_SUPABASE_HOST.test(url.hostname)
    || url.hostname === "storage.supabase.co"
  ) {
    throw new Error("Hosted Supabase S3 endpoint must target an exact project Supabase hostname.");
  }
  if (url.pathname !== "/storage/v1/s3") {
    throw new Error("Hosted Supabase S3 endpoint must use the exact /storage/v1/s3 path.");
  }
  return stripTrailingSlash(url);
}

export function normalizeLoopbackSupabaseS3Endpoint(input) {
  const url = normalizeUrl(input, "Local loopback Supabase S3 endpoint");
  if (url.protocol !== "http:") {
    throw new Error("Local loopback Supabase S3 endpoint must use HTTP.");
  }
  if (url.hostname !== "127.0.0.1" || !url.port) {
    throw new Error(
      "Local loopback Supabase S3 endpoint must target 127.0.0.1 with an explicit port.",
    );
  }
  if (url.pathname !== "/storage/v1/s3") {
    throw new Error("Local loopback Supabase S3 endpoint must use the exact /storage/v1/s3 path.");
  }
  return stripTrailingSlash(url);
}

export function assertPinnedRcloneImage(reference) {
  if (!PINNED_RCLONE_IMAGE.test(reference)) {
    throw new Error("rclone image must stay pinned to an exact sha256 digest.");
  }
  return reference;
}

function detectCredentialSource({ envValue, keychainService, keychainAccount }) {
  if (typeof envValue === "string" && envValue.trim().length > 0) {
    return "env";
  }
  if (keychainService && keychainAccount) {
    return "keychain";
  }
  throw new Error("Credential must come from environment variables or Keychain.");
}

export function loadCredentialValue({
  env,
  envName,
  fallbackEnvName,
  keychainServiceEnvName,
  keychainAccountEnvName,
  label,
  readKeychainSecret = readMacOsKeychainSecret,
}) {
  const envValue = env?.[envName] ?? env?.[fallbackEnvName];
  const keychainService = env?.[keychainServiceEnvName];
  const keychainAccount = env?.[keychainAccountEnvName];
  const source = detectCredentialSource({
    envValue,
    keychainAccount,
    keychainService,
  });
  if (source === "env") {
    return Object.freeze({
      source,
      value: sanitizeConfigValue(envValue, label),
    });
  }
  return Object.freeze({
    source,
    value: sanitizeConfigValue(
      readKeychainSecret({
        account: keychainAccount,
        service: keychainService,
      }),
      label,
    ),
  });
}

export function readMacOsKeychainSecret({
  account,
  service,
  execFileSyncImpl = execFileSync,
}) {
  const readAccount = (candidate) => execFileSyncImpl(
    "security",
    ["find-generic-password", "-a", candidate, "-s", service, "-w"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
  try {
    return requiredValue({ secret: readAccount(account) }, "secret");
  } catch (directError) {
    let count;
    try {
      count = Number(readAccount(`${account}__count`));
    } catch {
      throw directError;
    }
    if (!Number.isSafeInteger(count) || count < 1 || count > 128) {
      throw new Error(`Keychain item ${account} has an invalid chunk count.`);
    }
    return Array.from({ length: count }, (_, index) =>
      readAccount(`${account}__${String(index).padStart(3, "0")}`)).join("");
  }
}

export function parseStorageCopyCliArgs(argv) {
  const args = [...argv];
  const parsed = {
    bucket: null,
    command: "plan",
    configDirectory: null,
    execute: false,
    json: false,
    manifestPath: null,
  };

  if (args[0] && !args[0].startsWith("-")) {
    if (!SAFE_COMMANDS.has(args[0])) {
      throw new Error(
        "Direct source/destination arguments are not allowed; use env or Keychain managed endpoints.",
      );
    }
    parsed.command = args.shift();
  }

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (CREDENTIAL_ARG.test(token)) {
      throw new Error("CLI credentials are forbidden; use environment variables or Keychain.");
    }
    if (DIRECT_COPY_ARG.test(token)) {
      throw new Error("Direct file/source/destination CLI arguments are forbidden.");
    }
    if (!token.startsWith("-")) {
      throw new Error(
        "Direct source/destination arguments are not allowed; use env or Keychain managed endpoints.",
      );
    }
    switch (token) {
      case "--bucket":
        index += 1;
        if (!args[index] || !BUCKET_NAME.test(args[index])) {
          throw new Error("--bucket requires a safe bucket name.");
        }
        parsed.bucket = args[index];
        break;
      case "--config-dir":
        index += 1;
        if (!args[index]) {
          throw new Error("--config-dir requires a path.");
        }
        parsed.configDirectory = args[index];
        break;
      case "--execute":
        parsed.execute = true;
        break;
      case "--json":
        parsed.json = true;
        break;
      case "--manifest":
        index += 1;
        if (!args[index]) {
          throw new Error("--manifest requires an absolute external .json path.");
        }
        parsed.manifestPath = args[index];
        break;
      default:
        throw new Error(`Unsupported argument: ${token}`);
    }
  }

  if (parsed.command !== "copy" && parsed.execute) {
    throw new Error("--execute is only allowed with the copy command.");
  }
  if (parsed.command === "verify" && !parsed.manifestPath) {
    throw new Error("verify requires --manifest <absolute external .json path>.");
  }
  if (parsed.command !== "verify" && parsed.manifestPath) {
    throw new Error("--manifest is only allowed with the verify command.");
  }

  return Object.freeze({
    ...parsed,
    dryRun: parsed.command !== "copy" || parsed.execute !== true,
  });
}

export function buildStorageCopyRuntime({
  env,
  readKeychainSecret = readMacOsKeychainSecret,
}) {
  const sourceAccessKey = loadCredentialValue({
    env,
    envName: "HOMECOOK_HOSTED_SUPABASE_S3_ACCESS_KEY_ID",
    keychainAccountEnvName: "HOMECOOK_HOSTED_SUPABASE_S3_ACCESS_KEY_ID_KEYCHAIN_ACCOUNT",
    keychainServiceEnvName: "HOMECOOK_HOSTED_SUPABASE_S3_KEYCHAIN_SERVICE",
    label: "Hosted Supabase S3 access key ID",
    readKeychainSecret,
  });
  const sourceSecretKey = loadCredentialValue({
    env,
    envName: "HOMECOOK_HOSTED_SUPABASE_S3_SECRET_ACCESS_KEY",
    keychainAccountEnvName: "HOMECOOK_HOSTED_SUPABASE_S3_SECRET_ACCESS_KEY_KEYCHAIN_ACCOUNT",
    keychainServiceEnvName: "HOMECOOK_HOSTED_SUPABASE_S3_KEYCHAIN_SERVICE",
    label: "Hosted Supabase S3 secret access key",
    readKeychainSecret,
  });
  const destinationAccessKey = loadCredentialValue({
    env,
    envName: "HOMECOOK_LOCAL_SUPABASE_S3_ACCESS_KEY_ID",
    fallbackEnvName: "S3_PROTOCOL_ACCESS_KEY_ID",
    keychainAccountEnvName: "HOMECOOK_LOCAL_SUPABASE_S3_ACCESS_KEY_ID_KEYCHAIN_ACCOUNT",
    keychainServiceEnvName: "HOMECOOK_LOCAL_SUPABASE_S3_KEYCHAIN_SERVICE",
    label: "Local loopback Supabase S3 access key ID",
    readKeychainSecret,
  });
  const destinationSecretKey = loadCredentialValue({
    env,
    envName: "HOMECOOK_LOCAL_SUPABASE_S3_SECRET_ACCESS_KEY",
    fallbackEnvName: "S3_PROTOCOL_ACCESS_KEY_SECRET",
    keychainAccountEnvName: "HOMECOOK_LOCAL_SUPABASE_S3_SECRET_ACCESS_KEY_KEYCHAIN_ACCOUNT",
    keychainServiceEnvName: "HOMECOOK_LOCAL_SUPABASE_S3_KEYCHAIN_SERVICE",
    label: "Local loopback Supabase S3 secret access key",
    readKeychainSecret,
  });
  const destinationEndpoint = normalizeLoopbackSupabaseS3Endpoint(
    requiredValue(
      env,
      "HOMECOOK_LOCAL_SUPABASE_S3_ENDPOINT",
      { fallback: env?.LOCAL_SUPABASE_STORAGE_S3_ENDPOINT },
    ),
  );
  const expectedGatewayPort = requiredValue(
    env,
    "FULL_LOCAL_INTERNAL_GATEWAY_PORT",
  );
  if (new URL(destinationEndpoint).port !== expectedGatewayPort) {
    throw new Error(
      "Local loopback Supabase S3 endpoint port must match FULL_LOCAL_INTERNAL_GATEWAY_PORT.",
    );
  }

  return Object.freeze({
    destination: Object.freeze({
      accessKeyId: destinationAccessKey.value,
      credentialsSource: `${destinationAccessKey.source}+${destinationSecretKey.source}`,
      endpoint: destinationEndpoint,
      region: sanitizeConfigValue(
        requiredValue(env, "HOMECOOK_LOCAL_SUPABASE_S3_REGION", {
          fallback: env?.REGION,
        }),
        "Local loopback Supabase S3 region",
      ),
      secretAccessKey: destinationSecretKey.value,
    }),
    rcloneImage: assertPinnedRcloneImage(RCLONE_IMAGE),
    source: Object.freeze({
      accessKeyId: sourceAccessKey.value,
      credentialsSource: `${sourceAccessKey.source}+${sourceSecretKey.source}`,
      endpoint: normalizeHostedSupabaseS3Endpoint(
        requiredValue(env, "HOMECOOK_HOSTED_SUPABASE_S3_ENDPOINT"),
      ),
      region: sanitizeConfigValue(
        requiredValue(env, "HOMECOOK_HOSTED_SUPABASE_S3_REGION"),
        "Hosted Supabase S3 region",
      ),
      secretAccessKey: sourceSecretKey.value,
    }),
  });
}

function buildRcloneRemoteBlock({ name, endpoint, region, accessKeyId, secretAccessKey }) {
  return [
    `[${name}]`,
    "type = s3",
    "provider = Other",
    "env_auth = false",
    `access_key_id = ${sanitizeConfigValue(accessKeyId, `${name} access key ID`)}`,
    `secret_access_key = ${sanitizeConfigValue(secretAccessKey, `${name} secret access key`)}`,
    `endpoint = ${sanitizeConfigValue(endpoint, `${name} endpoint`)}`,
    `region = ${sanitizeConfigValue(region, `${name} region`)}`,
    "list_version = 2",
    "",
  ].join("\n");
}

export function buildRcloneConfig(runtime) {
  return [
    buildRcloneRemoteBlock({
      ...runtime.source,
      name: SOURCE_REMOTE_NAME,
    }),
    buildRcloneRemoteBlock({
      ...runtime.destination,
      name: DESTINATION_REMOTE_NAME,
    }),
  ].join("\n");
}

export function redactSecrets(value, secrets) {
  let text = String(value ?? "");
  for (const secret of secrets) {
    for (const representation of expandSecretRepresentations(secret)) {
      if (representation.length === 0) continue;
      text = text.split(representation).join("[redacted]");
    }
  }
  return text;
}

export function writeEphemeralRcloneConfig({
  configDirectory,
  configText,
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
}) {
  const requestedDirectory = configDirectory
    ? validateExternalSecretDirectory({
      repositoryRoot,
      secretDirectory: resolve(configDirectory),
    })
    : mkdtempSync(join(tmpdir(), "homecook-rclone-"));

  if (!existsSync(requestedDirectory)) {
    mkdirSync(requestedDirectory, { mode: 0o700, recursive: true });
  }
  chmodSync(requestedDirectory, 0o700);
  exactMode(statSync(requestedDirectory).mode, 0o700, "Ephemeral rclone config directory");

  const configPath = join(requestedDirectory, RCLONE_CONFIG_BASENAME);
  writeFileSync(configPath, configText, { encoding: "utf8", mode: 0o600 });
  chmodSync(configPath, 0o600);
  exactMode(statSync(configPath).mode, 0o600, "Ephemeral rclone config");

  const cleanup = () => {
    rmSync(configPath, { force: true });
    if (!configDirectory) {
      rmSync(requestedDirectory, { force: true, recursive: true });
    }
  };

  return Object.freeze({
    cleanup,
    configDirectory: requestedDirectory,
    configPath,
  });
}

export function buildDockerRcloneInvocation({
  bucket,
  command,
  configPath,
  download = false,
  dryRun,
  hashAlgorithm,
  image = RCLONE_IMAGE,
  remoteName = SOURCE_REMOTE_NAME,
}) {
  const args = [
    "run",
    "--rm",
    "--network",
    "host",
    "-v",
    `${configPath}:${RCLONE_CONFIG_MOUNT_PATH}:ro`,
    image,
    "--config",
    RCLONE_CONFIG_MOUNT_PATH,
  ];

  const remoteTarget = bucket
    ? `${remoteName}:${bucket}`
    : `${remoteName}:`;

  if (command === "lsd") {
    args.push(command);
    args.push(remoteTarget);
  } else if (command === "lsf") {
    args.push(command);
    args.push(remoteTarget);
  } else if (command === "lsjson") {
    args.push(command, remoteTarget, "--recursive", "--files-only", "--hash-type", "MD5");
  } else if (command === "hashsum") {
    if (!hashAlgorithm) {
      throw new Error("hashsum requires a hash algorithm.");
    }
    args.push(command, hashAlgorithm, remoteTarget);
    if (download) {
      args.push("--download");
    }
  } else if (command === "copy") {
    args.push(command);
    args.push(`${SOURCE_REMOTE_NAME}:${bucket}`, `${DESTINATION_REMOTE_NAME}:${bucket}`);
    args.push("--check-first", "--checksum");
    if (dryRun) {
      args.push("--dry-run");
    }
  } else {
    throw new Error(`Unsupported rclone command: ${command}`);
  }

  args.push("--s3-list-version", "2");
  return Object.freeze({
    args,
    command: "docker",
  });
}

function runCommandOrThrow({
  args,
  command,
  runCommand = defaultRunCommand,
  secrets = [],
}) {
  const result = runCommand(command, args);
  if (result.status !== 0) {
    const details = redactSecrets(
      [result.stderr, result.stdout].filter(Boolean).join("\n"),
      secrets,
    ).trim();
    throw new Error(
      details.length > 0
        ? `rclone command failed: ${details}`
        : "rclone command failed without output.",
    );
  }
  return result;
}

function defaultRunCommand(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseBucketList(stdout) {
  return stdout
    .split(/\r?\n/u)
    .map((value) => value.trim().replace(/\/$/u, ""))
    .filter(Boolean);
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function normalizeObjectHash(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  return value.trim().toLowerCase();
}

function parseRcloneLsjson(stdout, { bucket }) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error("rclone lsjson returned invalid JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("rclone lsjson must return an array.");
  }
  return Object.freeze(parsed.map((entry) => {
    const relativePath = requiredString(entry?.Path, "Object path");
    const size = entry?.Size;
    if (!Number.isFinite(size) || size < 0) {
      throw new Error(`Object ${bucket}/${relativePath} must include a non-negative Size.`);
    }
    const mimeType = requiredString(entry?.MimeType, `Object ${bucket}/${relativePath} MIME type`);
    return Object.freeze({
      bucket,
      bytes: Number(size),
      md5: normalizeObjectHash(entry?.Hashes?.MD5),
      mime_type: mimeType,
      path: `${bucket}/${relativePath}`,
      sha256: null,
    });
  }));
}

function parseRcloneHashsum(stdout, label) {
  const hashes = new Map();
  const lines = stdout
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter(Boolean);
  for (const line of lines) {
    const match = /^([0-9a-f]+)\s{2}(.*)$/iu.exec(line);
    if (!match) {
      throw new Error(`rclone ${label} returned an unparseable line.`);
    }
    hashes.set(match[2], match[1].toLowerCase());
  }
  return hashes;
}

function collectRemoteBucketObjects({
  bucket,
  remoteName,
  runRclone,
}) {
  const objects = parseRcloneLsjson(
    runRclone({
      bucket,
      command: "lsjson",
      remoteName,
    }).stdout,
    { bucket },
  );
  const sha256ByPath = parseRcloneHashsum(
    runRclone({
      bucket,
      command: "hashsum",
      download: true,
      hashAlgorithm: "SHA-256",
      remoteName,
    }).stdout,
    "hashsum SHA-256",
  );

  return Object.freeze(objects.map((object) => {
    const relativePath = object.path.slice(bucket.length + 1);
    return Object.freeze({
      ...object,
      sha256: normalizeObjectHash(sha256ByPath.get(relativePath)),
    });
  }));
}

export function compareStorageObjectCatalogs({
  destinationObjects,
  sourceObjects,
}) {
  const source = [...sourceObjects].sort((left, right) => left.path.localeCompare(right.path));
  const destination = [...destinationObjects].sort((left, right) =>
    left.path.localeCompare(right.path));
  const pathMismatches = [];
  const maxCount = Math.max(source.length, destination.length);
  for (let index = 0; index < maxCount; index += 1) {
    const sourcePath = source[index]?.path ?? null;
    const destinationPath = destination[index]?.path ?? null;
    if (sourcePath !== destinationPath) {
      pathMismatches.push(Object.freeze({
        destination_path: destinationPath,
        source_path: sourcePath,
      }));
    }
  }

  const destinationByPath = new Map(destination.map((object) => [object.path, object]));
  const sourceByPath = new Map(source.map((object) => [object.path, object]));
  const missingObjects = [];
  const extraObjects = [];
  const metadataMismatches = [];

  for (const sourceObject of source) {
    const destinationObject = destinationByPath.get(sourceObject.path);
    if (!destinationObject) {
      missingObjects.push(Object.freeze({
        bytes: sourceObject.bytes,
        md5: sourceObject.md5,
        mime_type: sourceObject.mime_type,
        path: sourceObject.path,
        sha256: sourceObject.sha256,
      }));
      continue;
    }

    const fields = [];
    if (!Number.isFinite(sourceObject.bytes) || !Number.isFinite(destinationObject.bytes)
      || sourceObject.bytes !== destinationObject.bytes) {
      fields.push("bytes");
    }
    if (
      typeof sourceObject.mime_type !== "string"
      || sourceObject.mime_type.length === 0
      || typeof destinationObject.mime_type !== "string"
      || destinationObject.mime_type.length === 0
      || sourceObject.mime_type !== destinationObject.mime_type
    ) {
      fields.push("mime_type");
    }
    if (
      typeof sourceObject.md5 !== "string"
      || sourceObject.md5.length === 0
      || typeof destinationObject.md5 !== "string"
      || destinationObject.md5.length === 0
      || sourceObject.md5 !== destinationObject.md5
    ) {
      fields.push("md5");
    }
    if (
      typeof sourceObject.sha256 !== "string"
      || sourceObject.sha256.length === 0
      || typeof destinationObject.sha256 !== "string"
      || destinationObject.sha256.length === 0
      || sourceObject.sha256 !== destinationObject.sha256
    ) {
      fields.push("sha256");
    }

    if (fields.length > 0) {
      metadataMismatches.push(Object.freeze({
        destination: Object.freeze({
          bytes: destinationObject.bytes,
          md5: destinationObject.md5,
          mime_type: destinationObject.mime_type,
          path: destinationObject.path,
          sha256: destinationObject.sha256,
        }),
        fields: Object.freeze(fields),
        path: sourceObject.path,
        source: Object.freeze({
          bytes: sourceObject.bytes,
          md5: sourceObject.md5,
          mime_type: sourceObject.mime_type,
          path: sourceObject.path,
          sha256: sourceObject.sha256,
        }),
      }));
    }
  }

  for (const destinationObject of destination) {
    if (!sourceByPath.has(destinationObject.path)) {
      extraObjects.push(Object.freeze({
        bytes: destinationObject.bytes,
        md5: destinationObject.md5,
        mime_type: destinationObject.mime_type,
        path: destinationObject.path,
        sha256: destinationObject.sha256,
      }));
    }
  }

  return Object.freeze({
    destination_count: destination.length,
    extra_objects: Object.freeze(extraObjects),
    matches:
      pathMismatches.length === 0
      && missingObjects.length === 0
      && extraObjects.length === 0
      && metadataMismatches.length === 0,
    metadata_mismatches: Object.freeze(metadataMismatches),
    missing_objects: Object.freeze(missingObjects),
    path_mismatches: Object.freeze(pathMismatches),
    source_count: source.length,
  });
}

export function validateVerificationManifestPath({
  manifestPath,
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
}) {
  if (!manifestPath || !isAbsolute(manifestPath) || !manifestPath.endsWith(".json")) {
    throw new Error("verify requires --manifest <absolute external .json path>.");
  }
  const resolvedManifestPath = resolve(manifestPath);
  try {
    validateExternalSecretDirectory({
      repositoryRoot,
      secretDirectory: dirname(resolvedManifestPath),
    });
  } catch {
    throw new Error("verify requires --manifest <absolute external .json path>.");
  }
  if (existsSync(resolvedManifestPath)) {
    throw new Error("Verification manifest output already exists.");
  }
  return resolvedManifestPath;
}

export function writeVerificationManifest({
  manifest,
  manifestPath,
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
}) {
  const resolvedManifestPath = validateVerificationManifestPath({
    manifestPath,
    repositoryRoot,
  });
  writeFileSync(resolvedManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(resolvedManifestPath, 0o600);
  exactMode(statSync(resolvedManifestPath).mode, 0o600, "Verification manifest");
  return resolvedManifestPath;
}

function buildVerificationManifest({
  buckets,
  comparison,
  runtime,
  sourceObjects,
  destinationObjects,
}) {
  return Object.freeze({
    bucket_count: buckets.length,
    buckets: Object.freeze([...buckets]),
    comparison,
    created_at: new Date().toISOString(),
    destination: Object.freeze({
      endpoint: runtime.destination.endpoint,
      objects: Object.freeze(destinationObjects),
      object_count: destinationObjects.length,
      region: runtime.destination.region,
    }),
    format: VERIFY_MANIFEST_FORMAT,
    source: Object.freeze({
      endpoint: runtime.source.endpoint,
      objects: Object.freeze(sourceObjects),
      object_count: sourceObjects.length,
      region: runtime.source.region,
    }),
  });
}

function runStorageVerifyOperation({
  cli,
  ephemeralConfig,
  plan,
  repositoryRoot,
  runCommand,
  runtime,
  secrets,
}) {
  const runRclone = ({ bucket, command, download = false, hashAlgorithm, remoteName }) =>
    runCommandOrThrow({
      ...buildDockerRcloneInvocation({
        bucket,
        command,
        configPath: ephemeralConfig.configPath,
        download,
        dryRun: false,
        hashAlgorithm,
        image: runtime.rcloneImage,
        remoteName,
      }),
      runCommand,
      secrets,
    });

  const sourceBuckets = cli.bucket
    ? parseBucketList(runRclone({ command: "lsf", remoteName: SOURCE_REMOTE_NAME }).stdout)
      .filter((bucket) => bucket === cli.bucket)
    : parseBucketList(runRclone({ command: "lsf", remoteName: SOURCE_REMOTE_NAME }).stdout);
  const destinationBuckets = cli.bucket
    ? parseBucketList(runRclone({ command: "lsf", remoteName: DESTINATION_REMOTE_NAME }).stdout)
      .filter((bucket) => bucket === cli.bucket)
    : parseBucketList(runRclone({ command: "lsf", remoteName: DESTINATION_REMOTE_NAME }).stdout);
  const bucketSet = new Set([...sourceBuckets, ...destinationBuckets]);
  const buckets = [...bucketSet].sort((left, right) => left.localeCompare(right));
  if (cli.bucket && (!sourceBuckets.includes(cli.bucket) || !destinationBuckets.includes(cli.bucket))) {
    throw new Error("Requested Storage bucket must exist on both source and destination.");
  }
  if (
    sourceBuckets.length !== destinationBuckets.length
    || sourceBuckets.some((bucket) => !destinationBuckets.includes(bucket))
  ) {
    throw new Error("Storage source and destination bucket sets do not match.");
  }
  const sourceObjects = [];
  const destinationObjects = [];

  for (const bucket of buckets) {
    if (sourceBuckets.includes(bucket)) {
      sourceObjects.push(...collectRemoteBucketObjects({
        bucket,
        remoteName: SOURCE_REMOTE_NAME,
        runRclone,
      }));
    }
    if (destinationBuckets.includes(bucket)) {
      destinationObjects.push(...collectRemoteBucketObjects({
        bucket,
        remoteName: DESTINATION_REMOTE_NAME,
        runRclone,
      }));
    }
  }

  const comparison = compareStorageObjectCatalogs({
    destinationObjects,
    sourceObjects,
  });
  const manifest = buildVerificationManifest({
    buckets,
    comparison,
    destinationObjects: Object.freeze(destinationObjects),
    runtime,
    sourceObjects: Object.freeze(sourceObjects),
  });
  const manifestPath = writeVerificationManifest({
    manifest,
    manifestPath: cli.manifestPath,
    repositoryRoot,
  });
  const result = Object.freeze({
    ...plan,
    bucket_count: buckets.length,
    comparison,
    manifest_path: manifestPath,
    verified_buckets: Object.freeze(buckets),
  });

  if (!comparison.matches) {
    throw new Error(
      `Storage verification failed; see manifest at ${manifestPath}.`,
    );
  }
  return result;
}

export function createStorageCopyPlan({ cli, runtime }) {
  return Object.freeze({
    bucket: cli.bucket,
    bucket_mode: cli.bucket ? "single" : "all",
    destination_endpoint: runtime.destination.endpoint,
    destination_region: runtime.destination.region,
    dry_run: cli.dryRun,
    hosted_credentials_source: runtime.source.credentialsSource,
    local_credentials_source: runtime.destination.credentialsSource,
    mode: cli.command,
    rclone_image: runtime.rcloneImage,
    source_endpoint: runtime.source.endpoint,
    source_region: runtime.source.region,
  });
}

export function runStorageCopyOperation({
  cli,
  configDirectory,
  env,
  readKeychainSecret = readMacOsKeychainSecret,
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  runCommand = defaultRunCommand,
}) {
  const runtime = buildStorageCopyRuntime({ env, readKeychainSecret });
  const plan = createStorageCopyPlan({ cli, runtime });
  if (cli.command === "plan") {
    return Object.freeze(plan);
  }

  const configText = buildRcloneConfig(runtime);
  const secrets = [
    runtime.source.accessKeyId,
    runtime.source.secretAccessKey,
    runtime.destination.accessKeyId,
    runtime.destination.secretAccessKey,
  ];
  const ephemeralConfig = writeEphemeralRcloneConfig({
    configDirectory,
    configText,
    repositoryRoot,
  });

  try {
    if (cli.command === "verify") {
      return runStorageVerifyOperation({
        cli,
        ephemeralConfig,
        plan,
        repositoryRoot,
        runCommand,
        runtime,
        secrets,
      });
    }

    const runRclone = ({ bucket, command }) => runCommandOrThrow({
      ...buildDockerRcloneInvocation({
        bucket,
        command,
        configPath: ephemeralConfig.configPath,
        dryRun: cli.dryRun,
        image: runtime.rcloneImage,
      }),
      runCommand,
      secrets,
    });

    runRclone({ command: "lsd" });

    const buckets = cli.bucket
      ? [cli.bucket]
      : parseBucketList(runRclone({ command: "lsf" }).stdout);

    for (const bucket of buckets) {
      runRclone({ bucket, command: "copy" });
    }

    return Object.freeze({
      ...plan,
      bucket_count: buckets.length,
      copied_buckets: buckets,
    });
  } finally {
    ephemeralConfig.cleanup();
  }
}

export function formatCliOutput(result, { json = false } = {}) {
  const output = JSON.stringify(result, null, json ? 2 : 0);
  return `${output}\n`;
}

export function main(argv, {
  env = process.env,
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  runCommand = defaultRunCommand,
} = {}) {
  const cli = parseStorageCopyCliArgs(argv);
  const result = runStorageCopyOperation({
    cli,
    configDirectory: cli.configDirectory,
    env,
    repositoryRoot,
    runCommand,
  });
  process.stdout.write(formatCliOutput(result, { json: cli.json || true }));
  return result;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
