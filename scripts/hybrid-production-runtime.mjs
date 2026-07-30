#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
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
  assertDockerEnginePlatform,
  assertProductionComposeModel,
  assertRestoreAllowed,
  assertSafeTarArchive,
  buildPostDataRestoreList,
  evaluateCapacityPreflight,
  evaluateMemoryCapacityPreflight,
  validateHybridProductionConfig,
  validateSemanticRestoreEvidence,
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
const PBKDF2_ITERATIONS = 200_000;
const MIGRATIONS_DIR = join(ROOT, "supabase/migrations");
const POSTGRES_CONTAINERS = new Map();
const RUNTIME_IMAGES = Object.freeze([
  "public.ecr.aws/supabase/postgres:17.6.1.136",
  "postgrest/postgrest:v14.12",
  "public.ecr.aws/docker/library/node:22.20.0-alpine",
  "supabase/storage-api:v1.60.4",
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

function loadRuntime(args) {
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
  };
  delete env.DOCKER_DEFAULT_PLATFORM;
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
    secrets,
    validation,
  });
}

function inspectImagePlatform(image) {
  const value = run(
    "docker",
    [
      "image",
      "inspect",
      image,
      "--format",
      "{{.Os}}/{{.Architecture}}",
    ],
    { failure: `Required Docker image is unavailable: ${image}.` },
  ).trim();
  return value.replace("/aarch64", "/arm64").replace("/x86_64", "/amd64");
}

function assertNativeRuntimeImages(runtime, includeGateway = true) {
  const images = includeGateway
    ? [...RUNTIME_IMAGES, "homecook-hybrid-gateway:production"]
    : RUNTIME_IMAGES;
  for (const image of images) {
    const actual = inspectImagePlatform(image);
    if (actual !== runtime.config.HYBRID_DOCKER_PLATFORM) {
      fail(
        `Docker image architecture mismatch for ${image}; expected ${runtime.config.HYBRID_DOCKER_PLATFORM}, received ${actual}.`,
      );
    }
  }
}

function pullNativeRuntimeImages(runtime) {
  for (const image of RUNTIME_IMAGES) {
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

function assertInstalled(runtime) {
  const state = semanticState(runtime);
  if (
    state.auth_users !== 0
    || state.auth_users_residual !== 0
    || state.invalid_constraints !== 0
    || state.runtime_ready !== true
    || state.migration_count !== migrationFiles().length
  ) {
    fail("Installed schema failed the semantic readiness gate.");
  }
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
        "public.ecr.aws/docker/library/node:22.20.0-alpine",
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
          "public.ecr.aws/docker/library/node:22.20.0-alpine",
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
        "public.ecr.aws/docker/library/node:22.20.0-alpine",
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
  const storage = storageManifest(runtime);
  return {
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

function dumpStorage(runtime, destinationDir) {
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
      `${destinationDir}:/backup`,
      "public.ecr.aws/docker/library/node:22.20.0-alpine",
      "sh",
      "-c",
      "cd /volume && tar -czf /backup/storage.tar.gz .",
    ],
    { failure: "Storage volume backup failed." },
  );
}

function createBackup(runtime, args, { restartGateway = true } = {}) {
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
    const manifest = currentManifest(runtime);
    const dbDump = join(temp, "database.dump");
    dumpDatabase(runtime, dbDump);
    dumpStorage(runtime, temp);
    const metadata = {
      format: BACKUP_FORMAT,
      created_at: new Date().toISOString(),
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
  return manifest;
}

function verifyPreRestoreBackup(runtime, args, archive) {
  const temp = mkdtempSync(
    join(tmpdir(), "homecook-hybrid-pre-restore-check-"),
  );
  chmodSync(temp, 0o700);
  try {
    extractBackup(runtime, args, archive, temp);
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
  const hostList = join(dirname(dumpPath), "post-data.list");
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
    chmodSync(hostList, 0o600);
    run("docker", ["cp", hostList, `${container}:${containerList}`], {
      failure: "Post-data restore list staging failed.",
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
  } finally {
    run(
      "docker",
      ["exec", container, "rm", "-f", containerDump, containerList],
      { failure: "Restore staging cleanup failed." },
    );
  }
}

function restoreStorage(runtime, archivePath) {
  assertSafeTarArchive({
    names: run("tar", ["-tzf", archivePath], {
      failure: "Storage archive entry inspection failed.",
    }),
    verbose: run("tar", ["-tvzf", archivePath], {
      failure: "Storage archive type inspection failed.",
    }),
  });
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
      "public.ecr.aws/docker/library/node:22.20.0-alpine",
      "sh",
      "-c",
      'find /volume -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar -xzf "/backup/$1" -C /volume',
      "homecook-storage-restore",
      basename(archivePath),
    ],
    { failure: "Storage restore failed." },
  );
}

function restore(runtime, args) {
  const archiveOption = optionValue(args, "--archive");
  const preRestoreOption = optionValue(args, "--pre-restore-backup");
  assertRestoreAllowed({
    destructive: hasFlag(args, "--destructive"),
    preRestoreBackupPath: preRestoreOption,
    preRestoreBackupVerified:
      typeof preRestoreOption === "string"
      && existsSync(resolve(preRestoreOption))
      && existsSync(`${resolve(preRestoreOption)}.sha256`),
  });
  if (!archiveOption || !isAbsolute(archiveOption)) {
    fail("restore requires --archive <absolute path>.");
  }
  const archive = resolve(archiveOption);
  const preRestoreBackup = resolve(preRestoreOption);
  if (archive === preRestoreBackup) {
    fail("Source archive and pre-restore backup must be different files.");
  }
  verifyPreRestoreBackup(runtime, args, preRestoreBackup);
  const temp = mkdtempSync(join(tmpdir(), "homecook-hybrid-restore-"));
  chmodSync(temp, 0o700);
  try {
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
    const state = assertInstalled(runtime);
    recover(runtime);
    const targetManifest = currentManifest(runtime);
    validateSemanticRestoreEvidence({
      phases: [
        "pre-data-schema",
        "hybrid-compatibility-fk-replacement",
        "application-data",
        "post-data-validation",
      ],
      authUsers: state.auth_users,
      authUsersResidual: state.auth_users_residual,
      publicManifest: {
        source: sourceManifest.manifest.database.digest,
        target: targetManifest.database.digest,
      },
      storageManifest: {
        source: sourceManifest.manifest.storage.digest,
        target: targetManifest.storage.digest,
      },
    });
    return {
      database_digest: targetManifest.database.digest,
      phases: [
        "pre-data-schema",
        "hybrid-compatibility-fk-replacement",
        "application-data",
        "post-data-validation",
      ],
      storage_digest: targetManifest.storage.digest,
    };
  } finally {
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
  return items.map((item) => ({
    health: item.Health || "none",
    service: item.Service,
    state: item.State,
  })).sort((a, b) => a.service.localeCompare(b.service));
}

function network(runtime) {
  const items = status(runtime);
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
      "Commands: validate install start status stop recover backup restore manifest capacity network",
      `Default config: ${DEFAULT_CONFIG}`,
      "",
      "Process-env secrets are test/rehearsal-only and require --allow-process-env-secrets.",
      "Restore requires --destructive, --archive, and a verified --pre-restore-backup.",
    ].join("\n") + "\n",
  );
}

async function main() {
  const [command = "help", ...args] = process.argv.slice(2);
  if (["help", "--help", "-h"].includes(command)) {
    help();
    return;
  }
  const runtime = loadRuntime(args);
  switch (command) {
    case "validate":
      print({
        authority: runtime.validation.authority,
        compose: "valid",
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
      print({ services: status(runtime), status: "PASS" });
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
    case "restore":
      if (hasFlag(args, "--dry-run")) {
        assertRestoreAllowed({
          destructive: hasFlag(args, "--destructive"),
          preRestoreBackupPath: optionValue(args, "--pre-restore-backup"),
          preRestoreBackupVerified:
            hasFlag(args, "--pre-restore-backup-verified"),
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
