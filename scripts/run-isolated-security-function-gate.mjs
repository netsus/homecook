#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";

import { ensureDockerRunning } from "./lib/local-docker.mjs";
import {
  assertNoIsolatedDockerOom,
  assertNoIsolatedDockerResources,
  assertOwnedDockerResources,
  assertPinnedSupabaseCliVersion,
  buildIsolatedSupabaseStartArgs,
  buildSupabaseCliArgs,
  createIsolatedSupabaseProject,
  readPinnedLocalDockerTarget,
  removeIsolatedDockerResources,
  startIsolatedDataApi,
  waitForIsolatedDataApi,
} from "./lib/local-supabase-isolated-runtime.mjs";

const repositoryRoot = process.cwd();
const preMigrationFixturePath = join(
  repositoryRoot,
  "tests/sql/marketing-validation-v2-pre-migration-fixture.sql",
);
const v2MigrationFilename =
  "20260903010000_marketing_validation_sessions_v2.sql";
const v2MigrationPath = join(
  repositoryRoot,
  "supabase/migrations",
  v2MigrationFilename,
);
const postMigrationFixturePath = join(
  repositoryRoot,
  "tests/sql/marketing-validation-v2-fixture.sql",
);

function run(
  command,
  args,
  { cwd, env, allowFailure = false, capture = false, timeoutMs } = {},
) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: capture ? "utf8" : undefined,
    killSignal: "SIGTERM",
    stdio: capture ? undefined : "inherit",
    timeout: timeoutMs,
  });
  if (!allowFailure && result.status !== 0) {
    if (result.error?.code === "ETIMEDOUT") {
      throw new Error(`${command} ${args.join(" ")} timed out after ${timeoutMs}ms`);
    }
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status ?? "unknown"}`);
  }
  return result;
}

function runPackageScript(script, { env }) {
  return run("pnpm", [script], { cwd: repositoryRoot, env, timeoutMs: 300_000 });
}

const ambientEnv = Object.assign({}, process.env);
const dockerTarget = readPinnedLocalDockerTarget({ ambient: ambientEnv });
const pinnedDockerEnv = {
  ...ambientEnv,
  DOCKER_HOST: dockerTarget.docker_host,
};
delete pinnedDockerEnv.DOCKER_CONTEXT;
delete pinnedDockerEnv.DOCKER_CERT_PATH;
delete pinnedDockerEnv.DOCKER_TLS_VERIFY;
await ensureDockerRunning({ env: pinnedDockerEnv });
const isolated = await createIsolatedSupabaseProject(repositoryRoot);
const commandEnv = await isolated.buildCommandEnv(
  pinnedDockerEnv,
  { dockerHost: dockerTarget.docker_host },
);
const isolatedV2MigrationPath = join(
  isolated.rootDir,
  "supabase/migrations",
  v2MigrationFilename,
);
const stagedV2MigrationPath = join(
  isolated.rootDir,
  "supabase",
  `${v2MigrationFilename}.pending`,
);
let migrationStaged = false;
let started = false;
try {
  renameSync(isolatedV2MigrationPath, stagedV2MigrationPath);
  migrationStaged = true;
  const versionResult = run(
    "pnpm",
    buildSupabaseCliArgs(["--version"], { workdir: isolated.rootDir }),
    { cwd: isolated.rootDir, env: commandEnv, capture: true },
  );
  const cliVersion = assertPinnedSupabaseCliVersion(versionResult.stdout);
  console.warn(JSON.stringify({
    cliVersion,
    migrationSha256: isolated.migrationSha256,
    projectId: isolated.projectId,
  }));
  assertNoIsolatedDockerResources(isolated.projectId, { env: commandEnv });

  started = true;
  run("pnpm", buildIsolatedSupabaseStartArgs(isolated.rootDir, {
    services: [],
  }), { cwd: isolated.rootDir, env: commandEnv, timeoutMs: 300_000 });
  assertOwnedDockerResources(isolated.projectId, { env: commandEnv });
  assertNoIsolatedDockerOom(isolated.projectId, { env: commandEnv });
  run(
    "psql",
    [
      isolated.databaseUrl,
      "--set",
      "ON_ERROR_STOP=1",
      "--file",
      preMigrationFixturePath,
      "--file",
      v2MigrationPath,
      "--file",
      postMigrationFixturePath,
    ],
    { cwd: repositoryRoot, env: commandEnv, timeoutMs: 60_000 },
  );
  console.warn(JSON.stringify({
    marketingValidationV2PrePostMigrationFixture: "passed",
    projectId: isolated.projectId,
  }));
  renameSync(stagedV2MigrationPath, isolatedV2MigrationPath);
  migrationStaged = false;
  run("pnpm", buildSupabaseCliArgs(["db", "reset", "--local", "--yes"], {
    workdir: isolated.rootDir,
  }), { cwd: isolated.rootDir, env: commandEnv, timeoutMs: 300_000 });
  const dataApi = startIsolatedDataApi(isolated, { env: commandEnv });
  await waitForIsolatedDataApi({
    beforeAttempt: () => assertNoIsolatedDockerOom(
      isolated.projectId,
      { env: commandEnv },
    ),
    url: dataApi.url,
  });
  console.warn(JSON.stringify({
    dataApiStatus: 200,
    docker: assertOwnedDockerResources(isolated.projectId, { env: commandEnv }),
    projectId: isolated.projectId,
  }));

  const gateEnv = {
    ...commandEnv,
    SECURITY_FUNCTION_DATABASE_URL: isolated.databaseUrl,
    SECURITY_FUNCTION_DATA_API_JWT_SECRET: isolated.dataApiJwtSecret,
    SECURITY_FUNCTION_DATA_API_URL: isolated.dataApiUrl,
    SECURITY_FUNCTION_LOCAL_WORKDIR: isolated.rootDir,
  };
  runPackageScript("verify:security-functions", { env: gateEnv });
  runPackageScript("verify:security-functions:data-api", { env: gateEnv });
} finally {
  if (migrationStaged && existsSync(stagedV2MigrationPath)) {
    renameSync(stagedV2MigrationPath, isolatedV2MigrationPath);
  }
  let cleanupSucceeded = !started;
  if (started) {
    cleanupSucceeded = run(
      "pnpm",
      buildSupabaseCliArgs(["stop", "--no-backup"], { workdir: isolated.rootDir }),
      {
        cwd: isolated.rootDir,
        env: commandEnv,
        allowFailure: true,
        timeoutMs: 60_000,
      },
    ).status === 0;
    if (cleanupSucceeded) {
      try {
        assertNoIsolatedDockerResources(isolated.projectId, { env: commandEnv });
      } catch {
        cleanupSucceeded = false;
      }
    }
    if (!cleanupSucceeded) {
      try {
        removeIsolatedDockerResources(isolated.projectId, { env: commandEnv });
        cleanupSucceeded = true;
      } catch (error) {
        console.warn(error instanceof Error ? error.message : String(error));
      }
    }
  }
  if (cleanupSucceeded) {
    await isolated.removeFiles();
  } else {
    console.warn(`isolated files preserved for manual cleanup: ${isolated.rootDir}`);
    throw new Error(`isolated cleanup failed for ${isolated.projectId}`);
  }
}
