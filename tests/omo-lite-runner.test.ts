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
    stageResult?: Record<string, unknown> | null;
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
  const stageResult =
    options?.stageResult === undefined
      ? {
          result: "done",
          summary_markdown: "Stage complete",
          pr: {
            title: "docs: fake slice",
            body_markdown: "## Summary\n- fake",
          },
          checks_run: [],
          next_route: "open_pr",
          decision: "approve",
          body_markdown: "## Review\n- approved",
          route_back_stage: null,
          approved_head_sha: "abc123",
        }
      : options.stageResult;

  writeFileSync(
    binPath,
    [
      "#!/bin/sh",
      "printf '%s\\n' \"$@\" > \"$FAKE_OPENCODE_ARGS_PATH\"",
      stageResult
        ? [
            "cat <<'EOF' > \"$OMO_STAGE_RESULT_PATH\"",
            JSON.stringify(stageResult, null, 2),
            "EOF",
          ].join("\n")
        : "",
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
    stageResult?: Record<string, unknown> | null;
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
  const stageResult =
    options?.stageResult === undefined
      ? {
          result: "done",
          summary_markdown: "Stage complete",
          pr: {
            title: "docs: fake slice",
            body_markdown: "## Summary\n- fake",
          },
          checks_run: [],
          next_route: "open_pr",
          decision: "approve",
          body_markdown: "## Review\n- approved",
          route_back_stage: null,
          approved_head_sha: "abc123",
        }
      : options.stageResult;
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
      stageResult
        ? [
            "cat <<'EOF' > \"$OMO_STAGE_RESULT_PATH\"",
            JSON.stringify(stageResult, null, 2),
            "EOF",
          ].join("\n")
        : "",
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

function seedStrictSlice(rootDir: string, slice = "02-discovery-filter") {
  mkdirSync(join(rootDir, "docs", "workpacks", slice), { recursive: true });
  writeFileSync(
    join(rootDir, "docs", "workpacks", slice, "README.md"),
    [
      `# ${slice}`,
      "",
      "## Delivery Checklist",
      "- [ ] 백엔드 계약 고정 <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->",
      "- [ ] UI 연결 <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(rootDir, "docs", "workpacks", slice, "acceptance.md"),
    [
      "# Acceptance Checklist",
      "",
      "## Happy Path",
      "- [ ] API 응답 형식이 { success, data, error }를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->",
      "- [ ] loading 상태가 있다 <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->",
      "",
      "## Automation Split",
      "",
      "### Manual Only",
      "- [ ] 실제 OAuth smoke",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(rootDir, "docs", "workpacks", slice, "automation-spec.json"),
    JSON.stringify(
      {
        slice_id: slice,
        execution_mode: "autonomous",
        risk_class: "medium",
        merge_policy: "conditional-auto",
        backend: {
          required_endpoints: [],
          invariants: [],
          verify_commands: [],
          required_test_targets: [],
        },
        frontend: {
          required_routes: [],
          required_states: [],
          playwright_projects: [],
          artifact_assertions: [],
        },
        external_smokes: ["true"],
        blocked_conditions: [],
        max_fix_rounds: {
          backend: 2,
          frontend: 2,
        },
      },
      null,
      2,
    ),
  );
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
    expect(prompt).toContain("\"result\"");
    expect(prompt).toContain("\"summary_markdown\"");
    expect(prompt).toContain("\"body_markdown\"");
    expect(prompt).toContain("\"checks_run\"");
    expect(prompt).toContain("\"pnpm verify:backend\"");
    expect(prompt).toContain("\"next_route\"");
    expect(prompt).toContain("valid stage result");
    expect(prompt).not.toContain("Draft PR");
    expect(prompt).not.toContain("green CI");
    expect(prompt).toContain("PR 제목/본문, summary_markdown, review body_markdown은 특별한 이유가 없으면 한국어로 작성하세요.");
    expect(prompt).toContain("\"body_markdown\": \"## Summary\\n- 변경 요약\"");
    expect(prompt).toContain(
      "Do not create, update, ready, review, or merge GitHub pull requests yourself",
    );
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

  it("wraps strict Stage 2 artifact-only prompts in $ralph mode", () => {
    const rootDir = createRunnerFixture();
    seedStrictSlice(rootDir);

    const result = runStageWithArtifacts({
      rootDir,
      slice: "02-discovery-filter",
      stage: 2,
      workItemId: "02-discovery-filter",
      mode: "artifact-only",
      now: "2026-04-04T10:00:00+09:00",
    });

    const prompt = readFileSync(join(result.artifactDir, "prompt.md"), "utf8");
    const metadata = JSON.parse(
      readFileSync(join(result.artifactDir, "run-metadata.json"), "utf8"),
    ) as {
      execution: {
        loop_mode: string;
        ralph_goal_ids: string[];
      };
    };

    expect(prompt).toContain("$ralph strict-stage-2");
    expect(prompt).toContain("delivery-backend-contract");
    expect(prompt).toContain("accept-api-envelope");
    expect(metadata.execution.loop_mode).toBe("ralph");
    expect(metadata.execution.ralph_goal_ids).toEqual([
      "delivery-backend-contract",
      "accept-api-envelope",
    ]);
  });

  it("includes prior review feedback in Stage 2 rerun prompts", () => {
    const rootDir = createRunnerFixture();
    mkdirSync(join(rootDir, ".opencode", "omo-runtime"), { recursive: true });

    writeFileSync(
      join(rootDir, ".opencode", "omo-runtime", "02-discovery-filter.json"),
      JSON.stringify(
        {
          slice: "02-discovery-filter",
          current_stage: 2,
          last_completed_stage: 2,
          blocked_stage: null,
          retry: null,
          wait: null,
          sessions: {
            claude_primary: {
              session_id: null,
              provider: null,
              agent: "athena",
              updated_at: null,
            },
            codex_primary: {
              session_id: "ses_codex_stage2",
              provider: "opencode",
              agent: "hephaestus",
              updated_at: "2026-04-01T00:00:00.000Z",
            },
          },
          prs: {
            docs: null,
            backend: {
              number: 99,
              url: "https://github.com/netsus/homecook/pull/99",
              draft: false,
              branch: "feature/be-02-discovery-filter",
              head_sha: "be123",
              updated_at: "2026-04-01T00:00:00.000Z",
            },
            frontend: null,
          },
          last_review: {
            backend: {
              decision: "request_changes",
              route_back_stage: 2,
              approved_head_sha: null,
              body_markdown: "테스트 계약을 더 엄격하게 고정해 주세요.",
              updated_at: "2026-04-01T00:00:00.000Z",
            },
            frontend: null,
          },
        },
        null,
        2,
      ),
    );

    const result = runStageWithArtifacts({
      rootDir,
      slice: "02-discovery-filter",
      stage: 2,
      workItemId: "02-discovery-filter",
      mode: "artifact-only",
      now: "2026-04-01T00:10:00+09:00",
    });

    const prompt = readFileSync(join(result.artifactDir, "prompt.md"), "utf8");

    expect(prompt).toContain("## Prior Review Feedback");
    expect(prompt).toContain("https://github.com/netsus/homecook/pull/99");
    expect(prompt).toContain("테스트 계약을 더 엄격하게 고정해 주세요.");
  });

  it("includes structured findings and required fix ids in Stage 4 rerun prompts", () => {
    const rootDir = createRunnerFixture();
    seedStrictSlice(rootDir);
    mkdirSync(join(rootDir, ".opencode", "omo-runtime"), { recursive: true });

    writeFileSync(
      join(rootDir, ".opencode", "omo-runtime", "02-discovery-filter.json"),
      JSON.stringify(
        {
          slice: "02-discovery-filter",
          current_stage: 4,
          last_completed_stage: 5,
          blocked_stage: null,
          retry: null,
          wait: null,
          sessions: {
            claude_primary: {
              session_id: "ses_claude_stage5",
              provider: "claude-cli",
              agent: null,
              updated_at: "2026-04-01T01:00:00.000Z",
            },
            codex_primary: {
              session_id: "ses_codex_stage4",
              provider: "opencode",
              agent: "hephaestus",
              updated_at: "2026-04-01T01:05:00.000Z",
            },
          },
          prs: {
            docs: null,
            backend: null,
            frontend: {
              number: 101,
              url: "https://github.com/netsus/homecook/pull/101",
              draft: false,
              branch: "feature/fe-02-discovery-filter",
              head_sha: "fe123",
              updated_at: "2026-04-01T01:05:00.000Z",
            },
          },
          last_review: {
            backend: null,
            frontend: {
              decision: "request_changes",
              route_back_stage: 4,
              approved_head_sha: null,
              body_markdown: "CTA 상태를 다시 맞춰 주세요.",
              findings: [
                {
                  file: "app/planner/page.tsx",
                  line_hint: 22,
                  severity: "major",
                  category: "logic",
                  issue: "Disabled CTA state is inconsistent.",
                  suggestion: "Use the same disabled treatment across all planner CTAs.",
                },
              ],
              reviewed_checklist_ids: ["delivery-ui-connection"],
              required_fix_ids: ["delivery-ui-connection"],
              waived_fix_ids: [],
              updated_at: "2026-04-01T01:00:00.000Z",
            },
          },
          last_rebuttal: {
            backend: null,
            frontend: {
              source_review_stage: 5,
              contested_fix_ids: ["delivery-ui-connection"],
              rebuttals: [
                {
                  fix_id: "delivery-ui-connection",
                  rationale_markdown: "CTA mismatch is intentional in temporary mode.",
                  evidence_refs: ["docs/workpacks/02-discovery-filter/README.md"],
                },
              ],
              updated_at: "2026-04-01T01:02:00.000Z",
            },
          },
        },
        null,
        2,
      ),
    );

    const result = runStageWithArtifacts({
      rootDir,
      slice: "02-discovery-filter",
      stage: 4,
      workItemId: "02-discovery-filter",
      mode: "artifact-only",
      now: "2026-04-01T01:10:00+09:00",
    });

    const prompt = readFileSync(join(result.artifactDir, "prompt.md"), "utf8");

    expect(prompt).toContain("## Prior Review Feedback");
    expect(prompt).toContain("https://github.com/netsus/homecook/pull/101");
    expect(prompt).toContain("CTA 상태를 다시 맞춰 주세요.");
    expect(prompt).toContain("## Structured Findings from Prior Review");
    expect(prompt).toContain("Disabled CTA state is inconsistent.");
    expect(prompt).toContain("## Required Checklist Fix IDs");
    expect(prompt).toContain("delivery-ui-connection");
    expect(prompt).toContain("## Latest Rebuttal Bundle");
    expect(prompt).toContain("CTA mismatch is intentional in temporary mode.");
    expect(prompt).not.toContain("$ralph strict-stage-4");
    expect(prompt).toContain("\"pnpm verify:frontend\"");
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
      agent: null,
      exitCode: 0,
      sessionId: "ses_codex_stage2",
    });

    const stdout = readFileSync(join(result.artifactDir, "opencode.stdout.log"), "utf8");
    const args = readFileSync(argsPath, "utf8");
    const metadata = JSON.parse(
      readFileSync(join(result.artifactDir, "run-metadata.json"), "utf8"),
    ) as {
      effectiveProviderSelection: {
        provider: string;
        model: string | null;
        variant: string | null;
        effort: string | null;
        source: string;
      };
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
          model: string | null;
          variant: string | null;
        };
      };
    };

    expect(stdout).toContain("\"sessionID\":\"ses_codex_stage2\"");
    expect(args).toContain("run");
    expect(args).toContain("--model");
    expect(args).toContain("openai/gpt-5.3-codex");
    expect(args).toContain("--variant");
    expect(args).toContain("high");
    expect(args).not.toContain("--agent");
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
    expect(metadata.effectiveProviderSelection).toMatchObject({
      provider: "opencode",
      model: "openai/gpt-5.3-codex",
      variant: "high",
      effort: null,
      source: "provider_config",
    });
    expect(runtime).toMatchObject({
      current_stage: 2,
      last_completed_stage: 2,
    });
    expect(runtime.sessions.codex_primary.session_id).toBe("ses_codex_stage2");
    expect(runtime.sessions.codex_primary).toMatchObject({
      model: "openai/gpt-5.3-codex",
      variant: "high",
    });
  });

  it("keeps Codex model and variant traceable in run metadata when reusing a stored session", () => {
    const rootDir = createRunnerFixture();
    const firstRun = createFakeOpencodeBin(rootDir, {
      sessionId: "ses_codex_traceable",
    });
    const resumedRun = createFakeOpencodeBin(rootDir, {
      sessionId: "ses_codex_traceable",
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
      now: "2026-03-26T21:10:00+09:00",
    });

    const result = runStageWithArtifacts({
      rootDir,
      slice: "02-discovery-filter",
      stage: 5,
      workItemId: "02-discovery-filter",
      mode: "execute",
      syncStatus: false,
      opencodeBin: resumedRun.binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: resumedRun.argsPath,
      },
      now: "2026-03-26T21:30:00+09:00",
    });

    const args = readFileSync(resumedRun.argsPath, "utf8");
    const metadata = JSON.parse(
      readFileSync(join(result.artifactDir, "run-metadata.json"), "utf8"),
    ) as {
      effectiveProviderSelection: {
        provider: string;
        model: string | null;
        variant: string | null;
        effort: string | null;
        source: string;
        sessionId: string | null;
      };
      storedSessionSelection: {
        model: string | null;
        variant: string | null;
      } | null;
      sessionBinding: { resumeMode: string; sessionId: string | null };
    };

    expect(args).toContain("--session");
    expect(args).toContain("ses_codex_traceable");
    expect(args).not.toContain("--model");
    expect(args).not.toContain("--variant");
    expect(metadata.sessionBinding).toMatchObject({
      resumeMode: "continue",
      sessionId: "ses_codex_traceable",
    });
    expect(metadata.storedSessionSelection).toMatchObject({
      model: "openai/gpt-5.3-codex",
      variant: "high",
    });
    expect(metadata.effectiveProviderSelection).toMatchObject({
      provider: "opencode",
      model: "openai/gpt-5.3-codex",
      variant: "high",
      effort: null,
      source: "stored_session_binding",
      sessionId: "ses_codex_traceable",
    });
  });

  it("executes Stage 4 through Claude and stores the session under claude_primary", () => {
    const rootDir = createRunnerFixture();
    const homeDir = createClaudeHomeDir();
    seedStrictSlice(rootDir, "03-recipe-like");
    const stage4 = createFakeClaudeBin(rootDir, homeDir, {
      sessionId: "ses_claude_stage4",
    });

    const result = runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "03-recipe-like",
      stage: 4,
      workItemId: "03-recipe-like",
      claudeBudgetState: "available",
      mode: "execute",
      claudeBin: stage4.binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: stage4.argsPath,
        FAKE_CLAUDE_STDIN_PATH: stage4.stdinPath,
      },
      now: "2026-03-26T21:25:00+09:00",
    });

    const runtime = JSON.parse(
      readFileSync(join(rootDir, ".opencode", "omo-runtime", "03-recipe-like.json"), "utf8"),
    ) as {
      sessions: {
        claude_primary: {
          session_id: string;
        };
      };
    };

    expect(result.execution).toMatchObject({
      provider: "claude-cli",
      sessionId: "ses_claude_stage4",
    });
    expect(runtime.sessions.claude_primary.session_id).toBe("ses_claude_stage4");
  });

  it("executes Stage 5 public review through Codex and final_authority_gate through Claude", () => {
    const rootDir = createRunnerFixture();
    const homeDir = createClaudeHomeDir();
    seedStrictSlice(rootDir, "06-recipe-to-planner");
    const stage5Public = createFakeOpencodeBin(rootDir, {
      sessionId: "ses_codex_stage5",
      stageResult: {
        decision: "approve",
        body_markdown: "public review approved",
        route_back_stage: null,
        approved_head_sha: "abc123",
        review_scope: {
          scope: "frontend",
          checklist_ids: ["delivery-ui"],
        },
        reviewed_checklist_ids: ["delivery-ui"],
        required_fix_ids: [],
        waived_fix_ids: [],
        authority_verdict: "pass",
        reviewed_screen_ids: ["RECIPE_DETAIL"],
        authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
        blocker_count: 0,
        major_count: 0,
        minor_count: 0,
      },
    });
    const stage5Authority = createFakeClaudeBin(rootDir, homeDir, {
      sessionId: "ses_claude_stage5_authority",
      stageResult: {
        decision: "approve",
        body_markdown: "final authority approved",
        route_back_stage: null,
        approved_head_sha: "abc123",
        review_scope: {
          scope: "frontend",
          checklist_ids: ["delivery-ui"],
        },
        reviewed_checklist_ids: ["delivery-ui"],
        required_fix_ids: [],
        waived_fix_ids: [],
        authority_verdict: "pass",
        reviewed_screen_ids: ["RECIPE_DETAIL"],
        authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
        blocker_count: 0,
        major_count: 0,
        minor_count: 0,
      },
    });

    const publicResult = runStageWithArtifacts({
      rootDir,
      slice: "06-recipe-to-planner",
      stage: 5,
      workItemId: "06-recipe-to-planner",
      mode: "execute",
      opencodeBin: stage5Public.binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: stage5Public.argsPath,
      },
      now: "2026-03-26T21:40:00+09:00",
    });
    const authorityResult = runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "06-recipe-to-planner",
      stage: 5,
      subphase: "final_authority_gate",
      workItemId: "06-recipe-to-planner",
      claudeBudgetState: "available",
      mode: "execute",
      claudeBin: stage5Authority.binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: stage5Authority.argsPath,
        FAKE_CLAUDE_STDIN_PATH: stage5Authority.stdinPath,
      },
      now: "2026-03-26T21:45:00+09:00",
    });

    expect(publicResult.execution).toMatchObject({
      provider: "opencode",
      sessionId: "ses_codex_stage5",
    });
    expect(authorityResult.execution).toMatchObject({
      provider: "claude-cli",
      sessionId: "ses_claude_stage5_authority",
    });
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
    const metadata = JSON.parse(
      readFileSync(join(result.artifactDir, "run-metadata.json"), "utf8"),
    ) as {
      effectiveProviderSelection: {
        provider: string;
        model: string | null;
        variant: string | null;
        effort: string | null;
        source: string;
      };
    };
    const runtime = JSON.parse(
      readFileSync(join(rootDir, ".opencode", "omo-runtime", "03-recipe-like.json"), "utf8"),
    ) as {
      current_stage: number;
      last_completed_stage: number;
      sessions: {
        claude_primary: {
          session_id: string;
          provider: string;
          model: string | null;
          effort: string | null;
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
    expect(args).toContain("--add-dir");
    expect(args).toContain(result.artifactDir);
    expect(args).not.toContain("--continue");
    expect(args).not.toContain("--agent");
    expect(stdin).toContain("# Homecook OMO-lite Stage Dispatch");
    expect(metadata.effectiveProviderSelection).toMatchObject({
      provider: "claude-cli",
      model: "sonnet",
      variant: null,
      effort: "high",
      source: "stored_session_binding",
    });
    expect(runtime).toMatchObject({
      current_stage: 3,
      last_completed_stage: 3,
    });
    expect(runtime.sessions.claude_primary).toMatchObject({
      session_id: "ses_claude_stage1",
      provider: "claude-cli",
      model: "sonnet",
      effort: "high",
    });
  });

  it("fails closed when Claude returns success but does not write stage-result.json", () => {
    const rootDir = createRunnerFixture();
    const homeDir = createClaudeHomeDir();
    const stage1 = createFakeClaudeBin(rootDir, homeDir, {
      sessionId: "ses_claude_missing_stage_result",
      stageResult: null,
      stdoutJson: {
        type: "result",
        subtype: "success",
        is_error: false,
        session_id: "ses_claude_missing_stage_result",
        result: "I need permission to write the requested files before I can finish this stage.",
        permission_denials: [
          {
            tool_name: "Bash",
            tool_input: {
              command: "mkdir -p docs/workpacks/04-recipe-save",
            },
          },
          {
            tool_name: "Write",
            tool_input: {
              file_path: "/tmp/fake/README.md",
            },
          },
        ],
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
      },
    });

    const result = runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "04-recipe-save",
      stage: 1,
      workItemId: "04-recipe-save",
      claudeBudgetState: "available",
      mode: "execute",
      claudeBin: stage1.binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: stage1.argsPath,
        FAKE_CLAUDE_STDIN_PATH: stage1.stdinPath,
      },
      now: "2026-03-27T09:28:11+09:00",
    });

    const runtime = JSON.parse(
      readFileSync(join(rootDir, ".opencode", "omo-runtime", "04-recipe-save.json"), "utf8"),
    ) as {
      current_stage: number;
      last_completed_stage: number;
      blocked_stage: number;
      retry: {
        reason: string | null;
      };
      sessions: {
        claude_primary: {
          session_id: string;
          provider: string;
        };
      };
    };

    expect(result.execution).toMatchObject({
      mode: "contract-violation",
      provider: "claude-cli",
      sessionId: "ses_claude_missing_stage_result",
    });
    expect(result.execution.reason).toContain("stage-result.json");
    expect(result.execution.reason).toContain("Bash");
    expect(result.execution.reason).toContain("Write");
    expect(result.stageResult).toBeNull();
    expect(runtime).toMatchObject({
      current_stage: 1,
      last_completed_stage: 0,
      blocked_stage: 1,
      retry: {
        reason: "contract_violation",
      },
    });
    expect(runtime.sessions.claude_primary).toMatchObject({
      session_id: "ses_claude_missing_stage_result",
      provider: "claude-cli",
    });
  });

  it("fails closed when Claude writes an invalid stage-result shape", () => {
    const rootDir = createRunnerFixture();
    const homeDir = createClaudeHomeDir();
    const stage1 = createFakeClaudeBin(rootDir, homeDir, {
      sessionId: "ses_claude_invalid_stage_result",
      stageResult: {
        status: "success",
        actor: "claude",
      },
    });

    const result = runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "04-recipe-save",
      stage: 1,
      workItemId: "04-recipe-save",
      claudeBudgetState: "available",
      mode: "execute",
      claudeBin: stage1.binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: stage1.argsPath,
        FAKE_CLAUDE_STDIN_PATH: stage1.stdinPath,
      },
      now: "2026-03-27T10:15:00+09:00",
    });

    expect(result.execution).toMatchObject({
      mode: "contract-violation",
      provider: "claude-cli",
      sessionId: "ses_claude_invalid_stage_result",
    });
    expect(result.execution.reason).toContain("stageResult.result must be a non-empty string");
    expect(result.stageResult).toMatchObject({
      status: "success",
      actor: "claude",
    });
  });

  it("schedules a retry instead of executing when Claude final_authority_gate is unavailable", () => {
    const rootDir = createRunnerFixture();
    const homeDir = createClaudeHomeDir();
    const finalAuthority = createFakeClaudeBin(rootDir, homeDir, {
      sessionId: "ses_claude_final_authority",
    });

    const result = runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "03-recipe-like",
      stage: 5,
      subphase: "final_authority_gate",
      workItemId: "03-recipe-like",
      claudeBudgetState: "unavailable",
      mode: "execute",
      syncStatus: false,
      claudeBin: finalAuthority.binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: finalAuthority.argsPath,
        FAKE_CLAUDE_STDIN_PATH: finalAuthority.stdinPath,
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
      subphase: "final_authority_gate",
    });
    expect(() => readFileSync(finalAuthority.argsPath, "utf8")).toThrow();
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

  it("does not silently create a new session when a stored Claude session cannot be continued", () => {
    const rootDir = createRunnerFixture();
    const homeDir = createClaudeHomeDir();
    const firstRun = createFakeClaudeBin(rootDir, homeDir, {
      sessionId: "ses_missing_after_stage1",
    });
    const failedContinue = createFakeClaudeBin(rootDir, homeDir, {
      exitCode: 9,
      stderr: "session not found",
      stdoutJson: null,
      transcriptSessionId: null,
      stageResult: null,
    });

    runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "02-discovery-filter",
      stage: 1,
      workItemId: "02-discovery-filter",
      claudeBudgetState: "available",
      mode: "execute",
      claudeBin: firstRun.binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: firstRun.argsPath,
        FAKE_CLAUDE_STDIN_PATH: firstRun.stdinPath,
      },
      now: "2026-03-26T21:15:00+09:00",
    });

    const result = runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "02-discovery-filter",
      stage: 3,
      workItemId: "02-discovery-filter",
      claudeBudgetState: "available",
      mode: "execute",
      syncStatus: false,
      claudeBin: failedContinue.binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: failedContinue.argsPath,
        FAKE_CLAUDE_STDIN_PATH: failedContinue.stdinPath,
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
    expect(readFileSync(failedContinue.argsPath, "utf8")).toContain("--resume");
    expect(readFileSync(failedContinue.argsPath, "utf8")).toContain("ses_missing_after_stage1");
    expect(runtime).toMatchObject({
      active_stage: 3,
      current_stage: 3,
      last_completed_stage: 1,
      blocked_stage: 3,
      retry: {
        reason: "session_unavailable",
      },
      phase: "escalated",
      next_action: "noop",
    });
  });

  it("falls back to the standard opencode install path when PATH does not expose the binary", () => {
    const rootDir = createRunnerFixture();
    const homeDir = mkdtempSync(join(tmpdir(), "omo-opencode-home-"));
    const opencodeDir = join(homeDir, ".opencode", "bin");
    const binPath = join(opencodeDir, "opencode");
    const argsPath = join(rootDir, "home-opencode.args.log");

    mkdirSync(opencodeDir, { recursive: true });
    writeFileSync(
      binPath,
      [
        "#!/bin/sh",
        "printf '%s\\n' \"$@\" > \"$FAKE_OPENCODE_ARGS_PATH\"",
        "cat <<'EOF' > \"$OMO_STAGE_RESULT_PATH\"",
        JSON.stringify(
          {
            result: "done",
            summary_markdown: "Stage complete",
            pr: {
              title: "feat: fake backend slice",
              body_markdown: "## Summary\n- fake",
            },
            checks_run: [],
            next_route: "open_pr",
          },
          null,
          2,
        ),
        "EOF",
        "printf '%s\\n' '{\"type\":\"step_start\",\"sessionID\":\"ses_home_opencode\",\"part\":{\"type\":\"step-start\"}}'",
        "printf '%s\\n' '{\"type\":\"step_finish\",\"sessionID\":\"ses_home_opencode\",\"part\":{\"type\":\"step-finish\",\"reason\":\"stop\"}}'",
        "exit 0",
      ].join("\n"),
    );
    chmodSync(binPath, 0o755);

    const result = runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "03-recipe-like",
      stage: 2,
      workItemId: "03-recipe-like",
      mode: "execute",
      environment: {
        HOME: homeDir,
        FAKE_OPENCODE_ARGS_PATH: argsPath,
      },
      now: "2026-03-27T00:05:00+09:00",
    });

    expect(result.execution).toMatchObject({
      mode: "execute",
      provider: "opencode",
      sessionId: "ses_home_opencode",
    });
    const args = readFileSync(argsPath, "utf8");
    expect(args).toContain("--model");
    expect(args).toContain("openai/gpt-5.3-codex");
    expect(args).toContain("--variant");
    expect(args).toContain("high");
    expect(args).not.toContain("--agent");
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
            checks_run: ["pnpm verify:backend"],
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

  it("keeps large opencode stdout within the expanded buffer and still parses the session", () => {
    const rootDir = createRunnerFixture();
    const binPath = join(rootDir, "fake-opencode-large-buffer.sh");
    const argsPath = join(rootDir, "fake-opencode-large-buffer.args.log");

    writeFileSync(
      binPath,
      [
        "#!/bin/sh",
        "printf '%s\\n' \"$@\" > \"$FAKE_OPENCODE_ARGS_PATH\"",
        "cat <<'EOF' > \"$OMO_STAGE_RESULT_PATH\"",
        JSON.stringify(
          {
            result: "done",
            summary_markdown: "Large stdout stage complete",
            pr: {
              title: "feat: planner backend",
              body_markdown: "## Summary\\n- planner",
            },
            checks_run: ["pnpm verify:backend"],
            next_route: "wait_for_ci",
          },
          null,
          2,
        ),
        "EOF",
        "node -e 'const payload = JSON.stringify({ type: \"text\", sessionID: \"ses_large_stdout\", part: { type: \"text\", text: \"x\".repeat(1024 * 1024 + 512) } }); process.stdout.write(payload + \"\\n\")'",
        "node -e 'process.stdout.write(JSON.stringify({ type: \"step_finish\", sessionID: \"ses_large_stdout\", part: { type: \"step-finish\", reason: \"stop\" } }) + \"\\n\")'",
        "exit 0",
      ].join("\n"),
    );
    chmodSync(binPath, 0o755);

    const result = runStageWithArtifacts({
      rootDir,
      slice: "05-planner-week-core",
      stage: 2,
      workItemId: "05-planner-week-core",
      mode: "execute",
      opencodeBin: binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: argsPath,
      },
      now: "2026-04-01T10:00:00+09:00",
    });

    expect(result.execution).toMatchObject({
      mode: "execute",
      provider: "opencode",
      sessionId: "ses_large_stdout",
    });
    expect(result.stageResult).toMatchObject({
      next_route: "wait_for_ci",
    });
  });

  it("streams very large opencode stdout without truncation and still parses the session", () => {
    const rootDir = createRunnerFixture();
    const binPath = join(rootDir, "fake-opencode-overflow.sh");
    const argsPath = join(rootDir, "fake-opencode-overflow.args.log");

    writeFileSync(
      binPath,
      [
        "#!/bin/sh",
        "printf '%s\\n' \"$@\" > \"$FAKE_OPENCODE_ARGS_PATH\"",
        "cat <<'EOF' > \"$OMO_STAGE_RESULT_PATH\"",
        JSON.stringify(
          {
            result: "done",
            summary_markdown: "Stage complete after large stdout",
            pr: {
              title: "feat: planner backend",
              body_markdown: "## Summary\\n- planner",
            },
            checks_run: ["pnpm verify:backend"],
            next_route: "wait_for_ci",
          },
          null,
          2,
        ),
        "EOF",
        "node -e 'const chunk = \"x\".repeat(1024 * 1024); for (let i = 0; i < 22; i += 1) { process.stdout.write(JSON.stringify({ type: \"text\", sessionID: \"ses_overflow\", part: { type: \"text\", text: chunk } }) + \"\\n\"); }'",
        "node -e 'process.stdout.write(JSON.stringify({ type: \"step_finish\", sessionID: \"ses_overflow\", part: { type: \"step-finish\", reason: \"stop\" } }) + \"\\n\")'",
        "exit 0",
      ].join("\n"),
    );
    chmodSync(binPath, 0o755);

    const result = runStageWithArtifacts({
      rootDir,
      slice: "05-planner-week-core",
      stage: 2,
      workItemId: "05-planner-week-core",
      mode: "execute",
      opencodeBin: binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: argsPath,
      },
      now: "2026-04-01T10:05:00+09:00",
    });

    expect(result.execution).toMatchObject({
      mode: "execute",
      provider: "opencode",
      sessionId: "ses_overflow",
    });
    expect(result.stageResult).toMatchObject({
      next_route: "wait_for_ci",
    });
    expect(readFileSync(join(result.artifactDir, "opencode.stdout.log"), "utf8").length).toBeGreaterThan(
      20 * 1024 * 1024,
    );
  });

  it("writes logs and records a process failure when opencode execution exits non-zero", () => {
    const rootDir = createRunnerFixture();
    const artifactDir = join(rootDir, ".artifacts", "failed-run");
    const { binPath } = createFakeOpencodeBin(rootDir, {
      exitCode: 7,
      stdout: ['{"type":"step_start","sessionID":"ses_failed_run","part":{"type":"step-start"}}'],
      stderr: "simulated failure",
    });

    const result = runStageWithArtifacts({
      rootDir,
      slice: "02-discovery-filter",
      stage: 2,
      mode: "execute",
      artifactDir,
      opencodeBin: binPath,
      now: "2026-03-26T21:30:00+09:00",
    });

    expect(result.execution).toMatchObject({
      mode: "process-failure",
      failureKind: "nonzero_exit",
      exitCode: 7,
      sessionId: "ses_failed_run",
    });
    expect(readFileSync(join(artifactDir, "opencode.stdout.log"), "utf8")).toContain(
      "\"sessionID\":\"ses_failed_run\"",
    );
    expect(readFileSync(join(artifactDir, "opencode.stderr.log"), "utf8")).toContain(
      "simulated failure",
    );
  });
});
