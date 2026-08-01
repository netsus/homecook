#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createEncryptedPlatformBackup,
  PLATFORM_BACKUP_KEYCHAIN_ACCOUNT,
  PLATFORM_BACKUP_KEYCHAIN_SERVICE,
  withVerifiedPlatformBackup,
} from "./lib/full-local-platform-backup.mjs";
import { inventoryPlatformDataRelations } from "./lib/full-local-restore-cutover.mjs";

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
      const result = createEncryptedPlatformBackup({
        backupKey: loadBackupKey(),
        output,
        repositoryRoot: ROOT,
      });
      print({ ...result, status: "PASS" });
      break;
    }
    case "inventory": {
      const staging = mkdtempSync(join(tmpdir(), "homecook-platform-inventory-"));
      chmodSync(staging, 0o700);
      try {
        const dataPath = join(staging, "data.sql");
        run("supabase", ["db", "dump", "--linked", "--file", dataPath, "--use-copy", "--data-only"], {
          failure: "Supabase platform inventory dump failed.",
        });
        print({
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
