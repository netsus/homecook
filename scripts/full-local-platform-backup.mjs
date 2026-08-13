#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPlatformBackupAuthentication,
  buildDockerStorageVolumeCaptureInvocation,
  buildPinnedSupabaseCliInvocation,
  createFailSafeConsistentCutController,
  createEncryptedPlatformBackup,
  PINNED_SUPABASE_CLI_VERSION,
  PLATFORM_BACKUP_KEYCHAIN_ACCOUNT,
  PLATFORM_BACKUP_KEYCHAIN_SERVICE,
  listStoragePayloadPaths,
  platformBackupAuthenticationPath,
  verifyPlatformBackupAuthentication,
  withVerifiedPlatformBackup,
} from "./lib/full-local-platform-backup.mjs";
import {
  assertPrivateArtifactParent,
  buildFullLocalBackupReadinessEvidence,
  fullLocalBackupMetadataSha256,
  verifyFullLocalBackupReadiness,
} from "./lib/full-local-backup-readiness.mjs";
import {
  verifyFullLocalBackupKeyEscrowBinding,
  verifyFullLocalBackupKeyRecoveryIssuerAttestation,
} from "./lib/full-local-backup-key-recovery.mjs";
import { validateExternalSecretDirectory } from "./lib/full-local-production-runtime.mjs";
import { inventoryPlatformDataRelations } from "./lib/full-local-restore-cutover.mjs";
import { mapStorageRowsToPayloadReferences } from "./lib/isolated-local-backup-restore-drill.mjs";
import {
  makePostgresRoleDumpIdempotent,
  parseFullLocalProductionConfig,
  selectFullLocalProductionResources,
} from "./lib/full-local-production-resources.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KEYCHAIN_WRITER = join(ROOT, "infra/full-local-supabase/keychain-store.exp");
const DEFAULT_CONFIG = join(ROOT, "infra/full-local-supabase/.env.production.local");
const KEYCHAIN_SERVICE = PLATFORM_BACKUP_KEYCHAIN_SERVICE;
const KEYCHAIN_ACCOUNT = PLATFORM_BACKUP_KEYCHAIN_ACCOUNT;

function fail(message) {
  throw new Error(message);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: "utf8",
    env: options.env ?? process.env,
    maxBuffer: 64 * 1024 * 1024,
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    fail(options.failure ?? `${command} failed.`);
  }
  return result.stdout ?? "";
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail(`${name} requires a value.`);
  return value;
}

function rejectCredentialArguments(args) {
  const forbidden = ["--password", "--db-url", "--access-key", "--secret-key", "--backup-key"];
  if (args.some((argument) => forbidden.some((name) => argument === name || argument.startsWith(`${name}=`)))) {
    fail("Credentials may not be passed on the command line.");
  }
}

function keychainItemExists() {
  return spawnSync("security", [
    "find-generic-password",
    "-s",
    KEYCHAIN_SERVICE,
    "-a",
    KEYCHAIN_ACCOUNT,
  ], { stdio: ["ignore", "ignore", "ignore"] }).status === 0;
}

function loadBackupKey() {
  return run("security", [
    "find-generic-password",
    "-s",
    KEYCHAIN_SERVICE,
    "-a",
    KEYCHAIN_ACCOUNT,
    "-w",
  ], { failure: "The separate full-local backup key is unavailable in Keychain." }).trim();
}

function bootstrapBackupKey() {
  if (keychainItemExists()) {
    fail("The full-local backup key already exists; automatic replacement is blocked.");
  }
  const staging = mkdtempSync(join(tmpdir(), "homecook-backup-key-"));
  chmodSync(staging, 0o700);
  try {
    const secretPath = join(staging, "backup-key");
    writeFileSync(secretPath, randomBytes(48).toString("base64url"), { mode: 0o600 });
    chmodSync(secretPath, 0o600);
    run("expect", [KEYCHAIN_WRITER, KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, secretPath], {
      failure: "The full-local backup key could not be stored in Keychain.",
    });
    if (!keychainItemExists()) fail("The full-local backup key was not persisted.");
    return true;
  } finally {
    rmSync(staging, { force: true, recursive: true });
  }
}

function requiredAbsolutePath(args, name) {
  const value = optionValue(args, name);
  if (!value || !isAbsolute(value)) fail(`${name} requires an absolute path.`);
  return resolve(value);
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function exactConfigPath(args) {
  return resolve(optionValue(args, "--config") ?? DEFAULT_CONFIG);
}

function dockerInventory(kind) {
  const listArgs = kind === "volume"
    ? ["volume", "ls", "--quiet"]
    : ["container", "ls", "--all", "--quiet"];
  const ids = run("docker", listArgs, { failure: `Docker ${kind} inventory failed.` })
    .split(/\r?\n/u)
    .filter(Boolean);
  if (ids.length === 0) return [];
  return JSON.parse(run(
    "docker",
    kind === "volume" ? ["volume", "inspect", ...ids] : ["container", "inspect", ...ids],
    { failure: `Docker ${kind} inspection failed.` },
  ));
}

function productionResourceController(args) {
  const path = exactConfigPath(args);
  if ((statSync(path).mode & 0o777) !== 0o600) {
    fail("Full-local production config must use exact mode 0600.");
  }
  const config = parseFullLocalProductionConfig(readFileSync(path, "utf8"));
  const containers = dockerInventory("container");
  const volumes = dockerInventory("volume");
  const resources = selectFullLocalProductionResources({ config, containers, volumes });
  const requiredWriterServices = ["api-gateway", "auth", "postgrest", "storage"];
  const optionalWriterServices = ["realtime"];
  const productionContainers = containers.filter((container) =>
    container?.Config?.Labels?.["com.docker.compose.project"] === resources.composeProject);
  const writers = [];
  for (const service of [...requiredWriterServices, ...optionalWriterServices]) {
    const matches = productionContainers.filter((container) =>
      container?.Config?.Labels?.["com.docker.compose.service"] === service);
    const required = requiredWriterServices.includes(service);
    if (matches.length !== (required ? 1 : Math.min(matches.length, 1))) {
      fail("The exact production writer set is incomplete or ambiguous.");
    }
    if (matches.length === 1) {
      if (matches[0]?.State?.Running !== true) {
        fail("The exact production writer set is not running.");
      }
      writers.push(matches[0].Id);
    }
  }
  const root = mkdtempSync(join(tmpdir(), "homecook-storage-backup-"));
  chmodSync(root, 0o700);
  const archiveDirectory = join(root, "archive");
  const sourceDirectory = join(root, "snapshot");
  const provenance = {};
  let rows;
  const cut = createFailSafeConsistentCutController({
    startWriter: (writer) => setContainerState(
      "start",
      [writer],
      "Production consistent cut release failed.",
    ),
    stopWriter: (writer) => setContainerState(
      "stop",
      [writer],
      "Production consistent cut failed.",
    ),
    writers,
  });
  return {
    cleanup: () => rmSync(root, { force: true, recursive: true }),
    database: {
      dumpComponents: (staging) => {
        Object.assign(provenance, readProductionDatabaseProvenance(resources));
        dumpFullLocalProductionDatabase({
          container: resources.postgresContainerId,
          staging,
        });
      },
      provenance,
      sourceIdentity: [
        "docker-compose",
        resources.composeProject,
        resources.postgresContainerName,
        resources.postgresVolumeName,
      ].join(":"),
    },
    config,
    resources,
    storage: {
      beginConsistentCut: cut.beginConsistentCut,
      captureSource: () => {
        rows = readStorageRows(resources.postgresContainerId);
        const invocation = buildDockerStorageVolumeCaptureInvocation({
          archiveDirectory,
          volumeName: resources.storageVolumeName,
        });
        mkdirSync(archiveDirectory, { recursive: true, mode: 0o700 });
        run(invocation.command, invocation.args, {
          failure: "Production Storage volume capture failed.",
        });
        mkdirSync(sourceDirectory, { recursive: true, mode: 0o700 });
        run("tar", [
          "-C",
          sourceDirectory,
          "-xf",
          join(archiveDirectory, "storage.payload.tar"),
        ], { failure: "Production Storage snapshot extraction failed." });
      },
      endConsistentCut: cut.endConsistentCut,
      references: () => mapStorageRowsToPayloadReferences(
        rows,
        listStoragePayloadPaths(sourceDirectory),
      ),
      sourceDirectory,
      sourceIdentity: [
        "docker-compose-volume",
        resources.composeProject,
        resources.storageVolumeName,
      ].join(":"),
    },
  };
}

function existingMode600Artifact(path, label) {
  if (!existsSync(path)) fail(`${label} must reference an existing file.`);
  const directStat = lstatSync(path);
  if (directStat.isSymbolicLink()) {
    fail(`${label} must not reference a symbolic link.`);
  }
  const canonicalPath = realpathSync(path);
  const stat = statSync(canonicalPath);
  if (!stat.isFile() || (stat.mode & 0o777) !== 0o600) {
    fail(`${label} must reference a regular mode 0600 file.`);
  }
  return canonicalPath;
}

function existingMode600Path(args, name) {
  return existingMode600Artifact(requiredAbsolutePath(args, name), name);
}

function sha256File(path) {
  const output = run("openssl", ["dgst", "-sha256", "-r", path], {
    failure: "Backup readiness archive digest failed.",
  });
  const digest = /^([0-9a-f]{64})\s/u.exec(output)?.[1];
  if (!digest) fail("Backup readiness archive digest is invalid.");
  return digest;
}

async function recordBackupReadiness(args) {
  if (optionValue(args, "--confirm-off-mac-copy") !== "OFF_MAC_COPY_VERIFIED") {
    fail("record-readiness requires --confirm-off-mac-copy OFF_MAC_COPY_VERIFIED.");
  }
  const archive = existingMode600Path(args, "--archive");
  const offMacCopy = existingMode600Path(args, "--off-mac-copy");
  const restoreManifestPath = existingMode600Path(args, "--restore-manifest");
  const keyRecoveryManifestPath = existingMode600Path(
    args,
    "--key-recovery-manifest",
  );
  const output = requiredAbsolutePath(args, "--output");
  if (archive === offMacCopy) fail("The off-Mac copy must use a distinct path.");
  if (statSync(archive).dev === statSync(offMacCopy).dev) {
    fail("The off-Mac copy must be on a distinct filesystem device.");
  }
  for (const path of [
    archive,
    keyRecoveryManifestPath,
    offMacCopy,
    restoreManifestPath,
  ]) {
    assertPrivateArtifactParent(path);
    assertPrivateArtifactParent(platformBackupAuthenticationPath(path));
    validateExternalSecretDirectory({
      repositoryRoot: ROOT,
      secretDirectory: dirname(path),
    });
  }
  validateExternalSecretDirectory({
    repositoryRoot: ROOT,
    secretDirectory: dirname(output),
  });
  assertPrivateArtifactParent(output);
  if (existsSync(output)) fail("Backup readiness output already exists.");
  const readinessAuthenticationPath = platformBackupAuthenticationPath(output);
  if (existsSync(readinessAuthenticationPath)) {
    fail("Backup readiness authentication output already exists.");
  }
  const controller = productionResourceController(args);
  try {
    if (resolve(controller.config.FULL_LOCAL_BACKUP_READINESS_PATH ?? "") !== output) {
      fail("--output must equal FULL_LOCAL_BACKUP_READINESS_PATH in production config.");
    }
    const backupKey = loadBackupKey();
    const restoreAuthenticationPath = existingMode600Artifact(
      platformBackupAuthenticationPath(restoreManifestPath),
      "restore manifest authentication",
    );
    verifyPlatformBackupAuthentication({
      archive: restoreManifestPath,
      archiveBytes: readFileSync(restoreManifestPath),
      authentication: JSON.parse(readFileSync(restoreAuthenticationPath, "utf8")),
      backupKey,
    });
    const keyRecoveryAuthenticationPath = existingMode600Artifact(
      platformBackupAuthenticationPath(keyRecoveryManifestPath),
      "backup key recovery authentication",
    );
    const keyRecoveryManifestBytes = readFileSync(keyRecoveryManifestPath);
    verifyPlatformBackupAuthentication({
      archive: keyRecoveryManifestPath,
      archiveBytes: keyRecoveryManifestBytes,
      authentication: JSON.parse(readFileSync(keyRecoveryAuthenticationPath, "utf8")),
      backupKey,
    });
    const keyRecoveryManifest = JSON.parse(keyRecoveryManifestBytes.toString("utf8"));
    const escrowEnvelopePath = existingMode600Artifact(
      keyRecoveryManifest.escrow_envelope_path,
      "backup key escrow envelope",
    );
    const escrowAuthenticationPath = existingMode600Artifact(
      platformBackupAuthenticationPath(escrowEnvelopePath),
      "backup key escrow authentication",
    );
    for (const path of [escrowEnvelopePath, escrowAuthenticationPath]) {
      assertPrivateArtifactParent(path);
      validateExternalSecretDirectory({
        repositoryRoot: ROOT,
        secretDirectory: dirname(path),
      });
    }
    const escrowDevice = statSync(escrowEnvelopePath).dev;
    if (keyRecoveryManifest.archive_device_id !== String(statSync(offMacCopy).dev)) {
      fail("Backup key recovery device identity does not match the mounted media.");
    }
    verifyFullLocalBackupKeyEscrowBinding({
      archiveDeviceIds: [String(statSync(archive).dev), String(statSync(offMacCopy).dev)],
      manifest: keyRecoveryManifest,
      observedDeviceId: String(escrowDevice),
      observedPath: escrowEnvelopePath,
      observedSha256: sha256File(escrowEnvelopePath),
    });
    const escrowEnvelopeBytes = readFileSync(escrowEnvelopePath);
    verifyPlatformBackupAuthentication({
      archive: escrowEnvelopePath,
      archiveBytes: escrowEnvelopeBytes,
      authentication: JSON.parse(readFileSync(escrowAuthenticationPath, "utf8")),
      backupKey,
    });
    const escrowEnvelope = JSON.parse(escrowEnvelopeBytes.toString("utf8"));
    if (
      escrowEnvelope?.format !== "homecook-full-local-backup-key-escrow-v1"
      || escrowEnvelope?.cipher !== "AES-256-GCM"
      || escrowEnvelope?.kdf !== "scrypt"
    ) {
      fail("Backup key escrow envelope format is invalid.");
    }
    verifyFullLocalBackupKeyRecoveryIssuerAttestation({
      envelope: escrowEnvelope,
      evidence: keyRecoveryManifest,
    });
    const metadata = await withVerifiedPlatformBackup({
      archive,
      backupKey,
      consume: ({ metadata: verified }) => verified,
    });
    const copyMetadata = await withVerifiedPlatformBackup({
      archive: offMacCopy,
      backupKey,
      consume: ({ metadata: verified }) => verified,
    });
    if (JSON.stringify(copyMetadata) !== JSON.stringify(metadata)) {
      fail("The off-Mac copy metadata does not match the production backup.");
    }
    const archiveSha256 = sha256File(archive);
    const offMacCopySha256 = sha256File(offMacCopy);
    const evidence = buildFullLocalBackupReadinessEvidence({
      archivePath: archive,
      archiveSha256,
      backupMetadata: metadata,
      keyRecoveryEscrowEnvelope: escrowEnvelope,
      keyRecoveryManifest,
      keyRecoveryManifestPath,
      keyRecoveryManifestSha256: sha256File(keyRecoveryManifestPath),
      now: new Date().toISOString(),
      offMacCopyPath: offMacCopy,
      offMacCopySha256,
      restoreManifest: JSON.parse(readFileSync(restoreManifestPath, "utf8")),
      restoreManifestPath,
      restoreManifestSha256: sha256File(restoreManifestPath),
    });
    const readiness = verifyFullLocalBackupReadiness({
      authenticatedBackupMetadataSha256: fullLocalBackupMetadataSha256(metadata),
      evidence,
      evidenceFileMode: 0o600,
      observedEscrowFiles: {
        [escrowEnvelopePath]: keyRecoveryManifest.escrow_envelope_sha256,
      },
      observedFiles: {
        [archive]: archiveSha256,
        [offMacCopy]: offMacCopySha256,
      },
      production: controller.resources,
    });
    const evidenceContents = `${JSON.stringify(evidence, null, 2)}\n`;
    writeFileSync(output, evidenceContents, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    chmodSync(output, 0o600);
    const authentication = buildPlatformBackupAuthentication({
      archive: output,
      archiveBytes: Buffer.from(evidenceContents, "utf8"),
      backupKey,
    });
    writeFileSync(
      readinessAuthenticationPath,
      `${JSON.stringify(authentication, null, 2)}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
    chmodSync(readinessAuthenticationPath, 0o600);
    return { evidence: output, ...readiness };
  } finally {
    controller.cleanup();
  }
}

function setContainerState(action, names, failure) {
  if (names.length > 0) run("docker", [action, ...names], { failure });
}

function runToFile(command, args, path, failure) {
  const descriptor = openSync(path, "wx", 0o600);
  try {
    const result = spawnSync(command, args, {
      cwd: ROOT,
      encoding: "utf8",
      env: process.env,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ["ignore", descriptor, "pipe"],
    });
    if (result.status !== 0) fail(failure);
  } finally {
    closeSync(descriptor);
  }
}

function dumpFullLocalProductionDatabase({ container, staging }) {
  const common = ["exec", container];
  const roleDump = run("docker", [
    ...common,
    "pg_dumpall",
    "--roles-only",
    "--no-role-passwords",
    "--username",
    "supabase_admin",
  ], { failure: "Production database roles.sql dump failed." });
  writeFileSync(
    join(staging, "roles.sql"),
    makePostgresRoleDumpIdempotent(roleDump),
    { encoding: "utf8", flag: "wx", mode: 0o600 },
  );
  const dumps = [
    {
      args: [...common, "pg_dump", "--schema-only", "--username", "supabase_admin", "--dbname", "postgres"],
      file: "schema.sql",
    },
    {
      args: [...common, "pg_dump", "--data-only", "--username", "supabase_admin", "--dbname", "postgres"],
      file: "data.sql",
    },
  ];
  for (const dump of dumps) {
    runToFile(
      "docker",
      dump.args,
      join(staging, dump.file),
      `Production database ${dump.file} dump failed.`,
    );
  }
}

function readProductionDatabaseProvenance(resources) {
  const catalog = run("docker", [
    "exec",
    resources.postgresContainerId,
    "psql",
    "--tuples-only",
    "--no-align",
    "--username",
    "supabase_admin",
    "--dbname",
    "postgres",
    "--command",
    "select nspname from pg_namespace order by nspname;",
  ], { failure: "Production schema catalog provenance failed." });
  const identity = run("docker", [
    "exec",
    resources.postgresContainerId,
    "psql",
    "--tuples-only",
    "--no-align",
    "--field-separator",
    "|",
    "--username",
    "supabase_admin",
    "--dbname",
    "postgres",
    "--command",
    "select current_database(), current_setting('server_version_num'), count(*) from pg_namespace;",
  ], { failure: "Production database identity provenance failed." }).trim().split("|");
  if (identity.length !== 3 || identity[0] !== "postgres" || !/^\d+$/u.test(identity[1])) {
    fail("Production database identity provenance is invalid.");
  }
  return Object.freeze({
    compose_project: resources.composeProject,
    container_id: resources.postgresContainerId,
    container_name: resources.postgresContainerName,
    database: identity[0],
    image: resources.postgresImage,
    postgres_volume: resources.postgresVolumeName,
    schema_catalog_sha256: createHash("sha256").update(catalog, "utf8").digest("hex"),
    schema_count: Number(identity[2]),
    server_version_num: identity[1],
  });
}

function readStorageRows(databaseContainer) {
  const sql = `
    select coalesce(json_agg(json_build_object(
      'bucket_id', bucket_id,
      'name', name,
      'version', version::text
    ) order by bucket_id, name), '[]'::json)::text
    from storage.objects;
  `;
  return JSON.parse(run("docker", [
    "exec",
    databaseContainer,
    "psql",
    "--tuples-only",
    "--no-align",
    "--username",
    "supabase_admin",
    "--dbname",
    "postgres",
    "--command",
    sql,
  ], { failure: "Local Storage reference inventory failed." }).trim());
}

function runPinnedSupabase(args, failure) {
  const invocation = buildPinnedSupabaseCliInvocation(args);
  return run(invocation.command, invocation.args, { failure });
}

function assertPinnedSupabaseCli() {
  const observed = runPinnedSupabase(["--version"], "Pinned Supabase CLI version check failed.")
    .trim();
  if (observed !== PINNED_SUPABASE_CLI_VERSION) {
    fail("Pinned Supabase CLI version mismatch.");
  }
  return observed;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  rejectCredentialArguments(args);
  switch (command) {
    case "bootstrap-key":
      bootstrapBackupKey();
      print({ keychain_account: KEYCHAIN_ACCOUNT, keychain_service: KEYCHAIN_SERVICE, status: "PASS" });
      break;
    case "backup": {
      const output = requiredAbsolutePath(args, "--output");
      const controller = productionResourceController(args);
      try {
        const result = createEncryptedPlatformBackup({
          backupKey: loadBackupKey(),
          database: controller.database,
          output,
          repositoryRoot: ROOT,
          storage: controller.storage,
        });
        print({ ...result, cli_version: PINNED_SUPABASE_CLI_VERSION, status: "PASS" });
      } finally {
        controller.cleanup();
      }
      break;
    }
    case "inventory": {
      const staging = mkdtempSync(join(tmpdir(), "homecook-platform-inventory-"));
      chmodSync(staging, 0o700);
      const controller = productionResourceController(args);
      try {
        const dataPath = join(staging, "data.sql");
        const cliVersion = assertPinnedSupabaseCli();
        controller.database.dumpComponents(staging);
        print({
          cli_version: cliVersion,
          database_provenance: controller.database.provenance,
          relations: inventoryPlatformDataRelations(readFileSync(dataPath, "utf8")),
          status: "PASS",
        });
      } finally {
        controller.cleanup();
        rmSync(staging, { force: true, recursive: true });
      }
      break;
    }
    case "verify-backup": {
      const archive = requiredAbsolutePath(args, "--archive");
      const result = await withVerifiedPlatformBackup({
        archive,
        backupKey: loadBackupKey(),
        consume: ({ metadata }) => ({
          created_at: metadata.created_at,
          format: metadata.format,
          relation_classification_digest: metadata.manifest.relation_classification_digest,
          storage_payload_included: metadata.storage_payload_included,
          transient_promote_count: metadata.manifest.transient_promote_count,
          unclassified_count: metadata.manifest.unclassified.length,
        }),
      });
      print({ ...result, status: "PASS" });
      break;
    }
    case "record-readiness":
      print({ ...await recordBackupReadiness(args), status: "PASS" });
      break;
    default:
      fail(`Unknown command: ${command ?? "<missing>"}`);
  }
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    error: error instanceof Error ? error.message : "Unknown failure.",
    status: "FAIL",
  })}\n`);
  process.exit(1);
});
