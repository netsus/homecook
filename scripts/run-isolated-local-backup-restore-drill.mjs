#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDockerStorageVolumeCaptureInvocation,
  buildDockerStorageVolumeRestoreInvocation,
  buildPlatformBackupAuthentication,
  buildPlatformServiceSchemaCatalogSql,
  createEncryptedPlatformBackup,
  countPlatformServiceSchemaCatalog,
  digestPlatformServiceSchemaCatalog,
  PINNED_SUPABASE_CLI_VERSION,
  platformBackupAuthenticationPath,
  listStoragePayloadPaths,
  verifyStoragePayloadManifest,
  verifyPlatformBackupAuthentication,
  withVerifiedPlatformBackup,
} from "./lib/full-local-platform-backup.mjs";
import {
  createIsolatedKeychainAdapter,
  openFullLocalBackupKeyEscrow,
  sealFullLocalBackupKeyEscrow,
  signFullLocalBackupKeyRecoveryEvidence,
  verifyFullLocalBackupKeyRecoveryIssuerAttestation,
  verifyIsolatedKeychainRegistration,
} from "./lib/full-local-backup-key-recovery.mjs";
import { fullLocalBackupMetadataSha256 } from "./lib/full-local-backup-readiness.mjs";
import { fullLocalImageRefsForPlatform } from "./lib/full-local-production-runtime.mjs";
import {
  buildRestoreManifestPayload,
  buildRestoredSemanticManifestSummary,
} from "./full-local-production-runtime.mjs";
import {
  makePostgresRoleDumpIdempotent,
  selectFullLocalProductionResources,
} from "./lib/full-local-production-resources.mjs";
import {
  buildBootstrapAwareDatabaseResetSql,
  buildPlatformRestoreSql,
  executeBootstrapAwarePlatformRestore,
  verifyRestoredPlatformDataSnapshot,
} from "./lib/full-local-restore-cutover.mjs";
import {
  assertIsolatedDrillTarget,
  buildIsolatedDrillPlan,
  mapStorageRowsToPayloadReferences,
  validateExternalArchiveDrillOptions,
  writeAuthenticatedJsonArtifact,
} from "./lib/isolated-local-backup-restore-drill.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLATFORM = process.arch === "arm64" ? "linux/arm64" : "linux/amd64";
const POSTGRES_IMAGE = fullLocalImageRefsForPlatform(PLATFORM).postgres;
const FIXTURE_PASSWORD = "isolated-production-compatible-fixture-only";
const EXTERNAL_ARCHIVE_USAGE =
  "--external-archive <abs> --escrow-envelope <abs> --recovery-credential-file <abs> "
  + "--recovery-issuer-private-key <abs> --restore-manifest <abs> --recovery-manifest <abs>";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
    input: options.input,
    maxBuffer: 128 * 1024 * 1024,
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const diagnostic = options.diagnostics === true
      ? `: ${(result.stderr ?? "").trim()}`
      : "";
    throw new Error(`${options.failure ?? `${command} failed in isolated drill`}${diagnostic}`);
  }
  return result.stdout ?? "";
}

function dockerInventory(kind) {
  const ids = run("docker", kind === "volume"
    ? ["volume", "ls", "--quiet"]
    : ["container", "ls", "--all", "--quiet"])
    .split(/\r?\n/u).filter(Boolean);
  if (ids.length === 0) return [];
  return JSON.parse(run(
    "docker",
    kind === "volume" ? ["volume", "inspect", ...ids] : ["container", "inspect", ...ids],
  ));
}

function createLabeledVolume({ composeProject, composeVolume, name }) {
  assertIsolatedDrillTarget(name);
  run("docker", [
    "volume",
    "create",
    "--label",
    `com.docker.compose.project=${composeProject}`,
    "--label",
    `com.docker.compose.volume=${composeVolume}`,
    name,
  ], { failure: "Isolated production-compatible volume creation failed" });
}

function startPostgresFixture({ container, composeProject, postgresVolume }) {
  assertIsolatedDrillTarget(container);
  run("docker", [
    "run",
    "--detach",
    "--platform",
    PLATFORM,
    "--name",
    container,
    "--label",
    `com.docker.compose.project=${composeProject}`,
    "--label",
    "com.docker.compose.service=postgres",
    "--health-cmd",
    "pg_isready -U supabase_admin -d postgres",
    "--health-interval",
    "1s",
    "--health-timeout",
    "2s",
    "--health-retries",
    "60",
    "--env",
    `POSTGRES_PASSWORD=${FIXTURE_PASSWORD}`,
    "--env",
    "POSTGRES_USER=supabase_admin",
    "--env",
    "POSTGRES_DB=postgres",
    "--volume",
    `${postgresVolume}:/var/lib/postgresql/data`,
    POSTGRES_IMAGE,
  ], { failure: "Isolated production-compatible PostgreSQL start failed" });
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const state = JSON.parse(run("docker", ["inspect", container]))[0]?.State;
    if (state?.Running === true && state?.Health?.Status === "healthy") return;
    if (state?.Running !== true) {
      throw new Error("Isolated production-compatible PostgreSQL exited before health");
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
  }
  throw new Error("Isolated production-compatible PostgreSQL health timed out");
}

function resourceConfig(plan, restore = false) {
  const project = restore ? plan.restore_project_id : plan.project_id;
  return {
    FULL_LOCAL_COMPOSE_PROJECT_NAME: project,
    FULL_LOCAL_POSTGRES_IMAGE: POSTGRES_IMAGE,
    FULL_LOCAL_POSTGRES_VOLUME_NAME: restore
      ? plan.restore_postgres_volume
      : plan.source_postgres_volume,
    FULL_LOCAL_STORAGE_VOLUME_NAME: restore
      ? plan.restore_storage_volume
      : plan.source_storage_volume,
  };
}

function resolveResources(config) {
  return selectFullLocalProductionResources({
    config,
    containers: dockerInventory("container"),
    volumes: dockerInventory("volume"),
  });
}

function database(
  container,
  sql,
  failure = "Isolated database operation failed",
  databaseName = "postgres",
) {
  return run("docker", [
    "exec",
    "-i",
    container,
    "psql",
    "--quiet",
    "--tuples-only",
    "--no-align",
    "--variable",
    "ON_ERROR_STOP=1",
    "--username",
    "supabase_admin",
    "--dbname",
    databaseName,
  ], { diagnostics: true, failure, input: sql });
}

function seedStorage({ container, fixtureDirectory, volumeName }) {
  const payload = Buffer.from("homecook-isolated-storage-fixture-v1", "utf8");
  const version = "fixture-version-1";
  database(container, `
    create schema if not exists storage;
    create table storage.buckets (id text primary key, name text not null, public boolean not null);
    create table storage.objects (
      bucket_id text not null references storage.buckets(id),
      name text not null,
      version text not null,
      metadata jsonb,
      primary key (bucket_id, name)
    );
    insert into storage.buckets (id, name, public) values ('fixture', 'fixture', false);
    insert into storage.objects (bucket_id, name, version, metadata)
    values ('fixture', 'owner-a/object.bin', '${version}', '{"mimetype":"application/octet-stream","size":${payload.length}}'::jsonb);
  `, "Isolated Storage metadata fixture failed");
  const payloadDirectory = join(
    fixtureDirectory,
    "stub",
    "stub",
    "fixture",
    "owner-a",
    "object.bin",
  );
  mkdirSync(payloadDirectory, { recursive: true, mode: 0o700 });
  writeFileSync(join(payloadDirectory, version), payload, { mode: 0o600 });
  const archiveDirectory = join(fixtureDirectory, "archive");
  mkdirSync(archiveDirectory, { recursive: true, mode: 0o700 });
  run("tar", [
    "-C",
    fixtureDirectory,
    "-cf",
    join(archiveDirectory, "storage.payload.tar"),
    "stub",
  ]);
  restoreVolume({ archiveDirectory, volumeName });
  return payload;
}

function storageRows(container) {
  const output = database(container, `
    select coalesce(json_agg(json_build_object(
      'bucket_id', bucket_id,
      'name', name,
      'version', version
    ) order by bucket_id, name), '[]'::json)::text
    from storage.objects;
  `);
  return JSON.parse(output.trim());
}

function fixtureDatabaseProvenance(resources) {
  const catalog = database(
    resources.postgresContainerId,
    buildPlatformServiceSchemaCatalogSql(),
    "Isolated schema catalog provenance failed",
  );
  const identity = database(
    resources.postgresContainerId,
    "select current_database(), current_setting('server_version_num');",
    "Isolated database identity provenance failed",
  ).trim().split("|");
  if (identity.length !== 2 || identity[0] !== "postgres" || !/^\d+$/u.test(identity[1])) {
    throw new Error("Isolated database identity provenance is invalid");
  }
  return {
    compose_project: resources.composeProject,
    container_id: resources.postgresContainerId,
    container_name: resources.postgresContainerName,
    database: identity[0],
    image: resources.postgresImage,
    postgres_volume: resources.postgresVolumeName,
    schema_catalog_sha256: digestPlatformServiceSchemaCatalog(catalog.trim()),
    schema_count: countPlatformServiceSchemaCatalog(catalog.trim()),
    server_version_num: identity[1],
  };
}

function dumpFixtureDatabase({ container, staging }) {
  const roles = run("docker", [
    "exec",
    container,
    "pg_dumpall",
    "--roles-only",
    "--no-role-passwords",
    "--username",
    "supabase_admin",
  ], { failure: "Isolated roles.sql production-compatible dump failed" });
  writeFileSync(
    join(staging, "roles.sql"),
    makePostgresRoleDumpIdempotent(roles),
    { mode: 0o600 },
  );
  const commands = [
    ["schema.sql", ["pg_dump", "--schema-only", "--schema", "storage"]],
    ["data.sql", ["pg_dump", "--data-only", "--schema", "storage"]],
  ];
  for (const [file, command] of commands) {
    const output = run("docker", [
      "exec",
      container,
      ...command,
      "--username",
      "supabase_admin",
      "--dbname",
      "postgres",
    ], { failure: `Isolated ${file} production-compatible dump failed` });
    writeFileSync(join(staging, file), output, { mode: 0o600 });
  }
}

function captureVolume({ archiveDirectory, snapshotDirectory, volumeName }) {
  mkdirSync(archiveDirectory, { recursive: true, mode: 0o700 });
  mkdirSync(snapshotDirectory, { recursive: true, mode: 0o700 });
  const invocation = buildDockerStorageVolumeCaptureInvocation({
    archiveDirectory,
    volumeName,
  });
  run(invocation.command, invocation.args);
  run("tar", [
    "-C",
    snapshotDirectory,
    "-xf",
    join(archiveDirectory, "storage.payload.tar"),
  ]);
}

function restoreVolume({ archiveDirectory, volumeName }) {
  const invocation = buildDockerStorageVolumeRestoreInvocation({
    archiveDirectory,
    volumeName,
  });
  run(invocation.command, invocation.args);
}

function resetDatabase(container) {
  database(
    container,
    buildBootstrapAwareDatabaseResetSql(),
    "Isolated bootstrap-aware database reset failed",
    "template1",
  );
}

function replayDatabase({ container, dataPath, rolesPath, schemaPath }) {
  database(container, buildPlatformRestoreSql({
    dataSql: readFileSync(dataPath, "utf8"),
    rolesSql: readFileSync(rolesPath, "utf8"),
    schemaSql: readFileSync(schemaPath, "utf8"),
  }), "Isolated database restore failed");
}

function seedBootstrapSchemaCollision(container) {
  database(container, `
    create schema if not exists storage;
    create table storage.buckets (
      id text primary key,
      bootstrap_marker text not null
    );
    insert into storage.buckets (id, bootstrap_marker)
    values ('bootstrap-owned', 'must-be-removed-before-replay');
  `, "Isolated bootstrap schema collision fixture failed");
}

function databaseMetadata(container) {
  const catalog = database(
    container,
    buildPlatformServiceSchemaCatalogSql(),
    "Isolated restored schema catalog verification failed",
  );
  const identity = database(
    container,
    "select current_database(), current_setting('server_version_num');",
    "Isolated restored database identity verification failed",
  ).trim().split("|");
  if (identity.length !== 2 || identity[0] !== "postgres" || !/^\d+$/u.test(identity[1])) {
    throw new Error("Isolated restored database identity is invalid");
  }
  return Object.freeze({
    database: identity[0],
    schema_catalog_sha256: digestPlatformServiceSchemaCatalog(catalog.trim()),
    schema_count: countPlatformServiceSchemaCatalog(catalog.trim()),
    server_version_num: identity[1],
  });
}

function verifyGenericRestoredDatabaseMetadata(container, metadata) {
  const observed = databaseMetadata(container);
  const provenance = metadata?.database?.provenance ?? {};
  for (const [key, label] of [
    ["database", "database name"],
    ["schema_catalog_sha256", "schema catalog digest"],
    ["server_version_num", "server version"],
  ]) {
    if (typeof provenance[key] === "string" && provenance[key] !== observed[key]) {
      throw new Error(`Isolated restored ${label} does not match authenticated backup metadata`);
    }
  }
  if (
    Number.isSafeInteger(provenance.schema_count)
    && provenance.schema_count !== observed.schema_count
  ) {
    throw new Error("Isolated restored schema count does not match authenticated backup metadata");
  }
  return observed;
}

function restoredDataSnapshot(container, metadata) {
  const restoredDataSql = run("docker", [
    "exec",
    container,
    "pg_dump",
    "--data-only",
    "--username",
    "supabase_admin",
    "--dbname",
    "postgres",
  ], { failure: "Isolated restored data snapshot verification failed" });
  return verifyRestoredPlatformDataSnapshot({
    restoredDataSql,
    sourceDataSha256: metadata.components.data_sha256,
    sourceDataSemanticSha256: metadata.manifest.data_semantic_sha256,
    sourceRelationClassificationDigest:
      metadata.manifest.relation_classification_digest,
  });
}

function restoredSemanticManifest(container) {
  const sql = String.raw`
    create temporary table homecook_restore_manifest (
      relation text primary key,
      row_count bigint not null,
      row_digest text not null
    );
    do $homecook$
    declare item record;
    begin
      for item in
        select schemaname, tablename
        from pg_catalog.pg_tables
        where schemaname = 'public'
        order by tablename
      loop
        execute format(
          'insert into homecook_restore_manifest(relation, row_count, row_digest) '
          || 'select %L, count(*), md5(coalesce(string_agg(row_text, E''\\n'' order by row_text), '''')) '
          || 'from (select to_jsonb(source_row)::text as row_text from %I.%I source_row) rows',
          item.schemaname || '.' || item.tablename,
          item.schemaname,
          item.tablename
        );
      end loop;
    end
    $homecook$;
    create temporary table homecook_storage_url_references as
    select
      recipe.created_by as owner_uuid,
      regexp_replace(
        split_part(split_part(recipe.thumbnail_url, '?', 1), '#', 1),
        '^https?://[^/]+/storage/v1/object/(public|sign)/',
        ''
      ) as object_key
    from public.recipes recipe
    where recipe.thumbnail_url ~ '^https?://[^/]+/storage/v1/object/(public|sign)/'
    union all
    select
      app_user.id as owner_uuid,
      regexp_replace(
        split_part(split_part(app_user.profile_image_url, '?', 1), '#', 1),
        '^https?://[^/]+/storage/v1/object/(public|sign)/',
        ''
      ) as object_key
    from public.users app_user
    where app_user.profile_image_url ~ '^https?://[^/]+/storage/v1/object/(public|sign)/'
    union all
    select
      recipe_book.user_id as owner_uuid,
      regexp_replace(
        split_part(split_part(recipe_book.cover_image_url, '?', 1), '#', 1),
        '^https?://[^/]+/storage/v1/object/(public|sign)/',
        ''
      ) as object_key
    from public.recipe_books recipe_book
    where recipe_book.cover_image_url ~ '^https?://[^/]+/storage/v1/object/(public|sign)/'
    union all
    select
      null::uuid as owner_uuid,
      regexp_replace(
        split_part(split_part(food_product.image_url, '?', 1), '#', 1),
        '^https?://[^/]+/storage/v1/object/(public|sign)/',
        ''
      ) as object_key
    from public.food_products food_product
    where food_product.image_url ~ '^https?://[^/]+/storage/v1/object/(public|sign)/';
    create temporary table homecook_storage_references as
    select
      storage_object.bucket_id,
      storage_object.name,
      exists (
        select 1 from homecook_storage_url_references url_reference
        where url_reference.object_key = storage_object.bucket_id || '/' || storage_object.name
      )
      or exists (
        select 1 from public.recipe_image_objects managed_object
        where managed_object.bucket_id = storage_object.bucket_id
          and managed_object.object_path = storage_object.name
      ) as referenced,
      case
        when split_part(storage_object.name, '/', 1)
          !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then false
        else
          not exists (
            select 1 from auth.users auth_user
            where auth_user.id::text = split_part(storage_object.name, '/', 1)
          )
          or exists (
            select 1 from homecook_storage_url_references url_reference
            where url_reference.object_key = storage_object.bucket_id || '/' || storage_object.name
              and url_reference.owner_uuid is not null
              and url_reference.owner_uuid::text <> split_part(storage_object.name, '/', 1)
          )
          or exists (
            select 1 from public.recipe_image_objects managed_object
            where managed_object.bucket_id = storage_object.bucket_id
              and managed_object.object_path = storage_object.name
              and managed_object.owner_uuid::text <> split_part(storage_object.name, '/', 1)
          )
      end as owner_prefix_mismatch
    from storage.objects storage_object;
    select jsonb_build_object(
      'auth_identity_digest', (
        select md5(coalesce(string_agg(value, E'\\n' order by value), ''))
        from (
          select concat_ws('|', id::text, created_at::text, coalesce(email, '')) as value
          from auth.users
          union all
          select concat_ws('|', id::text, user_id::text, provider, provider_id) as value
          from auth.identities
        ) auth_rows
      ),
      'auth_users', (select count(*) from auth.users),
      'auth_identities', (select count(*) from auth.identities),
      'auth_sessions', (select count(*) from auth.sessions),
      'auth_refresh_tokens', (select count(*) from auth.refresh_tokens),
      'auth_flow_state', (select count(*) from auth.flow_state),
      'public_relations', (
        select coalesce(jsonb_agg(to_jsonb(manifest_row) order by relation), '[]'::jsonb)
        from homecook_restore_manifest manifest_row
      ),
      'storage_bucket_digest', (
        select md5(coalesce(string_agg(to_jsonb(bucket_row)::text, E'\\n' order by id), ''))
        from storage.buckets bucket_row
      ),
      'storage_buckets', (select count(*) from storage.buckets),
      'storage_objects', (select count(*) from storage.objects),
      'storage_object_digest', (
        select md5(coalesce(string_agg(
          concat_ws(
            '|',
            bucket_id,
            name,
            coalesce(owner_id::text, ''),
            coalesce((metadata - 'lastModified')::text, ''),
            coalesce(user_metadata::text, '')
          ),
          E'\\n' order by bucket_id, name
        ), ''))
        from storage.objects
      ),
      'storage_referenced_objects', (
        select count(*) from homecook_storage_references where referenced
      ),
      'storage_unreferenced_objects', (
        select count(*) from homecook_storage_references where not referenced
      ),
      'storage_owner_prefix_mismatches', (
        select count(*) from homecook_storage_references where owner_prefix_mismatch
      ),
      'public_users_without_auth', (
        select count(*)
        from public.users app_user
        left join auth.users auth_user on auth_user.id = app_user.id
        where auth_user.id is null
      )
    )::text;
  `;
  const output = database(
    container,
    sql,
    "Isolated restored semantic manifest verification failed",
  ).trim();
  return buildRestoredSemanticManifestSummary(
    JSON.parse(output.split("\n").at(-1)),
  );
}

function buildExternalRestoreManifest({
  archiveSha256,
  dataSnapshot,
  metadata,
  plan,
  semantic,
}) {
  return buildRestoreManifestPayload({
    archiveSha256,
    attemptToken: plan.restore_project_id,
    dataSnapshot,
    metadata,
    runtimeConfig: {
      FULL_LOCAL_COMPOSE_PROJECT_NAME: plan.restore_project_id,
      FULL_LOCAL_POSTGRES_VOLUME_NAME: plan.restore_postgres_volume,
      FULL_LOCAL_STORAGE_VOLUME_NAME: plan.restore_storage_volume,
    },
    semantic,
  });
}

function cleanupContainer(name) {
  assertIsolatedDrillTarget(name);
  spawnSync("docker", ["rm", "--force", name], {
    encoding: "utf8",
    stdio: ["ignore", "ignore", "ignore"],
  });
}

function cleanupVolume(name) {
  assertIsolatedDrillTarget(name);
  spawnSync("docker", ["volume", "rm", name], {
    encoding: "utf8",
    stdio: ["ignore", "ignore", "ignore"],
  });
}

async function executeDrill() {
  const externalArchiveOptions = validateExternalArchiveDrillOptions({
    args: process.argv,
    repositoryRoot: ROOT,
  });
  const suffix = `${Date.now().toString(36)}${process.pid.toString(36)}`.slice(-8);
  const plan = buildIsolatedDrillPlan({ suffix });
  const root = mkdtempSync(join(tmpdir(), "homecook-backup-drill-"));
  chmodSync(root, 0o700);
  const sourceArchiveDirectory = join(root, "source-volume");
  const sourceSnapshotDirectory = join(root, "source-snapshot");
  const restoredArchiveDirectory = join(root, "restored-volume");
  const restoredSnapshotDirectory = join(root, "restored-snapshot");
  const archive = externalArchiveOptions?.external_archive ?? join(root, "platform.tar.gz.enc");
  const keyRecoveryMode = externalArchiveOptions === null && process.argv.includes("--key-recovery");
  const recoveryCredential = randomBytes(48).toString("base64url");
  const recoveryIssuer = generateKeyPairSync("ed25519");
  const escrowEnvelopePath = join(root, "key-escrow", "platform-key.escrow.json");
  let recoveryContext = null;
  let archiveSha256 = null;
  let restoreKey = randomBytes(48).toString("base64url");
  let fixtureArchiveMetadata = null;
  let restoreManifest = null;
  try {
    const version = run("pnpm", ["dlx", `supabase@${PINNED_SUPABASE_CLI_VERSION}`, "--version"]).trim();
    if (version !== PINNED_SUPABASE_CLI_VERSION) {
      throw new Error("Pinned Supabase CLI version mismatch in isolated drill");
    }
    let fixturePayload = null;
    if (externalArchiveOptions) {
      const recoveredKey = openFullLocalBackupKeyEscrow({
        envelope: JSON.parse(readFileSync(externalArchiveOptions.escrow_envelope, "utf8")),
        recoveryCredential: readFileSync(
          externalArchiveOptions.recovery_credential_file,
          "utf8",
        ).trim(),
      });
      verifyPlatformBackupAuthentication({
        archive: externalArchiveOptions.escrow_envelope,
        archiveBytes: readFileSync(externalArchiveOptions.escrow_envelope),
        authentication: JSON.parse(readFileSync(
          platformBackupAuthenticationPath(externalArchiveOptions.escrow_envelope),
          "utf8",
        )),
        backupKey: recoveredKey,
      });
      const keychain = createIsolatedKeychainAdapter({
        directory: join(root, "replacement-keychain"),
      });
      keychain.register(externalArchiveOptions.keychain_account, recoveredKey);
      recoveryContext = {
        envelope_authenticated: true,
        envelope_sha256: createHash("sha256")
          .update(readFileSync(externalArchiveOptions.escrow_envelope))
          .digest("hex"),
        keychain_receipt: verifyIsolatedKeychainRegistration({
          account: externalArchiveOptions.keychain_account,
          adapter: keychain,
          expectedKey: recoveredKey,
        }),
      };
      restoreKey = keychain.read(externalArchiveOptions.keychain_account);
      archiveSha256 = createHash("sha256").update(readFileSync(archive)).digest("hex");
    } else {
      const backupKey = randomBytes(48).toString("base64url");
      restoreKey = backupKey;
      createLabeledVolume({
        composeProject: plan.project_id,
        composeVolume: "postgres-data",
        name: plan.source_postgres_volume,
      });
      createLabeledVolume({
        composeProject: plan.project_id,
        composeVolume: "storage-data",
        name: plan.source_storage_volume,
      });
      startPostgresFixture({
        composeProject: plan.project_id,
        container: plan.source_database_container,
        postgresVolume: plan.source_postgres_volume,
      });
      const source = resolveResources(resourceConfig(plan));
      if (source.postgresContainerName !== plan.source_database_container) {
        throw new Error("Production resource resolver selected the wrong dual-stack target");
      }
      fixturePayload = seedStorage({
        container: source.postgresContainerId,
        fixtureDirectory: join(root, "fixture"),
        volumeName: source.storageVolumeName,
      });
      let sourceRows;
      const sourceDatabaseProvenance = {};
      fixtureArchiveMetadata = createEncryptedPlatformBackup({
        backupKey,
        database: {
          dumpComponents: (staging) => {
            Object.assign(sourceDatabaseProvenance, fixtureDatabaseProvenance(source));
            sourceRows = storageRows(source.postgresContainerId);
            dumpFixtureDatabase({ container: source.postgresContainerId, staging });
          },
          provenance: sourceDatabaseProvenance,
          sourceIdentity: `docker-compose:${source.composeProject}:${source.postgresContainerName}`,
        },
        output: archive,
        repositoryRoot: ROOT,
        storage: {
          beginConsistentCut: () => undefined,
          captureSource: () => captureVolume({
            archiveDirectory: sourceArchiveDirectory,
            snapshotDirectory: sourceSnapshotDirectory,
            volumeName: source.storageVolumeName,
          }),
          endConsistentCut: () => undefined,
          references: () => mapStorageRowsToPayloadReferences(
            sourceRows,
            listStoragePayloadPaths(sourceSnapshotDirectory),
          ),
          sourceDirectory: sourceSnapshotDirectory,
          sourceIdentity: `docker-compose-volume:${source.composeProject}:${source.storageVolumeName}`,
        },
      });
      archiveSha256 = fixtureArchiveMetadata.archive_sha256;

      if (keyRecoveryMode) {
        recoveryContext = null;
        mkdirSync(dirname(escrowEnvelopePath), { recursive: true, mode: 0o700 });
        const envelopeContents = `${JSON.stringify(sealFullLocalBackupKeyEscrow({
          backupKey,
          recoveryCredential,
          recoveryIssuerPublicKey: recoveryIssuer.publicKey,
        }), null, 2)}\n`;
        writeFileSync(escrowEnvelopePath, envelopeContents, { mode: 0o600 });
        const escrowAuthentication = buildPlatformBackupAuthentication({
          archive: escrowEnvelopePath,
          archiveBytes: Buffer.from(envelopeContents, "utf8"),
          backupKey,
        });
        writeFileSync(
          platformBackupAuthenticationPath(escrowEnvelopePath),
          `${JSON.stringify(escrowAuthentication, null, 2)}\n`,
          { mode: 0o600 },
        );
        verifyPlatformBackupAuthentication({
          archive: escrowEnvelopePath,
          archiveBytes: readFileSync(escrowEnvelopePath),
          authentication: JSON.parse(readFileSync(
            platformBackupAuthenticationPath(escrowEnvelopePath),
            "utf8",
          )),
          backupKey,
        });
        const recoveredKey = openFullLocalBackupKeyEscrow({
          envelope: JSON.parse(readFileSync(escrowEnvelopePath, "utf8")),
          recoveryCredential,
        });
        const keychain = createIsolatedKeychainAdapter({
          directory: join(root, "replacement-keychain"),
        });
        keychain.register("platform-backup", recoveredKey);
        recoveryContext = {
          envelope_authenticated: recoveredKey === backupKey,
          envelope_sha256: createHash("sha256")
            .update(readFileSync(escrowEnvelopePath))
            .digest("hex"),
          keychain_receipt: verifyIsolatedKeychainRegistration({
            account: "platform-backup",
            adapter: keychain,
            expectedKey: backupKey,
          }),
        };
        restoreKey = keychain.read("platform-backup");
      }
    }

    createLabeledVolume({
      composeProject: plan.restore_project_id,
      composeVolume: "postgres-data",
      name: plan.restore_postgres_volume,
    });
    createLabeledVolume({
      composeProject: plan.restore_project_id,
      composeVolume: "storage-data",
      name: plan.restore_storage_volume,
    });
    startPostgresFixture({
      composeProject: plan.restore_project_id,
      container: plan.restore_database_container,
      postgresVolume: plan.restore_postgres_volume,
    });
    const restored = resolveResources(resourceConfig(plan, true));
    let authenticatedMetadata;
    const restoreResult = await withVerifiedPlatformBackup({
      archive,
      backupKey: restoreKey,
      consume: ({ dataPath, metadata, rolesPath, schemaPath, storagePayloadPath }) => {
        authenticatedMetadata = metadata;
        let postRestoreResources;
        return executeBootstrapAwarePlatformRestore({
          bootstrapServices: () => seedBootstrapSchemaCollision(
            restored.postgresContainerId,
          ),
          replayDatabase: () => replayDatabase({
            container: restored.postgresContainerId,
            dataPath,
            rolesPath,
            schemaPath,
          }),
          resetDatabase: () => resetDatabase(restored.postgresContainerId),
          restoreStoragePayload: () => {
            mkdirSync(restoredArchiveDirectory, { recursive: true, mode: 0o700 });
            writeFileSync(
              join(restoredArchiveDirectory, "storage.payload.tar"),
              readFileSync(storagePayloadPath),
              { mode: 0o600 },
            );
            restoreVolume({
              archiveDirectory: restoredArchiveDirectory,
              volumeName: restored.storageVolumeName,
            });
          },
          startPostgres: () => undefined,
          startServices: () => undefined,
          stopServices: () => undefined,
          verifyResources: () => {
            postRestoreResources = resolveResources(resourceConfig(plan, true));
            if (postRestoreResources.storageVolumeName !== plan.restore_storage_volume) {
              throw new Error("Restored Storage volume lost exact Compose provenance");
            }
          },
          verifyRestoredPlatform: () => {
            const bootstrapMarkerCount = Number(database(
              restored.postgresContainerId,
              `select count(*) from information_schema.columns
               where table_schema = 'storage'
                 and table_name = 'buckets'
                 and column_name = 'bootstrap_marker';`,
            ).trim());
            if (bootstrapMarkerCount !== 0) {
              throw new Error("Bootstrap-owned schema state survived the clean restore replay");
            }
            captureVolume({
              archiveDirectory: join(root, "restored-recapture"),
              snapshotDirectory: restoredSnapshotDirectory,
              volumeName: postRestoreResources.storageVolumeName,
            });
            const restoredReferences = mapStorageRowsToPayloadReferences(
              storageRows(restored.postgresContainerId),
              listStoragePayloadPaths(restoredSnapshotDirectory),
            );
            verifyStoragePayloadManifest(metadata.storage_payload, {
              references: restoredReferences,
              sourceDirectory: restoredSnapshotDirectory,
              sourceIdentity: metadata.storage_payload.source_identity,
            });
            verifyGenericRestoredDatabaseMetadata(
              restored.postgresContainerId,
              metadata,
            );
            const semantic = restoredSemanticManifest(restored.postgresContainerId);
            const dataSnapshot = restoredDataSnapshot(
              restored.postgresContainerId,
              metadata,
            );
            if (fixturePayload) {
              const restoredPayload = readFileSync(
                join(restoredSnapshotDirectory, restoredReferences[0].path),
              );
              if (!restoredPayload.equals(fixturePayload)) {
                throw new Error("Isolated restored Storage fixture bytes mismatch");
              }
            }
            return externalArchiveOptions
              ? buildExternalRestoreManifest({
                archiveSha256,
                dataSnapshot,
                metadata,
                plan,
                semantic,
              })
              : {
                archive_authenticated: true,
                archive_sha256: archiveSha256,
                bootstrap_schema_clean_replay: true,
                clean_restore_verified: true,
                cli_version: PINNED_SUPABASE_CLI_VERSION,
                database_reference_count: restoredReferences.length,
                destructive_scope: plan.destructive_scope,
                dev_stack_decoy_ignored: true,
                object_count: metadata.storage_payload.object_count,
                payload_catalog_sha256: metadata.storage_payload.catalog_sha256,
                payload_total_bytes: metadata.storage_payload.total_bytes,
                metadata_sha256: fullLocalBackupMetadataSha256(metadata),
                production_resource_resolution: "compose-labels-exact",
                restored_storage_compose_provenance: true,
                next_backup_inventory_verified: true,
                status: "PASS",
              };
          },
        });
      },
    });

    if (externalArchiveOptions) {
      restoreManifest = restoreResult;
      const restoreArtifact = writeAuthenticatedJsonArtifact({
        backupKey: restoreKey,
        outputPath: externalArchiveOptions.restore_manifest.path,
        payload: restoreManifest,
      });
      const recoveryManifest = signFullLocalBackupKeyRecoveryEvidence({
        evidence: {
          archive_device_id: externalArchiveOptions.archive_device_id,
          archive_sha256: restoreManifest.source_archive_sha256,
          clean_restore_verified: restoreManifest.fresh_target_attested,
          created_at: new Date().toISOString(),
          escrow_device_id: externalArchiveOptions.replacement_device_id,
          escrow_envelope_path: externalArchiveOptions.escrow_envelope,
          escrow_envelope_sha256: recoveryContext.envelope_sha256,
          format: "homecook-full-local-backup-key-recovery-v1",
          isolated_replacement_environment_verified: true,
          keychain_reregistered:
            recoveryContext.keychain_receipt.key_sha256
              === createHash("sha256").update(restoreKey).digest("hex"),
          keychain_registration: recoveryContext.keychain_receipt,
          restored_metadata_sha256: fullLocalBackupMetadataSha256(authenticatedMetadata),
          restore_manifest_path: restoreArtifact.path,
          restore_manifest_sha256: createHash("sha256")
            .update(restoreArtifact.bytes)
            .digest("hex"),
        },
        privateKey: readFileSync(externalArchiveOptions.recovery_issuer_private_key, "utf8"),
      });
      verifyFullLocalBackupKeyRecoveryIssuerAttestation({
        envelope: JSON.parse(readFileSync(externalArchiveOptions.escrow_envelope, "utf8")),
        evidence: recoveryManifest,
      });
      const recoveryArtifact = writeAuthenticatedJsonArtifact({
        backupKey: restoreKey,
        outputPath: externalArchiveOptions.recovery_manifest.path,
        payload: recoveryManifest,
      });
      return {
        ...restoreManifest,
        escrow_envelope_authenticated: recoveryContext.envelope_authenticated,
        escrow_envelope_sha256: recoveryContext.envelope_sha256,
        keychain_adapter: recoveryContext.keychain_receipt.adapter,
        keychain_reregistered:
          recoveryContext.keychain_receipt.key_sha256
            === createHash("sha256").update(restoreKey).digest("hex"),
        production_readiness_issued: false,
        recovery_evidence_derived_from_restore: true,
        recovery_issuer_attestation_verified: true,
        recovery_manifest_path: recoveryArtifact.path,
        recovery_manifest_sha256: createHash("sha256")
          .update(recoveryArtifact.bytes)
          .digest("hex"),
        restore_manifest_path: restoreArtifact.path,
        restore_manifest_sha256: createHash("sha256")
          .update(restoreArtifact.bytes)
          .digest("hex"),
      };
    }

    if (!keyRecoveryMode) return restoreResult;
    if (
      restoreResult.archive_sha256 !== fixtureArchiveMetadata.archive_sha256
      || restoreResult.metadata_sha256
        !== fullLocalBackupMetadataSha256(authenticatedMetadata)
      || recoveryContext.keychain_receipt.key_sha256
        !== createHash("sha256").update(restoreKey).digest("hex")
    ) {
      throw new Error("Actual isolated replacement environment recovery outputs are not bound");
    }
    const restoreResultPath = join(root, "replacement-restore-result.json");
    writeFileSync(restoreResultPath, `${JSON.stringify(restoreResult, null, 2)}\n`, {
      mode: 0o600,
    });
    const recoveryManifest = signFullLocalBackupKeyRecoveryEvidence({
      evidence: {
        archive_device_id: "isolated-archive-adapter",
        archive_sha256: restoreResult.archive_sha256,
        clean_restore_verified: restoreResult.clean_restore_verified,
        created_at: new Date().toISOString(),
        escrow_device_id: "isolated-escrow-adapter",
        escrow_envelope_path: escrowEnvelopePath,
        escrow_envelope_sha256: recoveryContext.envelope_sha256,
        format: "homecook-full-local-backup-key-recovery-v1",
        isolated_replacement_environment_verified: true,
        keychain_reregistered:
          recoveryContext.keychain_receipt.key_sha256
            === createHash("sha256").update(restoreKey).digest("hex"),
        keychain_registration: recoveryContext.keychain_receipt,
        restored_metadata_sha256: restoreResult.metadata_sha256,
        restore_manifest_path: restoreResultPath,
        restore_manifest_sha256: createHash("sha256")
          .update(readFileSync(restoreResultPath))
          .digest("hex"),
      },
      privateKey: recoveryIssuer.privateKey,
    });
    verifyFullLocalBackupKeyRecoveryIssuerAttestation({
      envelope: JSON.parse(readFileSync(escrowEnvelopePath, "utf8")),
      evidence: recoveryManifest,
    });
    return {
      ...restoreResult,
      escrow_envelope_authenticated: recoveryContext.envelope_authenticated,
      escrow_envelope_sha256: recoveryContext.envelope_sha256,
      keychain_adapter: recoveryContext.keychain_receipt.adapter,
      keychain_reregistered:
        recoveryContext.keychain_receipt.key_sha256
          === createHash("sha256").update(restoreKey).digest("hex"),
      production_readiness_issued: false,
      recovery_evidence_derived_from_restore: true,
      recovery_issuer_attestation_verified: true,
      recovery_manifest: recoveryManifest,
      isolated_replacement_environment_verified: true,
    };
  } finally {
    cleanupContainer(plan.source_database_container);
    cleanupContainer(plan.restore_database_container);
    cleanupVolume(plan.source_postgres_volume);
    cleanupVolume(plan.source_storage_volume);
    cleanupVolume(plan.restore_postgres_volume);
    cleanupVolume(plan.restore_storage_volume);
    rmSync(root, { force: true, recursive: true });
  }
}

if (!process.argv.includes("--execute")) {
  process.stderr.write(
    "Use --execute to run the isolated fixture drill.\n"
    + `External archive mode: ${EXTERNAL_ARCHIVE_USAGE}\n`,
  );
  process.exit(1);
}

executeDrill()
  .then((evidence) => process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`))
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
