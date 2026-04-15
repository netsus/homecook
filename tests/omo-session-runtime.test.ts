import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { readRuntimeState, writeRuntimeState } from "../scripts/lib/omo-session-runtime.mjs";

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
});
