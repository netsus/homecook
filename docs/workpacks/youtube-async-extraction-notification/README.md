# youtube-async-extraction-notification

## Goal

사용자가 `/menu/add/youtube`에서 YouTube 레시피 추출을 접수한 뒤 기다림 화면에 머물지 않고 다른 화면으로 이동해도 작업이 이어지게 한다. 성공·실패 결과는 앱 재실행과 재로그인 뒤에도 badge, toast, durable list로 복구하고, 성공 결과는 기존 검수·등록 또는 이미 등록된 레시피로 안전하게 이어진다.

> 2026-08-15 사용자 승인으로 `/recipes/new/youtube` standalone 공개 진입면도 같은 background+notification 흐름을 사용한다. planner 문맥은 숨기고 return context가 없으면 Home(`/`)으로 이동하며 자동 등록하지 않는다. 기존 sync endpoint는 다른 consumer 호환용으로 유지한다.
>
> 2026-08-26 사용자 승인으로 `admin_members` 등록 관리자는 rolling 24시간 10회 enqueue 한도에서만 예외다. active job 2개·worker permit·provider budget·전역 circuit breaker는 모든 사용자에게 유지한다. 관리자 판정은 email/환경변수/hardcoded UUID가 아닌 `admin_members` 행을 단일 소스로 사용한다.

## Branches

- Stage 1 문서: `docs/youtube-async-extraction-notification`
- Stage 2 백엔드: `feature/be-youtube-async-extraction-notification`
- Stage 4 프론트엔드: `feature/fe-youtube-async-extraction-notification`
- Stage 1/2/4 작성 작업과 internal 1.5/Stage 3/Stage 5/final authority/Stage 6 검토 작업은 모두 서로 다른 Codex task ID를 사용한다.
- high-risk product PR은 자동 merge하지 않고 current-head 전체 check가 green인 뒤 manual merge handoff로 끝낸다.

## In Scope

- 화면:
  - 기존 `/menu/add/youtube`의 URL 입력 뒤 background 접수 완료·active duplicate·offline·`POLICY_CHANGED`·작업 보기 흐름 (`YT_IMPORT_BACKGROUND`)
  - app shell의 YouTube 작업 전용 toast, badge, unseen/archive list/panel, success/failure/expired/consumed destination (`APP_SHELL_YOUTUBE_NOTIFICATIONS`)
  - 기존 `/menu/add/youtube?extractionId=<uuid>` 검수 재진입과 consumed recipe 이동
  - `/recipes/new/youtube` standalone background accepted/leave/notification/review 흐름과 Home fallback
- 신규 보호 API 6개:
  - `POST /api/v1/recipes/youtube/extraction-jobs`
  - `GET /api/v1/recipes/youtube/extraction-jobs/{job_id}`
  - `GET /api/v1/recipes/youtube/extractions/{extraction_id}`
  - `GET /api/v1/users/me/youtube-extraction-jobs`
  - `POST /api/v1/users/me/youtube-extraction-jobs/delivered`
  - `POST /api/v1/users/me/youtube-extraction-jobs/seen`
- 호환 변경 API:
  - 기존 `POST /api/v1/recipes/youtube/extract`는 공개 request/response와 Quick Import 의미를 바꾸지 않고 내부적으로 `submission_mode=sync_wait` job과 동일 worker를 사용한다.
- 상태 전이:
  - stored: `queued -> processing -> succeeded | failed`
  - lease 만료 + attempts 잔여: `processing -> queued -> processing`
  - lease 만료 + attempts 소진: `processing -> failed/ATTEMPTS_EXHAUSTED`; terminal 재claim 금지
  - public computed projection: unconsumed draft TTL 만료만 `expired`; `consumed-after-TTL`은 `succeeded` 유지
- DB 영향:
  - 신규 `youtube_extraction_jobs`
  - 신규 `youtube_extractor_permits`
  - 신규 non-secret `private.youtube_extraction_current_policy`
  - 신규 `private.youtube_extraction_worker_credentials`
  - 기존 `youtube_extraction_sessions.source_job_id` additive unique nullable linkage
  - exact enqueue/worker/permit/delivery/seen/credential-rotation RPC, roles, RLS/ACL, pre-request 및 expected-schema manifest
- worker/release:
  - request-independent extraction service, fenced claim/heartbeat/start/finalize/fail loop, global permit, deterministic worker artifact
  - frozen timing contract인 300초 lease / 30초 heartbeat를 app adapter와 standalone runtime이 하나의 timing manifest에서 소비하며, installer artifact가 해당 수치와 파일 SHA를 fail-closed 검증
  - same release SHA·schema identity·policy snapshot attestation을 검증하는 `mac-production:*` worker installer/runbook/credential rotation dry-run 경로
  - `com.homecook.youtube-extraction-worker` launchd template와 install/start/stop/restart/status/drain/uninstall/rollback rehearsal 계약
- Schema Change:
  - [ ] 없음 (읽기 전용)
  - [x] 있음 → Stage 2에서 과거 migration 수정 없이 additive migration을 TDD로 작성한다.

## Out of Scope

- Web Push permission, subscription, service worker, VAPID, push outbox
- 기존 동기 endpoint 삭제/deprecation
- `user_progress_notifications`와 YouTube 작업 알림 authority 통합
- 외부 managed queue 또는 Supabase Edge Function에서 전체 추출 실행
- request 단위 legacy fallback, 새 앱 release 안의 dormant direct-provider adapter
- UI에서 mode, pipeline, HMAC key/version/digest, policy snapshot, worker credential을 지정하거나 노출하는 기능
- production/staging DB migration apply, secret/JWT 발급, worker 설치, policy enable, rollout/rollback 실행
- holdout promotion, Web Push, cloud/container multi-host worker

## Dependencies

| 선행 슬라이스/계약 | 상태 | 확인 |
| --- | --- | --- |
| `33-youtube-i031-direct-extraction` | merged | [x] |
| 공식 contract PR `#1343` merge `25e10a7805f5bf171d4c1fbd94a573560b715786` | merged | [x] |
| 공식 tuple `1.7.34 / 1.5.38 / 1.3.36 / 1.3.36 / 1.2.41` | current; progress field additive successor | [x] |
| 최종 동결 계획 SHA-256 `7906f9ec975f309c310b2275714873cebb78e109770f885f09878e5c6bbed57a`, 991 lines, review task `019ffb44-5614-7af3-86a9-4ebd50977123` | independent PASS / Findings 없음 | [x] |
| Phase 1.5 local-only repair PR #1350, exact head `a625aefa7baab63f183a9d46e6f12d607d4e017f`, merge `c4045705ef72c76f7e7258d10c460f56b6847dd7` | independent PASS / Findings 없음, merged | [x] |

> 제품 구현은 이 Stage 1 docs PR이 independent internal 1.5에서 approve되고 `master`에 merge된 뒤에만 시작한다.

## Backend First Contract

### Public request/response

- enqueue request는 exact union `{ "youtube_url": string } | { "retry_job_id": uuid }`다. unknown field, 두 branch 동시 전달, empty branch는 `422 VALIDATION_ERROR`다.
- retry는 owner terminal `failed|expired`와 `can_retry=true`만 허용한다. 이전 job에서는 `youtube_video_id`만 복사하고 이전 row를 바꾸지 않으며, retry 시점의 current complete policy snapshot으로 새 fingerprint/job을 만든다.
- enqueue 성공은 exact `202` data `{ job_id, status, deduplicated, submitted_at }`다. active duplicate 또는 유효 succeeded draft는 기존 job을 `deduplicated=true`로 반환할 수 있다.
- status exact data는 `{ job_id, status, submitted_at, started_at, completed_at, result, error, can_retry, progress }`다. 이 선행 workpack이 구현한 기존 8개 key 의미는 유지하고 successor contract의 nullable `progress` key만 additive한다.
- status/list succeeded result는 exact `{ extraction_id, review_path, recipe_id, recipe_path }`다. draft와 consumed destination의 null/non-null 의미를 공식 API 그대로 유지한다.
- session-read exact data는 `{ status, draft, recipe_id, recipe_path }`다. 본인 consumed session과 `consumed-after-TTL`은 `200`; 본인 unconsumed draft TTL 만료만 `410 EXTRACTION_EXPIRED`; 타인/없는 session은 동일 `404 EXTRACTION_NOT_FOUND`다.
- list item exact field set은 `job_id, status, submitted_at, completed_at, video_title_snapshot, thumbnail_url, delivery_key, delivered_at, seen_at, result, error, can_retry`다. cursor order는 `(completed_at DESC, job_id DESC)`다.
- delivered request는 exact `{ delivery_keys: string[1..50] }`, seen request는 exact `{ job_ids: uuid[1..50] }`이며 타인/없는/already-processed 값은 nondisclosure로 무시한다.
- 모든 response는 `{ success, data, error }`, outer error는 `{ code, message, fields[] }` 구조를 유지한다.

### Error and retry authority

- enqueue: `401 UNAUTHORIZED`, `404 FEATURE_DISABLED|JOB_NOT_FOUND`, `422 INVALID_URL|VALIDATION_ERROR`, `409 JOB_NOT_RETRYABLE|POLICY_CHANGED`, `429 RATE_LIMITED`, `503 QUEUE_UNAVAILABLE`.
- status: `401 UNAUTHORIZED`, `404 JOB_NOT_FOUND`.
- session-read: `401 UNAUTHORIZED`, `404 EXTRACTION_NOT_FOUND`, `410 EXTRACTION_EXPIRED`.
- list/delivered/seen: `401 UNAUTHORIZED`, `422 VALIDATION_ERROR`; list cursor 오류는 `422 INVALID_CURSOR`.
- Quick Import compatibility: `503 QUEUE_BUSY`와 `504 EXTRACTION_TIMEOUT`; shared job을 cancel/failed로 바꾸지 않는다.
- failed/expired 내부 error의 exhaustive public code는 `NOT_RECIPE_VIDEO`, `QUOTA_EXCEEDED`, `RUNTIME_UNAVAILABLE`, `ATTEMPTS_EXHAUSTED`, `EXTRACTION_FAILED`, `EXTRACTION_EXPIRED`다. `can_retry=true`일 때만 retry CTA/body를 만든다.

### Authentication, ownership, idempotency

- 공개 edge는 Next `/api/v1`뿐이다. Supabase Data API/RPC는 loopback/private server-only이고 public proxy에서는 403/404다.
- enqueue route는 `createRouteHandlerClient()`의 refreshed user session으로 exact SECURITY DEFINER RPC를 호출한다. owner는 `auth.uid()`에서만 도출하며 별도 enqueue credential/API role은 없다.
- fingerprint HMAC은 privacy-preserving dedupe일 뿐 인증/attestation이 아니다. DB는 HMAC secret을 알지 못하고 worker에는 fingerprint key를 전달하지 않는다.
- transaction advisory shared lock → enabled policy plain SELECT → expected version/digest exact match → key version/window/format → dual-read dedupe → budget → current-write INSERT 순서를 지킨다. mismatch는 `POLICY_CHANGED`와 write/dedupe/budget 0이다.
- budget은 모든 사용자의 active job 2개를 먼저 적용한다. rolling 24시간 10회는 `admin_members` 행이 없는 일반 사용자에게만 적용한다. enqueue RPC owner는 `admin_members.user_id` 컬럼과 request JWT `sub`와 일치하는 self-row만 볼 수 있으며 direct authenticated table access는 없다.
- worker는 table/sequence privilege 0인 restricted API role과 exact hardened RPC만 쓴다. `job_id + worker_id + lease_generation`, permit generation, `allowed_snapshot_digest`, credential generation/JTI hash/expiry/release SHA/schema identity를 모두 검증한다.
- 처리 실행은 at-least-once일 수 있지만 `source_job_id`와 단일 finalize transaction의 session/candidates/job 결과는 idempotent exactly-once projection이어야 한다.

## Frontend Delivery Mode

- Design Status는 Stage 4 evidence 생성으로 `pending-review`다. 기존 YT_IMPORT visual language와 app shell 패턴을 재사용하되 새 핵심 flow이므로 Stage 5와 별도 final authority 없이는 `confirmed`로 올리지 않는다.
- 필수 상태: `loading / empty / error / offline / read-only / unauthorized`.
- 추가 상태: accepted, active duplicate, succeeded draft, consumed success, failed retryable, failed non-retryable, expired, grouped terminal notifications, archive.
- 비로그인 shell과 보호 CTA는 private count/title/thumbnail을 렌더하지 않고 LOGIN + allowlisted return-to-action을 유지한다.
- toast는 `aria-live="polite"`로 알리되 focus를 빼앗지 않는다. icon+text로 상태를 구분하고 badge/list를 durable authority로 함께 제공한다.
- `390px / 320px / desktop`에서 scroll containment, primary CTA, notification panel/list, safe-area, focus, copy wrapping을 검증한다.

## Design Authority

- UI risk: `high-risk`
- Anchor screen dependency: 없음. `HOME`, `RECIPE_DETAIL`, `PLANNER_WEEK`를 수정하지 않지만 app shell 전역 interaction과 YT_IMPORT 핵심 flow를 바꾼다.
- Required screens: `YT_IMPORT_BACKGROUND`, `APP_SHELL_YOUTUBE_NOTIFICATIONS`
- Visual artifact: `ui/designs/YT_IMPORT_BACKGROUND.md`, `ui/designs/APP_SHELL_YOUTUBE_NOTIFICATIONS.md`, 각 matching critique, Stage 4 `ui/designs/evidence/youtube-async-extraction-notification/` matrix
- Before screenshot paths:
  - YT_IMPORT: `ui/designs/evidence/33-youtube-i031-direct-extraction/mobile-390-loading.png`, `mobile-320-loading.png`, `desktop-1280-loading.png`
  - app shell notification baseline: `ui/designs/evidence/34c-growth-notification-ui/mobile-390.png`, `mobile-320.png`, `desktop-1440.png` (layout 참고만 사용하며 data authority는 재사용하지 않음)
- Authority status: `pass`, fresh independent final authority `/root/youtube_focus_design_rereview`가 publication head `a76df8f8e3d342968cf920cedb9289b8546018f0`의 implementation `3c1e0d422b0849f7f086d1b7fefc55bac41eee60`을 blocker/major/minor `0/0/0`으로 승인했다.
- Authority report targets: `ui/designs/authority/YT_IMPORT_BACKGROUND-authority.md`, `ui/designs/authority/APP_SHELL_YOUTUBE_NOTIFICATIONS-authority.md`

## Design Status

- [ ] 임시 UI (temporary) — Stage 1 설계 계약만 잠겼고 실제 구현 evidence는 없음
- [ ] 리뷰 대기 (pending-review) — current implementation head `3c1e0d422b0849f7f086d1b7fefc55bac41eee60`의 독립 final authority 완료로 종료
- [x] 확정 (confirmed) — fresh authority가 최초 closed mount focus finding의 RED-to-GREEN 수리, 실제 open→close/disconnected-opener 복귀, 320/390/desktop PNG 30개 재사용 근거를 재검토하고 `PASS — Findings 없음`, blocker/major/minor `0/0/0`으로 승인했다
- [ ] N/A — BE-only 슬라이스

### Stage 4 Frontend Evidence

- Implementation base/code head/tree: `25e8da8b04c2322f68d8f54837135399d7586da7` → `3c1e0d422b0849f7f086d1b7fefc55bac41eee60` / `ee5e40de5c9de3e5bbbda766d233c7f118a2df3f`
- Screenshot capture source: `2113dacdbb464f6422424324a38823e8c3d6933a` / `ed823a064774dee538df8cde47c483af08efa7dc`; current focus guard는 rendered markup/style/copy/geometry와 screenshot generator를 바꾸지 않아 PNG 30개를 재사용했다.
- Screenshot manifest: `ui/designs/evidence/youtube-async-extraction-notification/manifest.json`
- Visual verdict: `ui/designs/evidence/youtube-async-extraction-notification/visual-verdict.json` — `93/100`, pass (구현 task 판정이며 독립 authority 승인 아님)
- Exploratory QA: `ui/designs/evidence/youtube-async-extraction-notification/exploratory-qa.json` 및 tracked `portable-exploratory-qa/` raw bundle — `97/100`, 42/46 covered, finding 0
- Deterministic browser QA: `tests/e2e/youtube-async-extraction-notification.spec.ts` — port `3217`, 27 scenarios와 3-project 81 executions passed. 320px는 YouTube→Growth 1→Growth 2를 한 card씩 순차 표시하고 대기 Growth의 timer/seen·badge/list 복구를 보존한다. 390/desktop은 두 채널 비겹침·각 CTA ownership·기존 Growth stacking·읽기 순서를 유지한다. panel/list 한국어 어절 보존과 기존 focus/reload/archive/planner 회귀를 포함하는 390/320/desktop screenshot 30개를 재생성했다.
- Focused component/integration QA: current focus finding 관련 5-file Vitest 89 passed; backend/worker/runtime/installer/migration focused Vitest 93 passed; 격리 random-port PostgreSQL/PostgREST 56 passed(299/300/301초 reclaim boundary 포함); full Vitest 6,160 passed/459 skipped; product 2,741 passed/175 skipped; lint/typecheck/build passed; official frontend gate(62 smoke passed/10 skipped, 8 a11y passed/1 skipped, 12 visual passed), 12 security E2E, contract-only security-function authorization gate, frozen-lockfile install, `pnpm audit --audit-level high`가 통과했다. worker artifact verifier와 exact release metadata, 300초 lease/30초 heartbeat provenance, permit/lock/fence, secret-root lexical ancestor fail-closed 경계를 유지한다.
- Boundary: Supabase Cloud/linked/remote/credential access 0, 운영 local Supabase/app `3100`/user data/port/volume/env/secret/launchd mutation 0. Stage 5 코드 재검토, final authority와 exact-head Stage 6는 모두 `PASS — Findings 없음`으로 완료됐다. Manual Only는 미완료다.

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.34.md` §0-YT-ASYNC
- `docs/화면정의서-v1.5.38.md` §0-YT-ASYNC
- `docs/유저flow맵-v1.3.36.md` §0-YT-ASYNC
- `docs/db설계-v1.3.36.md` §0-YT-ASYNC
- `docs/api문서-v1.2.41.md` §0-YT-ASYNC
- `docs/engineering/supabase-local-only-operations.md`
- `docs/workpacks/33-youtube-i031-direct-extraction/README.md`
- 최종 동결 계획: `/Users/cwj/01_vibe_coding/homecook/.omx/plans/youtube-background-extraction-notification-plan-20260808.md`, SHA-256 `7906f9ec975f309c310b2275714873cebb78e109770f885f09878e5c6bbed57a`, 991 lines
- independent plan PASS / Findings 없음 task `019ffb44-5614-7af3-86a9-4ebd50977123`
- contract reviewer PASS task `019ff598-233b-72c1-92f5-4372596ede7a`

## QA / Test Data Plan

- fixture baseline:
  - owner A/B 계정, queued/processing/succeeded-draft/succeeded-consumed/failed-retryable/failed-non-retryable/expired jobs
  - active duplicate current/previous HMAC pair, options-only policy rotation stale app/worker, lease/permit/credential stale generations
  - null/160-char sanitized title, grouped completion, delivered/seen split, invalid cursor, offline and auth-return
- real DB smoke:
  - 운영 volume과 분리된 pinned isolated local Supabase reset 후 migration replay, PostgreSQL role/RLS/ACL/RPC inventory와 Data API negative boundary를 검증한다.
  - app route enqueue/status/session/list/delivered/seen smoke는 `createRouteHandlerClient()` owner session과 cross-user nondisclosure를 확인한다.
  - restricted worker JWT로 exact RPC만 성공하고 table/REST/other scope/owner role access가 모두 실패하는지 확인한다.
- seed/reset:
  - 운영 stack과 분리된 `pnpm verify:security-functions:isolated` 및 `pnpm verify:local-supabase-runtime:isolated`만 사용한다.
  - Supabase Cloud/linked/remote target은 N/A/forbidden이다. Stage 2~6 evidence는 remote link/credential access 0과 운영 full-local destructive reset 0을 명시한다.
- external/live smoke:
  - arbitrary public YouTube URL을 local worker에서 enqueue→HOME 이탈→terminal notification→review/register까지 확인한다.
  - worker 강제 종료/lease recovery, app 재실행·재로그인 unseen recovery, Quick Import `sync_wait` 호환, release installer dry-run/rollback rehearsal을 별도 evidence로 남긴다.
- blocker:
  - official tuple/plan hash drift, workpack 33 regression, expected-schema/RPC/role inventory drift, current policy disabled/mismatch, app/worker release SHA drift, worker credential/secret provenance 실패, remote link/credential 사용, 운영 full-local destructive reset, current-head check 미완료 중 하나라도 있으면 다음 gate로 진행하지 않는다.

## Stage 1 Validation Boundary

- Stage 1 pre-merge required validation은 현재 branch의 README, acceptance, automation, workflow projection을 직접 읽는 local doc gate와 targeted Vitest다. 아직 `origin/master`에 이 workpack이 없다는 이유로 실패하는 `validate:workpack -- --slice`를 현재 gate로 선언하지 않는다.
- current required commands:
  - `pnpm validate:source-of-truth-sync`
  - `pnpm validate:workflow-v2`
  - `node scripts/validate-automation-spec.mjs --slice youtube-async-extraction-notification`
  - `pnpm validate:omo-bookkeeping`
  - `node --input-type=module -e "import { evaluateDocGate } from './scripts/lib/omo-doc-gate.mjs'; const result = evaluateDocGate({ slice: 'youtube-async-extraction-notification' }); console.log(result.summary); if (result.outcome !== 'pass') process.exit(1);"`
  - `pnpm exec vitest run tests/youtube-async-extraction-notification-stage1.test.ts tests/youtube-background-extraction-contract.test.ts tests/workflow-v2-docs.test.ts tests/omo-automation-spec.test.ts tests/omo-bookkeeping.test.ts tests/omo-doc-gate.test.ts tests/source-of-truth-sync.test.ts`
  - `pnpm lint`, `pnpm typecheck`, `pnpm audit --audit-level high`, `git diff --check`
- post-merge / Stage 2 preflight는 이 docs PR이 `master`에 merge된 뒤 `BRANCH_NAME=feature/be-youtube-async-extraction-notification pnpm validate:workpack -- --slice youtube-async-extraction-notification`로 `origin/master`의 workpack 존재를 fail closed한다.
- CTA contract regression은 `YT_IMPORT_BACKGROUND=가져오기`, success draft notification=`결과 확인`을 exact match하고 다른 대체 문구를 거부한다.

## Key Rules

1. `consumed`가 TTL보다 우선한다. `consumed-after-TTL`은 성공 recipe destination이며 retry를 제공하지 않는다.
2. unconsumed draft TTL 만료만 computed `expired`; stored job terminal을 되돌리지 않는다.
3. enqueue/retry body는 exact union이고 browser는 mode/options/key/digest/policy를 지정하지 않는다.
4. `POLICY_CHANGED`는 insert/dedupe/budget 0이며 URL 입력을 보존한다.
5. active dedupe는 current/valid previous pair dual-read, 새 row는 current-write다.
6. worker claim/reaper/start/finalize는 job snapshot digest와 fencing generation을 바꾸지 않는다. options-only rotation old worker는 0건 처리한다.
7. `attempt_count`는 provider permit을 얻고 실제 provider를 시작할 때만 증가한다. exhausted lease는 reaper가 terminal로 닫고 재claim하지 않는다.
8. delivered는 toast 렌더, seen은 사용자 확인이다. toast만으로 unseen/badge를 지우지 않는다.
9. `can_retry=false`면 toast/list/deep link 어디에도 retry CTA나 POST가 없다.
10. `/recipes/new/youtube`는 standalone background accepted/leave/notification UX를 사용하고 기존 sync endpoint response는 다른 consumer 호환용으로 유지하며 provider executor는 worker 하나뿐이다.
11. raw URL/transcript/frame/provider payload, user access/refresh token, cookie, HMAC key, signing/service-role key를 job/worker artifact/env/argv/plist/log에 저장하지 않는다.
12. rollout/rollback은 queue drain, permit, release SHA/schema/policy snapshot을 함께 검증한다. queue가 남은 상태에서 worker와 direct sync provider를 동시에 실행하지 않는다.

## Stage Ownership And Implementation Units

| 단계 | 독립 역할 | 구현 단위 / authority | 완료 evidence |
| --- | --- | --- | --- |
| Stage 1 | `stage1-docs-author` | workpack, exact acceptance IDs, automation/workflow bookkeeping, 2개 design-generator·critic decision record | Draft docs PR; 자기 승인/merge 금지 |
| internal 1.5 | 별도 `docs-gate-reviewer` | 공식 tuple·계획 hash·API/DB/worker/UI/rollback·design authority·checklist metadata 검토 | reviewed exact head, approve, unresolved required finding 0 |
| Stage 2A | `backend-implementer` | RED 먼저: migration, policy/job/permit/credential schema, exact roles/RLS/ACL/RPC, PostgreSQL/PostgREST security | `YTASYNC-DB-*`, `YTASYNC-SEC-*` green |
| Stage 2B | 같은 Stage 2 작성 task | RED 먼저: 6 public route, exact unions/projections/errors/cursor/delivered/seen, Quick Import `sync_wait` 호환 | `YTASYNC-API-*` green |
| Stage 2C | 같은 Stage 2 작성 task | RED 먼저: request-independent service, worker/reaper/fencing/permit/finalize, artifact build, mac-production installer/runbook/rotation dry-run | `YTASYNC-WORKER-*`, `YTASYNC-OPS-*` green |
| Stage 3 | 별도 `backend-reviewer` | current backend head의 security/authority, DB contract, code quality, tests, release installer/rollback을 read-only 우선 검토 | approve, P0/P1/P2 0/0/0, current-head checks green |
| Stage 4 | 별도 `frontend-implementer` | background submit/re-entry + shell notification/list/badge; unit/E2E/a11y/visual/exploratory QA; 390/320/desktop after evidence | Design Status `pending-review`, required acceptance IDs checked |
| authority precheck | Stage 4와 다른 `design-reviewer` | screenshot/Figma evidence, primary CTA, scroll containment, focus/aria-live, small viewport | 두 authority report draft, blocker 0 |
| Stage 5 | Stage 4와 다른 `design-reviewer` | 구현 코드와 exploratory QA의 design/quality review | frontend `review=5` IDs approve |
| final authority | Stage 4/5와 다른 `product-design-authority` | 두 screen current-head 390/320/desktop evidence 판정 | verdict `pass`, blocker/major 0, `confirmed` 허용 |
| Stage 6 | Stage 4와 다른 `frontend-closeout-reviewer` | 전체 non-manual acceptance, current-head 모든 checks, closeout projection, release/manual 경계 검토 | approve + manual merge handoff; 자동 merge 금지 |

Stage 2A→2B→2C는 의존 순서다. 하나의 backend PR로 유지하면 RED/GREEN commit과 evidence를 단위별로 분리한다. PR을 나누면 각 Ready backend PR은 해당 단위의 Stage 2 checklist만 닫고 별도 Stage 3 review를 거치며, 다음 단위는 선행 merge 뒤 진행한다.

## Test ID Map

| ID family | owning stage | 최소 검증 |
| --- | --- | --- |
| `YTASYNC-CONTRACT-001..006` | Stage 2 / Stage 3 | 공식 tuple, 6 endpoint, exact field/error/retry/Quick Import 계약 |
| `YTASYNC-DB-001..012` | Stage 2A / Stage 3 | schema/check/index, policy snapshot, dedupe/budget, reaper→claim, finalize, TTL/consumed projection |
| `YTASYNC-SEC-001..012` | Stage 2A / Stage 3 | owner nondisclosure, exact roles/membership/RLS/ACL, public Data API 403/404, secret/token absence |
| `YTASYNC-API-001..012` | Stage 2B / Stage 3 | union validation, wrapper, status/list/session projections, cursor, delivered/seen, sync_wait |
| `YTASYNC-WORKER-001..014` | Stage 2C / Stage 3 | crash/reclaim, stale generation 0 write, permit, retry, abort/cleanup, snapshot/credential attestation |
| `YTASYNC-OPS-001..010` | Stage 2C / Stage 3 | artifact SHA/entrypoint, same release install, rotation, reboot ordering, drain/rollback dry-run |
| `YTASYNC-FE-001..014` | Stage 4 / Stage 5/6 | submit/duplicate/offline/re-entry, toast/badge/list, retry gate, consumed/expired, auth return |
| `YTASYNC-A11Y-001..006` | Stage 4 / Stage 5/6 | aria-live, focus, text+icon, keyboard, 200% text, reduced motion |
| `YTASYNC-VIS-001..006` | Stage 4 / authority/Stage 5/6 | before/after 390/320/desktop, scroll containment, CTA, safe-area, no overlap |
| `YTASYNC-E2E-001..008` | Stage 4 / Stage 6 | local worker full path, restart/relogin, crash recovery, cross-user, Quick Import, rollback rehearsal |

## Release, Rollback And Worker Installer Gate

- Stage 2는 installer/template/runbook과 read-only/dry-run validators만 구현한다. 실제 production/staging install, migration apply, credential issue, policy enable은 Manual Only다.
- initial release 순서: disabled schema/roles/RPC → same release app+worker artifact install → expected-schema/current-policy/credential/snapshot preflight → exclusive enable → enqueue publish.
- later rotation: enqueue maintenance → old snapshot drain → exclusive disable/CAS → new app/worker install → preflight/attestation → exclusive enable → resume.
- rollback: enqueue 차단 → queue drain → worker stop → permit release 확인 → additive schema 호환 이전 app release 설치 → 기존 sync endpoint 성공 smoke → UI 공개.
- drain 실패, app/worker SHA mismatch, schema/policy snapshot mismatch, restricted credential failure, public Data API 노출, secret provenance 실패는 모두 fail closed다.

## Contract Evolution Candidates

- 없음. 공식 계약 PR #1343과 2026-08-15 standalone background activation addendum이 현재 public/DB/UI/Flow 계약이다. Web Push, sync endpoint deprecation, multi-host worker는 Out of Scope다.

## Primary User Path

1. 로그인 사용자가 `/menu/add/youtube`에서 URL을 검증하고 background 추출을 접수한다.
2. `202 Accepted` 후 안내와 `작업 보기`를 확인하고 HOME 등 다른 화면으로 이동한다.
3. 별도 worker가 job을 fenced claim하고 기존 i031 pipeline을 실행해 session/candidate/job을 한 transaction으로 완료한다.
4. app shell이 foreground·재로그인·재실행 때 unseen terminal job을 읽고 toast, badge, durable list를 표시한다.
5. 사용자는 성공 draft를 검수·등록하거나 consumed recipe로 이동하고, retryable failure/expired만 새 job으로 재시도한다.

## Delivery Checklist

> 체크는 해당 Stage의 테스트·review·runtime evidence가 생긴 뒤에만 한다. Stage 1 작성 작업은 아래 구현 항목을 미리 체크하지 않는다.

- [x] DB schema, policy snapshot, queue/permit/credential authority와 exact RPC가 공식 계약대로 구현된다 <!-- omo:id=delivery-yta-db-authority;stage=2;scope=backend;review=3,6 -->
- [x] 6개 신규 public endpoint와 기존 Quick Import `sync_wait` 호환 계약이 구현된다 <!-- omo:id=delivery-yta-api-contract;stage=2;scope=backend;review=3,6 -->
- [x] request-independent extraction service와 fenced worker/finalize가 구현된다 <!-- omo:id=delivery-yta-worker-runtime;stage=2;scope=backend;review=3,6 -->
- [x] same-release worker artifact와 installer/rotation/rollback dry-run 경로가 구현된다 <!-- omo:id=delivery-yta-worker-installer;stage=2;scope=backend;review=3,6 -->
- [x] owner/RLS/ACL/nondisclosure와 secret boundary가 PostgreSQL/PostgREST 테스트로 고정된다 <!-- omo:id=delivery-yta-security-tests;stage=2;scope=shared;review=3,6 -->
- [x] retry/dedupe/policy rotation/lease/permit/finalize/consumed-TTL 상태가 TDD로 고정된다 <!-- omo:id=delivery-yta-state-tests;stage=2;scope=shared;review=3,6 -->
- [x] `YT_IMPORT_BACKGROUND` submit/duplicate/offline/re-entry UI가 연결된다 <!-- omo:id=delivery-yta-import-ui;stage=4;scope=frontend;review=5,6 -->
- [x] `APP_SHELL_YOUTUBE_NOTIFICATIONS` toast/badge/list/archive/seen UI가 연결된다 <!-- omo:id=delivery-yta-shell-ui;stage=4;scope=frontend;review=5,6 -->
- [x] loading/empty/error/offline/read-only/unauthorized 및 retry gate가 구현된다 <!-- omo:id=delivery-yta-state-ui;stage=4;scope=frontend;review=5,6 -->
- [x] 390/320/desktop visual·a11y·scroll/focus evidence가 생성된다 <!-- omo:id=delivery-yta-design-evidence;stage=4;scope=frontend;review=5,6 -->
- [x] deterministic E2E와 exploratory QA/eval이 분리되어 current frontend head에서 통과한다 <!-- omo:id=delivery-yta-qa-split;stage=4;scope=frontend;review=5,6 -->
- [x] fixture/격리 real DB/restricted worker/외부 smoke와 Manual Only 경계가 evidence에 구분된다. 운영 local stack과 remote target은 사용하지 않았다 <!-- omo:id=delivery-yta-evidence-split;stage=4;scope=shared;review=6 -->
- [x] fresh Stage 5 코드 재검토는 코드 finding 0, final authority는 두 screen blocker/major/minor 0으로 승인했다 <!-- omo:id=delivery-yta-final-authority;stage=4;scope=frontend;review=5,6 -->
- [x] fresh Stage 6가 reviewed exact head `eb8d915b44b63611904760375f7c0606e629b6e0`의 non-manual closeout, canonical bookkeeping과 started checks 전부 success/intended skip을 `PASS — Findings 없음`으로 승인했다 <!-- omo:id=delivery-yta-closeout;stage=4;scope=shared;review=6 -->
