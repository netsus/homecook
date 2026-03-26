import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { runStageWithArtifacts } from "../scripts/lib/omo-lite-runner.mjs";

let fakeOpencodeCounter = 0;

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

function createRunnerFixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "omo-lite-runner-"));

  mkdirSync(join(rootDir, ".artifacts"), { recursive: true });

  return rootDir;
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

  it("reuses the stored Claude session id for follow-up reviewer stages", () => {
    const rootDir = createRunnerFixture();
    const stage1 = createFakeOpencodeBin(rootDir, {
      sessionId: "ses_claude_stage1",
    });
    const stage3 = createFakeOpencodeBin(rootDir, {
      sessionId: "ses_claude_stage1",
    });

    runStageWithArtifacts({
      rootDir,
      slice: "03-recipe-like",
      stage: 1,
      workItemId: "03-recipe-like",
      mode: "execute",
      opencodeBin: stage1.binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: stage1.argsPath,
      },
      now: "2026-03-26T21:12:00+09:00",
    });

    const result = runStageWithArtifacts({
      rootDir,
      slice: "03-recipe-like",
      stage: 3,
      workItemId: "03-recipe-like",
      mode: "execute",
      opencodeBin: stage3.binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: stage3.argsPath,
      },
      now: "2026-03-26T21:18:00+09:00",
    });

    const args = readFileSync(stage3.argsPath, "utf8");
    const runtime = JSON.parse(
      readFileSync(join(rootDir, ".opencode", "omo-runtime", "03-recipe-like.json"), "utf8"),
    ) as {
      current_stage: number;
      last_completed_stage: number;
      sessions: {
        claude_primary: {
          session_id: string;
        };
      };
    };

    expect(result.execution).toMatchObject({
      mode: "execute",
      executed: true,
      agent: "athena",
      sessionId: "ses_claude_stage1",
    });
    expect(args).toContain("--session");
    expect(args).toContain("ses_claude_stage1");
    expect(args).not.toContain("--agent");
    expect(runtime).toMatchObject({
      current_stage: 3,
      last_completed_stage: 3,
    });
    expect(runtime.sessions.claude_primary.session_id).toBe("ses_claude_stage1");
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
