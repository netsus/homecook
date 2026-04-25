import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { syncWorkflowV2Status } from "../scripts/lib/omo-lite-supervisor.mjs";
import { readWorkItemSessionStatus } from "../scripts/lib/omo-session-orchestrator.mjs";

function createFixture(workItemId: string) {
  const rootDir = mkdtempSync(join(tmpdir(), "omo-tracked-work-item-"));
  const worktreePath = join(rootDir, ".worktrees", workItemId);

  mkdirSync(join(rootDir, ".workflow-v2", "work-items"), { recursive: true });
  mkdirSync(join(rootDir, ".opencode", "omo-runtime"), { recursive: true });
  mkdirSync(join(worktreePath, ".workflow-v2", "work-items"), { recursive: true });
  mkdirSync(join(rootDir, "docs", "workpacks", workItemId), { recursive: true });

  writeFileSync(
    join(rootDir, ".workflow-v2", "status.json"),
    JSON.stringify(
      {
        version: 1,
        project_profile: "homecook",
        updated_at: "2026-04-25T00:00:00.000Z",
        items: [],
      },
      null,
      2,
    ),
  );

  writeFileSync(join(rootDir, "docs", "workpacks", workItemId, "README.md"), `# ${workItemId}\n`);
  writeFileSync(
    join(rootDir, "docs", "workpacks", workItemId, "acceptance.md"),
    `# ${workItemId} acceptance\n`,
  );

  const workItem = {
    id: workItemId,
    title: "Meal add slice",
    project_profile: "homecook",
    change_type: "product",
    surface: "fullstack",
    risk: "low",
    preset: "vertical-slice-strict",
    goal: "Recover tracked work item from worktree when the root copy is missing.",
    owners: {
      claude: "stage1,stage3,stage4",
      codex: "stage2,stage5,stage6",
      workers: [],
    },
    docs_refs: {
      source_of_truth: ["AGENTS.md"],
      governing_docs: [
        `docs/workpacks/${workItemId}/README.md`,
        `docs/workpacks/${workItemId}/acceptance.md`,
      ],
    },
    workflow: {
      plan_loop: "skipped",
      review_loop: "required",
      external_smokes: [],
      execution_mode: "autonomous",
      merge_policy: "conditional-auto",
    },
    verification: {
      required_checks: ["pnpm verify:backend"],
      verify_commands: ["pnpm verify:backend"],
    },
    status: {
      lifecycle: "in_progress",
      approval_state: "not_started",
      verification_status: "pending",
    },
  };

  writeFileSync(
    join(worktreePath, ".workflow-v2", "work-items", `${workItemId}.json`),
    `${JSON.stringify(workItem, null, 2)}\n`,
  );

  writeFileSync(
    join(rootDir, ".opencode", "omo-runtime", `${workItemId}.json`),
    JSON.stringify(
      {
        version: 2,
        work_item_id: workItemId,
        slice: workItemId,
        repo_root: rootDir,
        active_stage: 2,
        current_stage: 2,
        last_completed_stage: 1,
        blocked_stage: null,
        lock: null,
        workspace: {
          path: worktreePath,
          branch_role: "backend",
          updated_at: "2026-04-25T00:00:00.000Z",
        },
        phase: "stage_result_ready",
        next_action: "finalize_stage",
      },
      null,
      2,
    ),
  );

  return {
    rootDir,
    worktreePath,
  };
}

describe("tracked workflow-v2 work item recovery", () => {
  it("restores the root work item from the runtime worktree during status reads", () => {
    const workItemId = "08b-meal-add-books-pantry";
    const { rootDir } = createFixture(workItemId);

    const status = readWorkItemSessionStatus({
      rootDir,
      workItemId,
    });

    expect(status.trackedWorkItem).toMatchObject({
      id: workItemId,
      preset: "vertical-slice-strict",
    });
    expect(
      JSON.parse(
        readFileSync(join(rootDir, ".workflow-v2", "work-items", `${workItemId}.json`), "utf8"),
      ),
    ).toMatchObject({
      id: workItemId,
    });
  });

  it("recovers the root work item before syncing workflow-v2 status", () => {
    const workItemId = "08b-meal-add-books-pantry";
    const { rootDir } = createFixture(workItemId);

    const result = syncWorkflowV2Status({
      rootDir,
      workItemId,
      patch: {
        lifecycle: "ready_for_review",
        approval_state: "codex_approved",
        verification_status: "passed",
      },
      updatedAt: "2026-04-25T01:00:00.000Z",
    });

    expect(result.statusItem).toMatchObject({
      id: workItemId,
      lifecycle: "ready_for_review",
      approval_state: "codex_approved",
      verification_status: "passed",
    });
    expect(
      JSON.parse(
        readFileSync(join(rootDir, ".workflow-v2", "work-items", `${workItemId}.json`), "utf8"),
      ).status,
    ).toMatchObject({
      lifecycle: "ready_for_review",
      approval_state: "codex_approved",
      verification_status: "passed",
    });
  });
});
