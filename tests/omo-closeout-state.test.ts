import { describe, expect, it } from "vitest";

import {
  planCanonicalCloseoutDocSurfaceRepair,
  projectCanonicalCloseoutToDocSurfaceSyncContract,
  projectCanonicalCloseoutToHumanSurfacePayload,
  projectCanonicalCloseoutToPrBodySections,
  projectCanonicalCloseoutToStatusFields,
  validateHumanSurfaceProjectionContract,
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
  repair_summary: {
    codex_repairable_count: 3,
    claude_repairable_count: 1,
    manual_decision_required_count: 0,
    human_escalation_count: 0,
    post_merge_stale_count: 1,
    latest_reason_code: "post_merge_stale",
    evidence_sources: ["dispatch", ".omx/artifacts"],
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
        "closeout_repair=codex:3|claude:1|manual_decision:0|human_escalation:0|post_merge_stale:1|sources:dispatch,.omx/artifacts",
        "last_recovery_at=2026-04-21T00:00:00Z",
      ],
    });
  });

  it("projects canonical closeout fields to the human-facing closeout surface payload", () => {
    expect(
      projectCanonicalCloseoutToHumanSurfacePayload(closeoutSnapshot, {
        workItemId: "06-recipe-to-planner",
      }),
    ).toEqual({
      phase: "completed",
      canonical_source: ".workflow-v2/work-items/06-recipe-to-planner.json#closeout",
      readme: {
        roadmap_lifecycle: "merged",
        design_status: "confirmed",
        delivery_checklist: "complete",
        design_authority: "passed",
      },
      acceptance: {
        status: "complete",
        docs_synced_at: "2026-04-21T00:01:00Z",
      },
      pr_body: {
        actual_verification: {
          required_checks: "passed",
          external_smokes: "passed",
          authority_reports: [".artifacts/authority/report.md"],
          actual_verification_refs: ["PR Actual Verification"],
        },
        closeout_sync: {
          roadmap_lifecycle: "merged",
          design_status: "confirmed",
          delivery_checklist: "complete",
          design_authority: "passed",
          acceptance: "complete",
          automation_spec_metadata: "synced",
        },
        merge_gate: {
          current_head_sha: "abc1234",
          approval_state: "dual_approved",
          all_checks_green: true,
        },
      },
      sync_state: {
        docs_synced_at: "2026-04-21T00:01:00Z",
        status_synced_at: "2026-04-21T00:02:00Z",
        pr_body_synced_at: "2026-04-21T00:03:00Z",
      },
      recovery_summary: {
        manual_patch_count: 1,
        manual_handoff: true,
        stale_lock_count: 2,
        ci_resync_count: 1,
        artifact_missing: true,
        last_recovery_at: "2026-04-21T00:00:00Z",
      },
      repair_summary: {
        codex_repairable_count: 3,
        claude_repairable_count: 1,
        manual_decision_required_count: 0,
        human_escalation_count: 0,
        post_merge_stale_count: 1,
        latest_reason_code: "post_merge_stale",
        evidence_sources: ["dispatch", ".omx/artifacts"],
      },
    });
  });

  it("projects canonical closeout fields to PR body Closeout Sync and Merge Gate sections", () => {
    expect(
      projectCanonicalCloseoutToPrBodySections(closeoutSnapshot, {
        workItemId: "06-recipe-to-planner",
      }),
    ).toEqual({
      closeout_sync: [
        "- canonical closeout source: `.workflow-v2/work-items/06-recipe-to-planner.json#closeout`",
        "- roadmap status: `merged`",
        "- README Delivery Checklist: `complete`",
        "- acceptance: `complete`",
        "- Design Status: `confirmed`",
        "- Design Authority: `passed`",
        "- automation-spec closeout metadata: `synced`",
        "- repair summary: codex=`3`, claude=`1`, manual_decision=`0`, human_escalation=`0`, post_merge_stale=`1`",
        "- repair evidence sources: `dispatch`, `.omx/artifacts`",
        "- projection sync state: docs=`2026-04-21T00:01:00Z`, PR body=`2026-04-21T00:03:00Z`",
      ].join("\n"),
      merge_gate: [
        "- canonical closeout source: `.workflow-v2/work-items/06-recipe-to-planner.json#closeout`",
        "- current head SHA: `abc1234`",
        "- approval state: `dual_approved`",
        "- required checks projection: `passed`",
        "- all checks completed green: 예",
        "- started PR checks: canonical closeout snapshot does not own the check list; current head GitHub checks로 재확인 필요",
      ].join("\n"),
    });
  });

  it("projects canonical closeout fields to the current README and acceptance sync contract", () => {
    expect(
      projectCanonicalCloseoutToDocSurfaceSyncContract(
        {
          ...closeoutSnapshot,
          docs_projection: {
            ...closeoutSnapshot.docs_projection,
            roadmap_lifecycle: "ready_for_review",
            design_status: "pending-review",
            delivery_checklist: "waived",
            design_authority: "pending",
            acceptance: "waived",
          },
        },
        {
          workItemId: "06-recipe-to-planner",
        },
      ),
    ).toEqual({
      canonical_source: ".workflow-v2/work-items/06-recipe-to-planner.json#closeout",
      readme: {
        roadmap_status: "in-progress",
        design_status: "pending-review",
        delivery_checklist_status: "complete",
        design_authority_status: "required",
      },
      acceptance: {
        status: "complete",
      },
      sync_state: {
        docs_synced_at: "2026-04-21T00:01:00Z",
      },
    });
  });

  it("plans current-vocabulary doc-surface repair actions from the canonical closeout snapshot", () => {
    expect(
      planCanonicalCloseoutDocSurfaceRepair({
        closeout: {
          ...closeoutSnapshot,
          docs_projection: {
            ...closeoutSnapshot.docs_projection,
            roadmap_lifecycle: "ready_for_review",
            design_status: "N/A",
            design_authority: "not_required",
          },
        },
        workItemId: "06-recipe-to-planner",
        currentSurface: {
          readme: {
            roadmap_status: "planned",
            design_status: "confirmed",
            delivery_checklist_status: "pending",
            design_authority_status: "required",
          },
          acceptance: {
            status: "pending",
          },
        },
      }),
    ).toEqual({
      canonical_source: ".workflow-v2/work-items/06-recipe-to-planner.json#closeout",
      repair_actions: [
        { kind: "roadmap_status", targetStatus: "in-progress" },
        { kind: "design_status", targetStatus: "N/A" },
        { kind: "delivery_checklist_closeout", targetStatus: "complete" },
        { kind: "design_authority_status", targetStatus: "not-required" },
        { kind: "acceptance_closeout", targetStatus: "complete" },
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
          "manual note; closeout_phase=completed; closeout_recovery=manual_patch:1|stale_lock:2|ci_resync:1|manual_handoff|artifact_missing; closeout_repair=codex:3|claude:1|manual_decision:0|human_escalation:0|post_merge_stale:1|sources:dispatch,.omx/artifacts; last_recovery_at=2026-04-21T00:00:00Z",
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
          "Canonical closeout note projection missing fragment: closeout_repair=codex:3|claude:1|manual_decision:0|human_escalation:0|post_merge_stale:1|sources:dispatch,.omx/artifacts",
      },
      {
        path: ".workflow-v2/status.json.items.06-recipe-to-planner.notes",
        message:
          "Canonical closeout note projection missing fragment: last_recovery_at=2026-04-21T00:00:00Z",
      },
    ]);
  });

  it("rejects incomplete human-surface projection snapshots once closeout reaches completed", () => {
    const errors = validateHumanSurfaceProjectionContract({
      workItemId: "06-recipe-to-planner",
      closeout: {
        ...closeoutSnapshot,
        docs_projection: {
          ...closeoutSnapshot.docs_projection,
          delivery_checklist: "pending",
          acceptance: "pending",
        },
        verification_projection: {
          ...closeoutSnapshot.verification_projection,
          required_checks: "pending",
          authority_reports: [],
          actual_verification_refs: [],
        },
      },
      pathPrefix: ".workflow-v2/work-items/06-recipe-to-planner.json.closeout",
    });

    expect(errors).toEqual([
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
      {
        path: ".workflow-v2/work-items/06-recipe-to-planner.json.closeout.merge_gate_projection.all_checks_green",
        message:
          "Canonical closeout merge gate projection cannot mark all_checks_green=true unless required_checks=passed.",
      },
      {
        path: ".workflow-v2/work-items/06-recipe-to-planner.json.closeout.docs_projection.delivery_checklist",
        message:
          "Canonical closeout completed phase cannot keep README Delivery Checklist pending.",
      },
      {
        path: ".workflow-v2/work-items/06-recipe-to-planner.json.closeout.docs_projection.acceptance",
        message:
          "Canonical closeout completed phase cannot keep acceptance pending.",
      },
    ]);
  });

  it("keeps the .closeout path segment when pathPrefix is omitted", () => {
    const errors = validateHumanSurfaceProjectionContract({
      workItemId: "06-recipe-to-planner",
      closeout: {
        ...closeoutSnapshot,
        verification_projection: {
          ...closeoutSnapshot.verification_projection,
          authority_reports: [],
          actual_verification_refs: [],
        },
      },
    });

    expect(errors).toEqual([
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

  it("requires retained repair evidence sources when a completed closeout records repair activity", () => {
    const errors = validateHumanSurfaceProjectionContract({
      workItemId: "10b-shopping-share-text",
      closeout: {
        ...closeoutSnapshot,
        repair_summary: {
          ...closeoutSnapshot.repair_summary,
          evidence_sources: [],
        },
      },
    });

    expect(errors).toEqual([
      {
        path: ".workflow-v2/work-items/10b-shopping-share-text.json.closeout.repair_summary.evidence_sources",
        message:
          "Canonical closeout repair summary requires evidence_sources when repair/manual/stale counts are non-zero.",
      },
    ]);
  });
});
