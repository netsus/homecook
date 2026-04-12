import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  continueWorkItemSession,
  readWorkItemSessionStatus,
  resumePendingWorkItems,
  runWorkItemStage,
  startWorkItemSession,
} from "../scripts/lib/omo-session-orchestrator.mjs";

function createFakeOpencodeBin(
  rootDir: string,
  name: string,
  options?: {
    exitCode?: number;
    sessionId?: string;
    stdout?: string[];
    stderr?: string;
    stage?: number;
  },
) {
  const binPath = join(rootDir, `${name}.sh`);
  const argsPath = join(rootDir, `${name}.args.log`);
  const exitCode = options?.exitCode ?? 0;
  const sessionId = options?.sessionId ?? `ses_${name}`;
  const stage = options?.stage ?? Number(name.replace(/[^0-9]/g, ""));
  const stdout =
    options?.stdout ??
    [
      `{"type":"step_start","sessionID":"${sessionId}","part":{"type":"step-start"}}`,
      `{"type":"text","sessionID":"${sessionId}","part":{"type":"text","text":"OK"}}`,
      `{"type":"step_finish","sessionID":"${sessionId}","part":{"type":"step-finish","reason":"stop"}}`,
    ];
  const stderr = options?.stderr ?? "";

  writeFileSync(
    binPath,
    [
      "#!/bin/sh",
      "printf '%s\\n' \"$@\" > \"$FAKE_OPENCODE_ARGS_PATH\"",
      "if [ -n \"$OMO_STAGE_RESULT_PATH\" ]; then",
      "  mkdir -p \"$(dirname \"$OMO_STAGE_RESULT_PATH\")\"",
      "  cat <<'EOF' > \"$OMO_STAGE_RESULT_PATH\"",
      JSON.stringify(
        {
          result: "done",
          summary_markdown: `Stage ${stage} complete`,
          pr: {
            title: `feat: fake stage ${stage}`,
            body_markdown: "## Summary\n- fake",
          },
          checks_run: ["pnpm test:all"],
          next_route: stage === 1 ? "open_pr" : "wait_for_ci",
        },
        null,
        2,
      ),
      "EOF",
      "fi",
      ...stdout.map((line) => `printf '%s\\n' '${line}'`),
      stderr.length > 0 ? `printf '${stderr}\\n' >&2` : "",
      `exit ${exitCode}`,
    ].join("\n"),
  );
  chmodSync(binPath, 0o755);

  return {
    binPath,
    argsPath,
  };
}

function createFakeClaudeBin(
  rootDir: string,
  homeDir: string,
  name: string,
  options?: {
    exitCode?: number;
    sessionId?: string;
    stderr?: string;
    stage?: number;
  },
) {
  const binPath = join(rootDir, `${name}.sh`);
  const argsPath = join(rootDir, `${name}.args.log`);
  const stdinPath = join(rootDir, `${name}.stdin.log`);
  const exitCode = options?.exitCode ?? 0;
  const sessionId = options?.sessionId ?? `ses_${name}`;
  const stderr = options?.stderr ?? "";
  const stage = options?.stage ?? Number(name.replace(/[^0-9]/g, ""));
  const stageResult =
    [1, 2, 4].includes(stage)
      ? {
          result: "done",
          summary_markdown: `Stage ${stage} complete`,
          pr: {
            title: `feat: fake stage ${stage}`,
            body_markdown: "## Summary\n- fake",
          },
          checks_run: ["pnpm test:all"],
          next_route: stage === 1 ? "open_pr" : "wait_for_ci",
        }
      : {
          decision: "approve",
          body_markdown: `Stage ${stage} approved`,
          route_back_stage: null,
          approved_head_sha: sessionId.slice(0, 7),
        };

  writeFileSync(
    binPath,
    [
      "#!/bin/sh",
      "printf '%s\\n' \"$@\" > \"$FAKE_CLAUDE_ARGS_PATH\"",
      "cat > \"$FAKE_CLAUDE_STDIN_PATH\"",
      "mkdir -p \"$HOME/.claude/projects/-Users-test-homecook\"",
      "if [ -n \"$OMO_STAGE_RESULT_PATH\" ]; then",
      "  mkdir -p \"$(dirname \"$OMO_STAGE_RESULT_PATH\")\"",
      "  cat <<'EOF' > \"$OMO_STAGE_RESULT_PATH\"",
      JSON.stringify(stageResult, null, 2),
      "EOF",
      "fi",
      `cat <<'EOF' > "$HOME/.claude/projects/-Users-test-homecook/${sessionId}.jsonl"`,
      "{\"type\":\"user\",\"content\":\"hello\"}",
      "EOF",
      "cat <<'EOF'",
      JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        session_id: sessionId,
        total_cost_usd: 0,
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
        modelUsage: {
          "claude-sonnet-4-6": {
            inputTokens: 10,
            outputTokens: 20,
            costUSD: 0,
          },
        },
      }),
      "EOF",
      stderr.length > 0 ? `printf '%s\\n' '${stderr}' >&2` : "",
      `exit ${exitCode}`,
    ].join("\n"),
  );
  chmodSync(binPath, 0o755);
  mkdirSync(join(homeDir, ".claude", "projects", "-Users-test-homecook"), { recursive: true });

  return {
    binPath,
    argsPath,
    stdinPath,
  };
}

function seedProductWorkItem(rootDir: string, workItemId: string) {
  mkdirSync(join(rootDir, ".artifacts"), { recursive: true });
  mkdirSync(join(rootDir, ".workflow-v2", "work-items"), { recursive: true });
  mkdirSync(join(rootDir, "docs", "workpacks", workItemId), { recursive: true });

  writeFileSync(
    join(rootDir, "docs", "workpacks", workItemId, "README.md"),
    `# ${workItemId}\n`,
  );
  writeFileSync(
    join(rootDir, "docs", "workpacks", workItemId, "acceptance.md"),
    `# ${workItemId} acceptance\n`,
  );

  writeFileSync(
    join(rootDir, ".workflow-v2", "status.json"),
    JSON.stringify(
      {
        version: 1,
        project_profile: "homecook",
        updated_at: "2026-03-26T00:00:00+09:00",
        items: [],
      },
      null,
      2,
    ),
  );

  writeFileSync(
    join(rootDir, ".workflow-v2", "work-items", `${workItemId}.json`),
    JSON.stringify(
      {
        id: workItemId,
        title: "Recipe like slice",
        project_profile: "homecook",
        change_type: "product",
        surface: "fullstack",
        risk: "medium",
        preset: "vertical-slice-strict",
        goal: "Pilot the OMO session orchestrator on a product slice.",
        owners: {
          claude: "sparse-review-and-approval",
          codex: "implementation-and-integration",
          workers: ["testing"],
        },
        docs_refs: {
          source_of_truth: ["AGENTS.md"],
          governing_docs: ["docs/engineering/workflow-v2/omo-lite-supervisor-spec.md"],
        },
        workflow: {
          plan_loop: "recommended",
          review_loop: "required",
          external_smokes: [],
        },
        verification: {
          required_checks: ["pnpm validate:workflow-v2"],
          verify_commands: ["pnpm validate:workflow-v2"],
        },
        status: {
          lifecycle: "planned",
          approval_state: "not_started",
          verification_status: "pending",
        },
      },
      null,
      2,
    ),
  );
}

function createOrchestratorFixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "omo-session-orchestrator-"));

  seedProductWorkItem(rootDir, "03-recipe-like");

  return rootDir;
}

function createClaudeHomeDir() {
  const homeDir = mkdtempSync(join(tmpdir(), "omo-session-claude-home-"));
  mkdirSync(join(homeDir, ".claude", "projects", "-Users-test-homecook"), { recursive: true });
  writeFileSync(
    join(homeDir, ".claude", "settings.json"),
    JSON.stringify(
      {
        model: "sonnet",
        effortLevel: "high",
      },
      null,
      2,
    ),
  );
  return homeDir;
}

describe("OMO session orchestrator", () => {
  it("reuses the same Claude session across Stage 1/3/4 and the same Codex session across Stage 2/5/6", () => {
    const rootDir = createOrchestratorFixture();
    const homeDir = createClaudeHomeDir();
    const stage1 = createFakeClaudeBin(rootDir, homeDir, "stage1", {
      sessionId: "ses_claude_primary",
      stage: 1,
    });
    const stage2 = createFakeOpencodeBin(rootDir, "stage2", {
      sessionId: "ses_codex_primary",
      stage: 2,
    });
    const stage3 = createFakeClaudeBin(rootDir, homeDir, "stage3", {
      sessionId: "ses_claude_primary",
      stage: 3,
    });
    const stage4 = createFakeClaudeBin(rootDir, homeDir, "stage4", {
      sessionId: "ses_claude_primary",
      stage: 4,
    });
    const stage5 = createFakeOpencodeBin(rootDir, "stage5", {
      sessionId: "ses_codex_primary",
      stage: 5,
    });
    const stage6 = createFakeOpencodeBin(rootDir, "stage6", {
      sessionId: "ses_codex_primary",
      stage: 6,
    });

    const first = startWorkItemSession({
      rootDir,
      homeDir,
      workItemId: "03-recipe-like",
      claudeBudgetState: "available",
      mode: "execute",
      claudeBin: stage1.binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: stage1.argsPath,
        FAKE_CLAUDE_STDIN_PATH: stage1.stdinPath,
      },
      now: "2026-03-26T21:00:00+09:00",
    });
    const second = continueWorkItemSession({
      rootDir,
      workItemId: "03-recipe-like",
      mode: "execute",
      opencodeBin: stage2.binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: stage2.argsPath,
      },
      now: "2026-03-26T21:10:00+09:00",
    });
    const third = continueWorkItemSession({
      rootDir,
      homeDir,
      workItemId: "03-recipe-like",
      claudeBudgetState: "available",
      mode: "execute",
      claudeBin: stage3.binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: stage3.argsPath,
        FAKE_CLAUDE_STDIN_PATH: stage3.stdinPath,
      },
      now: "2026-03-26T21:20:00+09:00",
    });
    const fourth = continueWorkItemSession({
      rootDir,
      homeDir,
      workItemId: "03-recipe-like",
      claudeBudgetState: "available",
      mode: "execute",
      claudeBin: stage4.binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: stage4.argsPath,
        FAKE_CLAUDE_STDIN_PATH: stage4.stdinPath,
      },
      now: "2026-03-26T21:30:00+09:00",
    });
    const fifth = continueWorkItemSession({
      rootDir,
      workItemId: "03-recipe-like",
      mode: "execute",
      opencodeBin: stage5.binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: stage5.argsPath,
      },
      now: "2026-03-26T21:40:00+09:00",
    });
    const sixth = runWorkItemStage({
      rootDir,
      workItemId: "03-recipe-like",
      stage: 6,
      mode: "execute",
      opencodeBin: stage6.binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: stage6.argsPath,
      },
      now: "2026-03-26T21:50:00+09:00",
    });

    const stage3Args = readFileSync(stage3.argsPath, "utf8");
    const stage4Args = readFileSync(stage4.argsPath, "utf8");
    const stage5Args = readFileSync(stage5.argsPath, "utf8");
    const stage6Args = readFileSync(stage6.argsPath, "utf8");
    const status = readWorkItemSessionStatus({
      rootDir,
      workItemId: "03-recipe-like",
    });

    expect(first.stage).toBe(1);
    expect(second.stage).toBe(2);
    expect(third.stage).toBe(3);
    expect(fourth.stage).toBe(4);
    expect(fifth.stage).toBe(5);
    expect(sixth.stage).toBe(6);
    expect(stage3Args).toContain("--resume");
    expect(stage3Args).toContain("ses_claude_primary");
    expect(stage4Args).toContain("--resume");
    expect(stage4Args).toContain("ses_claude_primary");
    expect(stage5Args).toContain("--session");
    expect(stage5Args).toContain("ses_codex_primary");
    expect(stage6Args).toContain("--session");
    expect(stage6Args).toContain("ses_codex_primary");
    expect(status.runtime).toMatchObject({
      sessions: {
        claude_primary: {
          session_id: "ses_claude_primary",
          provider: "claude-cli",
        },
        codex_primary: {
          session_id: "ses_codex_primary",
          provider: "opencode",
        },
      },
    });
  }, 15_000);

  it("resumes due blocked stages from the stored Claude session", () => {
    const rootDir = createOrchestratorFixture();
    const homeDir = createClaudeHomeDir();
    const resumeRun = createFakeClaudeBin(rootDir, homeDir, "resume", {
      sessionId: "ses_claude_primary",
      stage: 3,
    });

    mkdirSync(join(rootDir, ".opencode", "omo-runtime"), { recursive: true });
    writeFileSync(
      join(rootDir, ".opencode", "omo-runtime", "03-recipe-like.json"),
      JSON.stringify(
        {
          version: 1,
          work_item_id: "03-recipe-like",
          slice: "03-recipe-like",
          repo_root: rootDir,
          current_stage: 3,
          last_completed_stage: 2,
          blocked_stage: 3,
          sessions: {
            claude_primary: {
              session_id: "ses_claude_primary",
              provider: "claude-cli",
              agent: "athena",
              updated_at: "2026-03-26T12:00:00.000Z",
            },
            codex_primary: {
              session_id: "ses_codex_primary",
              provider: "opencode",
              agent: "hephaestus",
              updated_at: "2026-03-26T11:00:00.000Z",
            },
          },
          retry: {
            at: "2026-03-26T17:00:00.000Z",
            reason: "claude_budget_unavailable",
            attempt_count: 1,
            max_attempts: 3,
          },
          last_artifact_dir: null,
          lock: null,
        },
        null,
        2,
      ),
    );

    const resumed = resumePendingWorkItems({
      rootDir,
      homeDir,
      claudeBudgetState: "available",
      mode: "execute",
      claudeBin: resumeRun.binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: resumeRun.argsPath,
        FAKE_CLAUDE_STDIN_PATH: resumeRun.stdinPath,
      },
      now: "2026-03-27T03:00:00+09:00",
    });
    const status = readWorkItemSessionStatus({
      rootDir,
      workItemId: "03-recipe-like",
    });
    const args = readFileSync(resumeRun.argsPath, "utf8");

    expect(resumed).toHaveLength(1);
    expect(resumed[0]).toMatchObject({
      workItemId: "03-recipe-like",
      stage: 3,
    });
    expect(args).toContain("--resume");
    expect(args).toContain("ses_claude_primary");
    expect(status.runtime).toMatchObject({
      current_stage: 3,
      last_completed_stage: 3,
      blocked_stage: null,
      retry: null,
    });
  });
});
