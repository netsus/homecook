import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(resolve(root, relativePath), "utf8");
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
