import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { projectCanonicalCloseoutToStatusFields } from "../scripts/lib/omo-closeout-state.mjs";
import { validateWorkflowV2TrackedState } from "../scripts/lib/validate-workflow-v2.mjs";

const repoRoot = process.cwd();
const tempRoots: string[] = [];

function readRepoFile(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function createWorkflowFixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "workflow-v2-closeout-projection-"));
  tempRoots.push(rootDir);

  mkdirSync(join(rootDir, "docs/engineering/workflow-v2/schemas"), { recursive: true });
  mkdirSync(join(rootDir, ".workflow-v2/work-items"), { recursive: true });

  for (const relativePath of [
    "docs/engineering/workflow-v2/schemas/work-item.schema.json",
    "docs/engineering/workflow-v2/schemas/workflow-status.schema.json",
    "docs/engineering/workflow-v2/schemas/promotion-evidence.schema.json",
  ]) {
    writeFileSync(join(rootDir, relativePath), readRepoFile(relativePath));
  }

  writeFileSync(
    join(rootDir, ".workflow-v2/promotion-evidence.json"),
    readRepoFile("docs/engineering/workflow-v2/templates/promotion-evidence.example.json"),
  );

  return rootDir;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const rootDir = tempRoots.pop();
    if (rootDir) {
      rmSync(rootDir, { recursive: true, force: true });
    }
  }
});

describe("workflow v2 closeout projection validator", () => {
  it("fails tracked state when a completed closeout snapshot is missing human-surface projection evidence", () => {
    const rootDir = createWorkflowFixture();
    const closeout = {
      phase: "completed",
      docs_projection: {
        roadmap_lifecycle: "merged",
        design_status: "confirmed",
        delivery_checklist: "complete",
        design_authority: "passed",
        acceptance: "complete",
        automation_spec_metadata: "synced",
      },
      verification_projection: {
        required_checks: "passed",
        external_smokes: "passed",
        authority_reports: [],
        actual_verification_refs: [],
      },
      merge_gate_projection: {
        current_head_sha: "abc1234",
        approval_state: "dual_approved",
        all_checks_green: true,
      },
      recovery_summary: {
        manual_patch_count: 0,
        manual_handoff: false,
        stale_lock_count: 0,
        ci_resync_count: 0,
        artifact_missing: false,
        last_recovery_at: "2026-04-21T00:00:00Z",
      },
      projection_state: {
        docs_synced_at: "2026-04-21T00:01:00Z",
        status_synced_at: "2026-04-21T00:02:00Z",
        pr_body_synced_at: "2026-04-21T00:03:00Z",
      },
    };
    const statusProjection = projectCanonicalCloseoutToStatusFields(closeout);

    writeFileSync(
      join(rootDir, ".workflow-v2/work-items/06-recipe-to-planner.json"),
      `${JSON.stringify(
        {
          ...JSON.parse(readRepoFile("docs/engineering/workflow-v2/templates/work-item.example.json")),
          id: "06-recipe-to-planner",
          verification: {
            required_checks: ["targeted-vitest", "docs-consistency-review"],
            verify_commands: ["pnpm test -- workflow-v2"],
            evaluator_commands: [],
            artifact_assertions: [],
          },
          closeout,
        },
        null,
        2,
      )}\n`,
    );

    writeFileSync(
      join(rootDir, ".workflow-v2/status.json"),
      `${JSON.stringify(
        {
          version: 1,
          project_profile: "homecook",
          updated_at: "2026-04-21T00:05:00Z",
          items: [
            {
              id: "06-recipe-to-planner",
              preset: "infra-governance",
              branch: "feature/omo-phase2-closeout-projection",
              pr_path: "pending",
              lifecycle: statusProjection?.lifecycle,
              approval_state: statusProjection?.approval_state,
              verification_status: statusProjection?.verification_status,
              evaluation_status: "not_started",
              evaluation_round: 0,
              last_evaluator_result: null,
              auto_merge_eligible: false,
              blocked_reason_code: null,
              required_checks: ["targeted-vitest", "docs-consistency-review"],
              notes: [
                "canonical closeout seeded for projection contract test",
                ...(statusProjection?.note_fragments ?? []),
              ].join("; "),
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const results = validateWorkflowV2TrackedState({ rootDir });
    const trackedStatus = results.find((result) => result.name === "tracked-status");

    expect(trackedStatus?.errors).toEqual([
      {
        path: ".workflow-v2/work-items/06-recipe-to-planner.json.closeout.verification_projection.actual_verification_refs",
        message:
          "Canonical closeout human-surface projection requires actual_verification_refs once closeout phase reaches projecting/completed.",
      },
      {
        path: ".workflow-v2/work-items/06-recipe-to-planner.json.closeout.verification_projection.authority_reports",
        message:
          "Canonical closeout human-surface projection requires authority_reports when design_authority is passed.",
      },
    ]);
  });
});
