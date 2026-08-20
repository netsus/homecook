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
  "docs/요구사항기준선-v1.7.32.md",
  "docs/화면정의서-v1.5.36.md",
  "docs/유저flow맵-v1.3.34.md",
  "docs/db설계-v1.3.34.md",
  "docs/api문서-v1.2.39.md",
];

describe("YouTube background extraction contract evolution", () => {
  it("routes the public YouTube import surface through background submission", () => {
    const page = read("app/recipes/new/youtube/page.tsx");

    expect(page).toContain('import { YoutubeImportScreen } from "@/components/recipe/youtube-import-screen";');
    expect(page).toContain("<YoutubeImportScreen");
    expect(page).toContain('entryContext="standalone"');
    expect(page).not.toContain("RecipioYoutubeImportScreen");
  });

  it("seeds the global notification center from the server-owned session", () => {
    const layout = read("app/layout.tsx");
    const notificationCenter = read(
      "components/youtube-extraction/youtube-extraction-notification-center.tsx",
    );

    expect(layout).toContain("initialAuthenticated={false}");
    expect(layout).toContain("resolveAuthenticatedOnClient");
    expect(notificationCenter).toContain('fetchYoutubeExtractionNotifications("unseen-completed")');
    expect(notificationCenter).not.toContain('import { fetchUserProfile } from "@/lib/api/mypage";');
    expect(notificationCenter).not.toContain("supabase.auth.getSession()");
  });

  it("makes the mobile URL import disabled CTA visually distinct without pressed motion", () => {
    const css = read("app/globals.css");
    const disabledRule = css.match(
      /\.yt-mobile-import-shell\s+\.web-button:disabled\s*\{([^}]*)\}/u,
    );

    expect(disabledRule?.[1]).toContain("background: var(--surface-fill)");
    expect(disabledRule?.[1]).toContain("color: var(--text-3)");
    expect(disabledRule?.[1]).toContain("opacity: 1");
    expect(disabledRule?.[1]).toContain("transform: none");
  });

  it("promotes one consistent additive five-document tuple", () => {
    const source = read("docs/sync/CURRENT_SOURCE_OF_TRUTH.md");

    for (const relativePath of officialTuple) {
      expect(source).toContain(`\`${relativePath}\``);
      expect(read(relativePath)).toContain("2026-08-12 contract-evolution");
    }

    expect(read(officialTuple[0])).toContain("# 요구사항 기준선 v1.7.32");
    expect(read(officialTuple[1])).toContain("# 화면정의서 v1.5.36");
    expect(read(officialTuple[2])).toContain("# 유저 Flow맵 v1.3.34");
    expect(read(officialTuple[3])).toContain("# DB 설계 v1.3.34");
    expect(read(officialTuple[4])).toContain("v1.2.39");
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

  it("records the exact re-approved plan artifact without pending evidence placeholders", () => {
    const source = read("docs/sync/CURRENT_SOURCE_OF_TRUTH.md");
    const evidenceDocuments = [...officialTuple, "docs/sync/CURRENT_SOURCE_OF_TRUTH.md"];

    for (const relativePath of evidenceDocuments) {
      const document = read(relativePath);
      const nextContractHeading = relativePath.includes("CURRENT_SOURCE_OF_TRUTH")
        ? "## Session Refresh"
        : "> **2026-08-08";
      const evidenceSection = document.slice(0, document.indexOf(nextContractHeading));

      expect(evidenceSection).toContain(
        "b560b60ff758171e1d52ad56b2a63a2e1877cd762d1f691c9cea32c753f8d332",
      );
      expect(evidenceSection).toContain("873");
      expect(evidenceSection).toContain("019ff4f7-806c-7151-b646-cab784606cde");
      expect(evidenceSection).toContain("PASS");
      expect(evidenceSection).not.toContain("PENDING");
    }

    expect(source).toContain("Findings 없음");
    expect(source).toContain("차단 없음");
    expect(source).toContain("origin/master@d38ee2e4a4c8cafc00dce713919c3f3e8df2bdda");
  });

  it("locks the six public endpoints, states, wrappers, dedupe, and standalone background consumer", () => {
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
    expect(api).toContain("standalone 공개 화면의 async UI 전환은 2026-08-15 사용자 승인으로 활성화했다");
    expect(api).toContain("자동 등록하지 않는다");
    expect(api).toContain("엔드포인트 전체 목록 (108개) `v1.2.39`");
    expect(api).toContain("active 107개 + 삭제된 `2-4` tombstone 1개");
  });

  it("parses the official API and DB inventory tables instead of trusting their labels", () => {
    const apiRows = markdownTableBodyRowsAfter(
      read(officialTuple[4]),
      "## 엔드포인트 전체 목록 (108개) `v1.2.39`",
    );
    const dbRows = markdownTableBodyRowsAfter(
      read(officialTuple[3]),
      "# 17. 전체 테이블 목록 (74개)",
    );

    expect(apiRows).toHaveLength(108);
    expect(dbRows).toHaveLength(74);
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
    expect(api).toContain("이전 job에서는 youtube_video_id만 복사한다");
    expect(api).toContain("이전 job row는 변경하지 않는다");
    expect(api).toContain("dedupe와 active/daily budget을 다시 적용");
  });

  it("recomputes retry identity from the current approved release policy", () => {
    const documents = officialTuple.map(read);

    for (const document of documents) {
      expect(document).toContain("이전 job에서는 youtube_video_id만 복사한다");
      expect(document).toContain("private.youtube_extraction_current_policy");
      expect(document).toContain("이전 HMAC/options 역복원 금지");
      expect(document).toContain("전환 후 current worker가 claim 가능");
    }

    const api = read(officialTuple[4]);
    expect(api).not.toContain("locked 이전 job에 저장된 normalized video ID와 결과 영향 mode/pipeline option");
  });

  it("locks one canonical current release policy and snapshots it atomically at enqueue", () => {
    const source = read("docs/sync/CURRENT_SOURCE_OF_TRUTH.md");
    const documents = [...officialTuple.map(read), source];
    const db = read(officialTuple[3]);

    for (const document of documents) {
      expect(document).toContain("private.youtube_extraction_current_policy");
      expect(document).toContain("old/new 중 한 complete snapshot");
      expect(document).toContain("policy_snapshot_digest");
      expect(document).toContain("allowed_snapshot_digest");
    }

    const policyFieldTypes = [
      ["policy_key", "text"],
      ["policy_version", "bigint"],
      ["extractor_mode", "text"],
      ["pipeline_identity", "text"],
      ["result_affecting_options", "jsonb"],
      ["fingerprint_key_version", "text"],
      ["previous_fingerprint_key_version", "text"],
      ["previous_fingerprint_valid_until", "timestamptz"],
      ["enabled", "boolean"],
      ["updated_at", "timestamptz"],
    ];
    const policyRows = markdownTableCellsAfter(
      db,
      "### `private.youtube_extraction_current_policy`",
    );
    expect(policyRows.map(([field, type]) => [field, type])).toEqual(policyFieldTypes);

    const jobRows = markdownTableCellsAfter(db, "### `youtube_extraction_jobs`");
    const jobFields = jobRows.map(([field]) => field);
    for (const snapshotField of [
      "release_policy_key",
      "policy_version",
      "policy_snapshot_digest",
      "extractor_mode",
      "pipeline_identity",
      "result_affecting_options",
      "request_fingerprint_key_version",
    ]) {
      expect(jobFields).toContain(snapshotField);
    }

    expect(db).toContain("transaction advisory shared lock → enabled policy plain SELECT");
    expect(db).toContain("같은 advisory key의 exclusive transaction lock → UPDATE/CAS");
    expect(db).not.toMatch(
      new RegExp("enabled current policy.*SELECT.*FOR " + "(?:UPDATE|SHARE)"),
    );
    expect(db).toContain("job에 immutable snapshot으로 저장");
    expect(db).toContain("client/route는 mode/options를 지정할 수 없다");
    expect(db).toContain("승인된 release migration");
    expect(db).toContain("policy rotation vs retry concurrency");
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

  it("gives consumed results precedence over TTL across status, list, and session read", () => {
    const documents = officialTuple.map(read);

    for (const document of documents) {
      expect(document).toContain("consumed가 TTL보다 우선");
      expect(document).toContain("consumed-after-TTL");
      expect(document).toContain("can_retry=false");
      expect(document).toContain("recipe_path");
    }

    const api = read(officialTuple[4]);
    expect(api).toContain(
      "result exact field set은 `extraction_id`, `review_path`, `recipe_id`, `recipe_path` 4개",
    );
    expect(api).toContain("draft가 unconsumed이고 TTL이 경과한 경우만 `status=expired`");
    expect(api).toContain("`consumed-after-TTL` session-read도 `200`");
  });

  it("expires only unconsumed drafts and rejects the broad succeeded-session rule", () => {
    const db = read(officialTuple[3]);

    expect(db).toContain(
      "unconsumed draft linked session만 TTL 경과 시 `expired`로 projection",
    );
    expect(db).toContain("consumed/registered recipe는 영구 recipe destination이 우선");
    expect(db).not.toContain(
      "`status='succeeded'`의 linked session이 TTL을 지나면 read projection만 `expired`가 된다",
    );
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

  it("never renders a retry action for non-retryable failures", () => {
    const requirements = read(officialTuple[0]);
    const screens = read(officialTuple[1]);
    const flow = read(officialTuple[2]);
    const api = read(officialTuple[4]);

    for (const document of [requirements, screens, flow, api]) {
      expect(document).toContain("can_retry=false이면 retry CTA를 렌더하지 않는다");
      expect(document).toContain("NOT_RECIPE_VIDEO");
      expect(document).toContain("닫기/목록 유지");
    }

    expect(screens).not.toContain(
      "failure toast: `레시피를 추출하지 못했어요` + `다시 시도`",
    );
  });

  it("decides can_retry before offering any retry action in the failure flow", () => {
    const flow = read(officialTuple[2]);

    expect(flow).toContain(
      "failed/expired 수신\n→ status/list의 can_retry 판정\n   ├─ true: [다시 시도]",
    );
    expect(flow).toContain("└─ false: [닫기] / 목록 유지, retry CTA·POST 없음");
    expect(flow).not.toContain(
      "→ 사용자가 [다시 시도]\n→ status/list의 can_retry 확인",
    );
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
      "standalone background",
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

    expect(db).toContain("전체 테이블 목록 (74개)");
  });

  it("uses the existing user session as the sole enqueue caller authority", () => {
    const requirements = read(officialTuple[0]);
    const screens = read(officialTuple[1]);
    const flow = read(officialTuple[2]);
    const db = read(officialTuple[3]);
    const api = read(officialTuple[4]);
    const source = read("docs/sync/CURRENT_SOURCE_OF_TRUTH.md");

    for (const text of [requirements, screens, flow, db, api]) {
      expect(text).toContain("createRouteHandlerClient()");
      expect(text).toContain("auth.uid()");
      expect(text).toContain("current_digest");
      expect(text).toContain("previous_digest");
      expect(text).toContain("DB는 HMAC secret을 알지 못한다");
      expect(text).toContain("current-write");
      expect(text).toContain("dual-read");
    }

    expect(db).toContain(
      "enqueue_youtube_extraction_job(video_id, expected_policy_version, expected_policy_snapshot_digest, current_key_version, current_digest, previous_key_version, previous_digest, submission_mode)",
    );
    expect(db).toContain("`youtube_extraction_enqueue_rpc_owner` | `NOLOGIN NOSUPERUSER");
    expect(db).toContain("table/sequence privilege 0");
    expect(db).toContain("SECURITY DEFINER SET search_path = ''");
    expect(db).toContain("owner는 `auth.uid()`에서만 도출");
    expect(db).toContain("exact signature를 `authenticated`에만 `GRANT EXECUTE`");
    expect(db).toContain("`PUBLIC`, `anon`, `service_role`, worker, credential-manager, manager에서 `REVOKE EXECUTE`");
    expect(db).toContain("youtube_extraction_current_policy_enqueue_owner_select");
    expect(db).toContain("youtube_extraction_jobs_enqueue_owner_select");
    expect(db).toContain("youtube_extraction_jobs_enqueue_owner_insert");
    expect(db).toContain("FOR SELECT USING (user_id=auth.uid())");
    expect(db).toContain("FOR INSERT WITH CHECK (user_id=auth.uid())");
    expect(db).toContain("policy UPDATE와 jobs UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER");
    const removedApiRole = "`youtube_extraction_" + "enqueue`";
    const removedScope = "youtube-extraction-" + "enqueue";
    const removedJwt = "request-scoped enqueue " + "JWT";
    const removedSigner = "enqueue signing " + "key";
    for (const text of [...officialTuple.map(read), source]) {
      expect(text).not.toContain(removedApiRole);
      expect(text).not.toContain(removedScope);
      expect(text).not.toContain(removedJwt);
      expect(text).not.toContain(removedSigner);
    }
    expect(db).not.toContain("authenticator → youtube_extraction_" + "enqueue");
    expect(db).not.toMatch(/HMAC (?:secret|key).*private\.youtube_extraction_current_policy에 저장/);
  });

  it("serializes policy reads and rotations with one advisory lock authority", () => {
    const db = read(officialTuple[3]);
    const flow = read(officialTuple[2]);

    for (const text of [db, flow]) {
      expect(text).toContain("transaction advisory shared lock");
      expect(text).toContain("enabled policy plain SELECT");
      expect(text).toContain("같은 advisory key의 exclusive transaction lock");
      expect(text).toContain("UPDATE/CAS");
    }

    expect(db).toContain("policy `SELECT`, jobs `SELECT,INSERT`뿐");
    expect(db).toContain("policy UPDATE");
    expect(db).toContain("0이다");
    expect(db).not.toMatch(
      new RegExp("enabled current policy.*SELECT.*FOR " + "(?:UPDATE|SHARE)"),
    );
  });

  it("binds enqueue to the app expected policy snapshot and rejects stale descriptors before writes", () => {
    const requirements = read(officialTuple[0]);
    const screens = read(officialTuple[1]);
    const flow = read(officialTuple[2]);
    const db = read(officialTuple[3]);
    const api = read(officialTuple[4]);

    for (const text of [requirements, screens, flow, db, api]) {
      expect(text).toContain("expected_policy_version");
      expect(text).toContain("expected_policy_snapshot_digest");
      expect(text).toContain("POLICY_CHANGED");
      expect(text).toContain("insert/dedupe/budget 0");
      expect(text).toContain("release expected-schema manifest");
      expect(text).toContain("options-only rotation stale app");
      expect(text).toContain("digest/descriptor는 response/log/browser bundle에 노출 금지");
    }

    expect(db).toContain("advisory lock 안에서 enabled policy plain SELECT");
    expect(db).toContain("expected version/digest exact match");
    expect(api).toContain("409 POLICY_CHANGED");
    expect(api).toContain("추출 설정이 바뀌었어요. 다시 시도해 주세요.");
  });

  it("keeps fingerprint keys in the existing app secret loader and away from browser and worker", () => {
    const documents = officialTuple.map(read);

    for (const document of documents) {
      expect(document).toContain("existing app external secret loader");
      expect(document).toContain("server-only allowlist");
      expect(document).toContain("worker에는 금지");
      expect(document).toContain("app release와 policy rotation");
      expect(document).toContain("dedupe continuity/privacy");
    }
  });

  it("treats fingerprint HMAC only as privacy-preserving dedupe metadata", () => {
    const documents = officialTuple.map(read);
    const source = read("docs/sync/CURRENT_SOURCE_OF_TRUTH.md");

    for (const document of documents) {
      expect(document).toContain("privacy-preserving dedupe/fingerprint");
      expect(document).toContain("authentication/attestation이 아니다");
      expect(document).toContain("cryptographic authenticity를 보장하지 않는다");
    }

    for (const document of [...documents, source]) {
      expect(document).not.toContain("invalid digest");
      expect(document).not.toContain(
        "HMAC digest와 expected snapshot을 모르는 direct call",
      );
    }
  });

  it("keeps the Data API and enqueue RPC behind the loopback private boundary", () => {
    const documents = officialTuple.map(read);
    const api = documents[4];

    for (const document of documents) {
      expect(document).toContain("Next /api/v1만 공개");
      expect(document).toContain("loopback/private network");
      expect(document).toContain("Cloudflare/public proxy");
      expect(document).toContain("403/404");
      expect(document).toContain("server-only path");
      expect(document).toContain(
        "Supabase Data API URL/session direct-RPC capability/fingerprint descriptor/digest",
      );
      expect(document).toContain("loopback boundary config drift");
      expect(document).toContain("fail closed");
    }

    expect(api).toContain("/rest/v1/rpc/enqueue_youtube_extraction_job");
    for (const privateField of [
      "current_digest",
      "previous_digest",
      "current_key_version",
      "previous_key_version",
      "expected_policy_version",
      "expected_policy_snapshot_digest",
    ]) {
      expect(api).toContain(privateField);
    }
    expect(api).toContain("422 VALIDATION_ERROR");
    expect(api).toContain("unknown field");
  });

  it("pins the exact i031-only initial policy and canonical options schema", () => {
    const requirements = read(officialTuple[0]);
    const db = read(officialTuple[3]);
    const api = read(officialTuple[4]);
    const worker = read("lib/server/youtube-i031-runtime/bundle/worker.mjs");
    const workpack = read("docs/workpacks/33-youtube-i031-direct-extraction/README.md");
    const exactOptions =
      '{"codexEffort":"low","frameMode":"hybrid","hybridAnchorBudget":36,"interval":4,"keyframeTotalLimit":8,"keyframesPerRecipe":8,"packetPromptTextOnly":false,"publicSourceBundle":null,"recipeMode":"single","screenOcrMode":"auto","selectorCandidateLimit":12,"selectorEffort":"low","singleRecipeOnly":true,"sourceMode":"source-text","useApifyFallback":true,"useEvidencePackets":false,"useVisual":true}';
    const policySection = db.slice(
      db.indexOf("### `private.youtube_extraction_current_policy`"),
    );
    const policyJson = policySection.match(/```json\n([^\n]+)\n```/u)?.[1];

    expect(policyJson).toBe(exactOptions);
    expect(JSON.stringify(JSON.parse(policyJson ?? ""))).toBe(exactOptions);

    for (const text of [requirements, db, api]) {
      expect(text).toContain("UTF-8");
      expect(text).toContain("sorted keys");
      expect(text).toContain("no whitespace");
      expect(text).toContain("unknown key 거부");
      expect(text).toContain("defaults materialized");
      expect(text).toContain(exactOptions);
      expect(text).toContain(
        "9adc7876a02c2da55a92e3a65369bf4e803c78efb9a791717201eedc242c1908",
      );
      expect(text).toContain("initial async policy는 i031-only");
    }

    expect(db).toContain("policy_key='primary'");
    expect(db).toContain("policy_version=1");
    expect(db).toContain("fingerprint_key_version='1'");
    expect(db).toContain("previous_fingerprint_key_version=NULL");
    expect(db).toContain("previous_fingerprint_valid_until=NULL");
    expect(db).toContain("enabled=false");
    expect(db).not.toContain('"temperature"');
    expect(db).not.toContain('"top_p"');
    expect(policyJson).not.toContain('"noCache"');
    expect(policyJson).not.toContain('"runType"');
    expect(policyJson).not.toContain('"timeoutMs"');

    expect(workpack).toContain(
      "service safe-subset manifest | `9adc7876a02c2da55a92e3a65369bf4e803c78efb9a791717201eedc242c1908`",
    );
    for (const runtimeMarker of [
      'codexEffort: "low"',
      'selectorEffort: "low"',
      "singleRecipeOnly: true",
      "frameMode: EXACT.frameMode",
      "interval: EXACT.interval",
      "hybridAnchorBudget: EXACT.hybridAnchorBudget",
      "selectorCandidateLimit: EXACT.selectorCandidateLimit",
      "keyframeTotalLimit: EXACT.keyframeTotalLimit",
      "keyframesPerRecipe: EXACT.keyframeTotalLimit",
      "screenOcrMode: EXACT.screenOcrMode",
      "useVisual: true",
      'sourceMode: "source-text"',
      'recipeMode: "single"',
      "useEvidencePackets: false",
      "packetPromptTextOnly: false",
      "publicSourceBundle: null",
    ]) {
      expect(worker).toContain(runtimeMarker);
    }
    expect(worker).toMatch(/useApifyFallback:\s*true/u);
    expect(worker).toContain("workerRpcClient");
    expect(worker).toContain("noCache: true");
    expect(worker).toContain('runType: "cold"');
    expect(worker).toContain("timeoutMs: TOTAL_TIMEOUT_MS");
  });

  it("binds every worker claim to the complete policy snapshot digest", () => {
    const requirements = read(officialTuple[0]);
    const flow = read(officialTuple[2]);
    const db = read(officialTuple[3]);

    for (const text of [requirements, flow, db]) {
      expect(text).toContain("policy_snapshot_digest");
      expect(text).toContain("allowed_snapshot_digest");
      expect(text).toContain("youtube-extraction-policy-snapshot-v1");
      expect(text).toContain("options-only rotation");
      expect(text).toContain("old worker reject");
    }

    expect(db).toContain(
      "extractor_mode, pipeline_identity, canonical result_affecting_options, policy_version, schema_identity",
    );
    expect(db).toContain("non-secret canonical SHA-256");
    expect(db).toContain(
      "claim_youtube_extraction_job(worker_id, allowed_snapshot_digest, lease_seconds)",
    );
    expect(db).toContain("artifact/credential attestation");
    expect(db).toContain("exact match");
  });

  it("separates disabled bootstrap from later policy rotation", () => {
    const requirements = read(officialTuple[0]);
    const flow = read(officialTuple[2]);
    const db = read(officialTuple[3]);

    for (const text of [requirements, flow, db]) {
      expect(text).toContain("initial bootstrap");
      expect(text).toContain("later rotation");
      expect(text).toContain("exclusive enable");
      expect(text).toContain("enqueue publish");
      expect(text).toContain("CAS update disabled");
    }

    const bootstrapOrder = [
      "disabled singleton/roles/RPC",
      "same release app/worker install",
      "preflight/schema",
      "credential/snapshot attestation",
      "exclusive enable",
      "enqueue publish",
    ];
    const rotationOrder = [
      "enqueue maintenance",
      "drain old snapshot",
      "disable/lock",
      "CAS update disabled",
      "new app/worker install",
      "exclusive enable",
      "resume",
    ];
    for (const [document, tokens] of [
      [flow, bootstrapOrder],
      [flow, rotationOrder],
    ] as const) {
      let cursor = -1;
      for (const token of tokens) {
        const next = document.indexOf(token, cursor + 1);
        expect(next, `${token} must follow the previous release step`).toBeGreaterThan(cursor);
        cursor = next;
      }
    }
  });
});
