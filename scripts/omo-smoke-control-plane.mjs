#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import {
  assertSafeSandboxRepoRef,
  collectControlPlaneSmokeCheckpoints,
  createControlPlaneSmokeStageRunner,
  createLiveProviderControlPlaneSmokeStageRunner,
  describeControlPlaneNextStep,
  readControlPlaneSmokeState,
  seedControlPlaneSmokeWorkspace,
} from "./lib/omo-control-plane-smoke.mjs";
import { superviseWorkItem, tickSupervisorWorkItems } from "./lib/omo-autonomous-supervisor.mjs";
import { readRuntimeState } from "./lib/omo-session-runtime.mjs";
import { reconcileWorkItemBookkeeping } from "./lib/omo-reconcile.mjs";
import { assertSupportedClaudeProvider } from "./lib/omo-provider-config.mjs";

function printUsage() {
  process.stdout.write(
    [
      "Usage: node scripts/omo-smoke-control-plane.mjs --sandbox-repo <owner/name> [options]",
      "",
      "Options:",
      "  --sandbox-repo <owner/name>      Dedicated GitHub sandbox repository",
      "  --workspace <path>               Reuse an existing cloned sandbox workspace",
      "  --work-item <id>                 Override smoke work item id",
      "  --artifact-base-dir <path>       Override artifact base directory",
      "  --live-providers                 Use real Claude/Codex providers instead of deterministic smoke actors",
      "  --gh-bin <path>                  Override gh binary path",
      "  --claude-provider <name>         Override Claude provider: claude-cli",
      "  --claude-bin <path>              Override claude binary path",
      "  --claude-model <model>           Override Claude model alias/name",
      "  --claude-effort <level>          Override Claude effort: low | medium | high",
      "  --opencode-bin <path>            Override opencode binary path",
      "  --home-dir <path>                Override HOME for provider execution",
      "  --json                           Print JSON output",
      "  --help                           Show this help text",
      "",
      "This smoke preserves manual review/manual verification gates.",
      "Rerun it after CI, approval, or manual merge events to continue the state machine.",
      "",
    ].join("\n"),
  );
}

function requireValue(argv, index, token) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${token} requires a value.`);
  }

  return value;
}

function parseArgs(argv) {
  const options = {
    workItem: "99-omo-control-plane-smoke",
    json: false,
    liveProviders: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--") continue;
    if (token === "--help") {
      options.help = true;
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--live-providers") {
      options.liveProviders = true;
      continue;
    }
    if (
      token === "--sandbox-repo" ||
      token === "--workspace" ||
      token === "--work-item" ||
      token === "--artifact-base-dir" ||
      token === "--gh-bin" ||
      token === "--claude-provider" ||
      token === "--claude-bin" ||
      token === "--claude-model" ||
      token === "--claude-effort" ||
      token === "--opencode-bin" ||
      token === "--home-dir"
    ) {
      const key = token
        .replace(/^--/, "")
        .replace(/-([a-z])/g, (_, character) => character.toUpperCase());
      options[key] = requireValue(argv, index, token);
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  return options;
}

function runGit({ cwd, args }) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `git ${args.join(" ")} failed.`);
  }

  return result.stdout?.trim() ?? "";
}

function runGh({ ghBin, cwd, args }) {
  const result = spawnSync(ghBin, args, {
    cwd,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || `gh ${args.join(" ")} failed.`);
  }

  return result.stdout?.trim() ?? "";
}

function ensureSandboxWorkspace({ sandboxRepo, workspace, ghBin }) {
  if (existsSync(join(workspace, ".git"))) {
    return {
      workspace,
      cloned: false,
    };
  }

  mkdirSync(resolve(workspace, ".."), { recursive: true });
  runGh({
    ghBin,
    cwd: process.cwd(),
    args: ["repo", "clone", sandboxRepo, workspace],
  });

  return {
    workspace,
    cloned: true,
  };
}

function ensureGitIdentity(workspace) {
  const name = runGit({
    cwd: workspace,
    args: ["config", "--get", "user.name"],
  });
  const email = runGit({
    cwd: workspace,
    args: ["config", "--get", "user.email"],
  });

  if (!name || !email) {
    throw new Error("Sandbox workspace must have git user.name and user.email configured.");
  }
}

function commitIfChanged({ workspace, message }) {
  const status = runGit({
    cwd: workspace,
    args: ["status", "--short"],
  });

  if (!status) {
    return false;
  }

  runGit({
    cwd: workspace,
    args: ["add", ".workflow-v2", "docs/workpacks", "smoke"],
  });
  runGit({
    cwd: workspace,
    args: ["commit", "-m", message],
  });
  return true;
}

function ensureSeedOnMaster({ workspace, sandboxRepo, workItemId, ghBin }) {
  runGh({
    ghBin,
    cwd: workspace,
    args: ["auth", "status"],
  });
  runGit({
    cwd: workspace,
    args: ["checkout", "master"],
  });
  runGit({
    cwd: workspace,
    args: ["pull", "--ff-only", "origin", "master"],
  });

  seedControlPlaneSmokeWorkspace({
    rootDir: workspace,
    workItemId,
    sandboxRepo,
  });

  const committed = commitIfChanged({
    workspace,
    message: `docs(workflow-v2): seed ${workItemId} control-plane smoke`,
  });

  if (committed) {
    runGit({
      cwd: workspace,
      args: ["push", "origin", "master"],
    });
  }

  return {
    seeded: committed,
  };
}

function runtimeExists(workspace, workItemId) {
  return existsSync(join(workspace, ".opencode", "omo-runtime", `${workItemId}.json`));
}

function readRuntime(workspace, workItemId) {
  return readRuntimeState({
    rootDir: workspace,
    workItemId,
    slice: workItemId,
  }).state;
}

function inducePostMergeDrift({ workspace, workItemId }) {
  const roadmapPath = join(workspace, "docs", "workpacks", "README.md");
  const workpackPath = join(workspace, "docs", "workpacks", workItemId, "README.md");
  const roadmap = readFileSync(roadmapPath, "utf8").replace(
    `| \`${workItemId}\` | merged |`,
    `| \`${workItemId}\` | in-progress |`,
  );
  const workpack = readFileSync(workpackPath, "utf8")
    .replace("- [ ] 리뷰 대기 (pending-review)", "- [x] 리뷰 대기 (pending-review)")
    .replace("- [x] 확정 (confirmed)", "- [ ] 확정 (confirmed)");

  writeFileSync(roadmapPath, roadmap);
  writeFileSync(workpackPath, workpack);

  const committed = commitIfChanged({
    workspace,
    message: `docs(workpacks): induce ${workItemId} closeout drift for smoke`,
  });

  if (committed) {
    runGit({
      cwd: workspace,
      args: ["push", "origin", "master"],
    });
  }

  return committed;
}

function runSupervisorCycle({
  workspace,
  workItemId,
  artifactBaseDir,
  ghBin,
  liveProviders = false,
  claudeProvider,
  claudeBin,
  claudeModel,
  claudeEffort,
  opencodeBin,
  homeDir,
}) {
  const stageRunner = liveProviders
    ? createLiveProviderControlPlaneSmokeStageRunner({
        rootDir: workspace,
        artifactBaseDir,
        workItemId,
        claudeProvider,
        claudeBin,
        claudeModel,
        claudeEffort,
        opencodeBin,
        homeDir,
      })
    : createControlPlaneSmokeStageRunner({
        rootDir: workspace,
        artifactBaseDir,
        workItemId,
      });

  if (!runtimeExists(workspace, workItemId)) {
    return superviseWorkItem(
      {
        rootDir: workspace,
        workItemId,
        ghBin,
        now: new Date().toISOString(),
        maxTransitions: 16,
      },
      {
        stageRunner,
      },
    );
  }

  return tickSupervisorWorkItems(
    {
      rootDir: workspace,
      workItemId,
      ghBin,
      now: new Date().toISOString(),
      maxTransitions: 16,
    },
    {
      stageRunner,
    },
  )[0];
}

function maybeRunCloseoutSmoke({ workspace, workItemId, ghBin, checkpoints }) {
  if (!checkpoints.finalAutonomousMergeReached || checkpoints.closeoutPrCreated) {
    return null;
  }

  const runtime = readRuntime(workspace, workItemId);
  if (runtime.phase !== "done") {
    return null;
  }

  const induced = inducePostMergeDrift({
    workspace,
    workItemId,
  });

  if (!induced) {
    return {
      action: "noop",
      reason: "closeout_drift_already_present_or_not_needed",
    };
  }

  return reconcileWorkItemBookkeeping({
    rootDir: workspace,
    workItemId,
    ghBin,
    now: new Date().toISOString(),
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    process.exit(0);
  }

  if (!options.sandboxRepo) {
    throw new Error("--sandbox-repo is required.");
  }

  const sandboxRepo = assertSafeSandboxRepoRef(options.sandboxRepo);
  const ghBin = options.ghBin ?? "gh";
  const artifactBaseDir =
    options.artifactBaseDir ??
    mkdtempSync(join(tmpdir(), "omo-control-plane-smoke-"));
  const workspace = options.workspace ?? join(artifactBaseDir, "repo");

  const workspaceInfo = ensureSandboxWorkspace({
    sandboxRepo,
    workspace,
    ghBin,
  });
  ensureGitIdentity(workspaceInfo.workspace);
  const seed = ensureSeedOnMaster({
    workspace: workspaceInfo.workspace,
    sandboxRepo,
    workItemId: options.workItem,
    ghBin,
  });
  const cycle = runSupervisorCycle({
    workspace: workspaceInfo.workspace,
    workItemId: options.workItem,
    artifactBaseDir,
    ghBin,
    liveProviders: options.liveProviders,
    claudeProvider: assertSupportedClaudeProvider(options.claudeProvider),
    claudeBin: options.claudeBin,
    claudeModel: options.claudeModel,
    claudeEffort: options.claudeEffort,
    opencodeBin: options.opencodeBin,
    homeDir: options.homeDir,
  });
  const runtime = readRuntime(workspaceInfo.workspace, options.workItem);
  const smokeState = readControlPlaneSmokeState({
    rootDir: workspaceInfo.workspace,
    workItemId: options.workItem,
  });
  const checkpoints = collectControlPlaneSmokeCheckpoints({
    runtime,
    smokeState,
  });
  const closeout = maybeRunCloseoutSmoke({
    workspace: workspaceInfo.workspace,
    workItemId: options.workItem,
    ghBin,
    checkpoints,
  });
  const finalRuntime = runtimeExists(workspaceInfo.workspace, options.workItem)
    ? readRuntime(workspaceInfo.workspace, options.workItem)
    : runtime;
  const finalSmokeState = readControlPlaneSmokeState({
    rootDir: workspaceInfo.workspace,
    workItemId: options.workItem,
  });
  const finalCheckpoints = collectControlPlaneSmokeCheckpoints({
    runtime: finalRuntime,
    smokeState: finalSmokeState,
  });
  const result = {
    ok: true,
    sandboxRepo,
    workspace: workspaceInfo.workspace,
    artifactBaseDir,
    liveProviders: options.liveProviders,
    seeded: seed.seeded,
    cycle,
    checkpoints: finalCheckpoints,
    smokeState: finalSmokeState,
    closeout,
    nextStep: describeControlPlaneNextStep(finalRuntime.wait),
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(
    [
      `Control-plane smoke workspace: ${workspaceInfo.workspace}`,
      `Live providers mode: ${options.liveProviders ? "yes" : "no"}`,
      `Seeded master baseline: ${seed.seeded ? "yes" : "no"}`,
      `Docs PR created: ${finalCheckpoints.docsPrCreated ? "yes" : "no"}`,
      `Docs merged: ${finalCheckpoints.docsMerged ? "yes" : "no"}`,
      `Backend PR created: ${finalCheckpoints.backendPrCreated ? "yes" : "no"}`,
      `Backend iterative review loop validated: ${finalCheckpoints.backendIterativeReviewLoopValidated ? "yes" : "no"}`,
      `Backend review loop validated: ${finalCheckpoints.backendReviewLoopValidated ? "yes" : "no"}`,
      `Backend live provider loop validated: ${finalCheckpoints.backendLiveProviderLoopValidated ? "yes" : "no"}`,
      `Frontend review loop validated: ${finalCheckpoints.frontendReviewLoopValidated ? "yes" : "no"}`,
      `All review loops validated: ${finalCheckpoints.reviewLoopsValidated ? "yes" : "no"}`,
      `Reached backend merge gate: ${finalCheckpoints.backendMergeGateReached ? "yes" : "no"}`,
      `Reached final autonomous merge: ${finalCheckpoints.finalAutonomousMergeReached ? "yes" : "no"}`,
      `Closeout PR created: ${finalCheckpoints.closeoutPrCreated ? "yes" : "no"}`,
      `Closeout finalized: ${finalCheckpoints.closeoutFinalized ? "yes" : "no"}`,
      `Next step: ${result.nextStep}`,
    ].join("\n") + "\n",
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
