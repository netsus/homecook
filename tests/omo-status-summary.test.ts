import { describe, expect, it } from "vitest";

import {
  buildOperatorGuidance,
  buildRuntimeObservability,
  formatBriefStatus,
  formatFullStatus,
} from "../scripts/lib/omo-status-summary.mjs";

describe("OMO status summary", () => {
  it("classifies stale stage_running locks as runtime stale candidates", () => {
    const runtimeObservability = buildRuntimeObservability(
      {
        active_stage: 3,
        current_stage: 3,
        phase: "stage_running",
        next_action: "run_stage",
        lock: {
          owner: "omo-supervisor-1012",
          acquired_at: "2026-04-20T09:00:00.000Z",
        },
        execution: {
          started_at: "2026-04-20T09:00:05.000Z",
          provider: "claude-cli",
          session_role: "claude_primary",
        },
      },
      {
        now: "2026-04-20T10:15:00.000Z",
      },
    );

    expect(runtimeObservability).toMatchObject({
      status: "running_stale_candidate",
      staleCandidate: true,
      lockOwner: "omo-supervisor-1012",
    });
    expect(runtimeObservability.detail).toContain("lock held by omo-supervisor-1012");
    expect(runtimeObservability.recommendation).toContain("stale residue");
  });

  it("classifies blocked retries that are already due", () => {
    const runtimeObservability = buildRuntimeObservability(
      {
        active_stage: 4,
        current_stage: 4,
        blocked_stage: 4,
        phase: "wait",
        next_action: "run_stage",
        wait: {
          kind: "blocked_retry",
          stage: 4,
          updated_at: "2026-04-20T09:20:00.000Z",
        },
        retry: {
          at: "2026-04-20T09:30:00.000Z",
          reason: "claude_budget_unavailable",
        },
      },
      {
        now: "2026-04-20T10:15:00.000Z",
      },
    );

    expect(runtimeObservability).toMatchObject({
      status: "retry_due",
      retryAt: "2026-04-20T09:30:00.000Z",
    });
    expect(runtimeObservability.recommendation).toContain("omo:tick");
  });

  it("classifies non-running locks as residue", () => {
    const runtimeObservability = buildRuntimeObservability(
      {
        active_stage: 6,
        current_stage: 6,
        phase: "merge_pending",
        next_action: "merge_pr",
        lock: {
          owner: "manual-lock",
          acquired_at: "2026-04-20T09:45:00.000Z",
        },
      },
      {
        now: "2026-04-20T10:15:00.000Z",
      },
    );

    expect(runtimeObservability).toMatchObject({
      status: "lock_residue",
      staleCandidate: true,
      lockOwner: "manual-lock",
    });
    expect(runtimeObservability.detail).toContain("phase=merge_pending");
  });

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
      runtimeObservability: {
        status: "blocked_human",
        detail: "human wait for 25m",
        retryAt: null,
        lockAge: null,
        waitAge: "25m",
      },
    };

    expect(formatFullStatus(status)).toContain(
      "Reason code: closeout_reconcile_docs_governance_required",
    );
    expect(formatFullStatus(status)).toContain("Next recommendation: 별도 docs-governance PR로 분리하세요.");
    expect(formatFullStatus(status)).toContain("Runtime signal: blocked_human");
    expect(formatFullStatus(status)).toContain("Runtime detail: human wait for 25m");
    expect(formatBriefStatus(status)).toContain(
      "reasonCode      : closeout_reconcile_docs_governance_required",
    );
    expect(formatBriefStatus(status)).toContain(
      "recommendation  : 별도 docs-governance PR로 분리하세요.",
    );
    expect(formatBriefStatus(status)).toContain("runtimeSignal   : blocked_human");
    expect(formatBriefStatus(status)).toContain("runtimeDetail   : human wait for 25m");
  });
});
