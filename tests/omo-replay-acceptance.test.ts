import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import { updateReplayAcceptance } from "../scripts/lib/omo-replay-acceptance.mjs";

function writeFixture(rootDir: string) {
  mkdirSync(join(rootDir, ".workflow-v2"), { recursive: true });
  writeFileSync(
    join(rootDir, ".workflow-v2", "replay-acceptance.json"),
    JSON.stringify(
      {
        version: 1,
        target: "OMO v2",
        updated_at: "2026-04-21T00:00:00.000Z",
        lanes: [
          {
            id: "slice06-authority-replay",
            label: "Slice06 authority replay",
            status: "pending",
            required: true,
            work_item_refs: ["docs/workpacks/06-recipe-to-planner/README.md"],
            incident_ids: ["OMO-06-001"],
            evidence_refs: [],
            criteria: {
              manual_runtime_json_edit_free: false,
              stale_lock_manual_clear_free: false,
              stale_ci_snapshot_manual_fix_free: false,
              canonical_closeout_validated: false,
              auditor_result_recorded: false,
            },
            notes: "pending",
          },
        ],
        summary: {
          status: "not-started",
          blocking_lane_ids: ["slice06-authority-replay"],
          notes: "pending",
        },
      },
      null,
      2,
    ),
  );
}

function readReplayAcceptance(rootDir: string) {
  return JSON.parse(readFileSync(join(rootDir, ".workflow-v2", "replay-acceptance.json"), "utf8"));
}

describe("OMO replay acceptance update", () => {
  it("updates a replay lane and appends evidence refs and incident ids", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-replay-acceptance-"));
    writeFixture(rootDir);

    const result = updateReplayAcceptance({
      rootDir,
      section: "lane",
      id: "slice06-authority-replay",
      status: "in_progress",
      note: "slice06 replay running",
      evidenceRefs: [".artifacts/meta-harness-auditor/slice06-replay/report.md"],
      incidentIds: ["OMO-06-002"],
      now: "2026-04-22T10:00:00.000Z",
    });

    const updated = readReplayAcceptance(rootDir);

    expect(result.updatedEntry.status).toBe("in_progress");
    expect(updated.updated_at).toBe("2026-04-22T10:00:00.000Z");
    expect(updated.lanes[0].evidence_refs).toEqual([
      ".artifacts/meta-harness-auditor/slice06-replay/report.md",
    ]);
    expect(updated.lanes[0].incident_ids).toEqual(["OMO-06-001", "OMO-06-002"]);
  });

  it("updates lane criteria and can mark a replay lane pass", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-replay-acceptance-"));
    writeFixture(rootDir);

    updateReplayAcceptance({
      rootDir,
      section: "lane",
      id: "slice06-authority-replay",
      status: "pass",
      note: "slice06 replay passed",
      criteria: {
        manual_runtime_json_edit_free: true,
        stale_lock_manual_clear_free: true,
        stale_ci_snapshot_manual_fix_free: true,
        canonical_closeout_validated: true,
        auditor_result_recorded: true,
      },
    });

    const updated = readReplayAcceptance(rootDir);

    expect(updated.lanes[0].status).toBe("pass");
    expect(updated.lanes[0].criteria).toEqual({
      manual_runtime_json_edit_free: true,
      stale_lock_manual_clear_free: true,
      stale_ci_snapshot_manual_fix_free: true,
      canonical_closeout_validated: true,
      auditor_result_recorded: true,
    });
  });

  it("updates replay summary status and blockers", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-replay-acceptance-"));
    writeFixture(rootDir);

    updateReplayAcceptance({
      rootDir,
      section: "summary",
      status: "in_progress",
      note: "slice06 replay in progress",
      blockingLaneIds: ["slice07-fullstack-replay"],
    });

    const updated = readReplayAcceptance(rootDir);

    expect(updated.summary.status).toBe("in_progress");
    expect(updated.summary.blocking_lane_ids).toEqual(["slice07-fullstack-replay"]);
    expect(updated.summary.notes).toBe("slice06 replay in progress");
  });

  it("rejects unknown replay lane ids", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-replay-acceptance-"));
    writeFixture(rootDir);

    expect(() =>
      updateReplayAcceptance({
        rootDir,
        section: "lane",
        id: "missing-lane",
        status: "pass",
      }),
    ).toThrow("Unknown replay lane id");
  });
});
