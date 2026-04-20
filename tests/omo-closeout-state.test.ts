import { describe, expect, it } from "vitest";

import {
  projectCanonicalCloseoutToStatusFields,
  validateStatusItemAgainstCanonicalCloseout,
} from "../scripts/lib/omo-closeout-state.mjs";

const closeoutSnapshot = {
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
    authority_reports: [".artifacts/authority/report.md"],
    actual_verification_refs: ["PR Actual Verification"],
  },
  merge_gate_projection: {
    current_head_sha: "abc1234",
    approval_state: "dual_approved",
    all_checks_green: true,
  },
  recovery_summary: {
    manual_patch_count: 1,
    manual_handoff: true,
    stale_lock_count: 2,
    ci_resync_count: 1,
    artifact_missing: true,
    last_recovery_at: "2026-04-21T00:00:00Z",
  },
  projection_state: {
    docs_synced_at: "2026-04-21T00:01:00Z",
    status_synced_at: "2026-04-21T00:02:00Z",
    pr_body_synced_at: "2026-04-21T00:03:00Z",
  },
};

describe("omo canonical closeout state", () => {
  it("projects canonical closeout fields to tracked status summary", () => {
    expect(projectCanonicalCloseoutToStatusFields(closeoutSnapshot)).toEqual({
      lifecycle: "merged",
      approval_state: "dual_approved",
      verification_status: "passed",
      note_fragments: [
        "closeout_phase=completed",
        "closeout_recovery=manual_patch:1|stale_lock:2|ci_resync:1|manual_handoff|artifact_missing",
        "last_recovery_at=2026-04-21T00:00:00Z",
      ],
    });
  });

  it("accepts a status item that already matches the canonical closeout projection", () => {
    const errors = validateStatusItemAgainstCanonicalCloseout({
      statusItem: {
        id: "06-recipe-to-planner",
        lifecycle: "merged",
        approval_state: "dual_approved",
        verification_status: "passed",
        notes:
          "manual note; closeout_phase=completed; closeout_recovery=manual_patch:1|stale_lock:2|ci_resync:1|manual_handoff|artifact_missing; last_recovery_at=2026-04-21T00:00:00Z",
      },
      closeout: closeoutSnapshot,
      pathPrefix: ".workflow-v2/status.json.items.06-recipe-to-planner",
    });

    expect(errors).toEqual([]);
  });

  it("reports mismatches when tracked status drifts from the canonical closeout snapshot", () => {
    const errors = validateStatusItemAgainstCanonicalCloseout({
      statusItem: {
        id: "06-recipe-to-planner",
        lifecycle: "ready_for_review",
        approval_state: "codex_approved",
        verification_status: "pending",
        notes: "manual note only",
      },
      closeout: closeoutSnapshot,
      pathPrefix: ".workflow-v2/status.json.items.06-recipe-to-planner",
    });

    expect(errors).toEqual([
      {
        path: ".workflow-v2/status.json.items.06-recipe-to-planner.lifecycle",
        message: "Canonical closeout lifecycle projection mismatch.",
      },
      {
        path: ".workflow-v2/status.json.items.06-recipe-to-planner.approval_state",
        message: "Canonical closeout approval projection mismatch.",
      },
      {
        path: ".workflow-v2/status.json.items.06-recipe-to-planner.verification_status",
        message: "Canonical closeout verification projection mismatch.",
      },
      {
        path: ".workflow-v2/status.json.items.06-recipe-to-planner.notes",
        message:
          "Canonical closeout note projection missing fragment: closeout_phase=completed",
      },
      {
        path: ".workflow-v2/status.json.items.06-recipe-to-planner.notes",
        message:
          "Canonical closeout note projection missing fragment: closeout_recovery=manual_patch:1|stale_lock:2|ci_resync:1|manual_handoff|artifact_missing",
      },
      {
        path: ".workflow-v2/status.json.items.06-recipe-to-planner.notes",
        message:
          "Canonical closeout note projection missing fragment: last_recovery_at=2026-04-21T00:00:00Z",
      },
    ]);
  });
});
