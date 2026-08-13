# Acceptance - youtube-async-extraction-notification

> 공식 tuple은 `requirements 1.7.31 / screen 1.5.35 / Flow 1.3.33 / DB 1.3.33 / API 1.2.38`다. 체크는 실제 구현·테스트·독립 review evidence 뒤에만 한다. `Manual Only` 항목에는 omo metadata를 붙이지 않으며 자동화 완료와 섞지 않는다.

## Happy Path

- [ ] `POST /api/v1/recipes/youtube/extraction-jobs`가 provider를 직접 호출하지 않고 exact union을 `202 {job_id,status,deduplicated,submitted_at}`로 접수한다 <!-- omo:id=accept-yta-enqueue-202;stage=2;scope=backend;review=3,6 -->
- [ ] 사용자는 접수 뒤 다른 화면으로 이동·새로고침·앱 종료해도 같은 job의 terminal 결과를 복구한다 <!-- omo:id=accept-yta-background-durable;stage=4;scope=frontend;review=5,6 -->
- [ ] worker 성공은 session/candidates/job을 한 finalize transaction으로 만들고 draft 검수·등록으로 연결한다 <!-- omo:id=accept-yta-finalize-review-register;stage=2;scope=shared;review=3,6 -->
- [ ] app shell은 재로그인/foreground/재실행 뒤 unseen success/failure/expired를 toast+badge+durable list로 표시한다 <!-- omo:id=accept-yta-shell-notification;stage=4;scope=frontend;review=5,6 -->
- [ ] 성공 draft CTA `결과 확인`은 exact session-read로 검수 화면을 복원하고 consumed CTA `레시피 보기`는 등록 recipe로 이동한다 <!-- omo:id=accept-yta-success-destination;stage=4;scope=frontend;review=5,6 -->
- [ ] 기존 `/recipes/new/youtube` Quick Import UI·sync response·auto-register 의미가 유지된다 <!-- omo:id=accept-yta-quick-import-compat;stage=2;scope=shared;review=3,6 -->

## State / Policy

- [ ] stored transition은 `queued -> processing -> succeeded|failed`만 허용하고 terminal row를 되살리지 않는다 <!-- omo:id=accept-yta-terminal-transition;stage=2;scope=backend;review=3,6 -->
- [ ] lease-expired processing은 같은 transaction의 `reaper -> claim`을 따르고 attempts 소진은 `ATTEMPTS_EXHAUSTED`+delivery key로 terminal 처리되어 재claim되지 않는다 <!-- omo:id=accept-yta-reaper-claim;stage=2;scope=backend;review=3,6 -->
- [ ] `attempt_count`는 permit 획득 후 실제 provider start에서만 증가하고 permit 대기는 attempt를 소비하지 않는다 <!-- omo:id=accept-yta-attempt-authority;stage=2;scope=backend;review=3,6 -->
- [ ] active current/previous fingerprint pair는 dual-read dedupe되고 새 job은 current-write만 사용한다 <!-- omo:id=accept-yta-dual-read-current-write;stage=2;scope=backend;review=3,6 -->
- [ ] enqueue/retry와 policy rotation 경합은 old/new 중 한 complete snapshot만 저장하고 mixed snapshot은 0이다 <!-- omo:id=accept-yta-policy-snapshot-atomic;stage=2;scope=backend;review=3,6 -->
- [ ] options-only rotation은 stale app을 `POLICY_CHANGED` write 0으로 막고 old worker의 claim/reaper/start/finalize를 0으로 만든다 <!-- omo:id=accept-yta-options-rotation-fail-closed;stage=2;scope=backend;review=3,6 -->
- [ ] unconsumed draft TTL 만료만 public `expired`이고 `consumed-after-TTL`은 succeeded+recipe destination+`can_retry=false`다 <!-- omo:id=accept-yta-consumed-ttl-precedence;stage=2;scope=shared;review=3,6 -->
- [ ] toast 렌더는 delivered만 기록하고 목록 항목/CTA 확인만 seen을 기록하며 archive는 30일 retention을 유지한다 <!-- omo:id=accept-yta-delivered-seen-archive;stage=2;scope=shared;review=3,6 -->
- [ ] `can_retry=false`이면 toast/list/deep link 어디에도 retry CTA/body/POST가 없다 <!-- omo:id=accept-yta-can-retry-first;stage=4;scope=frontend;review=5,6 -->

## Error / Permission

- [ ] unauthenticated route는 `401 UNAUTHORIZED`이고 private job count/title/thumbnail을 렌더하지 않으며 LOGIN return-to-action을 보존한다 <!-- omo:id=accept-yta-unauthorized-return;stage=4;scope=frontend;review=5,6 -->
- [ ] 없는/타인 job과 session은 공식 동일 404 의미로 숨겨 소유 여부를 노출하지 않는다 <!-- omo:id=accept-yta-owner-nondisclosure;stage=2;scope=backend;review=3,6 -->
- [ ] enqueue body의 두 branch 동시/empty/unknown policy·digest field는 `422 VALIDATION_ERROR`와 write 0이다 <!-- omo:id=accept-yta-exact-union-validation;stage=2;scope=backend;review=3,6 -->
- [ ] `POLICY_CHANGED`는 URL 입력을 보존한 안전 문구를 표시하고 success/terminal 알림으로 저장하지 않는다 <!-- omo:id=accept-yta-policy-changed-ui;stage=4;scope=frontend;review=5,6 -->
- [ ] offline 또는 enqueue response 미수신은 local success를 추측하지 않고 입력 보존+retry를 제공한다 <!-- omo:id=accept-yta-offline-unknown-submit;stage=4;scope=frontend;review=5,6 -->
- [ ] exhaustive 6개 public failure code의 message/retryable/CTA가 공식 표와 exact match한다 <!-- omo:id=accept-yta-safe-failure-table;stage=4;scope=frontend;review=5,6 -->
- [ ] `QUEUE_BUSY`/`EXTRACTION_TIMEOUT`과 disconnect는 shared job을 cancel/failed로 바꾸지 않고 durable completion으로 회복한다 <!-- omo:id=accept-yta-sync-wait-recovery;stage=2;scope=shared;review=3,6 -->
- [ ] loading/empty/error/offline/read-only/unauthorized 화면 상태가 모두 존재하고 safe retry/recovery를 제공한다 <!-- omo:id=accept-yta-required-ui-states;stage=4;scope=frontend;review=5,6 -->

## Data Integrity

- [ ] `youtube_extraction_sessions.source_job_id` unique linkage와 replay가 session/candidate/job exact one-result projection을 보장한다 <!-- omo:id=accept-yta-source-job-exactly-once;stage=2;scope=backend;review=3,6 -->
- [ ] job에는 normalized video ID만 저장하고 raw/encrypted URL, transcript, frame, provider payload, secret이 저장되지 않는다 <!-- omo:id=accept-yta-private-data-minimization;stage=2;scope=backend;review=3,6 -->
- [ ] enqueue owner는 `createRouteHandlerClient()` user session의 `auth.uid()`에서만 도출되고 caller-supplied user UUID를 받지 않는다 <!-- omo:id=accept-yta-user-session-authority;stage=2;scope=backend;review=3,6 -->
- [ ] fingerprint HMAC을 인증/attestation으로 사용하지 않고 DB는 HMAC secret을 읽지 않으며 worker에는 key를 전달하지 않는다 <!-- omo:id=accept-yta-hmac-purpose-boundary;stage=2;scope=backend;review=3,6 -->
- [ ] worker API roles는 table/sequence privilege 0이고 exact RPC owner/RLS/ACL/membership/pre-request만 통과한다 <!-- omo:id=accept-yta-worker-least-privilege;stage=2;scope=backend;review=3,6 -->
- [ ] stale job/permit/credential generation의 heartbeat/start/cache/event/method/finalize/fail/release write는 모두 0이다 <!-- omo:id=accept-yta-generation-fencing;stage=2;scope=backend;review=3,6 -->
- [ ] raw worker/manager JWT, signing/service-role key, user access/refresh token, cookie, HMAC key가 DB·Git·artifact·env·argv·plist·log에 없다 <!-- omo:id=accept-yta-secret-boundary;stage=2;scope=backend;review=3,6 -->
- [ ] title snapshot은 nullable sanitized 160자이고 null이면 UI가 `YouTube 레시피` fallback을 쓴다 <!-- omo:id=accept-yta-title-snapshot;stage=4;scope=frontend;review=5,6 -->

## Data Setup / Preconditions

- [ ] fixture가 두 owner와 queued/processing/succeeded draft/consumed/failed retryable/non-retryable/expired 상태를 결정론적으로 만든다 <!-- omo:id=accept-yta-fixture-matrix;stage=2;scope=shared;review=3,6 -->
- [ ] 운영 volume과 분리된 pinned isolated local Supabase reset에서 4개 schema surface, roles, membership, RLS/ACL, exact RPC signature와 disabled initial policy를 검증한다 <!-- omo:id=accept-yta-local-db-readiness;stage=2;scope=shared;review=3,6 -->
- [ ] app descriptor, worker artifact, credential singleton의 release SHA/schema identity/allowed snapshot digest가 exact match해야 enqueue/claim이 열린다 <!-- omo:id=accept-yta-release-attestation;stage=2;scope=shared;review=3,6 -->
- [ ] restricted worker JWT로 allowlisted RPC만 성공하고 public Data API/other REST/RPC/table/owner role 접근은 실패한다 <!-- omo:id=accept-yta-postgrest-negative;stage=2;scope=shared;review=3,6 -->
- [ ] workpack 33 exact i031 manifest/options/preflight/no-fallback/20분 timeout/cleanup 회귀가 green이다 <!-- omo:id=accept-yta-i031-regression;stage=2;scope=shared;review=3,6 -->
- [ ] Supabase Cloud/linked/remote target은 N/A/forbidden이며 Stage 2~6 evidence가 remote link/credential access 0, isolated-local 사용과 운영 full-local destructive reset 0을 명시한다 <!-- omo:id=accept-yta-remote-write-zero;stage=2;scope=shared;review=3,6 -->

## Design / Accessibility

- [ ] `YT_IMPORT_BACKGROUND`가 390/320/desktop에서 primary CTA `가져오기`, `작업 보기`, duplicate/offline/error copy와 scroll containment를 보존한다 <!-- omo:id=accept-yta-import-visual;stage=4;scope=frontend;review=5,6 -->
- [ ] `APP_SHELL_YOUTUBE_NOTIFICATIONS`가 390/320/desktop에서 badge/toast/list/archive를 page-level overflow 없이 제공한다 <!-- omo:id=accept-yta-shell-visual;stage=4;scope=frontend;review=5,6 -->
- [ ] toast는 `aria-live=polite`, non-forced focus, exact CTA label을 사용하고 상태는 icon+text로 전달한다 <!-- omo:id=accept-yta-notification-a11y;stage=4;scope=frontend;review=5,6 -->
- [ ] keyboard, 200% text, reduced motion, narrow safe-area에서 CTA 잘림·modal/panel footer 가림·text overlap이 없다 <!-- omo:id=accept-yta-small-viewport-a11y;stage=4;scope=frontend;review=5,6 -->
- [ ] Stage 4와 다른 authority precheck, Stage 5, final authority가 current head의 두 screen을 blocker/major 0으로 승인한다 <!-- omo:id=accept-yta-authority-pass;stage=4;scope=frontend;review=5,6 -->

## Manual QA

- verifier: Stage 4 구현 task와 다른 Codex browser/verifier task; final authority는 별도 task
- environment: local Supabase + same-SHA app/worker release rehearsal, desktop, 390px, 320px
- scenarios: enqueue 후 이탈, app restart/relogin unseen, active duplicate, worker crash/reclaim, success review/register, consumed-after-TTL, retryable/non-retryable failure, offline, cross-user, Quick Import compatibility

## Automation Split

### Vitest

- [ ] `YTASYNC-CONTRACT-*`, `API-*`, `WORKER-*`, `OPS-*`, `FE-*`가 contract/adapter/state/error/secret/installer dry-run을 결정론적으로 고정한다 <!-- omo:id=accept-yta-vitest-targets;stage=2;scope=shared;review=3,6 -->
- [ ] 기존 `tests/youtube-background-extraction-contract.test.ts`, YouTube import/i031/full-local/mac-production 회귀가 additive 구현 뒤 green이다 <!-- omo:id=accept-yta-existing-regression;stage=2;scope=shared;review=3,6 -->

### PostgreSQL / PostgREST

- [ ] 동시 enqueue/claim/reaper/finalize/policy rotation/credential CAS와 exact role/RLS/ACL을 실제 DB에서 검증한다 <!-- omo:id=accept-yta-postgres-integration;stage=2;scope=backend;review=3,6 -->
- [ ] public proxy와 restricted JWT negative matrix가 loopback/private boundary drift를 fail closed한다 <!-- omo:id=accept-yta-data-api-boundary;stage=2;scope=backend;review=3,6 -->

### Playwright / Exploratory QA

- [ ] `YTASYNC-E2E-*`가 background submit→이탈→notification→review/register와 Quick Import 비변경을 desktop/390/320에서 검증한다 <!-- omo:id=accept-yta-playwright-flow;stage=4;scope=frontend;review=5,6 -->
- [ ] high-risk exploratory QA report와 `qa:eval`이 current frontend head에서 required device coverage와 recovery UX를 통과한다 <!-- omo:id=accept-yta-exploratory-qa;stage=4;scope=frontend;review=5,6 -->

### Release / Closeout

- [ ] same-SHA worker artifact/installer/rotation/rollback dry-run과 current-head backend checks가 Stage 3에서 승인된다 <!-- omo:id=accept-yta-stage3-release-review;stage=2;scope=shared;review=3,6 -->
- [ ] README/acceptance/automation/work-item/status/roadmap projection과 PR Actual Verification/Closeout Sync/Merge Gate가 Stage 6에서 일치한다 <!-- omo:id=accept-yta-closeout-sync;stage=4;scope=shared;review=6 -->
- [ ] final product PR은 current-head started checks 전체 green 뒤 manual merge handoff되고 자동 merge되지 않는다 <!-- omo:id=accept-yta-manual-merge-handoff;stage=4;scope=shared;review=6 -->

### Manual Only

- [ ] 실제 full-local production DB의 controlled migration apply와 initial policy enable(immutable backup, target identity, maintenance fence, rollback/forward-fix 승인 필요)
- [ ] production worker restricted JWT/manager credential 발급과 `0600` secret file 설치
- [ ] `com.homecook.youtube-extraction-worker` 실제 Mac 설치·start·reboot recovery·Cloudflare 공개 경로 확인
- [ ] production allowlist→제한 비율→전체 rollout과 실제 queue/metric/SLO 관찰
- [ ] production rollback 실행 또는 restore/forward-fix 승인
- [ ] 사용자가 자신의 임의 공개 YouTube URL 결과를 최종 확인
- [ ] physical device의 VoiceOver/TalkBack, 실제 keyboard, safe-area/virtual-keyboard 확인
- [ ] Web Push, Quick Import async UI, sync endpoint deprecation, multi-host worker에 대한 별도 사용자 승인

Supabase Cloud project/link/remote DB/security gate/credential은 Manual Only가 아니라 `docs/engineering/supabase-local-only-operations.md`에 따른 **forbidden/N/A**다.
