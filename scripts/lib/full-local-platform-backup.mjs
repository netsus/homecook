import { spawnSync } from "node:child_process";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

import {
  buildPlatformServiceRestoreAttestation,
  buildSanitizedPlatformData,
  digestSemanticPlatformDataSql,
} from "./full-local-restore-cutover.mjs";

export const PLATFORM_BACKUP_FORMAT = "homecook-full-local-platform-v5";
export const PLATFORM_BACKUP_AUTH_FORMAT = "homecook-full-local-platform-auth-v1";
export const PLATFORM_BACKUP_KEY_ENV = "HOMECOOK_FULL_LOCAL_BACKUP_KEY";
export const PLATFORM_BACKUP_KEYCHAIN_ACCOUNT = "platform-backup-encryption-key";
export const PLATFORM_BACKUP_KEYCHAIN_SERVICE = "homecook-full-local-backup-v1";
export const PINNED_SUPABASE_CLI_VERSION = "2.110.0";
export const PINNED_STORAGE_ARCHIVE_IMAGE =
  "supabase/storage-api@sha256:9326eb9c6b74c0a5ba393ab46a08a51d16bc5ea5f2978fc5b0f17fc67c64a4de";
export const PINNED_STORAGE_ARCHIVE_PLATFORM = "linux/arm64";
const PBKDF2_ITERATIONS = 600_000;
const MAC_KEY_CONTEXT = "homecook-full-local-platform-backup-mac-key-v1";
const BUNDLE_ENTRIES = Object.freeze([
  "data.sanitized.sql",
  "manifest.json",
  "roles.sql",
  "schema.sql",
  "storage.payload.tar",
]);

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

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

export function buildPlatformServiceSchemaCatalogSql() {
  return `
with scoped_relations as (
  select
    n.nspname as schema_name,
    c.relname as relation_name,
    c.relkind as relation_kind,
    coalesce((
      select json_agg(json_build_object(
        'column_name', a.attname,
        'data_type', pg_catalog.format_type(a.atttypid, a.atttypmod),
        'is_not_null', a.attnotnull,
        'identity', coalesce(nullif(a.attidentity, ''), null),
        'generated', coalesce(nullif(a.attgenerated, ''), null),
        'default_expr', pg_get_expr(d.adbin, d.adrelid)
      ) order by a.attnum)
      from pg_attribute a
      left join pg_attrdef d
        on d.adrelid = a.attrelid
       and d.adnum = a.attnum
      where a.attrelid = c.oid
        and a.attnum > 0
        and not a.attisdropped
    ), '[]'::json) as columns,
    coalesce((
      select json_agg(json_build_object(
        'constraint_name', con.conname,
        'constraint_type', con.contype,
        'definition', pg_get_constraintdef(con.oid, true)
      ) order by con.conname)
      from pg_constraint con
      where con.conrelid = c.oid
    ), '[]'::json) as constraints,
    coalesce((
      select json_agg(json_build_object(
        'index_name', ic.relname,
        'definition', pg_get_indexdef(i.indexrelid, 0, true),
        'is_unique', i.indisunique,
        'is_primary', i.indisprimary
      ) order by ic.relname)
      from pg_index i
      join pg_class ic on ic.oid = i.indexrelid
      where i.indrelid = c.oid
    ), '[]'::json) as indexes
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('auth', 'storage')
    and c.relkind in ('r', 'p')
)
select coalesce(json_agg(json_build_object(
  'schema_name', schema_name,
  'relation_name', relation_name,
  'relation_kind', relation_kind,
  'columns', columns,
  'constraints', constraints,
  'indexes', indexes
) order by schema_name, relation_name), '[]'::json)::text
from scoped_relations;
`;
}

export function digestPlatformServiceSchemaCatalog(rawCatalog) {
  if (typeof rawCatalog !== "string" || rawCatalog.trim().length === 0) {
    throw new Error("Platform service schema catalog is invalid");
  }
  let parsed;
  try {
    parsed = JSON.parse(rawCatalog);
  } catch {
    throw new Error("Platform service schema catalog is invalid");
  }
  return createHash("sha256").update(stableJson(parsed)).digest("hex");
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
  if (existsSync(normalizedOutput) && lstatSync(normalizedOutput).isSymbolicLink()) {
    throw new Error("Backup output must not be a symbolic link");
  }
  const canonicalize = (candidate) => {
    const suffix = [];
    let ancestor = resolve(candidate);
    while (!existsSync(ancestor)) {
      suffix.unshift(basename(ancestor));
      const parent = dirname(ancestor);
      if (parent === ancestor) break;
      ancestor = parent;
    }
    return resolve(realpathSync(ancestor), ...suffix);
  };
  const canonicalOutput = canonicalize(normalizedOutput);
  const normalizedRepository = canonicalize(repositoryRoot);
  const outputRelative = relative(normalizedRepository, canonicalOutput);
  if (outputRelative === "" || (!outputRelative.startsWith("..") && !isAbsolute(outputRelative))) {
    throw new Error("Backup output must stay outside the repository");
  }
  return canonicalOutput;
}

export function createFailSafeConsistentCutController({
  startWriter,
  stopWriter,
  writers,
}) {
  if (
    !Array.isArray(writers)
    || writers.some((writer) => typeof writer !== "string" || !writer)
    || new Set(writers).size !== writers.length
    || typeof startWriter !== "function"
    || typeof stopWriter !== "function"
  ) {
    throw new Error("Consistent-cut writer controller is invalid");
  }
  const stopped = new Set();
  return Object.freeze({
    beginConsistentCut() {
      if (stopped.size !== 0) {
        throw new Error("Consistent cut is already active");
      }
      for (const writer of writers) {
        stopWriter(writer);
        stopped.add(writer);
      }
    },
    endConsistentCut() {
      const failures = [];
      for (const writer of [...stopped].reverse()) {
        try {
          startWriter(writer);
          stopped.delete(writer);
        } catch (error) {
          failures.push(error);
        }
      }
      if (failures.length > 0) {
        throw new AggregateError(failures, "Consistent-cut writer release failed");
      }
    },
    stoppedWriters: () => Object.freeze([...stopped]),
  });
}

export function buildPlatformDumpCommands(directory) {
  return [
    ["db", "dump", "--local", "--file", join(directory, "roles.sql"), "--role-only"],
    ["db", "dump", "--local", "--file", join(directory, "schema.sql")],
    ["db", "dump", "--local", "--file", join(directory, "data.sql"), "--use-copy", "--data-only"],
  ];
}

export function buildPinnedSupabaseCliInvocation(args) {
  return Object.freeze({
    args: ["dlx", `supabase@${PINNED_SUPABASE_CLI_VERSION}`, ...args],
    command: "pnpm",
  });
}

function assertDockerStorageInput({ archiveDirectory, volumeName }) {
  if (!isAbsolute(archiveDirectory)) {
    throw new Error("Storage archive directory must be absolute");
  }
  if (!/^[a-z0-9][a-z0-9_.-]{2,127}$/u.test(volumeName)) {
    throw new Error("Storage volume name is invalid");
  }
}

export function buildDockerStorageVolumeCaptureInvocation(input) {
  assertDockerStorageInput(input);
  return Object.freeze({
    args: [
      "run",
      "--rm",
      "--platform",
      PINNED_STORAGE_ARCHIVE_PLATFORM,
      "--entrypoint",
      "tar",
      "--mount",
      `type=volume,src=${input.volumeName},dst=/source,readonly`,
      "--mount",
      `type=bind,src=${input.archiveDirectory},dst=/backup`,
      PINNED_STORAGE_ARCHIVE_IMAGE,
      "-C",
      "/source",
      "-cf",
      "/backup/storage.payload.tar",
      ".",
    ],
    command: "docker",
  });
}

export function buildDockerStorageVolumeRestoreInvocation(input) {
  assertDockerStorageInput(input);
  return Object.freeze({
    args: [
      "run",
      "--rm",
      "--platform",
      PINNED_STORAGE_ARCHIVE_PLATFORM,
      "--entrypoint",
      "tar",
      "--mount",
      `type=volume,src=${input.volumeName},dst=/destination`,
      "--mount",
      `type=bind,src=${input.archiveDirectory},dst=/backup,readonly`,
      PINNED_STORAGE_ARCHIVE_IMAGE,
      "-C",
      "/destination",
      "-xf",
      "/backup/storage.payload.tar",
    ],
    command: "docker",
  });
}

function listStoragePayloadFiles(directory, prefix = "") {
  return readdirSync(join(directory, prefix), { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        throw new Error("Storage payload may not contain symbolic links");
      }
      if (entry.isDirectory()) {
        return listStoragePayloadFiles(directory, path);
      }
      if (!entry.isFile()) {
        throw new Error("Storage payload may contain regular files only");
      }
      return [path];
    });
}

export function listStoragePayloadPaths(directory) {
  if (!isAbsolute(directory)) {
    throw new Error("Storage payload directory must be absolute");
  }
  return listStoragePayloadFiles(directory);
}

export function buildStoragePayloadManifest({
  references,
  sourceDirectory,
  sourceIdentity,
}) {
  if (!isAbsolute(sourceDirectory) || typeof sourceIdentity !== "string" || !sourceIdentity.trim()) {
    throw new Error("Storage payload requires an absolute source and source identity");
  }
  const files = listStoragePayloadFiles(sourceDirectory);
  const normalizedReferences = (references ?? [])
    .map((entry) => typeof entry === "string"
      ? { path: entry, reference: entry }
      : { path: entry?.path, reference: entry?.reference })
    .sort((left, right) => String(left.path).localeCompare(String(right.path)));
  if (
    files.length !== normalizedReferences.length
    || files.some((path, index) =>
      path !== normalizedReferences[index]?.path
      || typeof normalizedReferences[index]?.reference !== "string"
      || !normalizedReferences[index].reference
    )
  ) {
    throw new Error(
      `Storage payload files and database references must match exactly (${files.length} files, ${normalizedReferences.length} references)`,
    );
  }
  const objects = files.map((path, index) => {
    const absolutePath = join(sourceDirectory, path);
    const bytes = statSync(absolutePath).size;
    return Object.freeze({
      bytes,
      path,
      reference: normalizedReferences[index].reference,
      sha256: defaultHashFile(absolutePath),
    });
  });
  const catalogSha256 = createHash("sha256")
    .update(JSON.stringify(objects))
    .digest("hex");
  return Object.freeze({
    catalog_sha256: catalogSha256,
    object_count: objects.length,
    objects,
    source_identity: sourceIdentity.trim(),
    total_bytes: objects.reduce((total, object) => total + object.bytes, 0),
  });
}

export function verifyStoragePayloadManifest(manifest, input) {
  const observed = buildStoragePayloadManifest(input);
  if (JSON.stringify(manifest) !== JSON.stringify(observed)) {
    throw new Error("Storage payload manifest does not match restored bytes and references");
  }
  return true;
}

export function restoreVerifiedStoragePayload({
  destinationDirectory,
  manifest,
  storagePayloadPath,
  run = defaultRun,
}) {
  if (!isAbsolute(destinationDirectory) || !isAbsolute(storagePayloadPath)) {
    throw new Error("Storage restore paths must be absolute");
  }
  if (readdirSync(destinationDirectory).length !== 0) {
    throw new Error("Storage restore target must be clean and empty");
  }
  const entries = run("tar", ["-tf", storagePayloadPath])
    .split(/\r?\n/u)
    .filter(Boolean);
  if (entries.some((entry) => {
    const normalized = entry.replace(/^\.\//u, "");
    return isAbsolute(normalized) || normalized.split("/").includes("..");
  })) {
    throw new Error("Storage payload archive contains an unsafe path");
  }
  run("tar", ["-C", destinationDirectory, "-xf", storagePayloadPath]);
  const references = manifest.objects.map((object) => ({
    path: object.path,
    reference: object.reference,
  }));
  verifyStoragePayloadManifest(manifest, {
    references,
    sourceDirectory: destinationDirectory,
    sourceIdentity: manifest.source_identity,
  });
  return Object.freeze({
    catalog_sha256: manifest.catalog_sha256,
    database_reference_count: new Set(
      manifest.objects.map((object) => object.reference),
    ).size,
    object_count: manifest.object_count,
    source_identity: manifest.source_identity,
    total_bytes: manifest.total_bytes,
  });
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

function validDatabaseProvenance(provenance) {
  if (provenance?.adapter === "isolated-supabase-cli-local") return true;
  return (
    provenance?.adapter === undefined
    && /@sha256:[0-9a-f]{64}$/u.test(provenance?.auth_image)
    && typeof provenance?.compose_project === "string"
    && provenance.compose_project.length > 0
    && typeof provenance?.container_id === "string"
    && provenance.container_id.length > 0
    && typeof provenance?.container_name === "string"
    && provenance.container_name.length > 0
    && provenance?.database === "postgres"
    && typeof provenance?.image === "string"
    && /@sha256:[0-9a-f]{64}$/u.test(provenance.image)
    && typeof provenance?.postgres_volume === "string"
    && provenance.postgres_volume.length > 0
    && validSha256(provenance?.schema_catalog_sha256)
    && Number.isSafeInteger(provenance?.schema_count)
    && provenance.schema_count > 0
    && typeof provenance?.server_version_num === "string"
    && /^\d+$/u.test(provenance.server_version_num)
    && /@sha256:[0-9a-f]{64}$/u.test(provenance?.storage_image)
  );
}

export function verifyPlatformBackupMetadata(metadata, observed) {
  if (metadata?.format === "homecook-full-local-platform-v1") {
    throw new Error("Platform backup format is unsupported legacy v1; create a new v5 backup");
  }
  if (metadata?.format === "homecook-full-local-platform-v2") {
    throw new Error("Platform backup format is unsupported legacy v2; create a new v5 backup");
  }
  if (metadata?.format === "homecook-full-local-platform-v3") {
    throw new Error("Platform backup format is unsupported legacy v3; create a new v5 backup");
  }
  if (metadata?.format === "homecook-full-local-platform-v4") {
    throw new Error("Platform backup format is unsupported legacy v4; create a new v5 backup");
  }
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
  if (
    !validSha256(metadata.manifest?.data_semantic_sha256)
    || metadata.manifest.data_semantic_sha256 !== observed?.data_semantic_sha256
  ) {
    throw new Error("Platform backup semantic data digest is invalid");
  }
  if (
    typeof metadata.database?.source_identity !== "string"
    || !metadata.database.source_identity
    || !validDatabaseProvenance(metadata.database?.provenance)
  ) {
    throw new Error("Platform backup database provenance is invalid");
  }
  if (metadata.database.provenance?.adapter === undefined) {
    try {
      buildPlatformServiceRestoreAttestation({
        components: metadata.components,
        expected: metadata.service_restore_attestation,
        schemaCatalogSha256: metadata.database.provenance.schema_catalog_sha256,
        serviceImages: {
          auth: metadata.database.provenance.auth_image,
          storage: metadata.database.provenance.storage_image,
        },
        serviceLedgers: metadata.manifest?.service_ledgers,
      });
    } catch (error) {
      throw new Error(
        error instanceof Error && error.message.includes("Platform service restore attestation")
          ? error.message
          : "Platform backup service restore attestation is invalid",
      );
    }
  }
  if (
    metadata.storage_payload_included !== true
    || !validSha256(metadata.storage_payload?.catalog_sha256)
    || typeof metadata.storage_payload?.source_identity !== "string"
    || !metadata.storage_payload.source_identity
    || !Number.isSafeInteger(metadata.storage_payload?.object_count)
    || !Number.isSafeInteger(metadata.storage_payload?.total_bytes)
    || !Array.isArray(metadata.storage_payload?.objects)
    || metadata.storage_payload.object_count !== metadata.storage_payload.objects.length
    || metadata.storage_payload.objects.some((object) =>
      !Number.isSafeInteger(object?.bytes)
      || object.bytes < 0
      || typeof object?.path !== "string"
      || typeof object.reference !== "string"
      || !object.reference
      || !validSha256(object?.sha256)
    )
  ) {
    throw new Error("Platform backup Storage payload declaration is invalid");
  }
  for (const component of [
    "roles_sha256",
    "schema_sha256",
    "data_sha256",
    "storage_payload_sha256",
  ]) {
    if (!validSha256(metadata.components?.[component]) || metadata.components[component] !== observed?.[component]) {
      throw new Error(`Platform backup ${component} mismatch`);
    }
  }
  return true;
}

export function createEncryptedPlatformBackup({
  backupKey,
  database = null,
  dependencies: suppliedDependencies,
  output,
  repositoryRoot,
  storage,
}) {
  const destination = assertExternalBackupPath({ output, repositoryRoot });
  if (typeof backupKey !== "string" || backupKey.length < 24) {
    throw new Error("A separate backup encryption key is required");
  }
  const dependencies = { ...defaults(), ...suppliedDependencies };
  if (
    !storage
    || typeof storage.beginConsistentCut !== "function"
    || typeof storage.captureSource !== "function"
    || typeof storage.endConsistentCut !== "function"
  ) {
    throw new Error("A complete Storage payload and consistent-cut controller are required");
  }
  if (
    database
    && (
      typeof database.dumpComponents !== "function"
      || typeof database.sourceIdentity !== "string"
      || !database.sourceIdentity
      || typeof database.provenance !== "object"
      || database.provenance === null
    )
  ) {
    throw new Error("Production database dump controller provenance is invalid");
  }
  const authenticationPath = platformBackupAuthenticationPath(destination);
  if (dependencies.exists(destination) || dependencies.exists(authenticationPath)) {
    throw new Error("Backup output already exists");
  }

  const staging = dependencies.createTempDirectory();
  dependencies.chmod(staging, 0o700);
  try {
    const versionInvocation = buildPinnedSupabaseCliInvocation(["--version"]);
    const observedCliVersion = dependencies.run(
      versionInvocation.command,
      versionInvocation.args,
      { cwd: repositoryRoot, failure: "Pinned Supabase CLI version check failed" },
    ).trim();
    if (observedCliVersion !== PINNED_SUPABASE_CLI_VERSION) {
      throw new Error("Pinned Supabase CLI version mismatch");
    }

    let cutAttempted = false;
    try {
      cutAttempted = true;
      storage.beginConsistentCut();
      if (database) {
        database.dumpComponents(staging);
      } else {
        for (const args of buildPlatformDumpCommands(staging)) {
          if (args.includes("--db-url") || args.includes("--password")) {
            throw new Error("Database credentials may not be passed on the command line");
          }
          const invocation = buildPinnedSupabaseCliInvocation(args);
          dependencies.run(invocation.command, invocation.args, {
            cwd: repositoryRoot,
            failure: "Supabase platform dump failed",
          });
        }
      }
      storage.captureSource();
      const storagePayloadPath = join(staging, "storage.payload.tar");
      dependencies.run("tar", [
        "-C",
        storage.sourceDirectory,
        "-cf",
        storagePayloadPath,
        ".",
      ], {
        failure: "Local Storage payload capture failed",
      });
    } finally {
      if (cutAttempted) storage.endConsistentCut();
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
      storage_payload_sha256: dependencies.hashFile(join(staging, "storage.payload.tar")),
    };
    const storagePayload = buildStoragePayloadManifest({
      references: typeof storage.references === "function"
        ? storage.references()
        : storage.references,
      sourceDirectory: storage.sourceDirectory,
      sourceIdentity: storage.sourceIdentity,
    });
    const metadata = {
      cli: {
        package: `supabase@${PINNED_SUPABASE_CLI_VERSION}`,
        version: observedCliVersion,
      },
      components,
      created_at: dependencies.now(),
      encryption: {
        cipher: "AES-256-CBC",
        key_source: "separate-process-only-secret",
        pbkdf2_iterations: PBKDF2_ITERATIONS,
      },
      format: PLATFORM_BACKUP_FORMAT,
      database: database
        ? {
            provenance: database.provenance,
            source_identity: database.sourceIdentity,
          }
        : {
            provenance: { adapter: "isolated-supabase-cli-local" },
            source_identity: "isolated-supabase-cli-local",
          },
      manifest: sanitized.manifest,
      service_restore_attestation: database && database.provenance?.adapter === undefined
        ? buildPlatformServiceRestoreAttestation({
            components,
            schemaCatalogSha256: database.provenance.schema_catalog_sha256,
            serviceImages: {
              auth: database.provenance.auth_image,
              storage: database.provenance.storage_image,
            },
            serviceLedgers: sanitized.manifest.service_ledgers,
          })
        : undefined,
      storage_payload: storagePayload,
      storage_payload_included: true,
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
      storage_object_count: storagePayload.object_count,
      storage_payload_included: true,
      storage_total_bytes: storagePayload.total_bytes,
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
  dependencies: suppliedDependencies = {},
}) {
  if (!isAbsolute(archive) || typeof backupKey !== "string" || backupKey.length < 24) {
    throw new Error("An absolute archive path and separate backup key are required");
  }
  const dependencies = { ...defaults(), ...suppliedDependencies };
  const artifactLstat = suppliedDependencies?.lstat
    ?? suppliedDependencies?.stat
    ?? lstatSync;
  const artifactRealpath = suppliedDependencies?.realpath
    ?? (suppliedDependencies?.stat ? (path) => path : realpathSync);
  const authenticationPath = platformBackupAuthenticationPath(archive);
  const canonicalArtifacts = new Map();
  for (const [path, label] of [
    [archive, "Platform backup archive"],
    [authenticationPath, "Platform backup authentication"],
  ]) {
    if (!dependencies.exists(path)) {
      throw new Error(`${label} is missing`);
    }
    const directStat = artifactLstat(path);
    if (directStat.isSymbolicLink?.() === true) {
      throw new Error(`${label} must not be a symbolic link`);
    }
    const canonicalPath = artifactRealpath(path);
    canonicalArtifacts.set(path, canonicalPath);
    const stat = dependencies.stat(canonicalPath);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600) {
      throw new Error(`${label} must be a regular mode 0600 file`);
    }
  }
  const canonicalArchive = canonicalArtifacts.get(archive);
  const canonicalAuthentication = canonicalArtifacts.get(authenticationPath);
  verifyPlatformBackupAuthentication({
    archive,
    archiveBytes: dependencies.readBuffer(canonicalArchive),
    authentication: JSON.parse(dependencies.read(canonicalAuthentication)),
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
      canonicalArchive,
      "-out",
      bundle,
    ], { env: { ...process.env, [PLATFORM_BACKUP_KEY_ENV]: backupKey } });
    assertSafeBackupEntries(dependencies.run("tar", ["-tzf", bundle]));
    dependencies.run("tar", ["-C", staging, "-xzf", bundle]);
    const metadata = JSON.parse(dependencies.read(join(staging, "manifest.json")));
    const observed = {
      data_sha256: dependencies.hashFile(join(staging, "data.sanitized.sql")),
      data_semantic_sha256: digestSemanticPlatformDataSql(
        dependencies.read(join(staging, "data.sanitized.sql")),
      ),
      roles_sha256: dependencies.hashFile(join(staging, "roles.sql")),
      schema_sha256: dependencies.hashFile(join(staging, "schema.sql")),
      storage_payload_sha256: dependencies.hashFile(join(staging, "storage.payload.tar")),
    };
    verifyPlatformBackupMetadata(metadata, observed);
    return await consume({
      dataPath: join(staging, "data.sanitized.sql"),
      metadata,
      rolesPath: join(staging, "roles.sql"),
      schemaPath: join(staging, "schema.sql"),
      storagePayloadPath: join(staging, "storage.payload.tar"),
    });
  } finally {
    dependencies.remove(staging, { force: true, recursive: true });
  }
}
