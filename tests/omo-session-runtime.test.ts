import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  acquireRuntimeLock,
  markStageRunning,
  readRuntimeState,
  setWaitState,
  writeRuntimeState,
} from "../scripts/lib/omo-session-runtime.mjs";

describe("OMO session runtime", () => {
  it("normalizes design authority state and authority_precheck subphase", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-session-runtime-"));

    writeRuntimeState({
      rootDir,
      workItemId: "06-recipe-to-planner",
      state: {
        slice: "06-recipe-to-planner",
        active_stage: 4,
        current_stage: 4,
        workspace: {
          path: "/tmp/worktree",
          branch_role: "frontend",
        },
        execution: {
          provider: "opencode",
          session_role: "codex_primary",
          session_id: "ses_codex",
          artifact_dir: "/tmp/artifacts",
          stage_result_path: "/tmp/artifacts/stage-result.json",
          pr_role: "frontend",
          subphase: "authority_precheck",
        },
        design_authority: {
          status: "prechecked",
          ui_risk: "anchor-extension",
          anchor_screens: ["RECIPE_DETAIL", "PLANNER_WEEK"],
          required_screens: ["RECIPE_DETAIL"],
          authority_required: true,
          authority_report_paths: ["ui/designs/authority/RECIPE_DETAIL-authority.md"],
          evidence_artifact_refs: ["ui/designs/evidence/06/RECIPE_DETAIL-mobile.png"],
          authority_verdict: "conditional-pass",
          blocker_count: 0,
          major_count: 2,
          minor_count: 1,
          reviewed_screen_ids: ["RECIPE_DETAIL"],
          source_stage: 4,
        },
      },
    });

    const { state } = readRuntimeState({
      rootDir,
      workItemId: "06-recipe-to-planner",
      slice: "06-recipe-to-planner",
    });

    expect(state.execution?.subphase).toBe("authority_precheck");
    expect(state.design_authority).toMatchObject({
      status: "prechecked",
      ui_risk: "anchor-extension",
      authority_required: true,
      authority_verdict: "conditional-pass",
      reviewed_screen_ids: ["RECIPE_DETAIL"],
    });
  });

  it("normalizes final_authority_gate as a valid execution subphase", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-session-runtime-"));

    writeRuntimeState({
      rootDir,
      workItemId: "06-recipe-to-planner",
      state: {
        slice: "06-recipe-to-planner",
        active_stage: 5,
        current_stage: 5,
        workspace: {
          path: "/tmp/worktree",
          branch_role: "frontend",
        },
        execution: {
          provider: "claude-cli",
          session_role: "claude_primary",
          session_id: "ses_claude_authority",
          artifact_dir: "/tmp/artifacts",
          stage_result_path: "/tmp/artifacts/stage-result.json",
          pr_role: "frontend",
          subphase: "final_authority_gate",
        },
      },
    });

    const { state } = readRuntimeState({
      rootDir,
      workItemId: "06-recipe-to-planner",
      slice: "06-recipe-to-planner",
    });

    expect(state.execution?.subphase).toBe("final_authority_gate");
    expect(state.execution?.session_role).toBe("claude_primary");
  });

  it("does not resurrect a prior stage artifact as the next stage execution", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-session-runtime-"));
    const artifactDir = join(
      rootDir,
      ".artifacts",
      "omo-lite-dispatch",
      "2026-04-13T14-45-44-561Z-06-recipe-to-planner-stage-1",
    );
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      join(artifactDir, "stage-result.json"),
      JSON.stringify(
        {
          result: "done",
          summary_markdown: "stage1 done",
          commit: { subject: "docs: stage1" },
          pr: {
            title: "docs: stage1",
            body_markdown: "## Summary\n- docs",
          },
          checks_run: [],
          next_route: "open_pr",
          claimed_scope: {
            files: ["docs/workpacks/06-recipe-to-planner/README.md"],
            endpoints: [],
            routes: [],
            states: [],
            invariants: [],
          },
          changed_files: ["docs/workpacks/06-recipe-to-planner/README.md"],
          tests_touched: [],
          artifacts_written: [],
          checklist_updates: [],
          contested_fix_ids: [],
          rebuttals: [],
        },
        null,
        2,
      ),
    );

    writeRuntimeState({
      rootDir,
      workItemId: "06-recipe-to-planner",
      state: {
        slice: "06-recipe-to-planner",
        active_stage: 2,
        current_stage: 2,
        last_completed_stage: 1,
        last_artifact_dir: artifactDir,
        workspace: {
          path: "/tmp/worktree",
          branch_role: "backend",
        },
        wait: {
          kind: "ready_for_next_stage",
          stage: 2,
        },
        execution: null,
      },
    });

    const { state } = readRuntimeState({
      rootDir,
      workItemId: "06-recipe-to-planner",
      slice: "06-recipe-to-planner",
    });

    expect(state.phase).toBe("wait");
    expect(state.execution).toBeNull();
  });

  it("prefers wait state over stale stored phase residue", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-session-runtime-"));

    writeRuntimeState({
      rootDir,
      workItemId: "08a-meal-add-search-core",
      state: {
        slice: "08a-meal-add-search-core",
        active_stage: 3,
        current_stage: 3,
        phase: "stage_running",
        next_action: "run_stage",
        wait: {
          kind: "ready_for_next_stage",
          stage: 3,
          pr_role: "backend",
          updated_at: "2026-04-23T17:22:25.467Z",
        },
        execution: {
          provider: "claude-cli",
          session_role: "claude_primary",
          session_id: "ses_claude_stage3",
          artifact_dir: "/tmp/artifacts",
          stage_result_path: "/tmp/artifacts/stage-result.json",
          pr_role: "backend",
          started_at: "2026-04-23T17:22:25.820Z",
        },
      },
    });

    const { state } = readRuntimeState({
      rootDir,
      workItemId: "08a-meal-add-search-core",
      slice: "08a-meal-add-search-core",
    });

    expect(state.phase).toBe("wait");
    expect(state.next_action).toBe("run_stage");
    expect(state.wait?.kind).toBe("ready_for_next_stage");
  });

  it("allows reclaiming a stale wait-state lock residue", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-session-runtime-"));
    const workItemId = "08a-meal-add-search-core";

    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        slice: workItemId,
        active_stage: 3,
        current_stage: 3,
        wait: {
          kind: "ready_for_next_stage",
          stage: 3,
          pr_role: "backend",
          updated_at: "2026-04-23T17:22:25.467Z",
        },
        phase: "stage_running",
        next_action: "run_stage",
        lock: {
          owner: "omo-supervisor-old",
          acquired_at: "2026-04-23T17:22:22.441Z",
        },
      },
    });

    const result = acquireRuntimeLock({
      rootDir,
      workItemId,
      owner: "omo-supervisor-new",
      now: "2026-04-24T05:00:00.000Z",
      slice: workItemId,
    });

    expect(result.state.lock?.owner).toBe("omo-supervisor-new");

    const { state } = readRuntimeState({
      rootDir,
      workItemId,
      slice: workItemId,
    });
    expect(state.lock?.owner).toBe("omo-supervisor-new");
    expect(state.phase).toBe("wait");
  });

  it("preserves an active lock when a stage-running update omits the lock field", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-session-runtime-"));
    const workItemId = "10a-shopping-detail-interact";

    acquireRuntimeLock({
      rootDir,
      workItemId,
      owner: "omo-supervisor-live",
      now: "2026-04-26T13:44:27.712Z",
      slice: workItemId,
    });

    writeRuntimeState({
      rootDir,
      workItemId,
      state: {
        slice: workItemId,
        active_stage: 2,
        current_stage: 2,
        last_completed_stage: 1,
        phase: "stage_running",
        next_action: "run_stage",
        execution: {
          provider: "opencode",
          session_role: "codex_primary",
          session_id: "ses_codex",
          artifact_dir: "/tmp/artifacts",
          stage_result_path: "/tmp/artifacts/stage-result.json",
          pr_role: "backend",
          subphase: "implementation",
        },
      },
    });

    const { state } = readRuntimeState({
      rootDir,
      workItemId,
      slice: workItemId,
    });

    expect(state.phase).toBe("stage_running");
    expect(state.lock).toMatchObject({
      owner: "omo-supervisor-live",
      acquired_at: "2026-04-26T13:44:27.712Z",
    });
  });

  it("clears stale wait state when marking a stage as running", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-session-runtime-"));
    const workItemId = "10a-shopping-detail-interact";

    acquireRuntimeLock({
      rootDir,
      workItemId,
      owner: "omo-supervisor-live",
      now: "2026-04-26T14:02:58.454Z",
      slice: workItemId,
    });

    const { state: lockedState } = readRuntimeState({
      rootDir,
      workItemId,
      slice: workItemId,
    });

    writeRuntimeState({
      rootDir,
      workItemId,
      state: markStageRunning({
        state: {
          ...lockedState,
          active_stage: 3,
          current_stage: 3,
          last_completed_stage: 2,
          wait: {
            kind: "ready_for_next_stage",
            pr_role: "backend",
            stage: 3,
            head_sha: "backend-head",
            updated_at: "2026-04-26T14:02:58.096Z",
          },
        },
        stage: 3,
        artifactDir: "/tmp/artifacts",
        provider: "claude-cli",
        sessionRole: "claude_primary",
        sessionId: "ses_claude",
        stageResultPath: "/tmp/artifacts/stage-result.json",
        prRole: "backend",
        startedAt: "2026-04-26T14:02:58.454Z",
      }),
    });

    const { state } = readRuntimeState({
      rootDir,
      workItemId,
      slice: workItemId,
    });

    expect(state.phase).toBe("stage_running");
    expect(state.wait).toBeNull();
    expect(state.lock?.owner).toBe("omo-supervisor-live");
  });

  it("does not resurrect stage2 implementation artifacts while doc_gate_review is pending", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-session-runtime-"));
    const artifactDir = join(
      rootDir,
      ".artifacts",
      "omo-lite-dispatch",
      "2026-04-13T15-24-48-018Z-06-recipe-to-planner-stage-2",
    );
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      join(artifactDir, "stage-result.json"),
      JSON.stringify(
        {
          result: "done",
          summary_markdown: "doc gate repair done",
          commit: { subject: "docs: repair" },
          pr: {
            title: "docs: repair",
            body_markdown: "## Summary\n- repair",
          },
          checks_run: [],
          next_route: "open_pr",
          claimed_scope: {
            files: ["docs/workpacks/06-recipe-to-planner/README.md"],
            endpoints: [],
            routes: [],
            states: [],
            invariants: [],
          },
          changed_files: ["docs/workpacks/06-recipe-to-planner/README.md"],
          tests_touched: [],
          artifacts_written: [],
          resolved_doc_finding_ids: ["doc1"],
          contested_doc_fix_ids: ["doc2"],
          rebuttals: [
            {
              fix_id: "doc2",
              rationale_markdown: "docs-only scope",
              evidence_refs: ["docs/workpacks/06-recipe-to-planner/README.md"],
            },
          ],
        },
        null,
        2,
      ),
    );

    writeRuntimeState({
      rootDir,
      workItemId: "06-recipe-to-planner",
      state: {
        slice: "06-recipe-to-planner",
        active_stage: 2,
        current_stage: 2,
        last_completed_stage: 1,
        last_artifact_dir: artifactDir,
        workspace: {
          path: "/tmp/worktree",
          branch_role: "docs",
        },
        doc_gate: {
          status: "awaiting_review",
          repair_branch: "docs/06-recipe-to-planner-repair",
        },
        wait: null,
        execution: null,
      },
    });

    const { state } = readRuntimeState({
      rootDir,
      workItemId: "06-recipe-to-planner",
      slice: "06-recipe-to-planner",
    });

    expect(state.phase).toBeNull();
    expect(state.execution).toBeNull();
    expect(state.doc_gate?.status).toBe("awaiting_review");
  });

  it("normalizes doc gate review findings into the canonical finding shape", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-session-runtime-"));

    writeRuntimeState({
      rootDir,
      workItemId: "07-meal-manage",
      state: {
        slice: "07-meal-manage",
        active_stage: 2,
        current_stage: 2,
        workspace: {
          path: "/tmp/worktree",
          branch_role: "docs",
        },
        doc_gate: {
          status: "fixable",
          findings: [],
          last_review: {
            decision: "request_changes",
            route_back_stage: 2,
            approved_head_sha: null,
            body_markdown: "## Review\n- docs",
            reviewed_doc_finding_ids: ["doc-gate-primary-cta"],
            required_doc_fix_ids: ["doc-gate-primary-cta"],
            waived_doc_fix_ids: [],
            findings: [
              {
                file: "ui/designs/MEAL_SCREEN.md",
                severity: "major",
                category: "contract",
                issue: "Primary CTA keyword is missing.",
                suggestion: "Name the bottom CTA as the primary CTA.",
              },
            ],
          },
        },
      },
    });

    const { state } = readRuntimeState({
      rootDir,
      workItemId: "07-meal-manage",
      slice: "07-meal-manage",
    });

    expect(state.doc_gate?.last_review?.findings).toEqual([
      {
        id: "doc-gate-primary-cta",
        category: "contract",
        severity: "major",
        message: "Primary CTA keyword is missing.",
        evidence_paths: ["ui/designs/MEAL_SCREEN.md"],
        remediation_hint: "Name the bottom CTA as the primary CTA.",
        fixable: true,
      },
    ]);
  });

  it("classifies PR body drift as codex repairable before human escalation", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-session-runtime-"));
    const baseState = readRuntimeState({
      rootDir,
      workItemId: "10b-shopping-share-text",
      slice: "10b-shopping-share-text",
    }).state;

    writeRuntimeState({
      rootDir,
      workItemId: "10b-shopping-share-text",
      state: setWaitState({
        state: baseState,
        kind: "human_escalation",
        prRole: "frontend",
        stage: 6,
        headSha: "abc123",
        reason: "PR body required section missing: Merge Gate",
        repairAttemptCount: 0,
        maxRepairAttempts: 1,
        evidenceRefs: ["pull-request-body"],
        updatedAt: "2026-04-27T20:00:00+09:00",
      }),
    });

    const { state } = readRuntimeState({
      rootDir,
      workItemId: "10b-shopping-share-text",
      slice: "10b-shopping-share-text",
    });

    expect(state.wait).toMatchObject({
      kind: "codex_repairable",
      reason_code: "codex_repairable",
      reason_detail_code: "pr_body_section_drift",
      reason_category: "codex_repairable",
      repair_attempt_count: 0,
      max_repair_attempts: 1,
      evidence_refs: ["pull-request-body"],
    });
    expect(state.phase).toBe("wait");
    expect(state.next_action).toBe("noop");
  });

  it("allows human escalation after codex repair attempts are exhausted", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-session-runtime-"));
    const baseState = readRuntimeState({
      rootDir,
      workItemId: "11-shopping-reorder",
      slice: "11-shopping-reorder",
    }).state;

    writeRuntimeState({
      rootDir,
      workItemId: "11-shopping-reorder",
      state: setWaitState({
        state: baseState,
        kind: "human_escalation",
        prRole: "frontend",
        stage: 6,
        reason: "Checklist evidence artifact is still missing after repair.",
        repairAttemptCount: 1,
        maxRepairAttempts: 1,
        updatedAt: "2026-04-27T20:05:00+09:00",
      }),
    });

    const { state } = readRuntimeState({
      rootDir,
      workItemId: "11-shopping-reorder",
      slice: "11-shopping-reorder",
    });

    expect(state.wait).toMatchObject({
      kind: "human_escalation",
      reason_code: "codex_repairable",
      reason_detail_code: "checklist_evidence_drift",
      reason_category: "codex_repairable_exhausted",
      repair_attempt_count: 1,
      max_repair_attempts: 1,
    });
  });

  it("classifies manual decision reasons without overloading human escalation", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-session-runtime-"));
    const baseState = readRuntimeState({
      rootDir,
      workItemId: "12a-shopping-complete",
      slice: "12a-shopping-complete",
    }).state;

    writeRuntimeState({
      rootDir,
      workItemId: "12a-shopping-complete",
      state: setWaitState({
        state: baseState,
        kind: "human_escalation",
        stage: 2,
        reason: "Public contract change requires explicit user approval.",
        updatedAt: "2026-04-27T20:10:00+09:00",
      }),
    });

    const { state } = readRuntimeState({
      rootDir,
      workItemId: "12a-shopping-complete",
      slice: "12a-shopping-complete",
    });

    expect(state.wait).toMatchObject({
      kind: "manual_decision_required",
      reason_code: "manual_decision_required",
      reason_detail_code: "public_contract_change",
      reason_category: "manual_decision_required",
    });
  });

  it("classifies stale CI snapshots as CI wait instead of human escalation", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-session-runtime-"));
    const baseState = readRuntimeState({
      rootDir,
      workItemId: "10b-shopping-share-text",
      slice: "10b-shopping-share-text",
    }).state;

    writeRuntimeState({
      rootDir,
      workItemId: "10b-shopping-share-text",
      state: setWaitState({
        state: baseState,
        kind: "human_escalation",
        prRole: "frontend",
        stage: 6,
        headSha: "def456",
        reason: "Stale CI snapshot: current-head checks are still pending.",
        updatedAt: "2026-04-27T20:15:00+09:00",
      }),
    });

    const { state } = readRuntimeState({
      rootDir,
      workItemId: "10b-shopping-share-text",
      slice: "10b-shopping-share-text",
    });

    expect(state.wait).toMatchObject({
      kind: "ci",
      reason_code: "ci_wait",
      reason_detail_code: "stale_ci_snapshot",
      reason_category: "ci_wait",
      pr_role: "frontend",
      stage: 6,
      head_sha: "def456",
    });
    expect(state.next_action).toBe("poll_ci");
  });
});
