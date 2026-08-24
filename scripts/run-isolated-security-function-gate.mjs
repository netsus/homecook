#!/usr/bin/env node

import { spawnSync } from "node:child_process";

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
let started = false;
try {
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
