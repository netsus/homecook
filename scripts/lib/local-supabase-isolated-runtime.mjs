import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export const SECURITY_SUPABASE_CLI_PACKAGE = "supabase@2.110.0";
export const RUNTIME_SUPABASE_CLI_PACKAGE = SECURITY_SUPABASE_CLI_PACKAGE;

const CLI_VERSION = "2.110.0";
const COMPOSE_PROJECT_LABEL = "com.docker.compose.project";
const ISOLATED_POSTGREST_IMAGE = "public.ecr.aws/supabase/postgrest:v14.10";
const PASSTHROUGH_ENV_KEYS = [
  "PATH",
  "HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "XDG_RUNTIME_DIR",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "PNPM_HOME",
  "COREPACK_HOME",
  "CI",
  "TERM",
  "COLORTERM",
  "NO_COLOR",
  "FORCE_COLOR",
];

const SUPABASE_OPTIONAL_SERVICES = [
  "gotrue",
  "realtime",
  "storage-api",
  "imgproxy",
  "kong",
  "mailpit",
  "postgrest",
  "postgres-meta",
  "studio",
  "edge-runtime",
  "logflare",
  "vector",
  "supavisor",
];

function replaceConfigValues(contents, replacements) {
  let section = null;
  const replaced = new Set();
  const lines = contents.split(/\r?\n/u).map((line) => {
    const sectionMatch = line.match(/^\[([^\]]+)\]$/u);
    if (sectionMatch) {
      section = sectionMatch[1];
      return line;
    }

    const keyMatch = line.match(/^([a-z0-9_]+)\s*=\s*/u);
    if (!keyMatch) return line;

    const replacementKey = `${section ?? "root"}.${keyMatch[1]}`;
    if (!replacements.has(replacementKey)) return line;

    replaced.add(replacementKey);
    return `${keyMatch[1]} = ${replacements.get(replacementKey)}`;
  });

  const missing = [...replacements.keys()].filter((key) => !replaced.has(key));
  if (missing.length > 0) {
    throw new Error(`Supabase config is missing required keys: ${missing.join(", ")}`);
  }
  return lines.join("\n");
}

export function buildIsolatedSupabaseConfig(contents, { projectId, basePort }) {
  if (!/^[a-z][a-z0-9_]{2,30}$/u.test(projectId)) {
    throw new Error("isolated Supabase project id must be a short lowercase identifier");
  }
  if (!Number.isInteger(basePort) || basePort < 1024 || basePort > 65527) {
    throw new Error("isolated Supabase base port must reserve eight valid host ports");
  }

  const config = replaceConfigValues(contents, new Map([
    ["root.project_id", JSON.stringify(projectId)],
    ["api.port", String(basePort + 1)],
    ["db.port", String(basePort + 2)],
    ["db.shadow_port", String(basePort)],
    ["studio.port", String(basePort + 3)],
    ["inbucket.port", String(basePort + 4)],
    ["inbucket.smtp_port", String(basePort + 5)],
    ["inbucket.pop3_port", String(basePort + 6)],
    ["auth.external.google.enabled", "false"],
    [
      "auth.external.google.client_id",
      '"env(HOMECOOK_ISOLATED_GOOGLE_CLIENT_ID)"',
    ],
    [
      "auth.external.google.secret",
      '"env(HOMECOOK_ISOLATED_GOOGLE_CLIENT_SECRET)"',
    ],
  ]));

  return `${config.trimEnd()}\n\n[analytics]\nenabled = true\nport = ${basePort + 7}\n`;
}

/**
 * @param {string[]} commandArgs
 * @param {{ cliPackage?: string, workdir?: string }} [options]
 */
export function buildSupabaseCliArgs(commandArgs, options = {}) {
  const { workdir, cliPackage = SECURITY_SUPABASE_CLI_PACKAGE } = options;
  return [
    "dlx",
    cliPackage,
    ...commandArgs,
    ...(workdir ? ["--workdir", workdir] : []),
  ];
}

export function buildIsolatedSupabaseStartArgs(
  workdir,
  options = {},
) {
  /** @type {{ cliPackage?: string, services?: string[] }} */
  const {
    services = [],
    cliPackage = SECURITY_SUPABASE_CLI_PACKAGE,
  } = options;
  const included = new Set(services);
  const unknown = services.filter((service) => !SUPABASE_OPTIONAL_SERVICES.includes(service));
  if (unknown.length > 0) {
    throw new Error(`unknown isolated Supabase services: ${unknown.join(", ")}`);
  }
  const excludedServices = SUPABASE_OPTIONAL_SERVICES.filter(
    (service) => !included.has(service),
  );
  return buildSupabaseCliArgs(["start"], { workdir, cliPackage }).concat(
    "--ignore-health-check",
    "--exclude",
    excludedServices.join(","),
  );
}

export function buildIsolatedDataApiContainerArgs({
  containerName,
  environmentFilePath,
  networkId,
  port,
  projectId,
}) {
  if (!containerName || !environmentFilePath || !networkId || !projectId) {
    throw new Error("isolated Data API container configuration is incomplete");
  }
  return [
    "run",
    "--detach",
    "--name",
    containerName,
    "--label",
    `${COMPOSE_PROJECT_LABEL}=${projectId}`,
    "--label",
    "com.docker.compose.service=gate-postgrest",
    "--network",
    networkId,
    "--publish",
    `127.0.0.1:${port}:3000`,
    "--env-file",
    environmentFilePath,
    ISOLATED_POSTGREST_IMAGE,
  ];
}

function canBind(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host: "127.0.0.1", port }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailableBasePort() {
  const start = 58_000 + (Number.parseInt(randomBytes(2).toString("hex"), 16) % 600);
  for (let offset = 0; offset < 6_000; offset += 8) {
    const basePort = 58_000 + ((start - 58_000 + offset) % 6_000);
    const availability = await Promise.all(
      Array.from({ length: 8 }, (_, portOffset) => canBind(basePort + portOffset)),
    );
    if (availability.every(Boolean)) return basePort;
  }
  throw new Error("could not reserve eight isolated Supabase host ports");
}

async function computeMigrationSha256(migrationsDir) {
  const entries = (await readdir(migrationsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  const digest = createHash("sha256");
  for (const name of entries) {
    digest.update(name);
    digest.update("\0");
    digest.update(await readFile(path.join(migrationsDir, name)));
  }
  return digest.digest("hex");
}

function parseEnvironmentFile(contents) {
  return Object.fromEntries(contents.trim().split(/\r?\n/u).map((line) => {
    const index = line.indexOf("=");
    if (index < 1) throw new Error("invalid isolated environment file");
    return [line.slice(0, index), line.slice(index + 1)];
  }));
}

export async function createIsolatedSupabaseProject(repoRoot = process.cwd()) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "homecook-supabase-gate-"));
  const supabaseDir = path.join(rootDir, "supabase");
  const environmentFilePath = path.join(rootDir, "isolated.env");
  const dataApiEnvironmentFilePath = path.join(rootDir, "data-api.env");
  const secretDir = path.join(rootDir, "secrets");
  const secretFilePath = path.join(secretDir, "google-client-secret");
  const basePort = await findAvailableBasePort();
  const projectId = `hcg_${process.pid}_${randomBytes(3).toString("hex")}`;
  const googleClientId = `isolated-disabled-${projectId}`;
  const googleClientSecret = randomBytes(32).toString("hex");
  const dataApiJwtSecret = randomBytes(32).toString("hex");
  const migrationsDir = path.join(repoRoot, "supabase", "migrations");
  const isolatedMigrationsDir = path.join(supabaseDir, "migrations");

  try {
    await mkdir(supabaseDir, { recursive: true });
    await mkdir(isolatedMigrationsDir, { recursive: true });
    await mkdir(secretDir, { recursive: true, mode: 0o700 });
    const sourceConfig = await readFile(path.join(repoRoot, "supabase", "config.toml"), "utf8");
    await writeFile(
      path.join(supabaseDir, "config.toml"),
      buildIsolatedSupabaseConfig(sourceConfig, { projectId, basePort }),
      { encoding: "utf8", mode: 0o600 },
    );
    await writeFile(secretFilePath, `${googleClientSecret}\n`, { mode: 0o600 });
    await writeFile(
      dataApiEnvironmentFilePath,
      [
        `PGRST_DB_URI=postgresql://postgres:postgres@supabase_db_${projectId}:5432/homecook_gate_api`,
        "PGRST_DB_SCHEMAS=public",
        "PGRST_DB_EXTRA_SEARCH_PATH=public",
        "PGRST_DB_ANON_ROLE=anon",
        `PGRST_JWT_SECRET=${dataApiJwtSecret}`,
        "",
      ].join("\n"),
      { encoding: "utf8", mode: 0o600 },
    );
    await writeFile(
      environmentFilePath,
      [
        `HOMECOOK_ISOLATED_GOOGLE_CLIENT_ID=${googleClientId}`,
        `HOMECOOK_ISOLATED_GOOGLE_CLIENT_SECRET_FILE=${secretFilePath}`,
        "",
      ].join("\n"),
      { encoding: "utf8", mode: 0o600 },
    );
    await chmod(environmentFilePath, 0o600);
    await chmod(dataApiEnvironmentFilePath, 0o600);
    await chmod(secretFilePath, 0o600);
    const migrationEntries = await readdir(migrationsDir, { withFileTypes: true });
    for (const entry of migrationEntries) {
      if (!entry.isFile()) continue;
      await copyFile(
        path.join(migrationsDir, entry.name),
        path.join(isolatedMigrationsDir, entry.name),
      );
    }
    const sourceSeed = await readFile(path.join(repoRoot, "supabase", "seed.sql"), "utf8");
    await writeFile(
      path.join(supabaseDir, "seed.sql"),
      sourceSeed,
      { encoding: "utf8", mode: 0o600 },
    );
  } catch (error) {
    await rm(rootDir, { recursive: true, force: true });
    throw error;
  }

  const migrationSha256 = await computeMigrationSha256(migrationsDir);

  return {
    basePort,
    dataApiEnvironmentFilePath,
    dataApiJwtSecret,
    dataApiUrl: `http://127.0.0.1:${basePort + 7}`,
    databaseUrl: `postgresql://postgres:postgres@127.0.0.1:${basePort + 2}/postgres`,
    environmentFilePath,
    migrationSha256,
    projectId,
    rootDir,
    secretFilePath,
    /** @param {Record<string, string | undefined>} [baseEnv] */
    async buildCommandEnv(baseEnv = process.env) {
      const isolatedEnv = parseEnvironmentFile(
        await readFile(environmentFilePath, "utf8"),
      );
      const secret = (await readFile(isolatedEnv.HOMECOOK_ISOLATED_GOOGLE_CLIENT_SECRET_FILE, "utf8"))
        .trim();
      const commandEnv = {};
      for (const key of PASSTHROUGH_ENV_KEYS) {
        if (typeof baseEnv[key] === "string") commandEnv[key] = baseEnv[key];
      }
      return {
        ...commandEnv,
        HOMECOOK_ISOLATED_GOOGLE_CLIENT_ID:
          isolatedEnv.HOMECOOK_ISOLATED_GOOGLE_CLIENT_ID,
        HOMECOOK_ISOLATED_GOOGLE_CLIENT_SECRET: secret,
        NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_GOOGLE_OAUTH: "0",
      };
    },
    async removeFiles() {
      await rm(rootDir, { recursive: true, force: true });
    },
  };
}

function runDocker(args, { env, spawnSyncImpl = spawnSync } = {}) {
  const result = spawnSyncImpl("docker", args, { encoding: "utf8", env });
  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `docker ${args.join(" ")} failed`);
  }
  return result.stdout.trim();
}

function readDockerResources(kind, projectId, options) {
  const ids = runDocker(
    [kind, "ls", "-q", "--filter", `label=${COMPOSE_PROJECT_LABEL}=${projectId}`],
    options,
  ).split(/\s+/u).filter(Boolean);
  if (ids.length === 0) return [];
  const inspected = JSON.parse(runDocker([kind, "inspect", ...ids], options));
  return inspected.map((resource) => ({
    id: resource.Id ?? resource.ID ?? resource.Name,
    name: resource.Name?.replace(/^\//u, ""),
    oomKilled: resource.State?.OOMKilled === true,
    project: resource.Config?.Labels?.[COMPOSE_PROJECT_LABEL]
      ?? resource.Labels?.[COMPOSE_PROJECT_LABEL],
  }));
}

export function readIsolatedDockerResourceInventory(projectId, options = {}) {
  return {
    containers: readDockerResources("container", projectId, options),
    networks: readDockerResources("network", projectId, options),
    volumes: readDockerResources("volume", projectId, options),
  };
}

export function assertOwnedDockerResourceInventory(inventory, projectId) {
  const summary = {};
  for (const [kind, resources] of Object.entries(inventory)) {
    if (resources.length === 0) {
      throw new Error(`isolated Docker ${kind} inventory is empty for ${projectId}`);
    }
    for (const resource of resources) {
      if (resource.project !== projectId) {
        throw new Error(
          `Docker resource ${resource.id} belongs to ${resource.project ?? "unlabeled"}, not ${projectId}`,
        );
      }
    }
    summary[kind] = resources.length;
  }
  return summary;
}

export function assertOwnedDockerResources(projectId, options = {}) {
  return assertOwnedDockerResourceInventory(
    readIsolatedDockerResourceInventory(projectId, options),
    projectId,
  );
}

export function assertNoDockerOomInventory(inventory, projectId) {
  for (const container of inventory.containers ?? []) {
    if (container.oomKilled) {
      throw new Error(`isolated container ${container.id} was OOM-killed for ${projectId}`);
    }
  }
}

export function assertNoIsolatedDockerOom(projectId, options = {}) {
  const inventory = readIsolatedDockerResourceInventory(projectId, options);
  const oomContainer = inventory.containers.find((container) => container.oomKilled);
  if (!oomContainer) return;
  let logs = "";
  try {
    logs = runDocker(["logs", "--tail", "200", oomContainer.id], options);
  } catch (error) {
    logs = error instanceof Error ? error.message : String(error);
  }
  throw new Error(
    `isolated container ${oomContainer.name ?? oomContainer.id} was OOM-killed for ${projectId}; logs: ${logs || "<empty>"}`,
  );
}

export function assertNoIsolatedDockerResources(projectId, options = {}) {
  const inventory = readIsolatedDockerResourceInventory(projectId, options);
  const remaining = Object.values(inventory).flat();
  if (remaining.length > 0) {
    throw new Error(
      `isolated Docker cleanup left ${remaining.length} owned resources for ${projectId}`,
    );
  }
}

export function startIsolatedDataApi(isolated, options = {}) {
  const inventory = readIsolatedDockerResourceInventory(isolated.projectId, options);
  assertOwnedDockerResourceInventory(inventory, isolated.projectId);
  const database = inventory.containers.find(
    ({ name }) => name === `supabase_db_${isolated.projectId}`,
  );
  if (!database || inventory.networks.length !== 1) {
    throw new Error(`isolated database/network inventory is incomplete for ${isolated.projectId}`);
  }
  runDocker([
    "exec",
    database.id,
    "createdb",
    "-U",
    "postgres",
    "homecook_gate_api",
  ], options);
  const containerName = `homecook_gate_rest_${isolated.projectId}`;
  runDocker(buildIsolatedDataApiContainerArgs({
    containerName,
    environmentFilePath: isolated.dataApiEnvironmentFilePath,
    networkId: inventory.networks[0].id,
    port: isolated.basePort + 7,
    projectId: isolated.projectId,
  }), options);
  return { containerName, url: isolated.dataApiUrl };
}

export async function waitForIsolatedDataApi({
  beforeAttempt,
  fetchImpl = fetch,
  intervalMs = 500,
  timeoutMs = 60_000,
  url,
}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  do {
    beforeAttempt?.();
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok) return response.status;
      lastError = new Error(`Data API readiness returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while (Date.now() < deadline);
  throw new Error(
    `isolated Data API did not become ready within ${timeoutMs}ms: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

export function removeIsolatedDockerResources(projectId, options = {}) {
  const inventory = readIsolatedDockerResourceInventory(projectId, options);
  for (const resources of Object.values(inventory)) {
    for (const resource of resources) {
      if (resource.project !== projectId) {
        throw new Error(`refusing cleanup for non-owned Docker resource ${resource.id}`);
      }
    }
  }
  const cleanupOrder = [
    ["container", inventory.containers, ["--force"]],
    ["network", inventory.networks, []],
    ["volume", inventory.volumes, []],
  ];
  for (const [kind, resources, flags] of cleanupOrder) {
    if (resources.length === 0) continue;
    runDocker([kind, "rm", ...flags, ...resources.map(({ id }) => id)], options);
  }
  assertNoIsolatedDockerResources(projectId, options);
}

export function assertPinnedSupabaseCliVersion(output) {
  const version = output.trim();
  if (version !== CLI_VERSION) {
    throw new Error(`expected Supabase CLI ${CLI_VERSION}, received ${version || "empty"}`);
  }
  return version;
}
