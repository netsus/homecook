#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDockerStorageVolumeCaptureInvocation,
  buildPinnedSupabaseCliInvocation,
  createEncryptedPlatformBackup,
  PINNED_SUPABASE_CLI_VERSION,
  PLATFORM_BACKUP_KEYCHAIN_ACCOUNT,
  PLATFORM_BACKUP_KEYCHAIN_SERVICE,
  listStoragePayloadPaths,
  withVerifiedPlatformBackup,
} from "./lib/full-local-platform-backup.mjs";
import { inventoryPlatformDataRelations } from "./lib/full-local-restore-cutover.mjs";
import { mapStorageRowsToPayloadReferences } from "./lib/isolated-local-backup-restore-drill.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const KEYCHAIN_WRITER = join(ROOT, "infra/full-local-supabase/keychain-store.exp");
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

function localProjectId() {
  const config = readFileSync(join(ROOT, "supabase/config.toml"), "utf8");
  const projectId = config.match(/^project_id\s*=\s*"([a-z0-9_-]+)"\s*$/mu)?.[1];
  if (!projectId || !/^[a-z0-9][a-z0-9_-]{2,63}$/u.test(projectId)) {
    fail("Local Supabase project identity is invalid.");
  }
  return projectId;
}

function assertLocalResource(kind, name) {
  const args = kind === "volume"
    ? ["volume", "inspect", name]
    : ["container", "inspect", name];
  run("docker", args, { failure: `Required local Supabase ${kind} is unavailable.` });
}

function runningLocalContainers(names) {
  return names.filter((name) => {
    assertLocalResource("container", name);
    return run("docker", ["inspect", "--format", "{{.State.Running}}", name]).trim()
      === "true";
  });
}

function setContainerState(action, names, failure) {
  if (names.length > 0) run("docker", [action, ...names], { failure });
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
    "postgres",
    "--dbname",
    "postgres",
    "--command",
    sql,
  ], { failure: "Local Storage reference inventory failed." }).trim());
}

function localStorageController() {
  const projectId = localProjectId();
  const databaseContainer = `supabase_db_${projectId}`;
  const volumeName = `supabase_storage_${projectId}`;
  assertLocalResource("container", databaseContainer);
  assertLocalResource("volume", volumeName);
  const writers = runningLocalContainers([
    `supabase_auth_${projectId}`,
    `supabase_realtime_${projectId}`,
    `supabase_rest_${projectId}`,
    `supabase_storage_${projectId}`,
  ]);
  const root = mkdtempSync(join(tmpdir(), "homecook-storage-backup-"));
  chmodSync(root, 0o700);
  const archiveDirectory = join(root, "archive");
  const sourceDirectory = join(root, "snapshot");
  let rows;
  return {
    cleanup: () => rmSync(root, { force: true, recursive: true }),
    storage: {
      beginConsistentCut: () => setContainerState(
        "stop",
        writers,
        "Local consistent cut failed.",
      ),
      captureSource: () => {
        rows = readStorageRows(databaseContainer);
        const invocation = buildDockerStorageVolumeCaptureInvocation({
          archiveDirectory,
          volumeName,
        });
        mkdirSync(archiveDirectory, { recursive: true, mode: 0o700 });
        run(invocation.command, invocation.args, {
          failure: "Local Storage volume capture failed.",
        });
        mkdirSync(sourceDirectory, { recursive: true, mode: 0o700 });
        run("tar", [
          "-C",
          sourceDirectory,
          "-xf",
          join(archiveDirectory, "storage.payload.tar"),
        ], { failure: "Local Storage snapshot extraction failed." });
      },
      endConsistentCut: () => setContainerState(
        "start",
        writers,
        "Local consistent cut release failed.",
      ),
      references: () => mapStorageRowsToPayloadReferences(
        rows,
        listStoragePayloadPaths(sourceDirectory),
      ),
      sourceDirectory,
      sourceIdentity: `docker-volume:${volumeName}`,
    },
  };
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
      const controller = localStorageController();
      try {
        const result = createEncryptedPlatformBackup({
          backupKey: loadBackupKey(),
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
      try {
        const dataPath = join(staging, "data.sql");
        const cliVersion = assertPinnedSupabaseCli();
        runPinnedSupabase(
          ["db", "dump", "--local", "--file", dataPath, "--use-copy", "--data-only"],
          "Supabase platform inventory dump failed.",
        );
        print({
          cli_version: cliVersion,
          relations: inventoryPlatformDataRelations(readFileSync(dataPath, "utf8")),
          status: "PASS",
        });
      } finally {
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
