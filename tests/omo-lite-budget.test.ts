import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  clearClaudeBudgetOverride,
  resolveClaudeBudgetState,
  writeClaudeBudgetOverride,
} from "../scripts/lib/omo-lite-claude-budget.mjs";
import { runStageWithArtifacts } from "../scripts/lib/omo-lite-runner.mjs";

function createBudgetFixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "omo-lite-budget-root-"));
  const homeDir = mkdtempSync(join(tmpdir(), "omo-lite-budget-home-"));

  mkdirSync(join(rootDir, ".opencode"), { recursive: true });
  mkdirSync(join(rootDir, ".artifacts"), { recursive: true });
  mkdirSync(join(homeDir, ".local", "share", "opencode"), { recursive: true });

  return {
    rootDir,
    homeDir,
    authPath: join(homeDir, ".local", "share", "opencode", "auth.json"),
    overridePath: join(rootDir, ".opencode", "claude-budget-state.json"),
  };
}

let fakeOpencodeCounter = 0;

function createFakeOpencodeBin(
  rootDir: string,
  options?: {
    exitCode?: number;
    stdout?: string[];
    stderr?: string;
  },
) {
  fakeOpencodeCounter += 1;
  const suffix = String(fakeOpencodeCounter);
  const binPath = join(rootDir, `fake-opencode-budget-${suffix}.sh`);
  const exitCode = options?.exitCode ?? 0;
  const stdout = options?.stdout ?? [];
  const stderr = options?.stderr ?? "";

  writeFileSync(
    binPath,
    [
      "#!/bin/sh",
      ...stdout.map((line) => `printf '%s\\n' '${line}'`),
      stderr.length > 0 ? `printf '${stderr}\\n' >&2` : "",
      `exit ${exitCode}`,
    ].join("\n"),
  );
  chmodSync(binPath, 0o755);

  return {
    binPath,
  };
}

function seedWorkflowState(rootDir: string, workItemId: string) {
  mkdirSync(join(rootDir, ".workflow-v2", "work-items"), { recursive: true });

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
        title: "Phase 7 budget-aware test fixture",
        project_profile: "homecook",
        change_type: "infra-governance",
        surface: "workflow",
        risk: "medium",
        preset: "infra-governance",
        goal: "Test budget-aware fallback sync.",
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
          lifecycle: "in_progress",
          approval_state: "not_started",
          verification_status: "pending",
        },
      },
      null,
      2,
    ),
  );
}

describe("OMO-lite Claude budget resolution", () => {
  it("detects available state when Anthropic auth is configured", () => {
    const { rootDir, homeDir, authPath } = createBudgetFixture();

    writeFileSync(
      authPath,
      JSON.stringify(
        {
          openai: { type: "oauth" },
          anthropic: { type: "api", key: "test-key" },
        },
        null,
        2,
      ),
    );

    const resolved = resolveClaudeBudgetState({
      rootDir,
      homeDir,
    });

    expect(resolved).toMatchObject({
      state: "available",
      source: "opencode-auth",
      providerConfigured: true,
    });
  });

  it("falls back to unavailable when Anthropic auth is missing", () => {
    const { rootDir, homeDir, authPath } = createBudgetFixture();

    writeFileSync(
      authPath,
      JSON.stringify(
        {
          openai: { type: "oauth" },
        },
        null,
        2,
      ),
    );

    const resolved = resolveClaudeBudgetState({
      rootDir,
      homeDir,
    });

    expect(resolved).toMatchObject({
      state: "unavailable",
      source: "missing-auth",
      providerConfigured: false,
    });
  });

  it("prefers a repo-local override and can clear it again", () => {
    const { rootDir, homeDir, overridePath } = createBudgetFixture();

    writeClaudeBudgetOverride({
      rootDir,
      state: "unavailable",
      reason: "Claude Pro budget exhausted",
      updatedAt: "2026-03-26T22:00:00+09:00",
    });

    const resolved = resolveClaudeBudgetState({
      rootDir,
      homeDir,
    });

    expect(resolved).toMatchObject({
      state: "unavailable",
      source: "override-file",
    });
    expect(readFileSync(overridePath, "utf8")).toContain("Claude Pro budget exhausted");

    clearClaudeBudgetOverride({
      rootDir,
    });

    expect(existsSync(overridePath)).toBe(false);
  });

  it("prefers the environment override over the repo-local override file", () => {
    const { rootDir, homeDir } = createBudgetFixture();

    writeClaudeBudgetOverride({
      rootDir,
      state: "unavailable",
      reason: "Claude Pro budget exhausted",
      updatedAt: "2026-03-26T22:05:00+09:00",
    });

    const resolved = resolveClaudeBudgetState({
      rootDir,
      homeDir,
      environment: {
        ...process.env,
        OMO_CLAUDE_BUDGET_STATE: "constrained",
      },
    });

    expect(resolved).toMatchObject({
      state: "constrained",
      source: "env",
    });
  });
});

describe("OMO-lite stage runner budget-aware fallback", () => {
  it("schedules a retry when the resolved budget state is unavailable for a Claude-owned stage", () => {
    const { rootDir, homeDir } = createBudgetFixture();

    writeClaudeBudgetOverride({
      rootDir,
      state: "unavailable",
      reason: "Claude budget exhausted",
      updatedAt: "2026-03-26T22:10:00+09:00",
    });

    const result = runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "02-discovery-filter",
      stage: 5,
      workItemId: "02-discovery-filter",
      mode: "execute",
      now: "2026-03-26T22:20:00+09:00",
    });

    const runtime = JSON.parse(
      readFileSync(join(rootDir, ".opencode", "omo-runtime", "02-discovery-filter.json"), "utf8"),
    ) as {
      blocked_stage: number;
      retry: {
        reason: string;
        attempt_count: number;
      };
    };

    expect(result.dispatch.actor).toBe("claude");
    expect(result.execution).toMatchObject({
      mode: "scheduled-retry",
      executed: false,
      executable: false,
      reason: "claude_budget_unavailable",
    });
    expect(runtime).toMatchObject({
      blocked_stage: 5,
      retry: {
        reason: "claude_budget_unavailable",
        attempt_count: 1,
      },
    });

    const metadata = JSON.parse(
      readFileSync(join(result.artifactDir, "run-metadata.json"), "utf8"),
    ) as {
      claudeBudget: {
        state: string;
        source: string;
      };
    };

    expect(metadata.claudeBudget).toMatchObject({
      state: "unavailable",
      source: "override-file",
    });
  });

  it("syncs blocked retry state to workflow-v2 status when Claude budget fallback is triggered", () => {
    const { rootDir, homeDir } = createBudgetFixture();
    const workItemId = "phase7-budget-fallback";

    seedWorkflowState(rootDir, workItemId);
    writeClaudeBudgetOverride({
      rootDir,
      state: "unavailable",
      reason: "Claude budget exhausted",
      updatedAt: "2026-03-26T22:30:00+09:00",
    });

    const result = runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "02-discovery-filter",
      stage: 6,
      workItemId,
      syncStatus: true,
      mode: "artifact-only",
      now: "2026-03-26T22:40:00+09:00",
    });

    const statusBoard = JSON.parse(
      readFileSync(join(rootDir, ".workflow-v2", "status.json"), "utf8"),
    ) as {
      items: Array<{
        id: string;
        lifecycle: string;
        approval_state: string;
        verification_status: string;
        notes?: string;
      }>;
    };

    expect(result.dispatch.actor).toBe("claude");
    expect(statusBoard.items[0]).toMatchObject({
      id: workItemId,
      lifecycle: "blocked",
      approval_state: "awaiting_claude_or_human",
      verification_status: "pending",
    });
    expect(statusBoard.items[0].notes).toContain(result.artifactDir);
    expect(statusBoard.items[0].notes).toContain("retry_at=");
    expect(statusBoard.items[0].notes).toContain("session_role=claude_primary");
  });

  it("schedules a retry when Claude execution emits an Anthropic low-credit error event", () => {
    const { rootDir, homeDir, authPath } = createBudgetFixture();
    const workItemId = "stage1-runtime-budget";

    seedWorkflowState(rootDir, workItemId);
    writeFileSync(
      authPath,
      JSON.stringify(
        {
          openai: { type: "oauth" },
          anthropic: { type: "api", key: "test-key" },
        },
        null,
        2,
      ),
    );

    const { binPath } = createFakeOpencodeBin(rootDir, {
      stdout: [
        "{\"type\":\"step_start\",\"sessionID\":\"ses_runtime_budget\",\"part\":{\"type\":\"step-start\"}}",
        "{\"type\":\"error\",\"sessionID\":\"ses_runtime_budget\",\"error\":{\"name\":\"APIError\",\"data\":{\"message\":\"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.\"}}}",
      ],
    });

    const result = runStageWithArtifacts({
      rootDir,
      homeDir,
      slice: "04-recipe-save",
      stage: 1,
      workItemId,
      mode: "execute",
      opencodeBin: binPath,
      now: "2026-03-27T01:50:00+09:00",
    });

    const runtime = JSON.parse(
      readFileSync(join(rootDir, ".opencode", "omo-runtime", `${workItemId}.json`), "utf8"),
    ) as {
      current_stage: number;
      last_completed_stage: number;
      blocked_stage: number;
      retry: {
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
      sessionId: "ses_runtime_budget",
    });
    expect(runtime).toMatchObject({
      current_stage: 1,
      last_completed_stage: 0,
      blocked_stage: 1,
      retry: {
        reason: "claude_budget_unavailable",
        attempt_count: 1,
      },
    });
    expect(runtime.sessions.claude_primary.session_id).toBe("ses_runtime_budget");
  });
});
