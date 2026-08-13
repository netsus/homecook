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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildDockerStorageVolumeCaptureInvocation,
  buildDockerStorageVolumeRestoreInvocation,
  createEncryptedPlatformBackup,
  PINNED_SUPABASE_CLI_VERSION,
  listStoragePayloadPaths,
  verifyStoragePayloadManifest,
  withVerifiedPlatformBackup,
} from "./lib/full-local-platform-backup.mjs";
import { buildPlatformRestoreSql } from "./lib/full-local-restore-cutover.mjs";
import {
  buildIsolatedDrillPlan,
  filterRunningIsolatedContainers,
  mapStorageRowsToPayloadReferences,
} from "./lib/isolated-local-backup-restore-drill.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXCLUDES = "gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: "utf8",
    env: options.env ?? process.env,
    input: options.input,
    maxBuffer: 128 * 1024 * 1024,
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(options.failure ?? `${command} failed in isolated drill`);
  }
  return result.stdout ?? "";
}

function supabase(workdir, args, options = {}) {
  return run("pnpm", [
    "dlx",
    `supabase@${PINNED_SUPABASE_CLI_VERSION}`,
    ...args,
    "--workdir",
    workdir,
  ], options);
}

function rewriteIsolatedConfig(config, projectId, basePort) {
  const ports = new Map(
    Array.from({ length: 10 }, (_, offset) => [54320 + offset, basePort - 1 + offset]),
  );
  return config
    .replace(/^project_id\s*=.*$/mu, `project_id = "${projectId}"`)
    .replace(/\b5432[0-9]\b/gu, (value) => String(ports.get(Number(value))));
}

function initializeProject(directory, projectId, basePort) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  supabase(directory, ["init", "--force"]);
  const configPath = join(directory, "supabase", "config.toml");
  writeFileSync(
    configPath,
    rewriteIsolatedConfig(readFileSync(configPath, "utf8"), projectId, basePort),
    { encoding: "utf8", mode: 0o600 },
  );
}

function startProject(directory) {
  supabase(directory, ["start", "--exclude", EXCLUDES, "--ignore-health-check"], {
    failure: "Pinned isolated Supabase start failed",
  });
}

function stopProject(directory) {
  try {
    supabase(directory, ["stop", "--no-backup"], {
      failure: "Pinned isolated Supabase cleanup failed",
    });
  } catch {
    // The caller reports the original failure; isolated resources are also
    // checked by their exact namespace before any fallback cleanup.
  }
}

function seedStorage({ databaseContainer, fixtureDirectory, volumeName }) {
  const payload = Buffer.from("homecook-isolated-storage-fixture-v1", "utf8");
  const version = "fixture-version-1";
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
  run("docker", [
    "exec",
    databaseContainer,
    "psql",
    "--username",
    "postgres",
    "--dbname",
    "postgres",
    "--variable",
    "ON_ERROR_STOP=1",
    "--command",
    `insert into storage.buckets (id, name, public) values ('fixture', 'fixture', false);\ninsert into storage.objects (bucket_id, name, version, metadata) values ('fixture', 'owner-a/object.bin', '${version}', '{"mimetype":"application/octet-stream","size":${payload.length}}'::jsonb);`,
  ], { failure: "Isolated Storage metadata fixture failed" });
  const seedArchiveDirectory = join(fixtureDirectory, "archive");
  mkdirSync(seedArchiveDirectory, { recursive: true, mode: 0o700 });
  run("tar", [
    "-C",
    fixtureDirectory,
    "-cf",
    join(seedArchiveDirectory, "storage.payload.tar"),
    "stub",
  ], { failure: "Isolated Storage payload fixture archive failed" });
  restoreVolume({ archiveDirectory: seedArchiveDirectory, volumeName });
  return payload;
}

function storageRows(databaseContainer) {
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
  ]).trim());
}

function runningContainers(names) {
  return filterRunningIsolatedContainers(names.map((name) => {
    const result = spawnSync(
      "docker",
      ["inspect", "--format", "{{.State.Running}}", name],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return { name, running: result.status === 0 && result.stdout.trim() === "true" };
  }));
}

function setContainerState(action, names, failure) {
  if (names.length === 0) return;
  run("docker", [action, ...names], { failure });
}

function removeIsolatedVolume(volumeName) {
  const inspected = spawnSync("docker", ["volume", "inspect", volumeName], {
    encoding: "utf8",
    stdio: ["ignore", "ignore", "ignore"],
  });
  if (inspected.status === 0) {
    run("docker", ["volume", "rm", volumeName], {
      failure: "Isolated Storage volume cleanup failed",
    });
  }
}

function captureVolume({ archiveDirectory, snapshotDirectory, volumeName }) {
  mkdirSync(archiveDirectory, { recursive: true, mode: 0o700 });
  mkdirSync(snapshotDirectory, { recursive: true, mode: 0o700 });
  const invocation = buildDockerStorageVolumeCaptureInvocation({
    archiveDirectory,
    volumeName,
  });
  run(invocation.command, invocation.args, {
    failure: "Isolated Storage volume capture failed",
  });
  run("tar", [
    "-C",
    snapshotDirectory,
    "-xf",
    join(archiveDirectory, "storage.payload.tar"),
  ], { failure: "Isolated Storage payload extraction failed" });
}

function restoreVolume({ archiveDirectory, volumeName }) {
  run("docker", ["volume", "create", volumeName], {
    failure: "Isolated restore Storage volume creation failed",
  });
  const invocation = buildDockerStorageVolumeRestoreInvocation({
    archiveDirectory,
    volumeName,
  });
  run(invocation.command, invocation.args, {
    failure: "Isolated Storage volume restore failed",
  });
}

function restoreDatabase({ container, dataPath, rolesPath, schemaPath }) {
  const sql = buildPlatformRestoreSql({
    dataSql: readFileSync(dataPath, "utf8"),
    rolesSql: readFileSync(rolesPath, "utf8"),
    schemaSql: readFileSync(schemaPath, "utf8"),
  });
  run("docker", [
    "exec",
    "-i",
    container,
    "psql",
    "--single-transaction",
    "--variable",
    "ON_ERROR_STOP=1",
    "--username",
    "postgres",
    "--dbname",
    "postgres",
  ], { failure: "Isolated database restore failed", input: sql });
}

async function executeDrill() {
  const suffix = `${Date.now().toString(36)}${process.pid.toString(36)}`.slice(-8);
  const plan = buildIsolatedDrillPlan({ suffix });
  const root = mkdtempSync(join(tmpdir(), "homecook-backup-drill-"));
  chmodSync(root, 0o700);
  const sourceRoot = join(root, "source");
  const restoreRoot = join(root, "restore");
  const artifactRoot = join(root, "artifacts");
  const sourceArchiveDirectory = join(artifactRoot, "source-volume");
  const sourceSnapshotDirectory = join(artifactRoot, "source-snapshot");
  const restoredArchiveDirectory = join(artifactRoot, "restored-volume");
  const restoredSnapshotDirectory = join(artifactRoot, "restored-snapshot");
  const archive = join(artifactRoot, "platform.tar.gz.enc");
  mkdirSync(artifactRoot, { recursive: true, mode: 0o700 });
  const backupKey = randomBytes(48).toString("base64url");
  let sourceStarted = false;
  let restoreStarted = false;
  try {
    const version = supabase(ROOT, ["--version"]).trim();
    if (version !== PINNED_SUPABASE_CLI_VERSION) {
      throw new Error("Pinned Supabase CLI version mismatch in isolated drill");
    }
    initializeProject(sourceRoot, plan.project_id, 57321);
    startProject(sourceRoot);
    sourceStarted = true;
    const fixturePayload = seedStorage({
      databaseContainer: plan.source_database_container,
      fixtureDirectory: join(artifactRoot, "fixture"),
      volumeName: plan.source_storage_volume,
    });
    const sourceRows = storageRows(plan.source_database_container);
    const writers = runningContainers([
      plan.source_auth_container,
      plan.source_realtime_container,
      plan.source_rest_container,
      plan.source_storage_container,
    ]);
    createEncryptedPlatformBackup({
      backupKey,
      output: archive,
      repositoryRoot: sourceRoot,
      storage: {
        beginConsistentCut: () => setContainerState(
          "stop",
          writers,
          "Isolated consistent cut failed",
        ),
        captureSource: () => captureVolume({
          archiveDirectory: sourceArchiveDirectory,
          snapshotDirectory: sourceSnapshotDirectory,
          volumeName: plan.source_storage_volume,
        }),
        endConsistentCut: () => setContainerState(
          "start",
          writers,
          "Isolated consistent cut release failed",
        ),
        references: () => mapStorageRowsToPayloadReferences(
          sourceRows,
          listStoragePayloadPaths(sourceSnapshotDirectory),
        ),
        sourceDirectory: sourceSnapshotDirectory,
        sourceIdentity: `docker-volume:${plan.source_storage_volume}`,
      },
    });

    stopProject(sourceRoot);
    sourceStarted = false;
    initializeProject(restoreRoot, plan.restore_project_id, 58321);
    startProject(restoreRoot);
    restoreStarted = true;
    const restoreWriters = runningContainers([
      plan.restore_storage_container,
      `supabase_auth_${plan.restore_project_id}`,
      `supabase_rest_${plan.restore_project_id}`,
      `supabase_realtime_${plan.restore_project_id}`,
    ]);
    setContainerState("stop", restoreWriters, "Isolated restore cut failed");
    removeIsolatedVolume(plan.restore_storage_volume);

    const evidence = await withVerifiedPlatformBackup({
      archive,
      backupKey,
      consume: ({ dataPath, metadata, rolesPath, schemaPath, storagePayloadPath }) => {
        restoreDatabase({
          container: plan.restore_database_container,
          dataPath,
          rolesPath,
          schemaPath,
        });
        mkdirSync(restoredArchiveDirectory, { recursive: true, mode: 0o700 });
        writeFileSync(
          join(restoredArchiveDirectory, "storage.payload.tar"),
          readFileSync(storagePayloadPath),
          { mode: 0o600 },
        );
        restoreVolume({
          archiveDirectory: restoredArchiveDirectory,
          volumeName: plan.restore_storage_volume,
        });
        captureVolume({
          archiveDirectory: join(artifactRoot, "restored-recapture"),
          snapshotDirectory: restoredSnapshotDirectory,
          volumeName: plan.restore_storage_volume,
        });
        const restoredRows = storageRows(plan.restore_database_container);
        const restoredReferences = mapStorageRowsToPayloadReferences(
          restoredRows,
          listStoragePayloadPaths(restoredSnapshotDirectory),
        );
        verifyStoragePayloadManifest(metadata.storage_payload, {
          references: restoredReferences,
          sourceDirectory: restoredSnapshotDirectory,
          sourceIdentity: metadata.storage_payload.source_identity,
        });
        const restoredPayload = readFileSync(
          join(restoredSnapshotDirectory, restoredReferences[0].path),
        );
        if (!restoredPayload.equals(fixturePayload)) {
          throw new Error("Isolated restored Storage fixture bytes mismatch");
        }
        return {
          archive_authenticated: true,
          cli_version: PINNED_SUPABASE_CLI_VERSION,
          database_reference_count: restoredReferences.length,
          destructive_scope: plan.destructive_scope,
          object_count: metadata.storage_payload.object_count,
          payload_catalog_sha256: metadata.storage_payload.catalog_sha256,
          payload_total_bytes: metadata.storage_payload.total_bytes,
          status: "PASS",
        };
      },
    });
    return evidence;
  } finally {
    if (sourceStarted) stopProject(sourceRoot);
    if (restoreStarted) stopProject(restoreRoot);
    removeIsolatedVolume(plan.source_storage_volume);
    removeIsolatedVolume(plan.restore_storage_volume);
    rmSync(root, { force: true, recursive: true });
  }
}

if (!process.argv.includes("--execute")) {
  process.stderr.write("Use --execute to run the isolated fixture drill.\n");
  process.exit(1);
}

executeDrill()
  .then((evidence) => process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`))
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
