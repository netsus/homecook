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

  it("routes Stage 6 to human fallback when Claude is unavailable", () => {
    const dispatch = buildStageDispatch({
      slice: "02-discovery-filter",
      stage: 6,
      claudeBudgetState: "unavailable",
    });

    expect(dispatch.actor).toBe("human");
    expect(dispatch.statusPatch).toMatchObject({
      approval_state: "awaiting_claude_or_human",
      lifecycle: "ready_for_review",
    });
    expect(dispatch.escalationIfBlocked).toContain("Claude");
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
});
