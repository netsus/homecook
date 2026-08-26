import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  const absolutePath = resolve(root, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

const officialTuple = {
  requirements: "docs/요구사항기준선-v1.7.34.md",
  screens: "docs/화면정의서-v1.5.38.md",
  flow: "docs/유저flow맵-v1.3.36.md",
  db: "docs/db설계-v1.3.36.md",
  api: "docs/api문서-v1.2.41.md",
} as const;

const contractDocuments = [
  ...Object.values(officialTuple).map(read),
  read("docs/sync/CURRENT_SOURCE_OF_TRUTH.md"),
];

describe("YouTube truthful extraction progress contract evolution", () => {
  it("records the approved additive contract in every official document", () => {
    const source = read("docs/sync/CURRENT_SOURCE_OF_TRUTH.md");

    for (const path of Object.values(officialTuple)) {
      expect(source).toContain(`\`${path}\``);
    }

    expect(read(officialTuple.requirements)).toContain("# 요구사항 기준선 v1.7.34");
    expect(read(officialTuple.screens)).toContain("# 화면정의서 v1.5.38");
    expect(read(officialTuple.flow)).toContain("# 유저 Flow맵 v1.3.36");
    expect(read(officialTuple.db)).toContain("# DB 설계 v1.3.36");
    expect(read(officialTuple.api)).toContain("# API\\_설계\\_v1.2.41");

    for (const document of contractDocuments) {
      expect(document).toContain(
        "2026-08-27 contract-evolution — YouTube 실제 단계 진행바와 남은 시간 범위",
      );
      expect(document).toContain(
        "youtube-extraction-truthful-progress-eta-plan-20260826.md",
      );
      expect(document).toContain(
        "e3bf440a3708b50e2430f1f2fda770fbe2a1f30bdaf3eb79fb6237affd5bbe60",
      );
      expect(document).toContain("신규 endpoint/status/error 없음");
    }
  });

  it("locks the six public stages and confirmed floor semantics", () => {
    const publicStages = [
      ["queued", "0"],
      ["source_fetch", "10"],
      ["video_download", "25"],
      ["frame_extraction", "45"],
      ["model_analysis", "65"],
      ["finalizing", "90"],
    ];

    for (const document of contractDocuments) {
      for (const [stage, floor] of publicStages) {
        expect(document).toContain(stage);
        expect(document).toContain(floor);
      }
      expect(document).toContain("confirmed_percent");
      expect(document).toContain("시간만으로 증가하지 않는다");
      expect(document).toContain("active UI는 95를 넘지 않는다");
      expect(document).toContain("succeeded일 때만 100");
    }
  });

  it("adds one exact active-job progress object without changing terminal projections", () => {
    const api = read(officialTuple.api);

    for (const field of [
      "attempt",
      "stage",
      "confirmed_percent",
      "updated_at",
      "remaining_seconds_low",
      "remaining_seconds_high",
      "estimate_confidence",
      "delayed",
    ]) {
      expect(api).toContain(field);
    }

    expect(api).toContain("queued|processing + progress snapshot 존재");
    expect(api).toContain("terminal `succeeded|failed|expired`는 `progress=null`");
    expect(api).toContain("legacy active snapshot 없음");
    expect(api).toContain("remaining_seconds_low <= remaining_seconds_high");
    expect(api).toContain("upper를 넘으면");
    expect(api).toContain("`delayed=true`");
  });

  it("keeps progress storage private, bounded, monotonic, and stale-write safe", () => {
    const db = read(officialTuple.db);
    const requirements = read(officialTuple.requirements);

    for (const field of [
      "progress_attempt",
      "progress_stage",
      "progress_stage_started_at",
      "progress_updated_at",
      "video_duration_seconds",
    ]) {
      expect(db).toContain(field);
    }

    expect(db).toContain("private.youtube_extraction_progress_stage_events");
    expect(db).toContain("(job_id, attempt, stage)");
    expect(db).toContain("attempt당 최대 5행");
    expect(db).toContain("historical row는 전부 null");
    expect(db).toContain("같은 attempt");
    expect(db).toContain("뒤로 갈 수 없다");
    expect(db).toContain("stale");
    expect(db).toContain("write 0");
    expect(db).toContain("browser");
    expect(db).toContain("direct read/write는 0");
    expect(requirements).toContain(
      "progress 기록 실패가 레시피 추출 성공·실패를 바꾸지 않는다",
    );
  });

  it("locks range, calculating, and delayed UI while reusing five-second polling", () => {
    const screens = read(officialTuple.screens);
    const flow = read(officialTuple.flow);

    for (const document of [screens, flow]) {
      expect(document).toContain("약 2~4분 남음");
      expect(document).toContain("예상 시간 계산 중");
      expect(document).toContain(
        "예상보다 오래 걸리고 있어요. 추출은 계속 진행 중이에요.",
      );
      expect(document).toContain("5초 polling");
      expect(document).toContain("새로고침");
      expect(document).toContain("다시 분석 중 (2/3)");
    }

    expect(screens).toContain("aria-valuenow");
    expect(screens).toContain("aria-valuetext");
    expect(screens).toContain("reduced-motion");
  });

  it("rejects overengineering and preserves rollback compatibility", () => {
    const requirements = read(officialTuple.requirements);
    const source = read("docs/sync/CURRENT_SOURCE_OF_TRUTH.md");

    for (const document of [requirements, source]) {
      expect(document).toContain("WebSocket/SSE");
      expect(document).toContain("ML");
      expect(document).toContain("새 public endpoint");
      expect(document).toContain("새 npm/pnpm 의존성");
      expect(document).toContain("기존 5초 polling");
      expect(document).toContain("이전 client");
      expect(document).toContain("숫자 ETA만 숨긴다");
    }
  });
});
