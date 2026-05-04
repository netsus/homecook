import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  readActiveIncidentBlockerIds,
  syncPromotionGateWithReplayAcceptance,
  updatePromotionEvidence,
} from "../scripts/lib/omo-promotion-evidence.mjs";

function writeFixture(rootDir: string) {
  mkdirSync(join(rootDir, ".workflow-v2"), { recursive: true });
  writeFileSync(
    join(rootDir, ".workflow-v2", "promotion-evidence.json"),
    JSON.stringify(
      {
        version: 1,
        target: "OMO v2",
        updated_at: "2026-04-14T00:00:00.000Z",
        canonical_policy: "v1",
        execution_mode: "promotion-candidate",
        documentation_gates: [
          {
            id: "promotion-checklist",
            status: "pass",
            notes: "exists",
            evidence_refs: ["docs/engineering/workflow-v2/promotion-readiness.md"],
          },
        ],
        operational_gates: [
          {
            id: "live-smoke-standard",
            status: "partial",
            notes: "still on-demand",
            evidence_refs: [".opencode/README.md"],
          },
        ],
        pilot_lanes: [
          {
            id: "authority-required-ui",
            label: "Authority lane",
            status: "in_progress",
            required: true,
            notes: "slice06 running",
            workpack_refs: ["docs/workpacks/06-recipe-to-planner/README.md"],
            checkpoint_refs: ["stage2-complete"],
          },
        ],
        promotion_gate: {
          status: "not-ready",
          blockers: ["authority lane not passed"],
          next_review_trigger: "After slice06 Stage 4",
          notes: "blocked",
        },
      },
      null,
      2,
    ),
  );
}

function writeReplayAcceptanceFixture(rootDir: string) {
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
            status: "pass",
            required: true,
          },
        ],
        summary: {
          status: "pass",
          blocking_lane_ids: [],
        },
      },
      null,
      2,
    ),
  );
}

function writeIncidentRegistry(rootDir: string, body: string) {
  mkdirSync(join(rootDir, "docs", "engineering", "workflow-v2"), { recursive: true });
  writeFileSync(join(rootDir, "docs", "engineering", "workflow-v2", "omo-incident-registry.md"), body);
}

function readPromotionEvidence(rootDir: string) {
  return JSON.parse(readFileSync(join(rootDir, ".workflow-v2", "promotion-evidence.json"), "utf8"));
}

describe("OMO promotion evidence update", () => {
  it("updates pilot lanes and appends workpack/checkpoint refs", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-promotion-evidence-"));
    writeFixture(rootDir);

    const result = updatePromotionEvidence({
      rootDir,
      section: "pilot-lane",
      id: "authority-required-ui",
      status: "partial",
      note: "slice06 Stage 4 ready-for-review audit captured",
      checkpointRefs: ["stage4-ready-for-review"],
      workpackRefs: ["docs/workpacks/06-recipe-to-planner/README.md"],
      now: "2026-04-14T10:00:00.000Z",
    });

    const updated = readPromotionEvidence(rootDir);

    expect(result.updatedEntry.status).toBe("partial");
    expect(updated.updated_at).toBe("2026-04-14T10:00:00.000Z");
    expect(updated.pilot_lanes[0].checkpoint_refs).toEqual(["stage2-complete", "stage4-ready-for-review"]);
  });

  it("updates operational gates and appends evidence refs", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-promotion-evidence-"));
    writeFixture(rootDir);

    updatePromotionEvidence({
      rootDir,
      section: "operational-gate",
      id: "live-smoke-standard",
      status: "pass",
      note: "live smoke standard locked",
      evidenceRefs: ["docs/engineering/workflow-v2/promotion-readiness.md"],
    });

    const updated = readPromotionEvidence(rootDir);
    expect(updated.operational_gates[0].status).toBe("pass");
    expect(updated.operational_gates[0].evidence_refs).toEqual(
      expect.arrayContaining([".opencode/README.md", "docs/engineering/workflow-v2/promotion-readiness.md"]),
    );
  });

  it("updates promotion gate status and blockers", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-promotion-evidence-"));
    writeFixture(rootDir);

    updatePromotionEvidence({
      rootDir,
      section: "promotion-gate",
      status: "candidate",
      note: "ready for final review",
      blockers: ["scheduler standard pending"],
      nextReviewTrigger: "After bugfix pilot",
    });

    const updated = readPromotionEvidence(rootDir);
    expect(updated.promotion_gate.status).toBe("candidate");
    expect(updated.promotion_gate.blockers).toEqual(["scheduler standard pending"]);
    expect(updated.promotion_gate.next_review_trigger).toBe("After bugfix pilot");
  });

  it("keeps promotion gate not-ready when replay passes but active OMO incidents remain", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-promotion-evidence-"));
    writeFixture(rootDir);
    writeReplayAcceptanceFixture(rootDir);
    writeIncidentRegistry(
      rootDir,
      [
        "# OMO Incident Registry",
        "",
        "### OMO-07-003",
        "- status: `open`",
        "- boundary: `omo-system`",
        "- symptom: stale lock remained open.",
        "",
        "### PROD-07-001",
        "- status: `open`",
        "- boundary: `product-local`",
        "- symptom: product-only issue.",
        "",
      ].join("\n"),
    );

    const result = syncPromotionGateWithReplayAcceptance({
      rootDir,
      now: "2026-05-05T00:00:00.000Z",
    });
    const updated = readPromotionEvidence(rootDir);

    expect(readActiveIncidentBlockerIds(rootDir)).toEqual(["OMO-07-003"]);
    expect(result.updated).toBe(true);
    expect(result.activeIncidentBlockerIds).toEqual(["OMO-07-003"]);
    expect(updated.promotion_gate.status).toBe("not-ready");
    expect(updated.promotion_gate.blockers).toEqual(["active incident blockers: OMO-07-003"]);
  });

  it("reads an active incident when the registry has only one final section", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-promotion-evidence-"));
    writeIncidentRegistry(
      rootDir,
      [
        "# OMO Incident Registry",
        "",
        "### OMO-07-007",
        "- status: `open`",
        "- boundary: `omo-system`",
        "- symptom: operator visibility gap.",
        "",
      ].join("\n"),
    );

    expect(readActiveIncidentBlockerIds(rootDir)).toEqual(["OMO-07-007"]);
  });

  it("does not downgrade promotion gate once replay passes and incidents are dispositioned", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-promotion-evidence-"));
    writeFixture(rootDir);
    writeReplayAcceptanceFixture(rootDir);
    writeIncidentRegistry(
      rootDir,
      [
        "# OMO Incident Registry",
        "",
        "### OMO-07-003",
        "- status: `closed-by-replay`",
        "- boundary: `omo-system`",
        "- symptom: stale lock replay passed.",
        "",
      ].join("\n"),
    );
    updatePromotionEvidence({
      rootDir,
      section: "promotion-gate",
      status: "candidate",
      note: "ready for final review",
      clearBlockers: true,
    });

    const result = syncPromotionGateWithReplayAcceptance({
      rootDir,
      now: "2026-05-05T00:00:00.000Z",
    });

    expect(result.updated).toBe(false);
    expect(result.activeIncidentBlockerIds).toEqual([]);
    expect(readPromotionEvidence(rootDir).promotion_gate.status).toBe("candidate");
  });

  it("rejects unknown lane ids", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-promotion-evidence-"));
    writeFixture(rootDir);

    expect(() =>
      updatePromotionEvidence({
        rootDir,
        section: "pilot-lane",
        id: "missing-lane",
        status: "pass",
      }),
    ).toThrow("Unknown pilot-lane id");
  });
});
