#!/usr/bin/env node

import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, parse, relative, resolve, sep } from "node:path";

import {
  ensureAbsolutePath,
  ensureRegularFile,
} from "./lib/youtube-extraction-worker-artifact.mjs";
import {
  issueYoutubeExtractionWorkerCredential,
} from "./lib/youtube-extraction-worker-local-credential.mjs";
import {
  buildYoutubeExtractionWorkerCredentialState,
  validateYoutubeExtractionWorkerSecretRoot,
  writeCredentialMetadata,
} from "./lib/youtube-extraction-worker-ops.mjs";

const CONFIRMATION = "LOCAL_FULL_PRODUCTION_WORKER_CREDENTIAL";
const REPOSITORY_ROOT = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), ".."));

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const name = rest[index];
    if (name === "--") continue;
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${name} requires a value`);
    }
    switch (name) {
      case "--jwt-keys-file":
        options.jwtKeysFile = ensureAbsolutePath(value, "jwtKeysFile");
        break;
      case "--secret-root":
        options.secretRoot = ensureAbsolutePath(value, "secretRoot");
        break;
      case "--token-file":
        options.tokenFile = ensureAbsolutePath(value, "tokenFile");
        break;
      case "--metadata-output":
        options.metadataOutput = ensureAbsolutePath(value, "metadataOutput");
        break;
      case "--generation":
        options.generation = Number(value);
        break;
      case "--release-sha":
        options.releaseSha = value;
        break;
      case "--schema-identity":
        options.schemaIdentity = value;
        break;
      case "--allowed-snapshot-digest":
        options.allowedSnapshotDigest = value;
        break;
      case "--ttl-seconds":
        options.ttlSeconds = Number(value);
        break;
      case "--confirm-production":
        options.confirmation = value;
        break;
      default:
        throw new Error(`Unknown option: ${name}`);
    }
    index += 1;
  }
  return options;
}

function createOnlySecretPath(path, secretRoot, label) {
  if (!isAbsolute(path ?? "")) {
    throw new Error(`${label} must be an absolute path`);
  }
  const normalized = resolve(path);
  if (realpathSync(dirname(normalized)) !== secretRoot) {
    throw new Error(`${label} parent must be the exact worker secret root`);
  }
  if (existsSync(normalized)) {
    throw new Error(`${label} already exists; credential issue is create-only`);
  }
  return normalized;
}

function isContainedPath(parentPath, childPath) {
  const candidate = relative(parentPath, childPath);
  return candidate === ""
    || (candidate !== ".."
      && !candidate.startsWith(`..${sep}`)
      && !isAbsolute(candidate));
}

function assertNoSymlinkInLexicalPath(candidatePath, label) {
  const normalizedPath = ensureAbsolutePath(candidatePath, label);
  const rootPath = parse(normalizedPath).root;
  let currentPath = rootPath;
  const components = normalizedPath
    .slice(rootPath.length)
    .split(sep)
    .filter(Boolean);
  for (const component of components) {
    currentPath = resolve(currentPath, component);
    if (lstatSync(currentPath).isSymbolicLink()) {
      throw new Error(`${label} must not have a symbolic link ancestor`);
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command !== "issue") {
    throw new Error(
      "Usage: node scripts/youtube-extraction-worker-local-credential.mjs issue --jwt-keys-file <0600 local file> --secret-root <0700 dir> --token-file <new file> --metadata-output <new file> --generation <n> --release-sha <sha> --schema-identity <id> --allowed-snapshot-digest <digest> --ttl-seconds <seconds> --confirm-production LOCAL_FULL_PRODUCTION_WORKER_CREDENTIAL",
    );
  }
  if (options.confirmation !== CONFIRMATION) {
    throw new Error(`credential issue requires confirmation ${CONFIRMATION}`);
  }
  const secretRoot = validateYoutubeExtractionWorkerSecretRoot(options.secretRoot);
  assertNoSymlinkInLexicalPath(options.jwtKeysFile, "local jwt_keys");
  const jwtKeysFile = ensureRegularFile(options.jwtKeysFile, "local jwt_keys", {
    mode: 0o600,
    expectedUserId: process.getuid?.(),
  });
  if (isContainedPath(REPOSITORY_ROOT, jwtKeysFile)) {
    throw new Error("local jwt_keys must remain outside the repository");
  }
  if (isContainedPath(secretRoot, jwtKeysFile)) {
    throw new Error("local jwt_keys must remain outside the worker secret root");
  }
  const tokenFile = createOnlySecretPath(
    options.tokenFile,
    secretRoot,
    "token file",
  );
  const metadataOutput = createOnlySecretPath(
    options.metadataOutput,
    secretRoot,
    "metadata output",
  );
  const jwtKeys = JSON.parse(readFileSync(jwtKeysFile, "utf8"));
  const issued = issueYoutubeExtractionWorkerCredential({
    jwtKeys,
    generation: options.generation,
    releaseSha: options.releaseSha,
    schemaIdentity: options.schemaIdentity,
    allowedSnapshotDigest: options.allowedSnapshotDigest,
    ttlSeconds: options.ttlSeconds,
  });
  let tokenCreated = false;
  try {
    writeFileSync(tokenFile, `${issued.token}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    chmodSync(tokenFile, 0o600);
    tokenCreated = true;
    const credential = buildYoutubeExtractionWorkerCredentialState({
      tokenFile,
      generation: issued.metadata.generation,
      jtiHash: issued.jtiHash,
      expiresAt: issued.metadata.expires_at,
      releaseSha: issued.metadata.release_sha,
      schemaIdentity: issued.metadata.schema_identity,
      allowedSnapshotDigest: issued.metadata.allowed_snapshot_digest,
      secretRoot,
    });
    writeCredentialMetadata(metadataOutput, credential, { secretRoot });
    process.stdout.write(`${JSON.stringify({
      issued: true,
      generation: credential.generation,
      expires_at: credential.expires_at,
      release_sha: credential.release_sha,
      schema_identity: credential.schema_identity,
      allowed_snapshot_digest: credential.allowed_snapshot_digest,
      token_file: tokenFile,
      metadata_file: metadataOutput,
    }, null, 2)}\n`);
  } catch (error) {
    if (tokenCreated) rmSync(tokenFile, { force: true });
    rmSync(metadataOutput, { force: true });
    throw error;
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
