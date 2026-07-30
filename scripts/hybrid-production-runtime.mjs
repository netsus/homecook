#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertBackupMatchesCurrent,
  assertPinnedImageInspection,
  assertPreRestoreBackupBinding,
  assertDockerEnginePlatform,
  assertProductionComposeModel,
  assertRestoreAllowed,
  assertSafeTarArchive,
  buildAclRestoreList,
  buildPostDataRestoreList,
  canonicalCatalogManifest,
  compareCatalogManifests,
  evaluateCapacityPreflight,
  evaluateMemoryCapacityPreflight,
  evaluateRuntimeStatus,
  planPostRestoreMigrationAdvance,
  runRestorePublicationGate,
  synchronizeRemoteJwks,
  validateHybridProductionConfig,
  validateInstalledSemanticState,
  validateSemanticRestoreEvidence,
  validateStorageXattrManifest,
} from "./lib/hybrid-production-runtime.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COMPOSE_FILE = join(
  ROOT,
  "infra/hybrid-supabase/docker-compose.production.yml",
);
const DEFAULT_CONFIG = join(
  ROOT,
  "infra/hybrid-supabase/.env.production.local",
);
const SECRET_NAMES = Object.freeze([
  "AUTH_SUPABASE_PUBLISHABLE_KEY",
  "DATA_SUPABASE_PUBLISHABLE_KEY",
  "DATA_SUPABASE_SECRET_KEY",
  "HOMECOOK_SESSION_ATTESTATION_HMAC_KEY_V1",
  "HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1",
  "HYBRID_COMBINED_JWKS",
  "HYBRID_POSTGRES_PASSWORD",
  "HYBRID_STORAGE_LEGACY_JWT_SECRET",
]);
const BACKUP_KEY_ENV = "HOMECOOK_HYBRID_BACKUP_KEY";
const BACKUP_FORMAT = "homecook-hybrid-complete-v2";
const STORAGE_XATTR_ENTRY =
  ".homecook-complete-v2-storage-xattrs.json";
const STORAGE_XATTR_FORMAT = "homecook-storage-xattrs-v1";
const STORAGE_XATTR_NAMES = Object.freeze([
  "user.supabase.cache-control",
  "user.supabase.content-type",
]);
const PBKDF2_ITERATIONS = 200_000;
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");
const POSTGRES_CONTAINERS = new Map();
const RUNTIME_IMAGE_CONFIG_KEYS = Object.freeze([
  "HYBRID_NODE_IMAGE",
  "HYBRID_POSTGRES_IMAGE",
  "HYBRID_POSTGREST_IMAGE",
  "HYBRID_STORAGE_IMAGE",
]);
const MEMORY_SERVICES = Object.freeze([
  "gateway",
  "postgres",
  "postgrest",
  "storage",
]);

function fail(message) {
  throw new Error(message);
}

function sha256File(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) {
    return null;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    fail(`${name} requires a value.`);
  }
  return value;
}

function hasFlag(args, name) {
  return args.includes(name);
}

function parseEnvFile(path) {
  const result = {};
  for (const [index, rawLine] of readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line);
    if (!match) {
      fail(`Invalid production config at line ${index + 1}.`);
    }
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (SECRET_NAMES.includes(match[1]) || match[1] === BACKUP_KEY_ENV) {
      fail(`Secret ${match[1]} must not be stored in the config file.`);
    }
    result[match[1]] = value;
  }
  return result;
}

function run(command, args, options = {}) {
  const inputFd = options.stdinPath
    ? openSync(options.stdinPath, "r")
    : null;
  const outputFd = options.stdoutPath
    ? openSync(options.stdoutPath, "w", 0o600)
    : null;
  try {
    const result = spawnSync(command, args, {
      cwd: options.cwd ?? ROOT,
      encoding: outputFd === null ? "utf8" : undefined,
      env: options.env ?? process.env,
      input: options.input,
      maxBuffer: 64 * 1024 * 1024,
      stdio: [
        inputFd ?? (options.input === undefined ? "ignore" : "pipe"),
        outputFd ?? "pipe",
        options.inheritStderr ? "inherit" : "pipe",
      ],
    });
    if (result.status !== 0) {
      fail(options.failure ?? `${command} failed.`);
    }
    return typeof result.stdout === "string" ? result.stdout : "";
  } finally {
    if (inputFd !== null) {
      closeSync(inputFd);
    }
    if (outputFd !== null) {
      closeSync(outputFd);
    }
  }
}

function keychainSecret(service, account) {
  return run(
    "security",
    [
      "find-generic-password",
      "-s",
      service,
      "-a",
      account,
      "-w",
    ],
    { failure: `Required Keychain item ${account} is unavailable.` },
  ).trim();
}

function loadSecrets(config, args) {
  if (config.HOMECOOK_HYBRID_SECRET_SOURCE === "process-env") {
    if (!hasFlag(args, "--allow-process-env-secrets")) {
      fail(
        "process-env secrets require the explicit --allow-process-env-secrets flag.",
      );
    }
    return Object.fromEntries(
      SECRET_NAMES.map((name) => [name, process.env[name] ?? ""]),
    );
  }
  if (config.HOMECOOK_HYBRID_SECRET_SOURCE !== "keychain") {
    fail("HOMECOOK_HYBRID_SECRET_SOURCE must be keychain or process-env.");
  }
  const service = config.HOMECOOK_HYBRID_KEYCHAIN_SERVICE;
  if (!service) {
    fail("HOMECOOK_HYBRID_KEYCHAIN_SERVICE is required for Keychain.");
  }
  return Object.fromEntries(
    SECRET_NAMES.map((name) => [
      name,
      keychainSecret(service, name),
    ]),
  );
}

function loadBackupKey(runtime, args) {
  const key = runtime.config.HOMECOOK_HYBRID_SECRET_SOURCE === "process-env"
    ? process.env[BACKUP_KEY_ENV]
    : keychainSecret(
      runtime.config.HOMECOOK_HYBRID_KEYCHAIN_SERVICE,
      runtime.config.HOMECOOK_HYBRID_BACKUP_KEY_ID,
    );
  if (
    typeof key !== "string"
    || Buffer.byteLength(key, "utf8") < 32
    || Object.values(runtime.secrets).includes(key)
  ) {
    fail("The separated backup key is missing, too short, or reused.");
  }
  if (
    runtime.config.HOMECOOK_HYBRID_SECRET_SOURCE === "process-env"
    && !hasFlag(args, "--allow-process-env-secrets")
  ) {
    fail("The backup key requires --allow-process-env-secrets.");
  }
  return key;
}

function composeArgs(runtime, ...args) {
  return [
    "compose",
    "--project-name",
    runtime.config.HYBRID_COMPOSE_PROJECT_NAME,
    "-f",
    COMPOSE_FILE,
    ...args,
  ];
}

function compose(runtime, args, options = {}) {
  return run("docker", composeArgs(runtime, ...args), {
    ...options,
    env: runtime.env,
    failure: options.failure ?? "Docker Compose operation failed.",
  });
}

function postgresContainer(runtime) {
  const project = runtime.config.HYBRID_COMPOSE_PROJECT_NAME;
  const cached = POSTGRES_CONTAINERS.get(project);
  if (cached) {
    return cached;
  }
  const container = compose(runtime, ["ps", "-q", "postgres"]).trim();
  if (!container) {
    fail("PostgreSQL container is not running.");
  }
  POSTGRES_CONTAINERS.set(project, container);
  return container;
}

async function loadRuntime(args) {
  const configPath = resolve(optionValue(args, "--config") ?? DEFAULT_CONFIG);
  if (!existsSync(configPath)) {
    fail(`Production config does not exist: ${configPath}`);
  }
  const mode = statSync(configPath).mode & 0o777;
  const config = parseEnvFile(configPath);
  const secrets = loadSecrets(config, args);
  const validation = validateHybridProductionConfig({
    config,
    secrets,
    configFileMode: mode,
    allowInsecureLoopback:
      hasFlag(args, "--allow-insecure-loopback-auth-fixture"),
  });
  const [engineOs, engineArchitecture] = run(
    "docker",
    ["info", "--format", "{{.OSType}}/{{.Architecture}}"],
    { failure: "Docker engine platform could not be inspected." },
  ).trim().split("/");
  assertDockerEnginePlatform({
    configuredPlatform: validation.dockerPlatform,
    engineArchitecture,
    engineOs,
  });
  const env = {
    ...process.env,
    ...config,
    ...secrets,
    ALLOW_INSECURE_LOCAL_AUTH_STUB:
      hasFlag(args, "--allow-insecure-loopback-auth-fixture") ? "1" : "0",
  };
  delete env.DOCKER_DEFAULT_PLATFORM;
  const jwks = await synchronizeRemoteJwks({
    allowInsecureLoopback:
      hasFlag(args, "--allow-insecure-loopback-auth-fixture"),
    cachePath: `${configPath}.remote-jwks.json`,
    combinedJwks: secrets.HYBRID_COMBINED_JWKS,
    url: config.AUTH_SUPABASE_JWKS_URL,
  });
  const modelText = run(
    "docker",
    [
      "compose",
      "--project-name",
      config.HYBRID_COMPOSE_PROJECT_NAME,
      "-f",
      COMPOSE_FILE,
      "config",
      "--format",
      "json",
    ],
    {
      env,
      failure: "Production Compose configuration is invalid.",
    },
  );
  assertProductionComposeModel(JSON.parse(modelText));
  return Object.freeze({
    config,
    configPath,
    env,
    jwks,
    secrets,
    validation,
  });
}

function inspectImage(image) {
  const [platform, repoDigests] = run(
    "docker",
    [
      "image",
      "inspect",
      image,
      "--format",
      "{{.Os}}/{{.Architecture}}",
    ],
    { failure: `Required Docker image is unavailable: ${image}.` },
  ).trim().replace("/aarch64", "/arm64").replace("/x86_64", "/amd64")
    .concat("\n", run(
      "docker",
      [
        "image",
        "inspect",
        image,
        "--format",
        "{{json .RepoDigests}}",
      ],
      { failure: `Required Docker image is unavailable: ${image}.` },
    ).trim()).split("\n");
  return {
    platform,
    repoDigests: JSON.parse(repoDigests || "[]"),
  };
}

function assertNativeRuntimeImages(runtime, includeGateway = true) {
  for (const configKey of RUNTIME_IMAGE_CONFIG_KEYS) {
    const image = runtime.config[configKey];
    const inspected = inspectImage(image);
    assertPinnedImageInspection({
      actualPlatform: inspected.platform,
      configuredPlatform: runtime.config.HYBRID_DOCKER_PLATFORM,
      expectedReference: image,
      repoDigests: inspected.repoDigests,
    });
  }
  if (includeGateway) {
    const gateway = inspectImage("homecook-hybrid-gateway:production");
    if (gateway.platform !== runtime.config.HYBRID_DOCKER_PLATFORM) {
      fail("Loopback gateway image architecture does not match Docker.");
    }
  }
}

function pullNativeRuntimeImages(runtime) {
  for (const configKey of RUNTIME_IMAGE_CONFIG_KEYS) {
    const image = runtime.config[configKey];
    run(
      "docker",
      [
        "pull",
        "--platform",
        runtime.config.HYBRID_DOCKER_PLATFORM,
        image,
      ],
      { failure: `Native Docker image pull failed for ${image}.` },
    );
  }
  assertNativeRuntimeImages(runtime, false);
}

function psql(runtime, sql, options = {}) {
  return run(
    "docker",
    [
      "exec",
      "-i",
      postgresContainer(runtime),
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "supabase_admin",
      "-d",
      runtime.config.HYBRID_POSTGRES_DB,
      ...(options.tuples ? ["-qAt"] : []),
    ],
    {
      input: sql,
      env: runtime.env,
      inheritStderr: process.env.HYBRID_PRODUCTION_DEBUG === "1",
      failure: options.failure ?? "PostgreSQL operation failed.",
    },
  );
}

function psqlFile(runtime, path) {
  const sql = readFileSync(path, "utf8");
  const ownsTransaction =
    /^\s*begin\s*;/imu.test(sql)
    && /^\s*commit\s*;/imu.test(sql);
  return run(
    "docker",
    [
      "exec",
      "-i",
      postgresContainer(runtime),
      "psql",
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "supabase_admin",
      "-d",
      runtime.config.HYBRID_POSTGRES_DB,
      ...(!ownsTransaction ? ["--single-transaction"] : []),
    ],
    {
      stdinPath: path,
      env: runtime.env,
      inheritStderr: process.env.HYBRID_PRODUCTION_DEBUG === "1",
      failure: `SQL application failed for ${basename(path)}.`,
    },
  );
}

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => join(MIGRATIONS_DIR, name));
}

function ensureStorageSchema(runtime) {
  const storageSchemaReadySql = `
    select (
      to_regclass('storage.buckets') is not null
      and to_regclass('storage.objects') is not null
      and exists (
        select 1
        from pg_catalog.pg_attribute
        where attrelid = to_regclass('storage.buckets')
          and attname = 'file_size_limit'
          and not attisdropped
      )
      and exists (
        select 1
        from pg_catalog.pg_attribute
        where attrelid = to_regclass('storage.buckets')
          and attname = 'allowed_mime_types'
          and not attisdropped
      )
    )::integer;
  `;
  const ready = psql(
    runtime,
    storageSchemaReadySql,
    { tuples: true },
  ).trim();
  if (ready === "1") {
    return;
  }
  const containerName =
    `${runtime.config.HYBRID_COMPOSE_PROJECT_NAME}-storage-bootstrap`;
  compose(runtime, [
    "run",
    "-d",
    "--name",
    containerName,
    "--no-deps",
    "storage",
  ], {
    failure: "Storage schema bootstrap container failed to start.",
  });
  try {
    let initialized = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const result = psql(
        runtime,
        storageSchemaReadySql,
        { tuples: true },
      ).trim();
      if (result === "1") {
        initialized = true;
        break;
      }
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        500,
      );
    }
    if (!initialized) {
      fail("Storage image did not initialize its database schema.");
    }
  } finally {
    run("docker", ["rm", "-f", containerName], {
      failure: "Storage bootstrap container cleanup failed.",
    });
  }
}

function ensureMigrationLedger(runtime) {
  psql(
    runtime,
    `
      create schema if not exists supabase_migrations;
      create table if not exists supabase_migrations.schema_migrations (
        version text primary key,
        statements text[],
        name text
      );
      revoke all on schema supabase_migrations from public;
      revoke all on supabase_migrations.schema_migrations from public;
    `,
  );
}

function applyMigrations(runtime) {
  ensureMigrationLedger(runtime);
  for (const path of migrationFiles()) {
    const version = basename(path, ".sql").split("_", 1)[0];
    const applied = psql(
      runtime,
      `select count(*) from supabase_migrations.schema_migrations where version = '${version}';`,
      { tuples: true },
    ).trim();
    if (applied === "1") {
      continue;
    }
    psqlFile(runtime, path);
    psql(
      runtime,
      `
        insert into supabase_migrations.schema_migrations
          (version, statements, name)
        values (
          '${version}',
          array[]::text[],
          '${basename(path, ".sql").replaceAll("'", "''")}'
        )
        on conflict (version) do nothing;
      `,
    );
  }
}

function applyPendingMigrationsAtomically(runtime) {
  ensureMigrationLedger(runtime);
  const appliedVersions = [];
  for (const path of migrationFiles()) {
    const filename = basename(path, ".sql");
    const version = filename.split("_", 1)[0];
    if (
      !/^[0-9]{14}$/u.test(version)
      || !/^[A-Za-z0-9_]+$/u.test(filename)
    ) {
      fail(`Migration filename is unsafe: ${filename}.`);
    }
    const applied = psql(
      runtime,
      `select count(*) from supabase_migrations.schema_migrations where version = '${version}';`,
      { tuples: true },
    ).trim();
    if (applied === "1") {
      continue;
    }
    const sql = readFileSync(path, "utf8");
    const begin = /^\s*begin\s*;/iu.exec(sql);
    const commit = /commit\s*;\s*$/iu.exec(sql);
    if (!begin || !commit || commit.index <= begin[0].length) {
      fail(`Forward migration must own one outer transaction: ${filename}.`);
    }
    const body = sql.slice(begin[0].length, commit.index).trim();
    psql(
      runtime,
      `
        begin;
        set local lock_timeout = '15s';
        set local statement_timeout = '10min';
        lock table auth.users in share row exclusive mode;
        lock table private.remote_auth_identity_epochs in share mode;
        ${body}
        insert into supabase_migrations.schema_migrations
          (version, statements, name)
        values (
          '${version}',
          array[]::text[],
          '${filename}'
        );
        commit;
      `,
      { failure: `Atomic forward migration failed for ${filename}.` },
    );
    appliedVersions.push(version);
  }
  return Object.freeze(appliedVersions);
}

const RESIDUAL_SQL = `
  select json_build_object(
    'auth_users', (select count(*) from auth.users),
    'auth_users_external_depend_residual', (
      select count(*)
      from pg_catalog.pg_depend
      where refobjid = 'auth.users'::regclass
        and deptype = 'n'
    ),
    'auth_users_residual', (
      (select count(*) from pg_catalog.pg_constraint
        where confrelid = 'auth.users'::regclass)
      +
      (select count(*) from pg_catalog.pg_depend
        where refobjid = 'auth.users'::regclass
          and deptype = 'n')
      +
      (select count(*) from pg_catalog.pg_proc
        where prokind in ('f', 'p')
          and pg_get_functiondef(oid) ilike '%auth.users%')
      +
      (select count(*) from pg_catalog.pg_policies
        where coalesce(qual, '') ilike '%auth.users%'
          or coalesce(with_check, '') ilike '%auth.users%')
    ),
    'invalid_constraints', (
      select count(*) from pg_catalog.pg_constraint where not convalidated
    ),
    'migration_count', (
      select count(*) from supabase_migrations.schema_migrations
    ),
    'runtime_ready', (
      to_regprocedure('private.verify_hybrid_request_authority()') is not null
    )
  )::text;
`;

function semanticState(runtime) {
  return JSON.parse(psql(runtime, RESIDUAL_SQL, { tuples: true }).trim());
}

function assertInstalled(
  runtime,
  expectedMigrationCount = migrationFiles().length,
) {
  const state = semanticState(runtime);
  validateInstalledSemanticState(state, expectedMigrationCount);
  return state;
}

function waitGateway(runtime) {
  const url = `http://127.0.0.1:${runtime.validation.gatewayPort}/healthz`;
  const result = run(
    "node",
    [
      "--input-type=module",
      "-e",
      `
        const url = process.argv[1];
        for (let attempt = 0; attempt < 180; attempt += 1) {
          try {
            const response = await fetch(url);
            if (response.status === 200) process.exit(0);
          } catch {}
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        process.exit(1);
      `,
      url,
    ],
    { failure: "Loopback gateway did not become healthy." },
  );
  return result;
}

function recover(runtime) {
  assertNativeRuntimeImages(runtime);
  compose(runtime, ["up", "-d", "--wait", "postgres"]);
  assertInstalled(runtime);
  compose(runtime, [
    "up",
    "-d",
    "--wait",
    "postgrest",
    "postgrest-probe",
    "storage",
  ]);
  compose(runtime, ["up", "-d", "--wait", "gateway"]);
  waitGateway(runtime);
}

function forceGatewayPrivate(runtime) {
  compose(runtime, ["stop", "gateway"], {
    failure: "Loopback gateway could not be forced private.",
  });
}

function bestEffortGatewayPrivate(runtime) {
  try {
    forceGatewayPrivate(runtime);
  } catch {
    // Preserve the restore failure while keeping the cleanup attempt scoped.
  }
}

function parseDockerBytes(value) {
  const match = /^([0-9]+(?:\.[0-9]+)?)\s*([KMGT]?i?B)$/iu.exec(
    String(value).trim(),
  );
  if (!match) {
    fail(`Docker memory value could not be parsed: ${value}.`);
  }
  const factors = {
    B: 1,
    GiB: 1024 ** 3,
    GB: 1000 ** 3,
    KiB: 1024,
    KB: 1000,
    MiB: 1024 ** 2,
    MB: 1000 ** 2,
    TiB: 1024 ** 4,
    TB: 1000 ** 4,
  };
  return Math.round(Number(match[1]) * factors[match[2]]);
}

function containerForService(runtime, service) {
  const container = compose(runtime, ["ps", "-q", service]).trim();
  if (!container) {
    fail(`${service} container is not running for capacity measurement.`);
  }
  return container;
}

function cgroupMemory(runtime, container) {
  const script = `
    const fs = require("node:fs");
    const cgroupLine = fs.readFileSync("/proc/1/cgroup", "utf8")
      .trim().split("\\n")
      .find((line) => line.startsWith("0::"));
    if (!cgroupLine) throw new Error("cgroup v2 is required");
    const relative = cgroupLine.slice(3);
    const base = "/host-cgroup" + relative;
    const read = (name) => fs.readFileSync(base + "/" + name, "utf8").trim();
    const events = Object.fromEntries(
      read("memory.events").split("\\n").map((line) => {
        const [name, value] = line.split(" ");
        return [name, Number(value)];
      }),
    );
    const processHighWaterBytes = fs.readdirSync("/proc")
      .filter((entry) => /^[0-9]+$/.test(entry))
      .reduce((total, pid) => {
        try {
          const status = fs.readFileSync("/proc/" + pid + "/status", "utf8");
          const match = /^VmHWM:\\s+([0-9]+)\\s+kB$/m.exec(status);
          return total + (match ? Number(match[1]) * 1024 : 0);
        } catch {
          return total;
        }
      }, 0);
    const peakPath = base + "/memory.peak";
    const cgroupPeakSupported = fs.existsSync(peakPath);
    const currentBytes = Number(read("memory.current"));
    process.stdout.write(JSON.stringify({
      cgroupPeakSupported,
      currentBytes,
      events,
      peakBytes: cgroupPeakSupported
        ? Number(read("memory.peak"))
        : Math.max(currentBytes, processHighWaterBytes),
      peakSource: cgroupPeakSupported ? "cgroup-memory.peak" : "proc-vmhwm-sum",
      processHighWaterBytes,
    }));
  `;
  return JSON.parse(
    run(
      "docker",
      [
        "run",
        "--rm",
        "--platform",
        runtime.config.HYBRID_DOCKER_PLATFORM,
        "--pid",
        `container:${container}`,
        "--cgroupns",
        "host",
        "-v",
        "/sys/fs/cgroup:/host-cgroup:ro",
        runtime.config.HYBRID_NODE_IMAGE,
        "node",
        "-e",
        script,
      ],
      { failure: "Container cgroup memory measurement failed." },
    ),
  );
}

function serviceMemory(runtime, service) {
  const container = containerForService(runtime, service);
  const stats = JSON.parse(
    run(
      "docker",
      [
        "stats",
        "--no-stream",
        "--format",
        "{{json .}}",
        container,
      ],
      { failure: `${service} Docker stats measurement failed.` },
    ),
  );
  const state = JSON.parse(
    run(
      "docker",
      [
        "inspect",
        container,
        "--format",
        "{{json .State}}",
      ],
      { failure: `${service} container state inspection failed.` },
    ),
  );
  const cgroup = cgroupMemory(runtime, container);
  const statsCurrentBytes = parseDockerBytes(
    String(stats.MemUsage).split("/")[0],
  );
  if (
    statsCurrentBytes
      > cgroup.currentBytes + Math.max(
        16 * 1024 ** 2,
        cgroup.currentBytes * 0.25,
      )
  ) {
    fail(`${service} Docker stats and cgroup memory measurements disagree.`);
  }
  if (
    state.OOMKilled
    || Number(cgroup.events?.oom ?? 0) > 0
    || Number(cgroup.events?.oom_kill ?? 0) > 0
  ) {
    fail(`${service} has an OOM event; capacity preflight stopped.`);
  }
  return Object.freeze({
    currentBytes: cgroup.currentBytes,
    exitCode: state.ExitCode,
    oomEvents: Number(cgroup.events?.oom ?? 0),
    oomKillEvents: Number(cgroup.events?.oom_kill ?? 0),
    oomKilled: Boolean(state.OOMKilled),
    peakBytes: cgroup.peakBytes,
    peakSource: cgroup.peakSource,
    pids: Number(stats.PIDs),
    statsCurrentBytes,
  });
}

function macMemoryCapacity() {
  const vmStat = run("vm_stat", [], {
    failure: "macOS memory capacity could not be measured.",
  });
  const pageSizeMatch = /page size of ([0-9]+) bytes/u.exec(vmStat);
  if (!pageSizeMatch) {
    fail("macOS vm_stat page size is unavailable.");
  }
  const pages = Object.fromEntries(
    vmStat.split(/\r?\n/u).flatMap((line) => {
      const match = /^([^:]+):\s+([0-9]+)\./u.exec(line);
      return match ? [[match[1], Number(match[2])]] : [];
    }),
  );
  const availablePages = (pages["Pages free"] ?? 0)
    + (pages["Pages inactive"] ?? 0)
    + (pages["Pages speculative"] ?? 0);
  const swap = run("sysctl", ["-n", "vm.swapusage"], {
    failure: "macOS swap capacity could not be measured.",
  });
  const swapMatch =
    /total = ([0-9.]+)M\s+used = ([0-9.]+)M\s+free = ([0-9.]+)M/u
      .exec(swap);
  if (!swapMatch) {
    fail("macOS swap capacity output could not be parsed.");
  }
  return Object.freeze({
    macAvailableBytes: availablePages * Number(pageSizeMatch[1]),
    swapFreeBytes: Math.round(Number(swapMatch[3]) * 1024 ** 2),
    swapTotalBytes: Math.round(Number(swapMatch[1]) * 1024 ** 2),
  });
}

function memoryCapacity(runtime, dryRun) {
  if (dryRun) {
    return evaluateMemoryCapacityPreflight({
      dockerMemoryLimitBytes: 8 * 1024 ** 3,
      macAvailableBytes: 16 * 1024 ** 3,
      services: Object.fromEntries(
        MEMORY_SERVICES.map((service) => [
          service,
          {
            currentBytes: 64 * 1024 ** 2,
            peakBytes: 96 * 1024 ** 2,
          },
        ]),
      ),
      swapFreeBytes: 4 * 1024 ** 3,
      swapTotalBytes: 8 * 1024 ** 3,
    });
  }
  const services = Object.fromEntries(
    MEMORY_SERVICES.map((service) => [
      service,
      serviceMemory(runtime, service),
    ]),
  );
  const dockerMemoryLimitBytes = Number(
    run(
      "docker",
      ["info", "--format", "{{.MemTotal}}"],
      { failure: "Docker Desktop memory limit could not be measured." },
    ).trim(),
  );
  return evaluateMemoryCapacityPreflight({
    dockerMemoryLimitBytes,
    services,
    ...macMemoryCapacity(),
  });
}

function capacity(runtime, dryRun = false) {
  let dataBytes = 0;
  if (!dryRun) {
    const dbBytes = Number(
      psql(runtime, "select pg_database_size(current_database());", {
        tuples: true,
      }).trim(),
    );
    const storageBytes = Number(
      run(
        "docker",
        [
          "run",
          "--rm",
          "--platform",
          runtime.config.HYBRID_DOCKER_PLATFORM,
          "-v",
          `${runtime.config.HYBRID_STORAGE_VOLUME_NAME}:/volume:ro`,
          runtime.config.HYBRID_NODE_IMAGE,
          "node",
          "-e",
          `
            const fs = require("node:fs");
            const path = require("node:path");
            let total = 0;
            const walk = (dir) => {
              for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const item = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(item);
                else if (entry.isFile()) total += fs.statSync(item).size;
              }
            };
            walk("/volume");
            process.stdout.write(String(total));
          `,
        ],
        { failure: "Storage capacity measurement failed." },
      ).trim(),
    );
    dataBytes = dbBytes + storageBytes;
  }
  const disk = run("df", ["-Pk", dirname(runtime.configPath)], {
    failure: "Filesystem capacity measurement failed.",
  }).trim().split(/\r?\n/u).at(-1).trim().split(/\s+/u);
  const freeBytes = Number(disk[3]) * 1024;
  const diskCapacity = evaluateCapacityPreflight({ dataBytes, freeBytes });
  const memory = memoryCapacity(runtime, dryRun);
  return Object.freeze({
    disk: diskCapacity,
    memory,
    pass: diskCapacity.pass && memory.pass,
  });
}

function databaseManifest(runtime) {
  const output = psql(
    runtime,
    `
      create temp table hybrid_manifest (
        table_name text primary key,
        row_count bigint not null,
        digest text not null
      );
      do $manifest$
      declare
        item record;
      begin
        for item in
          select tablename
          from pg_catalog.pg_tables
          where schemaname = 'public'
          order by tablename
        loop
          execute format(
            'insert into hybrid_manifest
             select %L, count(*),
               encode(extensions.digest(
                 coalesce(string_agg(to_jsonb(row_value)::text, E''\\n''
                   order by to_jsonb(row_value)::text), ''''),
                 ''sha256''
               ), ''hex'')
             from public.%I as row_value',
            item.tablename,
            item.tablename
          );
        end loop;
      end;
      $manifest$;
      select json_build_object(
        'tables', coalesce((
          select json_agg(json_build_object(
            'name', table_name,
            'rows', row_count,
            'sha256', digest
          ) order by table_name)
          from hybrid_manifest
        ), '[]'::json),
        'total_rows', coalesce((select sum(row_count) from hybrid_manifest), 0),
        'digest', encode(extensions.digest(
          coalesce((
            select string_agg(
              table_name || ':' || row_count || ':' || digest,
              E'\\n' order by table_name
            )
            from hybrid_manifest
          ), ''),
          'sha256'
        ), 'hex')
      )::text;
    `,
    { tuples: true },
  ).trim();
  return JSON.parse(output);
}

const CATALOG_SCHEMAS_SQL = `
  'public',
  'private',
  'storage',
  'supabase_migrations',
  'account_generation_auth_hook',
  'account_generation_storage_guard',
  'recipe_visibility_guard'
`;

function catalogJson(runtime, sql) {
  const output = psql(
    runtime,
    `
      select coalesce(json_agg(item order by item::text), '[]'::json)::text
      from (${sql}) as manifest_items(item);
    `,
    { tuples: true },
  ).trim();
  return JSON.parse(output);
}

function privateDataCatalog(runtime) {
  return JSON.parse(
    psql(
      runtime,
      `
        create temp table hybrid_private_data_manifest (
          schema_name text not null,
          table_name text not null,
          row_count bigint not null,
          digest text not null
        );
        do $manifest$
        declare
          item record;
        begin
          for item in
            select schemaname, tablename
            from pg_catalog.pg_tables
            where schemaname in (
              'private',
              'supabase_migrations',
              'account_generation_auth_hook',
              'account_generation_storage_guard',
              'recipe_visibility_guard'
            )
            order by schemaname, tablename
          loop
            execute format(
              'insert into hybrid_private_data_manifest
               select %L, %L, count(*),
                 encode(extensions.digest(
                   coalesce(string_agg(to_jsonb(row_value)::text, E''\\n''
                     order by to_jsonb(row_value)::text), ''''),
                   ''sha256''
                 ), ''hex'')
               from %I.%I as row_value',
              item.schemaname,
              item.tablename,
              item.schemaname,
              item.tablename
            );
          end loop;
        end;
        $manifest$;
        select coalesce(json_agg(json_build_object(
          'schema', schema_name,
          'table', table_name,
          'rows', row_count,
          'sha256', digest
        ) order by schema_name, table_name), '[]'::json)::text
        from hybrid_private_data_manifest;
      `,
      { tuples: true },
    ).trim(),
  );
}

function catalogManifest(runtime) {
  const sections = {
    roles: catalogJson(
      runtime,
      `
        select json_build_object(
          'name', rolname,
          'superuser', rolsuper,
          'inherit', rolinherit,
          'create_role', rolcreaterole,
          'create_db', rolcreatedb,
          'login', rolcanlogin,
          'replication', rolreplication,
          'bypassrls', rolbypassrls,
          'connection_limit', rolconnlimit
        ) as item
        from pg_catalog.pg_roles
        where rolname !~ '^pg_'
        order by rolname
      `,
    ),
    memberships: catalogJson(
      runtime,
      `
        select json_build_object(
          'role', role_role.rolname,
          'member', member_role.rolname,
          'grantor', grantor_role.rolname,
          'admin_option', membership.admin_option,
          'inherit_option', membership.inherit_option,
          'set_option', membership.set_option
        ) as item
        from pg_catalog.pg_auth_members as membership
        join pg_catalog.pg_roles as role_role
          on role_role.oid = membership.roleid
        join pg_catalog.pg_roles as member_role
          on member_role.oid = membership.member
        join pg_catalog.pg_roles as grantor_role
          on grantor_role.oid = membership.grantor
        where role_role.rolname !~ '^pg_'
           or member_role.rolname !~ '^pg_'
        order by role_role.rolname, member_role.rolname, grantor_role.rolname
      `,
    ),
    object_owners_acls: catalogJson(
      runtime,
      `
        select json_build_object(
          'kind', kind,
          'name', object_name,
          'owner', owner_name,
          'acl', acl
        ) as item
        from (
          select
            'schema'::text as kind,
            namespace.nspname::text as object_name,
            pg_get_userbyid(namespace.nspowner) as owner_name,
            coalesce((
              select string_agg(entry::text, ',' order by entry::text)
              from unnest(coalesce(
                namespace.nspacl,
                pg_catalog.acldefault('n', namespace.nspowner)
              )) as entry
            ), '') as acl
          from pg_catalog.pg_namespace as namespace
          where namespace.nspname in (${CATALOG_SCHEMAS_SQL})
          union all
          select
            'relation:' || relation.relkind::text,
            namespace.nspname || '.' || relation.relname,
            pg_get_userbyid(relation.relowner),
            coalesce((
              select string_agg(entry::text, ',' order by entry::text)
              from unnest(coalesce(
                relation.relacl,
                pg_catalog.acldefault(
                  (
                    case when relation.relkind = 'S' then 'S' else 'r' end
                  )::"char",
                  relation.relowner
                )
              )) as entry
            ), '')
          from pg_catalog.pg_class as relation
          join pg_catalog.pg_namespace as namespace
            on namespace.oid = relation.relnamespace
          where namespace.nspname in (${CATALOG_SCHEMAS_SQL})
          union all
          select
            'function:' || procedure.prokind::text,
            namespace.nspname || '.' || procedure.proname || '('
              || pg_get_function_identity_arguments(procedure.oid) || ')',
            pg_get_userbyid(procedure.proowner),
            coalesce((
              select string_agg(entry::text, ',' order by entry::text)
              from unnest(coalesce(
                procedure.proacl,
                pg_catalog.acldefault('f', procedure.proowner)
              )) as entry
            ), '')
          from pg_catalog.pg_proc as procedure
          join pg_catalog.pg_namespace as namespace
            on namespace.oid = procedure.pronamespace
          where namespace.nspname in (${CATALOG_SCHEMAS_SQL})
        ) as objects
        order by kind, object_name
      `,
    ),
    rls_policies: catalogJson(
      runtime,
      `
        select item
        from (
          select json_build_object(
            'kind', 'table',
            'table', namespace.nspname || '.' || relation.relname,
            'rls', relation.relrowsecurity,
            'force', relation.relforcerowsecurity
          ) as item
          from pg_catalog.pg_class as relation
          join pg_catalog.pg_namespace as namespace
            on namespace.oid = relation.relnamespace
          where namespace.nspname in (${CATALOG_SCHEMAS_SQL})
            and relation.relkind in ('r', 'p')
          union all
          select json_build_object(
            'kind', 'policy',
            'table', namespace.nspname || '.' || relation.relname,
            'policy', policy.polname,
            'permissive', policy.polpermissive,
            'command', policy.polcmd,
            'roles', coalesce((
              select json_agg(role.rolname order by role.rolname)
              from unnest(policy.polroles) as role_oid
              join pg_catalog.pg_roles as role on role.oid = role_oid
            ), '[]'::json),
            'using', coalesce(pg_get_expr(policy.polqual, policy.polrelid), ''),
            'check', coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), '')
          ) as item
          from pg_catalog.pg_policy as policy
          join pg_catalog.pg_class as relation
            on relation.oid = policy.polrelid
          join pg_catalog.pg_namespace as namespace
            on namespace.oid = relation.relnamespace
          where namespace.nspname in (${CATALOG_SCHEMAS_SQL})
        ) as policies
      `,
    ),
    triggers: catalogJson(
      runtime,
      `
        select json_build_object(
          'table', namespace.nspname || '.' || relation.relname,
          'name', trigger.tgname,
          'enabled', trigger.tgenabled,
          'definition', pg_get_triggerdef(trigger.oid, true)
        ) as item
        from pg_catalog.pg_trigger as trigger
        join pg_catalog.pg_class as relation
          on relation.oid = trigger.tgrelid
        join pg_catalog.pg_namespace as namespace
          on namespace.oid = relation.relnamespace
        where namespace.nspname in (${CATALOG_SCHEMAS_SQL})
          and not trigger.tgisinternal
        order by namespace.nspname, relation.relname, trigger.tgname
      `,
    ),
    extensions: catalogJson(
      runtime,
      `
        select json_build_object(
          'name', extension.extname,
          'version', extension.extversion,
          'schema', namespace.nspname,
          'relocatable', extension.extrelocatable
        ) as item
        from pg_catalog.pg_extension as extension
        join pg_catalog.pg_namespace as namespace
          on namespace.oid = extension.extnamespace
        order by extension.extname
      `,
    ),
    guard_functions: catalogJson(
      runtime,
      `
        select item
        from (
          select json_build_object(
            'kind', 'schema',
            'name', namespace.nspname,
            'owner', pg_get_userbyid(namespace.nspowner)
          ) as item
          from pg_catalog.pg_namespace as namespace
          where namespace.nspname in (
            'account_generation_auth_hook',
            'account_generation_storage_guard',
            'recipe_visibility_guard'
          )
          union all
          select json_build_object(
            'kind', 'function',
            'name', namespace.nspname || '.' || procedure.proname || '('
              || pg_get_function_identity_arguments(procedure.oid) || ')',
            'owner', pg_get_userbyid(procedure.proowner),
            'language', language.lanname,
            'security_definer', procedure.prosecdef,
            'volatility', procedure.provolatile,
            'parallel', procedure.proparallel,
            'strict', procedure.proisstrict,
            'config', coalesce((
              select json_agg(setting order by setting)
              from unnest(procedure.proconfig) as setting
            ), '[]'::json),
            'definition', pg_get_functiondef(procedure.oid)
          ) as item
          from pg_catalog.pg_proc as procedure
          join pg_catalog.pg_namespace as namespace
            on namespace.oid = procedure.pronamespace
          join pg_catalog.pg_language as language
            on language.oid = procedure.prolang
          where namespace.nspname in (
            'private',
            'account_generation_auth_hook',
            'account_generation_storage_guard',
            'recipe_visibility_guard'
          )
        ) as guard_inventory
      `,
    ),
    dependencies: catalogJson(
      runtime,
      `
        with app_objects(classid, objid) as (
          select 'pg_catalog.pg_namespace'::regclass::oid, namespace.oid
          from pg_catalog.pg_namespace as namespace
          where namespace.nspname in (${CATALOG_SCHEMAS_SQL})
          union
          select 'pg_catalog.pg_class'::regclass::oid, relation.oid
          from pg_catalog.pg_class as relation
          join pg_catalog.pg_namespace as namespace
            on namespace.oid = relation.relnamespace
          where namespace.nspname in (${CATALOG_SCHEMAS_SQL})
          union
          select 'pg_catalog.pg_proc'::regclass::oid, procedure.oid
          from pg_catalog.pg_proc as procedure
          join pg_catalog.pg_namespace as namespace
            on namespace.oid = procedure.pronamespace
          where namespace.nspname in (${CATALOG_SCHEMAS_SQL})
          union
          select 'pg_catalog.pg_type'::regclass::oid, type.oid
          from pg_catalog.pg_type as type
          join pg_catalog.pg_namespace as namespace
            on namespace.oid = type.typnamespace
          where namespace.nspname in (${CATALOG_SCHEMAS_SQL})
          union
          select 'pg_catalog.pg_constraint'::regclass::oid, table_constraint.oid
          from pg_catalog.pg_constraint as table_constraint
          join pg_catalog.pg_namespace as namespace
            on namespace.oid = table_constraint.connamespace
          where namespace.nspname in (${CATALOG_SCHEMAS_SQL})
          union
          select 'pg_catalog.pg_trigger'::regclass::oid, trigger.oid
          from pg_catalog.pg_trigger as trigger
          join pg_catalog.pg_class as relation on relation.oid = trigger.tgrelid
          join pg_catalog.pg_namespace as namespace
            on namespace.oid = relation.relnamespace
          where namespace.nspname in (${CATALOG_SCHEMAS_SQL})
          union
          select 'pg_catalog.pg_policy'::regclass::oid, policy.oid
          from pg_catalog.pg_policy as policy
          join pg_catalog.pg_class as relation on relation.oid = policy.polrelid
          join pg_catalog.pg_namespace as namespace
            on namespace.oid = relation.relnamespace
          where namespace.nspname in (${CATALOG_SCHEMAS_SQL})
          union
          select 'pg_catalog.pg_attrdef'::regclass::oid, attribute_default.oid
          from pg_catalog.pg_attrdef as attribute_default
          join pg_catalog.pg_class as relation
            on relation.oid = attribute_default.adrelid
          join pg_catalog.pg_namespace as namespace
            on namespace.oid = relation.relnamespace
          where namespace.nspname in (${CATALOG_SCHEMAS_SQL})
          union
          select 'pg_catalog.pg_rewrite'::regclass::oid, rewrite.oid
          from pg_catalog.pg_rewrite as rewrite
          join pg_catalog.pg_class as relation
            on relation.oid = rewrite.ev_class
          join pg_catalog.pg_namespace as namespace
            on namespace.oid = relation.relnamespace
          where namespace.nspname in (${CATALOG_SCHEMAS_SQL})
        ),
        described_dependencies as (
          select
            dependency.*,
            dependent_relation.relkind as dependent_relkind,
            dependent_owner_namespace.nspname
              as dependent_owner_schema,
            dependent_owner.relname as dependent_owner_table,
            referenced_relation.relkind as referenced_relkind,
            referenced_owner_namespace.nspname
              as referenced_owner_schema,
            referenced_owner.relname as referenced_owner_table
          from pg_catalog.pg_depend as dependency
          left join pg_catalog.pg_class as dependent_relation
            on dependency.classid
              = 'pg_catalog.pg_class'::regclass::oid
            and dependent_relation.oid = dependency.objid
          left join pg_catalog.pg_namespace as dependent_namespace
            on dependent_namespace.oid = dependent_relation.relnamespace
          left join pg_catalog.pg_index as dependent_index
            on dependent_relation.relkind = 'i'
            and dependent_index.indexrelid = dependent_relation.oid
          left join pg_catalog.pg_class as dependent_toast
            on dependent_namespace.nspname = 'pg_toast'
            and dependent_toast.oid = case
              when dependent_relation.relkind = 'i'
                then dependent_index.indrelid
              else dependent_relation.oid
            end
          left join pg_catalog.pg_class as dependent_owner
            on dependent_owner.reltoastrelid = dependent_toast.oid
          left join pg_catalog.pg_namespace as dependent_owner_namespace
            on dependent_owner_namespace.oid = dependent_owner.relnamespace
          left join pg_catalog.pg_class as referenced_relation
            on dependency.refclassid
              = 'pg_catalog.pg_class'::regclass::oid
            and referenced_relation.oid = dependency.refobjid
          left join pg_catalog.pg_namespace as referenced_namespace
            on referenced_namespace.oid = referenced_relation.relnamespace
          left join pg_catalog.pg_index as referenced_index
            on referenced_relation.relkind = 'i'
            and referenced_index.indexrelid = referenced_relation.oid
          left join pg_catalog.pg_class as referenced_toast
            on referenced_namespace.nspname = 'pg_toast'
            and referenced_toast.oid = case
              when referenced_relation.relkind = 'i'
                then referenced_index.indrelid
              else referenced_relation.oid
            end
          left join pg_catalog.pg_class as referenced_owner
            on referenced_owner.reltoastrelid = referenced_toast.oid
          left join pg_catalog.pg_namespace as referenced_owner_namespace
            on referenced_owner_namespace.oid = referenced_owner.relnamespace
        )
        select json_build_object(
          'dependent', regexp_replace(
            case
              when dependency.dependent_owner_table is not null then
                case dependency.dependent_relkind
                  when 'i' then 'toast index for table '
                  else 'toast table for table '
                end
                || quote_ident(dependency.dependent_owner_schema)
                || '.'
                || quote_ident(dependency.dependent_owner_table)
              else pg_describe_object(
                dependency.classid,
                dependency.objid,
                dependency.objsubid
              )
            end,
            'RI_ConstraintTrigger_[ac]_[0-9]+',
            'RI_ConstraintTrigger_internal',
            'g'
          ),
          'referenced', regexp_replace(
            case
              when dependency.referenced_owner_table is not null then
                case dependency.referenced_relkind
                  when 'i' then 'toast index for table '
                  else 'toast table for table '
                end
                || quote_ident(dependency.referenced_owner_schema)
                || '.'
                || quote_ident(dependency.referenced_owner_table)
              else pg_describe_object(
                dependency.refclassid,
                dependency.refobjid,
                dependency.refobjsubid
              )
            end,
            'RI_ConstraintTrigger_[ac]_[0-9]+',
            'RI_ConstraintTrigger_internal',
            'g'
          ),
          'type', dependency.deptype
        ) as item
        from described_dependencies as dependency
        where exists (
          select 1 from app_objects
          where app_objects.classid = dependency.classid
            and app_objects.objid = dependency.objid
        )
        or exists (
          select 1 from app_objects
          where app_objects.classid = dependency.refclassid
            and app_objects.objid = dependency.refobjid
        )
      `,
    ),
    private_data: privateDataCatalog(runtime),
  };
  return canonicalCatalogManifest(sections);
}

function storageManifest(runtime) {
  const references = JSON.parse(
    psql(
      runtime,
      `
        select json_build_object(
          'count', count(*),
          'bytes', coalesce(sum(
            case when metadata ->> 'size' ~ '^[0-9]+$'
              then (metadata ->> 'size')::bigint else 0 end
          ), 0),
          'objects', coalesce(json_agg(json_build_object(
            'id', id,
            'version', version,
            'bucket', bucket_id,
            'name', name,
            'bytes', case when metadata ->> 'size' ~ '^[0-9]+$'
              then (metadata ->> 'size')::bigint else 0 end,
            'mime', coalesce(metadata ->> 'mimetype', '')
          ) order by bucket_id, name, version, id), '[]'::json)
        )::text
        from storage.objects;
      `,
      { tuples: true },
    ).trim(),
  );
  const files = JSON.parse(
    run(
      "docker",
      [
        "run",
        "--rm",
        "--platform",
        runtime.config.HYBRID_DOCKER_PLATFORM,
        "-v",
        `${runtime.config.HYBRID_STORAGE_VOLUME_NAME}:/volume:ro`,
        runtime.config.HYBRID_NODE_IMAGE,
        "node",
        "-e",
        `
          const crypto = require("node:crypto");
          const fs = require("node:fs");
          const path = require("node:path");
          const files = [];
          const walk = (dir) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
              const item = path.join(dir, entry.name);
              if (entry.isDirectory()) walk(item);
              else if (entry.isFile()) {
                const body = fs.readFileSync(item);
                files.push({
                  path: path.relative("/volume", item),
                  bytes: body.length,
                  sha256: crypto.createHash("sha256").update(body).digest("hex"),
                });
              }
            }
          };
          walk("/volume");
          files.sort((a, b) => a.path.localeCompare(b.path));
          const digest = crypto.createHash("sha256")
            .update(files.map((f) => f.path + ":" + f.bytes + ":" + f.sha256).join("\\n"))
            .digest("hex");
          process.stdout.write(JSON.stringify({
            count: files.length,
            bytes: files.reduce((sum, file) => sum + file.bytes, 0),
            digest,
            files,
          }));
        `,
      ],
      { failure: "Storage manifest generation failed." },
    ),
  );
  const referencesMatchFiles =
    references.count === files.count
    && references.bytes === files.bytes
    && references.objects.every((reference) => {
      if (
        typeof reference.id !== "string"
        || typeof reference.version !== "string"
        || reference.version.length === 0
        || typeof reference.bucket !== "string"
        || typeof reference.name !== "string"
        || typeof reference.mime !== "string"
        || reference.mime.length === 0
        || !Number.isSafeInteger(reference.bytes)
        || reference.bytes < 0
      ) {
        return false;
      }
      const suffix =
        `/${reference.bucket}/${reference.name}/${reference.version}`;
      const matches = files.files.filter((file) =>
        `/${file.path}`.endsWith(suffix),
      );
      return matches.length === 1 && matches[0].bytes === reference.bytes;
    });
  if (!referencesMatchFiles) {
    fail("Storage reference manifest does not match the persisted files.");
  }
  const digest = createHash("sha256")
    .update(JSON.stringify({ references, files }))
    .digest("hex");
  return { digest, files, references };
}

function currentManifest(runtime) {
  const database = databaseManifest(runtime);
  const catalog = catalogManifest(runtime);
  const storage = storageManifest(runtime);
  return {
    catalog,
    database,
    storage,
    semantic: semanticState(runtime),
  };
}

function writeArchiveSidecar(archivePath) {
  const sidecar = `${archivePath}.sha256`;
  writeFileSync(
    sidecar,
    `${sha256File(archivePath)}  ${basename(archivePath)}\n`,
    { mode: 0o600 },
  );
  chmodSync(sidecar, 0o600);
  return sidecar;
}

function verifyArchiveSidecar(archivePath) {
  const sidecar = `${archivePath}.sha256`;
  if (!existsSync(archivePath) || !existsSync(sidecar)) {
    fail("A backup archive and its .sha256 sidecar are required.");
  }
  const expected = readFileSync(sidecar, "utf8").trim().split(/\s+/u)[0];
  if (!/^[0-9a-f]{64}$/u.test(expected) || expected !== sha256File(archivePath)) {
    fail("Backup archive checksum verification failed.");
  }
}

function dumpDatabase(runtime, destination) {
  compose(
    runtime,
    [
      "exec",
      "-T",
      "postgres",
      "pg_dump",
      "-U",
      "supabase_admin",
      "-d",
      runtime.config.HYBRID_POSTGRES_DB,
      "--format=custom",
      "--extension=pg_trgm",
      "--schema=public",
      "--schema=private",
      "--schema=storage",
      "--schema=supabase_migrations",
      "--schema=account_generation_auth_hook",
      "--schema=account_generation_storage_guard",
      "--schema=recipe_visibility_guard",
    ],
    {
      stdoutPath: destination,
      failure: "PostgreSQL backup failed.",
    },
  );
}

function writeStorageXattrManifest(runtime, destinationDir) {
  const script = `
    const fs = require("node:fs");
    const path = require("node:path");
    const xattr = require("fs-xattr");
    const [root, output] = process.argv.slice(1);
    const allowed = ${JSON.stringify(STORAGE_XATTR_NAMES)};
    const files = [];
    const walk = (directory) => {
      for (const entry of fs.readdirSync(directory, {
        withFileTypes: true,
      })) {
        const absolute = path.join(directory, entry.name);
        const stat = fs.lstatSync(absolute);
        if (stat.isSymbolicLink()) {
          throw new Error("Storage volume may not contain links.");
        }
        if (stat.isDirectory()) {
          walk(absolute);
          continue;
        }
        if (!stat.isFile()) {
          throw new Error("Storage volume may contain only regular files.");
        }
        const names = xattr.listSync(absolute).sort();
        if (
          names.length !== allowed.length
          || names.some((name, index) => name !== allowed[index])
        ) {
          throw new Error("Storage file xattr allowlist mismatch.");
        }
        files.push({
          attributes: Object.fromEntries(names.map((name) => [
            name,
            xattr.getSync(absolute, name).toString("base64"),
          ])),
          path: path.relative(root, absolute)
            .split(path.sep).join("/"),
        });
      }
    };
    walk(root);
    files.sort((left, right) => left.path.localeCompare(right.path));
    fs.writeFileSync(output, JSON.stringify({
      files,
      format: ${JSON.stringify(STORAGE_XATTR_FORMAT)},
    }), { flag: "wx", mode: 0o600 });
  `;
  run(
    "docker",
    [
      "run",
      "--rm",
      "--platform",
      runtime.config.HYBRID_DOCKER_PLATFORM,
      "--entrypoint",
      "node",
      "--workdir",
      "/app",
      "-v",
      `${runtime.config.HYBRID_STORAGE_VOLUME_NAME}:/volume:ro`,
      "-v",
      `${destinationDir}:/backup`,
      runtime.config.HYBRID_STORAGE_IMAGE,
      "-e",
      script,
      "/volume",
      `/backup/${STORAGE_XATTR_ENTRY}`,
    ],
    { failure: "Storage xattr manifest creation failed." },
  );
}

function inspectStorageXattrArchive(archivePath, storageFiles) {
  const names = run("tar", ["-tzf", archivePath], {
    failure: "Storage archive entry inspection failed.",
  });
  const verbose = run("tar", ["-tvzf", archivePath], {
    failure: "Storage archive type inspection failed.",
  });
  const entries = assertSafeTarArchive({ names, verbose });
  const manifestEntries = entries.filter((entry) =>
    entry.replace(/^\.\//u, "") === STORAGE_XATTR_ENTRY);
  if (manifestEntries.length !== 1) {
    fail("Storage xattr manifest is missing or duplicated.");
  }
  let manifest;
  try {
    manifest = JSON.parse(run(
      "tar",
      ["-xOzf", archivePath, manifestEntries[0]],
      { failure: "Storage xattr manifest extraction failed." },
    ));
  } catch {
    fail("Storage xattr manifest is not valid JSON.");
  }
  validateStorageXattrManifest({ manifest, storageFiles });
  return manifest;
}

function dumpStorage(runtime, destinationDir) {
  const stagingDir = join(destinationDir, "storage-staging");
  mkdirSync(stagingDir, { mode: 0o700 });
  writeStorageXattrManifest(runtime, stagingDir);
  run(
    "docker",
    [
      "run",
      "--rm",
      "--platform",
      runtime.config.HYBRID_DOCKER_PLATFORM,
      "-v",
      `${runtime.config.HYBRID_STORAGE_VOLUME_NAME}:/volume:ro`,
      "-v",
      `${stagingDir}:/staging`,
      runtime.config.HYBRID_NODE_IMAGE,
      "sh",
      "-c",
      "cd /volume && tar -cf - . | tar -xf - -C /staging",
    ],
    { failure: "Storage volume staging failed." },
  );
  run(
    "docker",
    [
      "run",
      "--rm",
      "--platform",
      runtime.config.HYBRID_DOCKER_PLATFORM,
      "-v",
      `${destinationDir}:/backup`,
      runtime.config.HYBRID_NODE_IMAGE,
      "sh",
      "-c",
      "cd /backup/storage-staging && tar -czf /backup/storage.tar.gz .",
    ],
    { failure: "Storage volume backup failed." },
  );
}

function createBackup(
  runtime,
  args,
  { manifest: suppliedManifest = null, restartGateway = true } = {},
) {
  const outputOption = optionValue(args, "--output");
  if (!outputOption) {
    fail("backup requires --output <absolute .tar.gz.enc path>.");
  }
  const output = resolve(outputOption);
  if (!isAbsolute(outputOption) || !output.endsWith(".tar.gz.enc")) {
    fail("Backup output must be an absolute .tar.gz.enc path.");
  }
  if (existsSync(output)) {
    fail("Backup output already exists.");
  }
  const backupKey = loadBackupKey(runtime, args);
  const temp = mkdtempSync(join(tmpdir(), "homecook-hybrid-backup-"));
  chmodSync(temp, 0o700);
  try {
    compose(runtime, ["stop", "gateway"]);
    const manifest = suppliedManifest ?? currentManifest(runtime);
    const dbDump = join(temp, "database.dump");
    dumpDatabase(runtime, dbDump);
    dumpStorage(runtime, temp);
    inspectStorageXattrArchive(
      join(temp, "storage.tar.gz"),
      manifest.storage.files.files,
    );
    const createdAt = new Date().toISOString();
    const metadata = {
      format: BACKUP_FORMAT,
      created_at: createdAt,
      encryption: {
        cipher: "AES-256-CBC",
        key_id: runtime.config.HOMECOOK_HYBRID_BACKUP_KEY_ID,
        pbkdf2_iterations: PBKDF2_ITERATIONS,
      },
      components: {
        database_sha256: sha256File(dbDump),
        storage_sha256: sha256File(join(temp, "storage.tar.gz")),
      },
      manifest,
      runtime: {
        compose_project: runtime.config.HYBRID_COMPOSE_PROJECT_NAME,
        postgres_volume: runtime.config.HYBRID_POSTGRES_VOLUME_NAME,
        storage_volume: runtime.config.HYBRID_STORAGE_VOLUME_NAME,
      },
    };
    writeFileSync(
      join(temp, "manifest.json"),
      `${JSON.stringify(metadata, null, 2)}\n`,
      { mode: 0o600 },
    );
    const bundle = join(temp, "complete-v2.tar.gz");
    run(
      "tar",
      [
        "-C",
        temp,
        "-czf",
        bundle,
        "database.dump",
        "storage.tar.gz",
        "manifest.json",
      ],
      { failure: "Backup bundle creation failed." },
    );
    run(
      "openssl",
      [
        "enc",
        "-aes-256-cbc",
        "-salt",
        "-pbkdf2",
        "-iter",
        String(PBKDF2_ITERATIONS),
        "-pass",
        `env:${BACKUP_KEY_ENV}`,
        "-in",
        bundle,
        "-out",
        output,
      ],
      {
        env: { ...process.env, [BACKUP_KEY_ENV]: backupKey },
        failure: "Backup encryption failed.",
      },
    );
    chmodSync(output, 0o600);
    const sidecar = writeArchiveSidecar(output);
    return {
      archive: output,
      archive_sha256: sha256File(output),
      catalog_digest: manifest.catalog.digest,
      created_at: createdAt,
      database_digest: manifest.database.digest,
      storage_digest: manifest.storage.digest,
      sidecar,
    };
  } finally {
    rmSync(temp, { force: true, recursive: true });
    if (restartGateway) {
      recover(runtime);
    }
  }
}

function extractBackup(runtime, args, archive, temp) {
  verifyArchiveSidecar(archive);
  const backupKey = loadBackupKey(runtime, args);
  const bundle = join(temp, "complete-v2.tar.gz");
  run(
    "openssl",
    [
      "enc",
      "-d",
      "-aes-256-cbc",
      "-pbkdf2",
      "-iter",
      String(PBKDF2_ITERATIONS),
      "-pass",
      `env:${BACKUP_KEY_ENV}`,
      "-in",
      archive,
      "-out",
      bundle,
    ],
    {
      env: { ...process.env, [BACKUP_KEY_ENV]: backupKey },
      failure: "Backup decryption failed.",
    },
  );
  assertSafeTarArchive({
    exactEntries: [
      "database.dump",
      "manifest.json",
      "storage.tar.gz",
    ],
    names: run("tar", ["-tzf", bundle], {
      failure: "Backup archive entry inspection failed.",
    }),
    verbose: run("tar", ["-tvzf", bundle], {
      failure: "Backup archive type inspection failed.",
    }),
  });
  run("tar", ["-C", temp, "-xzf", bundle], {
    failure: "Backup archive extraction failed.",
  });
  const manifest = JSON.parse(readFileSync(join(temp, "manifest.json"), "utf8"));
  if (
    manifest.format !== BACKUP_FORMAT
    || manifest.encryption?.key_id
      !== runtime.config.HOMECOOK_HYBRID_BACKUP_KEY_ID
    || manifest.encryption?.pbkdf2_iterations !== PBKDF2_ITERATIONS
    || manifest.components?.database_sha256
      !== sha256File(join(temp, "database.dump"))
    || manifest.components?.storage_sha256
      !== sha256File(join(temp, "storage.tar.gz"))
  ) {
    fail("Backup manifest or component checksum is invalid.");
  }
  inspectStorageXattrArchive(
    join(temp, "storage.tar.gz"),
    manifest.manifest?.storage?.files?.files,
  );
  return manifest;
}

function verifyPreRestoreBackup(runtime, args, archive, expected) {
  const temp = mkdtempSync(
    join(tmpdir(), "homecook-hybrid-pre-restore-check-"),
  );
  chmodSync(temp, 0o700);
  try {
    const metadata = extractBackup(runtime, args, archive, temp);
    assertPreRestoreBackupBinding({ expected, metadata });
    return metadata;
  } finally {
    rmSync(temp, { force: true, recursive: true });
  }
}

function verifyBackupArchive(runtime, args) {
  const archiveOption = optionValue(args, "--archive");
  if (!archiveOption || !isAbsolute(archiveOption)) {
    fail("verify-backup requires --archive <absolute path>.");
  }
  const archive = resolve(archiveOption);
  const temp = mkdtempSync(
    join(tmpdir(), "homecook-hybrid-verify-backup-"),
  );
  chmodSync(temp, 0o700);
  try {
    const metadata = extractBackup(runtime, args, archive, temp);
    let currentMatch = null;
    if (hasFlag(args, "--against-current")) {
      const current = currentManifest(runtime);
      assertBackupMatchesCurrent({
        current,
        metadata,
        runtime: {
          postgresVolume:
            runtime.config.HYBRID_POSTGRES_VOLUME_NAME,
          project: runtime.config.HYBRID_COMPOSE_PROJECT_NAME,
          storageVolume:
            runtime.config.HYBRID_STORAGE_VOLUME_NAME,
        },
      });
      currentMatch = true;
    }
    return {
      archive_sha256: sha256File(archive),
      auth_users: metadata.manifest?.semantic?.auth_users,
      auth_users_residual:
        metadata.manifest?.semantic?.auth_users_residual,
      catalog_digest: metadata.manifest?.catalog?.digest,
      created_at: metadata.created_at,
      current_match: currentMatch,
      database_digest: metadata.manifest?.database?.digest,
      format: metadata.format,
      storage_digest: metadata.manifest?.storage?.digest,
    };
  } finally {
    rmSync(temp, { force: true, recursive: true });
  }
}

function restoreDatabase(runtime, dumpPath) {
  const container = postgresContainer(runtime);
  const containerDump =
    `/tmp/homecook-hybrid-restore-${process.pid}.dump`;
  const containerList =
    `/tmp/homecook-hybrid-restore-${process.pid}.list`;
  const containerAclList =
    `/tmp/homecook-hybrid-restore-${process.pid}.acl.list`;
  const hostList = join(dirname(dumpPath), "post-data.list");
  const hostAclList = join(dirname(dumpPath), "acl.list");
  run("docker", ["cp", dumpPath, `${container}:${containerDump}`], {
    failure: "Restore dump staging failed.",
  });
  const restoreList = run(
    "docker",
    ["exec", container, "pg_restore", "--list", containerDump],
    { failure: "Restore catalog inspection failed." },
  );
  try {
    psql(
      runtime,
      `
        drop schema if exists public cascade;
        drop schema if exists private cascade;
        drop schema if exists storage cascade;
        drop schema if exists supabase_migrations cascade;
        drop schema if exists account_generation_auth_hook cascade;
        drop schema if exists account_generation_storage_guard cascade;
        drop schema if exists recipe_visibility_guard cascade;
      `,
    );
    psql(
      runtime,
      `
        do $roles$
        begin
          if not exists (
            select 1 from pg_catalog.pg_roles
            where rolname = 'homecook_auth_hook_guard_owner'
          ) then
            create role homecook_auth_hook_guard_owner
              nologin nosuperuser nocreatedb nocreaterole
              noinherit noreplication nobypassrls;
          end if;
          if not exists (
            select 1 from pg_catalog.pg_roles
            where rolname = 'homecook_recipe_visibility_guard_owner'
          ) then
            create role homecook_recipe_visibility_guard_owner
              nologin nosuperuser nocreatedb nocreaterole
              noinherit noreplication nobypassrls;
          end if;
        end;
        $roles$;
      `,
      { failure: "Hybrid application role bootstrap failed." },
    );
    compose(
      runtime,
      [
        "exec",
        "-T",
        "postgres",
        "pg_restore",
        "-U",
        "supabase_admin",
        "-d",
        runtime.config.HYBRID_POSTGRES_DB,
        "--exit-on-error",
        "--section=pre-data",
        containerDump,
      ],
      {
        inheritStderr: process.env.HYBRID_PRODUCTION_DEBUG === "1",
        failure: "Restore phase pre-data failed.",
      },
    );
    psql(
      runtime,
      `
        create extension if not exists pgcrypto with schema extensions;
        create extension if not exists pg_trgm with schema public;
      `,
      {
        failure:
          "Hybrid compatibility extension restoration failed.",
      },
    );
    const compatibilityRequired = psql(
      runtime,
      `
        select (
          to_regprocedure('private.verify_hybrid_request_authority()') is null
          or exists (
            select 1 from pg_catalog.pg_constraint
            where confrelid = 'auth.users'::regclass
          )
          or exists (
            select 1 from pg_catalog.pg_depend
            where refobjid = 'auth.users'::regclass
              and deptype = 'n'
          )
          or exists (
            select 1 from pg_catalog.pg_proc
            where prokind in ('f', 'p')
              and pg_get_functiondef(oid) ilike '%auth.users%'
          )
          or exists (
            select 1 from pg_catalog.pg_policies
            where coalesce(qual, '') ilike '%auth.users%'
              or coalesce(with_check, '') ilike '%auth.users%'
          )
        )::integer;
      `,
      { tuples: true },
    ).trim() === "1";
    if (compatibilityRequired) {
      psqlFile(
        runtime,
        join(
          ROOT,
          "supabase/migrations/20260730090000_hybrid_auth_remote_identity_epoch_mirror.sql",
        ),
      );
    }
    compose(
      runtime,
      [
        "exec",
        "-T",
        "postgres",
        "pg_restore",
        "-U",
        "supabase_admin",
        "-d",
        runtime.config.HYBRID_POSTGRES_DB,
        "--exit-on-error",
        "--section=data",
        containerDump,
      ],
      {
        inheritStderr: process.env.HYBRID_PRODUCTION_DEBUG === "1",
        failure: "Restore phase application-data failed.",
      },
    );
    writeFileSync(
      hostList,
      buildPostDataRestoreList(restoreList, compatibilityRequired),
      { mode: 0o600 },
    );
    writeFileSync(
      hostAclList,
      buildAclRestoreList(restoreList),
      { mode: 0o600 },
    );
    chmodSync(hostList, 0o600);
    chmodSync(hostAclList, 0o600);
    run("docker", ["cp", hostList, `${container}:${containerList}`], {
      failure: "Post-data restore list staging failed.",
    });
    run("docker", ["cp", hostAclList, `${container}:${containerAclList}`], {
      failure: "ACL restore list staging failed.",
    });
    compose(
      runtime,
      [
        "exec",
        "-T",
        "postgres",
        "pg_restore",
        "-U",
        "supabase_admin",
        "-d",
        runtime.config.HYBRID_POSTGRES_DB,
        "--exit-on-error",
        "--section=post-data",
        `--use-list=${containerList}`,
        containerDump,
      ],
      {
        inheritStderr: process.env.HYBRID_PRODUCTION_DEBUG === "1",
        failure: "Restore phase post-data-validation failed.",
      },
    );
    compose(
      runtime,
      [
        "exec",
        "-T",
        "postgres",
        "pg_restore",
        "-U",
        "supabase_admin",
        "-d",
        runtime.config.HYBRID_POSTGRES_DB,
        "--exit-on-error",
        `--use-list=${containerAclList}`,
        containerDump,
      ],
      {
        inheritStderr: process.env.HYBRID_PRODUCTION_DEBUG === "1",
        failure: "Restore phase owner and ACL validation failed.",
      },
    );
    psql(
      runtime,
      `
        grant usage on schema public
          to public,
             anon,
             authenticated,
             service_role,
             homecook_recipe_visibility_guard_owner,
             postgres;
      `,
      {
        failure: "Pinned public schema baseline ACL restoration failed.",
      },
    );
  } finally {
    run(
      "docker",
      [
        "exec",
        container,
        "rm",
        "-f",
        containerDump,
        containerList,
        containerAclList,
      ],
      { failure: "Restore staging cleanup failed." },
    );
  }
}

function restoreStorage(runtime, archivePath) {
  run(
    "docker",
    [
      "run",
      "--rm",
      "--platform",
      runtime.config.HYBRID_DOCKER_PLATFORM,
      "-v",
      `${runtime.config.HYBRID_STORAGE_VOLUME_NAME}:/volume`,
      "-v",
      `${dirname(archivePath)}:/backup:ro`,
      runtime.config.HYBRID_NODE_IMAGE,
      "sh",
      "-c",
      'find /volume -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar -xzf "/backup/$1" -C /volume',
      "homecook-storage-restore",
      basename(archivePath),
    ],
    { failure: "Storage restore failed." },
  );
  const script = `
    const fs = require("node:fs");
    const path = require("node:path");
    const xattr = require("fs-xattr");
    const [root, manifestPath] = process.argv.slice(1);
    const allowed = ${JSON.stringify(STORAGE_XATTR_NAMES)};
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.format !== ${JSON.stringify(STORAGE_XATTR_FORMAT)}) {
      throw new Error("Storage xattr format mismatch.");
    }
    const expected = new Map(
      manifest.files.map((file) => [file.path, file]),
    );
    const actual = [];
    const walk = (directory) => {
      for (const entry of fs.readdirSync(directory, {
        withFileTypes: true,
      })) {
        const absolute = path.join(directory, entry.name);
        if (absolute === manifestPath) continue;
        const stat = fs.lstatSync(absolute);
        if (stat.isSymbolicLink()) {
          throw new Error("Restored Storage may not contain links.");
        }
        if (stat.isDirectory()) {
          walk(absolute);
          continue;
        }
        if (!stat.isFile()) {
          throw new Error("Restored Storage contains a non-file.");
        }
        actual.push({
          absolute,
          relative: path.relative(root, absolute)
            .split(path.sep).join("/"),
        });
      }
    };
    walk(root);
    actual.sort((left, right) =>
      left.relative.localeCompare(right.relative));
    if (
      actual.length !== expected.size
      || actual.some((file) => !expected.has(file.relative))
    ) {
      throw new Error("Restored Storage file manifest mismatch.");
    }
    for (const file of actual) {
      const evidence = expected.get(file.relative);
      const names = Object.keys(evidence.attributes).sort();
      if (
        names.length !== allowed.length
        || names.some((name, index) => name !== allowed[index])
      ) {
        throw new Error("Restored Storage xattr allowlist mismatch.");
      }
      for (const name of names) {
        xattr.setSync(
          file.absolute,
          name,
          Buffer.from(evidence.attributes[name], "base64"),
        );
      }
      const restoredNames = xattr.listSync(file.absolute).sort();
      if (
        restoredNames.length !== allowed.length
        || restoredNames.some((name, index) => name !== allowed[index])
        || restoredNames.some((name) =>
          !xattr.getSync(file.absolute, name).equals(
            Buffer.from(evidence.attributes[name], "base64"),
          ))
      ) {
        throw new Error("Restored Storage xattr verification failed.");
      }
    }
    fs.unlinkSync(manifestPath);
  `;
  run(
    "docker",
    [
      "run",
      "--rm",
      "--platform",
      runtime.config.HYBRID_DOCKER_PLATFORM,
      "--entrypoint",
      "node",
      "--workdir",
      "/app",
      "-v",
      `${runtime.config.HYBRID_STORAGE_VOLUME_NAME}:/volume`,
      runtime.config.HYBRID_STORAGE_IMAGE,
      "-e",
      script,
      "/volume",
      `/volume/${STORAGE_XATTR_ENTRY}`,
    ],
    { failure: "Storage xattr restoration failed." },
  );
}

function restore(runtime, args) {
  const archiveOption = optionValue(args, "--archive");
  const preRestoreOption = optionValue(args, "--pre-restore-backup");
  const preRestoreBackup = preRestoreOption
    ? resolve(preRestoreOption)
    : "";
  assertRestoreAllowed({
    destructive: hasFlag(args, "--destructive"),
    preRestoreBackupPath: preRestoreOption,
    preRestoreBackupAbsent:
      typeof preRestoreOption === "string"
      && isAbsolute(preRestoreOption)
      && !existsSync(preRestoreBackup)
      && !existsSync(`${preRestoreBackup}.sha256`),
  });
  if (!archiveOption || !isAbsolute(archiveOption)) {
    fail("restore requires --archive <absolute path>.");
  }
  const archive = resolve(archiveOption);
  if (archive === preRestoreBackup) {
    fail("Source archive and pre-restore backup must be different files.");
  }
  const temp = mkdtempSync(join(tmpdir(), "homecook-hybrid-restore-"));
  chmodSync(temp, 0o700);
  let published = false;
  try {
    forceGatewayPrivate(runtime);
    const preBackupStartedAt = Date.now();
    const currentState = currentManifest(runtime);
    createBackup(
      runtime,
      [
        "--output",
        preRestoreBackup,
        ...(hasFlag(args, "--allow-process-env-secrets")
          ? ["--allow-process-env-secrets"]
          : []),
      ],
      { manifest: currentState, restartGateway: false },
    );
    verifyPreRestoreBackup(runtime, args, preRestoreBackup, {
      catalogDigest: currentState.catalog.digest,
      createdAfterMs: preBackupStartedAt,
      createdBeforeMs: Date.now() + 60_000,
      databaseDigest: currentState.database.digest,
      postgresVolume: runtime.config.HYBRID_POSTGRES_VOLUME_NAME,
      project: runtime.config.HYBRID_COMPOSE_PROJECT_NAME,
      storageDigest: currentState.storage.digest,
      storageVolume: runtime.config.HYBRID_STORAGE_VOLUME_NAME,
    });
    const sourceManifest = extractBackup(runtime, args, archive, temp);
    compose(runtime, ["down", "--remove-orphans"]);
    POSTGRES_CONTAINERS.delete(
      runtime.config.HYBRID_COMPOSE_PROJECT_NAME,
    );
    run(
      "docker",
      [
        "volume",
        "rm",
        runtime.config.HYBRID_POSTGRES_VOLUME_NAME,
        runtime.config.HYBRID_STORAGE_VOLUME_NAME,
      ],
      { failure: "Target production volumes could not be replaced." },
    );
    compose(runtime, ["up", "-d", "--wait", "postgres"]);
    restoreDatabase(runtime, join(temp, "database.dump"));
    restoreStorage(runtime, join(temp, "storage.tar.gz"));
    const migrationAdvance = planPostRestoreMigrationAdvance({
      archiveMigrationCount:
        sourceManifest.manifest?.semantic?.migration_count,
      currentMigrationCount: migrationFiles().length,
    });
    const archiveState = assertInstalled(
      runtime,
      migrationAdvance.archiveMigrationCount,
    );
    const archiveManifest = currentManifest(runtime);
    const phases = [
      "pre-data-schema",
      "hybrid-compatibility-fk-replacement",
      "application-data",
      "post-data-validation",
    ];
    let forwardState;
    let forwardManifest;
    let forwardAppliedVersions = [];
    runRestorePublicationGate({
      forcePrivate: () => bestEffortGatewayPrivate(runtime),
      publish: () => {
        recover(runtime);
        published = true;
      },
      verify: () => {
        compareCatalogManifests(
          sourceManifest.manifest.catalog,
          archiveManifest.catalog,
        );
        validateSemanticRestoreEvidence({
          phases,
          authUsers: archiveState.auth_users,
          authUsersResidual: archiveState.auth_users_residual,
          catalogManifest: {
            source: sourceManifest.manifest.catalog.digest,
            target: archiveManifest.catalog.digest,
          },
          publicManifest: {
            source: sourceManifest.manifest.database.digest,
            target: archiveManifest.database.digest,
          },
          storageManifest: {
            source: sourceManifest.manifest.storage.digest,
            target: archiveManifest.storage.digest,
          },
        });
        forwardAppliedVersions =
          applyPendingMigrationsAtomically(runtime);
        if (
          forwardAppliedVersions.length
          !== migrationAdvance.forwardMigrationCount
        ) {
          fail(
            "Forward migration plan did not match applied versions.",
          );
        }
        forwardState = assertInstalled(
          runtime,
          migrationAdvance.currentMigrationCount,
        );
        forwardManifest = currentManifest(runtime);
      },
    });
    return {
      archive_exact: {
        catalog_digest: archiveManifest.catalog.digest,
        database_digest: archiveManifest.database.digest,
        migration_count: archiveState.migration_count,
        storage_digest: archiveManifest.storage.digest,
      },
      forward_migrated: {
        catalog_digest: forwardManifest.catalog.digest,
        database_digest: forwardManifest.database.digest,
        migration_count: forwardState.migration_count,
        migration_count_applied: forwardAppliedVersions.length,
        migration_versions_applied: forwardAppliedVersions,
        storage_digest: forwardManifest.storage.digest,
      },
      phases,
      pre_restore_backup: preRestoreBackup,
    };
  } finally {
    if (!published) {
      bestEffortGatewayPrivate(runtime);
    }
    rmSync(temp, { force: true, recursive: true });
  }
}

function status(runtime) {
  const output = compose(runtime, ["ps", "--format", "json"]);
  const trimmed = output.trim();
  const items = trimmed
    ? trimmed.startsWith("[")
      ? JSON.parse(trimmed)
      : trimmed.split(/\r?\n/u).map((line) => JSON.parse(line))
    : [];
  const services = items.map((item) => ({
    health: item.Health || "none",
    service: item.Service,
    state: item.State,
  })).sort((a, b) => a.service.localeCompare(b.service));
  const gatewayRunning = services.some((item) =>
    item.service === "gateway" && item.state.toLowerCase() === "running");
  const readyProbe = gatewayRunning
    ? spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        "const response = await fetch(process.argv[1], { signal: AbortSignal.timeout(3000) }); process.exit(response.status === 200 ? 0 : 1);",
        `http://127.0.0.1:${runtime.validation.gatewayPort}/healthz`,
      ],
      {
        cwd: ROOT,
        env: runtime.env,
        stdio: "ignore",
      },
    ).status === 0
    : false;
  return {
    ...evaluateRuntimeStatus(services, { gatewayReady: readyProbe }),
    services,
  };
}

function network(runtime) {
  const items = status(runtime).services;
  const exposures = [];
  for (const item of items) {
    const container = compose(
      runtime,
      ["ps", "-q", item.service],
    ).trim();
    if (!container) {
      continue;
    }
    const ports = JSON.parse(
      run(
        "docker",
        [
          "inspect",
          container,
          "--format",
          "{{json .NetworkSettings.Ports}}",
        ],
        { failure: "Container network inspection failed." },
      ),
    );
    for (const [containerPort, bindings] of Object.entries(ports ?? {})) {
      for (const binding of bindings ?? []) {
        exposures.push({
          container_port: containerPort,
          host_ip: binding.HostIp,
          host_port: Number(binding.HostPort),
          service: item.service,
        });
      }
    }
  }
  if (
    exposures.length !== 1
    || exposures[0].service !== "gateway"
    || exposures[0].host_ip !== "127.0.0.1"
    || exposures[0].host_port !== runtime.validation.gatewayPort
  ) {
    fail("Runtime network exposure is not loopback gateway-only.");
  }
  return exposures;
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function help() {
  process.stdout.write(
    [
      "Usage: node scripts/hybrid-production-runtime.mjs <command> [options]",
      "",
      "Commands: validate install start status stop recover backup verify-backup restore migrate-forward manifest capacity network",
      `Default config: ${DEFAULT_CONFIG}`,
      "",
      "Process-env secrets are test/rehearsal-only and require --allow-process-env-secrets.",
      "Restore requires --destructive, --archive, and a new absolute --pre-restore-backup output path.",
    ].join("\n") + "\n",
  );
}

async function main() {
  const [command = "help", ...args] = process.argv.slice(2);
  if (["help", "--help", "-h"].includes(command)) {
    help();
    return;
  }
  const runtime = await loadRuntime(args);
  switch (command) {
    case "validate":
      print({
        authority: runtime.validation.authority,
        compose: "valid",
        remote_jwks_digest: runtime.jwks.digest,
        remote_jwks_key_count: runtime.jwks.keyCount,
        secret_source: runtime.validation.secretSource,
        status: "PASS",
      });
      break;
    case "install": {
      if (hasFlag(args, "--dry-run")) {
        print({
          order: [
            "capacity",
            "native-image-platform",
            "postgres",
            "application-migrations",
            "runtime-authority-validation",
            "postgrest-storage",
            "gateway",
          ],
          status: "DRY_RUN_PASS",
        });
        break;
      }
      const capacityResult = capacity(runtime, true);
      if (!capacityResult.pass) {
        fail("Capacity preflight failed.");
      }
      pullNativeRuntimeImages(runtime);
      compose(runtime, ["build", "gateway"], {
        failure: "Loopback gateway image build failed.",
      });
      assertNativeRuntimeImages(runtime);
      compose(runtime, ["up", "-d", "--wait", "postgres"]);
      ensureStorageSchema(runtime);
      applyMigrations(runtime);
      const state = assertInstalled(runtime);
      recover(runtime);
      print({
        migrations: state.migration_count,
        status: "PASS",
      });
      break;
    }
    case "start":
    case "recover":
      if (hasFlag(args, "--dry-run")) {
        print({
          order: [
            "postgres:healthy",
            "postgrest-storage:healthy",
            "gateway:healthy",
          ],
          status: "DRY_RUN_PASS",
        });
      } else {
        recover(runtime);
        print({ status: "PASS" });
      }
      break;
    case "status":
      {
        const result = status(runtime);
        print(result);
        if (!result.pass) {
          process.exitCode = 2;
        }
      }
      break;
    case "stop":
      compose(runtime, ["stop"]);
      print({ preserved_named_volumes: true, status: "PASS" });
      break;
    case "backup":
      if (hasFlag(args, "--dry-run")) {
        loadBackupKey(runtime, args);
        print({
          format: BACKUP_FORMAT,
          key_separated: true,
          status: "DRY_RUN_PASS",
        });
      } else {
        print({
          ...createBackup(
            runtime,
            args,
            { restartGateway: !hasFlag(args, "--leave-stopped") },
          ),
          status: "PASS",
        });
      }
      break;
    case "verify-backup":
      print({ ...verifyBackupArchive(runtime, args), status: "PASS" });
      break;
    case "restore":
      if (hasFlag(args, "--dry-run")) {
        assertRestoreAllowed({
          destructive: hasFlag(args, "--destructive"),
          preRestoreBackupPath: optionValue(args, "--pre-restore-backup"),
          preRestoreBackupAbsent: (() => {
            const path = optionValue(args, "--pre-restore-backup");
            return Boolean(
              path
              && isAbsolute(path)
              && !existsSync(resolve(path))
              && !existsSync(`${resolve(path)}.sha256`),
            );
          })(),
        });
        print({
          phases: [
            "pre-data-schema",
            "hybrid-compatibility-fk-replacement",
            "application-data",
            "post-data-validation",
          ],
          status: "DRY_RUN_PASS",
        });
      } else {
        print({ ...restore(runtime, args), status: "PASS" });
      }
      break;
    case "migrate-forward": {
      const prebackupOption = optionValue(args, "--prebackup");
      if (!prebackupOption || !isAbsolute(prebackupOption)) {
        fail(
          "migrate-forward requires --prebackup <absolute current complete-v2 archive>.",
        );
      }
      forceGatewayPrivate(runtime);
      try {
        const backupEvidence = verifyBackupArchive(runtime, [
          "--archive",
          resolve(prebackupOption),
          "--against-current",
          ...(hasFlag(args, "--allow-process-env-secrets")
            ? ["--allow-process-env-secrets"]
            : []),
        ]);
        const beforeState = semanticState(runtime);
        validateInstalledSemanticState(
          beforeState,
          beforeState.migration_count,
        );
        planPostRestoreMigrationAdvance({
          archiveMigrationCount: beforeState.migration_count,
          currentMigrationCount: migrationFiles().length,
        });
        const beforeManifest = currentManifest(runtime);
        const appliedVersions =
          applyPendingMigrationsAtomically(runtime);
        const afterState = assertInstalled(runtime);
        const afterManifest = currentManifest(runtime);
        print({
          applied_migration_versions: appliedVersions,
          before: {
            catalog_digest: beforeManifest.catalog.digest,
            database_digest: beforeManifest.database.digest,
            migration_count: beforeState.migration_count,
            storage_digest: beforeManifest.storage.digest,
          },
          after: {
            catalog_digest: afterManifest.catalog.digest,
            database_digest: afterManifest.database.digest,
            migration_count: afterState.migration_count,
            storage_digest: afterManifest.storage.digest,
          },
          gateway_private: true,
          prebackup_sha256: backupEvidence.archive_sha256,
          status: "PASS",
        });
      } catch (error) {
        bestEffortGatewayPrivate(runtime);
        throw error;
      }
      break;
    }
    case "manifest":
      print({ ...currentManifest(runtime), status: "PASS" });
      break;
    case "capacity": {
      const result = capacity(runtime, hasFlag(args, "--dry-run"));
      print({
        ...result,
        status: result.pass ? "PASS" : "BLOCKED",
      });
      if (!result.pass) {
        process.exitCode = 2;
      }
      break;
    }
    case "network":
      if (hasFlag(args, "--dry-run")) {
        print({
          expected: "gateway@127.0.0.1 only",
          status: "DRY_RUN_PASS",
        });
      } else {
        print({ exposures: network(runtime), status: "PASS" });
      }
      break;
    default:
      fail(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      status: "FAIL",
      error: error instanceof Error ? error.message : "Unknown failure.",
    })}\n`,
  );
  process.exit(1);
});
