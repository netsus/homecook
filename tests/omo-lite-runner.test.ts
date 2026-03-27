import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { runStageWithArtifacts } from "../scripts/lib/omo-lite-runner.mjs";

let fakeOpencodeCounter = 0;
let fakeClaudeCounter = 0;

function createFakeOpencodeBin(
  rootDir: string,
  options?: {
    exitCode?: number;
    sessionId?: string;
    stdout?: string[];
    stderr?: string;
  },
) {
  fakeOpencodeCounter += 1;
  const suffix = String(fakeOpencodeCounter);
  const binPath = join(rootDir, `fake-opencode-${suffix}.sh`);
  const argsPath = join(rootDir, `fake-opencode-${suffix}.args.log`);
  const exitCode = options?.exitCode ?? 0;
  const sessionId = options?.sessionId ?? "ses_fake_runner";
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
  options?: {
    exitCode?: number;
    sessionId?: string | null;
    stdoutJson?: Record<string, unknown> | null;
    stderr?: string;
    transcriptSessionId?: string | null;
    transcriptLocation?: "projects" | "transcripts";
  },
) {
  fakeClaudeCounter += 1;
  const suffix = String(fakeClaudeCounter);
  const binPath = join(rootDir, `fake-claude-${suffix}.sh`);
  const argsPath = join(rootDir, `fake-claude-${suffix}.args.log`);
  const stdinPath = join(rootDir, `fake-claude-${suffix}.stdin.log`);
  const exitCode = options?.exitCode ?? 0;
  const sessionId = options?.sessionId ?? `ses_fake_claude_${suffix}`;
  const transcriptSessionId =
    options?.transcriptSessionId === undefined ? sessionId : options.transcriptSessionId;
  const transcriptLocation = options?.transcriptLocation ?? "projects";
  const stdoutJson =
    options?.stdoutJson === undefined
      ? {
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
        }
      : options.stdoutJson;
  const stderr = options?.stderr ?? "";
  const transcriptBlock =
    typeof transcriptSessionId === "string" && transcriptSessionId.length > 0
      ? [
          transcriptLocation === "projects"
            ? "mkdir -p \"$HOME/.claude/projects/-Users-test-homecook\""
            : "mkdir -p \"$HOME/.claude/transcripts\"",
          transcriptLocation === "projects"
            ? `cat <<'EOF' > "$HOME/.claude/projects/-Users-test-homecook/${transcriptSessionId}.jsonl"`
            : `cat <<'EOF' > "$HOME/.claude/transcripts/${transcriptSessionId}.jsonl"`,
          "{\"type\":\"user\",\"content\":\"hello\"}",
          "EOF",
        ].join("\n")
      : "";
  const stdoutBlock =
    stdoutJson === null
      ? ""
      : [
          "cat <<'EOF'",
          JSON.stringify(stdoutJson),
          "EOF",
        ].join("\n");

  writeFileSync(
    binPath,
    [
      "#!/bin/sh",
      "printf '%s\\n' \"$@\" > \"$FAKE_CLAUDE_ARGS_PATH\"",
      "cat > \"$FAKE_CLAUDE_STDIN_PATH\"",
      transcriptBlock,
      stdoutBlock,
      stderr.length > 0 ? `printf '%s\\n' '${stderr}' >&2` : "",
      `exit ${exitCode}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  chmodSync(binPath, 0o755);

  mkdirSync(join(homeDir, ".claude"), { recursive: true });

  return {
    binPath,
    argsPath,
    stdinPath,
  };
}

function createRunnerFixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "omo-lite-runner-"));

  mkdirSync(join(rootDir, ".artifacts"), { recursive: true });

  return rootDir;
}

function createClaudeHomeDir() {
  const homeDir = mkdtempSync(join(tmpdir(), "omo-lite-claude-home-"));
  mkdirSync(join(homeDir, ".claude", "transcripts"), { recursive: true });
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

describe("OMO-lite stage runner", () => {
  it("writes dispatch and prompt artifacts without executing opencode in artifact-only mode", () => {
    const rootDir = createRunnerFixture();

    const result = runStageWithArtifacts({
      rootDir,
      slice: "02-discovery-filter",
      stage: 2,
      mode: "artifact-only",
      now: "2026-03-26T21:00:00+09:00",
    });

    expect(result.execution.mode).toBe("artifact-only");
    expect(result.execution.executed).toBe(false);

    const dispatch = JSON.parse(
      readFileSync(join(result.artifactDir, "dispatch.json"), "utf8"),
    ) as Record<string, unknown>;
    const prompt = readFileSync(join(result.artifactDir, "prompt.md"), "utf8");
    const metadata = JSON.parse(
      readFileSync(join(result.artifactDir, "run-metadata.json"), "utf8"),
    ) as {
      actor: string;
      execution: { mode: string; executable: boolean };
      sessionBinding: { role: string; resumeMode: string };
    };

    expect(dispatch.actor).toBe("codex");
    expect(prompt).toContain("슬라이스 02-discovery-filter 2단계 진행");
    expect(prompt).toContain("feature/be-02-discovery-filter");
    expect(metadata.actor).toBe("codex");
    expect(metadata.execution).toMatchObject({
      mode: "artifact-only",
      executable: true,
    });
    expect(metadata.sessionBinding).toMatchObject({
      role: "codex_primary",
      resumeMode: "fresh",
    });
  });

  it("executes Codex stages through opencode run, captures the session id, and writes runtime state", () => {
    const rootDir = createRunnerFixture();
    const { binPath, argsPath } = createFakeOpencodeBin(rootDir, {
      sessionId: "ses_codex_stage2",
    });

    const result = runStageWithArtifacts({
      rootDir,
      slice: "02-discovery-filter",
      stage: 2,
      workItemId: "02-discovery-filter",
      mode: "execute",
      opencodeBin: binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: argsPath,
      },
      now: "2026-03-26T21:10:00+09:00",
    });

    expect(result.execution).toMatchObject({
      mode: "execute",
      executed: true,
      executable: true,
      agent: "hephaestus",
      exitCode: 0,
      sessionId: "ses_codex_stage2",
    });

    const stdout = readFileSync(join(result.artifactDir, "opencode.stdout.log"), "utf8");
    const args = readFileSync(argsPath, "utf8");
    const metadata = JSON.parse(
      readFileSync(join(result.artifactDir, "run-metadata.json"), "utf8"),
    ) as {
      execution: { mode: string; executed: boolean; exitCode: number; sessionId: string };
      sessionBinding: { role: string; resumeMode: string; sessionId: string | null };
    };
    const runtime = JSON.parse(
      readFileSync(join(rootDir, ".opencode", "omo-runtime", "02-discovery-filter.json"), "utf8"),
    ) as {
      current_stage: number;
      last_completed_stage: number;
      sessions: {
        codex_primary: {
          session_id: string;
        };
      };
    };

    expect(stdout).toContain("\"sessionID\":\"ses_codex_stage2\"");
    expect(args).toContain("run");
    expect(args).toContain("--agent");
    expect(args).toContain("hephaestus");
    expect(args).toContain("--dir");
    expect(args).toContain(rootDir);
    expect(metadata.execution).toMatchObject({
      mode: "execute",
      executed: true,
      exitCode: 0,
      sessionId: "ses_codex_stage2",
    });
    expect(metadata.sessionBinding).toMatchObject({
      role: "codex_primary",
      resumeMode: "fresh",
      sessionId: "ses_codex_stage2",
    });
    expect(runtime).toMatchObject({
      current_stage: 2,
      last_completed_stage: 2,
    });
    expect(runtime.sessions.codex_primary.session_id).toBe("ses_codex_stage2");
  });

  it("executes Claude stages through raw claude CLI, captures session_id, and reuses it with --resume", () => {
    const rootDir = createRunnerFixture();
    const homeDir = createClaudeHomeDir();
    const stage1 = createFakeClaudeBin(rootDir, homeDir, {
      sessionId: "ses_claude_stage1",
    });
    const stage3 = createFakeClaudeBin(rootDir, homeDir, {
      sessionId: "ses_claude_stage1",
    });

    runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "03-recipe-like",
      stage: 1,
      workItemId: "03-recipe-like",
      claudeBudgetState: "available",
      mode: "execute",
      claudeBin: stage1.binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: stage1.argsPath,
        FAKE_CLAUDE_STDIN_PATH: stage1.stdinPath,
      },
      now: "2026-03-26T21:12:00+09:00",
    });

    const result = runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "03-recipe-like",
      stage: 3,
      workItemId: "03-recipe-like",
      claudeBudgetState: "available",
      mode: "execute",
      claudeBin: stage3.binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: stage3.argsPath,
        FAKE_CLAUDE_STDIN_PATH: stage3.stdinPath,
      },
      now: "2026-03-26T21:18:00+09:00",
    });

    const args = readFileSync(stage3.argsPath, "utf8");
    const stdin = readFileSync(stage3.stdinPath, "utf8");
    const runtime = JSON.parse(
      readFileSync(join(rootDir, ".opencode", "omo-runtime", "03-recipe-like.json"), "utf8"),
    ) as {
      current_stage: number;
      last_completed_stage: number;
      sessions: {
        claude_primary: {
          session_id: string;
          provider: string;
        };
      };
    };

    expect(result.execution).toMatchObject({
      mode: "execute",
      executed: true,
      provider: "claude-cli",
      sessionId: "ses_claude_stage1",
    });
    expect(args).toContain("-p");
    expect(args).toContain("--output-format");
    expect(args).toContain("json");
    expect(args).toContain("--resume");
    expect(args).toContain("ses_claude_stage1");
    expect(args).toContain("--effort");
    expect(args).toContain("high");
    expect(args).toContain("--model");
    expect(args).toContain("sonnet");
    expect(args).not.toContain("--continue");
    expect(args).not.toContain("--agent");
    expect(stdin).toContain("# Homecook OMO-lite Stage Dispatch");
    expect(runtime).toMatchObject({
      current_stage: 3,
      last_completed_stage: 3,
    });
    expect(runtime.sessions.claude_primary.session_id).toBe("ses_claude_stage1");
    expect(runtime.sessions.claude_primary.provider).toBe("claude-cli");
  });

  it("schedules a retry instead of executing when a Claude-owned stage is unavailable", () => {
    const rootDir = createRunnerFixture();
    const { binPath, argsPath } = createFakeOpencodeBin(rootDir);

    const result = runStageWithArtifacts({
      rootDir,
      slice: "03-recipe-like",
      stage: 5,
      workItemId: "03-recipe-like",
      claudeBudgetState: "unavailable",
      mode: "execute",
      syncStatus: false,
      opencodeBin: binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: argsPath,
      },
      now: "2026-03-26T22:20:00+09:00",
    });

    const runtime = JSON.parse(
      readFileSync(join(rootDir, ".opencode", "omo-runtime", "03-recipe-like.json"), "utf8"),
    ) as {
      blocked_stage: number;
      retry: {
        at: string;
        reason: string;
        attempt_count: number;
      };
      last_artifact_dir: string;
    };

    expect(result.execution).toMatchObject({
      mode: "scheduled-retry",
      executed: false,
      executable: false,
      reason: "claude_budget_unavailable",
    });
    expect(() => readFileSync(argsPath, "utf8")).toThrow();
    expect(runtime).toMatchObject({
      blocked_stage: 5,
      retry: {
        reason: "claude_budget_unavailable",
        attempt_count: 1,
      },
      last_artifact_dir: result.artifactDir,
    });
    expect(runtime.retry.at).toBe("2026-03-26T18:20:00.000Z");
  });

  it("does not silently create a new session when a stored session cannot be continued", () => {
    const rootDir = createRunnerFixture();
    const firstRun = createFakeOpencodeBin(rootDir, {
      sessionId: "ses_missing_after_stage2",
    });
    const failedContinue = createFakeOpencodeBin(rootDir, {
      exitCode: 9,
      stderr: "session not found",
      stdout: [],
    });

    runStageWithArtifacts({
      rootDir,
      slice: "02-discovery-filter",
      stage: 2,
      workItemId: "02-discovery-filter",
      mode: "execute",
      opencodeBin: firstRun.binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: firstRun.argsPath,
      },
      now: "2026-03-26T21:15:00+09:00",
    });

    const result = runStageWithArtifacts({
      rootDir,
      slice: "02-discovery-filter",
      stage: 4,
      workItemId: "02-discovery-filter",
      mode: "execute",
      syncStatus: false,
      opencodeBin: failedContinue.binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: failedContinue.argsPath,
      },
      now: "2026-03-26T21:30:00+09:00",
    });

    const runtime = JSON.parse(
      readFileSync(join(rootDir, ".opencode", "omo-runtime", "02-discovery-filter.json"), "utf8"),
    ) as {
      blocked_stage: number;
      retry: {
        reason: string | null;
      };
    };

    expect(result.execution).toMatchObject({
      mode: "session-missing",
      executed: false,
      executable: false,
      reason: "stored session could not be continued",
    });
    expect(runtime).toMatchObject({
      blocked_stage: 4,
      retry: {
        reason: "session_unavailable",
      },
    });
  });

  it("falls back to the project transcript filename when Claude stdout omits session_id", () => {
    const rootDir = createRunnerFixture();
    const homeDir = createClaudeHomeDir();
    const stage1 = createFakeClaudeBin(rootDir, homeDir, {
      sessionId: null,
      transcriptSessionId: "ses_transcript_fallback",
      transcriptLocation: "projects",
      stdoutJson: {
        type: "result",
        subtype: "success",
        is_error: false,
        total_cost_usd: 0,
        usage: {
          input_tokens: 12,
          output_tokens: 34,
        },
        modelUsage: {
          "claude-sonnet-4-6": {
            inputTokens: 12,
            outputTokens: 34,
            costUSD: 0,
          },
        },
      },
    });

    const result = runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "03-recipe-like",
      stage: 1,
      workItemId: "03-recipe-like",
      claudeBudgetState: "available",
      mode: "execute",
      claudeBin: stage1.binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: stage1.argsPath,
        FAKE_CLAUDE_STDIN_PATH: stage1.stdinPath,
      },
      now: "2026-03-26T22:05:00+09:00",
    });

    const runtime = JSON.parse(
      readFileSync(join(rootDir, ".opencode", "omo-runtime", "03-recipe-like.json"), "utf8"),
    ) as {
      sessions: {
        claude_primary: {
          session_id: string;
          provider: string;
        };
      };
    };

    expect(result.execution).toMatchObject({
      sessionId: "ses_transcript_fallback",
      provider: "claude-cli",
    });
    expect(runtime.sessions.claude_primary).toMatchObject({
      session_id: "ses_transcript_fallback",
      provider: "claude-cli",
    });
  });

  it("still supports the legacy transcripts directory as a fallback source", () => {
    const rootDir = createRunnerFixture();
    const homeDir = createClaudeHomeDir();
    const stage1 = createFakeClaudeBin(rootDir, homeDir, {
      sessionId: null,
      transcriptSessionId: "ses_legacy_transcript_fallback",
      transcriptLocation: "transcripts",
      stdoutJson: {
        type: "result",
        subtype: "success",
        is_error: false,
        total_cost_usd: 0,
        usage: {
          input_tokens: 12,
          output_tokens: 34,
        },
        modelUsage: {
          "claude-sonnet-4-6": {
            inputTokens: 12,
            outputTokens: 34,
            costUSD: 0,
          },
        },
      },
    });

    const result = runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "03-recipe-like",
      stage: 1,
      workItemId: "03-recipe-like",
      claudeBudgetState: "available",
      mode: "execute",
      claudeBin: stage1.binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: stage1.argsPath,
        FAKE_CLAUDE_STDIN_PATH: stage1.stdinPath,
      },
      now: "2026-03-26T22:06:00+09:00",
    });

    expect(result.execution).toMatchObject({
      sessionId: "ses_legacy_transcript_fallback",
      provider: "claude-cli",
    });
  });

  it("allows an explicit opencode fallback for Claude-owned stages", () => {
    const rootDir = createRunnerFixture();
    const { binPath, argsPath } = createFakeOpencodeBin(rootDir, {
      sessionId: "ses_claude_opencode",
    });

    const result = runStageWithArtifacts({
      rootDir,
      slice: "03-recipe-like",
      stage: 1,
      workItemId: "03-recipe-like",
      claudeBudgetState: "available",
      mode: "execute",
      claudeProvider: "opencode",
      opencodeBin: binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: argsPath,
      },
      now: "2026-03-26T22:15:00+09:00",
    });

    const runtime = JSON.parse(
      readFileSync(join(rootDir, ".opencode", "omo-runtime", "03-recipe-like.json"), "utf8"),
    ) as {
      sessions: {
        claude_primary: {
          session_id: string;
          provider: string;
          agent: string;
        };
      };
    };

    expect(result.execution).toMatchObject({
      mode: "execute",
      provider: "opencode",
      agent: "athena",
      sessionId: "ses_claude_opencode",
    });
    expect(readFileSync(argsPath, "utf8")).toContain("--agent");
    expect(runtime.sessions.claude_primary).toMatchObject({
      session_id: "ses_claude_opencode",
      provider: "opencode",
      agent: "athena",
    });
  });

  it("loads a structured stage result artifact when opencode writes one", () => {
    const rootDir = createRunnerFixture();
    const stageResultPath = join(rootDir, "fake-stage-result.json");
    const { binPath } = createFakeOpencodeBin(rootDir, {
      sessionId: "ses_stage_result",
      stdout: [
        `{"type":"step_start","sessionID":"ses_stage_result","part":{"type":"step-start"}}`,
        `{"type":"text","sessionID":"ses_stage_result","part":{"type":"text","text":"OK"}}`,
        `{"type":"step_finish","sessionID":"ses_stage_result","part":{"type":"step-finish","reason":"stop"}}`,
      ],
    });

    writeFileSync(
      binPath,
      [
        "#!/bin/sh",
        "printf '%s\\n' \"$@\" > \"$FAKE_OPENCODE_ARGS_PATH\"",
        "cat <<'EOF' > \"$OMO_STAGE_RESULT_PATH\"",
        JSON.stringify(
          {
            result: "done",
            summary_markdown: "Stage 2 complete",
            pr: {
              title: "feat: backend slice",
              body_markdown: "## Summary\\n- backend",
            },
            checks_run: ["pnpm test:all"],
            next_route: "wait_for_ci",
          },
          null,
          2,
        ),
        "EOF",
        "printf '%s\\n' '{\"type\":\"step_start\",\"sessionID\":\"ses_stage_result\",\"part\":{\"type\":\"step-start\"}}'",
        "printf '%s\\n' '{\"type\":\"step_finish\",\"sessionID\":\"ses_stage_result\",\"part\":{\"type\":\"step-finish\",\"reason\":\"stop\"}}'",
        "exit 0",
      ].join("\n"),
    );
    chmodSync(binPath, 0o755);

    const result = runStageWithArtifacts({
      rootDir,
      slice: "03-recipe-like",
      stage: 2,
      workItemId: "03-recipe-like",
      mode: "execute",
      opencodeBin: binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: stageResultPath,
      },
      now: "2026-03-27T00:10:00+09:00",
    });

    expect(result.stageResult).toMatchObject({
      result: "done",
      summary_markdown: "Stage 2 complete",
      next_route: "wait_for_ci",
    });
    expect(result.stageResult?.pr).toMatchObject({
      title: "feat: backend slice",
    });
  });

  it("writes logs and throws when opencode execution exits non-zero", () => {
    const rootDir = createRunnerFixture();
    const artifactDir = join(rootDir, ".artifacts", "failed-run");
    const { binPath } = createFakeOpencodeBin(rootDir, {
      exitCode: 7,
      stdout: ['{"type":"step_start","sessionID":"ses_failed_run","part":{"type":"step-start"}}'],
      stderr: "simulated failure",
    });

    expect(() =>
      runStageWithArtifacts({
        rootDir,
        slice: "02-discovery-filter",
        stage: 2,
        mode: "execute",
        artifactDir,
        opencodeBin: binPath,
        now: "2026-03-26T21:30:00+09:00",
      }),
    ).toThrow(/exit code 7/);
    expect(readFileSync(join(artifactDir, "opencode.stdout.log"), "utf8")).toContain(
      "\"sessionID\":\"ses_failed_run\"",
    );
    expect(readFileSync(join(artifactDir, "opencode.stderr.log"), "utf8")).toContain(
      "simulated failure",
    );
  });
});
