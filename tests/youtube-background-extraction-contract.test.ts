import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function markdownTableBodyRowsAfter(text: string, heading: string) {
  const headingIndex = text.indexOf(heading);
  expect(headingIndex).toBeGreaterThanOrEqual(0);

  const lines = text.slice(headingIndex + heading.length).split("\n");
  const firstTableLine = lines.findIndex((line) => line.trimStart().startsWith("|"));
  expect(firstTableLine).toBeGreaterThanOrEqual(0);

  const contiguousTableLines: string[] = [];
  for (const line of lines.slice(firstTableLine)) {
    if (!line.trimStart().startsWith("|")) break;
    contiguousTableLines.push(line);
  }

  return contiguousTableLines.slice(2);
}

function markdownTableCellsAfter(text: string, heading: string) {
  return markdownTableBodyRowsAfter(text, heading).map((row) =>
    row
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim().replaceAll("`", "")),
  );
}

const officialTuple = [
  "docs/요구사항기준선-v1.7.31.md",
  "docs/화면정의서-v1.5.35.md",
  "docs/유저flow맵-v1.3.33.md",
  "docs/db설계-v1.3.33.md",
  "docs/api문서-v1.2.38.md",
];

describe("YouTube background extraction contract evolution", () => {
  it("promotes one consistent additive five-document tuple", () => {
    const source = read("docs/sync/CURRENT_SOURCE_OF_TRUTH.md");

    for (const relativePath of officialTuple) {
      expect(source).toContain(`\`${relativePath}\``);
      expect(read(relativePath)).toContain("2026-08-12 contract-evolution");
    }

    expect(read(officialTuple[0])).toContain("# 요구사항 기준선 v1.7.31");
    expect(read(officialTuple[1])).toContain("# 화면정의서 v1.5.35");
    expect(read(officialTuple[2])).toContain("# 유저 Flow맵 v1.3.33");
    expect(read(officialTuple[3])).toContain("# DB 설계 v1.3.33");
    expect(read(officialTuple[4])).toContain("v1.2.38");
  });

  it("records approval, public impact, exclusions, and rejected alternatives", () => {
    const source = read("docs/sync/CURRENT_SOURCE_OF_TRUTH.md");
    const requirements = read(officialTuple[0]);

    for (const text of [source, requirements]) {
      expect(text).toContain("019ff4f7-806c-7151-b646-cab784606cde");
      expect(text).toContain("PASS");
      expect(text).toContain("신규 보호 endpoint 6개");
      expect(text).toMatch(/Rejected alternatives|rejected alternatives/);
    }

    expect(source).toContain("제품 구현");
    expect(source).toContain("신규 async workpack");
    expect(source).toContain("자기 문서를 최종 승인하거나 merge하지 않는다");
  });

  it("locks the six public endpoints, states, wrappers, dedupe, and Quick Import compatibility", () => {
    const api = read(officialTuple[4]);
    const endpoints = [
      "POST /recipes/youtube/extraction-jobs",
      "GET /recipes/youtube/extraction-jobs/{job_id}",
      "GET /recipes/youtube/extractions/{extraction_id}",
      "GET /users/me/youtube-extraction-jobs",
      "POST /users/me/youtube-extraction-jobs/delivered",
      "POST /users/me/youtube-extraction-jobs/seen",
    ];

    for (const endpoint of endpoints) {
      expect(api).toContain(endpoint);
    }

    expect(api).toContain("202 Accepted");
    expect(api).toContain("queued | processing | succeeded | failed | expired");
    expect(api).toContain("{ success, data, error }");
    expect(api).toContain("(completed_at DESC, job_id DESC)");
    expect(api).toContain("deduplicated=true");
    expect(api).toContain("503 QUEUE_BUSY");
    expect(api).toContain("504 EXTRACTION_TIMEOUT");
    expect(api).toContain("Quick Import UI·auto-register 의미는 유지");
    expect(api).toContain("엔드포인트 전체 목록 (108개) `v1.2.38`");
    expect(api).toContain("active 107개 + 삭제된 `2-4` tombstone 1개");
  });

  it("parses the official API and DB inventory tables instead of trusting their labels", () => {
    const apiRows = markdownTableBodyRowsAfter(
      read(officialTuple[4]),
      "## 엔드포인트 전체 목록 (108개) `v1.2.38`",
    );
    const dbRows = markdownTableBodyRowsAfter(
      read(officialTuple[3]),
      "# 17. 전체 테이블 목록 (73개)",
    );

    expect(apiRows).toHaveLength(108);
    expect(dbRows).toHaveLength(73);
  });

  it("locks retry enqueue as an exact union and exposes one exact retry action projection", () => {
    const api = read(officialTuple[4]);
    const requirements = read(officialTuple[0]);
    const screens = read(officialTuple[1]);
    const flow = read(officialTuple[2]);

    for (const text of [api, requirements, screens, flow]) {
      expect(text).toContain("{ youtube_url } | { retry_job_id }");
      expect(text).toContain("can_retry");
      expect(text).toContain("retry_job_id");
    }

    expect(api).toContain("본인 terminal `failed|expired` job");
    expect(api).toContain("저장된 normalized video ID");
    expect(api).toContain("이전 job row는 변경하지 않는다");
    expect(api).toContain("dedupe와 active/daily budget을 다시 적용");
  });

  it("locks consumed session read as a successful owner projection without changing the wrapper", () => {
    const api = read(officialTuple[4]);
    const requirements = read(officialTuple[0]);
    const screens = read(officialTuple[1]);
    const flow = read(officialTuple[2]);

    for (const text of [api, requirements, screens, flow]) {
      expect(text).toContain("status=consumed");
      expect(text).toContain("recipe_id");
      expect(text).toContain("recipe_path");
      expect(text).toContain("draft=null");
    }

    expect(api).toContain("본인 consumed session은 `200`");
    expect(api).toContain("없는 session과 타인 session은 동일 `404 EXTRACTION_NOT_FOUND`");
    expect(api).not.toContain("409 | `EXTRACTION_ALREADY_REGISTERED` | consumed session");
  });

  it("locks exhaustive safe public failures with exact retry and UI actions", () => {
    const api = read(officialTuple[4]);
    const screens = read(officialTuple[1]);
    const failureRows = markdownTableCellsAfter(
      api,
      "## 0-YT-ASYNC. 공통 projection과 ownership",
    );
    const expectedFailures = [
      ["NOT_RECIPE_VIDEO", "레시피 영상으로 확인되지 않았어요.", "false", "닫기"],
      [
        "QUOTA_EXCEEDED",
        "오늘 추출 한도를 모두 사용했어요. 나중에 다시 시도해 주세요.",
        "true",
        "나중에 다시 시도",
      ],
      [
        "RUNTIME_UNAVAILABLE",
        "지금은 추출을 시작할 수 없어요. 잠시 후 다시 시도해 주세요.",
        "true",
        "다시 시도",
      ],
      [
        "ATTEMPTS_EXHAUSTED",
        "추출을 완료하지 못했어요. 다시 시도해 주세요.",
        "true",
        "다시 시도",
      ],
      [
        "EXTRACTION_FAILED",
        "레시피를 추출하지 못했어요. 다시 시도해 주세요.",
        "true",
        "다시 시도",
      ],
      [
        "EXTRACTION_EXPIRED",
        "결과가 만료됐어요. 다시 추출해 주세요.",
        "true",
        "다시 추출",
      ],
    ];

    expect(failureRows).toEqual(expectedFailures);
    for (const [code] of expectedFailures) expect(screens).toContain(code);

    expect(api).toContain("queued|processing|succeeded에서는 `error=null`");
    expect(api).toContain("failed|expired에서는 `error`가 non-null");
  });

  it("locks lease-expired processing reaping before claim and forbids exhausted reclaim", () => {
    const db = read(officialTuple[3]);
    const flow = read(officialTuple[2]);

    for (const text of [db, flow]) {
      expect(text).toContain("reaper → claim");
      expect(text).toContain("attempt_count >= max_attempts");
      expect(text).toContain("ATTEMPTS_EXHAUSTED");
      expect(text).toContain("재claim 금지");
      expect(text).toContain("delivery key");
    }

    expect(db).toContain("같은 claim transaction");
    expect(db).toContain("reaper 권한은 claim RPC owner에만 있다");
  });

  it("locks durable UX, re-entry, retry, expiry, offline, and accessibility states", () => {
    const screens = read(officialTuple[1]);
    const flow = read(officialTuple[2]);

    for (const token of [
      "/menu/add/youtube",
      "작업 보기",
      "toast",
      "badge",
      "success/failure/expired",
      "offline",
      "aria-live=\"polite\"",
      "Quick Import 비변경",
    ]) {
      expect(screens).toContain(token);
    }

    for (const token of [
      "enqueue → worker → durable notification → review/register",
      "재로그인",
      "새 enqueue",
      "submission_mode=sync_wait",
      "rollout",
      "rollback",
    ]) {
      expect(flow).toContain(token);
    }
  });

  it("locks fencing, atomic finalize, exact roles, ACL, pre-request, and credential rotation", () => {
    const db = read(officialTuple[3]);

    for (const token of [
      "youtube_extraction_jobs",
      "youtube_extraction_sessions.source_job_id",
      "youtube_extractor_permits",
      "private.youtube_extraction_worker_credentials",
      "lease_generation",
      "permit_generation",
      "한 transaction",
      "`youtube_extraction_worker`",
      "youtube_extraction_worker_rpc_owner",
      "`youtube_extraction_credential_manager`",
      "youtube_extraction_credential_manager_rpc_owner",
      "authenticator → youtube_extraction_worker",
      "authenticator → youtube_extraction_credential_manager",
      "SECURITY DEFINER SET search_path = ''",
      "table/sequence privilege 0",
      "DB pre-request",
      "compare-and-swap",
      "TTL 최대 7일",
      "잔여 48시간",
      "잔여 30분",
    ]) {
      expect(db).toContain(token);
    }

    expect(db).toContain("전체 테이블 목록 (73개)");
  });
});
