import { describe, expect, it } from "vitest";

import {
  buildOperatorGuidance,
  formatBriefStatus,
  formatFullStatus,
} from "../scripts/lib/omo-status-summary.mjs";

describe("OMO status summary", () => {
  it("extracts validator and failure path details from closeout reconcile wait reasons", () => {
    const operatorGuidance = buildOperatorGuidance({
      active_stage: 6,
      current_stage: 6,
      blocked_stage: 6,
      phase: "closeout_reconcile_check",
      next_action: "noop",
      wait: {
        kind: "human",
        stage: 6,
        reason:
          "internal 6.5 closeout_reconcile blocked: real-smoke-presence:06-recipe-to-planner PR_BODY:## Actual Verification: Actual Verification must reference the declared external_smokes entries: pnpm test:e2e:oauth",
      },
      execution: {
        stage_result_path: "/tmp/artifacts/06/stage-result.json",
      },
      last_artifact_dir: "/tmp/artifacts/06",
    });

    expect(operatorGuidance).toMatchObject({
      source: "wait",
      reasonCode: "closeout_reconcile_blocked",
      remediationState: "blocked",
      validatorName: "real-smoke-presence:06-recipe-to-planner",
      failurePath: "PR_BODY:## Actual Verification",
      artifactPath: "/tmp/artifacts/06/stage-result.json",
    });
    expect(operatorGuidance.nextRecommendation).toContain("Actual Verification");
  });

  it("formats full and brief status output with operator-facing diagnostics", () => {
    const status = {
      workItemId: "06-recipe-to-planner",
      slice: "06-recipe-to-planner",
      trackedWorkItem: {
        status: {
          lifecycle: "ready_for_review",
          approval_state: "codex_approved",
        },
      },
      trackedStatus: null,
      runtime: {
        active_stage: 6,
        current_stage: 6,
        last_completed_stage: 5,
        blocked_stage: 6,
        phase: "closeout_reconcile_check",
        next_action: "noop",
        sessions: {
          claude_primary: {
            session_id: null,
            provider: null,
          },
          codex_primary: {
            session_id: "ses_codex",
            provider: "opencode",
          },
        },
        workspace: {
          branch_role: "frontend",
        },
        prs: {
          backend: null,
          frontend: {
            url: "https://example.com/pr/1",
          },
          closeout: {
            url: "https://example.com/pr/2",
          },
        },
        wait: {
          kind: "human",
          stage: 6,
          reason:
            "internal 6.5 closeout_reconcile requires a separate docs-governance path: docs/engineering/workflow-v2/README.md: source-of-truth drift",
        },
        recovery: null,
        execution: {
          stage_result_path: "/tmp/artifacts/06/stage-result.json",
        },
        last_artifact_dir: "/tmp/artifacts/06",
      },
      operatorGuidance: {
        source: "wait",
        reasonCode: "closeout_reconcile_docs_governance_required",
        remediationState: "blocked",
        validatorName: null,
        failurePath: "docs/engineering/workflow-v2/README.md",
        artifactPath: "/tmp/artifacts/06/stage-result.json",
        nextRecommendation: "별도 docs-governance PR로 분리하세요.",
      },
    };

    expect(formatFullStatus(status)).toContain(
      "Reason code: closeout_reconcile_docs_governance_required",
    );
    expect(formatFullStatus(status)).toContain("Next recommendation: 별도 docs-governance PR로 분리하세요.");
    expect(formatBriefStatus(status)).toContain(
      "reasonCode      : closeout_reconcile_docs_governance_required",
    );
    expect(formatBriefStatus(status)).toContain(
      "recommendation  : 별도 docs-governance PR로 분리하세요.",
    );
  });
});
