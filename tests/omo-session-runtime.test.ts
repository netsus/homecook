import { mkdtempSync } from "node:fs";
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
});
