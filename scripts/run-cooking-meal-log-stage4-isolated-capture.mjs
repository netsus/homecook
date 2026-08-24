#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import { ensureDockerRunning } from "./lib/local-docker.mjs";
import {
  assertNoIsolatedDockerOom,
  assertNoIsolatedDockerResources,
  assertOwnedDockerResources,
  buildIsolatedSupabaseStartArgs,
  buildSupabaseCliArgs,
  createIsolatedSupabaseProject,
  readPinnedLocalDockerTarget,
  readIsolatedDockerResourceInventory,
  removeIsolatedDockerResources,
} from "./lib/local-supabase-isolated-runtime.mjs";
import {
  STAGE4_CACHED_DOCKER_IMAGES,
  STAGE4_PRIMARY_GUARD_VERIFY_SQL,
  STAGE4_RUNTIME_AUTHORITY_VERIFY_SQL,
  STAGE4_RESERVED_AUTH_ISSUER,
  STAGE4_RESERVED_AUTH_ORIGIN,
  STAGE4_SUPABASE_CLI_PACKAGE,
  STAGE4_SUPABASE_CLI_VERSION,
  assertStage4CachedImages,
  assertStage4CanonicalActivationOutput,
  assertStage4DiagnosticAttemptAvailable,
  assertStage4OwnedDatabaseContainer,
  assertStage4PreRequestGuardOutput,
  assertStage4RuntimeAuthorityOutput,
  assertStage4SupabaseCliVersion,
  buildStage4GuardedJwtVerificationJwks,
  buildStage4CanonicalActivationSql,
  buildStage4FailureResourceSnapshot,
  buildStage4QaFixtureScope,
  buildStage4ServerEnvironment,
  buildStage4DiagnosticOutcome,
  buildStage4SensitiveCommandError,
  classifyStage4CanonicalActivationFailureOutput,
  classifyStage4SeedFailureOutput,
  classifyStage4StartFailure,
  closeStage4GuardedDataProxy,
  hashStage4ServerTarget,
  linkStage4SeedInputs,
  pollStage4NegativeProbe,
  requestStage4NegativeProbe,
  resolveStage4RequiredImageTags,
  resolveStage4ServiceProfile,
  runStage4DockerCleanup,
  runStage4BrowserCaptureCommand,
  startStage4GuardedDataProxy,
} from "./lib/cooking-meal-log-stage4-isolated.mjs";
import {
  assertNoStage4AuxiliaryContainerName,
  assertStage4AuxiliaryContainerIdentity,
  buildStage4AuxiliaryIdentityFailure,
  buildStage4GuardedDataContainerArgs,
  buildStage4ShadowSeedContainerArgs,
  createStage4ShadowSeedDatabaseJwt,
  runStage4AuxiliaryContainerStart,
  runStage4ShadowSeedLifecycle,
} from "./lib/cooking-meal-log-stage4-shadow-seed.mjs";

const repositoryRoot = process.cwd();
const DIAGNOSTIC_ROOT = path.join(
  repositoryRoot,
  ".artifacts",
  "cooking-meal-log-cross-slice-release-qa",
  "stage4-start-diagnostics",
);
const STAGE4_SESSION_ATTESTATION_SECRET =
  "stage4-isolated-session-attestation-20260821";

function parseArgs(argv) {
  const result = {
    attemptId: process.env.HOMECOOK_CML14_CAPTURE_ATTEMPT_ID ?? null,
    diagnosticOnly: false,
    diagnosticProfile: "full",
    startupTimeoutMs: 300_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];
    if (value === "--") continue;
    if (value === "--diagnostic-only") {
      result.diagnosticOnly = true;
      continue;
    }
    if (value === "--attempt-id") result.attemptId = next;
    if (value === "--diagnostic-profile") result.diagnosticProfile = next;
    if (value === "--startup-timeout-ms") {
      result.startupTimeoutMs = Number.parseInt(next, 10);
    }
    if (value.startsWith("--")) index += 1;
  }
  if (
    typeof result.attemptId !== "string"
    || !/^[a-z0-9][a-z0-9._-]{2,95}$/u.test(result.attemptId)
    || result.attemptId.includes("..")
  ) {
    throw new Error("--attempt-id is required and must be a safe lowercase id");
  }
  result.services = resolveStage4ServiceProfile(result.diagnosticProfile);
  if (!result.diagnosticOnly && result.diagnosticProfile !== "full") {
    throw new Error("service subset profiles require --diagnostic-only");
  }
  if (
    !Number.isInteger(result.startupTimeoutMs)
    || result.startupTimeoutMs < 30_000
    || result.startupTimeoutMs > 600_000
  ) {
    throw new Error("--startup-timeout-ms must be between 30000 and 600000");
  }
  return result;
}

async function writeStartDiagnostic({
  args,
  cleanup,
  failure,
  failureResourceSnapshot,
  isolated,
  phases,
  seedLifecycle,
  sourceHeadSha,
  status,
}) {
  const attemptDir = path.join(DIAGNOSTIC_ROOT, args.attemptId);
  await mkdir(DIAGNOSTIC_ROOT, { recursive: true, mode: 0o700 });
  await mkdir(attemptDir, { recursive: false, mode: 0o700 });
  await writeFile(
    path.join(attemptDir, "diagnostic.json"),
    `${JSON.stringify({
      attempt_id: args.attemptId,
      cleanup,
      diagnostic_only: args.diagnosticOnly,
      diagnostic_profile: args.diagnosticProfile,
      failure,
      failure_resource_snapshot: failureResourceSnapshot,
      isolated_base_port: isolated.basePort,
      migration_sha256: isolated.migrationSha256,
      phases,
      project_id: isolated.projectId,
      required_images: resolveStage4RequiredImageTags(args.diagnosticProfile),
      ...seedLifecycle,
      services: args.services,
      source_head_sha: sourceHeadSha,
      startup_timeout_ms: args.startupTimeoutMs,
      status,
      supabase_cli_version: STAGE4_SUPABASE_CLI_VERSION,
    }, null, 2)}\n`,
    { encoding: "utf8", flag: "wx", mode: 0o600 },
  );
}

async function writeImageCacheDiagnostic({
  args,
  cache,
  sourceHeadSha,
}) {
  const attemptDir = path.join(DIAGNOSTIC_ROOT, args.attemptId);
  await mkdir(DIAGNOSTIC_ROOT, { recursive: true, mode: 0o700 });
  await mkdir(attemptDir, { recursive: false, mode: 0o700 });
  await writeFile(
    path.join(attemptDir, "diagnostic.json"),
    `${JSON.stringify({
      attempt_id: args.attemptId,
      cleanup: {
        attempted: false,
        owned_resources_only: true,
        succeeded: true,
      },
      diagnostic_only: args.diagnosticOnly,
      diagnostic_profile: args.diagnosticProfile,
      failure: cache.failure,
      image_cache: {
        available_images: cache.available_images,
        missing_images: cache.missing_images,
        required_images: cache.required_images,
      },
      phases: ["preflight-complete", "image-cache-preflight-failed"],
      services: args.services,
      source_head_sha: sourceHeadSha,
      startup_timeout_ms: args.startupTimeoutMs,
      status: "failed",
      supabase_cli_version: STAGE4_SUPABASE_CLI_VERSION,
    }, null, 2)}\n`,
    { encoding: "utf8", flag: "wx", mode: 0o600 },
  );
}

function inspectStage4CachedImages(profile, env) {
  return resolveStage4RequiredImageTags(profile).filter((image) =>
    run(
      "docker",
      ["image", "inspect", image],
      {
        allowFailure: true,
        capture: true,
        env,
        sensitiveLabel: "Stage 4 Docker image cache inspect",
        sensitiveOutput: true,
      },
    ).status === 0
  );
}

function readFailureResourceSnapshot(projectId, env) {
  const label = `label=com.docker.compose.project=${projectId}`;
  const list = spawnSync(
    "docker",
    ["container", "ls", "-aq", "--filter", label],
    { encoding: "utf8", env },
  );
  if (list.status !== 0) {
    throw new Error("Stage 4 diagnostic container list is unavailable");
  }
  const ids = list.stdout.trim().split(/\s+/u).filter(Boolean);
  if (ids.length === 0) {
    return buildStage4FailureResourceSnapshot({ projectId, resources: [] });
  }
  const inspect = spawnSync(
    "docker",
    ["container", "inspect", ...ids],
    { encoding: "utf8", env },
  );
  if (inspect.status !== 0) {
    throw new Error("Stage 4 diagnostic container inspect is unavailable");
  }
  return buildStage4FailureResourceSnapshot({
    projectId,
    resources: JSON.parse(inspect.stdout),
  });
}

function run(command, args, {
  allowFailure = false,
  capture = false,
  cwd = repositoryRoot,
  env,
  input,
  sensitiveLabel = `${command} command`,
  sensitiveFailureClassifier = null,
  sensitiveOutput = false,
  timeoutMs,
} = {}) {
  const capturesOutput = capture || sensitiveOutput;
  const result = spawnSync(command, args, {
    cwd,
    encoding: capturesOutput ? "utf8" : undefined,
    env,
    input,
    killSignal: "SIGTERM",
    stdio: capturesOutput ? undefined : "inherit",
    timeout: timeoutMs,
  });
  if (!allowFailure && result.status !== 0) {
    if (sensitiveOutput) {
      throw buildStage4SensitiveCommandError({
        failureClassifier: sensitiveFailureClassifier,
        label: sensitiveLabel,
        result,
        timeoutMs,
      });
    }
    if (result.error?.code === "ETIMEDOUT") {
      throw new Error(`${command} ${args.join(" ")} timed out after ${timeoutMs}ms`);
    }
    throw new Error(
      result.stderr?.trim()
      || `${command} ${args.join(" ")} failed with status ${result.status ?? "unknown"}`,
    );
  }
  return result;
}

function runStage4DatabaseSql({
  databaseId,
  env,
  failureClassifier = null,
  sql,
}) {
  return run(
    "docker",
    [
      "exec",
      "-i",
      databaseId,
      "psql",
      "--no-psqlrc",
      "--set",
      "ON_ERROR_STOP=1",
      "--tuples-only",
      "--no-align",
      "--username",
      "postgres",
      "--dbname",
      "postgres",
    ],
    {
      capture: true,
      env,
      input: sql,
      sensitiveLabel: "Stage 4 disposable database guard operation",
      sensitiveFailureClassifier: failureClassifier,
      sensitiveOutput: true,
      timeoutMs: 15_000,
    },
  ).stdout;
}

async function startStage4ShadowSeedApi({ env, isolated, port }) {
  const inventory = readIsolatedDockerResourceInventory(
    isolated.projectId,
    { env },
  );
  if (inventory.networks.length !== 1) {
    throw new Error("Stage 4 shadow seed requires exactly one owned network");
  }
  const jwtSecret = randomBytes(48).toString("hex");
  const databaseKey = createStage4ShadowSeedDatabaseJwt({ jwtSecret });
  const environmentFilePath = path.join(
    isolated.rootDir,
    ".stage4-shadow-seed.env",
  );
  const containerName = `homecook_stage4_seed_rest_${isolated.projectId}`;
  await writeFile(
    environmentFilePath,
    [
      `PGRST_DB_URI=postgresql://postgres:postgres@supabase_db_${isolated.projectId}:5432/postgres`,
      "PGRST_DB_CONFIG=false",
      "PGRST_DB_SCHEMAS=public",
      "PGRST_DB_EXTRA_SEARCH_PATH=public",
      "PGRST_DB_ANON_ROLE=anon",
      `PGRST_JWT_SECRET=${jwtSecret}`,
      "",
    ].join("\n"),
    { encoding: "utf8", mode: 0o600 },
  );
  let containerId;
  try {
    containerId = runStage4AuxiliaryContainerStart({
      assertNameAvailable: () => assertStage4AuxiliaryDataApiRemoved({
        containerName,
        env,
      }),
      start: () => run(
        "docker",
        buildStage4ShadowSeedContainerArgs({
          containerName,
          environmentFilePath,
          image: STAGE4_CACHED_DOCKER_IMAGES.postgrest,
          networkId: inventory.networks[0].id,
          port,
          projectId: isolated.projectId,
        }),
        {
          env,
          sensitiveLabel: "Stage 4 shadow seed Data API start",
          sensitiveOutput: true,
          timeoutMs: 30_000,
        },
      ).stdout,
    });
  } finally {
    await rm(environmentFilePath, { force: true });
  }
  return {
    containerId,
    containerName,
    databaseKey,
    projectId: isolated.projectId,
    serviceLabel: "stage4-shadow-seed-postgrest",
    url: `http://127.0.0.1:${port}`,
  };
}

async function startStage4GuardedDataApi({
  authOrigin,
  env,
  isolated,
  jwtSecret,
  port,
}) {
  const guardedVerificationJwks = await buildStage4GuardedJwtVerificationJwks({
    authOrigin,
    jwtSecret,
  });
  if (typeof jwtSecret !== "string" || jwtSecret.length < 32) {
    throw new Error("Stage 4 guarded Data API JWT secret is invalid");
  }
  const inventory = readIsolatedDockerResourceInventory(
    isolated.projectId,
    { env },
  );
  if (inventory.networks.length !== 1) {
    throw new Error("Stage 4 guarded Data API requires exactly one owned network");
  }
  const environmentFilePath = path.join(
    isolated.rootDir,
    ".stage4-guarded-data.env",
  );
  const containerName = `homecook_stage4_guarded_rest_${isolated.projectId}`;
  await writeFile(
    environmentFilePath,
    [
      `PGRST_DB_URI=postgresql://postgres:postgres@supabase_db_${isolated.projectId}:5432/postgres`,
      "PGRST_DB_CONFIG=false",
      "PGRST_DB_SCHEMAS=public",
      "PGRST_DB_EXTRA_SEARCH_PATH=public,extensions",
      "PGRST_DB_ANON_ROLE=anon",
      `PGRST_JWT_SECRET=${guardedVerificationJwks}`,
      "PGRST_DB_PRE_REQUEST=public.verify_hybrid_request_authority_pre_request",
      "",
    ].join("\n"),
    { encoding: "utf8", mode: 0o600 },
  );
  let containerId;
  try {
    containerId = runStage4AuxiliaryContainerStart({
      assertNameAvailable: () => assertStage4AuxiliaryDataApiRemoved({
        containerName,
        env,
      }),
      start: () => run(
        "docker",
        buildStage4GuardedDataContainerArgs({
          containerName,
          environmentFilePath,
          image: STAGE4_CACHED_DOCKER_IMAGES.postgrest,
          networkId: inventory.networks[0].id,
          port,
          projectId: isolated.projectId,
        }),
        {
          env,
          sensitiveLabel: "Stage 4 guarded Data API start",
          sensitiveOutput: true,
          timeoutMs: 30_000,
        },
      ).stdout,
    });
  } finally {
    await rm(environmentFilePath, { force: true });
  }
  return {
    containerId,
    containerName,
    projectId: isolated.projectId,
    serviceLabel: "stage4-guarded-postgrest",
    url: `http://127.0.0.1:${port}`,
  };
}

function inspectStage4AuxiliaryContainers({ args, env, label }) {
  const result = run("docker", ["container", "inspect", ...args], {
    capture: true,
    env,
    sensitiveLabel: label,
    sensitiveOutput: true,
  });
  let resources;
  try {
    resources = JSON.parse(result.stdout);
  } catch {
    throw new Error("Stage 4 auxiliary container inspect is invalid");
  }
  if (!Array.isArray(resources)) {
    throw new Error("Stage 4 auxiliary container inspect is invalid");
  }
  return resources;
}

function readStage4AuxiliaryNameMatches({ containerName, env }) {
  const list = run(
    "docker",
    ["container", "ls", "-aq", "--filter", `name=${containerName}`],
    {
      capture: true,
      env,
      sensitiveLabel: "Stage 4 auxiliary same-name container list",
      sensitiveOutput: true,
    },
  );
  const ids = list.stdout.trim().split(/\s+/u).filter(Boolean);
  return ids.length === 0
    ? []
    : inspectStage4AuxiliaryContainers({
      args: ids,
      env,
      label: "Stage 4 auxiliary same-name container inspect",
    });
}

function assertStage4AuxiliaryDataApiRemoved({ containerName, env }) {
  try {
    return assertNoStage4AuxiliaryContainerName({
      expectedName: containerName,
      resources: readStage4AuxiliaryNameMatches({ containerName, env }),
    });
  } catch (error) {
    throw toStage4AuxiliaryIdentityFailure(error);
  }
}

function removeStage4AuxiliaryDataApi({ container, env, label }) {
  let resources;
  try {
    resources = inspectStage4AuxiliaryContainers({
      args: [container.containerId],
      env,
      label: "Stage 4 auxiliary owned container inspect",
    });
  } catch (error) {
    throw toStage4AuxiliaryIdentityFailure(error);
  }
  if (resources.length !== 1) {
    throw buildStage4AuxiliaryIdentityFailure();
  }
  const containerId = assertStage4AuxiliaryContainerIdentity({
    expected: container,
    resource: resources[0],
  });
  run(
    "docker",
    ["container", "rm", "--force", containerId],
    {
      env,
      sensitiveLabel: label,
      sensitiveOutput: true,
      timeoutMs: 30_000,
    },
  );
  return assertStage4AuxiliaryDataApiRemoved({
    containerName: container.containerName,
    env,
  });
}

function toStage4AuxiliaryIdentityFailure(error) {
  return error?.code === "auxiliary_identity_mismatch"
    ? error
    : buildStage4AuxiliaryIdentityFailure();
}

async function waitForStage4NegativeGuardProbe({
  apiUrl,
  serviceRoleKey,
  timeoutMs = 15_000,
}) {
  return pollStage4NegativeProbe({
    probe: ({ observe, signal }) => requestStage4NegativeProbe({
      apiUrl,
      onObservation: observe,
      serviceRoleKey,
      signal,
    }),
    timeoutMs,
  });
}

function parseStatusEnvironment(contents) {
  return Object.fromEntries(
    contents
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator < 1) throw new Error("invalid isolated Supabase status output");
        const key = line.slice(0, separator);
        const value = line.slice(separator + 1).replace(/^['"]|['"]$/gu, "");
        return [key, value];
      }),
  );
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

async function findAppPort(basePort) {
  for (let port = 31_00; port < 39_00; port += 1) {
    if (port >= basePort && port <= basePort + 7) continue;
    if (await canBind(port)) return port;
  }
  throw new Error("could not allocate a loopback Stage 4 app port");
}

async function waitForUrl(url, { timeoutMs = 120_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  do {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status >= 200 && response.status < 400) return response.status;
      lastError = new Error(`readiness returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  } while (Date.now() < deadline);
  throw new Error(
    `Stage 4 readiness timed out for ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  const exited = await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(() => resolve(false), 10_000)),
  ]);
  if (exited === false && child.exitCode === null) {
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

async function createPinnedPnpmWrapper(isolatedRoot, commandEnv) {
  const binDir = path.join(isolatedRoot, "bin");
  await mkdir(binDir, { recursive: true, mode: 0o700 });
  const realPnpm = run("which", ["pnpm"], {
    capture: true,
    env: commandEnv,
  }).stdout.trim();
  if (!realPnpm) throw new Error("pnpm executable is unavailable");
  const wrapperPath = path.join(binDir, "pnpm");
  await writeFile(
    wrapperPath,
    `#!/usr/bin/env node\nconst { spawnSync } = require("node:child_process");\nconst args = process.argv.slice(2);\nif (args[0] === "dlx" && args[1] === "supabase") args[1] = ${JSON.stringify(STAGE4_SUPABASE_CLI_PACKAGE)};\nconst result = spawnSync(${JSON.stringify(realPnpm)}, args, { env: process.env, stdio: "inherit" });\nprocess.exit(result.status ?? 1);\n`,
    { encoding: "utf8", mode: 0o700 },
  );
  await chmod(wrapperPath, 0o700);
  return binDir;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (run("git", ["status", "--porcelain", "--untracked-files=all"], {
    capture: true,
  }).stdout.trim() !== "") {
    throw new Error("Stage 4 isolated runner requires a clean worktree");
  }
  const sourceHeadSha = run("git", ["rev-parse", "HEAD"], {
    capture: true,
  }).stdout.trim();

  assertStage4DiagnosticAttemptAvailable({
    attemptId: args.attemptId,
    diagnosticRoot: DIAGNOSTIC_ROOT,
  });

  const dockerTarget = readPinnedLocalDockerTarget({ ambient: process.env });
  const pinnedDockerEnv = {
    ...process.env,
    DOCKER_HOST: dockerTarget.docker_host,
  };
  delete pinnedDockerEnv.DOCKER_CONTEXT;
  delete pinnedDockerEnv.DOCKER_CERT_PATH;
  delete pinnedDockerEnv.DOCKER_TLS_VERIFY;
  await ensureDockerRunning({ env: pinnedDockerEnv });
  try {
    assertStage4CachedImages({
      availableImages: inspectStage4CachedImages(
        args.diagnosticProfile,
        pinnedDockerEnv,
      ),
      profile: args.diagnosticProfile,
    });
  } catch (error) {
    const cache = error?.cacheResult;
    if (cache) {
      await writeImageCacheDiagnostic({ args, cache, sourceHeadSha });
    }
    const sanitized = new Error(
      `missing_image: ${error instanceof Error ? error.message : "required Stage 4 Docker image is not cached"}`,
    );
    sanitized.code = "missing_image";
    throw sanitized;
  }

    const isolated = await createIsolatedSupabaseProject(repositoryRoot, {
      authJwtIssuerOverride: STAGE4_RESERVED_AUTH_ISSUER,
    });
  const commandEnv = await isolated.buildCommandEnv(
    pinnedDockerEnv,
    { dockerHost: dockerTarget.docker_host },
  );
  let started = false;
  let server = null;
  let shadowSeedApi = null;
  let guardedDataApi = null;
  let guardedDataProxy = null;
  let executionError = null;
  let failure = null;
  let failureResourceSnapshot = null;
  let diagnosticStatus = "failed";
  const phases = [
    "preflight-complete",
    "docker-ready",
    "image-cache-verified",
    "disposable-project-created",
  ];
  const cleanup = {
    attempted: false,
    owned_resources_only: true,
    succeeded: false,
  };
  const seedLifecycle = {
    guarded_data_api_used: false,
    guarded_data_proxy_used: false,
    negative_probe_passed: false,
    primary_guard_unchanged: false,
    shadow_seed_api_removed: false,
    shadow_seed_api_used: false,
  };
  try {
    const version = run(
      "pnpm",
      buildSupabaseCliArgs(["--version"], {
        cliPackage: STAGE4_SUPABASE_CLI_PACKAGE,
        workdir: isolated.rootDir,
      }),
      { capture: true, cwd: isolated.rootDir, env: commandEnv },
    );
    assertStage4SupabaseCliVersion(version.stdout);
    assertNoIsolatedDockerResources(isolated.projectId, { env: commandEnv });
    phases.push("pinned-cli-verified", "owned-resources-absent");

    started = true;
    phases.push("supabase-start-begin");
    run(
      "pnpm",
      buildIsolatedSupabaseStartArgs(isolated.rootDir, {
        cliPackage: STAGE4_SUPABASE_CLI_PACKAGE,
        services: args.services,
      }).concat("--yes"),
      {
        cwd: isolated.rootDir,
        env: commandEnv,
        sensitiveLabel: "isolated Supabase startup",
        sensitiveOutput: true,
        timeoutMs: args.startupTimeoutMs,
      },
    );
    phases.push("supabase-start-complete");
    assertOwnedDockerResources(isolated.projectId, { env: commandEnv });
    assertNoIsolatedDockerOom(isolated.projectId, { env: commandEnv });
    phases.push("owned-resources-verified");
    if (args.diagnosticOnly) {
      diagnosticStatus = "passed";
      phases.push("diagnostic-profile-complete");
    } else {
    run(
      "pnpm",
      buildSupabaseCliArgs(["db", "reset", "--local", "--yes"], {
        cliPackage: STAGE4_SUPABASE_CLI_PACKAGE,
        workdir: isolated.rootDir,
      }),
      {
        cwd: isolated.rootDir,
        env: commandEnv,
        sensitiveLabel: "isolated Supabase database reset",
        sensitiveOutput: true,
        timeoutMs: 300_000,
      },
    );
    phases.push("database-reset-complete");

    const status = parseStatusEnvironment(
      run(
        "pnpm",
        buildSupabaseCliArgs(["status", "--output", "env"], {
          cliPackage: STAGE4_SUPABASE_CLI_PACKAGE,
          workdir: isolated.rootDir,
        }),
        {
          capture: true,
          cwd: isolated.rootDir,
          env: commandEnv,
          sensitiveLabel: "isolated Supabase status",
          sensitiveOutput: true,
        },
      ).stdout,
    );
    for (const key of ["API_URL", "ANON_KEY", "JWT_SECRET", "SERVICE_ROLE_KEY"]) {
      if (!status[key]) throw new Error(`isolated Supabase status is missing ${key}`);
    }
    const apiUrl = new URL(status.API_URL);
    if (
      apiUrl.protocol !== "http:"
      || !new Set(["127.0.0.1", "localhost"]).has(apiUrl.hostname)
      || Number(apiUrl.port) !== isolated.basePort + 1
    ) {
      throw new Error("isolated Supabase API URL is outside the owned port range");
    }
    await waitForUrl(`${apiUrl.origin}/auth/v1/health`);
    phases.push("auth-health-complete");

    await linkStage4SeedInputs({
      isolatedRoot: isolated.rootDir,
      repositoryRoot,
    });
    phases.push("seed-input-links-ready");
    const wrapperBin = await createPinnedPnpmWrapper(isolated.rootDir, commandEnv);
    const databaseId = assertStage4OwnedDatabaseContainer({
      containers: readIsolatedDockerResourceInventory(
        isolated.projectId,
        { env: commandEnv },
      ).containers,
      projectId: isolated.projectId,
    });
    const shadowSeedPort = await findAppPort(isolated.basePort);
    await runStage4ShadowSeedLifecycle({
      assertShadowRemoved: () => assertStage4AuxiliaryDataApiRemoved({
        containerName: shadowSeedApi.containerName,
        env: commandEnv,
      }),
      negativeProbe: async () => {
        const guardedDataPort = await findAppPort(isolated.basePort);
        guardedDataApi = await startStage4GuardedDataApi({
          authOrigin: apiUrl.origin,
          env: commandEnv,
          isolated,
          jwtSecret: status.JWT_SECRET,
          port: guardedDataPort,
        });
        seedLifecycle.guarded_data_api_used = true;
        phases.push("guarded-data-api-started");
        const guardedProxyPort = await findAppPort(isolated.basePort);
        guardedDataProxy = await startStage4GuardedDataProxy({
          attestationSecret: STAGE4_SESSION_ATTESTATION_SECRET,
          dataUpstreamUrl: guardedDataApi.url,
          onSafeFailure: (failure) => {
            process.stderr.write(
              `Stage 4 guarded Data upstream failure ${JSON.stringify(failure)}\n`,
            );
          },
          port: guardedProxyPort,
          storageUpstreamUrl: status.API_URL,
        });
        seedLifecycle.guarded_data_proxy_used = true;
        phases.push("guarded-data-proxy-started");
        return waitForStage4NegativeGuardProbe({
          apiUrl: guardedDataProxy.url,
          serviceRoleKey: status.SERVICE_ROLE_KEY,
        });
      },
      onPhase: (phase) => phases.push(phase),
      removeShadow: () => removeStage4AuxiliaryDataApi({
        container: shadowSeedApi,
        env: commandEnv,
        label: "Stage 4 shadow seed Data API removal",
      }),
      seed: () => run(
        "node",
        ["scripts/local-seed-demo-data.mjs"],
        {
          cwd: isolated.rootDir,
          env: {
            ...commandEnv,
            HOMECOOK_LOCAL_SEED_CODES_ONLY: "1",
            HOMECOOK_LOCAL_SEED_DATA_API_SERVICE_ROLE_KEY:
              shadowSeedApi.databaseKey,
            HOMECOOK_LOCAL_SEED_DATA_API_URL: shadowSeedApi.url,
            PATH: `${wrapperBin}:${commandEnv.PATH}`,
          },
          sensitiveLabel: "isolated Supabase demo seed",
          sensitiveFailureClassifier: classifyStage4SeedFailureOutput,
          sensitiveOutput: true,
          timeoutMs: 180_000,
        },
      ),
      startShadow: async () => {
        shadowSeedApi = await startStage4ShadowSeedApi({
          env: commandEnv,
          isolated,
          port: shadowSeedPort,
        });
      },
      state: seedLifecycle,
      verifyPrimaryGuard: () => {
        const output = runStage4DatabaseSql({
          databaseId,
          env: commandEnv,
          sql: STAGE4_PRIMARY_GUARD_VERIFY_SQL,
        });
        assertStage4PreRequestGuardOutput(output);
        return output.trim();
      },
      verifyPrimaryAuthHealth: () => waitForUrl(
        `${apiUrl.origin}/auth/v1/health`,
      ),
      waitShadow: () => waitForUrl(shadowSeedApi.url, { timeoutMs: 30_000 }),
    });

    const activationRehearsal = assertStage4CanonicalActivationOutput(
      runStage4DatabaseSql({
        databaseId,
        env: commandEnv,
        failureClassifier: classifyStage4CanonicalActivationFailureOutput,
        sql: buildStage4CanonicalActivationSql(),
      }),
    );
    phases.push("canonical-activation-rehearsal-complete");

    assertStage4RuntimeAuthorityOutput(runStage4DatabaseSql({
      databaseId,
      env: commandEnv,
      sql: STAGE4_RUNTIME_AUTHORITY_VERIFY_SQL,
    }));
    phases.push("local-session-authority-ready");

    const appPort = await findAppPort(isolated.basePort);
    const appOrigin = `http://127.0.0.1:${appPort}`;
    const serverEnv = buildStage4ServerEnvironment({
      ambient: {
        ...commandEnv,
        AUTH_FLOW_HMAC_KEY:
          "stage4-isolated-auth-flow-hmac-key-20260821",
        HOMECOOK_ENABLE_ACCOUNT_QUARANTINE_QA_FIXTURE: "1",
        HOMECOOK_ENABLE_LOCAL_DEV_AUTH: "1",
        HOMECOOK_ENABLE_YOUTUBE_IMPORT: "0",
        HOMECOOK_SESSION_ATTESTATION_HMAC_KEY_V1:
          STAGE4_SESSION_ATTESTATION_SECRET,
        HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1:
          "stage4-isolated-session-generation-20260821",
        HOMECOOK_SESSION_GENERATION_HMAC_KEY_V2:
          "stage4-isolated-session-generation-20260821",
        NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_DEV_AUTH: "1",
        NEXT_PUBLIC_HOMECOOK_ENABLE_LOCAL_GOOGLE_OAUTH: "0",
        NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_IMPORT: "0",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      anonKey: status.ANON_KEY,
      apiUrl: guardedDataProxy.url,
      appOrigin,
      authApiUrl: status.API_URL,
      publicAuthUrl: STAGE4_RESERVED_AUTH_ORIGIN,
      serviceRoleKey: status.SERVICE_ROLE_KEY,
    });
    const serverEnvSha256 = hashStage4ServerTarget(serverEnv);
    const docker = assertOwnedDockerResources(isolated.projectId, {
      env: commandEnv,
    });
    const attestationPath = path.join(
      isolated.rootDir,
      "target-attestation.json",
    );
    await writeFile(attestationPath, `${JSON.stringify({
      api_url: guardedDataProxy.url,
      app_origin: appOrigin,
      auth_api_url: status.API_URL,
      auth_public_issuer: STAGE4_RESERVED_AUTH_ISSUER,
      canonical_activation: activationRehearsal,
      docker,
      generated_at: new Date().toISOString(),
      guarded_data_api_url: guardedDataApi.url,
      migration_sha256: isolated.migrationSha256,
      ...seedLifecycle,
      pinned_isolated_local: true,
      rehearsal_only: true,
      ports: {
        app: appPort,
        auth: Number(apiUrl.port),
        base: isolated.basePort,
        data: Number(new URL(guardedDataProxy.url).port),
        guarded: Number(new URL(guardedDataApi.url).port),
      },
      project_id: isolated.projectId,
      qa_fixture_scope: buildStage4QaFixtureScope(),
      remote_linked_cloud_access: 0,
      server_env_sha256: serverEnvSha256,
      server_env_target: "isolated-supabase",
      source_head_sha: sourceHeadSha,
      supabase_cli_version: STAGE4_SUPABASE_CLI_VERSION,
    }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });

    server = spawn(
      "pnpm",
      ["exec", "next", "dev", "--turbopack", "-p", String(appPort)],
      { cwd: repositoryRoot, env: serverEnv, stdio: "inherit" },
    );
    await waitForUrl(appOrigin);
    phases.push("next-server-ready");
    await runStage4BrowserCaptureCommand({
      args: [
        "capture:cooking-meal-log-stage4",
        "--",
        "--attempt-id",
        args.attemptId,
        "--base-url",
        appOrigin,
        "--target-attestation",
        attestationPath,
      ],
      command: "pnpm",
      cwd: repositoryRoot,
      env: serverEnv,
      timeoutMs: 300_000,
    });
    phases.push("browser-capture-complete");
    diagnosticStatus = "passed";
    }
  } catch (error) {
    executionError = error;
    failure = error?.safeFailure ?? classifyStage4StartFailure(error);
    try {
      failureResourceSnapshot = readFailureResourceSnapshot(
        isolated.projectId,
        commandEnv,
      );
    } catch {
      failureResourceSnapshot = {
        collection_status: "failed",
        containers: [],
      };
    }
    phases.push("execution-failed");
  } finally {
    let cleanupError = null;
    let cleanupSucceeded = !started;
    cleanup.attempted = started;
    try {
      await stopChild(server);
      let deferredCleanupError = null;
      let contestedAuxiliaryError = executionError?.code
        === "auxiliary_identity_mismatch"
        ? executionError
        : null;
      if (guardedDataProxy) {
        try {
          await closeStage4GuardedDataProxy(guardedDataProxy.server);
          seedLifecycle.guarded_data_proxy_removed = true;
          phases.push("guarded-data-proxy-removed");
        } catch (error) {
          deferredCleanupError = error;
          phases.push("guarded-data-proxy-removal-failed");
        }
      }
      if (shadowSeedApi && !seedLifecycle.shadow_seed_api_removed) {
        try {
          removeStage4AuxiliaryDataApi({
            container: shadowSeedApi,
            env: commandEnv,
            label: "Stage 4 shadow seed Data API final removal",
          });
          seedLifecycle.shadow_seed_api_removed = true;
          phases.push("shadow-seed-api-finally-removed");
        } catch (error) {
          contestedAuxiliaryError ??= toStage4AuxiliaryIdentityFailure(error);
          phases.push("shadow-seed-api-final-removal-failed");
        }
      } else if (shadowSeedApi) {
        try {
          assertStage4AuxiliaryDataApiRemoved({
            containerName: shadowSeedApi.containerName,
            env: commandEnv,
          });
        } catch (error) {
          contestedAuxiliaryError ??= toStage4AuxiliaryIdentityFailure(error);
          phases.push("shadow-seed-api-replacement-detected");
        }
      }
      if (guardedDataApi) {
        try {
          removeStage4AuxiliaryDataApi({
            container: guardedDataApi,
            env: commandEnv,
            label: "Stage 4 guarded Data API removal",
          });
          assertStage4AuxiliaryDataApiRemoved({
            containerName: guardedDataApi.containerName,
            env: commandEnv,
          });
          seedLifecycle.guarded_data_api_removed = true;
          phases.push("guarded-data-api-removed");
        } catch (error) {
          contestedAuxiliaryError ??= toStage4AuxiliaryIdentityFailure(error);
          phases.push("guarded-data-api-direct-removal-failed");
        }
      }
      if (started) {
        const cleanupResult = runStage4DockerCleanup({
          contestedError: contestedAuxiliaryError,
          fallbackCleanup: () => removeIsolatedDockerResources(
            isolated.projectId,
            { env: commandEnv },
          ),
          stopCleanup: () => run(
            "pnpm",
            buildSupabaseCliArgs(["stop", "--no-backup", "--yes"], {
              cliPackage: STAGE4_SUPABASE_CLI_PACKAGE,
              workdir: isolated.rootDir,
            }),
            {
              allowFailure: true,
              cwd: isolated.rootDir,
              env: commandEnv,
              sensitiveLabel: "isolated Supabase cleanup",
              sensitiveOutput: true,
              timeoutMs: 60_000,
            },
          ).status === 0,
          verifyCleanup: () => {
            assertNoIsolatedDockerResources(isolated.projectId, {
              env: commandEnv,
            });
          },
        });
        cleanupSucceeded = cleanupResult.succeeded;
        if (cleanupResult.used_fallback) {
          phases.push("owned-resource-fallback-cleanup");
        }
        if (guardedDataApi && cleanupSucceeded) {
          assertStage4AuxiliaryDataApiRemoved({
            containerName: guardedDataApi.containerName,
            env: commandEnv,
          });
          seedLifecycle.guarded_data_api_removed = true;
        }
        if (shadowSeedApi && cleanupSucceeded) {
          assertStage4AuxiliaryDataApiRemoved({
            containerName: shadowSeedApi.containerName,
            env: commandEnv,
          });
          seedLifecycle.shadow_seed_api_removed = true;
        }
      }
      if (cleanupSucceeded) {
        await isolated.removeFiles();
        phases.push("disposable-cleanup-complete");
      }
      if (deferredCleanupError) throw deferredCleanupError;
    } catch (error) {
      cleanupError = error;
      cleanupSucceeded = false;
    }

    const diagnosticOutcome = buildStage4DiagnosticOutcome({
      cleanupError,
      diagnosticStatus,
      primaryFailure: failure,
    });
    diagnosticStatus = diagnosticOutcome.status;
    failure = diagnosticOutcome.failure;
    cleanup.succeeded = cleanupSucceeded;
    if (diagnosticOutcome.cleanupFailure) {
      cleanup.failure = diagnosticOutcome.cleanupFailure;
      phases.push("disposable-cleanup-failed");
      executionError ??= new Error(diagnosticOutcome.cleanupFailure.message);
    }

    try {
      await writeStartDiagnostic({
        args,
        cleanup,
        failure,
        failureResourceSnapshot,
        isolated,
        phases,
        seedLifecycle,
        sourceHeadSha,
        status: diagnosticStatus,
      });
    } catch (diagnosticError) {
      executionError ??= diagnosticError;
    }
  }
  if (executionError) throw executionError;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
