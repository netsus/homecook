import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

function readOption(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(command + " failed without exposing captured output");
  }
  return result.stdout.trim();
}

function runStatus(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(command + " failed without exposing captured output");
  }
  return result.status;
}

function assertMergedExactSource({
  assertSource,
  buildGitEnvironment,
  environment,
  repositoryRoot,
}) {
  const gitEnvironment = buildGitEnvironment({
    baseEnvironment: environment,
  });
  run("git", ["fetch", "--quiet", "origin", "master"], {
    cwd: repositoryRoot,
    env: gitEnvironment,
  });
  const head = run("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    env: gitEnvironment,
  });
  const originMaster = run("git", ["rev-parse", "origin/master"], {
    cwd: repositoryRoot,
    env: gitEnvironment,
  });
  const graftsPath = run("git", ["rev-parse", "--git-path", "info/grafts"], {
    cwd: repositoryRoot,
    env: gitEnvironment,
  });
  const resolvedGraftsPath = isAbsolute(graftsPath)
    ? graftsPath
    : resolve(repositoryRoot, graftsPath);
  const legacyGrafts = existsSync(resolvedGraftsPath)
    ? readFileSync(resolvedGraftsPath, "utf8").trim()
    : "";

  return assertSource({
    head,
    originMaster,
    isAncestorOfOriginMaster:
      runStatus(
        "git",
        [
          "--no-replace-objects",
          "merge-base",
          "--is-ancestor",
          head,
          originMaster,
        ],
        { cwd: repositoryRoot, env: gitEnvironment },
      ) === 0,
    legacyGrafts,
    trackedStatus: run(
      "git",
      ["status", "--short", "--untracked-files=all"],
      { cwd: repositoryRoot, env: gitEnvironment },
    ),
  });
}

function runRequiredChecks({
  buildCheckEnvironment,
  environment,
  plan,
  repositoryRoot,
}) {
  const checks = {};
  const checkEnvironment = buildCheckEnvironment
    ? buildCheckEnvironment(environment)
    : environment;
  for (const check of plan.requiredChecks) {
    const result = spawnSync(check.command, check.args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: checkEnvironment,
    });
    if (result.status !== 0) {
      throw new Error(
        "required check " + check.id
          + " failed without exposing captured output",
      );
    }
    checks[check.id] = "passed";
  }
  return checks;
}

function emitJson(value, pretty) {
  process.stdout.write(JSON.stringify(value, null, pretty ? 2 : 0) + "\n");
}

export function runFullLocalVerificationCli({
  argv = process.argv.slice(2),
  assertEnvironment,
  assertLocalResult,
  assertMergedSource,
  assertSourceEvidence,
  buildCheckEnvironment,
  buildDryRunPayload,
  buildExecutionEvidence,
  buildGitEnvironment,
  buildLocalResult = ({ databaseResult }) => databaseResult,
  buildPlan,
  buildPsqlRequest,
  buildSummary,
  collectSourceEvidence,
  databaseUrlEnvironmentKey,
  environment = process.env,
  failurePrefix,
  repositoryRoot = process.cwd(),
}) {
  const mode = readOption(argv, "--mode");
  const dryRun = argv.includes("--dry-run");
  const pretty = argv.includes("--json");

  try {
    assertEnvironment(environment);
    const plan = buildPlan({ mode });
    const mergeSha = assertMergedExactSource({
      assertSource: assertMergedSource,
      buildGitEnvironment,
      environment,
      repositoryRoot,
    });
    const sourceEvidence = collectSourceEvidence?.(repositoryRoot);
    if (assertSourceEvidence) assertSourceEvidence(sourceEvidence);

    if (dryRun) {
      emitJson(buildDryRunPayload({ mergeSha, plan, sourceEvidence }), pretty);
      return 0;
    }

    const request = buildPsqlRequest({
      baseEnvironment: environment,
      databaseUrl: environment[databaseUrlEnvironmentKey] ?? "",
      planSql: plan.sql,
    });
    const databaseResult = JSON.parse(run("psql", request.args, {
      cwd: repositoryRoot,
      env: request.environment,
      input: request.input,
    }));
    const localResult = buildLocalResult({ databaseResult, sourceEvidence });
    assertLocalResult(localResult);
    const checks = runRequiredChecks({
      buildCheckEnvironment,
      environment,
      plan,
      repositoryRoot,
    });
    const executionEvidence = buildExecutionEvidence({
      checks,
      localResult,
      mergeSha,
      plan,
      sourceEvidence,
    });
    const summary = buildSummary({
      executionEvidence,
      localResult,
      mergeSha,
    });
    emitJson(summary, pretty);
    return 0;
  } catch (error) {
    process.stderr.write(
      failurePrefix
        + (error instanceof Error ? error.message : String(error))
        + "\n",
    );
    return 1;
  }
}
