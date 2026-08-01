import { spawnSync } from "node:child_process";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

import { buildSanitizedPlatformData } from "./full-local-restore-cutover.mjs";

export const PLATFORM_BACKUP_FORMAT = "homecook-full-local-platform-v1";
export const PLATFORM_BACKUP_AUTH_FORMAT = "homecook-full-local-platform-auth-v1";
export const PLATFORM_BACKUP_KEY_ENV = "HOMECOOK_FULL_LOCAL_BACKUP_KEY";
export const PLATFORM_BACKUP_KEYCHAIN_ACCOUNT = "platform-backup-encryption-key";
export const PLATFORM_BACKUP_KEYCHAIN_SERVICE = "homecook-full-local-backup-v1";
const PBKDF2_ITERATIONS = 600_000;
const MAC_KEY_CONTEXT = "homecook-full-local-platform-backup-mac-key-v1";
const BUNDLE_ENTRIES = Object.freeze([
  "data.sanitized.sql",
  "manifest.json",
  "roles.sql",
  "schema.sql",
]);

function defaultRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env ?? process.env,
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(options.failure ?? `${command} failed`);
  }
  return result.stdout ?? "";
}

function defaultHashFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function defaults() {
  return {
    chmod: chmodSync,
    createTempDirectory: () => mkdtempSync(join(tmpdir(), "homecook-platform-backup-")),
    exists: existsSync,
    hashFile: defaultHashFile,
    now: () => new Date().toISOString(),
    read: (path) => readFileSync(path, "utf8"),
    readBuffer: (path) => readFileSync(path),
    remove: rmSync,
    run: defaultRun,
    stat: statSync,
    write: (path, contents) => writeFileSync(path, contents, { encoding: "utf8", mode: 0o600 }),
  };
}

export function platformBackupAuthenticationPath(archive) {
  return `${archive}.auth.json`;
}

function backupMacKey(backupKey) {
  return createHmac("sha256", backupKey).update(MAC_KEY_CONTEXT).digest();
}

export function buildPlatformBackupAuthentication({ archive, archiveBytes, backupKey }) {
  const archiveSha256 = createHash("sha256").update(archiveBytes).digest("hex");
  return Object.freeze({
    archive: basename(archive),
    archive_sha256: archiveSha256,
    format: PLATFORM_BACKUP_AUTH_FORMAT,
    hmac_sha256: createHmac("sha256", backupMacKey(backupKey))
      .update(archiveBytes)
      .digest("hex"),
  });
}

export function verifyPlatformBackupAuthentication({
  archive,
  archiveBytes,
  authentication,
  backupKey,
}) {
  const observed = buildPlatformBackupAuthentication({ archive, archiveBytes, backupKey });
  if (
    authentication?.format !== PLATFORM_BACKUP_AUTH_FORMAT
    || authentication.archive !== observed.archive
    || authentication.archive_sha256 !== observed.archive_sha256
    || typeof authentication.hmac_sha256 !== "string"
    || !/^[0-9a-f]{64}$/u.test(authentication.hmac_sha256)
  ) {
    throw new Error("Platform backup authentication metadata is invalid");
  }
  const expectedMac = Buffer.from(authentication.hmac_sha256, "hex");
  const observedMac = Buffer.from(observed.hmac_sha256, "hex");
  if (!timingSafeEqual(expectedMac, observedMac)) {
    throw new Error("Platform backup authentication failed");
  }
  return observed;
}

export function assertExternalBackupPath({ output, repositoryRoot }) {
  if (typeof output !== "string" || !isAbsolute(output) || !output.endsWith(".tar.gz.enc")) {
    throw new Error("Backup output must be an absolute .tar.gz.enc path");
  }
  const normalizedOutput = resolve(output);
  const normalizedRepository = resolve(repositoryRoot);
  const outputRelative = relative(normalizedRepository, normalizedOutput);
  if (outputRelative === "" || (!outputRelative.startsWith("..") && !isAbsolute(outputRelative))) {
    throw new Error("Backup output must stay outside the repository");
  }
  return normalizedOutput;
}

export function buildPlatformDumpCommands(directory) {
  return [
    ["db", "dump", "--linked", "--file", join(directory, "roles.sql"), "--role-only"],
    ["db", "dump", "--linked", "--file", join(directory, "schema.sql")],
    ["db", "dump", "--linked", "--file", join(directory, "data.sql"), "--use-copy", "--data-only"],
  ];
}

export function assertSafeBackupEntries(entries) {
  const observed = entries.split(/\r?\n/u).filter(Boolean).sort();
  if (JSON.stringify(observed) !== JSON.stringify([...BUNDLE_ENTRIES].sort())) {
    throw new Error("Encrypted platform backup has unexpected entries");
  }
  return true;
}

function validSha256(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

export function verifyPlatformBackupMetadata(metadata, observed) {
  if (metadata?.format !== PLATFORM_BACKUP_FORMAT) {
    throw new Error("Platform backup format is invalid");
  }
  if (
    metadata.manifest?.transient_promote_count !== 0
    || !Array.isArray(metadata.manifest?.unclassified)
    || metadata.manifest.unclassified.length !== 0
  ) {
    throw new Error("Platform backup contains transient or unclassified relations");
  }
  if (!validSha256(metadata.manifest?.relation_classification_digest)) {
    throw new Error("Platform backup relation classification digest is invalid");
  }
  if (metadata.storage_payload_included !== false) {
    throw new Error("Platform backup Storage payload declaration is invalid");
  }
  for (const component of ["roles_sha256", "schema_sha256", "data_sha256"]) {
    if (!validSha256(metadata.components?.[component]) || metadata.components[component] !== observed?.[component]) {
      throw new Error(`Platform backup ${component} mismatch`);
    }
  }
  return true;
}

export function createEncryptedPlatformBackup({
  backupKey,
  dependencies: suppliedDependencies,
  output,
  repositoryRoot,
}) {
  const destination = assertExternalBackupPath({ output, repositoryRoot });
  if (typeof backupKey !== "string" || backupKey.length < 24) {
    throw new Error("A separate backup encryption key is required");
  }
  const dependencies = { ...defaults(), ...suppliedDependencies };
  const authenticationPath = platformBackupAuthenticationPath(destination);
  if (dependencies.exists(destination) || dependencies.exists(authenticationPath)) {
    throw new Error("Backup output already exists");
  }

  const staging = dependencies.createTempDirectory();
  dependencies.chmod(staging, 0o700);
  try {
    for (const args of buildPlatformDumpCommands(staging)) {
      if (args.includes("--db-url") || args.includes("--password")) {
        throw new Error("Database credentials may not be passed on the command line");
      }
      dependencies.run("supabase", args, {
        cwd: repositoryRoot,
        failure: "Supabase platform dump failed",
      });
    }

    const sanitized = buildSanitizedPlatformData(
      dependencies.read(join(staging, "data.sql")),
    );
    const sanitizedPath = join(staging, "data.sanitized.sql");
    dependencies.write(sanitizedPath, sanitized.sql);
    dependencies.remove(join(staging, "data.sql"), { force: true });

    const components = {
      data_sha256: dependencies.hashFile(sanitizedPath),
      roles_sha256: dependencies.hashFile(join(staging, "roles.sql")),
      schema_sha256: dependencies.hashFile(join(staging, "schema.sql")),
    };
    const metadata = {
      components,
      created_at: dependencies.now(),
      encryption: {
        cipher: "AES-256-CBC",
        key_source: "separate-process-only-secret",
        pbkdf2_iterations: PBKDF2_ITERATIONS,
      },
      format: PLATFORM_BACKUP_FORMAT,
      manifest: sanitized.manifest,
      storage_payload_included: false,
    };
    dependencies.write(
      join(staging, "manifest.json"),
      `${JSON.stringify(metadata, null, 2)}\n`,
    );

    const bundle = join(staging, "platform.tar.gz");
    dependencies.run("tar", ["-C", staging, "-czf", bundle, ...BUNDLE_ENTRIES], {
      failure: "Platform backup bundle creation failed",
    });
    dependencies.run("openssl", [
      "enc",
      "-aes-256-cbc",
      "-salt",
      "-pbkdf2",
      "-iter",
      String(PBKDF2_ITERATIONS),
      "-pass",
      `env:${PLATFORM_BACKUP_KEY_ENV}`,
      "-in",
      bundle,
      "-out",
      destination,
    ], {
      env: { ...process.env, [PLATFORM_BACKUP_KEY_ENV]: backupKey },
      failure: "Platform backup encryption failed",
    });
    dependencies.chmod(destination, 0o600);
    const authentication = buildPlatformBackupAuthentication({
      archive: destination,
      archiveBytes: dependencies.readBuffer(destination),
      backupKey,
    });
    dependencies.write(authenticationPath, `${JSON.stringify(authentication, null, 2)}\n`);
    dependencies.chmod(authenticationPath, 0o600);

    return {
      archive: destination,
      archive_authentication: authenticationPath,
      archive_sha256: authentication.archive_sha256,
      created_at: metadata.created_at,
      relation_classification_digest: sanitized.manifest.relation_classification_digest,
      transient_promote_count: 0,
      unclassified_count: 0,
      storage_payload_included: false,
    };
  } catch (error) {
    dependencies.remove(destination, { force: true });
    dependencies.remove(authenticationPath, { force: true });
    throw error;
  } finally {
    dependencies.remove(staging, { force: true, recursive: true });
  }
}

export async function withVerifiedPlatformBackup({
  archive,
  backupKey,
  consume = ({ metadata }) => metadata,
  dependencies: suppliedDependencies,
}) {
  if (!isAbsolute(archive) || typeof backupKey !== "string" || backupKey.length < 24) {
    throw new Error("An absolute archive path and separate backup key are required");
  }
  const dependencies = { ...defaults(), ...suppliedDependencies };
  const authenticationPath = platformBackupAuthenticationPath(archive);
  for (const [path, label] of [
    [archive, "Platform backup archive"],
    [authenticationPath, "Platform backup authentication"],
  ]) {
    if (!dependencies.exists(path)) {
      throw new Error(`${label} is missing`);
    }
    const stat = dependencies.stat(path);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600) {
      throw new Error(`${label} must be a regular mode 0600 file`);
    }
  }
  verifyPlatformBackupAuthentication({
    archive,
    archiveBytes: dependencies.readBuffer(archive),
    authentication: JSON.parse(dependencies.read(authenticationPath)),
    backupKey,
  });
  const staging = dependencies.createTempDirectory();
  dependencies.chmod(staging, 0o700);
  try {
    const bundle = join(staging, "platform.tar.gz");
    dependencies.run("openssl", [
      "enc",
      "-d",
      "-aes-256-cbc",
      "-pbkdf2",
      "-iter",
      String(PBKDF2_ITERATIONS),
      "-pass",
      `env:${PLATFORM_BACKUP_KEY_ENV}`,
      "-in",
      archive,
      "-out",
      bundle,
    ], { env: { ...process.env, [PLATFORM_BACKUP_KEY_ENV]: backupKey } });
    assertSafeBackupEntries(dependencies.run("tar", ["-tzf", bundle]));
    dependencies.run("tar", ["-C", staging, "-xzf", bundle]);
    const metadata = JSON.parse(dependencies.read(join(staging, "manifest.json")));
    const observed = {
      data_sha256: dependencies.hashFile(join(staging, "data.sanitized.sql")),
      roles_sha256: dependencies.hashFile(join(staging, "roles.sql")),
      schema_sha256: dependencies.hashFile(join(staging, "schema.sql")),
    };
    verifyPlatformBackupMetadata(metadata, observed);
    return await consume({
      dataPath: join(staging, "data.sanitized.sql"),
      metadata,
      rolesPath: join(staging, "roles.sql"),
      schemaPath: join(staging, "schema.sql"),
    });
  } finally {
    dependencies.remove(staging, { force: true, recursive: true });
  }
}
