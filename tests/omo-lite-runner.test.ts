import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
    sleepSeconds?: number;
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
      options?.sleepSeconds ? `sleep ${options.sleepSeconds}` : "",
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

function createCompactionResumeClaudeBin(
  rootDir: string,
  homeDir: string,
  options?: {
    priorSessionId?: string;
    resumedSessionId?: string;
    stageResult?: Record<string, unknown> | null;
  },
) {
  fakeClaudeCounter += 1;
  const suffix = String(fakeClaudeCounter);
  const binPath = join(rootDir, `fake-claude-compaction-${suffix}.sh`);
  const argsPath = join(rootDir, `fake-claude-compaction-${suffix}.args.log`);
  const stdinPath = join(rootDir, `fake-claude-compaction-${suffix}.stdin.log`);
  const priorSessionId = options?.priorSessionId ?? "ses_prior_compaction";
  const resumedSessionId = options?.resumedSessionId ?? `ses_compacted_${suffix}`;
  const stageResult =
    options?.stageResult === undefined
      ? {
          result: "done",
          summary_markdown: "Compacted resume complete",
          pr: {
            title: "docs: compacted resume",
            body_markdown: "## Summary\n- compacted",
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
      "printf '%s\\n' \"$@\" >> \"$FAKE_CLAUDE_ARGS_PATH\"",
      "printf -- '---stdin---\\n' >> \"$FAKE_CLAUDE_STDIN_PATH\"",
      "cat >> \"$FAKE_CLAUDE_STDIN_PATH\"",
      `if printf '%s\\n' \"$@\" | grep -q -- '--resume'; then`,
      `  if printf '%s\\n' \"$@\" | grep -q -- '${priorSessionId}'; then`,
      "    printf '%s\\n' 'session not found' >&2",
      "    exit 9",
      "  fi",
      "fi",
      [
        "cat <<'EOF' > \"$OMO_STAGE_RESULT_PATH\"",
        JSON.stringify(stageResult, null, 2),
        "EOF",
      ].join("\n"),
      "cat <<'EOF'",
      JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        session_id: resumedSessionId,
        total_cost_usd: 0,
        usage: {
          input_tokens: 11,
          output_tokens: 19,
        },
      }),
      "EOF",
      `mkdir -p "$HOME/.claude/projects/-Users-test-homecook"`,
      `cat <<'EOF' > "$HOME/.claude/projects/-Users-test-homecook/${resumedSessionId}.jsonl"`,
      "{\"type\":\"user\",\"content\":\"compacted\"}",
      "EOF",
      "exit 0",
    ].join("\n"),
  );
  chmodSync(binPath, 0o755);
  mkdirSync(join(homeDir, ".claude"), { recursive: true });

  return {
    binPath,
    argsPath,
    stdinPath,
  };
}

function createSchemaRepairingFakeClaudeBin(
  rootDir: string,
  homeDir: string,
  options?: {
    sessionId?: string;
  },
) {
  fakeClaudeCounter += 1;
  const suffix = String(fakeClaudeCounter);
  const binPath = join(rootDir, `fake-claude-repair-${suffix}.sh`);
  const argsPath = join(rootDir, `fake-claude-repair-${suffix}.args.log`);
  const stdinPath = join(rootDir, `fake-claude-repair-${suffix}.stdin.log`);
  const countPath = join(rootDir, `fake-claude-repair-${suffix}.count`);
  const sessionId = options?.sessionId ?? `ses_fake_claude_repair_${suffix}`;
  const validStageResult = {
    decision: "request_changes",
    body_markdown: "## Review\n- fix canonical slot validation coverage",
    route_back_stage: 2,
    approved_head_sha: null,
    review_scope: {
      scope: "backend",
      checklist_ids: ["accept-vitest-split"],
    },
    reviewed_checklist_ids: ["accept-vitest-split"],
    required_fix_ids: ["canonical-slot-missing-test"],
    waived_fix_ids: [],
    authority_verdict: null,
    reviewed_screen_ids: [],
    authority_report_paths: [],
    blocker_count: 0,
    major_count: 1,
    minor_count: 0,
    findings: [
      {
        file: "tests/meal-create-route.test.ts",
        line_hint: 362,
        severity: "major",
        category: "tests",
        issue: "canonical-slot-validation coverage missing",
        suggestion: "Add a 404 test for non-canonical planner slot names.",
      },
    ],
  };
  const invalidStageResult = {
    decision: "request_changes",
    body_markdown: "## Review\n- fix canonical slot validation coverage",
    route_back_stage: 2,
    approved_head_sha: null,
    reviewed_checklist_ids: ["accept-vitest-split"],
    required_fix_ids: [],
    waived_fix_ids: [],
    findings: validStageResult.findings,
    checklist_results: [
      {
        id: "accept-vitest-split",
        status: "fail",
      },
    ],
  };

  writeFileSync(
    binPath,
    [
      "#!/bin/sh",
      "count=0",
      "[ -f \"$FAKE_CLAUDE_COUNT_PATH\" ] && count=$(cat \"$FAKE_CLAUDE_COUNT_PATH\")",
      "count=$((count + 1))",
      "printf '%s' \"$count\" > \"$FAKE_CLAUDE_COUNT_PATH\"",
      "printf '%s\\n' \"$@\" >> \"$FAKE_CLAUDE_ARGS_PATH\"",
      "cat >> \"$FAKE_CLAUDE_STDIN_PATH\"",
      "printf '\\n---INVOCATION---\\n' >> \"$FAKE_CLAUDE_STDIN_PATH\"",
      "if [ \"$count\" -eq 1 ]; then",
      "cat <<'EOF' > \"$OMO_STAGE_RESULT_PATH\"",
      JSON.stringify(invalidStageResult, null, 2),
      "EOF",
      "else",
      "cat <<'EOF' > \"$OMO_STAGE_RESULT_PATH\"",
      JSON.stringify(validStageResult, null, 2),
      "EOF",
      "fi",
      "cat <<'EOF'",
      JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        session_id: sessionId,
      }),
      "EOF",
      "exit 0",
    ].join("\n"),
  );
  chmodSync(binPath, 0o755);
  mkdirSync(join(homeDir, ".claude"), { recursive: true });

  return {
    binPath,
    argsPath,
    stdinPath,
    countPath,
  };
}

function createMissingStageResultRepairingFakeClaudeBin(
  rootDir: string,
  homeDir: string,
  options?: {
    sessionId?: string;
  },
) {
  fakeClaudeCounter += 1;
  const suffix = String(fakeClaudeCounter);
  const binPath = join(rootDir, `fake-claude-missing-stage-result-${suffix}.sh`);
  const argsPath = join(rootDir, `fake-claude-missing-stage-result-${suffix}.args.log`);
  const stdinPath = join(rootDir, `fake-claude-missing-stage-result-${suffix}.stdin.log`);
  const countPath = join(rootDir, `fake-claude-missing-stage-result-${suffix}.count`);
  const sessionId = options?.sessionId ?? `ses_fake_claude_missing_stage_result_${suffix}`;
  const validStageResult = {
    result: "done",
    summary_markdown: "Stage 1 repaired and completed",
    commit: {
      subject: "docs: repair stage1 bootstrap",
      body_markdown: "repair pass",
    },
    pr: {
      title: "docs: repair stage1 bootstrap",
      body_markdown: "## Summary\n- repair pass",
    },
    checks_run: [],
    next_route: "open_pr",
    claimed_scope: {
      files: ["docs/workpacks/07-meal-manage/README.md"],
      endpoints: [],
      routes: [],
      states: [],
      invariants: [],
    },
    changed_files: ["docs/workpacks/07-meal-manage/README.md"],
    tests_touched: [],
    artifacts_written: [".artifacts/example.log"],
    checklist_updates: [],
    contested_fix_ids: [],
    rebuttals: [],
  };

  writeFileSync(
    binPath,
    [
      "#!/bin/sh",
      "count=0",
      "[ -f \"$FAKE_CLAUDE_COUNT_PATH\" ] && count=$(cat \"$FAKE_CLAUDE_COUNT_PATH\")",
      "count=$((count + 1))",
      "printf '%s' \"$count\" > \"$FAKE_CLAUDE_COUNT_PATH\"",
      "printf '%s\\n' \"$@\" >> \"$FAKE_CLAUDE_ARGS_PATH\"",
      "cat >> \"$FAKE_CLAUDE_STDIN_PATH\"",
      "printf '\\n---INVOCATION---\\n' >> \"$FAKE_CLAUDE_STDIN_PATH\"",
      "if [ \"$count\" -eq 1 ]; then",
      "  :",
      "else",
      "  cat <<'EOF' > \"$OMO_STAGE_RESULT_PATH\"",
      JSON.stringify(validStageResult, null, 2),
      "EOF",
      "fi",
      "cat <<'EOF'",
      JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        session_id: sessionId,
      }),
      "EOF",
      "exit 0",
    ].join("\n"),
  );
  chmodSync(binPath, 0o755);
  mkdirSync(join(homeDir, ".claude"), { recursive: true });

  return {
    binPath,
    argsPath,
    stdinPath,
    countPath,
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
              reviewed_checklist_ids: [
                "delivery-backend-contract",
                "accept-api-envelope",
              ],
              required_fix_ids: ["accept-api-envelope"],
              waived_fix_ids: [],
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
    expect(prompt).toContain("## Review-Fix Snapshot Rules");
    expect(prompt).toContain("checklist_updates");
    expect(prompt).toContain("full snapshot");
  });

  it("merges the prior Stage 2 checklist snapshot during review-fix reruns", () => {
    const rootDir = createRunnerFixture();
    seedStrictSlice(rootDir);
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
              body_markdown: "accept-api-envelope fix만 보강해 주세요.",
              updated_at: "2026-04-01T00:00:00.000Z",
              reviewed_checklist_ids: [
                "delivery-backend-contract",
                "accept-api-envelope",
              ],
              required_fix_ids: ["accept-api-envelope"],
              waived_fix_ids: [],
            },
            frontend: null,
          },
        },
        null,
        2,
      ),
    );

    const priorStageResultPath = join(rootDir, ".artifacts", "prior-stage2", "stage-result.json");
    mkdirSync(join(rootDir, ".artifacts", "prior-stage2"), { recursive: true });
    writeFileSync(
      priorStageResultPath,
      `${JSON.stringify(
        {
          result: "done",
          summary_markdown: "prior stage 2",
          commit: {
            subject: "feat: prior",
            body_markdown: "prior",
          },
          pr: {
            title: "feat: prior",
            body_markdown: "## Summary\n- prior",
          },
          checks_run: ["pnpm verify:backend"],
          next_route: "open_pr",
          claimed_scope: {
            files: ["app/api/v1/recipes/[id]/like/route.ts"],
            endpoints: ["POST /api/v1/recipes/{id}/like"],
            routes: [],
            states: [],
            invariants: ["toggle-idempotency"],
          },
          changed_files: ["app/api/v1/recipes/[id]/like/route.ts"],
          tests_touched: ["tests/recipe-like.backend.test.ts"],
          artifacts_written: [".artifacts/example.log"],
          checklist_updates: [
            {
              id: "delivery-backend-contract",
              status: "checked",
              evidence_refs: ["app/api/v1/recipes/[id]/like/route.ts"],
            },
            {
              id: "accept-api-envelope",
              status: "checked",
              evidence_refs: ["tests/recipe-like.backend.test.ts"],
            },
          ],
          contested_fix_ids: [],
          rebuttals: [],
        },
        null,
        2,
      )}\n`,
    );

    const { binPath, argsPath } = createFakeOpencodeBin(rootDir, {
      sessionId: "ses_codex_stage2_fix",
      stageResult: {
        result: "done",
        summary_markdown: "fix envelope evidence",
        commit: {
          subject: "feat: tighten envelope check",
          body_markdown: "review fix",
        },
        pr: {
          title: "feat: tighten envelope check",
          body_markdown: "## Summary\n- review fix",
        },
        checks_run: ["pnpm verify:backend"],
        next_route: "open_pr",
        claimed_scope: {
          files: ["tests/recipe-like.backend.test.ts"],
          endpoints: ["POST /api/v1/recipes/{id}/like"],
          routes: [],
          states: [],
          invariants: ["toggle-idempotency"],
        },
        changed_files: ["tests/recipe-like.backend.test.ts"],
        tests_touched: ["tests/recipe-like.backend.test.ts"],
        artifacts_written: [".artifacts/example.log"],
        checklist_updates: [
          {
            id: "accept-api-envelope",
            status: "checked",
            evidence_refs: ["tests/recipe-like.backend.test.ts", "pnpm verify:backend"],
          },
        ],
        contested_fix_ids: [],
        rebuttals: [],
      },
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
      priorStageResultPath,
      now: "2026-04-01T00:20:00+09:00",
    });

    const stageResult = JSON.parse(readFileSync(join(result.artifactDir, "stage-result.json"), "utf8")) as {
      checklist_updates: Array<{ id: string }>;
    };

    expect(stageResult.checklist_updates.map((entry) => entry.id)).toEqual([
      "delivery-backend-contract",
      "accept-api-envelope",
    ]);
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
    expect(prompt).toContain("## Current Stage-Owned Checklist IDs");
    expect(prompt).toContain("currently still unchecked in workpack docs");
    expect(prompt).toContain("full current-stage snapshot");
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
          generation: number;
          run_count: number;
          last_usage: { input_tokens: number; output_tokens: number; total_tokens: number } | null;
          cumulative_usage: { input_tokens: number; output_tokens: number; total_tokens: number } | null;
          last_cost_usd: number | null;
          cumulative_cost_usd: number | null;
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
      generation: 1,
      run_count: 2,
      last_usage: {
        input_tokens: 10,
        output_tokens: 20,
        total_tokens: 30,
      },
      cumulative_usage: {
        input_tokens: 20,
        output_tokens: 40,
        total_tokens: 60,
      },
      last_cost_usd: 0,
      cumulative_cost_usd: 0,
    });
  });

  it("starts a fresh Claude session with rebase context when cumulative telemetry recommends rollover", () => {
    const rootDir = createRunnerFixture();
    const homeDir = createClaudeHomeDir();
    const stage1 = createFakeClaudeBin(rootDir, homeDir, {
      sessionId: "ses_claude_stage1",
    });
    const stage3 = createFakeClaudeBin(rootDir, homeDir, {
      sessionId: "ses_claude_stage3_rollover",
    });

    const firstResult = runStageWithArtifacts({
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

    const runtimePath = join(rootDir, ".opencode", "omo-runtime", "03-recipe-like.json");
    const runtimeBeforeRollover = JSON.parse(readFileSync(runtimePath, "utf8")) as {
      sessions: {
        claude_primary: {
          run_count: number;
          last_usage: { input_tokens: number; output_tokens: number; total_tokens: number } | null;
          cumulative_usage: { input_tokens: number; output_tokens: number; total_tokens: number } | null;
          last_cost_usd: number | null;
          cumulative_cost_usd: number | null;
        };
      };
    };
    runtimeBeforeRollover.sessions.claude_primary.run_count = 5;
    runtimeBeforeRollover.sessions.claude_primary.last_usage = {
      input_tokens: 12000,
      output_tokens: 6000,
      total_tokens: 18000,
    };
    runtimeBeforeRollover.sessions.claude_primary.cumulative_usage = {
      input_tokens: 70000,
      output_tokens: 40000,
      total_tokens: 110000,
    };
    runtimeBeforeRollover.sessions.claude_primary.last_cost_usd = 0.8;
    runtimeBeforeRollover.sessions.claude_primary.cumulative_cost_usd = 3.4;
    writeFileSync(runtimePath, `${JSON.stringify(runtimeBeforeRollover, null, 2)}\n`);

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
      sessionBinding: { resumeMode: string; sessionId: string | null };
    };
    const runtimeAfterRollover = JSON.parse(readFileSync(runtimePath, "utf8")) as {
      sessions: {
        claude_primary: {
          session_id: string;
          generation: number;
          run_count: number;
          cumulative_usage: { total_tokens: number } | null;
          cumulative_cost_usd: number | null;
        };
      };
    };

    expect(args).not.toContain("--resume");
    expect(stdin).toContain("## Session Rollover Rebase");
    expect(stdin).toContain("ses_claude_stage1");
    expect(stdin).toContain("run_count>=4");
    expect(stdin).toContain("Stage complete");
    expect(stdin).toContain(firstResult.artifactDir);
    expect(metadata.sessionBinding).toMatchObject({
      resumeMode: "rollover",
      sessionId: "ses_claude_stage3_rollover",
    });
    expect(runtimeAfterRollover.sessions.claude_primary).toMatchObject({
      session_id: "ses_claude_stage3_rollover",
      generation: 2,
      run_count: 1,
    });
    expect(runtimeAfterRollover.sessions.claude_primary.cumulative_usage?.total_tokens).toBe(30);
    expect(runtimeAfterRollover.sessions.claude_primary.cumulative_cost_usd).toBe(0);
  });

  it("starts a fresh Claude session after a single expensive run trips the cost-spike rollover guardrail", () => {
    const rootDir = createRunnerFixture();
    const homeDir = createClaudeHomeDir();
    const stage1 = createFakeClaudeBin(rootDir, homeDir, {
      sessionId: "ses_claude_stage1",
    });
    const stage3 = createFakeClaudeBin(rootDir, homeDir, {
      sessionId: "ses_claude_stage3_spike_rollover",
    });

    const firstResult = runStageWithArtifacts({
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

    const runtimePath = join(rootDir, ".opencode", "omo-runtime", "03-recipe-like.json");
    const runtimeBeforeRollover = JSON.parse(readFileSync(runtimePath, "utf8")) as {
      sessions: {
        claude_primary: {
          run_count: number;
          last_usage: { input_tokens: number; output_tokens: number; total_tokens: number } | null;
          cumulative_usage: { input_tokens: number; output_tokens: number; total_tokens: number } | null;
          last_cost_usd: number | null;
          cumulative_cost_usd: number | null;
        };
      };
    };
    runtimeBeforeRollover.sessions.claude_primary.run_count = 1;
    runtimeBeforeRollover.sessions.claude_primary.last_usage = {
      input_tokens: 22000,
      output_tokens: 13000,
      total_tokens: 35000,
    };
    runtimeBeforeRollover.sessions.claude_primary.cumulative_usage = {
      input_tokens: 22000,
      output_tokens: 13000,
      total_tokens: 35000,
    };
    runtimeBeforeRollover.sessions.claude_primary.last_cost_usd = 1.2;
    runtimeBeforeRollover.sessions.claude_primary.cumulative_cost_usd = 1.2;
    writeFileSync(runtimePath, `${JSON.stringify(runtimeBeforeRollover, null, 2)}\n`);

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
      sessionBinding: { resumeMode: string; sessionId: string | null };
    };
    const runtimeAfterRollover = JSON.parse(readFileSync(runtimePath, "utf8")) as {
      sessions: {
        claude_primary: {
          session_id: string;
          generation: number;
          run_count: number;
          cumulative_usage: { total_tokens: number } | null;
          cumulative_cost_usd: number | null;
        };
      };
    };

    expect(args).not.toContain("--resume");
    expect(stdin).toContain("## Session Rollover Rebase");
    expect(stdin).toContain("ses_claude_stage1");
    expect(stdin).toContain("last_run_tokens>=30000");
    expect(stdin).toContain(firstResult.artifactDir);
    expect(metadata.sessionBinding).toMatchObject({
      resumeMode: "rollover",
      sessionId: "ses_claude_stage3_spike_rollover",
    });
    expect(runtimeAfterRollover.sessions.claude_primary).toMatchObject({
      session_id: "ses_claude_stage3_spike_rollover",
      generation: 2,
      run_count: 1,
    });
    expect(runtimeAfterRollover.sessions.claude_primary.cumulative_usage?.total_tokens).toBe(30);
    expect(runtimeAfterRollover.sessions.claude_primary.cumulative_cost_usd).toBe(0);
  });

  it("keeps resuming the blocked stage session even when rollover is otherwise recommended", () => {
    const rootDir = createRunnerFixture();
    const homeDir = createClaudeHomeDir();
    const stage1 = createFakeClaudeBin(rootDir, homeDir, {
      sessionId: "ses_claude_stage1",
    });
    const resumedStage3 = createFakeClaudeBin(rootDir, homeDir, {
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

    const runtimePath = join(rootDir, ".opencode", "omo-runtime", "03-recipe-like.json");
    const runtimeBeforeResume = JSON.parse(readFileSync(runtimePath, "utf8")) as {
      active_stage: number;
      current_stage: number;
      blocked_stage: number | null;
      phase: string | null;
      next_action: string | null;
      retry: { reason: string | null; attempt_count: number };
      sessions: {
        claude_primary: {
          run_count: number;
          cumulative_usage: { input_tokens: number; output_tokens: number; total_tokens: number } | null;
          cumulative_cost_usd: number | null;
        };
      };
    };
    runtimeBeforeResume.active_stage = 3;
    runtimeBeforeResume.current_stage = 3;
    runtimeBeforeResume.blocked_stage = 3;
    runtimeBeforeResume.phase = "escalated";
    runtimeBeforeResume.next_action = "noop";
    runtimeBeforeResume.retry = {
      reason: "process_failure",
      attempt_count: 1,
    };
    runtimeBeforeResume.sessions.claude_primary.run_count = 5;
    runtimeBeforeResume.sessions.claude_primary.cumulative_usage = {
      input_tokens: 70000,
      output_tokens: 40000,
      total_tokens: 110000,
    };
    runtimeBeforeResume.sessions.claude_primary.cumulative_cost_usd = 3.4;
    writeFileSync(runtimePath, `${JSON.stringify(runtimeBeforeResume, null, 2)}\n`);

    const result = runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "03-recipe-like",
      stage: 3,
      workItemId: "03-recipe-like",
      claudeBudgetState: "available",
      mode: "execute",
      claudeBin: resumedStage3.binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: resumedStage3.argsPath,
        FAKE_CLAUDE_STDIN_PATH: resumedStage3.stdinPath,
      },
      now: "2026-03-26T21:18:00+09:00",
    });

    const args = readFileSync(resumedStage3.argsPath, "utf8");
    const stdin = readFileSync(resumedStage3.stdinPath, "utf8");
    const metadata = JSON.parse(
      readFileSync(join(result.artifactDir, "run-metadata.json"), "utf8"),
    ) as {
      sessionBinding: { resumeMode: string; sessionId: string | null };
    };

    expect(args).toContain("--resume");
    expect(args).toContain("ses_claude_stage1");
    expect(stdin).not.toContain("## Session Rollover Rebase");
    expect(metadata.sessionBinding).toMatchObject({
      resumeMode: "continue",
      sessionId: "ses_claude_stage1",
    });
  });

  it("falls back to a compacted fresh session when same-stage resume loses the stored Claude session", () => {
    const rootDir = createRunnerFixture();
    const homeDir = createClaudeHomeDir();
    const resumedStage3 = createCompactionResumeClaudeBin(rootDir, homeDir, {
      priorSessionId: "ses_stage3_missing",
      resumedSessionId: "ses_stage3_compacted",
    });
    const priorArtifactDir = join(
      rootDir,
      ".artifacts",
      "omo-lite-dispatch",
      "2026-03-26T21-10-00+09-00-03-recipe-like-stage-3",
    );
    mkdirSync(priorArtifactDir, { recursive: true });
    mkdirSync(join(rootDir, ".opencode", "omo-runtime"), { recursive: true });
    writeFileSync(join(priorArtifactDir, "prompt.md"), "# previous prompt\nresume stage 3\n");
    writeFileSync(join(priorArtifactDir, "claude.stdout.log"), "{\"type\":\"result\"}\n");
    writeFileSync(join(priorArtifactDir, "claude.stderr.log"), "session not found\n");

    writeFileSync(
      join(rootDir, ".opencode", "omo-runtime", "03-recipe-like.json"),
      JSON.stringify(
        {
          slice: "03-recipe-like",
          active_stage: 3,
          current_stage: 3,
          last_completed_stage: 1,
          blocked_stage: 3,
          last_artifact_dir: priorArtifactDir,
          phase: "escalated",
          next_action: "noop",
          retry: {
            reason: "session_unavailable",
            attempt_count: 1,
          },
          execution: {
            provider: "claude-cli",
            session_role: "claude_primary",
            session_id: "ses_stage3_missing",
            artifact_dir: priorArtifactDir,
            stage_result_path: join(priorArtifactDir, "stage-result.json"),
            started_at: "2026-03-26T12:10:00.000Z",
            finished_at: "2026-03-26T12:15:00.000Z",
            subphase: "implementation",
          },
          sessions: {
            claude_primary: {
              session_id: "ses_stage3_missing",
              provider: "claude-cli",
              model: "sonnet",
              effort: "high",
              generation: 1,
              run_count: 2,
              cumulative_usage: {
                input_tokens: 20,
                output_tokens: 40,
                total_tokens: 60,
              },
              cumulative_cost_usd: 0,
            },
            codex_primary: {
              session_id: null,
              provider: null,
            },
          },
        },
        null,
        2,
      ),
    );

    const result = runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "03-recipe-like",
      stage: 3,
      workItemId: "03-recipe-like",
      claudeBudgetState: "available",
      mode: "execute",
      syncStatus: false,
      claudeBin: resumedStage3.binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: resumedStage3.argsPath,
        FAKE_CLAUDE_STDIN_PATH: resumedStage3.stdinPath,
      },
      now: "2026-03-26T21:18:00+09:00",
    });

    const args = readFileSync(resumedStage3.argsPath, "utf8");
    const stdin = readFileSync(resumedStage3.stdinPath, "utf8");
    const runtime = JSON.parse(
      readFileSync(join(rootDir, ".opencode", "omo-runtime", "03-recipe-like.json"), "utf8"),
    ) as {
      sessions: {
        claude_primary: {
          session_id: string;
          generation: number;
          run_count: number;
        };
      };
    };
    const metadata = JSON.parse(
      readFileSync(join(result.artifactDir, "run-metadata.json"), "utf8"),
    ) as {
      sessionBinding: { resumeMode: string; sessionId: string | null };
      sessionCompactionResume: {
        previousSessionId: string;
        priorArtifactDir: string;
        priorPromptPath: string | null;
      } | null;
    };

    expect(result.execution).toMatchObject({
      mode: "execute",
      executed: true,
      sessionId: "ses_stage3_compacted",
    });
    expect(args).toContain("--resume");
    expect(args).toContain("ses_stage3_missing");
    expect(args).not.toContain("--resume\nses_stage3_compacted");
    expect(stdin).toContain("## Session Resume Compaction");
    expect(stdin).toContain("ses_stage3_missing");
    expect(stdin).toContain(priorArtifactDir);
    expect(stdin).toContain(join(priorArtifactDir, "prompt.md"));
    expect(metadata.sessionBinding).toMatchObject({
      resumeMode: "compacted_resume",
      sessionId: "ses_stage3_compacted",
    });
    expect(metadata.sessionCompactionResume).toMatchObject({
      previousSessionId: "ses_stage3_missing",
      priorArtifactDir,
      priorPromptPath: join(priorArtifactDir, "prompt.md"),
    });
    expect(runtime.sessions.claude_primary).toMatchObject({
      session_id: "ses_stage3_compacted",
      generation: 2,
      run_count: 1,
    });
  });

  it("reuses the Stage 1 Claude session for internal 1.5 doc_gate_repair", () => {
    const rootDir = createRunnerFixture();
    const homeDir = createClaudeHomeDir();
    seedStrictSlice(rootDir, "03-recipe-like");

    const stage1 = createFakeClaudeBin(rootDir, homeDir, {
      sessionId: "ses_claude_stage1",
      stageResult: {
        result: "done",
        summary_markdown: "Stage 1 complete",
        commit: {
          subject: "docs: stage1",
        },
        pr: {
          title: "docs: stage1",
          body_markdown: "## Summary\n- docs",
        },
        checks_run: [],
        next_route: "open_pr",
      },
    });
    const docGateRepair = createFakeClaudeBin(rootDir, homeDir, {
      sessionId: "ses_claude_stage1",
      stageResult: {
        result: "done",
        summary_markdown: "doc gate repaired",
        commit: {
          subject: "docs: repair",
        },
        pr: {
          title: "docs: repair",
          body_markdown: "## Summary\n- repair",
        },
        checks_run: [],
        next_route: "open_pr",
        claimed_scope: {
          files: ["docs/workpacks/03-recipe-like/README.md"],
          endpoints: [],
          routes: [],
          states: [],
          invariants: [],
        },
        changed_files: ["docs/workpacks/03-recipe-like/README.md"],
        tests_touched: [],
        artifacts_written: [".artifacts/doc-gate.log"],
        resolved_doc_finding_ids: ["doc-gate-finding-example"],
        contested_doc_fix_ids: [],
        rebuttals: [],
      },
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
      now: "2026-04-18T15:00:00+09:00",
    });

    runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "03-recipe-like",
      stage: 2,
      subphase: "doc_gate_repair",
      workItemId: "03-recipe-like",
      claudeBudgetState: "available",
      mode: "execute",
      claudeBin: docGateRepair.binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: docGateRepair.argsPath,
        FAKE_CLAUDE_STDIN_PATH: docGateRepair.stdinPath,
      },
      now: "2026-04-18T15:05:00+09:00",
    });

    const args = readFileSync(docGateRepair.argsPath, "utf8");
    expect(args).toContain("--resume");
    expect(args).toContain("ses_claude_stage1");
  });

  it("reuses the internal 1.5 Codex session for Stage 2 implementation after doc_gate_review", () => {
    const rootDir = createRunnerFixture();
    seedStrictSlice(rootDir, "03-recipe-like");

    const docGateReview = createFakeOpencodeBin(rootDir, {
      sessionId: "ses_codex_doc_gate",
      stageResult: {
        decision: "approve",
        body_markdown: "## Review\n- approved",
        route_back_stage: null,
        approved_head_sha: "abc123",
        review_scope: {
          scope: "doc_gate",
          checklist_ids: [],
        },
        reviewed_doc_finding_ids: [],
        required_doc_fix_ids: [],
        waived_doc_fix_ids: [],
        findings: [],
      },
    });
    const stage2 = createFakeOpencodeBin(rootDir, {
      sessionId: "ses_codex_doc_gate",
      stageResult: {
        result: "done",
        summary_markdown: "backend complete",
        commit: {
          subject: "feat: backend",
        },
        pr: {
          title: "feat: backend",
          body_markdown: "## Summary\n- backend",
        },
        checks_run: ["pnpm verify:backend"],
        next_route: "open_pr",
        claimed_scope: {
          files: ["app/api/v1/example/route.ts"],
          endpoints: ["POST /api/v1/example"],
          routes: [],
          states: [],
          invariants: [],
        },
        changed_files: ["app/api/v1/example/route.ts"],
        tests_touched: ["tests/example.backend.test.ts"],
        artifacts_written: [".artifacts/example.log"],
        checklist_updates: [
          {
            id: "delivery-backend-contract",
            status: "checked",
            evidence_refs: ["pnpm verify:backend"],
          },
          {
            id: "accept-api-envelope",
            status: "checked",
            evidence_refs: ["tests/example.backend.test.ts"],
          },
        ],
        contested_fix_ids: [],
        rebuttals: [],
      },
    });

    runStageWithArtifacts({
      rootDir,
      slice: "03-recipe-like",
      stage: 2,
      subphase: "doc_gate_review",
      workItemId: "03-recipe-like",
      mode: "execute",
      opencodeBin: docGateReview.binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: docGateReview.argsPath,
      },
      now: "2026-04-18T15:10:00+09:00",
    });

    runStageWithArtifacts({
      rootDir,
      slice: "03-recipe-like",
      stage: 2,
      workItemId: "03-recipe-like",
      mode: "execute",
      opencodeBin: stage2.binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: stage2.argsPath,
      },
      now: "2026-04-18T15:15:00+09:00",
    });

    const args = readFileSync(stage2.argsPath, "utf8");
    expect(args).toContain("--session");
    expect(args).toContain("ses_codex_doc_gate");
  });

  it("does not require code-stage checklist updates for Stage 2 doc_gate_review results", () => {
    const rootDir = createRunnerFixture();
    seedStrictSlice(rootDir, "03-recipe-like");

    const docGateReview = createFakeOpencodeBin(rootDir, {
      sessionId: "ses_codex_doc_gate_review_only",
      stageResult: {
        decision: "request_changes",
        body_markdown: "## Review\n- frontend-owned checklist metadata에 review=5가 필요합니다.",
        route_back_stage: 2,
        approved_head_sha: null,
        review_scope: {
          scope: "doc_gate",
          checklist_ids: [],
        },
        reviewed_doc_finding_ids: ["doc-gate-missing-review5-scope"],
        required_doc_fix_ids: ["doc-gate-missing-review5-scope"],
        waived_doc_fix_ids: [],
        findings: [
          {
            file: "docs/workpacks/03-recipe-like/README.md",
            line_hint: 1,
            severity: "major",
            category: "scope",
            issue: "Stage 5 review scope is empty for frontend-owned checklist items.",
            suggestion: "frontend checklist metadata에 review=5를 추가하세요.",
          },
        ],
      },
    });

    const result = runStageWithArtifacts({
      rootDir,
      slice: "03-recipe-like",
      stage: 2,
      subphase: "doc_gate_review",
      workItemId: "03-recipe-like",
      mode: "execute",
      opencodeBin: docGateReview.binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: docGateReview.argsPath,
      },
      now: "2026-04-24T15:00:00+09:00",
    });

    expect(result.execution.mode).toBe("execute");
    expect(result.stageResult).toMatchObject({
      decision: "request_changes",
      reviewed_doc_finding_ids: ["doc-gate-missing-review5-scope"],
      required_doc_fix_ids: ["doc-gate-missing-review5-scope"],
    });
  });

  it("writes OpenCode stage results through a worktree-local path and mirrors them to the artifact", () => {
    const rootDir = createRunnerFixture();
    seedStrictSlice(rootDir, "03-recipe-like");
    const executionDir = join(rootDir, ".worktrees", "03-recipe-like");
    const artifactDir = join(rootDir, ".artifacts", "external-opencode-stage");
    const agentStageResultPath = join(
      executionDir,
      ".opencode",
      "omo-stage-results",
      "external-opencode-stage",
      "stage-result.json",
    );
    const docGateReview = createFakeOpencodeBin(rootDir, {
      sessionId: "ses_codex_artifact_mirror",
      stageResult: {
        decision: "approve",
        body_markdown: "## Review\n- approved",
        route_back_stage: null,
        approved_head_sha: "docs123",
        review_scope: {
          scope: "doc_gate",
          checklist_ids: [],
        },
        reviewed_doc_finding_ids: [],
        required_doc_fix_ids: [],
        waived_doc_fix_ids: [],
        findings: [],
      },
    });

    const result = runStageWithArtifacts({
      rootDir,
      slice: "03-recipe-like",
      stage: 2,
      subphase: "doc_gate_review",
      workItemId: "03-recipe-like",
      mode: "execute",
      artifactDir,
      executionDir,
      opencodeBin: docGateReview.binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: docGateReview.argsPath,
      },
      now: "2026-04-25T18:00:00+09:00",
    });

    const args = readFileSync(docGateReview.argsPath, "utf8");
    expect(args).toContain(agentStageResultPath);
    expect(args).not.toContain(join(artifactDir, "stage-result.json"));
    expect(existsSync(agentStageResultPath)).toBe(false);
    expect(existsSync(join(artifactDir, "stage-result.json"))).toBe(true);
    expect(result.stageResult).toMatchObject({
      decision: "approve",
      approved_head_sha: "docs123",
    });
  });

  it("keeps doc gate missing-review fallback ids internally consistent", () => {
    const rootDir = createRunnerFixture();
    seedStrictSlice(rootDir, "03-recipe-like");
    const docGateReview = createFakeOpencodeBin(rootDir, {
      sessionId: "ses_codex_missing_doc_gate_review",
      stageResult: null,
    });

    const result = runStageWithArtifacts({
      rootDir,
      slice: "03-recipe-like",
      stage: 2,
      subphase: "doc_gate_review",
      workItemId: "03-recipe-like",
      mode: "execute",
      opencodeBin: docGateReview.binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: docGateReview.argsPath,
      },
      now: "2026-04-25T18:10:00+09:00",
    });

    expect(result.execution.mode).toBe("execute");
    expect(result.stageResult).toMatchObject({
      decision: "request_changes",
      reviewed_doc_finding_ids: ["auto-stage-result-recovery"],
      required_doc_fix_ids: ["auto-stage-result-recovery"],
    });
  });

  it("does not require code-stage checklist updates for Stage 2 doc_gate_repair results", () => {
    const rootDir = createRunnerFixture();
    const homeDir = createClaudeHomeDir();
    seedStrictSlice(rootDir, "03-recipe-like");

    const stage1 = createFakeClaudeBin(rootDir, homeDir, {
      sessionId: "ses_claude_stage1",
      stageResult: {
        result: "done",
        summary_markdown: "Stage 1 complete",
        commit: {
          subject: "docs: stage1",
        },
        pr: {
          title: "docs: stage1",
          body_markdown: "## Summary\n- docs",
        },
        checks_run: [],
        next_route: "open_pr",
      },
    });
    const docGateRepair = createFakeClaudeBin(rootDir, homeDir, {
      sessionId: "ses_claude_stage1",
      stageResult: {
        result: "done",
        summary_markdown: "doc gate repaired",
        commit: {
          subject: "docs: repair",
        },
        pr: {
          title: "docs: repair",
          body_markdown: "## Summary\n- repair",
        },
        checks_run: [],
        next_route: "open_pr",
        claimed_scope: {
          files: ["docs/workpacks/03-recipe-like/README.md"],
          endpoints: [],
          routes: [],
          states: [],
          invariants: [],
        },
        changed_files: ["docs/workpacks/03-recipe-like/README.md"],
        tests_touched: [],
        artifacts_written: [".artifacts/doc-gate.log"],
        resolved_doc_finding_ids: ["doc-gate-missing-review5-scope"],
        contested_doc_fix_ids: [],
        rebuttals: [],
      },
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
      now: "2026-04-24T15:05:00+09:00",
    });

    const result = runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "03-recipe-like",
      stage: 2,
      subphase: "doc_gate_repair",
      workItemId: "03-recipe-like",
      claudeBudgetState: "available",
      mode: "execute",
      claudeBin: docGateRepair.binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: docGateRepair.argsPath,
        FAKE_CLAUDE_STDIN_PATH: docGateRepair.stdinPath,
      },
      now: "2026-04-24T15:10:00+09:00",
    });

    expect(result.execution.mode).toBe("execute");
    expect(result.stageResult).toMatchObject({
      result: "done",
      resolved_doc_finding_ids: ["doc-gate-missing-review5-scope"],
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

  it("auto-repairs a missing Stage 1 stage-result through claude-cli", () => {
    const rootDir = createRunnerFixture();
    const homeDir = createClaudeHomeDir();
    seedStrictSlice(rootDir, "07-meal-manage");
    const { binPath, argsPath, stdinPath, countPath } = createMissingStageResultRepairingFakeClaudeBin(rootDir, homeDir, {
      sessionId: "ses_stage1_opencode_repair",
    });

    const result = runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "07-meal-manage",
      stage: 1,
      workItemId: "07-meal-manage",
      claudeBudgetState: "available",
      mode: "execute",
      claudeBin: binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: argsPath,
        FAKE_CLAUDE_STDIN_PATH: stdinPath,
        FAKE_CLAUDE_COUNT_PATH: countPath,
      },
      now: "2026-04-18T17:10:00+09:00",
    });

    const stageResult = result.stageResult as { result: string; summary_markdown: string } | null;
    const runtime = JSON.parse(
      readFileSync(join(rootDir, ".opencode", "omo-runtime", "07-meal-manage.json"), "utf8"),
    ) as {
      current_stage: number;
      last_completed_stage: number;
      blocked_stage: number | null;
      sessions: {
        claude_primary: {
          session_id: string;
          provider: string;
        };
      };
    };
    expect(result.execution.mode).toBe("execute");
    expect(result.execution.provider).toBe("claude-cli");
    expect(result.execution.sessionId).toBe("ses_stage1_opencode_repair");
    expect(existsSync(join(result.artifactDir, "schema-repair-pass-1", "prompt.md"))).toBe(true);
    expect(stageResult).toMatchObject({
      result: "done",
    });
    expect(stageResult?.summary_markdown).toContain("Stage 1 repaired");
    expect(runtime).toMatchObject({
      current_stage: 1,
      last_completed_stage: 1,
      blocked_stage: null,
      sessions: {
        claude_primary: {
          session_id: "ses_stage1_opencode_repair",
          provider: "claude-cli",
        },
      },
    });
  });

  it("seeds a recoverable fallback review result when Stage 5 writes no stage-result", () => {
    const rootDir = createRunnerFixture();
    seedStrictSlice(rootDir, "08b-meal-add-books-pantry");
    writeFileSync(
      join(rootDir, "docs", "workpacks", "08b-meal-add-books-pantry", "automation-spec.json"),
      JSON.stringify(
        {
          slice_id: "08b-meal-add-books-pantry",
          execution_mode: "autonomous",
          risk_class: "low",
          merge_policy: "conditional-auto",
          backend: {
            required_endpoints: ["POST /api/v1/meals"],
            invariants: ["owner-authorization"],
            verify_commands: ["pnpm verify:backend"],
            required_test_targets: ["tests/08b.backend.test.ts"],
          },
          frontend: {
            required_routes: ["/planner"],
            required_states: ["loading", "empty", "error", "unauthorized"],
            verify_commands: ["pnpm lint"],
            playwright_projects: ["mobile-chrome"],
            artifact_assertions: ["playwright-report"],
          },
          external_smokes: ["pnpm dev:local-supabase"],
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

    mkdirSync(join(rootDir, ".opencode", "omo-runtime"), { recursive: true });
    writeFileSync(
      join(rootDir, ".opencode", "omo-runtime", "08b-meal-add-books-pantry.json"),
      JSON.stringify(
        {
          slice: "08b-meal-add-books-pantry",
          current_stage: 5,
          last_completed_stage: 4,
          blocked_stage: null,
          retry: null,
          wait: null,
          sessions: {
            claude_primary: {
              session_id: "ses_claude_frontend",
              provider: "claude-cli",
              agent: "athena",
              updated_at: "2026-04-25T00:00:00.000Z",
            },
            codex_primary: {
              session_id: "ses_codex_stage5",
              provider: "opencode",
              agent: "hephaestus",
              updated_at: "2026-04-25T00:00:00.000Z",
            },
          },
          prs: {
            docs: null,
            backend: {
              number: 206,
              url: "https://github.com/netsus/homecook/pull/206",
              draft: false,
              branch: "feature/be-08b-meal-add-books-pantry",
              head_sha: "be123",
              updated_at: "2026-04-25T00:00:00.000Z",
            },
            frontend: {
              number: 207,
              url: "https://github.com/netsus/homecook/pull/207",
              draft: false,
              branch: "feature/fe-08b-meal-add-books-pantry",
              head_sha: "fe123",
              updated_at: "2026-04-25T00:00:00.000Z",
            },
          },
          last_review: {
            backend: null,
            frontend: null,
          },
          last_rebuttal: {
            backend: null,
            frontend: null,
          },
          workspace: {
            path: rootDir,
            branch_role: "frontend",
            updated_at: "2026-04-25T00:00:00.000Z",
          },
        },
        null,
        2,
      ),
    );

    const priorStageResultPath = join(rootDir, ".artifacts", "prior-stage4", "stage-result.json");
    mkdirSync(join(rootDir, ".artifacts", "prior-stage4"), { recursive: true });
    writeFileSync(
      priorStageResultPath,
      `${JSON.stringify(
        {
          result: "done",
          summary_markdown: "prior stage 4",
          commit: {
            subject: "feat: prior frontend",
            body_markdown: "prior",
          },
          pr: {
            title: "feat: prior frontend",
            body_markdown: "## Summary\n- prior",
          },
          checks_run: ["pnpm lint"],
          next_route: "open_pr",
          claimed_scope: {
            files: ["components/planner/menu-add-screen.tsx"],
            endpoints: [],
            routes: ["/menu-add"],
            states: ["loading", "empty", "error", "unauthorized"],
            invariants: [],
          },
          changed_files: ["components/planner/menu-add-screen.tsx"],
          tests_touched: ["tests/e2e/slice-08b-meal-add-books-pantry.spec.ts"],
          artifacts_written: [".artifacts/example.log"],
          checklist_updates: [
            {
              id: "delivery-ui-connection",
              status: "checked",
              evidence_refs: ["components/planner/menu-add-screen.tsx"],
            },
            {
              id: "delivery-test-split",
              status: "checked",
              evidence_refs: ["tests/e2e/slice-08b-meal-add-books-pantry.spec.ts"],
            },
            {
              id: "delivery-state-ui",
              status: "checked",
              evidence_refs: ["components/planner/recipe-book-selector.tsx"],
            },
            {
              id: "delivery-manual-qa-handoff",
              status: "checked",
              evidence_refs: ["docs/workpacks/08b-meal-add-books-pantry/README.md"],
            },
            {
              id: "accept-recipebook-to-meal",
              status: "checked",
              evidence_refs: ["tests/e2e/slice-08b-meal-add-books-pantry.spec.ts"],
            },
            {
              id: "accept-pantry-to-meal",
              status: "checked",
              evidence_refs: ["tests/e2e/slice-08b-meal-add-books-pantry.spec.ts"],
            },
            {
              id: "accept-loading",
              status: "checked",
              evidence_refs: ["components/planner/recipe-book-selector.tsx"],
            },
            {
              id: "accept-empty",
              status: "checked",
              evidence_refs: ["components/planner/pantry-match-picker.tsx"],
            },
            {
              id: "accept-error",
              status: "checked",
              evidence_refs: ["components/planner/pantry-match-picker.tsx"],
            },
            {
              id: "accept-unauthorized",
              status: "checked",
              evidence_refs: ["app/menu-add/page.tsx"],
            },
            {
              id: "accept-return-to-action",
              status: "checked",
              evidence_refs: ["app/menu-add/page.tsx"],
            },
            {
              id: "accept-playwright-recipebook-flow",
              status: "checked",
              evidence_refs: ["tests/e2e/slice-08b-meal-add-books-pantry.spec.ts"],
            },
            {
              id: "accept-playwright-pantry-flow",
              status: "checked",
              evidence_refs: ["tests/e2e/slice-08b-meal-add-books-pantry.spec.ts"],
            },
            {
              id: "accept-playwright-login-gate",
              status: "checked",
              evidence_refs: ["tests/e2e/slice-08b-meal-add-books-pantry.spec.ts"],
            },
            {
              id: "accept-playwright-empty",
              status: "checked",
              evidence_refs: ["tests/e2e/slice-08b-meal-add-books-pantry.spec.ts"],
            },
          ],
          contested_fix_ids: [],
          rebuttals: [],
        },
        null,
        2,
      )}\n`,
    );

    const { binPath, argsPath } = createFakeOpencodeBin(rootDir, {
      sessionId: "ses_codex_stage5",
      stageResult: null,
    });

    const result = runStageWithArtifacts({
      rootDir,
      slice: "08b-meal-add-books-pantry",
      stage: 5,
      workItemId: "08b-meal-add-books-pantry",
      mode: "execute",
      opencodeBin: binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: argsPath,
      },
      priorStageResultPath,
      now: "2026-04-25T09:10:00+09:00",
    });

    expect(result.execution.mode).toBe("execute");
    expect(result.stageResult).toMatchObject({
      decision: "request_changes",
      route_back_stage: 5,
      required_fix_ids: ["delivery-ui-connection"],
      authority_verdict: "conditional-pass",
      major_count: 1,
    });
    expect(existsSync(join(result.artifactDir, "schema-repair-pass-1", "prompt.md"))).toBe(true);
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

  it("treats Claude daily limit exits as retryable budget failures", () => {
    const rootDir = createRunnerFixture();
    const homeDir = createClaudeHomeDir();
    const limitedClaude = createFakeClaudeBin(rootDir, homeDir, {
      exitCode: 1,
      stdoutJson: {
        type: "result",
        subtype: "success",
        is_error: true,
        session_id: "ses_claude_daily_limit",
        result: "You've hit your limit · resets 12am (Asia/Seoul)",
      },
      stageResult: null,
    });

    const result = runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "03-recipe-like",
      stage: 1,
      workItemId: "03-recipe-like",
      mode: "execute",
      claudeBin: limitedClaude.binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: limitedClaude.argsPath,
        FAKE_CLAUDE_STDIN_PATH: limitedClaude.stdinPath,
      },
      now: "2026-04-13T23:54:00+09:00",
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
      sessions: {
        claude_primary: {
          session_id: string | null;
        };
      };
    };

    expect(result.execution).toMatchObject({
      mode: "scheduled-retry",
      executed: false,
      executable: false,
      reason: "claude_budget_unavailable",
      sessionId: "ses_claude_daily_limit",
    });
    expect(runtime).toMatchObject({
      blocked_stage: 1,
      retry: {
        at: "2026-04-13T15:00:00.000Z",
        reason: "claude_budget_unavailable",
        attempt_count: 1,
      },
    });
    expect(runtime.sessions.claude_primary.session_id).toBe("ses_claude_daily_limit");
  });

  it("parses Claude local reset times into retry.at instead of using the fixed 5 hour fallback", () => {
    const rootDir = createRunnerFixture();
    const homeDir = createClaudeHomeDir();
    const limitedClaude = createFakeClaudeBin(rootDir, homeDir, {
      exitCode: 1,
      stdoutJson: {
        type: "result",
        subtype: "success",
        is_error: true,
        session_id: "ses_claude_limit_4pm",
        result: "You've hit your limit · resets 4pm (Asia/Seoul)",
      },
      stageResult: null,
    });

    runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "03-recipe-like",
      stage: 4,
      workItemId: "03-recipe-like",
      mode: "execute",
      claudeBin: limitedClaude.binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: limitedClaude.argsPath,
        FAKE_CLAUDE_STDIN_PATH: limitedClaude.stdinPath,
      },
      now: "2026-04-15T15:37:47+09:00",
    });

    const runtime = JSON.parse(
      readFileSync(join(rootDir, ".opencode", "omo-runtime", "03-recipe-like.json"), "utf8"),
    ) as {
      retry: {
        at: string;
        reason: string;
      };
    };

    expect(runtime.retry).toMatchObject({
      at: "2026-04-15T07:00:00.000Z",
      reason: "claude_budget_unavailable",
    });
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

  it("strengthens review prompts and auto-repairs invalid Claude review stage-result JSON once", () => {
    const rootDir = createRunnerFixture();
    const homeDir = createClaudeHomeDir();
    seedStrictSlice(rootDir, "06-recipe-to-planner");
    const repairingClaude = createSchemaRepairingFakeClaudeBin(rootDir, homeDir, {
      sessionId: "ses_claude_repair_stage3",
    });

    const result = runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "06-recipe-to-planner",
      stage: 3,
      workItemId: "06-recipe-to-planner",
      claudeBudgetState: "available",
      mode: "execute",
      claudeBin: repairingClaude.binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: repairingClaude.argsPath,
        FAKE_CLAUDE_STDIN_PATH: repairingClaude.stdinPath,
        FAKE_CLAUDE_COUNT_PATH: repairingClaude.countPath,
      },
      now: "2026-04-14T13:56:06+09:00",
    });

    const stageResult = JSON.parse(readFileSync(join(result.artifactDir, "stage-result.json"), "utf8"));

    expect(result.prompt).toContain("## Review JSON Hard Rules");
    expect(result.prompt).toContain("checklist_results");
    expect(result.execution).toMatchObject({
      mode: "execute",
      sessionId: "ses_claude_repair_stage3",
    });
    expect(stageResult).toMatchObject({
      review_scope: {
        scope: "backend",
        checklist_ids: [
          "delivery-backend-contract",
          "accept-api-envelope",
        ],
      },
      required_fix_ids: ["canonical-slot-missing-test"],
    });
    expect(readFileSync(repairingClaude.countPath, "utf8")).toBe("2");
    expect(existsSync(join(result.artifactDir, "schema-repair-pass-1", "prompt.md"))).toBe(true);
  });

  it("normalizes Stage 3 review checklist coverage to the full contract snapshot", () => {
    const rootDir = createRunnerFixture();
    const homeDir = createClaudeHomeDir();
    seedStrictSlice(rootDir, "06-recipe-to-planner");
    const reviewClaude = createFakeClaudeBin(rootDir, homeDir, {
      sessionId: "ses_claude_stage3_partial_scope",
      stageResult: {
        decision: "approve",
        body_markdown: "## Review\n- approved",
        route_back_stage: null,
        approved_head_sha: "abc123",
        review_scope: {
          scope: "backend",
          checklist_ids: [
            "accept-api-envelope",
            "accept-idempotency",
          ],
        },
        reviewed_checklist_ids: [
          "accept-api-envelope",
          "accept-idempotency",
        ],
        required_fix_ids: [],
        waived_fix_ids: [],
        authority_verdict: null,
        reviewed_screen_ids: [],
        authority_report_paths: [],
        blocker_count: 0,
        major_count: 0,
        minor_count: 0,
        findings: [],
      },
    });

    const result = runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "06-recipe-to-planner",
      stage: 3,
      workItemId: "06-recipe-to-planner",
      claudeBudgetState: "available",
      mode: "execute",
      claudeBin: reviewClaude.binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: reviewClaude.argsPath,
        FAKE_CLAUDE_STDIN_PATH: reviewClaude.stdinPath,
      },
      now: "2026-04-14T15:17:09+09:00",
    });

    const stageResult = JSON.parse(readFileSync(join(result.artifactDir, "stage-result.json"), "utf8")) as {
      review_scope: { checklist_ids: string[] };
      reviewed_checklist_ids: string[];
    };

    expect(stageResult.review_scope.checklist_ids).toEqual([
      "delivery-backend-contract",
      "accept-api-envelope",
    ]);
    expect(stageResult.reviewed_checklist_ids).toEqual(stageResult.review_scope.checklist_ids);
  });

  it("normalizes Stage 5 authority verdict semantics when hold has no blockers", () => {
    const rootDir = createRunnerFixture();
    seedStrictSlice(rootDir, "06-recipe-to-planner");
    const workspacePath = join(rootDir, ".worktrees", "06-recipe-to-planner");
    mkdirSync(join(workspacePath, "docs", "workpacks", "06-recipe-to-planner"), { recursive: true });
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "06-recipe-to-planner", "README.md"),
      readFileSync(join(rootDir, "docs", "workpacks", "06-recipe-to-planner", "README.md"), "utf8"),
    );
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "06-recipe-to-planner", "acceptance.md"),
      readFileSync(join(rootDir, "docs", "workpacks", "06-recipe-to-planner", "acceptance.md"), "utf8"),
    );
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "06-recipe-to-planner", "automation-spec.json"),
      readFileSync(join(rootDir, "docs", "workpacks", "06-recipe-to-planner", "automation-spec.json"), "utf8"),
    );
    mkdirSync(join(workspacePath, "ui", "designs", "authority"), { recursive: true });
    writeFileSync(join(workspacePath, "ui", "designs", "authority", "RECIPE_DETAIL-authority.md"), "authority\n");

    const { binPath, argsPath } = createFakeOpencodeBin(rootDir, {
      sessionId: "ses_stage5_authority_verdict",
      stageResult: {
        decision: "request_changes",
        body_markdown: "## Review\n- fix touch target",
        route_back_stage: 4,
        approved_head_sha: null,
        review_scope: {
          scope: "frontend",
          checklist_ids: ["delivery-ui-connection", "accept-loading"],
        },
        reviewed_checklist_ids: ["delivery-ui-connection", "accept-loading"],
        required_fix_ids: ["delivery-ui-connection"],
        waived_fix_ids: [],
        authority_verdict: "hold",
        reviewed_screen_ids: ["RECIPE_DETAIL"],
        authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
        blocker_count: 0,
        major_count: 2,
        minor_count: 1,
        findings: [],
      },
    });

    const result = runStageWithArtifacts({
      rootDir,
      slice: "06-recipe-to-planner",
      stage: 5,
      workItemId: "06-recipe-to-planner",
      executionDir: workspacePath,
      mode: "execute",
      opencodeBin: binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: argsPath,
      },
      now: "2026-04-15T04:57:57+09:00",
    });

    const stageResult = JSON.parse(readFileSync(join(result.artifactDir, "stage-result.json"), "utf8")) as {
      authority_verdict: string;
      blocker_count: number;
      major_count: number;
    };

    expect(result.prompt).toContain("Stage 5 authority verdict semantics");
    expect(stageResult.blocker_count).toBe(0);
    expect(stageResult.major_count).toBe(2);
    expect(stageResult.authority_verdict).toBe("conditional-pass");
  });

  it("forces Stage 6 review scope to closeout and expands checklist coverage to the full contract snapshot", () => {
    const rootDir = createRunnerFixture();
    seedStrictSlice(rootDir, "06-recipe-to-planner");

    const { binPath, argsPath } = createFakeOpencodeBin(rootDir, {
      sessionId: "ses_stage6_closeout_scope",
      stageResult: {
        decision: "approve",
        body_markdown: "## Review\n- approved",
        route_back_stage: null,
        approved_head_sha: "closeout123",
        review_scope: {
          scope: "frontend",
          checklist_ids: ["delivery-ui-connection", "accept-loading"],
        },
        reviewed_checklist_ids: ["delivery-ui-connection", "accept-loading"],
        required_fix_ids: [],
        waived_fix_ids: [],
        authority_verdict: "pass",
        reviewed_screen_ids: [],
        authority_report_paths: [],
        blocker_count: 0,
        major_count: 0,
        minor_count: 0,
        findings: [],
      },
    });

    const result = runStageWithArtifacts({
      rootDir,
      slice: "06-recipe-to-planner",
      stage: 6,
      workItemId: "06-recipe-to-planner",
      mode: "execute",
      opencodeBin: binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: argsPath,
      },
      now: "2026-04-15T13:00:52+09:00",
    });

    const stageResult = JSON.parse(readFileSync(join(result.artifactDir, "stage-result.json"), "utf8")) as {
      review_scope: { scope: string; checklist_ids: string[] };
      reviewed_checklist_ids: string[];
    };

    expect(stageResult.review_scope.scope).toBe("closeout");
    expect(stageResult.review_scope.checklist_ids).toEqual([
      "delivery-backend-contract",
      "delivery-ui-connection",
      "accept-api-envelope",
      "accept-loading",
    ]);
    expect(stageResult.reviewed_checklist_ids).toEqual(stageResult.review_scope.checklist_ids);
  });

  it("normalizes Stage 4 implementation alias fields into the canonical stage-result schema", () => {
    const rootDir = createRunnerFixture();
    seedStrictSlice(rootDir, "06-recipe-to-planner");
    const workspacePath = join(rootDir, ".worktrees", "06-recipe-to-planner");
    mkdirSync(join(workspacePath, "docs", "workpacks", "06-recipe-to-planner"), { recursive: true });
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "06-recipe-to-planner", "README.md"),
      readFileSync(join(rootDir, "docs", "workpacks", "06-recipe-to-planner", "README.md"), "utf8"),
    );
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "06-recipe-to-planner", "acceptance.md"),
      readFileSync(join(rootDir, "docs", "workpacks", "06-recipe-to-planner", "acceptance.md"), "utf8"),
    );
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "06-recipe-to-planner", "automation-spec.json"),
      readFileSync(join(rootDir, "docs", "workpacks", "06-recipe-to-planner", "automation-spec.json"), "utf8"),
    );
    mkdirSync(join(workspacePath, "components", "recipe"), { recursive: true });
    mkdirSync(join(workspacePath, "tests"), { recursive: true });
    mkdirSync(join(workspacePath, "ui", "designs", "evidence", "06"), { recursive: true });
    writeFileSync(join(workspacePath, "components", "recipe", "planner-add-sheet.tsx"), "export function PlannerAddSheet() { return null; }\n");
    writeFileSync(join(workspacePath, "tests", "recipe-add-to-planner.test.tsx"), "test('ok', () => {});\n");
    writeFileSync(join(workspacePath, "ui", "designs", "evidence", "06", "RECIPE_DETAIL-planner-add-mobile.png"), "evidence\n");

    const homeDir = createClaudeHomeDir();
    const stage4Claude = createFakeClaudeBin(rootDir, homeDir, {
      sessionId: "ses_claude_stage4_alias",
      stageResult: {
        slice: "06-recipe-to-planner",
        stage: 4,
        result: "done",
        head: "340cc2a",
        summary: "Stage 4 frontend implementation complete.",
        checklist_satisfied: [
          "accept-loading",
        ],
        notes: [
          "Playwright E2E added",
          "authority evidence placeholders added",
        ],
      },
    });

    const result = runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "06-recipe-to-planner",
      stage: 4,
      workItemId: "06-recipe-to-planner",
      executionDir: workspacePath,
      claudeBudgetState: "available",
      mode: "execute",
      claudeBin: stage4Claude.binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: stage4Claude.argsPath,
        FAKE_CLAUDE_STDIN_PATH: stage4Claude.stdinPath,
      },
      now: "2026-04-15T02:12:53+09:00",
    });

    const stageResult = JSON.parse(readFileSync(join(result.artifactDir, "stage-result.json"), "utf8")) as {
      summary_markdown: string;
      checklist_updates: Array<{ id: string; status: string }>;
      tests_touched: string[];
      claimed_scope: { routes: string[]; states: string[] };
    };

    expect(stageResult.summary_markdown).toContain("Stage 4 frontend implementation complete.");
    expect(stageResult.checklist_updates.some((entry) => entry.id === "accept-loading" && entry.status === "checked")).toBe(true);
    expect(stageResult.checklist_updates.map((entry) => entry.id)).toContain("delivery-ui-connection");
    expect(Array.isArray(stageResult.tests_touched)).toBe(true);
    expect(Array.isArray(stageResult.claimed_scope.routes)).toBe(true);
    expect(Array.isArray(stageResult.claimed_scope.states)).toBe(true);
  });

  it("normalizes unchecked Stage 4 checklist updates from docs changed during execution", () => {
    const rootDir = createRunnerFixture();
    seedStrictSlice(rootDir, "06-recipe-to-planner");
    const workspacePath = join(rootDir, ".worktrees", "06-recipe-to-planner");
    mkdirSync(join(workspacePath, "docs", "workpacks", "06-recipe-to-planner"), { recursive: true });
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "06-recipe-to-planner", "README.md"),
      readFileSync(join(rootDir, "docs", "workpacks", "06-recipe-to-planner", "README.md"), "utf8"),
    );
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "06-recipe-to-planner", "acceptance.md"),
      readFileSync(join(rootDir, "docs", "workpacks", "06-recipe-to-planner", "acceptance.md"), "utf8"),
    );
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "06-recipe-to-planner", "automation-spec.json"),
      readFileSync(join(rootDir, "docs", "workpacks", "06-recipe-to-planner", "automation-spec.json"), "utf8"),
    );

    const homeDir = createClaudeHomeDir();
    const binPath = join(rootDir, "fake-claude-stage4-docs-check.sh");
    const argsPath = join(rootDir, "fake-claude-stage4-docs-check.args.log");
    const stdinPath = join(rootDir, "fake-claude-stage4-docs-check.stdin.log");
    writeFileSync(
      binPath,
      [
        "#!/bin/sh",
        "printf '%s\\n' \"$@\" > \"$FAKE_CLAUDE_ARGS_PATH\"",
        "cat > \"$FAKE_CLAUDE_STDIN_PATH\"",
        "perl -0pi -e 's/- \\[ \\] UI 연결/- [x] UI 연결/' docs/workpacks/06-recipe-to-planner/README.md",
        "perl -0pi -e 's/- \\[ \\] loading 상태가 있다/- [x] loading 상태가 있다/' docs/workpacks/06-recipe-to-planner/acceptance.md",
        "cat <<'EOF' > \"$OMO_STAGE_RESULT_PATH\"",
        JSON.stringify(
          {
            result: "done",
            summary_markdown: "Stage 4 frontend implementation complete.",
            commit: {
              subject: "feat: implement shopping flow UI",
            },
            pr: {
              title: "feat: implement shopping flow UI",
              body_markdown: "## Summary\n- frontend",
            },
            checks_run: ["pnpm verify:frontend"],
            next_route: "open_pr",
            claimed_scope: {
              files: [
                "docs/workpacks/06-recipe-to-planner/README.md",
                "docs/workpacks/06-recipe-to-planner/acceptance.md",
              ],
              endpoints: [],
              routes: ["/shopping/flow"],
              states: ["loading"],
              invariants: [],
            },
            changed_files: [
              "docs/workpacks/06-recipe-to-planner/README.md",
              "docs/workpacks/06-recipe-to-planner/acceptance.md",
            ],
            tests_touched: [],
            artifacts_written: [],
            checklist_updates: [
              {
                id: "delivery-ui-connection",
                status: "unchecked",
                evidence_refs: [],
              },
              {
                id: "accept-loading",
                status: "unchecked",
                evidence_refs: [],
              },
            ],
            contested_fix_ids: [],
            rebuttals: [],
          },
          null,
          2,
        ),
        "EOF",
        "cat <<'EOF'",
        JSON.stringify({
          type: "result",
          subtype: "success",
          is_error: false,
          session_id: "ses_claude_stage4_docs_check",
          total_cost_usd: 0,
          usage: {
            input_tokens: 10,
            output_tokens: 20,
          },
        }),
        "EOF",
      ].join("\n"),
    );
    chmodSync(binPath, 0o755);

    const result = runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "06-recipe-to-planner",
      stage: 4,
      workItemId: "06-recipe-to-planner",
      executionDir: workspacePath,
      claudeBudgetState: "available",
      mode: "execute",
      claudeBin: binPath,
      environment: {
        FAKE_CLAUDE_ARGS_PATH: argsPath,
        FAKE_CLAUDE_STDIN_PATH: stdinPath,
      },
      now: "2026-04-25T18:41:15.000Z",
    });

    const stageResult = JSON.parse(readFileSync(join(result.artifactDir, "stage-result.json"), "utf8")) as {
      checklist_updates: Array<{ id: string; status: string }>;
    };

    expect(stageResult.checklist_updates).toEqual([
      {
        id: "delivery-ui-connection",
        status: "checked",
        evidence_refs: [],
      },
      {
        id: "accept-loading",
        status: "checked",
        evidence_refs: [],
      },
    ]);
  });

  it("merges the Stage 4 authority_precheck checklist snapshot from the prior implementation artifact", () => {
    const rootDir = createRunnerFixture();
    seedStrictSlice(rootDir, "06-recipe-to-planner");
    const workspacePath = join(rootDir, ".worktrees", "06-recipe-to-planner");
    const priorArtifactDir = join(rootDir, ".artifacts", "prior-stage4-implementation");
    const priorStageResultPath = join(priorArtifactDir, "stage-result.json");
    mkdirSync(join(workspacePath, "docs", "workpacks", "06-recipe-to-planner"), { recursive: true });
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "06-recipe-to-planner", "README.md"),
      readFileSync(join(rootDir, "docs", "workpacks", "06-recipe-to-planner", "README.md"), "utf8"),
    );
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "06-recipe-to-planner", "acceptance.md"),
      readFileSync(join(rootDir, "docs", "workpacks", "06-recipe-to-planner", "acceptance.md"), "utf8"),
    );
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "06-recipe-to-planner", "automation-spec.json"),
      readFileSync(join(rootDir, "docs", "workpacks", "06-recipe-to-planner", "automation-spec.json"), "utf8"),
    );
    mkdirSync(join(workspacePath, "ui", "designs", "authority"), { recursive: true });
    mkdirSync(join(workspacePath, "ui", "designs", "evidence", "06-recipe-to-planner"), { recursive: true });
    writeFileSync(join(workspacePath, "ui", "designs", "authority", "RECIPE_DETAIL-authority.md"), "authority\n");
    writeFileSync(join(workspacePath, "ui", "designs", "authority", "PLANNER_WEEK-authority.md"), "authority\n");
    writeFileSync(join(workspacePath, "ui", "designs", "evidence", "06-recipe-to-planner", "RECIPE_DETAIL-planner-add-mobile.png"), "png\n");
    mkdirSync(priorArtifactDir, { recursive: true });
    writeFileSync(
      priorStageResultPath,
      `${JSON.stringify(
        {
          result: "done",
          summary_markdown: "frontend implementation complete",
          commit: {
            subject: "feat: frontend implementation",
            body_markdown: "body",
          },
          pr: {
            title: "feat: frontend implementation",
            body_markdown: "## Summary\n- frontend",
          },
          checks_run: [],
          next_route: "open_pr",
          claimed_scope: {
            files: ["components/recipe/planner-add-sheet.tsx"],
            endpoints: [],
            routes: ["/planner"],
            states: ["loading"],
            invariants: [],
          },
          changed_files: ["components/recipe/planner-add-sheet.tsx"],
          tests_touched: ["tests/recipe-add-to-planner.test.tsx"],
          artifacts_written: [],
          checklist_updates: [
            {
              id: "delivery-ui-connection",
              status: "checked",
              evidence_refs: ["pnpm verify:frontend"],
            },
            {
              id: "accept-loading",
              status: "checked",
              evidence_refs: ["tests/recipe-add-to-planner.test.tsx"],
            },
          ],
          contested_fix_ids: [],
          rebuttals: [],
        },
        null,
        2,
      )}\n`,
    );

    const { binPath, argsPath } = createFakeOpencodeBin(rootDir, {
      sessionId: "ses_stage4_authority_precheck",
      stageResult: {
        result: "done",
        summary_markdown: "authority precheck complete",
        commit: {
          subject: "chore(authority): capture evidence",
          body_markdown: "authority body",
        },
        pr: {
          title: "feat(slice06): authority precheck",
          body_markdown: "## Summary\n- authority",
        },
        checks_run: [],
        next_route: "open_pr",
        claimed_scope: {
          files: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
          endpoints: [],
          routes: [],
          states: [],
          invariants: [],
        },
        changed_files: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
        tests_touched: [],
        artifacts_written: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
        checklist_updates: [],
        contested_fix_ids: [],
        rebuttals: [],
        authority_verdict: "pass",
        reviewed_screen_ids: ["RECIPE_DETAIL", "PLANNER_WEEK"],
        authority_report_paths: [
          "ui/designs/authority/RECIPE_DETAIL-authority.md",
          "ui/designs/authority/PLANNER_WEEK-authority.md",
        ],
        evidence_artifact_refs: [
          "ui/designs/evidence/06-recipe-to-planner/RECIPE_DETAIL-planner-add-mobile.png",
        ],
        blocker_count: 0,
        major_count: 0,
        minor_count: 0,
      },
    });

    const result = runStageWithArtifacts({
      rootDir,
      slice: "06-recipe-to-planner",
      stage: 4,
      subphase: "authority_precheck",
      workItemId: "06-recipe-to-planner",
      executionDir: workspacePath,
      mode: "execute",
      opencodeBin: binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: argsPath,
      },
      now: "2026-04-15T04:19:25+09:00",
      priorStageResultPath,
    });

    const stageResult = JSON.parse(readFileSync(join(result.artifactDir, "stage-result.json"), "utf8")) as {
      checklist_updates: Array<{ id: string; status: string }>;
      authority_verdict: string;
    };

    expect(stageResult.authority_verdict).toBe("pass");
    expect(stageResult.checklist_updates.map((entry) => entry.id)).toContain("delivery-ui-connection");
    expect(stageResult.checklist_updates.map((entry) => entry.id)).toContain("accept-loading");
    expect(stageResult.checklist_updates.every((entry) => ["checked", "unchecked"].includes(entry.status))).toBe(true);
  });

  it("fails closed when authority_precheck cannot inherit a missing Stage 4 implementation snapshot", () => {
    const rootDir = createRunnerFixture();
    seedStrictSlice(rootDir, "06-recipe-to-planner");
    const workspacePath = join(rootDir, ".worktrees", "06-recipe-to-planner");
    mkdirSync(join(workspacePath, "docs", "workpacks", "06-recipe-to-planner"), { recursive: true });
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "06-recipe-to-planner", "README.md"),
      readFileSync(join(rootDir, "docs", "workpacks", "06-recipe-to-planner", "README.md"), "utf8"),
    );
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "06-recipe-to-planner", "acceptance.md"),
      readFileSync(join(rootDir, "docs", "workpacks", "06-recipe-to-planner", "acceptance.md"), "utf8"),
    );
    writeFileSync(
      join(workspacePath, "docs", "workpacks", "06-recipe-to-planner", "automation-spec.json"),
      readFileSync(join(rootDir, "docs", "workpacks", "06-recipe-to-planner", "automation-spec.json"), "utf8"),
    );
    mkdirSync(join(workspacePath, "ui", "designs", "authority"), { recursive: true });
    mkdirSync(join(workspacePath, "ui", "designs", "evidence", "06-recipe-to-planner"), { recursive: true });
    writeFileSync(join(workspacePath, "ui", "designs", "authority", "RECIPE_DETAIL-authority.md"), "authority\n");
    writeFileSync(join(workspacePath, "ui", "designs", "authority", "PLANNER_WEEK-authority.md"), "authority\n");
    writeFileSync(join(workspacePath, "ui", "designs", "evidence", "06-recipe-to-planner", "RECIPE_DETAIL-planner-add-mobile.png"), "png\n");

    const { binPath, argsPath } = createFakeOpencodeBin(rootDir, {
      sessionId: "ses_stage4_authority_precheck_missing_prior",
      stageResult: {
        result: "done",
        summary_markdown: "authority precheck complete",
        commit: {
          subject: "chore(authority): capture evidence",
          body_markdown: "authority body",
        },
        pr: {
          title: "feat(slice06): authority precheck",
          body_markdown: "## Summary\n- authority",
        },
        checks_run: [],
        next_route: "open_pr",
        claimed_scope: {
          files: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
          endpoints: [],
          routes: [],
          states: [],
          invariants: [],
        },
        changed_files: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
        tests_touched: [],
        artifacts_written: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
        checklist_updates: [],
        contested_fix_ids: [],
        rebuttals: [],
        authority_verdict: "pass",
        reviewed_screen_ids: ["RECIPE_DETAIL", "PLANNER_WEEK"],
        authority_report_paths: [
          "ui/designs/authority/RECIPE_DETAIL-authority.md",
          "ui/designs/authority/PLANNER_WEEK-authority.md",
        ],
        evidence_artifact_refs: [
          "ui/designs/evidence/06-recipe-to-planner/RECIPE_DETAIL-planner-add-mobile.png",
        ],
        blocker_count: 0,
        major_count: 0,
        minor_count: 0,
      },
    });

    const result = runStageWithArtifacts({
      rootDir,
      slice: "06-recipe-to-planner",
      stage: 4,
      subphase: "authority_precheck",
      workItemId: "06-recipe-to-planner",
      executionDir: workspacePath,
      mode: "execute",
      opencodeBin: binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: argsPath,
      },
      now: "2026-04-15T04:19:25+09:00",
    });

    expect(result.execution).toMatchObject({
      mode: "contract-violation",
      sessionId: "ses_stage4_authority_precheck_missing_prior",
    });
    expect(result.execution.reason).toContain("authority_precheck must inherit the Stage 4 implementation checklist snapshot");
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

  it("rejects an explicit opencode provider override for Claude-owned stages", () => {
    const rootDir = createRunnerFixture();
    expect(() =>
      runStageWithArtifacts({
        rootDir,
        slice: "03-recipe-like",
        stage: 1,
        workItemId: "03-recipe-like",
        claudeBudgetState: "available",
        mode: "execute",
        claudeProvider: "opencode" as "claude-cli",
        now: "2026-03-26T22:15:00+09:00",
      }),
    ).toThrow('claudeProvider must be "claude-cli"');
  });

  it("cleans oh-my-opencode migration artifacts after an opencode run", () => {
    const rootDir = createRunnerFixture();
    mkdirSync(join(rootDir, ".opencode"), { recursive: true });
    writeFileSync(
      join(rootDir, ".opencode", "oh-my-opencode.json"),
      JSON.stringify({ default_run_agent: "hephaestus" }, null, 2),
    );

    const binPath = join(rootDir, "fake-opencode-cleanup.sh");
    writeFileSync(
      binPath,
      [
        "#!/bin/sh",
        "cat <<'EOF' > \"$OMO_STAGE_RESULT_PATH\"",
        JSON.stringify(
          {
            result: "done",
            summary_markdown: "Stage complete",
            pr: {
              title: "docs: fake slice",
              body_markdown: "## Summary\\n- fake",
            },
            checks_run: [],
            next_route: "open_pr",
          },
          null,
          2,
        ),
        "EOF",
        "cat \"$PWD/.opencode/oh-my-opencode.json\" > \"$PWD/.opencode/oh-my-opencode.json.bak\"",
        "rm -f \"$PWD/.opencode/oh-my-opencode.json\"",
        "cat <<'EOF' > \"$PWD/.opencode/oh-my-openagent.json\"",
        "{\"default_run_agent\":\"hephaestus\"}",
        "EOF",
        "cat <<'EOF' > \"$PWD/.opencode/oh-my-openagent.json.migrations.json\"",
        "{\"appliedMigrations\":[\"test\"]}",
        "EOF",
        "printf '%s\\n' '{\"type\":\"step_start\",\"sessionID\":\"ses_cleanup\",\"part\":{\"type\":\"step-start\"}}'",
        "printf '%s\\n' '{\"type\":\"step_finish\",\"sessionID\":\"ses_cleanup\",\"part\":{\"type\":\"step-finish\",\"reason\":\"stop\"}}'",
        "exit 0",
      ].join("\n"),
    );
    chmodSync(binPath, 0o755);

    runStageWithArtifacts({
      rootDir,
      slice: "03-recipe-like",
      stage: 2,
      workItemId: "03-recipe-like",
      mode: "execute",
      opencodeBin: binPath,
      now: "2026-04-13T14:00:00+09:00",
    });

    expect(existsSync(join(rootDir, ".opencode", "oh-my-opencode.json"))).toBe(true);
    expect(existsSync(join(rootDir, ".opencode", "oh-my-opencode.json.bak"))).toBe(false);
    expect(existsSync(join(rootDir, ".opencode", "oh-my-openagent.json"))).toBe(false);
    expect(existsSync(join(rootDir, ".opencode", "oh-my-openagent.json.migrations.json"))).toBe(false);
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

  it("times out opencode provider runs instead of waiting indefinitely", () => {
    const rootDir = createRunnerFixture();
    const artifactDir = join(rootDir, ".artifacts", "timeout-run");
    const { binPath, argsPath } = createFakeOpencodeBin(rootDir, {
      sleepSeconds: 1,
      stageResult: null,
    });

    const result = runStageWithArtifacts({
      rootDir,
      slice: "02-discovery-filter",
      stage: 2,
      mode: "execute",
      artifactDir,
      opencodeBin: binPath,
      environment: {
        FAKE_OPENCODE_ARGS_PATH: argsPath,
        OMO_PROVIDER_TIMEOUT_MS: "50",
      },
      now: "2026-03-26T21:35:00+09:00",
    });

    expect(result.execution).toMatchObject({
      mode: "contract-violation",
      failureKind: "timeout",
    });
  });
});
