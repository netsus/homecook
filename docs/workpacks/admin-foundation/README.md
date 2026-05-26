# Slice: admin-foundation

## Goal
런칭 초기 운영에 필요한 최소한의 내부 관리 기반을 제공한다. 관리자(`admin_members` 등록 운영자)가 `/admin` 경로에서 사용자 목록을 읽기 전용으로 조회하고, 시스템 운영 이벤트와 관리자 감사 로그를 확인할 수 있다. 파괴적 관리 동작 없이 운영 가시성을 먼저 확보하며, 후속 커뮤니티/신고/제재 기능의 확장 지점을 만든다.

## Branches

- 백엔드: `feature/be-admin-foundation`
- 프론트엔드: `feature/fe-admin-foundation`

## In Scope
- 화면: `ADMIN_DASHBOARD` (`/admin`), `ADMIN_USERS` (`/admin/users`), `ADMIN_EVENTS` (`/admin/events`), `ADMIN_AUDIT_LOGS` (`/admin/audit-logs`)
- API:
  - `GET /api/v1/admin/users` — 사용자 목록 조회 (읽기 전용)
  - `GET /api/v1/admin/operational-events` — 운영 이벤트 로그 조회
  - `GET /api/v1/admin/audit-logs` — 관리자 감사 로그 조회
- 서버 공유 모듈:
  - `requireAdminUser` 가드 — OAuth 인증 + `admin_members` 확인
  - `createServiceRoleClient()` 기반 admin DB 헬퍼 — service role 부재 시 fail closed
  - `recordOperationalEvent` 헬퍼 — 최소 이벤트 소스에 연결
  - `recordAdminAudit` 헬퍼 — 모든 admin API 읽기 및 `/admin` 진입 시 기록
  - 로그 sanitizer — pathname-only request_path, 민감 메타데이터 제거
- 상태 전이: 없음 (읽기 전용)
- DB 영향: `admin_members`, `operational_events`, `admin_audit_logs` (3개 신규 테이블)
- Schema Change:
  - [x] 있음 → `supabase/migrations/<파일명>.sql` 생성 필요

## Out of Scope
- 사용자 삭제/정지/위장 (user deletion/suspension/impersonation)
- 레시피/재료/동의어/조리방법 CRUD
- 커뮤니티 게시글/댓글 제재 동작
- 신고 처리 동작
- 역할 관리 UI (MVP는 'viewer' 역할만 사용)
- 환경변수 허용목록(allowlist) admin 우회
- 외부 모니터링 의존성 도입 (Sentry 등)
- 원문 YouTube 소스 텍스트 / 비공개 장보기/팬트리 상세 표시
- 커뮤니티/신고/제재 네비게이션이 미구현 관리 페이지로 이동하는 것

## Dependencies

| 선행 슬라이스 | 상태 | 확인 |
| --- | --- | --- |
| `01-discovery-detail-auth` | bootstrap (= merged) | [x] |

> Auth 기반만 필요하며 다른 제품 슬라이스에 대한 의존성은 없다.
> `28-external-ingredient-data-ingest-gate`는 `in-progress`이나 이 슬라이스의 기능 의존성이 아니다.

## Backend First Contract

### 공통: Admin API 보안 정책

- **인증 가드**: 모든 `/api/v1/admin/*` 엔드포인트는 `requireAdminUser` 가드를 거친다.
  - OAuth Bearer Token 검증 → 실패 시 `401 Unauthorized`
  - `admin_members` 테이블에서 `user_id` 조회 → 미등록 시 `403 Forbidden`
- **DB 클라이언트**: `createServiceRoleClient()` 사용 필수.
  - service role key 부재 시 제어된 서버 에러로 fail closed.
  - `routeClient` 폴백 금지 — admin/교차 사용자 읽기에서 사용자 범위 클라이언트 사용 금지.
- **감사 로그**: 모든 admin API 읽기는 `requireAdminUser` 이후 `admin_audit_logs`에 기록.
- **응답 형식**: 기존 `{ success, data, error }` 래퍼, `{ code, message, fields[] }` 에러 형태 유지.

### GET /api/v1/admin/users
- 권한: 🔒 Bearer Token + admin_members
- Query: `q` (string, 이메일/닉네임 검색어), `page` (int, 기본 1), `limit` (int, 기본 20, 최대 100)
- PII 최소화: 승인된 요약 정보만 반환
  - 허용 필드: `id`, `email_masked`, `social_provider`, `nickname`, `created_at`, `counts`, `status`
  - 금지: 원문 이메일, OAuth 토큰, YouTube URL, 비공개 장보기/팬트리 상세
- 응답 (200):
  ```json
  {
    "success": true,
    "data": {
      "items": [{ "id": "uuid", "email_masked": "c***@example.com", "social_provider": "google", "nickname": "홈쿡러", "created_at": "2026-01-15T09:00:00Z", "counts": { "recipe_books": 2, "meals": 8, "shopping_lists": 3, "pantry_items": 12 }, "status": "active" }],
      "page": 1,
      "limit": 20,
      "total": 150
    },
    "error": null
  }
  ```
- 감사 로그: `action='list_users'`. 검색어는 로그에 기록하지 않음 (`target_type='user_search'`, `target_id=null`).
- 401: 미인증 / 403: 비관리자 / 500: service role 부재 (fail closed)

### GET /api/v1/admin/operational-events
- 권한: 🔒 Bearer Token + admin_members
- Query: `event_type`, `severity`, `source`, `page`, `limit`
- 응답 (200):
  ```json
  {
    "success": true,
    "data": {
      "items": [{ "id": "uuid", "event_type": "auth_failure", "severity": "warn", "source": "auth", "actor_user_id": null, "target_user_id": "uuid", "request_path": "/api/v1/auth/callback", "http_status": 401, "error_code": "INVALID_TOKEN", "message_summary": "OAuth 콜백 인증 실패", "metadata_json": {}, "created_at": "2026-05-27T10:30:00Z" }],
      "page": 1,
      "limit": 20,
      "total": 42
    },
    "error": null
  }
  ```
- 감사 로그: `action='list_operational_events'`
- 401 / 403 / 500 (fail closed)

### GET /api/v1/admin/audit-logs
- 권한: 🔒 Bearer Token + admin_members
- Query: `action`, `actor_admin_user_id`, `target_type`, `page`, `limit`
- 응답 (200):
  ```json
  {
    "success": true,
    "data": {
      "items": [{ "id": "uuid", "actor_admin_user_id": "uuid", "action": "list_users", "target_type": "user_search", "target_id": null, "request_path": "/api/v1/admin/users", "result": "success", "ip_hash": "sha256:...", "user_agent_hash": "sha256:...", "created_at": "2026-05-27T10:35:00Z" }],
      "page": 1,
      "limit": 20,
      "total": 89
    },
    "error": null
  }
  ```
- 감사 로그: `action='list_audit_logs'`
- 401 / 403 / 500 (fail closed)

### Admin Identity Bootstrap

- `admin_members` 테이블이 관리자 신원의 단일 진실 소스.
- 최초 admin 등록은 운영자의 OAuth 사용자가 존재한 후 Supabase SQL 또는 service-role API로 직접 수행:
  ```sql
  INSERT INTO admin_members (user_id, role) VALUES ('<operator-uuid>', 'viewer');
  ```
- 런타임 코드에 환경변수 허용목록 우회 패턴 없음.

### Operational Event Write Helper

- `recordOperationalEvent(params)` 헬퍼를 첫 슬라이스 최소 이벤트 소스에 연결:
  - OAuth/인증 콜백 실패
  - YouTube validate/extract/register 프로바이더 실패
  - 계정 삭제 성공/실패
  - Admin API service-role 누락 실패
  - 선별된 라우트 핸들러 미처리 서버 에러 (workpack에서 정의된 catch 블록)
- `request_path`는 pathname만 저장. 쿼리스트링 저장 금지.
- `metadata_json` sanitization: OAuth 토큰, OAuth code/next/error 쿼리 값, YouTube URL, YouTube 자막/소스 텍스트, 관리자 검색어/이메일/닉네임, 비공개 장보기/팬트리 상세 금지.

### Admin Audit Rules

- 모든 `/api/v1/admin/*` 읽기는 `requireAdminUser` 이후 감사 기록 작성.
- `/admin` 페이지 진입 시 서버 측 페이지 가드 또는 공유 서버 전용 헬퍼에서 `admin_page_view` 감사 기록 작성 — admin 데이터 렌더링 전에 실행.
- 감사 기록 실패 시 첫 버전은 fail closed (제어된 Admin 에러 상태).
- 사용자 목록/검색 감사: `target_type='user_search'`, `target_id=null` — 검색어 저장 금지.
- `ip_hash`, `user_agent_hash`는 원본이 아닌 해시 값만 저장.
- `request_path`는 pathname만 저장. 쿼리스트링 저장 금지.

## Frontend Delivery Mode
- 디자인 확정 전: 기능 가능한 임시 UI (dense, utilitarian layout — 내부 운영 도구)
- 필수 상태: `loading / empty / error / read-only / unauthorized`
- 선택적 추가 상태: `forbidden(403)` — 로그인한 비관리자 사용자 구분용. unauthorized를 대체하지 않음.
- 일반 사용자 네비게이션에 Admin 경로 노출 없음.
- 후속 커뮤니티/신고/제재 네비게이션은 미구현 또는 disabled placeholder만 허용. 미구현 관리 페이지로 네비게이션 금지.

## Design Authority
- UI risk: `new-screen`
- Anchor screen dependency: 없음 (Admin은 독립된 내부 화면)
- Visual artifact: Stage 4 구현 후 스크린샷 evidence 수집 예정
- Authority status: `required`
- Notes: Admin 4화면 모두 신규 화면이므로 authority review 필수. Stage 4 스크린샷 → Codex `authority_precheck` → Stage 5 public design review → 수정 → Claude `final_authority_gate` 순서. 내부 운영 도구이므로 desktop-first acceptable하나, 모바일에서 emergency lookup이 가능해야 하며 mobile blocker 규칙은 여전히 적용.

## Design Status

- [x] 임시 UI (temporary) — 기능 완성 우선, Stage 4 완료 후 pending-review로 전환
- [ ] 리뷰 대기 (pending-review)
- [ ] 확정 (confirmed)
- [ ] N/A

## Source Links
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/요구사항기준선-v1.7.2.md` §1-11, §2-14
- `docs/화면정의서-v1.5.9.md` §21–24
- `docs/유저flow맵-v1.3.9.md` §⑫
- `docs/db설계-v1.3.8.md` §12
- `docs/api문서-v1.2.12.md` Admin Foundation 엔드포인트 3종
- `.omx/plans/admin-foundation-ralplan-20260526.md`
- `docs/workpacks/admin-foundation/backend-smoke.md`

## QA / Test Data Plan
- **fixture baseline**: `admin_members` row 1건, 일반 사용자 row 다수, `operational_events` 샘플, `admin_audit_logs` 샘플
- **auth override**: admin 사용자 / 일반 사용자 / 게스트 3가지 persona
- **fault injection**: service role key 부재 → fail closed 검증
- **real DB smoke 경로**: local Supabase (`pnpm dev:local-supabase` 또는 직접 `supabase start`)
  - migration 적용 후 3개 테이블 존재 확인
  - 첫 admin bootstrap SQL 실행: `INSERT INTO admin_members (user_id, role) VALUES ('<test-uuid>', 'viewer')`
  - service role 부재 시 Admin API fail closed 확인
- **seed / reset 명령**: migration 파일 + admin bootstrap SQL
- **bootstrap이 생성해야 하는 시스템 row**: 없음 (admin_members는 수동 등록)
- **blocker 조건**: `SUPABASE_SERVICE_ROLE_KEY` 부재 시 Admin API 전체 비가동 (의도된 fail closed)

## Key Rules
- **읽기 전용**: 이 슬라이스의 모든 Admin API는 읽기 전용. 데이터 수정/삭제 API 없음.
- **service role 필수**: `routeClient` 폴백 금지. service role 없으면 fail closed.
- **감사 로그 필수**: 모든 admin 접근은 예외 없이 `admin_audit_logs`에 기록.
- **PII 최소화**: 승인된 요약 정보만 표시. 민감 정보 로그 기록 금지.
- **pathname-only**: `request_path`는 pathname만 저장. 쿼리스트링 저장 금지.
- **검색어 저장 금지**: 관리자 검색어는 audit/operational 로그에 기록하지 않음.
- **admin_members 단일 소스**: 환경변수 우회 없음, SQL/service-role 직접 등록만 허용.
- **fail closed**: 감사 기록 실패 시 Admin 데이터 렌더링 차단.

## Contract Evolution Candidates (Optional)
- 없음 — 첫 버전은 공식 문서 v1.7.2/v1.5.9/v1.3.9/v1.3.8/v1.2.12에 잠긴 계약을 그대로 구현한다.

## Primary User Path
1. 운영자가 OAuth로 로그인한 상태에서 `/admin` 직접 접근
2. admin_members 확인 → 성공 시 `admin_page_view` 감사 기록 → 대시보드 표시
3. 사용자 통계 요약, 운영 이벤트 요약, 관리 화면 링크 확인
4. ADMIN_USERS에서 사용자 목록 조회 (마스킹된 이메일, 카운트/상태)
5. ADMIN_EVENTS에서 최근 운영 이벤트 확인 (필터/상세)
6. ADMIN_AUDIT_LOGS에서 관리자 접근 기록 확인

## Delivery Checklist
> 이 체크리스트는 Stage 2~6 동안 계속 갱신하는 living closeout 문서다.

- [x] 백엔드 계약 고정 (admin guard, service role fail-closed, 3 read APIs) <!-- omo:id=delivery-backend-contract;stage=2;scope=backend;review=3,6 -->
- [x] API 연결 (GET /admin/users, /admin/operational-events, /admin/audit-logs) <!-- omo:id=delivery-api-adapter;stage=2;scope=backend;review=3,6 -->
- [x] 타입 반영 (AdminUser, OperationalEvent, AdminAuditLog 타입) <!-- omo:id=delivery-types;stage=2;scope=shared;review=3,6 -->
- [ ] UI 연결 (ADMIN_DASHBOARD, ADMIN_USERS, ADMIN_EVENTS, ADMIN_AUDIT_LOGS) <!-- omo:id=delivery-ui-connection;stage=4;scope=frontend;review=5,6 -->
- [x] 상태 전이 / 권한 / 멱등성 테스트 (401/403/500 fail-closed, audit write) <!-- omo:id=delivery-state-policy-tests;stage=2;scope=shared;review=3,6 -->
- [ ] Vitest / Playwright 자동화 범위 구분 <!-- omo:id=delivery-test-split;stage=4;scope=frontend;review=5,6 -->
- [x] fixture와 real DB smoke 경로 구분 <!-- omo:id=delivery-fixture-smoke-split;stage=2;scope=shared;review=3,6 -->
- [x] seed / bootstrap / system row 준비 여부 점검 (admin bootstrap SQL) <!-- omo:id=delivery-bootstrap-readiness;stage=2;scope=shared;review=3,6 -->
- [ ] loading / empty / error / read-only / unauthorized 상태 점검 <!-- omo:id=delivery-state-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] 테스트 에이전트 전달용 수동 QA 시나리오 정리 <!-- omo:id=delivery-manual-qa-handoff;stage=4;scope=frontend;review=6 -->
- [x] migration 파일 생성 (admin_members, operational_events, admin_audit_logs) <!-- omo:id=delivery-migration;stage=2;scope=backend;review=3,6 -->
- [x] recordOperationalEvent 헬퍼 연결 (최소 이벤트 소스 5종) <!-- omo:id=delivery-operational-event-helper;stage=2;scope=backend;review=3,6 -->
- [x] recordAdminAudit 헬퍼 연결 (모든 admin API + /admin 진입) <!-- omo:id=delivery-admin-audit-helper;stage=2;scope=backend;review=3,6 -->
- [ ] 로그 sanitizer (pathname-only, PII 제거) <!-- omo:id=delivery-log-sanitizer;stage=2;scope=backend;review=3,6 -->
- [ ] real DB smoke 통과 (migration, bootstrap, fail-closed) <!-- omo:id=delivery-real-db-smoke;stage=2;scope=backend;review=3,6 -->
- [ ] Design Authority evidence (Stage 4 screenshots) <!-- omo:id=delivery-design-authority-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] exploratory QA + qa:eval <!-- omo:id=delivery-exploratory-qa;stage=4;scope=frontend;review=6 -->
