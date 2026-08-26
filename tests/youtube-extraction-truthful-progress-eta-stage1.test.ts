import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const sliceId = "youtube-extraction-truthful-progress-eta";

function read(relativePath: string) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function readJson(relativePath: string) {
  return JSON.parse(read(relativePath));
}

describe("YouTube truthful progress ETA Stage 1 contract", () => {
  const readme = read(`docs/workpacks/${sliceId}/README.md`);
  const acceptance = read(`docs/workpacks/${sliceId}/acceptance.md`);
  const automation = readJson(`docs/workpacks/${sliceId}/automation-spec.json`);
  const workItem = readJson(`.workflow-v2/work-items/${sliceId}.json`);
  const workflowStatus = readJson(".workflow-v2/status.json");
  const status = workflowStatus.items.find(
    (item: { id: string }) => item.id === sliceId,
  );

  it("locks the current official tuple and merged predecessor", () => {
    const exactTuple = "1.7.34 / 1.5.38 / 1.3.36 / 1.3.36 / 1.2.41";
    const predecessor = "youtube-async-extraction-notification";

    expect(readme).toContain(exactTuple);
    expect(acceptance).toContain(exactTuple);
    expect(workItem.dependencies).toEqual(
      expect.arrayContaining([
        expect.stringContaining(predecessor),
        expect.stringContaining("merged"),
        expect.stringContaining("official tuple"),
      ]),
    );
    expect(read("docs/workpacks/README.md")).toMatch(
      /\| `youtube-extraction-truthful-progress-eta` \| docs \|/u,
    );
  });

  it("keeps the progress contract truthful and additive", () => {
    const scopedContract = [readme, acceptance, JSON.stringify(workItem)].join("\n");

    for (const requiredSnippet of [
      "`queued=0`, `source_fetch=10`, `video_download=25`, `frame_extraction=45`, `model_analysis=65`, `finalizing=90`",
      "active confirmed floor는 최대 90이고 active UI는 95를 넘지 않는다. `succeeded일 때만 100`이다.",
      "첫 release는 promotion gate 전 numeric ETA를 숨기고 `예상 시간 계산 중`을 사용한다.",
      "status success data의 nullable `progress` key",
      "attempt당 최대 5행",
      "`applied=false`, write 0",
      "progress 기록 실패가 extraction/finalize를 failed로 바꾸지 않는다.",
      "기존 5초 polling",
      "새 public endpoint, WebSocket/SSE, ML, 새 npm/pnpm 의존성은 없다",
    ]) {
      expect(scopedContract).toContain(requiredSnippet);
    }
  });

  it("classifies the existing progress UI change as low risk with a fresh evidence root", () => {
    expect(readme).toContain("UI risk: `low-risk`");
    expect(readme).toContain("기존 `YT_IMPORT_BACKGROUND` progress surface 내부 교체");
    expect(readme).toContain(
      "ui/designs/evidence/youtube-extraction-truthful-progress-eta/",
    );
    expect(readme).not.toContain(
      "ui/designs/evidence/youtube-async-extraction-notification/",
    );

    expect(automation.frontend.design_authority).toMatchObject({
      ui_risk: "low-risk",
      generator_required: false,
      critic_required: false,
      authority_required: false,
    });
    expect(automation.frontend.design_authority.stage4_evidence_requirements).toEqual(
      expect.arrayContaining([
        "browser-progress-regression",
        "eta-copy-regression",
        "320-390-desktop-screenshots",
      ]),
    );
  });

  it("uses local stage1 validation first and defers validate:workpack to post-merge preflight", () => {
    const currentCommands = workItem.verification.stage1_current_commands;
    const postMergePreflight =
      "BRANCH_NAME=feature/be-youtube-extraction-truthful-progress-eta pnpm validate:workpack -- --slice youtube-extraction-truthful-progress-eta";

    expect(workItem.verification.required_checks).toEqual(currentCommands);
    expect(workItem.verification.verify_commands).toEqual(currentCommands);
    expect(status.required_checks).toEqual(currentCommands);
    expect(currentCommands).toEqual(
      expect.arrayContaining([
        "pnpm validate:source-of-truth-sync",
        "pnpm validate:workflow-v2",
        "node scripts/validate-automation-spec.mjs --slice youtube-extraction-truthful-progress-eta",
        "pnpm validate:omo-bookkeeping",
        expect.stringContaining("evaluateDocGate"),
        expect.stringContaining(
          "tests/youtube-extraction-truthful-progress-eta-stage1.test.ts",
        ),
      ]),
    );
    expect(
      currentCommands.some((command: string) =>
        command.includes("validate:workpack"),
      ),
    ).toBe(false);

    expect(workItem.verification.stage2_post_merge_preflight).toEqual([
      postMergePreflight,
    ]);
    expect(workItem.verification.full_lifecycle_checks).toContain(
      postMergePreflight,
    );
    expect(automation.backend.verify_commands[0]).toBe(postMergePreflight);
    expect(readme).toContain("## Stage 1 Validation Boundary");
    expect(readme).toContain(postMergePreflight);
  });

  it("projects planned docs-only stage1 bookkeeping while keeping implementation manual-only follow-ups explicit", () => {
    expect(automation.execution_mode).toBe("autonomous");
    expect(workItem.workflow.execution_mode).toBe("autonomous");
    expect(automation.external_smokes).toEqual([
      "isolated-local-single-public-url-canary-after-same-sha-preflight",
    ]);
    expect(workItem.workflow.external_smokes).toEqual(
      automation.external_smokes,
    );
    expect(workItem.status).toMatchObject({
      lifecycle: "planned",
      approval_state: "not_started",
      verification_status: "pending",
      evaluation_status: "not_started",
      evaluation_round: 0,
      blocked_reason_code: null,
    });
    expect(status).toMatchObject({
      lifecycle: "planned",
      approval_state: "not_started",
      verification_status: "pending",
      evaluation_status: "not_started",
      evaluation_round: 0,
      blocked_reason_code: null,
    });

    const manualOnlyScope = [readme, acceptance, workItem.notes].join("\n");
    for (const requiredSnippet of [
      "Supabase Cloud/linked/remote target은 N/A/forbidden",
      "operational full-local destructive reset 0",
      "release-promoter",
      "production rollout",
      "Manual Only",
    ]) {
      expect(manualOnlyScope).toContain(requiredSnippet);
    }
  });

  it("locks the worker boundary, schema promotion, and ETA calibration gates", () => {
    const scopedContract = [readme, acceptance, JSON.stringify(workItem)].join("\n");

    for (const requiredSnippet of [
      "youtube-extraction-worker-schema-v2",
      "video_duration_seconds`는 `1..86400",
      "successful stage telemetry 최소 50개",
      "duration bucket별 최소 10개",
      "holdout coverage `>=80%`",
      "대표 duration bucket을 포함한 isolated/golden successful run 최소 20개",
      "non-blocking ordered queue",
      "finalize 전 최대 2초 bounded flush",
      "기존 30초 IPC timeout을 progress stage마다 기다리지 않는다",
      "heartbeat/permit fence loss는 계속 fatal",
      "extract-video-frames.py",
      "실제 source video 준비 완료 뒤에만 `frame_extraction`",
    ]) {
      expect(scopedContract).toContain(requiredSnippet);
    }

    expect(scopedContract).not.toContain(
      '"post-rollout-first-30-terminal-jobs-aggregate-review"',
    );
  });
});
