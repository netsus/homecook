import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
        OMO_CLAUDE_BUDGET_STATE: "constrained",
      } as NodeJS.ProcessEnv,
    });

    expect(resolved).toMatchObject({
      state: "constrained",
      source: "env",
    });
  });
});

describe("OMO-lite stage runner budget-aware fallback", () => {
  it("routes reviewer stages to manual handoff when the resolved budget state is unavailable", () => {
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
      mode: "execute",
      now: "2026-03-26T22:20:00+09:00",
    });

    expect(result.dispatch.actor).toBe("human");
    expect(result.execution).toMatchObject({
      mode: "manual-handoff",
      executed: false,
      executable: false,
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

  it("syncs awaiting_claude_or_human to workflow-v2 status when fallback is triggered", () => {
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

    expect(result.dispatch.actor).toBe("human");
    expect(statusBoard.items[0]).toMatchObject({
      id: workItemId,
      lifecycle: "ready_for_review",
      approval_state: "awaiting_claude_or_human",
      verification_status: "passed",
    });
    expect(statusBoard.items[0].notes).toContain(result.artifactDir);
  });
});
