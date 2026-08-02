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

function assertHttpsGitRemote(remoteUrl) {
  let parsed;
  try {
    parsed = new URL(remoteUrl);
  } catch {
    throw new Error("full-local verifier requires a credential-free HTTPS origin");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
  ) {
    throw new Error("full-local verifier requires a credential-free HTTPS origin");
  }
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
  const originUrl = run("git", ["config", "--get", "remote.origin.url"], {
    cwd: repositoryRoot,
    env: gitEnvironment,
  });
  assertHttpsGitRemote(originUrl);
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

  const mergeSha = assertSource({
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
  return {
    gitFetchTransport: "https-read-only",
    mergeSha,
  };
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
  return {
    checks,
    requiredChecksTarget: buildCheckEnvironment
      ? "local-sanitized"
      : "local-inherited",
  };
}

function buildExecutionObservation({
  gitFetchTransport,
  request,
  requiredChecksTarget,
}) {
  const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  const databaseTarget = loopbackHosts.has(request.environment.PGHOST)
    ? "loopback"
    : "non-loopback";
  const databaseTransaction = /\bbegin\b[^;]*\bread\s+only\b/iu.test(
    request.input,
  )
    ? "read-only"
    : "write-capable";
  const remoteApplicationWriteTarget =
    gitFetchTransport === "https-read-only"
      && databaseTarget === "loopback"
      && databaseTransaction === "read-only"
      && requiredChecksTarget === "local-sanitized"
      ? "absent"
      : "not-proven-absent";

  return {
    git_fetch_transport: gitFetchTransport,
    database_target: databaseTarget,
    database_transaction: databaseTransaction,
    required_checks_target: requiredChecksTarget,
    remote_application_write_target: remoteApplicationWriteTarget,
  };
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
    const { gitFetchTransport, mergeSha } = assertMergedExactSource({
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
    const databaseOutput = run("psql", request.args, {
      cwd: repositoryRoot,
      env: request.environment,
      input: request.input,
    });
    let databaseResult;
    try {
      databaseResult = JSON.parse(databaseOutput);
    } catch {
      throw new Error("database verifier returned invalid JSON");
    }
    const localResult = buildLocalResult({ databaseResult, sourceEvidence });
    assertLocalResult(localResult);
    const { checks, requiredChecksTarget } = runRequiredChecks({
      buildCheckEnvironment,
      environment,
      plan,
      repositoryRoot,
    });
    const executionObservation = buildExecutionObservation({
      gitFetchTransport,
      request,
      requiredChecksTarget,
    });
    const executionEvidence = buildExecutionEvidence({
      checks,
      executionObservation,
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
