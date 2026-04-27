import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { generateOmoSliceReport } from "../scripts/lib/omo-slice-report.mjs";

function writeJson(filePath: string, value: unknown) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function seedDispatchRun({
  rootDir,
  slice,
  startedSlug,
  stage,
  endedAt,
  stageResult,
  runMetadata = {},
}: {
  rootDir: string;
  slice: string;
  startedSlug: string;
  stage: number;
  endedAt: string;
  stageResult: Record<string, unknown>;
  runMetadata?: Record<string, unknown>;
}) {
  const dir = join(rootDir, ".artifacts", "omo-lite-dispatch", `${startedSlug}-${slice}-stage-${stage}`);
  mkdirSync(dir, { recursive: true });
  const metadataPath = join(dir, "run-metadata.json");
  writeJson(metadataPath, {
    slice,
    stage,
    stageResultPath: join(dir, "stage-result.json"),
    ...runMetadata,
  });
  writeJson(join(dir, "stage-result.json"), stageResult);
  const ended = new Date(endedAt);
  utimesSync(metadataPath, ended, ended);
}

describe("OMO slice report", () => {
  it("generates a compact efficiency report from dispatch and supervisor artifacts", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-slice-report-"));
    const slice = "10-demo-slice";

    mkdirSync(join(rootDir, "docs", "workpacks", slice), { recursive: true });
    writeJson(join(rootDir, ".workflow-v2", "status.json"), {
      version: 1,
      project_profile: "homecook",
      updated_at: "2026-04-26T00:40:00.000Z",
      items: [
        {
          id: slice,
          lifecycle: "merged",
          approval_state: "dual_approved",
          verification_status: "passed",
        },
      ],
    });
    seedDispatchRun({
      rootDir,
      slice,
      startedSlug: "2026-04-26T00-00-00-000Z",
      stage: 1,
      endedAt: "2026-04-26T00:05:00.000Z",
      stageResult: {
        result: "pass",
        pr: { title: "docs: demo slice" },
      },
    });
    seedDispatchRun({
      rootDir,
      slice,
      startedSlug: "2026-04-26T00-10-00-000Z",
      stage: 2,
      endedAt: "2026-04-26T00:20:00.000Z",
      stageResult: {
        result: "pass",
        pr: { title: "feat: demo backend" },
      },
    });
    seedDispatchRun({
      rootDir,
      slice,
      startedSlug: "2026-04-26T00-25-00-000Z",
      stage: 4,
      endedAt: "2026-04-26T00:28:00.000Z",
      stageResult: {
        result: "done",
        summary_markdown: "Codex rerun fixed evaluator findings.",
      },
      runMetadata: {
        execution: {
          provider: "opencode",
          mode: "execute",
          commandArgs: [
            "# frontend evaluator remediation\n\n## Required fixes\n- [major] Required frontend route is missing from claimed_scope.routes: /demo -> Declare the route.\n- [major] Required frontend artifact assertion was not satisfied: trace.zip -> Write artifact evidence.\n## Done",
          ],
        },
      },
    });
    seedDispatchRun({
      rootDir,
      slice,
      startedSlug: "2026-04-26T00-30-00-000Z",
      stage: 4,
      endedAt: "2026-04-26T00:31:00.000Z",
      stageResult: {
        result: "done",
        summary_markdown: "Codex recovered from a non-human runner failure.",
      },
      runMetadata: {
        execution: {
          provider: "opencode",
          mode: "process-failure",
          reason: "opencode run failed with exit code null.",
          commandArgs: [],
        },
      },
    });
    writeJson(join(rootDir, ".artifacts", "omo-supervisor", "2026-04-26T00-21-00-000Z-10-demo-slice", "summary.json"), {
      workItemId: slice,
      slice,
      transitions: [],
      wait: {
        kind: "human_escalation",
        stage: 2,
        reason: "backend evaluator returned blocked with 1 finding(s).",
        updated_at: "2026-04-26T00:21:00.000Z",
      },
    });
    writeJson(join(rootDir, ".artifacts", "omo-supervisor", "2026-04-26T00-22-00-000Z-10-demo-slice", "summary.json"), {
      workItemId: slice,
      slice,
      transitions: [],
      wait: {
        kind: "manual_decision_required",
        stage: 5,
        reason: "Credential-gated smoke requires a human decision.",
        reason_code: "manual_decision_required",
        reason_detail_code: "credential_gated",
        updated_at: "2026-04-26T00:22:00.000Z",
      },
    });
    writeJson(join(rootDir, ".artifacts", "omo-supervisor", "2026-04-26T00-39-00-000Z-10-demo-slice", "summary.json"), {
      workItemId: slice,
      slice,
      transitions: [],
      wait: {
        kind: "ci_wait",
        stage: 6,
        reason: "Post-merge stale current-head snapshot was refreshed.",
        reason_code: "post_merge_stale",
        reason_detail_code: "post_merge_stale",
        updated_at: "2026-04-26T00:39:00.000Z",
      },
    });

    const result = generateOmoSliceReport({
      rootDir,
      workItemId: slice,
      runtime: {
        phase: "done",
        prs: {
          frontend: {
            number: 321,
            url: "https://github.com/netsus/homecook/pull/321",
          },
        },
      },
      now: "2026-04-26T00:40:00.000Z",
    });

    expect(result.reportPath).toBe(join(rootDir, "docs", "workpacks", slice, "omo-report.md"));
    expect(existsSync(result.reportPath)).toBe(true);
    expect(result.supervisorWaitEvents).toHaveLength(3);
    expect(result.repairSummaryProjection).toEqual({
      codex_repairable_count: 3,
      claude_repairable_count: 0,
      manual_decision_required_count: 1,
      human_escalation_count: 1,
      post_merge_stale_count: 1,
      latest_reason_code: "post_merge_stale",
      evidence_sources: ["dispatch", "supervisor"],
    });
    const report = readFileSync(result.reportPath, "utf8");
    expect(report).toContain("# OMO Efficiency Report: 10-demo-slice");
    expect(report).toContain("| report_mode | generated |");
    expect(report).toContain("| 최종 상태 | merged / dual_approved / passed |");
    expect(report).toContain("| 최종 PR | #321 |");
    expect(report).toContain("| 순수 진행 누적시간 | 19.0분 |");
    expect(report).toContain("| 1 docs | 5.0분 | 1 |");
    expect(report).toContain("| 2 backend | 10.0분 | 1 |");
    expect(report).toContain("| 4 frontend | 4.0분 | 2 |");
    expect(report).toContain("| human_escalation | 1회 |");
    expect(report).toContain("| manual_decision_required | 1회 |");
    expect(report).toContain("| Codex/Claude 자동 수정 오류 | 3회 |");
    expect(report).toContain("| post-merge stale | 1회 |");
    expect(report).toContain("| evidence_source | dispatch, supervisor |");
    expect(report).toContain("backend evaluator returned blocked");
    expect(report).toContain("## Manual Decision Required");
    expect(report).toContain("Credential-gated smoke requires a human decision.");
    expect(report).toContain("## Post-Merge Stale Events");
    expect(report).toContain("Post-merge stale current-head snapshot was refreshed.");
    expect(report).toContain("## Codex/Claude-Resolved Non-Human Errors");
    expect(report).toContain("Required frontend route is missing");
    expect(report).toContain("opencode run failed with exit code null.");
  });

  it("uses .omx artifacts as report evidence when dispatch artifacts are absent", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "omo-slice-report-omx-"));
    const slice = "10b-shopping-share-text";

    mkdirSync(join(rootDir, "docs", "workpacks", slice), { recursive: true });
    writeJson(join(rootDir, ".workflow-v2", "status.json"), {
      version: 1,
      project_profile: "homecook",
      updated_at: "2026-04-27T08:20:00.000Z",
      items: [
        {
          id: slice,
          lifecycle: "merged",
          approval_state: "approved",
          verification_status: "passed",
        },
      ],
    });

    const artifactsDir = join(rootDir, ".omx", "artifacts");
    mkdirSync(artifactsDir, { recursive: true });
    writeFileSync(
      join(
        artifactsDir,
        "claude-delegate-10b-shopping-share-text-stage1-repair-response-20260427T164100KST.md",
      ),
      [
        "## Stage 1 Repair Complete: 10b-shopping-share-text",
        "",
        "### Repaired Findings",
        "- Frontend route path drift fixed.",
      ].join("\n"),
    );
    writeFileSync(
      join(artifactsDir, "stage6-10b-shopping-share-text-pr-review-20260427T171247KST.md"),
      [
        "# Stage 6 PR Review: 10b-shopping-share-text",
        "",
        "- reviewer: Codex",
        "- result: approve",
      ].join("\n"),
    );

    const result = generateOmoSliceReport({
      rootDir,
      workItemId: slice,
      runtime: {
        phase: "done",
        prs: {
          frontend: {
            number: 231,
            url: "https://github.com/netsus/homecook/pull/231",
          },
        },
      },
      now: "2026-04-27T08:20:00.000Z",
    });

    expect(result.dispatchRuns).toHaveLength(0);
    expect(result.omxArtifactEvents).toHaveLength(2);
    expect(result.repairSummaryProjection).toMatchObject({
      codex_repairable_count: 0,
      claude_repairable_count: 1,
      manual_decision_required_count: 0,
      human_escalation_count: 0,
      post_merge_stale_count: 0,
      latest_reason_code: "repair_attempt",
      evidence_sources: [".omx/artifacts"],
    });

    const report = readFileSync(result.reportPath, "utf8");
    expect(report).toContain("| report_mode | generated |");
    expect(report).toContain("| evidence_source | .omx/artifacts |");
    expect(report).toContain("| Codex/Claude 자동 수정 오류 | 1회 |");
    expect(report).toContain("## Evidence Sources");
    expect(report).toContain("| .omx/artifacts | 2 | 1, 6 |");
    expect(report).toContain("## Codex/Claude-Resolved Non-Human Errors");
    expect(report).toContain("Stage 1 Repair Complete: 10b-shopping-share-text");
    expect(report).toContain(
      ".omx/artifacts/claude-delegate-10b-shopping-share-text-stage1-repair-response-20260427T164100KST.md",
    );
  });
});
