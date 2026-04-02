import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

import { runStageWithArtifacts } from "./omo-lite-runner.mjs";
import { resolveStageResultPath } from "./omo-stage-result.mjs";

const DEFAULT_PROVIDER_TARGETS = [
  {
    provider: "claude",
    slice: "03-recipe-like",
    stage: 1,
  },
  {
    provider: "codex",
    slice: "02-discovery-filter",
    stage: 2,
  },
];

/**
 * @typedef {object} ProviderSmokeOptions
 * @property {string} [rootDir]
 * @property {string} [artifactBaseDir]
 * @property {string} [homeDir]
 * @property {Record<string, string>} [environment]
 * @property {string} [claudeBin]
 * @property {string} [opencodeBin]
 * @property {boolean} [claudeOnly]
 * @property {boolean} [codexOnly]
 * @property {boolean} [assertClean]
 */

function ensureNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function runPreflight({ provider, bin, rootDir, environment }) {
  const args = provider === "codex" ? ["auth", "list"] : ["--version"];
  const result = spawnSync(bin, args, {
    cwd: rootDir,
    encoding: "utf8",
    env: {
      ...process.env,
      ...(environment ?? {}),
    },
  });

  if (result.status !== 0) {
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    throw new Error(
      `${provider} preflight failed: ${stderr.length > 0 ? stderr : `${bin} ${args.join(" ")} exited with ${result.status}`}`,
    );
  }

  const combinedOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (provider === "codex" && /0 credentials|no credentials/i.test(combinedOutput)) {
    throw new Error("codex preflight failed: OpenCode auth is not configured.");
  }

  return {
    command: [bin, ...args].join(" "),
    output: combinedOutput.trim(),
  };
}

function assertTrackedFilesClean(rootDir) {
  if (!existsSync(join(rootDir, ".git"))) {
    return;
  }

  const result = spawnSync("git", ["status", "--porcelain", "--untracked-files=no"], {
    cwd: rootDir,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error("Unable to inspect git status before running provider smoke.");
  }

  const output = typeof result.stdout === "string" ? result.stdout.trim() : "";
  if (output.length > 0) {
    throw new Error("Provider smoke requires a clean tracked worktree. Commit/stash tracked changes or use --allow-dirty.");
  }
}

/**
 * @param {{ claudeOnly?: boolean, codexOnly?: boolean }} [options]
 */
export function buildProviderSmokeTargets({ claudeOnly = false, codexOnly = false } = {}) {
  if (claudeOnly && codexOnly) {
    throw new Error("--claude-only and --codex-only cannot be used together.");
  }

  if (claudeOnly) {
    return DEFAULT_PROVIDER_TARGETS.filter((target) => target.provider === "claude");
  }

  if (codexOnly) {
    return DEFAULT_PROVIDER_TARGETS.filter((target) => target.provider === "codex");
  }

  return [...DEFAULT_PROVIDER_TARGETS];
}

function summarizeRun(run) {
  return {
    artifactDir: run.artifactDir,
    stageResultPath: resolveStageResultPath(run.artifactDir),
    sessionBinding: run.dispatch?.sessionBinding ?? null,
    execution: {
      provider: run.execution?.provider ?? null,
      sessionId: run.execution?.sessionId ?? null,
      exitCode: run.execution?.exitCode ?? null,
    },
    runtimeSessionId:
      run.runtimeSync?.state?.sessions?.claude_primary?.session_id ??
      run.runtimeSync?.state?.sessions?.codex_primary?.session_id ??
      null,
  };
}

function runSingleProviderSmoke({
  rootDir,
  artifactBaseDir,
  target,
  homeDir,
  environment,
  claudeBin,
  opencodeBin,
  assertClean,
} = {}) {
  if (assertClean) {
    assertTrackedFilesClean(rootDir);
  }

  const workItemId = `omo-provider-smoke-${target.provider}`;
  const providerBin = target.provider === "claude" ? ensureNonEmptyString(claudeBin, "claudeBin") : ensureNonEmptyString(opencodeBin, "opencodeBin");
  const preflight = runPreflight({
    provider: target.provider,
    bin: providerBin,
    rootDir,
    environment,
  });
  const firstRun = runStageWithArtifacts({
    rootDir,
    executionDir: rootDir,
    workItemId,
    slice: target.slice,
    stage: target.stage,
    mode: "execute",
    artifactDir: resolve(artifactBaseDir, `${target.provider}-run-1`),
    claudeBudgetState: target.provider === "claude" ? "available" : undefined,
    claudeBin,
    opencodeBin,
    homeDir,
    environment,
  });
  const secondRun = runStageWithArtifacts({
    rootDir,
    executionDir: rootDir,
    workItemId,
    slice: target.slice,
    stage: target.stage,
    mode: "execute",
    artifactDir: resolve(artifactBaseDir, `${target.provider}-run-2`),
    claudeBudgetState: target.provider === "claude" ? "available" : undefined,
    claudeBin,
    opencodeBin,
    homeDir,
    environment,
  });

  if (assertClean) {
    assertTrackedFilesClean(rootDir);
  }

  const firstSessionId = firstRun.execution?.sessionId ?? null;
  const secondSessionId = secondRun.execution?.sessionId ?? null;
  const sessionReused =
    Boolean(firstSessionId) &&
    firstSessionId === secondSessionId;

  return {
    provider: target.provider,
    workItemId,
    preflight,
    sessionReused,
    runs: [summarizeRun(firstRun), summarizeRun(secondRun)],
  };
}

/**
 * @param {ProviderSmokeOptions} [options]
 */
export function runProviderSmoke({
  rootDir = process.cwd(),
  artifactBaseDir = resolve(rootDir, ".artifacts", "omo-provider-smoke"),
  homeDir = process.env.HOME,
  environment = undefined,
  claudeBin = "claude",
  opencodeBin = "opencode",
  claudeOnly = false,
  codexOnly = false,
  assertClean = true,
} = {}) {
  const targets = buildProviderSmokeTargets({ claudeOnly, codexOnly }).map((target) =>
    runSingleProviderSmoke({
      rootDir,
      artifactBaseDir,
      target,
      homeDir,
      environment,
      claudeBin,
      opencodeBin,
      assertClean,
    }),
  );
  const errors = targets
    .filter((target) => !target.sessionReused)
    .map((target) => `${target.provider} smoke did not reuse the same session id across both runs.`);

  return {
    ok: errors.length === 0,
    artifactBaseDir,
    targets,
    errors,
  };
}
