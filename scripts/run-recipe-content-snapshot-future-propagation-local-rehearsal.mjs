#!/usr/bin/env node

import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

import {
  allocateDistinctLoopbackPorts,
  assertLocalRehearsalRunnerInput,
  buildLocalRehearsalResourcePlan,
  buildSanitizedRunnerSummary,
} from "./lib/recipe-content-snapshot-future-propagation-local-runner.mjs";
import {
  runRecipeContentSnapshotFuturePropagationLocalCollector,
} from "./lib/recipe-content-snapshot-future-propagation-local-collector.mjs";
import {
  createRecipeContentSnapshotFuturePropagationFullLocalAdapter,
} from "./lib/recipe-content-snapshot-future-propagation-full-local-adapter.mjs";

function readOption(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function resolveSha(value) {
  const result = spawnSync("git", ["rev-parse", "--verify", `${value}^{commit}`], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      LANG: process.env.LANG ?? "C.UTF-8",
      LC_ALL: process.env.LC_ALL ?? "C.UTF-8",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
  if (result.status !== 0) {
    throw new Error("explicit current/immediate-previous SHA could not be resolved");
  }
  return result.stdout.trim();
}

try {
  const argv = process.argv.slice(2);
  const execute = argv.includes("--execute");
  const input = assertLocalRehearsalRunnerInput({
    local_rehearsal_opt_in:
      process.env.HOMECOOK_LOCAL_REHEARSAL_OPT_IN === "1",
    current_head_sha: readOption(argv, "--current-head-sha"),
    immediate_previous_sha: readOption(argv, "--immediate-previous-sha"),
    report_path: readOption(argv, "--report"),
  });
  const resolvedCurrent = resolveSha(input.current_head_sha);
  const resolvedPrevious = resolveSha(input.immediate_previous_sha);
  if (
    resolvedCurrent !== input.current_head_sha
    || resolvedPrevious !== input.immediate_previous_sha
  ) {
    throw new Error("explicit SHAs must resolve exactly without abbreviation");
  }
  const exactHead = resolveSha("HEAD");
  if (exactHead !== input.current_head_sha) {
    throw new Error("--current-head-sha must equal the current checkout HEAD");
  }
  const [gateway, authProxy, https, postgres, app] =
    await allocateDistinctLoopbackPorts(5);
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const tempRoot = join(tmpdir(), `homecook-rehearsal-${runId}`);
  const plan = buildLocalRehearsalResourcePlan({
    current_head_sha: input.current_head_sha,
    immediate_previous_sha: input.immediate_previous_sha,
    run_id: runId,
    temp_root: tempRoot,
    ports: { gateway, auth_proxy: authProxy, https, postgres, app },
  });

  if (execute) {
    const adapter =
      createRecipeContentSnapshotFuturePropagationFullLocalAdapter({ plan });
    await runRecipeContentSnapshotFuturePropagationLocalCollector({
      adapter,
      plan,
      reportPath: input.report_path,
    });
    process.stdout.write(
      `${JSON.stringify(buildSanitizedRunnerSummary(plan, "complete"))}\n`,
    );
  } else {
    process.stdout.write(`${JSON.stringify(buildSanitizedRunnerSummary(plan))}\n`);
  }
} catch (error) {
  const message = error instanceof Error
    ? error.message
    : "local rehearsal runner failed";
  process.stderr.write(`local rehearsal runner failed: ${message}\n`);
  process.exitCode = 1;
}
