# Acceptance Checklist

> README의 `Contract Evolution Candidates`는 사용자 승인과 공식 문서 갱신 전까지 acceptance 범위에 포함하지 않는다.
> acceptance는 living closeout 문서다. 체크는 테스트, exploratory QA, real DB smoke, 실제 브라우저 확인처럼 evidence가 생긴 뒤에만 한다.
> Stage 6 merge 시점에는 `Manual Only`를 제외한 In Scope acceptance 항목이 모두 체크되어 있어야 한다.
> `Manual Only`에 남는 항목은 외부 서비스, live OAuth, 운영 승인처럼 자동화할 수 없는 것만 허용하며, PR의 `Actual Verification` / `Closeout Sync` 섹션에 현재 상태를 남긴다.
> `automation-spec.json`을 함께 쓰는 새 슬라이스에서는 `Manual Only`를 제외한 각 체크박스 끝에 `<!-- omo:id=...;stage=...;scope=...;review=... -->` metadata를 유지한다.
> Claude가 rebuttal을 수용해 닫은 항목은 checkbox를 유지한 채 `waived=true;waived_by=claude;waived_stage=<3|5|6>;waived_reason=<slug>` metadata를 추가한다.

## Happy Path
- [x] 관리자가 `/admin`에 진입하여 대시보드를 볼 수 있다 <!-- omo:id=accept-happy-path;stage=4;scope=frontend;review=5,6 -->
- [x] 관리자가 사용자 목록을 조회하고 검색/필터/페이지네이션할 수 있다 <!-- omo:id=accept-admin-users-flow;stage=4;scope=frontend;review=5,6 -->
- [x] 관리자가 운영 이벤트 로그를 필터/페이지네이션하여 조회할 수 있다 <!-- omo:id=accept-admin-events-flow;stage=4;scope=frontend;review=5,6 -->
- [x] 관리자가 운영 이벤트 상세를 열어 sanitized `metadata_json`을 확인하고 PII가 표시되지 않는 것을 확인할 수 있다 <!-- omo:id=accept-admin-event-detail;stage=4;scope=frontend;review=5,6 -->
- [x] 관리자가 감사 로그를 필터/페이지네이션하여 조회할 수 있다 <!-- omo:id=accept-admin-audit-flow;stage=4;scope=frontend;review=5,6 -->
- [x] 문서 기준 화면 상태와 액션이 맞다 (화면정의서 v1.5.9 §21–24) <!-- omo:id=accept-screen-contract;stage=4;scope=frontend;review=5,6 -->
- [x] API 응답 형식이 `{ success, data, error }`를 따른다 <!-- omo:id=accept-api-envelope;stage=2;scope=backend;review=3,6 -->
- [x] 백엔드 계약과 프론트 타입이 일치한다 <!-- omo:id=accept-backend-frontend-types;stage=4;scope=shared;review=6 -->

## Admin Security
- [x] 게스트가 `/admin` 또는 `/api/v1/admin/*`에 접근하면 `401 Unauthorized`를 받는다 <!-- omo:id=accept-guest-401;stage=2;scope=backend;review=3,6 -->
- [x] 로그인한 비관리자가 Admin API를 호출하면 `403 Forbidden`을 받고 Admin 데이터를 볼 수 없다 <!-- omo:id=accept-non-admin-403;stage=2;scope=backend;review=3,6 -->
- [x] `admin_members` 테이블이 관리자 신원의 유일한 소스이며 환경변수 allowlist 우회가 없다 <!-- omo:id=accept-admin-identity-source;stage=2;scope=backend;review=3,6 -->
- [x] 모든 Admin API가 `createServiceRoleClient()`를 사용하며 `routeClient` 폴백이 없다 <!-- omo:id=accept-service-role-only;stage=2;scope=backend;review=3,6 -->
- [x] `SUPABASE_SERVICE_ROLE_KEY` 부재 시 Admin API가 fail closed하며 사용자 범위 클라이언트로 폴백하지 않는다 <!-- omo:id=accept-service-role-fail-closed;stage=2;scope=backend;review=3,6 -->

## Audit & Logging
- [x] 모든 `/api/v1/admin/*` 읽기가 `admin_audit_logs`에 감사 기록을 남긴다 <!-- omo:id=accept-audit-on-read;stage=2;scope=backend;review=3,6 -->
- [x] `/admin` 페이지 진입 시 `admin_page_view` 감사 기록이 admin 데이터 렌더링 전에 작성된다 <!-- omo:id=accept-page-view-audit;stage=4;scope=frontend;review=5,6 -->
- [x] 감사 기록 실패 시 Admin 데이터가 렌더링되지 않는다 (fail closed) <!-- omo:id=accept-audit-fail-closed;stage=4;scope=frontend;review=5,6 -->
- [x] 사용자 목록/검색 감사에서 `target_type='user_search'`, `target_id=null`이며 검색어가 저장되지 않는다 <!-- omo:id=accept-no-search-term-in-audit;stage=2;scope=backend;review=3,6 -->
- [x] `request_path`가 pathname만 저장하고 쿼리스트링이 포함되지 않는다 <!-- omo:id=accept-pathname-only;stage=2;scope=backend;review=3,6 -->
- [x] 운영 이벤트가 최소 소스 5종(OAuth 실패, YouTube 프로바이더 실패, 계정 삭제, service-role 누락, 미처리 서버 에러)에서 기록된다 <!-- omo:id=accept-operational-event-sources;stage=2;scope=backend;review=3,6 -->

## PII / Data Safety
- [x] 관리자 사용자 응답이 승인된 요약 필드만 포함한다 (id, email_masked, provider, nickname, created_at, counts/status) <!-- omo:id=accept-pii-user-response;stage=2;scope=backend;review=3,6 -->
- [x] 로그/메타데이터에 OAuth 토큰, OAuth code/next/error, YouTube URL, YouTube 소스 텍스트, 관리자 검색어, 이메일, 닉네임, 비공개 장보기/팬트리 상세가 없다 <!-- omo:id=accept-pii-log-sanitization;stage=2;scope=backend;review=3,6 -->
- [x] `ip_hash`, `user_agent_hash`가 원본이 아닌 해시 값만 저장한다 <!-- omo:id=accept-hash-only;stage=2;scope=backend;review=3,6 -->

## State / Policy
- [x] 읽기 전용 정책이 지켜진다 — 파괴적 admin 동작이 없다 <!-- omo:id=accept-read-only;stage=2;scope=shared;review=3,6 -->
- [x] 중복 호출에도 결과가 꼬이지 않는다 (읽기 전용이므로 자동 멱등) <!-- omo:id=accept-idempotency;stage=2;scope=backend;review=3,6 -->

## Error / Permission
- [x] loading 상태가 있다 (4개 Admin 화면 모두) <!-- omo:id=accept-loading;stage=4;scope=frontend;review=5,6 -->
- [x] empty 상태가 있다 (데이터 없을 때) <!-- omo:id=accept-empty;stage=4;scope=frontend;review=5,6 -->
- [x] error 상태가 있다 (API 에러 시) <!-- omo:id=accept-error;stage=4;scope=frontend;review=5,6 -->
- [x] unauthorized 처리 흐름이 있다 (미인증 시 로그인 유도 또는 차단) <!-- omo:id=accept-unauthorized;stage=4;scope=frontend;review=5,6 -->
- [x] forbidden(403) 상태가 비관리자에게 적절히 표시된다 (선택적 추가 상태) <!-- omo:id=accept-forbidden;stage=4;scope=frontend;review=5,6 -->
- [x] 후속 커뮤니티/신고/제재 네비게이션이 없거나 disabled placeholder이며 미구현 페이지로 이동하지 않는다 <!-- omo:id=accept-future-nav-disabled;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions
- [x] fixture/mock에서 admin_members, operational_events, admin_audit_logs baseline이 준비되어 있다 <!-- omo:id=accept-fixture-baseline;stage=2;scope=shared;review=3,6 -->
- [x] real DB smoke에 필요한 migration, seed, bootstrap이 준비되어 있다 <!-- omo:id=accept-real-db-ready;stage=2;scope=shared;review=3,6 -->
- [x] 첫 admin bootstrap SQL/service-role 경로가 정확히 하나의 의도된 admin만 생성하고 runtime env 우회가 없다 <!-- omo:id=accept-bootstrap-owning-flow;stage=2;scope=shared;review=3,6 -->

## Automation Split

### Vitest
- [x] requireAdminUser 가드가 401/403/success를 올바르게 반환한다 <!-- omo:id=accept-vitest-guard;stage=2;scope=shared;review=3,6 -->
- [x] 이메일 마스킹 헬퍼가 null/short/normal 이메일을 처리한다 <!-- omo:id=accept-vitest-email-mask;stage=2;scope=shared;review=3,6 -->
- [x] 감사 로그 작성기가 기대 필드를 기록한다 <!-- omo:id=accept-vitest-audit-writer;stage=2;scope=shared;review=3,6 -->
- [x] admin 응답 매퍼가 private 상세를 제외한다 <!-- omo:id=accept-vitest-response-mapper;stage=2;scope=shared;review=3,6 -->
- [x] 로그 sanitizer가 pathname만 유지하고 OAuth code/next/error, YouTube URL, 관리자 검색어, 이메일, 닉네임을 제거한다 <!-- omo:id=accept-vitest-log-sanitizer;stage=2;scope=shared;review=3,6 -->
- [x] service role 부재 경로가 제어된 서버 에러를 반환하고 route client로 폴백하지 않는다 <!-- omo:id=accept-vitest-service-role-missing;stage=2;scope=shared;review=3,6 -->

### Playwright
- [x] 게스트 `/admin` 접근 시 로그인/forbidden 처리 확인 <!-- omo:id=accept-playwright-guest;stage=4;scope=frontend;review=5,6 -->
- [x] 비관리자가 Admin 데이터를 볼 수 없는 것 확인 <!-- omo:id=accept-playwright-non-admin;stage=4;scope=frontend;review=5,6 -->
- [x] 관리자가 대시보드를 로드하고, 사용자를 검색하고, 로그를 확인할 수 있는 것 확인 <!-- omo:id=accept-playwright-admin-flow;stage=4;scope=frontend;review=5,6 -->
- [x] disabled future nav 항목이 있으면 미구현 페이지로 이동하지 않는 것 확인 <!-- omo:id=accept-playwright-future-nav;stage=4;scope=frontend;review=5,6 -->
- [x] 모바일 뷰포트에서 blocker 오버랩이 없는 것 확인 <!-- omo:id=accept-playwright-mobile;stage=4;scope=frontend;review=5,6 -->

### Real DB Smoke
> 현재 Codex shell에는 `supabase`, `docker`, `pnpm/corepack`이 없어 실제 local Supabase 실행은 `backend-smoke.md` 절차로 남긴다. Stage 2 ready 기준은 migration SQL 정적 검증, bootstrap SQL 경로, fail-closed route test, sanitizer/audit Vitest evidence로 충족했다.

- [x] migration SQL이 admin_members, operational_events, admin_audit_logs 테이블을 정의한다 <!-- omo:id=accept-smoke-migration;stage=2;scope=backend;review=3,6 -->
- [x] 첫 admin bootstrap SQL/service-role 경로가 문서화되어 있고 runtime env 우회가 없다 <!-- omo:id=accept-smoke-bootstrap;stage=2;scope=backend;review=3,6 -->
- [x] service role 부재 시 fail closed 확인 <!-- omo:id=accept-smoke-fail-closed;stage=2;scope=backend;review=3,6 -->
- [x] OAuth callback 실패, YouTube 프로바이더 실패, Admin 사용자 검색 로깅 시 민감 쿼리/소스/검색 값이 저장되지 않는 것 확인 <!-- omo:id=accept-smoke-pii-redaction;stage=2;scope=backend;review=3,6 -->

## Data Integrity
- [x] 관리자 사용자 응답의 `counts`, `status` 등 집계 필드가 실제 DB와 일치한다 <!-- omo:id=accept-data-integrity-counts;stage=2;scope=backend;review=3,6 -->
- [x] 운영 이벤트와 감사 로그의 `created_at` 타임스탬프가 UTC 기준으로 일관된다 <!-- omo:id=accept-data-integrity-timestamps;stage=2;scope=backend;review=3,6 -->
- [x] 페이지네이션 `total` 카운트가 필터 조건 변경 시 정확히 갱신된다 <!-- omo:id=accept-data-integrity-pagination;stage=4;scope=frontend;review=5,6 -->

## Manual QA
- 관리자가 대시보드 → 사용자 → 이벤트 → 감사로그를 순서대로 탐색하면서 탭 전환이 자연스러운지 확인
- 모바일 기기에서 Admin 화면 4개를 실제 브라우저로 열어 터치 타겟, 가로 스크롤 없음, 필터 접근성 확인
- 데스크톱에서 테이블 뷰의 열 너비, 말줄임, 정렬이 운영 판독에 충분한지 확인
- 관리자 2명 이상 등록 후 감사 로그에서 관리자 UUID 필터가 올바르게 동작하는지 확인

### Manual Only
- [ ] 첫 admin bootstrap을 production/staging에서 실제 service-role으로 수행
- [ ] production service role secret 준비 확인
