import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  buildStageDispatch,
  syncWorkflowV2Status,
} from "../scripts/lib/omo-lite-supervisor.mjs";

function createWorkflowFixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "omo-lite-supervisor-"));

  mkdirSync(join(rootDir, "docs", "engineering", "workflow-v2", "schemas"), {
    recursive: true,
  });
  mkdirSync(join(rootDir, ".workflow-v2", "work-items"), { recursive: true });

  writeFileSync(
    join(rootDir, "docs", "engineering", "workflow-v2", "schemas", "work-item.schema.json"),
    JSON.stringify({ type: "object" }),
  );
  writeFileSync(
    join(rootDir, "docs", "engineering", "workflow-v2", "schemas", "workflow-status.schema.json"),
    JSON.stringify({ type: "object" }),
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
    join(rootDir, ".workflow-v2", "work-items", "omo-lite-phase4-supervisor.json"),
    JSON.stringify(
      {
        id: "omo-lite-phase4-supervisor",
        title: "Implement OMO-lite phase 4 helpers",
        project_profile: "homecook",
        change_type: "infra-governance",
        surface: "workflow",
        risk: "medium",
        preset: "infra-governance",
        goal: "Add stage dispatcher and status sync helper for Homecook OMO-lite.",
        owners: {
          claude: "sparse-review-and-approval",
          codex: "implementation-and-integration",
          workers: ["testing"],
        },
        docs_refs: {
          source_of_truth: [
            "AGENTS.md",
            "docs/engineering/agent-workflow-overview.md",
          ],
          governing_docs: [
            "docs/engineering/workflow-v2/omo-lite-supervisor-spec.md",
            "docs/engineering/workflow-v2/omo-lite-dispatch-contract.md",
          ],
        },
        workflow: {
          plan_loop: "recommended",
          review_loop: "required",
          external_smokes: [],
        },
        verification: {
          required_checks: [
            "pnpm validate:workflow-v2",
            "pnpm exec vitest run tests/omo-lite-supervisor.test.ts",
          ],
          verify_commands: [
            "pnpm validate:workflow-v2",
            "pnpm exec vitest run tests/omo-lite-supervisor.test.ts",
          ],
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

  return rootDir;
}

describe("OMO-lite stage dispatch", () => {
  it("builds a Stage 2 Codex dispatch for product slices", () => {
    const dispatch = buildStageDispatch({
      slice: "02-discovery-filter",
      stage: 2,
      claudeBudgetState: "available",
    });

    expect(dispatch.actor).toBe("codex");
    expect(dispatch.goal).toContain("02-discovery-filter 2단계 진행");
    expect(dispatch.requiredReads).toEqual(
      expect.arrayContaining([
        "AGENTS.md",
        "docs/engineering/slice-workflow.md",
        "docs/workpacks/02-discovery-filter/README.md",
        "docs/workpacks/02-discovery-filter/acceptance.md",
      ]),
    );
    expect(dispatch.statusPatch).toMatchObject({
      branch: "feature/be-02-discovery-filter",
      lifecycle: "in_progress",
      approval_state: "not_started",
      verification_status: "pending",
    });
    expect(dispatch.verifyCommands).toEqual(
      expect.arrayContaining(["pnpm install --frozen-lockfile", "pnpm test:all"]),
    );
  });

  it("keeps the previous approval state when Stage 6 is blocked for a Claude retry", () => {
    const dispatch = buildStageDispatch({
      slice: "02-discovery-filter",
      stage: 6,
      claudeBudgetState: "unavailable",
    });

    expect(dispatch.actor).toBe("claude");
    expect(dispatch.sessionBinding).toMatchObject({
      role: "claude_primary",
      sessionId: null,
      resumeMode: "fresh",
    });
    expect(dispatch.retryDecision).toMatchObject({
      action: "schedule_retry",
      reason: "claude_budget_unavailable",
    });
    expect(dispatch.statusPatch).toMatchObject({
      lifecycle: "blocked",
      verification_status: "pending",
    });
    expect("approval_state" in dispatch.statusPatch).toBe(false);
    expect(dispatch.escalationIfBlocked).toContain("Claude");
  });

  it("keeps Stage 4 assigned to Codex even when Claude is unavailable", () => {
    const dispatch = buildStageDispatch({
      slice: "02-discovery-filter",
      stage: 4,
      claudeBudgetState: "unavailable",
    });

    expect(dispatch.actor).toBe("codex");
    expect(dispatch.sessionBinding).toMatchObject({
      role: "codex_primary",
      sessionId: null,
      resumeMode: "fresh",
    });
    expect(dispatch.retryDecision).toMatchObject({
      action: "none",
    });
    expect(dispatch.statusPatch).toMatchObject({
      branch: "feature/fe-02-discovery-filter",
      lifecycle: "in_progress",
      approval_state: "not_started",
    });
  });

  it("injects prior review feedback into Stage 2 reruns", () => {
    const dispatch = buildStageDispatch({
      slice: "02-discovery-filter",
      stage: 2,
      claudeBudgetState: "available",
      sessionId: "ses_codex_stage2",
      reviewContext: {
        decision: "request_changes",
        body_markdown: "테스트 계약을 더 엄격하게 고정해 주세요.",
        pr_url: "https://github.com/netsus/homecook/pull/99",
        updated_at: "2026-04-01T00:00:00.000Z",
      },
    });

    expect(dispatch.requiredReads).toEqual(
      expect.arrayContaining([
        "previous backend review feedback (runtime.last_review.backend)",
        "active PR context: https://github.com/netsus/homecook/pull/99",
      ]),
    );
    expect(dispatch.reviewContext).toMatchObject({
      decision: "request_changes",
      body_markdown: "테스트 계약을 더 엄격하게 고정해 주세요.",
    });
  });

  it("injects structured findings into Stage 2 rerun prompt sections", () => {
    const dispatch = buildStageDispatch({
      slice: "02-discovery-filter",
      stage: 2,
      reviewContext: {
        decision: "request_changes",
        body_markdown: "권한 체크 누락.",
        findings: [
          {
            file: "app/api/v1/recipes/route.ts",
            line_hint: 10,
            severity: "critical",
            category: "contract",
            issue: "Missing auth middleware",
            suggestion: "withAuth 래퍼 추가",
          },
        ],
      },
    });

    expect(dispatch.extraPromptSections).toHaveLength(1);
    expect(dispatch.extraPromptSections[0]).toContain("Structured Findings from Prior Review");
    expect(dispatch.extraPromptSections[0]).toContain("CRITICAL");
    expect(dispatch.extraPromptSections[0]).toContain("Missing auth middleware");
    expect(dispatch.extraPromptSections[0]).toContain("withAuth 래퍼 추가");
  });

  it("injects structured findings and required fix ids into Stage 4 rerun prompt sections", () => {
    const dispatch = buildStageDispatch({
      slice: "02-discovery-filter",
      stage: 4,
      reviewContext: {
        decision: "request_changes",
        body_markdown: "CTA 상태를 다시 맞춰 주세요.",
        pr_url: "https://github.com/netsus/homecook/pull/101",
        updated_at: "2026-04-01T01:00:00.000Z",
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
        required_fix_ids: ["delivery-ui-connection"],
      },
    });

    expect(dispatch.requiredReads).toEqual(
      expect.arrayContaining([
        "previous frontend review feedback (runtime.last_review.frontend)",
        "active PR context: https://github.com/netsus/homecook/pull/101",
      ]),
    );
    expect(dispatch.extraPromptSections).toHaveLength(2);
    expect(dispatch.extraPromptSections[0]).toContain("Structured Findings from Prior Review");
    expect(dispatch.extraPromptSections[0]).toContain("Disabled CTA state is inconsistent.");
    expect(dispatch.extraPromptSections[1]).toContain("Required Checklist Fix IDs");
    expect(dispatch.extraPromptSections[1]).toContain("delivery-ui-connection");
  });

  it("does NOT inject findings section for review stages (stage 3)", () => {
    const dispatch = buildStageDispatch({
      slice: "02-discovery-filter",
      stage: 3,
      reviewContext: {
        decision: "approve",
        body_markdown: "LGTM",
        findings: [
          {
            file: "x.ts",
            line_hint: null,
            severity: "minor",
            category: "style",
            issue: "이슈",
            suggestion: "제안",
          },
        ],
      },
    });

    expect(dispatch.extraPromptSections ?? []).toHaveLength(0);
  });

  it("injects prior stage-result path into Stage 3 requiredReads", () => {
    const dispatch = buildStageDispatch({
      slice: "02-discovery-filter",
      stage: 3,
      priorStageResultPath: "/tmp/fake/.artifacts/stage2/stage-result.json",
    });

    expect(dispatch.requiredReads).toContain(
      "prior stage result: /tmp/fake/.artifacts/stage2/stage-result.json",
    );
  });

  it("does NOT inject prior stage-result path for code stages (stage 2)", () => {
    const dispatch = buildStageDispatch({
      slice: "02-discovery-filter",
      stage: 2,
      priorStageResultPath: "/tmp/fake/.artifacts/stage1/stage-result.json",
    });

    expect(dispatch.requiredReads.join(" ")).not.toContain("prior stage result:");
  });

  it("includes acceptance.md in Stage 5 requiredReads", () => {
    const dispatch = buildStageDispatch({
      slice: "02-discovery-filter",
      stage: 5,
    });

    expect(dispatch.requiredReads).toEqual(
      expect.arrayContaining([
        "docs/workpacks/02-discovery-filter/README.md",
        "docs/workpacks/02-discovery-filter/acceptance.md",
      ]),
    );
  });
});

describe("OMO-lite workflow status sync", () => {
  it("creates a missing status entry from a tracked work item and mirrors status fields", () => {
    const rootDir = createWorkflowFixture();

    const result = syncWorkflowV2Status({
      rootDir,
      workItemId: "omo-lite-phase4-supervisor",
      patch: {
        branch: "feature/omo-lite-phase4-supervisor",
        pr_path: "https://github.com/netsus/homecook/pull/26",
        lifecycle: "ready_for_review",
        approval_state: "codex_approved",
        verification_status: "passed",
        notes: "Phase 4 helper implementation is ready for review.",
      },
      updatedAt: "2026-03-26T12:34:56+09:00",
    });

    expect(result.statusItem).toMatchObject({
      id: "omo-lite-phase4-supervisor",
      preset: "infra-governance",
      branch: "feature/omo-lite-phase4-supervisor",
      pr_path: "https://github.com/netsus/homecook/pull/26",
      lifecycle: "ready_for_review",
      approval_state: "codex_approved",
      verification_status: "passed",
    });
    expect(result.statusItem.required_checks).toEqual([
      "pnpm validate:workflow-v2",
      "pnpm exec vitest run tests/omo-lite-supervisor.test.ts",
    ]);

    const workItem = JSON.parse(
      readFileSync(
        join(rootDir, ".workflow-v2", "work-items", "omo-lite-phase4-supervisor.json"),
        "utf8",
      ),
    ) as Record<string, unknown> & {
      status: {
        lifecycle: string;
        approval_state: string;
        verification_status: string;
      };
    };

    expect(workItem.status).toEqual({
      lifecycle: "ready_for_review",
      approval_state: "codex_approved",
      verification_status: "passed",
      evaluation_status: null,
      evaluation_round: null,
      last_evaluator_result: null,
      auto_merge_eligible: false,
      blocked_reason_code: null,
    });

    const statusBoard = JSON.parse(
      readFileSync(join(rootDir, ".workflow-v2", "status.json"), "utf8"),
    ) as Record<string, unknown> & {
      updated_at: string;
      items: unknown[];
    };

    expect(statusBoard.updated_at).toBe("2026-03-26T12:34:56+09:00");
    expect(statusBoard.items).toHaveLength(1);
  });

  it("updates an existing status entry without losing tracked required checks", () => {
    const rootDir = createWorkflowFixture();

    syncWorkflowV2Status({
      rootDir,
      workItemId: "omo-lite-phase4-supervisor",
      patch: {
        branch: "feature/omo-lite-phase4-supervisor",
        pr_path: "pending",
        lifecycle: "in_progress",
        approval_state: "not_started",
        verification_status: "pending",
        notes: "Phase 4 started.",
      },
      updatedAt: "2026-03-26T13:00:00+09:00",
    });

    const result = syncWorkflowV2Status({
      rootDir,
      workItemId: "omo-lite-phase4-supervisor",
      patch: {
        branch: "feature/omo-lite-phase4-supervisor",
        pr_path: "https://github.com/netsus/homecook/pull/26",
        lifecycle: "ready_for_review",
        approval_state: "codex_approved",
        verification_status: "passed",
        notes: "Phase 4 ready for review.",
      },
      updatedAt: "2026-03-26T13:30:00+09:00",
    });

    expect(result.statusItem).toMatchObject({
      branch: "feature/omo-lite-phase4-supervisor",
      pr_path: "https://github.com/netsus/homecook/pull/26",
      lifecycle: "ready_for_review",
      approval_state: "codex_approved",
      verification_status: "passed",
    });
    expect(result.statusItem.required_checks).toEqual([
      "pnpm validate:workflow-v2",
      "pnpm exec vitest run tests/omo-lite-supervisor.test.ts",
    ]);
  });

  it("supports partial status patches without requiring unspecified enum fields", () => {
    const rootDir = createWorkflowFixture();

    syncWorkflowV2Status({
      rootDir,
      workItemId: "omo-lite-phase4-supervisor",
      patch: {
        branch: "feature/omo-lite-phase4-supervisor",
        pr_path: "pending",
        lifecycle: "in_progress",
        approval_state: "not_started",
        verification_status: "pending",
        notes: "Phase 4 started.",
      },
      updatedAt: "2026-03-26T14:00:00+09:00",
    });

    const result = syncWorkflowV2Status({
      rootDir,
      workItemId: "omo-lite-phase4-supervisor",
      patch: {
        notes: "Only the notes field changed.",
      },
      updatedAt: "2026-03-26T14:30:00+09:00",
    });

    expect(result.statusItem).toMatchObject({
      branch: "feature/omo-lite-phase4-supervisor",
      pr_path: "pending",
      lifecycle: "in_progress",
      approval_state: "not_started",
      verification_status: "pending",
      notes: "Only the notes field changed.",
    });
  });

  it("allows the sync CLI to update only provided fields", () => {
    const rootDir = createWorkflowFixture();

    syncWorkflowV2Status({
      rootDir,
      workItemId: "omo-lite-phase4-supervisor",
      patch: {
        branch: "feature/omo-lite-phase4-supervisor",
        pr_path: "pending",
        lifecycle: "in_progress",
        approval_state: "not_started",
        verification_status: "pending",
        notes: "Phase 4 started.",
      },
      updatedAt: "2026-03-26T15:00:00+09:00",
    });

    execFileSync(
      "node",
      [
        join(process.cwd(), "scripts", "omo-lite-sync-status.mjs"),
        "--work-item",
        "omo-lite-phase4-supervisor",
        "--notes",
        "CLI partial patch worked.",
      ],
      {
        cwd: rootDir,
      },
    );

    const statusBoard = JSON.parse(
      readFileSync(join(rootDir, ".workflow-v2", "status.json"), "utf8"),
    ) as Record<string, unknown> & {
      items: Array<Record<string, unknown>>;
    };

    expect(statusBoard.items[0]).toMatchObject({
      branch: "feature/omo-lite-phase4-supervisor",
      pr_path: "pending",
      lifecycle: "in_progress",
      approval_state: "not_started",
      verification_status: "pending",
      notes: "CLI partial patch worked.",
    });
  });
});
